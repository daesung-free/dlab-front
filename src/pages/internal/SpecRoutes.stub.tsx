/**
 * 프로덕션 빌드용 대체본 — `vite.config.ts` 의 alias 가 여기로 바꿔친다.
 *
 * ★ 왜 대체본이 필요한가. 진짜 `SpecRoutes` 는 `SpecPage` 를 정적 import 하고,
 *   `SpecPage` 는 `screen.css` 를 import 한다. CSS import 는 **부작용**이라
 *   Rollup 이 그 모듈을 죽은 코드로 못 지운다 — `import.meta.env.DEV` 로 분기해도
 *   `data/issues.ts` 의 오픈이슈 42건이 번들에 그대로 남는다(실제로 남았다).
 *   그래서 라우트를 죽이는 대신 **모듈 그래프에서 들어내는** 방법을 쓴다.
 */
export function InternalSpecRoutes() {
  return null
}
