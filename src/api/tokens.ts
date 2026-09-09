/* 토큰 보관.
 *
 * ★ localStorage에 둔다 — 새로고침·탭 이동에도 로그인이 유지돼야 하고, 지금 백엔드는
 *   토큰을 응답 본문으로만 내려주기 때문에(HttpOnly 쿠키를 쓰지 않는다) 선택지가 없다.
 *   XSS가 나면 토큰이 그대로 털리는 구조이므로, 운영 전환 시 쿠키 방식으로 바꿀지
 *   백엔드와 같이 정해야 한다. (access 1h / refresh 7d — application.yml)
 */

const ACCESS_KEY = 'dlab.accessToken'
const REFRESH_KEY = 'dlab.refreshToken'

/** 다른 탭에서 로그아웃했을 때 이 탭도 따라가도록, 변경을 구독할 수 있게 해둔다. */
type Listener = () => void
const listeners = new Set<Listener>()

export function subscribeTokens(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function notify(): void {
  for (const fn of listeners) fn()
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  notify()
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  notify()
}

/** 다른 탭의 로그인/로그아웃을 따라간다. */
window.addEventListener('storage', (e) => {
  if (e.key === ACCESS_KEY || e.key === REFRESH_KEY) notify()
})

/* ── 로그인 아이디 ────────────────────────────────────────────────────────────
 *
 * ★ 서버가 표시할 이름을 어디서도 주지 않는다. JWT 클레임은 sub·rol·all·aid·pcr 뿐이고
 *   로그인 응답도 mustChangePassword 하나다. 그래서 **입력받은 아이디를 보관해 헤더에 쓴다.**
 *
 * ★ 이름을 쓰려면 GET /staff/accounts 를 따로 불러야 하는데, 권한이 낮은 계정
 *   (TEACHER·STAFF)은 그 목록을 못 볼 수 있어 헤더가 통째로 비는 위험이 있다.
 *   아이디는 항상 있다.
 */
const LOGIN_ID_KEY = 'dlab.loginId'

export function setLoginId(loginId: string): void {
  localStorage.setItem(LOGIN_ID_KEY, loginId)
}

export function getLoginId(): string | null {
  return localStorage.getItem(LOGIN_ID_KEY)
}
