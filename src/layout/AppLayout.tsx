import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { TopNav } from './TopNav'
import { SideNav } from './SideNav'
import './layout.css'

export function AppLayout() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <>
      <TopNav />
      <div className="wrap">
        <SideNav />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </>
  )
}
