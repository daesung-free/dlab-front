import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './seat.css'

/* F-4.11-8 좌석 이탈/복귀 신청 — 신규개발-요구사항신규
 *
 * 배경: 키오스크 증설이 중단(잔여 6대)돼 앱으로 대체한다.
 *       패드 소지 = 앱 신청 / 미소지 = 키오스크 병행.
 *       기존 사감 순찰기록을 "좌석 이탈 현황"으로 재정의·연동한다.
 *
 * ⚠ #36 / I-16 (높음) — 위치 구분값·좌석표 실시간 반영·앱↔키오스크 병행 처리·
 *   잔여 키오스크 연동 범위가 미확정. D-2(키오스크 스펙)에도 종속된다.
 *   실행가이드: "D-2 종속 — 미확정 시 앱만 우선". */

/** 위치 구분값 — 확정 대상 enum (I-16) */
const LOCATIONS = [
  { key: 'SEAT', label: '본인좌석', cls: 'at-seat', color: 'var(--mint-wash)' },
  { key: 'CLASSROOM', label: '강의실', cls: 'at-class', color: 'var(--blue-wash)' },
  { key: 'RESTROOM', label: '화장실', cls: 'at-rest', color: 'var(--amber-wash)' },
  { key: 'COMMON', label: '공용공간', cls: 'at-common', color: 'var(--violet-wash)' },
  { key: 'SUBJECT', label: '교과실', cls: 'at-subject', color: '#e9f7ee' },
] as const

type LocKey = (typeof LOCATIONS)[number]['key']

interface Seat {
  code: string
  name?: string
  loc?: LocKey
  /** 신청 없이 이탈 — 순찰에서 '좌석없음'으로 잡힌 건 */
  unreported?: boolean
}

const SEATS: Seat[] = Array.from({ length: 60 }, (_, i) => {
  const code = `${i < 30 ? 'A' : 'B'}-${String((i % 30) + 1).padStart(2, '0')}`
  if (i % 11 === 10) return { code }
  const s = MOCK_STUDENTS[i % MOCK_STUDENTS.length]
  const locIdx = i % 13 === 3 ? 1 : i % 17 === 5 ? 2 : i % 19 === 7 ? 3 : i % 23 === 11 ? 4 : 0
  return {
    code,
    name: s.name,
    loc: LOCATIONS[locIdx].key,
    unreported: i % 29 === 13,
  }
})

/* ── 이동 신청 내역 ── */
type Channel = '앱' | '키오스크'

interface MoveLog {
  id: string
  at: string
  studentNo: string
  name: string
  seat: string
  from: string
  to: string
  channel: Channel
  returned: boolean
  minutes: number
}

const MOVES: MoveLog[] = MOCK_STUDENTS.slice(0, 28).map((s, i) => {
  const loc = LOCATIONS[(i % 4) + 1]
  const returned = i % 5 !== 4
  return {
    id: `mv-${i + 1}`,
    at: `2026-05-28 ${String(9 + (i % 12)).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`,
    studentNo: s.studentNo,
    name: s.name,
    seat: s.seat,
    from: '본인좌석',
    to: loc.label,
    channel: i % 3 === 2 ? '키오스크' : '앱',
    returned,
    minutes: returned ? 5 + ((i * 7) % 40) : 12 + ((i * 5) % 60),
  }
})

const COLUMNS: Column<MoveLog>[] = [
  { key: 'at', header: '신청시각', width: '146px', sortable: true, value: (r) => r.at },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'seat', header: '좌석', width: '68px', align: 'center', value: (r) => r.seat },
  {
    key: 'to',
    header: '이동 위치',
    width: '104px',
    align: 'center',
    sortable: true,
    value: (r) => r.to,
    render: (r) => <span className="mk supplement">{r.to}</span>,
  },
  {
    key: 'channel',
    header: '경로',
    width: '86px',
    align: 'center',
    sortable: true,
    value: (r) => r.channel,
    render: (r) => (
      <span style={{ fontSize: 11.5, fontWeight: 700, color: r.channel === '앱' ? 'var(--violet)' : 'var(--amber)' }}>
        {r.channel}
      </span>
    ),
  },
  {
    key: 'minutes',
    header: '경과',
    width: '80px',
    align: 'right',
    sortable: true,
    value: (r) => r.minutes,
    render: (r) => (
      <span style={{ color: !r.returned && r.minutes > 30 ? 'var(--red)' : undefined, fontWeight: r.returned ? 400 : 700 }}>
        {r.minutes}분
      </span>
    ),
  },
  {
    key: 'returned',
    header: '복귀',
    width: '86px',
    align: 'center',
    value: (r) => (r.returned ? '복귀' : '미복귀'),
    render: (r) =>
      r.returned ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>복귀</span>
      ) : (
        <span className="mk brandnew">미복귀</span>
      ),
  },
]

function Content() {
  const [masked, setMasked] = useState(true)
  const [filter, setFilter] = useState<LocKey | 'ALL'>('ALL')

  const occupied = SEATS.filter((s) => s.name)
  const byLoc = useMemo(() => {
    const m = new Map<LocKey, number>()
    for (const l of LOCATIONS) m.set(l.key, 0)
    for (const s of occupied) if (s.loc) m.set(s.loc, (m.get(s.loc) ?? 0) + 1)
    return m
  }, [occupied])

  const unreported = occupied.filter((s) => s.unreported).length
  const notReturned = MOVES.filter((m) => !m.returned).length

  return (
    <div className="p-seat">
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">위치 구분값·키오스크 병행 범위 미확정 (오픈이슈 #36 / I-16, 높음 · D-2 종속)</div>
          <div className="tx">
            아래 5종 위치 구분값(<code>SEAT / CLASSROOM / RESTROOM / COMMON / SUBJECT</code>)은{' '}
            <b>제안이며 확정본이 아닙니다.</b> 좌석표 실시간 반영 방식, 앱↔키오스크 병행 처리, 잔여 키오스크
            <b> 6대</b>의 연동 범위가 운영팀·대성전산 협의 대기입니다.
            <br />
            실행가이드 지침: <b>"D-2 종속 — 미확정 시 앱만 우선"</b>. 키오스크 경로는 스펙 수령 후 붙입니다.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              ※ 배경 — 키오스크 증설이 중단되어 앱으로 대체합니다. 패드 소지자는 앱, 미소지자는 키오스크 병행.
              기존 <b>사감 순찰기록을 "좌석 이탈 현황"으로 재정의</b>해 연동합니다(<code>patrol_logs</code> 재정의).
            </span>
          </div>
        </div>
      </div>

      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="armchair" size={13} /> 재실
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {byLoc.get('SEAT')}
          </div>
          <div className="d">본인좌석</div>
        </div>
        {LOCATIONS.slice(1).map((l) => (
          <div className="stat" key={l.key}>
            <div className="l">
              <Icon name="map-pin" size={13} /> {l.label}
            </div>
            <div className="v">{byLoc.get(l.key)}</div>
            <div className="d" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10 }}>
              {l.key}
            </div>
          </div>
        ))}
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 미신고 이탈
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {unreported}
          </div>
          <div className="d down">순찰 '좌석없음'</div>
        </div>
      </div>

      <div className="card-sec">
        <div className="card-sec-h">
          <div className="t">
            <span className="ico">
              <Icon name="armchair" size={15} />
            </span>
            실시간 좌석표
          </div>
          <div className="r">
            <button className={`chip${filter === 'ALL' ? ' on' : ''}`} onClick={() => setFilter('ALL')}>
              전체
            </button>
            {LOCATIONS.map((l) => (
              <button
                key={l.key}
                className={`chip${filter === l.key ? ' on' : ''}`}
                onClick={() => setFilter(filter === l.key ? 'ALL' : l.key)}
              >
                {l.label}
              </button>
            ))}
            <span className="mk verified" style={{ marginLeft: 4 }}>
              <Icon name="zap" size={11} /> 실시간
            </span>
          </div>
        </div>
        <div className="card-sec-b">
          <div className="seatmap">
            {SEATS.map((s) => {
              const loc = LOCATIONS.find((l) => l.key === s.loc)
              const dim = filter !== 'ALL' && s.loc !== filter
              return (
                <div
                  key={s.code}
                  className={`seat ${s.name ? loc?.cls ?? '' : 'empty'}`}
                  style={dim ? { opacity: 0.28 } : undefined}
                  title={s.name ? `${s.code} · ${s.name} · ${loc?.label}${s.unreported ? ' (미신고 이탈)' : ''}` : `${s.code} · 공석`}
                >
                  {s.unreported && <span className="dot" />}
                  <span className="sc">{s.code}</span>
                  <span className="sn">{s.name ? (masked ? `${s.name[0]}*${s.name.slice(2)}` : s.name) : '공석'}</span>
                  {s.name && s.loc !== 'SEAT' && (
                    <span className="sl" style={{ color: 'var(--ink-2)' }}>
                      {loc?.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="loc-legend">
            {LOCATIONS.map((l) => (
              <span key={l.key}>
                <span className="sw" style={{ background: l.color }} />
                {l.label}
                <code>{l.key}</code>
              </span>
            ))}
            <span>
              <span className="sw" style={{ background: 'var(--line-2)' }} />
              공석
            </span>
            <span style={{ marginLeft: 'auto', color: 'var(--red)', fontWeight: 700 }}>
              ● 미신고 이탈 (순찰 '좌석없음')
            </span>
          </div>
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={MOVES}
        rowKey={(r) => r.id}
        masked={masked}
        pageSize={12}
        countLabel={
          <>
            이동 신청 <b>{MOVES.length}</b>건 · 미복귀{' '}
            <b style={{ color: notReturned ? 'var(--red)' : undefined }}>{notReturned}</b>건
          </>
        }
        toolbar={
          <>
            <MaskToggle masked={masked} onChange={setMasked} />
            <ExcelButton filename="좌석_이탈현황" columns={COLUMNS} rows={MOVES} masked={masked} />
          </>
        }
      />

      <div className="note-box plain" style={{ marginTop: 14 }}>
        <div className="ic">
          <Icon name="qr-code" size={17} />
        </div>
        <div>
          <div className="tt">사감 순찰 기록과의 관계</div>
          <div className="tx">
            기존 순찰 기록(교시별 구역 QR 스캔 — 공부중 / 졸음 / 좌석없음)의 <b>'좌석없음'</b>이 이 화면의{' '}
            <b>미신고 이탈</b>과 같은 사건입니다. 학생이 앱으로 이동을 신청하면 순찰에서 '좌석없음'으로 잡혀도
            정상 처리되고, 신청 없이 자리를 비운 경우만 미신고로 남습니다. <b>2회 연속 졸음 → 벌점</b> 규칙은
            상벌점 규칙 엔진(I-5)에 함께 매핑되어야 합니다.
          </div>
        </div>
      </div>
    </div>
  )
}

export const seatMoveMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">A · B실 ▾</button>
      <button className="btn">
        <Icon name="footprints" size={14} /> 순찰 기록
      </button>
    </>
  ),
}
