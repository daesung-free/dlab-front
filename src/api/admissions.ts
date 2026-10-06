import { request } from './client'

/* 입학 상담 예약 (F-4.2 대기자 관리) — /api/v1/admin/admission-reservations
 *
 * 홈페이지 입학예약폼이 들어오는 쪽이고, 여기서 상태를 옮기다가 원생으로 전환한다.
 * 오래 「신청 유입 경로가 없어 문서만」으로 멈춰 있었는데(API_GAPS 26부),
 * 홈페이지 수신(`POST /api/v1/homepage/admissions`)이 생겨 풀렸다(2026-10-06).
 *
 * ★ **페이징이 없다.** 목록이 배열 그대로 온다 → `useServerData` 를 쓴다.
 *   `useServerTable` 을 쓰면 totalPages 가 1로 굳어 페이저와 정렬 헤더가 통째로 사라진다.
 *
 * ★ **지점 파라미터가 없다.** `academyId` 를 받지 않아 **전 지점이 섞여 온다** —
 *   응답 행의 `academyId` 로 화면에서 걸러야 한다. 서버에서 거르는 게 맞지만
 *   지금은 그 파라미터가 없다(API_GAPS 40부). 거르지 않으면 분당 담당자가
 *   대구 지원자를 보고 전화하게 된다.
 *
 * ★ **`year` 는 필수다.** 안 보내면 400 이다 — 기수(期)와 다른 **연도**다.
 *
 * ★ 상세(`/{id}`)가 목록과 **같은 모양**이다. 생년·출신학원·등원희망일·유입경로처럼
 *   접수 폼으로 들어온 값은 관리자 조회에 **아직 안 온다** — 화면에서 지우지 말고
 *   `<Unfilled/>` 로 둔다. 지우면 백엔드에 요청할 것이 조용히 사라진다.
 */

export type ReservationStatus =
  | 'CALL_NEEDED'
  | 'CONSULTED'
  | 'ON_HOLD'
  | 'CONFIRMED'
  | 'NOT_REGISTERED'
  | 'CANCELED'

/** 파이프라인에 그리는 순서. 접수 → 상담 → 결론(확정·불가) → 보류·취소 */
export const RESERVATION_FLOW: readonly ReservationStatus[] = [
  'CALL_NEEDED',
  'CONSULTED',
  'CONFIRMED',
  'NOT_REGISTERED',
  'ON_HOLD',
  'CANCELED',
]

/** 서버도 `statusName` 을 주지만, 목록이 비었을 때도 칸 제목은 있어야 해서 여기 둔다 */
export const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  CALL_NEEDED: '연락 필요',
  CONSULTED: '상담 완료',
  ON_HOLD: '보류',
  CONFIRMED: '입학 확정',
  NOT_REGISTERED: '미등록',
  CANCELED: '취소',
}

export interface ReservationRow {
  id: number
  /** 접수번호. 홈페이지가 돌려준 값이라 학부모가 말하는 번호다 */
  rsvCd: string | null
  year: number
  /** 지점. 서버가 못 걸러 주므로 이 값으로 화면에서 거른다 */
  academyId: number | null
  studentName: string | null
  studentTel: string | null
  parentTel: string | null
  stdGrade: string | null
  schoolName: string | null
  status: ReservationStatus
  statusName: string | null
  /** 원생으로 전환이 끝났는지. true 면 전환 버튼을 다시 주지 않는다 */
  converted: boolean
  enrollmentId: number | null
  studentNo: string | null
  createdAt: string | null
}

export interface ReservationStatusLog {
  id: number
  fromStatus: ReservationStatus | null
  toStatus: ReservationStatus
  reason: string | null
  changedBy: number | null
  changedAt: string | null
}

export interface ReservationMemo {
  id: number
  content: string
  writerId: number | null
  createdAt: string | null
}

export interface ReservationQuery {
  year: number
  status?: ReservationStatus
  keyword?: string
}

export function listReservations(q: ReservationQuery): Promise<ReservationRow[]> {
  return request<ReservationRow[]>('/api/v1/admin/admission-reservations', {
    query: { year: q.year, status: q.status, keyword: q.keyword },
  })
}

export function getReservation(reservationId: number): Promise<ReservationRow> {
  return request<ReservationRow>(`/api/v1/admin/admission-reservations/${reservationId}`)
}

/**
 * 상태 변경. `reason` 은 선택이지만 **취소·미등록은 이유가 남아야** 나중에 왜 떨어졌는지 센다.
 * 바뀐 이력은 `listStatusLogs` 로 따로 조회한다 — 응답에 이력이 실려 오지 않는다.
 */
export function changeReservationStatus(
  reservationId: number,
  body: { status: ReservationStatus; reason?: string },
): Promise<unknown> {
  return request(`/api/v1/admin/admission-reservations/${reservationId}/status`, {
    method: 'POST',
    body,
  })
}

export function listStatusLogs(reservationId: number): Promise<ReservationStatusLog[]> {
  return request<ReservationStatusLog[]>(`/api/v1/admin/admission-reservations/${reservationId}/status-logs`)
}

export function listReservationMemos(reservationId: number): Promise<ReservationMemo[]> {
  return request<ReservationMemo[]>(`/api/v1/admin/admission-reservations/${reservationId}/memos`)
}

export function addReservationMemo(reservationId: number, content: string): Promise<unknown> {
  return request(`/api/v1/admin/admission-reservations/${reservationId}/memos`, {
    method: 'POST',
    body: { content },
  })
}

/** 메모 삭제는 예약이 아니라 **메모 id** 로 지운다 — 경로가 다르다 */
export function deleteReservationMemo(memoId: number): Promise<unknown> {
  return request(`/api/v1/admin/admission-reservations/memos/${memoId}`, { method: 'DELETE' })
}

/** 전환에 쓰는 학년. 학생 등록의 학년과 **값이 다르면 400** 이라 서버 enum 을 그대로 쓴다 */
export type ConvertGrade = 'HIGH2' | 'HIGH3' | 'N_SU' | 'STAFF'

export const CONVERT_GRADE_LABEL: Record<ConvertGrade, string> = {
  HIGH2: '고2',
  HIGH3: '고3',
  N_SU: 'N수',
  STAFF: '직원',
}

/**
 * 원생 전환. **되돌리는 API 가 없다** — 전환하면 학생이 생기고 `converted` 가 true 로 굳는다.
 * 그래서 화면에서 한 번 더 확인을 받는다.
 */
export function convertReservation(
  reservationId: number,
  body: { grade: ConvertGrade; admissionDate: string },
): Promise<unknown> {
  return request(`/api/v1/admin/admission-reservations/${reservationId}/convert`, {
    method: 'POST',
    body,
  })
}
