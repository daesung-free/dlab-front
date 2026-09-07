import { request } from './client'

/* 설문 (F-4.6-부속) — /api/v1/admin/surveys
 *
 * ★ 템플릿에서 설문을 만들면 **문항이 복사된다**(참조가 아니다).
 *   그래서 템플릿을 나중에 고쳐도 이미 배포된 설문은 안 바뀐다 — 응답이 "그때 그 문항"에
 *   묶여 있어야 집계가 깨지지 않기 때문이다. 다만 **템플릿 관리 API는 아직 없다**.
 *
 * ★ 문항 순서를 보내지 않는다. **배열 순서가 곧 순서**다(서버 주석).
 *   번호를 받으면 빠진 번호나 중복이 그대로 들어와 유니크 제약에 걸린다. */

export type SurveyType = 'GENERAL' | 'GRADE_INPUT'
export type SurveyScope = 'ALL' | 'BRANCH' | 'CLASS'
export type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TEXT' | 'NUMBER'

export const SURVEY_TYPE_LABEL: Record<SurveyType, string> = {
  GENERAL: '일반',
  GRADE_INPUT: '가채점',
}

export const SCOPE_LABEL: Record<SurveyScope, string> = {
  ALL: '전 지점',
  BRANCH: '지점 전체',
  CLASS: '반',
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: '단일 선택',
  MULTI_CHOICE: '복수 선택',
  TEXT: '주관식',
  NUMBER: '숫자',
}

export interface SurveySummary {
  id: number
  surveyType: SurveyType
  scope: SurveyScope
  academyId: number | null
  classId: number | null
  title: string
  description: string | null
  anonymous: boolean
  opensAt: string
  closesAt: string
  questionCount: number
  /**
   * 서버가 판정한 진행 상태.
   *
   * ★ **화면이 시각을 비교하지 않는다.** 클라이언트 시계가 어긋나 있으면
   *   같은 설문이 사람마다 열려 보이고 닫혀 보인다.
   *
   * ⚠️ 조기 마감은 `closesAt` 을 지금으로 당기는 방식이라 원래 마감 시각이
   *   덮어써진다 — "예정 마감이 언제였나"는 남지 않는다.
   */
  status: SurveyRunState
}

/** SCHEDULED = 아직 안 열림 */
export type SurveyRunState = 'SCHEDULED' | 'OPEN' | 'CLOSED'

export const SURVEY_RUN_STATE_LABEL: Record<SurveyRunState, string> = {
  SCHEDULED: '예정',
  OPEN: '진행중',
  CLOSED: '마감',
}

export interface SurveyParticipant {
  enrollmentId: number
  studentNo: string | null
  studentName: string
  /** null이면 아직 응답 안 함 */
  submittedAt: string | null
}

export interface OptionCount {
  label: string
  count: number
}

export interface QuestionResult {
  questionId: number
  title: string
  type: QuestionType
  answerCount: number
  options: OptionCount[] | null
  average: number | null
  min: number | null
  max: number | null
  texts?: string[] | null
}

export interface SurveyResult {
  survey: SurveySummary
  responseCount: number
  questions: QuestionResult[]
}

export interface SurveyQuestionCreate {
  type: QuestionType
  title: string
  required?: boolean
  minValue?: number
  maxValue?: number
  /** 선택형이면 필수 */
  options?: string[]
}

export interface SurveyCreate {
  surveyType: SurveyType
  scope: SurveyScope
  academyId?: number
  classId?: number
  title: string
  description?: string
  anonymous?: boolean
  /** Instant — `2026-09-01T00:00:00Z` 처럼 타임존을 붙인다 */
  opensAt: string
  closesAt: string
  questions: SurveyQuestionCreate[]
}

export function listSurveys(year?: number): Promise<SurveySummary[]> {
  return request<SurveySummary[]>('/api/v1/admin/surveys', { query: { year } })
}

export function getSurveyResult(surveyId: number): Promise<SurveyResult> {
  return request<SurveyResult>(`/api/v1/admin/surveys/${surveyId}/results`)
}

export function listSurveyParticipants(surveyId: number): Promise<SurveyParticipant[]> {
  return request<SurveyParticipant[]>(`/api/v1/admin/surveys/${surveyId}/participants`)
}

export function createSurvey(body: SurveyCreate): Promise<SurveySummary> {
  return request<SurveySummary>('/api/v1/admin/surveys', { method: 'POST', body })
}

/** 조기 마감. 기간이 남았어도 닫는다 */
export function closeSurvey(surveyId: number): Promise<void> {
  return request<void>(`/api/v1/admin/surveys/${surveyId}/close`, { method: 'PATCH' })
}
