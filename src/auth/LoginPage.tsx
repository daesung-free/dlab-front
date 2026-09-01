import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from './AuthContext'
import './login.css'

export function LoginPage() {
  const { login } = useAuth()
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(loginId.trim(), password)
    } catch (err) {
      // 서버 메시지를 그대로 보여준다 — 잠김·임시비밀번호 등 사유가 메시지로 구분된다.
      setError(err instanceof ApiError ? err.message : '로그인에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1 className="login-title">D.Lab 통합관리</h1>
        <p className="login-sub">관리자 계정으로 로그인하세요.</p>

        <label className="login-label" htmlFor="loginId">아이디</label>
        <input
          id="loginId"
          className="inp"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          autoFocus
        />

        <label className="login-label" htmlFor="password">비밀번호</label>
        <input
          id="password"
          className="inp"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && <p className="login-error" role="alert">{error}</p>}

        <button className="btn pri login-submit" type="submit" disabled={busy || !loginId || !password}>
          {busy ? '로그인 중…' : '로그인'}
        </button>

        <p className="login-hint">
          로그인 5회 실패 시 계정이 잠기고, <b>자동으로 풀리지 않습니다</b>. 관리자에게 해제를 요청하세요.
        </p>
      </form>
    </div>
  )
}
