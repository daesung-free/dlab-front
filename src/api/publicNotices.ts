import { request } from './client'

/* 공개 안내문 (알림톡 「등록비 안내」 버튼이 여는 자리) — GET /api/v1/public/notices/{token}
 *
 * 관리자가 쓴 공지를 **로그인 없이** 학부모가 보는 페이지다. 디랩 홈페이지에 쓸 만한
 * 안내문 주소가 없어서 우리가 만든다(2026-10-22 결정).
 *
 * ★ **`anonymous` 를 반드시 준다.** 안 주면 관리자 토큰이 같은 브라우저에 남아 있을 때
 *   그 토큰이 실려 나가고, 401 이 나면 재발급까지 시도한다 — 공개 경로에 관리자 세션을
 *   섞지 않는다(도어락 QR 과 같은 이유).
 *
 * ★ **없는 토큰도 200 이다**(`available: false`). 404 로 내리면 **응답 코드만 보고도
 *   「그 링크는 있다/없다」가 갈려** 주소를 두드려 보는 쪽에 힌트가 된다. 성공·실패는
 *   `available` 로만 가른다.
 *
 * ⚠️ **첨부는 공개 주소여야 한다.** 관리자 첨부(`/admin/files/...`)는 토큰이 있어야 열려서,
 *   안내문에 파일을 붙이면 **글만 보이고 파일은 안 열린다.** 서버가 이 응답에 담아 주는
 *   주소를 그대로 쓴다 — 화면이 주소를 만들지 않는다.
 */

export interface PublicAttachment {
  originalName: string
  sizeBytes: number
  /** 서버가 준 주소를 그대로 쓴다. 화면이 조립하지 않는다 */
  url: string
}

export interface PublicNotice {
  available: boolean
  /** 볼 수 없을 때만 온다. 사유를 화면이 해석하지 않고 그대로 띄운다 */
  message?: string
  title?: string
  /** 줄바꿈이 그대로 온다. HTML 이 아니다 — 그대로 그린다 */
  content?: string
  academyName?: string
  /** ISO */
  postedAt?: string
  attachments?: PublicAttachment[]
}

export function getPublicNotice(token: string): Promise<PublicNotice> {
  return request<PublicNotice>(`/api/v1/public/notices/${encodeURIComponent(token)}`, {
    anonymous: true,
  })
}
