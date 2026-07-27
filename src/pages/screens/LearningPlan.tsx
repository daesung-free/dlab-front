import { useMemo, useState } from 'react'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import './plan.css'

/* ============================================================================
 * F-4.11-2 주·일 학습 계획 관리 — 신규개발-요구사항신규
 *
 * 실행가이드가 FE 5순위 + 별도 일정 버퍼를 지정한 최대 공수 단일화면.
 *   "이 프로젝트에서 가장 이질적이고 공수가 큰 화면 — 별도 일정 버퍼 필요"
 *   "이질적 화면을 일찍 손대면 공통 컴포넌트가 그 화면에 맞춰 왜곡될 위험"
 *
 * 0723 미팅 반영 9개 항목을 ①~⑨ 주석으로 표시했다.
 * ※ 교시 20분 세분 편집은 UI 복잡도로 개발팀 반대의견 회신 예정 — 반영하지 않음.
 * ========================================================================== */

/* ── ⑥ 탐구1 / 탐구2 분리 + 과목 커스터마이즈 ── */
interface Subject {
  key: string
  label: string
  short: string
  color: string
  /** 학생별 커스터마이즈 가능 슬롯 (탐구 과목명 등) */
  custom?: boolean
}

const SUBJECTS: Subject[] = [
  { key: 'kor', label: '국어', short: '국', color: '#0E9E8E' },
  { key: 'math', label: '수학', short: '수', color: '#3B6FE0' },
  { key: 'eng', label: '영어', short: '영', color: '#6C5CE0' },
  { key: 'inq1', label: '물리Ⅱ', short: '탐1', color: '#E8920F', custom: true },
  { key: 'inq2', label: '지구과학', short: '탐2', color: '#E0533D', custom: true },
  { key: 'etc', label: '기타', short: '기타', color: '#8B94A3' },
]

const SUB = Object.fromEntries(SUBJECTS.map((s) => [s.key, s])) as Record<string, Subject>

/** 학습형태 — learning_plan_options 드롭다운 마스터 */
const TYPES = ['개념', '문제풀이', '복습', '인강', '테스트', '자습'] as const
type StudyType = (typeof TYPES)[number]

/* ── ① 점심·저녁 시간대에도 학습 입력을 허용한다 ── */
interface Period {
  key: string
  label: string
  time: string
  /** 식사 시간대 — 입력은 허용하되 시각적으로 구분 */
  meal?: boolean
}

const PERIODS: Period[] = [
  { key: 'p1', label: '1교시', time: '08:00~08:50' },
  { key: 'p2', label: '2교시', time: '09:00~09:50' },
  { key: 'p3', label: '3교시', time: '10:00~10:50' },
  { key: 'p4', label: '4교시', time: '11:00~11:50' },
  { key: 'lunch', label: '점심', time: '12:00~13:00', meal: true },
  { key: 'p5', label: '5교시', time: '13:00~13:50' },
  { key: 'p6', label: '6교시', time: '14:00~14:50' },
  { key: 'p7', label: '7교시', time: '15:00~15:50' },
  { key: 'p8', label: '8교시', time: '16:00~16:50' },
  { key: 'dinner', label: '저녁', time: '17:00~18:00', meal: true },
  { key: 'p9', label: '9교시', time: '18:00~18:50' },
  { key: 'p10', label: '10교시', time: '19:00~19:50' },
  { key: 'p11', label: '11교시', time: '20:00~20:50' },
  { key: 'p12', label: '12교시', time: '21:00~21:50' },
]

/** 2026-06-01(월) ~ 06-07(일) */
const DAYS = [
  { d: 1, dow: '월' },
  { d: 2, dow: '화' },
  { d: 3, dow: '수' },
  { d: 4, dow: '목' },
  { d: 5, dow: '금' },
  { d: 6, dow: '토' },
  { d: 7, dow: '일' },
]

/* ── ⑨ 연간 행사 마스터(F-4.11-10) 반영 — 해당일 자동 차단 ── */
const EVENTS: Record<number, string> = {
  4: '6월 평가원 모의고사 (종일)',
}

/* ── 셀 ── */
interface Cell {
  subject: string
  type: StudyType
  content: string
  /** 파란색 = 관리자(교사) 편집 영역. 경계 정의가 I-7 */
  teacher?: boolean
  /** 이행률 0~100 */
  done: number
}

const CONTENTS: Record<string, string[]> = {
  kor: ['언매 기출 2회독', '문학 EBS 연계', '독서 지문 분석', '화작 실전 세트'],
  math: ['미적 킬러 3세트', '수1 유형 복습', '기출 오답 정리', '실전 모의 1회'],
  eng: ['빈칸추론 20문항', '어법 정리', 'EBS 수특 3강', '단어 시험 대비'],
  inq1: ['역학 개념 복습', '전자기 문제풀이', '기출 3개년'],
  inq2: ['우주 단원 개념', '신유형 세트', '지구의 역사 정리'],
  etc: ['주간 오답 정리', '데일리 테스트', '학습 계획 점검'],
}

/** 결정적 생성 — 다시 열어도 같은 계획이 나온다 */
function buildGrid(mode: string): Record<string, Record<number, Cell | null>> {
  const g: Record<string, Record<number, Cell | null>> = {}
  const seed = mode.length

  PERIODS.forEach((p, pi) => {
    g[p.key] = {}
    DAYS.forEach((day) => {
      const i = pi * 7 + day.d + seed
      // 모의고사일은 계획 입력 자체가 차단된다
      if (EVENTS[day.d]) {
        g[p.key][day.d] = null
        return
      }
      // 점심·저녁은 절반 정도만 채워진다(①: 허용하되 강제는 아님)
      if (p.meal && i % 3 !== 0) {
        g[p.key][day.d] = null
        return
      }
      // 주말은 의무자습 토글에 따라 비는 칸이 많다
      const weekend = day.d >= 6
      if (weekend && i % 4 === 1) {
        g[p.key][day.d] = null
        return
      }

      const sub = SUBJECTS[i % SUBJECTS.length]
      const list = CONTENTS[sub.key]
      return (g[p.key][day.d] = {
        subject: sub.key,
        type: TYPES[i % TYPES.length],
        content: list[i % list.length],
        // 1·2교시와 마지막 교시는 교사가 편성한 고정 시간대라는 가정
        teacher: pi <= 1 || pi >= PERIODS.length - 1,
        done: [100, 100, 100, 70, 45, 0, 90, 60][i % 8],
      })
    })
  })
  return g
}

/* ── 모드 (⑦ 주중/주말 × 모의고사/학습) ── */
const SPANS = [
  { key: 'week', label: '주중' },
  { key: 'weekend', label: '주말' },
]
const MODES = [
  { key: 'study', label: '학습' },
  { key: 'exam', label: '모의고사' },
]

/* ── ⑧ 이행 표시 방식 2안 — 개발팀 회신 전이라 둘 다 그린다 ── */
const DONE_VIEWS = [
  { key: 'pct', label: '1안 · 바 + %' },
  { key: 'mark', label: '2안 · ○△빈칸' },
]

function markOf(done: number) {
  if (done >= 90) return { ch: '○', cls: 'full' }
  if (done > 0) return { ch: '△', cls: 'part' }
  return { ch: '·', cls: 'none' }
}

/* ── 도넛 차트 ── */
function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1
  const R = 52
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <svg viewBox="0 0 140 140" style={{ width: 150, height: 150 }}>
      <g transform="translate(70,70) rotate(-90)">
        {data.map((d) => {
          const frac = d.value / total
          const dash = frac * C
          const el = (
            <circle
              key={d.label}
              r={R}
              fill="none"
              stroke={d.color}
              strokeWidth={20}
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-acc}
            />
          )
          acc += dash
          return el
        })}
      </g>
      <text x="70" y="66" textAnchor="middle" fontSize="20" fontWeight="800" fill="#212934">
        {Math.round(total / 60)}
      </text>
      <text x="70" y="82" textAnchor="middle" fontSize="10" fill="#8B94A3">
        시간 / 주
      </text>
    </svg>
  )
}

function Content() {
  const [span, setSpan] = useState('week')
  const [mode, setMode] = useState('study')
  const [doneView, setDoneView] = useState('pct')
  const [weekendStudy, setWeekendStudy] = useState(true)

  const grid = useMemo(() => buildGrid(`${span}-${mode}`), [span, mode])

  /* 과목별 누계 (교시 1칸 = 50분) */
  const totals = useMemo(() => {
    const m = new Map<string, { planned: number; actual: number }>()
    for (const s of SUBJECTS) m.set(s.key, { planned: 0, actual: 0 })
    for (const p of PERIODS) {
      for (const day of DAYS) {
        if (day.d >= 6 && !weekendStudy) continue
        const c = grid[p.key]?.[day.d]
        if (!c) continue
        const cur = m.get(c.subject)!
        cur.planned += 50
        cur.actual += Math.round((50 * c.done) / 100)
      }
    }
    return m
  }, [grid, weekendStudy])

  const plannedTotal = SUBJECTS.reduce((a, s) => a + (totals.get(s.key)?.planned ?? 0), 0) || 1
  const actualTotal = SUBJECTS.reduce((a, s) => a + (totals.get(s.key)?.actual ?? 0), 0)

  /* ⑤ 과목별 비율 — 3:4:1:2 형태로 표기 */
  const ratio = useMemo(() => {
    const main = SUBJECTS.filter((s) => s.key !== 'etc')
    const vals = main.map((s) => totals.get(s.key)?.planned ?? 0)
    const min = Math.min(...vals.filter((v) => v > 0)) || 1
    return main.map((s, i) => ({ s, n: Math.max(1, Math.round(vals[i] / min)) }))
  }, [totals])

  /* 유형별 계획 대비 실제 */
  const byType = useMemo(() => {
    const m = new Map<StudyType, { planned: number; actual: number }>()
    for (const t of TYPES) m.set(t, { planned: 0, actual: 0 })
    for (const p of PERIODS) {
      for (const day of DAYS) {
        if (day.d >= 6 && !weekendStudy) continue
        const c = grid[p.key]?.[day.d]
        if (!c) continue
        const cur = m.get(c.type)!
        cur.planned += 50
        cur.actual += Math.round((50 * c.done) / 100)
      }
    }
    return m
  }, [grid, weekendStudy])

  const maxType = Math.max(1, ...Array.from(byType.values()).map((v) => v.planned))

  const donutData = SUBJECTS.filter((s) => (totals.get(s.key)?.planned ?? 0) > 0).map((s) => ({
    label: s.label,
    value: totals.get(s.key)!.planned,
    color: s.color,
  }))

  return (
    <div className="p-plan">
      <div className="blocked-note">
        <span className="ic">
          <Icon name="triangle-alert" size={16} />
        </span>
        <div>
          <div className="tt">이 화면을 막고 있는 미확정 3건 + 회신 대기 1건</div>
          <div className="tx">
            <b>#27 / I-7 (중)</b> — <b>'파란색' 항목 정의</b>. 선생님 편집 영역과 학생 입력 영역의 경계가
            확정돼야 <code>PATCH items</code>의 권한 분기를 짤 수 있습니다. 아래 그리드에서 파란 셀이 교사 편집
            영역이라는 가정이며, <b>확정본이 아닙니다.</b>
            <br />
            <b>#39 / I-19 (높음)</b> — <b>이행 표시 방식</b>. %+드래그(1안) / ○△빈칸(2안) 중 미확정이라{' '}
            <b>두 안을 모두 구현해 토글</b>로 비교할 수 있게 했습니다. 상담 리포트의 별점(1~5)과 층위도 함께
            정리되어야 합니다.
            <br />
            <b>#41 / I-21 (중)</b> — <b>연간 행사 마스터</b> 입력 주체·행사 유형·반영 규칙. 아래 <b>6/4 목요일</b>이
            행사로 차단된 예시입니다.
            <br />
            <span style={{ color: 'var(--muted)' }}>
              ※ 교시 <b>20분 세분 편집</b>은 UI 복잡도 대비 실익이 낮다는 개발팀 의견을 회신 예정이라 반영하지
              않았습니다 — 지금 구조는 교시 단위입니다.
            </span>
          </div>
        </div>
      </div>

      {/* ── 컨트롤 바 ── */}
      <div className="plan-bar">
        <div className="wk">
          <button type="button" aria-label="이전 주">
            <Icon name="chevron-left" size={15} />
          </button>
          <span className="wk-label">2026.06.01 ~ 06.07</span>
          <button type="button" aria-label="다음 주">
            <Icon name="chevron-right" size={15} />
          </button>
        </div>

        <div className="bar-sep" />

        {/* ⑦ 주중/주말 × 모의고사/학습 모드 */}
        <div className="bar-group">
          <span className="lbl">구간</span>
          {SPANS.map((s) => (
            <button key={s.key} className={`chip${span === s.key ? ' on' : ''}`} onClick={() => setSpan(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="bar-group">
          <span className="lbl">모드</span>
          {MODES.map((m) => (
            <button key={m.key} className={`chip${mode === m.key ? ' on' : ''}`} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>

        <div className="bar-sep" />

        {/* 주말 의무자습 토글 */}
        <button className={`chip${weekendStudy ? ' on' : ''}`} onClick={() => setWeekendStudy(!weekendStudy)}>
          주말 의무자습
        </button>

        <div className="bar-right">
          {/* ⑧ 이행 표시 2안 토글 */}
          <div className="bar-group">
            <span className="lbl">이행 표시</span>
            {DONE_VIEWS.map((v) => (
              <button
                key={v.key}
                className={`chip${doneView === v.key ? ' on' : ''}`}
                onClick={() => setDoneView(v.key)}
                title="#39 / I-19 확정 대기 — 두 안을 나란히 비교"
              >
                {v.label}
              </button>
            ))}
          </div>
          {/* ② 지난주 계획 복사 */}
          <button className="btn">
            <Icon name="copy" size={14} /> 지난주 복사
          </button>
          <button className="btn pri">
            <Icon name="save" size={14} /> 저장
          </button>
        </div>
      </div>

      {/* ── 교시 × 요일 그리드 ── */}
      <div className="grid-wrap">
        <div className="grid-scroll">
          <table className="pg">
            <thead>
              <tr>
                <th className="pcol">교시</th>
                {DAYS.map((day) => (
                  <th
                    key={day.d}
                    className={EVENTS[day.d] ? 'event' : day.dow === '일' ? 'sun' : day.dow === '토' ? 'sat' : ''}
                  >
                    06/{String(day.d).padStart(2, '0')}
                    <span className="dw">{day.dow}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.map((p) => (
                <tr key={p.key} className={p.meal ? 'break' : undefined}>
                  <th className="pcol">
                    {p.label}
                    <span className="tm">{p.time}</span>
                  </th>
                  {DAYS.map((day) => {
                    const ev = EVENTS[day.d]
                    if (ev) {
                      return (
                        <td key={day.d} className="locked">
                          {p.key === 'p1' ? (
                            <div className="event-cell" style={{ minHeight: 58 }}>
                              <Icon name="lock" size={13} />
                              {ev}
                            </div>
                          ) : (
                            <div className="cell locked" />
                          )}
                        </td>
                      )
                    }

                    const dim = day.d >= 6 && !weekendStudy
                    const c = grid[p.key]?.[day.d]

                    if (!c) {
                      return (
                        <td key={day.d} style={dim ? { opacity: 0.35 } : undefined}>
                          <div className="cell empty">
                            <div className="ct">{p.meal ? '식사' : '—'}</div>
                          </div>
                        </td>
                      )
                    }

                    const s = SUB[c.subject]
                    const mk = markOf(c.done)

                    return (
                      <td key={day.d} style={dim ? { opacity: 0.35 } : undefined}>
                        <div
                          className={`cell${c.teacher ? ' teacher' : ''}`}
                          title={
                            c.teacher
                              ? `${s.label} · ${c.type} — 교사 편집 영역 (I-7 확정 대기)`
                              : `${s.label} · ${c.type} — 학생 입력`
                          }
                        >
                          <div className="ch">
                            <span className="sub" style={{ background: s.color }}>
                              {s.short}
                            </span>
                            <span className="ty">{c.type}</span>
                          </div>
                          <div className="ct">{c.content}</div>

                          {doneView === 'pct' ? (
                            <>
                              <div className="done-bar">
                                <i
                                  className={c.done === 0 ? 'zero' : c.done < 70 ? 'low' : ''}
                                  style={{ width: `${c.done}%` }}
                                />
                              </div>
                              <div className="done-pct">{c.done}%</div>
                            </>
                          ) : (
                            <div className={`done-mark ${mk.cls}`}>{mk.ch}</div>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 하단 분석 ── */}
      <div className="an-grid">
        {/* ④⑤ 과목별 누계 + 비율 가로 게이지 */}
        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="bar-chart-3" size={15} />
              </span>
              과목별 누계 · 비율
            </div>
            <div className="r">
              <button className="btn" style={{ padding: '5px 11px', fontSize: 11.5 }}>
                <Icon name="pencil" size={12} /> 목표 비율 편집
              </button>
            </div>
          </div>
          <div className="card-sec-b">
            {SUBJECTS.map((s) => {
              const t = totals.get(s.key)!
              const pct = Math.round((t.planned / plannedTotal) * 100)
              const donePct = t.planned ? Math.round((t.actual / t.planned) * 100) : 0
              return (
                <div className="gauge-row" key={s.key}>
                  <span className="gl" style={{ color: s.color }}>
                    {s.label}
                    {s.custom && (
                      <span style={{ fontSize: 9, color: 'var(--muted)', marginLeft: 3 }} title="학생별 커스터마이즈 가능">
                        ✎
                      </span>
                    )}
                  </span>
                  <div className="gauge-track">
                    <i style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                  <span className="gauge-val">
                    <b>{Math.floor(t.planned / 60)}</b>시간 {t.planned % 60}분
                    <br />
                    <span style={{ color: donePct >= 80 ? 'var(--green)' : 'var(--amber)' }}>이행 {donePct}%</span>
                  </span>
                </div>
              )
            })}

            <div className="ratio-line">
              <span>과목 비율</span>
              <b>{ratio.map((r) => r.n).join(' : ')}</b>
              <span style={{ color: 'var(--muted)' }}>({ratio.map((r) => r.s.short).join(' : ')})</span>
              <span style={{ marginLeft: 'auto' }}>
                주간 계획 <b style={{ fontSize: 12.5 }}>{Math.floor(plannedTotal / 60)}h</b> · 실제{' '}
                <b style={{ fontSize: 12.5, color: 'var(--mint-d)' }}>{Math.floor(actualTotal / 60)}h</b>
              </span>
            </div>
          </div>
        </div>

        {/* 계획 대비 실제 비교그래프 (과목 × 유형) */}
        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="trending-up" size={15} />
              </span>
              계획 대비 실제 · 학습형태별
            </div>
          </div>
          <div className="card-sec-b">
            {TYPES.map((t) => {
              const v = byType.get(t)!
              return (
                <div className="cmp-row" key={t}>
                  <span className="cmp-label">{t}</span>
                  <div className="cmp-bars">
                    <div className="cmp-bar">
                      <span className="tag">계획</span>
                      <div className="track">
                        <i style={{ width: `${(v.planned / maxType) * 100}%`, background: 'var(--line)' }} />
                      </div>
                      <span className="num">{Math.floor(v.planned / 60)}h {v.planned % 60}m</span>
                    </div>
                    <div className="cmp-bar">
                      <span className="tag">실제</span>
                      <div className="track">
                        <i
                          style={{
                            width: `${(v.actual / maxType) * 100}%`,
                            background: v.planned && v.actual / v.planned >= 0.8 ? 'var(--mint)' : 'var(--amber)',
                          }}
                        />
                      </div>
                      <span className="num">{Math.floor(v.actual / 60)}h {v.actual % 60}m</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* 주차별 시간·비율 파이 */}
        <div className="card-sec" style={{ marginBottom: 0 }}>
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="pie-chart" size={15} />
              </span>
              주차별 시간 비율
            </div>
          </div>
          <div className="card-sec-b">
            <div className="donut-wrap">
              <Donut data={donutData} />
              <div className="donut-legend">
                {donutData.map((d) => (
                  <div className="dl" key={d.label}>
                    <span className="sw" style={{ background: d.color }} />
                    <span className="nm">{d.label}</span>
                    <span className="vv">{Math.round((d.value / plannedTotal) * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 범례 ── */}
      <div className="note-box plain" style={{ marginTop: 14 }}>
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">그리드 읽는 법</div>
          <div className="tx">
            <span
              style={{
                display: 'inline-block',
                width: 11,
                height: 11,
                background: 'var(--blue-wash)',
                borderLeft: '3px solid var(--blue)',
                verticalAlign: -1,
                marginRight: 4,
              }}
            />
            <b>파란 셀 = 교사 편집 영역</b> (경계는 I-7 확정 대기) · 흰 셀 = 학생 입력 ·{' '}
            <span
              style={{
                display: 'inline-block',
                width: 11,
                height: 11,
                background: '#fdf3e4',
                verticalAlign: -1,
                margin: '0 4px 0 2px',
              }}
            />
            <b>빗금 = 연간 행사로 차단</b>
            <br />
            드롭다운 선택목록(과목·학습형태·교재)은 <code>learning_plan_options</code> 마스터에서 관리하며, 관리자가
            항목을 추가·수정합니다. 교시 시간대와 주말 의무자습 여부도 관리자 편집 대상입니다.
          </div>
        </div>
      </div>
    </div>
  )
}

export const learningPlanMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="calendar-days" size={14} /> 일간 보기
      </button>
      <button className="btn">
        <Icon name="sliders-horizontal" size={14} /> 선택목록 관리
      </button>
    </>
  ),
}
