import { request } from './client'

/* 긴급 출입 요청 내역 (추가개발 10번) — /api/v1/admin/emergency-access
 *
 * 학생이 출입문 QR 로 번호를 요청한 기록이다. 요청 1건마다 시각·지점·학생·판정 결과가 남는다.
 *
 * ★ **`from`·`to` 가 필수다** — 안 보내면 400 「필수 파라미터 'from' 이(가) 없습니다」.
 *   `academyId` 는 선택이고, 지점 범위는 계정 토큰을 따른다.
 * ★ 페이징이 없다 → `useServerData`.
 *
 * ★ **번호는 기록에 남지 않는다.** 요청 기록에 번호를 그대로 쓰면 암호화해 둔 의미가 없다 —
 *   어느 번호였는지는 도어락 번호 이력으로 추적한다.
 *
 * ★ **사유 문구를 화면이 만들지 않는다.** `resultLabel` 이 함께 오고, 목록은
 *   `/results` 로 받는다 — 사유가 늘어도(실제로 6종에서 7종이 됐다) 화면이 안 깨진다.
 *   `needsBranchAction` 도 서버가 준다. 코드 이름을 화면에 박지 않는다.
 */

export interface EmergencyAccessRow {
  id: number
  academyId: number
  academyName: string | null
  requestedAt: string | null
  /**
   * ★ **거절 건에서는 비어 있다** — 못 찾았으니 이름도 학번도 없다.
   *   그때는 `phoneMasked`(입력한 번호)를 대신 보여준다. 이름 칸에 번호를 넣으면
   *   표가 읽히지 않으므로 칸 제목까지 바꿔서 그린다.
   */
  studentName: string | null
  studentNo: string | null
  /** 가운데만 가린다. 통째로 가리면 담당자가 전화를 받고도 어느 요청인지 못 찾는다 */
  phoneMasked: string | null
  result: string
  /** 사람 말로 된 사유. 화면이 해석하지 않고 그대로 쓴다 */
  resultLabel: string | null
  /**
   * 지점이 조치해야 하는 건인가.
   *
   * ★ 지금은 「지점에 등록된 번호 없음」 하나만 true 다 — **학생은 정상인데 지점이 번호를
   *   안 넣어 둔 것**이라 조치 대상이 학생이 아니라 지점 관리자다. 다른 거절과 섞이면
   *   담당자가 학생을 붙잡고 묻게 된다.
   */
  needsBranchAction: boolean
  /**
   * 요청이 들어온 IP. **거절 건에만 온다** — 제공 건은 어느 학생인지 이미 알아서
   * 조치에 쓸 것이 없고 개인정보만 한 칸 늘어난다(2026-10-12 백엔드 설계).
   *
   * ★ 이 칸이 없으면 **같은 IP 가 번호를 바꿔 가며 두드린 것**과 서로 다른 두 사람이
   *   각자 실수한 것이 똑같이 보인다 — 공격인지 아닌지가 이 한 칸으로 갈린다.
   */
  requesterIp?: string | null
}

export interface EmergencyResultCode {
  code: string
  label: string
  needsBranchAction: boolean
}

export function listEmergencyResults(): Promise<EmergencyResultCode[]> {
  return request<EmergencyResultCode[]>('/api/v1/admin/emergency-access/results')
}

export interface EmergencyAccessQuery {
  /** yyyy-MM-dd. 둘 다 필수다 */
  from: string
  to: string
  academyId?: number | null
}

export function listEmergencyAccess(q: EmergencyAccessQuery): Promise<EmergencyAccessRow[]> {
  return request<EmergencyAccessRow[]>('/api/v1/admin/emergency-access', {
    query: { from: q.from, to: q.to, academyId: q.academyId ?? undefined },
  })
}
