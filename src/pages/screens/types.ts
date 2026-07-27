import type { ComponentType, ReactNode } from 'react'

/** 개별 화면 목업. ScreenPage가 헤더·탭을 그리고 Content만 끼워 넣는다. */
export interface Mockup {
  Content: ComponentType
  /** 페이지 헤더 우측 액션 버튼들 */
  actions?: ReactNode
}
