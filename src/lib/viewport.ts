import { isPublicHost } from './publicUrl'

/*
 * 화면 폭 기준을 정한다.
 *
 * ★★ `index.html` 은 **`width=1024` 로 고정**돼 있다 — 관리자 웹이 PC 전용이라
 *   폰에서는 1024 폭을 통째로 축소해 보여주고 확대해서 보는 전제다(2026-09-21 결정).
 *
 * ⚠️⚠️ **그 전제가 학부모·학생 화면에는 틀리다.** 도어락 QR·공개 안내문·대기자 응답은
 *   **휴대폰에서 읽는 화면**인데, 1024 폭으로 그려 축소되니 **글자가 깨알같이 작아진다.**
 *   CSS 를 아무리 휴대폰 기준으로 짜도 소용이 없다 — 바깥 자가 1024 다.
 *   (실제로 폰으로 열어 보고 발견했다, 2026-10-23)
 *
 * ★ 그래서 **공개 화면에서만** 기기 폭으로 바꾼다. 첫 그림이 그려지기 전에 바꿔야
 *   1024 로 한 번 깜빡이지 않는다 — `main.tsx` 가 render 전에 부른다.
 */
const PUBLIC_PATHS = /^\/(door|notice|waitlist)(\/|$|\?)/

export function applyViewport(): void {
  const onPublicPage = PUBLIC_PATHS.test(window.location.pathname) || isPublicHost()
  if (!onPublicPage) return
  const tag = document.querySelector('meta[name="viewport"]')
  if (tag === null) return
  tag.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover')
}
