import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AcademyProvider } from './auth/AcademyContext'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { LoginPage } from './auth/LoginPage'
import { AppLayout } from './layout/AppLayout'
import { Dashboard } from './pages/Dashboard'
import { GroupPage } from './pages/GroupPage'
import { ScreenPage } from './pages/ScreenPage'
import { InternalSpecRoutes } from './pages/internal/SpecRoutes'

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
  const { pathname } = useLocation()

  if (!signedIn) {
    /* ★ 로그인 화면을 **그 자리에 그리기만 하면** 주소가 그대로 남는다. 그러면
     *   A 화면에서 로그아웃하고 다른 계정으로 들어왔을 때 그 A 화면이 다시 열린다.
     *   앞사람이 보던 화면이 뒷사람에게 그대로 이어지는 셈이라, 권한이 다른 계정이면
     *   보면 안 되는 화면부터 열린다. 주소를 먼저 되돌린다. */
    return pathname === '/' ? <LoginPage /> : <Navigate to="/" replace />
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        {/* 제품 화면 */}
        <Route index element={<Dashboard />} />
        <Route path="g/:groupId" element={<GroupPage />} />
        <Route path="s/:screenId" element={<ScreenPage />} />

        {/* 내부용 — 요구사항 명세 뷰. **개발 빌드에만 들어간다.**
            오픈이슈 42건에 거래처 협상 상태·계약 종료 시점이 그대로 있어(README 경고)
            프로덕션 번들에 실리면 로그인 게이트와 무관하게 노출된다 —
            번들은 로그인 전에 이미 브라우저로 내려간다. */}
        {InternalSpecRoutes()}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
