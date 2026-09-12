import { Icon } from '../Icon'

/**
 * 아직 실연동되지 않은 화면의 상단 배너.
 *
 * ★ 표에 값이 차 있으면 **사람은 그걸 실데이터로 읽는다.** 비활성 버튼의 `title` 은
 *   마우스를 올려야 보이고, 표가 길면 위쪽 안내는 스크롤에 묻힌다.
 *   그래서 화면 맨 위에, 표보다 먼저 눈에 들어오게 둔다.
 *
 * ★ 데모에서 클라이언트가 이 화면을 열고 "이 숫자는 뭐냐"고 묻는 것을 막는 것이 목적이다.
 *   무엇이 없어서 못 붙였는지(`reason`)까지 적으면 그 자리에서 답이 된다.
 */
export function MockNotice({ reason }: { reason: string }) {
  return (
    <div className="note-box" style={{ borderColor: 'var(--amber)' }}>
      <div className="ic">
        <Icon name="triangle-alert" size={17} />
      </div>
      <div>
        <div className="tt">
          <span
            className="mk brandnew"
            style={{ marginRight: 6 }}
          >
            개발 중
          </span>
          아래 화면은 준비 중입니다 — 표에 보이는 값은 <b>예시</b>입니다
        </div>
        <div className="tx">{reason}</div>
      </div>
    </div>
  )
}
