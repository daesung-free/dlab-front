import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './seat.css'

/* F-4.11-8 좌석 이탈/복귀 신청 — 신규개발-요구사항신규
 *
 * 배경: 키오스크 증설이 중단(잔여 6대)돼 앱으로 대체한다.
 *       패드 소지 = 앱 신청 / 미소지 = 키오스크 병행.
 *
 * ⚠ 사감 순찰기록은 범위에서 제외한다.
 *   순찰로 '좌석없음'을 잡아 미신고 이탈을 추정하던 방식을 쓰지 않는다.
 *   → 이탈 정보의 출처는 앱 신청과 키오스크 태깅 2개뿐이다.
 *   → 따라서 "신청 없이 자리를 비운 상태"를 시스템이 알 방법이 없다.
 *     좌석표의 빈 자리는 '미신고 이탈'이 아니라 '데이터 없음'으로 읽어야 한다.
 *
 * ⚠ 키오스크 관리자 페이지를 이 관리자 화면 안에 내장한다.
 *   별도 키오스크 관리 콘솔로 나가지 않고, 여기서 단말을 등록·모니터링하며
 *   좌석 이탈 정보도 그 단말들에서 수신한다(단일 진입점).
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
  }
})

/* ── 키오스크 단말 관리 — 별도 콘솔 없이 이 화면에 내장한다 ── */

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
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          설정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          재시작
        </button>
      </div>
    ),
  },
]

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
  const [tab, setTab] = useState('map')

  const occupied = SEATS.filter((s) => s.name)
  const byLoc = useMemo(() => {
    const m = new Map<LocKey, number>()
    for (const l of LOCATIONS) m.set(l.key, 0)
    for (const s of occupied) if (s.loc) m.set(s.loc, (m.get(s.loc) ?? 0) + 1)
    return m
  }, [occupied])

  const notReturned = MOVES.filter((m) => !m.returned).length
  const onlineKiosks = KIOSKS.filter((k) => k.online).length

  return (
    <div className="p-seat">
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
            <Icon name="monitor" size={13} /> 키오스크
          </div>
          <div className="v" style={{ color: onlineKiosks === KIOSKS.length ? 'var(--mint-d)' : 'var(--amber)' }}>
            {onlineKiosks}
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>/{KIOSKS.length}</span>
          </div>
          <div className={onlineKiosks === KIOSKS.length ? 'd' : 'd warn'}>온라인 / 전체</div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'map', label: '실시간 좌석표' },
          { key: 'log', label: '이동 신청 내역', count: MOVES.length },
          { key: 'kiosk', label: '키오스크 관리', count: KIOSKS.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {tab === 'map' && (
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
                  title={s.name ? `${s.code} · ${s.name} · ${loc?.label}` : `${s.code} · 공석`}
                >
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
            <span style={{ marginLeft: 'auto', color: 'var(--muted)' }}>
              앱 신청 · 키오스크 태깅으로 수신된 상태만 표시됩니다
            </span>
          </div>
        </div>
      </div>
      )}

      {tab === 'log' && (
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
      )}

      {tab === 'kiosk' && (
        <>
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
              <div className="tt">사감 순찰기록은 범위에서 제외됐습니다</div>
              <div className="tx">
                이탈 정보의 출처는 <b>앱 신청 · 키오스크 태깅 2개뿐</b>입니다. 즉 <b>신청 없이 자리를 비운 상태는 시스템이
                알 수 없습니다.</b> 좌석표의 빈 자리는 &lsquo;미신고 이탈&rsquo;이 아니라 <b>&lsquo;데이터 없음&rsquo;</b>
                으로 읽어야 합니다. 무단 이탈을 잡아야 한다면 별도 수단(재실 센서 등)이 필요하며 <code>I-16</code>에서 함께
                정리해야 합니다.
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
                등록 단말 <b>{KIOSKS.length}</b>대 · 온라인{' '}
                <b style={{ color: onlineKiosks === KIOSKS.length ? 'var(--mint-d)' : 'var(--amber)' }}>{onlineKiosks}</b>
                대 · 금일 수신 <b>{KIOSKS.reduce((a, k) => a + k.todayEvents, 0)}</b>건
              </>
            }
            toolbar={
              <>
                <button className="btn">
                  <Icon name="refresh-cw" size={14} /> 전체 동기화
                </button>
                <button className="btn">
                  <Icon name="upload" size={14} /> 펌웨어 배포
                </button>
                <button className="btn pri">
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
      <button className="btn">A · B실 ▾</button>
      <button className="btn">
        <Icon name="monitor" size={14} /> 키오스크 관리
      </button>
    </>
  ),
}
