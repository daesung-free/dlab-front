import { request } from './client'

/* 환불 집행 — 0820 규정 (디랩 2026-10-12 회신으로 방식 확정)
 *
 * ★★ **`refundAmount` 가 음수일 수 있다.** 규정이 **정상가 기준 차감**이라, 할인받은
 *   학생은 **차감이 납부액을 넘는다.** 그때는 환불이 아니라 **추가 징수**다 —
 *   「돌려드립니다」로 띄우면 **데스크가 반대로 처리한다.**
 *   ⚠️ 서버는 **0 에서 자르지 않는다.** 자르면 받아야 할 돈이 사라지고 화면에서 알 방법이 없다.
 *
 * ★★ **`status` 를 반드시 본다.** `200` 이어도 `FAILED` 일 수 있다(PG 취소 거절).
 *   「환불 완료」로 띄우면 **돈이 안 갔는데 갔다고 기록**된다.
 *
 * ★ **수단에 따라 갈린다.**
 *   · 카드     — 서버가 PG 부분취소를 건다
 *   · 가상계좌 — **이체 대상으로 적재만** 한다. 사람이 은행에서 보낸다
 *     → 그래서 **「이체 완료」 버튼**이 필요하다. 없으면 대기 목록이 **영원히 안 줄어든다**
 *
 * ⚠️ **급식비는 400 이다.** 업체 명의 TID 라 처리 주체가 정해져야 한다 — 급식 청구에는
 *   환불 버튼을 **숨긴다.**
 */

export type RefundStatus = 'PENDING' | 'DONE' | 'FAILED' | 'ADDITIONAL_PAYMENT'

export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  PENDING: '이체 대기',
  DONE: '완료',
  FAILED: '실패',
  ADDITIONAL_PAYMENT: '추가 징수',
}

/** 항목별 계산 근거 — **금액만 보여주면 「왜 이 금액인가」에 답할 수 없다** */
export interface RefundItem {
  itemType: string
  paidAmount: number
  /** 차감액. **정상가 기준**이라 납부액을 넘을 수 있다 */
  deduction: number
  refund: number
  /** 「이용기간 1/2 이내 — 1/2 환불 / 정가 660,000원 × 1/2 = …」 */
  detail?: string | null
}

export interface RefundView {
  id?: number
  billingId?: number
  studentNo?: string | null
  studentName?: string | null
  /** 받은 돈. 청구액이 아니다 */
  paidAmount?: number
  /** ★ **음수면 추가 징수다.** 0 으로 자르지 않는다 */
  refundAmount: number
  /** `true` 면 돌려주는 게 아니라 **더 받아야 한다** */
  requiresAdditionalPayment?: boolean
  status?: RefundStatus
  /** `FAILED` 일 때 왜 안 됐는지. **그대로 띄운다** */
  failReason?: string | null
  /**
   * 계산 과정 — **여러 줄 문자열**이다(`\n` 구분).
   * 표로 그릴 거면 `items` 쪽이 낫다.
   */
  detail?: string | null
  /** 항목별 근거. 클라이언트가 요청한 「추가결제 시 상세 내역 출력」이 이 값을 쓴다 */
  items?: RefundItem[]
  method?: string | null
  /**
   * 이용일수 — **등록 기간 중 경과한 날**이다.
   *
   * ★★ **출석일수가 아니다.** 규정이 경과 비율이라 **결석해도 줄지 않는다**
   *   (0820 규정 「퇴원하는 달 이용기간의 1/3까지 2/3 환불」). 화면에 「다닌」·
   *   「수강한」이라고 쓰면 담당자가 **출석부를 보고 결석을 빼** 환불액이 틀린다.
   */
  usedDays?: number
  createdAt?: string | null
  transferredAt?: string | null
}

/** 미리보기 — **저장하지 않는다.** 집행 전에 금액과 방향을 보고 누른다 */
export function previewRefund(billingId: number, usedDays: number): Promise<RefundView> {
  return request<RefundView>('/api/v1/admin/refunds/preview', { query: { billingId, usedDays } })
}

/** 집행. ⚠️ **되돌릴 수 없다** — 카드면 PG 부분취소가 실제로 걸린다 */
export function executeRefund(billingId: number, usedDays: number): Promise<RefundView> {
  return request<RefundView>('/api/v1/admin/refunds', { method: 'POST', query: { billingId, usedDays } })
}

/** 계좌 이체 대상 — **아직 돈이 안 간 건들**이다 */
export function listPendingTransfers(academyId: number, year: number): Promise<RefundView[]> {
  return request<RefundView[]>('/api/v1/admin/refunds/pending-transfers', { query: { academyId, year } })
}

/**
 * 이체 완료 표시.
 *
 * ★ **우리가 이체하는 게 아니다.** 사람이 은행에서 보낸 뒤 여기에 찍는다 —
 *   안 찍으면 대기 목록이 **영원히 안 줄어든다.**
 */
export function markRefundTransferred(refundId: number): Promise<RefundView> {
  return request<RefundView>(`/api/v1/admin/refunds/${refundId}/transferred`, { method: 'POST' })
}

export function listRefunds(academyId: number, year: number): Promise<RefundView[]> {
  return request<RefundView[]>('/api/v1/admin/refunds', { query: { academyId, year } })
}
