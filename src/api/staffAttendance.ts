import { request } from './client'

/* 직원 출근 기록 (추가개발 12번) — /api/v1/admin/staff-attendance/records
 *
 * 키오스크 태깅으로 들어온 직원 출근(IN)·퇴근(OUT) 기록이다. 07:05 출근 확인이 이 기록을
 * 보기 때문에, 태깅이 빠진 날을 고치지 못하면 다음 날 아침에도 문자가 나간다.
 *
 * ★ **고칠 수 있는지를 서버가 알려준다**(`canEdit`). 화면이 권한 코드를 들고 판단하지
 *   않는다 — 권한 이름이 바뀌거나 조건이 늘어도(지점 범위 등) 화면이 안 깨진다.
 *   `STAFF_ATTENDANCE_EDIT` 를 켠 계정만 true 다.
 *
 * ★ **기간이 필수다**(`from`·`to`). 페이징은 없다 → `useServerData`.
 */

export interface StaffAttendanceRecord {
  id: number
  academyId: number
  academyName: string | null
  staffId: number | null
  staffName: string | null
  workDate: string | null
  /** IN · OUT */
  eventType: string
  /** 실제로 찍힌 시각(ISO) */
  recordedAt: string | null
  /** 고친 적이 있는가. 누가·왜는 수정 이력(`listRecordEdits`)에 있다 */
  edited: boolean
}

/**
 * 수정 이력 한 건. **전후 값이 다 들어 있다** — 「누가·언제·무엇을·왜」의 '무엇을' 이
 * 전후 비교라서, 뒤값만 남기면 무엇이 바뀌었는지 알 수 없다.
 */
export interface StaffAttendanceEdit {
  id: number
  attendanceId: number
  staffName: string | null
  workDate: string | null
  beforeEventType: string
  beforeRecordedAt: string | null
  afterEventType: string
  afterRecordedAt: string | null
  reason: string | null
  /** 계정 id. 추적은 이 값으로 한다 */
  editedBy: number | null
  /**
   * 수정자 이름(표시용).
   *
   * ★ **비면 「사람이 아니다」는 뜻이다** — 배치·시스템이 한 것은 계정 0 이라 이름이 없다.
   * ★ **당시 이름이 아니라 지금 이름**이다. 그 사람이 개명하면 과거 이력 이름도 바뀐다 —
   *   추적은 `editedBy`(id) 로 하고 이 값은 읽기 편하라고 있는 것이다.
   */
  editedByName?: string | null
  editedAt: string | null
}

export interface StaffAttendanceResult {
  /**
   * 이 계정이 기록을 고칠 수 있는가.
   *
   * ★ 화면은 **이 값으로만** 수정 버튼을 가른다. 권한이 없으면 목록은 보이고 수정만 막힌다 —
   *   기록을 보는 것은 업무이고 고치는 것은 승인받은 사람이 하는 일이다.
   */
  canEdit: boolean
  records: StaffAttendanceRecord[]
}

export interface StaffAttendanceQuery {
  from: string
  to: string
  academyId?: number | null
}

export function listStaffAttendance(q: StaffAttendanceQuery): Promise<StaffAttendanceResult> {
  return request<StaffAttendanceResult>('/api/v1/admin/staff-attendance/records', {
    query: { from: q.from, to: q.to, academyId: q.academyId ?? undefined },
  })
}

export const EVENT_LABEL: Record<string, string> = { IN: '출근', OUT: '퇴근' }

export function listRecordEdits(attendanceId: number): Promise<StaffAttendanceEdit[]> {
  return request<StaffAttendanceEdit[]>(`/api/v1/admin/staff-attendance/records/${attendanceId}/edits`)
}

/**
 * 출근 기록 수정.
 *
 * ★ **`reason` 이 필수다 — 공백만 보내도 400** 이다. 「누가·언제·무엇을·왜」에서 '왜' 가
 *   빠지면 나머지 셋이 쓸모없어진다. 고친 값은 원본보다 신뢰도가 낮은데 그 사실이
 *   안 남기 때문이다.
 *
 * ★ **근무일을 넘기는 수정은 400 이다.** 시각만 다른 날로 옮기면 07:05 검사가 근무일로
 *   세기 때문에 그 행이 **어느 날에도 안 잡힌다.** 그래서 화면은 날짜를 고정하고
 *   시각만 받는다.
 *
 * ★ `recordedAt` 은 **지역 시각 문자열**(`2026-10-12T07:05:00`)로 보낸다 — Z 를 붙이면
 *   9시간이 밀린다.
 */
export function editAttendanceRecord(
  id: number,
  body: { eventType: string; recordedAt: string; reason: string },
): Promise<unknown> {
  return request(`/api/v1/admin/staff-attendance/records/${id}`, { method: 'PATCH', body })
}
