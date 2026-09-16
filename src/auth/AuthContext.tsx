import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { decodePrincipal, getMe, login as loginApi, logout as logoutApi, type Me, type Principal } from '../api/auth'
import { getAccessToken, setDisplayName, subscribeTokens } from '../api/tokens'
import { setReadOnlyMode } from '../api/client'
import { listMyMenus } from '../api/menus'

interface AuthState {
  principal: Principal | null
  /**
   * 로그인한 사람의 이름·소속. **없을 수 있다** — 배포 서버에 `GET /auth/me` 가 아직
   * 없어서(404) 그 경우 null 이다. 화면은 null 을 로그인 아이디로 대신한다.
   */
  me: Me | null
  signedIn: boolean
  /**
   * 조회 전용 계정인가 — READONLY 만 가진 계정.
   *
   * ★ 다른 역할 판정은 **권한 매트릭스가 확정돼야** 할 수 있다. READONLY 만은 정의가
   *   "읽기만"이라 따로 정할 것이 없어서 지금 구현한다.
   */
  readOnly: boolean
  login: (loginId: string, password: string) => Promise<void>
  logout: () => Promise<void>
  /**
   * 「관리자」 메뉴를 볼 수 있는가.
   *
   * ★ 메뉴에서 감추는 것만으로는 부족하다 — **주소를 직접 치면 그대로 열린다.** 실제로
   *   viewer1 으로 /g/admin 이 보였다. 라우트에서도 같은 판단을 써야 해서 여기에 둔다.
   * ★ 여기까지만 막는다. 담임이 상벌점을 줄 수 있는지 같은 것은 권한 매트릭스가 없어
   *   정할 수 없다 — 서버는 이미 403 으로 막고 있다.
   */
  canSeeAdmin: boolean
  /**
   * 이 계정이 볼 수 있는 메뉴 코드. **`null` 이면 아직 못 읽었다**는 뜻이고
   * 빈 Set 이면 제한 없음이다(서버가 설정 없는 계정에 전체를 내려준다).
   *
   * ★ `null` 과 빈 Set 을 같게 다루면 **읽는 동안 메뉴가 깜빡였다가 나타난다.**
   *   둘 다 "다 보여준다" 로 처리해 그 깜빡임을 없앤다 — 숨기는 쪽으로 기울면
   *   로그인 직후 메뉴가 통째로 사라져 보인다.
   */
  allowedMenus: Set<string> | null
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  // 토큰이 진실의 원천이다. 상태는 그 사본일 뿐이라, 토큰이 바뀌면(재발급·다른 탭 로그아웃)
  // 구독으로 따라간다 — 그래야 401 이후 화면이 로그인으로 자동으로 돌아간다.
  const [token, setToken] = useState<string | null>(() => getAccessToken())

  useEffect(() => subscribeTokens(() => setToken(getAccessToken())), [])

  /* 이름은 토큰에 없어서 따로 받아온다(api/auth.ts getMe 주석).
     ★ 실패를 정상 흐름으로 다룬다 — 없는 서버에서는 404 다. 여기서 던지면 로그인 직후
       화면 전체가 죽는다. */
  const [me, setMe] = useState<Me | null>(null)
  useEffect(() => {
    if (!token) {
      setMe(null)
      return
    }
    let alive = true
    getMe()
      .then((v) => {
        if (!alive) return
        setMe(v)
        // 다음 새로고침에서 아이디 → 이름으로 깜빡이지 않게 남겨둔다
        if (v.name) setDisplayName(v.name)
      })
      .catch(() => alive && setMe(null))
    return () => {
      alive = false
    }
  }, [token])

  const login = useCallback(async (loginId: string, password: string) => {
    await loginApi(loginId, password)
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
  }, [])

  /* 계정별 메뉴 노출. 로그인해야 부를 수 있으므로 토큰이 생긴 뒤에 읽는다 */
  /** null = 아직 못 읽음. 빈 Set = 제한 없음. 이 둘을 섞으면 첫 렌더에 403 을 부른다 */
  const [allowedMenus, setAllowedMenus] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (token === null) {
      setAllowedMenus(null)
      return
    }
    let alive = true
    listMyMenus()
      .then((list) => alive && setAllowedMenus(new Set(list.map((m) => m.code))))
      /* 못 읽으면 **막지 않는다.** 여기서 실패했다고 메뉴를 감추면 서버 문제로
         아무것도 못 쓰게 된다 — 서버가 API 단에서 이미 403 으로 막는다.
         ★ null 이 아니라 **빈 Set**(= 제한 없음)으로 끝낸다. null 을 "아직 안 읽음" 으로만
           쓰기 위해서다 — 요약 패널이 그 값을 보고 호출을 미루는데, 실패해도 null 로 두면
           영영 안 부른다 */
      .catch(() => alive && setAllowedMenus(new Set<string>()))
    return () => {
      alive = false
    }
  }, [token])

  const value = useMemo<AuthState>(() => {
    const principal = decodePrincipal(token)
    const roles = me?.roles ?? principal?.roles ?? []
    // 역할을 여러 개 가질 수 있다 — READONLY **만** 있을 때가 조회 전용이다.
    // 하나라도 다른 역할이 섞이면 그쪽 권한으로 쓰기가 가능하다
    const readOnly = roles.length > 0 && roles.every((r) => r === 'READONLY')
    const canSeeAdmin = roles.some((r) => r === 'SUPER_ADMIN' || r === 'BRANCH_ADMIN')
    return { principal, me, signedIn: principal !== null, readOnly, canSeeAdmin, allowedMenus, login, logout }
  }, [token, me, allowedMenus, login, logout])

  /* API 클라이언트에도 알려준다 — 쓰기를 **보내기 전에** 막기 위해서다.
     쓰기 버튼이 188개라 화면마다 막으면 반드시 빠뜨린다(client.ts 주석 참고) */
  useEffect(() => {
    setReadOnlyMode(value.readOnly)
  }, [value.readOnly])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth는 AuthProvider 안에서만 쓸 수 있습니다.')
  return ctx
}
