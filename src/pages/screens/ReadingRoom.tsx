import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { DataTable, ExcelButton, MaskToggle, Modal, PrintButton, Unfilled, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  assignSeat,
  assignSeatsBulk,
  getSeatLayout,
  listSeatAreas,
  releaseSeatOfStudent,
  setSeatUsable,
  type SeatArea,
  type SeatCell as ApiSeatCell,
} from '../../api/facility'
import { searchStudents, type Student } from '../../api/students'
import { studentNoText } from '../../lib/studentNo'
import { SeatSetup } from './SeatSetup'
import type { Mockup } from './types'
import './reading-room.css'

/* 학원생 관리 > 출결/자습/독서실 > 독서실 좌석배치표 — /api/v1/admin/seats
 * ⭐ 클라이언트가 직접 추가·사용 표기한 신규 메뉴.
 *
 * 이 화면이 배정 관리(F-4.10-3)와 다른 점:
 *   · 배정 관리   = "누구에게 어느 좌석을 줄 것인가" (명단 → 좌석)
 *   · 좌석배치표 = "지금 이 실이 어떤 상태인가" (도면 → 사람)
 *   현장 확인은 명단이 아니라 도면으로 하기 때문에 화면을 나눈다.
 *
 * ★ 좌석 상태가 두 축인 것이 서버 응답에도 그대로 있다 — 합치면 안 된다.
 *   · assignmentState : ASSIGNED / UNASSIGNED / DISABLED
 *   · presence        : PRESENT / OUT / ABSENT / EMPTY
 *   화면의 5색(재실·미등원·이석·공석·중지)은 이 둘의 조합이다(seatState).
 *
 * ★ 재실 여부는 이 화면이 판단하지 않는다. 출결 등원 로그와 좌석 이탈/복귀 신청을
 *   서버가 합쳐 presence 로 준다. 화면에서 두 소스를 조합하면 새로고침마다 값이 흔들린다.
 *
 * ★ 마스킹이 다른 목록과 같은 규칙이 됐다(2026-09-03). `unmask` 를 주면 원본이 오고
 *   응답의 `masked` 가 false 가 된다 — 화면은 그 값을 보고 토글 상태를 정한다.
 *
 * ★ 이석은 **좌석 이탈 태깅**이다(2026-09-25 서버 반영 — `onSeatLeave`·`seatLeftAt`).
 *   presence 는 이탈을 모른다 — 이탈해도 출결로는 재실이라 그것만 보면 앉아 있는 걸로 보인다.
 *   출결 외출(presence=OUT)도 자리에 없는 것은 같아서 함께 이석으로 묶는다.
 *
 * ★ 이석 위치(어디로 갔는지)는 아직 없다. 위치 구분값이 정해지지 않았다(I-16) —
 *   목업 컬럼은 남기고 <Unfilled/> 로 표시한다. */

type SeatState = 'in' | 'out' | 'away' | 'free' | 'off'

const STATE_META: Record<SeatState, { label: string; short: string; color: string }> = {
  in: { label: '재실', short: '재실', color: 'var(--mint-wash)' },
  out: { label: '배정 · 미등원', short: '미등원', color: 'var(--amber-wash)' },
  away: { label: '이석 (좌석 이탈 · 외출)', short: '이석', color: 'var(--violet-wash)' },
  free: { label: '미배정 공석', short: '공석', color: '#fff' },
  off: { label: '사용중지', short: '중지', color: '#eceef1' },
}

/** ISO 시각 → 'HH:mm' (로컬). 자리를 비운 시각은 날짜가 필요 없다 — 그날 안에서만 본다 */
function hhmm(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 배정 축 × 재실 축 × 이탈 축 → 화면의 5색 */
function seatState(cell: ApiSeatCell): SeatState {
  if (cell.assignmentState === 'DISABLED') return 'off'
  if (cell.assignmentState !== 'ASSIGNED') return 'free'
  // ★ 이탈을 먼저 본다. 이탈 중이어도 출결은 재실이라 presence 를 먼저 보면 '재실' 이 된다
  if (cell.onSeatLeave || cell.presence === 'OUT') return 'away'
  if (cell.presence === 'PRESENT') return 'in'
  return 'out'
}

interface Seat extends ApiSeatCell {
  state: SeatState
  row: number
  col: number
}

interface AssignRow {
  seatId: number
  code: string
  studentNo: string
  name: string
  className: string | null
  state: string
}

const ASSIGN_COLUMNS: Column<AssignRow>[] = [
  { key: 'code', header: '좌석', width: '86px', align: 'center', sortable: true, value: (r) => r.code },
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  // 서버가 이미 마스킹해서 보내므로 mask 를 걸지 않는다(이중 마스킹 방지)
  { key: 'name', header: '이름', width: '84px', value: (r) => r.name },
  /* ★ 「고정반」 → 「반」(1016 피드백 A-3). 고정반/이동반 구분이 없어졌으니 화면도 그냥 반이다 */
  { key: 'className', header: '반', width: '86px', align: 'center', value: (r) => r.className ?? '-' },
  {
    key: 'state',
    header: '현재 상태',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => r.state,
    render: (r) => (
      <span className={`mk ${r.state === '재실' ? 'verified' : r.state === '이석' ? 'supplement' : 'brandnew'}`}>
        {r.state}
      </span>
    ),
  },
  {
    key: 'awayTo',
    header: '이석 위치',
    value: () => '',
    render: () => <Unfilled reason="이석 위치 구분값이 아직 정해지지 않았다(I-16)" />,
  },
]

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('map')
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [cells, setCells] = useState<ApiSeatCell[]>([])
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null)
  /* ★ 좌석 칸 크기(1016 피드백 B-8). 지점에 따라 **92석**까지 있어 한 화면에 안 들어간다.
     `transform: scale` 이 아니라 **칸 자체를 줄인다** — scale 은 글자가 뭉개지고 누르는
     자리가 어긋난다. 1.0 이 기본이고 0.6 까지 줄인다 */
  const [zoom, setZoom] = useState(1)
  /* ★ 좌석을 눌러 바로 배정한다(1016 피드백 C-1·C-2).
     > 「현재는 학생이 배정되는 좌석을 **선택할 수 없고 제일 빠른 번호부터** 배정됩니다」
     > 「좌석배치표에서도 해당 좌석을 누르면 **바로 학생 배정**이 되는 기능」
     ★ **자동 배정은 그대로 둔다** — 한 기수를 통째로 앉힐 때는 그쪽이 빠르다. 수동을 **더한다** */
  const [assignTo, setAssignTo] = useState<{
    seatId: number
    seatCd: string
    /** 지금 그 자리에 앉은 사람. 있으면 **교체**다 */
    occupant: { enrollmentId: number; name: string; seatId: number } | null
    rows: Student[] | null
    pick: string
    keyword: string
    busy: boolean
    err: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [masked, setMasked] = useState(true)
  /** 재배치할 학생(배정 목록의 체크박스). 키는 좌석 id 문자열이다 */
  const [picked, setPicked] = useState<string[]>([])
  /** 재배치 모달 — 좌석 id → 옮길 좌석 id */
  const [moving, setMoving] = useState<Record<number, number> | null>(null)
  const [moveErr, setMoveErr] = useState<string | null>(null)

  // 구역 목록. 등록 탭에서 구역을 만든 뒤에도 불러야 해서 함수로 뺐다
  const reloadAreas = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    try {
      const list = await listSeatAreas(academyId)
      setAreas(list)
      setAreaId((prev) => (list.some((a) => a.id === prev) ? prev : (list[0]?.id ?? null)))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '좌석 구역을 불러오지 못했습니다.')
    }
  }, [academyId])

  useEffect(() => {
    void reloadAreas()
  }, [reloadAreas])

  const loadLayout = useCallback(async () => {
    if (areaId === null) {
      setCells([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setCells(await getSeatLayout(areaId, !masked))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '배치도를 불러오지 못했습니다.')
      setCells([])
    } finally {
      setLoading(false)
    }
  }, [areaId, masked])

  useEffect(() => {
    void loadLayout()
  }, [loadLayout])

  /* ★ 구역을 바꾸면 목록이 통째로 바뀐다. 선택을 안 비우면 **안 보이는 구역의 학생이
       그대로 남아** 재배치에 섞인다(특강 대기자에서 같은 일이 있었다) */
  useEffect(() => {
    setPicked([])
  }, [areaId])

  const seats = useMemo<Seat[]>(
    () =>
      cells.map((c) => ({
        ...c,
        state: seatState(c),
        // 좌표가 없으면 한 줄로 늘어놓는다 — 도면이 깨지는 것보다 낫다
        row: c.yPos ?? 1,
        col: c.xPos ?? 1,
      })),
    [cells],
  )

  const count = (s: SeatState) => seats.filter((x) => x.state === s).length
  const usable = seats.length - count('off')
  const assignedCount = count('in') + count('out') + count('away')

  const maxRow = seats.reduce((a, s) => Math.max(a, s.row), 0)
  const maxCol = seats.reduce((a, s) => Math.max(a, s.col), 0)

  /* ★ **좌표 그대로 찍는다**(1016 피드백 B-5·B-6). 전에는 그 행의 좌석을 모아 **촘촘히 흘려**
     그려서, 좌석이 1·2·5·6열에 있어도 화면엔 네 칸이 **붙어** 나왔다 — 등록 화면에서 빼 둔
     통로·기둥이 배치도에서 사라지는 원인이었다(「등록화면과 좌석배치도가 불일치」).
     이제 빈 좌표는 **빈 칸(`rr-gap`)으로 자리를 지킨다** — 통로는 「그리는 것」이 아니라
     「좌석이 없는 자리」다. */
  const grid = useMemo(() => {
    const at = new Map<string, (typeof seats)[number]>()
    for (const s of seats) at.set(`${s.row}:${s.col}`, s)
    return Array.from({ length: maxRow }, (_, r) =>
      Array.from({ length: maxCol }, (_, c) => at.get(`${r + 1}:${c + 1}`) ?? null),
    )
  }, [seats, maxRow, maxCol])

  const assignRows: AssignRow[] = useMemo(
    () =>
      seats
        .filter((s) => s.enrollmentId !== null)
        .map((s) => ({
          seatId: s.seatId,
          code: s.seatCd,
          studentNo: s.studentNo ?? '-',
          name: s.studentName ?? '-',
          className: s.className,
          state: STATE_META[s.state].short,
        })),
    [seats],
  )

  /** 옮겨 갈 수 있는 자리 — 사용중지(off)는 뺀다 */
  const freeSeats = useMemo(() => seats.filter((s) => s.state === 'free').sort((a, b) => a.seatCd.localeCompare(b.seatCd)), [seats])

  /**
   * 좌석 재배치.
   *
   * ★ 한 번에 보낸다. 단건을 N번 부르면 중간에 실패했을 때 일부만 옮겨진 채 남는데,
   *   좌석은 **되돌릴 기준이 화면에 없다** — 서버가 전부-아니면-전무로 처리한다.
   * ★ 옮기면 원래 자리는 서버가 알아서 비운다. 먼저 해제할 필요가 없다(확인함 09-16).
   */
  async function submitMove() {
    if (!moving) return
    const items = Object.entries(moving)
      .filter(([from, to]) => Number(from) !== to)
      .map(([from, to]) => {
        const row = seats.find((x) => x.seatId === Number(from))
        return { seatId: to, enrollmentId: row?.enrollmentId ?? 0 }
      })
      .filter((x) => x.enrollmentId !== 0)
    if (items.length === 0) return
    setBusy(true)
    setMoveErr(null)
    try {
      await assignSeatsBulk(items)
      setMoving(null)
      setPicked([])
      await loadLayout()
    } catch (err) {
      /* "A01: 이미 2026-0002 학생이 배정돼 있습니다" 처럼 서버 문구가 그대로 쓸 만하다 */
      setMoveErr(err instanceof ApiError ? err.message : '좌석을 옮기지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const sel = selectedSeatId === null ? undefined : seats.find((s) => s.seatId === selectedSeatId)
  const area = areas.find((a) => a.id === areaId)

  async function release() {
    if (!sel?.enrollmentId) return
    setBusy(true)
    try {
      await releaseSeatOfStudent(sel.enrollmentId)
      await loadLayout()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '배정을 해제하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  /* ★ 좌석을 눌러 그 자리에 학생을 앉힌다(C-1·C-2).
     ★ **좌석 없는 학생만** 띄운다(`unassignedSeat`). 이미 앉은 학생을 고르면 서버가 막는데,
       목록에 보여 놓고 고른 뒤에 막으면 **왜 안 되는지 모른다.**
     ★ 지점을 넘겨 부른다 — 안 넘기면 전 지점 학생이 섞여 **남의 지점 학생을 앉히게** 된다. */
  async function openAssign(
    seatId: number,
    seatCd: string,
    occupant: { enrollmentId: number; name: string; seatId: number } | null = null,
  ) {
    setAssignTo({ seatId, seatCd, occupant, rows: null, pick: '', keyword: '', busy: false, err: null })
    /* ★ **교체 상대는 서버를 또 부르지 않는다.** 이 구역 배치도에 이미 들어 있다 —
       교체는 두 자리를 맞바꾸는 것이라 **상대도 자리가 있어야** 하고, 자리 있는 사람은
       곧 이 배치도 위에 있다. 자리 없는 학생을 넣으면 원래 앉았던 사람만 자리를 잃는다
       (그건 교체가 아니라 빼앗기다 — 서버도 그쪽은 막아 뒀다). */
    if (occupant) {
      setAssignTo((v) => (v && v.seatId === seatId ? { ...v, rows: [] } : v))
      return
    }
    try {
      const res = await searchStudents({ academyId: academyId ?? undefined, unassignedSeat: true, size: 200 })
      setAssignTo((v) => (v && v.seatId === seatId ? { ...v, rows: res.rows } : v))
    } catch (err) {
      setAssignTo((v) =>
        v && v.seatId === seatId
          ? { ...v, rows: [], err: err instanceof ApiError ? err.message : '학생을 불러오지 못했습니다.' }
          : v,
      )
    }
  }

  /** 교체 상대 — 이 구역에서 자리를 가진 사람(자기 자신 빼고) */
  const swapMates = useMemo(
    () =>
      assignTo?.occupant
        ? seats.filter((s) => s.enrollmentId !== null && s.enrollmentId !== assignTo.occupant!.enrollmentId)
        : [],
    [seats, assignTo?.occupant],
  )

  async function doAssign() {
    if (!assignTo || !assignTo.pick) return
    setAssignTo({ ...assignTo, busy: true, err: null })
    try {
      if (assignTo.occupant) {
        /* ★ **두 건을 한 요청에** 보낸다. 서버가 요청 안의 학생이 쓰던 자리를 먼저 반납하고
           전부-아니면-전무로 처리하므로, 중간에 실패해도 **한쪽만 자리를 잃는 일이 없다.**
           해제 → 배정으로 나눠 부르면 그 사고가 난다(2026-10-16 백엔드 확인). */
        const mate = swapMates.find((m) => String(m.enrollmentId) === assignTo.pick)
        if (!mate) throw new Error('고른 학생의 자리를 찾지 못했습니다.')
        await assignSeatsBulk([
          { seatId: assignTo.seatId, enrollmentId: mate.enrollmentId! },
          { seatId: mate.seatId, enrollmentId: assignTo.occupant.enrollmentId },
        ])
      } else await assignSeat(assignTo.seatId, Number(assignTo.pick))
      setAssignTo(null)
      await loadLayout()
    } catch (err) {
      /* "A01: 이미 2026-0002 학생이 배정돼 있습니다" 처럼 서버 문구가 그대로 쓸 만하다 */
      setAssignTo((v) =>
        v ? { ...v, busy: false, err: err instanceof ApiError ? err.message : '배정하지 못했습니다.' } : v,
      )
    }
  }

  async function toggleUsable() {
    if (!sel) return
    setBusy(true)
    try {
      await setSeatUsable(sel.seatId, sel.state === 'off')
      await loadLayout()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '좌석 상태를 바꾸지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-rr">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 총 좌석
          </div>
          <div className="v">{seats.length}</div>
          <div className="d">{area?.areaNm ?? '구역 없음'}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 배정
          </div>
          <div className="v">{assignedCount}</div>
          <div className="d">사용가능 {usable}석 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="circle-dot" size={13} /> 재실
          </div>
          <div className="v">{count('in')}</div>
          <div className="d up">실시간</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="footprints" size={13} /> 이석
          </div>
          <div className="v">{count('away')}</div>
          <div className="d">좌석 이탈 · 외출 반영</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-x" size={13} /> 미등원
          </div>
          <div className="v">{count('out')}</div>
          <div className="d warn">확인 필요</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 공석
          </div>
          <div className="v">{count('free')}</div>
          <div className="d">사용중지 {count('off')}석 별도</div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <Tabs
        items={[
          { key: 'map', label: '좌석배치표' },
          { key: 'list', label: '배정 명단', count: assignRows.length },
          /* ★ 구역·좌석을 만드는 경로가 없어서 이 화면이 늘 시드에 기대고 있었다 */
          { key: 'setup', label: '구역·좌석 등록' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'map' && (
        <div className="split-3-2">
          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="layout-grid" size={15} />
                </span>
                {area ? `${area.buildingName} ${area.areaNm}` : '독서실'} 배치도
              </div>
              <div className="r">
                {areas.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className={`chip${areaId === a.id ? ' on' : ''}`}
                    onClick={() => {
                      setAreaId(a.id)
                      setSelectedSeatId(null)
                    }}
                  >
                    {/* 관을 빼면 본관 A 와 별관 A 가 화면에서 구분되지 않는다 */}
                    {a.buildingName} {a.areaNm}
                  </button>
                ))}
                {/* ★ 크기 조절(B-8). 「확대·축소」가 아니라 **칸 크기**를 바꾼다 */}
                <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', marginRight: 6 }}>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 9px', fontSize: 11.5 }}
                    disabled={zoom <= 0.6}
                    title="좌석 칸을 작게 — 한 화면에 더 많이 들어갑니다"
                    onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))}
                  >
                    －
                  </button>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)', width: 38, textAlign: 'center' }}>
                    {Math.round(zoom * 100)}%
                  </span>
                  <button
                    type="button"
                    className="btn"
                    style={{ padding: '4px 9px', fontSize: 11.5 }}
                    disabled={zoom >= 1.4}
                    title="좌석 칸을 크게"
                    onClick={() => setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))}
                  >
                    ＋
                  </button>
                </div>
                <PrintButton label="도면 인쇄" />
              </div>
            </div>
            <div className="card-sec-b">
              {seats.length === 0 ? (
                <div className="dt-empty">
                  {loading
                    ? '불러오는 중…'
                    : academyId === null
                      ? '지점을 먼저 선택하세요.'
                      : '좌석 구역이 없습니다.'}
                </div>
              ) : (
                /* ★ `data-print` 가 붙은 영역만 인쇄된다(print.css) — 전에는 사이드바·지표까지
                     **페이지 전체**가 나왔다(B-11, 9/28 에도 같은 요청) */
                <div
                  className="rr-stage"
                  data-print
                  /* 칸·글자를 한꺼번에 줄인다 — 칸만 줄이면 이름이 잘려 누가 앉았는지 안 보인다 */
                  style={
                    {
                      '--seat-w': `${Math.round(62 * zoom)}px`,
                      '--seat-h': `${Math.round(52 * zoom)}px`,
                      '--seat-font': `${(11 * zoom).toFixed(1)}px`,
                    } as CSSProperties
                  }
                >
                  <div className="rr-front">관 리 자 데 스 크 · 출 입 구</div>
                  <div className="rr-map">
                    {/* ★ 가운데에 **가짜 통로**를 넣던 것을 없앴다 — 실제 통로 위치와 무관하게
                           늘 한가운데 들어가서, 통로가 두 개인 구역에서도 하나만 보였다 */}
                    {grid.map((rowCells, ri) => (
                      <div className="rr-row" key={ri}>
                        <span className="rr-rowno">{ri + 1}</span>
                        {rowCells.map((s, ci) =>
                          s === null ? (
                            <span className="rr-gap" key={`g${ci}`} />
                          ) : (
                            <SeatBox key={s.seatId} seat={s} selected={selectedSeatId} onSelect={setSelectedSeatId} />
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rr-legend">
                {(['in', 'out', 'away', 'free', 'off'] as SeatState[]).map((s) => (
                  <span key={s}>
                    <span className="sw" style={{ background: STATE_META[s].color }} /> {STATE_META[s].label}
                  </span>
                ))}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span
                    style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }}
                  />
                  재실
                </span>
              </div>
            </div>
          </div>

          <div className="card-sec">
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="info" size={15} />
                </span>
                좌석 상세
              </div>
              <div className="r">
                <MaskToggle masked={masked} onChange={setMasked} />
              </div>
            </div>
            <div className="card-sec-b">
              {!sel && (
                <div className="mock-stub" style={{ padding: '34px 20px' }}>
                  <div className="t">좌석을 선택하세요</div>
                  <div className="x">배치도에서 좌석을 누르면 배정 학생·재실 상태를 확인하고 해제할 수 있습니다.</div>
                </div>
              )}
              {sel && (
                <>
                  <div className="kv" style={{ marginBottom: 14 }}>
                    <div className="row">
                      <span className="k">좌석번호</span>
                      <span className="v">
                        <b>{sel.seatCd}</b> · {sel.row}행 {sel.col}열
                      </span>
                    </div>
                    {/*
                      데스크가 "단말에서 이 자리가 안 보인다"는 문의를 받는 곳이 이 화면이다.
                      별관은 키오스크에 내려가는 번호가 밀려 있어(1번 → 1001번) 여기 없으면
                      대조하려고 「구역·좌석 등록」 탭까지 옮겨가야 한다.
                    */}
                    <div className="row">
                      <span className="k">키오스크 번호</span>
                      <span className="v">
                        {sel.kioskSeatCd === sel.seatCd ? (
                          <span className="muted">{sel.kioskSeatCd} · 좌석번호와 같음</span>
                        ) : (
                          <b>{sel.kioskSeatCd}</b>
                        )}
                      </span>
                    </div>
                    <div className="row">
                      <span className="k">상태</span>
                      <span className="v">
                        <span
                          className={`mk ${sel.state === 'in' ? 'verified' : sel.state === 'away' ? 'supplement' : 'brandnew'}`}
                        >
                          {STATE_META[sel.state].label}
                        </span>
                      </span>
                    </div>
                    <div className="row">
                      <span className="k">배정 학생</span>
                      <span className="v">
                        {sel.studentName ? `${sel.studentName} (${sel.studentNo ?? '-'})` : '미배정'}
                      </span>
                    </div>
                    <div className="row">
                      <span className="k">반</span>
                      <span className="v">{sel.className ?? '미배정'}</span>
                    </div>
                    {sel.onSeatLeave && (
                      <div className="row">
                        <span className="k">자리 비운 시각</span>
                        <span className="v">{hhmm(sel.seatLeftAt)}</span>
                      </div>
                    )}
                    <div className="row">
                      <span className="k">이석 위치</span>
                      <span className="v">
                        <Unfilled reason="이석 위치 구분값이 아직 정해지지 않았다(I-16)" />
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    {/* ★ 좌석을 골라 **여기서 바로** 앉힌다(C-1·C-2). 전에는 막아 두고
                        「배정 관리 화면에서 하라」고 했는데, **배치도를 보면서 고르는 것**이
                        이 화면의 일이다 — 자리를 보고 와서 다른 화면에서 번호로 찾게 했다 */}
                    {/* ★ 빈 자리는 **배정**, 찬 자리는 **자리 바꾸기**다.
                        교체는 `seats/bulk` 로 **두 건을 한 요청에** 보내 전부-아니면-전무로
                        돈다 — 해제 뒤 배정으로 나누면 중간에 실패했을 때 **원래 학생만
                        자리를 잃는다**(2026-10-16 백엔드 확인) */}
                    <button
                      className="btn pri"
                      disabled={busy}
                      onClick={() =>
                        void openAssign(
                          sel.seatId,
                          sel.seatCd,
                          sel.enrollmentId !== null
                            ? {
                                enrollmentId: sel.enrollmentId,
                                name: sel.studentName ?? '이 학생',
                                seatId: sel.seatId,
                              }
                            : null,
                        )
                      }
                    >
                      <Icon name={sel.enrollmentId === null ? 'user-plus' : 'repeat'} size={14} />{' '}
                      {sel.enrollmentId === null ? '이 자리에 배정' : '자리 바꾸기'}
                    </button>
                    <button
                      className="btn"
                      disabled={sel.enrollmentId === null || busy}
                      onClick={() => void release()}
                    >
                      <Icon name="user-x" size={14} /> 배정 해제
                    </button>
                    <button className="btn" disabled={busy} onClick={() => void toggleUsable()}>
                      <Icon name="shield-off" size={14} /> {sel.state === 'off' ? '사용 재개' : '사용중지'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ★ 구역 목록과 배치도를 **둘 다** 다시 읽는다. 구역만 읽으면 방금 지운 좌석이
          배치도에 그대로 남고, 배치도만 읽으면 새 구역이 칩에 안 뜬다 */}
      {tab === 'setup' && (
        <SeatSetup
          onChanged={() => {
            void reloadAreas()
            void loadLayout()
          }}
        />
      )}

      {tab === 'list' && (
        <DataTable
          columns={ASSIGN_COLUMNS}
          rows={assignRows}
          rowKey={(r) => String(r.seatId)}
          masked={false}
          loading={loading}
          pageSize={15}
          selectable
          selected={picked}
          onSelectedChange={setPicked}
          countLabel={
            <>
              {area?.areaNm ?? '독서실'} 배정 <b>{assignRows.length}</b>명
            </>
          }
          emptyText="배정된 좌석이 없습니다."
          toolbar={
            <>
              <button
                className="btn"
                disabled={busy || picked.length === 0}
                title={picked.length === 0 ? '옮길 학생을 먼저 고르세요' : `${picked.length}명의 자리를 옮깁니다`}
                onClick={() => {
                  setMoveErr(null)
                  // 처음에는 지금 자리 그대로 둔다 — 실수로 전원이 움직이지 않게
                  setMoving(Object.fromEntries(picked.map((k) => [Number(k), Number(k)])))
                }}
              >
                <Icon name="refresh-cw" size={14} /> 좌석 재배치
                {picked.length > 0 && ` ${picked.length}`}
              </button>
              <ExcelButton
                filename={`독서실_${area?.areaNm ?? ''}_배정`}
                columns={ASSIGN_COLUMNS}
                rows={assignRows}
                masked={false}
              />
            </>
          }
        />
      )}

      {moving && (
        <MoveModal
          moving={moving}
          setMoving={setMoving}
          seats={seats}
          freeSeats={freeSeats}
          busy={busy}
          error={moveErr}
          onConfirm={() => void submitMove()}
          onClose={() => setMoving(null)}
        />
      )}

      {assignTo && (
        <Modal
          title={
            assignTo.occupant
              ? `${assignTo.seatCd} — ${assignTo.occupant.name} 학생의 자리를 바꿉니다`
              : `${assignTo.seatCd} 좌석에 배정`
          }
          sub={
            assignTo.occupant
              ? '고른 학생과 자리를 맞바꿉니다. 한쪽만 바뀌는 일은 없습니다.'
              : '좌석이 없는 학생만 나옵니다.'
          }
          confirmLabel={assignTo.occupant ? '자리 바꾸기' : '배정'}
          busy={assignTo.busy}
          confirmDisabled={!assignTo.pick}
          error={assignTo.err}
          onConfirm={() => void doAssign()}
          onClose={() => setAssignTo(null)}
        >
          {assignTo.occupant ? (
            swapMates.length === 0 ? (
              <div className="note-box">
                <div>이 구역에 자리를 가진 다른 학생이 없습니다.</div>
              </div>
            ) : (
              <div className="frow">
                <label className="req">바꿀 상대</label>
                <div>
                  <select
                    className="sel"
                    value={assignTo.pick}
                    onChange={(e) => setAssignTo({ ...assignTo, pick: e.target.value })}
                  >
                    <option value="">학생 선택</option>
                    {swapMates.map((m) => (
                      <option key={m.seatId} value={String(m.enrollmentId)}>
                        {m.seatCd} · {m.studentName ?? '배정됨'}
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    {/* 서버가 같은 구역만 내려주므로 상대도 이 구역 사람이다 */}
                    같은 구역 안에서만 바꿀 수 있습니다.
                  </div>
                </div>
              </div>
            )
          ) : assignTo.rows === null ? (
            <div className="hint">불러오는 중…</div>
          ) : assignTo.rows.length === 0 ? (
            <div className="note-box">
              <div>좌석이 없는 학생이 없습니다. 이미 모두 자리가 있습니다.</div>
            </div>
          ) : (
            <>
              {/* ★ 이름으로 좁힌다 — 200명 목록에서 고르게 하면 **못 찾는다** */}
              <div className="frow">
                <label>학생 찾기</label>
                <input
                  className="inp"
                  value={assignTo.keyword}
                  placeholder="이름 또는 학번"
                  onChange={(e) => setAssignTo({ ...assignTo, keyword: e.target.value })}
                />
              </div>
              <div className="frow">
                <label className="req">배정할 학생</label>
                <div>
                  <select
                    className="sel"
                    value={assignTo.pick}
                    onChange={(e) => setAssignTo({ ...assignTo, pick: e.target.value })}
                  >
                    <option value="">학생 선택</option>
                    {assignTo.rows
                      .filter((r) => {
                        const k = assignTo.keyword.trim()
                        if (!k) return true
                        return (r.name ?? '').includes(k) || String(r.studentNo ?? '').includes(k)
                      })
                      .map((r) => (
                        <option key={r.enrollmentId} value={String(r.enrollmentId)}>
                          {r.name} · {studentNoText(r.studentNo)}
                          {r.className ? ` · ${r.className}` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}

/**
 * 좌석 재배치 모달.
 *
 * ★ 한 자리에 두 명을 고를 수 있다 — 서버도 막지만(전체 취소) **저장을 눌러 보고서야
 *   알면 늦다.** 고르는 동안 화면에서 먼저 짚어준다.
 */
function MoveModal({
  moving,
  setMoving,
  seats,
  freeSeats,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  moving: Record<number, number>
  setMoving: (v: Record<number, number>) => void
  seats: Seat[]
  freeSeats: Seat[]
  busy: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const entries = Object.entries(moving).map(([from, to]) => ({ from: Number(from), to }))
  const changed = entries.filter((e) => e.from !== e.to)
  const targets = entries.map((e) => e.to)
  const dup = targets.filter((t, i) => targets.indexOf(t) !== i)

  return (
    <Modal
      wide
      title={`${entries.length}명의 자리를 옮깁니다`}
      sub="옮기면 원래 자리는 비워집니다. 하나라도 안 되면 전부 취소됩니다."
      confirmLabel={`${changed.length}명 옮기기`}
      busy={busy}
      confirmDisabled={changed.length === 0 || dup.length > 0}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map(({ from, to }) => {
          const row = seats.find((s) => s.seatId === from)
          const conflict = dup.includes(to)
          return (
            <div key={from} className="frow">
              <label>
                {row?.studentName ?? '-'}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}> {row?.seatCd}</span>
              </label>
              <div>
                <select
                  className="sel"
                  style={{ width: 190, borderColor: conflict ? 'var(--red)' : undefined }}
                  value={to}
                  onChange={(e) => setMoving({ ...moving, [from]: Number(e.target.value) })}
                >
                  <option value={from}>{row?.seatCd} (그대로)</option>
                  {freeSeats.map((f) => (
                    <option key={f.seatId} value={f.seatId}>
                      {f.seatCd}
                    </option>
                  ))}
                </select>
                {conflict && <div className="hint" style={{ color: 'var(--red)' }}>같은 자리를 두 명이 골랐습니다.</div>}
              </div>
            </div>
          )
        })}
      </div>

      {freeSeats.length === 0 && (
        <div className="note-box" style={{ marginTop: 10 }}>
          <div>이 구역에 빈 자리가 없습니다. 먼저 배정을 해제하거나 다른 구역을 쓰세요.</div>
        </div>
      )}
    </Modal>
  )
}

function SeatBox({
  seat,
  selected,
  onSelect,
}: {
  seat: Seat
  selected: number | null
  onSelect: (id: number) => void
}) {
  const name = seat.state === 'off' ? '사용중지' : (seat.studentName ?? '공석')
  return (
    <button
      type="button"
      className={`rr-seat st-${seat.state}${selected === seat.seatId ? ' sel' : ''}`}
      onClick={() => onSelect(seat.seatId)}
      title={`${seat.seatCd} · ${STATE_META[seat.state].label}${seat.studentName ? ` · ${seat.studentName}${seat.studentNo ? ` (${seat.studentNo})` : ''}` : ''}`}
    >
      {seat.state === 'in' && <span className="live" />}
      <span className="sc">{seat.seatCd}</span>
      <span className="sn">{name}</span>
      {/* ★ 배치도에서 학번이 보여야 성적·수납 화면과 눈으로 맞출 수 있다(디랩 5-6) */}
      {seat.studentNo && <span className="sno">{seat.studentNo}</span>}
    </button>
  )
}

export const readingRoomMockup: Mockup = {
  Content,
}
