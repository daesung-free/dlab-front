import { request } from './client'

/* 출결 관리 (F-4.3) — GET /api/v1/admin/attendance
 *
 * ★ 페이징이 없고, **앞으로도 안 연다**(2026-09-02 백엔드 회신). 조회일의 재원생 전원을
 *   주는 것이 이 API 의 목적이다 — 태깅한 학생만 주면 결석자가 목록에서 사라져
 *   "오늘 결석 몇 명"을 셀 수 없다. 지점당 300명 규모까지 그대로 간다.
 *   그래서 이 화면은 useServerTable 이 아니라 useServerData 를 쓰고, 페이징·정렬은
 *   DataTable 의 클라이언트 모드가 맡는다. **이건 임시가 아니라 확정이다.**
 *
 * ★ EXCUSED(사유 승인)는 **상태가 아니라 플래그**다. status 축과 직교한다 —
 *   '지각인데 사유 승인됨'이 성립하기 때문이다. statuses 에 넣으면 400이고,
 *   거르려면 excused 파라미터를 쓴다. 그런데 summary 에는 EXCUSED 카운트가 함께 온다.
 *
 * ★ 전 지점 권한 계정은 academyId 를 반드시 보낸다. 안 보내면 400("지점을 지정해야 합니다")이라
 *   화면이 그냥 빈 것처럼 보인다.
 */

/** 서버 ScreenStatus. 화면 표시용 축이라 서버 내부 DailyStatus 와 다르다 */
export type AttendanceStatus = 'ON_TIME' | 'LATE' | 'ABSENT' | 'OUT' | 'EARLY_LEAVE'

export const ATTENDANCE_STATUS: readonly AttendanceStatus[] = [
  'ON_TIME',
  'LATE',
  'ABSENT',
  'OUT',
  'EARLY_LEAVE',
] as const

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  ON_TIME: '정상 등원',
  LATE: '지각',
  ABSENT: '결석',
  OUT: '외출',
  EARLY_LEAVE: '조퇴',
}

export interface AttendanceRow {
  /**
   * 조회일. **기간 조회면 학생 × 날짜로 행이 늘어난다**(19명 × 3일 = 57행).
   * 그래서 행 키는 enrollmentId 만으로는 안 되고 date 와 묶어야 한다.
   */
  date: string
  enrollmentId: number
  studentNo: string | null
  name: string
  /** 고정반. 미배정이면 null */
  className: string | null
  seatCd: string | null
  /** 'HH:mm:ss'. 미태깅이면 null */
  checkInAt: string | null
  checkOutAt: string | null
  status: AttendanceStatus
  /** 사유 승인 여부. status 와 직교하는 축이다 */
  excused: boolean
  studyMinutes: number
  /** 서버가 만든 'N시간 MM분' 문자열. 화면은 그대로 찍는다 */
  studyTime: string
  guardianPhone: string | null
  /** 사유 없이 미등원 → 지각알림 + 사유 회신 요청이 자동 발송된 건 */
  unexcusedLate: boolean
}

/**
 * 상단 통계.
 *
 * ★ 조회된 목록 기준이라 필터를 걸면 같이 줄어든다.
 *   기간 조회면 **날짜별 합**이다 — 19명 × 3일이면 total 이 57 이지 19 가 아니다.
 * ★ 키가 `total` + ScreenStatus 5종 + `EXCUSED`다. EXCUSED 는 상태가 아니라 플래그라
 *   따로 세므로 **합이 total 을 넘을 수 있다**(지각이면서 사유 승인된 건).
 */
export type AttendanceSummary = Record<'total' | AttendanceStatus | 'EXCUSED', number>

export interface AttendanceBoard {
  rows: AttendanceRow[]
  summary: AttendanceSummary
  /** 서버가 이미 가려서 보냈는지. true면 name·guardianPhone 이 마스킹된 값이다 */
  masked: boolean
}

export interface AttendanceParams {
  /** 전 지점 권한 계정은 필수. 지점 관리자는 비우면 자기 지점 */
  academyId?: number
  /**
   * yyyy-MM-dd. 하루만 조회한다. 비우면 서버가 오늘로 본다.
   * ★ from·to 와 **함께 보내면 무시된다** — 기간 쪽이 이긴다. 둘 중 하나만 보낼 것.
   */
  date?: string
  /** 기간 조회 시작 (yyyy-MM-dd). to 와 함께 쓴다 */
  from?: string
  /** 기간 조회 끝 */
  to?: string
  classId?: number
  /** 여러 개면 배열. EXCUSED 는 여기 못 넣는다(위 주석) */
  statuses?: AttendanceStatus[]
  /** 사유 승인 건만/제외. statuses 와 별개 축이다 */
  excused?: boolean
  /** 이름·학번·좌석 부분일치 */
  keyword?: string
}

export function fetchAttendanceBoard(params: AttendanceParams): Promise<AttendanceBoard> {
  const { statuses, ...rest } = params
  return request<AttendanceBoard>('/api/v1/admin/attendance', {
    query: { ...rest },
    repeatable: { statuses },
  })
}

/**
 * 학습시간 일괄 재계산 (화면 '학습시간 일괄계산' 버튼).
 *
 * ★ 오늘은 대상이 아니다. 아직 하원 전이라 값이 계속 늘어나 저장할 시점이 아니고,
 *   조회 화면이 그날치는 즉석 계산한다. 0이 와도 실패가 아니라 "확정된 날이 없다"는 뜻이다.
 */
export function recalculateStudyTime(params: {
  academyId?: number
  from: string
  to: string
}): Promise<{ updated: number }> {
  return request<{ updated: number }>('/api/v1/admin/attendance/study-time/recalculate', {
    method: 'POST',
    query: { ...params },
  })
}
