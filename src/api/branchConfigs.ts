import { request } from './client'

/* 지점 운영 설정 (계획서 2-6) — /api/v1/admin/branch-configs
 *
 * ★ **최고관리자 전용이다.** 지점 관리자는 자기 지점도 403 이다(2026-09-18 확인) —
 *   `canSeeAdmin`(본사+지점관리자)으로 열면 메뉴는 보이는데 조회가 통째로 막힌다.
 *   화면 노출도 SUPER_ADMIN 으로 잘라야 한다.
 *
 * ★ 여기 든 값은 **틀리면 조용히 남의 것을 건드린다.**
 *   · PG 가맹점 코드 — 결제가 이 값으로 나간다. 틀리면 그 지점 결제가 통째로 실패한다
 *   · Nebula 장비 ID — 방화벽 해제가 이 장비를 향한다. 틀리면 **다른 지점 와이파이가 열린다**
 *   · 키오스크 자격증명 — 재발급하는 순간 그 지점 키오스크가 인증에 실패한다
 *   셋 다 저장 전에 무엇이 깨지는지 화면이 말해야 한다.
 */

export interface BranchConfig {
  academyId: number
  academyName: string
  /** 지점 코드. 키오스크·정산에서 쓰는 두 자리 문자열이다 */
  acadCd: string | null
  kioskClientId: string | null
  /** ★ 서버가 가려서 준다. 원본을 달라고 하는 경로는 없다 — 재발급만 된다 */
  kioskSecretMasked: string | null
  /** ★ 마찬가지로 가려져서 온다. 화면에서 또 가리지 않는다 */
  pgMerchantCodeMasked: string | null
  nebulaDeviceId: string | null
  /** 자유 형식 문자열 맵. 키가 확정되지 않아 화면은 **읽기만** 한다 */
  policy: Record<string, string>
}

export function listBranchConfigs(): Promise<BranchConfig[]> {
  return request<BranchConfig[]>('/api/v1/admin/branch-configs')
}

export function getBranchConfig(academyId: number): Promise<BranchConfig> {
  return request<BranchConfig>(`/api/v1/admin/branch-configs/${academyId}`)
}

/**
 * 변경 이력.
 *
 * ★ **값은 안 남는다.** "언제 누가 무엇을" 만 남는다 — 비밀값이라 일부러 그렇게 돼 있다.
 *   그러니 화면에서 "예전 값으로 되돌리기" 같은 것을 만들 수 없다.
 */
export interface BranchConfigHistory {
  id: number
  action: string
  detail: string
  /** 계정 번호. 이름은 안 온다 */
  changedBy: number | null
  /** 바꾼 사람 이름(2026-09-25 추가). 예전에는 계정 번호만 와서 화면에 '계정 #12' 가 찍혔다 */
  changedByName: string | null
  changedAt: string
}

export function listBranchConfigHistory(academyId: number): Promise<BranchConfigHistory[]> {
  return request<BranchConfigHistory[]>(`/api/v1/admin/branch-configs/${academyId}/history`)
}

/**
 * ★ 응답 본문이 없다. 바꾼 뒤에는 다시 읽어야 화면이 맞는다.
 *
 * ★ **빈 값으로 지울 수 없다.** 스펙에는 `minLength: 0` 이라 적혀 있는데 실제로는
 *   `"value: 공백일 수 없습니다"` 로 400 이다(2026-09-18 확인). 지우는 것은 아래 `clear*` 다.
 */
export function setPgMerchantCode(academyId: number, value: string): Promise<void> {
  return request<void>(`/api/v1/admin/branch-configs/${academyId}/pg-merchant-code`, {
    method: 'PATCH',
    body: { value },
  })
}

export function setNebulaDeviceId(academyId: number, value: string): Promise<void> {
  return request<void>(`/api/v1/admin/branch-configs/${academyId}/nebula-device-id`, {
    method: 'PATCH',
    body: { value },
  })
}

/**
 * 값 비우기(2026-09-21 추가). **`confirm` 에 지금 값을 그대로** 넣어야 지워진다 — 비우면 그 지점
 * 결제(PG)나 와이파이 해제(장비 ID)가 통째로 멈추기 때문에 서버가 일부러 한 번 더 받는다.
 * 이미 비어 있으면 그대로 성공한다.
 */
export function clearPgMerchantCode(academyId: number, confirm: string): Promise<void> {
  return request<void>(`/api/v1/admin/branch-configs/${academyId}/pg-merchant-code`, {
    method: 'DELETE',
    query: { confirm },
  })
}

export function clearNebulaDeviceId(academyId: number, confirm: string): Promise<void> {
  return request<void>(`/api/v1/admin/branch-configs/${academyId}/nebula-device-id`, {
    method: 'DELETE',
    query: { confirm },
  })
}

/**
 * 키오스크 자격증명 재발급.
 *
 * ★ **`secret` 은 다시 볼 수 없다.** 응답에 한 번 실려 오고 서버는 가린 값만 갖는다.
 * ★ 재발급하는 즉시 **그 지점 키오스크가 인증에 실패한다.** 키오스크 백엔드의 `stores`
 *   값을 같이 바꿔야 복구된다 — 누르기 전에 그 말을 화면이 해야 한다.
 */
export interface KioskCredential {
  clientId: string
  secret: string
}

export function reissueKioskCredential(academyId: number): Promise<KioskCredential> {
  return request<KioskCredential>(`/api/v1/admin/branch-configs/${academyId}/kiosk-credential`, {
    method: 'POST',
  })
}
