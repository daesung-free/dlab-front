import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'

/**
 * **서버 페이징이 없는** 조회의 반복 부분을 모은다.
 *
 * ★ `useServerTable` 과 언제 갈리는가
 *   · 서버가 페이지로 잘라주면(`page`·`size`·`sort` 를 받으면) → `useServerTable`
 *   · 서버가 조회 결과를 **통째로** 주면(출결·사유신청·상벌점·상담·루틴) → 이것
 *
 *   비페이징 응답에 `useServerTable` 을 쓰면 `serverPaging.totalPages` 가 1로 고정된다.
 *   그러면 `DataTable` 이 "이미 서버가 잘라줬다"고 믿어 rows 를 안 자르고, 페이저와
 *   정렬 헤더가 통째로 사라진다. 200명짜리 지점이면 한 화면에 200줄이 그대로 쏟아진다.
 *
 * ★ 그래서 이 훅을 쓰는 화면은 `DataTable` 에 `serverPaging` 을 **넘기지 않는다.**
 *   그러면 `DataTable` 이 원래 갖고 있는 클라이언트 페이징·정렬이 켜진다. 전량이 손에
 *   있으므로 클라이언트 정렬이 "한 페이지만 정렬해놓고 전체인 척"하는 문제는 없다.
 *
 * ★ **서버 페이징이 열리는 순간 그 전제가 깨진다.** 그때는 해당 화면을 `useServerTable` 로
 *   옮겨야 한다 — 조용히 틀린 목록이 되므로 눈치채기 어렵다. 2026-09-02 기준 백엔드 회신:
 *   · 출결(`/attendance`) — **안 연다.** 재원생 전원을 주는 것이 목적이라 확정이다
 *   · 상벌점·사유신청 — **연다. 다만 백엔드가 넣고 알린 뒤에 옮긴다** —
 *     먼저 옮기면 응답에 meta 가 없어 목록이 통째로 빈다
 *   · 페이징 후에도 `summary` 는 페이지 합계가 아니라 필터 전체 기준을 유지한다
 *
 * ★ `useServerTable` 과 똑같이, 화면마다 `useEffect` 로 다시 짜면 반드시 빠뜨린다:
 *   · 느린 응답이 뒤늦게 도착해 최신 조건의 결과를 덮어쓴다
 *   · 지점을 아직 못 고른 상태에서 호출해 400을 받고 "데이터 없음"처럼 보인다
 *   · 로딩 중에 이전 결과가 사라져 화면이 깜빡인다(여기서는 이전 data 를 유지한다)
 *
 * @example
 * const params = useMemo(() => ({ academyId, date }), [academyId, date])
 * const board = useServerData({ fetcher: fetchAttendanceBoard, params, enabled: academyId !== null })
 * <DataTable rows={board.data?.rows ?? []} loading={board.loading} pageSize={15} … />
 */
interface Options<TData, TParams extends object> {
  /** 조회 함수. `src/api/*` 의 도메인 모듈을 그대로 넘긴다 */
  fetcher: (params: TParams) => Promise<TData>
  /** 조회 조건. **반드시 useMemo 로 감싼다** — 매 렌더 새 객체면 무한 요청이 된다 */
  params: TParams
  /** false 면 호출하지 않는다. 지점을 아직 못 고른 상태 등 */
  enabled?: boolean
  /** 실패했을 때 화면에 띄울 문구. 서버가 이유를 주면 그쪽을 우선한다 */
  errorMessage?: string
}

interface Result<TData> {
  /** 아직 한 번도 못 받았으면 null. 다시 부르는 동안에는 **이전 값이 남는다** */
  data: TData | null
  loading: boolean
  error: string | null
  /** 쓰기(승인·부여 등) 후 다시 읽을 때 */
  reload: () => void
}

export function useServerData<TData, TParams extends object>({
  fetcher,
  params,
  enabled = true,
  errorMessage = '목록을 불러오지 못했습니다.',
}: Options<TData, TParams>): Result<TData> {
  const [data, setData] = useState<TData | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  /**
   * ★ fetcher·errorMessage 는 의존성에서 뺀다.
   *
   * 호출부가 `fetcher={({ year }) => listClasses(year)}` 처럼 **인라인 함수**를 넘기면
   * 매 렌더 새 참조가 되고, 그것이 의존성에 있으면 effect → setState → 리렌더 →
   * 새 fetcher → effect … 로 **무한 요청**이 된다. (실제로 이 훅을 처음 붙였을 때
   * 8초에 4317건이 나갔다. 콘솔 에러도 안 나고 화면도 멀쩡해 보인다.)
   *
   * 다시 부를지는 **params·enabled·reload 만** 결정한다. 그 편이 호출부가
   * 함수를 어떻게 만들든 안전하다.
   */
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const messageRef = useRef(errorMessage)
  messageRef.current = errorMessage

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    fetcherRef.current(params)
      .then((res) => {
        if (!cancelled) setData(res)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 401은 client.ts 가 토큰을 지우고 AuthContext 가 로그인 화면으로 되돌린다.
        // 여기서 따로 처리하면 사라질 화면에 에러만 잠깐 비친다.
        setError(err instanceof ApiError ? err.message : messageRef.current)
        setData(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // fetcher·errorMessage 를 뺀 것은 의도다 — 위 ref 주석 참고
  }, [params, enabled, nonce])

  return {
    data,
    loading,
    error,
    reload: useCallback(() => setNonce((n) => n + 1), []),
  }
}
