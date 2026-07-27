import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.11-10 연간 행사 마스터 → 학습계획 반영 — 신규개발-요구사항신규
 *
 * 관리자가 사전에 연간 행사를 입력하면 학생 학습계획(F-4.11-2) 입력 시
 * 해당일이 자동 반영/차단된다. 기초설정(4.10) 하위 배치도 가능.
 *
 * ⚠ #41 / I-21 (중) — 입력 주체·행사 유형·학습계획 반영 규칙 미확정. */

type EventType = '모의고사' | '휴원' | '특강' | '설명회' | '행사'

const TYPE_META: Record<EventType, { cls: string; color: string; blocks: boolean }> = {
  모의고사: { cls: 'brandnew', color: 'var(--amber)', blocks: true },
  휴원: { cls: 'brandnew', color: 'var(--red)', blocks: true },
  특강: { cls: 'supplement', color: 'var(--blue)', blocks: false },
  설명회: { cls: 'supplement', color: 'var(--violet)', blocks: false },
  행사: { cls: 'verified', color: 'var(--mint)', blocks: false },
}

interface AnnualEvent {
  id: string
  from: string
  to: string
  title: string
  type: EventType
  target: string
  /** 학습계획에서 해당일을 차단 */
  blockPlan: boolean
  note: string
}

const EVENTS: AnnualEvent[] = [
  { id: 'e1', from: '2026-03-26', to: '2026-03-26', title: '3월 학력평가', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e2', from: '2026-04-10', to: '2026-04-10', title: '4월 학력평가', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e3', from: '2026-04-16', to: '2026-04-16', title: 'THE PREMIUM 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일' },
  { id: 'e4', from: '2026-05-05', to: '2026-05-05', title: '어린이날 휴원', type: '휴원', target: '전체', blockPlan: true, note: '공휴일 · 급식 제외' },
  { id: 'e5', from: '2026-05-20', to: '2026-05-20', title: 'THE PREMIUM 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일' },
  { id: 'e6', from: '2026-05-24', to: '2026-05-25', title: '부처님오신날 · 대체공휴일', type: '휴원', target: '전체', blockPlan: true, note: '연휴 · 급식 제외' },
  { id: 'e7', from: '2026-06-04', to: '2026-06-04', title: '6월 평가원 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e8', from: '2026-06-13', to: '2026-06-13', title: '2027학년도 입학 설명회 (1차)', type: '설명회', target: '외부', blockPlan: false, note: '재원생 학습 영향 없음' },
  { id: 'e9', from: '2026-06-22', to: '2026-06-26', title: '6월 단과 특강 주간', type: '특강', target: '신청자', blockPlan: false, note: '특강 신청자만' },
  { id: 'e10', from: '2026-09-03', to: '2026-09-03', title: '9월 평가원 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e11', from: '2026-11-19', to: '2026-11-19', title: '2027학년도 수능', type: '모의고사', target: '전체', blockPlan: true, note: '수능 당일' },
  { id: 'e12', from: '2026-11-20', to: '2026-11-20', title: '가채점 설문 · 상담 주간 시작', type: '행사', target: '전체', blockPlan: false, note: '설문 배포 연동' },
]

const COLUMNS: Column<AnnualEvent>[] = [
  {
    key: 'from',
    header: '기간',
    width: '176px',
    sortable: true,
    value: (r) => r.from,
    render: (r) => (r.from === r.to ? r.from : `${r.from} ~ ${r.to}`),
  },
  { key: 'title', header: '행사명', sortable: true, value: (r) => r.title },
  {
    key: 'type',
    header: '유형',
    width: '92px',
    align: 'center',
    sortable: true,
    value: (r) => r.type,
    render: (r) => <span className={`mk ${TYPE_META[r.type].cls}`}>{r.type}</span>,
  },
  { key: 'target', header: '대상', width: '80px', align: 'center', value: (r) => r.target },
  {
    key: 'blockPlan',
    header: '학습계획',
    width: '104px',
    align: 'center',
    sortable: true,
    value: (r) => (r.blockPlan ? '차단' : '영향 없음'),
    render: (r) =>
      r.blockPlan ? (
        <span className="mk brandnew" title="해당일 학습계획 입력 차단">
          <Icon name="lock" size={10} /> 차단
        </span>
      ) : (
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>영향 없음</span>
      ),
  },
  { key: 'note', header: '비고', value: (r) => r.note },
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

const MONTHS = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

function Content() {
  const [tab, setTab] = useState('list')

  const byMonth = useMemo(() => {
    const m = new Map<number, AnnualEvent[]>()
    for (let i = 1; i <= 12; i++) m.set(i, [])
    for (const e of EVENTS) {
      const mo = Number(e.from.slice(5, 7))
      m.get(mo)!.push(e)
    }
    return m
  }, [])

  const blocking = EVENTS.filter((e) => e.blockPlan).length

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="calendar-days" size={13} /> 등록 행사
          </div>
          <div className="v">{EVENTS.length}</div>
          <div className="d">2026 시즌</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="lock" size={13} /> 학습계획 차단
          </div>
          <div className="v" style={{ color: 'var(--amber)' }}>
            {blocking}
          </div>
          <div className="d warn">그리드 열 잠금</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="file-text" size={13} /> 모의고사
          </div>
          <div className="v">{EVENTS.filter((e) => e.type === '모의고사').length}</div>
          <div className="d">성적 리포트 연동</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="utensils" size={13} /> 휴원
          </div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {EVENTS.filter((e) => e.type === '휴원').length}
          </div>
          <div className="d">급식 가능일 제외</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="link" size={13} /> 참조 화면
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            3곳
          </div>
          <div className="d">학습계획·급식·성적</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '행사 목록', count: EVENTS.length },
            { key: 'year', label: '연간 뷰' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'list' ? (
            <>
              <DataTable
                columns={COLUMNS}
                rows={EVENTS}
                rowKey={(r) => r.id}
                masked={false}
                pageSize={12}
                countLabel={
                  <>
                    2026 연간 행사 <b>{EVENTS.length}</b>건 ·{' '}
                    <code style={{ fontSize: 11 }}>annual_events</code>
                  </>
                }
                toolbar={
                  <>
                    <ExcelButton filename="연간행사_마스터" columns={COLUMNS} rows={EVENTS} masked={false} />
                    <button className="btn">
                      <Icon name="history" size={14} /> 전년도 복사
                    </button>
                    <button className="btn pri">
                      <Icon name="plus" size={14} /> 행사 등록
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
                    행사 등록
                  </div>
                </div>
                <div className="card-sec-b">
                  <div className="split">
                    <div>
                      <div className="frow">
                        <label className="req">행사명</label>
                        <input className="inp" placeholder="9월 평가원 모의고사" />
                      </div>
                      <div className="frow">
                        <label className="req">기간</label>
                        <div className="two">
                          <input className="inp" type="date" />
                          <input className="inp" type="date" />
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="frow">
                        <label className="req">유형 · 대상</label>
                        <div className="two">
                          <select className="sel">
                            {(Object.keys(TYPE_META) as EventType[]).map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                          <select className="sel">
                            <option>전체</option>
                            <option>신청자</option>
                            <option>외부</option>
                          </select>
                        </div>
                      </div>
                      <div className="frow">
                        <label>학습계획</label>
                        <div style={{ paddingTop: 9 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                            <input type="checkbox" defaultChecked />
                            해당일 학습계획 입력 차단
                          </label>
                        </div>
                      </div>
                      <div className="frow">
                        <label>&nbsp;</label>
                        <button className="btn pri">
                          <Icon name="save" size={14} /> 등록
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {MONTHS.map((mo, i) => {
                const list = byMonth.get(i + 1)!
                return (
                  <div
                    key={mo}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: '12px 14px',
                      minHeight: 120,
                      background: list.length ? '#fff' : '#fafbfc',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        marginBottom: 9,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      {mo}
                      <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginLeft: 'auto' }}>
                        {list.length}건
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {list.length === 0 && <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>등록된 행사 없음</span>}
                      {list.map((e) => (
                        <div key={e.id} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                          <span
                            style={{
                              width: 4,
                              alignSelf: 'stretch',
                              borderRadius: 2,
                              background: TYPE_META[e.type].color,
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.35 }}>
                              {e.title}
                              {e.blockPlan && (
                                <Icon name="lock" size={10} />
                              )}
                            </div>
                            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>
                              {e.from.slice(5)}
                              {e.from !== e.to && ` ~ ${e.to.slice(5)}`}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const annualEventsMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">2026 시즌 ▾</button>
      <button className="btn">
        <Icon name="history" size={14} /> 전년도 복사
      </button>
    </>
  ),
}
