import { request } from './client'
import type { GradeType } from './students'

/* 성적 (F-4.6) — /api/v1/admin/exam-forms · /students/{id}/grades
 *
 * ★ **입력은 앱(학생) 전용이다.** 관리자는 양식을 만들고 결과를 볼 뿐,
 *   점수를 대신 넣을 수 없다(`/api/v1/app/grades/*` 가 학생 인증을 요구한다).
 *   설문과 같은 구조다 — 관리 = 양식·배포, 앱 = 응답.
 *
 * ★ `subjectCode` 와 `subjectName` 이 분리돼 있다. 표시명("통합사회")은 해마다 바뀌는데
 *   통계는 국어끼리 묶여야 해서, 축은 코드가 갖는다. */

export type ExamCode = 'JUNE' | 'SEPT' | 'OCT' | 'CSAT'

export const EXAM_CODE_LABEL: Record<ExamCode, string> = {
  JUNE: '6월',
  SEPT: '9월',
  OCT: '10월',
  CSAT: '수능',
}

export interface ExamSubject {
  examSubjectId: number
  subjectCode: string
  subjectName: string
  sortOrder: number
  /** 한국사처럼 절대평가 과목은 false. 그 칸은 입력·표시하지 않는다 */
  hasStandardScore: boolean
  hasPercentile: boolean
  hasGradeLevel: boolean
}

export interface ExamForm {
  examMasterId: number
  /** null이면 전 지점 공통. 지점 행이 있으면 그 지점에서는 공통본 대신 그것이 쓰인다 */
  academyId: number | null
  year: number
  gradeType: GradeType
  examCode: ExamCode
  /** 신상기록부에 적힌 문구 그대로. 서버가 연도를 조합해 만들지 않는다 */
  examName: string
  sortOrder: number
  subjects: ExamSubject[]
}

export interface ScoreItem {
  examSubjectId: number
  subjectName: string
  standardScore: number | null
  percentile: number | null
  gradeLevel: number | null
}

export interface ExamResult {
  examMasterId: number
  examCode: ExamCode
  examName: string
  scores: ScoreItem[]
}

export interface GradeSubmission {
  mainSubjectAverage: number | null
  /**
   * true면 **모른다고 체크한 것**이지 미입력이 아니다.
   * 이때 `scores` 는 비어 있고 `skipReason` 이 채워진다.
   */
  examSkipped: boolean
  skipReason: string | null
  submittedAt: string | null
  exams: ExamResult[]
}

export function listExamForms(year: number, academyId?: number): Promise<ExamForm[]> {
  return request<ExamForm[]>('/api/v1/admin/exam-forms', { query: { year, academyId } })
}

export function getStudentGrades(enrollmentId: number): Promise<GradeSubmission> {
  return request<GradeSubmission>(`/api/v1/admin/students/${enrollmentId}/grades`)
}
