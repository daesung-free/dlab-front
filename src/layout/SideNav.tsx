import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { findScreen } from '../data/menu'
import { NAV, findNavCat, navCatOfScreen, navItemCount, navPath, type NavItem } from '../data/nav'
import { ATTENDANCE, TODOS } from '../data/mockDashboard'
import { Icon } from '../components/Icon'

/** 대시보드에서 보이는 사이드바 — 오늘 요약 + 자주 쓰는 메뉴 */
function DashboardSide() {
  const urgent = TODOS.filter((t) => t.tone === 'urgent')
  const quick = [
    { id: 'student-search', icon: 'search', label: '학생 검색' },
    { id: 'attendance', icon: 'scan-line', label: '출결 현황' },
    { id: 'student-absence', icon: 'check-check', label: '사유 승인' },
    { id: 'consult', icon: 'message-square', label: '상담일지' },
    { id: 'message-send', icon: 'send', label: '알림 발송' },
    { id: 'payment', icon: 'receipt', label: '수납현황' },
  ]

  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name="layout-dashboard" size={18} />
        </span>{' '}
        오늘
      </div>
      <div className="side-desc">2026년 5월 28일 목요일 · 분당지점</div>

      <div className="side-summary">
        <div className="ss-row">
          <span className="k">재원생</span>
          <span className="v">{ATTENDANCE.enrolled}명</span>
        </div>
        <div className="ss-row">
          <span className="k">등원</span>
          <span className="v" style={{ color: 'var(--mint-d)' }}>
            {ATTENDANCE.arrived}명
          </span>
        </div>
        <div className="ss-row">
          <span className="k">지각</span>
          <span className="v" style={{ color: 'var(--amber)' }}>
            {ATTENDANCE.late}명
          </span>
        </div>
        <div className="ss-row">
          <span className="k">미등원</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {ATTENDANCE.missing}명
          </span>
        </div>
      </div>

      {urgent.length > 0 && (
        <div className="legend-block" style={{ background: 'var(--red-wash)' }}>
          <div className="lt" style={{ color: 'var(--red)' }}>
            즉시 확인
          </div>
          {urgent.map((t) => (
            <Link
              to={t.to}
              key={t.id}
              className="legend-row"
              style={{ color: 'var(--ink-2)', justifyContent: 'space-between' }}
            >
              <span>{t.label}</span>
              <b style={{ color: 'var(--red)' }}>
                {t.count}
                {t.unit}
              </b>
            </Link>
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <div className="lt" style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muted)', padding: '0 8px 8px' }}>
          자주 쓰는 메뉴
        </div>
        <nav className="nav">
          {quick.map((q) => (
            <NavLink key={q.id} to={`/s/${q.id}`} className={({ isActive }) => (isActive ? 'on' : undefined)}>
              <span className="ico">
                <Icon name={q.icon} />
              </span>
              <span className="nm">{q.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </>
  )
}

/**
 * 대분류 진입 시 — 중분류로 묶인 기능 목록.
 * 클라이언트 메뉴표(대분류 > 중분류 > 기능) 3단 구조를 그대로 편다.
 */
function CatSide({ catId, here }: { catId: string; here: string }) {
  const cat = findNavCat(catId)
  if (!cat) return null

  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name={cat.icon} size={18} />
        </span>{' '}
        {cat.name}
      </div>
      <div className="side-desc">{cat.desc}</div>

      {cat.sections.map((sec) => (
        <div className="nav-sec" key={sec.name}>
          <div className="nav-sec-t">{sec.name}</div>
          <nav className="nav">
            {sec.items.map((item) => (
              <NavItemLink key={`${item.screenId}-${item.tab ?? ''}`} item={item} here={here} />
            ))}
          </nav>
        </div>
      ))}

      <div className="side-foot">
        <b style={{ color: 'var(--ink-2)' }}>{cat.name}</b> · 중분류 {cat.sections.length}개 · 기능 {navItemCount(cat)}개
        <br />
        <span className="nwdot" style={{ display: 'inline-block', verticalAlign: 1, marginRight: 5 }} />
        표시는 기획 신규 도메인을 이 자리에 편입한 메뉴입니다.
      </div>
    </>
  )
}

/**
 * 기능 링크 한 줄.
 * `?tab=` 으로 같은 화면을 나눠 거는 메뉴(기초관리 과정/학과/학과계열)가 있으므로
 * NavLink 기본 활성 판정(pathname만 비교)을 쓰면 세 개가 동시에 켜진다. 직접 비교한다.
 */
function NavItemLink({ item, here }: { item: NavItem; here: string }) {
  const to = navPath(item)
  const screen = findScreen(item.screenId)
  const on = here === to

  return (
    <NavLink to={to} className={on ? 'on' : undefined} title={item.note}>
      <span className="ico">
        <Icon name={item.icon ?? screen?.icon ?? 'circle-dot'} />
      </span>
      <span className="nm">{item.label}</span>
      {item.added && <span className="nwdot" title="기획 신규 도메인 — 이 자리에 편입" />}
    </NavLink>
  )
}

/** 내부 문서(/spec) 사이드바 */
function SpecSide() {
  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name="file-text" size={18} />
        </span>{' '}
        내부 문서
      </div>
      <div className="side-desc">요구사항 명세 · 개발팀 전용. 제품 화면이 아닙니다.</div>
      <nav className="nav">
        <NavLink to="/spec" end className={({ isActive }) => (isActive ? 'on' : undefined)}>
          <span className="ico">
            <Icon name="layout-dashboard" />
          </span>
          <span className="nm">전체 화면 구성</span>
        </NavLink>
      </nav>
      <div className="side-foot">
        화면별 상세는 카드에서 메뉴명을 누르세요.
        <br />
        API·테이블 전체 목록은 <code style={{ fontSize: 10.5 }}>docs/</code> 참고.
      </div>
    </>
  )
}

export function SideNav() {
  const { groupId, screenId } = useParams()
  const { pathname, search } = useLocation()

  if (pathname.startsWith('/spec')) return <aside className="side"><SpecSide /></aside>

  const owning = groupId ?? (screenId ? navCatOfScreen(screenId)?.id : undefined)
  const valid = owning && NAV.some((c) => c.id === owning)

  return (
    <aside className="side">
      {valid ? <CatSide catId={owning} here={`${pathname}${search}`} /> : <DashboardSide />}
    </aside>
  )
}
