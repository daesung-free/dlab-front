import { Link, Navigate, useParams } from 'react-router-dom'
import { findGroup, screensOf } from '../data/menu'
import { PageHead } from '../components/PageHead'
import { Icon } from '../components/Icon'
import './screen.css'

/**
 * 대분류 진입 화면 — 하위 메뉴로 넘어가는 허브.
 * 요구사항·이슈는 노출하지 않는다(제품 화면).
 */
export function GroupPage() {
  const { groupId } = useParams()
  const group = groupId ? findGroup(groupId) : undefined
  if (!group) return <Navigate to="/" replace />

  const screens = screensOf(group.id)

  return (
    <>
      <PageHead crumb={<b>{group.name}</b>} title={group.name} icon={group.icon} sub={group.desc} />

      <div className="ov-grid">
        {screens.map((s) => (
          <Link className="menu-card" to={`/s/${s.id}`} key={s.id}>
            <span className="ic">
              <Icon name={s.icon} size={19} />
            </span>
            <div className="tx">
              <div className="nm">{s.name}</div>
              <div className="ds">{s.summary}</div>
            </div>
            <span className="go">
              <Icon name="chevron-right" size={17} />
            </span>
          </Link>
        ))}
      </div>
    </>
  )
}
