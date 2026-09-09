import { request } from './client'
import { clearTokens, setLoginId, setTokens } from './tokens'

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
  // 헤더에 쓸 표시용. 서버가 이름을 안 준다(tokens.ts 주석)
  setLoginId(loginId)
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

/**
 * 로그인한 사람 — `GET /api/v1/admin/auth/me`
 *
 * ★ 이걸 부르기 전에는 헤더에 로그인 아이디를 그대로 띄웠다("안녕하세요, admin님").
 *   이름을 주는 경로가 어디에도 없었기 때문이다 — JWT 클레임은 sub·rol·all·aid·pcr 뿐이고,
 *   `GET /app/me` 는 "학생·학부모 계정만 이용할 수 있습니다"로 403,
 *   `GET /staff/accounts` 는 **TEACHER·STAFF·READONLY 에 403**이라 자기 이름조차 못 읽었다.
 *
 * ★ **배포 서버에는 아직 없다(404).** 로컬 백엔드에만 들어와 있어서, 호출부는 실패를
 *   정상 흐름으로 다뤄야 한다 — 실패하면 화면이 로그인 아이디로 되돌아간다.
 */
export interface Me {
  accountId: number
  loginId: string
  name: string
  accountType: string
  roles: string[]
  academyId: number | null
  academyName: string | null
  mustChangePassword: boolean
}

export function getMe(): Promise<Me> {
  return request<Me>('/api/v1/admin/auth/me')
}
