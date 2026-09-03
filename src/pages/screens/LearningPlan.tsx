import { useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, useServerTable, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { maskName } from '../../lib/mask'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import { listClasses, type ClassGroup } from '../../api/classes'
import {
  getStudentWeek,
  listPlanBoard,
  listPlanOptions,
  type PlanBoardRow,
  type PlanDay,
  type PlanItem,
  type PlanOption,
} from '../../api/learningPlans'
import type { Mockup } from './types'
import './plan.css'

/* F-4.11-2 주·일 학습 계획 — /api/v1/admin/learning-plans
 *
 * 탭 3개가 각각 다른 엔드포인트를 쓴다.
 *   · 학생별 계획   → /learning-plans/students/{id}/weeks  (주 단위 일별 계획)
 *   · 반 이행 현황  → /learning-plans                       (목록. 이 API 는 요청해서 신설됐다)
 *   · 형태·과목     → /learning-plans/options               (마스터)
 *
 * ★ 과목·학습형태를 화면이 하드코딩하지 않는다. 지점·연도마다 다르고 관리자가 바꾼다.
 *   색은 옵션 순서(sortOrder)로 정해 같은 과목이 화면마다 같은 색이 되게 한다.
 *
 * ★ 서버에 없는 것 — docs/API_GAPS.md 참고
 *   · **학습계획 입력 차단일** — 목업의 핵심 주의사항("차단일은 미작성이 아니다")인데
 *     서버에 그 개념이 없다. 지금은 board 의 missingDays 를 그대로 쓴다.
 *     서버가 차단일을 빼고 세는지 확인이 필요하다
 *   · **담임** — board 응답에 없다
 *   · **미체크 상태** — PlanItem.done 이 boolean 이라 O/X 2종뿐이다.
 *     목업은 '미체크(·)'가 따로 있는데, 이행률에서 "아직 안 찍은 것"과 "못 한 것"은 의미가 다르다 */

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 과목 색 — 옵션 순서로 돌려 쓴다. 화면마다 같은 과목이 같은 색이어야 한다 */
const PALETTE = ['#0E9E8E', '#3B6FE0', '#6C5CE0', '#E8920F', '#E0533D', '#2F9E44', '#B4308F']

/** 학습형태 배지 색 — 과목 색과 겹치지 않게 별도 축으로 둔다 */
const FORM_CLASSES = ['verified', 'supplement', 'brandnew']

function minutesOf(hhmm: string | null): number | null {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function dl(m: number): string {
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h === 0) return `${mm}분`
  return mm === 0 ? `${h}시간` : `${h}시간 ${mm}분`
}

/** 주의 시작일에서 7일치 날짜를 만든다. 서버가 빈 날을 빼고 줄 수도 있어 화면이 채운다 */
function weekDates(weekStart: string): string[] {
  const base = new Date(`${weekStart}T00:00:00`)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const shift = (d.getDay() + 6) % 7 // 월요일 기준
  d.setDate(d.getDate() - shift)
  return d.toISOString().slice(0, 10)
}

interface Tally {
  count: number
  minutes: number
  o: number
  x: number
}

function tally(items: PlanItem[]): Tally {
  return {
    count: items.length,
    minutes: items.reduce((a, i) => a + i.durationMinutes, 0),
    o: items.filter((i) => i.done).length,
    x: items.filter((i) => !i.done).length,
  }
}

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('student')
  const [masked, setMasked] = useState(true)
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayStr()))
  const [classId, setClassId] = useState<number | ''>('')
  const [rosterFilter, setRosterFilter] = useState('전체')

  const [classes, setClasses] = useState<ClassGroup[]>([])
  const [options, setOptions] = useState<PlanOption[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [week, setWeek] = useState<PlanDay[]>([])
  const [weekLoading, setWeekLoading] = useState(false)
  const [weekError, setWeekError] = useState<string | null>(null)
  const [dayIndex, setDayIndex] = useState(0)
  const [scope, setScope] = useState<'day' | 'week'>('day')

  // 서버가 주의 7일을 채워서 준다(빈 날도 포함). 화면이 직접 만들지 않고 그대로 쓴다 —
  // 주 시작 요일 기준이 서버와 어긋나면 날짜 매핑이 통째로 밀린다.
  const dates = useMemo(
    () => (week.length > 0 ? week.map((d) => d.date) : weekDates(weekStart)),
    [week, weekStart],
  )
  const weekEnd = dates[dates.length - 1]

  /* ── 마스터 ── */
  useEffect(() => {
    if (academyId === null) return
    let cancelled = false
    void listClasses().then((l) => !cancelled && setClasses(l)).catch(() => undefined)
    // ⚠️ year 를 안 보내면 서버가 500 을 낸다(선택값인데도) — docs/API_GAPS.md 5-10
    void listPlanOptions(academyId, new Date().getFullYear())
      .then((o) => !cancelled && setOptions(o))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [academyId])

  const subjects = useMemo(
    () => options.filter((o) => o.optionType === 'SUBJECT').sort((a, b) => a.sortOrder - b.sortOrder),
    [options],
  )
  const forms = useMemo(
    () => options.filter((o) => o.optionType === 'STUDY_TYPE').sort((a, b) => a.sortOrder - b.sortOrder),
    [options],
  )
  const subjectColor = useMemo(() => {
    const map = new Map<string, string>()
    subjects.forEach((s, i) => map.set(s.label, PALETTE[i % PALETTE.length]))
    return map
  }, [subjects])
  const formClass = useMemo(() => {
    const map = new Map<string, string>()
    forms.forEach((f, i) => map.set(f.label, FORM_CLASSES[i % FORM_CLASSES.length]))
    return map
  }, [forms])

  /* ── 반 이행 현황(목록) ── */
  const boardParams = useMemo(
    () => ({
      academyId: academyId ?? 0,
      from: dates[0],
      to: weekEnd,
      classId: classId === '' ? undefined : classId,
    }),
    [academyId, dates, weekEnd, classId],
  )

  const board = useServerTable({
    fetcher: listPlanBoard,
    params: boardParams,
    pageSize: 20,
    enabled: academyId !== null,
  })

  // 첫 학생 자동 선택
  useEffect(() => {
    if (selectedId === null && board.rows.length > 0) setSelectedId(board.rows[0].enrollmentId)
  }, [board.rows, selectedId])

  /* ── 선택 학생의 주간 계획 ── */
  useEffect(() => {
    if (selectedId === null) {
      setWeek([])
      return
    }
    let cancelled = false
    setWeekLoading(true)
    setWeekError(null)
    getStudentWeek(selectedId, weekStart)
      .then((w) => !cancelled && setWeek(w.days))
      .catch((err) => {
        if (cancelled) return
        setWeekError(err instanceof ApiError ? err.message : '주간 계획을 불러오지 못했습니다.')
        setWeek([])
      })
      .finally(() => !cancelled && setWeekLoading(false))
    return () => {
      cancelled = true
    }
  }, [selectedId, weekStart])

  /** 날짜 → 그날 계획. 서버가 빈 날을 생략해도 화면은 7일을 그린다 */
  const byDate = useMemo(() => new Map(week.map((d) => [d.date, d])), [week])
  const safeDayIndex = Math.min(dayIndex, Math.max(0, dates.length - 1))
  const dayItems = byDate.get(dates[safeDayIndex])?.items ?? []
  const weekItems = useMemo(() => dates.flatMap((d) => byDate.get(d)?.items ?? []), [dates, byDate])
  const scopeItems = scope === 'day' ? dayItems : weekItems
  const t = tally(scopeItems)

  /* 과목별 — 학생이 배분한 시간을 그대로 집계한다 */
  const subjectStats = useMemo(() => {
    const total = scopeItems.reduce((a, i) => a + i.durationMinutes, 0) || 1
    return subjects.map((s) => {
      const own = scopeItems.filter((i) => i.subject === s.label)
      const tl = tally(own)
      return { key: s.label, color: subjectColor.get(s.label) ?? PALETTE[0], ...tl, share: Math.round((tl.minutes / total) * 100) }
    })
  }, [scopeItems, subjects, subjectColor])

  /**
   * 과목 × 학습형태 — 상담에서 쓰는 지표.
   * "수학을 많이 했다"보다 "수학을 인강으로만 했다 / 자습이 하나도 없다"가 상담 재료가 된다.
   */
  const formStats = useMemo(() => {
    const total = scopeItems.reduce((a, i) => a + i.durationMinutes, 0) || 1
    const byForm = forms.map((f) => {
      const own = scopeItems.filter((i) => i.studyType === f.label)
      const min = own.reduce((a, i) => a + i.durationMinutes, 0)
      return { form: f.label, minutes: min, count: own.length, share: Math.round((min / total) * 100) }
    })
    return { byForm, total: scopeItems.reduce((a, i) => a + i.durationMinutes, 0) }
  }, [scopeItems, forms])

  const dayStats = useMemo(
    () =>
      dates.map((date, i) => {
        const d = byDate.get(date)
        return {
          date,
          dow: DOW[new Date(`${date}T00:00:00`).getDay()],
          index: i,
          ...tally(d?.items ?? []),
          copied: d?.copied ?? false,
        }
      }),
    [dates, byDate],
  )

  const filteredRoster = useMemo(() => {
    if (rosterFilter === '미이행') return board.rows.filter((r) => r.totalItems > r.doneItems)
    if (rosterFilter === '미작성') return board.rows.filter((r) => r.missingDays > 0)
    return board.rows
  }, [board.rows, rosterFilter])

  const classRate = useMemo(() => {
    const c = board.rows.reduce((a, r) => a + r.totalItems, 0)
    const o = board.rows.reduce((a, r) => a + r.doneItems, 0)
    return c ? Math.round((o / c) * 100) : 0
  }, [board.rows])

  const rosterColumns: Column<PlanBoardRow>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '84px', mask: 'name', value: (r) => r.studentName },
      { key: 'className', header: '반', width: '58px', align: 'center', value: (r) => r.className ?? '-' },
      { key: 'homeroomTeacherName', header: '담임', width: '78px', align: 'center', value: (r) => r.homeroomTeacherName ?? '미지정' },
      { key: 'totalItems', header: '계획', width: '68px', align: 'right', value: (r) => r.totalItems },
      {
        key: 'plannedMinutes',
        header: '배분 시간',
        width: '104px',
        align: 'right',
        value: (r) => r.plannedMinutes,
        render: (r) => (r.plannedMinutes ? dl(r.plannedMinutes) : '-'),
      },
      {
        key: 'doneItems',
        header: 'O / X',
        width: '92px',
        align: 'center',
        value: (r) => r.doneItems,
        render: (r) => (
          <>
            <b style={{ color: 'var(--mint-d)' }}>{r.doneItems}</b>
            <span style={{ color: 'var(--muted)' }}> / </span>
            <b style={{ color: 'var(--red)' }}>{r.totalItems - r.doneItems}</b>
          </>
        ),
      },
      {
        key: 'completionRate',
        header: '이행률',
        width: '92px',
        align: 'right',
        value: (r) => r.completionRate,
        render: (r) => (
          <b style={{ color: r.completionRate >= 80 ? 'var(--green)' : r.completionRate >= 50 ? 'var(--amber)' : 'var(--red)' }}>
            {r.completionRate}%
          </b>
        ),
      },
      {
        key: 'missingDays',
        header: '미작성일',
        width: '90px',
        align: 'center',
        value: (r) => r.missingDays,
        // countedDays 와 함께 봐야 의미가 있다 — 분모가 며칠인지 모르면 3일이 많은 건지 모른다
        render: (r) =>
          r.missingDays > 0 ? (
            <span className="mk brandnew" title={`집계 대상 ${r.countedDays}일 중`}>
              {r.missingDays} / {r.countedDays}일
            </span>
          ) : (
            <span style={{ color: 'var(--muted)' }}>-</span>
          ),
      },
    ],
    [],
  )

  const selected = board.rows.find((r) => r.enrollmentId === selectedId)

  function shiftWeek(delta: number): void {
    const d = new Date(`${weekStart}T00:00:00`)
    d.setDate(d.getDate() + delta * 7)
    setWeekStart(d.toISOString().slice(0, 10))
  }

  return (
    <div className="p-plan">
      <div className="note-box plain">
        <div className="ic">
          <Icon name="lock" size={17} />
        </div>
        <div>
          <div className="tt">미작성일은 집계 대상일 기준입니다</div>
          <div className="tx">
            예전에는 달력일 기준이라 휴원일도 미작성으로 잡혔는데, 서버가 고쳤습니다.
            제외할 날은 <b>연간 행사에서 &lsquo;학습계획 제외&rsquo;로 등록</b>하면 반영됩니다
            (기본은 꺼져 있어, 등록 전까지는 기존과 같은 값입니다).
            표에는 <b>미작성일 / 집계 대상일</b>을 함께 보여줍니다.
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-range" size={13} /> 조회 주간
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            {dates[0].slice(5)} ~ {weekEnd.slice(5)}
          </div>
          <div className="d">
            <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => shiftWeek(-1)}>
              이전
            </button>{' '}
            <button className="btn" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => shiftWeek(1)}>
              다음
            </button>
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 대상 학생
          </div>
          <div className="v">{board.totalElements}</div>
          <div className="d">{classId === '' ? '전체 반' : classes.find((c) => c.id === classId)?.name}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 반 평균 이행률
          </div>
          <div className="v" style={{ color: classRate >= 80 ? 'var(--green)' : 'var(--amber)' }}>
            {classRate}%
          </div>
          <div className="d">이 페이지 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="pencil" size={13} /> 미작성 학생
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {board.rows.filter((r) => r.missingDays > 0).length}
          </div>
          <div className="d warn">확인 필요</div>
        </div>
      </div>

      {board.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {board.error}
        </div>
      )}

      <Tabs
        items={[
          { key: 'student', label: '학생별 계획' },
          { key: 'roster', label: '반 이행 현황', count: board.totalElements },
          { key: 'master', label: '형태 · 과목 마스터', count: options.length },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {/* ═══ 학생별 계획 ═══ */}
      {tab === 'student' && (
        <div className="layout">
          <section className="panel">
            <div className="panel-h">
              <div className="t">학생 선택</div>
              <div className="c">{filteredRoster.length}명</div>
            </div>
            <div className="filter-row">
              {['전체', '미이행', '미작성'].map((f) => (
                <button key={f} type="button" className={`chip${rosterFilter === f ? ' on' : ''}`} onClick={() => setRosterFilter(f)}>
                  {f}
                </button>
              ))}
            </div>
            <div className="plan-slist">
              {filteredRoster.length === 0 && (
                <div className="dt-empty">{board.loading ? '불러오는 중…' : '해당하는 학생이 없습니다.'}</div>
              )}
              {filteredRoster.map((r) => (
                <button
                  type="button"
                  key={r.enrollmentId}
                  className={`plan-srow${r.enrollmentId === selectedId ? ' on' : ''}`}
                  onClick={() => setSelectedId(r.enrollmentId)}
                >
                  <div className="av">{r.studentName.slice(0, 1)}</div>
                  <div className="info">
                    <div className="n">
                      {masked ? maskName(r.studentName) : r.studentName}
                      <span className="cls">{r.className ?? '-'}</span>
                    </div>
                    <div className="track">
                      <i
                        style={{
                          width: `${r.completionRate}%`,
                          background:
                            r.completionRate >= 80 ? 'var(--mint)' : r.completionRate >= 50 ? 'var(--amber)' : 'var(--red)',
                        }}
                      />
                    </div>
                    <div className="m">
                      계획 {r.totalItems}건 · {r.plannedMinutes ? dl(r.plannedMinutes) : '배분 없음'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <div className="t">
                {selected ? (masked ? maskName(selected.studentName) : selected.studentName) : '학생을 선택하세요'}
                {selected?.className && <span className="cls"> {selected.className}</span>}
              </div>
              <div className="c">
                <MaskToggle masked={masked} onChange={setMasked} />
              </div>
            </div>

            <div className="daypick">
              {dayStats.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className={`dcell${d.index === safeDayIndex ? ' on' : ''}`}
                  onClick={() => {
                    setDayIndex(d.index)
                    setScope('day')
                  }}
                >
                  <b>{d.dow}</b>
                  <span>{d.date.slice(8)}</span>
                  <i>{d.count > 0 ? `${d.count}건` : '-'}</i>
                </button>
              ))}
              <button
                type="button"
                className={`dcell${scope === 'week' ? ' on' : ''}`}
                onClick={() => setScope('week')}
                title="주간 합계"
              >
                <b>주간</b>
                <span>합계</span>
                <i>{weekItems.length}건</i>
              </button>
            </div>

            <div className="panel-body">
              {weekError && (
                <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  {weekError}
                </div>
              )}

              <div className="tot-row">
                <span>
                  계획 <b>{t.count}</b>건
                </span>
                <span>
                  배분 <b>{t.minutes ? dl(t.minutes) : '-'}</b>
                </span>
                <span>
                  이행 <b style={{ color: 'var(--mint-d)' }}>{t.o}</b> / 미이행{' '}
                  <b style={{ color: 'var(--red)' }}>{t.x}</b>
                </span>
                <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 11.5 }}>
                  {scope === 'day' ? dates[safeDayIndex] : `${dates[0]} ~ ${weekEnd}`}
                </span>
              </div>

              {weekLoading ? (
                <div className="plan-empty">불러오는 중…</div>
              ) : (
                <DayPlan items={scopeItems} subjectColor={subjectColor} formClass={formClass} />
              )}

              {/* 과목별 배분 */}
              {subjectStats.length > 0 && (
                <div className="form-stack">
                  <div className="fs-title">과목별 배분 ({scope === 'day' ? '일간' : '주간'})</div>
                  {subjectStats.map((s) => (
                    <div className="subj-row" key={s.key}>
                      <span className="sw" style={{ background: s.color }} />
                      <span className="nm">{s.key}</span>
                      <div className="plan-bar">
                        <i style={{ width: `${s.share}%`, background: s.color }} />
                      </div>
                      <span className="vv">
                        {s.minutes ? dl(s.minutes) : '-'} · {s.share}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* 학습형태별 */}
              {formStats.byForm.length > 0 && (
                <div className="form-stack">
                  <div className="fs-title">학습형태별 ({formStats.total ? dl(formStats.total) : '배분 없음'})</div>
                  {formStats.byForm.map((f) => (
                    <div className="fs-row" key={f.form}>
                      <span className={`mk ${formClass.get(f.form) ?? ''}`}>{f.form}</span>
                      <div className="plan-bar">
                        <i style={{ width: `${f.share}%` }} />
                      </div>
                      <span className="vv">
                        {f.count}건 · {f.minutes ? dl(f.minutes) : '-'} · {f.share}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* ═══ 반 이행 현황 ═══ */}
      {tab === 'roster' && (
        <DataTable
          columns={rosterColumns}
          rows={filteredRoster}
          rowKey={(r) => String(r.enrollmentId)}
          masked={masked}
          loading={board.loading}
          serverPaging={board.serverPaging}
          onRowClick={(r) => {
            setSelectedId(r.enrollmentId)
            setTab('student')
          }}
          countLabel={
            <>
              {dates[0]} ~ {weekEnd} · <b>{board.totalElements}</b>명
            </>
          }
          emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '대상 학생이 없습니다.'}
          toolbar={
            <>
              <select
                className="sel"
                style={{ width: 120 }}
                value={classId}
                onChange={(e) => setClassId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                <option value="">전체 반</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {['전체', '미이행', '미작성'].map((f) => (
                <button key={f} type="button" className={`chip${rosterFilter === f ? ' on' : ''}`} onClick={() => setRosterFilter(f)}>
                  {f}
                </button>
              ))}
              <MaskToggle masked={masked} onChange={setMasked} />
              <ExcelButton filename="학습계획_이행현황" columns={rosterColumns} rows={filteredRoster} masked={masked} />
            </>
          }
        />
      )}

      {/* ═══ 형태 · 과목 마스터 ═══ */}
      {tab === 'master' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="list" size={15} />
              </span>
              형태 · 과목 마스터
            </div>
            <div className="r">
              <button className="btn pri" disabled title="옵션 추가 폼은 다음 단계입니다">
                <Icon name="plus" size={14} /> 항목 추가
              </button>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="split">
              <div>
                <div className="fs-title">과목 ({subjects.length})</div>
                {subjects.length === 0 && <div className="plan-empty">등록된 과목이 없습니다</div>}
                {subjects.map((s) => (
                  <div className="master-row" key={s.id}>
                    <span className="sw" style={{ background: subjectColor.get(s.label) }} />
                    <span className="nm">{s.label}</span>
                    <span className="vv">{s.sortOrder}</span>
                  </div>
                ))}
              </div>
              <div>
                <div className="fs-title">학습형태 ({forms.length})</div>
                {forms.length === 0 && <div className="plan-empty">등록된 학습형태가 없습니다</div>}
                {forms.map((f) => (
                  <div className="master-row" key={f.id}>
                    <span className={`mk ${formClass.get(f.label) ?? ''}`}>{f.label}</span>
                    <span className="nm" />
                    <span className="vv">{f.sortOrder}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DayPlan({
  items,
  subjectColor,
  formClass,
}: {
  items: PlanItem[]
  subjectColor: Map<string, string>
  formClass: Map<string, string>
}) {
  if (items.length === 0) {
    return (
      <div className="plan-empty">
        <Icon name="pencil" size={15} />
        아직 계획이 작성되지 않았습니다
      </div>
    )
  }

  let prevEnd: number | null = null

  return (
    <div className="plan-rows">
      {items.map((it, i) => {
        const start = minutesOf(it.startTime)
        // 시작시각이 없으면 빈 시간을 계산할 수 없다 — 간격 표시를 건너뛴다
        const gap = start !== null && prevEnd !== null && start > prevEnd ? start - prevEnd : 0
        if (start !== null) prevEnd = start + it.durationMinutes

        return (
          <div key={it.id}>
            {gap > 0 && (
              <div className="gap-line">
                <span>비어 있음 {dl(gap)}</span>
                <i />
              </div>
            )}
            <div className="prow">
              <span className="seq">{i + 1}</span>
              <span className="cbar" style={{ background: subjectColor.get(it.subject ?? '') ?? 'var(--line-2)' }} />
              <div className="body">
                <div className="tline">
                  <span className="tm">
                    {start !== null ? `${fmt(start)}~${fmt(start + it.durationMinutes)}` : '시간 미입력'}
                  </span>
                  <span className="du">{dl(it.durationMinutes)}</span>
                </div>
                <div className="sline">
                  {it.studyType && <span className={`mk ${formClass.get(it.studyType) ?? ''}`}>{it.studyType}</span>}
                  <span className="sj">{it.subject ?? '과목 미지정'}</span>
                </div>
                <div className="memo">{it.material ?? ''}</div>
              </div>
              {/* done 이 boolean 이라 O/X 2종뿐이다 — '미체크'가 없다(API_GAPS 5-6) */}
              <span className={`ox ${it.done ? 'o' : 'x'} md`}>{it.done ? 'O' : 'X'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const learningPlanMockup: Mockup = {
  Content,
}
