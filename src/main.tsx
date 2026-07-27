import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App'
import './styles/base.css'

/**
 * offline 빌드(npm run build:offline)는 file:// 에서 열리므로 history API를 쓸 수 없다.
 * 이때만 HashRouter로 바꿔 끼운다. 일반 빌드·dev는 BrowserRouter 그대로.
 */
const Router = import.meta.env.MODE === 'offline' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
