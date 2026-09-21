/**
 * 엑셀 등록 오류의 '칸' — 서버는 필드 코드(name · studentNo …)를 준다. 표에는 엑셀 머리글 말로 보인다.
 * 모르는 코드는 그대로 둔다(숨기면 어느 칸이 틀렸는지 알 수 없다).
 */
const FIELD_LABEL: Record<string, string> = {
  name: '이름',
  studentName: '이름',
  studentNo: '학번',
  grade: '학년',
  track: '계열',
  phone: '연락처',
  birthDate: '생년월일',
  gender: '성별',
  schoolName: '출신학교',
  uniqueCode: '학생고유ID',
  admissionType: '구분',
  universityName: '대학명',
  departmentName: '학과명',
  trackName: '전형명',
  result: '결과',
  memo: '메모',
}

export function importFieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}
