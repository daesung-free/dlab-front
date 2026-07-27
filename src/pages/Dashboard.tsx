import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import {
  ACTIVITIES,
  ATTENDANCE,
  ME,
  MEAL,
  NOTICES,
  PAYMENT,
  RANKING,
  SCORE,
  TODAY_LABEL,
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
  children,
}: {
  title: string
  icon: string
  right?: React.ReactNode
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
        {right && <div className="r">{right}</div>}
      </div>
      {children}
    </section>
  )
}

export function Dashboard() {
  const a = ATTENDANCE
  const rate = Math.round((a.arrived / a.enrolled) * 100)
  const maxWeekly = Math.max(...WEEKLY.map((w) => w.arrived + w.late + w.absent))
  const maxRank = RANKING[0].min
  const collectRate = Math.round((PAYMENT.collected / PAYMENT.target) * 100)

  return (
    <>
      <div className="dash-head">
        <div>
          <div className="greet">
            안녕하세요, <b>{ME.name}</b>님
          </div>
          <div className="sub">
            {TODAY_LABEL} · {ME.branch}지점 · {ME.role}
          </div>
        </div>
        <div className="right">
          <button className="btn">
            <Icon name="building-2" size={14} /> {ME.branch}지점 ▾
          </button>
          <Link className="btn" to="/s/message-send">
            <Icon name="send" size={14} /> 공지 발송
          </Link>
          <Link className="btn pri" to="/s/student-enroll">
            <Icon name="user-plus" size={14} /> 신규 접수
          </Link>
        </div>
      </div>

      {/* ── 오늘 출결 ── */}
      <div className="att-strip">
        <div className="att-cell lead">
          <div className="l">
            <Icon name="scan-line" size={13} /> 오늘 등원률
          </div>
          <div className="v">
            {rate}
            <small>%</small>
          </div>
          <div className="d">
            {a.arrived} / {a.enrolled}명
          </div>
          <div className="bar">
            <i style={{ width: `${rate}%` }} />
          </div>
        </div>
        <div className="att-cell">
          <div className="l">
            <Icon name="log-in" size={13} /> 정상 등원
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {a.arrived}
          </div>
          <div className="d">명</div>
        </div>
        <div className="att-cell warn">
          <div className="l">
            <Icon name="clock" size={13} /> 지각
          </div>
          <div className="v">{a.late}</div>
          <div className="d">알림톡 발송 완료</div>
        </div>
        <div className="att-cell urgent">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 무단 미등원
          </div>
          <div className="v">{a.missing}</div>
          <div className="d">
            <Link to="/s/attendance">확인 필요 →</Link>
          </div>
        </div>
        <div className="att-cell">
          <div className="l">
            <Icon name="check-check" size={13} /> 사유 승인
          </div>
          <div className="v" style={{ color: 'var(--blue)' }}>
            {a.excused}
          </div>
          <div className="d">건 처리됨</div>
        </div>
      </div>

      <div className="dash-grid">
        {/* ── 좌측 ── */}
        <div className="dash-col">
          <Card
            title="오늘 처리할 일"
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

          <Card title="주간 출결 추이" icon="bar-chart-3" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>최근 5영업일</span>}>
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
                  {MEAL.today}
                  <small>식</small>
                </div>
                <div className="sub">오늘 식수 · 이달 누계 {MEAL.month.toLocaleString()}식</div>
                <div className="track">
                  <i style={{ width: `${(MEAL.today / 296) * 100}%`, background: 'var(--mint)' }} />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  6월 신청 마감 <b style={{ color: 'var(--amber)' }}>{MEAL.deadline}</b> · 미결제 {MEAL.unpaid}건
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
                  {PAYMENT.collected.toLocaleString()} / {PAYMENT.target.toLocaleString()}만원
                </div>
                <div className="track">
                  <i style={{ width: `${collectRate}%`, background: 'var(--blue)' }} />
                </div>
                <div className="sub" style={{ marginTop: 7 }}>
                  미납 <b style={{ color: 'var(--red)' }}>{PAYMENT.unpaidCount}명</b> ·{' '}
                  {PAYMENT.unpaidAmount.toLocaleString()}만원
                </div>
              </div>
            </Card>

            <Card title="성적" icon="line-chart">
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

          <Card title="순공시간 랭킹" icon="trophy" right={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>오늘</span>}>
            <div className="rank-list">
              {RANKING.map((r) => (
                <div className={`rank-row${r.rank <= 3 ? ` top${r.rank}` : ''}`} key={r.rank}>
                  <span className="no">{r.rank}</span>
                  <div>
                    <div className="who">
                      {r.name}
                      <span>{r.classNo}</span>
                    </div>
                    <div className="track">
                      <i style={{ width: `${(r.min / maxRank) * 100}%` }} />
                    </div>
                  </div>
                  <span className="tm">{hhmm(r.min)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card
            title="최근 공지"
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

          <Card title="다가오는 일정" icon="calendar-days">
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
