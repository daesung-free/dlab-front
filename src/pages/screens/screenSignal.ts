import { useSyncExternalStore } from 'react'

/**
 * 헤더 액션 ↔ 본문 사이의 작은 신호.
 *
 * ★ `Mockup.actions` 는 `ScreenPage` 가 **본문(`Content`)과 따로 렌더한다.** 같은 화면인데
 *   부모가 달라 props 로 내릴 자리가 없다. 그래서 헤더에서 뭘 만들어도 본문 목록이
 *   그대로 남는다 — 상벌점 항목을 추가한 직후 부여 드롭다운에 안 보이던 것이 그 경우다.
 *
 * ★ 화면마다 따로 짜다 세 번째가 되어 공용으로 뺐다. **화면당 하나씩 만든다** —
 *   전역 하나를 나눠 쓰면 남의 화면 갱신까지 끌려온다.
 *
 * ```ts
 * const classes = createScreenSignal()      // 모듈 최상위
 * classes.bump()                            // 헤더에서 만들고 나서
 * const v = classes.useVersion()            // 본문에서 구독
 * useEffect(() => { if (v > 0) void reload() }, [v, reload])
 * ```
 *
 * ★ 첫 렌더의 `0` 은 건너뛴다. 방금 읽은 것을 한 번 더 읽을 이유가 없다.
 */
export function createScreenSignal() {
  let version = 0
  const listeners = new Set<() => void>()

  return {
    bump(): void {
      version += 1
      for (const fn of listeners) fn()
    },
    useVersion(): number {
      return useSyncExternalStore(
        (cb) => {
          listeners.add(cb)
          return () => {
            listeners.delete(cb)
          }
        },
        () => version,
      )
    },
  }
}
