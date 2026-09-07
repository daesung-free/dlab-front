import { request } from './client'

/* 휴일 (F-4.11-10 연간 행사) — /api/v1/admin/holidays
 *
 * ⚠️ **이건 '연간 행사' 마스터가 아니라 '휴일' 마스터다.** 목업이 다루는 다섯 유형
 *   (모의고사·휴원·특강·설명회·행사) 중 **휴원 계열만** 서버에 있다. 모의고사·특강·
 *   설명회는 넣을 곳이 없다(API_GAPS 16-1).
 *
 * ★ **하루짜리다.** `date` 하나뿐이라 연휴는 날짜 수만큼 행이 생긴다.
 *   목업의 '기간'(from~to) 입력은 여러 건으로 쪼개 보내야 한다.
 *
 * ★ **전 지점 공통은 본사만** 넣는다. 지점 관리자가 넣으면 다른 지점 급식까지 막혀서다.
 *   지점은 `academyId` 를 붙여 자기 지점 것만 넣는다.
 *
 * ★ 같은 날짜에 두 번 넣으면 409 다.
 *
 * ⚠️ 삭제는 soft 다. 과거 급식 신청이 어느 규칙으로 계산됐는지 추적이 끊기지 않게 한다. */

export type HolidayType = 'PUBLIC' | 'SUBSTITUTE' | 'TEMPORARY' | 'ACADEMY'

export const HOLIDAY_TYPE_LABEL: Record<HolidayType, string> = {
  PUBLIC: '공휴일',
  SUBSTITUTE: '대체공휴일',
  TEMPORARY: '임시휴일',
  ACADEMY: '학원 휴원',
}

export interface Holiday {
  id: number
  /** null 이면 전 지점 공통이다 */
  academyId: number | null
  nationwide: boolean
  /** yyyy-MM-dd. 하루짜리다 — 연휴는 행이 여러 개다 */
  date: string
  name: string
  type: HolidayType
  /**
   * 그날 학생이 학습계획을 못 세운다.
   *
   * ★ 차단일은 '미작성'이 아니다 — 담임 화면의 미작성 집계에서 빠져야 한다.
   *   안 그러면 휴원일마다 전교생이 미작성자로 잡혀 경고가 무의미해진다.
   *
   * ⚠️ **차단은 '입력 금지'이지 '삭제'가 아니다.** 이미 계획을 쓴 날을 나중에 차단으로
   *   바꿨을 때 기존 계획을 어떻게 할지(보존 후 읽기전용 / 이행 집계에서 제외 /
   *   학생에게 알림)는 정해지지 않았다 — #41 · I-21.
   */
  planExcluded: boolean
}

export interface HolidayRequest {
  /** 안 보내면 전 지점 공통. **본사만 그렇게 넣을 수 있다** */
  academyId?: number
  date: string
  name: string
  type: HolidayType
  planExcluded?: boolean
}

/** `from`·`to` 둘 다 필수다. 안 보내면 400 이다 */
export function listHolidays(from: string, to: string): Promise<Holiday[]> {
  return request<Holiday[]>('/api/v1/admin/holidays', { query: { from, to } })
}

export function createHoliday(body: HolidayRequest): Promise<Holiday> {
  return request<Holiday>('/api/v1/admin/holidays', { method: 'POST', body })
}

/**
 * 이름과 학습계획 차단 여부만 고친다.
 * 날짜·유형을 바꿀 일이면 지우고 새로 넣는 게 이력상 명확하다 — 다만 본문에는
 * `date`·`type` 이 필수라 **기존 값을 그대로 실어 보내야 한다.**
 */
export function updateHoliday(id: number, body: HolidayRequest): Promise<Holiday> {
  return request<Holiday>(`/api/v1/admin/holidays/${id}`, { method: 'PATCH', body })
}

export function deleteHoliday(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/holidays/${id}`, { method: 'DELETE' })
}
