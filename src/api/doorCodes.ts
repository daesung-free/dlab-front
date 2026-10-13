import { request } from './client'

/* 지점 도어락 번호 (추가개발 8번) — /api/v1/admin/door-codes
 *
 * 7시에 출입문이 안 열렸을 때 학생이 출입문 QR 로 번호를 받아 간다. 그 번호를 여기서
 * 미리 저장해 두고, 08:00 이후 지점 관리자가 실물 도어락을 교체하면 새 번호를 넣는다.
 *
 * ★ **번호는 응답에 내려오지 않는다.** `appliedAt`(언제 바꿨나)·`changedByName`(누가)만 온다.
 *   관리자는 실물 도어락을 만지는 사람이라 지금 번호를 이미 알고 있고, 화면에 띄우면
 *   어깨 너머로 새는 경로가 하나 늘어난다. 그래서 화면에도 「현재 번호」 칸을 두지 않는다.
 *
 * ★ **한 번 쓴 번호는 다시 못 쓴다**(400). 돌려 쓰면 지난번에 번호를 받아 간 학생이
 *   지금도 들어온다. 그래서 **잘못 입력한 번호도 영구히 못 쓰게 된다** — 네 자리 공간에서
 *   한 칸이 영영 빠지는 셈이라, 화면에서 같은 값을 두 번 받아 오타를 막는다.
 *
 * ★ 교체는 덮어쓰기가 아니라 **새 행**이다. 잘못 넣었으면 올바른 번호로 한 번 더 등록하면
 *   그것이 「지금 번호」가 된다(잘못 넣은 번호는 위 제약으로 못 쓰게 된 채 남는다).
 *
 * ★ **전 지점 권한 계정은 `academyId` 를 보내야 한다** — 안 보내면 400 「지점을 지정해야
 *   합니다」다. 지점 관리자는 비우면 자기 지점이다.
 */

export interface DoorCode {
  id: number
  academyId: number
  /** 번호를 넣은 시각(ISO). 화면은 이것만 보여준다 */
  appliedAt: string | null
  /** 계정 id. 화면에 쓰지 않는다 — 이름은 `changedByName` 을 쓴다 */
  changedBy: number | null
  /**
   * 넣은 사람 이름.
   *
   * ★ **빌 수 있고, 비면 「사람이 아니다」는 뜻이다**(배치·시스템이 넣은 행이거나 계정이
   *   지워진 경우). 그때는 화면에 「시스템」으로 그린다 — 빈칸으로 두면 누락처럼 보인다.
   */
  changedByName: string | null
}

/* ★ `GET /door-codes/current` 는 **쓰지 않는다.** 이력 목록의 첫 행이 곧 지금 번호라
     한 번 더 부르면 두 응답이 서로 다른 시점이 되어 「마지막 변경」과 표 첫 줄이 어긋난다
     — 좌석 이탈에서 같은 이유로 `/seat-leaves/current` 를 뺐다(seatLeaves.ts 주석). */

export function listDoorCodeHistory(academyId: number): Promise<DoorCode[]> {
  return request<DoorCode[]>('/api/v1/admin/door-codes/history', { query: { academyId } })
}

/** 숫자 4~12자리. 공백·하이픈은 서버가 흘려보내므로 입력 모양을 강제하지 않는다 */
export function saveDoorCode(academyId: number, code: string): Promise<DoorCode> {
  return request<DoorCode>('/api/v1/admin/door-codes', {
    method: 'POST',
    query: { academyId },
    body: { code },
  })
}

/** 넣은 사람. 비어 있으면 사람이 넣은 것이 아니다 */
export function changedByLabel(row: DoorCode): string {
  return row.changedByName?.trim() || '시스템'
}
