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
