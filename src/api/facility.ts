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

/**
 * 좌석 상태는 **두 축이 겹친다.** 하나로 합치면 안 된다.
 *   · 배정 축(assignmentState) : 배정됨 / 미배정 / 사용중지
 *   · 재실 축(presence)        : 재실 / 이석 / 미등원 / 빈자리
 * 화면은 둘을 조합해 색을 정한다(ReadingRoom 의 seatState).
 */
export type AssignmentState = 'ASSIGNED' | 'UNASSIGNED' | 'DISABLED'
export type Presence = 'PRESENT' | 'OUT' | 'ABSENT' | 'EMPTY'

export interface SeatCell {
  seatId: number
  seatCd: string
  seatNm: string | null
  /** 배치도 좌표(1-based). 사물함과 달리 좌석은 도면 위치를 서버가 갖고 있다 */
  xPos: number | null
  yPos: number | null
  assignmentState: AssignmentState | null
  /** 지금 앉아 있는지 — 배정과 별개다(배정된 자리라도 자리를 비울 수 있다) */
  presence: Presence | null
  enrollmentId: number | null
  studentNo: string | null
  studentName: string | null
  classId: number | null
  /** 고정반 이름. 미배정이면 null */
  className: string | null
  /**
   * 서버가 이름을 가려서 보냈는지. 다른 목록과 같은 규칙이다 —
   * `unmask` 를 주면 원본이 오고 `masked=false` 가 된다.
   */
  masked: boolean
}

export function listSeatAreas(academyId: number): Promise<SeatArea[]> {
  return request<SeatArea[]>('/api/v1/admin/seats/areas', { query: { academyId } })
}

export function getSeatLayout(studyAreaId: number, unmask = false): Promise<SeatCell[]> {
  return request<SeatCell[]>('/api/v1/admin/seats/layout', { query: { studyAreaId, unmask: unmask || undefined } })
}

export function assignSeat(seatId: number, enrollmentId: number): Promise<void> {
  return request<void>('/api/v1/admin/seats', { method: 'POST', body: { seatId, enrollmentId } })
}

/**
 * 좌석 일괄 배정.
 *
 * ★ **전부-아니면-전무다.** 반 일괄 배정(건별 결과)과 응답 형태가 다른데, 좌석은
 *   절반만 반영되면 배치가 뒤죽박죽 되기 때문이다. 실패하면 아무것도 안 들어간 상태다.
 */
export function assignSeatsBulk(items: { seatId: number; enrollmentId: number }[]): Promise<SeatCell[]> {
  return request<SeatCell[]>('/api/v1/admin/seats/bulk', { method: 'POST', body: { items } })
}

/** 좌석 해제는 좌석이 아니라 **학생** 기준이다 — 한 학생이 좌석 하나를 갖는 구조라서다 */
export function releaseSeatOfStudent(enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/students/${enrollmentId}`, { method: 'DELETE' })
}

/** 좌석 사용중지/해제. 설비 문제로 못 쓰는 자리를 도면에서 빼는 용도 */
export function setSeatUsable(seatId: number, usable: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/seats/${seatId}/usable`, { method: 'PATCH', query: { usable } })
}
