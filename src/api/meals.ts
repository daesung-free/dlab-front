import { request } from './client'

/* 급식 (F-4.5) — /api/v1/admin/meals
 *
 * ★ 일정과 신청의 관계에 순서가 있다. 중단일 등록은 "앞으로의 신청을 막는" 것이지
 *   "이미 결제된 건을 지우는" 것이 아니다 — 이미 결제된 날을 중단으로 바꾸면
 *   그 건들이 환불 대상이 되므로 서버가 확인 후 처리한다. 화면은 결과만 받는다. */

export type MealOrderStatus = 'PENDING' | 'ISSUED' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'REFUNDED'

export const MEAL_STATUS_LABEL: Record<MealOrderStatus, string> = {
  PENDING: '결제대기',
  ISSUED: '청구발행',
  PAID: '결제완료',
  CANCELLED: '취소',
  EXPIRED: '기한만료',
  REFUNDED: '환불',
}

export const MEAL_STATUS_TONE: Record<MealOrderStatus, string> = {
  PENDING: 'supplement',
  ISSUED: 'supplement',
  PAID: 'verified',
  CANCELLED: 'brandnew',
  EXPIRED: 'brandnew',
  REFUNDED: 'brandnew',
}

/** 달력 한 칸. 닫힌 이유를 구분해서 준다 — 없으면 관리자가 원인을 모른다 */
export interface MealDay {
  date: string
  available: boolean
  closureReason: string | null
  /** WEEKEND / HOLIDAY / CLOSURE. 열려 있으면 null */
  closedReason: 'WEEKEND' | 'HOLIDAY' | 'CLOSURE' | null
  lunchCount: number
  dinnerCount: number
}

export interface MealClosure {
  id: number
  date: string
  reason: string | null
  /** 이 중단으로 취소된 신청 건수 */
  canceledCount: number
}

export interface MealOrderItem {
  id: number
  mealDate: string
  mealType: string
  unitPrice: number | null
  canceledAt: string | null
  cancelPath: string | null
}

export interface MealOrder {
  id: number
  /** 표시용 주문번호(M2609-000123). 뒤 6자리가 id라 불러준 번호로 되짚을 수 있다 */
  orderNo: string
  studentNo: string | null
  studentName: string
  /** 반. 미배정이면 null */
  className: string | null
  targetMonth: string
  /** 결제 라이프사이클. 결제가 붙기 전까지 전부 PENDING 이다 */
  status: MealOrderStatus
  activeCount: number
  amount: number
  billedAmount: number
  refundableAmount: number
  paymentMethods: string[]
  billingId: number | null
  items: MealOrderItem[]
  createdAt: string | null
}

export interface MealOrderWindow {
  id: number
  targetMonth: string
  startsOn: string
  endsOn: string
}

/** @param month `yyyy-MM` */
export function listMealMonthly(academyId: number, month: string): Promise<MealDay[]> {
  return request<MealDay[]>('/api/v1/admin/meals/monthly', { query: { academyId, month } })
}

export function listMealClosures(academyId: number, month: string): Promise<MealClosure[]> {
  return request<MealClosure[]>('/api/v1/admin/meals/closures', { query: { academyId, month } })
}

export function listMealOrders(academyId: number, month: string): Promise<MealOrder[]> {
  return request<MealOrder[]>('/api/v1/admin/meals/orders', { query: { academyId, month } })
}

export function listMealOrderWindows(academyId: number, year: number): Promise<MealOrderWindow[]> {
  return request<MealOrderWindow[]>('/api/v1/admin/meals/order-windows', { query: { academyId, year } })
}

export function createMealClosure(academyId: number, date: string, reason: string): Promise<MealClosure> {
  return request<MealClosure>('/api/v1/admin/meals/closures', {
    method: 'POST',
    body: { academyId, date, reason },
  })
}

export function deleteMealClosure(closureId: number): Promise<void> {
  return request<void>(`/api/v1/admin/meals/closures/${closureId}`, { method: 'DELETE' })
}
