import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, PrintButton, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { maskName } from '../../lib/mask'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './reading-room.css'

/* 학원생 관리 > 출결/자습/독서실 > 독서실 좌석배치표
 * ⭐ 클라이언트가 직접 추가·사용 표기한 신규 메뉴.
 *
 * 이 화면이 기존 배정 관리(F-4.10-3)와 다른 점:
 *   · 배정 관리 = "누구에게 어느 좌석을 줄 것인가" (명단 → 좌석)
 *   · 좌석배치표 = "지금 이 실이 어떤 상태인가" (도면 → 사람)
 *   현장 확인은 명단이 아니라 도면으로 하기 때문에 화면을 나눈다.
 *
 * ⚠ 좌석 상태는 두 축이 겹친다 — 하나로 합치면 안 된다.
 *   · 배정 축 : 배정됨 / 미배정 / 사용중지
 *   · 재실 축 : 재실 / 미등원 / 이석(좌석 이탈 신청)
 *   색으로 배정+재실 조합을, 점으로 실시간 재실 여부를 표기한다.
 *
 * ⚠ BE 전제 — 재실 여부는 이 화면이 판단하지 않는다.
 *   출결(F-4.3) 등원 로그와 좌석 이탈/복귀(F-4.11-8) 신청을 합쳐 서버가 계산한 값을 받는다.
 *   화면에서 두 소스를 조합하면 새로고침마다 값이 흔들린다. */

interface Room {
  id: string
  name: string
  rows: number
  cols: number
  floor: string
}

const ROOMS: Room[] = [
  { id: 'A', name: 'A실 (자연)', rows: 8, cols: 6, floor: '3층' },
  { id: 'B', name: 'B실 (인문)', rows: 6, cols: 6, floor: '3층' },
  { id: 'C', name: 'C실 (심화)', rows: 5, cols: 4, floor: '4층' },
]

type SeatState = 'in' | 'out' | 'away' | 'free' | 'off'

const STATE_META: Record<SeatState, { label: string; short: string; color: string }> = {
  in: { label: '재실', short: '재실', color: 'var(--mint-wash)' },
  out: { label: '배정 · 미등원', short: '미등원', color: 'var(--amber-wash)' },
  away: { label: '이석 (좌석 이탈 신청)', short: '이석', color: 'var(--violet-wash)' },
  free: { label: '미배정 공석', short: '공석', color: '#fff' },
  off: { label: '사용중지', short: '중지', color: '#eceef1' },
}

interface Seat {
  code: string
  row: number
  col: number
  state: SeatState
  studentNo?: string
  name?: string
  classNo?: string
  /** 이석 중일 때 어디로 갔는지 — 좌석 이탈/복귀(F-4.11-8) 연동 */
  awayTo?: string
}

const AWAY_PLACES = ['강의실', '화장실', '공용공간', '교과실']

/** 결정적 배치 — 실 id + 좌석 인덱스로 항상 같은 도면이 나온다 */
function buildSeats(room: Room): Seat[] {
  const live = MOCK_STUDENTS.filter((s) => s.status === '재원')
  const out: Seat[] = []
  let assigned = 0

  for (let r = 1; r <= room.rows; r++) {
    for (let c = 1; c <= room.cols; c++) {
      const idx = (r - 1) * room.cols + (c - 1)
      const code = `${room.id}-${String(idx + 1).padStart(2, '0')}`
      const seed = room.id.charCodeAt(0) + idx * 7

      // 매 13번째 좌석은 설비 문제로 사용중지
      if (idx % 13 === 12) {
        out.push({ code, row: r, col: c, state: 'off' })
        continue
      }
      // 매 5번째 좌석은 미배정 공석
      if (idx % 5 === 4) {
        out.push({ code, row: r, col: c, state: 'free' })
        continue
      }

      const st = live[(assigned + room.id.charCodeAt(0)) % live.length]
      assigned++
      const state: SeatState = seed % 11 === 3 ? 'away' : seed % 7 === 2 ? 'out' : 'in'

      out.push({
        code,
        row: r,
        col: c,
        state,
        studentNo: st.studentNo,
        name: st.name,
        classNo: st.classNo,
        awayTo: state === 'away' ? AWAY_PLACES[seed % AWAY_PLACES.length] : undefined,
      })
    }
  }
  return out
}

interface AssignRow {
  code: string
  studentNo: string
  name: string
  classNo: string
  state: string
  awayTo: string
}

const ASSIGN_COLUMNS: Column<AssignRow>[] = [
  { key: 'code', header: '좌석', width: '86px', align: 'center', sortable: true, value: (r) => r.code },
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '고정반', width: '76px', align: 'center', sortable: true, value: (r) => r.classNo },
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
    value: (r) => r.awayTo,
    render: (r) => (r.awayTo === '-' ? <span style={{ color: 'var(--muted)' }}>-</span> : r.awayTo),
  },
]

function Content() {
  const [tab, setTab] = useState('map')
  const [roomId, setRoomId] = useState('A')
  const [selected, setSelected] = useState<string | null>(null)
  const [masked, setMasked] = useState(true)

  const room = ROOMS.find((r) => r.id === roomId)!
  const seats = useMemo(() => buildSeats(room), [room])

  const count = (s: SeatState) => seats.filter((x) => x.state === s).length
  const usable = seats.length - count('off')
  const assignedCount = count('in') + count('out') + count('away')

  const rows = useMemo(
    () =>
      Array.from({ length: room.rows }, (_, i) => seats.filter((s) => s.row === i + 1).sort((a, b) => a.col - b.col)),
    [seats, room.rows],
  )
  const half = Math.ceil(room.cols / 2)

  const assignRows: AssignRow[] = useMemo(
    () =>
      seats
        .filter((s) => s.name)
        .map((s) => ({
          code: s.code,
          studentNo: s.studentNo!,
          name: s.name!,
          classNo: s.classNo!,
          state: STATE_META[s.state].short,
          awayTo: s.awayTo ?? '-',
        })),
    [seats],
  )

  const sel = selected ? seats.find((s) => s.code === selected) : undefined

  return (
    <div className="p-rr">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 총 좌석
          </div>
          <div className="v">{seats.length}</div>
          <div className="d">
            {room.name} · {room.floor}
          </div>
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
          <div className="d up">실시간 수신</div>
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
                {room.name} 배치도
              </div>
              <div className="r">
                {ROOMS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`chip${roomId === r.id ? ' on' : ''}`}
                    onClick={() => {
                      setRoomId(r.id)
                      setSelected(null)
                    }}
                  >
                    {r.name}
                  </button>
                ))}
                <PrintButton label="도면 인쇄" />
              </div>
            </div>
            <div className="card-sec-b">
              <div className="rr-stage">
                <div className="rr-front">관 리 자 데 스 크 · 출 입 구</div>
                <div className="rr-map">
                  {rows.map((rowSeats, ri) => (
                    <div className="rr-row" key={ri}>
                      <span className="rr-rowno">{ri + 1}</span>
                      {rowSeats.slice(0, half).map((s) => (
                        <SeatCell key={s.code} seat={s} masked={masked} selected={selected} onSelect={setSelected} />
                      ))}
                      <span className="rr-aisle" />
                      {rowSeats.slice(half).map((s) => (
                        <SeatCell key={s.code} seat={s} masked={masked} selected={selected} onSelect={setSelected} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

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
                  실시간 재실
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
                  <div className="x">배치도에서 좌석을 누르면 배정 학생·재실 상태·이석 위치를 확인하고 바로 변경할 수 있습니다.</div>
                </div>
              )}
              {sel && (
                <>
                  <div className="kv" style={{ marginBottom: 14 }}>
                    <div className="row">
                      <span className="k">좌석번호</span>
                      <span className="v">
                        <b>{sel.code}</b> · {sel.row}행 {sel.col}열
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
                        {sel.name ? `${masked ? maskName(sel.name) : sel.name} (${sel.studentNo})` : '미배정'}
                      </span>
                    </div>
                    <div className="row">
                      <span className="k">고정반</span>
                      <span className="v">{sel.classNo ?? '-'}</span>
                    </div>
                    <div className="row">
                      <span className="k">이석 위치</span>
                      <span className="v">{sel.awayTo ?? '-'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                    <button className="btn pri">
                      <Icon name="user-plus" size={14} /> 배정 변경
                    </button>
                    <button className="btn">
                      <Icon name="user-x" size={14} /> 배정 해제
                    </button>
                    <button className="btn">
                      <Icon name="shield-off" size={14} /> 사용중지
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
          rowKey={(r) => r.code}
          selectable
          masked={masked}
          pageSize={15}
          countLabel={
            <>
              {room.name} 배정 <b>{assignRows.length}</b>명
            </>
          }
          toolbar={
            <>
              <button className="btn">
                <Icon name="refresh-cw" size={14} /> 좌석 재배치
              </button>
              <MaskToggle masked={masked} onChange={setMasked} />
              <ExcelButton filename={`독서실_${room.id}실_배정`} columns={ASSIGN_COLUMNS} rows={assignRows} masked={masked} />
            </>
          }
        />
      )}
    </div>
  )
}

function SeatCell({
  seat,
  masked,
  selected,
  onSelect,
}: {
  seat: Seat
  masked: boolean
  selected: string | null
  onSelect: (code: string) => void
}) {
  const name = seat.name ? (masked ? maskName(seat.name) : seat.name) : '공석'
  return (
    <button
      type="button"
      className={`rr-seat st-${seat.state}${selected === seat.code ? ' sel' : ''}`}
      onClick={() => seat.state !== 'off' && onSelect(seat.code)}
      title={`${seat.code} · ${STATE_META[seat.state].label}${seat.name ? ` · ${seat.name}` : ''}${seat.awayTo ? ` → ${seat.awayTo}` : ''}`}
    >
      {seat.state === 'in' && <span className="live" />}
      <span className="sc">{seat.code}</span>
      <span className="sn">{seat.state === 'off' ? '사용중지' : name}</span>
      {seat.awayTo && (
        <span className="sx" style={{ color: 'var(--violet)' }}>
          → {seat.awayTo}
        </span>
      )}
      {seat.state === 'out' && (
        <span className="sx" style={{ color: 'var(--amber)' }}>
          미등원
        </span>
      )}
    </button>
  )
}

export const readingRoomMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05-28 ▾</button>
      <button className="btn">
        <Icon name="user-x" size={14} /> 미등원자 조회
      </button>
    </>
  ),
}
