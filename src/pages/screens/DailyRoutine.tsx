import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-1 데일리 루틴 관리 — 신규개발-요구사항신규
 *
 * 월별 루틴/테스트 세팅(과목은 매월 상이) + 전월 복사, 학생/반별 결과 입력.
 * 상벌점 규칙 엔진 자동 연동은 I-5 확정 대기 →
 *   실행가이드: "I-5 미확정시 결과입력까지만, 자동상벌점연동 후행" */

interface Routine {
  id: string
  name: string
  subject: string
  /** 배점 */
  point: number
  /** 권장 여부 — 미완료 시 벌점 대상인지 */
  required: boolean
  /** 상벌점 규칙 트리거 (I-5 확정 후 연결) */
  trigger?: string
}

const ROUTINES: Routine[] = [
  { id: 'r1', name: '아침 영단어 50개', subject: '영어', point: 2, required: true, trigger: 'ROUTINE_VOCAB' },
  { id: 'r2', name: '수학 데일리 5문항', subject: '수학', point: 3, required: true, trigger: 'ROUTINE_MATH' },
  { id: 'r3', name: '국어 비문학 1지문', subject: '국어', point: 2, required: true, trigger: 'ROUTINE_KOR' },
  { id: 'r4', name: '탐구 개념 정리 노트', subject: '탐구', point: 2, required: false },
  { id: 'r5', name: '주간 오답 정리', subject: '공통', point: 3, required: false },
  { id: 'r6', name: '취침 전 학습일지', subject: '공통', point: 1, required: true, trigger: 'ROUTINE_LOG' },
]

interface RoutineResult {
  id: string
  studentNo: string
  name: string
  classNo: string
  /** 루틴별 결과 */
  results: (number | boolean)[]
  rate: number
  points: number
}

const RESULTS: RoutineResult[] = MOCK_STUDENTS.filter((s) => s.status === '재원')
  .slice(0, 34)
  .map((s, i) => {
    const results = ROUTINES.map((r, ri) => {
      const seed = (i * 7 + ri * 3) % 10
      if (r.name.includes('영단어')) return 60 + ((i * 13 + ri) % 41) // 점수형
      return seed !== 9
    })
    const boolResults = results.filter((r) => typeof r === 'boolean') as boolean[]
    const rate = Math.round((boolResults.filter(Boolean).length / boolResults.length) * 100)
    const points = ROUTINES.reduce((a, r, ri) => {
      const v = results[ri]
      if (typeof v === 'number') return a + (v >= 80 ? r.point : 0)
      return a + (v ? r.point : r.required ? -1 : 0)
    }, 0)
    return { id: s.id, studentNo: s.studentNo, name: s.name, classNo: s.classNo, results, rate, points }
  })

const COLUMNS: Column<RoutineResult>[] = [
  { key: 'studentNo', header: '학번', width: '100px', sortable: true, value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  ...ROUTINES.map(
    (rt, ri): Column<RoutineResult> => ({
      key: rt.id,
      header: (
        <span title={`${rt.subject} · ${rt.point}점${rt.required ? ' · 필수' : ''}`}>
          {rt.name.length > 8 ? `${rt.name.slice(0, 7)}…` : rt.name}
        </span>
      ),
      width: '96px',
      align: 'center',
      value: (r) => {
        const v = r.results[ri]
        return typeof v === 'number' ? v : v ? 1 : 0
      },
      render: (r) => {
        const v = r.results[ri]
        if (typeof v === 'number') {
          return (
            <b style={{ color: v >= 80 ? 'var(--mint-d)' : v >= 60 ? 'var(--amber)' : 'var(--red)' }}>{v}점</b>
          )
        }
        return v ? (
          <span style={{ color: 'var(--mint-d)', fontWeight: 800 }}>○</span>
        ) : (
          <span style={{ color: 'var(--red)', fontWeight: 800 }}>✕</span>
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
      <b style={{ color: r.rate >= 80 ? 'var(--green)' : r.rate >= 60 ? 'var(--amber)' : 'var(--red)' }}>{r.rate}%</b>
    ),
  },
  {
    key: 'points',
    header: '상벌점',
    width: '80px',
    align: 'right',
    sortable: true,
    value: (r) => r.points,
    render: (r) => (
      <span style={{ color: r.points >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }} title="상벌점 규칙에 따라 자동 부여">
        {r.points > 0 ? `+${r.points}` : r.points}
      </span>
    ),
  },
]

const ROUTINE_COLUMNS: Column<Routine>[] = [
  { key: 'name', header: '루틴명', sortable: true, value: (r) => r.name },
  { key: 'subject', header: '과목', width: '84px', align: 'center', sortable: true, value: (r) => r.subject },
  {
    key: 'point',
    header: '배점',
    width: '70px',
    align: 'right',
    sortable: true,
    value: (r) => r.point,
    render: (r) => <b>+{r.point}</b>,
  },
  {
    key: 'required',
    header: '권장',
    width: '90px',
    align: 'center',
    value: (r) => (r.required ? '필수' : '권장'),
    render: (r) => <span className={`mk ${r.required ? 'brandnew' : 'supplement'}`}>{r.required ? '필수' : '권장'}</span>,
  },
  {
    key: 'trigger',
    header: '상벌점 트리거',
    width: '176px',
    value: (r) => r.trigger ?? '',
    render: (r) =>
      r.trigger ? (
        <code style={{ fontSize: 10.5 }}>{r.trigger}</code>
      ) : (
        <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>연결 안 함</span>
      ),
  },
  {
    key: 'act',
    header: '',
    width: '96px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}>
          삭제
        </button>
      </div>
    ),
  },
]

function Content() {
  const [tab, setTab] = useState('result')
  const [masked, setMasked] = useState(true)
  const [classNo, setClassNo] = useState('')

  const rows = useMemo(() => (classNo ? RESULTS.filter((r) => r.classNo === classNo) : RESULTS), [classNo])
  const avgRate = Math.round(rows.reduce((a, r) => a + r.rate, 0) / (rows.length || 1))
  const low = rows.filter((r) => r.rate < 60).length

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="repeat" size={13} /> 이번 달 루틴
          </div>
          <div className="v">{ROUTINES.length}</div>
          <div className="d">2026-05 · 과목 매월 상이</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 대상 학생
          </div>
          <div className="v">{rows.length}</div>
          <div className="d">{classNo || '전체 반'}</div>
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
          <div className="d warn">규칙 설정 필요</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'result', label: '결과 입력', count: rows.length },
            { key: 'setup', label: '월별 루틴 설정', count: ROUTINES.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'result' ? (
            <DataTable
              columns={COLUMNS}
              rows={rows}
              rowKey={(r) => r.id}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  2026-05 결과 <b>{rows.length}</b>명
                </>
              }
              toolbar={
                <>
                  <select className="sel" style={{ width: 100 }} value={classNo} onChange={(e) => setClassNo(e.target.value)}>
                    <option value="">전체 반</option>
                    {['1반', '2반', '3반', '4반'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton filename="데일리루틴_결과" columns={COLUMNS} rows={rows} masked={masked} />
                  <button className="btn pri">
                    <Icon name="save" size={14} /> 결과 저장
                  </button>
                </>
              }
            />
          ) : (
            <>
              <DataTable
                columns={ROUTINE_COLUMNS}
                rows={ROUTINES}
                rowKey={(r) => r.id}
                masked={false}
                pageSize={10}
                countLabel={
                  <>
                    2026-05 루틴 <b>{ROUTINES.length}</b>건
                  </>
                }
                toolbar={
                  <>
                    <button className="btn">
                      <Icon name="copy" size={14} /> 전월 복사
                    </button>
                    <button className="btn pri">
                      <Icon name="plus" size={14} /> 루틴 추가
                    </button>
                  </>
                }
              />

              <div className="card-sec" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="card-sec-h">
                  <div className="t">
                    <span className="ico">
                      <Icon name="plus" size={15} />
                    </span>
                    루틴 추가
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="split">
                    <div>
                      <div className="frow">
                        <label className="req">루틴명</label>
                        <input className="inp" placeholder="아침 영단어 50개" />
                      </div>
                      <div className="frow">
                        <label className="req">과목</label>
                        <div className="two">
                          <select className="sel">
                            <option>국어</option>
                            <option>수학</option>
                            <option>영어</option>
                            <option>탐구</option>
                            <option>공통</option>
                          </select>
                          <select className="sel">
                            <option>완료/미완료</option>
                            <option>점수 입력</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="frow">
                        <label className="req">배점</label>
                        <div className="two">
                          <input className="inp" type="number" defaultValue={2} />
                          <select className="sel">
                            <option>필수 (미완료 시 벌점)</option>
                            <option>권장</option>
                          </select>
                        </div>
                      </div>
                      <div className="frow">
                        <label>상벌점 트리거</label>
                        <select className="sel">
                          <option>연결 안 함</option>
                          <option>ROUTINE_VOCAB</option>
                          <option>ROUTINE_MATH</option>
                          <option>ROUTINE_KOR</option>
                          <option>ROUTINE_LOG</option>
                        </select>
                      </div>
                      <div className="frow">
                        <label>&nbsp;</label>
                        <button className="btn pri">
                          <Icon name="save" size={14} /> 추가
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}

export const dailyRoutineMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-05 ▾</button>
      <button className="btn">
        <Icon name="copy" size={14} /> 전월 복사
      </button>
    </>
  ),
}
