import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, MaskToggle, Modal, todayStr, useMaskDefault, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  clearPatrolRound,
  listPatrolAreas,
  listPatrolMarks,
  listPatrolSeats,
  listPatrols,
  savePatrol,
  type PatrolArea,
  type PatrolMarkDef,
  type PatrolRecord,
  type PatrolSeat as SrvSeat,
} from '../../api/patrols'
import type { Mockup } from './types'
import './reading-room.css'

/* 순찰 관리 (0928 피드백 1-3) — /api/v1/admin/patrols
 *
 * > "현재 순찰 관리는 학생 정보를 **종이에 프린트하여 아날로그로 체크**하는 중입니다.
 *    체크 후 다시 DSA에 순찰내용을 입력해야 하기에 **2번 작업**을 해야 하는 상황입니다.
 *    새 관리 프로그램에 순찰 관리 페이지를 추가하여 **태블릿에 띄워 즉시 좌석 상태를
 *    입력**할 수 있도록" (29쪽)
 *
 * ★ 기록은 **학생(`enrollmentId`)에 붙는다.** 좌석은 재배치되는데 순찰은 「그때 그 학생」의
 *   상태다 — 좌석으로만 남기면 재배치 뒤 기록이 엉뚱한 사람에게 붙는다. `seatCd` 는
 *   그때 어디 앉아 있었는지를 함께 남기는 값이고 비워도 된다.
 *
 * ★ **모아서 한 번에 저장한다.** 한 건씩 보내면 **느린 태블릿에서 누른 것이 빠진 채
 *   넘어간다.** 응답이 저장된 전체를 돌려주므로 그 값으로 화면을 맞춘다 — 빠진 것이
 *   바로 드러난다.
 *
 * ★ **상태 문구를 화면에 박지 않는다**(`/patrols/marks`). 상태가 늘거나 이름이 바뀌어도
 *   화면을 안 고친다. 못 받았을 때만 아래 기본값으로 그린다.
 *
 * ★ **태블릿에서 쓴다.** 팔레트에서 상태를 먼저 고르고 좌석을 누르면 바로 기록된다 —
 *   좌석마다 모달을 열면 종이보다 느려진다.
 *
 * ★ **회차(1~5)를 나눠 기록한다.** 같은 좌석이 1회차에 '졸음', 3회차에 '화장실' 일 수
 *   있어 회차마다 따로 본다 — 한 벌로 합치면 마지막 순찰만 남는다.
 *
 * ★ 좌석배치표(F-C-4)와 다른 화면이다. 그쪽은 **지금 상태를 본다**(출결·이탈을 서버가
 *   합쳐 준다). 이쪽은 **사람이 눈으로 보고 남긴다** — 출처가 달라 축이 다르다.
 */

/* 색은 **묶어서** 준다 — 흩어져 있으면 「강의실과 교과실이 같은 초록인데 떨어져 있다」로
 * 읽힌다. 묶는 기준은 **그 자리에서 할 일**이다.
 *   · 주의       자리에 있는데 깨워야 한다
 *   · 원내 사유   자리에 없지만 어디 있는지 알고, 돌아온다
 *   · 잠시 비움   곧 돌아온다 — 다음 회차에 확인하면 된다
 *   · 원 밖      오늘 그 자리에 없다 — 찾을 일이 아니다
 */
const MARK_GROUPS = [
  { key: 'OK', label: '정상', color: 'var(--mint)' },
  { key: 'WARN', label: '주의', color: 'var(--amber)' },
  { key: 'INSIDE', label: '원내 · 사유 있음', color: 'var(--mint-d)' },
  { key: 'BRIEF', label: '잠시 비움', color: 'var(--blue)' },
  { key: 'OUTSIDE', label: '원 밖', color: 'var(--muted)' },
] as const

/** 서버 코드 → 묶음. 서버가 `group` 을 주면 **그쪽이 이긴다** */
const CODE_GROUP: Record<string, string> = {
  NONE: 'OK',
  SLEEP: 'WARN',
  CLASSROOM: 'INSIDE',
  SUBJECT_ROOM: 'INSIDE',
  QNA: 'INSIDE',
  CONSULT: 'INSIDE',
  TOILET: 'BRIEF',
  COMMON: 'BRIEF',
  OUTING: 'OUTSIDE',
  EARLY_LEAVE: 'OUTSIDE',
}

/** 상태 목록을 못 받았을 때만 쓴다. 요구사항 29쪽의 9종(기본 제외) */
const FALLBACK_MARKS: PatrolMarkDef[] = [
  { code: 'SLEEP', label: '졸음', away: false },
  { code: 'CLASSROOM', label: '강의실', away: true },
  { code: 'SUBJECT_ROOM', label: '교과실', away: true },
  { code: 'QNA', label: '질답', away: true },
  { code: 'CONSULT', label: '상담', away: true },
  { code: 'TOILET', label: '화장실', away: true },
  { code: 'COMMON', label: '공용공간', away: true },
  { code: 'OUTING', label: '외출', away: true },
  { code: 'EARLY_LEAVE', label: '조퇴', away: true },
]

const ROUNDS = [1, 2, 3, 4, 5] as const

interface Seat extends SrvSeat {
  row: number
  col: number
}

function Content() {
  const { academyId } = useAcademy()
  const [masked, setMasked] = useState(useMaskDefault())
  const [tab, setTab] = useState('map')
  const [date] = useState(() => todayStr())

  const [areas, setAreas] = useState<PatrolArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [cells, setCells] = useState<SrvSeat[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [defs, setDefs] = useState<PatrolMarkDef[]>(FALLBACK_MARKS)
  const [round, setRound] = useState<number>(1)
  const [pick, setPick] = useState<string>('SLEEP')
  /** 학생 → 상태 코드. **좌석이 아니라 학생에 붙는다**(서버와 같은 축) */
  const [marks, setMarks] = useState<Record<number, string>>({})
  /** 서버가 준 그 회차의 기록 원본. **구역 전체**일 때는 좌석이 없어 이걸로 목록을 만든다 */
  const [records, setRecords] = useState<PatrolRecord[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [askClear, setAskClear] = useState(false)

  const groupOf = useCallback(
    (code: string) => {
      const fromServer = defs.find((d) => d.code === code)?.group
      if (fromServer) return fromServer.toUpperCase()
      /* ★ 폴백을 **말없이** 쓰지 않는다. 서버가 묶음을 바꾸면 화면 표만 옛날 값으로 남아
         색이 조용히 갈라진다 — 「색이 왜 다르지」를 그때 추적할 수 있어야 한다 */
      if (import.meta.env.DEV) console.warn(`[순찰] 서버가 '${code}' 의 묶음을 주지 않아 화면 기본값을 씁니다`)
      return CODE_GROUP[code] ?? 'INSIDE'
    },
    [defs],
  )
  const colorOf = useCallback(
    (code: string) => MARK_GROUPS.find((g) => g.key === groupOf(code))?.color ?? 'var(--line)',
    [groupOf],
  )
  const labelOf = useCallback((code: string) => defs.find((d) => d.code === code)?.label ?? code, [defs])

  /* 상태 목록은 바뀌는 값이 아니라 한 번만 읽는다. 못 받으면 기본값으로 계속 쓴다 —
     순찰 자체는 돌 수 있어야 한다 */
  useEffect(() => {
    let alive = true
    listPatrolMarks()
      .then((list) => {
        if (alive && list.length > 0) setDefs(list)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const reloadAreas = useCallback(async () => {
    if (academyId === null) return
    try {
      const list = await listPatrolAreas(academyId)
      setAreas(list)
      /* 첫 구역을 자동으로 고른다 — 평소 순찰은 구역을 돌며 한다. `null` 은 「구역 전체」다 */
      setAreaId((prev) => (prev !== null && list.some((a) => a.id === prev) ? prev : (list[0]?.id ?? null)))
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
      /* ★ **순찰 전용 조회다.** 좌석 화면(`/seats/*`)은 담임에게 닫혀 있다 —
         거기로 부르면 담임은 좌석표가 통째로 비어 보인다 */
      setCells(await listPatrolSeats(areaId))
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

  /**
   * 그 회차에 이미 저장된 기록을 읽어 화면을 맞춘다.
   *
   * ★ 회차를 옮길 때마다 **서버에서 다시 읽는다.** 화면에만 들고 있으면 **다른 사람이 돈
   *   회차가 안 보여**, 같은 회차를 둘이 따로 저장하면 뒤가 앞을 통째로 덮는다.
   */
  const loadRound = useCallback(async () => {
    if (academyId === null) return
    try {
      const rows = await listPatrols({ academyId, date, round, studyAreaId: areaId ?? undefined })
      const next: Record<number, string> = {}
      for (const r of rows) next[r.enrollmentId] = r.mark
      setMarks(next)
      setRecords(rows)
      setDirty(false)
    } catch (err) {
      /* 서버가 아직 없으면(404) 조용히 빈 채로 둔다 — 그래도 순찰은 돌 수 있어야 한다 */
      if (err instanceof ApiError && err.status !== 404) setError(err.message)
      setMarks({})
      setRecords([])
      setDirty(false)
    }
  }, [academyId, date, round, areaId])

  useEffect(() => {
    void loadRound()
  }, [loadRound])

  /** 서버가 이름을 가려 보냈는가 — 그러면 화면에서 풀 수 없다 */
  const serverMasked = cells.some((c) => c.masked)

  const seats = useMemo<Seat[]>(() => cells.map((c) => ({ ...c, row: c.yPos ?? 1, col: c.xPos ?? 1 })), [cells])

  const markOf = (enrollmentId: number | null): string | null =>
    enrollmentId === null ? null : (marks[enrollmentId] ?? null)

  function tap(enrollmentId: number | null) {
    if (enrollmentId === null) return
    setMarks((prev) => {
      const next = { ...prev }
      /* 같은 상태를 다시 누르면 지운다 — 잘못 눌렀을 때 되돌릴 길이 있어야 한다 */
      if (next[enrollmentId] === pick) delete next[enrollmentId]
      else next[enrollmentId] = pick
      return next
    })
    setDirty(true)
    setNote(null)
  }

  /**
   * 그 회차를 통째로 저장한다.
   *
   * ★ **보낸 목록이 그 회차의 전부**다(덮어쓰기). 화면에서 지운 것은 빼고 보내면 된다.
   * ★ 응답으로 화면을 다시 맞춘다 — 빠진 것이 있으면 여기서 드러난다.
   */
  async function save() {
    if (academyId === null) return
    setSaving(true)
    setError(null)
    try {
      const seatOf = new Map(seats.map((s) => [s.enrollmentId, s.seatCd] as const))
      const sent = await savePatrol({
        academyId,
        date,
        round,
        marks: Object.entries(marks).map(([id, mark]) => ({
          enrollmentId: Number(id),
          seatCd: seatOf.get(Number(id)) ?? null,
          mark,
        })),
      })
      /* ★ 응답은 **보낸 것만** 돌려준다. 그걸로 화면을 덮으면 **앱에서 찍은 것이 사라져
         보인다** — 순찰은 앱에도 같은 화면이 있어 같은 회차를 나눠 찍는다. 다시 읽는다 */
      await loadRound()
      setNote(`${round}회차 ${sent.length}건을 저장했습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  /**
   * 그 회차를 비운다.
   *
   * ★ **빈 목록 저장으로 비우지 않는다.** 그러면 목록을 만드는 쪽의 실수 하나가 회차를
   *   조용히 날린다 — 한 시간 돌며 찍은 것이 사라진다. 지우는 것은 지우겠다고 말해야 한다.
   */
  async function clearRound() {
    if (academyId === null) return
    setClearing(true)
    setError(null)
    try {
      const { cleared } = await clearPatrolRound(round, { academyId, date })
      setMarks({})
      setRecords([])
      setDirty(false)
      setAskClear(false)
      setNote(`${round}회차 ${cleared}건을 비웠습니다. 다시 기록할 수 있습니다.`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '비우지 못했습니다.')
    } finally {
      setClearing(false)
    }
  }

  const maxRow = seats.reduce((a, s) => Math.max(a, s.row), 0)
  const maxCol = seats.reduce((a, s) => Math.max(a, s.col), 0)
  /* ★ **좌표 그대로 찍는다**(1016 피드백 B-5·B-6, 좌석배치표와 같은 수정). 촘촘히 흘려
     그리면 통로·기둥이 사라져 **순찰 중에 실제 자리와 다른 그림**을 보게 된다 */
  const grid = useMemo(() => {
    const at = new Map<string, Seat>()
    for (const s of seats) at.set(`${s.row}:${s.col}`, s)
    return Array.from({ length: maxRow }, (_, r) =>
      Array.from({ length: maxCol }, (_, c) => at.get(`${r + 1}:${c + 1}`) ?? null),
    )
  }, [seats, maxRow, maxCol])

  /* ★ 화면에서 지운 것은 **저장으로 사라지지 않는다** — 서버가 학생 단위로만 덮어쓴다.
     말 안 해주면 담당자는 지워진 줄 알고 넘어가고, 새로고침하면 되살아난다 */
  const removed = records.filter((r) => marks[r.enrollmentId] === undefined).length

  const seated = seats.filter((s) => s.enrollmentId !== null).length
  const checked = Object.keys(marks).length
  /* ★ 「자리 비움」은 서버가 주는 `away` 로 센다. 코드를 화면에서 나열하면 상태가 늘 때
     조용히 틀린다 — **졸음은 자리에 있는 것**이라 특히 섞이면 안 된다 */
  const awayCount = Object.values(marks).filter((m) => defs.find((d) => d.code === m)?.away).length

  /* ★ 구역을 골랐으면 **좌석표 그대로**(아직 안 찍은 학생도 보여야 순찰이 된다).
     구역 전체면 좌석이 없으므로 **서버 기록으로** 만든다 — 좌석 없이 찍힌 건을 보는 자리다 */
  const listRows = useMemo(() => {
    if (areaId === null) {
      return records
        .map((r) => ({
          seatId: r.enrollmentId,
          enrollmentId: r.enrollmentId,
          seatCd: r.seatCd ?? '-',
          studentNo: r.studentNo,
          studentName: r.studentName,
          mark: r.mark as string | null,
        }))
        .sort((a, b) => a.seatCd.localeCompare(b.seatCd))
    }
    return seats
      .filter((s) => s.enrollmentId !== null)
      .sort((a, b) => a.seatCd.localeCompare(b.seatCd))
      .map((s) => ({
        seatId: s.seatId,
        enrollmentId: s.enrollmentId,
        seatCd: s.seatCd,
        studentNo: s.studentNo,
        studentName: s.studentName,
        mark: markOf(s.enrollmentId),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId, records, seats, marks])

  const listColumns: Column<(typeof listRows)[number]>[] = useMemo(
    () => [
      { key: 'seatCd', header: '좌석', width: '80px', align: 'center', sortable: true, value: (r) => r.seatCd },
      { key: 'studentNo', header: '학번', width: '110px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '100px', mask: 'name', value: (r) => r.studentName ?? '-' },
      /* ★ 반은 **순찰 전용 조회에 안 온다**(배정 관리에 쓰는 값이라 서버가 뺐다).
         `<Unfilled/>` 로 두지 않는다 — 그건 「서버에 요청할 것」이라는 뜻인데, 이건
         **요청하면 안 되는 값**이다. 순찰에 필요한 것은 좌석과 사람뿐이다 */
      {
        key: 'mark',
        header: `${round}회차`,
        width: '130px',
        align: 'center',
        value: (r) => (r.mark ? labelOf(r.mark) : ''),
        /* ★ 목록에서도 바로 기록한다 — 좌표가 없는 구역에서도 순찰이 돌아야 한다 */
        render: (r) => (
          <button
            className={`btn${r.mark ? ' pri' : ''}`}
            style={{ padding: '3px 9px', fontSize: 11.5 }}
            onClick={() => tap(r.enrollmentId)}
            title={`누르면 「${labelOf(pick)}」으로 기록합니다`}
          >
            {r.mark ? labelOf(r.mark) : '기록'}
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, pick, marks, defs],
  )

  return (
    <div className="p-rr">
      <div className="note-box">
        <div>
          좌석을 눌러 상태를 기록합니다. 회차마다 따로 남고, <b>저장을 눌러야 서버에 반영됩니다.</b> 자리를 옮긴
          학생은 저장할 때의 좌석으로 기록됩니다.
        </div>
      </div>

      {note && (
        <div className="note-box" role="status">
          <div>{note}</div>
        </div>
      )}
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="stat-strip c4" style={{ marginTop: 10 }}>
        <div className="stat">
          <div className="l">
            <Icon name="route" size={13} /> 순찰 회차
          </div>
          <div className="v">{round}회차</div>
          <div className="d">{date} · 하루 최대 5회</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 배정 좌석
          </div>
          <div className="v">{areaId === null ? '-' : seated}</div>
          <div className="d">{areaId === null ? '구역을 고르면 보입니다' : '이 구역'}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 이번 회차 기록
          </div>
          <div className="v">{checked}</div>
          <div className="d">{dirty ? '저장 전' : '저장됨'}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-x" size={13} /> 자리 비움
          </div>
          <div className="v">{awayCount}</div>
          <div className="d">자리에 없는 상태</div>
        </div>
      </div>

      <div className="card-sec" style={{ marginTop: 12 }}>
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="footprints" size={15} />
            </span>
            순찰 체크
          </div>
          <div className="r" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              className="sel"
              style={{ width: 150 }}
              value={areaId ?? ''}
              onChange={(e) => setAreaId(e.target.value === '' ? null : Number(e.target.value))}
            >
              {/* ★ 전체는 확인용이 아니다. **학생 목록 탭에서 찍으면 좌석이 비는데**(설계상)
                  그 기록은 어느 구역 조회에도 안 걸린다 — 그걸 보려면 전체여야 한다 */}
              <option value="">구역 전체</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {/* 관을 빼면 본관 A 와 별관 A 가 화면에서 구분되지 않는다 */}
                  {a.buildingName} {a.areaNm}
                </option>
              ))}
            </select>
            {/* ★ 순찰 전용 좌석 조회는 **서버가 이미 가려서 준다**(푸는 파라미터가 없다).
                   토글을 살려 두면 **눌러도 아무 일이 없어** 고장으로 읽힌다.
                ★ 좌석배치표는 원본이 보이는데 **여기만 가려지는 이유**: 그쪽은 「누구에게 어느
                   좌석을 줄 것인가」라 배정 대상을 고르려면 원본이 필요하고, 순찰은 「지금 이
                   자리가 어떤 상태인가」라 **좌석번호를 보고 찍는 일**이다. 역할로 가르지도
                   않는다 — 그러면 「본사가 볼 때만 이름이 뜨는」 화면이 되어 더 헷갈린다.
                ★ 그래서 **갈 곳을 함께 알려준다**(원본은 좌석배치표에서). 그 한 줄이 없으면
                   「왜 여기만 가려지지」가 남는다 */}
            <MaskToggle
              masked={masked}
              onChange={setMasked}
              disabled={serverMasked}
              disabledReason="순찰은 좌석 기준이라 이름을 가립니다. 원본은 좌석배치표에서 보세요"
            />
            {/* ★ 앱에도 같은 순찰 화면이 있어 같은 회차를 나눠 찍는다 — 저쪽에서 찍은 것은
                다시 읽어야 보인다. 안 그러면 「왜 안 보이지」로 두 번 찍게 된다 */}
            <button
              className="btn"
              disabled={loading || saving || clearing}
              onClick={() => {
                setNote(null)
                void loadRound()
              }}
              title={dirty ? '저장하지 않은 기록은 사라집니다' : undefined}
            >
              다시 읽기
            </button>
            {/* 비우기는 저장된 것이 있을 때만 의미가 있다 — 화면에만 있는 것은 회차를 옮기면 사라진다 */}
            <button
              className="btn"
              disabled={clearing || checked === 0}
              onClick={() => setAskClear(true)}
              title={checked === 0 ? '이 회차에 기록이 없습니다' : undefined}
            >
              회차 비우기
            </button>
            {/* ★ 빈 목록은 보내지 않는다 — 서버가 400 으로 막는다(빈 배열을 '비움'으로 읽지
                않기로 한 것과 같은 이유). 전부 지웠으면 **「회차 비우기」가 갈 길**이라고 말해 준다 */}
            <button
              className="btn pri"
              disabled={saving || !dirty || checked === 0}
              onClick={() => void save()}
              title={dirty && checked === 0 ? '모두 지우려면 「회차 비우기」를 쓰세요' : undefined}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>

        <div className="card-sec-b">
          <div className="frow">
            <label>회차</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {ROUNDS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`chip${round === r ? ' on' : ''}`}
                  onClick={() => setRound(r)}
                >
                  {r}회차
                </button>
              ))}
              {/* ★ 회차를 옮기면 서버에서 다시 읽는다 — 저장 안 한 것은 그때 사라진다 */}
              {dirty && checked > 0 && removed === 0 && (
                <span className="mk brandnew">저장하지 않은 기록이 있습니다</span>
              )}
              {removed > 0 && (
                <span className="mk brandnew">
                  지운 {removed}건은 저장해도 남습니다 — 「회차 비우기」로 비우고 다시 기록하세요
                </span>
              )}
            </div>
          </div>

          <div className="frow">
            <label>기록할 상태</label>
            <div style={{ display: 'grid', gap: 6 }}>
              {MARK_GROUPS.map((g) => {
                const items = defs.filter((d) => groupOf(d.code) === g.key)
                if (items.length === 0) return null
                return (
                  <div key={g.key} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {/* 묶음 이름을 적어 색이 무엇을 뜻하는지 말한다 */}
                    <span style={{ fontSize: 11, fontWeight: 700, color: g.color, width: 86, flexShrink: 0 }}>
                      {g.label}
                    </span>
                    {items.map((m) => (
                      <button
                        key={m.code}
                        type="button"
                        className={`chip${pick === m.code ? ' on' : ''}`}
                        onClick={() => setPick(m.code)}
                      >
                        <span
                          style={{
                            display: 'inline-block',
                            width: 10,
                            height: 10,
                            borderRadius: 3,
                            background: g.color,
                            marginRight: 5,
                            verticalAlign: -1,
                          }}
                        />
                        {m.label}
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>

          <Tabs
            items={[
              { key: 'map', label: '좌석표' },
              { key: 'list', label: '학생 목록', count: listRows.length },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'map' && (
            <div style={{ paddingTop: 12 }}>
              {loading && <div style={{ color: 'var(--muted)', fontSize: 13 }}>불러오는 중…</div>}
              {!loading && seats.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                  {areaId === null
                    ? '구역을 고르면 좌석표가 보입니다. 지금은 학생 목록 탭에서 기록할 수 있습니다.'
                    : '이 지점에 등록된 좌석 구역이 없습니다.'}
                </div>
              )}
              {!loading && seats.length > 0 && (
                <div className="rr-stage">
                  <div className="rr-front">관리자 데스크 · 출입구</div>
                  <div className="rr-map">
                    {grid.map((rowCells, ri) => (
                      <div className="rr-row" key={ri}>
                        <span className="rr-rowno">{ri + 1}</span>
                        {rowCells.map((s, ci) =>
                          s === null ? (
                            <span className="rr-gap" key={`g${ci}`} />
                          ) : (
                            <PatrolSeat
                              key={s.seatId}
                              seat={s}
                              mark={markOf(s.enrollmentId)}
                              label={labelOf}
                              color={colorOf}
                              onTap={tap}
                            />
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rr-legend" style={{ marginTop: 12 }}>
                {MARK_GROUPS.map((g) => {
                  const items = defs.filter((d) => groupOf(d.code) === g.key)
                  if (items.length === 0) return null
                  return (
                    <span key={g.key}>
                      <span className="sw" style={{ background: g.color }} />
                      {g.label} — {items.map((m) => m.label).join(' · ')}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'list' && (
            <div style={{ paddingTop: 12 }}>
              <DataTable
                rows={listRows}
                columns={listColumns}
                rowKey={(r) => String(r.seatId)}
                masked={masked}
                loading={loading}
                pageSize={20}
                emptyText="배정된 학생이 없습니다."
              />
            </div>
          )}
        </div>
      </div>

      {askClear && (
        <Modal
          title={`${round}회차를 비웁니다`}
          sub="이 회차에 저장된 기록이 지워집니다"
          confirmLabel="비우기"
          danger
          busy={clearing}
          onConfirm={() => void clearRound()}
          onClose={() => setAskClear(false)}
        >
          <div className="note-box">
            <div>
              비운 뒤 <b>같은 회차를 다시 기록할 수 있습니다.</b> 다른 회차는 그대로 남습니다.
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

/** 좌석 한 칸. 누르면 고른 상태가 바로 기록된다 */
function PatrolSeat({
  seat,
  mark,
  label,
  color,
  onTap,
}: {
  seat: Seat
  mark: string | null
  label: (code: string) => string
  color: (code: string) => string
  onTap: (enrollmentId: number | null) => void
}) {
  const empty = seat.enrollmentId === null
  const c = mark ? color(mark) : null
  return (
    <button
      type="button"
      className="rr-seat"
      onClick={() => onTap(seat.enrollmentId)}
      disabled={empty}
      title={empty ? '배정된 학생이 없습니다' : `${seat.seatCd} · ${seat.studentName ?? ''}`}
      style={c ? { borderColor: c, boxShadow: `inset 0 0 0 2px ${c}` } : undefined}
    >
      <span className="sc">{seat.seatCd}</span>
      <span className="sn">{empty ? '공석' : (seat.studentName ?? '-')}</span>
      {mark && (
        <span className="sno" style={{ color: c ?? undefined, fontWeight: 800 }}>
          {label(mark)}
        </span>
      )}
    </button>
  )
}

export const patrolMockup: Mockup = { Content }
