/**
 * 임시저장 — 이 브라우저에만 남는다(서버에 임시저장이 없다).
 *
 * ★ localStorage 는 사생활 보호 창·저장 공간 부족에서 **던진다.** 임시저장이 실패했다고
 *   작성 중인 화면이 죽으면 안 되므로 전부 삼키고, 실패는 반환값으로만 알린다.
 * ★ 다른 컴퓨터·다른 브라우저에서는 안 보인다 — 화면 문구로 그렇게 알린다.
 */
const PREFIX = 'dlab.draft.'

export function loadDraft<T>(key: string): (T & { savedAt: string }) | null {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as T & { savedAt: string }) : null
  } catch {
    return null
  }
}

/** 성공하면 저장 시각(HH:mm), 실패하면 null */
export function saveDraft<T extends object>(key: string, value: T): string | null {
  const now = new Date()
  const at = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ...value, savedAt: at }))
    return at
  } catch {
    return null
  }
}

export function clearDraft(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key)
  } catch {
    /* 지우지 못해도 다음 저장이 덮는다 */
  }
}
