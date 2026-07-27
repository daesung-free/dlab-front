import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.11-6 Daily Report 집계(서버) — 신규개발-요구사항신규
 *
 * 앱 Daily Report(대시보드)의 데이터 원천. 이 화면은 관리자가 집계 결과를 확인하는 곳이다.
 * ⚠ #26 / I-6 (중) — 순공시간 산출 정의(입퇴실/좌석없음 반영 기준) 미확정.
 *   실행가이드: "순공시간산출 확정후 배치확정, 미확정시 원시로그 집계만" */

type Scope = 'ALL' | 'BRANCH' | 'CLASS'
type Period = 'DAY' | 'WEEK' | 'MONTH'

const SCOPES: { key: Scope; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: 'BRANCH', label: '지점' },
  { key: 'CLASS', label: '반' },
]
const PERIODS: { key: Period; label: string }[] = [
  { key: 'DAY', label: '일간' },
  { key: 'WEEK', label: '주간' },
  { key: 'MONTH', label: '월간' },
]

interface RankRow {
  id: string
  rank: number
  studentNo: string
  name: string
  classNo: string
  branch: string
  /** 순공시간(분) */
  studyMin: number
  /** 재실시간(분) — 순공 정의가 확정되면 여기서 차감 규칙이 정해진다 */
  presentMin: number
  qna: number
  routine: number
  attendance: string
  feedback: boolean
}

function buildRanks(period: Period): RankRow[] {
  const mult = period === 'DAY' ? 1 : period === 'WEEK' ? 6 : 24
  return MOCK_STUDENTS.filter((s) => s.status === '재원')
    .map((s, i) => {
      const present = (520 + ((i * 37) % 180)) * mult
      const study = Math.round(present * (0.72 + ((i % 20) / 100)))
      return {
        id: s.id,
        rank: 0,
        studentNo: s.studentNo,
        name: s.name,
        classNo: s.classNo,
        branch: s.branch,
        studyMin: study,
        presentMin: present,
        qna: (i % 4) * (period === 'DAY' ? 1 : 3),
        routine: 60 + ((i * 11) % 41),
        attendance: i % 13 === 12 ? '결석' : i % 5 === 4 ? '지각' : '정상',
        feedback: i % 3 !== 2,
      }
    })
    .sort((a, b) => b.studyMin - a.studyMin)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

function hhmm(min: number): string {
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`
}

const COLUMNS: Column<RankRow>[] = [
  {
    key: 'rank',
    header: '순위',
    width: '70px',
    align: 'center',
    sortable: true,
    value: (r) => r.rank,
    render: (r) =>
      r.rank <= 3 ? (
        <span
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: ['#E8920F', '#8B94A3', '#B87333'][r.rank - 1],
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
          }}
        >
          {r.rank}
        </span>
      ) : (
        <span style={{ color: 'var(--muted)' }}>{r.rank}</span>
      ),
  },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'studyMin',
    header: '순공시간',
    width: '106px',
    align: 'right',
    sortable: true,
    value: (r) => r.studyMin,
    render: (r) => <b style={{ color: 'var(--mint-d)' }}>{hhmm(r.studyMin)}</b>,
  },
  {
    key: 'presentMin',
    header: '재실시간',
    width: '106px',
    align: 'right',
    sortable: true,
    value: (r) => r.presentMin,
    render: (r) => <span style={{ color: 'var(--muted)' }}>{hhmm(r.presentMin)}</span>,
  },
  {
    key: 'ratio',
    header: '집중도',
    width: '96px',
    align: 'right',
    value: (r) => r.studyMin / r.presentMin,
    render: (r) => {
      const pct = Math.round((r.studyMin / r.presentMin) * 100)
      return <span style={{ color: pct >= 80 ? 'var(--green)' : 'var(--amber)', fontWeight: 700 }}>{pct}%</span>
    },
  },
  { key: 'qna', header: '질의응답', width: '84px', align: 'right', sortable: true, value: (r) => r.qna },
  {
    key: 'routine',
    header: '루틴 이행',
    width: '92px',
    align: 'right',
    sortable: true,
    value: (r) => r.routine,
    render: (r) => `${r.routine}%`,
  },
  {
    key: 'attendance',
    header: '출결',
    width: '76px',
    align: 'center',
    value: (r) => r.attendance,
    render: (r) => (
      <span className={`mk ${r.attendance === '정상' ? 'verified' : 'brandnew'}`}>{r.attendance}</span>
    ),
  },
  {
    key: 'feedback',
    header: '셀프 피드백',
    width: '96px',
    align: 'center',
    value: (r) => (r.feedback ? '작성' : '미작성'),
    render: (r) =>
      r.feedback ? (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>작성</span>
      ) : (
        <span style={{ fontSize: 11.5, color: 'var(--amber)', fontWeight: 700 }}>미작성</span>
      ),
  },
]

/** 달력 뷰 — 2026-05, 5/1이 금요일 */
const FIRST_DOW = 5
const DAYS_IN_MONTH = 31
const DOW = ['일', '월', '화', '수', '목', '금', '토']

function Content() {
  const [tab, setTab] = useState('rank')
  const [scope, setScope] = useState<Scope>('ALL')
  const [period, setPeriod] = useState<Period>('DAY')
  const [masked, setMasked] = useState(true)

  const ranks = useMemo(() => buildRanks(period), [period])
  const rows = useMemo(() => (scope === 'CLASS' ? ranks.filter((r) => r.classNo === '3반') : ranks), [ranks, scope])

  const avgStudy = Math.round(rows.reduce((a, r) => a + r.studyMin, 0) / (rows.length || 1))
  const noFeedback = rows.filter((r) => !r.feedback).length

  return (
    <>
      <div className="stat-strip c6">
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 집계 대상
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">{SCOPES.find((s) => s.key === scope)?.label}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="timer" size={13} /> 평균 순공
          </div>
          <div className="v" style={{ fontSize: 18 }}>
            {hhmm(avgStudy)}
          </div>
          <div className="d">{PERIODS.find((p) => p.key === period)?.label} 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="trophy" size={13} /> 1위
          </div>
          <div className="v" style={{ fontSize: 18 }}>
            {hhmm(rows[0]?.studyMin ?? 0)}
          </div>
          <div className="d">{masked ? '***' : rows[0]?.name}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="message-square" size={13} /> 셀프 피드백 미작성
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {noFeedback}
          </div>
          <div className="d warn">독려 대상</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="bell" size={13} /> 야간 요약 푸시
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            23:00
          </div>
          <div className="d">FCM 일괄 발송</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="history" size={13} /> 배치 집계
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            scope × period
          </div>
          <div className="d">매일 23:00 실행</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'rank', label: '순공시간 랭킹', count: rows.length },
            { key: 'cal', label: '달력 뷰' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'rank' ? (
          <div style={{ padding: 14 }}>
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  랭킹 <b>{rows.length}</b>명 · <code style={{ fontSize: 11 }}>study_time_rankings</code>
                </>
              }
              toolbar={
                <>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {SCOPES.map((s) => (
                      <button key={s.key} className={`chip${scope === s.key ? ' on' : ''}`} onClick={() => setScope(s.key)}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {PERIODS.map((p) => (
                      <button key={p.key} className={`chip${period === p.key ? ' on' : ''}`} onClick={() => setPeriod(p.key)}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="순공시간_랭킹" columns={COLUMNS} rows={rows} masked={masked} />
                </>
              }
            />
          </div>
        ) : (
          <div className="card-sec-b">
            <div style={{ fontSize: 12.5, marginBottom: 12, color: 'var(--muted)' }}>
              학생 1명(이승민)의 2026-05 일자별 집계 — 앱 Daily Report 달력이 그리는 데이터입니다.
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
      <button className="btn">2026-05-28 ▾</button>
      <button className="btn">
        <Icon name="refresh-cw" size={14} /> 배치 재집계
      </button>
    </>
  ),
}
