import { request } from './client'

/* 승인 라우팅 (F-4.11-5) — /api/v1/admin/approval-items
 *
 * ★ 이 화면이 다루는 것은 **항목별 승인 주체 설정**이다.
 *   진행 중인 승인 요청 목록(/admin/approvals)은 `hasRole('TEACHER')` 라
 *   "내가 담당선생님인 대기 목록"이다 — 관리자는 못 본다(docs/API_GAPS.md).
 *
 * ★ `configured=false` 는 단순히 비어 있는 게 아니다. **그 유형의 신청은 거절된다.**
 *   화면에서 미설정을 눈에 띄게 표시해야 하는 이유다. */

export type RequestType = 'FIREWALL_UNLOCK' | 'ABSENCE_REASON' | 'REGULAR_SCHEDULE'
export type ApproverType = 'PARENT' | 'TEACHER' | 'AUTO'

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  ABSENCE_REASON: '결석·지각·조퇴 사유 신청',
  REGULAR_SCHEDULE: '정기일정 (병원·학원 등)',
  FIREWALL_UNLOCK: '와이파이 방화벽 해제 (인강)',
}

/** 목업의 분류 축. 서버에는 없어서 화면이 갖는다 */
export const REQUEST_TYPE_CATEGORY: Record<RequestType, string> = {
  ABSENCE_REASON: '출결',
  REGULAR_SCHEDULE: '출결',
  FIREWALL_UNLOCK: '학습',
}

export const APPROVER_LABEL: Record<ApproverType, string> = {
  PARENT: '학부모',
  TEACHER: '담임',
  AUTO: '자동',
}

export interface ApprovalItem {
  requestType: RequestType
  /** false면 아직 안 정한 유형이다 — **그 신청은 거절된다** */
  configured: boolean
  approverType: ApproverType | null
  timeoutMinutes: number | null
  escalationApproverType: ApproverType | null
  itemId: number | null
  /** 전년도 복사 원본. null이면 그 해에 새로 만든 것 */
  copiedFrom: number | null
}

export interface ApprovalItemSave {
  academyId: number
  year: number
  approverType: ApproverType
  timeoutMinutes?: number
  escalationApproverType?: ApproverType
}

export function listApprovalItems(academyId: number, year: number): Promise<ApprovalItem[]> {
  return request<ApprovalItem[]>('/api/v1/admin/approval-items', { query: { academyId, year } })
}

export function saveApprovalItem(requestType: RequestType, body: ApprovalItemSave): Promise<ApprovalItem> {
  return request<ApprovalItem>(`/api/v1/admin/approval-items/${requestType}`, { method: 'PUT', body })
}

/** 설정 해제 — 되돌리면 그 유형의 신청이 다시 거절된다 */
export function clearApprovalItem(requestType: RequestType, academyId: number, year: number): Promise<void> {
  return request<void>(`/api/v1/admin/approval-items/${requestType}`, {
    method: 'DELETE',
    query: { academyId, year },
  })
}
