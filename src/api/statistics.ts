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

/* ── 학원생 현황 집계 (F-C-2) — GET /api/v1/admin/statistics/students ──────────
 *
 * 대시보드 개요(`getStatistics`)와 **축이 다르다.** 저건 "지금 전체가 어떤가" 하나뿐이고
 * 이건 "어디에 몇 명인가" 를 반·계열·월로 쪼갠다. 전 원생을 받아 화면에서 세지 않는다 —
 * 원생 수가 늘수록 그대로 느려진다.
 *
 * ★ **축마다 세는 기준이 다르다(2026-09-21 대조).**
 *   · CLASS · TRACK — **재원생만** 센다. 분당 기준 계열 합 19 = 재원 19
 *   · MONTH — **휴원·퇴원까지 포함한 등록 전체**다. 9월 21 = 재원 19 + 휴원 1 + 퇴원 1
 *   같은 화면에서 두 숫자를 나란히 두면 "왜 안 맞지" 가 된다. 화면이 기준을 밝혀야 한다.
 *
 * ★ **재원이 0 인 반은 CLASS 결과에서 통째로 빠진다.** 분당 N수 1반(정원 14)은 한 명뿐인
 *   학생이 휴원이라 목록에 없었다. 현황 화면에서 반이 사라지면 "그 반이 없어졌다" 로 읽히므로
 *   반 목록(`/classes`)을 기준으로 합친다 — API_GAPS 28부.
 *
 * ★ 비어 있는 값을 0 으로 채우지 않는다. `capacity`·`fillRate` 는 반에만 있고 정원 없는 반은
 *   비어 있다. `delta` 는 월별에만 있고 첫 달은 비어 있다. 0 으로 그리면 "정원 0명"·
 *   "증감 없음" 으로 잘못 읽힌다.
 *
 * ★ `academyId` 를 빼면 **전 지점 합계**다(본사 계정). 400 이 아니다.
 */

export type StudentStatGroup = 'CLASS' | 'TRACK' | 'MONTH'

export interface StudentStatRow {
  /** 반 id · 계열 코드(SCIENCE 등) · yyyy-MM */
  key: string
  /** 계열은 **코드가 그대로 온다**(HUMANITIES). 화면에서 한글로 바꿔야 한다 */
  label: string
  count: number
  capacity: number | null
  fillRate: number | null
  delta: number | null
}

export function getStudentStatistics(params: {
  academyId?: number
  year: number
  groupBy: StudentStatGroup
  /** 월별에서 '오늘' 을 대신할 기준일(yyyy-MM-dd). 비우면 오늘 */
  asOf?: string
}): Promise<StudentStatRow[]> {
  return request<StudentStatRow[]>('/api/v1/admin/statistics/students', { query: { ...params } })
}
