import { request } from './client'

/* 상담 (F-4.11-4) — /api/v1/admin/consults */

export type ConsultType = 'REGULAR' | 'SCORE' | 'LIFE' | 'ADMISSION' | 'PARENT'
export type ConsultMethod = 'FACE' | 'PHONE' | 'ONLINE'

/* ★ ADMISSION 을 '입학예약 상담'으로 적었었다. **진학 상담이다** — 서버 주석도 그렇다.
     점검표의 '진로/진학'과 같은 항목인데 이름이 달라서, 점검표 4종과 구현 5종을 비교할 때
     서로 다른 항목인 줄 알고 "구성이 다르다"로 읽혔다. 실제 차이는 학부모 상담 하나뿐이다. */
export const CONSULT_TYPE_LABEL: Record<ConsultType, string> = {
  REGULAR: '정기 상담',
  SCORE: '성적 상담',
  LIFE: '생활 · 태도',
  ADMISSION: '진학 상담',
  PARENT: '학부모 상담',
}

/** 목업 타임라인의 색 구분(consult.css)에 맞춘 클래스 */
export const CONSULT_TYPE_CLASS: Record<ConsultType, string> = {
  REGULAR: 'reg',
  SCORE: 'scr',
  LIFE: 'lif',
  ADMISSION: 'adm',
  PARENT: 'reg',
}

export const CONSULT_METHOD_LABEL: Record<ConsultMethod, string> = {
  FACE: '대면',
  PHONE: '전화',
  ONLINE: '온라인',
}

export interface ConsultLog {
  id: number
  enrollmentId: number
  studentNo: string | null
  studentName: string
  teacherName: string | null
  consultType: ConsultType
  method: ConsultMethod | null
  consultedAt: string
  placeNote: string | null
  content: string
  actionPlan: string | null
  actionDone: boolean
  nextDueDate: string | null
  tags: string[]
  durationMinutes: number | null
  parentShare: ParentShare | null
}

/** 좌측 목록용. "누가 상담이 밀렸는가"가 이 응답의 목적이다 */
export interface ConsultStatusRow {
  enrollmentId: number
  studentNo: string | null
  name: string
  className: string | null
  homeroomTeacherName: string | null
  lastConsultedAt: string | null
  lastConsultType: ConsultType | null
  nextDueDate: string | null
  /** 예정일이 지난 일수. 0이면 밀리지 않은 것 */
  overdueDays: number
  neverConsulted: boolean
  profileWritten: boolean | null
}

export interface ConsultWrite {
  enrollmentId: number
  consultType: ConsultType
  consultedAt: string
  content: string
  method?: ConsultMethod
  placeNote?: string
  actionPlan?: string
  nextDueDate?: string
  tagIds?: number[]
  /** 학부모 공유 범위. 기본 NONE */
  parentShare?: ParentShare
  /** 상담 소요시간(분). placeNote 에 섞어 적던 것을 숫자로 분리했다 */
  durationMinutes?: number
}

export type ParentShare = 'NONE' | 'SUMMARY' | 'FULL'

export const PARENT_SHARE_LABEL: Record<ParentShare, string> = {
  NONE: '공유 안 함',
  SUMMARY: '요약본 전송',
  FULL: '전체 공유',
}

export function listConsultStatus(academyId: number, teacherId?: number): Promise<ConsultStatusRow[]> {
  return request<ConsultStatusRow[]>('/api/v1/admin/consults/status', { query: { academyId, teacherId } })
}

export function listStudentConsults(enrollmentId: number): Promise<ConsultLog[]> {
  return request<ConsultLog[]>(`/api/v1/admin/consults/students/${enrollmentId}`)
}

export function writeConsult(body: ConsultWrite): Promise<ConsultLog> {
  return request<ConsultLog>('/api/v1/admin/consults', { method: 'POST', body })
}
