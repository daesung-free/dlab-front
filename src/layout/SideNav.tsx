import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, useLocation, useParams } from 'react-router-dom'
import { findScreen } from '../data/menu'
import { NAV, findNavCat, navCatOfScreen, navItemCount, navPath, type NavItem } from '../data/nav'
import { TODOS } from '../data/mockDashboard'
import { Icon } from '../components/Icon'
import { useAcademy } from '../auth/AcademyContext'
import { useAuth } from '../auth/AuthContext'
import { canSeeScreen, canSeeScreenAs, hasMenuCode, screenOfMenuCode } from '../data/menuCodes'
import { listMyFavorites, saveMyFavorites, listMenuCatalog, type MenuNode } from '../api/menus'
import { Modal } from '../components/common'
import { useServerData } from '../components/common'
import { fetchAttendanceBoard } from '../api/attendance'
import { ApiError } from '../api/client'

/** UTC 로 만들면 오전에 하루가 밀린다 — 오늘 요약이라 로컬 날짜여야 한다 */
function today(): Date {
  return new Date()
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 대시보드에서 보이는 사이드바 — 오늘 요약 + 자주 쓰는 메뉴.
 *
 * ★ 요약 숫자는 **실제 출결**이다. 전에는 목업(재원생 296명·5월 28일)이 박혀 있었는데,
 *   사이드바라 전 화면에 같이 떠서 실데이터 옆에 가짜 숫자가 나란히 보였다.
 */

/** 자주 쓰는 메뉴는 최대 8개다(서버 제약) */
const FAVORITE_MAX = 8

/**
 * 자주 쓰는 메뉴 고르기.
 *
 * ★ **화면이 아니라 업무 영역(코드) 단위다.** 서버가 코드로 저장하기 때문이다 —
 *   그래서 '학생 검색' 과 '신규 접수 등록' 을 따로 담을 수 없고 '학생 관리' 하나가 된다.
 *   화면이 없는 코드(서버 API 전용)는 아예 안 보여준다 — 눌러도 갈 데가 없다.
 * ★ **고른 순서가 화면 순서다.** 그래서 목록이 아니라 고른 차례를 그대로 보여준다.
 */
function FavoriteModal({
  current,
  allowedMenus,
  onClose,
  onSaved,
}: {
  current: MenuNode[]
  allowedMenus: Set<string> | null
  onClose: () => void
  onSaved: (next: MenuNode[]) => void
}) {
  const [catalog, setCatalog] = useState<MenuNode[] | null>(null)
  const [picked, setPicked] = useState<string[]>(current.map((m) => m.code))
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    listMenuCatalog()
      .then((list) => alive && setCatalog(list))
      .catch(() => alive && setErr('메뉴 목록을 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [])

  /* 갈 수 있는 곳만 남긴다 — 화면이 있는 코드 + 내 권한으로 볼 수 있는 것 */
  const options = (catalog ?? []).filter((m) => {
    const id = screenOfMenuCode(m.code)
    return id !== null && canSeeScreen(id, allowedMenus)
  })
  const byCode = new Map(options.map((m) => [m.code, m]))

  function toggle(code: string) {
    setErr(null)
    if (picked.includes(code)) {
      setPicked(picked.filter((c) => c !== code))
      return
    }
    if (picked.length >= FAVORITE_MAX) {
      setErr(`최대 ${FAVORITE_MAX}개까지 고를 수 있습니다. 하나를 빼고 다시 고르세요.`)
      return
    }
    setPicked([...picked, code])
  }

  return (
    <Modal
      wide
      title="자주 쓰는 메뉴"
      sub={`대시보드 왼쪽에 둘 메뉴를 고릅니다. 고른 순서대로 놓입니다 (최대 ${FAVORITE_MAX}개).`}
      confirmLabel="저장"
      busy={busy}
      error={err}
      onConfirm={() => {
        setBusy(true)
        setErr(null)
        void saveMyFavorites(picked)
          .then((next) => onSaved(next))
          .catch((e) => setErr(e instanceof ApiError ? e.message : '저장하지 못했습니다.'))
          .finally(() => setBusy(false))
      }}
      onClose={onClose}
    >
      {catalog === null ? (
        <div style={{ padding: 18, color: 'var(--muted)' }}>불러오는 중…</div>
      ) : (
        <>
          <div className="note-box" style={{ marginBottom: 10 }}>
            <div>
              {picked.length === 0 ? (
                <>하나도 안 고르면 <b>기본 목록</b>이 그대로 보입니다.</>
              ) : (
                <>
                  {/* HTML 은 연속 공백을 하나로 줄인다 — 가운뎃점으로 끊어야 항목이 안 붙는다 */}
                  고른 순서: {picked.map((c, i) => `${i + 1}. ${byCode.get(c)?.name ?? c}`).join(' · ')}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 360, overflow: 'auto' }}>
            {options.map((m) => {
              const at = picked.indexOf(m.code)
              return (
                <button
                  key={m.code}
                  type="button"
                  className={`btn${at >= 0 ? ' pri' : ''}`}
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => toggle(m.code)}
                >
                  {at >= 0 && <b style={{ marginRight: 4 }}>{at + 1}</b>}
                  {m.name}
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}

function DashboardSide() {
  const { academyId, academies } = useAcademy()
  const { allowedMenus } = useAuth()
  const urgent = TODOS.filter((t) => t.tone === 'urgent')

  const now = today()
  const dateLabel = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 ${WEEKDAY[now.getDay()]}요일`
  const academyName = academies.find((a) => a.id === academyId)?.acadNm ?? null

  const params = useMemo(
    () => ({ academyId: academyId ?? undefined, date: ymd(today()) }),
    [academyId],
  )
  /* ★ 출결 메뉴가 안 열린 계정이면 부르지 않는다 — 403 이 나서 요약이 통째로 '-' 가 되는데,
        그건 "오늘 집계가 없다" 와 구분이 안 된다 */
  const canAtt = allowedMenus !== null && hasMenuCode('attendance', allowedMenus)
  const board = useServerData({
    fetcher: fetchAttendanceBoard,
    params,
    // 지점을 못 고른 상태로 부르면 전 지점 권한 계정이 400을 받는다
    enabled: academyId !== null && canAtt,
    errorMessage: '오늘 출결을 불러오지 못했습니다.',
  })
  const summary = board.data?.summary
  /* 아직 안 고른 사람에게 보여줄 기본값. 서버에 저장된 것이 없으면 이걸 쓴다 —
     빈 칸으로 두면 "고장난 것" 으로 읽힌다 */
  const DEFAULT_QUICK = [
    { id: 'student-search', icon: 'search', label: '학생 검색' },
    { id: 'attendance', icon: 'scan-line', label: '출결 현황' },
    { id: 'student-absence', icon: 'check-check', label: '사유 승인' },
    { id: 'consult', icon: 'message-square', label: '상담일지' },
    { id: 'message-send', icon: 'send', label: '알림 발송' },
    { id: 'payment', icon: 'receipt', label: '수납현황' },
  ]

  /* 자주 쓰는 메뉴 — 본인이 고른다. 못 읽으면 null 로 두고 기본값을 쓴다 */
  const [favorites, setFavorites] = useState<MenuNode[] | null>(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    let alive = true
    listMyFavorites()
      .then((list) => alive && setFavorites(list))
      .catch(() => alive && setFavorites(null))
    return () => {
      alive = false
    }
  }, [])

  /* ★ 바로가기도 같이 거른다. 좌측 메뉴에서만 감추면 대시보드에는 남아 있어,
        눌렀을 때 대시보드로 되튕긴다(ScreenPage 가 막는다) */
  const quick = (
    favorites !== null && favorites.length > 0
      ? favorites
          .map((m) => {
            const id = screenOfMenuCode(m.code)
            return id === null ? null : { id, icon: findScreen(id)?.icon ?? 'circle-dot', label: m.name }
          })
          .filter((q): q is { id: string; icon: string; label: string } => q !== null)
      : DEFAULT_QUICK
  ).filter((q) => canSeeScreen(q.id, allowedMenus))

  return (
    <>
      <div className="side-cat">
        <span className="ico">
          <Icon name="layout-dashboard" size={18} />
        </span>{' '}
        오늘
      </div>
      <div className="side-desc">
        {dateLabel}
        {academyName ? ` · ${academyName}지점` : ''}
      </div>

      {/* 출결 메뉴가 없는 계정에는 '-명' 네 줄을 남기지 않는다 — 값이 있는 척이 된다 */}
      {allowedMenus !== null && !canAtt ? (
        <div className="side-desc" style={{ marginTop: 6 }}>
          출결 메뉴가 열려 있지 않아 오늘 요약은 보이지 않습니다.
        </div>
      ) : (
      <div className="side-summary">
        <div className="ss-row">
          <span className="k">재원생</span>
          <span className="v">{summary?.total ?? '-'}명</span>
        </div>
        <div className="ss-row">
          <span className="k">등원</span>
          <span className="v" style={{ color: 'var(--mint-d)' }}>
            {summary ? summary.ON_TIME + summary.LATE : '-'}명
          </span>
        </div>
        <div className="ss-row">
          <span className="k">지각</span>
          <span className="v" style={{ color: 'var(--amber)' }}>
            {summary?.LATE ?? '-'}명
          </span>
        </div>
        <div className="ss-row">
          <span className="k">미등원</span>
          <span className="v" style={{ color: 'var(--red)' }}>
            {summary?.ABSENT ?? '-'}명
          </span>
        </div>
      </div>
      )}

      {urgent.length > 0 && (
        <div className="legend-block" style={{ background: 'var(--red-wash)' }}>
          {/* ★ 이 숫자는 목업이다(mockDashboard). 사이드바라 전 화면에 같이 떠서, 라벨이
                 없으면 바로 위 실제 출결 숫자와 나란히 보여 둘 다 진짜로 읽힌다. */}
          <div className="lt" style={{ color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6 }}>
            즉시 확인
            <span className="mk supplement" title="집계 기능이 준비되면 실제 숫자로 바뀝니다">
              표시용 예시
            </span>
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
        <div
          className="lt"
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: 'var(--muted)',
            padding: '0 8px 8px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          자주 쓰는 메뉴
          {favorites !== null && favorites.length === 0 && (
            <span style={{ marginLeft: 5, fontWeight: 400 }}>(기본)</span>
          )}
          <button
            className="icon-btn"
            style={{ marginLeft: 'auto', width: 20, height: 20 }}
            title="자주 쓰는 메뉴 고르기"
            onClick={() => setEditing(true)}
          >
            <Icon name="sliders-horizontal" size={12} />
          </button>
        </div>
        {editing && (
          <FavoriteModal
            current={favorites ?? []}
            allowedMenus={allowedMenus}
            onClose={() => setEditing(false)}
            onSaved={(next) => {
              setFavorites(next)
              setEditing(false)
            }}
          />
        )}

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
  const { allowedMenus, principal, me } = useAuth()
  const isSuper = (me?.roles ?? principal?.roles ?? []).some((r) => r === 'SUPER_ADMIN')
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

      {/* ★ 계정별 메뉴 노출. 섹션이 통째로 비면 제목만 남으므로 **섹션도 함께 감춘다** —
             빈 제목만 떠 있으면 "여기 뭐가 있었는데 사라졌나" 가 된다 */}
      {cat.sections.map((sec) => {
        const items = sec.items.filter((i) => canSeeScreenAs(i.screenId, allowedMenus, isSuper))
        if (items.length === 0) return null
        return (
          <div className="nav-sec" key={sec.name}>
            <div className="nav-sec-t">{sec.name}</div>
            <nav className="nav">
              {items.map((item) => (
                <NavItemLink key={`${item.screenId}-${item.tab ?? ''}`} item={item} here={here} />
              ))}
            </nav>
          </div>
        )
      })}

      {/* ★ '중분류'·'기획 신규 도메인'은 우리끼리 쓰는 말이다(CLAUDE.md 1-1). 행정 선생님이
             읽고 할 일이 달라지지 않는다 — 화면 개수만 남긴다. */}
      <div className="side-foot">
        <b style={{ color: 'var(--ink-2)' }}>{cat.name}</b> · 화면 {navItemCount(cat, (i) => canSeeScreenAs(i.screenId, allowedMenus, isSuper))}개
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
      {item.added && <span className="nwdot" title="이번에 새로 만든 화면입니다" />}
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
      <div className="side-foot">화면별 상세는 카드에서 메뉴명을 누르세요.</div>
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
