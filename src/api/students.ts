import { downloadFile, request, requestPaged } from './client'
import type { Paged } from './types'

/* 학생 검색 (F-4.1-1) — GET /api/v1/admin/students
 *
 * ★ 지점(academyId)은 **좁히는 것만 된다.** 안 보내면 계정 스코프 그대로고(본사는 전 지점,
 *   지점 관리자는 자기 지점), 보내면 그 안에서 더 좁힌다. 지점 관리자가 남의 지점을 보내면
 *   403 OTHER_BRANCH_ACCESS_DENIED — 넓히지는 못한다.
 *   다른 목록과 달리 **본사 계정이 안 보내도 400이 아니다.**
 *
 * ★ 정렬은 아래 SORTABLE 6개만 먹는다. 그 밖의 값은 400이 아니라 **조용히 무시**되고
 *   기본 정렬(학번)로 떨어지므로, 화면은 이 목록에 있는 컬럼에만 정렬 UI를 붙일 것.
 *
 * 전체 타입은 npm run api:types 로 만든 src/api/schema.d.ts 에도 있다. 여기 정의는
 * 그쪽이 전 필드를 optional로 뽑아내는 것과 달리 화면이 기대하는 null 여부를 명시한다. */

export type GradeType = 'HIGH2' | 'HIGH3' | 'N_SU' | 'STAFF'
export type TrackType = 'HUMANITIES' | 'SCIENCE' | 'ART' | 'COMMON'
export type EnrollmentStatus = 'ENROLLED' | 'LEAVE' | 'WITHDRAWN' | 'EXPELLED' | 'GRADUATED'

export const GRADE_LABEL: Record<GradeType, string> = {
  HIGH2: '고2',
  HIGH3: '고3',
  N_SU: 'N수',
  STAFF: '직원',
}

export const TRACK_LABEL: Record<TrackType, string> = {
  HUMANITIES: '인문',
  SCIENCE: '자연',
  ART: '예체능',
  COMMON: '공통',
}

export const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ENROLLED: '재원',
  LEAVE: '휴원',
  WITHDRAWN: '퇴원',
  EXPELLED: '제적',
  GRADUATED: '수료',
}

/**
 * 학생 응답.
 *
 * ★ studentId(사람)와 enrollmentId(등록 건)가 둘 다 온다. 상담·신상기록부는 사람 단위,
 *   출결·청구는 등록 건 단위라 화면에서 둘을 구분해서 써야 한다.
 */
export interface Student {
  enrollmentId: number
  studentId: number
  uniqueCode: string
  studentNo: string | null
  name: string
  phone: string | null
  address: string | null
  /** 문자열이다 — 마스킹되면 `2007-**-**`이 와서 날짜 타입에 안 담긴다 */
  birthDate: string | null
  schoolName: string | null
  year: number
  grade: GradeType
  track: TrackType | null
  enrollmentStatus: EnrollmentStatus
  admissionDate: string | null
  /** 지점'명'. 본사 계정이 전 지점을 한 화면에서 보므로 코드가 아니라 이름이 온다 */
  academyName: string | null
  /** 고정반. 미배정이면 null */
  className: string | null
  homeroomTeacher: string | null
  seatCd: string | null
  scholarshipTypes: string[]
  /**
   * N수 횟수. 1=재수, 2=삼수, 3=사수. **N수가 아니면 null**이다.
   *
   * ★ `grade` 의 `N_SU` 와 별개 축이다 — 학년 enum 에 재수·삼수를 더하지 않고
   *   횟수를 따로 뒀다. enum 에 넣었으면 시험 양식이 학년 수만큼 곱해져 늘고
   *   매년 값을 더해야 했다.
   */
  retakeCount: number | null
  /** 서버가 개인정보를 가려서 보냈는지. true면 phone·birthDate가 이미 마스킹된 값이다 */
  masked: boolean
}

/** 서버가 받아주는 정렬 키. 이 밖의 값은 무시된다(400이 아니다) — 위 주석 참고. */
/** 재수 표기. 서버는 횟수만 주고 화면은 사람이 쓰는 말로 바꾼다 */
export function retakeLabel(retakeCount: number | null): string {
  if (retakeCount == null) return '-'
  return ['재수', '삼수', '사수'][retakeCount - 1] ?? `${retakeCount + 1}수`
}

export const SORTABLE = ['studentNo', 'name', 'grade', 'track', 'enrollmentStatus', 'admissionDate'] as const
export type SortKey = (typeof SORTABLE)[number]

export interface StudentSearchParams {
  year?: number
  /** 지점을 좁힌다. 안 보내면 계정 스코프 그대로 — 위 주석 참고 */
  academyId?: number
  /** 1=재수, 2=삼수, 3=사수 */
  retakeCount?: number
  keyword?: string
  grade?: GradeType
  track?: TrackType
  status?: EnrollmentStatus
  classId?: number
  teacherId?: number
  schoolName?: string
  /** 등원일 범위 (yyyy-MM-dd) */
  admittedFrom?: string
  admittedTo?: string
  /**
   * 미배정 조건. **축마다 따로다** — 미배정이 반·좌석·사물함 셋이라
   * 하나로 묶으면 어느 축인지 못 가린다.
   *
   * ⚠️ `classId` 와 `unassignedClass` 처럼 모순되는 조합은 **400**
   * (`CONFLICTING_SEARCH_CONDITION`)이다. 빈 목록으로 주면 조건을 잘못 짠 걸
   * 모르고 넘어가므로 의도된 동작이다 — 화면에서 동시에 걸리지 않게 할 것.
   */
  unassignedClass?: boolean
  unassignedSeat?: boolean
  unassignedLocker?: boolean
  hasScholarship?: boolean
  scholarshipType?: string
  /** 0-based (Spring Data 규약 그대로) */
  page?: number
  size?: number
  /** 예: 'name,desc'. 여러 개면 배열로 준다 */
  sort?: string | string[]
}

export function searchStudents(params: StudentSearchParams): Promise<Paged<Student>> {
  const { sort, ...rest } = params
  return requestPaged<Student>('/api/v1/admin/students', { query: { ...rest }, repeatable: { sort } })
}

/* ── 신규 접수 등록 (F-4.1-3) ─────────────────────────────── */

/**
 * 접수 시 받는 값. **학번은 서버가 채번한다** — 요청에 넣지 않는다.
 *
 * 상세까지 한 번에 받는다(2026-09-03 백엔드 반영). 예전에는 POST 후 PATCH 로
 * 두 번 나가야 했고, 첫 단계만 성공하면 중복 등록을 유발했다.
 */
export interface AdmitRequest {
  academyId: number
  year: number
  name: string
  grade: GradeType
  track?: TrackType
  phone?: string
  birthDate?: string
  /** 'M' | 'F' */
  gender?: string
  schoolName?: string
  address?: string
  /** 지정하지 않으면 서버가 등록일로 잡는다 */
  admissionDate?: string
}

/** 접수 후 상세를 채운다. 넘긴 필드만 바뀐다 */
export interface StudentUpdateRequest {
  name?: string
  phone?: string
  birthDate?: string
  /** 'M' | 'F' */
  gender?: string
  schoolName?: string
  address?: string
  grade?: GradeType
  track?: TrackType
  status?: EnrollmentStatus
}

export function admitStudent(body: AdmitRequest): Promise<Student> {
  return request<Student>('/api/v1/admin/students', { method: 'POST', body })
}

export function updateStudent(enrollmentId: number, body: StudentUpdateRequest): Promise<Student> {
  return request<Student>(`/api/v1/admin/students/${enrollmentId}`, { method: 'PATCH', body })
}

/** 저장하면 부여될 다음 학번. 미리보기용이고 예약은 아니다 */
export function getNextStudentNo(academyId: number, year: number): Promise<string> {
  return request<string>('/api/v1/admin/students/next-student-no', { query: { academyId, year } })
}

/**
 * 검색조건에 맞는 **전량**을 서버 엑셀로 받는다.
 *
 * ★ 화면의 엑셀 버튼과 결과가 다르다. 목록이 서버 페이징이라 화면에서 만들면
 *   **지금 보고 있는 쪽(20건)만** 담긴다 — 전체 명부를 내보내려면 이쪽을 써야 한다.
 * ★ 마스킹 해제 권한도 서버가 판단한다. 파일은 회수가 안 되기 때문이다.
 */
export function exportStudents(params: StudentSearchParams, filename = '학생_명부.xlsx'): Promise<void> {
  const { sort, page, size, ...rest } = params
  void sort
  void page
  void size
  return downloadFile('/api/v1/admin/students/export', filename, { query: { ...rest } })
}

/* ── 재원 상태 변경 (F-C-2 / 학생 상세) ──────────────────────────
 *
 * ★ **삭제 대신 쓰는 경로다.** 출결·상벌점 이력이 붙은 학생은 서버가 지우지 못하게 막는다
 *   (409 STUDENT_HAS_HISTORY). 잘못 만든 학생을 되돌릴 수단이 이것뿐이라,
 *   화면이 이걸 안 부르면 명단에 영구히 남는다.
 */

/** 상태 변경 이력 한 줄 */
export interface StatusLog {
  id: number
  fromStatus: EnrollmentStatus | null
  toStatus: EnrollmentStatus
  reason: string | null
  changedBy: string | null
  /** ISO instant */
  changedAt: string
}

/**
 * 재원 상태 변경.
 *
 * @param reason 사유. 서버는 선택값이지만 **이력에 남는 유일한 설명**이라 화면은 받아둔다
 */
export function changeStudentStatus(
  enrollmentId: number,
  status: EnrollmentStatus,
  reason?: string,
): Promise<unknown> {
  return request(`/api/v1/admin/students/${enrollmentId}/status`, {
    method: 'POST',
    body: { status, reason },
  })
}

export function listStatusLogs(enrollmentId: number): Promise<StatusLog[]> {
  return request<StatusLog[]>(`/api/v1/admin/students/${enrollmentId}/status-logs`)
}
