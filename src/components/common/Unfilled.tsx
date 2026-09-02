/**
 * 아직 API가 값을 주지 않는 셀.
 *
 * ★ 목업의 컬럼을 지우지 않는다(CLAUDE.md 1). 컬럼을 없애면 "원래 없던 항목"처럼 보여
 *   백엔드에 요청해야 할 것이 조용히 사라진다. 대신 비어 있음을 눈에 보이게 두고
 *   `docs/API_GAPS.md`에 적는다.
 *
 * ★ 그냥 '-'로 두지 않는 이유: 값이 정말 없는 것(미배정 학생의 좌석)과
 *   서버가 아직 안 주는 것을 구분해야 한다. 앞은 '-', 뒤는 이것.
 */
export function Unfilled({ reason }: { reason: string }) {
  return (
    <span
      title={`API 미제공 — ${reason}`}
      style={{ color: 'var(--muted)', opacity: 0.55, fontSize: 11, letterSpacing: '0.04em' }}
    >
      미제공
    </span>
  )
}
