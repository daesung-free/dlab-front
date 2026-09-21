import { request } from './client'
import type { EnrollmentStatus } from './students'

/* 상벌점 관리 (F-4.1-2) — GET /api/v1/admin/penalties
 *
 * ★ 지금은 페이징이 없다. 기간 전량이 한 번에 오고, 기간을 안 주면 서버 기본값이
 *   **이번 달 1일 ~ 오늘**이다.
 *
 * ⚠️ **서버 페이징이 예정돼 있다**(2026-09-02 백엔드 회신). 들어오면 이 모듈을
 *   requestPaged 로, 화면을 useServerTable 로 옮긴다. **다만 순서가 있다** —
 *   백엔드가 넣고 알려주기 전에 옮기면 응답에 meta 가 없어 목록이 통째로 빈다.
 *   신호를 받고 나서 바꿀 것. (summary 는 페이징 후에도 페이지 합계가 아니라
 *   **필터 전체 기준**을 유지한다고 확인받았다 — 상단 통계는 그대로 두면 된다)
 *
 * ★ point 는 부호가 이미 들어 있다 — 벌점이 음수다. 화면이 category 를 다시 보고
 *   부호를 만들지 않는다. 부여 시점 값을 복사해두므로 나중에 항목 점수를 바꿔도
 *   과거 이력은 소급해서 바뀌지 않는다.
 */

export type PenaltyCategory = 'MERIT' | 'DEMERIT'

export const PENALTY_CATEGORY_LABEL: Record<PenaltyCategory, string> = {
  MERIT: '상점',
  DEMERIT: '벌점',
}

/** 부여 경로. 규칙 매핑(I-5) 확정 전까지 실제로 쌓이는 것은 MANUAL 뿐이다 */
export type PenaltySource = 'KIOSK' | 'ROUTINE' | 'MANUAL'

export const PENALTY_SOURCE_LABEL: Record<PenaltySource, string> = {
  KIOSK: '자동',
  ROUTINE: '자동',
  MANUAL: '수기',
}

export interface PenaltyRow {
  /** 부여 이력 id. 취소(DELETE)할 때 쓴다 */
  id: number
  /** 학생(등록 건) id. 일괄 부여가 이 값을 받는다 */
  enrollmentId: number
  /** ISO instant (UTC). 화면의 '일자'는 로컬 날짜로 바꿔 찍는다 */
  occurredAt: string
  studentNo: string | null
  name: string
  category: PenaltyCategory
  itemName: string
  /** 벌점은 음수로 온다 */
  point: number
  reason: string | null
  source: PenaltySource
  /** 부여한 계정 id */
  grantedBy: number | null
  grantedByName: string | null
  /** 고정반. 미배정이면 null */
  className: string | null
  enrollmentStatus: EnrollmentStatus
}

/** 상단 합계. **조회 조건 기준**이라 필터를 걸면 같이 줄어든다 */
export interface PenaltySummary {
  plusTotal: number
  minusTotal: number
  autoCount: number
}

export interface PenaltyBoard {
  rows: PenaltyRow[]
  summary: PenaltySummary
  masked: boolean
}

export interface PenaltyParams {
  academyId?: number
  /** yyyy-MM-dd. 비우면 이번 달 1일 */
  from?: string
  /** yyyy-MM-dd. 비우면 오늘 */
  to?: string
  category?: PenaltyCategory
  /** 여러 개 보낼 수 있다 — 화면의 '자동'이 KIOSK·ROUTINE 두 값이라 반복 파라미터가 필요하다 */
  source?: PenaltySource[]
  enrollmentStatus?: EnrollmentStatus
  /** 이름·학번 부분일치 */
  keyword?: string
  classId?: number
}

/**
 * 학생 한 명의 상벌점 내역. 상담 관리 '출결 · 상벌점' 탭이 쓴다.
 * ★ 전체 목록(`PenaltyBoard`)과 **모양이 다르다** — `summary` 가 없고 `totalPoints`(순합계) 하나다
 *   (2026-09-21 실응답). 같은 타입으로 받았다가 합계를 읽는 순간 화면이 통째로 죽었다.
 */
export interface StudentPenalties {
  rows: PenaltyRow[]
  totalPoints: number
}

export function fetchStudentPenalties(enrollmentId: number): Promise<StudentPenalties> {
  return request<StudentPenalties>(`/api/v1/admin/penalties/students/${enrollmentId}`)
}

export function fetchPenaltyBoard(params: PenaltyParams): Promise<PenaltyBoard> {
  const { source, ...rest } = params
  return request<PenaltyBoard>('/api/v1/admin/penalties', {
    query: { ...rest },
    repeatable: { source },
  })
}

/** 부여 가능한 항목. 화면 드롭다운이 쓴다 */
export interface PenaltyItem {
  id: number
  itemName: string
  category: PenaltyCategory
  /** 벌점은 음수 */
  point: number
}

export function fetchPenaltyItems(params: { academyId?: number; year?: number }): Promise<PenaltyItem[]> {
  return request<PenaltyItem[]>('/api/v1/admin/penalties/items', { query: { ...params } })
}

/**
 * 선택 일괄 부여 (수기).
 *
 * ★ 점수는 **항목 값 그대로**라 화면에서 조정할 수 없다.
 * @returns 실제로 부여된 건수
 */
export function grantPenalties(body: {
  enrollmentIds: number[]
  itemId: number
  reason?: string
  /**
   * 발생 일자 (yyyy-MM-dd). 비우면 오늘 — **어제 일을 오늘 넣는 경우가 실제로 있다.**
   * 미래 일자는 서버가 거부한다("미래 일자로는 부여할 수 없습니다").
   */
  occurredAt?: string
}): Promise<number> {
  return request<number>('/api/v1/admin/penalties', { method: 'POST', body })
}

/** 부여 취소. soft delete 라 "누가 왜 취소했나"가 남는다 */
export function revokePenalty(penaltyPointId: number): Promise<void> {
  return request<void>(`/api/v1/admin/penalties/${penaltyPointId}`, { method: 'DELETE' })
}

/* ─────────── 항목 관리 (/penalty-items) ─────────── */

/**
 * 항목 마스터.
 *
 * ★ **점수 부호는 구분을 따른다** — 벌점 음수, 상점 양수. 두 조회 경로가 같은 값을 준다
 *   (2026-09-16 백엔드 정리 후 확인).
 *
 *   그 전에는 경로마다 달랐고, 더 나쁘게는 **저장값 자체가 틀려 있었다** — 벌점 55건이
 *   양수로 들어가 있어 합계에서 상점으로 잡히고 있었다. 화면에서 절댓값으로 덮어
 *   표시만 맞춰뒀던 것이라, 보이는 곳은 멀쩡한데 **합계가 틀리는** 상태였다.
 *   마이그레이션으로 저장값까지 정리됐다.
 *
 * ★ 그래서 **표시는 서버 값을 그대로 쓴다.** 화면이 부호를 다시 만들지 않는다.
 *   입력만 절댓값으로 받는다 — 벌점을 고르고 5를 적는 게 -5를 적는 것보다 낫고,
 *   서버가 구분을 보고 부호를 붙인다.
 */
export interface PenaltyItemRow {
  id: number
  itemName: string
  category: PenaltyCategory
  point: number
}

/** ★ `academyId` 가 **필수**다. 안 보내면 400("지점을 지정해야 합니다") — 부여용과 다르다 */
export function listPenaltyItems(params: { academyId: number; year: number }): Promise<PenaltyItemRow[]> {
  return request<PenaltyItemRow[]>('/api/v1/admin/penalty-items', { query: { ...params } })
}

export interface PenaltyItemBody {
  academyId: number
  year: number
  itemName: string
  /** 절댓값으로 보낸다. 저장은 `category` 를 따른다 */
  point: number
  category: PenaltyCategory
}

export function createPenaltyItem(body: PenaltyItemBody): Promise<PenaltyItemRow> {
  return request<PenaltyItemRow>('/api/v1/admin/penalty-items', { method: 'POST', body })
}

export function updatePenaltyItem(itemId: number, body: PenaltyItemBody): Promise<PenaltyItemRow> {
  return request<PenaltyItemRow>(`/api/v1/admin/penalty-items/${itemId}`, { method: 'PUT', body })
}

/**
 * 항목 삭제.
 *
 * ★ 이미 부여된 이력은 **점수를 복사해 갖고 있어** 항목을 지워도 과거 내역이 바뀌지 않는다
 *   (`PenaltyRow.point` 주석 참고). 다만 그 항목을 쓰는 **자동 규칙**은 같이 확인해야 한다.
 */
export function deletePenaltyItem(itemId: number): Promise<void> {
  return request<void>(`/api/v1/admin/penalty-items/${itemId}`, { method: 'DELETE' })
}

/* ─────────── 자동 부여 규칙 (/penalty-rules) ─────────── */

export type PenaltyTriggerType = 'ATTENDANCE' | 'DAILY_ROUTINE' | 'REGULAR_SCHEDULE'

export const PENALTY_TRIGGER_LABEL: Record<PenaltyTriggerType, string> = {
  ATTENDANCE: '출결',
  DAILY_ROUTINE: '데일리 루틴',
  REGULAR_SCHEDULE: '정기 일정',
}

export interface PenaltyRuleRow {
  id: number
  triggerType: PenaltyTriggerType
  /**
   * 어떤 상황에서 부여되는가.
   *
   * ★ 허용값은 `listRuleConditions()` 로 받는다. **하드코딩하지 않는다** —
   *   `triggerType` 마다 다르고 서버가 늘릴 수 있다.
   *
   * ★ 허용값 밖은 400 이고 메시지에 가능한 값이 붙는다(2026-09-16). 그 전에는 `"ZZZZ"` 도
   *   200 으로 저장돼서, 틀린 값으로 만든 **영영 안 걸리는 규칙**이 조용히 쌓일 수 있었다.
   */
  triggerCondition: string
  penaltyItemId: number
  itemName: string
  point: number
  /** 꺼져 있으면 자동 부여가 안 돈다. 새로 만들면 false 로 시작한다 */
  active: boolean
}

/** ★ `year` 가 **필수**다. 안 보내면 400 */
export function listPenaltyRules(params: { academyId?: number; year: number }): Promise<PenaltyRuleRow[]> {
  return request<PenaltyRuleRow[]>('/api/v1/admin/penalty-rules', { query: { ...params } })
}

/** 규칙을 켜고 끈다. 지우지 않고 멈추는 수단이라 실수해도 되돌리기 쉽다 */
export function setPenaltyRuleActive(ruleId: number, active: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/penalty-rules/${ruleId}/active`, {
    method: 'PATCH',
    query: { active },
  })
}

export function deletePenaltyRule(ruleId: number): Promise<void> {
  return request<void>(`/api/v1/admin/penalty-rules/${ruleId}`, { method: 'DELETE' })
}

/**
 * 규칙 조건 코드표.
 *
 * ★ `value` 는 서버에 보내는 코드, `label` 은 화면에 쓰는 말이다.
 *   ATTENDANCE 는 한 글자 코드(`A`=지각)라 **코드를 화면에 내보이면 아무도 못 읽는다.**
 *   `ABSENT`(결석·미태깅)만 예외로 긴 이름인데, 그건 태깅이 아니라 없음을 가리켜서다.
 */
export interface RuleConditionGroup {
  triggerType: PenaltyTriggerType
  conditions: { value: string; label: string }[]
}

export function listRuleConditions(): Promise<RuleConditionGroup[]> {
  return request<RuleConditionGroup[]>('/api/v1/admin/penalty-rules/conditions')
}

/**
 * 자동 부여 규칙 생성.
 *
 * ★ **꺼진 상태로 만들어진다**(`active: false`). 만들자마자 점수가 붙지 않는다 —
 *   확인하고 켜는 순서다.
 *
 * ★ 같은 `triggerType` + `triggerCondition` 이 이미 있으면 400 "이미 등록된 값입니다".
 *   한 상황에 규칙 둘이 걸려 점수가 두 번 붙는 일이 없다.
 */
export function createPenaltyRule(body: {
  academyId: number
  year: number
  triggerType: PenaltyTriggerType
  triggerCondition: string
  penaltyItemId: number
}): Promise<PenaltyRuleRow> {
  return request<PenaltyRuleRow>('/api/v1/admin/penalty-rules', { method: 'POST', body })
}
