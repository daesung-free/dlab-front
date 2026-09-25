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

/**
 * 관(본관/별관).
 *
 * ★ **왜 구역 위에 층이 하나 더 있나** — 동탄2관은 본관과 구역명·좌석번호가 똑같다.
 *   DSA 는 seat_cd 하나로만 좌석을 찾아서 별관을 1000번대로 돌려 썼는데
 *   (1번 → 1001번), 클라이언트 요구는 **같은 번호를 쓰되 구분되는 것**이다.
 *   그래서 우리 DB 는 (관, 구역, 번호)로 구분하고 키오스크에 내릴 때만 변환한다.
 */
export interface Building {
  id: number
  code: string
  name: string
  sortOrder: number
  /** 키오스크에 내릴 좌석번호에 더하는 값. 0이면 본관 */
  seatCdOffset: number
  main: boolean
  active: boolean
}

export interface SeatArea {
  id: number
  buildingId: number
  /** ★ 화면에 꼭 띄울 것. 안 띄우면 본관 A 와 별관 A 가 똑같이 보인다 */
  buildingName: string
  /** 화면용 코드. **관 안에서만** 유일하다 — 본관 A 와 별관 A 가 둘 다 'A' 다 */
  areaCd: string
  /** 키오스크가 쓰는 코드. 지점 안에서 유일하다. 대조용이지 화면에 뿌릴 값이 아니다 */
  kioskAreaCd: string
  areaNm: string
  sortOrder: number | null
  active: boolean
  /**
   * `STUDY`(독서실) / `CLASSROOM`(반 교실). ★ 반 좌석표는 아직 설계 전이라 화면은 STUDY 만 만든다.
   * ★ **옵셔널인 것은 의도다** — 지금 서버 응답에는 이 셋이 안 들어 있다(2026-09-16 확인).
   *   필수로 두면 없는 값을 있다고 믿고 읽게 된다.
   */
  areaType?: 'STUDY' | 'CLASSROOM'
  /** `CLASSROOM` 일 때만 채워진다 */
  classMasterId?: number | null
  className?: string | null
  /** 이 구역에 만들어진 좌석 수. **0 이면 배치도가 빈 채로 남는다** */
  seatCount: number
}

/** 좌석 마스터(배치도 편집용). 배정 정보가 없는 순수 좌석이다 */
export interface SeatMaster {
  id: number
  studyAreaId: number
  /** 화면용 번호. **구역 안에서만** 유일하다 — 별관에 같은 번호가 있을 수 있다 */
  seatCd: string
  /** 키오스크가 쓰는 번호. 별관은 관 offset 이 더해진 값(1번 → 1001번) */
  kioskSeatCd: string
  seatNm: string | null
  xPos: number
  yPos: number
  usable: boolean
}

/**
 * 좌석 상태는 **축이 셋 겹친다.** 하나로 합치면 안 된다.
 *   · 배정 축(assignmentState) : 배정됨 / 미배정 / 사용중지
 *   · 재실 축(presence)        : 재실 / 외출 / 미등원 / 빈자리
 *   · 이탈 축(onSeatLeave)     : 지금 자리를 비웠는지 (키오스크 좌석 이탈 태깅)
 * 화면은 셋을 조합해 색을 정한다(ReadingRoom 의 seatState).
 *
 * ★ 이탈 중이어도 출결로는 여전히 재실(PRESENT)이다 — 등원해 있기 때문이다.
 *   그래서 `presence` 만 보면 자리를 비운 학생이 '재실' 로 보인다(2026-09-25 서버 반영).
 */
export type AssignmentState = 'ASSIGNED' | 'UNASSIGNED' | 'DISABLED'
export type Presence = 'PRESENT' | 'OUT' | 'ABSENT' | 'EMPTY'

export interface SeatCell {
  seatId: number
  seatCd: string
  /**
   * 키오스크가 이 번호로 좌석을 찾는다. 별관은 관 offset 이 더해진 값이다(1번 → 1001번).
   *
   * 화면에 쓰는 것은 `seatCd` 이고 이 값은 **대조용**이다 — "단말에서 이 자리가 안 보인다"는
   * 문의가 오면 여기부터 확인한다. 안 보여주면 그 대조를 하려고 다른 화면을 열어야 한다.
   */
  kioskSeatCd: string
  seatNm: string | null
  /** 배치도 좌표(1-based). 사물함과 달리 좌석은 도면 위치를 서버가 갖고 있다 */
  xPos: number | null
  yPos: number | null
  assignmentState: AssignmentState | null
  /** 지금 앉아 있는지 — 배정과 별개다(배정된 자리라도 자리를 비울 수 있다) */
  presence: Presence | null
  /**
   * 지금 좌석 이탈 중인지. **`presence` 와 별개 축이다** — 이탈해도 출결은 재실이라
   * 이 값으로 덮어 표시해야 한다. 좌석 이탈/복귀 화면(F-4.11-8)과 같은 기록을 본다.
   */
  onSeatLeave: boolean
  /** 이탈 시작 시각(ISO). 이탈 중이 아니면 null */
  seatLeftAt: string | null
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

export function listSeatAreas(academyId: number, opts?: { includeInactive?: boolean; buildingId?: number }): Promise<SeatArea[]> {
  return request<SeatArea[]>('/api/v1/admin/seats/areas', {
    query: { academyId, includeInactive: opts?.includeInactive || undefined, buildingId: opts?.buildingId },
  })
}

/* ── 관 ─────────────────────────────────────────────────── */

export function listBuildings(academyId: number): Promise<Building[]> {
  return request<Building[]>('/api/v1/admin/seats/buildings', { query: { academyId } })
}

/**
 * 관 등록.
 *
 * ★ `seatCdOffset` 은 **등록 후 못 바꾼다.** 좌석의 키오스크 번호에 이미 반영돼
 *   저장되기 때문이다. 별관은 1000 이상만 받는다 — 100이면 본관 101번과 곧바로 겹친다.
 */
export function createBuilding(body: {
  academyId?: number
  code: string
  name: string
  sortOrder?: number
  seatCdOffset?: number
}): Promise<Building> {
  return request<Building>('/api/v1/admin/seats/buildings', { method: 'POST', body })
}

/** 이름·정렬·노출만. 코드·오프셋은 대상이 아니다 */
export function updateBuilding(
  buildingId: number,
  body: { name?: string; sortOrder?: number; active?: boolean },
): Promise<Building> {
  return request<Building>(`/api/v1/admin/seats/buildings/${buildingId}`, { method: 'PATCH', body })
}

export function deleteBuilding(buildingId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/buildings/${buildingId}`, { method: 'DELETE' })
}

/* ── 구역 등록·수정 ──────────────────────────────────────── */

/** `buildingId` 를 생략하면 본관에 붙는다 */
export function createSeatArea(body: {
  academyId?: number
  buildingId?: number
  areaCd: string
  areaNm: string
  sortOrder?: number
}): Promise<SeatArea> {
  return request<SeatArea>('/api/v1/admin/seats/areas', { method: 'POST', body })
}

/** 이름·정렬·노출만. **areaCd 는 못 고친다** — 키오스크가 그 코드로 구역을 찾는다 */
export function updateSeatArea(
  studyAreaId: number,
  body: { areaNm?: string; sortOrder?: number; active?: boolean },
): Promise<SeatArea> {
  return request<SeatArea>(`/api/v1/admin/seats/areas/${studyAreaId}`, { method: 'PATCH', body })
}

/** 좌석이 남아 있으면 409다 — 좌석을 먼저 지워야 한다 */
export function deleteSeatArea(studyAreaId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/areas/${studyAreaId}`, { method: 'DELETE' })
}

/* ── 좌석 등록·수정 ──────────────────────────────────────── */

export function listSeatMasters(studyAreaId: number): Promise<SeatMaster[]> {
  return request<SeatMaster[]>('/api/v1/admin/seats/masters', { query: { studyAreaId } })
}

/**
 * 격자 일괄 등록 — **좌석 등록의 기본 경로다.**
 *
 * 행·열만 주면 좌표와 번호를 서버가 만든다. 통로는 `skips` 로 빼고 번호는 그 칸을
 * 건너뛰고 이어진다. ★ **전부-아니면-전무다** — 하나라도 겹치면 아무것도 안 만들고
 * 겹친 코드를 전부 모아 알려준다.
 */
export function createSeatGrid(body: {
  studyAreaId: number
  rows: number
  columns: number
  seatCdPrefix?: string
  startNumber?: number
  numberPadding?: number
  startX?: number
  startY?: number
  columnMajor?: boolean
  skips?: { row: number; column: number }[]
}): Promise<SeatMaster[]> {
  return request<SeatMaster[]>('/api/v1/admin/seats/masters/grid', { method: 'POST', body })
}

/** 단건 등록. 배치도에 한 자리만 끼워 넣을 때 쓴다 */
export function createSeatMaster(body: {
  studyAreaId: number
  seatCd: string
  seatNm?: string
  xPos: number
  yPos: number
}): Promise<SeatMaster> {
  return request<SeatMaster>('/api/v1/admin/seats/masters', { method: 'POST', body })
}

/** 이름·좌표만. **seatCd 는 못 고친다** — 키오스크가 그 코드로 좌석을 찾는다 */
export function updateSeatMaster(
  seatId: number,
  body: { seatNm?: string; xPos?: number; yPos?: number },
): Promise<SeatMaster> {
  return request<SeatMaster>(`/api/v1/admin/seats/masters/${seatId}`, { method: 'PATCH', body })
}

/** 배정 중이면 409다 */
export function deleteSeatMaster(seatId: number): Promise<void> {
  return request<void>(`/api/v1/admin/seats/masters/${seatId}`, { method: 'DELETE' })
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

/**
 * 구역 이름 변경. `updateSeatArea` 의 가장 흔한 쓰임이라 이름만 따로 둔다 —
 * 기초 관리 탭이 이 이름으로 부른다.
 */
export function renameSeatArea(studyAreaId: number, areaNm: string): Promise<SeatArea> {
  return updateSeatArea(studyAreaId, { areaNm })
}
