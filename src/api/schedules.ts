import { request } from './client'

/* 정기일정 · 인정 판정 (F-4.11-8) — /api/v1/admin/schedules
 *
 * ★ 학생이 앱에서 내는 **그 달의 반복 일정**이다(학원 밖 수업·병원 등). 담임이 대신 낼 수도 있다.
 *   그 시간에 자리를 비워도 무단이 아니게 하는 근거가 된다.
 *
 * ★ **사유 신청과 다른 것이다.** 사유 신청은 하루짜리 사후 신고이고, 이쪽은 미리 내는
 *   요일 단위 반복이다. 그래서 **지난 달은 등록이 거절된다** — 사후 인정 통로가 되면
 *   사유 신청이 무의미해진다(서버 주석).
 */

export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY'

export const DAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
  SUNDAY: '일',
}

/** 요일 정렬용. 객체 키 순서에 기대면 안 된다 */
export const DAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
]

export interface ScheduleItem {
  id: number
  dayOfWeek: DayOfWeek
  /** `HH:mm:ss` 로 올 수 있다 — 화면은 앞 5글자만 쓴다 */
  startTime: string
  endTime: string
  title: string
  place: string | null
}

export interface ScheduleMonth {
  scheduleId: number
  enrollmentId: number
  studentName: string
  studentNo: string | null
  year: number
  month: number
  /** `STUDENT` 는 학생이 앱에서 낸 것, `ADMIN` 은 담임이 대신 낸 것 */
  source: 'STUDENT' | 'ADMIN'
  /**
   * ⚠️ **관리자 등록분은 `null` 이다** — 승인 요청 없이 바로 인정되기 때문이다.
   *   이 값으로 "승인됐나"를 판단하면 담임이 낸 일정이 전부 미승인으로 보인다.
   *   **`approved` 를 본다.**
   */
  approvalStatus: string | null
  approved: boolean
  items: ScheduleItem[]
}

/**
 * 그 달에 정기일정을 낸 학생 전체.
 *
 * ★ `month` 는 `yyyy-MM`. 비우면 이번 달이다.
 * ★ **`academyId` 는 스펙상 선택인데 실제로는 필수다** — 안 보내면 400
 *   "지점을 지정해야 합니다"(2026-09-16 확인). 스펙보다 실제 응답을 믿는다.
 */
export function listSchedules(params: { academyId?: number; month?: string }): Promise<ScheduleMonth[]> {
  return request<ScheduleMonth[]>('/api/v1/admin/schedules', { query: { ...params } })
}

export interface ScheduleItemInput {
  dayOfWeek: DayOfWeek
  /** `HH:mm` */
  startTime: string
  endTime: string
  title: string
  place?: string
}

/**
 * 담임이 대신 등록. **자동 승인이다** — 별도 승인 절차가 없다.
 *
 * ★ **지난 달은 거절된다.** 사후 인정 통로가 되면 사유 신청이 무의미해지기 때문이다.
 *   화면은 이번 달·다음 달만 고르게 한다.
 */
export function submitSchedule(
  enrollmentId: number,
  body: { month: string; items: ScheduleItemInput[] },
): Promise<ScheduleMonth> {
  return request<ScheduleMonth>(`/api/v1/admin/schedules/students/${enrollmentId}`, { method: 'POST', body })
}

/**
 * 항목 교체.
 *
 * ★ **통째로 갈아끼운다.** 병합이 아니다 — 병합하면 지운 항목을 지울 방법이 없다(서버 주석).
 *   그래서 화면은 **현재 항목을 전부 실어** 보낸다. 한 줄만 고치려고 그 줄만 보내면
 *   나머지가 전부 사라진다.
 */
export function replaceScheduleItems(scheduleId: number, items: ScheduleItemInput[]): Promise<ScheduleMonth> {
  return request<ScheduleMonth>(`/api/v1/admin/schedules/${scheduleId}/items`, { method: 'PUT', body: { items } })
}

/** 삭제(soft). 이미 인정 판정에 쓰인 일정이 이력에서 사라지지 않는다 */
export function deleteSchedule(scheduleId: number): Promise<void> {
  return request<void>(`/api/v1/admin/schedules/${scheduleId}`, { method: 'DELETE' })
}

/**
 * 인정 판정 — 그날 일정을 지켰는지 보고 **미인정이면 벌점**을 준다.
 *
 * ★ **규칙이 없으면 아무 일도 일어나지 않는다.** 트리거→점수 매핑이 켜질 때까지 엔진이
 *   그냥 통과한다(서버 주석). 상벌점 화면에서 `정기 일정 / 미인정` 규칙을 켜야 돈다 —
 *   눌러도 조용하면 그것부터 확인한다.
 *
 * ★ 다시 돌려도 멱등하다. 그래도 화면은 처리 중 버튼을 막는다.
 */
export function runCompliance(enrollmentId: number, date: string): Promise<unknown> {
  return request<unknown>(`/api/v1/admin/schedules/students/${enrollmentId}/compliance`, {
    method: 'POST',
    query: { date },
  })
}
