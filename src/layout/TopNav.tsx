import { NavLink } from 'react-router-dom'
import { NAV, navItemCount } from '../data/nav'
import { ME } from '../data/mockDashboard'
import { Icon } from '../components/Icon'
import { useAcademy } from '../auth/AcademyContext'
import { useAuth } from '../auth/AuthContext'

export function TopNav() {
  const { academies, academyId, setAcademyId, selectable } = useAcademy()
  const { logout } = useAuth()

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
            className="sel branch-sel"
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
        <div className="av">{ME.initial}</div>
        <div className="wt">
          <b>{ME.name}</b>
          <span>{ME.role}</span>
        </div>
        <button className="icon-btn" title="로그아웃" onClick={() => void logout()}>
          <Icon name="log-out" size={17} />
        </button>
      </div>
    </header>
  )
}
