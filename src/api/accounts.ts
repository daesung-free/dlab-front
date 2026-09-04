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
