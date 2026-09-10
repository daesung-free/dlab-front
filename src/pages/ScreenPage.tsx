import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAcademy } from '../auth/AcademyContext'
import { findScreen } from '../data/menu'
import { NAV, navCatOfScreen, navSectionOfScreen } from '../data/nav'
import { PageHead } from '../components/PageHead'
import { MOCKUPS } from './screens'
import './screen.css'

/**
 * 제품 화면 — 실제 사용자가 보는 것만 그린다.
 * 요구사항·이슈·잠정결정은 여기 노출하지 않고 `/spec/:screenId` 와 docs/ 에서 관리한다.
 */
/**
 * 아직 서버가 없어 **화면 전체가 예시 데이터**인 화면과, 그 이유.
 *
 * ★ 값이 비어 있는 화면보다 **그럴듯하게 차 있는 화면이 더 위험하다.** 테스트하는 사람이
 *   실데이터로 믿고 결함을 올리거나, 반대로 "되는 줄" 알고 넘어간다. 실제로 둘 다 있었다.
 */
const MOCKUP_ONLY: Record<string, string> = {
  waitlist: '입학예약 도메인이 서버에 없습니다.',
  'admin-result': '합격 실적 도메인이 서버에 없습니다.',
  'daily-report': '집계 도메인이 서버에 없습니다.',
  'seat-move': '이석 위치가 백엔드에서 보류 중입니다.',
  'profile-form': '신상기록부 도메인이 서버에 없습니다.',
  'change-log': '감사 로그 도메인이 서버에 없습니다.',
  'student-status': '통계는 대시보드 요약만 있어 이 화면의 집계를 만들 수 없습니다.',
  timetable: '시간표 편성 도메인이 서버에 없습니다.',
  'payment-gate': 'PG 연동 도메인이 서버에 없습니다.',
}

export function ScreenPage() {
  const { screenId } = useParams()
  const [params] = useSearchParams()
  const { academyId, selectable } = useAcademy()
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
      {/* ★ 서버에 도메인이 없어 통째로 예시 데이터인 화면들.
             표에 숫자가 그럴듯하게 차 있어서 **살아 있는 화면으로 오해받는다** —
             테스트 URL 을 넘길 때 이게 가장 많은 오판을 만든다. 화면마다 붙이면
             또 빠지는 곳이 생기므로 여기 한 곳에서 id 로 판단한다.
             붙는 즉시 이 목록에서 빼야 한다. */}
      {MOCKUP_ONLY[s.id] && (
        <div className="note-box" role="note" style={{ borderColor: 'var(--amber)' }}>
          <b>이 화면은 아직 예시 데이터입니다.</b> {MOCKUP_ONLY[s.id]} 저장·수정 버튼은
          눌러도 아무 일이 일어나지 않도록 막아 두었습니다.
        </div>
      )}

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
