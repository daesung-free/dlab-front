import { request } from './client'
import type { GradeType } from './students'

/* 성적 (F-4.6) — /api/v1/admin/exam-forms · /students/{id}/grades
 *
 * ★ **처음 입력은 학생, 이후 수정은 직원**이다(0826 회신). 직원 수정 경로가 따로 있고
 *   앱과 같은 본문 형식을 쓴다. 응답의 `modifiedBy` 가 그 흔적이다 —
 *   null 이면 학생이 낸 그대로, 값이 있으면 직원이 고친 것이다.
 *   **장학 취소 판정이 이 등급을 근거로 돌기 때문에** 누가 고쳤는지가 남아야 한다.
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
  /**
   * 직원 id. **null 이면 학생이 낸 그대로**다.
   *
   * ⚠️ id 만 온다 — 이름을 붙이려면 별도 조회가 필요한데 그 API가 없다(API_GAPS 12-1).
   */
  modifiedBy: number | null
  modifiedAt: string | null
  exams: ExamResult[]
}

/** PUT 본문. 조회용 `ScoreItem` 과 달리 `subjectName` 이 없다 */
export interface ScoreInput {
  examSubjectId: number
  standardScore?: number | null
  percentile?: number | null
  gradeLevel?: number | null
}

export function listExamForms(year: number, academyId?: number): Promise<ExamForm[]> {
  return request<ExamForm[]>('/api/v1/admin/exam-forms', { query: { year, academyId } })
}

export function getStudentGrades(enrollmentId: number): Promise<GradeSubmission> {
  return request<GradeSubmission>(`/api/v1/admin/students/${enrollmentId}/grades`)
}

/**
 * 내신 직원 수정.
 *
 * ★ **제출 이력이 없는 학생에게 보내면 새로 만든다.** 직전 조회가 404
 *   (`GRADE_SUBMISSION_NOT_FOUND`)여도 이 호출은 200이다 — 수정 경로가 생성도 겸한다.
 *   `null` 은 "아직 모른다"로 허용된다(모의고사만 먼저 내는 학생이 있다).
 */
export function updateSchoolRecord(
  enrollmentId: number,
  mainSubjectAverage: number | null,
): Promise<GradeSubmission> {
  return request<GradeSubmission>(`/api/v1/admin/students/${enrollmentId}/grades/school-record`, {
    method: 'PUT',
    body: { mainSubjectAverage },
  })
}

/**
 * 모의고사 직원 수정.
 *
 * ★ **보낸 회차만 교체된다.** 안 보낸 회차는 그대로 남으므로, 한 회차를 고치려고
 *   전 회차를 실어 보낼 필요가 없다. 반대로 **회차를 지우는 수단은 아니다.**
 */
export function updateExamScores(enrollmentId: number, scores: ScoreInput[]): Promise<GradeSubmission> {
  return request<GradeSubmission>(`/api/v1/admin/students/${enrollmentId}/grades/exam-scores`, {
    method: 'PUT',
    body: { scores },
  })
}
