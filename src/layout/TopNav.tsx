import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { NAV, navItemCount } from '../data/nav'
import { useAuth } from '../auth/AuthContext'
import { ROLE_LABEL, type Role } from '../api/accounts'
import { getLoginId } from '../api/tokens'
import { Icon } from '../components/Icon'
import { useAcademy } from '../auth/AcademyContext'
import { PasswordModal } from '../auth/PasswordModal'

export function TopNav() {
  const { academies, academyId, setAcademyId, selectable } = useAcademy()
  const { principal, me, logout } = useAuth()

  /* 로그인한 계정을 그대로 보여준다.
     ★ 예전에는 mockDashboard 의 ME('강민서 / 분당 지점관리자')를 그렸다. 누구로 로그인하든
       같은 이름이 떠서, 배포본을 열어본 사람이 "전부 목업"이라고 판단했다. 실제로 화면들은
       연동돼 있었다 — **헤더 하나가 앱 전체의 인상을 정한다.**
     ★ 서버가 이름을 안 주므로 로그인 아이디를 쓴다. JWT 에 들어 있는 것은
       accountId·roles·allAcademy·academyId 뿐이다(api/auth.ts decodePrincipal). */
  const roles = (me?.roles ?? principal?.roles ?? []) as Role[]
  const roleLabel = roles.length > 0 ? ROLE_LABEL[roles[0]] ?? roles[0] : '\u2014'
  const scopeLabel = principal?.allAcademy
    ? '전 지점'
    : (me?.academyName ?? academies.find((a) => a.id === principal?.academyId)?.acadNm ?? '')
  /* 이름 → 로그인 아이디 → 계정번호 순으로 물러선다.
     배포 서버에 아직 /auth/me 가 없어서(404) 이름이 없는 구간이 실제로 있다. */
  const who = me?.name ?? getLoginId() ?? `#${principal?.accountId ?? '?'}`

  /* 임시 비밀번호로 들어온 사람은 바꾸기 전에는 못 빠져나간다.
     ★ 서버가 JWT 의 pcr 클레임으로 알려준다(/auth/me 에도 같은 값이 있다). 이걸 안 보면
       초기화를 받은 사람이 남도 아는 비밀번호를 계속 쓰게 된다.
     ★ 변경에 성공하면 서버가 새 토큰을 주고 AuthContext 가 그걸 다시 해석하므로
       `forced` 는 저절로 false 가 된다 — 여기서 따로 상태를 끌 필요가 없다. */
  const forced = principal?.mustChangePassword === true
  const [pwOpen, setPwOpen] = useState(false)

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
        <button className="icon-btn" title="비밀번호 변경" onClick={() => setPwOpen(true)}>
          <Icon name="lock" size={17} />
        </button>
        <button className="icon-btn" title="로그아웃" onClick={() => void logout()}>
          <Icon name="log-out" size={17} />
        </button>
      </div>

      {(pwOpen || forced) && <PasswordModal forced={forced} onClose={() => setPwOpen(false)} />}
    </header>
  )
}
