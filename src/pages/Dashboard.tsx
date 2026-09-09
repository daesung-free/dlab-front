import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAcademy } from '../auth/AcademyContext'
import { useServerData } from '../components/common'
import { getStatistics } from '../api/statistics'
import { getLoginId } from '../api/tokens'
import { Unfilled } from '../components/common'
import { Icon } from '../components/Icon'
import {
  ACTIVITIES,
  NOTICES,
  PLAN,
  PLAN_BY_CLASS,
  SCORE,
  TODOS,
  UPCOMING,
  WEEKLY,
} from '../data/mockDashboard'
import './dashboard.css'

const hhmm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`

function Card({
  title,
  icon,
  right,
  mock,
  children,
}: {
  title: string
  icon: string
  right?: React.ReactNode
  /**
   * 붙일 집계 API 가 아직 없어 **화면에 박아둔 값**을 그리는 카드.
   *
   * ★ 배포본을 처음 열어본 사람이 대시보드만 보고 "전부 목업"이라고 판단한 적이 있다.
   *   숫자가 그럴듯할수록 오해가 커진다 — 비어 있는 카드보다 **차 있는 카드가 더 위험하다.**
   */
  mock?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="card-sec" style={{ marginBottom: 0 }}>
      <div className="card-sec-h">
        <div className="t">
          <span className="ico">
            <Icon name={icon} size={15} />
          </span>
          {title}
        </div>
        {(right || mock) && (
          <div className="r">
            {mock && <span className="mk supplement" title="붙일 집계 API가 아직 없습니다">표시용 예시</span>}
            {right}
          </div>
        )}
      </div>
      {children}
    </section>
  )
}

/** 로컬 기준 오늘. 서버가 yyyy-MM-dd 를 받으므로 UTC 로 넘기면 하루가 밀린다 */
function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const DATE_LABEL = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
}).format(new Date())

export function Dashboard() {
  const { academyId, academies } = useAcademy()

  /* ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다.
     from·to 를 같은 날로 줘서 **오늘 하루** 집계를 받는다(statistics.ts 주석). */
  const today = todayStr()
  const params = useMemo(
    () => ({ academyId: academyId ?? undefined, year: Number(today.slice(0, 4)), from: today, to: today }),
    [academyId, today],
  )
  const stats = useServerData({
    fetcher: getStatistics,
    params,
    errorMessage: '오늘 집계를 불러오지 못했습니다.',
  })

  const st = stats.data
  const by = st?.attendance.byStatus ?? {}
  /* ★ 집계 전과 0을 구분한다. attendanceRate 가 null 이면 아직 안 잡힌 날이라
     0%로 그리면 "전원 결석"으로 보인다. */
  const counted = st ? st.attendance.attendanceRate !== null : false
  const present = by.PRESENT ?? 0
  const late = by.LATE ?? 0
  const absent = by.ABSENT ?? 0
  const enrolled = st?.students.enrolled ?? 0
  const rate = st?.attendance.attendanceRate ?? 0
  const arrived = present + late

  const branchName = academies.find((x) => x.id === academyId)?.acadNm ?? ''
  const who = getLoginId() ?? ''

  const maxWeekly = Math.max(...WEEKLY.map((w) => w.arrived + w.late + w.absent))
  /* 순공 랭킹은 집계가 준다. 이름·분만 오고 반은 없다 */
  const ranking = st?.studyTime.ranking ?? []
  const maxRank = ranking[0]?.minutes ?? 1
  /* 청구액이 0이면 나눌 수 없다 — 0으로 나누면 NaN 이 그대로 화면에 찍힌다 */
  const billed = st?.revenue.billedAmount ?? 0
  const collectRate = billed > 0 ? Math.round(((st?.revenue.receivedAmount ?? 0) / billed) * 100) : 0

  return (
    <>
      <div className="dash-head">
        <div>
          <div className="greet">
            안녕하세요, <b>{who}</b>님
          </div>
          <div className="sub">
            {DATE_LABEL}
            {branchName && ` · ${branchName}지점`}
          </div>
        </div>
        <div className="right">

          <Link className="btn" to="/s/message-send">
            <Icon name="send" size={14} /> 공지 발송
          </Link>
          <Link className="btn pri" to="/s/student-enroll">
            <Icon name="user-plus" size={14} /> 신규 접수
          </Link>
        </div>
      </div>

      {stats.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {stats.error}
        </div>
      )}

      {/* ── 오늘 출결 — GET /statistics (from=to=오늘) ──
           ★ 집계 전(attendanceRate === null)과 0을 구분한다. 0%로 그리면 전원 결석으로 보인다 */}
      {!stats.loading && !counted && (
        <div className="note-box">
          오늘({today}) 출결이 <b>아직 집계되지 않았습니다.</b> 등원 태깅이 들어오면 채워집니다.
        </div>
      )}
      <div className="att-strip">
        <div className="att-cell lead">
          <div className="l">
            <Icon name="scan-line" size={13} /> 오늘 등원률
          </div>
          <div className="v">
            {counted ? rate : '—'}
            <small>%</small>
          </div>
          <div className="d">
            {arrived} / {enrolled}명
          </div>
          <div className="bar">
            <i style={{ width: `${counted ? rate : 0}%` }} />
          </div>
        </div>
        <div className="att-cell">
          <div className="l">
            <Icon name="log-in" size={13} /> 정상 등원
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {present}
          </div>
          <div className="d">명</div>
        </div>
        <div className="att-cell warn">
          <div className="l">
            <Icon name="clock" size={13} /> 지각
          </div>
          <div className="v">{late}</div>
          <div className="d">명</div>
        </div>
        <div className="att-cell urgent">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 무단 미등원
          </div>
          <div className="v">{absent}</div>
          <div className="d">
            <Link to="/s/attendance">확인 필요 →</Link>
          </div>
        </div>
        <div className="att-cell">
          <div className="l">
            <Icon name="check-check" size={13} /> 사유 승인
          </div>
          <div className="v" style={{ color: 'var(--blue)' }}>
            <Unfilled reason="집계 응답에 사유 승인 건수가 없다" />
          </div>
          <div className="d">건</div>
        </div>
      </div>

      <div className="dash-grid">
        {/* ── 좌측 ── */}
        <div className="dash-col">
          <Card
            title="오늘 처리할 일"
            mock
            icon="list-checks"
            right={<span className="mk brandnew">{TODOS.filter((t) => t.tone === 'urgent').length}건 긴급</span>}
          >
            <div className="todo-list">
              {TODOS.map((t) => (
                <Link className={`todo ${t.tone}`} to={t.to} key={t.id}>
                  <span className="ic">
                    <Icon name={t.icon} size={16} />
                  </span>
                  <div className="body">
                    <div className="lb">{t.label}</div>
                    <div className="hint">{t.hint}</div>
                  </div>
                  <div className="cnt">
                    {t.count}
                    <small>{t.unit}</small>
                  </div>
                  <span className="go">
                    <Icon name="chevron-right" size={16} />
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <Card title="주간 출결 추이" icon="bar-chart-3" mock>
            <div className="card-sec-b">
              <div className="wk-chart">
                {WEEKLY.map((w, i) => {
                  const total = w.arrived + w.late + w.absent
                  const h = (n: number) => `${(n / maxWeekly) * 100}%`
                  return (
                    <div className={`wk-day${i === WEEKLY.length - 1 ? ' today' : ''}`} key={w.d}>
                      <div className="wk-stack" title={`등원 ${w.arrived} · 지각 ${w.late} · 결석 ${w.absent}`}>
                        <i className="ab" style={{ height: h(w.absent) }} />
                        <i className="la" style={{ height: h(w.late) }} />
                        <i className="ar" style={{ height: h(w.arrived) }} />
                      </div>
                      <div className="lb">
                        <b>{w.dow}</b>
                        {w.d}
                        <br />
                        <span style={{ fontSize: 10 }}>{Math.round((w.arrived / total) * 100)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="wk-legend">
                <span>
                  <span className="sw" style={{ background: 'var(--mint)' }} />
                  정상 등원
                </span>
                <span>
                  <span className="sw" style={{ background: 'var(--amber)' }} />
                  지각
                </span>
                <span>
                  <span className="sw" style={{ background: 'var(--red)' }} />
                  결석
                </span>
              </div>
            </div>
          </Card>

          <div className="mini-grid">
            <Card title="급식" icon="utensils">
              <div className="mini-b">
                <div className="big">
                  {st?.meals.appliedTotal ?? 0}
                  <small>식</small>
                </div>
                <div className="sub">오늘 신청</div>
                <div className="track">
                  <i
                    style={{
                      width: `${enrolled > 0 ? Math.min(100, ((st?.meals.appliedTotal ?? 0) / enrolled) * 100) : 0}%`,
                      background: 'var(--mint)',
                    }}
                  />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  신청 마감일 · 미결제 <Unfilled reason="집계 응답에 없다. 급식 관리 화면에서 본다" />
                </div>
              </div>
            </Card>

            <Card title="수납" icon="credit-card">
              <div className="mini-b">
                <div className="big">
                  {collectRate}
                  <small>%</small>
                </div>
                <div className="sub">
                  {(st?.revenue.receivedAmount ?? 0).toLocaleString()} /{' '}
                  {(st?.revenue.billedAmount ?? 0).toLocaleString()}원
                </div>
                <div className="track">
                  <i style={{ width: `${collectRate}%`, background: 'var(--blue)' }} />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  미납 <b style={{ color: 'var(--red)' }}>{(st?.revenue.unpaidAmount ?? 0).toLocaleString()}원</b>
                  {' · '}
                  인원 <Unfilled reason="집계는 금액만 준다. 인원은 수납현황에서 본다" />
                </div>
              </div>
            </Card>

            <Card title="성적"
              mock
              icon="line-chart"
            >
              <div className="mini-b">
                <div className="big">
                  {SCORE.synced}
                  <small>/ {SCORE.total}</small>
                </div>
                <div className="sub">{SCORE.round} 반영</div>
                <div className="track">
                  <i style={{ width: `${(SCORE.synced / SCORE.total) * 100}%`, background: 'var(--violet)' }} />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  전 회차 대비 평균{' '}
                  <b style={{ color: 'var(--green)' }}>
                    ▲ {SCORE.avgDelta.toFixed(1)}
                  </b>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* ── 우측 ── */}
        <div className="dash-col">
          <Card
            title="실시간 활동"
            mock
            icon="zap"
            right={
              <span className="mk verified">
                <Icon name="zap" size={11} /> 수신 중
              </span>
            }
          >
            <div className="act-list">
              {ACTIVITIES.map((v) => (
                <div className="act" key={v.at + v.text}>
                  <span className="at">{v.at}</span>
                  <span className={`dot ${v.tone}`} />
                  <span className="tx">
                    {v.who && <b>{v.who}</b>} {v.text}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="학습계획 이행"
            mock
            icon="list-checks"
            right={
              <Link to="/s/learning-plan" style={{ fontSize: 11.5, color: 'var(--mint-d)', fontWeight: 700 }}>
                학생별 보기
              </Link>
            }
          >
            <div className="card-sec-b">
              <div className="plan-sum">
                <div className="cell">
                  <div className="k">이행 O</div>
                  <div className="v" style={{ color: 'var(--mint-d)' }}>
                    {PLAN.done.toLocaleString()}
                  </div>
                </div>
                <div className="cell">
                  <div className="k">미이행 X</div>
                  <div className="v" style={{ color: 'var(--red)' }}>
                    {PLAN.missed}
                  </div>
                </div>
                <div className="cell">
                  <div className="k">미체크</div>
                  <div className="v" style={{ color: 'var(--muted)' }}>
                    {PLAN.unchecked}
                  </div>
                </div>
                <div className="cell">
                  <div className="k">계획 작성</div>
                  <div className="v">
                    {PLAN.written}
                    <small>/{PLAN.enrolled}</small>
                  </div>
                </div>
              </div>

              <div className="plan-classes">
                {PLAN_BY_CLASS.map((c) => {
                  const rate = Math.round((c.o / (c.o + c.x)) * 100)
                  return (
                    <div className="pc-row" key={c.classNo}>
                      <span className="nm">
                        {c.classNo}
                        <span>{c.teacher}</span>
                      </span>
                      <span className="track">
                        <i
                          style={{
                            width: `${rate}%`,
                            background: rate >= 85 ? 'var(--mint)' : rate >= 75 ? 'var(--amber)' : 'var(--red)',
                          }}
                        />
                      </span>
                      <span className="pct">{rate}%</span>
                      {c.unwritten > 0 && (
                        <span className="un" title="오늘 계획 미작성">
                          미작성 {c.unwritten}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="plan-foot">
                이행 표시는 <b>O / X</b> 2종입니다. 계획은 학생이 세우고, 담임은 이행여부·통계만 확인합니다.
              </div>
            </div>
          </Card>

          <Card title="순공시간 랭킹" icon="trophy" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>오늘</span>}>
            <div className="rank-list">
              {ranking.length === 0 && (
                <div className="sub" style={{ padding: '10px 2px' }}>
                  오늘 순공시간 기록이 아직 없습니다.
                </div>
              )}
              {ranking.map((r, i) => (
                <div className={`rank-row${i < 3 ? ` top${i + 1}` : ''}`} key={`${r.name}-${i}`}>
                  <span className="no">{i + 1}</span>
                  <div>
                    <div className="who">
                      {r.name}
                      {/* 집계 응답에 반이 없다 — 학원생 검색에서 본다 */}
                    </div>
                    <div className="track">
                      <i style={{ width: `${maxRank > 0 ? (r.minutes / maxRank) * 100 : 0}%` }} />
                    </div>
                  </div>
                  <span className="tm">{hhmm(r.minutes)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="최근 공지"
            mock
            icon="bell"
            right={
              <Link to="/s/chat" style={{ fontSize: 11.5, color: 'var(--mint-d)', fontWeight: 700 }}>
                전체 보기
              </Link>
            }
          >
            <div className="simple-list">
              {NOTICES.map((n) => (
                <div className="simple-row" key={n.title}>
                  <span className="mk supplement">{n.scope}</span>
                  <span className="t">{n.title}</span>
                  <span className="meta">
                    {n.read}/{n.total} 열람
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card title="다가오는 일정"
            mock
            icon="calendar-days"
          >
            <div className="simple-list">
              {UPCOMING.map((u) => (
                <div className="simple-row" key={u.title}>
                  <span className="dday">{u.dday}</span>
                  <span className="t">{u.title}</span>
                  <span className="meta">{u.date}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
