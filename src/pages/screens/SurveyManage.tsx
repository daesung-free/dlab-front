import { useCallback, useEffect, useMemo, useState } from 'react'
import { DataTable, ExcelButton, Modal, type Column } from '../../components/common'
import { Tabs } from '../../components/Tabs'
import { Icon } from '../../components/Icon'
import { ApiError } from '../../api/client'
import { listClasses, type ClassGroup } from '../../api/classes'
import { useAcademy } from '../../auth/AcademyContext'
import { useAuth } from '../../auth/AuthContext'
import {
  QUESTION_TYPE_LABEL,
  SCOPE_LABEL,
  SURVEY_RUN_STATE_LABEL,
  SURVEY_TYPE_LABEL,
  closeSurvey,
  deleteSurvey,
  updateSurvey,
  exportSurveyResponses,
  createSurvey as createSurveyApi,
  getSurveyResult,
  listSurveys,
  type QuestionType,
  getSurveyQuestions,
  replaceSurveyQuestions,
  duplicateSurvey,
  type SurveyCreate,
  type SurveyResult,
  type SurveySummary,
  PARTICIPANT_STATE_LABEL,
  assignSurveyTargets,
  listSurveyParticipants,
  type ParticipantState,
  type SurveyParticipant,
} from '../../api/surveys'
import { GRADE_LABEL, searchStudents, type Student } from '../../api/students'
import { createScreenSignal } from './screenSignal'
import type { Mockup } from './types'
import '../../styles/forms.css'
import './survey-manage.css'

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

/** UTC instant → 한국 시각 기준 `yyyy-MM-dd`. 문자열을 자르면 UTC 날짜가 나온다 */
function localDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * `datetime-local` 값(`2026-09-10T09:00`) → 서버가 받는 instant.
 *
 * ★ 값이 비면 그대로 undefined 를 돌려준다 — 빈 문자열에 접미사를 붙이면
 *   `T00:00:00Z` 같은 값이 만들어져 400 이 난다.
 */
function toInstant(v: string): string | undefined {
  if (!v) return undefined
  /* ★ `Z` 를 문자열로 붙이면 안 된다. `2026-09-10T09:00` 은 **한국 시간** 인데
       `…09:00:00Z` 로 보내면 서버는 UTC 09:00 으로 받아 화면에 18:00 으로 돌아온다 —
       정확히 9시간이 밀린다. 실제로 그렇게 나갔다(2026-09-10).
       `new Date('2026-09-10T09:00')` 은 로컬로 해석하므로 toISOString 이 옳게 바꿔준다. */
  const d = new Date(`${v}:00`)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

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

/* ★ 예전에는 여기에 `['전체 재원생','자연계열','인문계열','급식 신청자','1반'…'4반']` 이
     **박혀 있었다.** 고르든 말든 전부 지점 전체(BRANCH)로 나갔고, 실제 반 이름과도 달랐다
     (대구에는 '테스트_N수1반' 하나뿐인데 1~4반이 떴다. 2026-09-27 실테스트).
     지금은 지점 전체 + **그 지점의 진짜 반**을 읽어서 보여주고, 선택한 값이 실제로 나간다.
   ★ 계열·급식 신청자는 서버에 그 범위가 없다(scope 는 ALL·BRANCH·CLASS 셋뿐) —
     선택할 수 없게 두되 지우지는 않는다. 생기면 여기에 붙인다. */
const BRANCH_TARGET = '전체 재원생'
const UNSUPPORTED_TARGETS = ['자연계열', '인문계열', '급식 신청자']

function q(id: string, type: QType, title: string, options: string[] = [], required = true): Question {
  return { id, type, title, required, options }
}

const GRADING_QUESTIONS: Question[] = [
  q('g1', 'subject', '과목별 원점수', SUBJECT_OPTIONS),
  q('g2', 'single', '탐구1 응시 과목', ['물리Ⅰ', '물리Ⅱ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ']),
  q('g3', 'single', '탐구2 응시 과목', ['물리Ⅰ', '화학Ⅰ', '생명과학Ⅰ', '지구과학Ⅰ', '지구과학Ⅱ']),
  q('g4', 'single', '체감 난이도', ['매우 쉬움', '쉬움', '보통', '어려움', '매우 어려움']),
  q('g5', 'text', '가장 어려웠던 단원·유형', [], false),
]

/* ★★ **예시 설문 5건을 지웠다**(2026-10-26). 상단 카드가 이걸 세고 있었는데, 아래 표에는
 *   서버 설문이 떠 있어 **두 숫자가 서로 다른 말을** 했다. 목록은 `surveys` 상태가 쥔다.
 *   ★ 문항 예시(GRADING_QUESTIONS)는 남긴다 — 「템플릿에서 생성」이 실제로 쓴다. */

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

/** 수정 모달의 문항 한 줄. 서버 `SurveyQuestionCreate` 와 같은 모양에 화면용 키만 더했다 */
interface EditQuestion {
  key: string
  type: QuestionType
  title: string
  required: boolean
  minValue: string
  maxValue: string
  options: string[]
  /* ★ **화면에서 고치지 않지만 그대로 들고 다닌다.** 교체는 보낸 것이 전부라, 안 실어
     보내면 **조건부 노출과 합산이 조용히 풀린다** — 가채점의 「응시/미응시」가 이걸
     쓴다. 풀리면 **숨어야 할 문항이 전부 보인다**(2026-10-16 백엔드 확인). */
  showIfQuestionIndex: number | null
  showIfOptionIndex: number | null
  sumOfIndexes: number[]
}

const EDIT_QTYPE: { type: QuestionType; label: string }[] = [
  { type: 'SINGLE_CHOICE', label: '객관식(하나)' },
  { type: 'MULTI_CHOICE', label: '객관식(여러 개)' },
  { type: 'TEXT', label: '주관식' },
  { type: 'NUMBER', label: '숫자' },
]

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
/* 헤더 버튼 → 본문. 「설문 생성」은 본문 편집기를 열고, 「템플릿에서 생성」은 템플릿 탭으로 보낸다 */
const newSurveySignal = createScreenSignal()
const fromTemplateSignal = createScreenSignal()

function Content() {
  const [tab, setTab] = useState('list')

  /* 헤더 액션은 본문과 따로 렌더돼 상태를 공유할 수 없다(screenSignal.ts 주석).
     헤더에서 누른 것을 본문이 받아 처리한다 */
  const newSurveyVer = newSurveySignal.useVersion()
  const fromTemplateVer = fromTemplateSignal.useVersion()
  const [draft, setDraft] = useState<Draft | null>(null)

  /* ── 편집기 열기 ── */

  const createSurvey = useCallback(() => setDraft(emptyDraft('survey')), [])
  const createTemplate = useCallback(() => setDraft(emptyDraft('template')), [])

  /* 첫 렌더의 0 은 건너뛴다 — 화면에 들어오자마자 편집기가 열리면 안 된다 */
  useEffect(() => {
    if (newSurveyVer > 0) createSurvey()
  }, [newSurveyVer, createSurvey])
  useEffect(() => {
    if (fromTemplateVer > 0) setTab('template')
  }, [fromTemplateVer])


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

  /** 'yyyy-MM-ddTHH:mm:ss' → 'yyyy-MM-dd HH:mm'. 없으면 '-' (아직 그 단계가 아니다) */
function stamp(v: string | null | undefined): string {
  return v ? v.slice(0, 16).replace('T', ' ') : '-'
}

/* ── 실연동 ── */
  const { academyId } = useAcademy()
  const [surveys, setSurveys] = useState<SurveySummary[]>([])
  const [result, setResult] = useState<SurveyResult | null>(null)
  const [resultId, setResultId] = useState<number | null>(null)
  const [apiLoading, setApiLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  /* 설문 대상 선택지. 반 이름을 화면에 박아 두면 실제 반과 어긋난다 */
  const [classes, setClasses] = useState<ClassGroup[]>([])
  /* 설문 수정(제목·기간·**문항**).
   *
   * ★ **문항은 제출이 들어오기 전까지 바꿀 수 있다**(2026-10-16 확인). 전에는 화면이
   *   「문항은 못 바꾼다」고 **틀리게** 안내하고 있었다 — 디랩이 그걸 보고 「수정이 안
   *   되냐」고 물어 왔다. 서버는 **제출 0건**일 때만 거절한다.
   * ★ `PUT .../questions` 는 **교체**다. 보낸 목록이 그대로 새 문항이 된다.
   * ⚠️ **대상(scope)은 서버에도 수정이 없다.** 전체→1반으로 좁히려면 복제해서 새로 만든다. */
  const [editing, setEditing] = useState<{
    row: SurveySummary
    title: string
    opensAt: string
    closesAt: string
    /** `null` 이면 문항을 아직 안 건드린 것 — 그때는 **문항을 안 보낸다** */
    questions: EditQuestion[] | null
    loadingQ: boolean
    /** ★ 모달 안에 띄운다. 밖에 띄우면 **모달에 가려 안 보여** 「눌러도 아무 일이 없다」가 된다 */
    qErr: string | null
  } | null>(null)
  /** 제출이 있어 문항을 못 고칠 때 — 복제로 돌린다 */
  const [dup, setDup] = useState<{ row: SurveySummary; title: string; busy: boolean; err: string | null } | null>(null)
  const [removing, setRemoving] = useState<SurveySummary | null>(null)
  const [rowBusy, setRowBusy] = useState(false)
  /* 담임은 설문을 고치거나 지울 수 없다 — 메뉴에는 들어 있지만 쓰기는 매트릭스 밖이다
     (2026-09-28 테스트 회신). 결과 보기·마감은 담당 업무라 남긴다 */
  const { teacherOnly } = useAuth()

  useEffect(() => {
    if (academyId === null) {
      setClasses([])
      return
    }
    let alive = true
    listClasses(new Date().getFullYear(), academyId)
      .then((v) => alive && setClasses(v.filter((c) => c.academyId === academyId)))
      .catch(() => alive && setClasses([]))
    return () => {
      alive = false
    }
  }, [academyId])
  const [apiNotice, setApiNotice] = useState<string | null>(null)

  /* ── 대상자 ──
   * ★ **장학 동의서처럼 「누가 안 냈는지」를 봐야 하는 설문**에만 뜻이 있다. 범위로 돌리는
   *   일반 설문은 대상자를 안 만들어 **제출자만** 나온다 — 목록 길이의 뜻이 다르다.
   * ⚠️ **제출은 `submittedAt != null` 로 센다.** 행 수로 세면 미제출까지 포함된다. */
  const [targetId, setTargetId] = useState<number | null>(null)
  const [parts, setParts] = useState<SurveyParticipant[] | null>(null)
  const [partsErr, setPartsErr] = useState<string | null>(null)
  /* ★ 요구사항 1-5 는 **「지점 → 반 → 학생 개별」** 3단계다. 지점은 상단에서 고르고
     학생은 체크로 고르는데, **가운데(반)가 빠져 있었다** — 그 지점 학생 200명을 통째로
     띄우면 **선택할 수가 없다**(반이 섞여 있어 누가 누군지 모른다) */
  const [picking, setPicking] = useState<{
    rows: Student[] | null
    selected: string[]
    classFilter: string
    busy: boolean
    err: string | null
  } | null>(null)

  const loadParts = useCallback(async (id: number | null) => {
    if (id === null) {
      setParts(null)
      return
    }
    setPartsErr(null)
    try {
      setParts(await listSurveyParticipants(id))
    } catch (e) {
      setPartsErr(e instanceof ApiError ? e.message : '대상자를 불러오지 못했습니다.')
      setParts([])
    }
  }, [])

  useEffect(() => {
    void loadParts(targetId)
  }, [targetId, loadParts])

  const partColumns: Column<SurveyParticipant>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '120px', value: (r) => r.studentNo ?? '-' },
      { key: 'studentName', header: '이름', width: '110px', mask: 'name', value: (r) => r.studentName },
      {
        key: 'state',
        header: '상태',
        width: '90px',
        align: 'center',
        value: (r) => (r.state ? PARTICIPANT_STATE_LABEL[r.state] : '-'),
      },
      { key: 'viewedAt', header: '열람', width: '150px', value: (r) => stamp(r.viewedAt) },
      { key: 'agreedAt', header: '동의', width: '150px', value: (r) => stamp(r.agreedAt) },
      /* ★ 제출 여부가 이 표의 핵심이다 — 「안 낸 사람」을 찾으러 오는 화면이다 */
      { key: 'submittedAt', header: '제출', width: '150px', value: (r) => stamp(r.submittedAt) },
    ],
    [],
  )

  /** 모달 안 반 목록 — 불러온 학생에서 뽑는다(반이 없는 학생은 「미배정」으로 묶는다) */
  const pickClassNames = useMemo(
    () => [...new Set((picking?.rows ?? []).map((r) => r.className ?? '미배정'))].sort(),
    [picking?.rows],
  )
  const pickRows = useMemo(() => {
    const all = picking?.rows ?? []
    const f = picking?.classFilter ?? ''
    return f === '' ? all : all.filter((r) => (r.className ?? '미배정') === f)
  }, [picking?.rows, picking?.classFilter])

  const pickColumns: Column<Student>[] = useMemo(
    () => [
      { key: 'studentNo', header: '학번', width: '120px', value: (r) => r.studentNo ?? '-' },
      { key: 'name', header: '이름', width: '110px', mask: 'name', value: (r) => r.name },
      {
        /* ★ **코드가 그대로 보이고 있었다**(`HIGH3`·`N_SU`). 사람이 읽는 말로 바꾼다 —
           학년은 `GRADE_LABEL` 이 정본이다(CLAUDE.md 1-1) */
        key: 'grade',
        header: '학년',
        width: '80px',
        align: 'center',
        value: (r) => (r.grade ? (GRADE_LABEL[r.grade] ?? r.grade) : '-'),
      },
      { key: 'className', header: '반', width: '110px', value: (r) => r.className ?? '-' },
    ],
    [],
  )

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
      setApiError('지점을 먼저 선택해 주세요.')
      return
    }
    const opensAt = toInstant(d.opensAt)
    const closesAt = toInstant(d.closesAt)
    if (!opensAt || !closesAt) {
      setApiError('응답 기간의 시작·마감을 모두 입력해 주세요.')
      return
    }

    /* 대상이 숫자면 반 id 다 — 그 반에게만 간다. 아니면 지점 전체 */
    const classId = /^\d+$/.test(d.target) ? Number(d.target) : null
    const body: SurveyCreate = {
      surveyType: d.kind === '가채점' ? 'GRADE_INPUT' : 'GENERAL',
      scope: classId === null ? 'BRANCH' : 'CLASS',
      academyId,
      ...(classId === null ? {} : { classId }),
      title: d.title.trim(),
      anonymous: true,
      /* ★ 입력칸은 datetime-local 이라 값이 이미 `2026-09-10T09:00` 이다.
           예전에는 T 를 공백으로 바꿔 넣어두고 여기서 다시 `T00:00:00Z` 를 붙여
           `2026-09-10 09:00T00:00:00Z` 라는 깨진 값을 보내고 있었다 — 서버는 400 이고
           화면에는 아무 표시가 없어서 **저장이 안 된 사실조차 알 수 없었다.** */
      opensAt,
      closesAt,
      questions: d.questions.map((q) => ({
        ...toServerQuestion(q),
        title: q.title.trim(),
        required: q.required,
      })),
    }
    try {
      await createSurveyApi(body)
      /* ★ **따로 배포하는 단계가 없다**는 것을 여기서 말한다 — 안 쓰면 담당자가
           「이제 어디서 내보내지」를 찾는다. 알림은 안 나간다는 것도 같이 적는다 */
      setApiNotice('설문을 열었습니다. 응답 기간이 되면 학생 앱에 바로 보입니다 — 따로 보내는 단계는 없습니다.')
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

  /* ★ 문항 편집을 **눌렀을 때만** 불러온다. 수정 모달을 열 때마다 부르면 제목만 고치는
     사람에게도 호출이 하나 더 나간다 */
  async function loadQuestionsForEdit() {
    if (editing === null) return
    setEditing({ ...editing, loadingQ: true, qErr: null })
    try {
      /* ★ **집계(`/results`)가 아니라 문항 정의 경로로 읽는다.** 집계에는 필수 여부·숫자
         범위·조건부·합산이 없어, 그걸로 읽어 교체하면 **다섯 가지가 조용히 풀린다.** */
      const qs = await getSurveyQuestions(editing.row.id)
      setEditing((v) =>
        v && v.row.id === editing.row.id
          ? {
              ...v,
              loadingQ: false,
              questions: qs.map((q, i) => ({
                key: `q${q.questionId}-${i}`,
                type: q.type,
                title: q.title,
                required: q.required,
                minValue: q.minValue === null ? '' : String(q.minValue),
                maxValue: q.maxValue === null ? '' : String(q.maxValue),
                options: q.options ?? [],
                showIfQuestionIndex: q.showIfQuestionIndex,
                showIfOptionIndex: q.showIfOptionIndex,
                sumOfIndexes: q.sumOfIndexes ?? [],
              })),
            }
          : v,
      )
    } catch (err) {
      setEditing((v) =>
        v
          ? {
              ...v,
              loadingQ: false,
              /* ★ **서버가 아직 이 경로를 모르면**(화면이 먼저 배포된 경우) 404·405 가 온다.
                 「Request method 'GET' is not supported」를 그대로 보여주면 담당자가 무엇을
                 잘못했나 찾는다 — 우리 사정이다(CLAUDE.md 1-1) */
              qErr:
                err instanceof ApiError
                  ? err.status === 404 || err.status === 405
                    ? '문항 수정은 아직 준비 중입니다.'
                    : err.message
                  : '문항을 불러오지 못했습니다.',
            }
          : v,
      )
    }
  }

  /** 다른 문항이 답을 쓰고 있는 문항 번호들 — 지우면 조건·합산이 깨진다 */
  const referenced = useMemo(() => {
    const out = new Set<number>()
    for (const q of editing?.questions ?? []) {
      if (q.showIfQuestionIndex !== null) out.add(q.showIfQuestionIndex)
      for (const n of q.sumOfIndexes) out.add(n)
    }
    return out
  }, [editing?.questions])

  function patchQ(key: string, p: Partial<EditQuestion>) {
    setEditing((v) =>
      v && v.questions ? { ...v, questions: v.questions.map((q) => (q.key === key ? { ...q, ...p } : q)) } : v,
    )
  }

  async function saveEdit() {
    if (editing === null) return
    const opensAt = toInstant(editing.opensAt)
    const closesAt = toInstant(editing.closesAt)
    if (!opensAt || !closesAt) {
      setApiError('응답 기간의 시작·마감을 모두 입력해 주세요.')
      return
    }
    setRowBusy(true)
    try {
      await updateSurvey(editing.row.id, { title: editing.title.trim(), opensAt, closesAt })
      /* ★ 문항은 **건드렸을 때만** 보낸다. 안 건드렸는데 보내면 교체라 **같은 내용으로
         덮어쓰면서 설정이 풀린다.**
         ★ 제목 저장이 **이미 끝난 뒤**다 — 문항에서 실패해도 제목은 들어갔으므로
         「무엇이 됐고 무엇이 안 됐는지」를 그대로 말한다(CLAUDE.md 4장). */
      if (editing.questions !== null) {
        try {
          await replaceSurveyQuestions(
            editing.row.id,
            editing.questions.map((q) => ({
              type: q.type,
              title: q.title.trim(),
              required: q.required,
              /* 고치지 않아도 그대로 돌려보낸다 — 빠뜨리면 조건부·합산이 풀린다 */
              showIfQuestionIndex: q.showIfQuestionIndex,
              showIfOptionIndex: q.showIfOptionIndex,
              sumOfIndexes: q.sumOfIndexes,
              ...(q.type === 'NUMBER'
                ? {
                    minValue: q.minValue === '' ? undefined : Number(q.minValue),
                    maxValue: q.maxValue === '' ? undefined : Number(q.maxValue),
                  }
                : {}),
              ...(q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE'
                ? { options: q.options.filter((o) => o.trim() !== '') }
                : {}),
            })),
          )
        } catch (qErr) {
          setApiError(
            `제목과 기간은 저장했습니다. 문항은 바뀌지 않았습니다 — ${
              qErr instanceof ApiError ? qErr.message : '문항을 바꾸지 못했습니다.'
            }`,
          )
          setRowBusy(false)
          await loadSurveys()
          return
        }
      }
      setEditing(null)
      setApiNotice(editing.questions !== null ? '설문과 문항을 수정했습니다.' : '설문을 수정했습니다.')
      await loadSurveys()
    } catch (err) {
      setApiError(err instanceof ApiError ? err.message : '수정하지 못했습니다.')
    } finally {
      setRowBusy(false)
    }
  }

  /** 복제 — 제출이 있어 문항을 못 고칠 때 이쪽으로 돌린다 */
  async function runDuplicate() {
    if (dup === null || dup.title.trim() === '') return
    setDup({ ...dup, busy: true, err: null })
    try {
      await duplicateSurvey(dup.row.id, dup.title.trim())
      setDup(null)
      setEditing(null)
      /* ★ 대상자는 안 따라온다 — 그걸 안 알리면 **아무에게도 안 간 설문**을 배포한 줄 안다 */
      setApiNotice('복제했습니다. 대상자는 복제되지 않으니 다시 지정합니다.')
      await loadSurveys()
    } catch (err) {
      setDup((v) =>
        v ? { ...v, busy: false, err: err instanceof ApiError ? err.message : '복제하지 못했습니다.' } : v,
      )
    }
  }

  async function removeOne() {
    if (removing === null) return
    setRowBusy(true)
    try {
      await deleteSurvey(removing.id)
      const gone = removing.title
      setRemoving(null)
      setApiNotice(`${gone} 설문을 지웠습니다.`)
      await loadSurveys()
    } catch (err) {
      // 응답이 있으면 서버가 막는다 — 그 문구를 그대로 띄우고 '마감' 을 권한다
      setApiError(err instanceof ApiError ? err.message : '지우지 못했습니다.')
      setRemoving(null)
    } finally {
      setRowBusy(false)
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
        /* ★ 서버가 주는 것은 UTC instant 다. 문자열을 그대로 자르면 **UTC 날짜**가 보인다 —
             한국 시각 00:00~08:59 에 열리거나 닫히는 설문이 하루 전 날짜로 나온다. */
        render: (r) => `${localDay(r.opensAt)} ~ ${localDay(r.closesAt)}`,
      },
      {
        key: 'status',
        header: '상태',
        width: '92px',
        align: 'center',
        // 서버가 판정한다 — 브라우저 시계로 기간을 비교하지 않는다
        value: (r) => SURVEY_RUN_STATE_LABEL[r.status],
        render: (r) => (
          <span className={`mk ${r.status === 'OPEN' ? 'verified' : 'brandnew'}`}>
            {SURVEY_RUN_STATE_LABEL[r.status]}
          </span>
        ),
      },
      {
        key: 'act',
        header: '',
        width: '196px',
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
            {!teacherOnly && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5 }}
                onClick={() =>
                  setEditing({
                    row: r,
                    title: r.title,
                    opensAt: (r.opensAt ?? '').slice(0, 16),
                    closesAt: (r.closesAt ?? '').slice(0, 16),
                    questions: null,
                    loadingQ: false,
                    qErr: null,
                  })
                }
                title="제목·기간을 수정합니다. 문항은 제출이 들어오기 전까지 바꿀 수 있습니다"
              >
                수정
              </button>
            )}
            <button
              className="btn"
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              disabled={r.status === 'CLOSED'}
              onClick={() => void closeOne(r.id)}
              title="기간이 남아도 즉시 마감합니다"
            >
              마감
            </button>
            {!teacherOnly && (
              <button
                className="btn"
                style={{ padding: '4px 9px', fontSize: 11.5, color: 'var(--red)' }}
                onClick={() => setRemoving(r)}
                title="응답이 있으면 지워지지 않습니다"
              >
                삭제
              </button>
            )}
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
        width: '196px',
        align: 'center',
        value: () => '',
        render: (r) => (
          /* ★ 목록 버튼만 막고 **템플릿 탭을 빠뜨렸었다**(2026-09-28) — 여기로 들어가면
                담임도 설문을 만들고 문항을 수정할 수 있었다. 같은 판단을 건다 */
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {teacherOnly ? (
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>보기 전용</span>
            ) : (
              <>
                <button className="btn pri" style={{ padding: '4px 9px', fontSize: 11.5 }} onClick={() => instantiate(r)}>
                  설문 생성
                </button>
                <button className="btn" style={{ padding: '4px 9px', fontSize: 11.5 }} onClick={() => editTemplate(r)}>
                  수정
                </button>
              </>
            )}
          </div>
        ),
      },
    ],
    [instantiate, editTemplate, teacherOnly],
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
                title={isTemplate ? '템플릿 저장은 아직 준비 중입니다' : undefined}
                onClick={() => void saveSurvey(draft)}
              >
                <Icon name="save" size={14} /> {isTemplate ? '템플릿 저장' : '저장하고 열기'}
              </button>
              {/* ★★ 「저장 후 배포」를 뺐다(2026-10-26). **배포라는 단계가 서버에 없다** —
                     저장하면 설문 상태가 응답 기간으로 정해지고(예정 → 진행중 → 마감),
                     학생은 앱 목록에서 바로 본다. 버튼을 두면 **저장만 하고 배포를 안 했다고
                     오해**해 담당자가 다음 단계를 찾게 된다.
                     ★ 알림을 보내는 것은 또 다른 일이다(`/surveys/{id}/remind`). 그쪽 문안
                       2종(SURVEY_ASSIGNED·SURVEY_REMINDER)이 아직 심사 전이라 못 쓴다. */}
            </div>
          </div>

          <div className="card-sec-b">
            {/* ★ 저장 실패를 여기서도 보여준다. 목록 쪽 배너는 이 폼이 열려 있으면
                   화면 밖이라, 예전에는 400 이 나도 폼이 그대로 남아 **사용자가 저장이
                   안 된 사실조차 알 수 없었다.** */}
            {apiError && (
              <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                {apiError}
              </div>
            )}
            {draft.locked && (
              <div className="blocked-note">
                <div className="ic">
                  <Icon name="lock" size={17} />
                </div>
                <div>
                  <div className="tt">응답이 등록된 설문은 문항을 수정할 수 없습니다</div>
                  <div className="tx">
                    문항을 수정하면 <b>수정 전후 응답의 의미가 달라져</b> 집계가 어긋납니다. 제목·마감일만 수정할 수
                    있으며, 문항을 수정하려면 <b>설문을 복제하여 새로 배포</b>합니다.
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
                  <div>
                    <select className="sel" value={draft.target} onChange={(e) => patch({ target: e.target.value })}>
                      <option value={BRANCH_TARGET}>{BRANCH_TARGET}</option>
                      {classes.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                      {UNSUPPORTED_TARGETS.map((t) => (
                        <option key={t} value={t} disabled>
                          {t} (준비 중)
                        </option>
                      ))}
                    </select>
                    <div className="hint">
                      {classes.length === 0
                        ? '이 지점에 등록된 반이 없습니다. 반을 만들면 반별로 보낼 수 있습니다.'
                        : '반을 고르면 그 반 학생에게만 갑니다.'}
                    </div>
                  </div>
                </div>

                <div className="frow">
                  <label>응답 기간</label>
                  <div className="two">
                    <input
                      className="inp"
                      type="datetime-local"
                      value={draft.opensAt.replace(' ', 'T')}
                      onChange={(e) => patch({ opensAt: e.target.value })}
                    />
                    <input
                      className="inp"
                      type="datetime-local"
                      value={draft.closesAt.replace(' ', 'T')}
                      onChange={(e) => patch({ closesAt: e.target.value })}
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
                <div className="x">위에서 문항 유형을 눌러 추가하거나, 템플릿 탭에서 &lsquo;설문 생성&rsquo;으로 시작합니다.</div>
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
                      placeholder="질문 입력"
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
      {editing && (
        <Modal
          /* ★ 문항 편집기가 들어가는 모달이라 **좁으면 가로 스크롤이 생긴다** */
          wide
          title="설문 수정"
          sub="문항은 응답이 등록되기 전까지 수정할 수 있습니다. 대상은 설문을 복제하여 새로 생성합니다."
          confirmLabel="저장"
          busy={rowBusy}
          confirmDisabled={editing.title.trim() === ''}
          error={editing.qErr}
          onConfirm={() => void saveEdit()}
          onClose={() => setEditing(null)}
        >
          <div className="frow">
            <label className="req">설문명</label>
            <input
              className="inp"
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
          </div>
          <div className="frow">
            <label className="req">응답 기간</label>
            <div className="two">
              <input
                className="inp"
                type="datetime-local"
                value={editing.opensAt}
                onChange={(e) => setEditing({ ...editing, opensAt: e.target.value })}
              />
              <input
                className="inp"
                type="datetime-local"
                value={editing.closesAt}
                onChange={(e) => setEditing({ ...editing, closesAt: e.target.value })}
              />
            </div>
          </div>

          {/* ── 문항 ─────────────────────────────────────────
              ★ 제출이 들어오기 전까지만 바꿀 수 있다. 제출이 있으면 서버가 400 과 함께
                「몇 명이 냈는지 + 복제해서 새로 만들라」까지 돌려주므로 그 문구를 그대로
                띄우고 옆에 복제 버튼을 붙인다 */}
          <div className="frow">
            <label>문항</label>
            <div>
              {editing.questions === null ? (
                <button
                  type="button"
                  className="btn"
                  disabled={editing.loadingQ}
                  onClick={() => void loadQuestionsForEdit()}
                >
                  <Icon name="list-ordered" size={13} /> {editing.loadingQ ? '불러오는 중…' : '문항 수정'}
                </button>
              ) : (
                <>
                  <div className="note-box">
                    <div>
                      응답이 등록된 설문은 문항을 수정할 수 없습니다. 수정이 필요한 경우 설문을 복제하여
                      새로 생성합니다.
                    </div>
                  </div>

                  {editing.questions.map((q, i) => (
                    <div key={q.key} className="q-edit">
                      <div className="q-edit-h">
                        <b>{i + 1}</b>
                        <select
                          className="sel"
                          value={q.type}
                          onChange={(e) => patchQ(q.key, { type: e.target.value as QuestionType })}
                        >
                          {EDIT_QTYPE.map((t) => (
                            <option key={t.type} value={t.type}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="q-req">
                          <input
                            type="checkbox"
                            checked={q.required}
                            onChange={(e) => patchQ(q.key, { required: e.target.checked })}
                          />
                          필수
                        </label>
                        <button
                          type="button"
                          className="btn"
                          style={{ padding: '4px 8px', color: 'var(--red)' }}
                          /* ★ **다른 문항이 이 번호를 가리키면 못 지운다.** 지우면 조건이
                             깨져 숨어야 할 문항이 늘 보이거나 합산이 틀린다. 번호는 순서라
                             앞 문항을 지우면 뒤 번호가 통째로 밀리는 문제도 있다 */
                          disabled={referenced.has(i + 1)}
                          title={
                            referenced.has(i + 1)
                              ? '다른 문항이 이 문항의 답을 쓰고 있어 지울 수 없습니다'
                              : undefined
                          }
                          onClick={() =>
                            setEditing({
                              ...editing,
                              questions: editing.questions!.filter((x) => x.key !== q.key),
                            })
                          }
                          aria-label="문항 삭제"
                        >
                          <Icon name="trash-2" size={13} />
                        </button>
                      </div>
                      <input
                        className="inp"
                        value={q.title}
                        placeholder="질문 입력"
                        onChange={(e) => patchQ(q.key, { title: e.target.value })}
                      />
                      {/* ★ 화면에서 수정할 수는 없지만 **걸려 있다는 것은 보여준다.**
                          안 보이면 기준 문항을 지우고도 모른다 — 그러면 조건이 깨진다 */}
                      {q.showIfQuestionIndex !== null && (
                        <div className="q-cond">
                          <Icon name="git-compare" size={12} />
                          <span>
                            <b>{q.showIfQuestionIndex}번</b> 문항에서{' '}
                            <b>{q.showIfOptionIndex !== null ? `${q.showIfOptionIndex}번 보기` : '특정 보기'}</b>를
                            선택한 사람에게만 보입니다
                          </span>
                        </div>
                      )}
                      {q.sumOfIndexes.length > 0 && (
                        <div className="q-cond">
                          <Icon name="percent" size={12} />
                          <span>
                            <b>{q.sumOfIndexes.join(' · ')}번</b> 문항의 답을 더해 계산합니다
                          </span>
                        </div>
                      )}
                      {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') && (
                        <input
                          className="inp"
                          value={q.options.join(', ')}
                          placeholder="보기를 쉼표로 구분 — 예: 예, 아니오"
                          onChange={(e) => patchQ(q.key, { options: e.target.value.split(',').map((x) => x.trim()) })}
                        />
                      )}
                      {q.type === 'NUMBER' && (
                        <div className="two">
                          {/* ★ `step` 을 걸지 않는다 — Modal 이 form 이라 배수가 아니면 저장이 막힌다 */}
                          <input
                            className="inp"
                            type="number"
                            value={q.minValue}
                            placeholder="최솟값"
                            onChange={(e) => patchQ(q.key, { minValue: e.target.value })}
                          />
                          <input
                            className="inp"
                            type="number"
                            value={q.maxValue}
                            placeholder="최댓값"
                            onChange={(e) => patchQ(q.key, { maxValue: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  ))}

                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          questions: [
                            ...editing.questions!,
                            {
                              key: `new-${Date.now()}`,
                              type: 'SINGLE_CHOICE',
                              title: '',
                              required: false,
                              minValue: '',
                              maxValue: '',
                              options: [],
                              /* 새 문항은 조건 없이 늘 보인다 */
                              showIfQuestionIndex: null,
                              showIfOptionIndex: null,
                              sumOfIndexes: [],
                            },
                          ],
                        })
                      }
                    >
                      <Icon name="plus" size={13} /> 문항 추가
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setDup({ row: editing.row, title: `${editing.row.title} (복사본)`, busy: false, err: null })}
                      title="문항을 그대로 옮겨 새 설문을 만듭니다"
                    >
                      <Icon name="copy" size={13} /> 복제해서 새로 만들기
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {dup && (
        <Modal
          title="복제해서 새로 만들기"
          sub="문항만 그대로 옮깁니다."
          confirmLabel="복제"
          busy={dup.busy}
          confirmDisabled={dup.title.trim() === ''}
          error={dup.err}
          onConfirm={() => void runDuplicate()}
          onClose={() => setDup(null)}
        >
          <div className="note-box">
            <div>
              설문 문항과 범위(전체·지점·반)는 유지되며, 대상자와 응답 내역은 복제되지 않습니다. 복제 후
              대상자를 다시 선택합니다.
            </div>
          </div>
          <div className="frow">
            <label className="req">새 설문명</label>
            <div>
              <input
                className="inp"
                value={dup.title}
                onChange={(e) => setDup({ ...dup, title: e.target.value })}
              />
              {/* 같은 제목이 둘이면 어느 것을 보냈는지 모른다 */}
              <div className="hint">원래 설문과 구분되는 이름을 쓰세요.</div>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <Modal
          title={`${removing.title} 설문을 삭제하시겠습니까?`}
          sub="되돌릴 수 없습니다."
          confirmLabel="삭제"
          danger
          busy={rowBusy}
          onConfirm={() => void removeOne()}
          onClose={() => setRemoving(null)}
        >
          <div className="note-box">
            <div>
              응답이 등록된 설문은 삭제할 수 없습니다. 더 이상 응답을 받지 않으려면 <b>마감</b>을 선택합니다.
            </div>
          </div>
        </Modal>
      )}

      {/* ★★ **예시로 센 숫자를 실제 목록으로 바꿨다**(2026-10-26).
             전에는 화면 안의 상수(SURVEYS·TEMPLATES)를 세고 있었다 — 아래 표에는
             서버 설문 17건이 떠 있는데 위 카드는 5·1·85%·4 를 보여줘 **두 숫자가
             서로 다른 말을** 했다. 「표시용 예시」 딱지가 붙어 있어도, 숫자가 먼저 읽힌다.
             ★ 평균 응답률은 여전히 못 센다 — 응답 수가 **설문마다 따로** 와서 전체를
               내려면 17번을 더 불러야 한다. 지어내느니 '-' 다. */}
      <div className="stat-strip">
        <div className="stat">
          <div className="l">
            <Icon name="clipboard-list" size={13} /> 전체 설문
          </div>
          <div className="v">{surveys.length}</div>
          <div className="d">올해 개설</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="send" size={13} /> 진행중
          </div>
          <div className="v" style={{ color: 'var(--mint-d)' }}>
            {surveys.filter((s) => s.status === 'OPEN').length}
          </div>
          {/* ★ 「배포중」이라고 쓰지 않는다 — 배포라는 단계가 없다. 서버 상태 그대로 */}
          <div className="d">응답 받는 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="calendar-clock" size={13} /> 예정
          </div>
          <div className="v">{surveys.filter((s) => s.status === 'SCHEDULED').length}</div>
          <div className="d">아직 안 열림</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="percent" size={13} /> 평균 응답률
          </div>
          <div className="v">-</div>
          <div className="d">집계 준비 중</div>
        </div>
        <div className="stat">
          <div className="l">
            <Icon name="line-chart" size={13} /> 성적 연동
          </div>
          {/* ★ 'F-4.6' 은 우리 문서 번호다 — 통계 칸에 화면 코드가 값처럼 들어가 있었다 */}
          <div className="v" style={{ fontSize: 15, paddingTop: 6 }}>
            성적 관리
          </div>
          <div className="d">가채점 → 리포트</div>
        </div>
      </div>

      <div className="card-sec">
        <Tabs
          items={[
            { key: 'list', label: '설문 목록', count: surveys.length },
            { key: 'template', label: '템플릿', count: TEMPLATES.length },
            { key: 'result', label: '결과 집계' },
            { key: 'target', label: '대상자' },
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
                  {/* 담임은 설문을 만들지 않는다 — 헤더·행 버튼과 같은 판단이다 */}
                  {!teacherOnly && (
                    <button className="btn pri" onClick={createSurvey}>
                      <Icon name="plus" size={14} /> 설문 생성
                    </button>
                  )}
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
                    그래서 나중에 템플릿을 수정해도 <b>이미 배포한 설문은 바뀌지 않습니다</b> —
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
                  {result ? `${result.survey.title} — 응답 ${result.responseCount}건` : '선택된 설문이 없습니다'}
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
                  <button
                    className="btn"
                    style={{ padding: '5px 11px', fontSize: 11.5 }}
                    disabled={resultId === null || exporting}
                    title="응답을 한 줄씩 엑셀로 받습니다. 익명 설문은 학번·이름이 비어 있습니다"
                    onClick={() => {
                      const sv = surveys.find((x) => x.id === resultId)
                      if (!sv) return
                      setExporting(true)
                      exportSurveyResponses(sv.id, sv.title)
                        .catch((err) => setApiError(err instanceof ApiError ? err.message : '응답을 내려받지 못했습니다.'))
                        .finally(() => setExporting(false))
                    }}
                  >
                    <Icon name="file-spreadsheet" size={12} /> {exporting ? '받는 중…' : '원시 응답 다운로드'}
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

          {tab === 'target' && (
            <div className="card-sec" style={{ marginBottom: 0, boxShadow: 'none', border: '1px solid var(--line)' }}>
              <div className="card-sec-h">
                <div className="t">
                  <span className="ico">
                    <Icon name="user-check" size={15} />
                  </span>
                  대상자
                </div>
                <div className="r" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <select
                    className="sel"
                    style={{ width: 220 }}
                    value={targetId ?? ''}
                    onChange={(e) => setTargetId(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">설문 선택</option>
                    {surveys.map((sv) => (
                      <option key={sv.id} value={sv.id}>
                        {sv.title}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    style={{ padding: '5px 11px', fontSize: 11.5 }}
                    disabled={targetId === null || teacherOnly}
                    title={teacherOnly ? '보기 전용입니다' : undefined}
                    onClick={() => {
                      setPicking({ rows: null, selected: [], classFilter: '', busy: false, err: null })
                      void searchStudents({ academyId: academyId ?? undefined, size: 200 })
                        .then((r) => setPicking((c) => (c ? { ...c, rows: r.rows } : c)))
                        .catch((e) =>
                          setPicking((c) =>
                            c ? { ...c, rows: [], err: e instanceof ApiError ? e.message : '학생을 불러오지 못했습니다.' } : c,
                          ),
                        )
                    }}
                  >
                    <Icon name="user-plus" size={12} /> 대상자 지정
                  </button>
                </div>
              </div>
              <div className="card-sec-b">
                {/* ★ 두 설문의 목록 뜻이 다르다. 안 입력하면 「왜 미제출이 안 보이지」가 된다 */}
                <div className="note-box">
                  <div>
                    대상자를 지정한 설문은 <b>안 낸 사람도 표에 나옵니다.</b> 지정하지 않은 설문은 낸 사람만
                    나옵니다.
                  </div>
                </div>

                {targetId !== null && parts !== null && (
                  <div className="stat-strip c4" style={{ marginTop: 10, marginBottom: 10 }}>
                    {(['SENT', 'VIEWED', 'AGREED', 'SUBMITTED'] as ParticipantState[]).map((st) => (
                      <div className="stat" key={st}>
                        <div className="l">{PARTICIPANT_STATE_LABEL[st]}</div>
                        <div className="v">
                          {/* ⚠️ 제출은 `submittedAt` 으로 센다 — 행 수로 세면 미제출까지 들어간다 */}
                          {st === 'SUBMITTED'
                            ? parts.filter((x) => x.submittedAt != null).length
                            : parts.filter((x) => x.state === st).length}
                        </div>
                        <div className="d">명</div>
                      </div>
                    ))}
                  </div>
                )}

                {partsErr && (
                  <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                    {partsErr}
                  </div>
                )}

                <DataTable
                  rows={parts ?? []}
                  columns={partColumns}
                  rowKey={(r) => String(r.enrollmentId)}
                  loading={targetId !== null && parts === null}
                  pageSize={20}
                  emptyText={targetId === null ? '설문을 선택해 주세요.' : '대상자가 없습니다.'}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 대상자 지정 — 선택한 학생을 이 설문의 대상자로 만든다 */}
      {picking && (
        <Modal
          title="대상자 지정"
          /* ★ **「발송」이 아니다.** 이 호출은 대상자 행을 만들 뿐 **아무것도 보내지 않는다** —
             학생은 앱을 열어 설문 목록에서 본다. 「발송됩니다」라고 사용하면 담당자가
             **학생에게 알림이 간 줄 안다**(디랩이 실제로 그렇게 읽고 물어 왔다).
             알림 이벤트는 서버에 생겼지만 **문구가 미확정이라 아직 안 나간다** */
          sub="선택한 학생은 앱에서 이 설문을 확인할 수 있습니다. 별도 알림은 발송되지 않습니다."
          confirmLabel="대상자로 지정"
          wide
          busy={picking.busy}
          error={picking.err}
          confirmDisabled={picking.selected.length === 0}
          onConfirm={() => {
            if (targetId === null) return
            setPicking((c) => (c ? { ...c, busy: true, err: null } : c))
            void assignSurveyTargets(targetId, picking.selected.map(Number))
              .then(async () => {
                setPicking(null)
                setApiNotice(`${picking.selected.length}명을 대상자로 지정했습니다.`)
                await loadParts(targetId)
              })
              .catch((e) =>
                setPicking((c) =>
                  c ? { ...c, busy: false, err: e instanceof ApiError ? e.message : '지정하지 못했습니다.' } : c,
                ),
              )
          }}
          onClose={() => setPicking(null)}
        >
          {/* ★ 반으로 먼저 좁힌다. **선택한 사람은 반을 바꿔도 그대로 남는다** — 반을 옮겨 가며
                 여러 반에서 선택할 수 있어야 한다(필터는 보이는 것만 거른다) */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <select
              className="sel"
              style={{ width: 160 }}
              value={picking.classFilter}
              onChange={(e) => setPicking((c) => (c ? { ...c, classFilter: e.target.value } : c))}
            >
              <option value="">반 전체</option>
              {pickClassNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="hint" style={{ margin: 0 }}>
              {picking.selected.length}명 선택
              {picking.classFilter !== '' && ' · 선택한 사람은 반을 바꿔도 남습니다'}
            </span>
          </div>
          <DataTable
            rows={pickRows}
            columns={pickColumns}
            rowKey={(r) => String(r.enrollmentId)}
            loading={picking.rows === null}
            selectable
            selected={picking.selected}
            onSelectedChange={(v) => setPicking((c) => (c ? { ...c, selected: v } : c))}
            pageSize={10}
            emptyText="학생이 없습니다."
          />
        </Modal>
      )}
    </>
  )
}

/** 헤더 액션 — 담임에게는 만들기 버튼을 내지 않는다(행 버튼과 같은 판단) */
function SurveyHeaderActions() {
  const { teacherOnly } = useAuth()
  if (teacherOnly) return null
  return (
    <>
      <button className="btn" onClick={() => fromTemplateSignal.bump()}>
        <Icon name="copy" size={14} /> 템플릿에서 생성
      </button>
      <button className="btn pri" onClick={() => newSurveySignal.bump()}>
        <Icon name="plus" size={14} /> 설문 생성
      </button>
    </>
  )
}

export const surveyMockup: Mockup = {
  Content,
  /* 본문에 같은 기능이 이미 있었고 헤더 것만 막혀 있었다 — 중복된 채로 눌리지 않으면
     고장으로 읽힌다. 본문으로 신호를 보내 같은 동작을 하게 한다 */
  actions: <SurveyHeaderActions />,
}
