import { downloadFile, request } from './client'

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
export type AttendanceStatus = 'ON_TIME' | 'LATE' | 'ABSENT' | 'OUT' | 'EARLY_LEAVE' | 'NOT_YET'

export const ATTENDANCE_STATUS: readonly AttendanceStatus[] = [
  'ON_TIME',
  'LATE',
  'ABSENT',
  'OUT',
  'EARLY_LEAVE',
  'NOT_YET',
] as const

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  ON_TIME: '정상 등원',
  LATE: '지각',
  ABSENT: '결석',
  OUT: '외출',
  EARLY_LEAVE: '조퇴',
  /** ★ 아직 오지 않은 날. **결석과 반드시 구분해야 한다** — 미래 날짜를 조회하면 전원 이 값이다 */
  NOT_YET: '예정',
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
 * 조회 조건 그대로 서버 엑셀을 받는다(2026-09-25 서버가 조건을 받게 됐다).
 *
 * ★ 화면에서 만들던 엑셀과 **같은 조건**이다 — 조회와 같은 필터 코드를 서버가 탄다.
 * ★ **마스킹 해제 권한은 서버가 판단한다.** 파일은 회수가 안 되므로 화면 토글보다 기준이 높다 —
 *   화면에서 이름을 보고 있어도 파일에서는 가려질 수 있다.
 */
export function exportAttendance(params: AttendanceParams & { unmask?: boolean }, filename = '출결_현황.xlsx'): Promise<void> {
  const { statuses, ...rest } = params
  return downloadFile('/api/v1/admin/attendance/export', filename, {
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

/* ── 출결 보정 ───────────────────────────────────────────────────────────────
 *
 * ★ 카드를 안 찍고 들어온 학생을 처리하는 경로다. 없으면 그 학생은 그날 결석으로 남는다.
 * ★ 경로의 `{id}` 는 **`enrollmentId`** 다. 출결 행에는 자체 id 가 없다 —
 *   행은 학생 × 날짜라 `date` 를 본문에 함께 보낸다.
 * ★ **정정 사유가 필수다.** 나중에 왜 고쳤는지 아는 유일한 근거라 서버가 막는다.
 */

/** 태깅 종류. 출결 상태(AttendanceStatus)와 다른 축이다 — 이쪽은 '사건'이다 */
export type TaggingEvent =
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'LATE'
  | 'OUTING'
  | 'EXCUSED_OUTING'
  | 'EARLY_LEAVE'
  | 'RETURN'

export const TAGGING_EVENT_LABEL: Record<TaggingEvent, string> = {
  CHECK_IN: '등원',
  CHECK_OUT: '하원',
  LATE: '지각',
  OUTING: '외출',
  EXCUSED_OUTING: '인정 외출',
  EARLY_LEAVE: '조퇴',
  RETURN: '복귀',
}

/**
 * 상태 직접 정정으로 넣을 수 있는 값.
 *
 * ★ 조회 응답의 `AttendanceStatus` 와 **집합이 다르다.** `OUT`·`NOT_YET` 은 못 넣는다 —
 *   외출은 태깅으로 생기는 것이고, '예정' 은 아직 안 온 날이라 사람이 정할 값이 아니다.
 */
export type FixableStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'EARLY_LEAVE'

export const FIXABLE_STATUS_LABEL: Record<FixableStatus, string> = {
  PRESENT: '정상 등원',
  LATE: '지각',
  ABSENT: '결석',
  EARLY_LEAVE: '조퇴',
}

/**
 * 정정 이력 한 줄.
 *
 * ★ 상태 정정과 태깅 추가가 **한 표에 섞여 온다.** 어느 쪽이냐에 따라 채워지는 칸이 다르다 —
 *   상태 정정이면 before/afterStatus 가, 태깅 추가면 addedEvent·addedAt 이 찬다.
 *   나머지는 null 이므로 화면이 그걸로 두 종류를 갈라야 한다.
 */
export interface AttendanceModification {
  id: number
  date: string
  reason: string
  modifiedAt: string
  modifiedBy: number | null
  beforeStatus: string | null
  afterStatus: string | null
  beforeExcused: boolean | null
  afterExcused: boolean | null
  /** 태깅 추가일 때만 찬다 */
  addedEvent: TaggingEvent | null
  addedAt: string | null
}

/** 태깅 누락 보정 — 찍히지 않은 등·하원을 사람이 넣는다. `at` 은 `HH:mm` */
export function addTagging(
  enrollmentId: number,
  body: { date: string; at: string; eventType: TaggingEvent; reason: string },
): Promise<void> {
  return request<void>(`/api/v1/admin/attendance/${enrollmentId}/taggings`, { method: 'POST', body })
}

/** 상태 직접 정정 — 태깅과 무관하게 그날 상태를 못박는다 */
export function fixAttendanceStatus(
  enrollmentId: number,
  body: { date: string; status: FixableStatus; reason: string },
): Promise<void> {
  return request<void>(`/api/v1/admin/attendance/${enrollmentId}/status`, { method: 'PUT', body })
}

/** 정정 이력 — `date` 가 필수다 */
export function listAttendanceModifications(
  enrollmentId: number,
  date: string,
): Promise<AttendanceModification[]> {
  return request<AttendanceModification[]>(`/api/v1/admin/attendance/${enrollmentId}/modifications`, {
    query: { date },
  })
}
