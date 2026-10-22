/*
 * 학부모에게 보내는 **공개 주소**를 만든다.
 *
 * ★★ **관리자 도메인을 그대로 쓰지 않는다.** 지금 화면은 `admin.d-dlab.link` 에서 도는데,
 *   거기서 만든 주소를 알림톡에 넣으면 학부모가 **`admin.` 으로 시작하는 링크**를 받는다 —
 *   피싱으로 의심받기 쉽다(2026-10-22 결정: 공개 페이지는 별도 서브도메인).
 * ★ 그래서 **빌드할 때 주입한 값**(`VITE_PUBLIC_BASE_URL`)을 먼저 본다. 없으면 지금 열려
 *   있는 곳을 쓴다 — 로컬에서는 그게 맞다.
 * ⚠️ **알림톡 버튼 주소는 승인되면 못 바꾼다**(바꾸려면 재심사다). 그래서 주소를 만드는
 *   자리를 여기 하나로 모은다 — 화면마다 `window.location.origin` 을 쓰면 도메인이 바뀔 때
 *   어디를 고쳐야 하는지 세야 한다.
 *
 * ★ **토큰을 쿼리로도 받는다**(`?t=`). 카카오가 버튼 주소에 변수를 허용하지 않으면
 *   주소를 고정하고 토큰만 쿼리로 넘겨야 할 수 있다 — 라우트를 path 로만 두면 그때
 *   화면을 고쳐야 한다.
 */
const BASE = (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined)?.replace(/\/+$/, '')

function origin(): string {
  return BASE !== undefined && BASE !== '' ? BASE : window.location.origin
}

/** 공개 안내문 주소 */
export function noticeUrl(token: string): string {
  return `${origin()}/notice/${encodeURIComponent(token)}`
}

/** 대기자 응답 주소 */
export function waitlistUrl(token: string): string {
  return `${origin()}/waitlist/${encodeURIComponent(token)}`
}
