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

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('input, select, textarea')
    el?.focus()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy && dismissible) onClose()
    }
    document.addEventListener('keydown', onKey)

    /* 뒤 화면이 같이 스크롤되면 모달이 떠 있는 동안 위치를 잃는다.
     *
     * ★ `overflow: hidden` **만** 걸면 안 된다. 문서가 스크롤을 못 하게 되는 순간
     *   브라우저가 스크롤 위치를 0 으로 깎아버려 **뒤 화면이 맨 위로 튄다** — 표 열 번째
     *   줄에서 버튼을 눌렀는데 모달 뒤가 갑자기 첫 줄이 되고, 닫아도 안 돌아온다.
     *   목록이 긴 화면(급식 업체 배정·사용자 관리)에서 눈에 띈다.
     *   그래서 위치를 음수 top 으로 붙잡아 둔 뒤 닫을 때 그대로 되돌린다.
     * ★ `overflowY: scroll` 은 스크롤바 자리를 남겨 둔다. 막대가 사라지면서 본문이
     *   그 너비만큼 옆으로 밀리는 것을 막는다(막대를 항상 띄워 쓰는 환경). */
    const y = window.scrollY
    const b = document.body
    const prev = {
      position: b.style.position,
      top: b.style.top,
      width: b.style.width,
      overflowY: b.style.overflowY,
    }
    b.style.position = 'fixed'
    b.style.top = `-${y}px`
    b.style.width = '100%'
    b.style.overflowY = 'scroll'

    return () => {
      document.removeEventListener('keydown', onKey)
      b.style.position = prev.position
      b.style.top = prev.top
      b.style.width = prev.width
      b.style.overflowY = prev.overflowY
      window.scrollTo(0, y)
    }
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
