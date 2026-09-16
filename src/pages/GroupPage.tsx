import { Link, Navigate, useParams } from 'react-router-dom'
import { findScreen } from '../data/menu'
import { canSeeScreen } from '../data/menuCodes'
import { findNavCat, navItemCount, navPath } from '../data/nav'
import { PageHead } from '../components/PageHead'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/Icon'
import './screen.css'
import './home.css'

/**
 * 대분류 진입 화면 — 중분류별로 묶어 하위 기능으로 넘어가는 허브.
 * 메뉴 구조는 클라이언트 메뉴표(`data/nav.ts`)를 따른다.
 * 요구사항·이슈는 노출하지 않는다(제품 화면). 그쪽은 /spec 담당.
 */
export function GroupPage() {
  const { groupId } = useParams()
  const { canSeeAdmin, allowedMenus } = useAuth()
  const cat = groupId ? findNavCat(groupId) : undefined
  if (!cat) return <Navigate to="/" replace />
  /* ★ 메뉴에서 감추는 것만으로는 주소를 직접 친 사람을 못 막는다 — viewer1 으로 /g/admin 이
       그대로 열렸다. 서버가 403 을 주므로 자료는 안 새지만 화면은 열린 채로 남는다. */
  if (cat.id === 'admin' && !canSeeAdmin) return <Navigate to="/" replace />

  /* ★ 계정별 메뉴 노출. 좌측 메뉴만 거르면 **이 허브에는 다 남는다** — 감춘 화면의 카드가
       그대로 보이고, 눌러야 대시보드로 되튕긴다(ScreenPage). 같은 기준으로 여기서도 거른다 */
  const sections = cat.sections
    .map((sec) => ({ ...sec, items: sec.items.filter((i) => canSeeScreen(i.screenId, allowedMenus)) }))
    .filter((sec) => sec.items.length > 0)
  if (sections.length === 0) return <Navigate to="/" replace />

  return (
    <>
      <PageHead
        crumb={<b>{cat.name}</b>}
        title={cat.name}
        icon={cat.icon}
        sub={cat.desc}
        actions={
          /* '중분류'는 우리끼리 쓰는 말이다(CLAUDE.md 1-1) — 화면 개수만 남긴다 */
          <span className="sc-ref">화면 {navItemCount(cat, (i) => canSeeScreen(i.screenId, allowedMenus))}개</span>
        }
      />

      {sections.map((sec) => (
        <section key={sec.name} style={{ marginBottom: 22 }}>
          <div className="sc-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            {sec.name}
            <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{sec.items.length}</span>
          </div>

          <div className="ov-grid">
            {sec.items.map((item) => {
              const screen = findScreen(item.screenId)
              return (
                <Link className="menu-card" to={navPath(item)} key={`${item.screenId}-${item.tab ?? ''}`}>
                  <span className="ic">
                    <Icon name={item.icon ?? screen?.icon ?? 'circle-dot'} size={19} />
                  </span>
                  <div className="tx">
                    <div className="nm">
                      {item.label}
                      {item.added && <span className="nwdot" style={{ marginLeft: 6, verticalAlign: 2 }} />}
                    </div>
                    <div className="ds">{item.note ?? screen?.summary ?? ''}</div>
                  </div>
                  <span className="go">
                    <Icon name="chevron-right" size={17} />
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </>
  )
}
