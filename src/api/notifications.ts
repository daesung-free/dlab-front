import { request, requestPaged } from './client'
import type { Paged } from './types'

/* 알림 템플릿 (F-4.4 문자 발송) — /api/v1/admin/notification-templates
 *
 * ★ **템플릿은 이벤트당 하나다.** `event` 가 사실상 기본키라, 같은 이벤트로 또 만들면
 *   409 다. 화면에 '새 템플릿' 버튼을 두려면 아직 안 쓴 이벤트만 골라야 한다.
 *
 * ★ **발송 가능 여부는 세 축이 모두 통과해야 한다** — 활성(`active`) · 문구 확정
 *   (`contentConfirmed`) · 심사(`reviewStatus`). 서버가 `sendable` 하나로 합쳐 준다.
 *   화면은 그 값을 보여줘야 한다. 축 하나씩 보면 "왜 알림이 안 가지"를 못 짚는다.
 *
 * ★ **승인된 알림톡 문구를 고치면 심사가 DRAFT 로 되돌아간다.** 카카오가 승인받은
 *   문구 그대로만 허용해서다 — 오타 하나 고쳐도 다시 심사를 받아야 한다.
 *   화면은 문구 수정 전에 이걸 알려야 한다.
 *
 * ⚠️ 발송 자체와 발송 이력은 API가 없다. 이 화면의 '메시지 발송'·'발송 이력' 탭은
 *   목업 그대로다(API_GAPS 15부). */

/** 자동발송 트리거. 수동 발송용 이벤트는 없다 — 전부 이벤트 기반이다 */
export type NotificationEvent =
  | 'MISSING_ATTENDANCE'
  | 'APPROVAL_REQUEST_CREATED'
  | 'APPROVAL_APPROVED_BY_PARENT'
  | 'APPROVAL_APPROVED_AFTER_TIMEOUT'
  | 'APPROVAL_APPROVED_BEFORE_TIMEOUT'
  | 'APPROVAL_REMINDER'
  | 'APPROVAL_HANDED_OVER'
  | 'APPROVAL_APPROVED_BY_STAFF_PRIMARY'
  /** ★ 템플릿 목록에는 없고 **발송 이력에만 온다.** 빼놓으면 이력 행이 라벨 없이 코드로 찍힌다 */
  | 'APPROVAL_APPROVED_BY_ADMIN'
  | 'APPROVAL_REJECTED'
  | 'CONSULT_RESERVED'
  | 'CONSULT_CANCELED'

/** 화면에는 이 이름으로 쓴다. 코드는 코드대로 함께 보여준다 — 백엔드와 말을 맞춰야 해서다 */
export const EVENT_LABEL: Record<NotificationEvent, string> = {
  MISSING_ATTENDANCE: '미등원 안내',
  APPROVAL_REQUEST_CREATED: '승인 요청 도착',
  APPROVAL_APPROVED_BY_PARENT: '학부모 승인 완료',
  APPROVAL_APPROVED_AFTER_TIMEOUT: '기한 초과 후 승인',
  APPROVAL_APPROVED_BEFORE_TIMEOUT: '기한 내 승인',
  APPROVAL_REMINDER: '승인 재알림',
  APPROVAL_HANDED_OVER: '승인 권한 위임',
  APPROVAL_APPROVED_BY_STAFF_PRIMARY: '직원 대리 승인',
  APPROVAL_APPROVED_BY_ADMIN: '관리자 승인',
  APPROVAL_REJECTED: '승인 반려',
  CONSULT_RESERVED: '상담 예약',
  CONSULT_CANCELED: '상담 취소',
}

export type NotificationChannel = 'KAKAO_ALIMTALK' | 'FCM_PUSH'

export const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  KAKAO_ALIMTALK: '카카오 알림톡',
  FCM_PUSH: 'FCM 푸시',
}

export type RecipientType = 'STUDENT' | 'PARENT' | 'BOTH' | 'ROUTED'

export const RECIPIENT_LABEL: Record<RecipientType, string> = {
  STUDENT: '학생',
  PARENT: '학부모',
  BOTH: '학생·학부모',
  /** 승인 라우팅 규칙이 정한 사람에게 간다 — 고정 대상이 아니다 */
  ROUTED: '라우팅 대상',
}

/** `NOT_REQUIRED` 는 FCM 푸시처럼 카카오 심사가 없는 채널이다 */
export type ReviewStatus = 'NOT_REQUIRED' | 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED'

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  NOT_REQUIRED: '해당없음',
  DRAFT: '미제출',
  SUBMITTED: '심사대기',
  APPROVED: '승인',
  REJECTED: '반려',
}

export interface NotificationTemplate {
  id: number
  event: NotificationEvent
  channel: NotificationChannel
  recipientType: RecipientType
  titleTemplate: string | null
  bodyTemplate: string | null
  /** 쉼표로 이어 붙인 문자열이다 — 배열이 아니다 */
  requiredVariables: string | null
  contentConfirmed: boolean
  active: boolean
  reviewStatus: ReviewStatus
  reviewNote: string | null
  reviewedAt: string | null
  kakaoTemplateCode: string | null
  /**
   * 지금 실제로 나가는가. **활성·문구확정·심사 세 축이 모두 통과해야 true** 다.
   * 축을 따로 보면 "왜 알림이 안 가지"를 못 짚으므로 화면은 이 값을 쓴다.
   */
  sendable: boolean
  /** 마지막으로 고친 시각·사람(2026-09-21 추가). 그 전에 고친 행은 사람이 null 이다 */
  updatedAt?: string | null
  updatedByName?: string | null
}

/** `requiredVariables` 는 쉼표 문자열이라 화면에서 쪼갠다 */
export function templateVars(t: NotificationTemplate): string[] {
  return (t.requiredVariables ?? '').split(',').map((v) => v.trim()).filter(Boolean)
}

export function listNotificationTemplates(): Promise<NotificationTemplate[]> {
  return request<NotificationTemplate[]>('/api/v1/admin/notification-templates')
}

/** 심사 진행 중인 것만. 카카오 심사는 리드타임이 길어 따로 본다 */
export function listTemplatesInReview(): Promise<NotificationTemplate[]> {
  return request<NotificationTemplate[]>('/api/v1/admin/notification-templates/in-review')
}

export interface TemplateContentUpdate {
  titleTemplate: string
  bodyTemplate: string
  requiredVariables?: string
  contentConfirmed?: boolean
}

/**
 * ⚠️ **승인된 알림톡 문구를 고치면 심사가 DRAFT 로 되돌아간다.** 호출 전에 사용자에게 알린다.
 */
export function updateTemplateContent(id: number, body: TemplateContentUpdate): Promise<NotificationTemplate> {
  return request<NotificationTemplate>(`/api/v1/admin/notification-templates/${id}/content`, {
    method: 'PATCH',
    body,
  })
}

export function setTemplateActive(id: number, active: boolean): Promise<NotificationTemplate> {
  return request<NotificationTemplate>(`/api/v1/admin/notification-templates/${id}/active`, {
    method: 'PUT',
    body: { active },
  })
}

export function updateTemplateMapping(
  id: number,
  body: { channel?: NotificationChannel; recipientType?: RecipientType },
): Promise<NotificationTemplate> {
  return request<NotificationTemplate>(`/api/v1/admin/notification-templates/${id}/mapping`, {
    method: 'PATCH',
    body,
  })
}

/** 카카오 심사 제출. 알림톡만 대상이다 */
export function submitTemplateReview(id: number, kakaoTemplateCode: string): Promise<NotificationTemplate> {
  return request<NotificationTemplate>(`/api/v1/admin/notification-templates/${id}/review/submit`, {
    method: 'POST',
    body: { kakaoTemplateCode },
  })
}

/** 심사 결과 입력. 카카오와 자동 연동 창구가 없어 사람이 보고 넣는다 */
export function recordTemplateReviewResult(
  id: number,
  approved: boolean,
  note?: string,
): Promise<NotificationTemplate> {
  return request<NotificationTemplate>(`/api/v1/admin/notification-templates/${id}/review/result`, {
    method: 'POST',
    body: { approved, note },
  })
}

/* ── 발송 이력 (F-4.4 발송 이력 탭) ───────────────────────────
 *
 * ★ 여기 남는 것은 **자동 발송뿐이다.** 미등원·승인·상담 예약처럼 서버가 스스로 보내는
 *   건들이다. 사람이 문안을 써서 보내는 발송은 아직 없다(위 ⚠️) — 그래서 이 목록에는
 *   "누가 보냈는지"·"어느 범위로 보냈는지" 가 없다. 자동이라 보낸 사람이 없고,
 *   대상은 사유가 정한다.
 *
 * ★ **`SKIPPED` 를 실패로 세지 않는다.** 알림톡 템플릿이 심사를 통과하지 못하면 아예
 *   보내지 않고 SKIPPED 로 남긴다. 실패로 뭉뚱그리면 "발송이 죽었다" 로 읽히는데
 *   실제로는 **심사가 끝나면 그대로 나간다.**
 */

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'

export const NOTIFICATION_STATUS_LABEL: Record<NotificationStatus, string> = {
  PENDING: '발송 대기',
  SENT: '발송됨',
  FAILED: '실패',
  /** 보내지 않고 넘어간 건. 대개 알림톡 템플릿이 아직 심사 중이다 */
  SKIPPED: '보류',
}

export interface NotificationLog {
  id: number
  academyId: number
  event: NotificationEvent
  channel: NotificationChannel
  status: NotificationStatus
  studentId: number | null
  studentName: string | null
  title: string
  body: string
  /** 실패·보류 사유. 나간 건이면 null */
  failReason: string | null
  /** 실제로 나간 시각. **안 나갔으면 null 이다** — 만들어진 시각(createdAt)과 다르다 */
  sentAt: string | null
  createdAt: string
}

export interface NotificationLogQuery {
  academyId?: number
  from?: string
  to?: string
  event?: NotificationEvent
  channel?: NotificationChannel
  status?: NotificationStatus
  studentId?: number
  /** 0-based */
  page?: number
  size?: number
}

/** 건별 이력. **서버 페이징이다** — useServerTable 로 붙인다 */
export function listNotificationLogs(params: NotificationLogQuery): Promise<Paged<NotificationLog>> {
  return requestPaged<NotificationLog>('/api/v1/admin/notification-logs', { query: { ...params } })
}

/**
 * 묶음 집계 — **날짜 × 사유 × 채널** 한 줄.
 *
 * ★ 발송 이력 표가 보는 것이 이쪽이다. 건별로 그리면 미등원 안내 하루치가 200줄이 되어
 *   "어제 뭐가 나갔나" 를 못 본다. 건별은 학생을 짚어서 볼 때 쓴다.
 * ★ **페이징이 없다.** 기간을 넓게 잡으면 그만큼 그대로 온다.
 */
export interface NotificationSummaryRow {
  date: string
  event: NotificationEvent
  channel: NotificationChannel
  total: number
  sent: number
  failed: number
  skipped: number
  /** 그 묶음에서 가장 이른 시각 */
  firstAt: string
}

export function getNotificationSummary(params: {
  academyId?: number
  from?: string
  to?: string
}): Promise<NotificationSummaryRow[]> {
  return request<NotificationSummaryRow[]>('/api/v1/admin/notification-logs/summary', { query: { ...params } })
}
