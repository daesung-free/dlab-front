/* 백엔드 공통 응답 규약 (dlab-api CLAUDE.md §7).
 *
 * ★ 성공/실패가 HTTP 상태가 아니라 본문의 success 로도 갈린다. 둘 다 봐야 한다.
 * ★ 목록 응답이 두 형태다 — 아래 SpringPage 주석 참고. */

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  meta?: PageMeta
  error?: { code: string; message: string }
}

/** ApiResponse.from(page) 를 쓴 엔드포인트가 내려주는 페이징 정보. page는 0-based. */
export interface PageMeta {
  page: number
  size: number
  totalElements: number
  totalPages: number
  hasNext: boolean
}

/**
 * Spring Data Page 를 그대로 감싼 형태.
 *
 * ★ 백엔드가 목록을 두 가지로 내려준다:
 *   (1) ApiResponse.from(page)  → data: [...],           meta: {...}
 *   (2) ApiResponse.success(page) → data: { content: [...], totalElements, ... }, meta 없음
 *   학생 검색은 (2)다. 클라이언트에서 두 형태를 하나로 정규화한다(client.ts의 toPage).
 */
export interface SpringPage<T> {
  content: T[]
  number: number
  size: number
  totalElements: number
  totalPages: number
  first: boolean
  last: boolean
  empty: boolean
}

/** 두 형태를 정규화한 결과. 화면은 이것만 본다. page는 0-based를 유지한다. */
export interface Paged<T> {
  rows: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
}
