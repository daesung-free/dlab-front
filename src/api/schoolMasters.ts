import { request } from './client'

/* 기초 관리 탭 — 교시 · 사유 분류 · 상담 태그
 *
 * ★ 셋 다 `BasicSettings.tsx` 의 `MASTERS` 배열에 항목으로 붙는다. 화면을 새로 만들지 않는다.
 *
 * ★ **필수 파라미터가 제각각이다.** 안 보내면 400 이고, 무엇이 빠졌는지는 메시지로만 온다.
 *     교시        year 필수 · academyId 선택
 *     사유 분류    academyId 필수(전 지점 공통으로 만들려면 비운다 — 본사만 가능)
 *     상담 태그    year 필수
 */

/* ── 교시 ── */

export type DayType = 'WEEKDAY' | 'SATURDAY' | 'SUNDAY'
export type PeriodType = 'CLASS' | 'SELF_STUDY' | 'MEAL' | 'BREAK' | 'ETC'

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  WEEKDAY: '평일',
  SATURDAY: '토요일',
  SUNDAY: '일요일',
}

/** ★ `MEAL`·`BREAK` 는 **순공시간에서 빠진다.** 시각이 아니라 이 값이 기준이다 */
export const PERIOD_TYPE_LABEL: Record<PeriodType, string> = {
  CLASS: '수업',
  SELF_STUDY: '자습',
  MEAL: '식사',
  BREAK: '휴식',
  ETC: '기타',
}

export interface Period {
  id: number
  academyId: number | null
  year: number
  dayType: DayType
  periodNo: number
  name: string | null
  periodType: PeriodType
  /** `HH:mm` */
  startTime: string
  endTime: string
  /** 학습계획을 넣을 수 있는 시간대인가. 0723 확정으로 점심·저녁도 허용이라 기본 참이다 */
  planable: boolean
  mandatory: boolean
}

export interface PeriodBody {
  academyId?: number
  year: number
  dayType: DayType
  periodNo: number
  name?: string
  periodType: PeriodType
  startTime: string
  endTime: string
  planable: boolean
  mandatory: boolean
}

/** ★ `year` 가 **필수**다 */
export function listPeriods(params: { academyId?: number; year: number; dayType?: DayType }): Promise<Period[]> {
  return request<Period[]>('/api/v1/admin/periods', { query: { ...params } })
}

/**
 * 교시 등록.
 *
 * ★ **서버가 두 가지를 막는다.** 둘 다 409 이고 메시지가 그대로 쓸 만하다 —
 *   화면이 다시 계산하지 않고 그대로 보여준다.
 *     `PERIOD_TIME_OVERLAPPED`  "11교시(23:00~23:50)와 겹칩니다"
 *     `PERIOD_NO_DUPLICATED`    "같은 요일 구분에 이미 있는 교시 번호입니다"
 *
 * ★ **교시 번호는 요일 구분마다 따로 매겨진다.** 평일 1교시와 일요일 1교시가 공존한다 —
 *   목록을 번호만으로 정렬하면 세 요일이 뒤섞인다.
 */
export function createPeriod(body: PeriodBody): Promise<Period> {
  return request<Period>('/api/v1/admin/periods', { method: 'POST', body })
}

export function updatePeriod(id: number, body: PeriodBody): Promise<Period> {
  return request<Period>(`/api/v1/admin/periods/${id}`, { method: 'PUT', body })
}

export function deletePeriod(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/periods/${id}`, { method: 'DELETE' })
}

/* ── 사유 분류 ── */

export interface AbsenceCategory {
  id: number
  academyId: number | null
  /** 전 지점 공통인가. `academyId` 가 없으면 참이다 */
  nationwide: boolean
  year: number | null
  name: string
  sortOrder: number
  active?: boolean
}

/** ★ `academyId` 를 안 보내면 400("지점을 지정해야 합니다") */
export function listAbsenceCategories(params: {
  academyId: number
  year?: number
  activeOnly?: boolean
}): Promise<AbsenceCategory[]> {
  return request<AbsenceCategory[]>('/api/v1/admin/absence-categories', { query: { ...params } })
}

/**
 * 사유 분류 등록.
 *
 * ★ `academyId` 를 **비우면 전 지점 공통**이 된다. 본사 계정만 만들 수 있다 —
 *   화면은 고른 지점으로 만든다. 공통으로 만들 자리는 따로 두지 않았다.
 */
export function createAbsenceCategory(body: {
  academyId: number
  year?: number
  name: string
  sortOrder?: number
}): Promise<AbsenceCategory> {
  return request<AbsenceCategory>('/api/v1/admin/absence-categories', { method: 'POST', body })
}

export function updateAbsenceCategory(
  categoryId: number,
  body: { name: string; sortOrder?: number },
): Promise<AbsenceCategory> {
  return request<AbsenceCategory>(`/api/v1/admin/absence-categories/${categoryId}`, { method: 'PUT', body })
}

export function deleteAbsenceCategory(categoryId: number): Promise<void> {
  return request<void>(`/api/v1/admin/absence-categories/${categoryId}`, { method: 'DELETE' })
}

/* ── 상담 태그 ── */

export type ConsultType = 'REGULAR' | 'SCORE' | 'LIFE' | 'ADMISSION' | 'PARENT'

export const CONSULT_TYPE_LABEL: Record<ConsultType, string> = {
  REGULAR: '정기',
  SCORE: '성적',
  LIFE: '생활',
  ADMISSION: '입시',
  PARENT: '학부모',
}

export interface ConsultTag {
  id: number
  consultType: ConsultType | null
  name: string
  sortOrder: number
  /** 상담 화면에서 한 번에 보여줄 개수 */
  maxDisplay: number
  active: boolean
}

/**
 * 상담 태그 목록.
 *
 * ★ **기본은 활성만 온다.** 끈 태그를 보려면 `includeInactive` 를 켜야 한다 —
 *   안 켜면 방금 끈 태그가 사라져서 "지워졌나?" 하게 된다.
 */
export function listConsultTags(params: {
  academyId?: number
  year: number
  includeInactive?: boolean
}): Promise<ConsultTag[]> {
  return request<ConsultTag[]>('/api/v1/admin/consults/tags', { query: { ...params } })
}

export function createConsultTag(
  academyId: number,
  body: { year: number; name: string; consultType?: ConsultType; sortOrder?: number },
): Promise<ConsultTag> {
  return request<ConsultTag>('/api/v1/admin/consults/tags', { method: 'POST', query: { academyId }, body })
}

/**
 * 상담 태그 수정.
 *
 * ★ **삭제가 없다**(`DELETE` 는 405). 지우는 대신 `active: false` 로 끈다 —
 *   이미 붙은 상담 기록의 태그가 사라지면 안 되기 때문으로 보인다.
 *   그래서 화면의 '삭제' 도 끄기로 동작한다.
 *
 * ★ `name` 과 `active` 가 **둘 다 필수**다. 끄기만 하려 해도 이름을 함께 보내야 한다.
 */
export function updateConsultTag(
  tagId: number,
  body: { name: string; active: boolean; consultType?: ConsultType; sortOrder?: number; maxDisplay?: number },
): Promise<ConsultTag> {
  return request<ConsultTag>(`/api/v1/admin/consults/tags/${tagId}`, { method: 'PUT', body })
}
