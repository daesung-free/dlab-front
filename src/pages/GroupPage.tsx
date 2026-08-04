import { Link, Navigate, useParams } from 'react-router-dom'
import { findScreen } from '../data/menu'
import { findNavCat, navItemCount, navPath } from '../data/nav'
import { PageHead } from '../components/PageHead'
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
  const cat = groupId ? findNavCat(groupId) : undefined
  if (!cat) return <Navigate to="/" replace />

  return (
    <>
      <PageHead
        crumb={<b>{cat.name}</b>}
        title={cat.name}
        icon={cat.icon}
        sub={cat.desc}
        actions={
          <span className="sc-ref">
            중분류 {cat.sections.length}개 · 기능 {navItemCount(cat)}개
          </span>
        }
      />

      {cat.sections.map((sec) => (
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
