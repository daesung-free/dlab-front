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

/* ★ **라벨은 4종을 그대로 둔다.** KCP 규격 값이고 **과거 데이터가 가리킬 수 있어서**,
   여기서 지우면 옛 건이 코드 그대로 보인다. */
export const PAY_METHOD_CODE_LABEL: Record<PayMethodCode, string> = {
  CARD: '카드',
  BANK: '계좌이체',
  MOBX: '휴대폰',
  VCNT: '가상계좌',
}

/* ★ **새로 고를 수 있는 것은 둘뿐이다**(2026-10-16 결제업체 미팅에서 온라인 MID 확정 —
   신용카드·네이버페이·카카오페이·가상계좌). **계좌이체와 휴대폰은 가맹에 열려 있지
   않아** 고르면 결제창에서 막힌다 — 화면에 두면 「되는 줄 알고 보냈는데 안 되는」 링크가
   나간다. 디랩도 9쪽에서 계좌이체를 빼라고 했다(1016 피드백 2-7).
   ★ 네이버페이·카카오페이는 **카드 결제창 안의 간편결제**로 열린다. 별도 선택지가
   필요한지는 PG 확인 전이라 만들지 않는다. */
export const PAY_METHOD_SELECTABLE: PayMethodCode[] = ['CARD', 'VCNT']

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

/**
 * 가상계좌 말소 (디랩 2026-10-12 회신 ① — 「입금 전 취소 시 가상계좌 즉시 말소」).
 *
 * ★★ **발급해 둔 가상계좌는 기한까지 계속 입금을 받는다.** 청구를 취소했는데 계좌를
 *   그대로 두면 학부모가 그 번호로 넣고, 그 돈은 **어디에 붙일지 모르는 입금**이 된다.
 * ★ **두 번 눌러도 안전하다** — 이미 말소된 건은 그대로 돌아온다(PG 에 두 번 안 보낸다).
 * ⚠️ **이미 입금된 건은 400 이다.** 그때는 말소가 아니라 **환불**이다 — 입금된 것을
 *   말소하면 **돈은 우리에게 있는데 거래가 사라진다.**
 * ⚠️ **실패하면 상태가 `CREATED` 로 남는다.** PG 가 받아들인 뒤에만 서버가 상태를 바꾼다 —
 *   우리만 닫힌 것으로 그리면 **계좌는 살아 있는데 화면엔 닫힌 것으로** 보여, 그 뒤
 *   들어온 입금을 아무도 예상하지 못한다. **응답 `status` 를 확인한다.**
 */
export function closePaymentRequest(requestId: number): Promise<PaymentRequestRow> {
  return request<PaymentRequestRow>(`/api/v1/admin/payment-requests/${requestId}/close`, { method: 'POST' })
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
