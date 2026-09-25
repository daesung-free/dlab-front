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
  /**
   * 대상 학생(2026-09-21 추가). 학생에 딸린 기록(상벌점·출결·학생 정보)만 채워진다.
   * ★ 그 전에 쌓인 기록은 비어 있다 — 소급되지 않는다
   */
  targetEnrollmentId?: number | null
  targetStudentName?: string | null
  targetStudentNo?: string | null
}

export interface AuditLogParams {
  /** yyyy-MM-dd. 안 보내면 오늘 */
  from?: string
  to?: string
  /** 서버가 주는 한국어 값 그대로 보낸다 */
  entityType?: string
  actorId?: number
  /** 등록·수정·삭제. 2026-09-25 부터 서버가 받는다(그전에는 조용히 무시됐다) */
  action?: AuditAction
  academyId?: number
  page?: number
  size?: number
}
export function listAuditLogs(params: AuditLogParams): Promise<Paged<AuditLog>> {
  return requestPaged<AuditLog>('/api/v1/admin/audit-logs', { query: { ...params } })
}
