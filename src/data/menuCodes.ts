/* 계정별 메뉴 노출 (F-4.10-2 부속) — 서버 메뉴 코드 ↔ 화면 식별자
 *
 * ★ **두 체계의 단위가 다르다.** 서버는 업무 영역(=API 권한 도메인) 34개, 화면은 40개다.
 *   한 코드가 여러 화면을 덮고(`lecture` → 특강 관리 + 특강 기초 설정), 화면이 없는
 *   코드도 있다(`firewall`·`cash-receipt`·`pg-site` — 서버 전용).
 *   **코드를 화면 id 로 맞추지 않는다.** 일대일이 안 되므로 여기서 잇는다.
 *
 * ★ **부모 코드를 줘도 자식은 안 열린다.** 각 코드가 독립이다 — `billing` 만 주면
 *   `tuition`·`payment-request`·`cash-receipt`·`scholarship` 은 막힌다. 서버가 자동으로
 *   포함하지 않는 이유는, 그러면 "수납현황만 보여주려 했는데 청구기준 편집까지 열리는" 것을
 *   막을 방법이 없어서다(2026-09-16 백엔드 회신). 설정 화면은 부모를 체크할 때
 *   **자식까지 함께 체크해 코드 전부를 보낸다** — 카탈로그 응답의 `parentCode` 로 묶는다.
 *
 * ⚠️ **한 화면이 여러 코드의 API 를 부르면 그 코드를 전부 줘야 한다.** 수납현황에서
 *   현금영수증을 발급하면 `billing` 만으로는 403 이고 `cash-receipt` 도 있어야 한다.
 *   그래서 아래는 화면당 코드를 **배열**로 둔다 — 하나라도 있으면 보여주되,
 *   화면 안의 일부 기능이 403 이 날 수 있다는 뜻이다.
 */

/** 화면 하나를 여는 데 관련된 서버 메뉴 코드들. 하나라도 있으면 메뉴에 보인다 */
export const SCREEN_MENU_CODES: Record<string, string[]> = {
  /* 학생 */
  'student-search': ['student'],
  'student-enroll': ['student', 'student-signup'],
  'student-class': ['class'],
  'student-penalty': ['penalty'],
  'student-absence': ['absence'],
  affairs: ['student'],

  /* 출결 */
  attendance: ['attendance'],
  'reading-room': ['attendance', 'seat'],
  'regular-schedule': ['schedule'],
  approval: ['approval'],
  'seat-move': ['seat'],
  'admin-assign': ['seat'],

  /* 학습 */
  'daily-routine': ['routine'],
  'learning-plan': ['learning-plan'],
  score: ['grade'],
  survey: ['survey'],
  consult: ['consult'],
  lecture: ['lecture'],
  'admin-lecture': ['lecture'],

  /* 수납 */
  payment: ['billing'],
  'admin-billing': ['tuition'],
  'payment-gate': ['payment-request'],
  'admin-scholarship': ['scholarship'],

  /* 급식 */
  meal: ['meal'],
  /* 업체·단가는 급식 신청과 코드가 다르다 — 서버도 meal-vendor 로 따로 막는다 */
  'admin-meal-vendor': ['meal-vendor'],

  /* 알림 */
  chat: ['notice'],
  qna: ['qna'],
  'message-send': ['notification'],

  /* 통계 */
  'student-status': ['statistics'],
  'daily-report': ['statistics'],
  'admin-result': ['statistics'],

  /* 기초 관리 */
  'admin-basic': ['master', 'period'],
  'annual-events': ['holiday'],
  'admin-user': ['staff'],
  'admin-staff-card': ['staff'],
  'change-log': ['audit-log'],
  'app-manage': ['app-config'],

  /**
   * 서버 API 가 없어 **화면에서만** 거르는 것들.
   *
   * ★ 서버가 `enforceable: false` 로 내려준다 — 화면은 감추지만 서버는 안 막는다.
   *   API 가 생기면 서버 쪽에 경로만 채우면 차단까지 함께 걸린다.
   */
  waitlist: ['waiting'],
  timetable: ['timetable'],
  'profile-form': ['personal-record'],
}

/**
 * 허용 코드 목록으로 화면을 볼 수 있는지 판단한다.
 *
 * ★ **허용 목록이 비어 있으면 제한 없음**이다(서버 규약). 설정이 없는 계정에는 전체가
 *   내려오므로 "설정 없음" 을 따로 처리하지 않는다.
 * ★ 매핑에 없는 화면은 **막지 않는다.** 코드가 아직 안 붙은 화면을 조용히 감추면
 *   "메뉴가 사라졌다" 가 된다 — 빠진 매핑은 코드에서 고칠 일이지 사용자가 겪을 일이 아니다.
 */
export function canSeeScreen(screenId: string, allowed: Set<string> | null): boolean {
  if (allowed === null || allowed.size === 0) return true
  const codes = SCREEN_MENU_CODES[screenId]
  if (!codes) return true
  return codes.some((c) => allowed.has(c))
}

/**
 * 코드 하나를 직접 본다. 화면이 아니라 **요약 패널처럼 남의 도메인 API 를 부르는 곳**에 쓴다.
 *
 * ★ 이걸 안 보고 부르면 서버가 403 을 주고, 화면에는 빨간 "접근이 허용되지 않은 메뉴입니다"
 *   가 뜬다 — 열어준 적이 없을 뿐인데 사용자는 **고장으로 읽는다.** 부르기 전에 거른다.
 */
export function hasMenuCode(code: string, allowed: Set<string> | null): boolean {
  if (allowed === null || allowed.size === 0) return true
  return allowed.has(code)
}
