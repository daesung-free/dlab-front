import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './meal.css'

/* F-4.5 급식 관리 — 신규개발-요구사항신규 (디멤버 급식신청 대체)
 *
 * 실행가이드 Phase 2 주의사항:
 *   "화면보다 결제/정산 상태모델을 먼저 확정할 것"
 *   "Webhook 재시도 + 정합성 배치를 처음부터 설계에 포함"(리스크#4 수납↔급식 동기화오류)
 *
 * PG사는 급식업체가 이미 쓰는 곳과 연동한다 — 신규 선정 대상이 아니다(E-3은 정보 수급 건).
 *
 * 이 화면은 3개 축을 다룬다.
 *   1) 신청·결제  — 누가 며칠치를 결제했는가
 *   2) 일정 관리  — 어느 날 급식을 운영하는가 → 중단일로 등록하면 그날 신청이 막힌다
 *   3) 배식 체크  — 신청한 사람이 실제로 먹었는가 (키오스크·태블릿 RFID/QR)
 *
 * ⚠ 일정과 신청의 관계 — 순서를 지켜야 한다.
 *   중단일 등록은 "앞으로의 신청을 막는" 것이지 "이미 결제된 건을 지우는" 것이 아니다.
 *   이미 신청·결제된 날을 중단으로 바꾸면 해당 건은 전부 환불 대상이 되므로,
 *   서버가 (결제건 존재 여부) 확인 후 환불 배치를 태우고 나서 중단 처리해야 한다.
 *
 * ⚠ #38 / I-18 (중) — 식사체크 방식.
 *   [0723 메모] "식사체크 주체 = 관리자(교직원), 학생 아님"
 *   [운영 확인] 실제로는 반대다. 학생이 본인 휴대폰에서 앱 QR을 꺼내 스캐너에 태깅하고,
 *              관리자는 그 결과를 옆에서 확인·입회한다. → 운영 기준으로 화면을 맞춘다.
 *              0723 메모와 상충하므로 I-18 종결 시 이 내용으로 확정할 것.
 *
 * ⚠ 태깅이 실패하는 경우가 반드시 생긴다 — 이게 이 화면의 핵심이다.
 *   앱 미설치 · 휴대폰 미소지 · QR 만료 · 스캔 인식 실패 · 단말 오프라인.
 *   배식 줄을 세워둘 수 없으므로 관리자가 즉시 수기 확인으로 통과시키고,
 *   그 건을 나중에 되짚을 수 있도록 사유와 처리자를 남긴다.
 *   → 수기 확인은 예외가 아니라 정상 경로의 일부로 설계한다.
 *
 * ⚠ QR 도용 — 학생이 QR을 캡처해 다른 학생에게 보내면 대리 수령이 된다.
 *   앱이 짧은 만료(30초 내외)의 회전 토큰을 발급하고 서버가 1회용으로 소진시켜야 한다.
 *   정적 QR(학번 인코딩)은 쓰면 안 된다.
 *
 *   안면·지문 생체인식은 검토 대상이며 채택 시 개인정보/ISMS 검토 필수. */

/* ── MealPolicy: 주말 + 공휴일 제외 ── */
const MONTH = 5
/** 2026-05-01은 금요일 */
const FIRST_DOW = 5
const DAYS_IN_MONTH = 31

const HOLIDAYS: Record<number, string> = {
  5: '어린이날',
  24: '부처님오신날',
  25: '대체공휴일',
}

/** 관리자가 등록하는 중단 사유 — 기초관리 마스터로 뺄 후보 */
const CLOSURE_REASONS = ['학원 휴무', '급식업체 휴무', '단축수업', '모의고사', '자체 행사']

/** 초기 등록분 — 실제로는 서버에서 내려온다 */
const INITIAL_CLOSURES: Record<number, string> = {
  15: '모의고사',
  22: '급식업체 휴무',
}

interface Day {
  day: number
  dow: number
  weekend: boolean
  holiday?: string
  /** 관리자가 등록한 급식 중단 사유 */
  closure?: string
  /** 급식 운영일 여부 — 신청 가능 여부와 같다 */
  open: boolean
  count: number
}

function buildDays(closures: Record<number, string>): Day[] {
  return Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
    const day = i + 1
    const dow = (FIRST_DOW + i) % 7
    const weekend = dow === 0 || dow === 6
    const holiday = HOLIDAYS[day]
    const closure = closures[day]
    const open = !weekend && !holiday && !closure
    return {
      day,
      dow,
      weekend,
      holiday,
      closure,
      open,
      count: open ? 190 + ((day * 17) % 70) : 0,
    }
  })
}

/* ── 주문/결제 내역 ── */
type PayMethod = 'CARD' | 'VBANK'
type OrderStatus = '확정' | '결제대기' | '취소완료' | '만료'
type CancelPath = '앱' | '데스크' | '-'

interface MealOrder {
  id: string
  orderNo: string
  studentNo: string
  name: string
  classNo: string
  period: string
  days: number
  method: PayMethod
  amount: number
  status: OrderStatus
  cancelPath: CancelPath
  /** 가상계좌 만료 예정 */
  expireAt?: string
}

const ORDERS: MealOrder[] = MOCK_STUDENTS.slice(0, 32).map((s, i) => {
  const method: PayMethod = i % 3 === 2 ? 'VBANK' : 'CARD'
  const status: OrderStatus =
    i % 11 === 10 ? '만료' : i % 7 === 6 ? '취소완료' : method === 'VBANK' && i % 4 === 1 ? '결제대기' : '확정'
  const days = 18 + (i % 4)
  return {
    id: `mo-${i + 1}`,
    orderNo: `MO-2026${String(MONTH).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`,
    studentNo: s.studentNo,
    name: s.name,
    classNo: s.classNo,
    period: '2026-05',
    days,
    method,
    amount: days * 6500,
    status,
    cancelPath: status === '취소완료' ? (i % 2 === 0 ? '앱' : '데스크') : '-',
    expireAt: status === '결제대기' ? `2026-05-${String(20 + (i % 8)).padStart(2, '0')} 23:59` : undefined,
  }
})

const METHOD_LABEL: Record<PayMethod, string> = { CARD: '카드', VBANK: '가상계좌' }
const STATUS_TONE: Record<OrderStatus, string> = {
  확정: 'verified',
  결제대기: 'supplement',
  취소완료: 'brandnew',
  만료: 'brandnew',
}

const COLUMNS: Column<MealOrder>[] = [
  {
    key: 'orderNo',
    header: '주문번호',
    width: '148px',
    sortable: true,
    value: (r) => r.orderNo,
    render: (_r, v) => <code style={{ fontSize: 11 }}>{v}</code>,
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'days', header: '식수', width: '68px', align: 'right', sortable: true, value: (r) => r.days },
  {
    key: 'method',
    header: '결제수단',
    width: '92px',
    align: 'center',
    value: (r) => METHOD_LABEL[r.method],
    render: (r) => (
      <span className={`mk ${r.method === 'CARD' ? 'verified' : 'supplement'}`} title={r.method}>
        {METHOD_LABEL[r.method]}
      </span>
    ),
  },
  {
    key: 'amount',
    header: '금액',
    width: '96px',
    align: 'right',
    sortable: true,
    value: (r) => r.amount,
    render: (r) => `${r.amount.toLocaleString()}원`,
  },
  {
    key: 'status',
    header: '상태',
    width: '104px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => (
      <span className={`mk ${STATUS_TONE[r.status]}`} title={r.expireAt ? `만료 ${r.expireAt}` : undefined}>
        {r.status}
      </span>
    ),
  },
  {
    key: 'cancelPath',
    header: '취소 경로',
    width: '90px',
    align: 'center',
    value: (r) => r.cancelPath,
    render: (r) =>
      r.cancelPath === '-' ? (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ) : (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: r.cancelPath === '앱' ? 'var(--violet)' : 'var(--amber)' }}>
          {r.cancelPath}
        </span>
      ),
  },
  {
    key: 'act',
    header: '',
    width: '80px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.status !== '확정'}>
        즉시 취소
      </button>
    ),
  },
]

/* ══ 배식 체크 — 학생 앱 QR 태깅 + 관리자 확인 ══ */

/** 학생이 QR을 못 찍는 상황. 배식 줄을 세울 수 없으므로 전부 수기 확인으로 흡수한다 */
const FAIL_REASONS = ['앱 미설치', '휴대폰 미소지', 'QR 만료', '스캔 인식 실패', '단말 오프라인'] as const
type FailReason = (typeof FAIL_REASONS)[number]

type TagMethod = 'QR' | '수기'
type TagResult = 'OK' | 'MANUAL' | 'DUP' | 'NOORDER' | 'FAIL'

const RESULT_META: Record<TagResult, { label: string; cls: string; desc: string }> = {
  OK: { label: 'QR 확인', cls: 'ok', desc: '학생 앱 QR 태깅으로 정상 확인' },
  MANUAL: { label: '수기 확인', cls: 'manual', desc: '태깅 불가 → 관리자가 학번 조회로 직접 확인' },
  DUP: { label: '중복 태깅', cls: 'dup', desc: '이미 배식 처리된 학생' },
  NOORDER: { label: '미신청', cls: 'noorder', desc: '금일 급식 신청 내역 없음 — 배식 거부' },
  FAIL: { label: '확인 필요', cls: 'fail', desc: '태깅 실패 — 관리자 확인 대기' },
}

interface Device {
  id: string
  name: string
  place: string
  /** 학생이 QR을 찍는 스캐너인지, 관리자가 확인·수기처리하는 단말인지 */
  role: '학생 QR 스캐너' | '관리자 확인 단말'
  online: boolean
  lastTagAt: string
  todayCount: number
}

const DEVICES: Device[] = [
  { id: 'SCAN-1', name: 'QR 스캐너 A', place: '배식대 A 입구', role: '학생 QR 스캐너', online: true, lastTagAt: '12:41:08', todayCount: 142 },
  { id: 'SCAN-2', name: 'QR 스캐너 B', place: '배식대 B 입구', role: '학생 QR 스캐너', online: false, lastTagAt: '11:12:30', todayCount: 18 },
  { id: 'PAD-ADMIN', name: '관리자 태블릿', place: '배식대 데스크', role: '관리자 확인 단말', online: true, lastTagAt: '12:40:55', todayCount: 36 },
]

const SCANNERS = DEVICES.filter((d) => d.role === '학생 QR 스캐너')
const ONLINE_SCANNERS = SCANNERS.filter((d) => d.online)

interface TagLog {
  id: string
  at: string
  studentNo: string
  name: string
  classNo: string
  device: string
  method: TagMethod
  result: TagResult
  /** 실패·수기 확인일 때의 사유 */
  reason?: FailReason
  /** 수기 확인을 처리한 관리자 */
  handledBy?: string
}

const STAFF = ['강민서', '정하람', '박서영']

const TAG_LOGS: TagLog[] = MOCK_STUDENTS.filter((s) => s.status === '재원')
  .slice(0, 38)
  .map((s, i) => {
    const result: TagResult =
      i % 19 === 18 ? 'FAIL' : i % 13 === 12 ? 'NOORDER' : i % 11 === 10 ? 'DUP' : i % 7 === 6 ? 'MANUAL' : 'OK'
    const failing = result === 'FAIL' || result === 'MANUAL'
    const scanner = ONLINE_SCANNERS[i % Math.max(1, ONLINE_SCANNERS.length)]
    return {
      id: `tag-${i + 1}`,
      at: `12:${String(2 + Math.floor(i * 1.1)).padStart(2, '0')}:${String((i * 23) % 60).padStart(2, '0')}`,
      studentNo: s.studentNo,
      name: s.name,
      classNo: s.classNo,
      device: result === 'MANUAL' ? '관리자 태블릿' : (scanner?.name ?? 'QR 스캐너 A'),
      method: result === 'MANUAL' ? '수기' : 'QR',
      result,
      reason: failing ? FAIL_REASONS[i % FAIL_REASONS.length] : undefined,
      handledBy: result === 'MANUAL' ? STAFF[i % STAFF.length] : undefined,
    }
  })

/** 아직 처리되지 않은 태깅 실패 — 관리자가 눌러서 통과시켜야 하는 큐 */
const PENDING = TAG_LOGS.filter((t) => t.result === 'FAIL')

const TAG_COLUMNS: Column<TagLog>[] = [
  { key: 'at', header: '시각', width: '96px', align: 'center', sortable: true, value: (r) => r.at },
  { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '82px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'method',
    header: '방식',
    width: '76px',
    align: 'center',
    sortable: true,
    value: (r) => r.method,
    render: (r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 700 }}>
        <Icon name={r.method === 'QR' ? 'qr-code' : 'pencil'} size={13} />
        {r.method}
      </span>
    ),
  },
  { key: 'device', header: '단말', width: '124px', sortable: true, value: (r) => r.device },
  {
    key: 'result',
    header: '결과',
    width: '100px',
    align: 'center',
    sortable: true,
    value: (r) => RESULT_META[r.result].label,
    render: (r) => (
      <span className={`tag-r ${RESULT_META[r.result].cls}`} title={RESULT_META[r.result].desc}>
        {RESULT_META[r.result].label}
      </span>
    ),
  },
  {
    key: 'reason',
    header: '사유',
    width: '116px',
    value: (r) => r.reason ?? '-',
    render: (r) =>
      r.reason ? (
        <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{r.reason}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'handledBy',
    header: '확인자',
    width: '92px',
    value: (r) => r.handledBy ?? '-',
    render: (r) =>
      r.handledBy ? (
        <span style={{ fontSize: 11.5, fontWeight: 700 }}>{r.handledBy}</span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>자동</span>
      ),
  },
]

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function Content() {
  const [tab, setTab] = useState('cal')
  const [masked, setMasked] = useState(true)
  const [closures, setClosures] = useState<Record<number, string>>(INITIAL_CLOSURES)
  const [reason, setReason] = useState(CLOSURE_REASONS[0])
  const [deadlineDays, setDeadlineDays] = useState(3)

  const days = useMemo(() => buildDays(closures), [closures])
  const available = days.filter((d) => d.open)
  const totalOrders = available.reduce((a, d) => a + d.count, 0)
  const closedCount = Object.keys(closures).length

  const stats = useMemo(() => {
    const paid = ORDERS.filter((o) => o.status === '확정')
    return {
      paid: paid.length,
      pending: ORDERS.filter((o) => o.status === '결제대기').length,
      canceled: ORDERS.filter((o) => o.status === '취소완료').length,
      expired: ORDERS.filter((o) => o.status === '만료').length,
      revenue: paid.reduce((a, o) => a + o.amount, 0),
    }
  }, [])

  /** 배식 체크 집계 — 금일 신청자 대비 */
  const check = useMemo(() => {
    const ok = TAG_LOGS.filter((t) => t.result === 'OK').length
    const manual = TAG_LOGS.filter((t) => t.result === 'MANUAL').length
    const ordered = 231
    return {
      ordered,
      ok,
      manual,
      /** QR + 수기 = 실제 배식 확인 인원 */
      confirmed: ok + manual,
      missing: ordered - ok - manual,
      pending: PENDING.length,
      rejected: TAG_LOGS.filter((t) => t.result === 'DUP' || t.result === 'NOORDER').length,
    }
  }, [])

  /** 중단일 토글 — 주말·공휴일은 애초에 운영일이 아니라 손댈 수 없다 */
  function toggleClosure(d: Day) {
    if (d.weekend || d.holiday) return
    setClosures((prev) => {
      const next = { ...prev }
      if (next[d.day]) delete next[d.day]
      else next[d.day] = reason
      return next
    })
  }

  return (
    <div className="p-meal">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-check" size={13} /> 급식 운영일
          </div>
          <div className="v">{available.length}</div>
          <div className="d">
            {DAYS_IN_MONTH}일 중 · 중단 {closedCount}일 반영
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 월 총 식수
          </div>
          <div className="v">{totalOrders.toLocaleString()}</div>
          <div className="d">2026-05</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check-check" size={13} /> 결제 확정
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            {stats.paid}
          </div>
          <div className="d up">{stats.revenue.toLocaleString()}원</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="clock" size={13} /> 가상계좌 대기
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {stats.pending}
          </div>
          <div className="d warn">10분 주기 스케줄러</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="qr-code" size={13} /> 금일 배식 확인
          </div>
          <div className="v">{check.confirmed}</div>
          <div className="d">
            신청 {check.ordered}명 중 · 수기 {check.manual}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 확인 필요
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {check.pending}
          </div>
          <div className="d down">태깅 실패 — 즉시 처리</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'cal', label: '월별 신청 현황' },
            { key: 'schedule', label: '급식 일정 관리', count: closedCount },
            { key: 'check', label: '배식 체크', count: TAG_LOGS.length },
            { key: 'orders', label: '결제 · 취소 내역', count: ORDERS.length },
            { key: 'policy', label: '결제 · 취소 정책' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {/* ═══ 월별 신청 현황 ═══ */}
        {tab === 'cal' && (
          <div className="card-sec-b">
            <div className="cal">
              {DOW.map((d, i) => (
                <div className={`cal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`} key={d}>
                  {d}
                </div>
              ))}
              {Array.from({ length: FIRST_DOW }, (_, i) => (
                <div className="cal-cell pad" key={`pad-${i}`} />
              ))}
              {days.map((d) => (
                <div
                  className={`cal-cell${d.closure ? ' closed' : d.holiday ? ' holiday' : d.weekend ? ' off' : ' on'}`}
                  key={d.day}
                  title={d.closure ?? d.holiday ?? (d.weekend ? '주말' : `${d.count}식`)}
                >
                  <div className="dnum">{d.day}</div>
                  {d.closure ? (
                    <div className="closed-lbl">신청 차단
                      <br />
                      {d.closure}
                    </div>
                  ) : !d.open ? (
                    <div className="off-lbl">{d.holiday ?? '주말'}</div>
                  ) : (
                    <>
                      <div className="cnt">{d.count}</div>
                      <div className="lbl">식</div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="cal-legend">
              <span>
                <span className="sw" style={{ background: 'var(--mint-soft)', border: '1px solid var(--mint-b)' }} />
                급식 운영일
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--line-2)' }} />
                주말 제외
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--red-wash)', border: '1px solid #f3cfc7' }} />
                공휴일 제외
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--amber-wash)', border: '1px solid #f6dcb4' }} />
                관리자 등록 중단일 — 신청 차단
              </span>
              <span style={{ marginLeft: 'auto' }}>주말·공휴일은 자동 제외됩니다</span>
            </div>
          </div>
        )}

        {/* ═══ 급식 일정 관리 ═══ */}
        {tab === 'schedule' && (
          <div className="card-sec-b">
            <div className="note-box">
              <div className="ic">
                <Icon name="calendar-days" size={17} />
              </div>
              <div>
                <div className="tt">중단일로 등록하면 그날은 앱·데스크 모두 신청이 막힙니다</div>
                <div className="tx">
                  날짜를 눌러 <b>운영 ↔ 중단</b>을 전환합니다. 주말·공휴일은 정책상 이미 제외돼 있어 손댈 수 없습니다.
                  <br />
                  <b>이미 결제된 날을 중단으로 바꾸면 해당 건은 전부 환불 대상</b>이 되므로, 서버가 결제건을 확인해 환불
                  배치를 태운 뒤 중단 처리합니다. 화면에서 바로 확정되지 않습니다.
                </div>
              </div>
            </div>

            <div className="frow" style={{ marginBottom: 16 }}>
              <label>중단 사유</label>
              <div className="sf-chips">
                {CLOSURE_REASONS.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={`chip${reason === r ? ' on' : ''}`}
                    onClick={() => setReason(r)}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="cal">
              {DOW.map((d, i) => (
                <div className={`cal-dow${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}`} key={d}>
                  {d}
                </div>
              ))}
              {Array.from({ length: FIRST_DOW }, (_, i) => (
                <div className="cal-cell pad" key={`pad-${i}`} />
              ))}
              {days.map((d) => {
                const locked = d.weekend || Boolean(d.holiday)
                return (
                  <button
                    type="button"
                    className={`cal-cell editable${d.closure ? ' closed' : d.holiday ? ' holiday' : d.weekend ? ' off' : ' on'}`}
                    key={d.day}
                    disabled={locked}
                    onClick={() => toggleClosure(d)}
                    title={
                      locked
                        ? '주말·공휴일은 정책상 자동 제외'
                        : d.closure
                          ? `중단 해제 (현재 사유: ${d.closure})`
                          : `${reason} 사유로 중단 등록`
                    }
                  >
                    <div className="dnum">{d.day}</div>
                    {d.closure ? (
                      <div className="closed-lbl">중단
                        <br />
                        {d.closure}
                      </div>
                    ) : locked ? (
                      <div className="off-lbl">{d.holiday ?? '주말'}</div>
                    ) : (
                      <>
                        <div className="cnt">{d.count}</div>
                        <div className="lbl">신청 가능</div>
                      </>
                    )}
                  </button>
                )
              })}
            </div>

            <div className="track-grid" style={{ marginTop: 18 }}>
              <div className="track">
                <div className="th" style={{ color: 'var(--mint-d)' }}>
                  <Icon name="timer" size={15} /> 신청 마감 규칙
                </div>
                <div className="frow" style={{ marginTop: 4, marginBottom: 8 }}>
                  <label>마감</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12.5 }}>이용일</span>
                    <select
                      className="sel"
                      style={{ width: 78 }}
                      value={deadlineDays}
                      onChange={(e) => setDeadlineDays(Number(e.target.value))}
                    >
                      {[1, 2, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          D-{n}
                        </option>
                      ))}
                    </select>
                    <span style={{ fontSize: 12.5 }}>23:59까지</span>
                  </div>
                </div>
                <ul>
                  <li>
                    앱 신청·취소 모두 <b>이용일 {deadlineDays}일 전</b>까지
                  </li>
                  <li>마감 후에는 데스크 당일 신청만 가능</li>
                  <li>마감 하루 전 알림톡 자동 발송</li>
                </ul>
              </div>

              <div className="track desk">
                <div className="th" style={{ color: 'var(--amber)' }}>
                  <Icon name="calendar-range" size={15} /> 월 접수 기간
                </div>
                <div className="two" style={{ margin: '4px 0 10px' }}>
                  <input className="inp" type="date" defaultValue="2026-05-18" />
                  <input className="inp" type="date" defaultValue="2026-05-27" />
                </div>
                <ul>
                  <li>기간 밖에는 다음 달 신청 화면이 열리지 않음</li>
                  <li>접수 시작 시 앱 푸시 자동 발송</li>
                  <li>급식업체 식수 통보 마감과 일치시킬 것</li>
                </ul>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn">되돌리기</button>
              <button className="btn pri">
                <Icon name="save" size={14} /> 일정 저장 · 신청 차단 반영
              </button>
            </div>
          </div>
        )}

        {/* ═══ 배식 체크 ═══ */}
        {tab === 'check' && (
          <div className="card-sec-b">
            <div className="note-box">
              <div className="ic">
                <Icon name="qr-code" size={17} />
              </div>
              <div>
                <div className="tt">학생이 본인 휴대폰 QR을 찍고, 관리자가 그 결과를 확인합니다</div>
                <div className="tx">
                  배식대 입구에서 <b>학생이 앱에서 QR을 꺼내 스캐너에 태깅</b>하면 스캐너 화면과 관리자 태블릿에 즉시 결과가
                  뜹니다. 관리자는 옆에서 <b>통과 / 거부를 확인</b>하는 역할입니다.
                  <br />
                  <b>태깅이 안 되는 경우가 반드시 생깁니다</b> — 앱 미설치, 휴대폰 미소지, QR 만료, 인식 실패, 단말 오프라인.
                  배식 줄을 세워둘 수 없으므로 관리자가 <b>학번으로 조회해 수기 확인</b>으로 즉시 통과시키고, 사유와 확인자를
                  기록으로 남깁니다.
                </div>
              </div>
            </div>

            {/* ── 태깅 실패 처리 큐 — 지금 줄 서 있는 학생들 ── */}
            {check.pending > 0 && (
              <div className="card-sec" style={{ border: '1.5px solid #f3cfc7', marginBottom: 14 }}>
                <div className="card-sec-h" style={{ background: 'var(--red-wash)', borderRadius: '16px 16px 0 0' }}>
                  <div className="t" style={{ color: 'var(--red)' }}>
                    <span className="ico" style={{ color: 'var(--red)' }}>
                      <Icon name="triangle-alert" size={15} />
                    </span>
                    확인 필요 — 태깅 실패 {check.pending}건
                  </div>
                  <div className="r">
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      배식대에서 대기 중입니다. 학번 확인 후 통과시키세요.
                    </span>
                  </div>
                </div>
                <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {PENDING.map((p) => (
                    <div
                      key={p.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '11px 13px',
                        border: '1px solid var(--line)',
                        borderRadius: 11,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', fontFamily: 'ui-monospace, monospace' }}>
                        {p.at}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>
                        {masked ? `${p.name[0]}*${p.name.slice(2)}` : p.name}
                      </span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                        {p.studentNo} · {p.classNo}
                      </span>
                      <span className="tag-r fail">{p.reason}</span>
                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                        <button className="btn pri" style={{ padding: '6px 12px', fontSize: 12 }}>
                          <Icon name="check" size={13} /> 수기 확인 통과
                        </button>
                        <button className="btn" style={{ padding: '6px 12px', fontSize: 12, color: 'var(--red)' }}>
                          거부
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="dev-grid">
              {DEVICES.map((d) => (
                <div className={`dev${d.online ? '' : ' off'}`} key={d.id}>
                  <div className="dh">
                    <Icon name={d.role === '학생 QR 스캐너' ? 'qr-code' : 'monitor'} size={15} />
                    <b>{d.name}</b>
                    <span className="dot" title={d.online ? '연결됨' : '오프라인'} />
                  </div>
                  <div className="dm">
                    <code style={{ fontSize: 10 }}>{d.id}</code> · {d.place}
                    <br />
                    역할 <b>{d.role}</b>
                    <br />
                    {d.online ? (
                      <>
                        마지막 처리 <b>{d.lastTagAt}</b> · 금일 <b>{d.todayCount}</b>건
                      </>
                    ) : (
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>
                        오프라인 — {d.lastTagAt} 이후 응답 없음 · 이 줄은 수기 확인으로 처리
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="stat-strip" style={{ marginBottom: 16 }}>
              <div className="stat">
                <div className="l">
                  <Icon name="utensils" size={13} /> 금일 신청
                </div>
                <div className="v">{check.ordered}</div>
                <div className="d">2026-05-28</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="qr-code" size={13} /> QR 확인
                </div>
                <div className="v" style={{ color: 'var(--green)' }}>
                  {check.ok}
                </div>
                <div className="d up">학생 본인 태깅</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="pencil" size={13} /> 수기 확인
                </div>
                <div className="v" style={{ color: 'var(--blue)' }}>
                  {check.manual}
                </div>
                <div className="d">
                  전체 확인의 {Math.round((check.manual / Math.max(1, check.confirmed)) * 100)}%
                </div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="user-x" size={13} /> 미체크
                </div>
                <div className="v" style={{ color: 'var(--red)' }}>
                  {check.missing}
                </div>
                <div className="d down">신청했으나 미방문</div>
              </div>
              <div className="stat">
                <div className="l">
                  <Icon name="shield-off" size={13} /> 거부
                </div>
                <div className="v" style={{ color: 'var(--amber)' }}>
                  {check.rejected}
                </div>
                <div className="d warn">중복 · 미신청</div>
              </div>
            </div>

            <DataTable
              columns={TAG_COLUMNS}
              rows={TAG_LOGS}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  금일 태깅 <b>{TAG_LOGS.length}</b>건 · 배식시간 11:50~13:10
                </>
              }
              toolbar={
                <>
                  <button className="btn">
                    <Icon name="user-x" size={14} /> 미체크자 조회
                  </button>
                  <button className="btn">
                    <Icon name="search" size={14} /> 학번으로 수기 확인
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="급식_배식체크" columns={TAG_COLUMNS} rows={TAG_LOGS} masked={masked} />
                </>
              }
            />

            <div className="blocked-note" style={{ marginTop: 14, marginBottom: 0 }}>
              <div className="ic">
                <Icon name="triangle-alert" size={17} />
              </div>
              <div>
                <div className="tt">QR은 반드시 짧은 만료의 1회용 토큰이어야 합니다</div>
                <div className="tx">
                  학번을 인코딩한 <b>정적 QR을 쓰면 캡처 한 장으로 대리 수령</b>이 됩니다. 앱이 <b>30초 내외로 회전하는
                  토큰</b>을 발급하고 서버가 1회 사용 후 소진시켜야 합니다.
                  <br />
                  <code>I-18</code>(식사체크 방식)과 <code>D-2</code>(단말 제어 주체)가 아직 열려 있습니다. 요구사항정의서
                  0723 메모에는 <b>체크 주체가 관리자</b>로 적혀 있으나 실제 운영은 <b>학생 QR 제시 + 관리자 확인</b>이므로,
                  I-18 종결 시 이 내용으로 확정해야 합니다. 태깅 수신은 출결과 같은{' '}
                  <b>Webhook 직접 수신(HMAC 서명검증)</b> 구조를 재사용합니다.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ 결제 · 취소 내역 ═══ */}
        {tab === 'orders' && (
          <div style={{ padding: 14 }}>
            <DataTable
              columns={COLUMNS}
              rows={ORDERS}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  2026-05 주문 <b>{ORDERS.length}</b>건
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="급식_결제내역" columns={COLUMNS} rows={ORDERS} masked={masked} />
                </>
              }
            />
          </div>
        )}

        {/* ═══ 결제 · 취소 정책 ═══ */}
        {tab === 'policy' && (
          <div className="card-sec-b">
            <div className="track-grid">
              <div className="track">
                <div className="th" style={{ color: 'var(--violet)' }}>
                  <Icon name="smartphone" size={15} /> 앱 취소 (학생·학부모)
                </div>
                <ul>
                  <li>
                    이용일 <b>{deadlineDays}일 전까지</b>만 취소 가능
                  </li>
                  <li>
                    취소 시 <b>PG 자동환불</b> 처리
                  </li>
                  <li>급식업체에 취소 자동 전달</li>
                  <li>수납에 자동 반영</li>
                </ul>
              </div>
              <div className="track desk">
                <div className="th" style={{ color: 'var(--amber)' }}>
                  <Icon name="monitor" size={15} /> 데스크 취소 (관리자)
                </div>
                <ul>
                  <li>
                    <b>기간 제한 없이 즉시</b> 취소
                  </li>
                  <li>환불은 데스크에서 개별 처리</li>
                  <li>
                    데스크 당일 신청은 앱 월말 일괄과 <b>별개 flow</b>
                  </li>
                  <li>당일 신청은 데스크에서 직접 등록</li>
                </ul>
              </div>
            </div>

            <div className="track" style={{ marginTop: 12 }}>
              <div className="th" style={{ color: 'var(--red)' }}>
                <Icon name="calendar-days" size={15} /> 중단일 등록으로 인한 취소
              </div>
              <ul>
                <li>
                  관리자가 <b>운영일 → 중단일</b>로 바꾸면 해당일 결제건은 전액 환불 대상
                </li>
                <li>
                  화면 저장 즉시 확정되지 않고, 서버가 <b>결제건 확인 → 환불 배치 → 중단 확정</b> 순으로 처리
                </li>
                <li>환불 실패 건은 데스크 수기 처리 목록으로 넘어감</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export const mealMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05 ▾</button>
      <button className="btn">
        <Icon name="utensils" size={14} /> 식수 마감
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 데스크 당일 신청
      </button>
    </>
  ),
}
