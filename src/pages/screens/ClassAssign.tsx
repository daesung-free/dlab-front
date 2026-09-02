import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Unfilled, useServerTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  assignStudentsToClass,
  listClasses,
  releaseStudentFromClass,
  type BulkAssignResult,
  type ClassGroup,
} from '../../api/classes'
import { useAcademy } from '../../auth/AcademyContext'
import { SORTABLE, TRACK_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'

/* F-4.1-4 반 배정(고정반 관리) — /api/v1/admin/classes
 *
 * 전년도 복사는 단순 INSERT SELECT가 금지된다. 의존 순서를 지켜 순회해야 한다:
 *   department → course_type → class_group → curriculum → penalty_item → tuition
 *
 * ★ 미배정 학생은 **서버 조건(unassignedClass)** 으로 거른다. 예전에는 받아온 페이지 안에서만
 *   걸러 전체 명단이 아니었다 — 백엔드에 요청해 조건이 생겼다(API_GAPS 4-2).
 *
 * ★ 일괄 배정은 배열을 받는다. **정원을 넘겨도 배정은 된다** — 정원 초과가 필요한 운영이
 *   실제로 있어서 서버가 막지 않고 overCapacity 로 알려준다. 경고는 이 화면이 띄운다.
 *
 * ★ 배정 해제는 **반 ID가 필요하다.** 한 학생에게 고정반·이동수업반이 동시에 있을 수 있어
 *   "이 학생의 반을 뗀다"로는 어느 반인지 정해지지 않는다.
 *
 * ★ 아직 없는 것: 강의실(roomName). 반에 고정된 홈룸인지 시간표에 딸린 것인지 확인 후 추가 예정
 *
 * ⚠️ **전 지점 권한 계정에서는 목록에 다른 지점 학생이 섞인다.** /students 만 academyId 를
 *   안 받아서 전 지점이 한 번에 오는데, 반은 지점에 속해 있다. 다른 지점 학생을 배정하면
 *   서버가 건별로 "다른 지점의 반에는 배정할 수 없습니다"로 돌려준다.
 *   그래서 지점 컬럼을 띄우고, 전 지점 계정에는 안내를 보여준다(API_GAPS 2-2). */

const COPY_ORDER = ['department', 'course_type', 'class_group', 'curriculum', 'penalty_item', 'tuition']

const PAGE_SIZE = 20

const sortableKey = (key: string): boolean => (SORTABLE as readonly string[]).includes(key)

const COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: sortableKey('studentNo'), value: (r) => r.studentNo ?? '-' },
  { key: 'name', header: '이름', width: '84px', sortable: sortableKey('name'), mask: 'name', value: (r) => r.name },
  { key: 'track', header: '계열', width: '64px', align: 'center', sortable: sortableKey('track'), value: (r) => (r.track ? TRACK_LABEL[r.track] : '-') },
  {
    key: 'repeat',
    header: '재수',
    width: '64px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="재수 구분이 없다" />,
  },
  { key: 'schoolName', header: '출신학교', width: '92px', value: (r) => r.schoolName ?? '-' },
  { key: 'seatCd', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
  // 전 지점 계정에서는 다른 지점 학생이 섞여 오므로 반드시 보여준다
  { key: 'academyName', header: '지점', width: '64px', align: 'center', value: (r) => r.academyName ?? '-' },
]

function Content() {
  const { academies } = useAcademy()
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkAssignResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadClasses = useCallback(async () => {
    try {
      // memberCount 가 목록에 실려 와서 반마다 명단을 부르지 않아도 된다
      const list = await listClasses()
      setClasses(list)
      setTarget((prev) => prev ?? list[0]?.id ?? null)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '반 목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  // 재원생 중 반이 없는 학생만. 서버가 걸러주므로 전체 명단이 맞다
  const params = useMemo(() => ({ status: 'ENROLLED' as const, unassignedClass: true }), [])
  const table = useServerTable({ fetcher: searchStudents, params, pageSize: PAGE_SIZE, sortable: SORTABLE })

  async function assign() {
    if (target === null || selected.length === 0) return
    setBusy(true)
    setResult(null)
    try {
      const res = await assignStudentsToClass(target, selected.map(Number))
      setResult(res)
      setSelected([])
      await loadClasses()
      table.reload()
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '배정하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /** 선택한 학생을 그 반에서 뺀다. 대상 반이 정해져 있어야 한다 */
  async function release() {
    if (target === null || selected.length === 0) return
    setBusy(true)
    setResult(null)
    try {
      for (const id of selected) await releaseStudentFromClass(target, Number(id))
      setSelected([])
      await loadClasses()
      table.reload()
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '배정을 해제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="history" size={17} />
        </div>
        <div>
          <div className="tt">전년도 복사 — 단순 INSERT SELECT 금지</div>
          <div className="tx">
            <b>YearlySnapshotService</b>가 의존 순서를 지켜 순회합니다:{' '}
            {COPY_ORDER.map((k, i) => (
              <span key={k}>
                <code>{k}</code>
                {i < COPY_ORDER.length - 1 && ' → '}
              </span>
            ))}
            . 앞 단계가 만든 새 연도 ID를 뒤 단계가 참조하므로 순서를 건너뛰면 참조가 깨집니다.
          </div>
        </div>
      </div>

      {/* 전 지점 권한이면(지점이 2개 이상 보이면) 목록에 다른 지점 학생이 섞인다 */}
      {academies.length > 1 && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">전 지점 권한 계정입니다 — 목록에 다른 지점 학생이 섞여 있습니다</div>
            <div className="tx">
              학생 검색만 <b>지점 조건을 받지 않아</b> 전 지점이 한 번에 옵니다. 반은 지점에 속하므로
              <b> 다른 지점 학생은 배정되지 않습니다</b>(서버가 건별로 거부합니다). 지점 컬럼을 확인하세요.
            </div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {loadError}
        </div>
      )}

      <div className="stat-strip">
        {classes.map((c) => (
          <div className="stat" key={c.id}>
            <div className="l">
              <Icon name="layout-grid" size={13} /> {c.name}
            </div>
            <div className="v" style={c.capacity !== null && c.memberCount > c.capacity ? { color: 'var(--red)' } : undefined}>
              {c.memberCount}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}> / {c.capacity ?? '-'}</span>
            </div>
            <div className={`d${c.capacity !== null && c.memberCount > c.capacity ? ' down' : ''}`}>
              담임 {c.homeroomTeacherName ?? '미지정'}
              {/* 강의실은 아직 응답에 없다 — 반 홈룸인지 시간표 소속인지 확인 중 */}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 미배정
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {table.totalElements}
          </div>
          <div className="d warn">배정 필요</div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="arrow-right" size={15} />
            </span>
            일괄 배정
          </div>
          <div className="r">
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>선택 {selected.length}명 →</span>
            <select
              className="sel"
              style={{ width: 200 }}
              value={target ?? ''}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {classes.length === 0 && <option value="">등록된 반이 없습니다</option>}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.memberCount}/{c.capacity ?? '-'}명)
                </option>
              ))}
            </select>
            <button className="btn pri" disabled={selected.length === 0 || target === null || busy} onClick={() => void assign()}>
              <Icon name="check" size={14} /> {busy ? '배정 중…' : '배정'}
            </button>
            {/* 해제는 '선택한 학생을 위 드롭다운의 반에서' 뺀다 — 반 ID가 필요해서다 */}
            <button
              className="btn"
              disabled={selected.length === 0 || target === null || busy}
              onClick={() => void release()}
              title="선택한 학생을 위에 고른 반에서 뺍니다"
            >
              배정 해제
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div
          className="note-box"
          role="status"
          style={result.failedCount > 0 || result.overCapacity ? { borderColor: 'var(--amber)' } : undefined}
        >
          <div className="ic">
            <Icon name={result.failedCount > 0 || result.overCapacity ? 'triangle-alert' : 'check'} size={17} />
          </div>
          <div>
            <div className="tt">
              배정 {result.assignedCount}명 완료
              {result.failedCount > 0 && ` · ${result.failedCount}명 실패`}
            </div>
            {/* 정원을 넘겨도 서버는 막지 않는다. 경고는 화면 몫이다 */}
            {result.overCapacity && (
              <div className="tx" style={{ color: 'var(--amber)' }}>
                <b>정원 초과</b> — 현재 {result.memberCount}명 / 정원 {result.capacity ?? '-'}명
              </div>
            )}
            {result.failedCount > 0 && (
              <div className="tx">
                {result.results
                  .filter((r) => r.status !== 'ASSIGNED')
                  .map((r) => `${r.studentName ?? r.enrollmentId}: ${r.message ?? r.status}`)
                  .join(' / ')}
              </div>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={table.rows}
        rowKey={(r) => String(r.enrollmentId)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        loading={table.loading}
        serverPaging={table.serverPaging}
        countLabel={
          <>
            미배정 학생 <b>{table.totalElements}</b>명
          </>
        }
        emptyText="미배정 학생이 없습니다."
      />
    </>
  )
}

export const classAssignMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled title="전년도 복사 API가 아직 없습니다">
        <Icon name="history" size={14} /> 전년도 반 구성 복사
      </button>
      <button className="btn pri" disabled title="반 등록 폼은 다음 단계입니다">
        <Icon name="plus" size={14} /> 반 등록
      </button>
    </>
  ),
}
