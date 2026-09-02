import { requestPaged } from './client'
import type { Paged } from './types'

/* 학생 검색 (F-4.1-1) — GET /api/v1/admin/students
 *
 * ★ 지점(academyId)은 파라미터로 보낼 수 없다. 서버가 토큰의 지점 스코프로 강제한다
 *   (SearchScope). SUPER_ADMIN만 전 지점이 보이고, 이때 지점 구분은 응답의 academyName으로 한다.
 *   (출결·상벌점 등 다른 엔드포인트는 academyId를 받는다 — 이 엔드포인트만 안 받는다)
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
  /** 서버가 개인정보를 가려서 보냈는지. true면 phone·birthDate가 이미 마스킹된 값이다 */
  masked: boolean
}

/** 서버가 받아주는 정렬 키. 이 밖의 값은 무시된다(400이 아니다) — 위 주석 참고. */
export const SORTABLE = ['studentNo', 'name', 'grade', 'track', 'enrollmentStatus', 'admissionDate'] as const
export type SortKey = (typeof SORTABLE)[number]

export interface StudentSearchParams {
  year?: number
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
