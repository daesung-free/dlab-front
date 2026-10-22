import { request } from './client'

/* 지점 목록 — GET /api/v1/admin/academies
 *
 * ★ 권한에 따라 서버가 알아서 걸러준다. 전 지점 권한이면 11개, 지점 관리자면 자기 지점 1개만 온다.
 *   그래서 화면은 역할로 분기하지 않고 "받은 목록"만 그리면 된다. */

export interface Academy {
  id: number
  /** 대성전산 부여 지점코드. 연속이 아니다(31~34 다음 42) — 정렬 키로 쓰지 말 것 */
  acadCd: string
  acadNm: string
  fullNm: string
  storeCode: string
  /**
   * 등원 기준 시각 — **미등원(결석) 감지 배치가 이 시각에 돈다.**
   *
   * ★ 전에는 이 값이 **지각 판정도 겸했다.** 2026-10-19 디랩 회신으로 지각이
   *   분리돼 `lateAfter` 가 생겼다(지각 07:50 / 결석 08:20).
   */
  attendanceDeadline: string
  /**
   * 지각 기준 시각 — **이 시각 이후 첫 태깅이 지각**이다.
   *
   * ★ **`null` 이면 `attendanceDeadline` 을 그대로 쓴다**(전 동작 유지). 기본값을
   *   07:50 으로 박으면 **값이 안 들어온 지점에서 08시에 오는 학생이 전부 지각**이 된다 —
   *   지금 11개 지점이 모두 09:00 이고 디랩 값은 한 건도 안 들어왔다.
   * ★ **둘을 한 칸으로 묶지 않는다.** 같은 값이면 기준이 08:20 인 지점에서 07:55 에 온
   *   학생이 **출결상 정상인데 학부모에게는 지각 알림**이 간다.
   * ★ 서버가 먼저 배포되지 않았으면 `undefined` 로 온다.
   */
  lateAfter?: string | null
  active: boolean
}

export function listAcademies(): Promise<Academy[]> {
  return request<Academy[]>('/api/v1/admin/academies')
}

/**
 * 지점 정보 수정 — 이름·정식명·등원 기준 시각.
 *
 * ★ **등원 기준 시각이 지각 판정 기준이다.** 이 시각 이후 첫 태깅이 지각으로 잡히므로
 *   바꾸면 그날부터 지각 집계가 달라진다. 화면이 그 사실을 함께 알린다.
 * ★ 지점코드(`acadCd`)·상점코드는 못 바꾼다 — 대성전산이 부여한 값이라 우리 쪽에서 바꾸면
 *   결제·키오스크가 어긋난다.
 */
export function updateAcademy(
  academyId: number,
  /**
   * ★ **`lateAfter` 를 비워 보내면 서버가 안 건드린다.** 등원 기준만 고치는 흐름에서
   *   지각 값이 **조용히 덮어써지지 않게** 그렇게 돼 있다.
   */
  body: { acadNm: string; fullNm?: string; attendanceDeadline?: string; lateAfter?: string },
): Promise<Academy> {
  return request<Academy>(`/api/v1/admin/academies/${academyId}`, { method: 'PUT', body })
}
