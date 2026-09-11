import { requestPaged } from './client'
import type { Paged } from './types'

/* 금일 수정 이력 (F-C-1) — GET /api/v1/admin/audit-logs
 *
 * ★ 감사 로그는 **opt-in 이다.** 모든 변경이 남는 것이 아니라 정해진 도메인만 남는다.
 *     남는 것    학생 등록 · 사유신청 · 상벌점 · 청구 · 성적 · 공지 · 직원 계정
 *     안 남는 것  휴일 · 특강 · 급식 · 설문 · 루틴 …
 *   휴일을 만들고 지워도 0건인 것이 정상이다 — 실제로 그걸로 시험해보고 "수집이 안 돈다"고
 *   잘못 판단한 적이 있다(API_GAPS 24-1). 화면을 시험할 때는 공지·상벌점으로 해야 한다.
 *
 * ★ 기간을 안 보내면 **오늘분만** 온다. 화면 이름이 '금일 수정 이력'이라 그게 기본값으로 맞다.
 */

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE'

export interface AuditLog {
  id: number
  /** 서버가 한국어로 준다 — '상벌점' · '공지' · '학생 등록' */
  entityType: string
  entityId: number
  action: AuditAction
  /** 아직 null 로 오는 건이 있다. 지점으로 거르지 못한다 */
  academyId: number | null
  actorId: number
  /**
   * 바꾼 사람.
   * ★ 배포 전에는 계정 유형('EMPLOYEE')이 그대로 왔다. 서버가 고쳤고 기존 기록도 소급된다 —
   *   화면에 'EMPLOYEE' 가 그대로 보이면 그 배포가 아직 안 올라간 것이다.
   */
  actorName: string | null
  actorIp: string | null
  /** 변경 전후 스냅샷. **아직 전부 null 이다**(서버 2차 과제) */
  changes: string | null
  /** UTC instant */
  occurredAt: string
}

export interface AuditLogParams {
  /** yyyy-MM-dd. 안 보내면 오늘 */
  from?: string
  to?: string
  /** 서버가 주는 한국어 값 그대로 보낸다 */
  entityType?: string
  actorId?: number
  academyId?: number
  page?: number
  size?: number
}

/**
 * ⚠ **`action` 은 보내지 않는다.** 서버가 그 파라미터를 받지 않고, 400 도 아니고 **조용히
 *   무시**한다. 보내면 걸러진 것처럼 보이는데 결과가 그대로라 사용자가 오해한다.
 *   (확인: `action=CREATE` 32건 · `action=DELETE` 32건 · 필터 없음 32건 — 전부 같다)
 */
export function listAuditLogs(params: AuditLogParams): Promise<Paged<AuditLog>> {
  return requestPaged<AuditLog>('/api/v1/admin/audit-logs', { query: { ...params } })
}
