import { useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import { ACADEMY_EVENTS, TYPE_META, type AcademyEvent, type EventType } from './academyEvents'
import '../../styles/forms.css'

/* F-4.11-10 연간 행사 마스터 → 학습계획 반영 — 신규개발-요구사항신규
 *
 * 관리자가 여기 캘린더에 일정을 입력하면 그 날 학생은 학습계획(F-4.11-2)을 세울 수 없다.
 * 그래서 일정 데이터는 `academyEvents.ts` 한 곳에 두고 두 화면이 같이 읽는다.
 * 화면마다 따로 들고 있으면 "달력엔 휴원인데 계획은 써지는" 상태가 생긴다.
 *
 * ⚠ #41 / I-21 (중) — 입력 주체·행사 유형·학습계획 반영 규칙 미확정. */

type AnnualEvent = AcademyEvent
const EVENTS = ACADEMY_EVENTS

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
          <div className="d warn">해당일 학생 입력 불가</div>
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
              <div className="note-box">
                <div className="ic">
                  <Icon name="lock" size={17} />
                </div>
                <div>
                  <div className="tt">여기에 등록한 일정이 학생 앱의 학습계획 작성을 막습니다</div>
                  <div className="tx">
                    <b>학습계획 입력 차단</b>으로 등록한 날은 학생 앱에서 계획을 세울 수 없고, 담임 화면(
                    <b>주·일 학습계획</b>)에도 자물쇠로 표시되며 <b>미작성 집계에서 제외</b>됩니다. 차단하지 않으면
                    휴원일마다 전교생이 미작성자로 잡혀 경고가 무의미해집니다.
                    <br />
                    <b>차단은 입력 금지이지 삭제가 아닙니다.</b> 이미 계획을 쓴 날을 뒤늦게 차단으로 바꿨을 때 기존
                    계획을 어떻게 할지(보존·읽기전용 / 이행 집계 제외 / 학생 알림)는 아직 정해지지 않았습니다.
                  </div>
                </div>
              </div>

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
