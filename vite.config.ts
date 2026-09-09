import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * mode = 'offline' 일 때는 웹서버 없이 index.html을 더블클릭해서 열 수 있는 번들을 만든다.
 *   · base './'  — file:// 에서 에셋 경로가 깨지지 않도록 상대경로
 *   · HashRouter — file:// 은 history API를 못 쓰므로 main.tsx가 라우터를 바꿔 끼운다
 * Node·웹서버가 없는 사람(백엔드·기획)에게 zip으로 전달하는 용도.
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'offline' ? './' : '/',
  plugins: [react()],
  /**
   * 내부 요구사항 명세 뷰(`/spec`)를 **개발 빌드에만** 남긴다.
   *
   * ★ 오픈이슈 42건(`data/issues.ts`)에 거래처 협상 상태·계약 종료 시점·담당자가
   *   그대로 들어 있다(README 경고). 이 데이터가 번들에 실리면 로그인 게이트는
   *   의미가 없다 — **번들은 로그인 전에 브라우저로 내려간다.**
   *
   * ★ 라우트를 `import.meta.env.DEV` 로 막는 것만으로는 안 된다. SpecPage 가
   *   `screen.css` 를 import 하고 CSS import 는 부작용이라 Rollup 이 모듈을 못 지운다.
   *   실제로 그렇게 해보고 번들에서 "계약 종료"가 그대로 검색됐다. 그래서 모듈
   *   자체를 빈 것으로 바꿔쳐 **그래프에 안 들어오게** 한다.
   *
   * 배포 전 확인: `npm run build && grep -c "계약 종료" dist/assets/*.js` → 0
   */
  resolve:
    mode === 'development'
      ? undefined
      : {
          alias: [
            {
              find: /\/internal\/SpecRoutes$/,
              replacement: '/internal/SpecRoutes.stub',
            },
          ],
        },
  server: { port: 5173, open: true },
  build: {
    /**
     * 화면 30개를 한 번에 담아 단일 청크가 500kB를 넘는다(gzip 약 165kB).
     * 사내 공유용 목업이라 초기 로딩보다 화면 전환 즉시성이 중요해 코드 스플리팅을 하지 않았다.
     *
     * 실제 서비스 전환 시에는 라우트 단위 React.lazy로 분할할 것.
     * 단, 지금 구조에서 lazy를 도입하면 renderToString 기반 스모크 테스트가
     * Suspense fallback만 렌더하게 되므로, 검증 방식을 먼저 바꾼 뒤 적용해야 한다.
     */
    chunkSizeWarningLimit: 700,
  },
}))
