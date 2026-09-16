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

/** 급식 신청 마감 정책. `registered=false` 면 deadlineDays 는 서버 기본값이다 */
export interface MealPolicy {
  academyId: number | null
  year: number
  deadlineDays: number
  /** 지점 정책이 실제로 등록됐는지 — "설정 안 함"과 구분해서 보여줄 수 있다 */
  registered: boolean
}

export function getMealPolicy(academyId: number, year: number): Promise<MealPolicy> {
  return request<MealPolicy>('/api/v1/admin/meals/policy', { query: { academyId, year } })
}

/**
 * 급식 신청 마감 정책 저장 — `PUT /admin/meals/policy`
 *
 * ★ 지점·연도 단위다. 조회는 붙어 있었는데 저장이 안 붙어서, 값을 바꿔도 새로고침하면
 *   조용히 원복됐다 — 바꾼 줄 알고 넘어간다.
 * ★ 응답은 저장된 `deadlineDays` 숫자 하나다(객체가 아니다).
 */
export function saveMealPolicy(academyId: number, year: number, deadlineDays: number): Promise<number> {
  return request<number>('/api/v1/admin/meals/policy', {
    method: 'PUT',
    body: { academyId, year, deadlineDays },
  })
}

/* ── 급식 업체 · 지점 배정 (2-7) ─────────────────────────────
 *
 * ★ **지점당 업체 하나**다(2026-09-16 클라이언트 확정). 요일·기간별로 갈리지 않는다.
 *   단가는 대구만 8,000 이고 나머지 10개 지점은 7,700 이다.
 *
 * ★ **배정이 연도별이다.** 해가 바뀌면 다시 만들어야 하고, **전년도 복사 대상도 아니다**
 *   (`/masters/yearly-copy` 가 넘기는 표에 급식이 없다 — 09-16 확인). 배정이 없으면
 *   그 지점 주문에 금액이 안 박혀 **청구를 만들 수 없다.** 신청은 받아지는데 돈만 안 붙는다.
 *
 * ★ 권한이 둘로 갈린다(09-16 확인) — **업체 등록·삭제는 본사만**(지점 관리자는 403),
 *   **지점 배정·단가는 지점 관리자도 바꿀 수 있다.** 남의 지점은 403 이다.
 */

export interface MealVendor {
  id: number
  name: string
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
}

export function listMealVendors(): Promise<MealVendor[]> {
  return request<MealVendor[]>('/api/v1/admin/meal-vendors')
}

export function createMealVendor(body: {
  name: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
}): Promise<MealVendor> {
  return request<MealVendor>('/api/v1/admin/meal-vendors', { method: 'POST', body })
}

export function updateMealVendorContact(
  vendorId: number,
  body: { contactName?: string; contactPhone?: string; contactEmail?: string },
): Promise<MealVendor> {
  return request<MealVendor>(`/api/v1/admin/meal-vendors/${vendorId}`, { method: 'PATCH', body })
}

/** 업체 내리기. 배정된 지점이 있으면 서버가 막는다 */
export function deleteMealVendor(vendorId: number): Promise<void> {
  return request<void>(`/api/v1/admin/meal-vendors/${vendorId}`, { method: 'DELETE' })
}

export interface MealVendorAssignment {
  academyId: number
  year: number
  vendorId: number
  vendorName: string
  unitPrice: number
  /** 신청 마감 D-n. 여기서 바꾸지 않는다 — `saveMealPolicy` 쪽이다 */
  deadlineDays: number
  priced: boolean
}

/**
 * 그 해 그 지점의 급식 설정.
 *
 * ★ 배정이 없으면 **404 가 아니라 `MEAL_POLICY_NOT_FOUND` 로 실패한다.** 빈 값이 아니라
 *   오류라서, 화면은 이걸 "아직 안 정했다" 로 읽고 안내로 바꿔야 한다.
 */
export function getMealVendorAssignment(academyId: number, year: number): Promise<MealVendorAssignment> {
  return request<MealVendorAssignment>('/api/v1/admin/meal-vendors/assignment', {
    query: { academyId, year },
  })
}

/** 지점에 업체·단가 연결. 없으면 만들고 있으면 바꾼다 */
export function saveMealVendorAssignment(body: {
  academyId: number
  year: number
  vendorId: number
  unitPrice: number
}): Promise<MealVendorAssignment> {
  return request<MealVendorAssignment>('/api/v1/admin/meal-vendors/assignment', { method: 'PUT', body })
}
