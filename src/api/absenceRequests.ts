import { request } from './client'

/* 사유 신청 관리 (F-4.1-5) — GET /api/v1/admin/absence-requests
 *
 * ★ 지금은 페이징이 없다. 기간 전량이 한 번에 온다.
 *
 * ⚠️ **서버 페이징이 예정돼 있다**(2026-09-02 백엔드 회신). 백엔드가 넣고 알려주기 전에
 *   useServerTable 로 옮기면 응답에 meta 가 없어 목록이 통째로 빈다 — penalties.ts 주석 참고.
 *   ★ 이 화면은 탭 건수를 기간 전량에서 세고 있다. 페이징이 들어오면 탭 건수를
 *     서버 summary 나 별도 호출로 옮겨야 한다(지금 summary 에는 pending 만 있다).
 *
 * ★ 승인·반려는 **이 엔드포인트에 없다.** 목록이 실어주는 approvalRequestId 로
 *   /approvals/{id}/approve|reject 를 부른다. 승인 로직을 두 벌 만들면 타임아웃·
 *   에스컬레이션 처리가 갈리기 때문이다.
 *
 * ★ 기간을 안 주면 서버 기본값이 **이번 달 1일 ~ 오늘**이다. 지난달 건을 찾을 때
 *   from 을 안 넘기면 "없는 것처럼" 보인다.
 */

/** 신청 유형. 화면 라벨과 1:1로 붙는다 */
export type AbsenceType = 'ABSENCE' | 'LATE' | 'EARLY_LEAVE' | 'OUTING'

export const ABSENCE_TYPE_LABEL: Record<AbsenceType, string> = {
  ABSENCE: '결석',
  LATE: '지각',
  EARLY_LEAVE: '조퇴',
  OUTING: '외출',
}

/**
 * 승인 주체.
 *
 * ★ ADMIN 은 승인 정책으로 고를 수 없다 — 라우팅 대상이 아니라 **처리 결과**다
 *   (관리자가 대리로 처리한 건). 목록의 approverType 은 정책상 대상이라 보통
 *   PARENT·TEACHER 지만, 서버 enum 에 있으므로 화면이 받아낼 수 있어야 한다.
 */
export type ApproverType = 'PARENT' | 'TEACHER' | 'AUTO' | 'ADMIN'

export const APPROVER_TYPE_LABEL: Record<ApproverType, string> = {
  PARENT: '학부모 승인',
  TEACHER: '담임 승인',
  AUTO: '자동 승인',
  ADMIN: '관리자 처리',
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED'

export const APPROVAL_STATUS_LABEL: Record<ApprovalStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELED: '취소',
}

export interface AbsenceRequestRow {
  id: number
  /** 승인·반려는 이 id 로 /approvals 를 부른다. 위 id 와 다른 값이다 */
  approvalRequestId: number
  /** ISO instant (UTC). 화면 표기는 로컬 시각으로 바꿔야 한다 */
  submittedAt: string
  studentNo: string | null
  name: string
  className: string | null
  type: AbsenceType
  /** 서버가 만든 '13:00 ~ 15:00' · '종일' 문자열. 화면은 그대로 찍는다 */
  period: string
  reason: string | null
  approverType: ApproverType
  status: ApprovalStatus
  /** 학부모가 타임아웃까지 응답하지 않아 담임에게 넘어갈 후보 */
  escalationCandidate: boolean
}

/**
 * 상단 통계.
 *
 * ★ penaltyConflictUnavailable 은 값이 아니라 **미지원 표시**다. 화면의
 *   '벌점 확정 충돌' 타일에 채울 값이 서버에 없다(I-10 기준 미확정, API_GAPS).
 */
export interface AbsenceSummary {
  pending: number
  approved: number
  rejected: number
  canceled: number
  waitingParent: number
  waitingTeacher: number
  escalationCandidate: number
  penaltyConflictUnavailable: number
}

export interface AbsenceBoard {
  rows: AbsenceRequestRow[]
  summary: AbsenceSummary
  masked: boolean
}

export interface AbsenceParams {
  academyId?: number
  /** yyyy-MM-dd. 비우면 이번 달 1일 */
  from?: string
  /** yyyy-MM-dd. 비우면 오늘 */
  to?: string
  status?: ApprovalStatus
}

export function fetchAbsenceRequests(params: AbsenceParams): Promise<AbsenceBoard> {
  return request<AbsenceBoard>('/api/v1/admin/absence-requests', { query: { ...params } })
}

/**
 * 관리자 직접 등록.
 *
 * ★ 자동 승인이 아니다 — 승인 라우팅을 그대로 탄다. 관리자가 넣었다고 건너뛰면
 *   학부모 승인이 필요한 유형에서 학부모가 모르는 사이에 처리된다.
 *
 * ⚠️ 해당 연도·지점에 승인 정책(approval_item)이 없으면 APPROVAL_ITEM_NOT_FOUND 로 막힌다.
 *   "왜 등록이 안 되지"의 대부분이 이것이다.
 */
export function registerAbsenceRequest(body: {
  enrollmentId: number
  /** yyyy-MM-dd */
  date: string
  type: AbsenceType
  reason?: string
  /** 외출·조퇴 시작. 결석·지각은 종일이라 비운다 */
  startTime?: string
  /** 외출 종료. 조퇴는 복귀가 없어 비운다 */
  endTime?: string
}): Promise<number> {
  return request<number>('/api/v1/admin/absence-requests', { method: 'POST', body })
}

/**
 * 승인 — 관리자 대리 처리.
 *
 * ★ 남의 지점 건은 서버가 막는다(verifyAdminScope). 어느 role 까지 여는지는
 *   I-12(승인 주체 매트릭스) 확정 전이므로, 권한 오류는 화면이 그대로 보여준다.
 * ★ 처리 결과는 approverType=ADMIN 으로 남는다. 담임으로 기록하면 "누가 승인했나"에
 *   답할 수 없기 때문이다.
 */
export function approveRequest(approvalRequestId: number): Promise<unknown> {
  return request(`/api/v1/admin/approvals/${approvalRequestId}/approve`, { method: 'POST' })
}

/** 반려. 사유가 학생·학부모에게 그대로 전달되므로 빈 값으로 보내지 않는다 */
export function rejectRequest(approvalRequestId: number, reason: string): Promise<unknown> {
  return request(`/api/v1/admin/approvals/${approvalRequestId}/reject`, {
    method: 'POST',
    body: { reason },
  })
}
