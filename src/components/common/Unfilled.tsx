/**
 * 아직 서버가 값을 주지 않는 셀.
 *
 * ★ 목업의 컬럼을 지우지 않는다(CLAUDE.md 1). 컬럼을 없애면 "원래 없던 항목"처럼 보여
 *   백엔드에 요청해야 할 것이 조용히 사라진다. 대신 비어 있음을 눈에 보이게 두고
 *   `docs/API_GAPS.md`에 적는다.
 *
 * ★ 그냥 '-'로 두지 않는 이유: 값이 정말 없는 것(미배정 학생의 좌석)과
 *   아직 안 오는 것을 구분해야 한다. 앞은 '-', 뒤는 이것.
 *
 * ★ `reason` 은 **화면에 안 나간다.** 예전에는 title 에 `API 미제공 — {reason}` 으로
 *   실어 보냈는데, 클라이언트가 읽는 화면에 우리 사정을 쓰는 셈이었다(CLAUDE.md 1-1).
 *   이 값은 호출부에 남겨 왜 비었는지를 코드에서 알 수 있게만 한다.
 */
export function Unfilled({ reason: _reason }: { reason: string }) {
  return (
    <span
      title="아직 제공되지 않는 항목입니다"
      style={{ color: 'var(--muted)', opacity: 0.55, fontSize: 11, letterSpacing: '0.04em' }}
    >
      미제공
    </span>
  )
}
