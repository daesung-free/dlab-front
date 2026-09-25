/*
 * 변경 기록(감사 로그)의 칸 이름·값 → 사람이 읽는 말.
 *
 * ★ 서버는 코드로 준다(status · locked · ACTIVE …). 사용자 관리 '이력 보기' 와 금일 수정 이력이 같이 쓴다 —
 *   한쪽에만 두었더니 수정 이력 화면에는 `locked`·`roles` 가 영어 그대로 보였다(2026-09-22).
 * ★ 모르는 코드는 그대로 보인다 — 숨기면 무슨 일이 있었는지 아예 사라진다.
 */

const FIELD: Record<string, string> = {
  status: '계정 상태',
  locked: '로그인 잠금',
  roles: '역할',
  menus: '메뉴 권한',
  temporaryPassword: '임시 비밀번호',
  academyId: '지점',
  mustChangePassword: '비밀번호 변경 요구',
}

const VALUE: Record<string, string> = {
  ACTIVE: '사용',
  PENDING: '승인 대기',
  WITHDRAWN: '탈퇴',
  LOCKED: '잠김',
  true: '예',
  false: '아니요',
  reissued: '재발급',
  SUPER_ADMIN: '최고관리자',
  BRANCH_ADMIN: '지점관리자',
  TEACHER: '담임',
  STAFF: '행정',
  READONLY: '조회 전용',
}

export function changeValueLabel(v: string | null): string {
  if (v === null || v === '') return '-'
  return v
    .split(',')
    .map((x) => VALUE[x.trim()] ?? x.trim())
    .join(', ')
}

export function changeFieldLabel(field: string): string {
  return FIELD[field] ?? field
}

/**
 * 업무 영역. 서버가 대부분 한국어로 주는데 **직원 계정만 `Account`** 로 온다
 * (StaffAccountService 의 AUDIT_ACCOUNT). 검색 조건에도 이 원래 값을 보내야 걸린다.
 */
export const AUDIT_AREAS: { value: string; label: string }[] = [
  { value: '학생 등록', label: '학생 등록' },
  { value: '사유 신청', label: '사유 신청' },
  { value: '상벌점', label: '상벌점' },
  { value: '청구', label: '청구' },
  { value: '성적', label: '성적' },
  { value: '공지', label: '공지' },
  // 예전에는 이 값만 영어(`Account`)로 와서 화면 선택지도 영어였다. 2026-09-25 에 서버가
  // 한국어로 바꾸고 기존 행도 변환했다 — 영어로 보내면 이제 0건이다
  { value: '직원 계정', label: '직원 계정' },
]

export function auditAreaLabel(entityType: string): string {
  return AUDIT_AREAS.find((a) => a.value === entityType)?.label ?? entityType
}
