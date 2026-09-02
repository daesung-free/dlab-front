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

/**
 * 반에 학생 배정.
 *
 * ⚠️ **한 명씩만 받는다.** 화면은 '선택 N명 일괄 배정'이라 N번 호출해야 한다.
 *   중간에 실패하면 일부만 배정된 상태로 남으므로, 호출부는 결과를 건별로 모아
 *   무엇이 실패했는지 보여줘야 한다. 일괄 API 요청은 docs/API_GAPS.md 에 적어뒀다.
 */
export function assignStudentToClass(classId: number, enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/classes/${classId}/students`, {
    method: 'POST',
    body: { enrollmentId },
  })
}
