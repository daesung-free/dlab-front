import { downloadFile, request } from './client'

/* 설문 (F-4.6-부속) — /api/v1/admin/surveys
 *
 * ★ 템플릿에서 설문을 만들면 **문항이 복사된다**(참조가 아니다).
 *   그래서 템플릿을 나중에 고쳐도 이미 배포된 설문은 안 바뀐다 — 응답이 "그때 그 문항"에
 *   묶여 있어야 집계가 깨지지 않기 때문이다. 다만 **템플릿 관리 API는 아직 없다**.
 *
 * ★ 문항 순서를 보내지 않는다. **배열 순서가 곧 순서**다(서버 주석).
 *   번호를 받으면 빠진 번호나 중복이 그대로 들어와 유니크 제약에 걸린다. */

export type SurveyType = 'GENERAL' | 'GRADE_INPUT'
export type SurveyScope = 'ALL' | 'BRANCH' | 'CLASS'
export type QuestionType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'TEXT' | 'NUMBER'

export const SURVEY_TYPE_LABEL: Record<SurveyType, string> = {
  GENERAL: '일반',
  GRADE_INPUT: '가채점',
}

export const SCOPE_LABEL: Record<SurveyScope, string> = {
  ALL: '전 지점',
  BRANCH: '지점 전체',
  CLASS: '반',
}

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: '단일 선택',
  MULTI_CHOICE: '복수 선택',
  TEXT: '주관식',
  NUMBER: '숫자',
}

export interface SurveySummary {
  id: number
  surveyType: SurveyType
  scope: SurveyScope
  academyId: number | null
  classId: number | null
  title: string
  description: string | null
  anonymous: boolean
  opensAt: string
  closesAt: string
  questionCount: number
  /**
   * 서버가 판정한 진행 상태.
   *
   * ★ **화면이 시각을 비교하지 않는다.** 클라이언트 시계가 어긋나 있으면
   *   같은 설문이 사람마다 열려 보이고 닫혀 보인다.
   *
   * ⚠️ 조기 마감은 `closesAt` 을 지금으로 당기는 방식이라 원래 마감 시각이
   *   덮어써진다 — "예정 마감이 언제였나"는 남지 않는다.
   */
  status: SurveyRunState
}

/** SCHEDULED = 아직 안 열림 */
export type SurveyRunState = 'SCHEDULED' | 'OPEN' | 'CLOSED'

export const SURVEY_RUN_STATE_LABEL: Record<SurveyRunState, string> = {
  SCHEDULED: '예정',
  OPEN: '진행중',
  CLOSED: '마감',
}

/**
 * 대상자 한 줄.
 *
 * ★ **장학 동의서만 미제출 행이 나온다.** 범위로 돌리는 일반 설문은 대상자를 미리 만들지
 *   않아 **제출자만** 나온다 — 두 설문의 목록 길이가 뜻이 다르다.
 *
 * ⚠️ **제출자는 `submittedAt != null` 로 센다.** 행 수로 세면 **미제출 대상자까지 포함**된다.
 */
export interface SurveyParticipant {
  enrollmentId: number
  studentNo: string | null
  studentName: string
  /** 「발송 / 열람 / 동의 / 제출」 */
  state?: ParticipantState | null
  viewedAt?: string | null
  agreedAt?: string | null
  /** null이면 아직 응답 안 함 */
  submittedAt: string | null
}

export type ParticipantState = 'SENT' | 'VIEWED' | 'AGREED' | 'SUBMITTED'

export const PARTICIPANT_STATE_LABEL: Record<ParticipantState, string> = {
  SENT: '발송',
  VIEWED: '열람',
  AGREED: '동의',
  SUBMITTED: '제출',
}

/**
 * 대상자 지정 — 고른 학생을 이 설문의 대상자로 만든다.
 *
 * ★ **아무것도 보내지 않는다.** 이름이 `targets` 라 「발송」으로 읽기 쉬운데, 학생은
 *   **앱을 열어 설문 목록에서** 본다. 화면에 「발송됩니다」라고 쓰면 담당자가 알림이
 *   간 줄 안다 — 디랩이 실제로 그렇게 읽고 물어 왔다(1016 피드백 5장).
 * ★ **장학 동의서처럼 「누가 안 냈는지」를 봐야 하는 설문에 쓴다.** 범위로 돌리는 일반
 *   설문은 대상자를 만들 필요가 없다 — 만들면 미제출 행이 생겨 목록의 뜻이 달라진다.
 */
export function assignSurveyTargets(surveyId: number, enrollmentIds: number[]): Promise<void> {
  return request<void>(`/api/v1/admin/surveys/${surveyId}/targets`, {
    method: 'POST',
    body: { enrollmentIds },
  })
}

export interface OptionCount {
  label: string
  count: number
}

export interface QuestionResult {
  questionId: number
  title: string
  type: QuestionType
  answerCount: number
  options: OptionCount[] | null
  average: number | null
  min: number | null
  max: number | null
  texts?: string[] | null
}

export interface SurveyResult {
  survey: SurveySummary
  responseCount: number
  questions: QuestionResult[]
}

export interface SurveyQuestionCreate {
  type: QuestionType
  title: string
  required?: boolean
  minValue?: number
  maxValue?: number
  /** 선택형이면 필수 */
  options?: string[]
  /* ★ 조건부·합산은 **고치지 않아도 그대로 돌려보내야 한다.** 빠뜨리면 교체하면서
     조용히 풀린다 — 가채점의 「응시/미응시」가 이걸 쓴다(2026-10-16 백엔드 확인). */
  showIfQuestionIndex?: number | null
  showIfOptionIndex?: number | null
  sumOfIndexes?: number[]
}

export interface SurveyCreate {
  surveyType: SurveyType
  scope: SurveyScope
  academyId?: number
  classId?: number
  title: string
  description?: string
  anonymous?: boolean
  /** Instant — `2026-09-01T00:00:00Z` 처럼 타임존을 붙인다 */
  opensAt: string
  closesAt: string
  questions: SurveyQuestionCreate[]
}

export function listSurveys(year?: number): Promise<SurveySummary[]> {
  return request<SurveySummary[]>('/api/v1/admin/surveys', { query: { year } })
}

export function getSurveyResult(surveyId: number): Promise<SurveyResult> {
  return request<SurveyResult>(`/api/v1/admin/surveys/${surveyId}/results`)
}

export function listSurveyParticipants(surveyId: number): Promise<SurveyParticipant[]> {
  return request<SurveyParticipant[]>(`/api/v1/admin/surveys/${surveyId}/participants`)
}

export function createSurvey(body: SurveyCreate): Promise<SurveySummary> {
  return request<SurveySummary>('/api/v1/admin/surveys', { method: 'POST', body })
}

/**
 * 제목·안내문·기간 수정.
 *
 * ★ **범위·대상·문항은 못 바꾼다**(서버 계약). 이미 응답이 들어온 설문의 문항을 바꾸면
 *   앞 응답과 뒤 응답이 서로 다른 질문의 답이 되기 때문이다 — 그럴 때는 새로 만든다.
 */
export function updateSurvey(
  surveyId: number,
  body: { title: string; description?: string; opensAt: string; closesAt: string },
): Promise<SurveySummary> {
  return request<SurveySummary>(`/api/v1/admin/surveys/${surveyId}`, { method: 'PUT', body })
}

/**
 * 문항 정의. **교체 요청과 칸이 같다** — 읽은 것을 그대로 되돌려 보내면 바뀌는 것이 없다.
 *
 * ★ **집계(`/results`)와 다른 경로다.** 집계의 `min`·`max` 는 **응답 통계**고 여기 `minValue`·
 *   `maxValue` 는 **설정**이다 — 이름이 겹쳐 섞이면 안 돼 따로 둔다(2026-10-16 백엔드).
 * ★ **번호는 「순서」(1부터)다. DB 의 `seq` 가 아니다.** 교체가 soft delete 라 두 번 교체하면
 *   첫 문항의 `seq` 가 9가 된다 — 서버가 순서로 바꿔 내려주므로 **배열 인덱스 + 1** 로 쓴다.
 */
export interface SurveyQuestionDef {
  questionId: number
  type: QuestionType
  title: string
  required: boolean
  minValue: number | null
  maxValue: number | null
  options: string[]
  /** 조건부 노출 — 이 번호 문항에서 */
  showIfQuestionIndex: number | null
  /** 그 보기를 골랐을 때만 보인다 */
  showIfOptionIndex: number | null
  /** 합산 문항 — 더할 문항 번호들 */
  sumOfIndexes: number[]
}

export function getSurveyQuestions(surveyId: number): Promise<SurveyQuestionDef[]> {
  return request<SurveyQuestionDef[]>(`/api/v1/admin/surveys/${surveyId}/questions`)
}

/**
 * 문항 교체.
 *
 * ★ **제출이 하나라도 있으면 400 이다.** 고치면 이미 낸 학생의 답이 **다른 질문의 답으로
 *   바뀌기** 때문이다. 서버가 「몇 명이 제출했는지 + 복제해서 새로 만들라」까지 문구로
 *   돌려주므로 **그 문구를 그대로 띄운다.**
 * ★ 교체다 — 보낸 목록이 **그대로 새 문항이 된다.** 덧붙이기가 아니다.
 */
export function replaceSurveyQuestions(
  surveyId: number,
  questions: SurveyQuestionCreate[],
): Promise<SurveySummary> {
  return request<SurveySummary>(`/api/v1/admin/surveys/${surveyId}/questions`, {
    method: 'PUT',
    body: { questions },
  })
}

/**
 * 양식 복제. 문항을 그대로 옮기고 **제목만 새로 받는다.**
 *
 * ★ **대상자·응답은 안 따라온다** — 따라오면 남이 동의한 기록이 새 양식에 붙는다.
 *   복제한 뒤 대상자를 다시 골라야 한다.
 * ★ 제출이 있어 문항을 못 고칠 때 **이쪽으로 돌린다.**
 */
export function duplicateSurvey(surveyId: number, title: string): Promise<SurveySummary> {
  return request<SurveySummary>(`/api/v1/admin/surveys/${surveyId}/duplicate`, {
    method: 'POST',
    body: { title },
  })
}

/** 설문 삭제. 응답이 있으면 서버가 막는다 — 그때는 조기 마감을 쓴다 */
export function deleteSurvey(surveyId: number): Promise<void> {
  return request<void>(`/api/v1/admin/surveys/${surveyId}`, { method: 'DELETE' })
}

/** 조기 마감. 기간이 남았어도 닫는다 */
export function closeSurvey(surveyId: number): Promise<void> {
  return request<void>(`/api/v1/admin/surveys/${surveyId}/close`, { method: 'PATCH' })
}

/**
 * 원시 응답 엑셀 — 집계로는 부족할 때(가채점처럼 개별 응답을 봐야 할 때).
 * ★ 익명 설문은 학번·이름 칸이 빈다. 응답 행에 응답자를 저장하지 않는 구조라 되돌릴 값이 없다.
 */
export function exportSurveyResponses(surveyId: number, title: string): Promise<void> {
  return downloadFile(`/api/v1/admin/surveys/${surveyId}/responses/export`, `${title}_응답.xlsx`)
}


/**
 * 미응답자 독촉 발송 전 집계 — **확인 모달용**.
 *
 * ★★ **문자는 건당 과금이고 되돌릴 수 없다.** 전 지점 설문이면 수천 건이라
 *   「○○명에게 보냅니다」를 **누르기 전에** 보여줘야 한다.
 * ⚠️ `remindable` 이 false 면 보낼 수 없다 — **대상자를 지정하지 않은 설문**
 *   (범위로 돌리는 일반 설문)은 서버가 400 으로 거절한다. 미응답자가 0명일 때도 false 다.
 */
export interface SurveyRemindPreview {
  /** 대상자 수. 대상 지정이 없는 설문이면 0 */
  targetCount: number
  submittedCount: number
  /** 독촉이 나갈 인원 */
  pendingCount: number
  remindable: boolean
}

export function previewSurveyRemind(surveyId: number): Promise<SurveyRemindPreview> {
  return request<SurveyRemindPreview>(`/api/v1/admin/surveys/${surveyId}/remind-preview`)
}

/**
 * 미응답자에게 독촉 발송.
 *
 * ★ **같은 날 두 번 눌러도 두 번 가지 않는다** — 중복 방지 키에 날짜가 들어간다.
 *   며칠에 걸쳐 여러 번 보내는 것은 정상이다.
 */
export function remindSurvey(surveyId: number): Promise<void> {
  return request<void>(`/api/v1/admin/surveys/${surveyId}/remind`, { method: 'POST' })
}
