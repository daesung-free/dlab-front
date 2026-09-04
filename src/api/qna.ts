import { request } from './client'

/* 대면 질의응답 (F-4.11-7) — /api/v1/admin/qna/offline
 *
 * ★ 슬롯은 **일괄 생성**한다. 시작~종료 시각과 간격을 주면 서버가 쪼개 만든다 —
 *   30분짜리를 하나씩 등록하게 하면 실수가 나온다.
 *
 * ★ `reservations` 는 **관리자 응답에만** 채워진다. 앱에서는 비어 있다 —
 *   남의 예약이 보이면 안 되기 때문이다.
 *
 * ★ `closed`(운영자가 닫음)와 `full`(정원이 참)은 별개다. 둘 다 앱에서 "마감"으로
 *   보이지만 원인이 달라, 관리자 화면에서는 구분해서 표시한다. */

export interface QnaReservation {
  id: number
  studentId: number
  studentNo: string | null
  studentName: string
  question: string | null
  reservedAt: string | null
  canceledAt: string | null
}

export interface QnaSlot {
  id: number
  date: string
  startTime: string
  endTime: string
  teacherName: string | null
  room: string | null
  capacity: number
  reserved: number
  /** 정원이 찼는가. 앱이 "마감"을 표시한다 */
  full: boolean
  /** 운영자가 닫았는가. full 과 별개 축이다 */
  closed: boolean
  memo: string | null
  reservations: QnaReservation[]
}

export interface QnaOpenSlots {
  academyId: number
  year: number
  date: string
  /** "HH:mm" */
  from: string
  to: string
  intervalMinutes: number
  teacherId?: number
  room?: string
  capacity?: number
}

export function listQnaSlots(academyId: number, date: string): Promise<QnaSlot[]> {
  return request<QnaSlot[]>('/api/v1/admin/qna/offline/slots', { query: { academyId, date } })
}

export function openQnaSlots(body: QnaOpenSlots): Promise<QnaSlot[]> {
  return request<QnaSlot[]>('/api/v1/admin/qna/offline/slots', { method: 'POST', body })
}

/** 담당·장소·메모 변경 */
export function assignQnaSlot(
  slotId: number,
  body: { teacherId?: number; room?: string; memo?: string },
): Promise<QnaSlot> {
  return request<QnaSlot>(`/api/v1/admin/qna/offline/slots/${slotId}`, { method: 'PATCH', body })
}

/** 슬롯 열기/닫기. 정원이 찬 것(full)과는 다른 축이다 */
export function setQnaSlotClosed(slotId: number, closed: boolean): Promise<QnaSlot> {
  return request<QnaSlot>(`/api/v1/admin/qna/offline/slots/${slotId}/closed`, {
    method: 'PUT',
    body: { closed },
  })
}

export function cancelQnaReservation(reservationId: number): Promise<void> {
  return request<void>(`/api/v1/admin/qna/offline/reservations/${reservationId}`, { method: 'DELETE' })
}
