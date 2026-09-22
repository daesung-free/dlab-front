import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  type Column,
  type DateRangeValue,
  type Field,
  type SearchValues,
  Modal,
  todayStr,
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  BILLING_STATUS_LABEL,
  paymentLabel,
  BILLING_TYPE_LABEL,
  PAY_METHOD_LABEL,
  createBilling,
  deleteBilling,
  deletePayment,
  getReceiptSummary,
  listReceiptStatus,
  recordPayment,
  type BillingType,
  type PayMethod,
  type ReceiptRow,
  type ReceiptSummary,
} from '../../api/billing'
import { SEAT_TYPE_LABEL, getFeeTable, issueMonthlyBilling, type FeeTableRow, type SeatType } from '../../api/tuition'
import { GRADE_LABEL, searchStudents, type Student } from '../../api/students'
import type { Mockup } from './types'
import './payment.css'

/* F-4.8 수납현황 — /api/v1/admin/receipt-status
 *
 * 탭 3개 중 둘만 실연동이다.
 *   · 통합 매출장 · 미납자 관리 → /receipt-status (+ summary)
 *   · 할인 정책              → **API 없음.** 목업 그대로 둔다(아래 참고)
 *
 * ★ 청구 1건 = 한 달분이다. 한 학생이 여러 달 밀리면 행이 여러 개가 되므로
 *   '미납 건수'와 '미납 학생 수'가 다르다 — 서버 주석에도 그렇게 적혀 있다.
 *
 * ★ 결제 '거래' 축이 payments[] 로 들어왔다(2026-09-03). 결제일자·전표번호·결제수단을
 *   실제 값으로 그린다. **취소분은 빠져 있다** — 취소까지 세면 화면의 결제수단이
 *   "지금 실제로 결제된 수단"과 어긋나기 때문이다(서버 주석).
 *
 * ★ 한 청구에 결제가 여러 건일 수 있다(부분납). 컬럼은 마지막 결제를 대표로 보여주고
 *   여러 건이면 그 사실을 표시한다 — 합계는 receivedAmount 가 이미 갖고 있다.
 *
 * ★ 청구 등록·수납·취소를 여기에 붙였다(2026-09-14). 표는 조회용으로 두고 **모두 모달**이다.
 *   교습비는 `POST /tuition/billings/monthly` 로 만든다 — 금액을 화면이 정하지 않고
 *   단가표와 교습일수를 서버가 본다. 그 밖(특강비·급식비·예외)은 금액을 직접 적는
 *   `POST /billings` 다. 둘을 바꿔 쓰면 단가표와 어긋난 금액이 조용히 들어간다.
 *
 * ★ 청구 취소는 **수납 거래를 먼저 지우고** 청구를 취소한다. 서버도 2026-09-16 부터
 *   같은 순서를 강제한다(수납이 남아 있으면 400). 그래도 모달이 수납액을 먼저 보여준다 —
 *   취소는 되돌릴 수 없고, 얼마가 함께 사라지는지는 누르기 전에 알아야 한다.
 *
 * ★ 아직 없는 것: 지점(행에는 없다. 조회가 지점 단위라 헤더로 대신한다).
 *
 * ★ 지점은 행에 없지만 조회 자체가 지점 단위다(academyId). 선택한 지점을 헤더에 보여준다.
 *   검색폼에 있던 '지점' 칸은 **뺐다** — 어디에도 안 쓰이는 칸이었고 값도 실재하지 않는
 *   지점(대치·평촌)이었다. 지점은 상단바에서 고른다. */

type Method = '카드' | '가상계좌' | '현금'
type Kind = '등록비' | '교습비' | '특강비' | '급식비'

/**
 * 청구 등록 입력.
 *
 * ★ `mode` 로 **경로가 갈린다.** 교습비는 단가표를 서버가 보는 `monthly`,
 *   그 밖은 금액을 직접 적는 `etc` 다. 한 모달에 담되 섞이지 않게 갈라 둔다.
 */
interface IssueDraft {
  mode: 'monthly' | 'etc'
  enrollmentId: string
  /** monthly */
  month: string
  seatType: SeatType
  discountRate: string
  /** etc */
  name: string
  billingType: BillingType
  suppliedAmount: string
  discountAmount: string
  /** 공통 */
  dueDate: string
}

function thisMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const EMPTY_ISSUE: IssueDraft = {
  mode: 'monthly',
  enrollmentId: '',
  month: thisMonth(),
  seatType: 'GENERAL',
  discountRate: '',
  name: '',
  billingType: 'LECTURE',
  suppliedAmount: '',
  discountAmount: '',
  dueDate: '',
}

const KINDS: Kind[] = ['등록비', '교습비', '특강비', '급식비']
const METHODS: Method[] = ['카드', '가상계좌', '현금']

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'period', label: '결제 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '이름 · 학번 · 전표번호', placeholder: '예: 이승민 / DS-2026-010001', span: 2 },
  { type: 'select', name: 'round', label: '청구기수', options: ['1기', '2기', '3기'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'kind', label: '항목', options: KINDS, multiple: true },
  { type: 'chips', name: 'method', label: '결제수단', options: METHODS, multiple: true },
]

/* ★ '상태' 열은 두 축이 겹쳐 있다.
 *   - 납부 진행도(미납·부분 납부·완납)는 **금액**에서 나온다. 서버 enum 에 PARTIAL 이 없다.
 *   - 청구 생애주기(취소·기한 만료·환불)는 status 에서 나온다.
 *   목업이 열 하나라 생애주기가 종료된 건만 status 를 보여주고, 그 밖에는 금액으로 판정한다.
 *   status 만 찍었더니 절반 납부된 4건이 '미납'과 구분되지 않았다. */
const TERMINAL_STATUS = new Set(['CANCELLED', 'EXPIRED', 'REFUNDED'])

function statusText(r: ReceiptRow): string {
  if (TERMINAL_STATUS.has(r.status)) return BILLING_STATUS_LABEL[r.status] ?? r.status
  return paymentLabel(r)
}

const STATUS_TONE: Record<string, string> = {
  완납: 'verified',
  '부분 납부': 'supplement',
  미납: 'brandnew',
}

const wonOf = (n: number) => `${n.toLocaleString()}원`

/** 목업의 항목 이름 → 서버 billingType. 등록비는 서버에 대응 값이 없어 기타로 간다 */
const METHOD_TO_CODE: Record<Method, PayMethod> = { 카드: 'CARD', 가상계좌: 'VBANK', 현금: 'CASH' }

const KIND_TO_TYPE: Record<Kind, BillingType> = {
  등록비: 'ETC',
  교습비: 'TUITION',
  특강비: 'LECTURE',
  급식비: 'MEAL',
}

/** 대표 결제 = 마지막 거래. 부분납이면 여러 건이라 개수를 함께 보여준다 */
const lastPayment = (r: ReceiptRow) => (r.payments.length > 0 ? r.payments[r.payments.length - 1] : null)

const COLUMNS: Column<ReceiptRow>[] = [
  {
    key: 'paidAt',
    header: '결제일자',
    width: '110px',
    value: (r) => lastPayment(r)?.paidAt ?? '',
    render: (r) => {
      const p = lastPayment(r)
      if (!p) return <span style={{ color: 'var(--muted)' }}>-</span>
      return (
        <>
          {p.paidAt.slice(0, 10)}
          {r.payments.length > 1 && (
            <span style={{ color: 'var(--muted)', fontSize: 11 }} title={`결제 ${r.payments.length}건`}>
              {' '}
              +{r.payments.length - 1}
            </span>
          )}
        </>
      )
    },
  },
  {
    key: 'voucherNo',
    header: '전표번호',
    width: '150px',
    value: (r) => lastPayment(r)?.pgTid ?? '',
    render: (r) => {
      const p = lastPayment(r)
      // 가상계좌·현금은 PG 거래번호가 없다
      if (!p?.pgTid) return <span style={{ color: 'var(--muted)' }}>-</span>
      return <code style={{ fontSize: 11 }}>{p.pgTid}</code>
    },
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
  { key: 'serviceMonth', header: '대상월', width: '84px', align: 'center', value: (r) => r.serviceMonth ?? '-' },
  {
    key: 'billingType',
    header: '항목',
    width: '82px',
    align: 'center',
    value: (r) => BILLING_TYPE_LABEL[r.billingType] ?? r.billingType,
    render: (r) => <span className="mk supplement">{BILLING_TYPE_LABEL[r.billingType] ?? r.billingType}</span>,
  },
  {
    key: 'method',
    header: '결제수단',
    width: '96px',
    align: 'center',
    value: (r) => [...new Set(r.payments.map((p) => p.method))].join(', '),
    render: (r) => {
      const methods = [...new Set(r.payments.map((p) => PAY_METHOD_LABEL[p.method] ?? p.method))]
      return methods.length > 0 ? methods.join(', ') : <span style={{ color: 'var(--muted)' }}>-</span>
    },
  },
  { key: 'year', header: '기수', width: '68px', align: 'center', value: (r) => r.year ?? '-' },
  { key: 'billedAmount', header: '청구액', width: '106px', align: 'right', value: (r) => r.billedAmount, render: (r) => wonOf(r.billedAmount) },
  {
    key: 'receivedAmount',
    header: '수납액',
    width: '106px',
    align: 'right',
    value: (r) => r.receivedAmount,
    render: (r) => (
      <span style={{ color: r.unpaid === 0 ? 'var(--ink)' : 'var(--red)', fontWeight: 700 }}>
        {wonOf(r.receivedAmount)}
      </span>
    ),
  },
  { key: 'dueDate', header: '납기일', width: '100px', align: 'center', value: (r) => r.dueDate ?? '-' },
  {
    key: 'status',
    header: '상태',
    width: '76px',
    align: 'center',
    value: (r) => statusText(r),
    render: (r) => {
      const t = statusText(r)
      return <span className={`mk ${STATUS_TONE[t] ?? ''}`}>{t}</span>
    },
  },
]

const UNPAID_COLUMNS: Column<ReceiptRow>[] = [
  ...COLUMNS.slice(2, 10),
  {
    key: 'unpaid',
    header: '미납액',
    width: '110px',
    align: 'right',
    value: (r) => r.unpaid,
    render: (r) => <b style={{ color: 'var(--red)', fontWeight: 800 }}>{wonOf(r.unpaid)}</b>,
  },
  {
    key: 'act',
    header: '',
    width: '104px',
    align: 'center',
    value: () => '',
    render: () => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled data-soon title="준비 중입니다">
        <Icon name="bell" size={12} /> 알림톡
      </button>
    ),
  },
]

/* ══ 할인 정책 ══
 *
 * ⚠ 지금 문제 — 앱/웹 온라인 결제에서 할인이 반영되지 않는다.
 *   KCP 연동 자체는 됐는데 그 앞단(학원 시스템)이 할인 없는 '정가'를 그대로 넘기고 있다.
 *   즉 결제창에 정가가 뜨고, 할인은 나중에 수기 환불로 메꾸는 상태.
 *   → 결제 요청을 만들기 전에 할인을 적용해 '실제 청구액'을 산출하는 단계가 필요하다.
 *
 * ⚠ 계산 주체는 서버다. 이 화면은 정책을 입력하고 결과를 확인하는 곳이다.
 *   프론트가 계산한 금액을 그대로 KCP에 넘기면 결제 금액을 조작할 수 있다.
 *   서버가 같은 정책으로 재계산해 일치할 때만 결제창을 띄워야 한다.
 *
 * ⚠ 적용 순서가 금액을 바꾼다.
 *   정률 → 정액 순서와 정액 → 정률 순서의 결과가 다르므로 order를 정책에 못박는다. */

type DiscountKind = '장학' | '형제' | '조기납부' | '재등록' | '쿠폰' | '기타'
type DiscountMethod = 'RATE' | 'AMOUNT'

const DKIND_TONE: Record<DiscountKind, string> = {
  장학: 'verified',
  형제: 'supplement',
  조기납부: 'supplement',
  재등록: 'verified',
  쿠폰: 'brandnew',
  기타: 'brandnew',
}

interface Discount {
  id: string
  code: string
  name: string
  kind: DiscountKind
  /** 적용 대상 청구 항목 */
  targets: Kind[]
  method: DiscountMethod
  /** RATE면 %, AMOUNT면 원 */
  value: number
  /** 적용 순서 — 작을수록 먼저. 순서가 최종금액을 바꾼다 */
  order: number
  /** 다른 할인과 중복 적용 허용 */
  stackable: boolean
  from: string
  to: string
  active: boolean
}

const DISCOUNTS: Discount[] = [
  { id: 'd1', code: 'SCH_SAT100', name: '수능 성적 장학 100%', kind: '장학', targets: ['교습비'], method: 'RATE', value: 100, order: 1, stackable: false, from: '2026-01-01', to: '2026-12-31', active: true },
  { id: 'd2', code: 'SCH_MOCK50', name: '평가원 성적 장학 50%', kind: '장학', targets: ['교습비'], method: 'RATE', value: 50, order: 1, stackable: false, from: '2026-01-01', to: '2026-12-31', active: true },
  { id: 'd3', code: 'SIBLING', name: '형제 할인 10%', kind: '형제', targets: ['교습비', '급식비'], method: 'RATE', value: 10, order: 2, stackable: true, from: '2026-01-01', to: '2026-12-31', active: true },
  { id: 'd4', code: 'REENROLL', name: '재등록 할인 5%', kind: '재등록', targets: ['교습비'], method: 'RATE', value: 5, order: 3, stackable: true, from: '2026-01-01', to: '2026-12-31', active: true },
  { id: 'd5', code: 'EARLYBIRD', name: '조기납부 30,000원', kind: '조기납부', targets: ['교습비'], method: 'AMOUNT', value: 30000, order: 4, stackable: true, from: '2026-05-01', to: '2026-06-10', active: true },
  { id: 'd6', code: 'CPN_50K', name: '설명회 쿠폰 50,000원', kind: '쿠폰', targets: ['등록비'], method: 'AMOUNT', value: 50000, order: 5, stackable: true, from: '2026-05-01', to: '2026-07-31', active: true },
  { id: 'd7', code: 'CPN_LEGACY', name: '2025 프로모션 쿠폰', kind: '쿠폰', targets: ['등록비'], method: 'AMOUNT', value: 30000, order: 5, stackable: true, from: '2025-09-01', to: '2025-12-31', active: false },
]

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`

interface CalcStep {
  d: Discount
  applied: boolean
  /** 미적용 사유 */
  reason?: string
  cut: number
  after: number
}

/**
 * 할인 계산 — order 순서대로 잔액에 적용한다.
 * 중복 불가(stackable=false) 정책이 하나 적용되면 이후 정책은 전부 막힌다.
 */
function calcDiscount(base: number, kind: Kind, picked: string[]): { steps: CalcStep[]; final: number } {
  const steps: CalcStep[] = []
  let cur = base
  let exclusiveUsed = false

  for (const d of [...DISCOUNTS].sort((a, b) => a.order - b.order)) {
    if (!picked.includes(d.id)) continue

    let reason: string | undefined
    if (!d.active) reason = '중지된 정책'
    else if (!d.targets.includes(kind)) reason = `적용 대상 아님 (${d.targets.join('·')})`
    else if (exclusiveUsed) reason = '중복 불가 할인이 이미 적용됨'

    if (reason) {
      steps.push({ d, applied: false, reason, cut: 0, after: cur })
      continue
    }

    const cut = d.method === 'RATE' ? Math.round((cur * d.value) / 100) : Math.min(cur, d.value)
    cur -= cut
    if (!d.stackable) exclusiveUsed = true
    steps.push({ d, applied: true, cut, after: cur })
  }

  return { steps, final: Math.max(0, cur) }
}

const BASE_PRICE: Record<Kind, number> = {
  등록비: 500000,
  교습비: 1_450_000,
  특강비: 320000,
  급식비: 117000,
}

const DISCOUNT_COLUMNS: Column<Discount>[] = [
  { key: 'order', header: '순서', width: '58px', align: 'center', sortable: true, value: (r) => r.order },
  {
    key: 'code',
    header: '코드',
    width: '124px',
    value: (r) => r.code,
    render: (_r, v) => <code style={{ fontSize: 10.5 }}>{v}</code>,
  },
  { key: 'name', header: '할인명', sortable: true, value: (r) => r.name },
  {
    key: 'kind',
    header: '유형',
    width: '82px',
    align: 'center',
    sortable: true,
    value: (r) => r.kind,
    render: (r) => <span className={`mk ${DKIND_TONE[r.kind]}`}>{r.kind}</span>,
  },
  { key: 'targets', header: '적용 대상', width: '132px', value: (r) => r.targets.join(' · ') },
  {
    key: 'value',
    header: '할인',
    width: '96px',
    align: 'right',
    sortable: true,
    value: (r) => r.value,
    render: (r) => <b>{r.method === 'RATE' ? `${r.value}%` : won(r.value)}</b>,
  },
  {
    key: 'stackable',
    header: '중복',
    width: '76px',
    align: 'center',
    value: (r) => (r.stackable ? '허용' : '불가'),
    render: (r) => (
      <span className={`mk ${r.stackable ? 'supplement' : 'brandnew'}`}>{r.stackable ? '허용' : '단독'}</span>
    ),
  },
  { key: 'period', header: '유효기간', width: '164px', value: (r) => `${r.from} ~ ${r.to}` },
  {
    key: 'active',
    header: '상태',
    width: '72px',
    align: 'center',
    sortable: true,
    value: (r) => (r.active ? '사용' : '중지'),
    render: (r) => <span className={`mk ${r.active ? 'verified' : 'brandnew'}`}>{r.active ? '사용' : '중지'}</span>,
  },
  {
    key: 'act',
    header: '',
    width: '92px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled data-soon title="준비 중입니다">
          수정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }} disabled data-soon title="준비 중입니다">
          삭제
        </button>
      </div>
    ),
  },
]

function Content() {
  const [query, setQuery] = useState<SearchValues>({})
  const [masked, setMasked] = useState(true)
  const [tab, setTab] = useState('all')

  /* 할인 계산기 */
  const [calcKind, setCalcKind] = useState<Kind>('교습비')
  const [calcBase, setCalcBase] = useState(BASE_PRICE['교습비'])
  const [picked, setPicked] = useState<string[]>(['d3', 'd4', 'd5'])
  const calc = useMemo(() => calcDiscount(calcBase, calcKind, picked), [calcBase, calcKind, picked])

  /* ── 실연동: 수납현황 ── */
  const { academyId } = useAcademy()
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [summary, setSummary] = useState<ReceiptSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const period = query.period as DateRangeValue | undefined
  const params = useMemo(() => {
    const kind = query.kind
    // chips 는 배열이다. 서버는 type 하나만 받는다 — 하나일 때만 보내고, 여럿이면 전부 받아 화면에서 거른다.
    // (예전에는 첫 값만 보내 '교습비 + 급식비' 가 교습비만 나왔다)
    const type = Array.isArray(kind) && kind.length === 1 ? (KIND_TO_TYPE[kind[0] as Kind] ?? undefined) : undefined
    return {
      // 연도를 2026 으로 박아 두었었다 — 해가 바뀌면 조용히 작년 것을 보여준다. 기간 시작일의 해를 쓴다
      year: period?.from ? Number(period.from.slice(0, 4)) : new Date().getFullYear(),
      academyId: academyId ?? undefined,
      from: period?.from || undefined,
      to: period?.to || undefined,
      type,
    }
  }, [academyId, period?.from, period?.to, query.kind])

  const load = useCallback(async () => {
    /* ★ 지점을 고르기 전에는 부르지 않는다. 예전에는 academyId 없이 먼저 던지고
         고른 뒤 다시 던져서, **화면에 들어갈 때마다 400 이 두 건씩** 쌓였다.
         화면은 결과적으로 정상으로 보여 아무도 몰랐다. */
    if (academyId === null) {
      setRows([])
      setSummary(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [list, sum] = await Promise.all([listReceiptStatus(params), getReceiptSummary(params)])
      setRows(list)
      setSummary(sum)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '수납현황을 불러오지 못했습니다.')
      setRows([])
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => {
    void load()
  }, [load])

  // 미납은 서버 조건(unpaidOnly)이 있지만, 같은 조회 결과에서 걸러도 값이 같다.
  // 요청을 하나 아끼려고 여기서 거른다 — unpaid 는 서버가 계산해준 값이다.
  /* 서버가 안 받는 조건(검색어 · 결제수단 · 항목 여럿)은 여기서 거른다. 이 목록은 서버가 조건 안의
     전량을 주므로 화면에서 걸러도 빠지는 줄이 없다. ★ 청구기수는 뜻이 정해지지 않아 아직 안 먹는다 */
  const filtered = useMemo(() => {
    const kw = typeof query.keyword === 'string' ? query.keyword.trim() : ''
    const kinds = Array.isArray(query.kind) ? (query.kind as Kind[]) : []
    const methods = Array.isArray(query.method) ? (query.method as Method[]).map((m) => METHOD_TO_CODE[m]) : []
    return rows.filter(
      (r) =>
        (kw === '' ||
          r.studentName.includes(kw) ||
          (r.studentNo ?? '').includes(kw) ||
          r.name.includes(kw) ||
          String(r.billingId) === kw) &&
        (kinds.length < 2 || kinds.some((k) => KIND_TO_TYPE[k] === r.billingType)) &&
        (methods.length === 0 || r.payments.some((p) => methods.includes(p.method))),
    )
  }, [rows, query.keyword, query.kind, query.method])
  /** 화면에서 걸렀으면 서버 요약과 줄이 달라진다 — 그때는 합계를 걸러진 줄로 낸다 */
  const clientFiltered = filtered.length !== rows.length

  const unpaid = useMemo(() => filtered.filter((r) => r.unpaid > 0), [filtered])

  /* ── 청구 등록 · 수납 · 취소 ── */

  const [students, setStudents] = useState<Student[]>([])
  const [issueOpen, setIssueOpen] = useState(false)
  const [issue, setIssue] = useState<IssueDraft>(EMPTY_ISSUE)
  const [pay, setPay] = useState<{ row: ReceiptRow; amount: string; method: PayMethod } | null>(null)
  const [cancelRow, setCancelRow] = useState<ReceiptRow | null>(null)
  const [actBusy, setActBusy] = useState(false)
  const [actErr, setActErr] = useState<string | null>(null)
  const [actDone, setActDone] = useState<string | null>(null)
  /* 교습비는 서버가 금액을 정한다. 그 값을 등록 전에 보여주지 않으면 얼마가 청구될지
     모르고 누르게 된다 — 단가표를 미리 읽어 합계를 띄운다 */
  /* 미납자 표의 체크박스. DataTable 은 selectable 만으로는 못 켜진다 —
     selected/onSelectedChange 를 안 주면 값이 undefined 로 고정돼 **눌러도 안 찍힌다** */
  const [unpaidSel, setUnpaidSel] = useState<string[]>([])
  const [fee, setFee] = useState<FeeTableRow[] | null>(null)
  const [feeErr, setFeeErr] = useState<string | null>(null)

  /* 청구를 만들려면 학생을 골라야 한다. 재원생만 — 퇴원생에게 새 청구를 낼 일은 없다 */
  useEffect(() => {
    if (academyId === null) {
      setStudents([])
      return
    }
    let cancelled = false
    searchStudents({ status: 'ENROLLED', size: 2000, academyId })
      .then((p) => !cancelled && setStudents(p.rows))
      .catch(() => !cancelled && setStudents([]))
    return () => {
      cancelled = true
    }
  }, [academyId])

  const issueStudent = students.find((st) => String(st.enrollmentId) === issue.enrollmentId) ?? null

  /* 학생·월·좌석이 정해지면 단가표를 읽는다. 학년에 따라 단가가 달라 학생이 먼저다 */
  useEffect(() => {
    if (!issueOpen || issue.mode !== 'monthly' || issueStudent === null || issue.month === '' || academyId === null) {
      setFee(null)
      setFeeErr(null)
      return
    }
    let cancelled = false
    setFeeErr(null)
    getFeeTable(issue.month, issueStudent.grade, issue.seatType, academyId)
      .then((r) => !cancelled && setFee(r))
      .catch((err) => {
        if (cancelled) return
        setFee(null)
        // 단가가 없는 달이 실제로 있다. 등록을 눌러보고 알게 하지 않는다
        setFeeErr(err instanceof ApiError ? err.message : '단가표를 불러오지 못했습니다.')
      })
    return () => {
      cancelled = true
    }
  }, [issueOpen, issue.mode, issue.month, issue.seatType, issueStudent, academyId])

  /** 고른 할인율에 해당하는 줄. 없으면 할인 0% 줄을 쓴다 */
  const feeRow = useMemo(() => {
    if (fee === null || fee.length === 0) return null
    const want = issue.discountRate.trim() === '' ? 0 : Number(issue.discountRate)
    return fee.find((r) => r.discountRate === want) ?? null
  }, [fee, issue.discountRate])

  async function submitIssue() {
    setActBusy(true)
    setActErr(null)
    try {
      const enrollmentId = Number(issue.enrollmentId)
      if (issue.mode === 'monthly') {
        const r = await issueMonthlyBilling({
          enrollmentId,
          month: issue.month,
          seatType: issue.seatType,
          discountRate: issue.discountRate.trim() === '' ? undefined : Number(issue.discountRate),
          dueDate: issue.dueDate || undefined,
        })
        setActDone(`${r.name} ${r.billedAmount.toLocaleString()}원으로 등록했습니다.`)
      } else {
        const r = await createBilling({
          enrollmentId,
          name: issue.name.trim(),
          billingType: issue.billingType,
          suppliedAmount: Number(issue.suppliedAmount),
          discountAmount: issue.discountAmount.trim() === '' ? undefined : Number(issue.discountAmount),
          dueDate: issue.dueDate || undefined,
        })
        setActDone(`${r.name} ${r.billedAmount.toLocaleString()}원으로 등록했습니다.`)
      }
      setIssueOpen(false)
      setIssue(EMPTY_ISSUE)
      await load()
    } catch (err) {
      /* 409 는 "이미 그 달 청구가 있다"는 뜻이다. 서버 문구가 그대로 쓸 만하다 */
      setActErr(err instanceof ApiError ? err.message : '등록하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  async function submitPay() {
    if (!pay) return
    setActBusy(true)
    setActErr(null)
    try {
      await recordPayment(pay.row.billingId, Number(pay.amount), pay.method)
      setActDone(`${pay.row.studentName} · ${Number(pay.amount).toLocaleString()}원 수납했습니다.`)
      setPay(null)
      await load()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '수납하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  async function submitCancel() {
    if (!cancelRow) return
    setActBusy(true)
    setActErr(null)
    try {
      /* 수납이 붙어 있으면 그 거래부터 취소한다. 청구만 취소하면 받은 돈이
         매출장에서 통째로 사라진다 — 어디에도 안 보이는 수납이 된다 */
      for (const p of cancelRow.payments) await deletePayment(p.id)
      await deleteBilling(cancelRow.billingId)
      setActDone(
        cancelRow.payments.length > 0
          ? `청구를 취소하고 수납 ${cancelRow.payments.length}건도 함께 취소했습니다.`
          : '청구를 취소했습니다.',
      )
      setCancelRow(null)
      await load()
    } catch (err) {
      setActErr(err instanceof ApiError ? err.message : '취소하지 못했습니다.')
    } finally {
      setActBusy(false)
    }
  }

  /** 표 끝에 붙는 행 액션. 모듈 상수 COLUMNS 는 그대로 두고 여기서만 더한다 */
  const columnsWithAct: Column<ReceiptRow>[] = useMemo(
    () => [
      ...COLUMNS,
      {
        key: 'act',
        header: '',
        width: '116px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={r.unpaid <= 0}
              title={r.unpaid <= 0 ? '이미 완납된 청구입니다' : undefined}
              onClick={() => {
                setActErr(null)
                setPay({ row: r, amount: String(r.unpaid), method: 'CARD' })
              }}
            >
              수납
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
              onClick={() => {
                setActErr(null)
                setCancelRow(r)
              }}
            >
              취소
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  const sum = useMemo(() => {
    // 결제수단별 집계는 서버 요약에 없다. 행의 payments[] 를 더해 만든다 —
    // 조회 조건 안에서만 맞는 값이라 "조회 조건 기준"이라고 적어둔다
    const byMethod = new Map<string, number>()
    for (const r of filtered) {
      for (const p of r.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
    }
    const add = (f: (r: ReceiptRow) => number) => filtered.reduce((a, r) => a + f(r), 0)
    return {
      total: clientFiltered ? add((r) => r.receivedAmount) : (summary?.receivedAmount ?? 0),
      billed: clientFiltered ? add((r) => r.billedAmount) : (summary?.billedAmount ?? 0),
      due: clientFiltered ? add((r) => r.unpaid) : (summary?.unpaidAmount ?? 0),
      unpaidCount: clientFiltered ? filtered.filter((r) => r.unpaid > 0).length : (summary?.unpaidCount ?? 0),
      card: byMethod.get('CARD') ?? 0,
      vbank: byMethod.get('VBANK') ?? 0,
    }
  }, [summary, filtered, clientFiltered])

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 총 수납액
          </div>
          <div className="v">{Math.round(sum.total / 10000).toLocaleString()}</div>
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="credit-card" size={13} /> 카드
          </div>
          <div className="v">{Math.round(sum.card / 10000).toLocaleString()}</div>
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="wallet" size={13} /> 가상계좌
          </div>
          <div className="v">{Math.round(sum.vbank / 10000).toLocaleString()}</div>
          <div className="d">만원 · 조회 조건 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 수납률
          </div>
          <div className="v">{sum.billed > 0 ? Math.round((sum.total / sum.billed) * 100) : 0}%</div>
          <div className="d">수납 / 청구</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 미납액
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {Math.round(sum.due / 10000).toLocaleString()}
          </div>
          <div className="d down">{unpaid.length}건</div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {/* 할인 정책 탭에서도 감추지 않는다 — 감추면 탭 줄이 320px 위로 튀었다(2026-09-21 사용자 결정) */}
      <SearchForm
        fields={FIELDS}
        onSearch={setQuery}
        presetKey="payment"
        headerRight={
          <span className="mk supplement" title="직원 계정은 조회만 할 수 있습니다">
            <Icon name="shield-check" size={11} /> STAFF 조회 전용
          </span>
        }
      />

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'all', label: '통합 매출장', count: filtered.length },
            { key: 'unpaid', label: '미납자 관리', count: unpaid.length },
            { key: 'discount', label: '할인 정책 · 청구액 계산', count: DISCOUNTS.filter((d) => d.active).length },
          ]}
          active={tab}
          onChange={setTab}
        />
        <div className="p-pay" style={{ padding: 14 }}>
          {/* ═══ 할인 정책 · 청구액 계산 ═══ */}
          {tab === 'discount' && (
            <>
              {/* 할인 정책 API 가 아직 없다 — 이 탭만 목업 그대로다(docs/API_GAPS.md 6-3) */}
              <div className="blocked-note">
                <div className="ic">
                  <Icon name="triangle-alert" size={17} />
                </div>
                <div>
                  <div className="tt">지금은 온라인 결제에 할인이 반영되지 않습니다</div>
                  <div className="tx">
                    결제 연동 자체는 끝났지만, <b>할인 전 정가가 그대로 결제창에 넘어가고</b> 있습니다.
                    학생·학부모 결제창에 정가가 뜨고 할인은 나중에 수기 환불로 메꾸는 상태입니다.
                    <br />
                    결제 요청을 만들기 <b>전에</b> 아래 정책으로 <b>실제 청구액을 산출하는 단계</b>가 들어가야 합니다.
                  </div>
                </div>
              </div>

              <div className="split-3-2">
                <div>
                  <DataTable
                    nowrap
                    columns={DISCOUNT_COLUMNS}
                    rows={DISCOUNTS}
                    rowKey={(r) => r.id}
                    masked={false}
                    pageSize={10}
                    countLabel={
                      <>
                        할인 정책 <b>{DISCOUNTS.length}</b>건 · 사용{' '}
                        <b>{DISCOUNTS.filter((d) => d.active).length}</b>건
                      </>
                    }
                    toolbar={
                      <>
                        <ExcelButton filename="할인정책" columns={DISCOUNT_COLUMNS} rows={DISCOUNTS} masked={false} />
                        <button className="btn pri" disabled data-soon title="준비 중입니다">
                          <Icon name="plus" size={14} /> 할인 정책 등록
                        </button>
                      </>
                    }
                  />

                  <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="git-compare" size={17} />
                    </div>
                    <div>
                      <div className="tt">적용 순서가 최종 금액을 바꿉니다</div>
                      <div className="tx">
                        100만원에 <b>10% 할인</b>과 <b>3만원 할인</b>을 적용할 때, 정률 먼저면{' '}
                        <b>870,000원</b>이고 정액 먼저면 <b>873,000원</b>입니다. 그래서 정책마다{' '}
                        <b>순서(order)</b>를 못박고 그 순서대로만 계산합니다.
                        <br />
                        <b>단독(중복 불가)</b> 할인이 하나 적용되면 그 뒤 정책은 전부 막힙니다 — 장학 100%에 형제 할인이
                        또 붙는 일을 막기 위해서입니다.
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── 청구액 계산기 ── */}
                <div className="card-sec" style={{ marginBottom: 0 }}>
                  <div className="card-sec-h">
                    <div className="t">
                      <span className="ico">
                        <Icon name="percent" size={15} />
                      </span>
                      청구액 계산
                    </div>
                    <div className="r">
                      <span className="mk supplement">결제 금액 미리보기</span>
                    </div>
                  </div>
                  <div className="card-sec-b">
                    <div className="frow">
                      <label className="req">청구 항목</label>
                      <div className="type-picks">
                        {KINDS.map((k) => (
                          <button
                            type="button"
                            key={k}
                            className={`type-pick${calcKind === k ? ' on' : ''}`}
                            onClick={() => {
                              setCalcKind(k)
                              setCalcBase(BASE_PRICE[k])
                            }}
                          >
                            {k}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="frow">
                      <label className="req">정가</label>
                      <input
                        className="inp"
                        type="number"
                        step={10000}
                        value={calcBase}
                        onChange={(e) => setCalcBase(Number(e.target.value))}
                      />
                    </div>

                    <div className="frow">
                      <label>적용 할인</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
                        {DISCOUNTS.map((d) => (
                          <label
                            key={d.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}
                          >
                            <input
                              type="checkbox"
                              checked={picked.includes(d.id)}
                              onChange={() =>
                                setPicked((p) => (p.includes(d.id) ? p.filter((x) => x !== d.id) : [...p, d.id]))
                              }
                            />
                            <span style={{ flex: 1 }}>{d.name}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                              {d.method === 'RATE' ? `${d.value}%` : won(d.value)}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* 계산 과정 */}
                    <div className="calc-box">
                      <div className="crow base">
                        <span>정가</span>
                        <b>{won(calcBase)}</b>
                      </div>
                      {calc.steps.length === 0 && (
                        <div className="crow none">적용할 할인을 선택하세요</div>
                      )}
                      {calc.steps.map((s) => (
                        <div className={`crow${s.applied ? '' : ' skip'}`} key={s.d.id}>
                          <span>
                            <em>{s.d.order}</em> {s.d.name}
                            {!s.applied && <i> — {s.reason}</i>}
                          </span>
                          {s.applied ? <b className="cut">-{won(s.cut)}</b> : <b className="zero">적용 안 됨</b>}
                        </div>
                      ))}
                      <div className="crow final">
                        <span>실제 청구액</span>
                        <b>{won(calc.final)}</b>
                      </div>
                      {calcBase > 0 && (
                        <div className="crow sub">
                          <span>총 할인</span>
                          <b>
                            {won(calcBase - calc.final)} ({Math.round(((calcBase - calc.final) / calcBase) * 100)}%)
                          </b>
                        </div>
                      )}
                    </div>

                    <div className="blocked-note" style={{ marginTop: 14, marginBottom: 0 }}>
                      <div className="ic">
                        <Icon name="shield" size={16} />
                      </div>
                      <div>
                        {/* ★ 이 화면에서 계산한 값을 그대로 결제에 넘기면 결제 금액을 조작할 수 있다.
                               서버가 같은 정책으로 재계산해 금액이 일치할 때만 결제창을 띄우고,
                               승인 결과도 서버가 검증해야 한다(menu.internal 보안 항목). */}
                        <div className="tt">실제 결제 금액은 결제할 때 다시 계산됩니다</div>
                        <div className="tx">
                          이 화면은 할인 정책을 입력하고 청구액을 <b>미리 계산해 보는 곳</b>입니다. 결제할 때 같은 정책으로
                          다시 계산해 <b>금액이 맞을 때만 결제창이 뜹니다.</b>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'all' && (
            <DataTable
              nowrap
              columns={columnsWithAct}
              rows={filtered}
              rowKey={(r) => String(r.billingId)}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  청구 <b>{filtered.length}</b>건 · 수납 {sum.total.toLocaleString()}원
                </>
              }
              toolbar={
                <>
                  <button
                    className="btn pri"
                    disabled={academyId === null}
                    onClick={() => {
                      setActErr(null)
                      setIssue(EMPTY_ISSUE)
                      setIssueOpen(true)
                    }}
                  >
                    <Icon name="plus" size={14} /> 청구 등록
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="통합_매출장" columns={COLUMNS} rows={filtered} masked={masked} />
                </>
              }
            />
          )}

          {tab === 'unpaid' && (
            <DataTable
              nowrap
              columns={UNPAID_COLUMNS}
              rows={unpaid}
              rowKey={(r) => String(r.billingId)}
              selectable
              selected={unpaidSel}
              onSelectedChange={setUnpaidSel}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  미납 <b>{sum.unpaidCount}</b>건 · {sum.due.toLocaleString()}원
                  <span style={{ color: 'var(--muted)' }}> (학생 수가 아니라 건수)</span>
                  {unpaidSel.length > 0 && (
                    <span style={{ color: 'var(--mint-d)', fontWeight: 700 }}> · {unpaidSel.length}건 선택</span>
                  )}
                </>
              }
              toolbar={
                <>
                  <button className="btn" disabled data-soon title="준비 중입니다">
                    <Icon name="bell" size={14} /> 미납자 일괄 알림톡
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="미납자_명단" columns={UNPAID_COLUMNS} rows={unpaid} masked={masked} />
                </>
              }
              emptyText="미납 건이 없습니다."
            />
          )}
        </div>
      </div>

      {/* ── 청구 등록 ── */}
      {issueOpen && (
        <Modal
          title="청구 등록"
          sub="교습비는 단가표로 계산되고, 그 밖은 금액을 직접 적습니다."
          confirmLabel="등록"
          busy={actBusy}
          error={actErr}
          confirmDisabled={
            issue.enrollmentId === '' ||
            (issue.mode === 'monthly'
              ? issue.month.trim() === ''
              : issue.name.trim() === '' || issue.suppliedAmount.trim() === '')
          }
          onConfirm={() => void submitIssue()}
          onClose={() => setIssueOpen(false)}
        >
          <div className="frow">
            <label className="req">청구 종류</label>
            {/* ★ .frow 는 112px + 1fr 2열 그리드다. 안내문을 컨트롤의 **형제**로 두면
                   라벨 칸으로 떨어져 왼쪽에 눌려 붙는다 — 한 칸에 묶는다 */}
            <div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={`btn${issue.mode === 'monthly' ? ' pri' : ''}`}
                  onClick={() => setIssue({ ...issue, mode: 'monthly' })}
                >
                  교습비 (월)
                </button>
                <button
                  type="button"
                  className={`btn${issue.mode === 'etc' ? ' pri' : ''}`}
                  onClick={() => setIssue({ ...issue, mode: 'etc' })}
                >
                  특강비 · 급식비 · 그 밖
                </button>
              </div>
              <div className="hint">
                {issue.mode === 'monthly'
                  ? '금액은 단가표와 그 달 교습일수로 계산됩니다. 아래에서 미리 확인하세요.'
                  : '금액을 직접 적습니다. 교습비는 위쪽으로 등록해야 단가표와 어긋나지 않습니다.'}
              </div>
            </div>
          </div>

          <div className="frow">
            <label className="req">학생</label>
            <select
              className="sel"
              value={issue.enrollmentId}
              onChange={(e) => setIssue({ ...issue, enrollmentId: e.target.value })}
            >
              <option value="">선택하세요</option>
              {students.map((st) => (
                <option key={st.enrollmentId} value={String(st.enrollmentId)}>
                  {st.studentNo ?? '-'} · {st.name}
                </option>
              ))}
            </select>
          </div>

          {issue.mode === 'monthly' ? (
            <>
              <div className="frow">
                <label className="req">청구 월</label>
                <div>
                  <input
                    className="inp"
                    type="month"
                    value={issue.month}
                    onChange={(e) => setIssue({ ...issue, month: e.target.value })}
                  />
                  <div className="hint">청구 한 건이 한 달분입니다. 같은 달을 두 번 등록할 수 없습니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">좌석 · 할인율</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      className="sel"
                      value={issue.seatType}
                      onChange={(e) => setIssue({ ...issue, seatType: e.target.value as SeatType })}
                    >
                      {(Object.keys(SEAT_TYPE_LABEL) as SeatType[]).map((t) => (
                        <option key={t} value={t}>
                          {SEAT_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                    <input
                      className="inp"
                      type="number"
                      min={0}
                      max={100}
                      placeholder="할인율 %"
                      value={issue.discountRate}
                      onChange={(e) => setIssue({ ...issue, discountRate: e.target.value })}
                    />
                  </div>
                  {/* 월 청구는 율, 아래 그 밖 청구는 금액이다 — 서버 계약이 그렇게 갈려 있다 */}
                  <div className="hint">할인율은 퍼센트로 적습니다. 비우면 할인 없이 청구됩니다.</div>
                </div>
              </div>

              {/* ── 청구될 금액 ── */}
              {/* ★ 금액을 서버가 정하므로, 안 보여주면 **얼마가 청구되는지 모르고 누르게 된다.**
                     단가표를 읽어 미리 띄운다 — 등록 뒤에 알게 하지 않는다 */}
              <div className="frow">
                <label>청구될 금액</label>
                <div>
                  {feeErr !== null ? (
                    <div className="hint bad">{feeErr}</div>
                  ) : issueStudent === null ? (
                    <div className="hint">학생을 고르면 금액이 나옵니다.</div>
                  ) : fee === null ? (
                    <div className="hint">불러오는 중…</div>
                  ) : feeRow === null ? (
                    <div className="hint bad">
                      할인율 {issue.discountRate || 0}% 단가가 없습니다. 등록된 할인율:{' '}
                      {fee.map((r) => `${r.discountRate}%`).join(' · ')}
                    </div>
                  ) : (
                    <>
                      <table className="dt">
                        <tbody>
                          <tr>
                            <td>교습비</td>
                            <td style={{ textAlign: 'right' }}>{wonOf(feeRow.monthlyTuition)}</td>
                          </tr>
                          <tr>
                            <td>독서실비</td>
                            <td style={{ textAlign: 'right' }}>{wonOf(feeRow.monthlyStudyRoom)}</td>
                          </tr>
                          <tr>
                            <td>
                              <b>합계</b>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <b>{wonOf(feeRow.monthlyTotal)}</b>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <div className="hint">
                        {GRADE_LABEL[issueStudent.grade] ?? issueStudent.grade} ·{' '}
                        {SEAT_TYPE_LABEL[issue.seatType]} · 교습일수 {feeRow.teachingDays}일 기준
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="frow">
                <label className="req">청구 이름</label>
                <div>
                  <input
                    className="inp"
                    placeholder="예: 2026년 10월 급식비"
                    value={issue.name}
                    onChange={(e) => setIssue({ ...issue, name: e.target.value })}
                  />
                  <div className="hint">청구서에 그대로 찍힙니다.</div>
                </div>
              </div>
              <div className="frow">
                <label className="req">항목 · 금액</label>
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                  <select
                    className="sel"
                    value={issue.billingType}
                    onChange={(e) => setIssue({ ...issue, billingType: e.target.value as BillingType })}
                  >
                    {(Object.keys(BILLING_TYPE_LABEL) as BillingType[]).map((t) => (
                      <option key={t} value={t}>
                        {BILLING_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    placeholder="공급가"
                    value={issue.suppliedAmount}
                    onChange={(e) => setIssue({ ...issue, suppliedAmount: e.target.value })}
                  />
                  <input
                    className="inp"
                    type="number"
                    min={0}
                    placeholder="할인 금액"
                    value={issue.discountAmount}
                    onChange={(e) => setIssue({ ...issue, discountAmount: e.target.value })}
                  />
                  </div>
                  <div className="hint">할인은 퍼센트가 아니라 금액으로 적습니다.</div>
                </div>
              </div>
            </>
          )}

          <div className="frow">
            <label>납기일</label>
            <div>
              <input
                className="inp"
                type="date"
                value={issue.dueDate}
                onChange={(e) => setIssue({ ...issue, dueDate: e.target.value })}
              />
              <div className="hint">비워 두면 납기일 없이 등록됩니다.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 수납 ── */}
      {pay && (
        <Modal
          title="수납 등록"
          sub={`${pay.row.studentName} · ${pay.row.name}`}
          confirmLabel="수납"
          busy={actBusy}
          error={actErr}
          confirmDisabled={pay.amount.trim() === '' || Number(pay.amount) <= 0}
          onConfirm={() => void submitPay()}
          onClose={() => setPay(null)}
        >
          <div className="frow">
            <label className="req">금액</label>
            <div>
              <input
                className="inp"
                type="number"
                min={1}
                value={pay.amount}
                onChange={(e) => setPay({ ...pay, amount: e.target.value })}
              />
              {/* 부분납이면 여러 건이 쌓인다. 미납액을 기본값으로 넣어 두고 고치게 한다 */}
              <div className="hint">
                미납액 {pay.row.unpaid.toLocaleString()}원. 나눠 받으면 금액을 고쳐 적습니다.
              </div>
            </div>
          </div>
          <div className="frow">
            <label className="req">수단</label>
            <select
              className="sel"
              value={pay.method}
              onChange={(e) => setPay({ ...pay, method: e.target.value as PayMethod })}
            >
              {(Object.keys(PAY_METHOD_LABEL) as PayMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAY_METHOD_LABEL[m]}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {/* ── 청구 취소 ── */}
      {cancelRow && (
        <Modal
          title="청구 취소"
          sub={`${cancelRow.studentName} · ${cancelRow.name}`}
          confirmLabel="취소 처리"
          danger
          busy={actBusy}
          error={actErr}
          onConfirm={() => void submitCancel()}
          onClose={() => setCancelRow(null)}
        >
          <div className="note-box risk">
            <div className="ic">
              <Icon name="triangle-alert" size={17} />
            </div>
            <div>
              <div className="tt">되돌릴 수 없습니다</div>
              <div className="tx">
                {cancelRow.receivedAmount > 0 ? (
                  <>
                    이미 <b>{cancelRow.receivedAmount.toLocaleString()}원</b>이 수납된 청구입니다. 수납 기록을
                    먼저 취소한 뒤 청구를 취소합니다. 둘 다 매출장에서 빠집니다.
                  </>
                ) : (
                  <>청구 {cancelRow.billedAmount.toLocaleString()}원이 매출장에서 빠집니다.</>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* 결과는 모달을 닫은 뒤에도 보여야 한다 — 무엇이 됐는지 알려주지 않으면 다시 누른다 */}
      {actDone && (
        <Modal title="완료" hideCancel confirmLabel="닫기" onConfirm={() => setActDone(null)} onClose={() => setActDone(null)}>
          <div style={{ fontSize: 13.5 }}>{actDone}</div>
        </Modal>
      )}
    </>
  )
}

/**
 * 기간·지점별 통계 — 지점마다 수납 요약(`/receipt-status/summary`)을 불러 한 표로 놓는다.
 * ★ 지점별 합계 API 가 따로 없어 지점 수만큼 부른다(본사 11곳). 지점 관리자는 자기 지점만 나온다 —
 *   목록은 서버가 권한에 맞게 준다(AcademyContext).
 * ★ 청구 연도(year)와 기간(from~to)은 다른 축이다 — 기간은 청구일 기준이다.
 */
function BranchStatsButton() {
  const { academies } = useAcademy()
  const now = new Date()
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`)
  const [to, setTo] = useState(todayStr())
  const [rows, setRows] = useState<{ name: string; s: ReceiptSummary | null; err?: string }[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    const year = Number(from.slice(0, 4))
    const out = await Promise.all(
      academies.map(async (a) => {
        try {
          return { name: a.acadNm, s: await getReceiptSummary({ academyId: a.id, year, from, to }) }
        } catch (e) {
          return { name: a.acadNm, s: null, err: e instanceof ApiError ? e.message : '불러오지 못함' }
        }
      }),
    )
    setRows(out)
    setBusy(false)
  }

  const won = (n: number) => `${n.toLocaleString()}원`
  const total = (rows ?? []).reduce(
    (t, r) =>
      r.s
        ? { billed: t.billed + r.s.billedAmount, received: t.received + r.s.receivedAmount, unpaid: t.unpaid + r.s.unpaidAmount }
        : t,
    { billed: 0, received: 0, unpaid: 0 },
  )
  const rate = (b: number, r: number) => (b > 0 ? `${Math.round((r / b) * 100)}%` : '-')

  return (
    <>
      <button
        className="btn"
        onClick={() => {
          setOpen(true)
          setRows(null)
        }}
      >
        <Icon name="bar-chart-3" size={14} /> 기간·지점별 통계
      </button>
      {open && (
        <Modal wide title="기간·지점별 수납 통계" hideCancel confirmLabel="닫기" onConfirm={() => setOpen(false)} onClose={() => setOpen(false)}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <input className="inp" type="date" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
            <span>~</span>
            <input className="inp" type="date" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
            <button type="button" className="btn pri" disabled={busy || !from || !to || from > to} onClick={() => void run()}>
              {busy ? '계산 중…' : '조회'}
            </button>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>청구일 기준</span>
          </div>
          {rows && (
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="dt nowrap" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>지점</th>
                    <th style={{ textAlign: 'right' }}>청구</th>
                    <th style={{ textAlign: 'right' }}>수납</th>
                    <th style={{ textAlign: 'right' }}>미납</th>
                    <th style={{ textAlign: 'right' }}>미납 건</th>
                    <th style={{ textAlign: 'right' }}>수납률</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      {r.s ? (
                        <>
                          <td style={{ textAlign: 'right' }}>{won(r.s.billedAmount)}</td>
                          <td style={{ textAlign: 'right' }}>{won(r.s.receivedAmount)}</td>
                          <td style={{ textAlign: 'right', color: r.s.unpaidAmount > 0 ? 'var(--red)' : undefined }}>{won(r.s.unpaidAmount)}</td>
                          <td style={{ textAlign: 'right' }}>{r.s.unpaidCount}건</td>
                          <td style={{ textAlign: 'right' }}>
                            <b>{rate(r.s.billedAmount, r.s.receivedAmount)}</b>
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} style={{ color: 'var(--red)' }}>
                          {r.err}
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length > 1 && (
                    <tr style={{ fontWeight: 800 }}>
                      <td>합계</td>
                      <td style={{ textAlign: 'right' }}>{won(total.billed)}</td>
                      <td style={{ textAlign: 'right' }}>{won(total.received)}</td>
                      <td style={{ textAlign: 'right' }}>{won(total.unpaid)}</td>
                      <td />
                      <td style={{ textAlign: 'right' }}>{rate(total.billed, total.received)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}

export const paymentMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">기수 선택 ▾</button>
      <BranchStatsButton />
    </>
  ),
}
