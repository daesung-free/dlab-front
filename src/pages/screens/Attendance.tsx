import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  Modal,
  SearchForm,
  Unfilled,
  useServerData,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { listClasses } from '../../api/classes'
import {
  ATTENDANCE_STATUS,
  ATTENDANCE_STATUS_LABEL,
  FIXABLE_STATUS_LABEL,
  TAGGING_EVENT_LABEL,
  addTagging,
  fetchAttendanceBoard,
  fixAttendanceStatus,
  recalculateStudyTime,
  type FixableStatus,
  type TaggingEvent,
  type AttendanceRow,
  type AttendanceStatus,
} from '../../api/attendance'
import type { Mockup } from './types'

/* F-4.3 출결 관리 — GET /api/v1/admin/attendance
 *
 * ★ 서버 페이징이 없다. 조회일의 재원생이 전원 한 번에 온다(결석자를 세야 하는 화면이라
 *   서버가 그렇게 설계돼 있다). 그래서 useServerTable 이 아니라 useServerData 를 쓰고,
 *   DataTable 에 serverPaging 을 넘기지 않아 클라이언트 페이징·정렬로 돈다.
 *   전량이 손에 있으므로 클라이언트 정렬이 "한 페이지만 정렬"되는 문제는 없다.
 *   ⚠️ 서버 페이징이 열리면 그 전제가 깨진다 — useServerData.ts 주석 참고.
 *
 * ★ 목업에 없던 '조퇴'를 넣었다. 서버 상태값이 ON_TIME·LATE·ABSENT·OUT·**EARLY_LEAVE** 라
 *   조퇴 건이 실제로 내려오는데, 칩·통계에서 빼면 어디에도 안 잡혀 합이 total 과 안 맞는다.
 *
 * ★ '사유 승인'은 상태가 아니라 **직교하는 플래그**다('지각인데 사유 승인됨'이 성립한다).
 *   statuses 에 넣으면 400이라 excused 파라미터로 따로 건다. 그래서 EXCUSED 칩을 다른
 *   상태와 함께 고르면 OR 가 아니라 AND 다 — '지각 + 사유승인' = 지각 중 승인된 건.
 */

const PAGE_SIZE = 15

/** 목업 대비 EARLY_LEAVE(조퇴)가 늘었다. EXCUSED 는 상태가 아니라 플래그라 뒤에 따로 붙인다 */
const STATUS_META: Record<AttendanceStatus, { cls: string; icon: string }> = {
  ON_TIME: { cls: 'verified', icon: 'log-in' },
  LATE: { cls: 'brandnew', icon: 'clock' },
  ABSENT: { cls: 'brandnew', icon: 'x' },
  OUT: { cls: 'supplement', icon: 'door-open' },
  EARLY_LEAVE: { cls: 'supplement', icon: 'log-out' },
  // 아직 오지 않은 날. 결석과 구분되게 톤을 다르게 준다
  NOT_YET: { cls: '', icon: 'clock' },
}

/* 칩은 options 가 string[] 이라 표시 라벨과 서버 enum 코드를 함께 실을 수 없다.
 * 라벨을 값으로 쓰고 여기서 코드로 되돌린다 — 화면에 ON_TIME 이 그대로 보이면 안 된다. */
const EXCUSED_CHIP = '사유 승인'
const STATUS_CHIPS = [...ATTENDANCE_STATUS.map((s) => ATTENDANCE_STATUS_LABEL[s]), EXCUSED_CHIP]

const CHIP_TO_STATUS = new Map<string, AttendanceStatus>(
  ATTENDANCE_STATUS.map((s) => [ATTENDANCE_STATUS_LABEL[s], s]),
)

/** UTC 로 넘어가면 오전에 하루가 밀린다 — 출결은 오전에 보는 화면이라 로컬 날짜로 만든다 */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * 반 목록 조회.
 *
 * ★ 모듈 최상위에 둔다. 컴포넌트 안에서 인라인 화살표로 넘기면 매 렌더 새 함수가 되고,
 *   useServerData 가 그걸 의존성으로 쓰던 시절엔 무한 요청이 됐다. 훅 쪽은 ref 로 막아뒀지만
 *   참조를 고정해두는 편이 어차피 맞다.
 */
const fetchClasses = ({ year }: { year: number }) => listClasses(year)

/** 'HH:mm:ss' → 'HH:mm'. 미태깅이면 '-' */
function hhmm(v: string | null): string {
  return v === null ? '-' : v.slice(0, 5)
}

function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  const [recalcMsg, setRecalcMsg] = useState<{ text: string; error?: boolean } | null>(null)
  const [recalcing, setRecalcing] = useState(false)

  /**
   * 출결 보정.
   *
   * ★ 카드를 안 찍고 들어온 학생을 처리하는 유일한 경로다. 없으면 그 학생은 그날 결석으로 남는다.
   * ★ 두 가지가 다르다 —
   *     태깅 추가  '사건'을 넣는다(09:10 등원). 등·하원 시각이 생기고 순공시간이 다시 계산된다
   *     상태 정정  결과만 못박는다. 시각은 그대로다
   *   시각을 아는 경우(늦게 왔지만 몇 시인지 안다)는 태깅이 맞다.
   * ★ 정정 사유는 서버가 필수로 막는다. 나중에 왜 고쳤는지 아는 유일한 근거다.
   */
  const [fixing, setFixing] = useState<{
    row: AttendanceRow
    mode: 'tagging' | 'status'
    at: string
    eventType: TaggingEvent
    status: FixableStatus
    reason: string
  } | null>(null)
  const [fixBusy, setFixBusy] = useState(false)
  const [fixErr, setFixErr] = useState<string | null>(null)

  // 반 드롭다운은 하드코딩하지 않는다 — 지점·연도마다 다르다
  const classParams = useMemo(() => ({ year: new Date().getFullYear() }), [])
  const classes = useServerData({
    fetcher: fetchClasses,
    params: classParams,
    enabled: academyId !== null,
    errorMessage: '반 목록을 불러오지 못했습니다.',
  })

  const classOptions = useMemo(
    () =>
      (classes.data ?? [])
        .filter((c) => c.academyId === academyId)
        .map((c) => ({ value: String(c.id), label: c.name })),
    [classes.data, academyId],
  )

  const fields: Field[] = useMemo(
    () => [
      { type: 'dateRange', name: 'date', label: '조회 기간', presets: true, span: 2 },
      { type: 'text', name: 'keyword', label: '이름 · 학번 · 좌석', placeholder: '예: 이승민 / A-24', span: 2 },
      { type: 'select', name: 'classId', label: '담당 반', options: classOptions },
      { type: 'chips', name: 'status', label: '출결 상태', options: STATUS_CHIPS, multiple: true },
    ],
    [classOptions],
  )

  const range = query.date as DateRangeValue | undefined
  // 기간을 양쪽 다 고른 경우만 기간 조회다. 한쪽만 고르면 그날 하루로 본다
  const ranged = Boolean(range?.from && range.to && range.from !== range.to)
  const date = range?.from || todayStr()

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(() => {
    const chips = Array.isArray(query.status) ? query.status : []
    const statuses = chips
      .map((c) => CHIP_TO_STATUS.get(c))
      .filter((s): s is AttendanceStatus => s !== undefined)
    const classId = one(query.classId)

    return {
      academyId: academyId ?? undefined,
      // date 와 from/to 를 같이 보내면 기간 쪽이 이긴다 — 헷갈리지 않게 하나만 보낸다
      ...(ranged ? { from: range?.from, to: range?.to } : { date }),
      classId: classId ? Number(classId) : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      // 상태와 다른 축이라 함께 고르면 AND 로 걸린다(파일 머리 주석)
      excused: chips.includes(EXCUSED_CHIP) ? true : undefined,
      keyword: one(query.keyword),
    }
  }, [query, academyId, date, ranged, range])

  const board = useServerData({
    fetcher: fetchAttendanceBoard,
    params,
    // 지점을 못 고른 상태로 부르면 전 지점 권한 계정이 400을 받아 화면이 빈 것처럼 보인다
    enabled: academyId !== null,
    errorMessage: '출결 현황을 불러오지 못했습니다.',
  })

  const rows = board.data?.rows ?? []
  const summary = board.data?.summary

  // 서버가 이미 가려서 보낸 경우(masked=true) 프론트에서 또 가리지 않는다 — 이중 마스킹이 된다
  const serverMasked = board.data?.masked ?? false
  const effectiveMasked = serverMasked ? false : masked

  /** 보정 저장. 태깅과 상태 정정은 경로가 다르다 */
  async function submitFix() {
    if (!fixing) return
    const { row, mode, at, eventType, status, reason } = fixing
    setFixBusy(true)
    setFixErr(null)
    try {
      if (mode === 'tagging') {
        await addTagging(row.enrollmentId, { date: row.date, at, eventType, reason: reason.trim() })
      } else {
        await fixAttendanceStatus(row.enrollmentId, { date: row.date, status, reason: reason.trim() })
      }
      board.reload()
      setFixing(null)
    } catch (err) {
      /* 모달을 닫지 않는다 — 사유를 다시 쓰게 하면 안 된다 */
      setFixErr(err instanceof ApiError ? err.message : '출결을 정정하지 못했습니다.')
    } finally {
      setFixBusy(false)
    }
  }

  const columns: Column<AttendanceRow>[] = useMemo(
    () => [
      // 하루 조회면 전 행이 같은 날짜라 목업대로 컬럼을 안 띄운다.
      // 기간 조회면 같은 학생이 날짜 수만큼 나오므로 날짜가 없으면 표를 읽을 수 없다
      ...(ranged
        ? [{ key: 'date', header: '일자', width: '100px', align: 'center' as const, sortable: true, value: (r: AttendanceRow) => r.date }]
        : []),
      { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo ?? '-' },
      { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
      { key: 'className', header: '반', width: '56px', align: 'center', value: (r) => r.className ?? '-' },
      { key: 'seatCd', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
      { key: 'checkInAt', header: '등원', width: '76px', align: 'center', sortable: true, value: (r) => hhmm(r.checkInAt) },
      { key: 'checkOutAt', header: '하원', width: '76px', align: 'center', value: (r) => hhmm(r.checkOutAt) },
      {
        key: 'status',
        header: '상태',
        width: '132px',
        align: 'center',
        sortable: true,
        value: (r) => ATTENDANCE_STATUS_LABEL[r.status] ?? r.status,
        render: (r) => (
          <span style={{ display: 'inline-flex', gap: 4, justifyContent: 'center' }}>
            {/* title 에 영문 코드(ON_TIME 등)를 넣지 않는다 — 화면이다(CLAUDE.md 1-1) */}
            <span className={`mk ${STATUS_META[r.status]?.cls ?? ''}`}>
              {ATTENDANCE_STATUS_LABEL[r.status] ?? r.status}
            </span>
            {/* 상태와 다른 축이라 배지를 덮어쓰지 않고 나란히 붙인다 */}
            {r.excused && (
              <span className="mk supplement" title="사유가 승인된 건입니다">
                사유
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'studyMinutes',
        header: '순공시간',
        width: '104px',
        align: 'right',
        sortable: true,
        // 정렬·엑셀은 분(숫자)으로, 표시는 서버가 만든 문자열로 — 둘을 섞으면 정렬이 문자열이 된다
        value: (r) => r.studyMinutes,
        render: (r) => (r.studyMinutes > 0 ? r.studyTime : <span style={{ color: 'var(--muted)' }}>-</span>),
      },
      { key: 'guardianPhone', header: '학부모 연락처', width: '128px', mask: 'phone', value: (r) => r.guardianPhone ?? '-' },
      {
        key: 'notified',
        header: '알림',
        width: '96px',
        align: 'center',
        value: (r) => (r.unexcusedLate ? '무단지각' : ''),
        render: (r) =>
          r.unexcusedLate ? (
            <span className="mk brandnew" title="사유 없이 미등원 → 지각알림 + 사유 회신 요청 자동 발송">
              무단지각
            </span>
          ) : (
            /* '발송됨'은 판단할 수 없다. 알림 발송 자체가 E-5·E-7(문구·FCM) 대기라
               notification_log 가 비어 있다 — 발송이 붙을 때 같이 나온다(2026-09-02 회신) */
            <Unfilled reason="알림 발송 기록은 준비 중입니다" />
          ),
      },
      {
        /* ★ 카드를 안 찍고 들어온 학생을 여기서 처리한다. 없으면 그날 결석으로 남는다 */
        key: 'fix',
        header: '',
        width: '64px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <button
            className="btn"
            style={{ padding: '4px 9px', fontSize: 11.5 }}
            /* 아직 오지 않은 날은 고칠 것이 없다 — 미래 날짜는 전원 '예정' 이다 */
            disabled={r.status === 'NOT_YET'}
            title={r.status === 'NOT_YET' ? '아직 지나지 않은 날입니다' : undefined}
            onClick={() => {
              setFixErr(null)
              setFixing({
                row: r,
                mode: 'tagging',
                at: '',
                eventType: 'CHECK_IN',
                status: 'PRESENT',
                reason: '',
              })
            }}
          >
            정정
          </button>
        ),
      },
    ],
    [ranged],
  )

  // 결과 문구에 날짜를 빼고 머리줄의 날짜를 따르게 했으므로, 조회 날짜가 바뀌면 지운다
  useEffect(() => setRecalcMsg(null), [date, range, ranged])

  async function recalculate() {
    setRecalcing(true)
    setRecalcMsg(null)
    const from = ranged ? (range?.from as string) : date
    const to = ranged ? (range?.to as string) : date
    try {
      const res = await recalculateStudyTime({ academyId: academyId ?? undefined, from, to })
      // 0은 실패가 아니다 — 아직 확정 전인 날(오늘)은 조회 시점에 즉석 계산되므로 대상이 아니다
      setRecalcMsg({
        text:
          res.updated > 0
            ? `순공시간 ${res.updated}건을 다시 계산했습니다`
            : '다시 계산할 확정분이 없습니다 (오늘 것은 조회할 때마다 계산됩니다)',
      })
      board.reload()
    } catch (err) {
      setRecalcMsg({ text: err instanceof ApiError ? err.message : '학습시간 재계산에 실패했습니다', error: true })
    } finally {
      setRecalcing(false)
    }
  }

  return (
    <>
      {fixing && (
        <Modal
          title="출결 정정"
          sub={`${fixing.row.date} · ${fixing.row.name}(${fixing.row.studentNo ?? '-'})`}
          confirmLabel="저장"
          busy={fixBusy}
          error={fixErr}
          confirmDisabled={
            fixing.reason.trim() === '' || (fixing.mode === 'tagging' && fixing.at.trim() === '')
          }
          onConfirm={() => void submitFix()}
          onClose={() => setFixing(null)}
        >
          {/* ★ 두 방식이 다르다. 시각을 아는 경우(늦게 왔지만 몇 시인지 안다)는 태깅이 맞다 —
                 등·하원 시각이 생기고 순공시간이 다시 계산된다. 상태 정정은 결과만 못박는다. */}
          <div className="frow">
            <label className="req">방식</label>
            <div>
              <select
                className="sel"
                value={fixing.mode}
                onChange={(e) => setFixing({ ...fixing, mode: e.target.value as 'tagging' | 'status' })}
              >
                <option value="tagging">태깅 추가 — 찍히지 않은 등·하원을 넣습니다</option>
                <option value="status">상태 정정 — 결과만 바꿉니다</option>
              </select>
              <div className="hint">
                {fixing.mode === 'tagging'
                  ? '시각이 기록되고 순공시간이 다시 계산됩니다.'
                  : '시각은 그대로 두고 상태만 바꿉니다.'}
              </div>
            </div>
          </div>

          {fixing.mode === 'tagging' ? (
            <>
              <div className="frow">
                <label className="req">종류</label>
                <select
                  className="sel"
                  value={fixing.eventType}
                  onChange={(e) => setFixing({ ...fixing, eventType: e.target.value as TaggingEvent })}
                >
                  {(Object.keys(TAGGING_EVENT_LABEL) as TaggingEvent[]).map((k) => (
                    <option key={k} value={k}>
                      {TAGGING_EVENT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="frow">
                <label className="req">시각</label>
                <input
                  className="inp"
                  type="time"
                  value={fixing.at}
                  onChange={(e) => setFixing({ ...fixing, at: e.target.value })}
                />
              </div>
            </>
          ) : (
            <div className="frow">
              <label className="req">바꿀 상태</label>
              <select
                className="sel"
                value={fixing.status}
                onChange={(e) => setFixing({ ...fixing, status: e.target.value as FixableStatus })}
              >
                {(Object.keys(FIXABLE_STATUS_LABEL) as FixableStatus[]).map((k) => (
                  <option key={k} value={k}>
                    {FIXABLE_STATUS_LABEL[k]}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="frow">
            <label className="req">정정 사유</label>
            <div>
              <input
                className="inp"
                value={fixing.reason}
                placeholder="예: 카드 인식 오류로 수기 등원 처리"
                onChange={(e) => setFixing({ ...fixing, reason: e.target.value })}
              />
              <div className="hint">정정 이력에 함께 남습니다.</div>
            </div>
          </div>
        </Modal>
      )}

      <div className="stat-strip c8">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 조회 대상
          </div>
          <div className="v">{summary?.total ?? 0}</div>
          {/* 기간 조회면 학생 수가 아니라 학생 × 날짜 합이다 — 그대로 '재원생 기준'이라 쓰면 틀린 말이 된다 */}
          <div className="d">{ranged ? '학생 × 일수 합계' : '재원생 기준'}</div>
        </div>
        {ATTENDANCE_STATUS.map((s) => (
          <div className="stat" key={s}>
            <div className="l">
              <Icon name={STATUS_META[s].icon} size={13} /> {ATTENDANCE_STATUS_LABEL[s]}
            </div>
            <div className="v">{summary?.[s] ?? 0}</div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
              {s}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 사유 승인
          </div>
          <div className="v">{summary?.EXCUSED ?? 0}</div>
          {/* 상태가 아니라 플래그라 위 5개와 합해도 total 이 되지 않는다 */}
          <div className="d">상태와 별개 집계</div>
        </div>
      </div>

      <SearchForm
        fields={fields}
        onSearch={setQuery}
        presetKey="attendance"
        headerRight={
          <span className="mk verified" title="키오스크에서 자동으로 받습니다">
            <Icon name="zap" size={11} /> 실시간 수신 중
          </span>
        }
      />

      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택하세요. 출결은 지점 단위로 조회합니다.</div>
      )}

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      <DataTable
        nowrap
        columns={columns}
        rows={rows}
        // 기간 조회면 같은 학생이 날짜 수만큼 나온다 — enrollmentId 만 쓰면 키가 겹쳐
        // 선택·렌더가 엉킨다
        rowKey={(r) => `${r.date}:${r.enrollmentId}`}
        masked={effectiveMasked}
        loading={board.loading}
        pageSize={PAGE_SIZE}
        countLabel={
          <>
            {ranged ? `${range?.from} ~ ${range?.to}` : date} 출결 <b>{rows.length}</b>건
            {/* 결과를 표 위 안내 상자로 띄우면 누를 때마다 표가 67px 밀렸다 — 이 줄에 붙인다 */}
            {(recalcing || recalcMsg) && (
              <span style={{ marginLeft: 10, fontWeight: 400, color: recalcMsg?.error ? 'var(--red)' : 'var(--muted)' }}>
                {recalcing ? '학습시간 계산 중…' : recalcMsg?.text}
              </span>
            )}
          </>
        }
        toolbar={
          <>
            <button className="btn" onClick={() => void recalculate()} disabled={recalcing || academyId === null}>
              <Icon name="refresh-cw" size={14} /> 학습시간 일괄계산
            </button>
            {serverMasked ? (
              <span className="dt-count" style={{ color: 'var(--muted)' }}>
                권한상 마스킹됨
              </span>
            ) : (
              <MaskToggle masked={masked} onChange={setMasked} />
            )}
            {/* ⚠️ 현재 페이지가 아니라 조회된 전량이 담긴다 — 서버가 전량을 주기 때문이다.
                서버 엑셀(/attendance/export)로 바꾸면 마스킹 해제 권한까지 서버가 판단한다 */}
            <ExcelButton filename="출결_현황" columns={columns} rows={rows} masked={effectiveMasked} />
          </>
        }
      />
    </>
  )
}

export const attendanceMockup: Mockup = {
  Content,
  actions: (
    <button className="btn" disabled data-soon title="준비 중입니다">
      <Icon name="bell" size={14} /> 출결 알림 템플릿
    </button>
  ),
}
