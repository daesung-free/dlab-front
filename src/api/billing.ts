import { request } from './client'

/* 수납 (F-4.8) — /api/v1/admin/receipt-status · /billings
 *
 * ★ 청구 1건 = 한 달분이다. 한 학생이 여러 달 밀리면 행이 여러 개가 된다 —
 *   그래서 '미납 건수'와 '미납 학생 수'가 다르다. */

export type BillingType = 'TUITION' | 'MEAL' | 'LECTURE' | 'ETC'
export type PayMethod = 'CARD' | 'VBANK' | 'CASH' | 'TRANSFER' | 'ETC'

export const BILLING_TYPE_LABEL: Record<BillingType, string> = {
  TUITION: '교습비',
  MEAL: '급식비',
  LECTURE: '특강비',
  ETC: '기타',
}

export const PAY_METHOD_LABEL: Record<PayMethod, string> = {
  CARD: '카드',
  VBANK: '가상계좌',
  CASH: '현금',
  TRANSFER: '계좌이체',
  ETC: '기타',
}

/** 청구의 생애주기 상태. 서버가 문자열로 주므로 모르는 값이 와도 그대로 표시한다.
 *
 *  ★ 여기에 `PARTIAL` 은 없다 — 서버 enum 자체에 없다. 납부 진행도는 상태가 아니라
 *    **금액**으로 갈린다(`paymentLabel` 참고). 상태로 두면 납부·취소가 들어올 때마다
 *    다시 계산해 저장해야 하고, 한 곳만 빠뜨려도 화면과 실제 금액이 어긋난다.
 *  ★ 철자 주의 — 서버는 `CANCELLED`(L 두 개)다. `CANCELED` 로 적어두면 라벨에 안 걸려
 *    화면에 영문이 그대로 나온다. 실제로 그렇게 새어나갔다. */
export const BILLING_STATUS_LABEL: Record<string, string> = {
  PENDING: '발행 전',
  ISSUED: '발행',
  PAID: '완납',
  CANCELLED: '취소',
  EXPIRED: '기한 만료',
  REFUNDED: '환불',
}

/** 납부 진행도 — **금액으로만** 판정한다. `status` 와는 축이 다르다(취소된 건도 부분 납부일 수 있다) */
export function paymentLabel(r: Pick<ReceiptRow, 'billedAmount' | 'receivedAmount'>): string {
  if (r.receivedAmount <= 0) return '미납'
  if (r.receivedAmount < r.billedAmount) return '부분 납부'
  return '완납'
}

/** 살아 있는 수납 거래. **취소분은 빠진다** — 취소까지 세면 결제수단이 실제와 어긋난다 */
export interface PaymentView {
  id: number
  amount: number
  method: PayMethod
  paidAt: string
  /** PG 거래번호(전표번호). 가상계좌·현금은 비어 있을 수 있다 */
  pgTid: string | null
}

export interface ReceiptRow {
  billingId: number
  studentNo: string | null
  studentName: string
  /** 청구 이름 (예: "2026년 9월 교습비") */
  name: string
  billingType: BillingType
  /** 서비스 대상 월 */
  serviceMonth: string | null
  /** 청구기수(연도) */
  year: number | null
  billedAmount: number
  receivedAmount: number
  /** 과납이어도 0에서 멈춘다 — 음수가 섞이면 미납 합계가 줄어든다 */
  unpaid: number
  dueDate: string | null
  status: string
  payments: PaymentView[]
}

export interface ReceiptSummary {
  count: number
  billedAmount: number
  receivedAmount: number
  unpaidAmount: number
  /** 미납 **건수**다 — 학생 수가 아니다. 한 학생이 여러 달 밀릴 수 있다 */
  unpaidCount: number
  unpaidByType: Record<string, number>
}

export interface ReceiptParams {
  /** 필수 */
  year: number
  academyId?: number
  from?: string
  to?: string
  type?: BillingType
  unpaidOnly?: boolean
}

export function listReceiptStatus(params: ReceiptParams): Promise<ReceiptRow[]> {
  return request<ReceiptRow[]>('/api/v1/admin/receipt-status', { query: { ...params } })
}

export function getReceiptSummary(params: Omit<ReceiptParams, 'unpaidOnly'>): Promise<ReceiptSummary> {
  return request<ReceiptSummary>('/api/v1/admin/receipt-status/summary', { query: { ...params } })
}

/** 수납 등록. 부분납이면 여러 번 쌓인다 */
export function recordPayment(billingId: number, amount: number, method: PayMethod): Promise<void> {
  return request<void>(`/api/v1/admin/billings/${billingId}/payments`, {
    method: 'POST',
    body: { amount, method },
  })
}

/* ─────────── 청구 생성·취소 (/billings) ─────────── */

/**
 * 청구 한 건.
 *
 * ★ `receipt-status` 의 `ReceiptRow` 와 **다른 표다.** 이쪽은 결제 거래(`payments[]`)가
 *   없고 금액만 온다. 화면의 매출장은 여전히 `receipt-status` 를 본다 —
 *   여기는 "방금 만든 것이 제대로 들어갔나"를 확인하는 용도다.
 */
export interface BillingRow {
  id: number
  studentNo: string | null
  studentName: string
  /** 청구서에 찍히는 이름. "2026년 9월 교습비" 처럼 사람이 읽는 문장이다 */
  name: string
  billingType: BillingType
  suppliedAmount: number
  discountAmount: number
  /** 공급가 - 할인. 화면이 다시 계산하지 않는다 */
  billedAmount: number
  receivedAmount: number
  unpaidAmount: number
  dueDate: string | null
  status: string
}

/**
 * 연도별 청구 전량.
 *
 * ★ `year` 가 **필수**다. 안 보내면 400.
 *
 * ★ **취소분(`CANCELLED`)까지 들어온다.** `/billings/students/{id}` 와 `/receipt-status` 는
 *   취소분을 빼고 주므로 같은 조건인데 건수가 다르다 — 실측 12건 / 2건 / 9건(2026-09-14).
 *   매출 합계를 여기서 내면 취소한 청구가 섞인다.
 */
export function listBillings(params: { academyId?: number; year: number }): Promise<BillingRow[]> {
  return request<BillingRow[]>('/api/v1/admin/billings', { query: { ...params } })
}

/** 한 학생의 청구 전체. 연도를 안 받는다 — 재등록 전 기수 것까지 다 온다 */
export function listStudentBillings(enrollmentId: number): Promise<BillingRow[]> {
  return request<BillingRow[]>(`/api/v1/admin/billings/students/${enrollmentId}`)
}

/**
 * 청구를 직접 만든다.
 *
 * ★ **금액을 직접 적는 경로다.** 교습비는 단가표가 있으므로 `issueMonthlyBilling` 을 쓴다 —
 *   이쪽으로 만들면 단가표와 어긋난 금액이 조용히 들어간다.
 *   특강비·급식비처럼 단가표가 없는 것, 그리고 예외 청구에 쓴다.
 *
 * ★ `discountAmount` 는 **금액**이다(율이 아니다). 월 청구 쪽은 반대로 `discountRate` 가 율이다.
 */
export function createBilling(body: {
  enrollmentId: number
  /** 청구서에 찍히는 이름 */
  name: string
  billingType: BillingType
  suppliedAmount: number
  discountAmount?: number
  /** yyyy-MM-dd. 비우면 납기일 없이 만들어진다 */
  dueDate?: string
}): Promise<BillingRow> {
  return request<BillingRow>('/api/v1/admin/billings', { method: 'POST', body })
}

/**
 * 청구 취소.
 *
 * ★ 지우는 게 아니라 **상태를 `CANCELLED` 로 바꾼다.** 행은 남는다.
 *
 * ★ **수납이 남아 있으면 400** (`BILLING_HAS_PAYMENT`, "수납 3,000원이 남아 있어 청구를
 *   취소할 수 없습니다"). 2026-09-16 에 서버가 막아줬다.
 *
 *   그 전에는 200 이었고, 취소된 청구는 `/receipt-status` 에서 빠지므로 **돈은 받았는데
 *   매출장 어디에도 안 보이는 상태**가 만들어졌다. 되돌리는 API 는 여전히 없다.
 *
 *   화면은 수납 거래를 먼저 지우고 청구를 취소한다 — 이제 서버도 같은 순서를 강제한다.
 */
export function deleteBilling(billingId: number): Promise<void> {
  return request<void>(`/api/v1/admin/billings/${billingId}`, { method: 'DELETE' })
}

/**
 * 수납 취소.
 *
 * ★ 청구 id 가 아니라 **거래 id** 를 받는다 — `ReceiptRow.payments[].id` 다.
 *   둘 다 작은 정수라 섞어 넣어도 200 이 날 수 있다. 남의 거래를 지우게 된다.
 *
 * ★ 취소하면 청구가 `PAID` → `PENDING` 으로 돌아가고 `receivedAmount` 가 0 이 된다
 *   (2026-09-14 확인). 청구 자체는 남는다.
 */
export function deletePayment(transactionId: number): Promise<void> {
  return request<void>(`/api/v1/admin/billings/payments/${transactionId}`, { method: 'DELETE' })
}
