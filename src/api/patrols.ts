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
  /**
   * 색을 묶는 키 — `OK`·`WARN`·`INSIDE`·`BRIEF`·`OUTSIDE`.
   *
   * ★ **`OK`(기본)를 `INSIDE` 에 넣지 않는다.** 「자리에서 공부 중」과 「강의실에 있음」이
   *   같은 색이 되면 안 된다 — 앞은 할 일이 없고 뒤는 확인이 필요하다.
   * ★ 서버가 모든 상태에 묶음이 있는지 테스트로 막는다. 그래도 **화면은 못 받았을 때를
   *   대비해 코드로도 묶는다** — 색 없는 칸이 생기면 무슨 상태인지 안 보인다.
   */
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
  /**
   * 구역으로 거른다.
   *
   * ★ **기록에 남은 좌석으로 거른다**(현재 배정이 아니다). 현재 배정으로 거르면 그 사이
   *   자리를 옮긴 학생이 빠지거나 끼어들어 **화면의 좌석표와 어긋난다** — 순찰 기록은
   *   「그때 거기 있었다」는 뜻이다.
   * ⚠️ 좌석이 지워졌으면 그 번호는 구역 목록에서 빠진다. 기록은 남아 있으니 **구역을
   *   비우고 조회**하면 보인다.
   */
  studyAreaId?: number
}

export function listPatrols(q: PatrolQuery): Promise<PatrolRecord[]> {
  return request<PatrolRecord[]>('/api/v1/admin/patrols', {
    query: { academyId: q.academyId, date: q.date, round: q.round, studyAreaId: q.studyAreaId },
  })
}

export interface PatrolSaveMark {
  enrollmentId: number
  /** 그때 앉아 있던 좌석. 학생 목록에서 찍으면 비운다 */
  seatCd?: string | null
  mark: string
}

/**
 * 그 회차의 기록을 저장한다.
 *
 * ★ **학생 단위 덮어쓰기다. 회차를 통째로 갈아끼우는 게 아니다**(2026-10-13 실호출로 확인).
 *   안 보낸 학생의 기록은 **그대로 남는다** — 그래서 **빼고 보내는 것으로는 지워지지 않는다.**
 *   지우려면 `clearPatrolRound` 로 회차를 비우고 다시 찍어야 한다.
 *
 * ★ 덕분에 **앱과 웹이 같은 회차를 나눠 찍어도 서로를 지우지 않는다** — 순찰은 앱에도
 *   같은 화면이 있다. 다만 **같은 학생을 둘이 찍으면 나중 것이 이긴다.**
 *
 * ★ 응답은 **보낸 것만** 돌려준다(회차 전체가 아니다). 화면을 응답으로 덮으면 다른 사람이
 *   찍은 것이 사라져 보이므로, 저장 뒤에는 **다시 조회**하는 쪽이 맞다.
 */
/**
 * 한 회차를 비운다.
 *
 * ★ **빈 목록을 저장하는 것은 비우는 뜻이 아니다.** 그렇게 만들면 화면 버그 하나가
 *   회차를 조용히 날린다 — 목록을 만드는 코드가 빈 배열을 보내는 실수는 흔하고,
 *   그때 **한 시간 돌며 찍은 것이 사라진다.** 지우는 것은 지우겠다고 말해야 한다.
 *
 * soft delete 라 「그 회차에 무엇이 있었나」는 남고, **비운 뒤 다시 찍는 것도 된다.**
 */
export function clearPatrolRound(
  round: number,
  q: { academyId: number; date: string },
): Promise<{ cleared: number }> {
  return request<{ cleared: number }>(`/api/v1/admin/patrols/rounds/${round}`, {
    method: 'DELETE',
    query: { academyId: q.academyId, date: q.date },
  })
}

export function savePatrol(body: {
  academyId: number
  /** yyyy-MM-dd */
  date: string
  round: number
  marks: PatrolSaveMark[]
}): Promise<PatrolRecord[]> {
  return request<PatrolRecord[]>('/api/v1/admin/patrols', { method: 'POST', body })
}

/* ── 순찰 전용 좌석 조회 (2026-10-13) ────────────────────────────────────────
 *
 * ★ **좌석 화면(`/seats/*`)을 그대로 쓰지 않는다.** 그쪽은 담임에게 닫혀 있고, 열면
 *   독서실 좌석배치·좌석 이탈·배정 관리까지 함께 열린다. 그래서 순찰 권한으로 되는
 *   **전용 조회**를 따로 둔다 — 서버가 `patrol` 권한 아래에 만들었다.
 *
 * ★ **좌석 화면보다 적게 온다.** 배정 상태 · 좌석이탈(여부·시각·사유) · 반 · 키오스크
 *   번호가 빠져 있다 — 그건 **배정 관리에 쓰는 값**이다. 순찰에 필요한 것은
 *   「지금 누가 어디 앉아 있나」뿐이다.
 *
 * ★ 이렇게 나눠 두면 **나중에 좌석 화면 권한을 바꿔도 순찰이 따라 흔들리지 않는다.**
 */

export interface PatrolArea {
  id: number
  areaNm: string
  /** 관을 빼면 **본관 A 와 별관 A 가 화면에서 구분되지 않는다** */
  buildingName: string | null
  sortOrder: number | null
}

export interface PatrolSeat {
  seatId: number
  seatCd: string
  xPos: number | null
  yPos: number | null
  /** 비어 있으면 공석이다 */
  enrollmentId: number | null
  studentNo: string | null
  studentName: string | null
  masked?: boolean
}

export function listPatrolAreas(academyId: number): Promise<PatrolArea[]> {
  return request<PatrolArea[]>('/api/v1/admin/patrols/areas', { query: { academyId } })
}

export function listPatrolSeats(studyAreaId: number): Promise<PatrolSeat[]> {
  return request<PatrolSeat[]>('/api/v1/admin/patrols/seats', { query: { studyAreaId } })
}
