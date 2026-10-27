import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  Unfilled,
  useServerData,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../api/client'
import { listBranchConfigs, type BranchConfig } from '../../api/branchConfigs'
import { listClasses } from '../../api/classes'
import { getSeatLayout, listSeatAreas, type SeatArea, type SeatCell } from '../../api/facility'
import {
  SEAT_LEAVE_STATUS,
  SEAT_LEAVE_STATUS_LABEL,
  fetchSeatLeaves,
  type SeatLeaveRow,
  type SeatLeaveStatus,
} from '../../api/seatLeaves'
import type { Mockup } from './types'
import './seat.css'

/* F-4.11-8 좌석 이탈/복귀 신청 — 신규개발-요구사항신규
 *
 * 배경: 키오스크 증설이 중단(잔여 6대)돼 앱으로 대체한다.
 *       패드 소지 = 앱 신청 / 미소지 = 키오스크 병행.
 *
 * 연동(2026-09-22) — GET /api/v1/admin/seat-leaves. src/api/seatLeaves.ts 참고.
 *   · 이동 신청 내역 탭 = 이탈 이력. 서버가 이탈·복귀를 한 행으로 짝지어 준다
 *   · 실시간 좌석표 탭 = 좌석 배치(/seats/layout)의 onSeatLeave·seatLeftAt 을 그대로 쓴다.
 *     ★ presence 는 이탈을 모른다 — 이탈해도 출결로는 재실이다. 이탈 축이 따로 온다(2026-09-25)
 *     ★ 그래서 /seat-leaves/current 를 따로 부르지 않는다. 두 번 부르면 배치와 이탈이
 *       서로 다른 시점이 되어 좌석표에서만 깜빡인다
 *   · 키오스크 관리 탭 = 지점 설정(/branch-configs)의 kioskLastSeenAt·kioskOnline 을 쓴다
 *     (2026-10-26 연동). ★ 지점당 1대라 **행이 단말이 아니라 지점**이다 — 요청에 단말
 *     식별자가 없어 단말을 세울 수 없다. 전에 있던 예시 6대(펌웨어·금일 수신)는 서버에
 *     개념 자체가 없어 **붙일 것이 아니라 지울 것**이었다
 *     ★ 최고관리자 전용 경로다. 지점 계정은 자기 지점도 403 이라 탭 안에서 권한으로 가른다
 *
 * ⚠ 이탈 위치(강의실·화장실·공용공간·교과실)는 아직 정해지지 않았다(I-16). 위치별 칸·필터는
 *   지우지 않고 <Unfilled/> · data-soon 으로 둔다 — 정해지면 바로 채운다.
 * ⚠ 지금 이탈 기록은 **키오스크 태깅으로만** 생긴다. 앱 신청은 2차라 '경로' 는 전부 키오스크다.
 *
 * ⚠ 화면 문구에서 내부 사정을 뺐다(2026-09-10). 클라이언트가 보는 URL 이라
 *   'I-16' · '재실 센서' · '범위에서 제외' 같은 말을 화면에 두지 않는다. 남은 문구는
 *   "기록에 남는 것과 안 남는 것"만 말한다 — 행정 선생님이 좌석표를 읽는 데 필요한 것은 그뿐이다.
 *
 * ⚠ 사감 순찰기록은 범위에서 제외한다.
 *   순찰로 '좌석없음'을 잡아 미신고 이탈을 추정하던 방식을 쓰지 않는다.
 *   → "신청 없이 자리를 비운 상태"를 시스템이 알 방법이 없다.
 *     좌석표의 빈 자리는 '미신고 이탈'이 아니라 '데이터 없음'으로 읽어야 한다.
 *
 * ⚠ 키오스크 관리자 페이지를 이 관리자 화면 안에 내장한다.
 *   별도 키오스크 관리 콘솔로 나가지 않고, 여기서 통신 상태를 보며 좌석 이탈 정보도
 *   그 단말들에서 수신한다(단일 진입점).
 *   ★ 단말 **등록·설정·재시작·펌웨어 배포는 우리 범위가 아니다.** 키오스크 레포 담당이고
 *     서버에 경로가 없다 — 버튼으로 두면 「눌러도 아무 일이 없다」가 된다. 상태만 본다. */

/** 이탈 위치 — 구분값이 아직 정해지지 않았다(I-16). 정해지면 이 목록으로 칸과 필터를 채운다 */
const AWAY_LOCATIONS = ['강의실', '화장실', '공용공간', '교과실'] as const

/** 좌석표를 다시 읽는 간격. 키오스크가 태깅을 바로 올리므로 1분이면 현장과 크게 어긋나지 않는다 */
const REFRESH_MS = 60_000

type SeatView = 'seat' | 'away' | 'absent' | 'free' | 'off'

const VIEW_META: Record<SeatView, { label: string; cls: string; color: string }> = {
  seat: { label: '본인좌석', cls: 'at-seat', color: 'var(--mint-wash)' },
  away: { label: '이탈 중', cls: 'at-rest', color: 'var(--amber-wash)' },
  absent: { label: '미등원', cls: '', color: '#fff' },
  free: { label: '공석', cls: 'empty', color: 'var(--line-2)' },
  off: { label: '사용중지', cls: 'empty', color: 'var(--line-2)' },
}

/** 배정 × 재실 × 이탈 → 좌석표 한 칸 */
function seatView(cell: SeatCell): SeatView {
  if (cell.assignmentState === 'DISABLED') return 'off'
  if (cell.assignmentState !== 'ASSIGNED' || cell.enrollmentId === null) return 'free'
  // ★ 이탈을 먼저 본다. 이탈 중이어도 출결은 재실이라 presence 를 먼저 보면 앉아 있는 걸로 보인다
  if (cell.onSeatLeave) return 'away'
  return cell.presence === 'PRESENT' ? 'seat' : 'absent'
}

/** 이탈 시작 시각 → 지금까지 몇 분. 서버가 분을 안 주는 자리라 화면이 센다 */
function minutesSince(iso: string | null): number {
  if (!iso) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
}

/** ISO(UTC) → 'yyyy-MM-dd HH:mm' (로컬) */
function dateTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function one(v: unknown): string | undefined {
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]) : undefined
  if (typeof v === 'string' && v !== '') return v
  return undefined
}

/* ── 키오스크 통신 상태 — 별도 콘솔 없이 이 화면에서 본다 ──
 *
 * ★ **「단말 목록」이 아니라 「지점별 통신 상태」다.** 지점당 키오스크가 1대이고 요청에
 *   단말 식별자가 없어(2026-10-26 확인) 단말을 행으로 세울 수가 없다. 그래서 행은 지점이다.
 *   예전에는 `KIOSK-A1 · 펌웨어 v2.4.1 · 금일 86건` 같은 예시 6대를 세워 뒀는데,
 *   **서버에 그 개념 자체가 없어** 연동할 것이 아니라 지울 것이었다.
 *
 * ★ **마지막 통신은 하트비트가 아니다.** 학생이 태깅해서 `/kiosk/**` 요청이 들어올 때만
 *   갱신되고 그것도 1분 간격이다 — **한산한 시간대에는 멀쩡한 단말도 오래 전으로 보인다.**
 *   그 말을 화면이 하지 않으면 「키오스크가 죽었다」는 오해로 현장에 전화가 간다.
 *
 * ★ **온라인/오프라인 판정을 프론트에서 다시 계산하지 않는다.** 기준(10분)은 서버가 쥐고
 *   `kioskOnline` 으로 내려준다. 여기서 또 재면 기준이 갈리는 날 같은 화면의 숫자와 딱지가
 *   서로 다른 말을 한다.
 *
 * ⚠️ **이 경로는 최고관리자 전용이다**(`branchConfigs.ts` 주석). 지점 계정은 자기 지점도
 *   403 이라 탭 자체를 권한으로 가른다 — 열어 두면 빈 표가 고장으로 읽힌다.
 */

/** 마지막 통신이 이보다 오래됐으면 시각을 주황으로 둔다. 서버 판정(10분)보다 넉넉하게 본다 */
const KIOSK_STALE_MIN = 30

/* ★ 위쪽 `minutesSince` 와 **따로 둔다.** 그쪽은 이탈 시각이 없으면 0분으로 뭉개는데,
   키오스크는 「한 번도 통신이 없었다」와 「방금 통신했다」를 반드시 갈라야 한다 —
   뭉개면 자격증명조차 없는 지점이 「방금」으로 보인다. */
function kioskIdleMin(iso: string | null): number | null {
  if (iso === null || iso === '') return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 60000)
}

/** 「3분 전」처럼 읽히게. 담당자가 보는 것은 절대 시각보다 **얼마나 됐는지**다 */
function sinceLabel(min: number | null): string {
  if (min === null) return '기록 없음'
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  return `${Math.floor(min / (60 * 24))}일 전`
}

const KIOSK_COLUMNS: Column<BranchConfig>[] = [
  {
    key: 'academyName',
    header: '지점',
    width: '110px',
    sortable: true,
    value: (r) => r.academyName,
    render: (r) => <b>{r.academyName}</b>,
  },
  {
    key: 'online',
    header: '연결',
    width: '96px',
    align: 'center',
    sortable: true,
    /* ★ 정렬은 **오프라인이 위로** 와야 한다. 봐야 할 것이 그쪽이다 */
    value: (r) => (r.kioskOnline ? 1 : 0),
    render: (r) => (
      <span
        className={`mk ${r.kioskOnline ? 'verified' : 'brandnew'}`}
        title={
          r.kioskOnline
            ? '최근 10분 안에 키오스크 요청이 들어왔습니다'
            : '최근 10분 동안 요청이 없었습니다. 한산한 시간대에도 이렇게 보입니다'
        }
      >
        {r.kioskOnline ? '온라인' : '오프라인'}
      </span>
    ),
  },
  {
    key: 'lastSeen',
    header: '마지막 통신',
    width: '112px',
    align: 'center',
    sortable: true,
    /* ★ 정렬 키는 분(오래된 것이 큰 값)이다. 「3분 전」 글자로 정렬하면 사전순이 된다 */
    value: (r) => kioskIdleMin(r.kioskLastSeenAt) ?? Number.MAX_SAFE_INTEGER,
    render: (r) => {
      const min = kioskIdleMin(r.kioskLastSeenAt)
      if (min === null) return <span style={{ color: 'var(--ink-3)' }}>기록 없음</span>
      return (
        <span
          style={{
            fontWeight: 700,
            fontSize: 11.5,
            color: min >= KIOSK_STALE_MIN ? 'var(--amber)' : 'var(--ink-2)',
          }}
        >
          {sinceLabel(min)}
        </span>
      )
    },
  },
  {
    key: 'lastSeenAt',
    header: '최종 수신 시각',
    width: '150px',
    sortable: true,
    value: (r) => (r.kioskLastSeenAt === null ? '-' : dateTime(r.kioskLastSeenAt)),
  },
  {
    key: 'acadCd',
    header: '지점 코드',
    width: '90px',
    align: 'center',
    sortable: true,
    value: (r) => r.acadCd ?? '-',
    render: (r) => <code style={{ fontSize: 10.5 }}>{r.acadCd ?? '-'}</code>,
  },
  {
    key: 'clientId',
    header: '키오스크 계정',
    sortable: true,
    value: (r) => r.kioskClientId ?? '',
    render: (r) =>
      r.kioskClientId === null || r.kioskClientId === '' ? (
        /* ★ 자격증명이 없으면 **연결될 수가 없다.** 오프라인의 이유가 단말이 아니라 설정이다 */
        <span
          className="mk brandnew"
          title="계정이 없어 단말이 접속할 수 없습니다. 기초 관리 화면에서 발급합니다"
        >
          미발급
        </span>
      ) : (
        <code style={{ fontSize: 10.5 }}>{r.kioskClientId}</code>
      ),
  },
]

/* ── 이동 신청 내역(이탈 이력) ── */

const STATUS_CHIPS = SEAT_LEAVE_STATUS.map((s) => SEAT_LEAVE_STATUS_LABEL[s])
const CHIP_TO_STATUS = new Map<string, SeatLeaveStatus>(SEAT_LEAVE_STATUS.map((s) => [SEAT_LEAVE_STATUS_LABEL[s], s]))

/** 오래 비운 이탈을 붉게 표시하는 기준(분) */
const LONG_AWAY_MIN = 30

const COLUMNS: Column<SeatLeaveRow>[] = [
  { key: 'leftAt', header: '이탈 시각', width: '146px', sortable: true, value: (r) => dateTime(r.leftAt) },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  {
    key: 'name',
    header: '이름',
    width: '96px',
    mask: 'name',
    // 키오스크가 보낸 카드·학번으로 학생을 못 찾은 건이다. 기록은 남아 있어 행은 보여준다
    value: (r) => r.name ?? '학생 미확인',
    render: (r, v) =>
      r.resolved ? v : <span style={{ color: 'var(--muted)' }} title="등록된 학생과 연결되지 않은 태깅입니다">학생 미확인</span>,
  },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seatCd ?? '-' },
  {
    key: 'to',
    header: '이동 위치',
    width: '104px',
    align: 'center',
    value: () => '',
    render: () => <Unfilled reason="이탈 위치 구분값이 아직 정해지지 않았다(I-16)" />,
  },
  {
    key: 'channel',
    header: '경로',
    width: '86px',
    align: 'center',
    // 지금은 키오스크 태깅만 들어온다. 앱 신청이 열리면 서버가 경로를 줘야 한다
    value: () => '키오스크',
    render: () => <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--amber)' }}>키오스크</span>,
  },
  {
    key: 'minutes',
    header: '경과',
    width: '80px',
    align: 'right',
    sortable: true,
    value: (r) => r.minutes ?? -1,
    render: (r) =>
      r.minutes === null ? (
        // 자동 마감·복귀 기록 없음은 언제 돌아왔는지 모른다 — 0분이 아니다
        <span style={{ color: 'var(--muted)' }}>-</span>
      ) : (
        <span
          style={{
            color: r.status === 'OPEN' && r.minutes > LONG_AWAY_MIN ? 'var(--red)' : undefined,
            fontWeight: r.status === 'OPEN' ? 700 : 400,
          }}
        >
          {r.minutes}분
        </span>
      ),
  },
  {
    key: 'returned',
    header: '복귀',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => SEAT_LEAVE_STATUS_LABEL[r.status],
    render: (r) =>
      r.status === 'RETURNED' ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }} title={`${dateTime(r.closedAt)} 복귀`}>
          복귀 {dateTime(r.closedAt).slice(11)}
        </span>
      ) : r.status === 'OPEN' ? (
        <span className="mk brandnew">이탈 중</span>
      ) : r.status === 'AUTO_CLOSED' ? (
        <span className="mk brandnew" title="밤 12시 30분까지 복귀 태깅이 없어 키오스크가 닫은 건입니다">
          미복귀 마감
        </span>
      ) : (
        <span className="mk supplement" title="복귀 태깅 없이 다음 이탈이 찍혔습니다">
          복귀 기록 없음
        </span>
      ),
  },
]

const fetchClasses = ({ year }: { year: number }) => listClasses(year)

function LeaveLog({ academyId }: { academyId: number | null }) {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)

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
      { type: 'text', name: 'keyword', label: '이름 · 학번 · 좌석', placeholder: '예: 이승민 / A04', span: 2 },
      { type: 'select', name: 'classId', label: '반', options: classOptions },
      { type: 'chips', name: 'status', label: '상태', options: STATUS_CHIPS, multiple: true },
    ],
    [classOptions],
  )

  // ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
  const params = useMemo(() => {
    const range = query.date as DateRangeValue | undefined
    const chips = Array.isArray(query.status) ? query.status : []
    const statuses = chips.map((c) => CHIP_TO_STATUS.get(c)).filter((s): s is SeatLeaveStatus => s !== undefined)
    const classId = one(query.classId)
    const from = range?.from || undefined
    const to = range?.to || from
    return {
      academyId: academyId ?? undefined,
      // date 와 from/to 를 같이 보내면 기간이 이긴다 — 헷갈리지 않게 하나만 보낸다. 안 고르면 오늘
      ...(from && to && from !== to ? { from, to } : { date: from }),
      classId: classId ? Number(classId) : undefined,
      statuses: statuses.length > 0 ? statuses : undefined,
      keyword: one(query.keyword),
    }
  }, [query, academyId])

  const board = useServerData({
    fetcher: fetchSeatLeaves,
    params,
    enabled: academyId !== null,
    errorMessage: '좌석 이탈 내역을 불러오지 못했습니다.',
  })

  const rows = board.data?.rows ?? []
  const summary = board.data?.summary
  // 서버가 이미 가려서 보낸 경우 화면에서 또 가리지 않는다 — 이중 마스킹이 된다
  const serverMasked = board.data?.masked ?? false
  const effectiveMasked = serverMasked ? false : masked

  return (
    <>
      <SearchForm fields={fields} onSearch={setQuery} presetKey="SEAT_LEAVE" />

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.leaveLogId)}
        masked={effectiveMasked}
        loading={board.loading}
        pageSize={12}
        emptyText="조회 기간에 좌석 이탈 기록이 없습니다"
        countLabel={
          <>
            이탈 <b>{summary?.total ?? 0}</b>건 · 이탈 중{' '}
            <b style={{ color: summary?.OPEN ? 'var(--red)' : undefined }}>{summary?.OPEN ?? 0}</b>건 · 미복귀 마감{' '}
            <b style={{ color: summary?.AUTO_CLOSED ? 'var(--red)' : undefined }}>{summary?.AUTO_CLOSED ?? 0}</b>건
          </>
        }
        toolbar={
          <>
            {/* 출결 현황과 같은 처리다 — 서버가 가려서 보낸 경우엔 토글 자체가 뜻이 없다 */}
            {serverMasked ? (
              <span className="dt-count" style={{ color: 'var(--muted)' }}>
                권한상 마스킹됨
              </span>
            ) : (
              <MaskToggle masked={masked} onChange={setMasked} />
            )}
            <ExcelButton filename="좌석_이탈현황" columns={COLUMNS} rows={rows} masked={effectiveMasked} />
          </>
        }
      />
    </>
  )
}

function Content() {
  const { academyId, ready: academyReady } = useAcademy()
  const [masked, setMasked] = useState(true)
  const [onlySeated, setOnlySeated] = useState(false)
  const [tab, setTab] = useState('map')

  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  /** 구역 id → 배치. 상단 '재실' 은 지점 전체라 구역을 다 읽는다 */
  const [layouts, setLayouts] = useState<Map<number, SeatCell[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (academyId === null) {
      setAreas([])
      setLoading(false)
      return
    }
    let alive = true
    listSeatAreas(academyId)
      .then((list) => {
        if (!alive) return
        // 반 교실 좌석은 좌석 이탈 대상이 아니다 — 독서실(STUDY)만. 값이 없으면 예전 응답이라 독서실로 본다
        const study = list.filter((a) => (a.areaType ?? 'STUDY') === 'STUDY')
        setAreas(study)
        setAreaId((prev) => (study.some((a) => a.id === prev) ? prev : (study[0]?.id ?? null)))
      })
      .catch((err) => alive && setError(err instanceof ApiError ? err.message : '좌석 구역을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [academyId])

  const refresh = useCallback(async () => {
    if (academyId === null) return
    setLoading(true)
    try {
      const lays = await Promise.all(areas.map((a) => getSeatLayout(a.id, !masked)))
      setLayouts(new Map(areas.map((a, i) => [a.id, lays[i]])))
      setLoadedAt(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '좌석표를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [academyId, areas, masked])

  useEffect(() => {
    void refresh()
    const t = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(t)
  }, [refresh])

  const allCells = useMemo(() => [...layouts.values()].flat(), [layouts])
  const seated = allCells.filter((c) => seatView(c) === 'seat').length
  // 지점 전체 기준이다 — 구역을 바꿔도 이 숫자는 그대로여야 한다
  const away = allCells.filter((c) => seatView(c) === 'away').length

  /* 도면 좌표대로 **줄을 맞춰** 그린다.
     ★ 한 줄로 흘려보내면 같은 좌석이 독서실 좌석배치표와 다른 모양이 되어,
       두 화면을 번갈아 보는 사람이 자리를 못 찾는다(09-25 확인). */
  const rows = useMemo(() => {
    const list = areaId !== null ? (layouts.get(areaId) ?? []) : []
    const byRow = new Map<number, SeatCell[]>()
    for (const c of list) {
      const y = c.yPos ?? 1
      byRow.set(y, [...(byRow.get(y) ?? []), c])
    }
    return [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, cs]) => ({
        y,
        cells: cs.sort((a, b) => (a.xPos ?? 0) - (b.xPos ?? 0) || a.seatCd.localeCompare(b.seatCd)),
      }))
  }, [layouts, areaId])

  return (
    <div className="p-seat">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 재실
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {seated}
          </div>
          <div className={away ? 'd warn' : 'd'}>본인좌석 · 이탈 중 {away}명</div>
        </div>
        {AWAY_LOCATIONS.map((l) => (
          <div className="stat" key={l}>
            <div className="l">
              <Icon name="map-pin" size={13} /> {l}
            </div>
            <div className="v">
              <Unfilled reason="이탈 위치 구분값이 아직 정해지지 않았다(I-16)" />
            </div>
            <div className="d">이탈 위치</div>
          </div>
        ))}
        <KioskStat />
      </div>

      <Tabs
        items={[
          { key: 'map', label: '실시간 좌석표' },
          { key: 'log', label: '이동 신청 내역' },
          { key: 'kiosk', label: '키오스크 관리' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {academyId === null && academyReady && (
        <div className="note-box">지점을 먼저 선택해 주세요. 좌석 이탈은 지점 단위로 조회합니다.</div>
      )}

      {tab === 'map' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="armchair" size={15} />
              </span>
              실시간 좌석표
              {areas.length > 0 && (
                <select
                  className="sel"
                  style={{ width: 150, marginLeft: 8 }}
                  value={areaId ?? ''}
                  onChange={(e) => setAreaId(Number(e.target.value))}
                  aria-label="좌석 구역"
                >
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.buildingName} {a.areaNm}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="r">
              <button className={`chip${!onlySeated ? ' on' : ''}`} onClick={() => setOnlySeated(false)}>
                전체
              </button>
              <button className={`chip${onlySeated ? ' on' : ''}`} onClick={() => setOnlySeated(!onlySeated)}>
                본인좌석
              </button>
              {AWAY_LOCATIONS.map((l) => (
                <button key={l} className="chip" disabled data-soon title="준비 중입니다">
                  {l}
                </button>
              ))}
              <MaskToggle masked={masked} onChange={setMasked} />
              <span
                className="mk verified"
                style={{ marginLeft: 4 }}
                title={loadedAt ? `${dateTime(loadedAt.toISOString())} 기준 · 1분마다 새로 읽습니다` : undefined}
              >
                <Icon name="zap" size={11} /> 실시간
              </span>
            </div>
          </div>
          <div className="card-sec-b">
            {error && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 10 }}>
                {error}
              </div>
            )}
            {!loading && academyId !== null && areas.length === 0 && !error && (
              <div className="note-box">이 지점에 등록된 독서실 좌석 구역이 없습니다.</div>
            )}
            {rows.map((row) => (
            <div className="seatmap" key={row.y}>
              {row.cells.map((c) => {
                const view = seatView(c)
                const awayMin = view === 'away' ? minutesSince(c.seatLeftAt) : 0
                const meta = VIEW_META[view]
                const dim = onlySeated && view !== 'seat'
                const who = c.studentName ?? ''
                return (
                  <div
                    key={c.seatId}
                    className={`seat ${meta.cls}`}
                    style={{
                      ...(dim ? { opacity: 0.28 } : undefined),
                      ...(view === 'absent' ? { borderStyle: 'dashed' } : undefined),
                    }}
                    title={
                      view === 'free' || view === 'off'
                        ? `${c.seatCd} · ${meta.label}`
                        : view === 'away'
                          ? `${c.seatCd} · ${who} · ${dateTime(c.seatLeftAt).slice(11)} 이탈 · ${awayMin}분째`
                          : `${c.seatCd} · ${who} · ${meta.label}`
                    }
                  >
                    <span className="sc">{c.seatCd}</span>
                    <span className="sn">{view === 'free' || view === 'off' ? meta.label : who}</span>
                    {view === 'away' && (
                      <span className="sl" style={{ color: awayMin > LONG_AWAY_MIN ? 'var(--red)' : 'var(--ink-2)' }}>
                        이탈 {awayMin}분
                      </span>
                    )}
                    {view === 'absent' && (
                      <span className="sl" style={{ color: 'var(--muted)' }}>
                        미등원
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            ))}

            <div className="loc-legend">
              {(['seat', 'away', 'absent', 'free'] as const).map((v) => (
                <span key={v}>
                  <span
                    className="sw"
                    style={{ background: VIEW_META[v].color, ...(v === 'absent' ? { border: '1px dashed var(--line)' } : undefined) }}
                  />
                  {VIEW_META[v].label}
                </span>
              ))}
              <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
                키오스크 태깅으로 수신된 상태만 표시됩니다
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === 'log' && <LeaveLog academyId={academyId} />}

      {tab === 'kiosk' && <KioskStatus />}
    </div>
  )
}

/* 상단 요약 칸. 탭을 열지 않고도 **몇 곳이 멈췄는지**는 보여야 한다 —
 * 좌석표를 읽기 전에 그 수를 알아야 빈 자리를 어떻게 해석할지가 정해진다.
 *
 * ★ 지점 계정은 이 경로가 403 이다. 그때 빨간 오류를 띄우면 고장으로 읽히므로
 *   **조용히 「본사 전용」으로** 둔다 — 지점 담당자가 할 수 있는 일이 없다. */
function KioskStat() {
  const { principal, me } = useAuth()
  const isSuper = (me?.roles ?? principal?.roles ?? []).some((r) => r === 'SUPER_ADMIN')
  const params = useMemo(() => ({}), [])
  const rows = useServerData({ fetcher: listBranchConfigs, params, enabled: isSuper })

  const list = rows.data ?? []
  const online = list.filter((r) => r.kioskOnline).length

  return (
    <div className="stat">
      <div className="l">
        <Icon name="monitor" size={13} /> 키오스크
      </div>
      <div className="v">
        {!isSuper ? (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>본사 전용</span>
        ) : rows.loading && rows.data === null ? (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>…</span>
        ) : rows.error !== null ? (
          <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>-</span>
        ) : (
          <span style={{ color: online === 0 && list.length > 0 ? 'var(--amber)' : undefined }}>
            {online} / {list.length}
          </span>
        )}
      </div>
      <div className="d">온라인 / 전체</div>
    </div>
  )
}

/* ── 키오스크 통신 상태 탭 ──
 *
 * ★ **지점 선택과 무관하게 전 지점을 보여준다.** 이 경로가 최고관리자 전용이고 응답이
 *   전 지점이라, 한 지점만 추려 보여주면 「다른 지점은 괜찮은가」를 알 수 없다 —
 *   한 대가 죽은 것과 전 지점이 죽은 것(서버 쪽 사고)을 가르는 것이 이 표의 일이다.
 */
function KioskStatus() {
  const { principal, me } = useAuth()
  const isSuper = (me?.roles ?? principal?.roles ?? []).some((r) => r === 'SUPER_ADMIN')

  const params = useMemo(() => ({}), [])
  const rows = useServerData({
    fetcher: listBranchConfigs,
    params,
    enabled: isSuper,
    errorMessage: '키오스크 통신 상태를 불러오지 못했습니다.',
  })

  if (!isSuper) {
    return (
      <div className="note-box">
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">본사 관리자만 볼 수 있습니다</div>
          <div className="tx">
            키오스크 설정은 전 지점 단위로 관리해 지점 계정으로는 열리지 않습니다. 단말이 응답하지
            않는 경우 <b>본사에 문의해 주세요.</b> 좌석표와 이동 신청 내역은 그대로 보입니다.
          </div>
        </div>
      </div>
    )
  }

  const list = rows.data ?? []
  const offline = list.filter((r) => !r.kioskOnline)
  /* ★ **「한 번도 통신이 없었다」와 「통신하던 것이 멈췄다」를 가른다.** 둘 다 오프라인으로
       보이는데 담당자가 할 일이 정반대다 — 전자는 설치·연동이 아직 안 된 것이고,
       후자는 지금 장애다. 뭉개서 「서버 쪽 문제」라고 사용하면 설치 전인데 장애로 신고된다. */
  const neverSeen = list.every((r) => r.kioskLastSeenAt === null)
  const noCredential = list.filter((r) => r.kioskClientId === null || r.kioskClientId === '')

  return (
    <>
      <div className="note-box plain">
        <div className="ic">
          <Icon name="monitor" size={17} />
        </div>
        <div>
          <div className="tt">마지막 통신은 학생이 태깅할 때만 갱신됩니다</div>
          <div className="tx">
            키오스크가 스스로 신호를 보내지 않아 <b>학생이 태깅해 요청이 들어온 시각</b>을
            표시합니다. 한산한 시간대에는 정상 단말도 「오프라인」으로 보이므로,{' '}
            <b>영업 시간 중에 오래 멈춘 지점</b>만 확인 대상입니다. 갱신 간격은 1분입니다.
          </div>
        </div>
      </div>

      {rows.error !== null && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {rows.error}
        </div>
      )}

      {list.length > 0 && neverSeen && (
        /* 설치·연동 전. 장애가 아니므로 붉은 경고가 아니어야 한다 */
        <div className="note-box">
          <div className="ic">
            <Icon name="monitor" size={17} />
          </div>
          <div>
            <div className="tt">아직 키오스크 통신 기록이 없습니다</div>
            <div className="tx">
              지점 {list.length}곳 모두 <b>한 번도 태깅 요청이 들어오지 않은 상태</b>입니다.
              {noCredential.length === list.length ? (
                <>
                  {' '}
                  키오스크 계정이 전 지점 미발급이라 <b>아직 연동 전입니다</b> — 장애가 아닙니다.
                  단말은 계정을 받아야 접속할 수 있으므로, <b>기초 관리 화면</b>에서 지점별로 발급한
                  뒤 그 값을 키오스크 쪽 설정에 넣어야 이 표가 자동 입력됩니다.
                </>
              ) : noCredential.length > 0 ? (
                <>
                  {' '}
                  이 가운데 <b>{noCredential.length}곳</b>은 키오스크 계정이 아직 없습니다. 계정이
                  없으면 단말이 접속 자체를 할 수 없으므로 <b>기초 관리 화면</b>에서 먼저 발급해야
                  합니다.
                </>
              ) : (
                <> 단말이 연결되면 이 표에 마지막 통신 시각이 자동 입력됩니다.</>
              )}
            </div>
          </div>
        </div>
      )}

      {list.length > 0 && !neverSeen && offline.length === list.length && (
        /* ★ **통신하던 전 지점이 동시에 멈춘 것은 단말 문제가 아니다.** 한 지점씩 전화하게 되는
             자리라, 서버·네트워크를 먼저 보라고 화면이 말한다. 주말 서버 점검 중에도 이렇게 뜬다 */
        <div className="blocked-note">
          <div className="ic">
            <Icon name="triangle-alert" size={17} />
          </div>
          <div>
            <div className="tt">전 지점이 오프라인입니다</div>
            <div className="tx">
              통신하던 지점 {list.length}곳이 모두 멈춘 것이라{' '}
              <b>단말 고장이 아니라 서버·네트워크 쪽</b>일 가능성이 큽니다. 지점에 연락하기 전에
              담당자에게 확인해 주세요. 키오스크 서버 점검 중에도 이렇게 표시됩니다.
            </div>
          </div>
        </div>
      )}

      <DataTable
        columns={KIOSK_COLUMNS}
        rows={list}
        rowKey={(r) => String(r.academyId)}
        masked={false}
        loading={rows.loading}
        pageSize={15}
        emptyText="등록된 지점이 없습니다."
        countLabel={
          <>
            지점 <b>{list.length}</b>곳 · 오프라인 <b>{offline.length}</b>곳
          </>
        }
        toolbar={
          <button className="btn" onClick={rows.reload} disabled={rows.loading}>
            <Icon name="refresh-cw" size={14} /> 새로 읽기
          </button>
        }
      />

      <div className="blocked-note">
        <div className="ic">
          <Icon name="triangle-alert" size={17} />
        </div>
        <div>
          <div className="tt">자리를 비운 것이 모두 기록되지는 않습니다</div>
          <div className="tx">
            기록에 남는 것은 <b>학생이 키오스크에 태깅한 경우</b>입니다. 아무 것도 하지 않고 자리를
            비우면 남지 않으므로, 좌석표의 빈 자리는
            <b> 「자리를 비웠다」가 아니라 「기록이 없다」</b>로 입니다. 단말이 멈춘 구역은
            이탈 정보가 <b>비는 것이지 0이 되는 것이 아닙니다.</b>
          </div>
        </div>
      </div>
    </>
  )
}

export const seatMoveMockup: Mockup = {
  Content,
  actions: (
    <>
      {/* ★ 헤더의 「키오스크 관리」 버튼을 뺐다. 탭으로 실제 화면이 생겨서
             준비 중 버튼이 그 탭과 중복되는데, 눌리지 않아 **탭이 안 되는 것처럼** 읽힌다.
             헤더는 본문과 상태를 공유하지 못해(CLAUDE.md 5-1) 탭을 열어 줄 수도 없다. */}
      <button className="btn" disabled data-soon title="준비 중입니다">호실 선택 ▾</button>
    </>
  ),
}
