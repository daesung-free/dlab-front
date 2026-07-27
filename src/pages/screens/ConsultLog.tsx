import { useState } from 'react'
import { StudentList, type StudentRow } from '../../components/StudentList'
import { StudentHeader } from '../../components/StudentHeader'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'
import './consult.css'

/* ── 목업 데이터 (01_admin_sangdam.html 이관) ── */

const STUDENTS: StudentRow[] = [
  { id: 's1', name: '이승민', meta: '자연 · 재수 · 3반 4019', tag: { label: '정기', tone: 'na' }, due: 'D-1 예정', date: '05/28' },
  { id: 's2', name: '박서준', meta: '자연 · 삼수 · 3반 4021', tag: { label: '성적↓', tone: 'risk' }, due: '지연 3일', date: '05/22', warn: true },
  { id: 's3', name: '김하윤', meta: '인문 · 재수 · 1반 1102', date: '05/25' },
  { id: 's4', name: '정민재', meta: '자연 · 재수 · 2반 2210', tag: { label: '생활', tone: 'in' }, date: '05/24' },
  { id: 's5', name: '최유나', meta: '인문 · 재수 · 1반 1108', date: '05/20' },
  { id: 's6', name: '강도현', meta: '자연 · 재수 · 3반 4033', date: '05/19' },
  { id: 's7', name: '윤지호', meta: '자연 · 삼수 · 2반 2231', tag: { label: '진학', tone: 'na' }, date: '05/18' },
]

const SCORE_STRIP = [
  { l: '국어 (언매)', v: '2', unit: '등급', d: '▲ 백분위 94', tone: 'up' },
  { l: '수학 (미적)', v: '1', unit: '등급', d: '▲ 백분위 96', tone: 'up' },
  { l: '영어', v: '2', unit: '등급', d: '— 84점', tone: '' },
  { l: '탐구 소계', v: '3', unit: '등급', d: '▼ 백분위 88', tone: 'down' },
  { l: '국수탐 백분위', v: '278', unit: '', d: '▲ 상위 5.7%', tone: 'up' },
  { l: '최근 응시', v: '05/20', unit: '', d: 'THE PREMIUM', tone: 'mut' },
]

const CONSULT_TYPES = [
  { label: '정기 상담', tone: '' },
  { label: '성적 상담', tone: 'sc' },
  { label: '생활 · 태도', tone: 'li' },
  { label: '진학 상담', tone: '' },
  { label: '학부모 상담', tone: '' },
]

interface Entry {
  kind: '' | 'sc' | 'li' | 'na'
  type: { label: string; cls: string }
  date: string
  who: string
  sections: { label: string; text?: string; ref?: string; action?: { text: string; done?: boolean } }[]
}

const TIMELINE: Entry[] = [
  {
    kind: 'sc',
    type: { label: '성적 상담', cls: 'scr' },
    date: '2026.05.14',
    who: '이장원 · 대면 25분',
    sections: [
      { label: '근거 성적', ref: 'THE PREMIUM 04/16 · 국수탐 백분위 271 · 탐구 2등급' },
      {
        label: '상담 내용',
        text: '중간 점검. 국어 언매 안정적 2등급 진입. 탐구는 지구과학 상위, 물리Ⅱ 표본 적어 변동성 큼. 목표 대학(고려대 반도체공) 기준 국수탐 합 상향 필요 공감.',
      },
      { label: '합의 · 다음 행동', action: { text: '완료 — 물리Ⅱ 주간 실전세트 이행 확인', done: true } },
    ],
  },
  {
    kind: 'na',
    type: { label: '정기 상담', cls: 'reg' },
    date: '2026.04.30',
    who: '이장원 · 대면 15분',
    sections: [
      {
        label: '상담 내용',
        text: '4월 적응 상태 양호. 독서실 좌석(A-24) 만족. 오전 등원시간 준수 중. 학습량 자체는 충분하나 복습 회독이 밀린다는 자기진단.',
      },
      { label: '합의 · 다음 행동', action: { text: '완료 — 주간 복습 체크리스트 도입', done: true } },
    ],
  },
  {
    kind: 'li',
    type: { label: '생활 · 태도', cls: 'lif' },
    date: '2026.04.09',
    who: '이장원 · 전화 10분',
    sections: [
      { label: '상담 내용', text: '4/8 지각 1회 관련 확인. 대중교통 지연 사유, 상습성 없음. 벌점 미부과 안내.' },
      { label: '학부모 공유', ref: '요약본 전송됨 · 05.09 열람' },
    ],
  },
  {
    kind: '',
    type: { label: '입학예약 상담', cls: 'adm' },
    date: '2026.02.24',
    who: '최지원 · 대면 40분',
    sections: [
      {
        label: '유입 · 배경',
        text: '지인추천 유입. 전년도 정시 상향 실패, 자연계열 재수 결정. 입학기준(수능 최저) 충족 확인.',
      },
      { label: '입학 시 성적', ref: '입학기준: 국2 수1 영2 탐3 · 내신 2등급 · 목표 고려대 반도체공' },
      { label: '결정', action: { text: '등록 완료 — 원생코드 DL-2026-0419 발번 · 3반 배정', done: true } },
    ],
  },
]

const DETAIL_TABS = [
  { key: 'log', label: '상담 이력', count: 8 },
  { key: 'score', label: '성적 추이' },
  { key: 'att', label: '출결 · 상벌점' },
  { key: 'share', label: '학부모 공유내역' },
]

function Content() {
  const [tab, setTab] = useState('log')
  const [type, setType] = useState('정기 상담')

  return (
    <div className="p-consult">
      <div className="layout">
        <StudentList title="재원생" count="전체 312명" filters={['전체', '상담 필요', '성적 하락', '징계 관찰']} rows={STUDENTS} />

        <section className="panel">
          <StudentHeader
            name="이승민"
            code="DL-2026-0419"
            sub={
              <>
                <b>자연 · 재수</b> · 3반 4019 · 독서실 A-24 · 등원 2026.03.02 · <b>담임</b> 이장원
              </>
            }
            right={
              <div className="risk-badge">
                <Icon name="alert-circle" size={13} /> 정기상담 D-1
              </div>
            }
          />

          <div className="score-strip">
            {SCORE_STRIP.map((s) => (
              <div className="sc" key={s.l}>
                <div className="l">{s.l}</div>
                <div className="v" style={s.l === '최근 응시' ? { fontSize: 15 } : undefined}>
                  {s.v}
                  {s.unit && <small>{s.unit}</small>}
                </div>
                <div
                  className={`d ${s.tone === 'up' ? 'up' : s.tone === 'down' ? 'down' : ''}`}
                  style={s.tone === 'mut' ? { color: 'var(--muted)', fontWeight: 600 } : undefined}
                >
                  {s.d}
                </div>
              </div>
            ))}
          </div>

          <Tabs items={DETAIL_TABS} active={tab} onChange={setTab} />

          <div className="panel-body">
            {/* ── 새 상담일지 작성 ── */}
            <div className="composer">
              <div className="comp-h">
                <div className="t">
                  <Icon name="pencil" size={15} /> 새 상담일지 작성
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--mint-d)' }}>작성자: 이장원 · 2026.05.28</div>
              </div>

              <div className="comp-body">
                <div className="frow">
                  <label className="req">상담 유형</label>
                  <div className="type-picks">
                    {CONSULT_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t.label}
                        className={`type-pick${type === t.label ? ` on ${t.tone}` : ''}`}
                        onClick={() => setType(t.label)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="frow">
                  <label className="req">상담 방식</label>
                  <div className="two">
                    <select className="sel" defaultValue="대면 (개별)">
                      <option>대면 (개별)</option>
                      <option>전화</option>
                      <option>온라인</option>
                    </select>
                    <input className="inp" defaultValue="20분 · 상담실 2" placeholder="소요시간 · 장소" />
                  </div>
                </div>

                <div className="frow">
                  <label>성적 근거</label>
                  <div className="link-box">
                    <div className="chk">
                      <Icon name="check" size={12} />
                    </div>
                    <div>
                      이 상담에 <b>THE PREMIUM 05/20 성적표</b>를 근거로 첨부 — 탐구(지구과학 4등급, 백분위 82) 하락, 수학
                      미적 1등급 유지가 자동 표시됩니다.
                    </div>
                  </div>
                </div>

                <div className="frow">
                  <label className="req">상담 내용</label>
                  <textarea
                    className="ta"
                    placeholder="상담에서 다룬 내용을 기록하세요. (학생 상태, 학습 현황, 논의사항)"
                    defaultValue="탐구 소계 등급 하락(3→ 지구과학 개별 4등급) 원인 점검. 개념 이해는 되나 신유형 대응 시간이 부족. 최근 수면 패턴 흐트러져 오전 집중력 저하 호소."
                  />
                </div>

                <div className="frow">
                  <label className="req">합의 · 다음 행동</label>
                  <textarea
                    className="ta"
                    style={{ minHeight: 56 }}
                    placeholder="학생과 합의한 실행 계획 (Action)"
                    defaultValue="지구과학 신유형 주 3세트 추가 · D.FINE 실전모의 병행. 취침시간 24시 고정. 2주 뒤 재점검."
                  />
                </div>

                <div className="frow">
                  <label>후속 상담</label>
                  <div className="two">
                    <input className="inp" defaultValue="2026.06.11" placeholder="다음 상담 예정일" />
                    <select className="sel" defaultValue="학부모 공유: 요약본 전송">
                      <option>학부모 공유: 요약본 전송</option>
                      <option>학부모 공유: 안 함</option>
                      <option>학부모 공유: 전체</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="comp-foot">
                <div className="hint">저장 시 학생 앱 · 학부모 앱(공유 설정에 따라)에 즉시 반영됩니다.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn">임시저장</button>
                  <button className="btn pri">상담일지 저장</button>
                </div>
              </div>
            </div>

            {/* ── 상담 이력 타임라인 ── */}
            <div className="tl-head">
              <div className="t">상담 이력</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>최신순 · 입학예약 상담부터 연속 기록</div>
            </div>

            <div className="timeline">
              {TIMELINE.map((e) => (
                <div className={`entry ${e.kind}`} key={e.date}>
                  <div className="ecard">
                    <div className="ecard-h">
                      <span className={`ty ${e.type.cls}`}>{e.type.label}</span>
                      <span className="dt">{e.date}</span>
                      <span className="who">{e.who}</span>
                    </div>
                    <div className="ecard-b">
                      {e.sections.map((s) => (
                        <div className="esec" key={s.label}>
                          <div className="sl">{s.label}</div>
                          {s.text && <div className="sx">{s.text}</div>}
                          {s.ref && (
                            <span className="score-ref">
                              <Icon name="file-text" size={13} /> {s.ref}
                            </span>
                          )}
                          {s.action && (
                            <span className={`action-tag${s.action.done ? ' done-tag' : ''}`}>
                              <Icon name="check" size={13} /> {s.action.text}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="legend">
              <span>
                <span className="dot" style={{ background: 'var(--mint)' }} />
                <b>정기</b>
              </span>
              <span>
                <span className="dot" style={{ background: 'var(--amber)' }} />
                <b>성적</b>
              </span>
              <span>
                <span className="dot" style={{ background: 'var(--violet)' }} />
                <b>생활·태도</b>
              </span>
              <span>
                <span className="dot" style={{ background: 'var(--mint-d)' }} />
                <b>입학예약</b>
              </span>
              <span style={{ marginLeft: 'auto' }}>
                모든 상담은 <b>원생코드</b>로 입학예약 → 재원생 → 성적리포트와 연결됩니다.
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export const consultMockup: Mockup = {
  Content,
  actions: (
    <>
      <input className="inp" style={{ width: 250 }} placeholder="이름 · 학번 · 원생코드 검색" />
      <button className="btn">이번 주 상담 25건 ▾</button>
    </>
  ),
}
