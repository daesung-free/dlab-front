import { request } from './client'

/* 와이파이 해제 신청 · 위반 (계획서 2-10) — /api/v1/admin/firewall-requests
 *
 * 학생이 인강을 보려고 앱에서 방화벽 해제를 신청한다. **승인·거절은 이 모듈이 아니라
 * 공통 승인 라우팅이 한다**(`approvals.ts`) — 여기는 그 뒤의 것들이다.
 * 지금 열려 있는 해제, 그리고 "풀어줬더니 딴 짓 하더라" 를 적발해 남기는 쪽이다.
 *
 * ★ **승인 상태와 해제 상태는 다른 축이다.** 승인됐어도 시간이 지나면 해제는 끝난다.
 *   합쳐서 하나로 보여주면 "승인됐는데 왜 안 열려요" 를 설명할 수 없다.
 *
 * ★ 위반이 쌓이면 서버가 **자동으로 신청 제한**을 건다. **횟수·기간을 화면에 적지 않는다** —
 *   지금은 2회에 2주지만 운영팀이 정한 값이 아니라 바뀔 수 있다(2026-09-18 확인).
 *   화면은 서버가 주는 `count` 와 `restrictedUntil` 을 그대로 쓴다.
 */

/** 해제 진행 상태. 승인 상태(`approvalStatus`)와 섞지 않는다 */
export type UnlockStatus = 'WAITING' | 'ACTIVE' | 'EXPIRED' | 'CANCELED'

export const UNLOCK_STATUS_LABEL: Record<UnlockStatus, string> = {
  WAITING: '대기',
  ACTIVE: '해제중',
  EXPIRED: '종료',
  CANCELED: '취소',
}

export interface FirewallRow {
  id: number
  enrollmentId: number
  studentName: string
  studentNo: string
  requestedMinutes: number
  reason: string
  /** PENDING / APPROVED / REJECTED … 공통 승인 라우팅이 정한다 */
  approvalStatus: string
  unlockStatus: UnlockStatus
  /** 아직 안 열렸으면 null */
  unlockStartAt: string | null
  unlockEndAt: string | null
  requestedAt: string
}

export function listFirewallRequests(params: {
  academyId?: number
  enrollmentId?: number
  status?: UnlockStatus
  from?: string
  to?: string
}): Promise<FirewallRow[]> {
  return request<FirewallRow[]>('/api/v1/admin/firewall-requests', { query: { ...params } })
}

/** 지금 열려 있는 것. **종료가 임박한 순으로 온다** — 순찰 돌 때 위에서부터 보면 된다 */
export function listActiveUnlocks(academyId?: number): Promise<FirewallRow[]> {
  return request<FirewallRow[]>('/api/v1/admin/firewall-requests/active', { query: { academyId } })
}

export interface ViolationRow {
  id: number
  firewallRequestId: number | null
  occurredAt: string
}

export interface ViolationSummary {
  count: number
  /** 지금 제재중이면 해제 시각, 아니면 null */
  restrictedUntil: string | null
  /** 제재를 풀 때 쓰는 id. 제재중이 아니면 null */
  restrictionId: number | null
  items: ViolationRow[]
}

export function getViolations(enrollmentId: number): Promise<ViolationSummary> {
  return request<ViolationSummary>('/api/v1/admin/firewall-requests/violations', {
    query: { enrollmentId },
  })
}

/**
 * 위반 적발 등록.
 *
 * ★ **되돌리는 버튼이 따로 없다.** 잘못 눌러 제재가 걸리면 `releaseRestriction` 으로
 *   제재만 풀 수 있고, 적발 기록 자체는 남는다. 그래서 누르기 전에 한 번 묻는다.
 * ★ 임계치에 닿는 순간 **그 자리에서 신청 제한이 걸리고, 해제중이었다면 즉시 차단된다.**
 *   등록 직후 요약을 다시 읽어 무엇이 걸렸는지 화면이 그대로 보여준다.
 */
export function recordViolation(enrollmentId: number, firewallRequestId?: number): Promise<void> {
  return request<void>('/api/v1/admin/firewall-requests/violations', {
    method: 'POST',
    query: { enrollmentId, firewallRequestId },
  })
}

/** 제재 해제 — **착오 등록 정정용이다.** 봐주는 용도로 쓰라고 만든 것이 아니다 */
export function releaseRestriction(restrictionId: number): Promise<void> {
  return request<void>(`/api/v1/admin/firewall-requests/restrictions/${restrictionId}`, {
    method: 'DELETE',
  })
}
