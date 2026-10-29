import { request } from './client'

/* 보호자 연락처 (F-4.1-1 학원생 관리 부속) — /admin/students/{enrollmentId}/guardians
 *
 * ★★ **발송 조건을 화면이 단정하지 않는다.** 이 사실이 며칠 사이 **세 번** 바뀌었다.
 *
 *   ```
 *   ① 「번호만 있으면 간다」                 처음 들은 것
 *   ② 「계정이 있어야 한다」                 백엔드 정정 — 코드가 실제로 그랬다
 *   ③ 「번호만 있어도 된다」                 #290 으로 경로를 만들어 배포
 *   ④ ★ 그런데 **수동 발송은 아직 계정을 요구한다** (2026-10-29 운영 실측)
 *      POST /notifications/manual/preview → reason=NO_ACCOUNT
 *      "알림을 받을 계정이 없습니다. 학부모 앱 가입이 필요합니다."
 *   ```
 *
 *   ★ **자동 발송과 수동 발송이 다를 수 있다.** 확인 요청 중이다.
 *   그래서 화면은 **「연락처가 비어 있다」만 말하고**(눈으로 아는 사실), **무엇을 채우면
 *   가는지는 서버가 준 사유를 그대로** 보여준다(`error.data.summary` · #297).
 *   ★ 서버 동작을 **단정하기 전에 그 자리에서 확인한다**(CLAUDE.md 4).
 *
 *   ⚠️ 운영 발송이 0건인 것은 **기능이 없어서가 아니다** — 시드 번호가 미배정 대역이고
 *   수신 허용목록에 담당자 번호 하나만 들어 있다. 둘 다 이관 전까지의 안전장치다.
 *
 * ★ **번호는 형식 검증을 하지 않는다 — 저장된 그대로 비교·발송에 쓰인다.**
 *   기존 데이터가 전부 하이픈 포함(`010-1234-5678`)이라 **섞이면 중복 판정이 어긋난다.**
 *   화면이 하이픈을 붙여 보낸다.
 *
 * ★★ **마스킹된 값을 그대로 저장하면 400 이다**(`010-****-5678` · `김*수`).
 *   목록에서 받은 값을 입력칸에 그대로 채우면 밟는다 — 조회 응답이 가려져 오기 때문이다.
 *   더 나쁜 경우는 **저장에 성공했는데 화면에는 원래도 가려져 보여** 한동안 아무도
 *   눈치채지 못하는 것이다. 화면은 **새로 입력한 값만** 보낸다.
 */

export interface Guardian {
  guardianId: number
  name: string
  /** ★ 가려져 올 수 있다. `masked` 를 보고 판단한다 */
  phone: string
  /** 부·모·기타 목록 순서(1~9). **관계명이 아니다** */
  relationOrder: number
  /**
   * ⚠️ **승인 동작을 바꾸지 않는다.** 승인 경로가 이 값을 읽지 않아, 지정하지 않은
   *   보호자도 승인할 수 있다(2026-10-12 회신 — 부·모 양쪽 알림 + 선착순 승인).
   *   그래서 화면에서 **「승인자」로 안내하지 않는다** — 그렇게 쓰면 담당자가
   *   「이 사람만 승인할 수 있다」로 읽는다.
   */
  approver: boolean
  /** true 면 `phone`·`name` 이 서버에서 이미 가려진 값이다. 화면에서 또 가리지 않는다 */
  masked: boolean
}

export function listGuardians(enrollmentId: number): Promise<Guardian[]> {
  return request<Guardian[]>(`/api/v1/admin/students/${enrollmentId}/guardians`)
}

/**
 * 보호자 추가.
 *
 * ★★ **형제는 보호자를 공유한다.** 번호에 UNIQUE 가 걸려 있어 같은 번호면 기존 보호자에
 *   **연결만 더한다.** 그래서 **이름을 고쳐도 반영되지 않는다** — 덮으면 다른 자녀 화면의
 *   이름까지 바뀌기 때문이다(이름 수정 경로는 없다). 화면이 그 말을 해야 한다.
 */
export function addGuardian(
  enrollmentId: number,
  body: { name: string; phone: string; relationOrder?: number; approver?: boolean },
): Promise<Guardian> {
  return request<Guardian>(`/api/v1/admin/students/${enrollmentId}/guardians`, {
    method: 'POST',
    body,
  })
}

/**
 * 보호자 **연결 해제**.
 *
 * ★ **보호자 행을 지우는 것이 아니라 이 학생과의 연결만 끊는다.** 형제가 같은 보호자를
 *   쓰고 있어도 **다른 자녀의 연결은 그대로 남는다**(서버 테스트로 고정). 그래서 화면에
 *   「다른 자녀도 끊긴다」는 경고를 넣지 않는다 — 넣으면 지워도 되는 것을 못 지운다.
 */
export function removeGuardian(enrollmentId: number, guardianId: number): Promise<void> {
  return request<void>(`/api/v1/admin/students/${enrollmentId}/guardians/${guardianId}`, {
    method: 'DELETE',
  })
}

/** 가려진 값인지. 저장하면 400 이라 **보내기 전에** 거른다 */
export function looksMasked(v: string): boolean {
  return v.includes('*')
}
