import { Icon } from '../Icon'

/**
 * 이 계정에 열려 있지 않은 화면.
 *
 * ★ **권한으로 막힌 것은 고장이 아니다.** 서버 문구("권한이 없습니다")를 그대로 띄우면
 *   빨간 오류로 보이고, 더 나쁜 것은 **표가 0으로 그려지는 것**이다 — 담임 계정에서
 *   수납 화면이 "청구 0건 · 수납 0원" 으로 보였다(2026-09-27 실테스트).
 *   "안 보이는 것" 과 "0" 은 다르다.
 * ★ 그래서 화면을 **통째로** 이 안내로 바꾼다. 숫자를 하나도 그리지 않는다.
 */
export function NotAllowed({ what }: { what: string }) {
  return (
    <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
      <div className="ic">
        <Icon name="lock" size={17} />
      </div>
      <div>
        <div className="tt">이 계정에는 {what} 화면이 열려 있지 않습니다</div>
        <div className="tx">
          담당 업무에 따라 보이는 화면이 다릅니다. 필요하시면 관리자에게 권한을 요청하세요.
        </div>
      </div>
    </div>
  )
}
