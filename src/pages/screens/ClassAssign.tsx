import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, Modal, useServerTable, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import {
  assignStudentsToClass,
  createClass,
  listClasses,
  releaseStudentFromClass,
  type BulkAssignResult,
  type ClassGroup,
  type ClassType,
} from '../../api/classes'
import { copyMastersToYear, describeCopied } from '../../api/masters'
import { useAcademy } from '../../auth/AcademyContext'
import { SORTABLE, TRACK_LABEL, retakeLabel, searchStudents, type Student } from '../../api/students'
import { createScreenSignal } from './screenSignal'
import type { Mockup } from './types'

/* 반을 만들면 아래 목록과 배정 드롭다운이 바로 바뀌어야 한다. 헤더 액션과 본문은
 * ScreenPage 가 따로 렌더해 상태를 공유할 수 없다 — screenSignal.ts 주석 참고 */
const classesSignal = createScreenSignal()

/* F-4.1-4 반 배정(고정반 관리) — /api/v1/admin/classes
 *
 * 전년도 복사는 단순 INSERT SELECT가 금지된다. 의존 순서를 지켜 순회해야 한다
 * (department → course_type → class_group → curriculum → penalty_item → tuition).
 * ★ 이 순서를 화면에 그리던 것을 뺐다(2026-09-10) — 클라이언트가 보는 URL 이라
 *   테이블명·서비스명을 노출하지 않는다. 화면은 "순서대로 진행되고 되돌릴 수 없다"만 말한다.
 * 원래 주석:
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
 * ★ 학생·반 목록 **양쪽에 같은 지점을 건다.** 한쪽만 걸면 다른 지점 학생이 목록에 남고,
 *   그걸 배정하면 서버가 건별로 "다른 지점의 반에는 배정할 수 없습니다"로 거부한다 —
 *   사용자는 왜 일부만 실패했는지 모른다.
 *   지점을 아직 안 고른 전 지점 계정은 그대로 섞여 오므로 안내를 띄운다. */

const PAGE_SIZE = 20

const sortableKey = (key: string): boolean => (SORTABLE as readonly string[]).includes(key)

const COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: sortableKey('studentNo'), value: (r) => r.studentNo ?? '-' },
  { key: 'name', header: '이름', width: '84px', sortable: sortableKey('name'), mask: 'name', value: (r) => r.name },
  { key: 'track', header: '계열', width: '64px', align: 'center', sortable: sortableKey('track'), value: (r) => (r.track ? TRACK_LABEL[r.track] : '-') },
  { key: 'repeat', header: '재수', width: '64px', align: 'center', value: (r) => retakeLabel(r.retakeCount) },
  { key: 'schoolName', header: '출신학교', width: '92px', value: (r) => r.schoolName ?? '-' },
  { key: 'seatCd', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
  // 전 지점 계정에서는 다른 지점 학생이 섞여 오므로 반드시 보여준다
  { key: 'academyName', header: '지점', width: '64px', align: 'center', value: (r) => r.academyName ?? '-' },
]

function Content() {
  const { academies, academyId } = useAcademy()
  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkAssignResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadClasses = useCallback(async () => {
    try {
      // memberCount 가 목록에 실려 와서 반마다 명단을 부르지 않아도 된다
      const list = await listClasses(new Date().getFullYear(), academyId ?? undefined)
      setClasses(list)
      setTarget((prev) => prev ?? list[0]?.id ?? null)
      setLoadError(null)
    } catch (err) {
      // ★ 서버 문구만 띄우면("권한이 없습니다") **화면 전체가 막힌 것처럼 읽힌다.**
      //   실제로는 반 목록 위젯만 막히고 아래 학생 목록은 정상으로 나온다 —
      //   어느 영역이 안 된 것인지 앞에 붙인다
      setLoadError(
        err instanceof ApiError
          ? `반 목록을 불러오지 못했습니다 — ${err.message}`
          : '반 목록을 불러오지 못했습니다.',
      )
    }
  }, [academyId])

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  /* 헤더에서 반을 만들면 목록을 다시 읽는다. 첫 렌더의 0 은 건너뛴다 */
  const classesVer = classesSignal.useVersion()
  useEffect(() => {
    if (classesVer > 0) void loadClasses()
  }, [classesVer, loadClasses])

  // 재원생 중 반이 없는 학생만. 서버가 걸러주므로 전체 명단이 맞다
  const params = useMemo(
    () => ({ status: 'ENROLLED' as const, unassignedClass: true, academyId: academyId ?? undefined }),
    [academyId],
  )
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
          <div className="tt">전년도 복사는 순서대로 진행됩니다</div>
          <div className="tx">
            앞 단계가 만든 항목을 뒤 단계가 참조하므로 순서를 건너뛸 수 없습니다.
            <b>복사한 것은 되돌릴 수 없습니다</b> — 다만 그 해에 이미 자료가 있으면 복사되지 않습니다.
          </div>
        </div>
      </div>

      {/* 지점을 안 고른 전 지점 계정만 섞여 온다 — 고르면 학생·반 양쪽이 그 지점으로 좁혀진다 */}
      {academies.length > 1 && academyId === null && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">지점을 고르지 않아 전 지점 학생이 함께 보입니다</div>
            <div className="tx">
              반은 지점에 속해 있어 <b>다른 지점 학생은 배정되지 않습니다</b>. 위에서 지점을 고르면
              학생과 반이 함께 그 지점으로 좁혀집니다.
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
            {/* ★ memberCount 는 목록에서만 채워진다(단건 응답은 null). capacity 도 null 이면
                   "정원 없는 반" 이지 0 이 아니다 — 둘 다 없을 때 초과로 칠하면 안 된다 */}
            <div
              className="v"
              style={
                c.capacity !== null && c.memberCount !== null && c.memberCount > c.capacity
                  ? { color: 'var(--red)' }
                  : undefined
              }
            >
              {c.memberCount ?? '-'}
              <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 700 }}> / {c.capacity ?? '-'}</span>
            </div>
            <div
              className={`d${
                c.capacity !== null && c.memberCount !== null && c.memberCount > c.capacity ? ' down' : ''
              }`}
            >
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

/**
 * 헤더 우측 액션 — 반 등록.
 *
 * ★ 본문(`Content`)과 따로 렌더되어 상태를 공유할 수 없다. 반을 만들면 아래 목록이
 *   바뀌어야 하므로 모듈 안에 작은 신호를 두고 본문이 구독한다(PenaltyManage 와 같은 방식).
 */
function ClassActions() {
  const { academyId } = useAcademy()
  const year = new Date().getFullYear()
  const [draft, setDraft] = useState<{ name: string; classType: ClassType; capacity: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  /** 끝났다고 알리는 모달. 반 등록·전년도 복사 둘이 같이 쓴다 — 제목까지 함께 담는다 */
  const [done, setDone] = useState<{ title: string; text: string } | null>(null)
  /** 전년도 복사 확인. 되돌릴 수 없어서 한 번 묻는다 */
  const [copyOpen, setCopyOpen] = useState(false)

  /**
   * 전년도 복사.
   *
   * ★ **반만 복사하는 경로가 없다.** 이 호출 하나가 학과·과정·교시·상벌점 항목까지
   *   전부 만든다. 버튼 이름이 '반 구성 복사' 라 모달에서 그걸 먼저 말한다 —
   *   모르고 누르면 기초 관리 전체가 한 해 치 생긴다.
   * ★ 되돌릴 수 없다. 대상 연도에 이미 자료가 있으면 서버가 409 로 막으므로 덮어쓰진 않는다.
   */
  async function copyLastYear() {
    if (academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      const res = await copyMastersToYear({ academyId, fromYear: year - 1, toYear: year })
      const summary = describeCopied(res.copied)
      setCopyOpen(false)
      setDone({
        title: summary === '' ? '넘어온 자료가 없습니다' : `${year - 1}년 자료를 복사했습니다`,
        text:
          summary === ''
            ? `${year - 1}년에 복사할 자료가 없었습니다.`
            : `${year - 1} → ${year} · ${summary}`,
      })
      classesSignal.bump()
    } catch (e) {
      /* "2026년에 이미 기초 데이터가 있습니다" 처럼 서버 문구가 그대로 쓸 만하다 */
      setErr(e instanceof ApiError ? e.message : '복사하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!draft || academyId === null) return
    setBusy(true)
    setErr(null)
    try {
      const cap = draft.capacity.trim()
      const r = await createClass({
        academyId,
        year,
        name: draft.name.trim(),
        classType: draft.classType,
        /* 비우면 **정원 없는 반**이 된다. 0 을 보내면 아무도 못 들어가는 반이 된다 */
        capacity: cap === '' ? undefined : Number(cap),
      })
      setDraft(null)
      setDone({ title: '반을 만들었습니다', text: `${r.name} · 담임은 아직 지정되지 않았습니다.` })
      classesSignal.bump()
    } catch (e) {
      /* 같은 해 같은 이름은 서버가 400 으로 막는다 — 문구가 그대로 쓸 만하다 */
      setErr(e instanceof ApiError ? e.message : '반을 만들지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        className="btn"
        disabled={busy || academyId === null}
        title={academyId === null ? '지점을 먼저 선택하세요' : `${year - 1}년 자료를 ${year}년으로 복사합니다`}
        onClick={() => {
          setErr(null)
          setCopyOpen(true)
        }}
      >
        <Icon name="history" size={14} /> 전년도 반 구성 복사
      </button>
      <button
        className="btn pri"
        disabled={academyId === null}
        title={academyId === null ? '지점을 먼저 선택하세요' : undefined}
        onClick={() => {
          setErr(null)
          setDraft({ name: '', classType: 'FIXED', capacity: '' })
        }}
      >
        <Icon name="plus" size={14} /> 반 등록
      </button>

      {copyOpen && (
        <Modal
          title={`${year - 1}년 자료를 ${year}년으로 복사할까요?`}
          sub={`되돌릴 수 없습니다. ${year}년에 이미 자료가 있으면 복사되지 않습니다.`}
          confirmLabel="복사"
          danger
          busy={busy}
          error={err}
          onConfirm={() => void copyLastYear()}
          onClose={() => setCopyOpen(false)}
        >
          {/* ★ 이름은 '반 구성 복사' 지만 실제로는 기초 자료가 통째로 넘어간다.
                 안 적으면 반만 생길 줄 알고 누른다 */}
          <div className="note-box">
            {/* ★ `.note-box` 는 flex 다. 글자와 <b> 를 나란히 두면 **각각이 칸이 되어**
                   가운데가 세로로 눌린다(.frow 와 같은 함정) — 한 칸에 묶는다 */}
            <div className="tx">
              반만 따로 복사할 수는 없습니다. <b>학과 · 과정 · 반 · 교시 · 상벌점 항목 · 교습비</b>가
              함께 넘어갑니다. 무엇이 몇 건 넘어갔는지는 복사한 뒤 알려드립니다.
            </div>
          </div>
        </Modal>
      )}

      {draft && (
        <Modal
          title="반 등록"
          sub={`${year}년 이 지점 기준으로 만듭니다.`}
          confirmLabel="등록"
          busy={busy}
          error={err}
          confirmDisabled={draft.name.trim() === ''}
          onConfirm={() => void submit()}
          onClose={() => setDraft(null)}
        >
          <div className="frow">
            <label className="req">반 이름</label>
            <div>
              <input
                className="inp"
                placeholder="예: N수 1반"
                maxLength={30}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="hint">같은 해에 같은 이름은 만들 수 없습니다.</div>
            </div>
          </div>
          <div className="frow">
            <label className="req">반 종류</label>
            <div>
              <select
                className="sel"
                value={draft.classType}
                onChange={(e) => setDraft({ ...draft, classType: e.target.value as ClassType })}
              >
                <option value="FIXED">고정반</option>
                <option value="MOVING">이동반</option>
              </select>
              <div className="hint">
                학생이 소속되는 반은 <b>고정반</b>입니다. 이동반은 과목별로 옮겨 다니는 반입니다.
              </div>
            </div>
          </div>
          <div className="frow">
            <label>정원</label>
            <div>
              <input
                className="inp"
                type="number"
                min={1}
                placeholder="비우면 정원 없음"
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
              />
              {/* 0 을 넣으면 아무도 못 들어가는 반이 된다 — 비우는 것과 다르다 */}
              <div className="hint">비워 두면 정원을 두지 않습니다. 정원을 넘겨 배정하는 것도 됩니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {done && (
        <Modal title={done.title} hideCancel confirmLabel="닫기" onConfirm={() => setDone(null)} onClose={() => setDone(null)}>
          <div style={{ fontSize: 13.5 }}>{done.text}</div>
        </Modal>
      )}
    </>
  )
}

export const classAssignMockup: Mockup = {
  Content,
  actions: <ClassActions />,
}
