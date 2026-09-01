import { request } from './client'
import { clearTokens, setTokens } from './tokens'

export interface AuthResponse {
  accessToken: string
  refreshToken: string
  tokenType: string
  /** 임시 비밀번호 상태. true면 비밀번호를 바꾸기 전까지 서버가 다른 API를 막는다. */
  mustChangePassword: boolean
}

/**
 * 액세스 토큰(JWT) 안에 들어 있는 것들. 서버가 서명한 값이라 화면 표시용으로만 쓴다 —
 * 권한 판단은 서버가 한다(@PreAuthorize). 여기서 막는 것은 UI 편의일 뿐이다.
 */
export interface Principal {
  accountId: string
  roles: string[]
  /** 지점 스코프. 전 지점 권한이면 true */
  allAcademy: boolean
  academyId: number | null
  mustChangePassword: boolean
}

export async function login(loginId: string, password: string): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/api/v1/admin/auth/login', {
    method: 'POST',
    body: { loginId, password },
    anonymous: true,
  })
  setTokens(res.accessToken, res.refreshToken)
  return res
}

export async function logout(): Promise<void> {
  try {
    await request<void>('/api/v1/admin/auth/logout', { method: 'POST' })
  } finally {
    // 서버가 실패해도 이 브라우저에서는 반드시 지운다.
    // (서버 블랙리스트에 못 올리면 그 토큰은 만료까지 유효하다 — 서버 로그로 확인할 것)
    clearTokens()
  }
}

/**
 * JWT payload를 읽는다. 서명 검증은 하지 않는다 — 서버가 매 요청에서 검증하므로
 * 여기서 하는 것은 의미가 없고, 잘못된 토큰이면 첫 API 호출이 401로 걸러진다.
 */
export function decodePrincipal(token: string | null): Principal | null {
  if (!token) return null
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      ),
    ) as { sub?: string; rol?: string[]; all?: boolean; aid?: number; pcr?: boolean }

    return {
      accountId: json.sub ?? '',
      roles: json.rol ?? [],
      allAcademy: json.all === true,
      academyId: json.aid ?? null,
      mustChangePassword: json.pcr === true,
    }
  } catch {
    return null
  }
}
