import { request } from './client'

/* 학생 가입 승인 (F-4.1-3 부속) — /api/v1/admin/student-signups
 *
 * ★ **학생 계정이 만들어지는 유일한 경로다.** 학생이 앱에서 가입하면 '승인 대기' 로
 *   생기고, 승인 전에는 로그인 API 가 `SIGNUP_PENDING` 으로 거부한다.
 *   관리자가 계정을 직접 만들어주는 API 는 **일부러 없다** — 승인 절차를 우회하는
 *   두 번째 경로가 되기 때문이다(서버 주석, 0805 시트). 그걸 요청하지 않는다.
 *
 * ★ 학부모는 승인이 없다. 가입하면 바로 끝이다 — 승인이 필요한 건 학생뿐이다.
 *
 * ★ **승인과 온보딩은 별개 축이다.** 승인해도 `onboardingStatus` 는 `REGISTERED`
 *   (OT 전) 그대로다. 둘을 한 줄로 합쳐 보여주면 "승인했는데 왜 아직 안 끝났냐"가 된다.
 */

/**
 * 앱 온보딩 진행 단계.
 *
 * ★ `OT_DONE` 만 관리자가 눌러서 넘긴다. **OT 는 오프라인이라 앱이 스스로 못 넘기는
 *   유일한 단계다**(서버 주석). 나머지는 학생·학부모가 앱에서 하면 저절로 넘어간다.
 */
export type OnboardingStatus = 'REGISTERED' | 'OT_DONE' | 'PARENT_LINKED' | 'SCHEDULE_SET' | 'ACTIVE'

export const ONBOARDING_LABEL: Record<OnboardingStatus, string> = {
  REGISTERED: 'OT 전',
  OT_DONE: 'OT 완료',
  PARENT_LINKED: '학부모 연결',
  SCHEDULE_SET: '시간표 설정',
  ACTIVE: '이용 중',
}

/**
 * 계정 상태. **승인 여부가 이 값이다.**
 *
 * ★ `onboardingStatus` 와 다른 축이다 — 승인해도(`ACTIVE`) 온보딩은 `REGISTERED`(OT 전)
 *   그대로다. 둘을 한 칸에 합치면 "승인했는데 왜 안 끝났냐"가 된다.
 */
export type AccountStatus = 'PENDING' | 'ACTIVE'

export interface PendingSignup {
  /** `PENDING` 이면 승인 대기, `ACTIVE` 면 승인됨 */
  accountStatus: AccountStatus
  /** 등록 건 id. 승인·OT 처리에 이 값을 쓴다 */
  enrollmentId: number
  /** 계정 id. 화면에서 쓸 일은 없지만 문의가 오면 이걸로 찾는다 */
  accountId: number
  studentNo: string | null
  name: string
  phone: string | null
  onboardingStatus: OnboardingStatus
}

/**
 * 가입 목록. 지점 스코프가 걸린다.
 *
 * ★ 기본은 **승인 대기만** 준다. `includeApproved` 를 켜면 승인된 건도 함께 온다 —
 *   **OT 대기자를 보려면 켜야 한다.** 승인하는 순간 기본 목록에서 빠지기 때문이다.
 *
 * ★ 온보딩이 끝난(`ACTIVE`) 학생은 켜도 안 나온다. 목록이 무한정 늘지 않는다.
 */
export function listPendingSignups(params: {
  academyId?: number
  includeApproved?: boolean
}): Promise<PendingSignup[]> {
  return request<PendingSignup[]>('/api/v1/admin/student-signups', { query: { ...params } })
}

/**
 * 가입 승인.
 *
 * ★ **이미 승인된 건을 다시 보내도 통과한다**(멱등). 두 번 눌러도 안 깨지지만,
 *   화면은 눌린 줄 모르고 또 누르는 일이 없게 처리 중에 버튼을 막는다.
 */
export function approveSignup(enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/student-signups/${enrollmentId}/approve`, { method: 'POST' })
}

/** 대면 OT 완료 처리. 이걸 눌러야 앱이 다음 단계로 넘어간다 */
export function completeOt(enrollmentId: number): Promise<void> {
  return request<void>(`/api/v1/admin/student-signups/${enrollmentId}/ot-complete`, { method: 'POST' })
}
