import { request } from './client'

/* 앱 운영 (F-C-6) — /api/v1/admin/app-config
 *
 * ★ 앱이 **부팅할 때 첫 번째로 읽는 값**이다. 여기를 잘못 만지면 앱이 안 열린다.
 *
 * ★ **점검 모드는 켜는 순간 그 플랫폼 전 사용자가 앱을 못 쓴다.** 화면에 상태를 반드시
 *   드러낸다 — 켜져 있는데 아무 데도 안 보이면 "왜 앱이 안 되지"를 못 짚는다.
 *
 * ★ 약관은 **고치는 게 아니라 버전을 올려 새 행을 추가한다.** 수정 API가 없는 것이
 *   실수가 아니다 — 덮어쓰면 이미 동의한 사람들의 동의 근거가 사라진다.
 *
 * ⚠️ 푸시 발송 이력·배너 클릭수는 API가 없다(API_GAPS 17부). */

export type Platform = 'IOS' | 'ANDROID'

export const PLATFORM_LABEL: Record<Platform, string> = {
  IOS: 'iOS',
  ANDROID: 'Android',
}

export interface AppConfigDetail {
  id: number
  platform: Platform
  /** 이 버전 **미만**은 실행 시 업데이트 게이트에 막힌다 */
  minVersion: string | null
  latestVersion: string | null
  maintenance: boolean
  maintenanceMessage: string | null
  maintenanceUntil: string | null
}

export function listAppConfigs(): Promise<AppConfigDetail[]> {
  return request<AppConfigDetail[]>('/api/v1/admin/app-config')
}

/** `null` 필드는 "변경하지 않음"이다 — 지우는 수단이 아니다 */
export function updateAppVersions(
  platform: Platform,
  body: { minVersion?: string; latestVersion?: string },
): Promise<AppConfigDetail> {
  return request<AppConfigDetail>(`/api/v1/admin/app-config/${platform}/versions`, { method: 'PATCH', body })
}

/** ⚠️ 켜면 그 플랫폼 전 사용자가 앱을 못 쓴다. 호출 전에 확인을 받는다 */
export function setMaintenance(
  platform: Platform,
  body: { maintenance: boolean; message?: string; until?: string },
): Promise<AppConfigDetail> {
  return request<AppConfigDetail>(`/api/v1/admin/app-config/${platform}/maintenance`, { method: 'PUT', body })
}

export interface Terms {
  id: number
  /** null 이면 전 지점 공통 */
  academyId: number | null
  /** 종류를 가리키는 코드. 같은 코드의 여러 버전이 이력으로 쌓인다 */
  code: string
  version: string
  title: string
  required: boolean
  effectiveAt: string | null
}

export function listTerms(academyId?: number): Promise<Terms[]> {
  return request<Terms[]>('/api/v1/admin/app-config/terms', { query: { academyId } })
}

export interface TermsCreate {
  academyId?: number
  code: string
  version: string
  title: string
  content: string
  required?: boolean
  effectiveAt?: string
}

/**
 * 약관 등록.
 *
 * ★ **기존 문구를 고치는 API는 없다.** 개정은 버전을 올려 새로 등록하는 것이다 —
 *   덮어쓰면 이미 동의한 사람들의 근거가 사라진다.
 */
export function createTerms(body: TermsCreate): Promise<Terms> {
  return request<Terms>('/api/v1/admin/app-config/terms', { method: 'POST', body })
}

export interface TermsStatus {
  termsId: number
  code: string
  version: string
  title: string
  required: boolean
  /**
   * ★ `null` 이면 **아직 응답한 적이 없다** — '동의 안 함'과 다르다.
   *   섞으면 가입 흐름에서 다시 물어볼지를 판단하지 못한다.
   */
  agreed: boolean | null
  agreedAt: string | null
}

/** 계정 하나의 동의 현황. **전체 동의율을 내는 경로는 없다**(API_GAPS 17-3) */
export function getTermsAgreements(accountId: number): Promise<TermsStatus[]> {
  return request<TermsStatus[]>(`/api/v1/admin/app-config/terms/agreements/${accountId}`)
}
