import { request } from './client'

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
