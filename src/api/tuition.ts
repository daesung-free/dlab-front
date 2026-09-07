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
