import { NavLink } from 'react-router-dom'
import { NAV, navItemCount } from '../data/nav'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type Role } from '../api/accounts'
import { getLoginId } from '../api/tokens'
import { Icon } from '../components/Icon'
import { useAcademy } from '../auth/AcademyContext'

export function TopNav() {
  const { academies, academyId, setAcademyId, selectable } = useAcademy()
  const { principal, logout } = useAuth()

  /* 로그인한 계정을 그대로 보여준다.
     ★ 예전에는 mockDashboard 의 ME('강민서 / 분당 지점관리자')를 그렸다. 누구로 로그인하든
       같은 이름이 떠서, 배포본을 열어본 사람이 "전부 목업"이라고 판단했다. 실제로 화면들은
       연동돼 있었다 — **헤더 하나가 앱 전체의 인상을 정한다.**
     ★ 서버가 이름을 안 주므로 로그인 아이디를 쓴다. JWT 에 들어 있는 것은
       accountId·roles·allAcademy·academyId 뿐이다(api/auth.ts decodePrincipal). */
  const roles = (principal?.roles ?? []) as Role[]
  const roleLabel = roles.length > 0 ? ROLE_LABEL[roles[0]] ?? roles[0] : '\u2014'
  const scopeLabel = principal?.allAcademy
    ? '전 지점'
    : (academies.find((a) => a.id === principal?.academyId)?.acadNm ?? '')
  const who = getLoginId() ?? `#${principal?.accountId ?? '?'}`

  return (
    <header className="topnav">
      <NavLink to="/" className="brand">
        <div className="logo">
          D<b>'</b>Lab
        </div>
        <div className="txt">
          <b>통합관리</b>
          <span>대성 · 관리형 독학재수</span>
        </div>
      </NavLink>

      <nav className="cat-tabs">
        <NavLink to="/" end className={({ isActive }) => `cat-tab${isActive ? ' on' : ''}`}>
          <span className="ico">
            <Icon name="layout-dashboard" />
          </span>
          대시보드
        </NavLink>
        {NAV.map((c) => (
          <NavLink key={c.id} to={`/g/${c.id}`} className={({ isActive }) => `cat-tab${isActive ? ' on' : ''}`}>
            <span className="ico">
              <Icon name={c.icon} />
            </span>
            {c.name}
            <span className="cat-n">{navItemCount(c)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="who">
        {/* 지점 스코프. 대부분의 목록 API가 academyId를 받고, 전 지점 권한 계정은
            안 고르면 400이라 화면이 비어 보인다. 지점이 하나뿐이면 고를 것이 없어 감춘다. */}
        {selectable && (
          <select
            className="branch-sel"
            value={academyId ?? ''}
            onChange={(e) => setAcademyId(Number(e.target.value))}
            aria-label="지점 선택"
          >
            <option value="" disabled>
              지점 선택
            </option>
            {academies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.acadNm}
              </option>
            ))}
          </select>
        )}

        <button className="icon-btn" title="알림 3건">
          <Icon name="bell" size={17} />
          <span className="badge" />
        </button>
        <div className="av">{who.slice(0, 1).toUpperCase()}</div>
        <div className="wt">
          <b>{who}</b>
          <span>{scopeLabel ? `${scopeLabel} · ${roleLabel}` : roleLabel}</span>
        </div>
        <button className="icon-btn" title="로그아웃" onClick={() => void logout()}>
          <Icon name="log-out" size={17} />
        </button>
      </div>
    </header>
  )
}
