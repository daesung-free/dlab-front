import { request } from './client'

/* 보호자 연락처 (F-4.1-1 학원생 관리 부속) — /admin/students/{enrollmentId}/guardians
 *
 * ★★ **번호만 넣는다고 알림톡이 가지 않는다.** 학부모 대상 발송은 전부
 *   **학부모 앱 계정**을 통해 수신자를 찾는다 — 계정이 없는 보호자는 수동 발송에서
 *   `NO_ACCOUNT` 로 제외된다(2026-10-26 백엔드 정정).
 *
 *   ⚠️ 그래서 **지금은 등록해도 아무것도 나가지 않는다.** 앱이 출시 전이라 학부모가
 *   가입할 방법이 없다(11/30 심사 제출 예정). 운영에 보호자가 1명뿐인 것도 그 때문이고
 *   **버그가 아니다.** 화면이 이 말을 해야 「등록했는데 왜 안 가지」를 찾지 않는다.
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
