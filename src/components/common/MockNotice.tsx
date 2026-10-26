import { Icon } from '../Icon'

/**
 * 아직 실연동되지 않은 화면의 상단 배너.
 *
 * ★ 표에 값이 차 있으면 **사람은 그걸 실데이터로 읽는다.** 비활성 버튼의 `title` 은
 *   마우스를 올려야 보이고, 표가 길면 위쪽 안내는 스크롤에 묻힌다.
 *   그래서 화면 맨 위에, 표보다 먼저 눈에 들어오게 둔다.
 *
 * ★ 데모에서 클라이언트가 이 화면을 열고 "이 숫자는 뭐냐"고 묻는 것을 막는 것이 목적이다.
 * ★ `reason` 은 화면에 안 나간다 — 왜 못 붙였는지는 우리가 알아야 하는 것이고,
 *   클라이언트는 "아직 준비 중"만 알면 된다. 호출부에 남겨 코드에서 읽는다.
 */
/**
 * ★ **`empty` 는 「표가 비었다」일 때 쓴다**(2026-10-26 추가).
 *
 *   기본 문구는 「표에 보이는 값은 예시입니다」인데, 예시 행을 걷어내고 표를 비운 화면에
 *   그대로 두면 **빈 표를 가리키며 「이 값은 예시」라고 말하게 된다.** 담당자는 그걸
 *   「예시라서 안 보이나」로 읽고, 나중에 진짜 데이터가 들어와도 같은 문구가 남는다.
 *
 *   ★ 기본값은 그대로 둔다 — 아직 예시 값을 그리는 화면이 있다(Daily Report 달력).
 */
export function MockNotice({ reason: _reason, empty = false }: { reason: string; empty?: boolean }) {
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
          {empty ? (
            <>아래 화면은 준비 중입니다 — 아직 표시할 내용이 없습니다</>
          ) : (
            <>아래 화면은 준비 중입니다 — 표에 보이는 값은 <b>예시</b>입니다</>
          )}
        </div>
        {/* ★ reason 은 화면에 안 내보낸다. "반별 집계 API가 없습니다" 같은 말은 우리 사정이고
               클라이언트가 읽을 이유가 없다(CLAUDE.md 1-1). 코드에는 남겨 왜 못 붙였는지 안다. */}
        <div className="tx">
          {empty ? '준비가 끝나면 이 자리에 실제 내용이 표시됩니다.' : '준비가 끝나면 실제 데이터로 바뀝니다.'}
        </div>
      </div>
    </div>
  )
}
