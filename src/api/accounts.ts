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
 * ★ **만든 뒤에는 고칠 수 없다.** PUT·PATCH·DELETE /staff/employees/{id} 가 전부 404다.
 *   이름·부서·직급·연락처는 저장하는 순간 고정된다. 바꿀 수 있는 것은 역할(replaceRoles)과
 *   상태(approve·withdraw)뿐이라, 오타가 나면 탈퇴 처리하고 새로 만드는 수밖에 없다.
 *   화면이 저장 전에 그 사실을 알려야 한다 — 탈퇴 계정이 목록에 계속 쌓인다.
 *
 * ★ **응답이 계정 정보를 안 준다.** 만들어졌는데도 accountId·loginId 는 null, roles 는 []
 *   로 온다. 저장 후에는 목록을 다시 불러야 한다 — 응답으로 행을 그리면 빈 줄이 생긴다.
 *
 * ★ 아이디 중복은 **저장해 봐야 안다.** 사전 확인 경로가 없어 '중복확인' 버튼을 못 만든다.
 *   저장 실패 메시지를 아이디 칸 옆에 그대로 띄운다.
 */
export type StaffKind = 'EMPLOYEE' | 'TEACHER'

export interface CreateStaff {
  academyId: number
  loginId: string
  name: string
  password: string
  roles: Role[]
  phone?: string
  email?: string
  /** 직원만. 선생님 경로는 이 둘을 받지 않는다 */
  deptName?: string
  positionName?: string
}

/**
 * 직원·선생님 등록.
 *
 * ★ 만든 계정이 **바로 쓸 수 있는지가 만든 사람에 따라 갈린다.**
 *   본사(SUPER_ADMIN)가 만들면 `ACTIVE` 라 즉시 로그인되고,
 *   지점 관리자가 만들면 `PENDING` 이라 승인 전까지 "가입 승인 대기 중입니다" 로 막힌다.
 *   지점 담당자에게 이 말을 안 해주면 계정을 만들어 주고 "왜 로그인이 안 되냐" 를 듣는다.
 *
 * ★ 다른 지점 `academyId` 는 서버가 `OTHER_BRANCH_ACCESS_DENIED` 로 막는다.
 *   다만 **역할은 안 막는다** — 지점 관리자가 `SUPER_ADMIN` 을 요청하는 것이 200 이다.
 *   승인 단계에서 걸러지긴 하나, 화면에서 자기 권한 위를 못 고르게 하는 편이 안전하다.
 */
export function createStaff(kind: StaffKind, body: CreateStaff): Promise<void> {
  const path = kind === 'TEACHER' ? 'teachers' : 'employees'
  return request<void>(`/api/v1/admin/staff/${path}`, { method: 'POST', body })
}
