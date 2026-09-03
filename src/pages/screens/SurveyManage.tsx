import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { useAcademy } from '../../auth/AcademyContext'
import {
  QUESTION_TYPE_LABEL,
  SCOPE_LABEL,
  SURVEY_TYPE_LABEL,
  closeSurvey,
  createSurvey as createSurveyApi,
  getSurveyResult,
  listSurveys,
  type QuestionType,
  type SurveyCreate,
  type SurveyResult,
  type SurveySummary,
} from '../../api/surveys'
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
function Content() {
  const [tab, setTab] = useState('list')
  const [draft, setDraft] = useState<Draft | null>(null)

  /* ── 편집기 열기 ── */

  const createSurvey = useCallback(() => setDraft(emptyDraft('survey')), [])
  const createTemplate = useCallback(() => setDraft(emptyDraft('template')), [])


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

  /* ── 실연동 ── */
  const { academyId } = useAcademy()
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [result, setResult] = useState<SurveyResult | null>(null)
  const [resultId, setResultId] = useState<number | null>(null)
  const [apiLoading, setApiLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiNotice, setApiNotice] = useState<string | null>(null)

  const loadSurveys = useCallback(async () => {
    setApiLoading(true)
    try {
      const list = await listSurveys(new Date().getFullYear())
      setSurveys(list)
      setResultId((prev) => (list.some((x) => x.id === prev) ? prev : (list[0]?.id ?? null)))
      setApiError(null)
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : '설문 목록을 불러오지 못했습니다.')
      setSurveys([])
    } finally {
      setApiLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSurveys()
  }, [loadSurveys])

  // 결과 탭에서 고른 설문의 집계
  useEffect(() => {
    if (resultId === null) {
      setResult(null)
      return
    }
    let cancelled = false
    getSurveyResult(resultId)
      .then((r) => !cancelled && setResult(r))
      .catch(() => !cancelled && setResult(null))
    return () => {
      cancelled = true
    }
  }, [resultId])

  /** 화면의 문항 유형 → 서버 유형. 척도·과목별은 서버에 대응 유형이 없어 선택형으로 내려간다 */
  function toServerQuestion(q: Question): { type: QuestionType; options?: string[] } {
    if (q.type === 'multi') return { type: 'MULTI_CHOICE', options: q.options }
    if (q.type === 'single' || q.type === 'scale' || q.type === 'subject')
      return { type: 'SINGLE_CHOICE', options: q.options }
    if (q.type === 'score') return { type: 'NUMBER' }
    return { type: 'TEXT' }
  }

  /** 설문 저장. 문항 순서는 배열 순서가 곧 순서라 번호를 보내지 않는다 */
  async function saveSurvey(d: Draft) {
    if (academyId === null) {
      setApiError('지점을 먼저 선택하세요.')
      return
    }
    const body: SurveyCreate = {
      surveyType: d.kind === '가채점' ? 'GRADE_INPUT' : 'GENERAL',
      scope: 'BRANCH',
      academyId,
      title: d.title.trim(),
      anonymous: true,
      opensAt: `${d.opensAt}T00:00:00Z`,
      closesAt: `${d.closesAt}T14:59:59Z`,
      questions: d.questions.map((q) => ({
        ...toServerQuestion(q),
        title: q.title.trim(),
        required: q.required,
      })),
    }
    try {
      await createSurveyApi(body)
      setApiNotice('설문을 개설했습니다.')
      setDraft(null)
      await loadSurveys()
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : '설문을 개설하지 못했습니다.')
    }
  }

  async function closeOne(surveyId: number) {
    try {
      await closeSurvey(surveyId)
      setApiNotice('설문을 마감했습니다.')
      await loadSurveys()
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : '마감하지 못했습니다.')
    }
  }

  /* ── 컬럼 (편집 핸들러를 물고 있어야 해서 Content 안에서 만든다) ── */

  const columns = useMemo<Column<SurveySummary>[]>(
    () => [
      { key: 'title', header: '설문명', sortable: true, value: (r) => r.title },
      {
        key: 'surveyType',
        header: '유형',
        width: '84px',
        align: 'center',
        sortable: true,
        value: (r) => SURVEY_TYPE_LABEL[r.surveyType] ?? r.surveyType,
        render: (r) => <span className="mk supplement">{SURVEY_TYPE_LABEL[r.surveyType] ?? r.surveyType}</span>,
      },
      { key: 'questionCount', header: '문항', width: '68px', align: 'right', value: (r) => r.questionCount },
      {
        key: 'scope',
        header: '대상',
        width: '110px',
        value: (r) => SCOPE_LABEL[r.scope] ?? r.scope,
      },
      {
        key: 'anonymous',
        header: '익명',
        width: '68px',
        align: 'center',
        value: (r) => (r.anonymous ? '익명' : '기명'),
        render: (r) => (
          <span style={{ color: r.anonymous ? 'var(--violet)' : 'var(--muted)', fontWeight: 700, fontSize: 11.5 }}>
            {r.anonymous ? '익명' : '기명'}
          </span>
        ),
      },
      {
        key: 'period',
        header: '기간',
        width: '180px',
        sortable: true,
        value: (r) => r.opensAt,
        render: (r) => `${r.opensAt.slice(0, 10)} ~ ${r.closesAt.slice(0, 10)}`,
      },
      {
        key: 'status',
        header: '상태',
        width: '92px',
        align: 'center',
        // 서버가 상태 필드를 주지 않아 기간으로 판단한다
        value: (r) => (new Date(r.closesAt) < new Date() ? '마감' : '진행중'),
        render: (r) => {
          const closed = new Date(r.closesAt) < new Date()
          return <span className={`mk ${closed ? 'brandnew' : 'verified'}`}>{closed ? '마감' : '진행중'}</span>
        },
      },
      {
        key: 'act',
        header: '',
        width: '150px',
        align: 'center',
        value: () => '',
        render: (r) => (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              onClick={() => {
                setResultId(r.id)
                setTab('result')
              }}
            >
              결과
            </button>
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={new Date(r.closesAt) < new Date()}
              onClick={() => void closeOne(r.id)}
              title="기간이 남아도 즉시 마감합니다"
            >
              마감
            </button>
          </div>
        ),
      },
    ],
    [],
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
              <button
                className="btn pri"
                disabled={!draft.title.trim() || draft.questions.length === 0 || isTemplate}
                title={isTemplate ? '템플릿 저장 API가 아직 없습니다' : undefined}
                onClick={() => void saveSurvey(draft)}
              >
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
          {apiError && (
            <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
              {apiError}
            </div>
          )}
          {apiNotice && (
            <div className="note-box" role="status">
              <div className="ic">
                <Icon name="check" size={17} />
              </div>
              <div>
                <div className="tt">{apiNotice}</div>
              </div>
            </div>
          )}
          {tab === 'list' && (
            <DataTable
              columns={columns}
              rows={surveys}
              rowKey={(r) => String(r.id)}
              masked={false}
              loading={apiLoading}
              pageSize={10}
              emptyText="등록된 설문이 없습니다."
              countLabel={
                <>
                  설문 <b>{surveys.length}</b>건
                </>
              }
              toolbar={
                <>
                  <ExcelButton filename="설문_목록" columns={columns} rows={surveys} masked={false} />
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
                    템플릿으로 설문을 만들면 <b>그 시점의 문항이 그대로 복사</b>됩니다.
                    그래서 나중에 템플릿을 고쳐도 <b>이미 배포한 설문은 바뀌지 않습니다</b> —
                    응답을 받는 도중에 문항이 달라지면 결과를 신뢰할 수 없기 때문입니다.
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
                  {result ? `${result.survey.title} — 응답 ${result.responseCount}건` : '설문을 선택하세요'}
                </div>
                <div className="r">
                  <select
                    className="sel"
                    style={{ width: 220 }}
                    value={resultId ?? ''}
                    onChange={(e) => setResultId(Number(e.target.value))}
                  >
                    {surveys.length === 0 && <option value="">설문 없음</option>}
                    {surveys.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                  <button className="btn" style={{ padding: '5px 11px', fontSize: 11.5 }} disabled title="원시 응답 다운로드 API가 없습니다">
                    <Icon name="file-spreadsheet" size={12} /> 원시 응답 다운로드
                  </button>
                </div>
              </div>
              <div className="card-sec-b">
                {!result && <div className="dt-empty">결과를 불러올 설문이 없습니다.</div>}
                {result?.responseCount === 0 && (
                  <div className="dt-empty">아직 응답이 없습니다. 문항 구성만 확인할 수 있습니다.</div>
                )}
                {result?.questions.map((q) => (
                  <div key={q.questionId} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <span className="mk supplement">{QUESTION_TYPE_LABEL[q.type] ?? q.type}</span>
                      <b style={{ fontSize: 13 }}>{q.title}</b>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)', marginLeft: 'auto' }}>
                        응답 {q.answerCount}건
                      </span>
                    </div>

                    {/* 선택형 — 보기별 분포 */}
                    {q.options && q.options.length > 0 && (
                      <div>
                        {q.options.map((o) => {
                          const pct = q.answerCount > 0 ? Math.round((o.count / q.answerCount) * 100) : 0
                          return (
                            <div
                              key={o.label}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '120px 1fr 96px',
                                gap: 12,
                                alignItems: 'center',
                                marginBottom: 6,
                              }}
                            >
                              <span style={{ fontSize: 12 }}>{o.label}</span>
                              <div style={{ height: 12, background: 'var(--line-2)', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--mint)' }} />
                              </div>
                              <span style={{ fontSize: 11.5, color: 'var(--muted)', textAlign: 'right' }}>
                                {o.count}건 · {pct}%
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* 숫자형 — 평균·최소·최대 */}
                    {q.type === 'NUMBER' && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        평균 <b style={{ color: 'var(--ink)' }}>{q.average ?? '-'}</b> · 최소 {q.min ?? '-'} · 최대{' '}
                        {q.max ?? '-'}
                      </div>
                    )}

                    {/* 주관식 — 서버가 원문을 주면 보여준다 */}
                    {q.type === 'TEXT' && (
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {q.texts && q.texts.length > 0
                          ? `${q.texts.length}건의 주관식 응답`
                          : '주관식 응답은 집계에 포함되지 않습니다.'}
                      </div>
                    )}
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
