import { useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-7 대면 질의응답·영단어 시험 관리 — 신규개발-요구사항신규
 * 의존성이 가장 낮아 여유 시 배치하는 화면(실행가이드 Phase 3 마지막 항목).
 * 영단어 시험 결과는 Daily Report 참고링크로 연동된다. */

/* ── 대면(OFF) 질의응답 슬롯 ── */
const SLOT_TIMES = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30']
const SLOT_DAYS = [
  { d: '06/01', dow: '월' },
  { d: '06/02', dow: '화' },
  { d: '06/03', dow: '수' },
  { d: '06/05', dow: '금' },
]
const TEACHERS = ['이장원', '김유진', '최지원', '박서영']

interface Slot {
  key: string
  open: boolean
  student?: string
  teacher: string
  room: string
}

const SLOTS: Record<string, Slot> = {}
SLOT_DAYS.forEach((day, di) => {
  SLOT_TIMES.forEach((t, ti) => {
    const n = di * SLOT_TIMES.length + ti
    const open = n % 7 !== 6
    const booked = open && n % 3 === 0
    SLOTS[`${day.d}-${t}`] = {
      key: `${day.d}-${t}`,
      open,
      student: booked ? MOCK_STUDENTS[n % MOCK_STUDENTS.length].name : undefined,
      teacher: TEACHERS[di % TEACHERS.length],
      room: `상담실 ${(di % 2) + 1}`,
    }
  })
})

const slotList = Object.values(SLOTS)
const openCount = slotList.filter((s) => s.open).length
const bookedCount = slotList.filter((s) => s.student).length

/* ── 영단어 시험 ── */
interface VocabTest {
  id: string
  date: string
  title: string
  range: string
  words: number
  target: string
  taken: number
  total: number
  avg: number
  status: '예정' | '진행중' | '종료'
}

const TESTS: VocabTest[] = [
  { id: 'v1', date: '2026-05-28', title: '5월 4주차 영단어', range: 'Day 76 ~ 80', words: 50, target: '전체 재원생', taken: 268, total: 296, avg: 84.2, status: '진행중' },
  { id: 'v2', date: '2026-05-21', title: '5월 3주차 영단어', range: 'Day 71 ~ 75', words: 50, target: '전체 재원생', taken: 289, total: 296, avg: 81.7, status: '종료' },
  { id: 'v3', date: '2026-05-14', title: '5월 2주차 영단어', range: 'Day 66 ~ 70', words: 50, target: '전체 재원생', taken: 284, total: 296, avg: 79.4, status: '종료' },
  { id: 'v4', date: '2026-06-04', title: '6월 1주차 영단어', range: 'Day 81 ~ 85', words: 50, target: '전체 재원생', taken: 0, total: 296, avg: 0, status: '예정' },
]

const TEST_COLUMNS: Column<VocabTest>[] = [
  { key: 'date', header: '시행일', width: '104px', sortable: true, value: (r) => r.date },
  { key: 'title', header: '시험명', sortable: true, value: (r) => r.title },
  { key: 'range', header: '범위', width: '116px', value: (r) => r.range },
  { key: 'words', header: '문항', width: '68px', align: 'right', value: (r) => r.words },
  {
    key: 'taken',
    header: '응시율',
    width: '150px',
    align: 'right',
    sortable: true,
    value: (r) => (r.total ? r.taken / r.total : 0),
    render: (r) => {
      if (!r.taken) return <span style={{ color: 'var(--muted)' }}>-</span>
      const pct = Math.round((r.taken / r.total) * 100)
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <div style={{ width: 52, height: 6, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mint)' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {r.taken}/{r.total}
          </span>
        </div>
      )
    },
  },
  {
    key: 'avg',
    header: '평균',
    width: '84px',
    align: 'right',
    sortable: true,
    value: (r) => r.avg,
    render: (r) => (r.avg ? <b style={{ color: r.avg >= 80 ? 'var(--green)' : 'var(--amber)' }}>{r.avg}</b> : '-'),
  },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => (
      <span className={`mk ${r.status === '진행중' ? 'verified' : r.status === '예정' ? 'supplement' : 'brandnew'}`}>
        {r.status}
      </span>
    ),
  },
  {
    key: 'act',
    header: '',
    width: '80px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.status === '예정'}>
        결과
      </button>
    ),
  },
]

/* 응시 결과 */
interface VocabResult {
  id: string
  studentNo: string
  name: string
  classNo: string
  score: number
  wrong: number
  takenAt: string
}

const RESULTS: VocabResult[] = MOCK_STUDENTS.filter((s) => s.status === '재원')
  .slice(0, 30)
  .map((s, i) => {
    const score = 100 - ((i * 7) % 45)
    return {
      id: s.id,
      studentNo: s.studentNo,
      name: s.name,
      classNo: s.classNo,
      score,
      wrong: Math.round((50 * (100 - score)) / 100),
      takenAt: `2026-05-28 08:${String(10 + (i % 40)).padStart(2, '0')}`,
    }
  })

const RESULT_COLUMNS: Column<VocabResult>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  {
    key: 'score',
    header: '점수',
    width: '90px',
    align: 'right',
    sortable: true,
    value: (r) => r.score,
    render: (r) => (
      <b style={{ color: r.score >= 90 ? 'var(--green)' : r.score >= 70 ? 'var(--amber)' : 'var(--red)' }}>{r.score}</b>
    ),
  },
  { key: 'wrong', header: '오답', width: '76px', align: 'right', sortable: true, value: (r) => r.wrong },
  { key: 'takenAt', header: '응시시각', width: '140px', value: (r) => r.takenAt },
]

function Content() {
  const [tab, setTab] = useState('qna')
  const [masked, setMasked] = useState(true)

  return (
    <>
      <div className="note-box">
        <div className="ic">
          <Icon name="info" size={17} />
        </div>
        <div>
          <div className="tt">의존성이 가장 낮은 화면 — 여유 시 배치</div>
          <div className="tx">
            실행가이드 Phase 3 BE 순서에서 <b>마지막 10번</b>, FE 순서에서도 <b>8순위(여유 시)</b>입니다. 다른 화면이
            블로커에 막혔을 때 대신 진행할 수 있는 후보입니다. 영단어 시험 결과는{' '}
            <b>Daily Report(F-4.11-6)의 참고링크</b>로 노출되고, 대면 질의응답 횟수도 Daily Report에 집계됩니다.
          </div>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-clock" size={13} /> 개설 타임
          </div>
          <div className="v">{openCount}</div>
          <div className="d">이번 주 상담실</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="user-check" size={13} /> 예약 완료
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {bookedCount}
          </div>
          <div className="d">
            잔여 {openCount - bookedCount}
          </div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="book-open" size={13} /> 영단어 시험
          </div>
          <div className="v">{TESTS.length}</div>
          <div className="d">디랩 콘텐츠</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 최근 응시율
          </div>
          <div className="v">{Math.round((TESTS[0].taken / TESTS[0].total) * 100)}%</div>
          <div className="d">{TESTS[0].title}</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="trending-up" size={13} /> 평균 추이
          </div>
          <div className="v" style={{ color: 'var(--green)' }}>
            +2.5
          </div>
          <div className="d up">전주 대비</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'qna', label: '대면 질의응답 예약' },
            { key: 'vocab', label: '영단어 시험', count: TESTS.length },
            { key: 'result', label: '응시 결과', count: RESULTS.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'qna' && (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="dt" style={{ minWidth: 620 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 92 }}>시간</th>
                      {SLOT_DAYS.map((d) => (
                        <th key={d.d} className="al-center">
                          {d.d} ({d.dow})
                          <span style={{ display: 'block', fontSize: 10, fontWeight: 500, color: 'var(--muted)' }}>
                            {TEACHERS[SLOT_DAYS.indexOf(d) % TEACHERS.length]}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SLOT_TIMES.map((t) => (
                      <tr key={t}>
                        <th style={{ textAlign: 'left', paddingLeft: 12, fontSize: 11.5, fontWeight: 700 }}>{t}</th>
                        {SLOT_DAYS.map((d) => {
                          const s = SLOTS[`${d.d}-${t}`]
                          return (
                            <td key={d.d} className="al-center" style={{ padding: 5 }}>
                              {!s.open ? (
                                <span style={{ fontSize: 11, color: 'var(--muted)' }}>미개설</span>
                              ) : s.student ? (
                                <span
                                  className="mk verified"
                                  title={`${s.student} · ${s.teacher} · ${s.room}`}
                                  style={{ cursor: 'pointer' }}
                                >
                                  {masked ? `${s.student[0]}*${s.student.slice(2)}` : s.student}
                                </span>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: 'var(--mint-d)',
                                    background: 'var(--mint-soft)',
                                    padding: '3px 10px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    display: 'inline-block',
                                  }}
                                >
                                  예약 가능
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <MaskToggle masked={masked} onChange={setMasked} />
                <button className="btn">
                  <Icon name="plus" size={14} /> 타임 일괄 개설
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
                  <code style={{ fontSize: 11 }}>qna_offline_slots</code> ·{' '}
                  <code style={{ fontSize: 11 }}>qna_offline_reservations</code> — 학생은 앱에서 희망 타임을 예약합니다
                </span>
              </div>
            </>
          )}

          {tab === 'vocab' && (
            <DataTable
              columns={TEST_COLUMNS}
              rows={TESTS}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              countLabel={
                <>
                  영단어 시험 <b>{TESTS.length}</b>건
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="영단어시험_목록" columns={TEST_COLUMNS} rows={TESTS} masked={false} />
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 시험 생성
                  </button>
                </>
              }
            />
          )}

          {tab === 'result' && (
            <DataTable
              columns={RESULT_COLUMNS}
              rows={RESULTS}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  5월 4주차 응시 결과 <b>{RESULTS.length}</b>명
                </>
              }
              toolbar={
                <>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="영단어시험_결과" columns={RESULT_COLUMNS} rows={RESULTS} masked={masked} />
                </>
              }
            />
          )}
        </div>
      </div>
    </>
  )
}

export const qnaVocabMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-06 1주 ▾</button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 타임 개설
      </button>
    </>
  ),
}
