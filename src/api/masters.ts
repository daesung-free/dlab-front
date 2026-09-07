import { request } from './client'

/* 기초 마스터 (F-4.10-1 기초 관리) — /api/v1/admin/masters/*
 *
 * ★ **마스터마다 다루는 것이 다르다.** 이름만 있는 것, 금액이 붙는 것, 반에 묶이는 것,
 *   조회 축이 아예 다른 것(장학은 학생별이다)이 섞여 있다. 하나로 묶어 추상화하면
 *   그 차이가 화면에서 사라져 잘못 쓰게 된다 — 타입을 따로 둔다.
 *
 * ★ **연도·지점이 필수인 것과 아닌 것이 갈린다.** 학과계열(tracks)은 전 지점·전 연도
 *   공통이고, 과정·교육과정·교습비는 (지점, 연도)마다 따로다.
 *
 * ★ 목업의 **코드·비고·사용여부**는 마스터마다 갈린다. 학과·과정·교육과정·교습비·
 *   학과계열·강의실·장학 종류에는 있고, 반·상벌점·사물함에는 없다.
 *   지우지 말고 `<Unfilled/>` 로 둔다.
 *
 * ⚠️ 전년도 복사는 **되돌릴 수 없다.** 여러 표를 한 트랜잭션에서 만들고,
 *   대상 연도에 데이터가 있으면 409 로 거부된다. */

export interface NamedMaster {
  id: number
  name: string
  sortOrder?: number
}

/** 학과계열 — 전 지점 공통이라 연도·지점을 받지 않는다. 전년도 복사 대상도 아니다 */
export function listTracks(): Promise<NamedMaster[]> {
  return request<NamedMaster[]>('/api/v1/admin/masters/tracks')
}

export function renameTrack(id: number, name: string): Promise<NamedMaster> {
  return request<NamedMaster>(`/api/v1/admin/masters/tracks/${id}`, { method: 'PUT', body: { name } })
}

export function deleteTrack(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/tracks/${id}`, { method: 'DELETE' })
}

/** 사용여부. **삭제보다 이쪽이 먼저다** — 지우면 그 계열이던 과거 학생 이력의 근거가 끊긴다 */
export function setTrackActive(id: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/masters/tracks/${id}/active`, { method: 'PATCH', body: { active } })
}

export function createTrack(name: string): Promise<NamedMaster> {
  return request<NamedMaster>('/api/v1/admin/masters/tracks', { method: 'POST', body: { name } })
}

export interface Department extends NamedMaster {
  academyId?: number | null
  year?: number | null
}

/** 학과 — 지점·연도가 **선택**이다. 다른 마스터와 달리 안 넘겨도 400이 아니다 */
export function listDepartments(academyId?: number, year?: number): Promise<Department[]> {
  return request<Department[]>('/api/v1/admin/masters/departments', { query: { academyId, year } })
}

export function createDepartment(body: { academyId: number; year: number; name: string }): Promise<Department> {
  return request<Department>('/api/v1/admin/masters/departments', { method: 'POST', body })
}

export function renameDepartment(id: number, name: string): Promise<Department> {
  return request<Department>(`/api/v1/admin/masters/departments/${id}`, { method: 'PUT', body: { name } })
}

export function deleteDepartment(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/departments/${id}`, { method: 'DELETE' })
}

/** 과정(전형) — 지점·연도가 **필수**다 */
export function listCourseTypes(academyId: number, year: number): Promise<NamedMaster[]> {
  return request<NamedMaster[]>('/api/v1/admin/masters/course-types', { query: { academyId, year } })
}

export function createCourseType(body: {
  academyId: number
  year: number
  name: string
  sortOrder?: number
}): Promise<NamedMaster> {
  return request<NamedMaster>('/api/v1/admin/masters/course-types', { method: 'POST', body })
}

export function renameCourseType(id: number, name: string): Promise<NamedMaster> {
  return request<NamedMaster>(`/api/v1/admin/masters/course-types/${id}`, { method: 'PUT', body: { name } })
}

export function deleteCourseType(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/course-types/${id}`, { method: 'DELETE' })
}

export interface Curriculum extends NamedMaster {
  /** 반에 묶인 교육과정이면 그 반. 전체 공통이면 null */
  classId?: number | null
  className?: string | null
}

export function listCurriculums(academyId: number, year: number): Promise<Curriculum[]> {
  return request<Curriculum[]>('/api/v1/admin/masters/curriculums', { query: { academyId, year } })
}

export function createCurriculum(body: {
  academyId: number
  year: number
  name: string
  classId?: number
  sortOrder?: number
}): Promise<Curriculum> {
  return request<Curriculum>('/api/v1/admin/masters/curriculums', { method: 'POST', body })
}

export function renameCurriculum(id: number, name: string): Promise<Curriculum> {
  return request<Curriculum>(`/api/v1/admin/masters/curriculums/${id}`, { method: 'PUT', body: { name } })
}

export function deleteCurriculum(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/curriculums/${id}`, { method: 'DELETE' })
}

export interface TuitionMaster extends NamedMaster {
  amount: number
}

export function listTuitionMasters(academyId: number, year: number): Promise<TuitionMaster[]> {
  return request<TuitionMaster[]>('/api/v1/admin/masters/tuitions', { query: { academyId, year } })
}

export function createTuitionMaster(body: {
  academyId: number
  year: number
  name: string
  amount: number
  sortOrder?: number
}): Promise<TuitionMaster> {
  return request<TuitionMaster>('/api/v1/admin/masters/tuitions', { method: 'POST', body })
}

/** 이름과 금액을 함께 고친다 — 이름만 바꾸는 경로가 아니다 */
export function updateTuitionMaster(id: number, body: { name?: string; amount?: number }): Promise<TuitionMaster> {
  return request<TuitionMaster>(`/api/v1/admin/masters/tuitions/${id}`, { method: 'PATCH', body })
}

export function deleteTuitionMaster(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/tuitions/${id}`, { method: 'DELETE' })
}

/**
 * 기초 데이터를 다음 연도로 복사한다.
 *
 * ⚠️ **되돌릴 수 없다.** 여러 표를 한 트랜잭션에서 만든다.
 *   대상 연도에 이미 데이터가 있으면 409 로 거부되므로 덮어쓰지는 않는다.
 */
export interface YearlyCopyResult {
  fromYear: number
  toYear: number
  /** 표 이름 → 복사된 건수. 무엇이 몇 건 넘어갔는지 화면에 그대로 보여준다 */
  copied: Record<string, number>
}

export function copyMastersToYear(body: {
  academyId: number
  fromYear: number
  toYear: number
}): Promise<YearlyCopyResult> {
  return request<YearlyCopyResult>('/api/v1/admin/masters/yearly-copy', { method: 'POST', body })
}

/* ── 강의실 ────────────────────────────────────────────────────
 *
 * ★ **연도가 없다.** 물리 공간이라 기수가 바뀌어도 그대로다 — 전년도 복사 대상이 아니다.
 * ★ **코드가 따로 없다.** roomNo("201")가 그 역할이라 둘을 같이 두지 않았다.
 *   방 번호는 이름과 달리 안 바뀌기 때문이다.
 * ⚠️ 자습 구역(study_area)과 **다른 것이다.** 키오스크가 자습 구역을 "독서실 구역"이라
 *   부르지만 그건 좌석이 속하는 단위이고 키오스크 계약에 걸려 있다. 강의실은 무관하다.
 */
export interface Room {
  id: number
  academyId: number
  roomNo: string
  name: string | null
  capacity: number | null
  memo: string | null
  active: boolean
}

export function listRooms(academyId: number, active?: boolean): Promise<Room[]> {
  return request<Room[]>('/api/v1/admin/masters/rooms', { query: { academyId, active } })
}

export function createRoom(body: {
  academyId: number
  roomNo: string
  name?: string
  capacity?: number
  memo?: string
}): Promise<Room> {
  return request<Room>('/api/v1/admin/masters/rooms', { method: 'POST', body })
}

/** ★ roomNo 가 필수다. 이름만 바꾸려 해도 지금 번호를 함께 실어야 한다 */
export function updateRoom(
  id: number,
  body: { roomNo: string; name?: string; capacity?: number; memo?: string },
): Promise<Room> {
  return request<Room>(`/api/v1/admin/masters/rooms/${id}`, { method: 'PUT', body })
}

export function setRoomActive(id: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/masters/rooms/${id}/active`, { method: 'PATCH', body: { active } })
}

export function deleteRoom(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/rooms/${id}`, { method: 'DELETE' })
}

/* ── 장학 종류 ──────────────────────────────────────────────────
 *
 * ★ 장학은 셋이 다른 것이다. 헷갈리면 엉뚱한 화면을 붙인다:
 *   · 여기(종류 마스터)        무슨 장학이 있고 할인율이 얼마인가
 *   · /masters/scholarships    누구에게 부여됐나 (enrollmentId 필수)
 *   · /scholarship/rules       언제 취소 대상인가 (판정 규칙)
 *   셋을 잇는 것이 code 다. 그래서 부여할 때 마스터에 없는 코드면 서버가 막는다 —
 *   예전에는 자유 문자열이라 KICE-50 하나만 쳐도 규칙의 KICE_50 과 안 맞아
 *   그 학생만 판정에서 조용히 빠졌다.
 */
export interface ScholarshipMaster {
  id: number
  academyId: number | null
  year: number
  code: string
  name: string
  /** 할인율(%) */
  discountRate: number
  active: boolean
  sortOrder: number | null
  memo: string | null
}

export function listScholarshipMasters(year: number, academyId?: number): Promise<ScholarshipMaster[]> {
  return request<ScholarshipMaster[]>('/api/v1/admin/masters/scholarship-masters', {
    query: { year, academyId },
  })
}

/** 부여 드롭다운용 — 사용 중인 것만 온다 */
export function listSelectableScholarships(year: number, academyId?: number): Promise<ScholarshipMaster[]> {
  return request<ScholarshipMaster[]>('/api/v1/admin/masters/scholarship-masters/selectable', {
    query: { year, academyId },
  })
}

export function createScholarshipMaster(body: {
  academyId?: number
  year: number
  code: string
  name: string
  discountRate: number
  sortOrder?: number
  memo?: string
}): Promise<ScholarshipMaster> {
  return request<ScholarshipMaster>('/api/v1/admin/masters/scholarship-masters', { method: 'POST', body })
}

/** ★ name·discountRate 가 필수다. 이름만 바꾸려 해도 지금 할인율을 함께 실어야 한다 */
export function updateScholarshipMaster(
  id: number,
  body: { name: string; discountRate: number; sortOrder?: number; memo?: string },
): Promise<ScholarshipMaster> {
  return request<ScholarshipMaster>(`/api/v1/admin/masters/scholarship-masters/${id}`, {
    method: 'PUT',
    body,
  })
}

export function setScholarshipMasterActive(id: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/masters/scholarship-masters/${id}/active`, {
    method: 'PATCH',
    body: { active },
  })
}

export function deleteScholarshipMaster(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/scholarship-masters/${id}`, { method: 'DELETE' })
}
