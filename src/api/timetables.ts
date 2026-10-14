import { request } from './client'

/* 반 주간 시간표 · 이동수업 — /api/v1/admin/timetables
 *
 * 고정반 관리(F-4.1-4)가 「학생이 어느 반인가」를 정한다면, 이쪽은 **「그 반이 언제 어디서
 * 무슨 수업을 하는가」**다.
 *
 * ★ **강의실이 두 군데다.** 칸에 지정한 강의실(`roomNo`)이 비면 **반 홈룸**으로 떨어지는데,
 *   그 판정을 **서버가 한 곳에서 해서 `effectiveRoomNo` 로 내려준다.** 화면이 다시 계산하면
 *   화면마다 다르게 떨어진다 — 그대로 쓴다.
 *
 * ★ **저장은 보낸 칸만 손댄다.** 받은 목록으로 한 주를 통째로 갈아치우지 않는다 — 목록을
 *   만드는 코드가 빈 배열을 보내는 실수는 흔하고, 그때 **편성이 통째로 날아간다.**
 *   그래서 서버가 **빈 목록을 거절**한다(순찰 저장과 같은 판단이다).
 *
 * ★ **내용이 모두 빈 칸은 「지움」**이다. 편성 화면은 칸을 눌러 내용을 지우는 식으로 쓰므로,
 *   삭제를 따로 두면 저장 한 번이 하나의 트랜잭션이 되지 못한다.
 *
 * ★ **같은 시간 같은 강의실은 서버가 거절한다.** DB 유니크가 최종 방어선이다 — 화면에서
 *   아무리 막아도 두 사람이 동시에 저장하면 뚫린다.
 */

export const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'] as const
export type DayOfWeek = (typeof DAYS)[number]

export const DAY_LABEL: Record<DayOfWeek, string> = {
  MONDAY: '월',
  TUESDAY: '화',
  WEDNESDAY: '수',
  THURSDAY: '목',
  FRIDAY: '금',
  SATURDAY: '토',
}

export interface TimetableCell {
  id: number
  classId: number
  className: string | null
  dayOfWeek: DayOfWeek
  /** ★ 교시 **마스터 참조**다. 번호만 들면 교시 시각을 고쳤을 때 시간표만 옛 시각으로 남는다 */
  periodId: number
  periodNo: number | null
  periodName: string | null
  startTime: string | null
  endTime: string | null
  subject: string | null
  teacherId: number | null
  teacherName: string | null
  /** 그 칸에 지정된 강의실. **비어 있으면 이동수업이 아니다** */
  roomId: number | null
  roomNo: string | null
  /** ★ 실제 적용 강의실 — 칸이 비면 반 홈룸이다. **서버가 정해서 내린다** */
  effectiveRoomId: number | null
  effectiveRoomNo: string | null
  /** 반 홈룸. 「홈룸이라서 비었다」와 「홈룸도 없다」를 가르는 값이다 */
  homeroomId: number | null
  homeroomNo: string | null
}

/** 그 지점·연도 전체 — 「이 시간에 어느 반이 어디에」를 되짚는다(강의실 사용 현황) */
export function listTimetables(params: {
  academyId: number
  year: number
}): Promise<TimetableCell[]> {
  return request<TimetableCell[]>('/api/v1/admin/timetables', { query: params })
}

/** 그 반의 한 주 */
export function getClassTimetable(classId: number): Promise<TimetableCell[]> {
  return request<TimetableCell[]>(`/api/v1/admin/timetables/classes/${classId}`)
}

export interface TimetableCellSave {
  dayOfWeek: DayOfWeek
  periodId: number
  subject?: string | null
  teacherId?: number | null
  /** 그 칸에서만 쓰는 강의실(이동수업). **비우면 반 홈룸으로 떨어진다** */
  roomId?: number | null
}

/**
 * 편성 저장.
 *
 * ★ **빈 목록은 서버가 거절한다.** 호출부가 먼저 막는다 — 안 그러면 「저장이 안 된다」로 보인다.
 */
export function saveClassTimetable(classId: number, cells: TimetableCellSave[]): Promise<TimetableCell[]> {
  return request<TimetableCell[]>(`/api/v1/admin/timetables/classes/${classId}`, {
    method: 'PUT',
    body: { cells },
  })
}

export interface TimetableCopyClass {
  classId: number
  className: string | null
  copied: number
  skipped: number
  /** 작년에 같은 이름의 반이 없었다 */
  noSource?: boolean
}

export interface TimetableCopyResult {
  fromYear: number
  toYear: number
  copied: number
  skipped: number
  /** 작년에서 짝을 못 찾은 반 수 — 이 숫자로 안내를 띄운다 */
  classesWithoutSource: number
  classes: TimetableCopyClass[]
}

/**
 * 전년도 복사 — 「바뀐 것만 고치기」로 넘어가게 작년 편성을 올해로 옮긴다.
 *
 * ★ **멱등하다.** 두 번 눌러도 같다 — 올해에 이미 있는 칸은 건너뛴다. 덮어쓰면 **복사 뒤
 *   손으로 고친 편성이 되돌려진다.**
 * ★ **결과가 반별로 온다.** 합계만 보여주면 「이 반은 작년에 같은 이름이 없어 비었습니다」를
 *   말해 줄 수 없다.
 */
export function copyTimetableYear(body: {
  academyId: number
  fromYear: number
  toYear: number
}): Promise<TimetableCopyResult> {
  return request<TimetableCopyResult>('/api/v1/admin/timetables/copy', { method: 'POST', body })
}
