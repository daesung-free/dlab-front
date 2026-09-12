import { request } from './client'

/* 사용자·권한 관리 (F-4.10-2) — /api/v1/admin/staff/accounts
 *
 * ★ 계정 목록은 **직원 목록(/staff/employees)과 다른 것**이다. 직원은 인적사항(이름·부서·연락처)이고
 *   이쪽은 계정(로그인 ID·상태·역할·잠금·최근 로그인)이다. 화면이 필요한 것은 이쪽이다.
 *   같은 사람이 personId 로 이어진다.
 *
 * ★ 페이징이 없다. 전량이 온다 — useServerData 를 쓴다(attendance.ts 머리 주석 참고).
 *
 * ★ academyId 를 안 보내면 **전 지점**이다. 다른 목록과 달리 400이 아니다 —
 *   계정 관리는 본사가 전 지점을 한 화면에서 보는 것이 정상이라 그렇다.
 */

/** 역할. 서버 enum 이 화면의 RBAC 5단계와 그대로 일치한다 */
export type Role = 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'TEACHER' | 'STAFF' | 'READONLY'

export const ROLES: readonly Role[] = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'TEACHER', 'STAFF', 'READONLY'] as const

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: '본사 관리자',
  BRANCH_ADMIN: '지점 관리자',
  TEACHER: '담임·강사',
  STAFF: '행정 직원',
  READONLY: '조회 전용',
}

/** 계정 종류. 관리자 웹에서 다루는 것은 EMPLOYEE·TEACHER 지만 학생·학부모 계정도 같은 표에 온다 */
export type AccountType = 'STUDENT' | 'PARENT' | 'EMPLOYEE' | 'TEACHER'

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  STUDENT: '학생',
  PARENT: '학부모',
  EMPLOYEE: '직원',
  TEACHER: '선생님',
}

/** ★ 목업에 없던 SUSPENDED(정지)가 서버에 있다. 상태 배지가 이 값을 받아낼 수 있어야 한다 */
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'WITHDRAWN'

export const ACCOUNT_STATUS_LABEL: Record<AccountStatus, string> = {
  PENDING: '승인대기',
  ACTIVE: '승인',
  SUSPENDED: '정지',
  WITHDRAWN: '탈퇴',
}

export interface AccountRow {
  accountId: number
  loginId: string
  accountType: AccountType
  status: AccountStatus
  /** 여러 개일 수 있다 — 역할별 집계는 계정 수가 아니라 **부여 건수**가 된다 */
  roles: Role[]
  /** 직원·선생님 id. 인적사항(/staff/employees)과 잇는 키 */
  personId: number | null
  name: string | null
  phone: string | null
  deptName: string | null
  positionName: string | null
  academyId: number | null
  academyName: string | null
  /** 로그인 5회 실패로 잠긴 상태. 자동으로 안 풀린다 */
  locked: boolean
  mustChangePassword: boolean
  /** ISO instant. 한 번도 로그인 안 했으면 null */
  lastLoginAt: string | null
}

export interface AccountParams {
  /** 비우면 전 지점 */
  academyId?: number
  status?: AccountStatus
}

export function listAccounts(params: AccountParams): Promise<AccountRow[]> {
  return request<AccountRow[]>('/api/v1/admin/staff/accounts', { query: { ...params } })
}

/**
 * 역할 교체.
 *
 * ★ 추가가 아니라 **통째로 바꾼다**(ReplaceRoles). 지금 역할을 빼고 보내면 그 역할이 사라진다.
 * ★ 최소 1개는 보내야 한다 — 빈 배열은 서버가 거부한다.
 */
export function replaceRoles(accountId: number, roles: Role[]): Promise<void> {
  return request<void>(`/api/v1/admin/staff/accounts/${accountId}/roles`, {
    method: 'PUT',
    body: { roles },
  })
}

/**
 * 가입 승인 (PENDING → ACTIVE).
 *
 * ★ 승인해야 로그인이 열린다. 계정을 만드는 것과 다른 단계다 —
 *   /staff/teachers·/staff/employees 가 사람 + 계정을 함께 만들고, 여기서 열어준다.
 */
export function approveAccount(accountId: number): Promise<void> {
  return request<void>(`/api/v1/admin/staff/accounts/${accountId}/approve`, { method: 'POST' })
}

/** 탈퇴 처리. 되돌리는 API 가 없으므로 화면이 한 번 더 묻는다 */
export function withdrawAccount(accountId: number): Promise<void> {
  return request<void>(`/api/v1/admin/staff/accounts/${accountId}/withdraw`, { method: 'POST' })
}

/**
 * 권한 변경 이력 한 줄.
 *
 * ★ replaceRoles 가 역할을 통째로 교체하므로 before/after 를 봐야 무엇이 빠졌는지 알 수 있다.
 */
export interface AccountHistory {
  id: number
  action: string
  beforeValue: string | null
  afterValue: string | null
  changedBy: string | null
  /** ISO instant */
  changedAt: string
}

export function listAccountHistory(accountId: number): Promise<AccountHistory[]> {
  return request<AccountHistory[]>(`/api/v1/admin/staff/accounts/${accountId}/history`)
}

/** 잠금 해제. 로그인 5회 실패로 잠긴 계정은 이걸 부르기 전까지 자동으로 안 풀린다 */
export function unlockAccount(accountId: number): Promise<void> {
  return request<void>(`/api/v1/admin/app-accounts/${accountId}/unlock`, { method: 'POST' })
}

/** 임시 비밀번호 발급. 응답으로 오는 비밀번호는 **다시 볼 수 없다** */
export function issueTemporaryPassword(accountId: number): Promise<{ temporaryPassword: string }> {
  return request<{ temporaryPassword: string }>(
    `/api/v1/admin/app-accounts/${accountId}/temporary-password`,
    { method: 'POST' },
  )
}

/* ── 계정 생성 ──────────────────────────────────────────────────────────────
 *
 * ★ 사람과 계정을 **한 번에** 만든다. 계정만 따로 만드는 경로는 없다.
 *   그래서 신규 접수 등록(POST → PATCH)과 달리 부분 성공이 없다 — 되거나 안 되거나다.
 *
 * ★ 경로가 둘이고 **필드가 다르다.** 직원만 부서·직급을 받는다.
 *
 * ★ **비밀번호를 화면이 정하지 않는다.** 서버가 임시 비밀번호를 만들어
 *   응답에 **딱 한 번** 실어 보내고 저장하지 않는다. 놓치면 재발급해야 한다.
 */
export type StaffKind = 'EMPLOYEE' | 'TEACHER'

export interface CreateStaff {
  academyId: number
  loginId: string
  name: string
  roles: Role[]
  phone?: string
  email?: string
  /** 직원만. 선생님 경로는 이 둘을 받지 않는다 */
  deptName?: string
  positionName?: string
}

/** 만들어진 사람 쪽 정보. 목록의 행과 같은 모양이다 */
export interface CreatedStaffPerson {
  kind: StaffKind
  id: number
  academyId: number
  name: string
  deptName: string | null
  positionName: string | null
  phone: string | null
  email: string | null
  accountId: number | null
  loginId: string | null
  roles: Role[]
  locked: boolean
  mustChangePassword: boolean
}

export interface StaffCreated {
  /** ★ 사람 정보는 여기 한 겹 안에 있다 — `data.name` 이 아니라 `data.staff.name` 이다 */
  staff: CreatedStaffPerson
  accountId: number
  loginId: string
  roles: Role[]
  status: AccountStatus
  /**
   * ★ **여기서 딱 한 번만 나온다.** 서버가 저장하지 않으므로 화면이 놓치면
   *   재발급(issueTemporaryPassword)해야 한다. 받는 사람은 첫 로그인에서 반드시 바꾸게 된다.
   */
  temporaryPassword: string
  /**
   * ★ `true` 면 본사 승인 전까지 로그인이 막힌다. 지점이 만든 계정이 여기 해당한다.
   *   **서버가 판정해서 내려준다** — 화면이 "내가 본사인가"로 추측하지 않는다.
   */
  pendingApproval: boolean
}

/**
 * 직원·선생님 등록.
 *
 * ★ 다른 지점 `academyId` 는 서버가 `OTHER_BRANCH_ACCESS_DENIED` 로 막는다.
 *   부여할 수 있는 역할은 `listGrantableRoles()` 가 알려준다 — 화면이 계산하지 않는다.
 */
export function createStaff(kind: StaffKind, body: CreateStaff): Promise<StaffCreated> {
  const path = kind === 'TEACHER' ? 'teachers' : 'employees'
  return request<StaffCreated>(`/api/v1/admin/staff/${path}`, { method: 'POST', body })
}

/**
 * 로그인 아이디를 쓸 수 있는지 미리 본다.
 *
 * ★ 여기서 `true` 였어도 저장 시점에 남이 먼저 가져갔을 수 있다. **저장의 400 처리를
 *   없애면 안 된다** — 이건 미리 알려주는 것이지 보장이 아니다.
 */
export function checkLoginId(loginId: string): Promise<{ loginId: string; available: boolean }> {
  return request<{ loginId: string; available: boolean }>('/api/v1/admin/staff/login-id-available', {
    query: { loginId },
  })
}

export interface RoleOption {
  code: Role
  displayName: string
  description: string
  /** ★ 내 권한으로 **줄 수 있는가.** 지점 관리자에게 SUPER_ADMIN 은 false 로 온다 */
  grantable: boolean
}

/** 부여 가능한 역할. 호출한 계정 기준으로 서버가 판정해서 내려준다 */
export function listGrantableRoles(): Promise<RoleOption[]> {
  return request<RoleOption[]>('/api/v1/admin/staff/roles')
}

/**
 * 인적사항 수정. 보낸 필드만 바뀐다.
 *
 * ★ **로그인 아이디는 못 바꾼다.** 계정 식별자라 바꾸면 감사 로그의 주체가 끊긴다.
 */
export function updateStaff(
  kind: StaffKind,
  personId: number,
  changes: { name?: string; phone?: string; email?: string; deptName?: string; positionName?: string },
): Promise<CreatedStaffPerson> {
  const path = kind === 'TEACHER' ? 'teachers' : 'employees'
  return request<CreatedStaffPerson>(`/api/v1/admin/staff/${path}/${personId}`, {
    method: 'PATCH',
    body: changes,
  })
}

/* ── 담당 강사 고르기 ─────────────────────────────────────────────────────── */

export interface TeacherRow {
  id: number
  name: string
  academyId: number
  phone: string | null
}

/**
 * 특강·반 배정에서 담당 강사를 고를 때 쓴다 — `GET /admin/staff/teachers`
 *
 * ★ **`/staff/employees` 와 다른 목록이다.** 강사는 `kind: 'TEACHER'` 로 따로 있어서
 *   직원 목록에는 안 나온다. 실제로 직원 목록만 보고 "강사가 하나도 없다"고 판단한 적이 있다.
 * ★ 서버는 강사를 **id 로** 받는다(`updateLecture` 의 teacherId). 이름 문자열을 보내면
 *   조용히 무시되고 담당이 '미지정'으로 남는다.
 */
export function listTeachers(academyId: number): Promise<TeacherRow[]> {
  return request<TeacherRow[]>('/api/v1/admin/staff/teachers', { query: { academyId } })
}
