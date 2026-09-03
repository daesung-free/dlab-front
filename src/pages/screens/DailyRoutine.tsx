import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, Unfilled, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  DONE_STATUSES,
  ROUTINE_STATUS_LABEL,
  getRoutineMatrix,
  listRoutines,
  type MatrixRow,
  type Routine,
  type RoutineRef,
  type RoutineStatus,
} from '../../api/routines'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-1 데일리 루틴 관리 — /api/v1/admin/routines
 *
 * 월별 루틴 세팅(과목은 매월 상이) + 학생별 결과.
 * 상벌점 규칙 엔진 자동 연동은 I-5 확정 대기 →
 *   실행가이드: "I-5 미확정시 결과입력까지만, 자동상벌점연동 후행"
 *
 * ★ 매트릭스를 한 번에 받는다(2026-09-03 신설). 예전에는 루틴 수만큼 호출해 조립했다.
 *   행의 `cells` 에는 **그 학생이 대상인 루틴만** 들어온다 — 반 지정 루틴이 섞이기 때문이라,
 *   컬럼은 `routines` 순서로 그리고 없는 칸은 '-' 로 둔다.
 *
 * ★ `status=null` 은 **아직 입력하지 않은 칸**이다. 미제출(NOT_SUBMITTED)과 다르다.
 *
 * ★ 서버에 없는 것
 *   · 상벌점 트리거 — I-5 미확정이라 목업도 미정이었다. 응답에도 없다
 *   · 학생별 상벌점 합계 — 위와 같은 이유
 *   · 루틴의 '필수/권장'은 recommended(boolean) 하나뿐이다 */

const DONE = new Set<RoutineStatus>(DONE_STATUSES)

/** 화면이 쓰는 행 — 서버 매트릭스 행에 이행률을 더한 것 */
interface Row extends MatrixRow {
  rate: number
}

function withRate(rows: MatrixRow[]): Row[] {
  return rows.map((r) => {
    // 아직 입력 안 한 칸(status=null)은 분모에서 뺀다 — 안 그러면
    // 입력 전 학생이 전부 이행률 0%로 보인다
    const answered = r.cells.filter((c) => c.status !== null)
    const done = answered.filter((c) => DONE.has(c.status as RoutineStatus))
    return { ...r, rate: answered.length === 0 ? 0 : Math.round((done.length / answered.length) * 100) }
  })
}

function thisMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

const ROUTINE_COLUMNS: Column<Routine>[] = [
  { key: 'name', header: '루틴명', sortable: true, value: (r) => r.name },
  { key: 'subject', header: '과목', width: '84px', align: 'center', sortable: true, value: (r) => r.subject ?? '-' },
  {
    key: 'maxScore',
    header: '배점',
    width: '84px',
    align: 'right',
    sortable: true,
    value: (r) => r.maxScore,
    // maxScore 0 은 "점수 없이 완료/미완료만" 이라는 뜻이다
    render: (r) => (r.maxScore > 0 ? <b>{r.maxScore}점</b> : <span style={{ color: 'var(--muted)' }}>완료/미완료</span>),
  },
  {
    key: 'recommended',
    header: '권장',
    width: '90px',
    align: 'center',
    value: (r) => (r.recommended ? '권장' : '일반'),
    render: (r) => <span className={`mk ${r.recommended ? 'supplement' : ''}`}>{r.recommended ? '권장' : '일반'}</span>,
  },
  { key: 'className', header: '대상', width: '96px', align: 'center', value: (r) => r.className ?? '지점 공통' },
  {
    key: 'trigger',
    header: '상벌점 트리거',
    width: '176px',
    value: () => '',
    render: () => <Unfilled reason="I-5(상벌점 규칙) 확정 대기 — 응답에도 필드가 없다" />,
  },
]

function Content() {
  const { academyId } = useAcademy()
  const [tab, setTab] = useState('result')
  const [masked, setMasked] = useState(true)
  const [month, setMonth] = useState(thisMonth())
  const [date, setDate] = useState(todayStr())

  const [routines, setRoutines] = useState<Routine[]>([])
  const [cols, setCols] = useState<RoutineRef[]>([])
  const [matrix, setMatrix] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (academyId === null) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      // 설정 탭용 루틴 목록과 결과 매트릭스를 함께 받는다
      const [list, day] = await Promise.all([listRoutines(academyId, month), getRoutineMatrix(academyId, date)])
      setRoutines(list)
      setCols(day.routines)
      setMatrix(withRate(day.rows))
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '루틴을 불러오지 못했습니다.')
      setRoutines([])
      setCols([])
      setMatrix([])
    } finally {
      setLoading(false)
    }
  }, [academyId, month, date])

  useEffect(() => {
    void load()
  }, [load])

  const columns = useMemo<Column<Row>[]>(
    () => [
      { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '84px', mask: 'name', sortable: true, value: (r) => r.studentName },
      { key: 'className', header: '반', width: '58px', align: 'center', value: (r) => r.className ?? '-' },
      ...cols.map(
        (rt): Column<Row> => ({
          key: `rt-${rt.id}`,
          header: (
            <span title={`${rt.subject ?? '공통'}${rt.maxScore > 0 ? ` · ${rt.maxScore}점` : ' · 완료/미완료'}`}>
              {rt.name.length > 8 ? `${rt.name.slice(0, 7)}…` : rt.name}
            </span>
          ),
          width: '96px',
          align: 'center',
          value: (r) => {
            const c = r.cells.find((x) => x.routineId === rt.id)
            if (!c || c.status === null) return ''
            if (rt.maxScore > 0) return c.reviewedScore ?? c.selfScore ?? 0
            return DONE.has(c.status) ? 1 : 0
          },
          render: (r) => {
            const c = r.cells.find((x) => x.routineId === rt.id)
            // 칸이 없으면 그 학생은 이 루틴 대상이 아니다. status=null 이면 아직 입력 전이다
            if (!c) return <span style={{ color: 'var(--line-2)' }}>·</span>
            if (c.status === null) return <span style={{ color: 'var(--muted)' }} title="아직 입력 전">-</span>

            if (rt.maxScore > 0) {
              const score = c.reviewedScore ?? c.selfScore
              if (score === null) return <span style={{ color: 'var(--muted)' }}>-</span>
              const ratio = score / rt.maxScore
              return (
                <b
                  style={{ color: ratio >= 0.8 ? 'var(--mint-d)' : ratio >= 0.6 ? 'var(--amber)' : 'var(--red)' }}
                  title={c.reviewedScore !== null ? '교사 검수 점수' : '학생 가채점'}
                >
                  {score}점
                </b>
              )
            }
            return DONE.has(c.status) ? (
              <span style={{ color: 'var(--mint-d)', fontWeight: 800 }} title={ROUTINE_STATUS_LABEL[c.status]}>
                ○
              </span>
            ) : (
              <span style={{ color: 'var(--red)', fontWeight: 800 }} title={ROUTINE_STATUS_LABEL[c.status]}>
                ✕
              </span>
            )
          },
        }),
      ),
      {
        key: 'rate',
        header: '이행률',
        width: '90px',
        align: 'right',
        sortable: true,
        value: (r) => r.rate,
        render: (r) => (
          <b style={{ color: r.rate >= 80 ? 'var(--green)' : r.rate >= 60 ? 'var(--amber)' : 'var(--red)' }}>
            {r.rate}%
          </b>
        ),
      },
      {
        key: 'points',
        header: '상벌점',
        width: '90px',
        align: 'center',
        value: () => '',
        render: () => <Unfilled reason="I-5(상벌점 규칙) 확정 대기" />,
      },
    ],
    [cols],
  )

  const avgRate = matrix.length === 0 ? 0 : Math.round(matrix.reduce((a, r) => a + r.rate, 0) / matrix.length)
  const low = matrix.filter((r) => r.rate < 60).length

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="repeat" size={13} /> 이번 달 루틴
          </div>
          <div className="v">{routines.length}</div>
          <div className="d">{month} · 과목 매월 상이</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 대상 학생
          </div>
          <div className="v">{matrix.length}</div>
          <div className="d">{date}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 평균 이행률
          </div>
          <div className="v" style={{ color: avgRate >= 80 ? 'var(--green)' : 'var(--amber)' }}>
            {avgRate}%
          </div>
          <div className="d">권장 80% 이상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="triangle-alert" size={13} /> 이행률 60% 미만
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {low}
          </div>
          <div className="d down">상담 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="zap" size={13} /> 자동 연동
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            대기
          </div>
          <div className="d warn">I-5 규칙 확정 필요</div>
        </div>
      </div>

      {error && (
        <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
          {error}
        </div>
      )}

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'result', label: '결과 입력', count: matrix.length },
            { key: 'setup', label: '월별 루틴 설정', count: routines.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'result' ? (
            <DataTable
              columns={columns}
              rows={matrix}
              rowKey={(r) => String(r.enrollmentId)}
              masked={masked}
              loading={loading}
              pageSize={12}
              countLabel={
                <>
                  {date} 결과 <b>{matrix.length}</b>명
                </>
              }
              emptyText={
                academyId === null
                  ? '지점을 먼저 선택하세요.'
                  : routines.length === 0
                    ? `${month}에 등록된 루틴이 없습니다.`
                    : '이 날짜의 결과가 없습니다.'
              }
              toolbar={
                <>
                  <input
                    className="inp"
                    type="date"
                    style={{ width: 140 }}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="데일리루틴_결과" columns={columns} rows={matrix} masked={masked} />
                  <button className="btn pri" disabled title="결과 입력 UI는 다음 단계입니다 (PUT은 일괄 저장을 지원합니다)">
                    <Icon name="save" size={14} /> 결과 저장
                  </button>
                </>
              }
            />
          ) : (
            <DataTable
              columns={ROUTINE_COLUMNS}
              rows={routines}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={loading}
              pageSize={10}
              countLabel={
                <>
                  {month} 루틴 <b>{routines.length}</b>건
                </>
              }
              emptyText={academyId === null ? '지점을 먼저 선택하세요.' : '등록된 루틴이 없습니다.'}
              toolbar={
                <>
                  <input
                    className="inp"
                    type="month"
                    style={{ width: 130 }}
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                  <button className="btn" disabled title="전월 복사 API는 있으나 확인 절차를 먼저 정해야 합니다">
                    <Icon name="copy" size={14} /> 전월 복사
                  </button>
                  <button className="btn pri" disabled title="루틴 추가 폼은 다음 단계입니다">
                    <Icon name="plus" size={14} /> 루틴 추가
                  </button>
                </>
              }
            />
          )}
        </div>
      </div>
    </>
  )
}

export const dailyRoutineMockup: Mockup = {
  Content,
}
