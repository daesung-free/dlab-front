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
