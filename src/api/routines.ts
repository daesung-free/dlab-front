import { request } from './client'

/* 데일리 루틴 (F-4.11-1) — /api/v1/admin/routines
 *
 * ★ 화면과 API의 축이 다르다.
 *   · 화면: 학생 × 루틴 매트릭스 (한 표에 루틴이 컬럼으로 펼쳐진다)
 *   · API : 루틴 하나당 결과 목록
 *   그래서 루틴 수만큼 호출해 매트릭스로 조립해야 한다(화면 쪽 buildMatrix 참고). */

export type RoutineStatus =
  | 'PLANNED'
  | 'DISTRIBUTED'
  | 'SUBMITTED'
  | 'REVIEWED'
  | 'PUBLISHED'
  | 'NOT_SUBMITTED'
  | 'ABSENT'

/** 이행으로 칠 상태. 제출 이후 단계면 한 것으로 본다 */
export const DONE_STATUSES: RoutineStatus[] = ['SUBMITTED', 'REVIEWED', 'PUBLISHED']

export const ROUTINE_STATUS_LABEL: Record<RoutineStatus, string> = {
  PLANNED: '계획',
  DISTRIBUTED: '배포',
  SUBMITTED: '제출',
  REVIEWED: '검수',
  PUBLISHED: '공개',
  NOT_SUBMITTED: '미제출',
  ABSENT: '결석',
}

export interface Routine {
  id: number
  year: number
  /** 숫자다(1~12). 조회 파라미터의 month 는 `yyyy-MM` 문자열이라 형태가 다르다 */
  month: number
  /** null 이면 지점 공통 루틴 */
  classId: number | null
  className: string | null
  name: string
  subject: string | null
  /** 0이면 점수 없이 완료/미완료만 본다 */
  maxScore: number
  recommended: boolean
  sortOrder: number
  copiedFromId: number | null
}

export interface RoutineResult {
  /** 아직 저장 안 된 행은 null 이다 — 서버가 재원생 전원을 PLANNED 로 만들어 내려준다 */
  id: number | null
  enrollmentId: number
  studentNo: string | null
  studentName: string
  status: RoutineStatus
  /** 학생 가채점 */
  selfScore: number | null
  /** 교사 검수 점수. 서버가 둘을 분리 보관한다 */
  reviewedScore: number | null
  memo: string | null
  reviewedAt: string | null
}

/** @param month `yyyy-MM` */
export function listRoutines(academyId: number, month: string): Promise<Routine[]> {
  return request<Routine[]>('/api/v1/admin/routines', { query: { academyId, month } })
}

/** @param date `yyyy-MM-dd` */
export function listRoutineResults(routineId: number, date: string): Promise<RoutineResult[]> {
  return request<RoutineResult[]>(`/api/v1/admin/routines/${routineId}/results`, { query: { date } })
}

/** 결과 저장은 배열을 받는다 — 배정 API와 달리 일괄이 된다 */
export function saveRoutineResults(
  routineId: number,
  date: string,
  results: { enrollmentId: number; status: RoutineStatus; selfScore?: number; reviewedScore?: number; memo?: string }[],
): Promise<void> {
  return request<void>(`/api/v1/admin/routines/${routineId}/results`, {
    method: 'PUT',
    query: { date },
    body: { results },
  })
}
