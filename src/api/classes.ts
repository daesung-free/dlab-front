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
  /**
   * 정원.
   *
   * ★ **`null` 이면 정원을 두지 않는 반**이다 — 0 이 아니다. 화면이 `?? 0` 으로 받으면
   *   "정원 0명" 이 되어 늘 초과로 보인다. 충원율도 못 낸다.
   */
  capacity: number | null
  /** 반 강의실(강의실 마스터). 지정 안 했으면 null (2026-09-21 추가) */
  roomId?: number | null
  roomName?: string | null
  /**
   * 현재 인원. 반마다 명단을 부르지 않아도 되게 목록에 실려 온다.
   *
   * ★ **목록에서만 채워진다.** 생성·수정·담임지정 같은 단건 응답은 `null` 이다 —
   *   세지 않기 때문이다. 만든 직후 이 값을 쓰려 하면 빈다.
   */
  memberCount: number | null
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

/** `academyId` 는 좁히는 용도다. 안 보내면 계정 스코프 그대로다 */
/**
 * 반 목록.
 *
 * ★ `year` 는 선택이지만 **사실상 필수다.** 안 넘기면 전 연도가 섞여 와서 같은 이름의 반이
 *   여러 번 나오고(반 이름은 해마다 재사용된다 — 'N수 1반' 이 2026·2027 양쪽에 있다),
 *   드롭다운에서 다음 해 반을 고르면 **학생 배정이 전원 실패한다** —
 *   서버가 "학생의 등록 연도와 반의 연도가 다릅니다" 로 건별로 거절한다(2026-09-16 실측).
 */
export function listClasses(year?: number, academyId?: number): Promise<ClassGroup[]> {
  return request<ClassGroup[]>('/api/v1/admin/classes', { query: { year, academyId } })
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

/**
 * 반 생성.
 *
 * ★ `classType` 이 둘이다 — `FIXED`(고정반)는 학생이 소속되는 반, `MOVING`(이동반)은
 *   과목별로 옮겨 다니는 반이다. 배정 화면이 다루는 것은 고정반이다.
 *
 * ★ `capacity` 는 **안 보내면 정원 없는 반**이 된다(0 이 아니다).
 * ★ 응답의 `memberCount` 는 `null` 이다 — 방금 만든 반이라 셀 것이 없다.
 */
export function createClass(body: {
  academyId: number
  year: number
  name: string
  classType: ClassType
  homeroomTeacherId?: number
  capacity?: number
}): Promise<ClassGroup> {
  return request<ClassGroup>('/api/v1/admin/classes', { method: 'POST', body })
}

/** 반 강의실 지정·해제. roomId 를 비우면(null) 해제한다 */
export function setClassRoom(classId: number, roomId: number | null): Promise<ClassGroup> {
  return request<ClassGroup>(`/api/v1/admin/classes/${classId}/room`, { method: 'PUT', body: { roomId } })
}

