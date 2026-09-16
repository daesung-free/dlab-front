import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Icon } from '../Icon'
import './modal.css'

interface Props {
  title: string
  /** 제목 아래 한 줄. 왜 이걸 입력하는지 짧게 */
  sub?: string
  /** 확인 버튼 문구. 무엇이 일어나는지 그대로 쓴다 — '확인'보다 '등록' */
  confirmLabel?: string
  /** 확인이 눌렸을 때. form 의 submit 으로 들어온다 */
  onConfirm: () => void
  onClose: () => void
  /** 저장 중이면 확인·닫기를 막는다. 두 번 눌러 두 건 만드는 것을 여기서 끊는다 */
  busy?: boolean
  /** 확인을 누를 수 없는 상태. 필수값이 비었을 때 */
  confirmDisabled?: boolean
  /**
   * 취소 버튼을 감춘다. **읽기만 하는 모달**에 쓴다.
   *
   * ★ 조회용 모달에 '취소'와 '닫기'가 나란히 있으면 둘이 다른 일을 하는 것처럼 보인다.
   *   실제로는 같은데, 무엇을 되돌리는 건지 묻게 된다.
   */
  hideCancel?: boolean
  /** 실패 메시지. 모달 안에서 보여준다 — 뒤에 깔린 화면의 배너는 안 보인다 */
  error?: string | null
  /**
   * 되돌릴 수 없는 동작(삭제·탈퇴 등). 확인 버튼이 빨개진다.
   * ★ 색만 바꾼다. 문구는 호출부가 "무엇이 사라지는지" 그대로 쓴다 — '확인' 대신 '삭제'.
   */
  danger?: boolean
  /**
   * 넓은 모달. 기본 false(440px).
   *
   * ★ 기본 폭에 안 들어가는 내용을 넣을 때만 쓴다. 예전에는 호출부에서 안쪽 div 에
   *   `minWidth` 를 박았는데, 바깥 `.mo` 가 440px 에 묶여 있어 **내용이 그대로 잘렸다.**
   *   폭은 모달이 정해야 한다.
   */
  wide?: boolean
  /**
   * 닫을 수 있는가. 기본 true.
   *
   * ★ false 면 X·취소 버튼이 사라지고 Esc·배경 클릭도 안 먹는다. 임시 비밀번호를 받은
   *   사람이 비밀번호를 바꾸기 전까지 빠져나가지 못하게 할 때만 쓴다. 그 사람이 모달을
   *   닫아버리면 임시 비밀번호를 계속 쓰게 되는데, 그건 남이 아는 비밀번호다.
   */
  dismissible?: boolean
  children?: ReactNode
}

/**
 * 입력 모달.
 *
 * ★ 이 컴포넌트가 생기기 전에는 `window.prompt` 를 썼다. 세 가지가 문제였다 —
 *   ① 값을 하나밖에 못 받아서 호실 번호·코드·비고 같은 것을 **연달아 두 번 묻거나
 *      아예 못 받았다**(기초 관리에서 실제로 빈 값으로 저장됐다),
 *   ② 대화상자가 떠 있는 동안 **탭 전체가 멈춘다**,
 *   ③ 브라우저 기본 UI라 화면과 따로 논다.
 *
 * ★ 첫 입력칸에 자동으로 포커스가 간다. 모달을 띄우고 마우스로 칸을 다시 찍게 하지 않는다.
 * ★ Esc 로 닫는다. 저장 중일 때는 안 닫는다 — 요청은 이미 나갔는데 화면만 사라지면
 *   사용자는 취소된 줄 안다.
 */

/* ── 뒤 화면 스크롤 잠금 ─────────────────────────────────────────────
 *
 * ★ `overflow: hidden` **만** 걸면 안 된다. 문서가 스크롤을 못 하게 되는 순간 브라우저가
 *   스크롤 위치를 0 으로 깎아버려 **뒤 화면이 맨 위로 튄다** — 표 열 번째 줄에서 버튼을
 *   눌렀는데 모달 뒤가 첫 줄이 되고, 닫아도 안 돌아온다. 그래서 위치를 음수 top 으로
 *   붙잡아 두고 닫을 때 그대로 되돌린다.
 *
 * ★ 푸는 것을 **한 프레임 미룬다.** 미뤄 둔 사이에 다시 잠그면 풀기를 취소하고 이어서 쓴다.
 *   ① 모달을 닫자마자 다른 모달을 여는 경우 ② 개발 모드 StrictMode 의 이중 마운트 —
 *   둘 다 풀었다 다시 잠그는 왕복이 없어진다.
 *
 * ★ `overflowY: scroll` 은 스크롤바 자리를 남긴다. 막대가 사라지면서 본문이 그 너비만큼
 *   옆으로 밀리는 것을 막는다(막대를 항상 띄워 쓰는 환경).
 */
let savedY = 0
let releasing = 0

function lockScroll(): void {
  if (releasing !== 0) {
    // 같은 틱에 다시 열렸다 — 이미 잠겨 있으므로 풀기만 취소한다
    cancelAnimationFrame(releasing)
    releasing = 0
    return
  }
  const b = document.body
  if (b.style.position === 'fixed') return
  savedY = window.scrollY
  b.style.position = 'fixed'
  b.style.top = `-${savedY}px`
  b.style.width = '100%'
  b.style.overflowY = 'scroll'
}

function unlockScroll(): void {
  if (releasing !== 0) return
  releasing = requestAnimationFrame(() => {
    releasing = 0
    const b = document.body
    b.style.position = ''
    b.style.top = ''
    b.style.width = ''
    b.style.overflowY = ''
    window.scrollTo(0, savedY)
  })
}

export function Modal({
  title,
  sub,
  confirmLabel = '저장',
  onConfirm,
  onClose,
  busy = false,
  confirmDisabled = false,
  hideCancel = false,
  wide = false,
  error,
  danger = false,
  dismissible = true,
  children,
}: Props) {
  const box = useRef<HTMLDivElement>(null)

  /* ★ 의존성이 **비어 있어야 한다.** 예전에는 Esc 처리와 한 effect 에 묶여 있어
        `[busy, dismissible, onClose]` 를 달고 있었는데, `onClose` 는 호출부에서 대개
        인라인 화살표라 **렌더마다 새 함수다.** 그러면 렌더마다 잠금을 풀었다 다시 걸고
        그때마다 스크롤을 되돌리게 된다. 잠금은 열리고 닫힐 때 한 번씩이면 된다.
     ★ 포커스보다 먼저 건다 — 순서를 정해 두지 않으면 나중에 누가 사이에 끼워 넣는다. */
  useEffect(() => {
    lockScroll()
    return unlockScroll
  }, [])

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('input, select, textarea')
    /* ★ `preventScroll` 없이 포커스하면 브라우저가 그 칸을 보이게 하려고 **문서를 스크롤한다.**
          모달은 화면에 고정돼 있어 스크롤할 이유가 없는데 뒤 화면만 움직인다 */
    el?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, dismissible, onClose])

  return (
    <div className="mo-back" onMouseDown={(e) => e.target === e.currentTarget && !busy && dismissible && onClose()}>
      <div className={`mo${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={box}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!busy && !confirmDisabled) onConfirm()
          }}
        >
          <div className="mo-h">
            <div>
              <div className="mo-t">{title}</div>
              {sub && <div className="mo-s">{sub}</div>}
            </div>
            {dismissible && (
              <button type="button" className="mo-x" onClick={onClose} disabled={busy} aria-label="닫기">
                <Icon name="x" size={16} />
              </button>
            )}
          </div>

          {/* 확인만 묻는 모달은 본문이 없다 — 빈 칸을 그리면 가운데가 휑하게 뜬다 */}
          {(children || error) && (
            <div className="mo-b">
              {children}
              {error && (
                <div className="note-box" role="alert" style={{ borderColor: 'var(--red)', color: 'var(--red)' }}>
                  {error}
                </div>
              )}
            </div>
          )}

          <div className="mo-f">
            {dismissible && !hideCancel && (
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                취소
              </button>
            )}
            <button
              type="submit"
              className="btn pri"
              style={danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : undefined}
              disabled={busy || confirmDisabled}
            >
              {busy ? '저장 중…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
