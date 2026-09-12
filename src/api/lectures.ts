import { request } from './client'

/* 특강 (F-4.7) — /api/v1/admin/lectures
 *
 * ★ 특강 개설은 3가지를 동시에 만든다(목업 주석).
 *   ① 특강 ② 회차(수업일) ③ 청구 항목.
 *   회차가 없으면 출석부를 못 만든다 — 서버도 회차를 별도 엔드포인트로 받는다.
 *
 * ★ status(진행 상태)와 visible(앱 노출)은 **별개 축이다.** 합치면
 *   "모집은 끝났지만 앱에서 보여야 하는" 상태를 표현할 수 없다. */

export type LectureType = 'LECTURE' | 'BRIEFING'
export type LectureStatus = 'DRAFT' | 'OPEN' | 'CLOSED' | 'DONE' | 'CANCELED'

export const LECTURE_TYPE_LABEL: Record<LectureType, string> = {
  LECTURE: '특강',
  BRIEFING: '설명회',
}

export const LECTURE_STATUS_LABEL: Record<LectureStatus, string> = {
  DRAFT: '준비중',
  OPEN: '모집중',
  CLOSED: '마감',
  DONE: '종료',
  CANCELED: '취소',
}

export const LECTURE_STATUS_TONE: Record<LectureStatus, string> = {
  DRAFT: '',
  OPEN: 'verified',
  CLOSED: 'supplement',
  DONE: 'brandnew',
  CANCELED: 'brandnew',
}

export interface Lecture {
  id: number
  lectureType: LectureType
  name: string
  description: string | null
  status: LectureStatus
  /** 앱 노출 여부. status 와 별개 축이다 */
  visible: boolean
  capacity: number | null
  /**
   * 신청 기간. **Instant 다** — `2026-09-01T00:00:00Z` 처럼 타임존을 붙여야 한다.
   * 붙이지 않으면 400 "요청 본문 형식이 올바르지 않습니다" 가 온다(docs/API_GAPS.md 6-4).
   */
  applyFrom: string | null
  applyTo: string | null
  startDate: string | null
  endDate: string | null
  fee: number | null
  /** 특강 코드 */
  code: string | null
  /**
   * 담당 강사. **시드 특강 4건은 전부 `null` 이라 화면이 '미지정'으로 채워진다** —
   * 필드가 안 오는 게 아니라 값이 안 들어가 있는 것이다. `instructorName` 으로
   * 고쳤다가 되돌린 적이 있는데, 서버 응답·`/v3/api-docs` 의 `LectureDetail`
   * 어디에도 그런 이름은 없다. 필드명을 바꾸면 컴파일은 통과하고 화면만 영구히
   * '미지정'이 된다 — 담당을 넣어도 안 보이게 된다.
   *
   * ★ **교사 마스터 참조다.** 저장은 teacherId 로 하므로(LectureUpdate) 등록·수정 폼은
   *   입력칸이 아니라 교사 드롭다운(/staff/teachers)이어야 한다.
   */
  teacherId: number | null
  teacherName: string | null
  /** 특강 세부 유형(단과·실전·해설). /lecture-categories 의 항목이다 */
  categoryId: number | null
  categoryName: string | null
  confirmedCount: number
  waitlistedCount: number
}

export interface LectureSession {
  id: number
  sessionNo: number
  sessionDate: string
  startTime: string | null
  endTime: string | null
  room: string | null
}

/** 신청자 한 명. 대기자도 같은 구조이고 waitlisted 로 갈린다 */
export interface LectureApplicant {
  applicationId: number
  studentId: number
  studentNo: string | null
  studentName: string
  className: string | null
  phone: string | null
  status: string
  waitlisted: boolean
  appliedAt: string | null
  memo: string | null
  /** 서버가 이름·연락처를 가려서 보냈는지 */
  masked: boolean
}

export function listLectures(academyId: number, year: number, status?: LectureStatus): Promise<Lecture[]> {
  return request<Lecture[]>('/api/v1/admin/lectures', { query: { academyId, year, status } })
}

export function listLectureSessions(lectureId: number): Promise<LectureSession[]> {
  return request<LectureSession[]>(`/api/v1/admin/lectures/${lectureId}/sessions`)
}

export function listLectureApplicants(lectureId: number): Promise<LectureApplicant[]> {
  return request<LectureApplicant[]>(`/api/v1/admin/lectures/${lectureId}/applications`)
}

/**
 * 특강 등록. **회차는 따로 추가한다** — 회차 없는 특강은 출석부를 못 만들고
 * 신청도 받을 수 없다(F-4.7 주석 참고).
 *
 * 만들 때 정하는 건 이름과 종류뿐이다. 정원·기간·특강비는 `PATCH` 로 채운다.
 */
export function createLecture(body: {
  academyId: number
  year: number
  lectureType: LectureType
  name: string
}): Promise<Lecture> {
  return request<Lecture>('/api/v1/admin/lectures', { method: 'POST', body })
}

/**
 * 앱 노출 전환 (0803 "개설 시에만 노출").
 *
 * ★ `status` 와 **별개 축이다.** 접수를 열어도(`OPEN`) 노출을 안 켜면 앱에 안 보인다 —
 *   "왜 신청이 안 들어오지"의 흔한 원인이라 화면에서 두 축을 따로 보여준다.
 */
export function setLectureVisible(lectureId: number, visible: boolean): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/${lectureId}/visible`, { method: 'PUT', body: { visible } })
}

export function changeLectureStatus(lectureId: number, status: LectureStatus): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/${lectureId}/status`, { method: 'PUT', body: { status } })
}

/** 대기자를 확정으로 올린다 */
export function promoteApplicant(applicationId: number): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/applications/${applicationId}/promote`, { method: 'POST' })
}

/**
 * 부분 수정. 보낸 항목만 바뀐다.
 *
 * ★ 개설(POST)은 이름·종류만 받는다. 유형·담당·정원·비용·기간은 전부 이쪽이라
 *   등록 폼이 값을 채우려면 **2콜**이 된다 — 중간에 실패하면 이름만 있는 특강이 남는다.
 */
export function updateLecture(
  lectureId: number,
  body: Partial<{
    name: string
    code: string
    /** 담당 강사는 id 로 보낸다 — 이름 문자열이 아니다 */
    teacherId: number
    /** 세부 유형도 id 로 보낸다 */
    categoryId: number
    description: string
    capacity: number
    /**
     * 접수 시작·마감. **날짜가 아니라 시점(Instant)이다** — `2026-09-20T00:00:00Z`.
     * `2026-09-20` 만 보내면 400 이다(형식 오류). 반면 startDate·endDate 는 날짜다.
     * 두 짝이 규칙이 달라서, 같이 보내면 한쪽만 틀려 **전체가 거절**된다.
     */
    applyFrom: string
    applyTo: string
    /** 수업 시작·종료. 이쪽은 `yyyy-MM-dd` 날짜다 */
    startDate: string
    endDate: string
    fee: number
  }>,
): Promise<Lecture> {
  return request<Lecture>(`/api/v1/admin/lectures/${lectureId}`, { method: 'PATCH', body })
}

/**
 * 회차 추가 — `POST /admin/lectures/{id}/sessions`
 *
 * ★ **특강을 만들어도 회차가 없으면 아무것도 못 한다.** 출석부가 0회차가 되고 신청·대기·출결이
 *   전부 막힌다. 그래서 개설 폼은 기간·요일로 회차를 계산해 여기까지 보낸다.
 * ★ `sessionNo` 는 **서버가 매긴다** — 보내지 않는다.
 * ★ 일괄 생성이 없어 회차 수만큼 호출된다. 중간에 실패하면 **앞의 회차는 이미 만들어져 있다** —
 *   호출부가 "몇 회차까지 됐는지"를 반드시 알려야 한다. 잘못 만든 것은 `deleteLectureSession` 으로 지운다.
 */
export function createLectureSession(
  lectureId: number,
  body: { sessionDate: string; startTime?: string; endTime?: string; room?: string },
): Promise<LectureSession> {
  return request<LectureSession>(`/api/v1/admin/lectures/${lectureId}/sessions`, { method: 'POST', body })
}

/**
 * 특강 삭제 — `DELETE /admin/lectures/{id}`
 *
 * ★ **신청자가 있으면 400 이다.** 메시지가 무엇을 해야 하는지까지 알려준다 —
 *   "신청자가 있는 특강은 삭제할 수 없습니다(5명). 접수를 마감하거나 취소해 주세요."
 *   그대로 보여주면 된다. 그 경우 `changeLectureStatus(id, 'CANCELED')` 가 대안이다.
 * ★ 회차는 **함께 지워진다.** 회차만 남는 일은 없다.
 */
export function deleteLecture(lectureId: number): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/${lectureId}`, { method: 'DELETE' })
}

/**
 * 회차 삭제 — `DELETE /admin/lectures/sessions/{id}`
 *
 * ★ 출결이 찍힌 회차는 400 이다.
 * ★ **번호를 다시 안 매긴다.** 3회차를 지워도 4회차는 그대로 4회차라 번호가 비어 보인다.
 *   지우기 전에 알려야 한다 — 안 그러면 "번호가 빠졌다"를 결함으로 읽는다.
 */
export function deleteLectureSession(sessionId: number): Promise<void> {
  return request<void>(`/api/v1/admin/lectures/sessions/${sessionId}`, { method: 'DELETE' })
}
