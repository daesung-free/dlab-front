import { Navigate, useParams } from 'react-router-dom'
import { findGroup, findScreen } from '../data/menu'
import { PageHead } from '../components/PageHead'
import { MOCKUPS } from './screens'
import './screen.css'

/**
 * 제품 화면 — 실제 사용자가 보는 것만 그린다.
 * 요구사항·이슈·잠정결정은 여기 노출하지 않고 `/spec/:screenId` 와 docs/ 에서 관리한다.
 */
export function ScreenPage() {
  const { screenId } = useParams()
  const s = screenId ? findScreen(screenId) : undefined
  if (!s) return <Navigate to="/" replace />

  const group = findGroup(s.groupId)!
  const mockup = MOCKUPS[s.id]
  if (!mockup) return <Navigate to={`/g/${group.id}`} replace />

  return (
    <>
      <PageHead
        crumb={
          <>
            <b>{group.name}</b> · {s.name}
          </>
        }
        title={s.name}
        icon={s.icon}
        actions={mockup.actions}
      />
      <mockup.Content />
    </>
  )
}
