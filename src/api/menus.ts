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
  /**
   * 화면이 없는 **권한** 항목인가(2026-10-12 추가). 긴급 출입 알림 수신·직원 출근 기록 수정처럼
   * 눌러서 들어갈 화면이 없는 것들이다.
   *
   * ★ **사이드바에서 거르는 일은 서버가 한다** — `/menus/mine` 에서 빠져 내려오고,
   *   자주 쓰는 메뉴에 담으려 하면 거절된다. 화면이 또 거르지 않는다.
   *   여기서는 **설정 화면의 체크박스를 「권한」으로 묶어 보여주는 용도**로만 쓴다.
   */
  actionOnly?: boolean
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
  /** 계정별 설정이 **있는가**. false 면 역할 기본값으로 내려간다(메뉴가 없다는 뜻이 아니다) */
  restricted: boolean
  menus: MenuNode[]
  /**
   * 역할 기본값 — **그 계정에 지금 실제로 내려가는 메뉴**다(2026-09-27 서버 추가).
   *
   * ★ `restricted: false` 일 때 설정 화면은 **이걸로 체크해 그려야 한다.** `menus` 는 비어 있는데
   *   그걸 그리면 "이 계정은 아무 메뉴도 못 본다" 로 읽힌다 — 실제로는 역할 기본값이 보인다.
   * ★ **계정별 설정이 역할 기본값을 이긴다**(서버 확인). 역할이 빼 둔 메뉴도 체크해 저장하면 보인다.
   */
  defaults?: MenuNode[]
}

export function getAccountMenus(accountId: number): Promise<AccountMenus> {
  return request<AccountMenus>(`/api/v1/admin/staff/accounts/${accountId}/menus`)
}

/**
 * 계정의 메뉴 노출 설정.
 *
 * ★ **`restricted` 를 반드시 함께 보낸다 — 빠지면 400이다**(2026-10-12 서버 변경).
 *   전에는 **빈 배열이 「제한 해제」**였고, 그래서 「아무것도 못 보게」를 표현할 방법이
 *   없었다. 담당자가 전부 해제하고 저장하면 **정반대로 전부 열렸다.** 두 뜻을 한 값에
 *   겹쳐 놨던 것이 원인이라 서버가 축을 갈랐다.
 *
 *   ```
 *   { restricted: false, menuCodes: [] }      개별 설정 삭제 → 역할 기본값
 *   { restricted: true,  menuCodes: [...] }   그 메뉴만
 *   { restricted: true,  menuCodes: [] }      400 — 계정 정지로 처리할 일이다
 *   ```
 *
 * ★ **통째로 보낸다.** 더하기·빼기가 아니라 교체다 — 보낸 목록이 곧 전부다.
 * ★ **부모 코드를 준다고 자식이 열리지 않는다.** 각 코드가 독립이라 부모를 체크하면
 *   자식까지 함께 실어 보내야 한다(`parentCode` 로 묶는다) — 서버가 자동으로 포함하면
 *   "수납현황만 보여주려 했는데 청구기준 편집까지 열리는" 것을 막을 수 없다.
 * ★ 최고관리자만 호출된다.
 */
/**
 * 저장하면 **실제로 어떻게 열리는지** 미리 본다 — 본문은 `setAccountMenus` 와 같다.
 *
 * ★★ **결과 계산을 화면이 하지 않는다.** 규칙이 두 곳에 생기면 또 어긋난다 —
 *   2026-10-14 담임 시간표 사고(메뉴는 열렸는데 교시·강의실 API 가 403)가 그래서 났다.
 *   알림톡 수동 발송이 같은 구조이고(`previewManualSend`), 거기서는 「미리보기와 실제가
 *   다른」 문제가 한 번도 없었다.
 *
 * ★ **저장하지 않으므로 체크마다 불러도 된다.** 다만 메뉴가 40개가 넘어 매 클릭마다
 *   보내면 요청이 쏟아진다 — 화면이 **체크가 멈춘 뒤 한 번** 보낸다.
 *
 * ★ **전 메뉴가 온다**(46개). 체크한 것만 오는 게 아니라, 안 체크한 것도 `visible: false`
 *   로 와서 **표를 그대로 그릴 수 있다.**
 *
 * ⚠️ **`level` 을 「안 열린다」로 읽지 않는다.** API 권한이 컨트롤러마다 흩어져 있어
 *   **서버도 「어느 화면이 어느 역할에 열리는가」를 목록으로 들고 있지 않다** — 근거는
 *   역할 기본 노출이고 둘을 손으로 맞춰 왔다. 그래서 `PARTIAL` 은 **「확인이 필요하다」**다.
 *   화면은 `note` 를 **그대로** 쓴다 — 우리가 말을 바꾸면 서버가 사실을 고쳐도 화면만 낡는다.
 */
export interface MenuPreviewRow {
  code: string
  name: string
  /** 그 계정 메뉴에 나오는가 */
  visible: boolean
  /** FULL = 전부 열린다 · PARTIAL = 막힐 수 있다(위 주석 참고) */
  level: 'FULL' | 'PARTIAL' | string
  /** 왜 그런지. ★ 서버 문장을 그대로 보여준다 */
  note: string | null
}

export function previewAccountMenus(
  accountId: number,
  restricted: boolean,
  menuCodes: string[],
): Promise<MenuPreviewRow[]> {
  return request<MenuPreviewRow[]>(`/api/v1/admin/staff/accounts/${accountId}/menus/preview`, {
    method: 'POST',
    body: { restricted, menuCodes },
  })
}

export function setAccountMenus(
  accountId: number,
  restricted: boolean,
  menuCodes: string[],
): Promise<AccountMenus> {
  return request<AccountMenus>(`/api/v1/admin/staff/accounts/${accountId}/menus`, {
    method: 'PUT',
    body: { restricted, menuCodes },
  })
}

/* ── 자주 쓰는 메뉴 (대시보드 좌측) ─────────────────────────────
 *
 * ★ 노출 설정과 **다른 개념이다.** 저건 최고관리자가 정하는 권한이고 이건 본인이 고르는
 *   편의다. 비어 있으면 아직 안 고른 것이지 "볼 게 없다" 가 아니다.
 * ★ **보낸 순서가 화면 순서**이고 통째로 교체다. 최대 8개.
 * ★ 볼 수 없는 메뉴는 서버가 안 담는다 — 눌렀을 때 403 이 나는 칸을 대시보드에 두지 않는다.
 */

export function listMyFavorites(): Promise<MenuNode[]> {
  return request<MenuNode[]>('/api/v1/admin/menus/favorites')
}

export function saveMyFavorites(menuCodes: string[]): Promise<MenuNode[]> {
  return request<MenuNode[]>('/api/v1/admin/menus/favorites', { method: 'PUT', body: { menuCodes } })
}
