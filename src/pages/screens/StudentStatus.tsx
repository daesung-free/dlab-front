import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, PrintButton, Unfilled, todayStr, type Column } from '../../components/common'
import { Icon } from '../../components/Icon'
import { Tabs } from '../../components/Tabs'
import { useAcademy } from '../../auth/AcademyContext'
import { ApiError } from '../../api/client'
import { listClasses, type ClassGroup } from '../../api/classes'
import { searchStudents, type Student } from '../../api/students'
import { getStatistics, getStudentStatistics, type StudentStatRow } from '../../api/statistics'
import type { Mockup } from './types'
import { createScreenSignal } from './screenSignal'
import './matrix.css'

/* 학원생 관리 > 교무업무 > 학원생 현황 (F-C-2) — /api/v1/admin/statistics/students
 *
 * 명단 조회·출력(F-4.9)과 목적이 다르다.
 *   · 명단 조회·출력 = 개별 학생 행을 뽑아 엑셀로 내리는 화면
 *   · 학원생 현황   = 반·계열·월별로 "몇 명인가"를 집계해서 보는 화면
 *
 * ★ 집계는 서버가 한다(2026-09-21 연동). 예전 목업은 전 원생을 받아 화면에서 셌다.
 *
 * ★ **축마다 세는 기준이 다르다** — 반별·계열별은 재원생만, 월별은 휴원·퇴원 포함 등록 전체.
 *   화면이 그걸 밝히지 않으면 같은 달 숫자가 두 탭에서 달라 "왜 안 맞지" 가 된다.
 *
 * ★ 반별은 **반 목록(`/classes`)을 기준으로 합친다.** 서버 집계가 재원 0 인 반을 통째로
 *   빼서 휴원생만 있는 반이 사라졌었다(분당 N수 1반, 2026-09-21 서버 수정). 담임·정원이
 *   반 목록에만 있어 합치는 것은 그대로 둔다. API_GAPS 28부.
 *
 * ★ 반별 휴원·퇴원 · 반 안의 계열 · 계열 × 재수 구분은 서버 집계에 없어 **학생 목록으로 센다**
 *   (반·상태·계열·재수 횟수가 목록에 다 있다). 목록을 못 받으면 그 칸만 `미제공` 으로 남긴다. */

const TABS = [
  { key: 'class', label: '반별 현황' },
  { key: 'cross', label: '계열 · 재수 구분' },
  { key: 'month', label: '월별 증감' },
]

/** 계열은 코드가 그대로 온다(HUMANITIES). 화면에는 한글로 */
const TRACK_LABEL: Record<string, string> = { SCIENCE: '자연', HUMANITIES: '인문' }

interface ClassRow {
  key: string
  classNo: string
  teacher: string | null
  capacity: number | null
  enrolled: number
  /* 아래 넷은 학생 목록으로 센다 — 서버 반별 집계에 없다(재원만 센다). 목록을 못 받으면 null */
  onLeave: number | null
  withdrawn: number | null
  nature: number | null
  humanity: number | null
}

/** 학생 목록에서 센 값 — 못 받았을 때와 0 을 구분하려고 null 을 쓴다 */
function countCell(n: number | null) {
  return n === null ? <Unfilled reason="학생 목록을 못 받았다" /> : n
}

/** 채움 막대 — 정원 대비 재원 비율을 한눈에 */
function FillBar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, Math.round(ratio * 100))
  const tone = pct >= 100 ? 'var(--red)' : pct >= 85 ? 'var(--mint)' : 'var(--amber)'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
      <span
        style={{
          flex: 1,
          height: 6,
          borderRadius: 4,
          background: 'var(--line-2)',
          overflow: 'hidden',
          minWidth: 54,
        }}
      >
        <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: tone }} />
      </span>
      <b style={{ fontSize: 11.5, color: tone, minWidth: 34, textAlign: 'right' }}>{pct}%</b>
    </span>
  )
}

const CLASS_COLUMNS: Column<ClassRow>[] = [
  { key: 'classNo', header: '반', width: '104px', sortable: true, value: (r) => r.classNo },
  { key: 'teacher', header: '담임', width: '86px', value: (r) => r.teacher ?? '미지정' },
  {
    key: 'capacity',
    header: '정원',
    width: '68px',
    align: 'right',
    sortable: true,
    value: (r) => r.capacity ?? '',
    /* 정원 없는 반은 비워 둔다 — 0 으로 그리면 늘 초과로 보인다 */
    render: (r) => (r.capacity === null ? <span style={{ color: 'var(--muted)' }}>-</span> : r.capacity),
  },
  {
    key: 'enrolled',
    header: '재원',
    width: '68px',
    align: 'right',
    sortable: true,
    value: (r) => r.enrolled,
    render: (r) => <b>{r.enrolled}</b>,
  },
  {
    key: 'onLeave',
    header: '휴원',
    width: '68px',
    align: 'right',
    value: (r) => r.onLeave ?? '',
    render: (r) => countCell(r.onLeave),
  },
  {
    key: 'withdrawn',
    header: '퇴원',
    width: '68px',
    align: 'right',
    value: (r) => r.withdrawn ?? '',
    render: (r) => countCell(r.withdrawn),
  },
  {
    key: 'nature',
    header: '자연',
    width: '68px',
    align: 'right',
    value: (r) => r.nature ?? '',
    render: (r) => countCell(r.nature),
  },
  {
    key: 'humanity',
    header: '인문',
    width: '68px',
    align: 'right',
    value: (r) => r.humanity ?? '',
    render: (r) => countCell(r.humanity),
  },
  {
    key: 'fill',
    header: '충원율',
    width: '150px',
    value: (r) => (r.capacity ? Math.round((r.enrolled / r.capacity) * 100) : ''),
    render: (r) =>
      r.capacity ? <FillBar ratio={r.enrolled / r.capacity} /> : <span style={{ color: 'var(--muted)' }}>정원 없음</span>,
  },
]

interface MonthRow {
  month: string
  count: number
  delta: number | null
}

/* ★ 월별은 '신규 등원' 이 아니다. 서버는 **그달 말 등록 인원**과 **전월 대비 증감**을 준다.
     증감은 들어온 사람에서 나간 사람을 뺀 값이라 음수도 된다 — '신규' 칸에 넣으면 거짓말이 된다.
     목업 열 이름(신규 등원 / 누계)을 서버가 주는 뜻에 맞게 바꿨다(2026-09-21). */
const MONTH_COLUMNS: Column<MonthRow>[] = [
  { key: 'month', header: '월', value: (r) => r.month },
  { key: 'count', header: '등록 인원', value: (r) => r.count },
  { key: 'delta', header: '전월 대비', value: (r) => (r.delta === null ? '' : r.delta) },
]

/*
 * 전년 대비 비교 — 헤더 버튼(켜기/끄기)과 본문을 잇는다. 누를 때마다 버전이 오르므로 홀수면 켜진 것.
 * ★ 반끼리는 비교하지 않는다. 반은 해마다 새로 만들어 작년 '고3 1반' 과 올해 '고3 1반' 이 다른 반이다.
 *   월별 등록 인원만 같은 달끼리 나란히 놓는다.
 */
const compareSignal = createScreenSignal()

const RETAKE_COLS: { label: string; test: (n: number) => boolean }[] = [
  { label: '재수', test: (n) => n === 1 },
  { label: '삼수', test: (n) => n === 2 },
  { label: 'N수', test: (n) => n >= 3 },
]

function signed(n: number | null): string {
  if (n === null) return '-'
  return n > 0 ? `+${n}` : String(n)
}

function Content() {
  const { academies } = useAcademy()
  const [tab, setTab] = useState('class')
  /** null = 전체 지점. 본사 계정만 전 지점 합계를 받는다(지점 계정은 자기 지점뿐) */
  const [branchId, setBranchId] = useState<number | null>(null)
  const year = new Date().getFullYear()

  const [classes, setClasses] = useState<ClassGroup[]>([])
  /*
   * 학생 목록 — 반별 휴원·퇴원·계열과 계열 × 재수 구분을 여기서 센다. 서버 집계는 재원 인원만 준다.
   * ★ 한 번에 받는다(지점 재원·휴원·퇴원 합쳐 수백 명). 실패하면 그 칸들만 '미제공' 으로 남긴다.
   */
  const [students, setStudents] = useState<Student[] | null>(null)
  const [byClass, setByClass] = useState<StudentStatRow[]>([])
  const [byTrack, setByTrack] = useState<StudentStatRow[]>([])
  const [byMonth, setByMonth] = useState<StudentStatRow[]>([])
  const compareVer = compareSignal.useVersion()
  const compare = compareVer % 2 === 1
  const [prevMonth, setPrevMonth] = useState<StudentStatRow[] | null>(null)
  const [status, setStatus] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const academyId = branchId ?? undefined
      const today = todayStr()
      const [cls, c, t, m, st] = await Promise.all([
        listClasses(year, academyId),
        getStudentStatistics({ academyId, year, groupBy: 'CLASS' }),
        getStudentStatistics({ academyId, year, groupBy: 'TRACK' }),
        getStudentStatistics({ academyId, year, groupBy: 'MONTH' }),
        /* 재원·휴원·퇴원 합계는 대시보드 개요에서 받는다 — 현황 집계에는 상태별 합계가 없다 */
        getStatistics({ academyId, year, from: today, to: today }),
      ])
      setClasses(cls)
      searchStudents({ academyId, year, size: 2000 })
        .then((p) => setStudents(p.rows))
        .catch(() => setStudents(null))
      setByClass(c)
      setByTrack(t)
      setByMonth(m)
      setStatus(st.students.byStatus ?? {})
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '학원생 현황을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [branchId, year])

  useEffect(() => {
    void load()
  }, [load])

  const branchName = branchId === null ? '전체' : (academies.find((a) => a.id === branchId)?.acadNm ?? '')
  /* ★ 반 목록을 기준으로 합친다. 예전엔 서버 집계가 재원 0 인 반을 뺐다(2026-09-21 고쳐짐 —
       API_GAPS 28-1). 지금도 합치는 이유: 담임·정원은 반 목록에만 있다 */
  /* 반별 휴원·퇴원·계열 — 반 이름은 지점마다 겹치므로 지점까지 붙여 센다 */
  const tally = useMemo(() => {
    const m = new Map<string, { onLeave: number; withdrawn: number; nature: number; humanity: number }>()
    for (const st of students ?? []) {
      if (!st.className) continue
      const k = `${st.academyId}:${st.className}`
      const t = m.get(k) ?? { onLeave: 0, withdrawn: 0, nature: 0, humanity: 0 }
      if (st.enrollmentStatus === 'LEAVE') t.onLeave++
      if (st.enrollmentStatus === 'WITHDRAWN') t.withdrawn++
      if (st.enrollmentStatus === 'ENROLLED') {
        if (st.track === 'SCIENCE') t.nature++
        if (st.track === 'HUMANITIES') t.humanity++
      }
      m.set(k, t)
    }
    return m
  }, [students])

  /*
   * 반별 휴원·퇴원·계열 — **서버 반별 통계 값이 기준**이다(2026-09-21 추가). 서버 행이 없는 반(반 목록에는
   * 있고 통계에는 없는 경우)만 학생 목록으로 센 값을 쓴다. 둘은 셈이 다를 수 있다 — 서버는 퇴원 처리된
   * 학생까지 세고, 학생 목록은 그해 등록만 온다(분당 N수 1반 퇴원: 서버 2 · 목록 0).
   */
  const countsOf = (row: StudentStatRow | undefined, key: string) => {
    if (row && row.onLeave !== undefined) {
      return {
        onLeave: row.onLeave,
        withdrawn: row.withdrawn ?? 0,
        nature: row.tracks?.SCIENCE ?? 0,
        humanity: row.tracks?.HUMANITIES ?? 0,
      }
    }
    if (students === null) return { onLeave: null, withdrawn: null, nature: null, humanity: null }
    return { onLeave: 0, withdrawn: 0, nature: 0, humanity: 0, ...tally.get(key) }
  }

  const classRows: ClassRow[] = useMemo(() => {
    const stat = new Map(byClass.map((r) => [r.key, r]))
    /* 전 지점이면 반 이름이 겹친다(분당 고3 1반 · 이매 고3 1반) — 지점을 앞에 붙인다 */
    const nameOf = new Map(academies.map((a) => [a.id, a.acadNm]))
    return classes.map((c) => ({
      key: String(c.id),
      classNo: branchId === null ? `${nameOf.get(c.academyId) ?? ''} ${c.name}`.trim() : c.name,
      teacher: c.homeroomTeacherName,
      capacity: c.capacity,
      enrolled: stat.get(String(c.id))?.count ?? 0,
      ...countsOf(stat.get(String(c.id)), `${c.academyId}:${c.name}`),
    }))
  }, [classes, byClass, branchId, academies, tally, students])

  /* 계열 × 재수 — 재원생만. 계열 null(미정)은 행이 없어 합계에서만 센다 */
  const retakeCount = (track: string | null, test: (n: number) => boolean) =>
    (students ?? []).filter(
      (st) =>
        st.enrollmentStatus === 'ENROLLED' &&
        st.retakeCount != null &&
        test(st.retakeCount) &&
        (track === null || st.track === track),
    ).length
  const noRetake = (students ?? []).filter(
    (st) => st.enrollmentStatus === 'ENROLLED' && st.grade === 'N_SU' && st.retakeCount == null,
  ).length

  const enrolled = status.ENROLLED ?? 0
  const onLeave = status.LEAVE ?? 0
  const withdrawn = status.WITHDRAWN ?? 0
  /* 충원율은 **반 배정 기준**이다. 반 없이 재원 중인 학생은 정원에 안 잡혀서,
     전체 재원을 정원으로 나누면 100% 를 넘기거나 엉뚱한 값이 된다 */
  const seated = classRows.reduce((n, r) => n + r.enrolled, 0)
  const totalCapacity = classRows.reduce((n, r) => n + (r.capacity ?? 0), 0)
  const fillPct = totalCapacity > 0 ? Math.round((seated / totalCapacity) * 100) : null

  const months: MonthRow[] = byMonth.map((r) => ({ month: r.key, count: r.count, delta: r.delta }))
  /* 작년 같은 달 — 키가 'yyyy-MM' 이라 달만 떼어 맞춘다 */
  const prevByMm = new Map((prevMonth ?? []).map((r) => [r.key.slice(-2), r.count]))

  useEffect(() => {
    if (!compare) {
      setPrevMonth(null)
      return
    }
    setTab('month')
    let alive = true
    getStudentStatistics({ academyId: branchId ?? undefined, year: year - 1, groupBy: 'MONTH' })
      .then((r) => alive && setPrevMonth(r))
      .catch(() => alive && setPrevMonth([]))
    return () => {
      alive = false
    }
  }, [compare, branchId, year])
  const maxCount = Math.max(1, ...months.map((m) => m.count))
  const lastMonth = months.at(-1)

  const trackTotal = byTrack.reduce((n, r) => n + r.count, 0)

  return (
    <>
      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 재원
          </div>
          <div className="v">{enrolled}</div>
          <div className="d">반 배정 {seated}명</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 충원율
          </div>
          <div className="v">{fillPct === null ? '-' : `${fillPct}%`}</div>
          <div className="d">
            {totalCapacity > 0 ? `정원 ${totalCapacity}석 · 여석 ${Math.max(0, totalCapacity - seated)}석` : '정원이 정해진 반이 없습니다'}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="door-open" size={13} /> 휴원
          </div>
          <div className="v">{onLeave}</div>
          <div className="d warn">복귀 상담 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-x" size={13} /> 퇴원
          </div>
          <div className="v">{withdrawn}</div>
          <div className="d down">{year}년 누적</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="layout-grid" size={13} /> 운영 반
          </div>
          <div className="v">{classRows.length}</div>
          <div className="d">{year}년 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="trending-up" size={13} /> 이번 달 증감
          </div>
          <div className="v">{lastMonth ? signed(lastMonth.delta) : '-'}</div>
          <div className="d up">{lastMonth ? `${lastMonth.month} · 전월 대비` : '-'}</div>
        </div>
      </div>

      <div className="filter-row" style={{ background: '#fff', borderRadius: 12, marginBottom: 14, border: 'none' }}>
        {/* 지점은 하드코딩하지 않는다 — 권한에 맞는 목록을 서버가 준다 */}
        <button type="button" className={`chip${branchId === null ? ' on' : ''}`} onClick={() => setBranchId(null)}>
          전체
        </button>
        {academies.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`chip${branchId === a.id ? ' on' : ''}`}
            onClick={() => setBranchId(a.id)}
          >
            {a.acadNm}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', alignSelf: 'center' }}>
          볼 수 있는 지점은 계정 권한에 따라 다릅니다
        </span>
      </div>

      <Tabs items={TABS} active={tab} onChange={setTab} standalone />

      {tab === 'class' && (
        <DataTable
          columns={CLASS_COLUMNS}
          rows={classRows}
          rowKey={(r) => r.key}
          masked={false}
          loading={loading}
          pageSize={10}
          emptyText={`${year}년에 만든 반이 없습니다.`}
          countLabel={
            <>
              {branchName} · 반 <b>{classRows.length}</b>개 · <span style={{ color: 'var(--muted)' }}>재원생 기준</span>
            </>
          }
          toolbar={
            <>
              <PrintButton />
              <ExcelButton filename={`학원생현황_반별_${branchName}`} columns={CLASS_COLUMNS} rows={classRows} masked={false} />
            </>
          }
        />
      )}

      {tab === 'cross' && (
        <div className="card-sec p-matrix">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="table-2" size={15} />
              </span>
              계열 × 재수 구분 — 재원생 {trackTotal}명
            </div>
            <div className="r">
              <span className="mk supplement">휴원 · 퇴원 제외</span>
            </div>
          </div>
          <div className="card-sec-b">
            <div className="mx-scroll">
              <table className="mx">
                <thead>
                  <tr>
                    <th className="area">계열</th>
                    {RETAKE_COLS.map((r) => (
                      <th key={r.label}>{r.label}</th>
                    ))}
                    <th>합계</th>
                  </tr>
                </thead>
                <tbody>
                  {byTrack.map((t) => (
                    <tr key={t.key}>
                      <th className="area">
                        {TRACK_LABEL[t.key] ?? t.label}
                        <span className="an">{t.key === 'SCIENCE' ? '수학 미적/기하 · 과탐' : '수학 확통 · 사탐'}</span>
                      </th>
                      {/* 교차는 서버가 안 준다 — 학생 목록의 재수 횟수로 센다(1 재수 · 2 삼수 · 3 이상 N수) */}
                      {RETAKE_COLS.map((r) => (
                        <td key={r.label}>
                          {students === null ? (
                            <Unfilled reason="학생 목록을 못 받았다" />
                          ) : (
                            <span className="pm">{retakeCount(t.key, r.test)}</span>
                          )}
                        </td>
                      ))}
                      <td>
                        <span className="pm p-full">{t.count}</span>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th className="area">합계</th>
                    {RETAKE_COLS.map((r) => (
                      <td key={r.label}>
                        {students === null ? (
                          <Unfilled reason="학생 목록을 못 받았다" />
                        ) : (
                          <span className="pm">{retakeCount(null, r.test)}</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <span className="pm p-full">{trackTotal}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mx-legend">
              <span>
                <span className="pm p-full">n</span> 계열 합계 (재원생)
              </span>
              {noRetake > 0 && (
                <span style={{ color: 'var(--muted)' }}>재수 횟수가 비어 있는 N수생 {noRetake}명은 합계에만 들어갑니다</span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'month' && (
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name="trending-up" size={15} />
              </span>
              월별 등록 인원 · 증감
            </div>
            <div className="r">
              <ExcelButton filename={`학원생현황_월별_${branchName}`} columns={MONTH_COLUMNS} rows={months} masked={false} />
            </div>
          </div>
          <div className="card-sec-b" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ★ 반별·계열과 기준이 다르다 — 이쪽은 휴원·퇴원까지 센다. 밝히지 않으면 같은 달이
                   탭마다 다른 숫자로 보인다 */}
            <div className="note-box">
              <div>
                그달 말 기준 <b>등록 인원(휴원·퇴원 포함)</b>입니다. 재원생만 센 반별·계열 탭과는 숫자가
                다를 수 있습니다.
              </div>
            </div>
            {months.length === 0 && !loading && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{year}년 등록 기록이 없습니다.</div>
            )}
            {months.map((m) => (
              <div key={m.month} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 68, fontSize: 12, fontWeight: 700, color: 'var(--ink-2)' }}>{m.month}</span>
                <span style={{ flex: 1, height: 22, borderRadius: 7, background: 'var(--line-2)', overflow: 'hidden' }}>
                  <span
                    style={{
                      display: 'block',
                      width: `${(m.count / maxCount) * 100}%`,
                      height: '100%',
                      background: 'var(--mint)',
                    }}
                  />
                </span>
                <span style={{ width: 58, fontSize: 12.5, fontWeight: 800, textAlign: 'right' }}>{m.count}명</span>
                <span
                  style={{
                    width: 92,
                    fontSize: 11.5,
                    textAlign: 'right',
                    color: m.delta === null || m.delta === 0 ? 'var(--muted)' : m.delta > 0 ? 'var(--mint-d)' : 'var(--red)',
                  }}
                >
                  {m.delta === null ? '첫 달' : `전월 대비 ${signed(m.delta)}`}
                </span>
                {compare && (
                  <span style={{ width: 150, fontSize: 11.5, textAlign: 'right', color: 'var(--violet)' }}>
                    {(() => {
                      const p = prevByMm.get(m.month.slice(-2))
                      return p === undefined ? `${year - 1}년 기록 없음` : `${year - 1}년 ${p}명 (${signed(m.count - p)})`
                    })()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function CompareButton() {
  const on = compareSignal.useVersion() % 2 === 1
  return (
    <button
      className={`btn${on ? ' pri' : ''}`}
      onClick={() => compareSignal.bump()}
      title="월별 등록 인원을 작년 같은 달과 나란히 봅니다"
    >
      <Icon name="bar-chart-3" size={14} /> {on ? '전년 비교 끄기' : '전년 대비 비교'}
    </button>
  )
}

export const studentStatusMockup: Mockup = {
  Content,
  /* 자체 지점 칩(전체·분당…)으로 조회한다 — 상단 지점 선택이 비어 있어도 멀쩡히 돈다.
     그대로 두면 "고르기 전에는 조회를 시작하지 않습니다" 가 떠서 실제 숫자를 가짜로 읽게 된다 */
  allBranches: true,
  actions: (
    <>
      <button className="btn" disabled data-soon title="준비 중입니다">기수 선택 ▾</button>
      <CompareButton />
    </>
  ),
}
