import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { GroupPage } from './pages/GroupPage'
import { ScreenPage } from './pages/ScreenPage'
import { SpecHub } from './pages/SpecHub'
import { SpecPage } from './pages/SpecPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 제품 화면 */}
        <Route index element={<Dashboard />} />
        <Route path="g/:groupId" element={<GroupPage />} />
        <Route path="s/:screenId" element={<ScreenPage />} />

        {/* 내부용 — 요구사항 명세 뷰. 제품 내비게이션에는 노출하지 않는다 */}
        <Route path="spec" element={<SpecHub />} />
        <Route path="spec/:screenId" element={<SpecPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
