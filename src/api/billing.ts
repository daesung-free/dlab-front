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
