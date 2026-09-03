import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, PrintButton, Unfilled, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  getSeatLayout,
  listSeatAreas,
  releaseSeatOfStudent,
  setSeatUsable,
  type SeatArea,
  type SeatCell as ApiSeatCell,
} from '../../api/facility'
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
 * ★ 이석 위치는 아직 없다. 좌석 이탈 로그 수집이 보류라 서버가 값을 못 준다 —
 *   목업 컬럼은 남기고 <Unfilled/> 로 표시한다. */

type SeatState = 'in' | 'out' | 'away' | 'free' | 'off'

const STATE_META: Record<SeatState, { label: string; short: string; color: string }> = {
  in: { label: '재실', short: '재실', color: 'var(--mint-wash)' },
  out: { label: '배정 · 미등원', short: '미등원', color: 'var(--amber-wash)' },
  away: { label: '이석 (좌석 이탈 신청)', short: '이석', color: 'var(--violet-wash)' },
  free: { label: '미배정 공석', short: '공석', color: '#fff' },
  off: { label: '사용중지', short: '중지', color: '#eceef1' },
}

/** 배정 축 × 재실 축 → 화면의 5색 */
function seatState(cell: ApiSeatCell): SeatState {
  if (cell.assignmentState === 'DISABLED') return 'off'
  if (cell.assignmentState !== 'ASSIGNED') return 'free'
  if (cell.presence === 'PRESENT') return 'in'
  if (cell.presence === 'OUT') return 'away'
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
  { key: 'className', header: '고정반', width: '86px', align: 'center', value: (r) => r.className ?? '-' },
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
    render: () => <Unfilled reason="이석 위치가 좌석 응답에 없다 (좌석 이탈/복귀 연동 필요)" />,
  },
]

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('map')
  const [areas, setAreas] = useState<SeatArea[]>([])
  const [areaId, setAreaId] = useState<number | null>(null)
  const [cells, setCells] = useState<ApiSeatCell[]>([])
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [masked, setMasked] = useState(true)

  // 구역 목록
  useEffect(() => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    let cancelled = false
    listSeatAreas(academyId)
      .then((list) => {
        if (cancelled) return
        setAreas(list)
        setAreaId((prev) => (list.some((a) => a.id === prev) ? prev : (list[0]?.id ?? null)))
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : '좌석 구역을 불러오지 못했습니다.'))
    return () => {
      cancelled = true
    }
  }, [academyId])

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
  const half = Math.ceil(maxCol / 2)

  const rows = useMemo(
    () =>
      Array.from({ length: maxRow }, (_, i) => seats.filter((s) => s.row === i + 1).sort((a, b) => a.col - b.col)),
    [seats, maxRow],
  )

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
          <div className="d up">서버 계산값</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="footprints" size={13} /> 이석
          </div>
          <div className="v">{count('away')}</div>
          <div className="d">좌석 이탈 신청 반영</div>
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
                {area?.areaNm ?? '독서실'} 배치도
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
                    {a.areaNm}
                  </button>
                ))}
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
                <div className="rr-stage">
                  <div className="rr-front">관 리 자 데 스 크 · 출 입 구</div>
                  <div className="rr-map">
                    {rows.map((rowSeats, ri) => (
                      <div className="rr-row" key={ri}>
                        <span className="rr-rowno">{ri + 1}</span>
                        {rowSeats.slice(0, half).map((s) => (
                          <SeatBox key={s.seatId} seat={s} selected={selectedSeatId} onSelect={setSelectedSeatId} />
                        ))}
                        <span className="rr-aisle" />
                        {rowSeats.slice(half).map((s) => (
                          <SeatBox key={s.seatId} seat={s} selected={selectedSeatId} onSelect={setSelectedSeatId} />
                        ))}
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
                      <span className="k">고정반</span>
                      <span className="v">{sel.className ?? '미배정'}</span>
                    </div>
                    <div className="row">
                      <span className="k">이석 위치</span>
                      <span className="v">
                        <Unfilled reason="이석 위치가 좌석 응답에 없다" />
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button className="btn pri" disabled title="배정은 배정 관리(F-4.10-3) 화면에서 합니다">
                      <Icon name="user-plus" size={14} /> 배정 변경
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

      {tab === 'list' && (
        <DataTable
          columns={ASSIGN_COLUMNS}
          rows={assignRows}
          rowKey={(r) => String(r.seatId)}
          masked={false}
          loading={loading}
          pageSize={15}
          countLabel={
            <>
              {area?.areaNm ?? '독서실'} 배정 <b>{assignRows.length}</b>명
            </>
          }
          emptyText="배정된 좌석이 없습니다."
          toolbar={
            <>
              <button className="btn" disabled title="좌석 재배치 API가 아직 없습니다">
                <Icon name="refresh-cw" size={14} /> 좌석 재배치
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
    </div>
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
      title={`${seat.seatCd} · ${STATE_META[seat.state].label}${seat.studentName ? ` · ${seat.studentName}` : ''}`}
    >
      {seat.state === 'in' && <span className="live" />}
      <span className="sc">{seat.seatCd}</span>
      <span className="sn">{name}</span>
    </button>
  )
}

export const readingRoomMockup: Mockup = {
  Content,
}
