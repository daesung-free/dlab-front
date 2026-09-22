import { request } from './client'

/* 연간 행사 — /api/v1/admin/annual-events (2026-09-21 신설)
 *
 * 휴일(`/holidays`)과 **다른 도메인이다.** 휴일은 '쉬는 날'이라 교습일수·급식·학습계획 차단에 쓰이고,
 * 행사는 달력에 **보여주기만** 한다(개원식·수련회·설명회·모의고사). 교습일수·급식 계산에는 안 쓴다.
 *
 * ★ 기간을 한 줄로 받는다(startDate~endDate). 휴일처럼 하루씩 쪼개지 않는다.
 * ★ 목록은 **지점 행사와 전 지점 공통을 합쳐서** 준다. 지점을 비우고 만들면 공통(본사만).
 * ★ 삭제는 지우지 않고 내린다 — 지난 행사가 학습계획·통계의 근거로 남아야 한다.
 */

export type AnnualEventType = 'ACADEMY' | 'EXAM' | 'HOLIDAY_EVENT' | 'ETC'

export const ANNUAL_EVENT_TYPE_LABEL: Record<AnnualEventType, string> = {
  ACADEMY: '학원 행사',
  EXAM: '시험',
  HOLIDAY_EVENT: '휴일 행사',
  ETC: '기타',
}

export interface AnnualEvent {
  id: number
  year: number
  academyId: number | null
  /** 전 지점 공통인가 */
  shared: boolean
  name: string
  startDate: string
  endDate: string
  eventType: AnnualEventType
  /** false 면 내부 일정 — 학습계획·학생 달력에 안 보인다 */
  showInPlan: boolean
  memo: string | null
}

export function listAnnualEvents(academyId: number | null, year: number): Promise<AnnualEvent[]> {
  return request<AnnualEvent[]>('/api/v1/admin/annual-events', { query: { academyId: academyId ?? undefined, year } })
}

export function createAnnualEvent(body: {
  /** 비우면 전 지점 공통 — 본사만 */
  academyId?: number
  year: number
  name: string
  startDate: string
  /** 하루짜리는 시작일과 같은 값 */
  endDate: string
  eventType: AnnualEventType
  showInPlan?: boolean
  memo?: string
}): Promise<AnnualEvent> {
  return request<AnnualEvent>('/api/v1/admin/annual-events', { method: 'POST', body })
}

/**
 * 비워 보낸 항목은 바꾸지 않는다 — **memo 만 예외로, 안 보내면 지워진다**(2026-09-21 확인:
 * showInPlan 만 보냈더니 비고가 사라졌다). 다른 칸만 바꿀 때도 지금 memo 를 함께 보낸다.
 */
export function updateAnnualEvent(
  id: number,
  body: Partial<Pick<AnnualEvent, 'name' | 'startDate' | 'endDate' | 'eventType' | 'showInPlan' | 'memo'>>,
): Promise<AnnualEvent> {
  return request<AnnualEvent>(`/api/v1/admin/annual-events/${id}`, { method: 'PATCH', body })
}

export function deleteAnnualEvent(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/annual-events/${id}`, { method: 'DELETE' })
}

/**
 * 연간 행사만 전년도 → 올해로 복사(2026-09-21 추가). 날짜는 한 해 뒤로 민다.
 * ★ 같은 이름·시작일이 이미 있으면 건너뛴다 — 두 번 눌러도 두 벌이 되지 않는다.
 * ★ 기초 데이터 전체 복사(yearly-copy)와 달리 새 해에 다른 데이터가 있어도 된다.
 * ★ academyId 를 비우면 전 지점 공통 행사(본사만).
 */
export function copyAnnualEventsYear(body: { academyId?: number; fromYear: number; toYear: number }): Promise<{ copied: number; skipped: number }> {
  return request<{ copied: number; skipped: number }>('/api/v1/admin/annual-events/copy-year', { method: 'POST', body })
}

