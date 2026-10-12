import { request } from './client'

/* 오전 출근 확인 (추가개발 11번) — /api/v1/admin/staff-attendance/checks
 *
 * 매일 07:05 에 서버가 지점별로 당일 출근(IN) 기록이 1건이라도 있는지 보고, 0건이면
 * 관리자에게 문자를 보낸다. 그 검사 결과와 발송 여부가 쌓인다.
 *
 * ★ **기간을 비우면 최근 2주**다. 페이징이 없다 → `useServerData`.
 * ★ **지점 파라미터가 없다.** 전 지점을 한 화면에서 본다 — 어느 지점이 안 찍혔는지가
 *   이 화면의 목적이라 지점을 좁히면 볼 이유가 없어진다.
 * ★ **휴일에도 검사한다**(요구사항 2-5, 10/8 디랩 결정). 일요일에 「발송」이 줄줄이 찍히는
 *   것이 정상이다 — 화면에서 휴일을 걸러 주면 "왜 그날은 없냐" 가 되고, 아무 말이 없으면
 *   "오작동 아니냐" 가 된다. 그래서 안내 문구로 밝힌다.
 */

export interface MorningCheck {
  id: number
  academyId: number
  academyName: string | null
  /** 검사한 근무일 (yyyy-MM-dd) */
  checkDate: string | null
  /** 검사가 돈 시각 (ISO) */
  checkedAt: string | null
  /** 그날 그 지점의 출근(IN) 기록 수 */
  inCount: number
  /** 문자를 보내야 했는가 = 출근 기록이 0건이었는가 */
  alertNeeded: boolean
  /** 실제로 나갔는가 */
  alertSent: boolean
  /**
   * 받을 사람 수.
   *
   * ★ **`alertNeeded` 가 false 면 세지 않는다 — 그때의 0 은 정상이다.**
   *   보낼 필요가 없는 날에 수신 대상을 세면 지점 수만큼 조회가 늘어나서 서버가 생략한다.
   *   그래서 경고는 `alertNeeded && recipientCount === 0` 일 때만 띄운다.
   *   이걸 안 가르면 **정상인 날에 전부 경고가 뜬다**(2026-10-12 백엔드 회신).
   */
  recipientCount: number
}

/** 화면이 그리는 세 가지 상태 */
export type AlertState = 'NOT_NEEDED' | 'SENT' | 'PENDING'

/**
 * ★ `PENDING` 은 지금은 **「문자 연동 전」**이고, 알리고가 붙은 뒤에는 **「발송 실패」**가 된다.
 *   같은 값이 시점에 따라 뜻이 달라지므로 **행마다 구분하는 필드를 두지 않는다** —
 *   연동되는 날 그 필드는 바로 의미가 없어진다. 화면은 배너로 가른다(백엔드와 합의).
 */
export function alertState(row: MorningCheck): AlertState {
  if (!row.alertNeeded) return 'NOT_NEEDED'
  return row.alertSent ? 'SENT' : 'PENDING'
}

/** 받을 사람이 아무도 없는 채로 검사만 돈 건. 설정이 안 된 상태다 */
export function hasNoRecipient(row: MorningCheck): boolean {
  return row.alertNeeded && row.recipientCount === 0
}

export interface MorningCheckQuery {
  /** yyyy-MM-dd. 비우면 서버가 최근 2주를 준다 */
  from?: string
  to?: string
}

export function listMorningChecks(q: MorningCheckQuery): Promise<MorningCheck[]> {
  return request<MorningCheck[]>('/api/v1/admin/staff-attendance/checks', {
    query: { from: q.from, to: q.to },
  })
}
