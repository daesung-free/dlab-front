import { useState } from 'react'
import { Link } from 'react-router-dom'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import './score.css'

/* ── 목업 데이터 (03_admin_seongjeok.html 이관) ── */

const STUDENTS: StudentRow[] = [
  { id: 's1', name: '이승민', meta: '자연 · 재수 · 3반 4019', tag: { label: '탐구↓', tone: 'risk' }, date: '05/20 응시' },
  { id: 's2', name: '박서준', meta: '자연 · 삼수 · 3반 4021', tag: { label: '수학↓', tone: 'risk' }, date: '05/20', warn: true },
  { id: 's3', name: '김하윤', meta: '인문 · 재수 · 1반 1102', tag: { label: '국어↑', tone: 'up' }, date: '05/20' },
  { id: 's4', name: '정민재', meta: '자연 · 재수 · 2반 2210', date: '05/20' },
  { id: 's5', name: '최유나', meta: '인문 · 재수 · 1반 1108', tag: { label: '전과목↑', tone: 'up' }, date: '05/20' },
  { id: 's6', name: '강도현', meta: '자연 · 재수 · 3반 4033', date: '05/20' },
  { id: 's7', name: '윤지호', meta: '자연 · 삼수 · 2반 2231', date: '미응시' },
]

interface Cell {
  grade: string
  /** 백분위 또는 점수 */
  note: string
  tone?: 'g1' | 'g4'
}

interface Round {
  name: string
  date: string
  latest?: boolean
  cells: Cell[]
  sum: string
  delta?: string
}

const ROUNDS: Round[] = [
  {
    name: '3월 학평',
    date: '2026.03.26',
    cells: [
      { grade: '3', note: '88' },
      { grade: '2', note: '92' },
      { grade: '3', note: '77점' },
      { grade: '3', note: '42' },
      { grade: '2', note: '89' },
      { grade: '3', note: '78' },
    ],
    sum: '259',
  },
  {
    name: '4월 학평',
    date: '2026.04.10',
    cells: [
      { grade: '2', note: '91' },
      { grade: '1', note: '95', tone: 'g1' },
      { grade: '2', note: '82점' },
      { grade: '2', note: '55' },
      { grade: '2', note: '90' },
      { grade: '2', note: '85' },
    ],
    sum: '271',
  },
  {
    name: 'THE PREMIUM',
    date: '2026.04.16',
    cells: [
      { grade: '2', note: '93' },
      { grade: '1', note: '96', tone: 'g1' },
      { grade: '2', note: '83점' },
      { grade: '2', note: '58' },
      { grade: '2', note: '90' },
      { grade: '2', note: '84' },
    ],
    sum: '271',
  },
  {
    name: 'THE PREMIUM',
    date: '2026.05.20 · 최신',
    latest: true,
    cells: [
      { grade: '2', note: '94' },
      { grade: '1', note: '96', tone: 'g1' },
      { grade: '2', note: '84점' },
      { grade: '2', note: '61' },
      { grade: '2', note: '90' },
      { grade: '4', note: '82', tone: 'g4' },
    ],
    sum: '278',
    delta: '▲7',
  },
]

const COLUMNS = [
  { t: '국어', s: '언매' },
  { t: '수학', s: '미적' },
  { t: '영어', s: '' },
  { t: '한국사', s: '' },
  { t: '탐구1', s: '물리Ⅱ' },
  { t: '탐구2', s: '지구과학' },
]

const UNITS = [
  { name: '고체지구', me: 88, nat: 74, low: false },
  { name: '대기와 해양', me: 71, nat: 68, low: false },
  { name: '우주', me: 46, nat: 63, low: true },
  { name: '지구의 역사', me: 52, nat: 70, low: true },
  { name: '신유형(통합)', me: 38, nat: 59, low: true },
]

function Content() {
  const [subject, setSubject] = useState('지구과학')

  return (
    <div className="p-score">
      <div className="layout">
        <StudentList title="재원생" count="응시 296명" filters={['전체', '성적 상승', '성적 하락', '미응시']} rows={STUDENTS} />

        <section className="panel">
          <StudentHeader
            name="이승민"
            code="DL-2026-0419"
            sub={
              <>
                <b>자연 · 재수</b> · 3반 4019 · 목표 <b>고려대 반도체공</b> · 담임 이장원
              </>
            }
            right={
              <>
                <span className="src-badge">
                  <Icon name="link" size={12} /> 더프리미엄 API 연동
                </span>
                <span className="src-badge" style={{ background: 'var(--violet-wash)', color: 'var(--violet)' }}>
                  <Icon name="file-spreadsheet" size={12} /> 상세 엑셀 05/20 반영
                </span>
              </>
            }
          />

          <div className="panel-body">
            <div className="upload-note">
              <div className="ic">
                <Icon name="info" size={15} />
              </div>
              <div>
                회차별 원점수·표준점수·백분위·등급은 <b>더프리미엄모의고사 API(전화번호 기반)</b>로 자동 조회되고, 단원별
                정답률 등 <b>상세 분석은 엑셀 업로드</b>로 반영됩니다. 양식이 바뀌어도 컬럼 매핑으로 흡수합니다.
              </div>
            </div>

            {/* ── 회차별 성적 표 ── */}
            <div className="sec-h">
              <div className="t">
                <span className="ic">
                  <Icon name="table-2" size={17} />
                </span>{' '}
                회차별 성적 (원 / 표 / 백 · 등급)
              </div>
              <div className="note">국·수·영·한국사·탐구1·탐구2 · 최신 회차 강조</div>
            </div>

            <div className="table-scroll">
              <table className="rtable">
                <thead>
                  <tr>
                    <th className="rd">회차</th>
                    {COLUMNS.map((c) => (
                      <th key={c.t}>
                        {c.t}
                        {c.s && (
                          <>
                            <br />
                            <small style={{ fontWeight: 500, color: 'var(--muted)' }}>{c.s}</small>
                          </>
                        )}
                      </th>
                    ))}
                    <th>
                      국수탐
                      <br />
                      <small style={{ fontWeight: 500, color: 'var(--muted)' }}>백분위합</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ROUNDS.map((r) => (
                    <tr key={r.name + r.date} className={r.latest ? 'latest' : undefined}>
                      <td className="rd">
                        {r.name}
                        <small>{r.date}</small>
                      </td>
                      {r.cells.map((c, i) => (
                        <td key={i}>
                          <span className={`gr${c.tone ? ` ${c.tone}` : ''}`}>{c.grade}</span>
                          <span className="pn">{c.note}</span>
                        </td>
                      ))}
                      <td>
                        <span className="sum">
                          {r.sum} {r.delta && <span className="delta up">{r.delta}</span>}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ color: 'var(--muted)' }}>
                    <td className="rd" style={{ color: 'var(--muted)' }}>
                      6월 평가원<small>예정 · 06.04</small>
                    </td>
                    <td colSpan={7} style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--muted)' }}>
                      응시 예정 — API 자동 조회 대기
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ── 과목별 상세 ── */}
            <div className="subj-grid">
              <div className="box">
                <div className="box-h">
                  <div className="bt">
                    <span style={{ color: 'var(--red)', display: 'flex' }}>
                      <Icon name="trending-down" size={15} />
                    </span>
                    백분위 추이 · {subject}
                  </div>
                  <div className="subj-pick">
                    {['국어', '수학', '지구과학'].map((s) => (
                      <button
                        type="button"
                        key={s}
                        className={`subj-opt${subject === s ? ' on' : ''}`}
                        onClick={() => setSubject(s)}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="box-b">
                  <div className="chart-wrap">
                    <svg className="trend" viewBox="0 0 360 150" preserveAspectRatio="none">
                      <line x1="34" y1="16" x2="34" y2="120" stroke="#ECEEF1" strokeWidth="1" />
                      <line x1="34" y1="120" x2="352" y2="120" stroke="#ECEEF1" strokeWidth="1" />
                      <line x1="34" y1="16" x2="352" y2="16" stroke="#F1F3F6" strokeWidth="1" strokeDasharray="3 3" />
                      <line x1="34" y1="68" x2="352" y2="68" stroke="#F1F3F6" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="28" y="20" textAnchor="end" fontSize="9" fill="#8B94A3">95</text>
                      <text x="28" y="72" textAnchor="end" fontSize="9" fill="#8B94A3">80</text>
                      <text x="28" y="123" textAnchor="end" fontSize="9" fill="#8B94A3">65</text>
                      {/* 전국 평균선 */}
                      <polyline
                        points="60,86 133,80 206,82 279,84"
                        fill="none"
                        stroke="#8B94A3"
                        strokeWidth="1.5"
                        strokeDasharray="4 3"
                        opacity=".7"
                      />
                      <text x="285" y="86" fontSize="9" fill="#8B94A3">전국</text>
                      {/* 학생 추이 */}
                      <polyline points="60,75 133,51 206,54 279,61" fill="none" stroke="#E0533D" strokeWidth="2.5" />
                      <circle cx="60" cy="75" r="3.5" fill="#E0533D" />
                      <circle cx="133" cy="51" r="3.5" fill="#E0533D" />
                      <circle cx="206" cy="54" r="3.5" fill="#E0533D" />
                      <circle cx="279" cy="61" r="4.5" fill="#fff" stroke="#E0533D" strokeWidth="2.5" />
                      <text x="60" y="138" textAnchor="middle" fontSize="9" fill="#8B94A3">3월</text>
                      <text x="133" y="138" textAnchor="middle" fontSize="9" fill="#8B94A3">4월</text>
                      <text x="206" y="138" textAnchor="middle" fontSize="9" fill="#8B94A3">04/16</text>
                      <text x="279" y="138" textAnchor="middle" fontSize="9" fill="#E0533D" fontWeight="700">05/20</text>
                    </svg>
                    <div className="chart-cap">
                      <span>
                        백분위 78 → <b style={{ color: 'var(--red)' }}>82</b> (직전 85 대비{' '}
                        <b style={{ color: 'var(--red)' }}>−3</b>)
                      </span>
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>신유형 취약</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="box">
                <div className="box-h">
                  <div className="bt">
                    <Icon name="bar-chart-3" size={15} /> 단원별 정답률 · 지구과학 05/20
                  </div>
                </div>
                <div className="box-b">
                  <div className="bars">
                    {UNITS.map((u) => (
                      <div className="bar-row" key={u.name}>
                        <span className="bl">{u.name}</span>
                        <div className="bar-track">
                          <div className={`me${u.low ? ' low' : ''}`} style={{ width: `${u.me}%` }} />
                          <div className="nat" style={{ left: `${u.nat}%` }} />
                        </div>
                        <span className="bar-val">
                          <b style={u.low ? { color: 'var(--red)' } : undefined}>{u.me}%</b> / 전국 {u.nat}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="callout">
              <div className="ic">
                <Icon name="message-square-text" size={15} />
              </div>
              <div>
                <div className="tt">담임 상담 연동</div>
                <div className="tx">
                  우주·신유형 단원 정답률이 전국 대비 크게 낮습니다. 이 분석은 <Link to="/s/consult">학생상담(상담일지)</Link>의
                  「성적 근거」로 자동 첨부되며, 상담 리포트의 과목별 이행률·코멘트와 결합됩니다.
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export const scoreMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="refresh-cw" size={14} /> 더프리미엄 동기화
      </button>
      <button className="btn">
        <Icon name="upload" size={14} /> 상세 엑셀 업로드
      </button>
      <button className="btn pri">
        <Icon name="file-text" size={14} /> 성적표 PDF → D.Lab
      </button>
    </>
  ),
}
