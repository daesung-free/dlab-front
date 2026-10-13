import { requestPaged } from './client'
import type { Paged } from './types'

/* Daily Report 집계 (F-4.11-6) — /api/v1/admin/daily-reports
 *
 * ★ **기존 두 API 로는 이 화면을 그릴 수 없었다.** `/statistics` 는 지점 전체 개요이고
 *   학생별 통계는 **한 명씩만** 준다 — 전교생을 줄 세우려면 **200명이면 호출이 200번**이다.
 *   그래서 목록을 서버가 한 번에 만든다.
 *
 * ★ **순위는 서버가 센다.** 화면이 세면 **그 페이지 안에서만** 등수가 매겨져 **2페이지 첫 줄이
 *   또 1등**이 된다. 동점은 같은 등수이고 다음을 건너뛴다(1, 1, 3).
 *
 * ★ **집계값이 없으면 비어 있다 — 0 이 아니다.** 「집계한 날이 없다」와 「0분 공부했다」는
 *   다르다. 0 으로 그리면 담당자가 **공부 안 한 학생으로 읽는다.**
 */

export interface DailyReportRow {
  enrollmentId: number
  studentNo: string | null
  studentName: string | null
  /** 이름이 가려졌는지. **없으면 화면이 「이름이 잘못 저장됐다」로 오인한다** */
  masked?: boolean
  classId: number | null
  className: string | null
  homeroomTeacherId: number | null
  homeroomTeacherName: string | null
  /** 순공시간(재실 − 외출 − 급식 − 쉬는시간) 합계. **집계한 날이 없으면 null** */
  studyMinutes: number | null
  presenceMinutes: number | null
  /**
   * ⚠️ **항상 비어 있다 — 정의 미확정.**
   *
   * 산식이 요구사항에 없어 서버가 만들지 않는다. **화면도 숫자로 그리지 않는다** —
   * 추측한 값을 그리면 화면이 그걸 사실로 보여준다.
   */
  concentration: number | null
  attendedDays: number | null
  measuredDays: number | null
  /**
   * 하원 태깅이 없어 **집계하지 않은** 날 수.
   *
   * ★ **「0분」이 아니다.** 직원이 하원 시각을 수기로 넣으면 사라진다 — 출결 관리의
   *   「태깅 추가 → 하원」이 그 경로다. 이 숫자가 크면 순공시간을 믿으면 안 된다.
   */
  missingCheckOutDays: number | null
  /** 오늘 아직 학원에 있는 날. **잠정값으로 집계에 들어가 있다** */
  inProgressDays: number | null
  /** 루틴 이행(O) 건수. **O/X 2단계다**(I-19) — 부분 이행이 없다 */
  routineDone: number | null
  routineMissed: number | null
  routineJudged: number | null
  /** 이행률(%). **판정된 건이 없으면 null** — 「루틴이 없던 기간」과 「0% 이행」은 다르다 */
  routineCompletionRate: number | null
  studyRank: number | null
  presenceRank: number | null
  routineRank: number | null
}

export interface DailyReportQuery {
  academyId?: number
  /** yyyy-MM-dd */
  from: string
  to: string
  classId?: number
}

/**
 * 서버가 순위까지 매겨 페이지로 준다.
 *
 * ★ 다중 정렬은 `?sort=a,asc&sort=b,asc` 라 **`repeatable`** 로 보낸다.
 */
export function listDailyReports(
  params: DailyReportQuery & { page?: number; size?: number; sort?: string | string[] },
): Promise<Paged<DailyReportRow>> {
  const { sort, ...rest } = params
  return requestPaged<DailyReportRow>('/api/v1/admin/daily-reports', {
    query: { ...rest },
    repeatable: { sort },
  })
}

/**
 * 서버가 받는 정렬 키.
 *
 * ⚠️ **아직 확인하지 못했다**(서버가 내려가 있어 실호출로 대조하지 못했다). 허용 목록 밖은
 * **400 이 아니라 조용히 무시**되므로, **확인 전에는 정렬 UI 를 붙이지 않는다** —
 * 붙이면 눌러도 안 바뀌는 헤더가 되고, 사용자는 「정렬이 고장났다」로 읽는다.
 * 대신 **순위 칸(`studyRank` 등)을 서버가 매겨 주므로** 기본 순서로도 줄 세우기가 된다.
 */
export const DR_SORTABLE: readonly string[] = []

/** 시간(분) → '7시간 20분'. **null 은 '-' 가 아니라 호출부가 가린다** */
export function minutesText(v: number | null | undefined): string {
  if (v == null) return ''
  const h = Math.floor(v / 60)
  const m = v % 60
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}
