import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, MaskToggle, MockNotice, useMaskDefault, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { getSeatLayout, listSeatAreas, type SeatArea, type SeatCell } from '../../api/facility'
import type { Mockup } from './types'
import './reading-room.css'

/* 순찰 관리 (0928 피드백 1-3) — 신규 기능
 *
 * > "현재 순찰 관리는 학생 정보를 **종이에 프린트하여 아날로그로 체크**하는 중입니다.
 *    체크 후 다시 DSA에 순찰내용을 입력해야 하기에 **2번 작업**을 해야 하는 상황입니다.
 *    새 관리 프로그램에 순찰 관리 페이지를 추가하여 **태블릿에 띄워 즉시 좌석 상태를
 *    입력**할 수 있도록" (29쪽)
 *
 * ★ **좌석 배치는 실제 서버 값이다**(`/seats/layout`). 순찰 기록만 아직 서버에 없다 —
 *   앱 코드에 `GET /patrols/zones/{zoneId}/students`·`POST /patrols` 호출이 있는데
 *   서버에는 그 경로가 없다. 그래서 **배치는 진짜, 체크는 화면 안에만** 남는다.
 *   저장 경로가 생기면 `marks` 를 그대로 보내면 된다.
 *
 * ★ **태블릿에서 쓴다.** 한 손으로 좌석을 눌러 상태를 바꾸는 것이 이 화면의 전부다 —
 *   좌석을 누르면 모달이 뜨는 대신 **고른 상태가 바로 찍힌다**(팔레트에서 먼저 고른다).
 *   순찰 중에 모달을 여닫게 하면 종이보다 느려진다.
 *
 * ★ **회차를 나눠 기록한다**(1~5). 같은 좌석이라도 1회차에 '졸음', 3회차에 '화장실' 일 수
 *   있어 회차마다 따로 들고 있다 — 한 벌로 합치면 마지막 순찰만 남는다.
 *
 * ★ 좌석배치표(F-C-4)와 다른 화면이다. 그쪽은 **지금 상태를 본다**(출결·이탈을 서버가
 *   합쳐 준다). 이쪽은 **사감이 눈으로 보고 찍는다** — 출처가 사람이라 축이 다르다.
 */

/** 요구사항 29쪽의 상태 10종 그대로 */
const MARKS = [
  { key: 'none', label: '기본', color: 'var(--line)' },
  { key: 'sleep', label: '졸음', color: 'var(--amber)' },
  { key: 'out', label: '외출', color: 'var(--blue)' },
  { key: 'early', label: '조퇴', color: 'var(--muted)' },
  { key: 'class', label: '강의실', color: 'var(--mint-d)' },
  { key: 'toilet', label: '화장실', color: 'var(--blue)' },
  { key: 'common', label: '공용공간', color: 'var(--blue)' },
  { key: 'subject', label: '교과실', color: 'var(--mint-d)' },
  { key: 'qna', label: '질답', color: 'var(--purple, #6C5CE0)' },
  { key: 'consult', label: '상담', color: 'var(--purple, #6C5CE0)' },
] as const

type MarkKey = (typeof MARKS)[number]['key']

const MARK_LABEL: Record<string, string> = Object.fromEntries(MARKS.map((m) => [m.key, m.label]))

const ROUNDS = [1, 2, 3, 4, 5] as const

interface Seat extends SeatCell {
  row: number
  col: number
}

function Content() {
  const { academyId } = useAcademy()
  const [masked, setMasked] = useState(useMaskDefault())
  const [tab, setTab] = useState('map')
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [cells, setCells] = useState<SeatCell[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [round, setRound] = useState<number>(1)
  const [pick, setPick] = useState<MarkKey>('sleep')
  /** 회차 → (좌석id → 상태). 회차마다 따로 들고 있다 */
  const [marks, setMarks] = useState<Record<number, Record<number, MarkKey>>>({})

  const reloadAreas = useCallback(async () => {
    if (academyId === null) return
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

  /* ★ 구역을 바꾸면 좌석이 통째로 바뀐다. 체크를 그대로 두면 **다른 구역에서 찍은 것이
       남아** 숫자가 섞인다(좌석배치표에서 선택을 비우는 것과 같은 이유) */
  useEffect(() => {
    setMarks({})
  }, [areaId])

  const seats = useMemo<Seat[]>(
    () => cells.map((c) => ({ ...c, row: c.yPos ?? 1, col: c.xPos ?? 1 })),
    [cells],
  )

  const current = marks[round] ?? {}
  const markOf = (seatId: number): MarkKey => current[seatId] ?? 'none'

  function tapSeat(seatId: number) {
    setMarks((prev) => {
      const cur = prev[round] ?? {}
      /* 같은 상태를 다시 누르면 지운다 — 잘못 찍었을 때 되돌릴 길이 있어야 한다 */
      const next = { ...cur }
      if (next[seatId] === pick) delete next[seatId]
      else next[seatId] = pick
      return { ...prev, [round]: next }
    })
  }

  const maxRow = seats.reduce((a, s) => Math.max(a, s.row), 0)
  const maxCol = seats.reduce((a, s) => Math.max(a, s.col), 0)
  const half = Math.ceil(maxCol / 2)
  const rows = useMemo(
    () => Array.from({ length: maxRow }, (_, i) => seats.filter((s) => s.row === i + 1).sort((a, b) => a.col - b.col)),
    [seats, maxRow],
  )

  const checked = Object.keys(current).length
  const seated = seats.filter((s) => s.enrollmentId !== null).length

  const listRows = useMemo(
    () =>
      seats
        .filter((s) => s.enrollmentId !== null)
        .sort((a, b) => a.seatCd.localeCompare(b.seatCd))
        .map((s) => ({ ...s, mark: markOf(s.seatId) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seats, current],
  )

  const listColumns: Column<(typeof listRows)[number]>[] = useMemo(
    () => [
      { key: 'seatCd', header: '좌석', width: '80px', align: 'center', sortable: true, value: (r) => r.seatCd },
      { key: 'studentNo', header: '학번', width: '110px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '100px', mask: 'name', value: (r) => r.studentName ?? '-' },
      { key: 'className', header: '반', width: '90px', align: 'center', value: (r) => r.className ?? '-' },
      {
        key: 'mark',
        header: `${round}회차`,
        width: '130px',
        align: 'center',
        value: (r) => (r.mark === 'none' ? '' : MARK_LABEL[r.mark]),
        /* ★ 목록에서도 바로 찍는다 — 좌석표가 안 보이는 구역(좌표 미등록)에서도 순찰이 돌아야 한다 */
        render: (r) => (
          <button
            className={`btn${r.mark === 'none' ? '' : ' pri'}`}
            style={{ padding: '3px 9px', fontSize: 11.5 }}
            onClick={() => tapSeat(r.seatId)}
            title={`누르면 「${MARK_LABEL[pick]}」으로 찍습니다`}
          >
            {r.mark === 'none' ? '찍기' : MARK_LABEL[r.mark]}
          </button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [round, pick, current],
  )

  return (
    <div className="p-rr">
      <MockNotice reason="순찰 기록을 저장할 서버 경로가 없다 — 앱에 /patrols 호출만 있고 서버에 그 API 가 없다" />

      <div className="note-box">
        <div>
          좌석을 눌러 상태를 찍습니다. <b>지금은 저장되지 않고 이 화면에서만</b> 유지됩니다 — 새로고침하면
          사라집니다. 좌석 배치와 학생은 실제 값입니다.
        </div>
      </div>

      <div className="stat-strip c4" style={{ marginTop: 10 }}>
        <div className="stat">
          <div className="l">
            <Icon name="route" size={13} /> 순찰 회차
          </div>
          <div className="v">{round}회차</div>
          <div className="d">하루 최대 5회</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 배정 좌석
          </div>
          <div className="v">{seated}</div>
          <div className="d">이 구역</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 이번 회차 체크
          </div>
          <div className="v">{checked}</div>
          <div className="d">찍은 좌석</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-x" size={13} /> 자리 비움
          </div>
          <div className="v">
            {Object.values(current).filter((m) => m === 'out' || m === 'toilet' || m === 'common').length}
          </div>
          <div className="d">외출 · 화장실 · 공용공간</div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

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
              {areas.length === 0 && <option value="">등록된 구역이 없습니다</option>}
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {/* 관을 빼면 본관 A 와 별관 A 가 화면에서 구분되지 않는다 */}
                  {a.buildingName} {a.areaNm}
                </option>
              ))}
            </select>
            <MaskToggle masked={masked} onChange={setMasked} />
          </div>
        </div>

        <div className="card-sec-b">
          {/* 회차 — 먼저 고르고 그다음 좌석을 찍는다 */}
          <div className="frow">
            <label>회차</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROUNDS.map((r) => (
                <button key={r} type="button" className={`chip${round === r ? ' on' : ''}`} onClick={() => setRound(r)}>
                  {r}회차
                  {Object.keys(marks[r] ?? {}).length > 0 && (
                    <span className="mk" style={{ marginLeft: 4 }}>
                      {Object.keys(marks[r] ?? {}).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ★ 팔레트에서 먼저 고르고 좌석을 누른다 — 좌석마다 모달을 열면 종이보다 느려진다 */}
          <div className="frow">
            <label>찍을 상태</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {MARKS.filter((m) => m.key !== 'none').map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={`chip${pick === m.key ? ' on' : ''}`}
                  onClick={() => setPick(m.key)}
                >
                  <span
                    className="sw"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: m.color,
                      marginRight: 5,
                      verticalAlign: -1,
                    }}
                  />
                  {m.label}
                </button>
              ))}
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
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>이 지점에 등록된 좌석 구역이 없습니다.</div>
              )}
              {!loading && seats.length > 0 && (
                <div className="rr-stage">
                  <div className="rr-front">관리자 데스크 · 출입구</div>
                  <div className="rr-map">
                    {rows.map((rowSeats, ri) => (
                      <div className="rr-row" key={ri}>
                        <span className="rr-rowno">{ri + 1}</span>
                        {rowSeats.slice(0, half).map((s) => (
                          <PatrolSeat key={s.seatId} seat={s} mark={markOf(s.seatId)} onTap={tapSeat} />
                        ))}
                        <span className="rr-aisle" />
                        {rowSeats.slice(half).map((s) => (
                          <PatrolSeat key={s.seatId} seat={s} mark={markOf(s.seatId)} onTap={tapSeat} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rr-legend" style={{ marginTop: 12 }}>
                {MARKS.filter((m) => m.key !== 'none').map((m) => (
                  <span key={m.key}>
                    <span className="sw" style={{ background: m.color }} />
                    {m.label}
                  </span>
                ))}
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
    </div>
  )
}

/** 좌석 한 칸. 누르면 고른 상태가 바로 찍힌다 */
function PatrolSeat({ seat, mark, onTap }: { seat: Seat; mark: MarkKey; onTap: (id: number) => void }) {
  const meta = MARKS.find((m) => m.key === mark)
  const empty = seat.enrollmentId === null
  return (
    <button
      type="button"
      className="rr-seat"
      onClick={() => onTap(seat.seatId)}
      disabled={empty}
      title={empty ? '배정된 학생이 없습니다' : `${seat.seatCd} · ${seat.studentName ?? ''}`}
      style={
        mark === 'none'
          ? undefined
          : { borderColor: meta?.color, boxShadow: `inset 0 0 0 2px ${meta?.color ?? 'transparent'}` }
      }
    >
      <span className="sc">{seat.seatCd}</span>
      <span className="sn">{empty ? '공석' : (seat.studentName ?? '-')}</span>
      {mark !== 'none' && (
        <span className="sno" style={{ color: meta?.color, fontWeight: 800 }}>
          {meta?.label}
        </span>
      )}
    </button>
  )
}

export const patrolMockup: Mockup = { Content }
