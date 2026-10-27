import { useEffect, useMemo, useState } from 'react'
import {
  DataTable,
  ExcelButton,
  MaskToggle,
  SearchForm,
  Unfilled,
  todayStr,
  useMaskDefault,
  useServerTable,
  type Column,
  type Field,
  type SearchValues,
  MockNotice,
} from '../../components/common'
import { useAcademy } from '../../auth/AcademyContext'
import { listClasses, type ClassGroup } from '../../api/classes'
import { DR_SORTABLE, listDailyReports, minutesText, type DailyReportRow } from '../../api/dailyReports'
import { recalculateStudyTime } from '../../api/attendance'
import { ApiError } from '../../api/client'
import { createScreenSignal } from './screenSignal'

/* 헤더의 「재집계」 ↔ 본문. 부모가 달라 props 로 못 내린다 */
const recalcSignal = createScreenSignal()
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'

/* F-4.11-6 Daily Report 집계 — 신규개발-요구사항신규
 *
 * 앱 Daily Report(대시보드)의 데이터 원천. 이 화면은 관리자가 집계 결과를 확인하는 곳이다.
 * ⚠ #26 / I-6 (중) — 순공시간 산출 정의(입퇴실/좌석없음 반영 기준) 미확정.
 *   실행가이드: "순공시간산출 확정후 배치확정, 미확정시 원시로그 집계만" */

/** 달력 뷰(목업)가 쓰는 분 → 'Nh MMm' */
function hhmm(min: number): string {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

/** 집계값이 없으면 **0 이 아니라 빈칸**이다 — 「집계 안 한 날」과 「0분」은 다르다 */
function num(v: number | null | undefined): string {
  return v == null ? '' : String(v)
}

const COLUMNS: Column<DailyReportRow>[] = [
  {
    key: 'studyRank',
    header: '순위',
    width: '70px',
    align: 'center',
    /* ★ 순위는 **서버가 센다.** 화면이 세면 페이징된 그 페이지 안에서만 매겨져
       2페이지 첫 줄이 또 1등이 된다 */
    value: (r) => r.studyRank ?? '',
    render: (r) =>
      r.studyRank == null ? (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ) : r.studyRank <= 3 ? (
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: ['#E8920F', '#8B94A3', '#B87333'][r.studyRank - 1],
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {r.studyRank}
        </span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>{r.studyRank}</span>
      ),
  },
  { key: 'studentNo', header: '학번', width: '104px', value: (r) => r.studentNo ?? '-' },
  { key: 'studentName', header: '이름', width: '88px', mask: 'name', value: (r) => r.studentName ?? '-' },
  { key: 'className', header: '반', width: '92px', align: 'center', value: (r) => r.className ?? '-' },
  {
    key: 'studyMinutes',
    header: '순공시간',
    width: '112px',
    align: 'right',
    value: (r) => r.studyMinutes ?? '',
    render: (r) =>
      r.studyMinutes == null ? (
        <span style={{ color: 'var(--muted)' }}>집계 전</span>
      ) : (
        <b style={{ color: 'var(--mint-d)' }}>{minutesText(r.studyMinutes)}</b>
      ),
  },
  {
    key: 'presenceMinutes',
    header: '재실시간',
    width: '112px',
    align: 'right',
    value: (r) => r.presenceMinutes ?? '',
    render: (r) => (
      <span style={{ color: 'var(--muted)' }}>
        {r.presenceMinutes == null ? '집계 전' : minutesText(r.presenceMinutes)}
      </span>
    ),
  },
  {
    key: 'concentration',
    header: '집중도',
    width: '96px',
    align: 'right',
    value: () => '',
    /* ★ **화면에서 계산하지 않는다.** 전에는 순공/재실로 나눠 퍼센트를 그렸는데,
       그건 우리가 만든 숫자일 뿐이다 — 산식이 요구사항에 없어 서버도 안 만든다.
       만들어 보여주면 **화면이 그걸 사실로 보여주는 것**이 된다 */
    render: () => <Unfilled reason="집중도 산식이 아직 정해지지 않았습니다" />,
  },
  {
    key: 'routineCompletionRate',
    header: '루틴 이행',
    width: '96px',
    align: 'right',
    value: (r) => r.routineCompletionRate ?? '',
    /* ★ 「루틴이 없던 기간」과 「0% 이행」은 다르다 */
    render: (r) =>
      r.routineCompletionRate == null ? (
        <span style={{ color: 'var(--muted)' }}>판정 없음</span>
      ) : (
        <span>
          {r.routineCompletionRate}%
          <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 4 }}>
            {r.routineDone ?? 0}/{r.routineJudged ?? 0}
          </span>
        </span>
      ),
  },
  {
    key: 'attendedDays',
    header: '출석일',
    width: '92px',
    align: 'right',
    value: (r) => r.attendedDays ?? '',
    render: (r) => (
      <span>
        {num(r.attendedDays)}
        {r.measuredDays != null && <span style={{ color: 'var(--muted)', fontSize: 11 }}> / {r.measuredDays}</span>}
      </span>
    ),
  },
  {
    key: 'missingCheckOutDays',
    header: '하원 미태그',
    width: '104px',
    align: 'right',
    value: (r) => r.missingCheckOutDays ?? '',
    /* ★ 이 값이 크면 **그 학생의 순공시간을 믿으면 안 된다** — 0분이 아니라 안 센 것이다 */
    render: (r) =>
      (r.missingCheckOutDays ?? 0) > 0 ? (
        <span style={{ color: 'var(--amber)', fontWeight: 700 }} title="하원 시각을 넣으면 다음 집계에 들어갑니다">
          {r.missingCheckOutDays}일
        </span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>-</span>
      ),
  },
  {
    key: 'homeroomTeacherName',
    header: '담임',
    width: '88px',
    value: (r) => r.homeroomTeacherName ?? '-',
  },
]

/** 달력 뷰 — 2026-05, 5/1이 금요일 */
const FIRST_DOW = 5
const DAYS_IN_MONTH = 31
const DOW = ['일', '월', '화', '수', '목', '금', '토']

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('rank')
  const [masked, setMasked] = useState(useMaskDefault())
  const [classes, setClasses] = useState<ClassGroup[]>([])

  /* ★ 기간은 **반드시 받는다**(from·to 필수). 기본은 이번 달 1일~오늘이다 —
     「오늘 하루」로 두면 새벽에 열었을 때 통째로 비어 보인다(집계가 밤에 돈다) */
  const [query, setQuery] = useState<SearchValues>(() => {
    const t = todayStr()
    return { period: { from: `${t.slice(0, 8)}01`, to: t }, classId: '' }
  })

  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      return
    }
    let alive = true
    listClasses(new Date().getFullYear(), academyId)
      .then((v) => alive && setClasses(v.filter((c) => c.academyId === academyId)))
      .catch(() => alive && setClasses([]))
    return () => {
      alive = false
    }
  }, [academyId])

  const fields = useMemo<Field[]>(
    () => [
      { name: 'period', label: '기간', type: 'dateRange' },
      {
        name: 'classId',
        label: '반',
        type: 'select',
        options: [{ value: '', label: '전체' }, ...classes.map((c) => ({ value: String(c.id), label: c.name }))],
      },
    ],
    [classes],
  )

  /* ★ useMemo 없이 넘기면 매 렌더 새 객체라 **무한 요청**이 된다 */
  const params = useMemo(() => {
    const r = query.period
    const range = r && typeof r === 'object' && !Array.isArray(r) ? r : { from: '', to: '' }
    const cid = typeof query.classId === 'string' ? query.classId : ''
    const t = todayStr()
    return {
      academyId: academyId ?? undefined,
      /* ★ from·to 는 **필수**다. 비면 서버가 400 을 주므로 오늘로 채운다 */
      from: range.from || `${t.slice(0, 8)}01`,
      to: range.to || t,
      classId: cid === '' ? undefined : Number(cid),
    }
  }, [query, academyId])

  const table = useServerTable({
    fetcher: listDailyReports,
    params,
    sortable: DR_SORTABLE,
    enabled: academyId !== null,
  })

  const [recalc, setRecalc] = useState<{ busy: boolean; msg: string | null; err: string | null }>({
    busy: false,
    msg: null,
    err: null,
  })

  /* ★ **오늘은 대상이 아니다.** 아직 하원 전이라 값이 계속 늘어 저장할 시점이 아니다 —
     서버도 오늘을 빼고 돈다. 화면이 보고 있는 기간 그대로 넘긴다 */
  const recalcV = recalcSignal.useVersion()
  useEffect(() => {
    if (recalcV === 0) return
    setRecalc({ busy: true, msg: null, err: null })
    recalculateStudyTime({ academyId: academyId ?? undefined, from: params.from, to: params.to })
      .then((r) => {
        /* ★ 0 이 와도 실패가 아니다 — 「확정된 날이 없다」는 뜻이다 */
        setRecalc({
          busy: false,
          err: null,
          msg:
            r.updated > 0
              ? `${params.from} ~ ${params.to} · ${r.updated}건을 다시 계산했습니다.`
              : '다시 계산할 확정된 날이 없습니다. 오늘은 하원 뒤에 집계됩니다.',
        })
        table.reload()
      })
      .catch((e) => setRecalc({ busy: false, msg: null, err: e instanceof ApiError ? e.message : '다시 계산하지 못했습니다.' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recalcV])

  const rows = table.rows
  /* ★ **집계가 없는 학생은 빼고** 평균을 낸다. null 을 0 으로 치면 평균이 통째로 내려간다 */
  const measured = rows.filter((r) => r.studyMinutes != null)
  const avgStudy =
    measured.length === 0 ? null : Math.round(measured.reduce((a, r) => a + (r.studyMinutes ?? 0), 0) / measured.length)
  const top = rows.find((r) => r.studyRank === 1) ?? null
  /* ★ 하원 태깅이 빠진 날이 있으면 **그 학생의 순공시간을 믿으면 안 된다** */
  const missing = rows.filter((r) => (r.missingCheckOutDays ?? 0) > 0).length

  return (
    <>
      <div className="stat-strip c4">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 집계 대상
          </div>
          <div className="v">{table.serverPaging?.totalElements ?? rows.length}</div>
          <div className="d">{params.from} ~ {params.to}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="timer" size={13} /> 평균 순공
          </div>
          <div className="v" style={{ fontSize: 18 }}>
            {avgStudy == null ? '-' : minutesText(avgStudy)}
          </div>
          <div className="d">집계된 {measured.length}명 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="trophy" size={13} /> 1위
          </div>
          <div className="v" style={{ fontSize: 18 }}>
            {top?.studyMinutes == null ? '-' : minutesText(top.studyMinutes)}
          </div>
          <div className="d">{top == null ? '집계 없음' : masked ? '***' : (top.studentName ?? '-')}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 하원 미태그
          </div>
          <div className="v" style={{ color: missing > 0 ? 'var(--amber)' : undefined }}>
            {missing}
          </div>
          <div className="d">{missing > 0 ? '순공시간이 적게 반영됩니다' : '없음'}</div>
        </div>
      </div>

      {/* ★ 0 과 빈칸을 가르는 안내. 안 입력하면 「공부 안 한 학생」으로 읽는다 */}
      <div className="note-box">
        <div>
          하원 태깅이 없는 날은 <b>집계하지 않습니다</b> — 0분이 아니라 빈칸입니다. 출결 관리에서 하원 시각을
          넣으면 다음 집계에 들어갑니다.
        </div>
      </div>

      {recalc.busy && (
        <div className="note-box" role="status">
          <div>다시 계산하는 중입니다…</div>
        </div>
      )}
      {recalc.msg && (
        <div className="note-box" role="status">
          <div>{recalc.msg}</div>
        </div>
      )}
      {recalc.err && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {recalc.err}
        </div>
      )}
      {table.error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {table.error}
        </div>
      )}

      <SearchForm fields={fields} initial={query} onSearch={setQuery} />

      <div className="card-sec">
        <Tabs
          items={[
            // 목업 배열 길이라 배지를 뺀다
            { key: 'rank', label: '순공시간 랭킹' },
            { key: 'cal', label: '달력 뷰' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'rank' ? (
          <div style={{ padding: 14 }}>
            <DataTable
              nowrap
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => String(r.enrollmentId)}
              masked={masked}
              loading={table.loading}
              serverPaging={table.serverPaging}
              countLabel={
                <>
                  집계 <b>{table.serverPaging?.totalElements ?? rows.length}</b>명
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="Daily_Report_집계" columns={COLUMNS} rows={rows} masked={masked} />
                </>
              }
            />
          </div>
        ) : (
          <div className="card-sec-b">
            {/* ★ 달력은 **앱 화면용 API**(`/app/daily-reports/monthly`)다 — 학생 본인 것만 준다.
                   관리자가 남의 달력을 보는 경로가 없어 예시로 둔다 */}
            <MockNotice reason="학생 한 명의 달력을 관리자가 보는 경로가 아직 없습니다. 앱에서 학생 본인이 보는 화면입니다." />
            <div style={{ fontSize: 12.5, marginBottom: 12, color: 'var(--muted)' }}>
              학생 1명의 2026-05 일자별 집계 — 앱 Daily Report 달력이 그리는 데이터입니다.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {DOW.map((d, i) => (
                <div
                  key={d}
                  style={{
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 800,
                    color: i === 0 ? 'var(--red)' : i === 6 ? 'var(--blue)' : 'var(--muted)',
                    padding: '4px 0 6px',
                  }}
                >
                  {d}
                </div>
              ))}
              {Array.from({ length: FIRST_DOW }, (_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: DAYS_IN_MONTH }, (_, i) => {
                const day = i + 1
                const dow = (FIRST_DOW + i) % 7
                const weekend = dow === 0 || dow === 6
                const study = weekend ? 240 + ((day * 13) % 120) : 480 + ((day * 29) % 220)
                const pct = Math.min(100, Math.round((study / 720) * 100))
                const att = day % 13 === 5 ? '결석' : day % 7 === 3 ? '지각' : null
                return (
                  <div
                    key={day}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 10,
                      padding: '7px 8px',
                      minHeight: 78,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 3,
                      background: att === '결석' ? 'var(--red-wash)' : '#fff',
                    }}
                    title={`${day}일 · 순공 ${hhmm(study)}${att ? ` · ${att}` : ''}`}
                  >
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: att === '결석' ? 'var(--red)' : 'var(--ink-2)' }}>
                      {day}
                      {att && (
                        <span style={{ fontSize: 9, marginLeft: 4, color: att === '결석' ? 'var(--red)' : 'var(--amber)' }}>
                          {att}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--mint-d)' }}>{hhmm(study)}</div>
                    <div style={{ height: 4, background: 'var(--line-2)', borderRadius: 3, marginTop: 'auto' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mint)', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                      질의 {day % 4} · 테스트 {60 + ((day * 7) % 41)}%
                    </div>
                  </div>
                )
              })}
            </div>

          </div>
        )}
      </div>
    </>
  )
}

export const dailyReportMockup: Mockup = {
  Content,
  actions: (
    <>
      {/* ★ 「기간 선택」 버튼은 없앴다 — 기간은 본문 검색에 있다. 누를 수 없는 버튼이
             값을 말할 이유가 없다 */}
      <button
        className="btn"
        title="출결을 고쳤거나 교시를 바꿨을 때 순공시간을 다시 계산합니다. 오늘은 하원 뒤에 집계됩니다"
        onClick={() => recalcSignal.bump()}
      >
        <Icon name="refresh-cw" size={14} /> 순공시간 다시 계산
      </button>
    </>
  ),
}
