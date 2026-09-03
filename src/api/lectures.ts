import { request } from './client'

/* 특강 (F-4.7) — /api/v1/admin/lectures
 *
 * ★ 특강 개설은 3가지를 동시에 만든다(목업 주석).
 *   ① 특강 ② 회차(수업일) ③ 청구 항목.
 *   회차가 없으면 출석부를 못 만든다 — 서버도 회차를 별도 엔드포인트로 받는다.
 *
 * ★ status(진행 상태)와 visible(앱 노출)은 **별개 축이다.** 합치면
 *   "모집은 끝났지만 앱에서 보여야 하는" 상태를 표현할 수 없다. */

export type LectureType = 'LECTURE' | 'BRIEFING'
export type LectureStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'DONE' | 'CANCELED'

export const LECTURE_TYPE_LABEL: Record<LectureType, string> = {
  LECTURE: '특강',
  BRIEFING: '설명회',
}

export const LECTURE_STATUS_LABEL: Record<LectureStatus, string> = {
  DRAFT: '준비중',
  OPEN: '모집중',
  CLOSED: '마감',
  DONE: '종료',
  CANCELED: '취소',
}

export const LECTURE_STATUS_TONE: Record<LectureStatus, string> = {
  DRAFT: '',
  OPEN: 'verified',
  CLOSED: 'supplement',
  DONE: 'brandnew',
  CANCELED: 'brandnew',
}

export interface Lecture {
  id: number
  lectureType: LectureType
  name: string
  description: string | null
  status: LectureStatus
  /** 앱 노출 여부. status 와 별개 축이다 */
  visible: boolean
  capacity: number | null
  /**
   * 신청 기간. **Instant 다** — `2026-09-01T00:00:00Z` 처럼 타임존을 붙여야 한다.
   * 붙이지 않으면 400 "요청 본문 형식이 올바르지 않습니다" 가 온다(docs/API_GAPS.md 6-4).
   */
  applyFrom: string | null
  applyTo: string | null
  startDate: string | null
  endDate: string | null
  fee: number | null
  teacherId: number | null
  teacherName: string | null
  confirmedCount: number
  waitlistedCount: number
}

export interface LectureSession {
  id: number
  sessionNo: number
  sessionDate: string
  startTime: string | null
  endTime: string | null
  room: string | null
}

/** 신청자 한 명. 대기자도 같은 구조이고 waitlisted 로 갈린다 */
export interface LectureApplicant {
  applicationId: number
  studentId: number
  studentNo: string | null
  studentName: string
  className: string | null
  phone: string | null
  status: string
  waitlisted: boolean
  appliedAt: string | null
  memo: string | null
  /** 서버가 이름·연락처를 가려서 보냈는지 */
  masked: boolean
}

export function listLectures(academyId: number, year: number, status?: LectureStatus): Promise<Lecture[]> {
  return request<Lecture[]>('/api/v1/admin/lectures', { query: { academyId, year, status } })
}

export function listLectureSessions(lectureId: number): Promise<LectureSession[]> {
  return request<LectureSession[]>(`/api/v1/admin/lectures/${lectureId}/sessions`)
}

export function listLectureApplicants(lectureId: number): Promise<LectureApplicant[]> {
  return request<LectureApplicant[]>(`/api/v1/admin/lectures/${lectureId}/applications`)
}

export function changeLectureStatus(lectureId: number, status: LectureStatus): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/${lectureId}/status`, { method: 'PUT', body: { status } })
}

/** 대기자를 확정으로 올린다 */
export function promoteApplicant(applicationId: number): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/applications/${applicationId}/promote`, { method: 'POST' })
}
