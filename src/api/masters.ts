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
 * ★ 목업의 **코드·비고·사용여부는 어느 마스터에도 없다**(API_GAPS 18-2).
 *   지우지 말고 `<Unfilled/>` 로 둔다.
 *
 * ⚠️ 전년도 복사는 **되돌릴 수 없다.** 여러 표를 한 트랜잭션에서 만들고,
 *   대상 연도에 데이터가 있으면 409 로 거부된다. */

export interface NamedMaster {
  id: number
  name: string
  sortOrder?: number
}

/** 학과계열 — 전 지점 공통이라 연도·지점을 받지 않는다. **수정·삭제 API가 없다** */
export function listTracks(): Promise<NamedMaster[]> {
  return request<NamedMaster[]>('/api/v1/admin/masters/tracks')
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
