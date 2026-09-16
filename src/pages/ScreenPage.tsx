import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAcademy } from '../auth/AcademyContext'
import { useAuth } from '../auth/AuthContext'
import { findScreen } from '../data/menu'
import { canSeeScreen } from '../data/menuCodes'
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
  const { academyId, selectable } = useAcademy()
  const { canSeeAdmin, allowedMenus } = useAuth()
  const s = screenId ? findScreen(screenId) : undefined
  if (!s) return <Navigate to="/" replace />
  /* 메뉴에서 감춰도 주소를 직접 치면 열린다 — 화면 단위로도 같은 판단을 건다 */
  if (s.groupId === 'admin' && !canSeeAdmin) return <Navigate to="/" replace />
  /* ★ 계정별 메뉴 노출. 이건 **보이기 차단일 뿐**이다 — 실제 차단은 서버가 API 단에서 한다.
        아직 목록을 못 읽었으면(null) 막지 않는다. 막아버리면 응답이 늦은 순간
        새로고침한 사람이 자기 화면에서 튕긴다 */
  if (!canSeeScreen(s.id, allowedMenus)) return <Navigate to="/" replace />

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
      {/* ★ 지점을 고르기 전에는 대부분의 화면이 **조회를 아예 시작하지 않는다.**
             전 지점 권한 계정의 기본값이 미선택이라 본사 관리자가 가장 먼저 만나는 상태인데,
             화면에 따라 빈 표나 고정값이 그대로 보여 '정상 조회'로 착각하게 된다.
             실제로 그 상태로 점검하다 급식·특강·설문을 전부 '미구현'으로 판정한 일이 있었다.
             화면마다 따로 붙이면 또 빠지는 곳이 생기므로 여기 한 곳에 둔다. */}
      {selectable && academyId === null && (
        <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
          <b>위에서 지점을 먼저 고르세요.</b> 고르기 전에는 이 화면이 조회를 시작하지 않습니다 —
          지금 보이는 값은 실제 데이터가 아닐 수 있습니다.
        </div>
      )}
      <mockup.Content />
    </>
  )
}
