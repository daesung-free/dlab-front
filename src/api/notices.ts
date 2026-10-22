import { request } from './client'

/* 공지 (F-4.11-3 메시지 관리) — /api/v1/admin/notices
 *
 * ★ 발송 경로가 **범위별로 나뉘어 있다.** 하나의 POST 에 scope 를 넘기는 게 아니라
 *   `/notices/all` · `/branches/{id}` · `/classes/{id}` · `/students/{id}` 로 갈린다.
 *   권한이 경로 단위로 걸려 있기 때문이다(전체는 본사, 반은 담임).
 *
 * ★ `pinned`(상단 고정)와 `banner`(배너 노출)는 별개 축이다. 발송 후 수정으로 켠다. */

export type NoticeScope = 'ALL' | 'BRANCH' | 'CLASS' | 'INDIVIDUAL' | 'SELECTED'

export const NOTICE_SCOPE_LABEL: Record<NoticeScope, string> = {
  ALL: '전체',
  BRANCH: '지점',
  CLASS: '반',
  /** ★ 옛 방식(한 명짜리 공지). **새로 만들 때는 쓰지 않는다** — `SELECTED` 로 간다 */
  INDIVIDUAL: '개별',
  SELECTED: '학생 선택',
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
  /** 읽은 사람 수. 학생/학부모가 앱에서 연 횟수가 아니라 **사람 수**다 */
  readCount: number | null
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

/**
 * 학생 한 명(옛 방식).
 *
 * ★ **새로 쓰지 않는다.** 여러 명에게 보내려고 이걸 사람 수만큼 부르면 **공지가 N건**
 *   만들어진다 — 목록에 같은 글이 N개 뜨고, 오타 하나를 N번 고쳐야 하며, 「읽음 몇 명」이
 *   N개로 쪼개진다. `postNoticeToStudents` 를 쓴다.
 */
export function postNoticeToStudent(enrollmentId: number, title: string, content: string): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/students/${enrollmentId}`, {
    method: 'POST',
    body: { title, content },
  })
}

/**
 * 고른 학생들에게 — **공지는 한 건**이고 대상자만 여럿이다(요구사항 1-5).
 *
 * ★ 같은 학생을 두 번 넣어도 **한 번만** 들어간다 — 체크박스 중복을 걱정하지 않아도 된다.
 *
 * ⚠️ **서버가 거절하는 경우 셋.** 화면에서 먼저 거르는 쪽이 친절하다 — 고르고 나서
 *   거절당하면 **왜인지 모른다.**
 *   · **담임이 남의 반 학생을 섞으면 전체가 거절된다** — 하나만 자기 반이어도 안 된다.
 *     학생마다 보기 때문이다(한 번만 검사하면 자기 반 하나를 끼워 전교생에게 보내는 길이 열린다)
 *   · **여러 지점을 섞으면** 안 된다 — 공지는 지점 하나에 속한다
 *   · **대상이 비면** 안 된다
 */
export function postNoticeToStudents(
  enrollmentIds: number[],
  title: string,
  content: string,
): Promise<Notice> {
  return request<Notice>('/api/v1/admin/notices/students', {
    method: 'POST',
    body: { enrollmentIds, title, content },
  })
}

/**
 * 전체 교체. `title`·`content` 가 필수다.
 *
 * ★ **예약·만료 시각을 지울 때만** 이걸 쓴다. PATCH 는 `null` 을 "그대로"로 읽어서
 *   지우지 못한다. 그 외에는 `patchNotice` 를 쓴다 — 아래 참조.
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

/**
 * 보낸 필드만 바꾼다.
 *
 * ★ 예전엔 PUT 밖에 없어서 상단 고정만 켜려 해도 목록에 있던 제목·내용을 함께
 *   보내야 했다 — 그 사이 남이 본문을 고쳤으면 되돌려 놓는 셈이었다.
 *   목록을 오래 열어둘수록 확률이 올라간다. PATCH 가 생겨 그 위험이 없어졌다.
 */
export function patchNotice(
  id: number,
  changes: Partial<NoticeUpdate>,
): Promise<Notice> {
  return request<Notice>(`/api/v1/admin/notices/${id}`, { method: 'PATCH', body: changes })
}

export function deleteNotice(id: number): Promise<void> {
  return request<void>(`/api/v1/admin/notices/${id}`, { method: 'DELETE' })
}

/* ── 첨부 (2026-10-20 서버 추가) ──────────────────────────────
 *
 * ★ **저장 전에 올린다.** `ownerId` 없이 올려 `fileId` 를 받고, 공지를 저장한 뒤
 *   `PATCH /files/{id}/owner` 로 붙인다 — 저장부터 강제하면 **쓰다 만 공지가 쌓인다.**
 * ★★ **`ownerType` 은 대문자 `NOTICE`** 다. `owner_type` 이 자유 문자열이라
 *   소문자로 보내면 **업로드는 되고 조회만 안 되는데 오류도 안 난다.**
 * ★ `url` 은 **고정 주소**라 화면이 저장해 써도 된다(비공개 첨부와 다르다).
 */

export interface NoticeAttachment {
  id: number
  originalName: string
  contentType: string
  sizeBytes: number
  /** 고정 주소 */
  url: string
}

/**
 * 공지 상세 — **첨부는 여기에만 실린다.**
 *
 * ★ 목록 응답의 첨부는 **늘 빈 목록**이다. 목록에 넣으면 공지 수만큼 조회가 따라붙는다.
 */
export function getNotice(id: number): Promise<Notice & { attachments?: NoticeAttachment[] }> {
  return request<Notice & { attachments?: NoticeAttachment[] }>(`/api/v1/admin/notices/${id}`)
}

/** 공개 업로드 → 파일 id. **저장 전에 올린다**(`ownerId` 없이) */
export async function uploadNoticeFile(file: File): Promise<{ id: number; fileName: string; url?: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return request<{ id: number; fileName: string; url?: string }>('/api/v1/admin/files/public', {
    method: 'POST',
    /* ★ 대문자다 — 소문자면 조회가 조용히 비어 온다 */
    query: { ownerType: 'NOTICE' },
    body: fd,
  })
}

/** 저장한 공지에 파일을 붙인다 */
export function attachFileToNotice(fileId: number, noticeId: number): Promise<void> {
  return request<void>(`/api/v1/admin/files/${fileId}/owner`, {
    method: 'PATCH',
    body: { ownerType: 'NOTICE', ownerId: noticeId },
  })
}

/* ── 공개 링크 (알림톡 「등록비 안내」 버튼이 여는 자리) ───────────────── */

/**
 * 공지를 로그인 없이 볼 수 있는 주소를 만든다 — `/notice/{token}`.
 *
 * ★ **공지 번호를 주소에 쓰지 않는다.** `/notice/37` 이면 38·39 로 바꿔 가며 **남의 반·
 *   남의 학생에게만 보낸 공지까지** 읽힌다. 그래서 추측할 수 없는 토큰을 서버가 만든다.
 * ★ **기한은 서버가 정한다.** 화면마다 다른 값을 보내면 「왜 이 링크만 일찍 닫혔나」를
 *   나중에 추적할 수 없다(2026-10-22 서버와 합의).
 * ★ **같은 공지를 또 누르면 같은 주소가 온다**(서버가 기존 것을 돌려준다). 누를 때마다
 *   새 주소가 생기면 **이미 보낸 알림톡의 링크가 죽는다.**
 */
export interface NoticeShare {
  token: string
  /** ISO. `null` 이면 기한 없음 */
  expiresAt: string | null
}

export function shareNotice(id: number): Promise<NoticeShare> {
  return request<NoticeShare>(`/api/v1/admin/notices/${id}/share`, { method: 'POST' })
}
