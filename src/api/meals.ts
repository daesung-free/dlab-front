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
  /**
   * 주문 합계.
   *
   * ★ **`null` 이면 「0원」이 아니라 「금액을 모른다」**다 — 끼니 하나라도 **단가가 등록되지
   *   않은** 경우다(2026-10-16 서버 수정). 0 으로 그리면 데스크가 **무료로 읽고**, 정작
   *   손써야 할 단가 미등록이 **청구 발행을 누를 때까지 안 보인다.**
   */
  amount: number | null
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

/**
 * 신청 가능 기간 설정(월 단위).
 *
 * ★ 같은 달을 다시 보내면 **덮어쓴다**(서버가 월로 찾는다).
 * ★ 이 기간 밖에서는 학생 앱이 신청·취소를 못 한다 — 데스크가 대신 넣는 경로는 아직 없다.
 */
export function setMealOrderWindow(body: {
  academyId: number
  /** yyyy-MM */
  targetMonth: string
  startsOn: string
  endsOn: string
}): Promise<MealOrderWindow> {
  return request<MealOrderWindow>('/api/v1/admin/meals/order-windows', { method: 'PUT', body })
}

/**
 * 관리자 급식 취소 — **3일 제한을 받지 않는다**.
 *
 * ★ 학생 앱은 3일 전까지만 취소할 수 있다. 그 뒤 사정이 생기면 데스크가 이걸로 취소한다.
 * ★ 취소하면 그 끼니는 **되살릴 수 없다** — 다시 신청해야 한다. 확인 창을 거쳐 부른다.
 */
export function cancelMealOrderItem(itemId: number): Promise<void> {
  return request<void>(`/api/v1/admin/meals/orders/items/${itemId}`, { method: 'DELETE' })
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

/* ── 일자별 신청 명단 (피드백 5-4) ──────────────────────────────────────────
 *
 * ★ **배식대에서 필요한 것은 숫자가 아니라 명단이다.** 월별 달력은 칸의 인원 수까지만
 *   알려주고, `/orders` 는 월 단위라 그날만 추리려면 주문마다 항목을 펼쳐 봐야 한다.
 *
 * ★ **「신청 vs 배식 대조」는 만들지 않는다.** 배식 태깅이 **키오스크에서 우리 쪽으로
 *   들어오는 경로가 없다** — 「실제로 먹은 사람」 칸을 채울 값이 없고, **빈 칸은 「안 먹었다」로
 *   읽힌다.** 그 상태로 내보내면 신청자를 결식 처리하게 된다.
 */

export interface MealRosterRow {
  /** 끼니 항목 id — **명단에서 바로 취소**할 수 있게 함께 온다(`deleteMealOrderItem`) */
  orderItemId: number
  enrollmentId: number
  studentNo: string | null
  studentName: string | null
  /** 반. **미배정이면 null** */
  className: string | null
  /** 좌석번호. **미배정이면 null** */
  seatCd: string | null
}

export interface MealDailyRoster {
  date: string
  lunchCount: number
  dinnerCount: number
  lunch: MealRosterRow[]
  dinner: MealRosterRow[]
  /** 이름이 가려졌는지. **모르면 화면이 또 가려 이름이 사라진다** */
  masked?: boolean
}

/** 그날 누가 먹는가. `date` 는 **필수**(yyyy-MM-dd) */
export function getMealDailyRoster(params: { academyId?: number; date: string }): Promise<MealDailyRoster> {
  return request<MealDailyRoster>('/api/v1/admin/meals/daily', { query: { ...params } })
}

/* ── 급식비 청구 발행 (1016 피드백 1-3) ──────────────────────
 *
 * ★ 이게 없어서 **급식비가 통합 매출장에 들어오지 않았다.** 서버에 로직은 다 있었는데
 *   컨트롤러에 안 붙어 있었다(2026-10-16 열림).
 * ★ **두 번 눌러도 안전하다** — 이미 발행된 주문은 `skipped` 로 떨어진다.
 */

export interface MealBillingIssued {
  billingId: number
  name: string
  amount: number
  dueDate: string | null
}

export interface MealBillingSkipped {
  orderId: number
  studentNo: string | null
  studentName: string
  /** 서버가 사유를 문장으로 준다. **사유마다 조치가 달라** 화면이 갈라서 보여준다 */
  reason: string
}

export interface MealBillingResult {
  issuedCount: number
  issued: MealBillingIssued[]
  skipped: MealBillingSkipped[]
}

/**
 * 한 달치 일괄 발행.
 *
 * ★ **한 건이 실패해도 나머지는 발행된다.** 전부-아니면-전무로 만들면 수백 명 중 한 명이
 *   중복이라는 이유로 전체가 막힌다.
 * ★ ⚠️ **`skipped` 를 반드시 화면에 보여준다.** 발행 건수만 보면 빠진 사람이 안 보이는데,
 *   「단가가 등록되지 않아」로 빠진 학생은 **그냥 두면 급식비가 영영 청구되지 않는다.**
 * @param month `yyyy-MM`
 */
export function issueMealBillingsMonthly(
  academyId: number,
  month: string,
  dueDate?: string,
): Promise<MealBillingResult> {
  return request<MealBillingResult>('/api/v1/admin/meals/billings/monthly', {
    method: 'POST',
    query: { academyId, month, dueDate },
  })
}

/** 주문 한 건. 이미 발행된 주문이면 400 이다 */
export function issueMealBilling(orderId: number, dueDate?: string): Promise<MealBillingIssued> {
  return request<MealBillingIssued>(`/api/v1/admin/meals/orders/${orderId}/billing`, {
    method: 'POST',
    query: { dueDate },
  })
}
