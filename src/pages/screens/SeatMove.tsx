import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  MockNotice,
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
import { ApiError } from '../../api/client'
import { listClasses } from '../../api/classes'
import { getSeatLayout, listSeatAreas, type SeatArea, type SeatCell } from '../../api/facility'
import {
  SEAT_LEAVE_STATUS,
  SEAT_LEAVE_STATUS_LABEL,
  fetchCurrentSeatLeaves,
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
 * 연동(2026-09-22) — GET /api/v1/admin/seat-leaves · /current. src/api/seatLeaves.ts 참고.
 *   · 이동 신청 내역 탭 = 이탈 이력. 서버가 이탈·복귀를 한 행으로 짝지어 준다
 *   · 실시간 좌석표 탭 = 좌석 배치(/seats/layout) 위에 '지금 이탈 중'을 겹친다.
 *     ★ 겹치는 기준은 enrollmentId 다. 이탈 행의 seatCd 는 **키오스크 번호**라
 *       별관이면 1000번대로 와서 배치도의 seatCd 와 안 맞는다
 *     ★ 배치도의 presence 는 이탈 기록을 모른다(출결 외출만 본다). 그래서 이탈 중인지는
 *       이 화면이 current 로 따로 받아 덮는다 — 서버가 합쳐 주면 이 겹치기를 걷어낸다(API_GAPS 37부)
 *   · 키오스크 관리 탭 = 아직 서버에 없다. 예시 값 그대로 두고 탭 안에 표시한다
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
 *   별도 키오스크 관리 콘솔로 나가지 않고, 여기서 단말을 등록·모니터링하며
 *   좌석 이탈 정보도 그 단말들에서 수신한다(단일 진입점). */

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

/** 배정 × 재실 × 이탈 중 → 좌석표 한 칸 */
function seatView(cell: SeatCell, leaving: boolean): SeatView {
  if (cell.assignmentState === 'DISABLED') return 'off'
  if (cell.assignmentState !== 'ASSIGNED' || cell.enrollmentId === null) return 'free'
  if (leaving) return 'away'
  return cell.presence === 'PRESENT' ? 'seat' : 'absent'
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

/* ── 키오스크 단말 관리 — 별도 콘솔 없이 이 화면에 내장한다 ──
 * 서버에 단말 관리가 없다(API_GAPS 2부). 아래는 예시 값이고 탭 안에 MockNotice 로 알린다. */

interface Kiosk {
  id: string
  place: string
  /** 이 단말이 처리하는 기능 */
  uses: string[]
  online: boolean
  firmware: string
  lastSyncAt: string
  /** 금일 이 단말에서 수신한 좌석 이탈·복귀 건수 */
  todayEvents: number
}

const KIOSKS: Kiosk[] = [
  { id: 'KIOSK-A1', place: 'A실 입구', uses: ['좌석 이탈·복귀', '출결'], online: true, firmware: 'v2.4.1', lastSyncAt: '2026-05-28 14:22:10', todayEvents: 86 },
  { id: 'KIOSK-A2', place: 'A실 후면', uses: ['좌석 이탈·복귀'], online: true, firmware: 'v2.4.1', lastSyncAt: '2026-05-28 14:21:44', todayEvents: 41 },
  { id: 'KIOSK-B1', place: 'B실 입구', uses: ['좌석 이탈·복귀', '출결'], online: true, firmware: 'v2.4.1', lastSyncAt: '2026-05-28 14:22:03', todayEvents: 63 },
  { id: 'KIOSK-B2', place: 'B실 후면', uses: ['좌석 이탈·복귀'], online: false, firmware: 'v2.3.0', lastSyncAt: '2026-05-28 09:41:18', todayEvents: 7 },
  { id: 'KIOSK-3F', place: '3층 복도', uses: ['좌석 이탈·복귀'], online: true, firmware: 'v2.4.1', lastSyncAt: '2026-05-28 14:20:57', todayEvents: 29 },
  { id: 'KIOSK-4F', place: '4층 복도', uses: ['좌석 이탈·복귀'], online: true, firmware: 'v2.4.1', lastSyncAt: '2026-05-28 14:19:32', todayEvents: 18 },
]

const KIOSK_COLUMNS: Column<Kiosk>[] = [
  {
    key: 'id',
    header: '단말 ID',
    width: '118px',
    sortable: true,
    value: (r) => r.id,
    render: (_r, v) => <code style={{ fontSize: 10.5 }}>{v}</code>,
  },
  { key: 'place', header: '설치 위치', width: '110px', sortable: true, value: (r) => r.place },
  {
    key: 'uses',
    header: '사용 기능',
    value: (r) => r.uses.join(' · '),
    render: (r) => (
      <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
        {r.uses.map((u) => (
          <span key={u} className="mk supplement">
            {u}
          </span>
        ))}
      </span>
    ),
  },
  {
    key: 'online',
    header: '연결',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => (r.online ? '온라인' : '오프라인'),
    render: (r) => <span className={`mk ${r.online ? 'verified' : 'brandnew'}`}>{r.online ? '온라인' : '오프라인'}</span>,
  },
  {
    key: 'firmware',
    header: '펌웨어',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.firmware,
    render: (r) => (
      <span style={{ fontSize: 11.5, color: r.firmware === 'v2.4.1' ? 'var(--ink-2)' : 'var(--amber)', fontWeight: 700 }}>
        {r.firmware}
      </span>
    ),
  },
  { key: 'lastSyncAt', header: '최종 수신', width: '160px', sortable: true, value: (r) => r.lastSyncAt },
  {
    key: 'todayEvents',
    header: '금일 수신',
    width: '92px',
    align: 'right',
    sortable: true,
    value: (r) => r.todayEvents,
    render: (r) => <b>{r.todayEvents}건</b>,
  },
  {
    key: 'act',
    header: '',
    width: '128px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled data-soon title="준비 중입니다">
          설정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled data-soon title="준비 중입니다">
          재시작
        </button>
      </div>
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

  return (
    <>
      <SearchForm fields={fields} onSearch={setQuery} presetKey="seat-leave" />

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => String(r.leaveLogId)}
        masked={masked}
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
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="좌석_이탈현황" columns={COLUMNS} rows={rows} masked={masked} />
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
  const [current, setCurrent] = useState<SeatLeaveRow[]>([])
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
      const [cur, ...lays] = await Promise.all([
        fetchCurrentSeatLeaves({ academyId }),
        ...areas.map((a) => getSeatLayout(a.id, !masked)),
      ])
      setCurrent(cur)
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

  const leavingBy = useMemo(() => {
    const m = new Map<number, SeatLeaveRow>()
    for (const r of current) if (r.enrollmentId !== null) m.set(r.enrollmentId, r)
    return m
  }, [current])

  const allCells = useMemo(() => [...layouts.values()].flat(), [layouts])
  const seated = allCells.filter((c) => seatView(c, c.enrollmentId !== null && leavingBy.has(c.enrollmentId)) === 'seat').length

  const cells = useMemo(
    () =>
      [...(areaId !== null ? (layouts.get(areaId) ?? []) : [])]
        // 좌표 순서(위→아래, 왼→오른)로 늘어놓는다. 좌표가 없으면 번호순
        .sort((a, b) => (a.yPos ?? 0) - (b.yPos ?? 0) || (a.xPos ?? 0) - (b.xPos ?? 0) || a.seatCd.localeCompare(b.seatCd)),
    [layouts, areaId],
  )

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
          <div className={current.length ? 'd warn' : 'd'}>본인좌석 · 이탈 중 {current.length}명</div>
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
        <div className="stat">
          <div className="l">
            <Icon name="monitor" size={13} /> 키오스크
          </div>
          <div className="v">
            <Unfilled reason="키오스크 단말 상태가 서버에 없다" />
          </div>
          <div className="d">온라인 / 전체</div>
        </div>
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
        <div className="note-box">지점을 먼저 선택하세요. 좌석 이탈은 지점 단위로 조회합니다.</div>
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
            <div className="seatmap">
              {cells.map((c) => {
                const leave = c.enrollmentId !== null ? leavingBy.get(c.enrollmentId) : undefined
                const view = seatView(c, leave !== undefined)
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
                        : leave
                          ? `${c.seatCd} · ${who} · ${dateTime(leave.leftAt).slice(11)} 이탈 · ${leave.minutes ?? 0}분째`
                          : `${c.seatCd} · ${who} · ${meta.label}`
                    }
                  >
                    <span className="sc">{c.seatCd}</span>
                    <span className="sn">{view === 'free' || view === 'off' ? meta.label : who}</span>
                    {leave && (
                      <span
                        className="sl"
                        style={{ color: (leave.minutes ?? 0) > LONG_AWAY_MIN ? 'var(--red)' : 'var(--ink-2)' }}
                      >
                        이탈 {leave.minutes ?? 0}분
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

      {tab === 'kiosk' && (
        <>
          <MockNotice reason="키오스크 단말 등록·상태·펌웨어를 관리하는 API가 없다" />

          <div className="note-box plain">
            <div className="ic">
              <Icon name="monitor" size={17} />
            </div>
            <div>
              <div className="tt">키오스크 관리자 페이지를 이 화면 안에 넣었습니다</div>
              <div className="tx">
                별도 키오스크 콘솔로 나가지 않고 <b>여기서 단말을 등록·모니터링</b>하며, 좌석 이탈·복귀 정보도 이 단말들에서
                수신합니다. 단말이 오프라인이면 그 구역의 이탈 정보가 <b>비는 것이지 0이 되는 게 아니므로</b>, 좌석표를 읽기
                전에 이 탭에서 연결 상태를 먼저 확인해야 합니다.
              </div>
            </div>
          </div>

          <div className="blocked-note">
            <div className="ic">
              <Icon name="triangle-alert" size={17} />
            </div>
            <div>
              <div className="tt">자리를 비운 것이 모두 기록되지는 않습니다</div>
              <div className="tx">
                기록에 남는 것은 <b>학생이 키오스크에 태깅한 경우</b>입니다.
                아무 것도 하지 않고 자리를 비우면 남지 않으므로, 좌석표의 빈 자리는
                <b> &lsquo;자리를 비웠다&rsquo;가 아니라 &lsquo;기록이 없다&rsquo;</b>로 보셔야 합니다.
              </div>
            </div>
          </div>

          <DataTable
            columns={KIOSK_COLUMNS}
            rows={KIOSKS}
            rowKey={(r) => r.id}
            masked={false}
            pageSize={10}
            countLabel={
              <>
                등록 단말 <b>{KIOSKS.length}</b>대
              </>
            }
            toolbar={
              <>
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="refresh-cw" size={14} /> 전체 동기화
                </button>
                <button className="btn" disabled data-soon title="준비 중입니다">
                  <Icon name="upload" size={14} /> 펌웨어 배포
                </button>
                <button className="btn pri" disabled data-soon title="준비 중입니다">
                  <Icon name="plus" size={14} /> 단말 등록
                </button>
              </>
            }
          />
        </>
      )}
    </div>
  )
}

export const seatMoveMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">호실 선택 ▾</button>
      <button className="btn" disabled data-soon title="준비 중입니다">
        <Icon name="monitor" size={14} /> 키오스크 관리
      </button>
    </>
  ),
}
