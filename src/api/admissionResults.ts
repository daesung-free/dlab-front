import { request } from './client'

/* 입시 실적 (F-4.10-6 실적 관리) — /api/v1/admin/admission-results
 *
 * ★ **지원 목록과 실적이 같은 데이터다.** 학생이 수시·정시 지원 대학을 넣고, 직원이 발표 뒤
 *   합불을 채운다. 따로 두면 같은 대학을 두 번 입력하게 된다(성적 입력과 같은 방식 —
 *   "처음 입력은 학생, 이후 수정은 직원", 0826 회신).
 *
 * ★ **조회는 학생 한 명 단위뿐이다.** 그해 전체 목록을 주는 경로가 없다 — 학생마다 부르면
 *   인원수만큼 요청이 나가므로 화면은 학생을 골라서 보게 만들었다. API_GAPS 29-1.
 *
 * ★ **정원이 있다 — 수시 6 · 정시 3.** 넘기면 서버가 400 으로 막는다
 *   ("정시는 3개까지 등록합니다. 지우고 다시 넣어 주세요."). 문구가 그대로 쓸 만하다.
 *
 * ★ **삭제는 지우지 않고 내린다.** 지난 지원 이력이 실적 집계의 근거라서다. 내린 건은
 *   목록·집계·자동완성에서 모두 빠진다(2026-09-21 확인).
 */

export type AdmissionType = 'EARLY' | 'REGULAR'

export const ADMISSION_TYPE_LABEL: Record<AdmissionType, string> = {
  EARLY: '수시',
  REGULAR: '정시',
}

/** 전형별 지원 가능 개수. 서버와 같은 값이다 — 화면은 미리 알려주는 데만 쓴다 */
export const ADMISSION_QUOTA: Record<AdmissionType, number> = {
  EARLY: 6,
  REGULAR: 3,
}

/**
 * ★ `PENDING` 은 **발표 전**이다. 불합격(`FAILED`)과 다르다 — 합격률을 셀 때 분모에서 뺀다.
 * ★ 등록포기(`GAVE_UP`)도 **합격에 들어간다.** 붙은 것은 사실이고, 등록 여부만 다르다.
 */
export type AdmissionResult = 'PENDING' | 'PASSED' | 'FAILED' | 'GAVE_UP'

export const ADMISSION_RESULT_LABEL: Record<AdmissionResult, string> = {
  PENDING: '발표 전',
  PASSED: '합격',
  FAILED: '불합격',
  GAVE_UP: '등록포기',
}

/** 누가 적은 값인가. 직원이 고치면 서버가 STAFF 로 바꾼다 — 확인을 거친 값이라는 표시다 */
export type ResultSource = 'STUDENT' | 'STAFF'

export const RESULT_SOURCE_LABEL: Record<ResultSource, string> = {
  STUDENT: '학생 입력',
  STAFF: '직원 확인',
}

export interface AdmissionResultRow {
  id: number
  enrollmentId: number
  studentName: string
  studentNo: string
  admissionType: AdmissionType
  universityName: string
  departmentName: string
  trackName: string | null
  result: AdmissionResult
  source: ResultSource
  memo: string | null
}

export interface AdmissionResultInput {
  admissionType: AdmissionType
  universityName: string
  departmentName: string
  trackName?: string
  /** 비우면 발표 전(PENDING) */
  result?: AdmissionResult
  memo?: string
}

/** 학생 한 명의 지원 목록. 수시·정시가 함께 온다 */
export function listStudentResults(enrollmentId: number): Promise<AdmissionResultRow[]> {
  return request<AdmissionResultRow[]>(`/api/v1/admin/admission-results/students/${enrollmentId}`)
}

export function createResult(enrollmentId: number, body: AdmissionResultInput): Promise<AdmissionResultRow> {
  return request<AdmissionResultRow>(`/api/v1/admin/admission-results/students/${enrollmentId}`, {
    method: 'POST',
    body,
  })
}

/**
 * 수정. 비워 보낸 항목은 바꾸지 않는다.
 * ★ **고치면 입력 주체가 직원(STAFF)으로 바뀐다.** 학생이 적은 값과 확인을 거친 값을 가르기 위해서다.
 */
export function updateResult(resultId: number, body: Partial<AdmissionResultInput>): Promise<AdmissionResultRow> {
  return request<AdmissionResultRow>(`/api/v1/admin/admission-results/${resultId}`, { method: 'PATCH', body })
}

/** 삭제 — 지우지 않고 내린다 */
export function deleteResult(resultId: number): Promise<void> {
  return request<void>(`/api/v1/admin/admission-results/${resultId}`, { method: 'DELETE' })
}

/**
 * 자동완성 후보 — 이미 입력된 값에서 만든다.
 * ★ **비어 있어도 정상이다.** 첫 해에는 쌓인 값이 없고, 그때도 직접 입력으로 쓸 수 있어야 한다.
 */
export function getResultSuggestions(params: { university?: string; keyword?: string }): Promise<{
  universities: string[]
  departments: string[]
}> {
  return request('/api/v1/admin/admission-results/suggestions', { query: { ...params } })
}

/**
 * 기간별 집계.
 *
 * ★ 스펙(`/v3/api-docs`)의 응답 스키마 이름이 학습계획 집계와 **겹쳐서** 엉뚱한 필드
 *   (`plannedMinutes` 등)를 가리킨다. `schema.d.ts` 를 믿지 말고 이 타입을 쓴다 — 실제 응답을
 *   보고 적었다(2026-09-21).
 * ★ **합격률의 분모는 `decided`(발표 난 건수)다.** 전체로 나누면 발표 전 지원까지 실패로 잡혀
 *   실제보다 낮게 나온다.
 */
export interface AdmissionStatistics {
  total: number
  early: number
  regular: number
  /** 발표가 난 건수 — 합격률의 분모 */
  decided: number
  /** 등록포기 포함 */
  passed: number
  byResult: Partial<Record<AdmissionResult, number>>
  /** 대학명 → 합격 건수 */
  passedByUniversity: Record<string, number>
}

export function getAdmissionStatistics(params: {
  academyId?: number
  year: number
  /** yyyy-MM-dd */
  from: string
  to: string
}): Promise<AdmissionStatistics> {
  return request<AdmissionStatistics>('/api/v1/admin/admission-results/statistics', { query: { ...params } })
}
