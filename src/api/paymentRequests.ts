import { request } from './client'

/* 결제 요청 (F-C-5 결제 관리) — /api/v1/admin/payment-requests
 *
 * 수납현황의 **청구 한 건**에 붙는다. 청구가 「받아야 할 돈」이면 이쪽은 「어떻게 받았는가」다.
 *
 * ★ **목록 조회가 `billingId` 단위다.** 전체를 훑는 경로가 없어 **결제만 모아 보는 화면은
 *   만들 수 없다** — 그래서 수납현황의 청구 행에 붙인다(API_GAPS 42부).
 *
 * ★ 세 가지가 **서로 다른 일**이다. 한 모달에 넣되 섞지 않는다.
 *   · 결제 요청(`POST /`)      — 학부모가 열 **링크**를 만든다. 문자 발송은 선택
 *   · 단말기 결제(`/terminal`) — 데스크에서 **이미 승인된 카드 결제를 기록**한다. 링크가 아니다
 *   · 가상계좌(`/vbank`)       — 입금할 **계좌를 발급**한다. 입금은 나중에 웹훅으로 들어온다
 */

/** CARD 카드 · BANK 계좌이체 · MOBX 휴대폰 · VCNT 가상계좌 */
export type PayMethodCode = 'CARD' | 'BANK' | 'MOBX' | 'VCNT'

export const PAY_METHOD_CODE_LABEL: Record<PayMethodCode, string> = {
  CARD: '카드',
  BANK: '계좌이체',
  MOBX: '휴대폰',
  VCNT: '가상계좌',
}

export interface PaymentRequestRow {
  id: number
  billingId: number
  orderNo: string | null
  amount: number
  payMethod: string
  /** CREATED = 링크만 만들어진 상태 · PAID = 결제 완료(웹훅 수신) */
  status: string
  /**
   * 학부모가 열 주소.
   *
   * ★ 문자 발송을 끄고 만들면 **이 값을 전달하는 것이 화면 몫**이다 — 안 알려주면
   *   링크만 만들어 두고 아무도 모르는 상태가 된다.
   */
  payUrl: string | null
  expireAt: string | null
  /** KCP 거래번호. 승인 후에만 있다 */
  tno: string | null
  approvedAt: string | null
  payDetail: string | null
  failReason: string | null
  vbankAccount: string | null
  vbankBankName: string | null
  vbankDepositor: string | null
  vbankRemitter: string | null
}

export function listPaymentRequests(billingId: number): Promise<PaymentRequestRow[]> {
  return request<PaymentRequestRow[]>('/api/v1/admin/payment-requests', { query: { billingId } })
}

/** 결제 링크 생성. `sendSms` 를 끄면 `payUrl` 을 화면이 전달해야 한다 */
export function createPaymentRequest(body: {
  billingId: number
  payMethod: PayMethodCode
  sendSms: boolean
}): Promise<PaymentRequestRow> {
  return request<PaymentRequestRow>('/api/v1/admin/payment-requests', { method: 'POST', body })
}

/**
 * 단말기 결제 **기록**.
 *
 * ★ 결제를 일으키는 것이 아니라 **데스크 단말기에서 이미 승인된 건을 적는 것**이다.
 *   승인번호·카드사·승인시각을 그대로 옮긴다 — 틀리면 정산에서 대사가 안 맞는다.
 */
export function recordTerminalPayment(body: {
  billingId: number
  amount: number
  approvalNo: string
  cardName: string
  /** ISO. 단말기 영수증의 승인 시각 */
  approvedAt: string
}): Promise<PaymentRequestRow> {
  return request<PaymentRequestRow>('/api/v1/admin/payment-requests/terminal', { method: 'POST', body })
}

/** 가상계좌 발급. `days` 는 입금 기한(일) */
export function issueVbank(body: {
  billingId: number
  bankCode: string
  days: number
}): Promise<PaymentRequestRow> {
  return request<PaymentRequestRow>('/api/v1/admin/payment-requests/vbank', { method: 'POST', body })
}
