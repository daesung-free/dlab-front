import { BILLING_STATUS_LABEL } from '../api/billing'

/*
 * 변경 기록(감사 로그)의 칸 이름·값 → 사람이 읽는 말.
 *
 * ★ 서버는 코드로 준다(status · locked · ACTIVE …). 사용자 관리 '이력 보기' 와 금일 수정 이력이 같이 쓴다 —
 *   한쪽에만 두었더니 수정 이력 화면에는 `locked`·`roles` 가 영어 그대로 보였다(2026-09-22).
 * ★ 모르는 코드는 그대로 보인다 — 숨기면 무슨 일이 있었는지 아예 사라진다.
 */

/*
 * ★★ **같은 칸 이름이 영역마다 다른 뜻이다.** 하나의 사전으로 덮으면 **틀린 말로 번역된다.**
 *   청구의 `status: PENDING → CANCELLED` 가 「계정 상태: 승인 대기 → CANCELLED」로 보였다 —
 *   **칸 이름도 값도 둘 다 틀렸다**(청구의 PENDING 은 「발행 전」이다).
 * ⚠️ 서버가 라벨을 내려주기로 했다(2026-10-21). 그때까지의 임시 사전이고, **서버가 칸을
 *   늘리면 여기 없는 것은 영어로 보인다** — 그게 이 사전의 한계라 서버화가 예정돼 있다.
 */
const FIELD_BY_AREA: Record<string, Record<string, string>> = {
  청구: {
    status: '청구 상태',
    serviceMonth: '대상 월',
    serviceYear: '대상 연도',
    serviceFrom: '대상 시작일',
    serviceTo: '대상 종료일',
    discountSource: '장학',
  },
  공지: { deleted: '삭제 여부' },
  '학생 등록': {
    homeroomOverride: '담임 지정',
    homeroomOverrideAt: '담임 지정 시각',
    homeroomOverrideReason: '담임 지정 사유',
  },
}

/** 영역별 값 사전. 청구의 `PENDING` 은 계정의 「승인 대기」가 아니라 「발행 전」이다 */
const VALUE_BY_AREA: Record<string, Record<string, string>> = {
  청구: BILLING_STATUS_LABEL,
}

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

export function changeValueLabel(v: string | null, area?: string): string {
  if (v === null || v === '') return '-'
  /* 연락처·생년월일·주소는 서버가 값을 안 남기고 `***` 만 남긴다(개인정보). 그대로 두면
     "*** → ***" 가 되어 고장으로 읽힌다 — 바뀐 사실만 남았다는 뜻을 글로 쓴다 */
  if (v === '***') return '가려진 값'
  const byArea = area === undefined ? undefined : VALUE_BY_AREA[area]
  return v
    .split(',')
    .map((x) => byArea?.[x.trim()] ?? VALUE[x.trim()] ?? x.trim())
    .join(', ')
}

/** ★ `area` 를 넘기면 **그 영역 사전을 먼저** 본다. 안 넘기면 계정 기준이다 */
export function changeFieldLabel(field: string, area?: string): string {
  const byArea = area === undefined ? undefined : FIELD_BY_AREA[area]
  return byArea?.[field] ?? FIELD[field] ?? field
}

/**
 * 업무 영역. 서버가 대부분 한국어로 주는데 **직원 계정만 `Account`** 로 온다
 * (StaffAccountService 의 AUDIT_ACCOUNT). 검색 조건에도 이 원래 값을 보내야 걸린다.
 */
export const AUDIT_AREAS: { value: string; label: string }[] = [
  /* ★ '학생' 과 '학생 등록' 은 다르다 — 사람(이름·연락처·영문명)과 그해 등록 건이
     서로 다른 행이라 서버도 따로 남긴다(2026-09-25). 하나로 합치면 어느 쪽이 바뀐 건지 못 읽는다 */
  { value: '학생', label: '학생 정보' },
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
