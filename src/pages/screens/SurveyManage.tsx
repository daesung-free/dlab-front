import { useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.6-부속 설문 관리(가채점 설문, 템플릿) — 신규개발-요구사항신규
 *
 * 성적 모듈의 하위 도메인이지만 의존성이 낮아 병행 가능하다.
 * 관리 = 템플릿·배포 / 앱 = 응답.
 * tables: surveys, survey_questions, survey_responses, survey_answers, survey_templates */

type SurveyStatus = '작성중' | '배포중' | '마감' | '집계완료'

interface Survey {
  id: string
  title: string
  kind: '가채점' | '만족도' | '수요조사' | '기타'
  status: SurveyStatus
  target: string
  targetCount: number
  responses: number
  openedAt: string
  closesAt: string
}

const SURVEYS: Survey[] = [
  { id: 's1', title: '2026 6월 평가원 가채점', kind: '가채점', status: '배포중', target: '전체 재원생', targetCount: 296, responses: 214, openedAt: '2026-06-04 18:00', closesAt: '2026-06-05 23:59' },
  { id: 's2', title: '2026 5월 THE PREMIUM 가채점', kind: '가채점', status: '집계완료', target: '전체 재원생', targetCount: 296, responses: 289, openedAt: '2026-05-20 18:00', closesAt: '2026-05-21 23:59' },
  { id: 's3', title: '6월 특강 수요 조사', kind: '수요조사', status: '마감', target: '자연계열', targetCount: 198, responses: 171, openedAt: '2026-05-15 09:00', closesAt: '2026-05-22 18:00' },
  { id: 's4', title: '급식 만족도 조사 (5월)', kind: '만족도', status: '집계완료', target: '급식 신청자', targetCount: 241, responses: 198, openedAt: '2026-05-25 12:00', closesAt: '2026-05-31 23:59' },
  { id: 's5', title: '2026 9월 평가원 가채점', kind: '가채점', status: '작성중', target: '-', targetCount: 0, responses: 0, openedAt: '-', closesAt: '-' },
]

const STATUS_TONE: Record<SurveyStatus, string> = {
  작성중: 'supplement',
  배포중: 'verified',
  마감: 'brandnew',
  집계완료: 'verified',
}

const COLUMNS: Column<Survey>[] = [
  { key: 'title', header: '설문명', sortable: true, value: (r) => r.title },
  {
    key: 'kind',
    header: '유형',
    width: '84px',
    align: 'center',
    sortable: true,
    value: (r) => r.kind,
    render: (r) => <span className="mk supplement">{r.kind}</span>,
  },
  { key: 'target', header: '대상', width: '110px', value: (r) => r.target },
  {
    key: 'responses',
    header: '응답률',
    width: '150px',
    align: 'right',
    sortable: true,
    value: (r) => (r.targetCount ? r.responses / r.targetCount : 0),
    render: (r) => {
      if (!r.targetCount) return <span style={{ color: 'var(--muted)' }}>-</span>
      const pct = Math.round((r.responses / r.targetCount) * 100)
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <div style={{ width: 52, height: 6, background: 'var(--line-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? 'var(--mint)' : 'var(--amber)' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {r.responses}/{r.targetCount}
          </span>
        </div>
      )
    },
  },
  { key: 'closesAt', header: '마감', width: '140px', sortable: true, value: (r) => r.closesAt },
  {
    key: 'status',
    header: '상태',
    width: '92px',
    align: 'center',
    sortable: true,
    value: (r) => r.status,
    render: (r) => <span className={`mk ${STATUS_TONE[r.status]}`}>{r.status}</span>,
  },
  {
    key: 'act',
    header: '',
    width: '150px',
    align: 'center',
    value: () => '',
    render: (r) => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.status === '작성중'}>
          결과
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          복제
        </button>
      </div>
    ),
  },
]

/* ── 템플릿 ── */
interface Template {
  id: string
  name: string
  kind: string
  questions: number
  usedCount: number
  updatedAt: string
}

const TEMPLATES: Template[] = [
  { id: 't1', name: '수능 가채점 표준 (국·수·영·한국사·탐1·탐2)', kind: '가채점', questions: 6, usedCount: 7, updatedAt: '2026-05-20' },
  { id: 't2', name: '평가원 가채점 간이형', kind: '가채점', questions: 4, usedCount: 3, updatedAt: '2026-04-10' },
  { id: 't3', name: '급식 만족도 표준', kind: '만족도', questions: 8, usedCount: 5, updatedAt: '2026-05-25' },
  { id: 't4', name: '특강 수요 조사 표준', kind: '수요조사', questions: 5, usedCount: 4, updatedAt: '2026-05-15' },
]

const TEMPLATE_COLUMNS: Column<Template>[] = [
  { key: 'name', header: '템플릿명', sortable: true, value: (r) => r.name },
  {
    key: 'kind',
    header: '유형',
    width: '90px',
    align: 'center',
    sortable: true,
    value: (r) => r.kind,
    render: (r) => <span className="mk supplement">{r.kind}</span>,
  },
  { key: 'questions', header: '문항수', width: '76px', align: 'right', sortable: true, value: (r) => r.questions },
  { key: 'usedCount', header: '사용횟수', width: '84px', align: 'right', sortable: true, value: (r) => r.usedCount },
  { key: 'updatedAt', header: '최종 수정', width: '104px', sortable: true, value: (r) => r.updatedAt },
  {
    key: 'act',
    header: '',
    width: '150px',
    align: 'center',
    value: () => '',
    render: () => (
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        <button className="btn pri" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          설문 생성
        </button>
        <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
          수정
        </button>
      </div>
    ),
  },
]

/* ── 가채점 결과 집계 예시 ── */
const SUBJECT_RESULT = [
  { subject: '국어', avg: 82.4, grade: '2.8', n: 289 },
  { subject: '수학', avg: 76.1, grade: '3.1', n: 289 },
  { subject: '영어', avg: 84.7, grade: '2.4', n: 289 },
  { subject: '한국사', avg: 61.2, grade: '3.4', n: 289 },
  { subject: '탐구1', avg: 79.5, grade: '2.9', n: 271 },
  { subject: '탐구2', avg: 74.8, grade: '3.2', n: 268 },
]

function Content() {
  const [tab, setTab] = useState('list')

  return (
    <>
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="clipboard-list" size={13} /> 전체 설문
          </div>
          <div className="v">{SURVEYS.length}</div>
          <div className="d">2026 시즌</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="send" size={13} /> 배포중
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {SURVEYS.filter((s) => s.status === '배포중').length}
          </div>
          <div className="d">응답 수집 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 평균 응답률
          </div>
          <div className="v">
            {Math.round(
              (SURVEYS.filter((s) => s.targetCount).reduce((a, s) => a + s.responses / s.targetCount, 0) /
                SURVEYS.filter((s) => s.targetCount).length) *
                100,
            )}
            %
          </div>
          <div className="d">마감 기준</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="copy" size={13} /> 템플릿
          </div>
          <div className="v">{TEMPLATES.length}</div>
          <div className="d">재사용 가능</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="line-chart" size={13} /> 성적 연동
          </div>
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            F-4.6
          </div>
          <div className="d">가채점 → 리포트</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '설문 목록', count: SURVEYS.length },
            { key: 'template', label: '템플릿', count: TEMPLATES.length },
            { key: 'result', label: '결과 집계' },
          ]}
          active={tab}
          onChange={setTab}
        />

        <div style={{ padding: 14 }}>
          {tab === 'list' && (
            <DataTable
              columns={COLUMNS}
              rows={SURVEYS}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              countLabel={
                <>
                  설문 <b>{SURVEYS.length}</b>건 · <code style={{ fontSize: 11 }}>surveys</code> ·{' '}
                  <code style={{ fontSize: 11 }}>survey_templates</code>
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="설문_목록" columns={COLUMNS} rows={SURVEYS} masked={false} />
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 설문 생성
                  </button>
                </>
              }
            />
          )}

          {tab === 'template' && (
            <>
              <DataTable
                columns={TEMPLATE_COLUMNS}
                rows={TEMPLATES}
                rowKey={(r) => r.id}
                masked={false}
                pageSize={10}
                countLabel={
                  <>
                    템플릿 <b>{TEMPLATES.length}</b>건
                  </>
                }
                toolbar={
                  <button className="btn pri">
                    <Icon name="plus" size={14} /> 템플릿 등록
                  </button>
                }
              />
              <div className="note-box plain" style={{ marginTop: 14, marginBottom: 0 }}>
                <div className="ic">
                  <Icon name="copy" size={17} />
                </div>
                <div>
                  <div className="tt">템플릿 → 설문 인스턴스화</div>
                  <div className="tx">
                    <code>survey_templates</code>에서 <code>instantiate</code>하면 문항이 복제된 새{' '}
                    <code>surveys</code> 레코드가 생깁니다. 이후 템플릿을 수정해도 <b>이미 배포된 설문은 바뀌지
                    않습니다</b> — 응답 데이터의 정합성을 지키기 위해 문항을 스냅샷으로 복제하는 구조입니다.
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === 'result' && (
            <div className="card-sec" style={{ marginBottom: 0, boxShadow: 'none', border: '1px solid var(--line)' }}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name="bar-chart-3" size={15} />
                  </span>
                  2026 5월 THE PREMIUM 가채점 — 응답 289 / 296
                </div>
                <div className="r">
                  <button className="btn" style={{ padding: '5px 11px', fontSize: 11.5 }}>
                    <Icon name="file-spreadsheet" size={12} /> 원시 응답 다운로드
                  </button>
                </div>
              </div>
              <div className="card-sec-b">
                {SUBJECT_RESULT.map((s) => (
                  <div
                    key={s.subject}
                    style={{ display: 'grid', gridTemplateColumns: '72px 1fr 150px', gap: 12, alignItems: 'center', marginBottom: 11 }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 700 }}>{s.subject}</span>
                    <div style={{ height: 14, background: 'var(--line-2)', borderRadius: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${s.avg}%`, height: '100%', background: 'var(--mint)', borderRadius: 7 }} />
                    </div>
                    <span style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
                      평균 <b style={{ color: 'var(--ink)', fontSize: 13 }}>{s.avg}</b> · 등급 {s.grade} · n={s.n}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export const surveyMockup: Mockup = {
  Content,
  actions: (
    <>
      <button className="btn">
        <Icon name="copy" size={14} /> 템플릿에서 생성
      </button>
      <button className="btn pri">
        <Icon name="plus" size={14} /> 설문 생성
      </button>
    </>
  ),
}
