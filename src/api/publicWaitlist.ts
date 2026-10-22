import { request } from './client'

/* 대기자 응답 (알림톡 「대기자 안내」 버튼이 여는 자리) — /api/v1/public/waitlist/{token}
 *
 * 자리가 났을 때 학부모에게 보내는 알림톡의 [등록하겠습니다] · [등록하지 않겠습니다] 가
 * 여기로 온다. 누른 결과가 **대기자 상태를 바로 바꾼다** — 전화를 받아 적는 일을 없애는 것이
 * 목적이다(2026-10-22 서버 확인).
 *
 * ★ **`anonymous` 를 반드시 준다.** 공개 경로에 관리자 세션을 섞지 않는다(도어락·안내문과 같다).
 *
 * ★ **답은 한 번만 할 수 있다**(사장님 결정). 두 번째 요청은 400 이 아니라
 *   `accepted: false` + 문장으로 온다. 바꿔야 하면 학원에 전화하고 직원이 관리자 웹에서
 *   고친다 — 그 변경은 「직원 변경」으로 따로 남는다.
 *
 * ★★ **「답을 못 바꾸는 것」과 「링크가 죽는 것」은 다르다.** 토큰을 1회용으로 죽이면
 *   누른 뒤 다시 열었을 때 페이지가 안 열리고, **「눌렀는데 아무 일도 없었다」로 전화가 온다.**
 *   그래서 페이지는 계속 열리고 `answered` 로 **자기가 뭘 눌렀는지** 보여준다. 버튼만 사라진다.
 *
 * ★ **없는 토큰·기한 지남도 200 이다**(`available: false`). 404 로 내리면 응답 코드만 보고도
 *   「그 링크는 있다/없다」가 갈려 주소를 두드려 보는 쪽에 힌트가 된다.
 */

export type WaitlistAnswer = 'ACCEPT' | 'DECLINE'

export const WAITLIST_ANSWER_LABEL: Record<WaitlistAnswer, string> = {
  ACCEPT: '등록하겠습니다',
  DECLINE: '등록하지 않겠습니다',
}

export interface WaitlistInvite {
  available: boolean
  /** 볼 수 없을 때만 온다. 사유를 화면이 해석하지 않고 그대로 띄운다 */
  message?: string
  studentName?: string
  academyName?: string
  /** ISO. 이때까지 답해야 한다 */
  deadline?: string
  /** 이미 답했으면 그 값. 아직이면 null */
  answered?: WaitlistAnswer | null
  /** ISO. 학생이 자기 기억과 대조할 수 있게 화면에 적는다 */
  answeredAt?: string | null
}

export interface WaitlistReply {
  accepted: boolean
  /** 받아들여졌을 때도, 이미 답했을 때도 서버 문장을 그대로 띄운다 */
  message: string
}

export function getWaitlistInvite(token: string): Promise<WaitlistInvite> {
  return request<WaitlistInvite>(`/api/v1/public/waitlist/${encodeURIComponent(token)}`, {
    anonymous: true,
  })
}

export function answerWaitlist(token: string, answer: WaitlistAnswer): Promise<WaitlistReply> {
  return request<WaitlistReply>(`/api/v1/public/waitlist/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: { answer },
    anonymous: true,
  })
}
