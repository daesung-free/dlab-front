import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { findScreen } from '../data/menu'
import { NAV, navCatOfScreen, navSectionOfScreen } from '../data/nav'
import { PageHead } from '../components/PageHead'
import { MOCKUPS } from './screens'
import './screen.css'

/**
 * 제품 화면 — 실제 사용자가 보는 것만 그린다.
 * 요구사항·이슈·잠정결정은 여기 노출하지 않고 `/spec/:screenId` 와 docs/ 에서 관리한다.
 */
export function ScreenPage() {
  const { screenId } = useParams()
  const [params] = useSearchParams()
  const s = screenId ? findScreen(screenId) : undefined
  if (!s) return <Navigate to="/" replace />

  const mockup = MOCKUPS[s.id]
  if (!mockup) return <Navigate to="/" replace />

  const cat = navCatOfScreen(s.id)
  const section = navSectionOfScreen(s.id)

  /* 같은 화면을 ?tab= 으로 나눠 건 메뉴(기초관리 과정/학과/학과계열)는
   * 진입한 메뉴 이름을 제목으로 쓴다. 사이드바에서 누른 것과 제목이 달라 보이면 안 된다. */
  const tab = params.get('tab')
  const navItem = tab
    ? NAV.flatMap((c) => c.sections)
        .flatMap((x) => x.items)
        .find((i) => i.screenId === s.id && i.tab === tab)
    : undefined
  const title = navItem?.label ?? s.name

  return (
    <>
      <PageHead
        crumb={
          <>
            <b>{cat?.name ?? '화면'}</b>
            {section && <> · {section}</>} · {title}
          </>
        }
        title={title}
        icon={navItem?.icon ?? s.icon}
        actions={mockup.actions}
      />
      <mockup.Content />
    </>
  )
}
