import { request } from './client'
import type { GradeType } from './students'

/* 청구 기준 (F-4.10-5 수납 관리) — /api/v1/admin/tuition
 *
 * ★ 여기서 정하는 것은 **정가**다. 할인은 다음 단계(수납현황)에서 붙는다.
 *
 * ★ **월별 교습일수가 비어 있으면 그 해 청구가 계산되지 않는다.** 값이 없다는 것과
 *   0원이라는 것은 화면에서 반드시 달라 보여야 한다 — 비어 있는 걸 모르고 넘어가면
 *   청구 시점에야 알게 된다.
 *
 * ★ 교습일수는 **달력 일수가 아니다.** 2026년 표 기준 2월이 27일, 9월이 29일이다.
 *   서버는 달력을 상한으로만 확인하고(2월에 30을 넣으면 거부) 값 자체는 학원이 아는
 *   대로 받는다. **화면이 규칙을 추측해 자동 산출하면 조용히 틀린 금액이 나온다.** */

export type SeatType = 'GENERAL' | 'SINGLE'

export const SEAT_TYPE_LABEL: Record<SeatType, string> = {
  GENERAL: '일반석',
  SINGLE: '1인석',
}

export interface TuitionPrice {
  id: number
  academyId: number
  year: number
  gradeType: GradeType
  seatType: SeatType
  tuitionFee: number
  studyRoomFee: number
  /** 서버가 더해 준다 — 화면이 다시 더하지 않는다 */
  monthlyTotal: number
}

export function listTuitionPrices(year: number, academyId?: number): Promise<TuitionPrice[]> {
  return request<TuitionPrice[]>('/api/v1/admin/tuition/prices', { query: { year, academyId } })
}

export interface SavePrice {
  academyId: number
  year: number
  gradeType: GradeType
  seatType: SeatType
  tuitionFee: number
  studyRoomFee: number
}

/**
 * 같은 (연도·학년·좌석유형)이 있으면 **금액만 갱신**한다 — 중복 행이 생기지 않는다.
 * 교습일수와 마찬가지로 **단건**이다.
 */
export function saveTuitionPrice(body: SavePrice): Promise<TuitionPrice> {
  return request<TuitionPrice>('/api/v1/admin/tuition/prices', { method: 'PUT', body })
}

/**
 * ⚠️ **요청과 응답의 `month` 모양이 다르다.** 보낼 때는 `"2026-09"` 문자열이고
 * 받을 때는 `9`(정수) + `year` 가 따로 온다. 같은 이름이라 섞기 쉽다.
 */
export interface TuitionMonth {
  id: number
  academyId: number
  year: number
  /** 1~12 정수다 — 보낼 때의 `yyyy-MM` 과 다르다 */
  month: number
  teachingDays: number
}

export function listTuitionMonths(year: number, academyId?: number): Promise<TuitionMonth[]> {
  return request<TuitionMonth[]>('/api/v1/admin/tuition/months', { query: { year, academyId } })
}

/**
 * 한 달씩 저장한다. **배열이 아니라 단건이다** — 배열로 보내면
 * "요청 본문 형식이 올바르지 않습니다"(400)가 온다.
 *
 * ★ 달력을 **상한으로만** 확인한다(2월에 30을 넣으면 "2월은 28일까지입니다"로 거부).
 *   그 안에서는 학원이 아는 값을 그대로 받으므로, **화면이 규칙을 추측해 채우면 안 된다.**
 */
export function saveTuitionMonth(body: {
  academyId: number
  /** `yyyy-MM` */
  month: string
  teachingDays: number
}): Promise<TuitionMonth> {
  return request<TuitionMonth>('/api/v1/admin/tuition/months', { method: 'PUT', body })
}

export interface FeeTableRow {
  discountRate: number
  teachingDays: number
  monthlyTuition: number
  dailyTuition: number
  monthlyStudyRoom: number
  dailyStudyRoom: number
  monthlyTotal: number
}

/**
 * 할인율별 1일 교습비·독서실비.
 *
 * ★ **독서실비에는 할인이 적용되지 않는다** — 어느 줄이든 정가 그대로다.
 *   화면이 할인율을 곱하면 틀린다.
 */
export function getFeeTable(
  month: string,
  gradeType: GradeType,
  seatType: SeatType,
  academyId?: number,
): Promise<FeeTableRow[]> {
  return request<FeeTableRow[]>('/api/v1/admin/tuition/fee-table', {
    query: { month, gradeType, seatType, academyId },
  })
}

/* ─────────── 교습비 청구 발행 (/tuition/billings) ─────────── */

/**
 * 발행 결과. `/billings` 의 `BillingRow` 와 **다른 모양이다** —
 * 교습비와 독서실비가 `items[]` 로 쪼개져 온다.
 */
export interface IssuedBilling {
  id: number
  name: string
  serviceYear: number
  serviceMonth: number
  suppliedAmount: number
  discountAmount: number
  billedAmount: number
  dueDate: string | null
  items: { itemType: string; suppliedAmount: number; discountAmount: number; billedAmount: number }[]
}

/**
 * 월 교습비 청구 발행.
 *
 * ★ **금액을 화면이 정하지 않는다.** 단가표(`/tuition/prices`)와 그 달의 교습일수를 서버가
 *   보고 계산한다. 그래서 금액을 직접 적는 `createBilling` 대신 이쪽을 쓴다 —
 *   직접 적으면 단가표와 어긋난 금액이 조용히 들어간다.
 *
 * ★ **같은 달을 두 번 발행하면 409** (`BILLING_ALREADY_ISSUED`,
 *   "2026년 11월 교습비 청구가 이미 있습니다"). 일괄 발행이 중간에 끊겨 다시 돌려도
 *   중복이 안 생긴다 — 화면은 이 409 를 **실패가 아니라 '이미 있음'으로 세야 한다.**
 *
 * ★ 단가가 없는 달은 404 (`TUITION_PRICE_NOT_FOUND`). 12월을 넣어 확인했다 —
 *   시드에 2월·9월만 등록돼 있다.
 */
export function issueMonthlyBilling(body: {
  enrollmentId: number
  /** yyyy-MM. **청구 1건 = 한 달분**이다 */
  month: string
  seatType: SeatType
  /** 할인 **율**(%)이다. 금액이 아니다 — `createBilling` 쪽은 반대로 금액이다 */
  discountRate?: number
  /** 비우면 월 정액. 중도 입·퇴원이면 실제 다니는 교습일수를 넣는다 */
  remainingDays?: number
  dueDate?: string
}): Promise<IssuedBilling> {
  return request<IssuedBilling>('/api/v1/admin/tuition/billings/monthly', { method: 'POST', body })
}

/**
 * 입학금 청구 발행.
 *
 * ★ 입학금만 나오는 게 아니라 **그 달 교습비도 함께 계산된다.** 그래서 이미 그 달
 *   교습비가 있으면 409 다 — 9월 입학으로 넣었더니 "2026년 9월 교습비 청구가 이미
 *   있습니다"가 왔다(2026-09-14).
 */
export function issueAdmissionBilling(body: {
  enrollmentId: number
  admissionDate: string
  seatType: SeatType
  discountRate?: number
  remainingDays?: number
  dueDate?: string
}): Promise<IssuedBilling> {
  return request<IssuedBilling>('/api/v1/admin/tuition/billings/admission', { method: 'POST', body })
}

/**
 * 입학일 기준 남은 교습일수.
 *
 * ★ 중도 입학이면 월 정액이 아니라 이 일수로 일할 계산한다. 화면이 달력으로 세지 않는다 —
 *   휴일이 지점마다 다르다. 실측: 분당 09-14 입학 → 17일, 12-10 입학 → 22일.
 */
export function getRemainingDays(params: { academyId: number; admissionDate: string }): Promise<number> {
  return request<number>('/api/v1/admin/tuition/billings/remaining-days', { query: { ...params } })
}
