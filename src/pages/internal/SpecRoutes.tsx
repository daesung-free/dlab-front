import { Route } from 'react-router-dom'
import { SpecHub } from '../SpecHub'
import { SpecPage } from '../SpecPage'

/**
 * 내부 요구사항 명세 뷰의 라우트.
 *
 * ★ 개발 빌드에만 들어간다. 프로덕션에서는 `vite.config.ts` 의 alias 가 이 파일을
 *   `SpecRoutes.stub.tsx` 로 바꿔쳐, `SpecPage`·`SpecHub` 와 그것들이 끌고 오는
 *   `data/issues.ts`·`data/assumptions.ts` 가 **모듈 그래프에 아예 안 들어온다.**
 *
 * ★ **`import.meta.env.DEV` 분기만으로는 안 된다.** 실제로 해봤는데 남았다 —
 *   `SpecPage` 가 `screen.css` 를 import 하고, CSS import 는 부작용이라 Rollup 이
 *   그 모듈을 지우지 못한다. 화면을 안 그려도 오픈이슈 42건이 번들에 남아
 *   개발자도구에서 그대로 읽힌다. **번들은 로그인 전에 내려간다.**
 *
 * 확인 방법 — `npm run build` 후:
 *   grep -c "계약 종료\|대성전산 협의" dist/assets/*.js   → 0 이어야 한다
 */
export function InternalSpecRoutes() {
  return (
    <>
      <Route path="spec" element={<SpecHub />} />
      <Route path="spec/:screenId" element={<SpecPage />} />
    </>
  )
}
