import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { decodePrincipal, getMe, login as loginApi, logout as logoutApi, type Me, type Principal } from '../api/auth'
import { getAccessToken, subscribeTokens } from '../api/tokens'
import { setReadOnlyMode } from '../api/client'

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
      .then((v) => alive && setMe(v))
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

  const value = useMemo<AuthState>(() => {
    const principal = decodePrincipal(token)
    const roles = me?.roles ?? principal?.roles ?? []
    // 역할을 여러 개 가질 수 있다 — READONLY **만** 있을 때가 조회 전용이다.
    // 하나라도 다른 역할이 섞이면 그쪽 권한으로 쓰기가 가능하다
    const readOnly = roles.length > 0 && roles.every((r) => r === 'READONLY')
    return { principal, me, signedIn: principal !== null, readOnly, login, logout }
  }, [token, me, login, logout])

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
