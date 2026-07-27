/* 학생 목업 데이터 — 결정적 생성(랜덤 없음)이라 새로고침해도 같은 목록이 나온다.
 * BE 연동 시 통째로 교체될 자리. */

export interface MockStudent {
  id: string
  /** 학번 — year + %04d(nextSeq), F-4.1-3 채번 규칙 */
  studentNo: string
  name: string
  track: '자연' | '인문'
  repeat: '재수' | '삼수' | 'N수'
  classNo: string
  seat: string
  school: string
  phone: string
  birth: string
  enrolledAt: string
  status: '재원' | '휴원' | '퇴원'
  teacher: string
  branch: '분당' | '대치' | '평촌'
}

const SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권']
const GIVEN = ['승민', '하윤', '서준', '민재', '유나', '도현', '지호', '채원', '수빈', '서연', '지우', '세훈', '하늘', '민주', '도윤', '현준', '예린', '태윤']
const SCHOOLS = ['태원고', '송림고', '유신고', '분당고', '보평고', '낙생고', '한솔고', '이매고']
const TEACHERS = ['이장원', '김유진', '최지원', '박서영', '정하람']
const BRANCHES: MockStudent['branch'][] = ['분당', '대치', '평촌']

function pad(n: number, len: number): string {
  return String(n).padStart(len, '0')
}

export const MOCK_STUDENTS: MockStudent[] = Array.from({ length: 47 }, (_, i) => {
  const n = i + 1
  const track: MockStudent['track'] = i % 3 === 2 ? '인문' : '자연'
  const repeat: MockStudent['repeat'] = i % 7 === 6 ? 'N수' : i % 4 === 3 ? '삼수' : '재수'
  const classNo = `${(i % 4) + 1}반`
  const status: MockStudent['status'] = i % 17 === 16 ? '퇴원' : i % 11 === 10 ? '휴원' : '재원'

  return {
    id: `st-${pad(n, 3)}`,
    studentNo: `2026-${pad(n, 4)}`,
    name: `${SURNAMES[i % SURNAMES.length]}${GIVEN[i % GIVEN.length]}`,
    track,
    repeat,
    classNo,
    seat: `${track === '자연' ? 'A' : 'B'}-${pad((i % 30) + 1, 2)}`,
    school: SCHOOLS[i % SCHOOLS.length],
    phone: `010-${pad(1000 + ((i * 137) % 9000), 4)}-${pad(1000 + ((i * 379) % 9000), 4)}`,
    birth: `${2005 + (i % 3)}-${pad((i % 12) + 1, 2)}-${pad((i % 28) + 1, 2)}`,
    enrolledAt: `2026-0${(i % 3) + 1}-${pad((i % 28) + 1, 2)}`,
    status,
    teacher: TEACHERS[i % TEACHERS.length],
    branch: BRANCHES[i % BRANCHES.length],
  }
})
