import { NavLink, useParams } from 'react-router-dom'
import {
  GROUPS,
  KIND_LABEL,
  PHASE,
  SCREENS,
  countByKind,
  findGroup,
  screensOf,
  type PhaseNo,
} from '../data/menu'
import { ISSUES, countByPriority } from '../data/issues'
import { Icon } from '../components/Icon'

const PHASE_ORDER: PhaseNo[] = [1, 2, 3, 4, 0]

/** 전체 구성(홈)에서 보이는 요약 사이드바 */
function OverviewSide() {
  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name="layout-dashboard" size={18} />
        </span>{' '}
        전체 구성
      </div>
      <div className="side-desc">
        요구사항정의서 1시트 기준 전체 화면 IA. 상단 대분류 탭을 눌러 세부 화면을 확인하세요.
      </div>

      <div className="side-summary">
        <div className="ss-row">
          <span className="k">대분류</span>
          <span className="v">{GROUPS.length}개</span>
        </div>
        <div className="ss-row">
          <span className="k">세부 화면</span>
          <span className="v">{SCREENS.length}개</span>
        </div>
        <div className="ss-row">
          <span className="k">요구사항 신규</span>
          <span className="v" style={{ color: 'var(--amber)' }}>
            {countByKind('brandnew')}개
          </span>
        </div>
        <div className="ss-row">
          <span className="k">요구사항 보완</span>
          <span className="v" style={{ color: 'var(--blue)' }}>
            {countByKind('supplement')}개
          </span>
        </div>
        <div className="ss-row">
          <span className="k">요구사항 검증됨</span>
          <span className="v" style={{ color: 'var(--green)' }}>
            {countByKind('verified')}개
          </span>
        </div>
      </div>

      <div className="legend-block">
        <div className="lt">Phase 범례</div>
        {PHASE_ORDER.map((p) => (
          <div className="legend-row" key={p}>
            <span className={`ph p${p}`}>P{p}</span> {PHASE[p].name}
          </div>
        ))}
      </div>

      <div className="legend-block">
        <div className="lt">오픈이슈 {ISSUES.length}건</div>
        <div className="legend-row">
          <span className="mk brandnew">최우선</span> {countByPriority('최우선')}건
        </div>
        <div className="legend-row">
          <span className="mk supplement">높음</span> {countByPriority('높음')}건
        </div>
        <div className="legend-row">
          <span className="mk verified">중 · 하</span> {countByPriority('중') + countByPriority('하')}건
        </div>
      </div>

      <div className="side-foot">
        기준: DSA_DLab_요구사항정의서 v1.0
        <br />
        개발착수 실행가이드 v1.0 (2026-07-19)
      </div>
    </>
  )
}

/** 대분류 진입 시 보이는 화면 목록 사이드바 */
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
        {group.no} {group.name}
      </div>
      <div className="side-desc">{group.desc}</div>

      <nav className="nav">
        {screens.map((s) => (
          <NavLink key={s.id} to={`/s/${s.id}`} className={({ isActive }) => (isActive ? 'on' : undefined)}>
            <span className="ico">
              <Icon name={s.icon} />
            </span>
            <span className="nm">{s.name}</span>
            {s.kind === 'brandnew' && <span className="nwdot" title={KIND_LABEL.brandnew} />}
            <span className={`ph p${s.phase}`}>P{s.phase}</span>
          </NavLink>
        ))}
      </nav>

      <div className="side-foot">
        P 배지 = 개발 Phase
        <br />
        노란 점 = 요구사항 신규(DSA 대응 화면 없음)
      </div>
    </>
  )
}

export function SideNav() {
  const { groupId, screenId } = useParams()
  const owning = groupId ?? (screenId ? SCREENS.find((s) => s.id === screenId)?.groupId : undefined)

  return <aside className="side">{owning ? <GroupSide groupId={owning} /> : <OverviewSide />}</aside>
}
