import { useState } from 'react'
import { Modal } from '../components/common'
import { ApiError } from '../api/client'
import { changePassword } from '../api/auth'

/* 본인 비밀번호 변경.
 *
 * ★ 요구사항정의서 36개 화면에는 없다. 그런데 관리자 계정 관리(F-4.10-2)에 '비밀번호 초기화'가
 *   있어서, 초기화를 받은 사람이 **임시 비밀번호를 바꿀 데가 없는** 상태였다. 그 비밀번호는
 *   초기화해 준 사람도 아는 값이다. 화면을 새로 늘리지 않고 상단바 버튼 + 모달로만 붙인다.
 *
 * ★ 서버가 `mustChangePassword` 를 준다(JWT 의 pcr 클레임 · /auth/me). 그게 true 면
 *   `forced` 로 띄워 닫지 못하게 한다 — 닫히면 임시 비밀번호를 계속 쓰게 된다. */

interface Props {
  onClose: () => void
  /** 임시 비밀번호라서 반드시 바꿔야 하는 경우. 취소·X·Esc 가 사라진다 */
  forced?: boolean
  onDone?: () => void
}

export function PasswordModal({ onClose, forced = false, onDone }: Props) {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /* 확인란이 틀린 것은 서버까지 갈 필요가 없다. 다만 **입력 중에는 안 띄운다** —
     두 번째 칸을 치는 도중 계속 빨간 글씨가 뜨면 다 친 뒤에도 틀린 줄 안다. */
  const mismatch = again.length > 0 && next !== again
  const tooShort = next.length > 0 && next.length < 8
  const ok = cur.length > 0 && next.length >= 8 && next === again

  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      await changePassword(cur, next)
      onDone?.()
      onClose()
    } catch (e) {
      /* 모달은 열어둔 채 안에서 알린다. 닫아버리면 무엇이 틀렸는지 못 보고,
         현재 비밀번호가 틀린 경우가 대부분이라 다시 칠 수 있어야 한다.

         ★ 서버는 로그인과 같은 메시지를 준다 — "아이디 또는 비밀번호가 올바르지 않습니다".
           이 화면에서는 아이디를 입력한 적이 없어서 읽는 사람이 헷갈린다. 여기서만 바꿔 쓴다. */
      if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        setErr('현재 비밀번호가 올바르지 않습니다.')
      } else {
        setErr(e instanceof Error ? e.message : '비밀번호를 바꾸지 못했습니다.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="비밀번호 변경"
      sub={
        forced
          ? '임시 비밀번호로 로그인했습니다. 계속하려면 새 비밀번호를 정해 주세요.'
          : '새 비밀번호는 8자 이상으로 정해 주세요.'
      }
      confirmLabel="변경"
      onConfirm={() => void submit()}
      onClose={onClose}
      busy={busy}
      confirmDisabled={!ok}
      error={err}
      dismissible={!forced}
    >
      <div className="frow">
        <label className="req" htmlFor="pw-cur">
          현재 비밀번호
        </label>
        <input
          id="pw-cur"
          className="inp"
          type="password"
          autoComplete="current-password"
          value={cur}
          onChange={(e) => setCur(e.target.value)}
        />
      </div>

      <div className="frow">
        <label className="req" htmlFor="pw-new">
          새 비밀번호
        </label>
        <div>
          <input
            id="pw-new"
            className="inp"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          {tooShort && <div className="hint bad">8자 이상이어야 합니다.</div>}
        </div>
      </div>

      <div className="frow">
        <label className="req" htmlFor="pw-again">
          새 비밀번호 확인
        </label>
        <div>
          <input
            id="pw-again"
            className="inp"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
          {mismatch && <div className="hint bad">위에 입력한 비밀번호와 다릅니다.</div>}
        </div>
      </div>
    </Modal>
  )
}
