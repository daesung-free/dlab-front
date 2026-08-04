import { NavLink } from 'react-router-dom'
import { NAV, navItemCount } from '../data/nav'
import { ME } from '../data/mockDashboard'
import { Icon } from '../components/Icon'

export function TopNav() {
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
        <button className="icon-btn" title="알림 3건">
          <Icon name="bell" size={17} />
          <span className="badge" />
        </button>
        <div className="av">{ME.initial}</div>
        <div className="wt">
          <b>{ME.name}</b>
          <span>{ME.role}</span>
        </div>
      </div>
    </header>
  )
}
