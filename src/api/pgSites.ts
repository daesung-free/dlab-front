import { request } from './client'

/* PG 가맹점(MID) 설정 (F-C-5 결제 관리 · PG 연동 설정) — /api/v1/admin/pg-sites
 *
 * ★ **지점 × 용도 × 채널마다 MID 가 따로다.** 교습비와 급식이 다른 상점이고, 결제 링크·
 *   단말기·가상계좌·현금영수증도 각각이다 — 하나로 묶으면 **정산이 섞인다.**
 *
 * ★ **`ready` 가 「지금 쓸 수 있는가」다.** 등록만 해두고 인증키가 안 들어온 상태가 있어
 *   `active` 와 다르다 — 화면은 이 값으로 「연동 완료/대기」를 가른다.
 *
 * ⚠️ **인증서·개인키는 이 경로로 다루지 않는다.** 서버가 따로 보관하고 응답에 내려주지
 *   않는다 — 화면에 보일 이유가 없고, 보이면 그 화면을 캡처하는 순간 새어 나간다.
 */

export type PgPurpose = 'TUITION' | 'MEAL'
export type PgChannel = 'BUYLINK' | 'TERMINAL' | 'VBANK' | 'CASH_RECEIPT'

export const PG_PURPOSE_LABEL: Record<PgPurpose, string> = {
  TUITION: '교습비',
  MEAL: '급식',
}

/** ★ 화면 말로 쓴다 — `BUYLINK` 는 담당자에게 「결제 링크」다 */
export const PG_CHANNEL_LABEL: Record<PgChannel, string> = {
  BUYLINK: '결제 링크',
  TERMINAL: '단말기',
  VBANK: '가상계좌',
  CASH_RECEIPT: '현금영수증',
}

export interface PgSite {
  id: number
  academyId: number | null
  academyName: string | null
  purpose: PgPurpose
  channel: PgChannel
  /** 상점 코드(MID) */
  siteCd: string
  /** 상점관리자 아이디 */
  mgmtId: string | null
  displayName: string
  vendorId: number | null
  vendorName: string | null
  active: boolean
  /** 지금 결제가 되는가. 등록만 하고 인증키가 안 온 상태와 가른다 */
  ready: boolean
}

export function listPgSites(): Promise<PgSite[]> {
  return request<PgSite[]>('/api/v1/admin/pg-sites')
}

export function createPgSite(body: {
  academyId?: number
  purpose: PgPurpose
  channel: PgChannel
  siteCd: string
  mgmtId?: string
  displayName: string
  vendorId?: number
}): Promise<PgSite> {
  return request<PgSite>('/api/v1/admin/pg-sites', { method: 'POST', body })
}

export function updatePgSite(
  siteId: number,
  body: { siteCd?: string; mgmtId?: string; displayName?: string; vendorId?: number },
): Promise<PgSite> {
  return request<PgSite>(`/api/v1/admin/pg-sites/${siteId}`, { method: 'PATCH', body })
}

/**
 * 사용/중지.
 *
 * ⚠️ **중지하면 그 조합으로는 결제를 만들 수 없다.** 교습비·결제 링크를 중지해 두고
 *   「왜 링크가 안 만들어지지」를 찾게 되는 자리라, 화면이 그 뜻을 적어야 한다.
 */
export function setPgSiteActive(siteId: number, active: boolean): Promise<PgSite> {
  /* ⚠️ **본문이 아니라 쿼리로 받는다**(`PATCH ?active=`). 본문에 담으면 조용히 무시된다 */
  return request<PgSite>(`/api/v1/admin/pg-sites/${siteId}/active`, {
    method: 'PATCH',
    query: { active },
  })
}
