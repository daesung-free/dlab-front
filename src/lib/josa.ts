/*
 * 받침에 따라 갈리는 조사.
 *
 * ★ **「등록 포기로」· 「등록 희망으로」** 처럼 앞 글자 받침에 따라 달라진다. 하나로 박아
 *   두면 둘 중 하나는 늘 틀린 문장이 된다 — 학부모에게 나가는 화면이라 눈에 띈다.
 * ★ 한글이 아니면(영문·숫자) **「로」로 둔다.** 「으로」보다 어색한 경우가 적다.
 */

/** 마지막 글자에 받침이 있는가. 한글이 아니면 false */
function hasFinal(word: string): boolean {
  const last = word.trim().at(-1)
  if (last === undefined) return false
  const code = last.charCodeAt(0)
  if (code < 0xac00 || code > 0xd7a3) return false
  return (code - 0xac00) % 28 !== 0
}

/**
 * 「로」 / 「으로」.
 * ★ **ㄹ 받침은 「로」**다 — 「서울로」이지 「서울으로」가 아니다.
 */
export function ro(word: string): string {
  if (!hasFinal(word)) return '로'
  const last = word.trim().at(-1)!
  const final = (last.charCodeAt(0) - 0xac00) % 28
  return final === 8 ? '로' : '으로'
}

/** 「은」 / 「는」 */
export function eun(word: string): string {
  return hasFinal(word) ? '은' : '는'
}

/** 「이」 / 「가」 */
export function i(word: string): string {
  return hasFinal(word) ? '이' : '가'
}
