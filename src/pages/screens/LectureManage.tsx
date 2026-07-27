import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, MaskToggle, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { MOCK_STUDENTS } from './mockStudents'
import type { Mockup } from './types'

/* F-4.7 특강 관리 — 신규개발-요구사항보완
 * DSA '특강관리>접수>신청명단'에서 신청명단·출석부 요구사항은 검증됨.
 * '설명회 신청' 항목만 화면에 없어 보완 개발 대상. */

interface Lecture {
  id: string
  month: string
  name: string
  teacher: string
  capacity: number
  applied: number
  waiting: number
  status: '모집중' | '마감' | '진행중' | '종료'
  fee: number
}

const LECTURES: Lecture[] = [
  { id: 'lc1', month: '2026-06', name: '수학 미적 킬러문항 특강', teacher: '김유진', capacity: 30, applied: 30, waiting: 7, status: '마감', fee: 320000 },
  { id: 'lc2', month: '2026-06', name: '국어 언매 심화', teacher: '최지원', capacity: 25, applied: 18, waiting: 0, status: '모집중', fee: 280000 },
  { id: 'lc3', month: '2026-06', name: '지구과학 신유형 대비', teacher: '이장원', capacity: 20, applied: 20, waiting: 3, status: '마감', fee: 240000 },
  { id: 'lc4', month: '2026-05', name: '영어 빈칸추론 집중', teacher: '박서영', capacity: 25, applied: 22, waiting: 0, status: '진행중', fee: 260000 },
  { id: 'lc5', month: '2026-05', name: '물리Ⅱ 실전 세트', teacher: '정하람', capacity: 15, applied: 15, waiting: 2, status: '진행중', fee: 300000 },
  { id: 'lc6', month: '2026-04', name: '4월 학평 해설 특강', teacher: '김유진', capacity: 40, applied: 38, waiting: 0, status: '종료', fee: 90000 },
]

const STATUS_TONE: Record<Lecture['status'], string> = {
  모집중: 'verified',
  마감: 'supplement',
  진행중: 'verified',
  종료: 'brandnew',
}

const LECTURE_COLUMNS: Column<Lecture>[] = [
  { key: 'month', header: '월', width: '84px', align: 'center', sortable: true, value: (r) => r.month },
  { key: 'name', header: '특강명', sortable: true, value: (r) => r.name },
  { key: 'teacher', header: '담당', width: '78px', value: (r) => r.teacher },
  {
    key: 'applied',
    header: '신청 / 정원',
    width: '110px',
    align: 'center',
    sortable: true,
    value: (r) => r.applied,
    render: (r) => (
      <span style={{ fontWeight: 700, color: r.applied >= r.capacity ? 'var(--red)' : 'var(--ink)' }}>
        {r.applied} / {r.capacity}
      </span>
    ),
  },
  {
    key: 'waiting',
    header: '대기',
    width: '68px',
    align: 'center',
    value: (r) => r.waiting,
    render: (r) => (r.waiting > 0 ? <span className="mk brandnew">{r.waiting}</span> : <span style={{ color: 'var(--muted)' }}>-</span>),
  },
  {
    key: 'fee',
    header: '특강비',
    width: '96px',
    align: 'right',
    value: (r) => r.fee,
    render: (r) => `${r.fee.toLocaleString()}원`,
  },
  {
    key: 'status',
    header: '상태',
    width: '80px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
]

/* ── 신청 명단 / 대기자 ── */
interface Applicant {
  id: string
  seq: number
  studentNo: string
  name: string
  classNo: string
  phone: string
  appliedAt: string
  paid: boolean
  waiting: boolean
}

const APPLICANTS: Applicant[] = MOCK_STUDENTS.slice(0, 37).map((s, i) => ({
  id: `ap-${i + 1}`,
  seq: i + 1,
  studentNo: s.studentNo,
  name: s.name,
  classNo: s.classNo,
  phone: s.phone,
  appliedAt: `2026-05-${String((i % 28) + 1).padStart(2, '0')}`,
  paid: i % 8 !== 7,
  waiting: i >= 30,
}))

const APPLICANT_COLUMNS: Column<Applicant>[] = [
  { key: 'seq', header: '순번', width: '64px', align: 'center', sortable: true, value: (r) => r.seq },
  { key: 'studentNo', header: '학번', width: '100px', value: (r) => r.studentNo },
  { key: 'name', header: '이름', width: '84px', mask: 'name', value: (r) => r.name },
  { key: 'classNo', header: '반', width: '56px', align: 'center', value: (r) => r.classNo },
  { key: 'phone', header: '연락처', width: '128px', mask: 'phone', value: (r) => r.phone },
  { key: 'appliedAt', header: '신청일', width: '100px', sortable: true, value: (r) => r.appliedAt },
  {
    key: 'paid',
    header: '수납',
    width: '80px',
    align: 'center',
    value: (r) => (r.paid ? '완납' : '미납'),
    render: (r) => <span className={`mk ${r.paid ? 'verified' : 'brandnew'}`}>{r.paid ? '완납' : '미납'}</span>,
  },
]

/* ── 출석부 ── */
const SESSIONS = ['06/02', '06/04', '06/09', '06/11', '06/16', '06/18']

function Content() {
  const [tab, setTab] = useState('list')
  const [masked, setMasked] = useState(true)
  const [selected, setSelected] = useState<string[]>([])

  const applied = useMemo(() => APPLICANTS.filter((a) => !a.waiting), [])
  const waiting = useMemo(() => APPLICANTS.filter((a) => a.waiting), [])

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="presentation" size={13} /> 개설 특강
          </div>
          <div className="v">{LECTURES.length}</div>
          <div className="d">2026-04 ~ 06</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="users" size={13} /> 총 신청
          </div>
          <div className="v">{LECTURES.reduce((a, l) => a + l.applied, 0)}</div>
          <div className="d">건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="list-ordered" size={13} /> 대기자
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {LECTURES.reduce((a, l) => a + l.waiting, 0)}
          </div>
          <div className="d warn">정원 초과분</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="banknote" size={13} /> 특강비 수납
          </div>
          <div className="v">{applied.filter((a) => a.paid).length}</div>
          <div className="d">/ {applied.length}건</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="megaphone" size={13} /> 설명회 신청
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            보완 개발
          </div>
          <div className="d warn">DSA 대응 화면 없음</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '특강 목록', count: LECTURES.length },
            { key: 'apply', label: '신청 명단', count: applied.length },
            { key: 'wait', label: '대기자', count: waiting.length },
            { key: 'att', label: '출석부' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'list' && (
            <DataTable
              columns={LECTURE_COLUMNS}
              rows={LECTURES}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              countLabel={
                <>
                  특강 <b>{LECTURES.length}</b>건
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="특강_목록" columns={LECTURE_COLUMNS} rows={LECTURES} masked={false} />
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 특강 개설
                  </button>
                </>
              }
            />
          )}

          {(tab === 'apply' || tab === 'wait') && (
            <DataTable
              columns={APPLICANT_COLUMNS}
              rows={tab === 'apply' ? applied : waiting}
              rowKey={(r) => r.id}
              selectable
              selected={selected}
              onSelectedChange={setSelected}
              masked={masked}
              pageSize={12}
              countLabel={
                <>
                  {tab === 'apply' ? '신청자' : '대기자'} <b>{(tab === 'apply' ? applied : waiting).length}</b>명
                </>
              }
              toolbar={
                <>
                  <button className="btn" disabled={selected.length === 0}>
                    <Icon name="arrow-right" size={14} /> 선택 일괄이동
                  </button>
                  <button className="btn" disabled={selected.length === 0}>
                    수납청구
                  </button>
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <ExcelButton
                    filename={tab === 'apply' ? '특강_신청명단' : '특강_대기자'}
                    columns={APPLICANT_COLUMNS}
                    rows={tab === 'apply' ? applied : waiting}
                    masked={masked}
                  />
                </>
              }
            />
          )}

          {tab === 'att' && (
            <div className="dt-wrap">
              <div className="dt-toolbar">
                <span className="dt-count">
                  수학 미적 킬러문항 특강 · <b>{SESSIONS.length}</b>회차
                </span>
                <div className="dt-right">
                  <MaskToggle masked={masked} onChange={setMasked} />
                  <button className="btn">
                    <Icon name="printer" size={14} /> 출석부 인쇄
                  </button>
                </div>
              </div>
              <div className="dt-scroll">
                <table className="dt">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>학번</th>
                      <th style={{ width: 84 }}>이름</th>
                      <th style={{ width: 56 }} className="al-center">
                        반
                      </th>
                      {SESSIONS.map((s) => (
                        <th key={s} className="al-center" style={{ width: 68 }}>
                          {s}
                        </th>
                      ))}
                      <th className="al-center" style={{ width: 80 }}>
                        출석률
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {applied.slice(0, 12).map((a, ri) => {
                      const marks = SESSIONS.map((_, si) => (ri + si) % 7 !== 6)
                      const rate = Math.round((marks.filter(Boolean).length / marks.length) * 100)
                      return (
                        <tr key={a.id}>
                          <td>{a.studentNo}</td>
                          <td className="masked">{masked ? `${a.name[0]}*${a.name.slice(2)}` : a.name}</td>
                          <td className="al-center">{a.classNo}</td>
                          {marks.map((m, si) => (
                            <td key={si} className="al-center">
                              {m ? (
                                <span style={{ color: 'var(--mint-d)', fontWeight: 800 }}>○</span>
                              ) : (
                                <span style={{ color: 'var(--red)', fontWeight: 800 }}>✕</span>
                              )}
                            </td>
                          ))}
                          <td className="al-center">
                            <b style={{ color: rate === 100 ? 'var(--green)' : 'var(--amber)' }}>{rate}%</b>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const lectureMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026-06 ▾</button>
      <button className="btn">
        <Icon name="megaphone" size={14} /> 설명회 신청 관리
      </button>
    </>
  ),
}
