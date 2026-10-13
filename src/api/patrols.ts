import { request } from './client'

/* 순찰 관리 (0928 피드백 1-3) — /api/v1/admin/patrols
 *
 * 사감·담임이 돌면서 좌석을 눌러 상태를 남긴다. 지금은 종이에 찍고 DSA 에 다시 넣는다.
 *
 * ★ **좌석이 아니라 학생(`enrollmentId`)에 붙는다.** 좌석은 재배치되는데 순찰 기록은
 *   「그때 그 학생」의 상태다 — 좌석으로만 남기면 재배치 뒤 기록이 엉뚱한 사람에게 붙는다.
 *   `seatCd` 는 **그때 어디 앉아 있었는지**를 함께 남기는 값이고 비워도 된다.
 *
 * ★ **`(날짜, 회차, 학생)` 이 유일**하고 같은 회차를 다시 보내면 덮어쓴다. 순찰을 다시
 *   돌 수 있어서다. 좌석도 함께 갱신된다 — 그 사이 자리를 옮겼을 수 있다.
 *
 * ★ **한 번에 모아 보낸다.** 한 건씩 보내면 느린 태블릿에서 **누른 것이 빠진 채 넘어간다.**
 *   응답이 저장된 전체를 돌려주므로 그 값으로 화면을 맞추면 빠진 것이 바로 드러난다.
 */

export interface PatrolMarkDef {
  code: string
  label: string
  /**
   * 자리에 없는 상태인가.
   *
   * ★ **「없다」와 「졸고 있다」는 다르다.** 졸음은 자리에 있는 것이라 자리 비움으로 묶으면
   *   통계가 틀린다. 화면이 세 개(외출·화장실·공용공간)를 하드코딩하고 있었는데,
   *   상태가 늘면 조용히 어긋나므로 이 값을 쓴다.
   */
  away: boolean
  /** 색을 묶는 키(WARN·INSIDE·BRIEF·OUTSIDE). 서버가 안 주면 화면이 코드로 묶는다 */
  group?: string | null
}

/** 팔레트에 그릴 상태 목록. **문구를 화면에 박지 않는다** — 서버가 내린다 */
export function listPatrolMarks(): Promise<PatrolMarkDef[]> {
  return request<PatrolMarkDef[]>('/api/v1/admin/patrols/marks')
}

export interface PatrolRecord {
  enrollmentId: number
  studentNo: string | null
  studentName: string | null
  seatCd: string | null
  round: number
  mark: string
  /** 서버가 이름을 가려 보냈는가. 상위 관리자가 아니면 가려져 온다 */
  masked?: boolean
}

export interface PatrolQuery {
  academyId: number
  /** yyyy-MM-dd. 비우면 오늘 */
  date?: string
  /** 비우면 **그날 전부** — 1~5회차를 한 화면에 볼 때 비운다 */
  round?: number
}

export function listPatrols(q: PatrolQuery): Promise<PatrolRecord[]> {
  return request<PatrolRecord[]>('/api/v1/admin/patrols', {
    query: { academyId: q.academyId, date: q.date, round: q.round },
  })
}

export interface PatrolSaveMark {
  enrollmentId: number
  /** 그때 앉아 있던 좌석. 학생 목록에서 찍으면 비운다 */
  seatCd?: string | null
  mark: string
}

/**
 * 한 회차를 통째로 저장한다.
 *
 * ★ **보낸 목록이 그 회차의 전부**다(덮어쓰기). 화면에서 지운 것은 빼고 보내면 된다.
 */
export function savePatrol(body: {
  academyId: number
  /** yyyy-MM-dd */
  date: string
  round: number
  marks: PatrolSaveMark[]
}): Promise<PatrolRecord[]> {
  return request<PatrolRecord[]>('/api/v1/admin/patrols', { method: 'POST', body })
}
