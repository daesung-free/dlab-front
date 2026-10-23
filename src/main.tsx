import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import { applyViewport } from './lib/viewport'
import './styles/base.css'
import './styles/print.css'

/**
 * offline 빌드(npm run build:offline)는 file:// 에서 열리므로 history API를 쓸 수 없다.
 * 이때만 HashRouter로 바꿔 끼운다. 일반 빌드·dev는 BrowserRouter 그대로.
 */
const Router = import.meta.env.MODE === 'offline' ? HashRouter : BrowserRouter

/* ★ **그리기 전에** 폭 기준을 정한다. 공개 화면(도어락·안내문·대기자)은 휴대폰 기준이고
   관리자 화면은 1024 그대로다 — 늦게 바꾸면 1024 로 한 번 깜빡인다 */
applyViewport()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
