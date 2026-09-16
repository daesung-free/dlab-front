import { request } from './client'

/* 계정별 메뉴 노출 (F-4.10-2 부속) — /api/v1/admin/menus
 *
 * ★ 역할 단위가 아니라 **계정 단위**다. 최고관리자가 계정마다 보여줄 메뉴를 고른다.
 * ★ **서버도 같은 설정으로 막는다.** 숨긴 메뉴의 API 는 403 이다 — 화면만 감추는 게 아니다.
 */

export interface MenuNode {
  code: string
  name: string
  /** 상위 코드. 없으면 최상위다 */
  parentCode: string | null
  /** 카탈로그 정렬용. 서버가 내려주는 순서와 같다 */
  sortOrder: number
  /**
   * 서버가 실제로 막을 수 있는가.
   *
   * ★ `false` 면 **화면에서만 거른다** — 아직 그 코드에 걸린 API 경로가 없다는 뜻이다
   *   (대기자 관리·시간표·신상기록부). API 가 생기면 서버 차단까지 함께 걸린다.
   */
  enforceable: boolean
}

/** 설정 화면이 쓰는 카탈로그. 전체 메뉴 트리가 온다 */
export function listMenuCatalog(): Promise<MenuNode[]> {
  return request<MenuNode[]>('/api/v1/admin/menus')
}

/**
 * 내 계정이 볼 수 있는 메뉴 코드.
 *
 * ★ **설정이 없는 계정에는 전체가 내려온다.** "설정 없음" 을 따로 처리하지 않는다.
 */
export function listMyMenus(): Promise<MenuNode[]> {
  return request<MenuNode[]>('/api/v1/admin/menus/mine')
}

/**
 * 계정에 지금 걸린 설정.
 *
 * ★ `restricted: false` 면 `menus` 는 **빈 배열**이다 — "볼 수 있는 메뉴가 없다" 가 아니라
 *   "제한이 없다" 다. 이 둘을 구분하지 않으면 설정 화면이 전부 해제된 것처럼 보인다.
 */
export interface AccountMenus {
  accountId: number
  restricted: boolean
  menus: MenuNode[]
}

export function getAccountMenus(accountId: number): Promise<AccountMenus> {
  return request<AccountMenus>(`/api/v1/admin/staff/accounts/${accountId}/menus`)
}

/**
 * 계정의 메뉴 노출 설정.
 *
 * ★ **통째로 보낸다.** 더하기·빼기가 아니라 교체다 — 보낸 목록이 곧 전부다.
 * ★ **빈 배열이면 제한 해제**다. 아무것도 못 보게 하려고 빈 배열을 보내면 반대가 된다.
 * ★ **부모 코드를 준다고 자식이 열리지 않는다.** 각 코드가 독립이라 부모를 체크하면
 *   자식까지 함께 실어 보내야 한다(`parentCode` 로 묶는다) — 서버가 자동으로 포함하면
 *   "수납현황만 보여주려 했는데 청구기준 편집까지 열리는" 것을 막을 수 없다.
 * ★ 최고관리자만 호출된다.
 */
export function setAccountMenus(accountId: number, menuCodes: string[]): Promise<AccountMenus> {
  return request<AccountMenus>(`/api/v1/admin/staff/accounts/${accountId}/menus`, {
    method: 'PUT',
    body: { menuCodes },
  })
}
