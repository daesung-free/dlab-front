/* 로컬 날짜 문자열 — `yyyy-MM-dd`
 *
 * ★ **`toISOString().slice(0, 10)` 을 쓰지 말 것.** 그건 UTC 로 바꾼 날짜라,
 *   한국 시간(UTC+9) 자정은 **전날 15:00** 이 되어 **날짜가 하루 앞으로 밀린다.**
 *   실제로 그렇게 깨져 있었다 —
 *     · 수납현황 '이번 달' 이 08-31 부터 시작
 *     · 학습계획이 들어가자마자 **지난주**로 열림
 *   둘 다 같은 원인이었고 화면 6곳에 같은 코드가 복사돼 있었다.
 *
 * ★ 서버는 전 구간이 `yyyy-MM-dd` 를 **로컬 날짜로** 받는다(`month` 는 `yyyy-MM`).
 *   시각이 필요한 값이 아니므로 UTC 변환이 낄 자리가 없다.
 */
export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 오늘 (로컬) */
export function todayStr(): string {
  return toDateStr(new Date())
}

/** n일 뒤/앞. 음수면 과거 */
export function addDaysStr(base: Date | string, days: number): string {
  const d = typeof base === 'string' ? new Date(`${base}T00:00:00`) : new Date(base)
  d.setDate(d.getDate() + days)
  return toDateStr(d)
}
