import type { ComponentType, ReactNode } from 'react'

/** 개별 화면 목업. ScreenPage가 헤더·탭을 그리고 Content만 끼워 넣는다. */
export interface Mockup {
  Content: ComponentType
  /** 페이지 헤더 우측 액션 버튼들 */
  actions?: ReactNode
  /**
   * 전 지점을 한 화면에 그리는가.
   *
   * ★ `ScreenPage` 는 지점을 안 고른 전 지점 권한 계정에게 "위에서 지점을 먼저 고르세요"
   *   를 띄운다. 대부분의 화면이 지점을 안 고르면 조회를 시작하지 않아서다. 그런데
   *   지점 목록 자체를 그리는 화면(급식 업체 배정)은 **고를 필요가 없다** — 그대로 두면
   *   멀쩡히 11개 지점이 다 보이는데 위에는 "아직 조회 안 했다"고 적혀 있게 된다.
   */
  allBranches?: boolean
}
