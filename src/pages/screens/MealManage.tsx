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
 * PG사는 급식업체가 이미 쓰는 곳과 연동한다 — 신규 선정 대상이 아니다(E-3은 정보 수급 건). */

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

interface Day {
  day: number
  dow: number
  weekend: boolean
  holiday?: string
  count: number
}

const DAYS: Day[] = Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
  const day = i + 1
  const dow = (FIRST_DOW + i) % 7
  const weekend = dow === 0 || dow === 6
  const holiday = HOLIDAYS[day]
  return {
    day,
    dow,
    weekend,
    holiday,
    count: weekend || holiday ? 0 : 190 + ((day * 17) % 70),
  }
})

const AVAILABLE = DAYS.filter((d) => !d.weekend && !d.holiday)
const TOTAL_ORDERS = AVAILABLE.reduce((a, d) => a + d.count, 0)

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

const DOW = ['일', '월', '화', '수', '목', '금', '토']

function Content() {
  const [tab, setTab] = useState('cal')
  const [masked, setMasked] = useState(true)

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

  return (
    <div className="p-meal">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-check" size={13} /> 급식 가능일
          </div>
          <div className="v">{AVAILABLE.length}</div>
          <div className="d">
            {DAYS_IN_MONTH}일 중 · 주말·공휴일 제외
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 월 총 식수
          </div>
          <div className="v">{TOTAL_ORDERS.toLocaleString()}</div>
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
            <Icon name="x" size={13} /> 취소
          </div>
          <div className="v">{stats.canceled}</div>
          <div className="d">앱 / 데스크</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 만료
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {stats.expired}
          </div>
          <div className="d down">입금 기한 초과</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'cal', label: '월별 신청 현황' },
            { key: 'orders', label: '결제 · 취소 내역', count: ORDERS.length },
            { key: 'policy', label: '결제 · 취소 정책' },
          ]}
          active={tab}
          onChange={setTab}
        />

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
              {DAYS.map((d) => {
                const off = d.weekend || Boolean(d.holiday)
                return (
                  <div
                    className={`cal-cell${d.holiday ? ' holiday' : off ? ' off' : ' on'}`}
                    key={d.day}
                    title={d.holiday ?? (d.weekend ? '주말' : `${d.count}식`)}
                  >
                    <div className="dnum">{d.day}</div>
                    {off ? (
                      <div className="off-lbl">{d.holiday ?? '주말'}</div>
                    ) : (
                      <>
                        <div className="cnt">{d.count}</div>
                        <div className="lbl">식</div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="cal-legend">
              <span>
                <span className="sw" style={{ background: 'var(--mint-soft)', border: '1px solid var(--mint-b)' }} />
                급식 가능일
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--line-2)' }} />
                주말 제외
              </span>
              <span>
                <span className="sw" style={{ background: 'var(--red-wash)', border: '1px solid #f3cfc7' }} />
                공휴일 제외
              </span>
              <span style={{ marginLeft: 'auto' }}>
주말·공휴일은 자동으로 제외됩니다
              </span>
            </div>
          </div>
        )}

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

        {tab === 'policy' && (
          <div className="card-sec-b">
            <div className="track-grid">
              <div className="track">
                <div className="th" style={{ color: 'var(--violet)' }}>
                  <Icon name="smartphone" size={15} /> 앱 취소 (학생·학부모)
                </div>
                <ul>
                  <li>이용일 <b>3일 전까지</b>만 취소 가능</li>
                  <li>취소 시 <b>PG 자동환불</b> 처리</li>
                  <li>급식업체에 취소 자동 전달</li>
                  <li>수납에 자동 반영</li>
                </ul>
              </div>
              <div className="track desk">
                <div className="th" style={{ color: 'var(--amber)' }}>
                  <Icon name="monitor" size={15} /> 데스크 취소 (관리자)
                </div>
                <ul>
                  <li><b>기간 제한 없이 즉시</b> 취소</li>
                  <li>환불은 데스크에서 개별 처리</li>
                  <li>데스크 당일 신청은 앱 월말 일괄과 <b>별개 flow</b></li>
                  <li>당일 신청은 데스크에서 직접 등록</li>
                </ul>
              </div>
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
