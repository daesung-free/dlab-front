import { request } from './client'

/* 공지 (F-4.11-3 메시지 관리) — /api/v1/admin/notices
 *
 * ★ 발송 경로가 **범위별로 나뉘어 있다.** 하나의 POST 에 scope 를 넘기는 게 아니라
 *   `/notices/all` · `/branches/{id}` · `/classes/{id}` · `/students/{id}` 로 갈린다.
 *   권한이 경로 단위로 걸려 있기 때문이다(전체는 본사, 반은 담임).
 *
 * ★ `pinned`(상단 고정)와 `banner`(배너 노출)는 별개 축이다. 발송 후 수정으로 켠다. */

export type NoticeScope = 'ALL' | 'BRANCH' | 'CLASS' | 'INDIVIDUAL'

export const NOTICE_SCOPE_LABEL: Record<NoticeScope, string> = {
  ALL: '전체',
  BRANCH: '지점',
  CLASS: '반',
  INDIVIDUAL: '개별',
}

export interface Notice {
  id: number
  scope: NoticeScope
  academyId: number | null
  classId: number | null
  className: string | null
  enrollmentId: number | null
  title: string
  content: string
  authorType: string | null
  authorId: number | null
  pinned: boolean
  banner: boolean
  publishedAt: string | null
  expiresAt: string | null
  createdAt: string | null
}

export function listNotices(year?: number): Promise<Notice[]> {
  return request<Notice[]>('/api/v1/admin/notices', { query: { year } })
}

/* 발송 — 범위마다 경로가 다르다 */

export function postNoticeToAll(title: string, content: string): Promise<Notice> {
  return request<Notice>('/api/v1/admin/notices/all', { method: 'POST', body: { title, content } })
}

export function postNoticeToBranch(academyId: number, title: string, content: string): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/branches/${academyId}`, {
    method: 'POST',
    body: { title, content },
  })
}

export function postNoticeToClass(classId: number, title: string, content: string): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/classes/${classId}`, { method: 'POST', body: { title, content } })
}

export function postNoticeToStudent(enrollmentId: number, title: string, content: string): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/students/${enrollmentId}`, {
    method: 'POST',
    body: { title, content },
  })
}

/**
 * ⚠️ **부분 수정이 안 된다.** `title`·`content` 가 필수라, 상단 고정만 켜려 해도
 * 기존 제목·내용을 함께 보내야 한다 — 안 보내면 "제목은 필수입니다"로 거부된다.
 * 호출부는 `updateNotice` 대신 `patchNotice` 를 쓴다.
 */
export interface NoticeUpdate {
  title: string
  content: string
  pinned?: boolean
  banner?: boolean
  publishedAt?: string
  expiresAt?: string
}

export function updateNotice(id: number, body: NoticeUpdate): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/${id}`, { method: 'PUT', body })
}

/** 일부만 바꾼다. 서버가 전체 본문을 요구해서 기존 값을 채워 보낸다 */
export function patchNotice(
  notice: Notice,
  changes: Partial<Pick<NoticeUpdate, 'pinned' | 'banner' | 'publishedAt' | 'expiresAt'>>,
): Promise<Notice> {
  return updateNotice(notice.id, {
    title: notice.title,
    content: notice.content,
    pinned: notice.pinned,
    banner: notice.banner,
    ...changes,
  })
}

export function deleteNotice(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/notices/${id}`, { method: 'DELETE' })
}
