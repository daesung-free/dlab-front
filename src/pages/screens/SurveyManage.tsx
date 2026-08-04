import { useCallback, useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import type { Mockup } from './types'
import '../../styles/forms.css'

/* F-4.6-부속 설문 관리(가채점 설문, 템플릿) — 신규개발-요구사항신규
 *
 * 성적 모듈의 하위 도메인이지만 의존성이 낮아 병행 가능하다.
 * 관리 = 템플릿·생성·배포 / 앱 = 응답.
 * tables: surveys, survey_questions, survey_responses, survey_answers, survey_templates
 *
 * ⚠ 템플릿과 설문의 관계 — 참조가 아니라 복제다.
 *   템플릿에서 설문을 만들면 문항이 스냅샷으로 복사된다.
 *   이후 템플릿을 고쳐도 이미 만들어진 설문은 바뀌지 않는다.
 *   응답 데이터가 "그때 그 문항"에 묶여 있어야 집계가 깨지지 않기 때문이다.
 *
 * ⚠ 배포 후 문항 수정 — 막아야 한다.
 *   이미 응답이 쌓인 설문의 문항을 고치면 앞뒤 응답의 의미가 달라진다.
 *   배포중·마감·집계완료 설문은 문항 편집을 잠그고, 고치려면 복제해서 새로 배포한다. */

/* ══ 문항 모델 ══ */

type QType = 'single' | 'multi' | 'text' | 'score' | 'scale' | 'subject'

const QTYPE_META: Record<QType, { label: string; icon: string; hasOptions: boolean; desc: string }> = {
  single: { label: '객관식 (단일)', icon: 'circle-dot', hasOptions: true, desc: '보기 중 하나만 선택' },
  multi: { label: '객관식 (복수)', icon: 'list-checks', hasOptions: true, desc: '보기 여러 개 선택 가능' },
  text: { label: '주관식', icon: 'pencil', hasOptions: false, desc: '자유 입력' },
  score: { label: '점수 입력', icon: 'percent', hasOptions: false, desc: '숫자 입력 — 가채점 원점수' },
  scale: { label: '척도 (1~5)', icon: 'star', hasOptions: true, desc: '만족도 등 5점 척도' },
  subject: { label: '과목별 점수', icon: 'line-chart', hasOptions: true, desc: '과목마다 점수 칸을 만든다 — 가채점 전용' },
}

interface Question {
  id: string
  type: QType
  title: string
  required: boolean
  options: string[]
}

const SCALE_OPTIONS = ['매우 불만족', '불만족', '보통', '만족', '매우 만족']
const SUBJECT_OPTIONS = ['국어', '수학', '영어', '한국사', '탐구1', '탐구2']

let qSeq = 0
function newQuestion(type: QType): Question {
  qSeq += 1
  return {
    id: `q-new-${qSeq}`,
    type,
    title: '',
    required: true,
    options: type === 'scale' ? [...SCALE_OPTIONS] : type === 'subject' ? [...SUBJECT_OPTIONS] : type === 'single' || type === 'multi' ? ['보기 1', '보기 2'] : [],
  }
}

/* ══ 설문 ══ */

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
  questions: Question[]
}

const KINDS: Survey['kind'][] = ['가채점', '만족도', '수요조사', '기타']

const TARGETS = ['전체 재원생', '자연계열', '인문계열', '급식 신청자', '1반', '2반', '3반', '4반']

function q(id: string, type: QType, title: string, options: string[] = [], required = true): Question {
  return { id, type, title, required, options }
}

const GRADING_QUESTIONS: Question[] = [
  q('g1', 'subject', '과목별 원점수를 입력하세요', SUBJECT_OPTIONS),
  q('g2', 'single', '탐구1 응시 과목', ['물리Ⅰ', '물리Ⅱ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ']),
  q('g3', 'single', '탐구2 응시 과목', ['물리Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '지구과학Ⅱ']),
  q('g4', 'single', '체감 난이도', ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움']),
  q('g5', 'text', '가장 어려웠던 단원·유형을 적어주세요', [], false),
]

const SURVEYS: Survey[] = [
  { id: 's1', title: '2026 6월 평가원 가채점', kind: '가채점', status: '배포중', target: '전체 재원생', targetCount: 296, responses: 214, openedAt: '2026-06-04 18:00', closesAt: '2026-06-05 23:59', questions: GRADING_QUESTIONS },
  { id: 's2', title: '2026 5월 THE PREMIUM 가채점', kind: '가채점', status: '집계완료', target: '전체 재원생', targetCount: 296, responses: 289, openedAt: '2026-05-20 18:00', closesAt: '2026-05-21 23:59', questions: GRADING_QUESTIONS },
  {
    id: 's3',
    title: '6월 특강 수요 조사',
    kind: '수요조사',
    status: '마감',
    target: '자연계열',
    targetCount: 198,
    responses: 171,
    openedAt: '2026-05-15 09:00',
    closesAt: '2026-05-22 18:00',
    questions: [
      q('d1', 'multi', '수강을 희망하는 특강을 모두 고르세요', ['수학 미적 킬러', '국어 언매 심화', '지구과학 신유형', '영어 빈칸추론']),
      q('d2', 'single', '선호 시간대', ['평일 저녁', '토요일 오전', '토요일 오후']),
      q('d3', 'text', '개설을 원하는 다른 특강이 있다면 적어주세요', [], false),
    ],
  },
  {
    id: 's4',
    title: '급식 만족도 조사 (5월)',
    kind: '만족도',
    status: '집계완료',
    target: '급식 신청자',
    targetCount: 241,
    responses: 198,
    openedAt: '2026-05-25 12:00',
    closesAt: '2026-05-31 23:59',
    questions: [
      q('m1', 'scale', '전반적인 급식 만족도', SCALE_OPTIONS),
      q('m2', 'scale', '음식의 양', SCALE_OPTIONS),
      q('m3', 'scale', '배식 대기시간', SCALE_OPTIONS),
      q('m4', 'text', '개선했으면 하는 점', [], false),
    ],
  },
  { id: 's5', title: '2026 9월 평가원 가채점', kind: '가채점', status: '작성중', target: '-', targetCount: 0, responses: 0, openedAt: '-', closesAt: '-', questions: GRADING_QUESTIONS },
]

const STATUS_TONE: Record<SurveyStatus, string> = {
  작성중: 'supplement',
  배포중: 'verified',
  마감: 'brandnew',
  집계완료: 'verified',
}

/* ══ 템플릿 ══ */

interface Template {
  id: string
  name: string
  kind: string
  usedCount: number
  updatedAt: string
  questions: Question[]
}

const TEMPLATES: Template[] = [
  { id: 't1', name: '수능 가채점 표준 (국·수·영·한국사·탐1·탐2)', kind: '가채점', usedCount: 7, updatedAt: '2026-05-20', questions: GRADING_QUESTIONS },
  {
    id: 't2',
    name: '평가원 가채점 간이형',
    kind: '가채점',
    usedCount: 3,
    updatedAt: '2026-04-10',
    questions: [q('t2a', 'subject', '과목별 원점수', SUBJECT_OPTIONS), q('t2b', 'single', '체감 난이도', ['쉬움', '보통', '어려움'])],
  },
  {
    id: 't3',
    name: '급식 만족도 표준',
    kind: '만족도',
    usedCount: 5,
    updatedAt: '2026-05-25',
    questions: [
      q('t3a', 'scale', '전반적인 만족도', SCALE_OPTIONS),
      q('t3b', 'scale', '음식의 양', SCALE_OPTIONS),
      q('t3c', 'scale', '배식 대기시간', SCALE_OPTIONS),
      q('t3d', 'text', '개선 의견', [], false),
    ],
  },
  {
    id: 't4',
    name: '특강 수요 조사 표준',
    kind: '수요조사',
    usedCount: 4,
    updatedAt: '2026-05-15',
    questions: [q('t4a', 'multi', '희망 특강', ['수학', '국어', '영어', '탐구']), q('t4b', 'single', '선호 시간대', ['평일 저녁', '주말'])],
  },
]

/* ══ 편집기 상태 ══ */

interface Draft {
  mode: 'survey' | 'template'
  /** 기존 항목 수정이면 원본 id */
  sourceId?: string
  title: string
  kind: string
  target: string
  opensAt: string
  closesAt: string
  questions: Question[]
  /** 응답이 쌓인 설문은 문항을 잠근다 */
  locked: boolean
}

function emptyDraft(mode: 'survey' | 'template'): Draft {
  return {
    mode,
    title: '',
    kind: '가채점',
    target: '전체 재원생',
    opensAt: '',
    closesAt: '',
    questions: [],
    locked: false,
  }
}

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
  const [draft, setDraft] = useState<Draft | null>(null)

  /* ── 편집기 열기 ── */

  const createSurvey = useCallback(() => setDraft(emptyDraft('survey')), [])
  const createTemplate = useCallback(() => setDraft(emptyDraft('template')), [])

  const editSurvey = useCallback((s: Survey) => {
    setDraft({
      mode: 'survey',
      sourceId: s.id,
      title: s.title,
      kind: s.kind,
      target: s.target === '-' ? '전체 재원생' : s.target,
      opensAt: s.openedAt === '-' ? '' : s.openedAt,
      closesAt: s.closesAt === '-' ? '' : s.closesAt,
      questions: s.questions.map((x) => ({ ...x })),
      // 응답이 하나라도 쌓였으면 문항 편집 금지
      locked: s.status !== '작성중',
    })
  }, [])

  const editTemplate = useCallback((t: Template) => {
    setDraft({
      mode: 'template',
      sourceId: t.id,
      title: t.name,
      kind: t.kind,
      target: '전체 재원생',
      opensAt: '',
      closesAt: '',
      questions: t.questions.map((x) => ({ ...x })),
      locked: false,
    })
  }, [])

  /** 템플릿 → 설문 인스턴스화. 문항을 복제해서 새 설문 초안을 만든다 */
  const instantiate = useCallback((t: Template) => {
    setDraft({
      mode: 'survey',
      title: `${t.name.replace(/\s*표준.*$/, '')} — `,
      kind: t.kind,
      target: '전체 재원생',
      opensAt: '',
      closesAt: '',
      questions: t.questions.map((x, i) => ({ ...x, id: `copy-${t.id}-${i}` })),
      locked: false,
    })
  }, [])

  /* ── 문항 조작 ── */

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d))
  }

  function addQuestion(type: QType) {
    setDraft((d) => (d ? { ...d, questions: [...d.questions, newQuestion(type)] } : d))
  }

  function updateQuestion(id: string, p: Partial<Question>) {
    setDraft((d) => (d ? { ...d, questions: d.questions.map((x) => (x.id === id ? { ...x, ...p } : x)) } : d))
  }

  function removeQuestion(id: string) {
    setDraft((d) => (d ? { ...d, questions: d.questions.filter((x) => x.id !== id) } : d))
  }

  function moveQuestion(id: string, dir: -1 | 1) {
    setDraft((d) => {
      if (!d) return d
      const i = d.questions.findIndex((x) => x.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= d.questions.length) return d
      const next = [...d.questions]
      ;[next[i], next[j]] = [next[j], next[i]]
      return { ...d, questions: next }
    })
  }

  function setOption(qid: string, idx: number, v: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((x) =>
              x.id === qid ? { ...x, options: x.options.map((o, i) => (i === idx ? v : o)) } : x,
            ),
          }
        : d,
    )
  }

  function addOption(qid: string) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((x) =>
              x.id === qid ? { ...x, options: [...x.options, `보기 ${x.options.length + 1}`] } : x,
            ),
          }
        : d,
    )
  }

  function removeOption(qid: string, idx: number) {
    setDraft((d) =>
      d
        ? {
            ...d,
            questions: d.questions.map((x) => (x.id === qid ? { ...x, options: x.options.filter((_, i) => i !== idx) } : x)),
          }
        : d,
    )
  }

  /* ── 컬럼 (편집 핸들러를 물고 있어야 해서 Content 안에서 만든다) ── */

  const columns = useMemo<Column<Survey>[]>(
    () => [
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
      { key: 'questions', header: '문항', width: '68px', align: 'right', value: (r) => r.questions.length },
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
        width: '160px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} disabled={r.status === '작성중'}>
              결과
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              onClick={() => editSurvey(r)}
              title={r.status === '작성중' ? '문항까지 편집' : '응답이 있어 문항은 잠깁니다'}
            >
              수정
            </button>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }}>
              복제
            </button>
          </div>
        ),
      },
    ],
    [editSurvey],
  )

  const templateColumns = useMemo<Column<Template>[]>(
    () => [
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
      { key: 'questions', header: '문항수', width: '76px', align: 'right', sortable: true, value: (r) => r.questions.length },
      { key: 'usedCount', header: '사용횟수', width: '84px', align: 'right', sortable: true, value: (r) => r.usedCount },
      { key: 'updatedAt', header: '최종 수정', width: '104px', sortable: true, value: (r) => r.updatedAt },
      {
        key: 'act',
        header: '',
        width: '150px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button className="btn pri" style={{ padding: '4px 9px', fontSize: 11.5 }} onClick={() => instantiate(r)}>
              설문 생성
            </button>
            <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} onClick={() => editTemplate(r)}>
              수정
            </button>
          </div>
        ),
      },
    ],
    [instantiate, editTemplate],
  )

  /* ══ 편집기 화면 ══ */
  if (draft) {
    const isTemplate = draft.mode === 'template'
    const heading = draft.sourceId
      ? `${isTemplate ? '템플릿' : '설문'} 수정`
      : `${isTemplate ? '템플릿 등록' : '설문 생성'}`

    return (
      <>
        <div className="card-sec">
          <div className="card-sec-h">
            <div className="t">
              <span className="ico">
                <Icon name={isTemplate ? 'copy' : 'clipboard-list'} size={15} />
              </span>
              {heading}
              {draft.locked && (
                <span className="mk brandnew" style={{ marginLeft: 6 }}>
                  문항 잠김
                </span>
              )}
            </div>
            <div className="r">
              <button className="btn" onClick={() => setDraft(null)}>
                취소
              </button>
              <button className="btn pri" disabled={!draft.title.trim() || draft.questions.length === 0}>
                <Icon name="save" size={14} /> {isTemplate ? '템플릿 저장' : '저장'}
              </button>
              {!isTemplate && (
                <button className="btn" disabled={!draft.title.trim() || draft.questions.length === 0}>
                  <Icon name="send" size={14} /> 저장 후 배포
                </button>
              )}
            </div>
          </div>

          <div className="card-sec-b">
            {draft.locked && (
              <div className="blocked-note">
                <div className="ic">
                  <Icon name="lock" size={17} />
                </div>
                <div>
                  <div className="tt">이미 응답이 쌓인 설문이라 문항을 고칠 수 없습니다</div>
                  <div className="tx">
                    문항을 바꾸면 <b>바꾸기 전 응답과 후 응답의 의미가 달라져</b> 집계가 깨집니다. 제목·마감일 같은 메타
                    정보만 수정할 수 있고, 문항을 바꾸려면 <b>복제해서 새로 배포</b>하세요.
                  </div>
                </div>
              </div>
            )}

            {/* ── 기본 정보 ── */}
            <div className="frow">
              <label className="req">{isTemplate ? '템플릿명' : '설문명'}</label>
              <input
                className="inp"
                value={draft.title}
                placeholder={isTemplate ? '예: 수능 가채점 표준' : '예: 2026 9월 평가원 가채점'}
                onChange={(e) => patch({ title: e.target.value })}
              />
            </div>

            <div className="frow">
              <label className="req">유형</label>
              <div className="type-picks">
                {KINDS.map((k) => (
                  <button
                    type="button"
                    key={k}
                    className={`type-pick${draft.kind === k ? ' on' : ''}`}
                    onClick={() => patch({ kind: k })}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            {!isTemplate && (
              <>
                <div className="frow">
                  <label className="req">대상</label>
                  <select className="sel" value={draft.target} onChange={(e) => patch({ target: e.target.value })}>
                    {TARGETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="frow">
                  <label>응답 기간</label>
                  <div className="two">
                    <input
                      className="inp"
                      type="datetime-local"
                      value={draft.opensAt.replace(' ', 'T')}
                      onChange={(e) => patch({ opensAt: e.target.value.replace('T', ' ') })}
                    />
                    <input
                      className="inp"
                      type="datetime-local"
                      value={draft.closesAt.replace(' ', 'T')}
                      onChange={(e) => patch({ closesAt: e.target.value.replace('T', ' ') })}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── 문항 빌더 ── */}
            <div
              style={{
                marginTop: 6,
                paddingTop: 16,
                borderTop: '1px solid var(--line-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                flexWrap: 'wrap',
              }}
            >
              <b style={{ fontSize: 13 }}>문항 {draft.questions.length}개</b>
              {!draft.locked && (
                <>
                  <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>추가 →</span>
                  {(Object.keys(QTYPE_META) as QType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="btn"
                      style={{ padding: '5px 10px', fontSize: 11.5 }}
                      onClick={() => addQuestion(t)}
                      title={QTYPE_META[t].desc}
                    >
                      <Icon name={QTYPE_META[t].icon} size={12} /> {QTYPE_META[t].label}
                    </button>
                  ))}
                </>
              )}
            </div>

            {draft.questions.length === 0 && (
              <div className="mock-stub" style={{ marginTop: 14, padding: '34px 20px' }}>
                <div className="t">문항이 없습니다</div>
                <div className="x">위에서 문항 유형을 눌러 추가하거나, 템플릿 탭에서 &lsquo;설문 생성&rsquo;으로 시작하세요.</div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
              {draft.questions.map((qq, i) => {
                const meta = QTYPE_META[qq.type]
                return (
                  <div
                    key={qq.id}
                    style={{
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: '13px 15px',
                      background: draft.locked ? 'var(--bg)' : '#fff',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 7,
                          background: 'var(--mint-wash)',
                          color: 'var(--mint-d)',
                          display: 'grid',
                          placeItems: 'center',
                          fontSize: 11,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>

                      <select
                        className="sel"
                        style={{ width: 156 }}
                        value={qq.type}
                        disabled={draft.locked}
                        onChange={(e) => {
                          const t = e.target.value as QType
                          updateQuestion(qq.id, { type: t, options: newQuestion(t).options })
                        }}
                      >
                        {(Object.keys(QTYPE_META) as QType[]).map((t) => (
                          <option key={t} value={t}>
                            {QTYPE_META[t].label}
                          </option>
                        ))}
                      </select>

                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <input
                          type="checkbox"
                          checked={qq.required}
                          disabled={draft.locked}
                          onChange={(e) => updateQuestion(qq.id, { required: e.target.checked })}
                        />
                        필수
                      </label>

                      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px' }}
                          disabled={draft.locked || i === 0}
                          onClick={() => moveQuestion(qq.id, -1)}
                          aria-label="위로"
                        >
                          <Icon name="chevron-up" size={13} />
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px' }}
                          disabled={draft.locked || i === draft.questions.length - 1}
                          onClick={() => moveQuestion(qq.id, 1)}
                          aria-label="아래로"
                        >
                          <Icon name="chevron-down" size={13} />
                        </button>
                        <button
                          className="btn"
                          style={{ padding: '4px 8px', color: 'var(--red)' }}
                          disabled={draft.locked}
                          onClick={() => removeQuestion(qq.id)}
                          aria-label="삭제"
                        >
                          <Icon name="trash-2" size={13} />
                        </button>
                      </span>
                    </div>

                    <input
                      className="inp"
                      value={qq.title}
                      placeholder="질문을 입력하세요"
                      disabled={draft.locked}
                      onChange={(e) => updateQuestion(qq.id, { title: e.target.value })}
                    />

                    {meta.hasOptions && (
                      <div style={{ marginTop: 9, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {qq.options.map((o, oi) => (
                          <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <Icon name={qq.type === 'multi' ? 'check' : 'circle-dot'} size={12} />
                            <input
                              className="inp"
                              style={{ flex: 1 }}
                              value={o}
                              disabled={draft.locked}
                              onChange={(e) => setOption(qq.id, oi, e.target.value)}
                            />
                            <button
                              className="btn"
                              style={{ padding: '4px 8px' }}
                              disabled={draft.locked || qq.options.length <= 1}
                              onClick={() => removeOption(qq.id, oi)}
                              aria-label="보기 삭제"
                            >
                              <Icon name="x" size={12} />
                            </button>
                          </div>
                        ))}
                        {!draft.locked && (
                          <button
                            className="btn"
                            style={{ alignSelf: 'flex-start', padding: '5px 11px', fontSize: 11.5 }}
                            onClick={() => addOption(qq.id)}
                          >
                            <Icon name="plus" size={12} /> {qq.type === 'subject' ? '과목' : '보기'} 추가
                          </button>
                        )}
                      </div>
                    )}

                    {!meta.hasOptions && (
                      <div style={{ marginTop: 7, fontSize: 11.5, color: 'var(--muted)' }}>{meta.desc}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>
    )
  }

  /* ══ 목록 화면 ══ */

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
              columns={columns}
              rows={SURVEYS}
              rowKey={(r) => r.id}
              masked={false}
              pageSize={10}
              countLabel={
                <>
                  설문 <b>{SURVEYS.length}</b>건 · <code style={{ fontSize: 11 }}>surveys</code> ·{' '}
                  <code style={{ fontSize: 11 }}>survey_questions</code>
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="설문_목록" columns={columns} rows={SURVEYS} masked={false} />
                  <button className="btn pri" onClick={createSurvey}>
                    <Icon name="plus" size={14} /> 설문 생성
                  </button>
                </>
              }
            />
          )}

          {tab === 'template' && (
            <>
              <DataTable
                columns={templateColumns}
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
                  <button className="btn pri" onClick={createTemplate}>
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
