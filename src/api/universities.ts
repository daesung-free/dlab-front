/*
 * 대학·학과 마스터 (실적 입력의 대학·학과·계열을 통일한다)
 *
 * ★ **기초관리(`masters/**`)가 아니다.** 전 지점 공통 마스터라 경로가 따로 있다 —
 *   `masters/universities` 로 부르면 404 다.
 * ★ **학과는 `universityCode` 로 좁힌다.** 학과코드가 여러 대학에서 공용이라
 *   대학 없이는 유일하지 않다.
 * ★ **계열(`trackName`)이 학과 응답에 함께 온다** — 따로 입력받지 않는다.
 *
 * ⚠️ **저장 API(`SaveResult`)는 코드를 안 받는다.** 이름만 간다. 그래서 지금은
 *   「마스터에서 고른 것」과 「손으로 넣은 것」을 **서버가 구분하지 못한다** —
 *   화면이 할 수 있는 것은 **이름을 틀리지 않게 하는 것까지**다.
 */
import { request } from './client'

export interface UniversityView {
  code: string
  name: string
}

export interface DepartmentView {
  code: string
  name: string
  trackCode: string | null
  /** 계열. ★ 화면이 이 값을 **자동으로 채운다** — 따로 입력받지 않는다 */
  trackName: string | null
}

/**
 * 대학 검색.
 *
 * ★ `year` 는 필수다 — **연도마다 파일이 새로 온다.**
 * ★ `keyword` 를 비우면 전체(223개)가 온다. 화면에서는 **2글자 이상부터** 부른다.
 */
export function searchUniversities(year: number, keyword?: string): Promise<UniversityView[]> {
  return request<UniversityView[]>('/api/v1/admin/universities', {
    query: { year, keyword: keyword?.trim() || undefined },
  })
}

/** 그 대학의 학과 검색. 계열이 함께 온다 */
export function searchDepartments(
  universityCode: string,
  year: number,
  keyword?: string,
): Promise<DepartmentView[]> {
  return request<DepartmentView[]>(
    `/api/v1/admin/universities/${encodeURIComponent(universityCode)}/departments`,
    { query: { year, keyword: keyword?.trim() || undefined } },
  )
}
