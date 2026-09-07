import { request } from './client'

/* 수납 관리 — 청구기준 (F-4.10-5) — /api/v1/admin/billing-standards
 *
 * ★ 여기서 정하는 것은 **정가**다. 할인은 다음 단계이고 아직 서버에 없다
 *   (할인 정책 엔드포인트가 없다 — 화면 상단 안내가 그 얘기다).
 *
 * ★ 페이징이 없다. 전량이 온다 — useServerData 를 쓴다.
 *
 * ★ 교습비 행만 성격이 다르다. `amountSource=PRICE_MATRIX` 면 금액을 한 칸에 못 넣는다 —
 *   학년 × 좌석유형으로 갈리기 때문이다. 그 행은 `amount` 가 없고 `amountMin~amountMax` 만
 *   오며, 실제 편집은 `/tuition/prices`(수납 관리의 하위 화면)에서 한다.
 */

export type BillingItemType = 'TUITION' | 'STUDY_ROOM' | 'MEAL' | 'LECTURE' | 'REGISTRATION' | 'ETC'

/** 금액이 한 값으로 정해지는가, 단가표에서 갈리는가 */
export type AmountSource = 'FIXED' | 'PRICE_MATRIX'

/**
 * 결제 경로.
 *
 * ★ 목업의 '대성전산'·'급식업체 PG' 는 **0803에 폐기됐다.** 카드·가상계좌만 남았고
 *   현금·계좌이체는 데스크 수납 경로다.
 */
export type PaymentMethod = 'CARD' | 'VBANK' | 'CASH' | 'TRANSFER' | 'ETC'

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: '카드',
  VBANK: '가상계좌',
  CASH: '현금',
  TRANSFER: '계좌이체',
  ETC: '기타',
}

export interface BillingStandard {
  id: number
  academyId: number | null
  year: number
  code: string
  itemType: BillingItemType
  /** 서버가 준 한글 표시명. 화면은 이걸 그대로 쓴다 */
  itemLabel: string
  name: string
  /** 기수. 없으면 null */
  roundName: string | null
  amountSource: AmountSource
  /** FIXED 일 때만 값이 있다 */
  amount: number | null
  /** PRICE_MATRIX 일 때만 값이 있다 — 단가표의 최소·최대 */
  amountMin: number | null
  amountMax: number | null
  /** '매월 25일' 처럼 서버가 문장으로 준다 */
  dueDesc: string | null
  paymentMethod: PaymentMethod | null
  active: boolean
  sortOrder: number | null
  memo: string | null
}

export interface BillingStandardParams {
  /** 필수 */
  year?: number
  academyId?: number
  itemType?: BillingItemType
  active?: boolean
}

export function listBillingStandards(params: BillingStandardParams): Promise<BillingStandard[]> {
  return request<BillingStandard[]>('/api/v1/admin/billing-standards', { query: { ...params } })
}

export function createBillingStandard(body: {
  academyId?: number
  year: number
  code: string
  itemType: BillingItemType
  name: string
  amountSource: AmountSource
  roundName?: string
  amount?: number
  dueDesc?: string
  paymentMethod?: PaymentMethod
  sortOrder?: number
  memo?: string
}): Promise<BillingStandard> {
  return request<BillingStandard>('/api/v1/admin/billing-standards', { method: 'POST', body })
}

/** ★ name·amountSource 가 필수다. 한 칸만 고치려 해도 둘은 함께 보내야 한다 */
export function updateBillingStandard(
  id: number,
  body: {
    name: string
    amountSource: AmountSource
    roundName?: string
    amount?: number
    dueDesc?: string
    paymentMethod?: PaymentMethod
    sortOrder?: number
    memo?: string
  },
): Promise<BillingStandard> {
  return request<BillingStandard>(`/api/v1/admin/billing-standards/${id}`, { method: 'PUT', body })
}

export function setBillingStandardActive(id: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/billing-standards/${id}/active`, { method: 'PATCH', body: { active } })
}

export function deleteBillingStandard(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/billing-standards/${id}`, { method: 'DELETE' })
}

/**
 * 환불 기준.
 *
 * ★ **읽기 전용이다.** 값이 학원법 시행령 반환기준이라 학원이 정하는 것이 아니다 —
 *   편집을 열면 임의 비율로 환불이 나간다. 등록·수정 API 가 없는 것이 의도다.
 */
export interface RefundRule {
  itemType: BillingItemType
  /** '이용기간 1/3 이내' 처럼 문장으로 온다 */
  period: string
  /** '2/3 환불' 처럼 문장으로 온다 — 숫자가 아니다 */
  rate: string
  note: string | null
}

export function listRefundRules(): Promise<RefundRule[]> {
  return request<RefundRule[]>('/api/v1/admin/billing-standards/refund-rules')
}

/* ── 교습비 단가표 ────────────────────────────────────────────
 *
 * 청구기준의 교습비 행(amountSource=PRICE_MATRIX)은 금액을 한 칸에 못 넣어 단가표로 내려온다.
 * ★ 그 단가표는 **src/api/tuition.ts 가 정본이다** — 여기에 또 두면 두 벌이 된다.
 *   화면은 listTuitionPrices·listTuitionMonths 를 그쪽에서 가져다 쓴다. */
