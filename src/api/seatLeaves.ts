import { request } from './client'

/* 좌석 이탈/복귀 (F-4.11-8) — GET /api/v1/admin/seat-leaves
 *
 * 조회만 있다. 이탈·복귀는 **키오스크 태깅으로만** 생긴다(앱 표시는 2차).
 * 서버가 이탈·복귀 로그를 **이탈 한 건 = 한 행**으로 짝지어 준다 — 화면이 로그를 맞추지 않는다.
 *
 * ★ 페이징이 없다. 기간은 최대 31일이고 넘기면 400 이다 → useServerData.
 * ★ AUTO_CLOSED 는 **복귀가 아니다.** 키오스크가 00:30 에 미복귀 건을 일괄 마감한 것이라
 *   이탈 시간(minutes)도 없다. 복귀로 세면 밤늦게 나간 학생의 장시간 미복귀가 가려진다.
 * ★ 이탈 위치(어디로 갔는지)는 없다 — 위치 구분값이 아직 정해지지 않았다.
 * ★ 마스킹은 **서버가 한다**(2026-09-25). 담임·행정 계정에는 이름이 가려져 오고 응답·행마다
 *   `masked` 가 온다. 프론트에서 또 가리면 이중 마스킹이라 이름이 통째로 사라진다.
 *   본사·지점 관리자에게 원본이 오는 것은 정상이다 — 출결·상벌점·좌석배치표와 같은 규칙이다.
 * ★ **담임 계정은 맡은 반 학생만 온다**(출결 현황과 같은 규칙). 상단 건수도 그만큼 줄어든다 —
 *   "지점 전체가 안 보인다"는 문의가 오면 이것부터 확인한다.
 */

export type SeatLeaveStatus = 'OPEN' | 'RETURNED' | 'AUTO_CLOSED' | 'NO_RETURN_RECORD'

export const SEAT_LEAVE_STATUS: readonly SeatLeaveStatus[] = ['OPEN', 'RETURNED', 'AUTO_CLOSED', 'NO_RETURN_RECORD']

export const SEAT_LEAVE_STATUS_LABEL: Record<SeatLeaveStatus, string> = {
  OPEN: '이탈 중',
  RETURNED: '복귀',
  /** 복귀한 것이 아니다 — 밤 12시 30분에 키오스크가 닫은 것이다 */
  AUTO_CLOSED: '미복귀 마감',
  /** 복귀 태깅 없이 다음 이탈이 찍혔다. 기록이 빠진 것이지 계속 나가 있던 게 아니다 */
  NO_RETURN_RECORD: '복귀 기록 없음',
}

export interface SeatLeaveRow {
  leaveLogId: number
  /** null 이면 키오스크가 보낸 카드·학번으로 학생을 못 찾은 건이다 */
  enrollmentId: number | null
  /** 학생을 못 찾았으면 키오스크가 보낸 학번 원본 */
  studentNo: string | null
  name: string | null
  className: string | null
  /** 키오스크 코드다. 별관이면 좌석번호에 관 offset 이 더해져 있다(1번 → 1001번) */
  areaCd: string | null
  seatCd: string | null
  /** ISO 시각(UTC). 표시할 때 로컬로 바꾼다 */
  leftAt: string
  /** 복귀 또는 자동 마감 시각. 이탈 중이면 null */
  closedAt: string | null
  status: SeatLeaveStatus
  /** OPEN 이면 지금까지 경과, RETURNED 면 실제 이탈 시간. 나머지는 알 수 없어 null */
  minutes: number | null
  resolved: boolean
  /** 이 행의 이름이 서버에서 가려졌는지 */
  masked: boolean
}

export interface SeatLeaveBoard {
  rows: SeatLeaveRow[]
  /** 이 응답의 이름이 가려져 왔는지. 화면은 이 값을 보고 또 가리지 않는다 */
  masked: boolean
  /** 조회된 목록 기준이라 필터를 걸면 같이 줄어든다 */
  summary: { total: number } & Record<SeatLeaveStatus, number>
}

export interface SeatLeaveParams {
  academyId?: number
  /** 하루 조회. from·to 를 주면 그쪽이 이긴다. 둘 다 없으면 오늘 */
  date?: string
  from?: string
  to?: string
  classId?: number
  statuses?: SeatLeaveStatus[]
  /** 이름·학번·좌석 */
  keyword?: string
}

export const SEAT_LEAVE_MAX_DAYS = 31

export function fetchSeatLeaves(params: SeatLeaveParams): Promise<SeatLeaveBoard> {
  const { statuses, ...rest } = params
  return request<SeatLeaveBoard>('/api/v1/admin/seat-leaves', {
    query: { ...rest },
    repeatable: { statuses },
  })
}

/** 지금 이탈 중인 학생. 오래 나가 있는 학생이 위로 온다 */
export function fetchCurrentSeatLeaves(params: { academyId?: number; classId?: number }): Promise<SeatLeaveRow[]> {
  return request<SeatLeaveRow[]>('/api/v1/admin/seat-leaves/current', { query: { ...params } })
}
