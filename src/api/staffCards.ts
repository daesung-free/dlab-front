import { request } from './client'

/* 직원 카드 · 출퇴근 (F-4.10-8) — /api/v1/admin/staff-cards
 *
 * ★ **직원 계정(`/staff/accounts`)과 다른 것이다.** 저쪽은 "관리자 웹에 로그인하는 사람"이고
 *   이쪽은 "키오스크에 카드를 찍는 사람"이다. 계정 없이 카드만 있는 직원이 있을 수 있다.
 *
 * ★ **근태를 판정하지 않는다.** 서버가 출근·퇴근 기록을 시각 순으로 그대로 내려줄 뿐,
 *   근무시간·지각을 계산하지 않는다 — 근무시간 마스터가 없고 **근태 판정은 노동법 영역**이라
 *   임의로 넣으면 나중에 바꾸기 어렵다(서버 주석). **화면도 계산하지 않는다.**
 */

export interface StaffCard {
  enrollmentId: number
  name: string
  phone: string | null
  /**
   * 키오스크 키패드에 찍는 번호.
   *
   * ★ 뒤 4자리가 **9000번대**다. 4자리 키패드에서 학생과 구분하려고 그렇게 채번한다 —
   *   화면이 만들지 않는다.
   */
  studentNo: string | null
  /** 카드 번호. 아직 안 준 직원은 비어 있다 */
  rfidNo: string | null
}

/** ★ `academyId` 가 **필수**다 */
export function listStaffCards(academyId: number): Promise<StaffCard[]> {
  return request<StaffCard[]>('/api/v1/admin/staff-cards', { query: { academyId } })
}

/**
 * 직원 등록.
 *
 * ★ 학번은 **9000번대로 서버가 채번한다.** 화면이 정하지 않는다.
 * ★ 카드 번호는 나중에 줘도 된다 — 등록만 해두고 카드는 받아서 달 수 있다.
 */
export function createStaffCard(body: {
  academyId: number
  name: string
  phone?: string
  rfidNo?: string
}): Promise<StaffCard> {
  return request<StaffCard>('/api/v1/admin/staff-cards', { method: 'POST', body })
}

/**
 * 카드 교체 · 분실 재발급.
 *
 * ★ 같은 사람에게 **새 번호를 달아주는 것**이다. 잃어버린 카드는 이 호출로 무효가 된다 —
 *   따로 '분실 신고' 가 없다.
 */
export function replaceStaffCard(enrollmentId: number, rfidNo: string): Promise<StaffCard> {
  return request<StaffCard>(`/api/v1/admin/staff-cards/${enrollmentId}/card`, {
    method: 'PATCH',
    body: { rfidNo },
  })
}

/**
 * 퇴사.
 *
 * ★ **행을 지우지 않는다.** 현재 등록만 내린다 — 지우면 **근태 이력의 주인을 알 수 없다**
 *   (서버 주석). 그래서 화면 문구도 '삭제' 가 아니라 '퇴사 처리' 다.
 *
 * ★ 다만 **목록(`GET /staff-cards`)에서는 빠진다**(2026-09-16 확인). 되돌리는 경로가
 *   없으므로 화면은 누르기 전에 확인을 받는다.
 */
export function retireStaffCard(enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/staff-cards/${enrollmentId}`, { method: 'DELETE' })
}

/* ─────────── 근태 ─────────── */

/** `IN` 출근 / `OUT` 퇴근. 그 밖의 값은 없다 */
export type StaffAttendanceEvent = 'IN' | 'OUT'

export const STAFF_EVENT_LABEL: Record<StaffAttendanceEvent, string> = {
  IN: '출근',
  OUT: '퇴근',
}

export interface StaffAttendance {
  enrollmentId: number
  name: string
  studentNo: string | null
  /** `yyyy-MM-dd` */
  workDate: string
  eventType: StaffAttendanceEvent
  /** ISO instant. 화면은 로컬 시각으로 바꿔 찍는다 */
  recordedAt: string
}

/**
 * 근태 조회.
 *
 * ★ `academyId` · `from` · `to` 가 **전부 필수**다. 안 보내면 400.
 * ★ **판정이 없다.** 출근·퇴근 기록이 시각 순으로 그대로 온다 — 근무시간도 지각도
 *   서버가 안 낸다. 화면이 대신 계산하면 **노동법 판단을 화면이 하는 셈**이 된다.
 *   묶어서 보여주되 "몇 시간 일했다"는 쓰지 않는다.
 */
export function listStaffAttendances(params: {
  academyId: number
  from: string
  to: string
  enrollmentId?: number
}): Promise<StaffAttendance[]> {
  return request<StaffAttendance[]>('/api/v1/admin/staff-cards/attendances', { query: { ...params } })
}
