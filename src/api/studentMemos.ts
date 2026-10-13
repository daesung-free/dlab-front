import { request } from './client'

/* 학생 메모 — /api/v1/admin/students/{enrollmentId}/memos
 *
 * 학생 한 명에 붙는 짧은 기록이다. 상담 일지(`/consults`)와 다르다 — 그쪽은 **면담 한 건**이
 * 양식과 함께 남는 것이고, 이쪽은 **그때그때 적어 두는 메모**다. 섞어 쓰면 상담 통계가 틀린다.
 *
 * ★ **고칠 수 없다. 지우는 것만 된다.** 서버에 수정 경로가 없다 — 메모는 「그때 그 사람이 그렇게
 *   적었다」가 값이라 고치면 그게 사라진다. 화면에 '수정' 을 만들지 않는다.
 */

export interface StudentMemo {
  id: number
  content: string
  writerId: number | null
  /**
   * 작성자 이름.
   *
   * ★ **비어 있으면 사람이 아니다**(배치·시스템). '-' 로 뭉개면 **누가 썼는지 모르는 메모**와
   *   구분이 안 된다 — 화면에서 「시스템」으로 따로 적는다.
   */
  writerName: string | null
  createdAt: string
}

export function listStudentMemos(enrollmentId: number): Promise<StudentMemo[]> {
  return request<StudentMemo[]>(`/api/v1/admin/students/${enrollmentId}/memos`)
}

export function addStudentMemo(enrollmentId: number, content: string): Promise<StudentMemo> {
  return request<StudentMemo>(`/api/v1/admin/students/${enrollmentId}/memos`, {
    method: 'POST',
    body: { content },
  })
}

/** 지우면 되돌릴 수 없다 — 호출부가 먼저 확인받는다 */
export function deleteStudentMemo(memoId: number): Promise<void> {
  return request<void>(`/api/v1/admin/students/memos/${memoId}`, { method: 'DELETE' })
}
