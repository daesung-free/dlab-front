import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { requestDoorCode, type DoorCodeAnswer } from '../api/publicDoor'
import { ApiError } from '../api/client'
import './door-public.css'

/* 출입문 QR 공개 페이지 (추가개발 10번) — /door/:academyCode
 *
 * 아침 7시에 문이 안 열렸을 때 학생이 출입문 QR 을 찍고 들어오는 자리다.
 *
 * ★ **이 레포에서 유일하게 로그인 밖에 있는 화면이다.** App 의 Gate 보다 앞에서 라우팅해
 *   인증을 타지 않는다 — 문 앞에 선 학생이 앱을 깔고 로그인할 상황이 아니다.
 *
 * ★ **이 레포에서 유일한 휴대폰 화면이다.** 관리자 웹은 PC 전용(최소 폭 1024)인데
 *   여기는 학생 휴대폰에서 열린다. 그래서 공통 레이아웃·사이드바를 쓰지 않고
 *   전용 CSS 한 장만 쓴다 — 관리자 쪽 스타일을 끌어오면 1024 전제가 따라온다.
 *
 * ★ **거절 사유를 화면이 만들지 않는다.** 서버가 준 `message` 를 그대로 띄운다.
 *   조건을 알려주면 번호를 바꿔 가며 두드리는 사람에게 힌트가 된다.
 *
 * ★ **거절도 200 이다.** 성공·실패를 `provided` 로만 가른다. 통신 자체가 실패했을 때만
 *   오류 문구를 쓰고, 그때도 조건을 추측할 수 있는 말은 쓰지 않는다.
 *
 * ★ 번호를 받은 뒤에는 **다시 묻지 않는다** — 받은 번호를 크게 띄우고 끝낸다.
 *   문 앞에서 작은 글씨를 두 번 읽게 하지 않는다.
 */

/** 서버가 정규화하지만, 빈 입력과 명백한 오타는 보내기 전에 거른다 */
function normalized(v: string): string {
  return v.replace(/[^\d]/g, '')
}

export function DoorPublic() {
  const { academyCode = '' } = useParams()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [answer, setAnswer] = useState<DoorCodeAnswer | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const digits = normalized(phone)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (digits.length < 10) {
      setFailed('휴대폰 번호를 다시 확인해 주세요.')
      return
    }
    setBusy(true)
    setFailed(null)
    try {
      setAnswer(await requestDoorCode(academyCode, digits))
    } catch (err) {
      /* ★ 통신 실패만 여기로 온다 — 거절은 200 이라 answer 로 간다.
            서버 문구가 있으면 그대로 쓰고, 없으면 "잠시 후 다시" 로만 말한다 */
      setFailed(err instanceof ApiError ? err.message : '잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="door-page">
      <main className="door-card">
        <h1 className="door-title">출입문 비밀번호</h1>

        {answer === null ? (
          <>
            <p className="door-lead">
              정식 개원 시간은 오전 7시입니다.
              <br />
              오전 7시 이후에도 출입문이 닫혀 있다면
              <br />
              아래 정보를 입력해 비밀번호를 요청해 주세요.
            </p>

            <form onSubmit={submit}>
              <label className="door-label" htmlFor="door-phone">
                학생 휴대폰 번호
              </label>
              <input
                id="door-phone"
                className="door-input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01012345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={busy}
              />
              {failed && (
                <p className="door-msg" role="status">
                  {failed}
                </p>
              )}
              <button className="door-btn" type="submit" disabled={busy || digits.length < 10}>
                {busy ? '확인 중…' : '비밀번호 요청'}
              </button>
            </form>
          </>
        ) : answer.provided ? (
          <>
            <p className="door-lead">출입문 비밀번호입니다.</p>
            <div className="door-code">{answer.code}</div>
            {/* ★ 성공일 때 `message` 는 비어 있다 — 그대로 그리면 빈 줄만 남는다.
                   대신 번호 수명을 한 줄로 알려 준다(요구사항 1-5: 8시 이후 교체) */}
            <p className="door-msg">{answer.message ?? '오늘 오전에만 쓰는 번호입니다. 문이 열리면 이 창을 닫아 주세요.'}</p>
          </>
        ) : (
          <>
            {/* ★ 사유를 화면이 해석하지 않는다 — 서버 문장 그대로 */}
            <p className="door-msg door-msg-big">{answer.message}</p>
            <button
              className="door-btn door-btn-ghost"
              type="button"
              onClick={() => {
                setAnswer(null)
                setPhone('')
              }}
            >
              다시 입력
            </button>
          </>
        )}
      </main>
    </div>
  )
}
