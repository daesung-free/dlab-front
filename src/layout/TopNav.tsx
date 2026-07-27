import { NavLink } from 'react-router-dom'
import { GROUPS } from '../data/menu'
import { Icon } from '../components/Icon'

export function TopNav() {
  return (
    <header className="topnav">
      <div className="brand">
        <div className="logo">
          D<b>'</b>Lab
        </div>
        <div className="txt">
          <b>통합관리</b>
          <span>대성 · 관리형 독학재수</span>
        </div>
      </div>

      <nav className="cat-tabs">
        <NavLink to="/" end className={({ isActive }) => `cat-tab${isActive ? ' on' : ''}`}>
          <span className="ico">
            <Icon name="layout-dashboard" />
          </span>
          전체 구성
        </NavLink>
        {GROUPS.map((g) => (
          <NavLink key={g.id} to={`/g/${g.id}`} className={({ isActive }) => `cat-tab${isActive ? ' on' : ''}`}>
            <span className="ico">
              <Icon name={g.icon} />
            </span>
            {g.name}
          </NavLink>
        ))}
      </nav>

      <div className="who">
        <div className="av">관</div>
        <div className="wt">
          <b>전체 메뉴</b>
          <span>마스터 뷰 · 全 권한</span>
        </div>
      </div>
    </header>
  )
}
