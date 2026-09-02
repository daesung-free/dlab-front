import { Navigate, Route, Routes } from 'react-router-dom'
import { AcademyProvider } from './auth/AcademyContext'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { AppLayout } from './layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { GroupPage } from './pages/GroupPage'
import { ScreenPage } from './pages/ScreenPage'
import { SpecHub } from './pages/SpecHub'
import { SpecPage } from './pages/SpecPage'

export default function App() {
  return (
    <AuthProvider>
      <AcademyProvider>
        <Gate />
      </AcademyProvider>
    </AuthProvider>
  )
}

/**
 * 로그인 전에는 화면을 그리지 않는다.
 *
 * ★ 토큰이 없으면 모든 API가 401이라, 목록만 빈 채로 보여주면 "데이터가 없는 것"과
 *   "로그인이 풀린 것"이 구분되지 않는다. 토큰이 만료돼 client.ts가 지우면
 *   AuthContext가 그것을 구독하고 있어 여기로 자동으로 되돌아온다.
 *
 * ⚠️ 아직 실연동된 화면은 학원생 검색 하나뿐이고 나머지 35개는 목업이다.
 *   그래도 게이트를 전체에 거는 이유는, 화면마다 로그인 필요 여부가 갈리면
 *   "이 화면은 왜 안 보이지"를 매번 따져야 하기 때문이다.
 */
function Gate() {
  const { signedIn } = useAuth()
  if (!signedIn) return <LoginPage />

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
