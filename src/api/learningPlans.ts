import { request, requestPaged } from './client'
import type { Paged } from './types'

/* 주·일 학습 계획 (F-4.11-2) — /api/v1/admin/learning-plans */

/** 반 이행 현황 한 줄. 목록 API가 없어 학생 수만큼 호출하던 것을 이걸로 대체했다 */
export interface PlanBoardRow {
  enrollmentId: number
  studentNo: string | null
  studentName: string
  classId: number | null
  className: string | null
  homeroomTeacherId: number | null
  homeroomTeacherName: string | null
  plannedMinutes: number
  /**
   * 이행(O)으로 체크된 **계획** 시간이다.
   * 출결 기반 순공시간과 다른 값이므로 같은 자리에 섞어 보여주면 안 된다.
   */
  doneMinutes: number
  completionRate: number
  totalItems: number
  doneItems: number
  plannedDays: number
  /**
   * 계획을 한 건도 안 쓴 날.
   * 예전에는 달력일 기준이라 휴원일도 미작성으로 잡혔다 — 서버가 고쳤다(2026-09-03).
   * `holiday.plan_excluded` 로 제외할 날을 지정한다(기본 꺼짐).
   */
  missingDays: number
  /** 미작성 판정의 분모가 된 날 수. missingDays 를 이 값과 함께 봐야 의미가 있다 */
  countedDays: number
}

export interface PlanItem {
  id: number
  sequence: number
  /** "HH:mm" */
  startTime: string | null
  endTime: string | null
  durationMinutes: number
  subjectOptionId: number | null
  subject: string | null
  studyTypeOptionId: number | null
  /** 수업 / 인강 / 자습 — 관리자가 마스터로 관리한다 */
  studyType: string | null
  material: string | null
  /**
   * ⚠️ **boolean 이라 '미체크'와 '미이행'이 구분되지 않는다.**
   * 목업은 O · X · 미체크 3종인데 여기서는 2종이다 — docs/API_GAPS.md 5-6 참고.
   */
  done: boolean
  doneAt: string | null
}

export interface PlanDay {
  id: number | null
  date: string
  items: PlanItem[]
  plannedMinutes: number
  doneMinutes: number
  doneCount: number
  totalCount: number
  /** 전주에서 복사해온 날인지 */
  copied: boolean
}

export interface PlanWeek {
  weekStart: string
  days: PlanDay[]
}

export type PlanOptionType = 'SUBJECT' | 'STUDY_TYPE'

/** 과목·학습형태 마스터. 화면이 하드코딩하지 않고 이걸로 그린다 */
export interface PlanOption {
  id: number
  optionType: PlanOptionType
  label: string
  sortOrder: number
}

export interface PlanBoardParams {
  academyId: number
  /** yyyy-MM-dd */
  from: string
  to: string
  classId?: number
  page?: number
  size?: number
  sort?: string
}

export function listPlanBoard(params: PlanBoardParams): Promise<Paged<PlanBoardRow>> {
  const { sort, ...rest } = params
  return requestPaged<PlanBoardRow>('/api/v1/admin/learning-plans', {
    query: { ...rest },
    repeatable: { sort },
  })
}

/** @param date 그 주의 아무 날짜나 주면 서버가 주 단위로 맞춰 돌려준다 */
export function getStudentWeek(enrollmentId: number, date: string): Promise<PlanWeek> {
  return request<PlanWeek>(`/api/v1/admin/learning-plans/students/${enrollmentId}/weeks`, { query: { date } })
}

export function listPlanOptions(academyId: number, year?: number): Promise<PlanOption[]> {
  return request<PlanOption[]>('/api/v1/admin/learning-plans/options', { query: { academyId, year } })
}
