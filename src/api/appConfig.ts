import { request } from './client'

/* 앱 운영 (F-C-6) — /api/v1/admin/app-config
 *
 * ★ 앱이 **부팅할 때 첫 번째로 읽는 값**이다. 여기를 잘못 만지면 앱이 안 열린다.
 *
 * ★ **점검 모드는 켜는 순간 그 플랫폼 전 사용자가 앱을 못 쓴다.** 화면에 상태를 반드시
 *   드러낸다 — 켜져 있는데 아무 데도 안 보이면 "왜 앱이 안 되지"를 못 짚는다.
 *
 * ★ 약관은 **고치는 게 아니라 버전을 올려 새 행을 추가한다.** 수정 API가 없는 것이
 *   실수가 아니다 — 덮어쓰면 이미 동의한 사람들의 동의 근거가 사라진다.
 *
 * ⚠️ 푸시 발송 이력·배너 클릭수는 API가 없다(API_GAPS 17부). */

export type Platform = 'IOS' | 'ANDROID'

export const PLATFORM_LABEL: Record<Platform, string> = {
  IOS: 'iOS',
  ANDROID: 'Android',
}

export interface AppConfigDetail {
  id: number
  platform: Platform
  /** 이 버전 **미만**은 실행 시 업데이트 게이트에 막힌다 */
  minVersion: string | null
  latestVersion: string | null
  maintenance: boolean
  maintenanceMessage: string | null
  maintenanceUntil: string | null
}

export function listAppConfigs(): Promise<AppConfigDetail[]> {
  return request<AppConfigDetail[]>('/api/v1/admin/app-config')
}

/** `null` 필드는 "변경하지 않음"이다 — 지우는 수단이 아니다 */
export function updateAppVersions(
  platform: Platform,
  body: { minVersion?: string; latestVersion?: string },
): Promise<AppConfigDetail> {
  return request<AppConfigDetail>(`/api/v1/admin/app-config/${platform}/versions`, { method: 'PATCH', body })
}

/** ⚠️ 켜면 그 플랫폼 전 사용자가 앱을 못 쓴다. 호출 전에 확인을 받는다 */
export function setMaintenance(
  platform: Platform,
  body: { maintenance: boolean; message?: string; until?: string },
): Promise<AppConfigDetail> {
  return request<AppConfigDetail>(`/api/v1/admin/app-config/${platform}/maintenance`, { method: 'PUT', body })
}

export interface Terms {
  id: number
  /** null 이면 전 지점 공통 */
  academyId: number | null
  /** 종류를 가리키는 코드. 같은 코드의 여러 버전이 이력으로 쌓인다 */
  code: string
  version: string
  title: string
  required: boolean
  effectiveAt: string | null
}

export function listTerms(academyId?: number): Promise<Terms[]> {
  return request<Terms[]>('/api/v1/admin/app-config/terms', { query: { academyId } })
}

/**
 * 앱이 가입 때 받는 약관 목록 — 디랩 입학동의서 최종본(2026-10-29) 기준 10종.
 *
 * ★ **코드를 자유 입력으로 두면 오타가 영구로 남는다.** 약관은 수정·삭제 API 가 없어
 *   `PRIVCAY_REQUIRED` 로 한 번 등록하면 지울 수 없고, 앱은 그 코드를 못 찾아
 *   **그 약관만 조용히 안 뜬다** — 동의를 못 받은 줄도 모르게 된다.
 *
 * ★ `required` 를 여기 둔 이유는 **최종본과 다르게 등록되는 것을 막기 위해서다.**
 *   특히 `SENSITIVE`(민감정보)는 **선택**이다 — 최종본이 「동의를 거부할 수 있으며, 이
 *   경우 대체 신청 방법을 안내합니다」라 필수로 등록하면 거부한 사람이 가입을 못 한다.
 *
 * ★ `confirmOnly` 는 「동의」가 아니라 「확인」을 받는 것이다. CCTV 안내는 동의 대상이
 *   아니라 알렸다는 사실을 남기는 것이라, 「동의합니다」로 받으면 그 기록이 무엇인지
 *   흐려진다.
 *
 * ⚠️ 급식업체 제3자 제공(`MEAL_THIRD_PARTY`)은 아직 없다 — 최종본이 「해당 지점과 계약한
 *   업체명만 기재」라 **지점별 약관**이어야 하는데 지점-업체 매핑을 못 받았다.
 */
export interface TermsCatalogEntry {
  code: string
  /** 등록 모달 제목 칸에 미리 넣는 값. 고쳐서 등록해도 된다 */
  title: string
  required: boolean
  /** 동의가 아니라 확인을 받는 약관 */
  confirmOnly?: boolean
  /**
   * 입학동의서 최종본에 있는 약관인지.
   *
   * ★ 푸시 수신 동의는 **최종본에 없다** — 앱 설정이라 거기 섞어 「최종본 기준」이라고
   *   말하면 사실이 아닌 것을 화면이 말하게 된다.
   */
  inAdmissionDoc?: boolean
}

export const TERMS_CATALOG: readonly TermsCatalogEntry[] = [
  { code: 'PRIVACY_REQUIRED', title: '개인정보 수집·이용 동의 (입학신청·재원 필수)', required: true, inAdmissionDoc: true },
  { code: 'PRIVACY_OPTIONAL', title: '개인정보 수집·이용 동의 (입학신청·재원 선택)', required: false, inAdmissionDoc: true },
  { code: 'ADMISSION_GUIDE', title: '대입 진학지도 활용 동의', required: false, inAdmissionDoc: true },
  { code: 'CERTIFICATE', title: '재원·졸업증명서 발급 동의', required: false, inAdmissionDoc: true },
  { code: 'MARKETING', title: '홍보·마케팅 활용 동의', required: false, inAdmissionDoc: true },
  { code: 'CCTV_NOTICE', title: 'CCTV 설치·운영 안내 확인', required: true, confirmOnly: true, inAdmissionDoc: true },
  { code: 'SENSITIVE', title: '민감정보 수집·이용 동의', required: false, inAdmissionDoc: true },
  { code: 'GUARDIAN_ADMISSION', title: '학부모·보호자 입학동의서', required: true, inAdmissionDoc: true },
  { code: 'PHONE_SUBMIT', title: '휴대전화 제출 동의', required: true, inAdmissionDoc: true },
  { code: 'NO_SMOKING', title: '학원 내 금연 서약', required: true, inAdmissionDoc: true },
  { code: 'PUSH', title: '앱 푸시 수신 동의', required: false },
]

export interface TermsCreate {
  academyId?: number
  code: string
  version: string
  title: string
  content: string
  required?: boolean
  effectiveAt?: string
}

/**
 * 약관 등록.
 *
 * ★ **기존 문구를 고치는 API는 없다.** 개정은 버전을 올려 새로 등록하는 것이다 —
 *   덮어쓰면 이미 동의한 사람들의 근거가 사라진다.
 */
export function createTerms(body: TermsCreate): Promise<Terms> {
  return request<Terms>('/api/v1/admin/app-config/terms', { method: 'POST', body })
}

/**
 * 약관 치우기.
 *
 * ★ **응답이 한 건도 없는 약관만 치워진다.** 있으면 400 이다 — 수정 API 가 없는 것과
 *   같은 이유로, 이미 응답한 사람의 근거가 사라지는 길은 열려 있지 않다.
 *
 * ⚠️ **미동의도 「응답」이다.** 「물어봤는데 거부했다」와 「물어본 적 없다」는 다른 기록이다.
 *
 * ★ **치울 수 있는지를 화면이 판정하지 않는다.** 화면이 아는 것은 동의 **건수**뿐이고
 *   거부한 사람 수는 모른다 — 동의율 0% 를 보고 「치울 수 있다」고 단정하면 거부자가
 *   있는 약관에도 버튼이 열린다. **서버가 돌려준 문장을 그대로 보여준다.**
 */
export function deleteTerms(termsId: number): Promise<unknown> {
  return request(`/api/v1/admin/app-config/terms/${termsId}`, { method: 'DELETE' })
}

export interface TermsStatus {
  termsId: number
  code: string
  version: string
  title: string
  required: boolean
  /**
   * ★ `null` 이면 **아직 응답한 적이 없다** — '동의 안 함'과 다르다.
   *   섞으면 가입 흐름에서 다시 물어볼지를 판단하지 못한다.
   */
  agreed: boolean | null
  agreedAt: string | null
  /**
   * 동의한 날부터 2년이 지났다 — 홍보·마케팅(`MARKETING`)에만 붙는다.
   *
   * ★ 다른 약관은 보존 기준이 「목적 달성 시까지」처럼 날짜로 셀 수 없어 만료가 없다.
   *   같은 2년을 적용하면 재학생의 필수 동의가 만료되어 앱이 막힌다.
   *
   * ★ 서버가 `agreed` 를 `false` 로 바꾸지 않는 이유: 동의한 사실 자체는 바뀌지 않았고
   *   `false` 로 두면 **본인이 철회한 것과 구분되지 않는다** — 철회는 다시 묻지 않고
   *   만료는 다시 물어야 하므로 안내할 말이 다르다.
   *
   * ⚠️ 서버 배포 전에는 안 온다 — 없을 때 「만료 아님」으로 읽히도록 `?? false` 로 쓴다.
   */
  expired?: boolean
  /**
   * 지금 유효한 동의인지(`agreed && !expired`).
   *
   * ★ **동의 여부를 그리는 곳은 이 값을 쓴다.** `agreed` 만 보고 「동의함」으로 그리면
   *   만료된 사람에게 광고가 나가는 줄로 읽힌다 — 만료는 「다시 동의 필요」다.
   */
  effective?: boolean
}

/** 계정 하나의 동의 현황. **전체 동의율을 내는 경로는 없다**(API_GAPS 17-3) */
export function getTermsAgreements(accountId: number): Promise<TermsStatus[]> {
  return request<TermsStatus[]>(`/api/v1/admin/app-config/terms/agreements/${accountId}`)
}

export interface TermsUsage {
  termsId: number
  code: string
  version: string
  title: string
  required: boolean
  /** 분모 — 활성 앱 계정(학생 + 학부모) */
  targetAccounts: number
  agreedAccounts: number
  /**
   * 정수 % — **`agreedAccounts` 기준이다.** 만료된 동의도 여기 들어간다.
   *
   * ⚠️⚠️ **`targetAccounts` 가 0 이면 `null` 이다**(2026-10-30 운영 실측).
   *   나눌 분모가 없으니 비율이 **없는 것**이고, 서버가 0 으로 꾸며 주지 않는다.
   * ★ **`0%` 로 그리면 안 된다** — 「아무도 동의하지 않았다」로 읽히는데 사실은
   *   **물어볼 사람이 없다**는 뜻이다. 둘은 담당자가 할 일이 다르다.
   */
  rate: number | null
  /**
   * 그중 **지금 유효한** 동의 계정. 홍보·마케팅은 동의일부터 2년이 지나면 빠진다.
   *
   * ★ 만료 개념이 없는 약관은 `agreedAccounts` 와 **같은 값**이 온다 — 화면이
   *   「이 약관은 만료가 있나」를 판단하지 않아도 되게 서버가 맞춰 준다. 화면이
   *   판단하면 마케팅 코드가 화면에 박히고, **서버가 다른 약관에 만료를 붙이는 날
   *   화면만 모른다.**
   *
   * ⚠️ 서버 배포 전에는 안 온다 — 없으면 유효 비율을 **말하지 않는다**(`rate` 만 쓴다).
   *   없는 값을 0으로 읽으면 **전원이 다시 동의해야 하는 것처럼 보인다.**
   */
  effectiveAccounts?: number
  /** `effectiveAccounts` 기준 정수 %. `rate` 와 같은 이유로 분모가 0 이면 `null` 이다 */
  effectiveRate?: number | null
}

/**
 * 앱 가입·동의 현황 — 앱 운영 상단 카드(2026-09-21 추가).
 *
 * ★ 기준은 **지금 재원 중인 학생**이다. 퇴원생 계정은 분모에 안 들어간다.
 * ★ 동의율은 약관마다 따로이고 분모는 활성 앱 계정(학생 + 학부모)이다 — 가입률과 분모가 다르다.
 * ★ `academyId` 를 빼면 전 지점 합계다(본사 계정).
 */
export interface AppUsage {
  enrolledStudents: number
  studentAccounts: number
  /** 가입했지만 아직 승인 전 */
  pendingStudents: number
  /** ⚠️ 분모(재원생)가 0 이면 `null` 이다 — `TermsUsage.rate` 주석 참고 */
  studentSignupRate: number | null
  parentAccounts: number
  studentsWithParent: number
  /** ⚠️ 분모가 0 이면 `null` 이다 */
  parentLinkRate: number | null
  terms: TermsUsage[]
}

export function getAppUsage(academyId?: number): Promise<AppUsage> {
  return request<AppUsage>('/api/v1/admin/app-config/usage', { query: { academyId } })
}

