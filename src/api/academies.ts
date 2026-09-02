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
  /** 등원 기준 시각. 지각 판정 기준이라 지점마다 다를 수 있다 */
  attendanceDeadline: string
  active: boolean
}

export function listAcademies(): Promise<Academy[]> {
  return request<Academy[]>('/api/v1/admin/academies')
}
