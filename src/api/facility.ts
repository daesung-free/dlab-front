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
  /** 키오스크가 이 코드로 좌석을 찾는다. **등록 후 못 바꾼다** */
  areaCd: string
  areaNm: string
  sortOrder: number | null
  active: boolean
  /** `STUDY`(독서실) / `CLASSROOM`(반 교실). ★ 반 좌석표는 아직 설계 전이라 화면은 STUDY 만 만든다 */
  areaType: 'STUDY' | 'CLASSROOM'
  /** `CLASSROOM` 일 때만 채워진다 */
  classMasterId: number | null
  className: string | null
  /** 이 구역에 만들어진 좌석 수. **0 이면 배치도가 빈 채로 남는다** */
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
/**
 * ★ 자리를 옮길 때도 이걸 쓴다. **먼저 해제할 필요가 없다** — 이미 자리가 있는 학생을
 *   빈 자리로 보내면 서버가 원래 자리를 비운다(2026-09-16 확인).
 * ★ 같은 좌석을 두 번 넣거나 이미 찬 자리를 고르면 **전체가 취소된다.** 실패 문구가
 *   자리 번호까지 들어 있어 그대로 보여주면 된다 — "A01: 이미 2026-0002 학생이 배정돼 있습니다".
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

/* ─────────── 구역 · 좌석 등록 (기초 관리 탭) ─────────── */

/**
 * 자습 구역 생성.
 *
 * ★ **구역만 만들면 좌석이 0개다.** 배치도가 빈 채로 남아서 "등록했는데 아무것도 없다"가
 *   된다. 등록 폼에서 행·열을 함께 받아 `createSeatGrid` 까지 이어 부른다 —
 *   `grid` 가 그래서 있다.
 *
 * ★ `areaCd` 는 **등록 후 못 바꾼다.** 키오스크가 이 코드로 좌석을 조회한다.
 *
 * ★ `areaType` 은 `STUDY`(독서실, 기본) / `CLASSROOM`(반 교실)이다. 반 교실이면
 *   `classMasterId` 가 필수인데, **반 좌석표는 아직 설계 전이라 화면은 STUDY 만 만든다.**
 */
export function createSeatArea(body: {
  academyId: number
  /** 등록 후 변경 불가 */
  areaCd: string
  areaNm: string
  sortOrder?: number
}): Promise<SeatArea> {
  return request<SeatArea>('/api/v1/admin/seats/areas', { method: 'POST', body: { ...body, areaType: 'STUDY' } })
}

/**
 * 좌석 격자 일괄 생성.
 *
 * ★ 좌석에는 **x·y 좌표**가 들어간다. 배치도를 그리는 근거이고 없으면 화면이 빈다 —
 *   `startX`·`startY` 기본값이 1 이라 보통은 안 보내도 된다.
 *
 * ★ 번호는 `seatCdPrefix` + 일련번호다(`"A-"` → `A-01`). `numberPadding` 기본 2.
 * ★ `skips` 로 통로처럼 좌석이 없는 칸을 빼면 **번호가 그 칸을 건너뛰고 이어진다.**
 */
export function createSeatGrid(body: {
  studyAreaId: number
  rows: number
  columns: number
  seatCdPrefix: string
  startNumber?: number
  numberPadding?: number
  columnMajor?: boolean
}): Promise<unknown> {
  return request<unknown>('/api/v1/admin/seats/masters/grid', { method: 'POST', body })
}

/**
 * 구역 삭제.
 *
 * ★ **좌석이 남아 있으면 409** — `STUDY_AREA_HAS_SEATS`, "좌석 6개가 남아 있습니다.
 *   좌석을 먼저 삭제하세요"(2026-09-16 확인). 격자로 만든 구역은 항상 좌석이 있으므로
 *   **그냥 부르면 반드시 실패한다.** 화면은 좌석부터 지우고 구역을 지운다.
 *
 * ★ 고장·공사로 **잠시** 못 쓰는 자리는 지우지 말고 `PATCH /seats/{id}/usable` 로 막는다.
 *   지우면 배치도에 구멍이 생기고 번호가 어긋난다.
 */
export function deleteSeatArea(studyAreaId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/areas/${studyAreaId}`, { method: 'DELETE' })
}

export function renameSeatArea(studyAreaId: number, areaNm: string): Promise<SeatArea> {
  return request<SeatArea>(`/api/v1/admin/seats/areas/${studyAreaId}`, { method: 'PATCH', body: { areaNm } })
}

/**
 * 구역의 좌석 목록.
 *
 * ★ 좌표 필드 이름이 **`xPos`·`yPos`** 다. `x`·`y` 가 아니다 — 이름을 잘못 보면
 *   전부 `null` 로 읽혀서 "좌표가 안 들어갔다"고 오해하게 된다.
 */
export interface SeatMaster {
  id: number
  studyAreaId: number
  seatCd: string
  seatNm: string
  xPos: number | null
  yPos: number | null
  usable: boolean
}

/** ★ `studyAreaId` 가 **필수**다. 안 보내면 400 */
export function listSeatMasters(studyAreaId: number): Promise<SeatMaster[]> {
  return request<SeatMaster[]>('/api/v1/admin/seats/masters', { query: { studyAreaId } })
}

export function deleteSeatMaster(seatId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/masters/${seatId}`, { method: 'DELETE' })
}
