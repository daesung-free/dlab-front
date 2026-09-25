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
  // 학생 정보 수정·신규 접수의 검증 오류('graduationYear: 1990 이상이어야 합니다')에도 쓴다
  englishName: '영문명',
  graduationYear: '졸업(예정) 연도',
  address: '주소',
  guardianPhone: '학부모 연락처',
  admissionDate: '입학일',
  retakeCount: '재수 횟수',
  reason: '사유',
}

export function importFieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}
