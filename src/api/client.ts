import type { ApiEnvelope, Paged, SpringPage } from './types'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, '')

/** 서버가 내려준 실패를 그대로 들고 있는 에러. 화면은 code로 분기하고 message를 그대로 보여준다. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export type Query = Record<string, string | number | boolean | undefined | null>

interface RequestOptions {
  method?: string
  query?: Query
  /**
   * 같은 키를 여러 번 붙이는 파라미터. 다중 정렬이 `?sort=grade,asc&sort=name,asc` 형태다 —
   * URLSearchParams.set 은 덮어쓰므로 append 로 따로 처리한다.
   */
  repeatable?: Record<string, string | string[] | undefined>
  body?: unknown
  /** 로그인·재발급처럼 토큰을 붙이면 안 되는(또는 붙일 수 없는) 요청 */
  anonymous?: boolean
}

function buildUrl(path: string, query?: Query, repeatable?: RequestOptions['repeatable']): string {
  const url = new URL(BASE_URL + path)
  for (const [k, v] of Object.entries(query ?? {})) {
    // 빈 값은 조건에서 아예 빼야 한다 — 백엔드가 ''를 "빈 문자열로 검색"으로 받는 조건이 있다
    if (v === undefined || v === null || v === '') continue
    url.searchParams.set(k, String(v))
  }
  for (const [k, v] of Object.entries(repeatable ?? {})) {
    for (const one of Array.isArray(v) ? v : [v]) {
      if (one === undefined || one === null || one === '') continue
      url.searchParams.append(k, one)
    }
  }
  return url.toString()
}

/**
 * 액세스 토큰 재발급.
 *
 * ★ 동시에 여러 요청이 401을 받으면 재발급도 그만큼 날아간다. 백엔드는 Refresh Token을
 *   Redis에서 회전시키므로 두 번째 재발급이 이미 폐기된 토큰을 들고 가 실패한다.
 *   그래서 진행 중인 재발급 Promise를 공유한다.
 */
let refreshing: Promise<boolean> | null = null

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) return false

  refreshing ??= (async () => {
    try {
      const res = await fetch(buildUrl('/api/v1/admin/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      const json = (await res.json()) as ApiEnvelope<{ accessToken: string; refreshToken: string }>
      if (!res.ok || !json.success || !json.data) return false
      setTokens(json.data.accessToken, json.data.refreshToken)
      return true
    } catch {
      return false
    } finally {
      refreshing = null
    }
  })()

  return refreshing
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const token = opts.anonymous ? null : getAccessToken()
  return fetch(buildUrl(path, opts.query, opts.repeatable), {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  })
}

/** 봉투(success/data/meta/error)를 통째로 돌려준다. meta가 필요한 목록 조회가 쓴다. */
export async function requestEnvelope<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  let res: Response
  try {
    res = await send(path, opts)
  } catch {
    // fetch 자체가 실패 — 서버가 안 떠 있거나 CORS에 막혔다.
    // CORS는 브라우저가 응답을 안 넘겨줘서 여기서 구분이 안 된다(콘솔에만 보인다).
    throw new ApiError(0, 'NETWORK', 'API 서버에 연결할 수 없습니다. 백엔드(:8080) 기동 상태와 CORS 허용 origin을 확인하세요.')
  }

  if (res.status === 401 && !opts.anonymous && (await refreshTokens())) {
    res = await send(path, opts)
  }

  // 204 등 본문 없는 성공
  if (res.status === 204) return { success: true }

  let json: ApiEnvelope<T>
  try {
    json = (await res.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(res.status, 'MALFORMED_RESPONSE', `서버 응답을 해석할 수 없습니다 (HTTP ${res.status}).`)
  }

  if (!res.ok || !json.success) {
    if (res.status === 401) clearTokens()
    throw new ApiError(res.status, json.error?.code ?? 'UNKNOWN', json.error?.message ?? `요청이 실패했습니다 (HTTP ${res.status}).`)
  }

  return json
}

/** 성공 시 data만 돌려주고, 실패는 ApiError로 던진다. 401이면 한 번 재발급하고 재시도한다. */
export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestEnvelope<T>(path, opts)).data as T
}

/**
 * 목록 응답 두 형태를 Paged 하나로 맞춘다(types.ts 주석 참고).
 * 어느 쪽이 오든 화면 코드는 바뀌지 않게 하는 것이 목적이다.
 */
export async function requestPaged<T>(path: string, opts: RequestOptions = {}): Promise<Paged<T>> {
  const envelope = await requestEnvelope<SpringPage<T> | T[]>(path, opts)
  const data = envelope.data

  if (data === undefined || data === null) {
    return { rows: [], page: 0, size: 0, totalElements: 0, totalPages: 0 }
  }

  if (Array.isArray(data)) {
    // (1) data: [...] + meta 형태
    const meta = envelope.meta
    return {
      rows: data,
      page: meta?.page ?? 0,
      size: meta?.size ?? data.length,
      totalElements: meta?.totalElements ?? data.length,
      totalPages: meta?.totalPages ?? 1,
    }
  }

  return {
    rows: data.content,
    page: data.number,
    size: data.size,
    totalElements: data.totalElements,
    totalPages: data.totalPages,
  }
}
