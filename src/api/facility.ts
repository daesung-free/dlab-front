import { request } from './client'

/* 배정 대상 시설 — 사물함(masters/lockers) · 독서실 좌석(seats)
 *
 * ★ 두 도메인이 API가 아예 다르다. 사물함은 번호만 있는 단순 목록이고,
 *   좌석은 구역(area) 아래 좌표(xPos/yPos)를 가진 배치도다. 화면은 같아 보여도
 *   여기서 형태를 맞춰줘야 한다. */

/* ── 사물함 ─────────────────────────────────────────────── */

export interface Locker {
  id: number
  /** 예: "A-01". 블록 구분이 따로 없어 화면이 접두어로 나눈다 */
  lockerNo: string
  enrollmentId: number | null
  studentName: string | null
}

export function listLockers(academyId: number): Promise<Locker[]> {
  return request<Locker[]>('/api/v1/admin/masters/lockers', { query: { academyId } })
}

export function assignLocker(lockerId: number, enrollmentId: number): Promise<Locker> {
  return request<Locker>(`/api/v1/admin/masters/lockers/${lockerId}/assignment`, {
    method: 'PUT',
    body: { enrollmentId },
  })
}

export function releaseLocker(lockerId: number): Promise<void> {
  return request<void>(`/api/v1/admin/masters/lockers/${lockerId}/assignment`, { method: 'DELETE' })
}

/* ── 독서실 좌석 ─────────────────────────────────────────── */

export interface SeatArea {
  id: number
  areaCd: string
  areaNm: string
  seatCount: number
}

export interface SeatCell {
  seatId: number
  seatCd: string
  seatNm: string | null
  /** 배치도 좌표. 사물함과 달리 좌석은 도면 위치를 서버가 갖고 있다 */
  xPos: number | null
  yPos: number | null
  assignmentState: string | null
  /** 지금 앉아 있는지 — 배정과 별개다(배정된 자리라도 자리를 비울 수 있다) */
  presence: string | null
  enrollmentId: number | null
  studentNo: string | null
  studentName: string | null
}

export function listSeatAreas(academyId: number): Promise<SeatArea[]> {
  return request<SeatArea[]>('/api/v1/admin/seats/areas', { query: { academyId } })
}

export function getSeatLayout(studyAreaId: number): Promise<SeatCell[]> {
  return request<SeatCell[]>('/api/v1/admin/seats/layout', { query: { studyAreaId } })
}

export function assignSeat(seatId: number, enrollmentId: number): Promise<void> {
  return request<void>('/api/v1/admin/seats', { method: 'POST', body: { seatId, enrollmentId } })
}

/** 좌석 해제는 좌석이 아니라 **학생** 기준이다 — 한 학생이 좌석 하나를 갖는 구조라서다 */
export function releaseSeatOfStudent(enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/students/${enrollmentId}`, { method: 'DELETE' })
}
