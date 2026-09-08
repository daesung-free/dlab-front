import { request } from './client'

/* 특강 세부 유형 (단과·실전·해설) — /api/v1/admin/lecture-categories
 *
 * ★ `lectureType`(LECTURE·BRIEFING)과 **다른 축이다.** 그쪽은 특강이냐 설명회냐이고,
 *   이쪽은 특강 안의 세분류다. **설명회에는 붙지 않는다.**
 *
 * ★ academyId 를 비우면 **전 지점 공통**이고 본사만 만들 수 있다. 응답의 `nationwide`
 *   가 그 표시이며, 지점 관리자는 그 항목을 고칠 수 없다.
 *
 * ⚠️ 조회할 때 `activeOnly` 만 보내면 400이다 — 본사 계정은 `academyId` 를 함께 보내야
 *   한다("지점을 지정해야 합니다"). 다른 목록과 같은 지점 스코프 규칙이다.
 */

export interface LectureCategory {
  id: number
  /** null 이면 전 지점 공통 */
  academyId: number | null
  nationwide: boolean
  year: number
  name: string
  sortOrder: number
  active: boolean
}

export function listLectureCategories(params: {
  academyId?: number
  year?: number
  /** true 면 사용 중인 것만. 드롭다운은 이걸 쓴다 */
  activeOnly?: boolean
}): Promise<LectureCategory[]> {
  return request<LectureCategory[]>('/api/v1/admin/lecture-categories', { query: { ...params } })
}

/** academyId 를 비우면 전 지점 공통이 된다 — 본사만 가능하다 */
export function createLectureCategory(body: {
  academyId?: number
  year?: number
  name: string
  sortOrder?: number
}): Promise<LectureCategory> {
  return request<LectureCategory>('/api/v1/admin/lecture-categories', { method: 'POST', body })
}

/** 보낸 항목만 바뀐다. 사용여부도 여기서 끈다 */
export function updateLectureCategory(
  categoryId: number,
  body: { name?: string; sortOrder?: number; active?: boolean },
): Promise<LectureCategory> {
  return request<LectureCategory>(`/api/v1/admin/lecture-categories/${categoryId}`, {
    method: 'PUT',
    body,
  })
}

export function deleteLectureCategory(categoryId: number): Promise<void> {
  return request<void>(`/api/v1/admin/lecture-categories/${categoryId}`, { method: 'DELETE' })
}
