import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import type { Paged } from '../../api/types'
import type { ServerPaging } from './DataTable'

/**
 * 서버 목록 조회의 반복 부분을 한곳에 모은다.
 *
 * 화면마다 다시 짜면 반드시 셋 중 하나를 빠뜨린다:
 *   · 조건을 바꿨는데 페이지가 3에 남아 빈 목록이 나온다
 *   · 느린 응답이 뒤늦게 도착해 최신 조건의 결과를 덮어쓴다
 *   · 로딩 중에 이전 결과가 사라져 화면이 깜빡인다(여기서는 이전 rows를 유지한다)
 *
 * 화면이 할 일은 `params`를 useMemo로 만들어 넘기는 것뿐이다.
 *
 * @example
 * const params = useMemo(() => ({ keyword, academyId }), [keyword, academyId])
 * const table = useServerTable({ fetcher: searchStudents, params, sortable: SORTABLE })
 * <DataTable rows={table.rows} serverPaging={table.serverPaging} loading={table.loading} … />
 */
interface Options<TRow, TParams extends object> {
  /** 목록을 가져오는 함수. `src/api/*`의 도메인 모듈을 그대로 넘긴다 */
  fetcher: (params: TParams & { page: number; size: number; sort?: string }) => Promise<Paged<TRow>>
  /** 검색 조건. **반드시 useMemo로 감싼다** — 매 렌더 새 객체면 무한 요청이 된다 */
  params: TParams
  pageSize?: number
  /**
   * 서버가 받아주는 정렬 키. 목록에 없는 키는 서버가 **400이 아니라 조용히 무시**하므로
   * 여기서 걸러 화면에 정렬 UI 자체를 안 띄운다.
   * 주지 않으면 정렬을 쓰지 않는 화면으로 본다.
   */
  sortable?: readonly string[]
  /** false면 호출하지 않는다. 지점을 아직 못 고른 상태 등 */
  enabled?: boolean
}

interface Result<TRow> {
  rows: TRow[]
  totalElements: number
  loading: boolean
  error: string | null
  /** DataTable에 그대로 넘긴다 */
  serverPaging: ServerPaging
  /** 쓰기 후 목록을 다시 읽을 때 */
  reload: () => void
}

export function useServerTable<TRow, TParams extends object>({
  fetcher,
  params,
  pageSize = 20,
  sortable,
  enabled = true,
}: Options<TRow, TParams>): Result<TRow> {
  const [page, setPage] = useState(0)
  const [sort, setSort] = useState<string | undefined>(undefined)
  const [result, setResult] = useState<Paged<TRow> | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  // 조건이나 정렬이 바뀌면 1페이지로 돌아간다.
  // 첫 렌더에서도 돌지만 이미 0이라 요청이 늘지는 않는다.
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    setPage(0)
  }, [params, sort])

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetcher({ ...params, page, size: pageSize, sort })
      .then((res) => {
        if (!cancelled) setResult(res)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 401은 client.ts가 토큰을 지우고 AuthContext가 로그인 화면으로 되돌린다.
        // 여기서 따로 처리하면 사라질 화면에 에러만 잠깐 비친다.
        setError(err instanceof ApiError ? err.message : '목록을 불러오지 못했습니다.')
        setResult(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [fetcher, params, page, pageSize, sort, enabled, nonce])

  const onSortChange = useCallback(
    (key: string, dir: 'asc' | 'desc') => setSort(`${key},${dir}`),
    [],
  )

  const serverPaging = useMemo<ServerPaging>(
    () => ({
      page: result?.page ?? 0,
      totalPages: result?.totalPages ?? 0,
      totalElements: result?.totalElements ?? 0,
      onPageChange: setPage,
      // sortable을 안 준 화면은 정렬 헤더가 뜨지 않는다(DataTable이 판단)
      onSortChange: sortable && sortable.length > 0 ? onSortChange : undefined,
    }),
    [result, sortable, onSortChange],
  )

  return {
    rows: result?.rows ?? [],
    totalElements: result?.totalElements ?? 0,
    loading,
    error,
    serverPaging,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  }
}
