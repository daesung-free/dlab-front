import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { maskName } from '../../lib/mask'
import { planBlockOn, type AcademyEvent } from './academyEvents'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import './plan.css'

/* ============================================================================
 * F-4.11-2 주·일 학습 계획 관리 — 신규개발-요구사항신규
 *
 * ⚠ 8/3 회신서로 설계가 전면 교체됐다. 이전 교시×요일 그리드 구조는 폐기.
 *
 *   [8/3 답변서 — 학생 학습 계획 작성에 대한 기능 수정 제안]
 *     "디랩은 재수종합반이 아닌 다양한 상황의 학생들이 이용하는 독서실.
 *      등원시간·이용시간·학습계획이 모두 다르다.
 *      정해준 시간 틀에 학습계획을 짜맞추는 것은 활용성이 떨어진다
 *      (별도 시간관리 앱을 중복 사용할 가능성)"
 *
 *     1) 교시가 아닌 순번의 개념 (시간의 순서대로)
 *     2) 학생이 과목별로 시간 할당(입력) — 시작 시간 + 소요 시간
 *     3) 개인별로 작성된 시간표대로 과목별 통계 확인 (개별 계산)
 *     4) 과목별 시간 배분 주도권을 학생 개인이 가진다
 *     5) 직원(담임)은 이행여부 및 통계 확인
 *
 *   [8/3 답변서 — 디자인 회신서 3.4번] 이행 표시방식은 O/X 방식으로 확정
 *
 * ⚠ 이 구조가 바꾼 것 — 설계 전제 3가지가 무효가 된다.
 *   ① 교시(period) 개념 소멸. 점심·저녁 같은 고정 시간대도 표시하지 않는다.
 *      순번은 저장값이 아니라 시작시간 정렬 후 매기는 파생값이다.
 *   ② I-7(학습계획 '파란색' = 교사 편집 영역의 경계)이 사실상 해소.
 *      배분 주도권이 학생에게 있다고 확정됐으므로 교사 편집 셀이라는 개념 자체가 없다.
 *      관리자가 관리하는 것은 계획 내용이 아니라 '학습형태·과목 목록(마스터)'뿐이다.
 *   ③ 반 시간표(F-C-3) → 학습계획 자동 반영은 하면 안 된다.
 *      회신서가 명시적으로 반대한 "정해준 시간 틀에 짜맞추기"에 해당한다.
 *
 * ⚠ 이 화면은 관리자용이므로 '보기 전용'이다.
 *   담임이 계획을 대신 입력·수정하지 않는다. 이행여부와 통계만 확인하고,
 *   미이행이 쌓인 학생을 상담·호출로 연결한다.
 *   → 상담 시 학생별로 펼쳐 보기 때문에 학생 선택이 이 화면의 1차 축이다.
 * ========================================================================== */

/* ── 마스터: 관리자가 관리하는 두 목록 ── */

interface SubjectDef {
  key: string
  color: string
  /** 학생별 커스터마이즈 가능 슬롯 (탐구 과목명 등) */
  custom?: boolean
}

const SUBJECTS: SubjectDef[] = [
  { key: '국어', color: '#0E9E8E' },
  { key: '수학', color: '#3B6FE0' },
  { key: '영어', color: '#6C5CE0' },
  { key: '탐구1', color: '#E8920F', custom: true },
  { key: '탐구2', color: '#E0533D', custom: true },
]

const SUBJECT_COLOR = Object.fromEntries(SUBJECTS.map((s) => [s.key, s.color])) as Record<string, string>

/** 학습형태 — 회신서 첨부 화면의 '수업 / 인강 / 자습' */
const FORMS = ['수업', '인강', '자습'] as const
type Form = (typeof FORMS)[number]

const FORM_CLASS: Record<Form, string> = {
  수업: 'verified',
  인강: 'supplement',
  자습: 'brandnew',
}

/** 형태별 색 — 과목 색과 겹치지 않게 별도 축으로 둔다 */
const FORM_COLOR: Record<Form, string> = {
  수업: 'var(--blue)',
  인강: 'var(--violet)',
  자습: 'var(--mint)',
}

/* ── 계획 항목 ── */

/** 이행 표시는 O/X 2종 — 8/3 확정. △·%·부분이행 없음 */
type Mark = 'O' | 'X' | null

interface PlanItem {
  id: string
  form: Form
  subject: string
  memo: string
  /** 시작 시각(분). 학생이 직접 입력 */
  start: number
  /** 소요 시간(분). 학생이 직접 입력 */
  dur: number
  mark: Mark
}

const MEMOS: Record<string, string[]> = {
  국어: ['독서 취약영역 3세트', '씹어먹는 EBS 12강', '문학 기출 2회독', '언매 실전 세트'],
  수학: ['드릴 수1 워크북 p.44', '미적분 심화 과정', '기출 오답 정리', '실전 모의 1회'],
  영어: ['조정식 어휘 DAY 9', '구문 독해 8강', '빈칸추론 20문항', 'EBS 수특 3강'],
  탐구1: ['한지 전범위 복습 5강', '역학 개념 복습', '기출 3개년', '신유형 세트'],
  탐구2: ['우주 개념 정리', '지구의 역사 정리', '전자기 문제풀이', '단원 마무리'],
}

const ROSTER = MOCK_STUDENTS.filter((s) => s.status === '재원').slice(0, 14)

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

const dateOf = (d: number) => `2026-06-0${d}`

/** 관리자가 캘린더에 넣은 학원 일정 때문에 학생이 계획을 못 세우는 날 */
const BLOCK_OF: Record<number, AcademyEvent | undefined> = Object.fromEntries(
  DAYS.map((d) => [d.d, planBlockOn(dateOf(d.d))]),
)

const DUR_CHOICES = [20, 30, 50, 60, 90, 120]

/**
 * 결정적 생성 — 학생·날짜가 같으면 항상 같은 계획이 나온다.
 * 교시 격자가 아니라 학생이 찍은 시작시각을 그대로 이어 붙인다(빈 시간이 생길 수 있음).
 */
function buildDay(si: number, d: number): PlanItem[] {
  // 학원 일정으로 막힌 날은 학생이 애초에 입력할 수 없으므로 데이터가 존재하지 않는다
  if (BLOCK_OF[d]) return []

  const seed = si * 13 + d * 7
  // 아직 안 쓴 날 / 주말에 적게 쓴 날이 섞여야 '미작성'을 볼 수 있다
  const count = si % 7 === 6 && d >= 5 ? 0 : d === 7 ? seed % 3 : 4 + (seed % 5)
  if (count === 0) return []

  const out: PlanItem[] = []
  let cursor = 470 + (seed % 4) * 15 // 07:50 ~ 08:35 사이에서 시작
  for (let i = 0; i < count; i++) {
    const k = seed + i * 11
    const sub = SUBJECTS[k % SUBJECTS.length]
    const dur = DUR_CHOICES[k % DUR_CHOICES.length]
    // 학생이 쉬는 시간을 비워두는 경우 — 빈 시간으로 그대로 보여준다
    if (i > 0 && k % 4 === 0) cursor += 10 + (k % 3) * 10
    const list = MEMOS[sub.key]
    out.push({
      id: `p-${si}-${d}-${i}`,
      form: FORMS[k % FORMS.length],
      subject: sub.key,
      memo: list[k % list.length],
      start: cursor,
      dur,
      mark: k % 9 === 8 ? null : k % 5 === 4 ? 'X' : 'O',
    })
    cursor += dur
  }
  return out.sort((a, b) => a.start - b.start)
}

function buildWeek(si: number): Record<number, PlanItem[]> {
  const w: Record<number, PlanItem[]> = {}
  for (const day of DAYS) w[day.d] = buildDay(si, day.d)
  return w
}

const WEEKS: Record<number, PlanItem[]>[] = ROSTER.map((_, i) => buildWeek(i))

/* ── 표시 헬퍼 ── */

const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

function dl(m: number): string {
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

interface Tally {
  count: number
  minutes: number
  o: number
  x: number
  none: number
}

function tally(items: PlanItem[]): Tally {
  return {
    count: items.length,
    minutes: items.reduce((a, i) => a + i.dur, 0),
    o: items.filter((i) => i.mark === 'O').length,
    x: items.filter((i) => i.mark === 'X').length,
    none: items.filter((i) => i.mark === null).length,
  }
}

function flatten(week: Record<number, PlanItem[]>): PlanItem[] {
  return DAYS.flatMap((d) => week[d.d] ?? [])
}

/* ── 반 이행 현황 테이블 ── */

interface RosterRow {
  id: string
  studentNo: string
  name: string
  classNo: string
  teacher: string
  count: number
  minutes: number
  o: number
  x: number
  none: number
  rate: number
  /** 계획을 한 건도 안 쓴 날 */
  emptyDays: number
}

/** O/X 마크 배지 */
function MarkBadge({ mark, size = 'md' }: { mark: Mark; size?: 'md' | 'sm' }) {
  const cls = mark === 'O' ? 'o' : mark === 'X' ? 'x' : 'n'
  return <span className={`ox ${cls} ${size}`}>{mark ?? '·'}</span>
}

function Content() {
  const [tab, setTab] = useState('student')
  const [si, setSi] = useState(0)
  const [day, setDay] = useState(4)
  const [scope, setScope] = useState<'day' | 'week'>('day')
  const [rosterFilter, setRosterFilter] = useState('전체')
  const [masked, setMasked] = useState(true)

  const student = ROSTER[si]
  const week = WEEKS[si]
  const dayItems = week[day] ?? []
  const weekItems = useMemo(() => flatten(week), [week])

  const scopeItems = scope === 'day' ? dayItems : weekItems
  const t = tally(scopeItems)

  /* 과목별 통계 — 학생이 배분한 시간을 그대로 집계한다(개별 계산) */
  const subjectStats = useMemo(() => {
    const total = scopeItems.reduce((a, i) => a + i.dur, 0) || 1
    return SUBJECTS.map((s) => {
      const own = scopeItems.filter((i) => i.subject === s.key)
      const tl = tally(own)
      return { ...s, ...tl, share: Math.round((tl.minutes / total) * 100) }
    })
  }, [scopeItems])

  /**
   * 과목 × 학습형태 — 상담에서 쓰는 지표.
   * "수학을 많이 했다"보다 "수학을 인강으로만 했다 / 자습이 하나도 없다"가 상담 재료가 된다.
   */
  const formStats = useMemo(() => {
    const total = scopeItems.reduce((a, i) => a + i.dur, 0) || 1
    const byForm = FORMS.map((f) => {
      const own = scopeItems.filter((i) => i.form === f)
      const min = own.reduce((a, i) => a + i.dur, 0)
      return { form: f, minutes: min, count: own.length, share: Math.round((min / total) * 100) }
    })

    const bySubject = SUBJECTS.map((s) => {
      const own = scopeItems.filter((i) => i.subject === s.key)
      const min = own.reduce((a, i) => a + i.dur, 0) || 1
      return {
        key: s.key,
        minutes: own.reduce((a, i) => a + i.dur, 0),
        segs: FORMS.map((f) => {
          const fm = own.filter((i) => i.form === f).reduce((a, i) => a + i.dur, 0)
          return { form: f, minutes: fm, pct: (fm / min) * 100 }
        }),
      }
    })

    return { byForm, bySubject, total: scopeItems.reduce((a, i) => a + i.dur, 0) }
  }, [scopeItems])

  /* 요일별 요약 */
  const dayStats = useMemo(
    () =>
      DAYS.map((d) => {
        const items = week[d.d] ?? []
        return { ...d, ...tally(items), block: BLOCK_OF[d.d] }
      }),
    [week],
  )

  /* 전체 학생 이행 현황 */
  const rosterRows: RosterRow[] = useMemo(
    () =>
      ROSTER.map((s, i) => {
        const items = flatten(WEEKS[i])
        const tl = tally(items)
        // ⚠ 차단일은 미작성이 아니다 — 빼지 않으면 휴원일마다 전교생이 미작성자로 잡힌다
        const emptyDays = DAYS.filter((d) => !BLOCK_OF[d.d] && (WEEKS[i][d.d] ?? []).length === 0).length
        return {
          id: s.id,
          studentNo: s.studentNo,
          name: s.name,
          classNo: s.classNo,
          teacher: s.teacher,
          ...tl,
          rate: tl.count ? Math.round((tl.o / tl.count) * 100) : 0,
          emptyDays,
        }
      }),
    [],
  )

  const filteredRoster = useMemo(() => {
    if (rosterFilter === '미이행') return rosterRows.filter((r) => r.x > 0)
    if (rosterFilter === '미작성') return rosterRows.filter((r) => r.emptyDays > 0)
    return rosterRows
  }, [rosterRows, rosterFilter])

  const classRate = useMemo(() => {
    const c = rosterRows.reduce((a, r) => a + r.count, 0)
    const o = rosterRows.reduce((a, r) => a + r.o, 0)
    return c ? Math.round((o / c) * 100) : 0
  }, [rosterRows])

  const rosterColumns: Column<RosterRow>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '104px', sortable: true, value: (r) => r.studentNo },
      { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
      { key: 'classNo', header: '반', width: '58px', align: 'center', sortable: true, value: (r) => r.classNo },
      { key: 'teacher', header: '담임', width: '78px', align: 'center', sortable: true, value: (r) => r.teacher },
      { key: 'count', header: '계획', width: '68px', align: 'right', sortable: true, value: (r) => r.count },
      {
        key: 'minutes',
        header: '배분 시간',
        width: '104px',
        align: 'right',
        sortable: true,
        value: (r) => r.minutes,
        render: (r) => (r.minutes ? dl(r.minutes) : <span style={{ color: 'var(--muted)' }}>-</span>),
      },
      {
        key: 'ox',
        header: 'O / X',
        width: '86px',
        align: 'center',
        value: (r) => `${r.o} / ${r.x}`,
        render: (r) => (
          <span style={{ fontWeight: 700, fontSize: 12.5 }}>
            <span style={{ color: 'var(--mint-d)' }}>{r.o}</span>
            <span style={{ color: 'var(--muted)' }}> / </span>
            <span style={{ color: r.x > 0 ? 'var(--red)' : 'var(--muted)' }}>{r.x}</span>
          </span>
        ),
      },
      {
        key: 'none',
        header: '미체크',
        width: '76px',
        align: 'right',
        sortable: true,
        value: (r) => r.none,
        render: (r) => (r.none ? r.none : <span style={{ color: 'var(--muted)' }}>-</span>),
      },
      {
        key: 'rate',
        header: '이행률',
        width: '146px',
        sortable: true,
        value: (r) => r.rate,
        render: (r) => (
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, height: 6, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
              <span
                style={{
                  display: 'block',
                  width: `${r.rate}%`,
                  height: '100%',
                  background: r.rate >= 80 ? 'var(--mint)' : r.rate >= 50 ? 'var(--amber)' : 'var(--red)',
                }}
              />
            </span>
            <b style={{ fontSize: 11.5, minWidth: 32, textAlign: 'right' }}>{r.rate}%</b>
          </span>
        ),
      },
      {
        key: 'emptyDays',
        header: '미작성일',
        width: '86px',
        align: 'center',
        sortable: true,
        value: (r) => r.emptyDays,
        render: (r) =>
          r.emptyDays ? <span className="mk brandnew">{r.emptyDays}일</span> : <span style={{ color: 'var(--muted)' }}>-</span>,
      },
    ],
    [],
  )

  return (
    <div className="p-plan">
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 조회 학생
          </div>
          <div className="v">{ROSTER.length}</div>
          <div className="d">재원생 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 반 평균 이행률
          </div>
          <div className="v" style={{ color: classRate >= 80 ? 'var(--mint-d)' : 'var(--amber)' }}>
            {classRate}%
          </div>
          <div className="d">O / 전체 계획</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="check" size={13} /> 이행 O
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {rosterRows.reduce((a, r) => a + r.o, 0)}
          </div>
          <div className="d up">주간 누계</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="x" size={13} /> 미이행 X
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {rosterRows.reduce((a, r) => a + r.x, 0)}
          </div>
          <div className="d down">상담 연계 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="pencil" size={13} /> 미작성
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {rosterRows.filter((r) => r.emptyDays > 0).length}
          </div>
          <div className="d warn">명 · 계획 없는 날 존재</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="lock" size={13} /> 학원 일정 차단
          </div>
          <div className="v">{DAYS.filter((d) => BLOCK_OF[d.d]).length}</div>
          <div className="d">
            일 · 1인 평균 {dl(Math.round(rosterRows.reduce((a, r) => a + r.minutes, 0) / Math.max(1, ROSTER.length)))}
          </div>
        </div>
      </div>

      <div className="note-box plain">
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">학생이 앱에서 세운 계획이 이 화면에 그대로 올라옵니다</div>
          <div className="tx">
            <b>교시가 아니라 순번</b>입니다. 학생이 앱에서 <b>시작 시간과 소요 시간을 직접 입력</b>하면 순서대로 번호가
            매겨지고, 점심·저녁 같은 <b>고정 시간대는 표시하지 않습니다.</b> 과목별 배분의 주도권은 학생에게 있으며 통계도{' '}
            <b>학생이 배분한 시간을 그대로</b> 집계합니다. 관리자가 관리하는 것은 계획 내용이 아니라{' '}
            <b>학습형태·과목 목록(마스터)</b>뿐입니다.
            <br />
            <b>학원 일정이 등록된 날은 학생이 계획을 세울 수 없습니다.</b> 연간 행사 마스터에서{' '}
            <b>&lsquo;학습계획 입력 차단&rsquo;</b>으로 등록한 날이 여기 자물쇠로 표시되며, 그 날은{' '}
            <b>미작성 집계에서 제외</b>됩니다.
          </div>
        </div>
      </div>

      <Tabs
        items={[
          { key: 'student', label: '학생별 계획' },
          { key: 'roster', label: '반 이행 현황', count: rosterRows.length },
          { key: 'master', label: '형태 · 과목 마스터' },
        ]}
        active={tab}
        onChange={setTab}
        standalone
      />

      {/* ═══ 학생별 계획 ═══ */}
      {tab === 'student' && (
        <div className="layout">
          {/* ── 학생 목록 ── */}
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
              {filteredRoster.map((r) => {
                const idx = ROSTER.findIndex((s) => s.id === r.id)
                return (
                  <button
                    type="button"
                    key={r.id}
                    className={`plan-srow${idx === si ? ' on' : ''}`}
                    onClick={() => setSi(idx)}
                  >
                    <div className="av">{r.name.slice(0, 1)}</div>
                    <div className="info">
                      <div className="n">
                        {masked ? maskName(r.name) : r.name}
                        <span className="cls">{r.classNo}</span>
                      </div>
                      <div className="track">
                        <i
                          style={{
                            width: `${r.rate}%`,
                            background: r.rate >= 80 ? 'var(--mint)' : r.rate >= 50 ? 'var(--amber)' : 'var(--red)',
                          }}
                        />
                      </div>
                      <div className="m">
                        계획 {r.count}건 · {r.minutes ? dl(r.minutes) : '배분 없음'}
                        {r.emptyDays > 0 && <span className="warn"> · 미작성 {r.emptyDays}일</span>}
                      </div>
                    </div>
                    <div className="ox-col">
                      <b>
                        {r.o} / {r.x}
                      </b>
                      <span>O / X</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* ── 학생 상세 ── */}
          <div>
            <div className="plan-bar">
              <div className="who">
                <div className="nm">
                  {masked ? maskName(student.name) : student.name}
                  <span className="mk supplement">{student.classNo}</span>
                </div>
                <div className="mt">
                  {student.studentNo} · 담임 {student.teacher} · {student.track} · {student.branch}지점
                </div>
              </div>

              <div className="bar-group">
                <span className="lbl">범위</span>
                {(['day', 'week'] as const).map((v) => (
                  <button key={v} className={`chip${scope === v ? ' on' : ''}`} onClick={() => setScope(v)}>
                    {v === 'day' ? '일간' : '주간'}
                  </button>
                ))}
              </div>

              <div className="bar-right">
                <MaskToggle masked={masked} onChange={setMasked} />
                <button className="btn">
                  <Icon name="message-circle" size={14} /> 호출
                </button>
                <button className="btn pri">
                  <Icon name="message-square" size={14} /> 상담 배정
                </button>
              </div>
            </div>

            {/* 주간 날짜 선택 — 계획 건수를 함께 보여준다 */}
            <div className="daypick">
              {dayStats.map((d) => (
                <button
                  key={d.d}
                  type="button"
                  className={`dcell${d.d === day ? ' on' : ''}${d.block ? ' locked' : d.count === 0 ? ' empty' : ''}`}
                  title={d.block ? `${d.block.title} — 학습계획 작성 차단` : undefined}
                  onClick={() => {
                    setDay(d.d)
                    setScope('day')
                  }}
                >
                  <span className="dw">{d.dow}</span>
                  <span className="dd">{d.d}</span>
                  <span className="dc">
                    {d.block ? <Icon name="lock" size={11} /> : d.count ? `${d.count}건` : '—'}
                  </span>
                </button>
              ))}
            </div>

            <div className="an-grid">
              {/* ── 순번 계획 목록 ── */}
              <div className="card-sec" style={{ marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="list-checks" size={15} />
                    </span>
                    {scope === 'day' ? `06/0${day} 계획` : '주간 전체 계획'}
                  </div>
                  <div className="r">
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                      이행 <b style={{ color: 'var(--mint-d)' }}>{t.o}</b> / {t.count}
                    </span>
                    <span className="mk verified">O · X 방식</span>
                  </div>
                </div>
                <div className="card-sec-b" style={{ padding: 0 }}>
                  {scope === 'day' ? (
                    <DayPlan items={dayItems} block={BLOCK_OF[day]} />
                  ) : (
                    <div className="week-list">
                      {dayStats.map((d) => (
                        <div key={d.d}>
                          <div className={`wk-head${d.block ? ' locked' : ''}`}>
                            06/0{d.d} ({d.dow})
                            <span>
                              {d.block ? (
                                <>
                                  <Icon name="lock" size={11} /> {d.block.title}
                                </>
                              ) : d.count ? (
                                <>
                                  {d.count}건 · {dl(d.minutes)} ·{' '}
                                  <b style={{ color: 'var(--mint-d)' }}>O {d.o}</b>
                                  {' / '}
                                  <b style={{ color: d.x ? 'var(--red)' : 'var(--muted)' }}>X {d.x}</b>
                                </>
                              ) : (
                                '계획 없음'
                              )}
                            </span>
                          </div>
                          <DayPlan items={week[d.d] ?? []} block={d.block} compact />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── 과목별 통계 + 학습형태 현황 ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="card-sec" style={{ marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="bar-chart-3" size={15} />
                    </span>
                    과목별 통계
                  </div>
                  <div className="r">
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scope === 'day' ? '일간' : '주간'}</span>
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="tot-row">
                    <div>
                      <div className="k">총 배분 시간</div>
                      <div className="v">{t.minutes ? dl(t.minutes) : '—'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="k">이행률</div>
                      <div className="v" style={{ color: 'var(--mint-d)' }}>
                        {t.count ? Math.round((t.o / t.count) * 100) : 0}%
                      </div>
                    </div>
                  </div>

                  {subjectStats.map((s) => (
                    <div className="subj-row" key={s.key}>
                      <div className="sh">
                        <span className="nm">
                          {s.key}
                          {s.custom && (
                            <span className="cz" title="학생별 커스터마이즈 가능">
                              ✎
                            </span>
                          )}
                        </span>
                        <span className="tm">{s.minutes ? dl(s.minutes) : '—'}</span>
                        <span className="pc">{s.share}%</span>
                      </div>
                      <div className="track">
                        <i style={{ width: `${s.share}%`, background: s.color }} />
                      </div>
                      <div className="sf">
                        <span>계획 {s.count}건</span>
                        <span style={{ color: 'var(--mint-d)' }}>O {s.o}</span>
                        <span style={{ color: s.x ? 'var(--red)' : undefined }}>X {s.x}</span>
                        <span>미체크 {s.none}</span>
                      </div>
                    </div>
                  ))}

                  <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                    <div className="ic">
                      <Icon name="info" size={16} />
                    </div>
                    <div>
                      <div className="tt">개별 계산</div>
                      <div className="tx">
                        학생이 배분한 시간을 그대로 집계합니다. 반 평균이나 권장 비율에 맞춰 보정하지 않습니다.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 학습형태 현황 (자습 · 인강 · 수업) ── */}
              <div className="card-sec" style={{ marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="pie-chart" size={15} />
                    </span>
                    학습형태 현황
                  </div>
                  <div className="r">
                    <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{scope === 'day' ? '일간' : '주간'}</span>
                  </div>
                </div>
                <div className="card-sec-b">
                  {formStats.total === 0 ? (
                    <div className="plan-empty" style={{ padding: '24px 8px' }}>
                      집계할 계획이 없습니다
                    </div>
                  ) : (
                    <>
                      {/* 전체 형태 비중 — 한 줄 스택 */}
                      <div className="form-stack">
                        {formStats.byForm
                          .filter((f) => f.minutes > 0)
                          .map((f) => (
                            <span
                              key={f.form}
                              style={{ width: `${f.share}%`, background: FORM_COLOR[f.form] }}
                              title={`${f.form} ${dl(f.minutes)} · ${f.share}%`}
                            >
                              {f.share >= 12 && `${f.form} ${f.share}%`}
                            </span>
                          ))}
                      </div>

                      <div className="form-legend">
                        {formStats.byForm.map((f) => (
                          <span key={f.form}>
                            <i style={{ background: FORM_COLOR[f.form] }} />
                            {f.form}
                            <b>{f.minutes ? dl(f.minutes) : '—'}</b>
                            <em>{f.count}건</em>
                          </span>
                        ))}
                      </div>

                      {/* 과목 × 형태 — 상담에서 실제로 보는 축 */}
                      <div className="fs-title">과목별 형태 구성</div>
                      {formStats.bySubject.map((s) => (
                        <div className="fs-row" key={s.key}>
                          <span className="nm">{s.key}</span>
                          <span className="bar">
                            {s.minutes === 0 ? (
                              <i className="none" style={{ width: '100%' }} />
                            ) : (
                              s.segs
                                .filter((g) => g.minutes > 0)
                                .map((g) => (
                                  <i
                                    key={g.form}
                                    style={{ width: `${g.pct}%`, background: FORM_COLOR[g.form] }}
                                    title={`${s.key} · ${g.form} ${dl(g.minutes)}`}
                                  />
                                ))
                            )}
                          </span>
                          <span className="tm">{s.minutes ? dl(s.minutes) : '—'}</span>
                        </div>
                      ))}

                      <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                        <div className="ic">
                          <Icon name="message-square" size={16} />
                        </div>
                        <div>
                          <div className="tt">상담에서 보는 지점</div>
                          <div className="tx">
                            총량보다 <b>구성</b>이 상담 재료가 됩니다. &ldquo;수학을 많이 했다&rdquo;보다{' '}
                            <b>&ldquo;수학이 인강뿐이고 자습이 없다&rdquo;</b>가 짚을 거리입니다.
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ 반 이행 현황 ═══ */}
      {tab === 'roster' && (
        <>
          <div className="filter-row" style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: 'none' }}>
            {['전체', '미이행', '미작성'].map((f) => (
              <button key={f} type="button" className={`chip${rosterFilter === f ? ' on' : ''}`} onClick={() => setRosterFilter(f)}>
                {f}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11.5, color: 'var(--muted)' }}>
              행을 누르면 학생별 계획으로 이동합니다
            </span>
          </div>

          <DataTable
            columns={rosterColumns}
            rows={filteredRoster}
            rowKey={(r) => r.id}
            masked={masked}
            pageSize={14}
            onRowClick={(r) => {
              setSi(ROSTER.findIndex((s) => s.id === r.id))
              setTab('student')
            }}
            countLabel={
              <>
                학생 <b>{filteredRoster.length}</b>명 · 2026-06-01 ~ 06-07 · 반 평균 이행률 <b>{classRate}%</b>
              </>
            }
            toolbar={
              <>
                <button className="btn">
                  <Icon name="message-square" size={14} /> 미이행자 일괄 상담배정
                </button>
                <MaskToggle masked={masked} onChange={setMasked} />
                <ExcelButton filename="학습계획_이행현황" columns={rosterColumns} rows={filteredRoster} masked={masked} />
              </>
            }
          />
        </>
      )}

      {/* ═══ 형태 · 과목 마스터 ═══ */}
      {tab === 'master' && (
        <div className="split">
          <div className="card-sec" style={{ marginBottom: 0 }}>
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="sliders-horizontal" size={15} />
                </span>
                학습형태
              </div>
              <div className="r">
                <button className="btn pri" style={{ padding: '5px 11px', fontSize: 11.5 }}>
                  <Icon name="plus" size={12} /> 추가
                </button>
              </div>
            </div>
            <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FORMS.map((f) => (
                <div className="master-row" key={f}>
                  <span className={`mk ${FORM_CLASS[f]}`}>{f}</span>
                  <span className="cnt">
                    사용 {weekItems.filter((i) => i.form === f).length}건
                  </span>
                  <span className="acts">
                    <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
                      수정
                    </button>
                    <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
                      삭제
                    </button>
                  </span>
                </div>
              ))}
              <div className="note-box plain" style={{ marginTop: 6, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="info" size={16} />
                </div>
                <div>
                  <div className="tt">형태·과목 목록은 관리자가 관리합니다</div>
                  <div className="tx">
                    학생 앱의 계획 입력 화면에서 고를 수 있는 선택지가 이 목록입니다. 이미 사용 중인 항목을 삭제하면 과거
                    계획의 표시가 깨지므로, <b>삭제 대신 사용중지</b>로 처리하는 편이 안전합니다.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card-sec" style={{ marginBottom: 0 }}>
            <div className="card-sec-h">
              <div className="t">
                <span className="ico">
                  <Icon name="book-open" size={15} />
                </span>
                과목
              </div>
              <div className="r">
                <button className="btn pri" style={{ padding: '5px 11px', fontSize: 11.5 }}>
                  <Icon name="plus" size={12} /> 추가
                </button>
              </div>
            </div>
            <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SUBJECTS.map((s) => (
                <div className="master-row" key={s.key}>
                  <span className="sw" style={{ background: s.color }} />
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{s.key}</span>
                  {s.custom && (
                    <span className="mk supplement" title="학생이 실제 응시 과목명으로 바꿔 쓸 수 있는 슬롯">
                      학생 커스터마이즈
                    </span>
                  )}
                  <span className="cnt">사용 {weekItems.filter((i) => i.subject === s.key).length}건</span>
                  <span className="acts">
                    <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
                      수정
                    </button>
                    <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
                      삭제
                    </button>
                  </span>
                </div>
              ))}
              <div className="blocked-note" style={{ marginTop: 6, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="triangle-alert" size={16} />
                </div>
                <div>
                  <div className="tt">탐구1 · 탐구2는 학생마다 실제 과목이 다릅니다</div>
                  <div className="tx">
                    마스터에는 슬롯(탐구1·탐구2)만 두고 <b>실제 과목명은 학생 프로필에서 매핑</b>합니다. 통계를 학원 전체로
                    합칠 때 이 매핑이 없으면 &lsquo;탐구1&rsquo;에 물리Ⅱ와 생명과학Ⅰ이 섞여 집계됩니다.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 순번 기반 계획 목록 — 교시 격자가 아니라 학생이 찍은 시각 순서 그대로 */
function DayPlan({ items, block, compact }: { items: PlanItem[]; block?: AcademyEvent; compact?: boolean }) {
  /* 학원 일정으로 막힌 날 — '안 쓴 날'과 구분해서 보여줘야 담임이 오해하지 않는다 */
  if (block) {
    return (
      <div className="plan-blocked">
        <span className="ic">
          <Icon name="lock" size={16} />
        </span>
        <div>
          <div className="tt">{block.title}</div>
          <div className="tx">
            학원 일정이 등록돼 학생이 이 날 학습계획을 세울 수 없습니다. <b>미작성으로 집계되지 않습니다.</b>
          </div>
        </div>
        <span className={`mk ${block.type === '휴원' ? 'brandnew' : 'supplement'}`}>{block.type}</span>
      </div>
    )
  }

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
    <div className={`plan-rows${compact ? ' compact' : ''}`}>
      {items.map((it, i) => {
        const gap = prevEnd !== null && it.start > prevEnd ? it.start - prevEnd : 0
        prevEnd = it.start + it.dur
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
              <span className="cbar" style={{ background: SUBJECT_COLOR[it.subject] }} />
              <div className="body">
                <div className="tline">
                  <span className="tm">
                    {fmt(it.start)}~{fmt(it.start + it.dur)}
                  </span>
                  <span className="du">{dl(it.dur)}</span>
                </div>
                <div className="sline">
                  <span className={`mk ${FORM_CLASS[it.form]}`}>{it.form}</span>
                  <span className="sj">{it.subject}</span>
                </div>
                <div className="memo">{it.memo}</div>
              </div>
              <MarkBadge mark={it.mark} size={compact ? 'sm' : 'md'} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export const learningPlanMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026.06.01 ~ 06.07 ▾</button>
      <button className="btn">
        <Icon name="file-spreadsheet" size={14} /> 이행 리포트
      </button>
    </>
  ),
}
