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

/** 수납 상태. 서버가 문자열로 주므로 모르는 값이 와도 그대로 표시한다 */
export const BILLING_STATUS_LABEL: Record<string, string> = {
  PENDING: '미납',
  PARTIAL: '부분납',
  PAID: '완납',
  CANCELED: '취소',
  REFUNDED: '환불',
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
  billedAmount: number
  receivedAmount: number
  /** 과납이어도 0에서 멈춘다 — 음수가 섞이면 미납 합계가 줄어든다 */
  unpaid: number
  dueDate: string | null
  status: string
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
