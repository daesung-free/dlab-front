import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { TopNav } from './TopNav'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import { SideNav } from './SideNav'
import './layout.css'

export function AppLayout() {
  const { pathname } = useLocation()
  const { readOnly } = useAuth()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    /* ★ 조회 전용이면 뿌리에 표시를 남긴다. 쓰기 버튼이 188개라 하나씩 잠그면 반드시
       빠뜨리므로, 실제 차단은 API 클라이언트가 하고(client.ts) 여기서는 **보이게** 한다 */
    <div data-readonly={readOnly ? 'true' : undefined}>
      <TopNav />
      {readOnly && (
        <div className="readonly-bar">
          <Icon name="eye" size={14} />
          <b>조회 전용 계정입니다</b> — 등록·수정·삭제는 되지 않습니다. 버튼이 눌려도 저장되지 않습니다.
        </div>
      )}
      <div className="wrap">
        <SideNav />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
