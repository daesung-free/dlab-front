import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './layout/AppLayout'
import { Home } from './pages/Home'
import { GroupPage } from './pages/GroupPage'
import { ScreenPage } from './pages/ScreenPage'

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Home />} />
        <Route path="g/:groupId" element={<GroupPage />} />
        <Route path="s/:screenId" element={<ScreenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
