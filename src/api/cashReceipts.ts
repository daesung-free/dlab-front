import { request } from './client'

/* 현금영수증 — KCP 연동 (1016 피드백 1-2 「현금영수증 발행 기능과 방법 안내가 필요합니다」)
 *
 * ★ **카드 수납은 대상이 아니다.** 카드사가 소득공제를 처리한다 — 서버가 400 으로 막는다.
 *   계좌이체·가상계좌·현금 수납에만 버튼을 띄워야 **눌러보고 거절당하는** 일이 없다.
 * ★ **취소해도 행은 남는다.** 「발급한 적 없음」과 구분되어야 하기 때문이다 — 목록에
 *   취소분이 함께 오므로 화면도 지우지 말고 상태로 보여준다.
 * ★ **부가세는 서버가 한 번만 계산해 저장한다**(공급가액 = 총액/1.1 원단위 버림).
 *   화면에서 다시 계산하지 않는다 — 두 곳에서 계산하면 반올림이 어긋난다.
 */

/** 소득공제(개인) / 지출증빙(사업자) */
export type ReceiptPurpose = 'PERSONAL' | 'BUSINESS'

export const RECEIPT_PURPOSE_LABEL: Record<ReceiptPurpose, string> = {
  PERSONAL: '소득공제',
  BUSINESS: '지출증빙',
}

/** 무엇을 받아야 하는지가 용도에 따라 다르다 — 화면에 그대로 쓴다 */
export const RECEIPT_ID_LABEL: Record<ReceiptPurpose, string> = {
  PERSONAL: '휴대폰번호',
  BUSINESS: '사업자등록번호',
}

export type ReceiptStatus = 'ISSUED' | 'CANCELED' | 'FAILED'

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  ISSUED: '발급됨',
  CANCELED: '취소됨',
  FAILED: '실패',
}

export interface CashReceipt {
  id: number
  billingId: number
  transactionId: number
  orderNo: string | null
  purpose: ReceiptPurpose | null
  idInfo: string | null
  amount: number
  supplyAmount: number
  taxAmount: number
  status: ReceiptStatus
  /** KCP 현금영수증 거래번호. 국세청 조회·신고 대조에 쓰는 값이라 화면에 보여준다 */
  cashNo: string | null
  issuedAt: string | null
  canceledAt: string | null
  failReason: string | null
}

/** 청구에 딸린 영수증 목록. **취소분도 함께 온다** — 신고 내역과 대조해야 한다 */
export function listCashReceipts(billingId: number): Promise<CashReceipt[]> {
  return request<CashReceipt[]>('/api/v1/admin/cash-receipts', { query: { billingId } })
}

/**
 * 발급.
 *
 * ★ **수납 건(`transactionId`)에 붙는다.** 청구가 아니다 — 한 청구를 나눠 받으면
 *   영수증도 건별로 나간다.
 */
export function issueCashReceipt(body: {
  transactionId: number
  purpose: ReceiptPurpose
  idInfo: string
}): Promise<CashReceipt> {
  return request<CashReceipt>('/api/v1/admin/cash-receipts', { method: 'POST', body })
}

/** 취소. **행은 남는다** — 「발급한 적 없음」과 구분되어야 한다 */
export function cancelCashReceipt(receiptId: number): Promise<CashReceipt> {
  return request<CashReceipt>(`/api/v1/admin/cash-receipts/${receiptId}/cancel`, { method: 'POST' })
}
