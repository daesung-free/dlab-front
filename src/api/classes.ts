import { request } from './client'
import type { GradeType, TrackType } from './students'

/* 반(고정반·이동반) — /api/v1/admin/classes
 *
 * ★ 여러 화면의 '반' 드롭다운이 이걸로 채워진다. 하드코딩하지 말 것 —
 *   반 이름은 지점·연도마다 다르고 화면에서 바꿀 수 있다. */

export type ClassType = 'FIXED' | 'MOVING'

export interface ClassGroup {
  id: number
  academyId: number
  year: number
  name: string
  classType: ClassType
  homeroomTeacherId: number | null
  homeroomTeacherName: string | null
  capacity: number | null
  /** 현재 인원. 반마다 명단을 부르지 않아도 되게 목록에 실려 온다 */
  memberCount: number
}

/** 반 명단의 학생 한 명. 학생 검색(Student)보다 필드가 적다 */
export interface ClassMember {
  enrollmentId: number
  studentNo: string | null
  studentName: string
  grade: GradeType
  track: TrackType | null
  schoolName: string | null
  seatCd: string | null
  academyId: number
  academyName: string | null
}

export function listClasses(year?: number): Promise<ClassGroup[]> {
  return request<ClassGroup[]>('/api/v1/admin/classes', { query: { year } })
}

export function listClassMembers(classId: number): Promise<ClassMember[]> {
  return request<ClassMember[]>(`/api/v1/admin/classes/${classId}/students`)
}

/** 반 배정 한 건. 여러 명은 assignStudentsToClass 를 쓴다 */
export function assignStudentToClass(classId: number, enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/classes/${classId}/students`, {
    method: 'POST',
    body: { enrollmentId },
  })
}

/** 일괄 배정 한 건의 결과 */
export interface BulkAssignItem {
  enrollmentId: number
  studentName?: string | null
  status: string
  message?: string | null
}

/**
 * 일괄 배정 결과.
 *
 * ★ **정원을 넘겨도 배정은 된다.** 정원 초과가 필요한 운영이 실제로 있어서 서버가 막지 않고
 *   `overCapacity` 로 알려준다 — 경고는 화면이 띄운다.
 *
 * ★ 좌석 일괄 배정(assignSeatsBulk)과 **응답 형태가 다르다.** 반은 건별 결과를 주고,
 *   좌석은 전부-아니면-전무다(절반만 반영되면 배치가 뒤죽박죽 되기 때문).
 */
export interface BulkAssignResult {
  classId: number
  capacity: number | null
  memberCount: number
  overCapacity: boolean
  assignedCount: number
  failedCount: number
  results: BulkAssignItem[]
}

export function assignStudentsToClass(classId: number, enrollmentIds: number[]): Promise<BulkAssignResult> {
  return request<BulkAssignResult>(`/api/v1/admin/classes/${classId}/students/bulk`, {
    method: 'POST',
    body: { enrollmentIds },
  })
}

/**
 * 반 배정 해제.
 *
 * ★ **반 ID가 필요하다.** 한 학생에게 고정반·이동수업반이 동시에 있을 수 있어
 *   "이 학생의 반을 뗀다"로는 어느 반인지 정해지지 않는다.
 */
export function releaseStudentFromClass(classId: number, enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/classes/${classId}/students/${enrollmentId}`, { method: 'DELETE' })
}
