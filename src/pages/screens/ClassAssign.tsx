import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Unfilled, useServerTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { assignStudentToClass, listClassMembers, listClasses, type ClassGroup } from '../../api/classes'
import { SORTABLE, TRACK_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'

/* F-4.1-4 반 배정(고정반 관리) — /api/v1/admin/classes
 *
 * 전년도 복사는 단순 INSERT SELECT가 금지된다. 의존 순서를 지켜 순회해야 한다:
 *   department → course_type → class_group → curriculum → penalty_item → tuition
 *
 * ★ 서버에 없는 것 3가지. 화면을 깎지 않고 표시만 해둔다(docs/API_GAPS.md 2-2).
 *   1) 반 **정원·강의실** — ClassResponse 에 없다. 정원 대비 현황을 못 그린다
 *   2) **미배정 학생 필터** — /students 에 classId 는 있어도 "반 없음" 조건이 없다.
 *      지금은 받아온 페이지 안에서 className 이 빈 학생만 거른다 → **전체 미배정 명단이 아니다**
 *   3) **일괄 배정 API** — POST /classes/{id}/students 가 enrollmentId 를 하나씩만 받는다.
 *      N번 호출하므로 중간에 실패하면 일부만 배정된다. 아래에서 건별 결과를 모아 보여준다 */

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
]

/** 배정 결과 — 일괄 API가 없어 건별로 모은다 */
interface AssignResult {
  ok: number
  failed: { name: string; message: string }[]
}

function Content() {
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [counts, setCounts] = useState<Map<number, number>>(new Map())
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<AssignResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadClasses = useCallback(async () => {
    try {
      const list = await listClasses()
      setClasses(list)
      setTarget((prev) => prev ?? list[0]?.id ?? null)

      // 반별 현재 인원. 집계 API가 없어 반마다 명단을 부른다 —
      // 반은 보통 한 자릿수라 감당되지만, 늘어나면 집계 API를 요청할 것.
      const entries = await Promise.all(
        list.map(async (c) => [c.id, (await listClassMembers(c.id)).length] as const),
      )
      setCounts(new Map(entries))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : '반 목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  // 재원생만 배정 대상이다
  const params = useMemo(() => ({ status: 'ENROLLED' as const }), [])
  const table = useServerTable({ fetcher: searchStudents, params, pageSize: PAGE_SIZE, sortable: SORTABLE })

  // ⚠️ 서버에 미배정 필터가 없어 **이 페이지 안에서만** 거른다. 전체 미배정 명단이 아니다.
  const unassigned = useMemo(() => table.rows.filter((r) => !r.className), [table.rows])

  async function assign() {
    if (target === null || selected.length === 0) return
    setBusy(true)
    setResult(null)

    const picked = unassigned.filter((r) => selected.includes(String(r.enrollmentId)))
    const failed: AssignResult['failed'] = []
    let ok = 0

    // 순차 호출한다. 일괄 API가 없는데 병렬로 던지면 실패했을 때
    // 어디까지 반영됐는지가 더 불분명해진다.
    for (const s of picked) {
      try {
        await assignStudentToClass(target, s.enrollmentId)
        ok += 1
      } catch (err) {
        failed.push({ name: s.name, message: err instanceof ApiError ? err.message : '배정 실패' })
      }
    }

    setResult({ ok, failed })
    setSelected([])
    setBusy(false)
    await loadClasses()
    table.reload()
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
            <div className="v">
              {counts.get(c.id) ?? '–'}
              {/* 정원이 ClassResponse 에 없어 '현재/정원'을 못 그린다 */}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}>
                {' '}
                / <Unfilled reason="반 정원이 응답에 없다" />
              </span>
            </div>
            <div className="d">담임 {c.homeroomTeacherName ?? '미지정'}</div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="user-plus" size={13} /> 미배정
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {unassigned.length}
          </div>
          <div className="d warn">이 페이지 기준</div>
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
                  {c.name} ({counts.get(c.id) ?? 0}명)
                </option>
              ))}
            </select>
            <button className="btn pri" disabled={selected.length === 0 || target === null || busy} onClick={() => void assign()}>
              <Icon name="check" size={14} /> {busy ? '배정 중…' : '배정'}
            </button>
            <button className="btn" disabled title="배정 해제 API가 아직 없습니다">
              배정 해제
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div
          className="note-box"
          role="status"
          style={result.failed.length > 0 ? { borderColor: 'var(--amber)' } : undefined}
        >
          <div className="ic">
            <Icon name={result.failed.length > 0 ? 'triangle-alert' : 'check'} size={17} />
          </div>
          <div>
            <div className="tt">
              배정 {result.ok}명 완료
              {result.failed.length > 0 && ` · ${result.failed.length}명 실패`}
            </div>
            {result.failed.length > 0 && (
              <div className="tx">
                {result.failed.map((f) => `${f.name}: ${f.message}`).join(' / ')}
              </div>
            )}
          </div>
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={unassigned}
        rowKey={(r) => String(r.enrollmentId)}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        loading={table.loading}
        serverPaging={table.serverPaging}
        countLabel={
          <>
            미배정 학생 <b>{unassigned.length}</b>명{' '}
            <span style={{ color: 'var(--amber)' }} title="서버에 미배정 필터가 없어 이 페이지 안에서만 거른 결과다">
              (이 페이지 기준)
            </span>
          </>
        }
        emptyText="이 페이지에는 미배정 학생이 없습니다."
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
