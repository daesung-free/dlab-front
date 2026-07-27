import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { GROUPS, SCREENS, findGroup, screensOf } from '../data/menu'
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

/** 대분류 진입 시 — 하위 메뉴 목록 */
function GroupSide({ groupId }: { groupId: string }) {
  const group = findGroup(groupId)
  const screens = screensOf(groupId)
  if (!group) return null

  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name={group.icon} size={18} />
        </span>{' '}
        {group.name}
      </div>
      <div className="side-desc">{group.desc}</div>

      <nav className="nav">
        {screens.map((s) => (
          <NavLink key={s.id} to={`/s/${s.id}`} className={({ isActive }) => (isActive ? 'on' : undefined)}>
            <span className="ico">
              <Icon name={s.icon} />
            </span>
            <span className="nm">{s.name}</span>
          </NavLink>
        ))}
      </nav>
    </>
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
  const { pathname } = useLocation()

  if (pathname.startsWith('/spec')) return <aside className="side"><SpecSide /></aside>

  const owning = groupId ?? (screenId ? SCREENS.find((s) => s.id === screenId)?.groupId : undefined)
  const valid = owning && GROUPS.some((g) => g.id === owning)

  return <aside className="side">{valid ? <GroupSide groupId={owning} /> : <DashboardSide />}</aside>
}
