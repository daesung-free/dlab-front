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
} from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  BILLING_STATUS_LABEL,
  BILLING_TYPE_LABEL,
  PAY_METHOD_LABEL,
  getReceiptSummary,
  listReceiptStatus,
  type BillingType,
  type ReceiptRow,
  type ReceiptSummary,
} from '../../api/billing'
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
 * ★ 아직 없는 것: 지점(행에는 없다. 조회가 지점 단위라 헤더로 대신한다).
 *
 * ★ 지점은 행에 없지만 조회 자체가 지점 단위다(academyId). 선택한 지점을 헤더에 보여준다. */

type Method = '카드' | '가상계좌' | '현금'
type Kind = '등록비' | '교습비' | '특강비' | '급식비'

const KINDS: Kind[] = ['등록비', '교습비', '특강비', '급식비']
const METHODS: Method[] = ['카드', '가상계좌', '현금']

const FIELDS: Field[] = [
  { type: 'dateRange', name: 'period', label: '결제 기간', presets: true, span: 2 },
  { type: 'text', name: 'keyword', label: '이름 · 학번 · 전표번호', placeholder: '예: 이승민 / DS-2026-010001', span: 2 },
  { type: 'select', name: 'branch', label: '지점', options: ['분당', '대치', '평촌'].map((v) => ({ value: v, label: v })) },
  { type: 'select', name: 'round', label: '청구기수', options: ['1기', '2기', '3기'].map((v) => ({ value: v, label: v })) },
  { type: 'chips', name: 'kind', label: '항목', options: KINDS, multiple: true },
  { type: 'chips', name: 'method', label: '결제수단', options: METHODS, multiple: true },
]

const STATUS_TONE: Record<string, string> = { PAID: 'verified', PARTIAL: 'supplement', PENDING: 'brandnew' }

const wonOf = (n: number) => `${n.toLocaleString()}원`

/** 목업의 항목 이름 → 서버 billingType. 등록비는 서버에 대응 값이 없어 기타로 간다 */
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
    value: (r) => BILLING_STATUS_LABEL[r.status] ?? r.status,
    render: (r) => (
      <span className={`mk ${STATUS_TONE[r.status] ?? ''}`}>{BILLING_STATUS_LABEL[r.status] ?? r.status}</span>
    ),
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
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled title="알림톡 발송 API 연동 전입니다">
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
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
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
    // chips 는 배열이다. 서버는 type 하나만 받으므로 첫 값만 보낸다
    const type = Array.isArray(kind) && kind.length > 0 ? (KIND_TO_TYPE[kind[0] as Kind] ?? undefined) : undefined
    return {
      year: 2026,
      academyId: academyId ?? undefined,
      from: period?.from || undefined,
      to: period?.to || undefined,
      type,
    }
  }, [academyId, period?.from, period?.to, query.kind])

  const load = useCallback(async () => {
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
  const unpaid = useMemo(() => rows.filter((r) => r.unpaid > 0), [rows])

  const sum = useMemo(() => {
    // 결제수단별 집계는 서버 요약에 없다. 행의 payments[] 를 더해 만든다 —
    // 조회 조건 안에서만 맞는 값이라 "조회 조건 기준"이라고 적어둔다
    const byMethod = new Map<string, number>()
    for (const r of rows) {
      for (const p of r.payments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
    }
    return {
      total: summary?.receivedAmount ?? 0,
      billed: summary?.billedAmount ?? 0,
      due: summary?.unpaidAmount ?? 0,
      unpaidCount: summary?.unpaidCount ?? 0,
      byType: summary?.unpaidByType ?? {},
      card: byMethod.get('CARD') ?? 0,
      vbank: byMethod.get('VBANK') ?? 0,
    }
  }, [summary, rows])

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

      {tab !== 'discount' && (
        <SearchForm
          fields={FIELDS}
          onSearch={setQuery}
          presetKey="payment"
          headerRight={
            <span className="mk supplement" title="RBAC: SUPER_ADMIN / BRANCH_ADMIN 전체, STAFF 조회만">
              <Icon name="shield-check" size={11} /> STAFF 조회 전용
            </span>
          }
        />
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'all', label: '통합 매출장', count: rows.length },
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
                    KCP 연동 자체는 끝났지만, <b>그 앞단(학원 시스템)이 할인 없는 정가를 그대로 KCP에 넘기고</b> 있습니다.
                    학생·학부모 결제창에 정가가 뜨고 할인은 나중에 수기 환불로 메꾸는 상태입니다.
                    <br />
                    결제 요청을 만들기 <b>전에</b> 아래 정책으로 <b>실제 청구액을 산출하는 단계</b>가 들어가야 합니다.
                  </div>
                </div>
              </div>

              <div className="split-3-2">
                <div>
                  <DataTable
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
                        <button className="btn pri">
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
                      <span className="mk supplement">KCP 전달 금액 미리보기</span>
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
                        <div className="tt">이 금액은 서버가 다시 계산해야 합니다</div>
                        <div className="tx">
                          프론트가 계산한 값을 그대로 KCP에 넘기면 <b>결제 금액을 조작할 수 있습니다.</b> 서버가 같은
                          정책으로 재계산해 <b>금액이 일치할 때만 결제창을 띄우고</b>, 승인 결과도 서버가 검증해야
                          합니다. 이 화면은 정책을 입력하고 결과를 확인하는 용도입니다.
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
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.billingId)}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  청구 <b>{rows.length}</b>건 · 수납 {sum.total.toLocaleString()}원
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="통합_매출장" columns={COLUMNS} rows={rows} masked={masked} />
                </>
              }
            />
          )}

          {tab === 'unpaid' && (
            <DataTable
              columns={UNPAID_COLUMNS}
              rows={unpaid}
              rowKey={(r) => String(r.billingId)}
              selectable
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  미납 <b>{sum.unpaidCount}</b>건 · {sum.due.toLocaleString()}원
                  <span style={{ color: 'var(--muted)' }}> (학생 수가 아니라 건수)</span>
                </>
              }
              toolbar={
                <>
                  <button className="btn">
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

    </>
  )
}

export const paymentMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="bar-chart-3" size={14} /> 기간·지점별 통계
      </button>
    </>
  ),
}
