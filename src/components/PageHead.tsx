import type { ReactNode } from 'react'
import { Icon } from './Icon'

interface Props {
  /** 상단 경로 표시 */
  crumb: ReactNode
  title: ReactNode
  /** 제목 왼쪽 아이콘 (시안의 민트 라운드 배지) */
  icon?: string
  sub?: ReactNode
  /** 우측 상단 버튼 영역 */
  actions?: ReactNode
}

/** 모든 페이지가 공유하는 헤더. 시안의 .topbar / .m-head를 하나로 합친 것 */
export function PageHead({ crumb, title, icon, sub, actions }: Props) {
  return (
    <div className="m-head">
      <div className="m-head-row">
        <div>
          <div className="crumb">{crumb}</div>
          <h1>
            {icon && (
              <span className="hico">
                <Icon name={icon} size={19} />
              </span>
            )}
            {title}
          </h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {actions && <div className="m-actions">{actions}</div>}
      </div>
    </div>
  )
}
