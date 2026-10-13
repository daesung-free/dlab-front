import { request } from './client'

/* 신상기록부 (F-4.11-9) — /api/v1/admin/student-profiles
 *
 * 입학서류로 받던 내용을 화면에 담는다. **서버에 저장할 곳이 통째로 없어** 오래 목업이었다.
 *
 * ★ **아직 안 쓴 학생은 404 다.** 빈 껍데기를 200 으로 내리면 화면이 「작성됨」으로 읽어
 *   상담 현황과 어긋난다 — 그래서 404 를 **오류가 아니라 「미작성」**으로 받는다.
 *
 * ★ **저장은 한 장을 통째로 보낸다.** 보내지 않은 칸은 비워진다. 부분 갱신으로 두면
 *   「지운 것」과 「안 보낸 것」을 구분할 수 없어 **잘못 적은 건강 메모를 지울 수 없다.**
 *   목표대학도 **표 전체**를 보낸다 — 뺀 줄은 서버가 soft delete 로 남긴다.
 *
 * ★ **건강 2칸은 상위 관리자만 원본**을 본다. 담임에게는 `null` 로 오고 `masked: true` 가
 *   실린다 — 화면이 「저장이 안 됐다」로 오인하지 않게 서버가 알려주는 값이다.
 *   **생활습관은 민감정보가 아니라 담임도 본다**(상담에 쓰는 값).
 *
 * ★ **양식을 데이터로 둔다**(`/student-profile-forms`). I-17(4종 양식 ↔ 학년 매핑)이
 *   확정되면 **행만 넣고 켜면** 화면이 그걸 읽어 입력칸을 그린다. 확정 전에는 양식 없이도
 *   작성된다(`formId` 를 비운다).
 */

/** 목표대학 한 줄. 합격증은 **파일 id** 로 잇는다 */
export interface ProfileUniversity {
  id?: number
  sortOrder?: number | null
  universityName: string | null
  departmentName: string | null
  screeningName: string | null
  /**
   * 합격증 파일 id. **주소가 아니다** — 비공개 파일이라 **열 때마다** 주소를 새로 받는다
   * (`GET /files/{id}/url`). 받아 둔 주소를 저장해 두면 몇 분 뒤 403 이 난다.
   */
  certificateFileId?: number | null
  certificateFileName?: string | null
  /** 직원의 합불 확인. **`null` 이 「아직 확인 안 함」**이다 — false(불합격)와 다르다 */
  passed?: boolean | null
}

export interface StudentProfile {
  id: number
  enrollmentId: number
  studentNo: string | null
  studentName: string | null
  formId: number | null
  formName: string | null
  healthNote: string | null
  healthItems: Record<string, unknown> | null
  lifeNote: string | null
  lifeItems: Record<string, unknown> | null
  answers: Record<string, unknown> | null
  universities: ProfileUniversity[] | null
  writtenAt: string | null
  updatedAt: string | null
  /** 건강 항목이 가려졌는지 */
  masked?: boolean
}

/**
 * 한 학생의 신상기록부.
 *
 * ★ **안 썼으면 404 다.** 호출부가 그걸 「미작성」으로 받아야 한다 — 오류 배너를 띄우면
 *   처음 쓰는 학생마다 빨간 줄이 뜬다.
 */
export function getStudentProfile(enrollmentId: number): Promise<StudentProfile> {
  return request<StudentProfile>(`/api/v1/admin/student-profiles/${enrollmentId}`)
}

export interface StudentProfileSave {
  formId?: number | null
  healthNote?: string | null
  healthItems?: Record<string, unknown> | null
  lifeNote?: string | null
  lifeItems?: Record<string, unknown> | null
  answers?: Record<string, unknown> | null
  universities?: ProfileUniversity[] | null
  /**
   * 소급 입력용. **비우면 최초 작성 시각을 건드리지 않는다** — 수정할 때마다 지금 시각으로
   * 덮으면 「언제 처음 썼나」가 사라진다.
   */
  writtenAt?: string | null
}

export function saveStudentProfile(enrollmentId: number, body: StudentProfileSave): Promise<StudentProfile> {
  return request<StudentProfile>(`/api/v1/admin/student-profiles/${enrollmentId}`, { method: 'PUT', body })
}

export interface ProfileForm {
  id: number
  academyId: number | null
  year: number
  gradeType: string | null
  name: string
  /** 항목 정의. 화면이 이걸 읽어 입력칸을 그린다 */
  schemaJson: Record<string, unknown> | null
  version: number
  /** ★ **등록만 하면 쓰이지 않는다.** 켜는 것은 별 호출이다 */
  active: boolean
}

/**
 * 양식 목록 — 지점 양식 + 전 지점 공통.
 *
 * ★ **`academyId`·`year` 가 둘 다 필수다.** 빼면 400 이다(「지점을 지정해야 합니다」) —
 *   지점을 아직 못 고른 상태면 **부르지 않는다.**
 * ★ I-17 확정 전에는 **한 행도 없는 것이 정상**이다. 양식 없이도 작성된다.
 */
export function listProfileForms(params: { academyId: number; year: number }): Promise<ProfileForm[]> {
  return request<ProfileForm[]>('/api/v1/admin/student-profile-forms', { query: { ...params } })
}

/* ── 합격증 첨부 ───────────────────────────────────────────────────────────
 *
 * ★ **올리는 것과 붙이는 것이 따로다.** 먼저 파일을 올려 `fileId` 를 받고, 그 id 를
 *   신상기록부 저장 본문에 싣는다. 올리기만 하고 저장을 안 하면 **붙지 않은 파일**이 남는다.
 */

/** 비공개 업로드 → 파일 id. `ownerType` 은 보관기간 정리에 쓰인다 */
export async function uploadCertificate(file: File, enrollmentId: number): Promise<{ id: number; fileName: string }> {
  const fd = new FormData()
  fd.append('file', file)
  return request<{ id: number; fileName: string }>('/api/v1/admin/files/private', {
    method: 'POST',
    query: { ownerType: 'STUDENT_PROFILE', ownerId: enrollmentId },
    body: fd,
  })
}

/**
 * 볼 수 있는 주소를 받는다.
 *
 * ★ **열 때마다 부른다.** 발급된 주소는 몇 분 뒤 만료되므로, 화면이 저장해 두고 나중에
 *   열면 403 이 난다.
 */
export function getFileUrl(attachmentId: number): Promise<{ url: string }> {
  return request<{ url: string }>(`/api/v1/admin/files/${attachmentId}/url`)
}
