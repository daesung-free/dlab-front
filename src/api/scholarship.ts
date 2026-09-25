import { request } from './client'

/* 장학 취소 기준 · 검토 (F-4.10-7) — /scholarship/rules · /scholarship/reviews
 *
 * ★ **기초 관리의 '장학 종류' 와 다른 것이다.** 저쪽은 "어떤 장학이 있는가"(종류·할인율)고
 *   여기는 "언제 취소하는가"(기준)와 "누구를 취소할 것인가"(검토)다.
 *   둘은 `code` / `scholarshipType` 으로 이어진다.
 *
 * ★ **판정은 취소가 아니다.** `judge` 는 지점 전체를 훑어 **검토 대상을 올릴 뿐**이고,
 *   실제 취소는 건별로 사람이 확정한다. 자동으로 장학이 끊기지 않는다.
 */

/**
 * 기준 종류.
 *
 * ★ `EXAM_GRADE_SUM` 만 과목·회차·탐구 설정을 쓴다. 나머지 둘은 `threshold` 하나로 끝난다 —
 *   벌점은 누적 점수, 모의고사 결시는 횟수다.
 */
export type RuleType = 'PENALTY_POINT' | 'EXAM_GRADE_SUM' | 'MOCK_EXAM_ABSENCE'

export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  PENALTY_POINT: '벌점 누적',
  EXAM_GRADE_SUM: '등급합',
  MOCK_EXAM_ABSENCE: '모의고사 결시',
}

/** 기준값을 뭐라고 읽어야 하는지. 종류마다 단위가 달라서 숫자만 보면 못 읽는다 */
export const RULE_THRESHOLD_LABEL: Record<RuleType, string> = {
  PENALTY_POINT: '벌점 누적(점)',
  EXAM_GRADE_SUM: '등급합 상한',
  MOCK_EXAM_ABSENCE: '결시 횟수',
}

/** 탐구 집계 방식. 비우면 탐구를 아예 안 본다 */
export type ElectiveMode = 'SINGLE' | 'AVG2'

export const ELECTIVE_MODE_LABEL: Record<ElectiveMode, string> = {
  SINGLE: '탐구 1과목',
  AVG2: '탐구 2과목 평균',
}

export interface ScholarshipRule {
  id: number
  /** null 이면 **전 지점 공통**이다. 지점 목록과 섞이지 않는다 */
  academyId: number | null
  year: number
  ruleType: RuleType
  /** 적용 장학의 `code`. null 이면 장학 종류와 무관하다(벌점이 그렇다) */
  scholarshipType: string | null
  /**
   * 같은 (장학, 요건) 안의 **OR 대안 번호.**
   *
   * ★ 같은 장학에 대안이 둘이면 **하나만 만족해도 유지**된다. 예를 들어 수능 100% 는
   *   ① 국+수 등급합 4 이하(탐구 평균2) ② 국+수+영 등급합 4 이하 중 하나면 된다.
   *   화면이 이걸 따로따로 늘어놓으면 "기준이 왜 두 개냐"가 되므로 묶어서 보여준다.
   */
  alternativeGroup: number
  threshold: number
  /** 등급합에 고정으로 들어가는 과목(콤마). **탐구는 여기 적지 않는다** */
  subjectCodes: string | null
  /** 대상 회차(콤마). 비우면 `JUNE,SEPT` */
  examCodes: string | null
  electiveMode: ElectiveMode | null
  /** AND 조건 과목. `extraMaxGrade` 와 **함께** 지정한다 */
  extraSubjectCode: string | null
  extraMaxGrade: number | null
  /** ★ 만들면 **항상 꺼져 있다.** 검증 전 기준이 돌면 안 된다 */
  active: boolean
}

export interface ScholarshipRuleBody {
  /** 비우면 전 지점 공통. 본사만 만들 수 있다 */
  academyId?: number
  year: number
  ruleType: RuleType
  threshold: number
  scholarshipType?: string
  alternativeGroup?: number
  subjectCodes?: string
  examCodes?: string
  electiveMode?: ElectiveMode
  extraSubjectCode?: string
  extraMaxGrade?: number
}

/**
 * 취소 기준 목록. **꺼진 것까지 전부 온다.**
 *
 * ★ `academyId` 를 비우면 **전 지점 공통 기준**이 온다 — 지점 것과 **다른 목록**이다.
 *   섞어 보여주면 어느 것을 고치는지 알 수 없으므로 화면이 갈라서 보여준다.
 */
export function listScholarshipRules(params: { academyId?: number; year: number }): Promise<ScholarshipRule[]> {
  return request<ScholarshipRule[]>('/api/v1/admin/scholarship/rules', { query: { ...params } })
}

/** ★ **항상 꺼진 채로 만들어진다.** 확인하고 켜는 순서다 */
export function createScholarshipRule(body: ScholarshipRuleBody): Promise<ScholarshipRule> {
  return request<ScholarshipRule>('/api/v1/admin/scholarship/rules', { method: 'POST', body })
}

export function updateScholarshipRule(ruleId: number, body: ScholarshipRuleBody): Promise<ScholarshipRule> {
  return request<ScholarshipRule>(`/api/v1/admin/scholarship/rules/${ruleId}`, { method: 'PUT', body })
}

/** 켜고 끄기. 지우지 않고 멈추는 수단이라 되돌리기 쉽다 */
export function setScholarshipRuleActive(ruleId: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/scholarship/rules/${ruleId}/active`, {
    method: 'PATCH',
    query: { active },
  })
}

/** 삭제. soft delete 라 이미 판정에 쓰인 기준이 이력에서 사라지지 않는다 */
export function deleteScholarshipRule(ruleId: number): Promise<void> {
  return request<void>(`/api/v1/admin/scholarship/rules/${ruleId}`, { method: 'DELETE' })
}

/* ─────────── 검토 ─────────── */

export type ReviewStatus = 'PENDING' | 'CANCELED' | 'EXCEPTED'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: '검토 대기',
  CANCELED: '취소 확정',
  EXCEPTED: '예외 인정',
}

export interface ScholarshipReview {
  id: number
  enrollmentId: number
  studentNo: string | null
  studentName: string
  ruleType: RuleType | null
  /**
   * 걸린 값.
   *
   * ⚠️ **등급합은 2배 스케일이다** — 탐구 2과목 평균이 3.5 처럼 정수가 아닐 수 있어서다.
   *   **화면에 그대로 띄우면 안 된다**(서버 주석). 합이 4 인 학생이 8 로 보인다.
   *   사람에게는 `detail` 을 보여준다.
   */
  detectedValue: number | null
  threshold: number | null
  /** 사람이 읽는 판정 근거. **대안이 여럿이면 전부 들어 있다** — 이걸 화면에 쓴다 */
  detail: string | null
  status: ReviewStatus
  decisionNote: string | null
  decidedBy: number | null
  decidedAt: string | null
}

/** ★ `academyId` · `year` 둘 다 **필수**다 */
export function listScholarshipReviews(params: {
  academyId: number
  year: number
  status?: ReviewStatus
}): Promise<ScholarshipReview[]> {
  return request<ScholarshipReview[]>('/api/v1/admin/scholarship/reviews', { query: { ...params } })
}

/**
 * 판정 실행 — 지점 전체를 훑어 **검토 대상을 올린다.**
 *
 * ★ **취소가 아니다.** 여기서 올라온 건을 사람이 건별로 확정한다.
 * ★ **장학이 없는 학생은 대상이 아니다** — 취소할 것이 없고, 어느 장학인지 모르면
 *   어떤 기준을 적용할지도 정해지지 않는다.
 * ★ 여러 번 눌러도 같은 건이 중복으로 쌓이지 않는다. 그래도 화면은 처리 중 버튼을 막는다.
 */
export function judgeScholarships(params: { academyId: number; year: number }): Promise<unknown> {
  return request<unknown>('/api/v1/admin/scholarship/reviews/judge', { method: 'POST', query: { ...params } })
}

/** 취소 확정. 사유는 선택이지만 남겨 두는 게 낫다 */
export function cancelScholarshipReview(reviewId: number, note?: string): Promise<void> {
  return request<void>(`/api/v1/admin/scholarship/reviews/${reviewId}/cancel`, {
    method: 'POST',
    body: { note: note ?? '' },
  })
}

/**
 * 예외 인정.
 *
 * ★ **사유가 필수다** — 없으면 나중에 "왜 살려뒀나"에 답할 수 없다. 서버가 막는다.
 */
export function exceptScholarshipReview(reviewId: number, note: string): Promise<void> {
  return request<void>(`/api/v1/admin/scholarship/reviews/${reviewId}/except`, {
    method: 'POST',
    body: { note },
  })
}
