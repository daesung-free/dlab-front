import { request } from './client'

/* 검색조건 저장 (F-4.1-1 '검색조건 저장') — /api/v1/admin/students/saved-searches
 *
 * ★ **계정별이다.** 남의 것은 보이지도 지워지지도 않는다 — 같은 지점 관리자라도 마찬가지다.
 * ★ **화면별이다**(`searchType`, 2026-09-25 서버 반영). 안 보내면 `STUDENT` 로 들어가
 *   학생 검색 조건과 섞인다. 출결의 '내 반' 과 학생 검색의 '내 반' 은 별개여야 한다.
 * ★ `conditions` 는 **화면이 만든 JSON 문자열 그대로** 오간다. 서버가 파싱하지 않으므로
 *   화면이 모양을 바꾸면 옛 조건이 그대로 돌아온다 — 읽을 때 한 번 더 확인한다.
 * ★ 같은 이름으로 저장하면 **덮어쓴다**(서버 규칙). 화면도 같은 이름을 지우고 다시 넣는다.
 */

/** 경로는 `/students/...` 지만 학생 검색 전용이 아니다 — 화면이 이 값으로 갈린다 */
export type SearchType =
  | 'STUDENT'
  | 'ATTENDANCE'
  | 'PENALTY'
  | 'RECEIPT_STATUS'
  | 'PAYMENT'
  | 'ROSTER'
  | 'AUDIT_LOG'
  | 'SEAT_LEAVE'

export interface SavedSearch {
  id: number
  searchType: SearchType
  name: string
  /** 화면이 만든 JSON 원본 */
  conditions: string
}

const PATH = '/api/v1/admin/students/saved-searches'

export function listSavedSearches(searchType: SearchType): Promise<SavedSearch[]> {
  return request<SavedSearch[]>(PATH, { query: { searchType } })
}

export function saveSearch(searchType: SearchType, name: string, conditions: string): Promise<SavedSearch> {
  return request<SavedSearch>(PATH, { method: 'POST', query: { searchType }, body: { name, conditions } })
}

export function deleteSavedSearch(id: number): Promise<void> {
  return request<void>(`${PATH}/${id}`, { method: 'DELETE' })
}
