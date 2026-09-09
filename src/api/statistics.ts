import { request } from './client'

/* 대시보드 집계 — GET /api/v1/admin/statistics
 *
 * ★ `from`·`to` 를 같은 날로 주면 **그날 하루** 집계가 온다. 대시보드의 '오늘 등원률'이
 *   이 방식이다. 기간을 넓히면 그 기간 합계가 된다.
 *
 * ★ `year` 도 필수다. 안 보내면 400 — `from`/`to` 만으로는 안 된다.
 *
 * ★ **출결이 아직 안 잡힌 날은 `attendanceRate` 가 `null`, `byStatus` 가 `{}` 다.**
 *   0이 아니다. 화면이 0%로 그리면 "전원 결석"처럼 보인다 — 아직 집계 전인 것과
 *   실제로 아무도 안 온 것을 구분해야 한다.
 */
export interface Statistics {
  students: {
    enrolled: number
    total: number
    byStatus: Record<string, number>
  }
  attendance: {
    confirmedDays: number
    /** 아직 집계 전이면 null */
    attendanceRate: number | null
    /** PRESENT · LATE · ABSENT. 집계 전이면 빈 객체 */
    byStatus: Record<string, number>
  }
  studyTime: {
    totalMinutes: number
    avgMinutesPerDay: number
    countedDays: number
    ranking: { name: string; minutes: number }[]
  }
  penalty: { meritPoints: number; demeritPoints: number; count: number }
  meals: { appliedTotal: number; applied: Record<string, number>; canceled: Record<string, number> }
  revenue: { billedAmount: number; receivedAmount: number; unpaidAmount: number; byType: Record<string, number> }
}

export function getStatistics(params: {
  academyId?: number
  year: number
  /** yyyy-MM-dd */
  from: string
  /** yyyy-MM-dd. from 과 같으면 그날 하루 */
  to: string
}): Promise<Statistics> {
  return request<Statistics>('/api/v1/admin/statistics', { query: { ...params } })
}
