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

/** MONTHLY(월례고사)는 디랩 시험에만 있다 — 입학 전 성적 양식에는 안 나온다 */
export type ExamCode = 'JUNE' | 'SEPT' | 'OCT' | 'CSAT' | 'MONTHLY'

export const EXAM_CODE_LABEL: Record<ExamCode, string> = {
  JUNE: '6월',
  SEPT: '9월',
  OCT: '10월',
  CSAT: '수능',
  MONTHLY: '월례',
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
  /**
   * ADMISSION = 입학 전 성적(학생이 가입 때 넣는 것), ACADEMY = 디랩에서 본 시험.
   * ★ 성적 파일 업로드는 ACADEMY 에만 된다 — 입학 전 양식에 올리면 학생이 넣은 입학 성적이 교체된다
   */
  purpose?: 'ADMISSION' | 'ACADEMY'
  /** 시행일(yyyy-MM-dd). ACADEMY 는 필수 — 월례고사는 코드만으로 달이 구분되지 않는다 */
  examDate?: string | null
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

/**
 * 시험 양식(성적 표의 열).
 *
 * ★ **지점을 보내지 않는다.** 시험 양식은 전 지점 공통이라 서버에 `academy_id` 가
 *   NULL 인 행으로 들어 있다. `academyId` 를 붙이면 그 행들이 걸러져 **0건**이 온다 —
 *   화면은 "시험 양식이 없습니다"를 띄우고 성적 표가 열을 못 만든다.
 *   실호출: `?year=2026` → 9건 · `?year=2026&academyId=1` → 0건 (2026-09-11).
 */
export function listExamForms(year: number): Promise<ExamForm[]> {
  return request<ExamForm[]>('/api/v1/admin/exam-forms', { query: { year } })
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
 *
 * ★ **`null` 이 실제로 지운다.** 학생 상태·특강의 `PATCH` 는 `null` 을 무시해서 한 번 넣은
 *   값을 못 비우는데, 이쪽은 다르다 — 잘못 적은 내신을 되돌릴 수 있다(2026-09-14 확인).
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
 *
 * ★ `examSubjectId` 는 **회차마다 새로 매겨진다.** HIGH2 는 6월이 1~5, 9월이 6~10 이다.
 *   한 회차의 id 로 다른 회차를 건드릴 수 없고, 화면도 열을 id 로 맞추면 안 된다
 *   (`ScoreReport.tsx` 상단 주석 참고).
 *
 * ★ 조회 응답의 `exams` 는 **그 학년 전 회차가 항상 들어온다.** 안 낸 회차는 점수가 전부
 *   `null` 인 채로 온다 — 배열 길이로 "제출 여부"를 판단하면 안 된다.
 */
export function updateExamScores(enrollmentId: number, scores: ScoreInput[]): Promise<GradeSubmission> {
  return request<GradeSubmission>(`/api/v1/admin/students/${enrollmentId}/grades/exam-scores`, {
    method: 'PUT',
    body: { scores },
  })
}

/* ── 디랩 시험 회차 · 성적 파일 업로드 (F-4.6 부속 — 0921 성적 문서) ─────────────────────────
 *
 * 학원이 더프리미엄·평가원 파일을 **받은 그대로** 올린다. 양식을 우리가 새로 만들지 않는다.
 *
 * ★ 순서가 있다: ① 성적(학생별 점수) · ② 문항 정보(문항분석표 + 정답률) · ③ 정오·답안.
 *   ③은 ②가 없으면 서버가 거절한다 — 국어·수학의 공통/선택 경계(1~34 / 35~45번)를
 *   문항분석표에서 알아내기 때문이다. ①은 ②·③과 무관하다.
 * ★ 학생은 **이름**으로 찾는다. 파일의 학교코드·반·번호는 우리 학번과 체계가 달라 못 쓴다.
 *   동명이인은 자동으로 넣지 않고 멈춘다 — 사람이 한 번 이어주면(links) 다음 회차부터 자동이다.
 */

export interface ExamFormSubjectInput {
  subjectCode: string
  subjectName: string
  sortOrder?: number
  hasStandardScore?: boolean
  hasPercentile?: boolean
  hasGradeLevel?: boolean
}

export interface ExamFormCreate {
  /** 비우면 전 지점 공통 */
  academyId?: number
  year: number
  gradeType: GradeType
  examCode: ExamCode
  examName: string
  sortOrder?: number
  subjects: ExamFormSubjectInput[]
  purpose: 'ACADEMY'
  examDate: string
}

/**
 * 지점 회차까지 합쳐서 받는다.
 *
 * ★ `academyId` 를 붙이면 **그 지점 전용 회차만** 오고, 빼면 **전 지점 공통만** 온다
 *   (2026-09-21 실호출: 빼면 9건 · `academyId=8` 이면 분당 전용 3건). 둘 다 불러 합친다.
 */
export async function listAllExamForms(year: number, academyId: number | null): Promise<ExamForm[]> {
  const [common, mine] = await Promise.all([
    request<ExamForm[]>('/api/v1/admin/exam-forms', { query: { year } }),
    academyId === null
      ? Promise.resolve([] as ExamForm[])
      : request<ExamForm[]>('/api/v1/admin/exam-forms', { query: { year, academyId } }),
  ])
  const byId = new Map<number, ExamForm>()
  for (const f of [...common, ...mine]) byId.set(f.examMasterId, f)
  return [...byId.values()]
}

/** 디랩 시험 회차 등록. 과목 없이는 만들 수 없다 */
export function createExamForm(body: ExamFormCreate): Promise<ExamForm> {
  return request<ExamForm>('/api/v1/admin/exam-forms', { method: 'POST', body })
}

export interface ScoreUploadMatched {
  rowNumber: number
  enrollmentId: number
  studentNo: string | null
  name: string
  subjectCount: number
}

export interface ScoreUploadUnmatched {
  /** 엑셀 기준 행 번호 */
  rowNumber: number
  /** 연결(links)에 필요하다 — 학교코드·반·번호 세 값이 키다 */
  schoolCode: string
  name: string
  classNo: string
  /** 파일의 번호("반 번호 + 3자리 순번"). 우리 학번과 다른 체계다 */
  studentNo: string
  /** 서버가 적어 준 사유 — 그대로 보여준다 */
  reason: string
}

export interface ScoreUploadResult {
  examName: string
  totalRows: number
  /** 외부생이라 건너뛴 행. 안 보여주면 "왜 인원이 다르냐" 가 된다 */
  skippedExternal: number
  matched: ScoreUploadMatched[]
  unmatched: ScoreUploadUnmatched[]
}

function fileForm(parts: Record<string, File | null | undefined>): FormData {
  const fd = new FormData()
  for (const [k, f] of Object.entries(parts)) if (f) fd.append(k, f)
  return fd
}

/** ① 성적 파일 미리보기 — **저장하지 않는다.** 누가 매칭됐는지 먼저 본다 */
export function previewScoreUpload(academyId: number, examMasterId: number, file: File): Promise<ScoreUploadResult> {
  return request<ScoreUploadResult>('/api/v1/admin/grades/exam-scores/upload/preview', {
    method: 'POST',
    query: { academyId, examMasterId },
    body: fileForm({ file }),
  })
}

/**
 * ① 성적 파일 반영. **매칭된 학생만** 저장한다 — 못 찾은 행은 사유와 함께 돌아온다.
 * 같은 회차를 다시 올리면 그 회차 점수가 교체된다.
 */
export function applyScoreUpload(academyId: number, examMasterId: number, file: File): Promise<ScoreUploadResult> {
  return request<ScoreUploadResult>('/api/v1/admin/grades/exam-scores/upload', {
    method: 'POST',
    query: { academyId, examMasterId },
    body: fileForm({ file }),
  })
}

/** 못 찾은 행을 학생에 잇는다. **한 번 이으면 다음 회차부터 자동**이다(연도 단위) */
export function linkUploadRow(body: {
  academyId: number
  year: number
  schoolCode: string
  classNo: string
  studentNo: string
  enrollmentId: number
}): Promise<unknown> {
  return request('/api/v1/admin/grades/exam-scores/upload/links', { method: 'POST', body })
}

export interface ExamItemResult {
  itemCount: number
  ratesApplied: number
  /** 이어지지 않은 정답률. 비어 있지 않으면 경고 — 과목명 표기가 달라 전국 정답률이 안 붙었다 */
  unmatchedRates: string[]
}

/** ② 문항 정보 — 문항분석표(필수) + 정답률(선택). 다시 올리면 그 회차 문항이 통째로 교체된다 */
export function uploadExamItems(examMasterId: number, analysis: File, rates: File | null): Promise<ExamItemResult> {
  return request<ExamItemResult>('/api/v1/admin/grades/exam-items/upload', {
    method: 'POST',
    query: { examMasterId },
    body: fileForm({ analysis, rates }),
  })
}

export interface ExamResponseResult {
  savedStudents: number
  skippedExternal: number
  unmatched: { rowNumber: number; name: string; reason: string }[]
  /** 대응표에 없는 과목 약어. 비어 있지 않으면 그 과목 채점이 빠졌다 — 경고할 것 */
  unknownSubjects: string[]
}

/** ③ 정오·답안 — 정오표(필수) + 답안표(선택). ②가 없으면 서버가 거절한다 */
export function uploadExamResponses(
  academyId: number,
  examMasterId: number,
  results: File,
  answers: File | null,
): Promise<ExamResponseResult> {
  return request<ExamResponseResult>('/api/v1/admin/grades/exam-responses/upload', {
    method: 'POST',
    query: { academyId, examMasterId },
    body: fileForm({ results, answers }),
  })
}
