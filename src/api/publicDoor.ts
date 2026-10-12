import { request } from './client'

/* 출입문 QR 공개 경로 (추가개발 10번) — POST /api/v1/public/door/{academyCode}/code
 *
 * 아침 7시에 문이 안 열렸을 때 학생이 출입문 QR 을 찍고 들어오는 자리다.
 * **토큰이 없다** — 문 앞에 선 학생이 앱을 깔고 로그인할 상황이 아니다.
 *
 * ★ **`anonymous` 를 반드시 준다.** 안 주면 관리자 토큰이 같은 브라우저에 남아 있을 때
 *   그 토큰이 실려 나가고, 401 이 나면 재발급까지 시도한다. 공개 경로에 관리자 세션을
 *   섞지 않는다.
 *
 * ★ **거절도 200 이다**(`provided: false`). 4xx 로 내리면 응답 코드만 보고도 조건 차이가
 *   드러나고(= 번호를 두드리는 사람에게 힌트), 화면이 오류 처리로 빠져 같은 문구를
 *   띄우기 어렵다. 성공·실패는 `provided` 로만 가른다.
 *
 * ★ **거절 사유를 화면이 만들지 않는다.** 서버가 준 `message` 를 그대로 띄운다 —
 *   조건별로 전부 같은 문장이다. 「그 번호는 재원생이 아닙니다」 같은 말은
 *   **「그 번호는 우리 학생이다」의 반대 정보**가 되어 번호를 좁히는 데 쓰인다.
 *   어느 조건에 걸렸는지는 관리자 내역(`/admin/emergency-access`)에만 남는다.
 */

export interface DoorCodeAnswer {
  provided: boolean
  /** 통과했을 때만 온다 */
  code?: string | null
  /** 화면에 그대로 띄우는 문장. 거절 사유를 화면이 해석하지 않는다 */
  message: string
}

export function requestDoorCode(academyCode: string, phone: string): Promise<DoorCodeAnswer> {
  return request<DoorCodeAnswer>(`/api/v1/public/door/${encodeURIComponent(academyCode)}/code`, {
    method: 'POST',
    body: { phone },
    anonymous: true,
  })
}
