/* ============================================================================
 * 개인정보 마스킹 — 실행가이드 3.2 크로스커팅 요구사항
 *
 *  · "엑셀 다운로드 마스킹 기본 ON(010-****-1234) — 교무업무 명단,
 *     학생 관리 엑셀 Export 전반에 공통 적용"
 *  · "전화·주소·생년월일 포함 응답은 BRANCH_ADMIN 이상만 조회 가능"
 *  · [0723] 개인정보 민감도 상향 — 신상기록부·좌석위치·생체인식 추가
 *
 * ⚠ 화면단 마스킹은 표시용 방어선일 뿐이다. 실제 차단은 BE의 RBAC 필드 권한이
 *   담당하며, 마스킹 해제 여부도 서버 응답이 결정한다. FE는 서버가 이미 마스킹해
 *   내려준 값을 다시 가리지 않도록 주의할 것.
 * ========================================================================== */

export type MaskKind = 'phone' | 'name' | 'birth' | 'address' | 'email'

/** 010-1234-5678 → 010-****-5678 */
export function maskPhone(v: string): string {
  const digits = v.replace(/\D/g, '')
  if (digits.length < 7) return v
  const head = digits.slice(0, 3)
  const tail = digits.slice(-4)
  return `${head}-****-${tail}`
}

/** 이승민 → 이*민 / 김하윤 → 김*윤 / 이도 → 이* */
export function maskName(v: string): string {
  const s = v.trim()
  if (s.length <= 1) return s
  if (s.length === 2) return `${s[0]}*`
  return `${s[0]}${'*'.repeat(s.length - 2)}${s[s.length - 1]}`
}

/** 2006-03-14 → 2006-**-** */
export function maskBirth(v: string): string {
  const m = /^(\d{4})[-.\/]?(\d{2})[-.\/]?(\d{2})$/.exec(v.trim())
  return m ? `${m[1]}-**-**` : v
}

/** 시/군/구까지만 남김 */
export function maskAddress(v: string): string {
  const parts = v.trim().split(/\s+/)
  if (parts.length <= 2) return v
  return `${parts.slice(0, 2).join(' ')} ****`
}

/** hong@dlab.kr → ho**@dlab.kr */
export function maskEmail(v: string): string {
  const at = v.indexOf('@')
  if (at < 1) return v
  const id = v.slice(0, at)
  const kept = id.slice(0, Math.min(2, id.length))
  return `${kept}${'*'.repeat(Math.max(1, id.length - kept.length))}${v.slice(at)}`
}

const FNS: Record<MaskKind, (v: string) => string> = {
  phone: maskPhone,
  name: maskName,
  birth: maskBirth,
  address: maskAddress,
  email: maskEmail,
}

/** 컬럼 정의의 mask 종류에 따라 값을 가린다. kind가 없으면 원문 그대로 */
export function maskValue(kind: MaskKind | undefined, v: string): string {
  if (!kind || !v) return v
  return FNS[kind](v)
}
