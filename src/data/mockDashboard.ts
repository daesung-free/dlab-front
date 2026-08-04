/* 대시보드 목업 데이터 — 결정적 생성(랜덤 없음). BE 연동 시 통째로 교체될 자리. */

export const TODAY = '2026-05-28'
export const TODAY_LABEL = '2026년 5월 28일 목요일'

export const ME = { name: '강민서', role: '분당 지점관리자', branch: '분당', initial: '강' }

/* ── 오늘 출결 ── */
export const ATTENDANCE = {
  enrolled: 296,
  arrived: 271,
  late: 14,
  /** 사유 없이 미등원 — 조치 필요 */
  missing: 7,
  excused: 4,
}

/* ── 오늘 처리할 일 ── */
export interface TodoItem {
  id: string
  label: string
  count: number
  unit: string
  to: string
  icon: string
  tone: 'urgent' | 'warn' | 'normal'
  hint: string
}

export const TODOS: TodoItem[] = [
  {
    id: 't1',
    label: '사유 신청 승인 대기',
    count: 9,
    unit: '건',
    to: '/s/student-absence',
    icon: 'check-check',
    tone: 'urgent',
    hint: '학부모 미응답 2건은 담임 전환 예정',
  },
  {
    id: 't2',
    label: '무단 미등원 확인',
    count: 7,
    unit: '명',
    to: '/s/attendance',
    icon: 'triangle-alert',
    tone: 'urgent',
    hint: '지각 알림 자동 발송됨 · 사유 회신 대기',
  },
  {
    id: 't3',
    label: '오늘 상담 예정',
    count: 6,
    unit: '건',
    to: '/s/consult',
    icon: 'message-square',
    tone: 'normal',
    hint: '지연 3건 포함',
  },
  {
    id: 't4',
    label: '행정 요청 미처리',
    count: 5,
    unit: '건',
    to: '/s/chat',
    icon: 'inbox',
    tone: 'warn',
    hint: '재학증명서 2 · 좌석변경 2 · 기타 1',
  },
  {
    id: 't5',
    label: '미납 안내 대상',
    count: 12,
    unit: '명',
    to: '/s/payment',
    icon: 'receipt',
    tone: 'warn',
    hint: '총 1,840만원',
  },
  {
    id: 't6',
    label: '학습계획 미작성',
    count: 11,
    unit: '명',
    to: '/s/learning-plan',
    icon: 'pencil',
    tone: 'warn',
    hint: '오늘 계획을 한 건도 쓰지 않음',
  },
  {
    id: 't7',
    label: '신상기록부 미작성',
    count: 8,
    unit: '명',
    to: '/s/profile-form',
    icon: 'file-text',
    tone: 'normal',
    hint: '등록 미완 상태',
  },
]

/* ── 학습계획 이행 (F-4.11-2) ──
 * 8/3 회신서로 이행 표시가 O/X로 확정됐다. 부분이행(%)·△ 개념은 없다.
 * 순공시간과 다른 지표다 — 순공시간은 "얼마나 앉아 있었나", 이행은 "쓴 대로 했나". */
export const PLAN = {
  /** 오늘 계획을 쓴 학생 수 */
  written: 285,
  enrolled: 296,
  /** 오늘 O 체크 */
  done: 1284,
  /** 오늘 X 체크 */
  missed: 213,
  /** 아직 체크하지 않음 */
  unchecked: 168,
}

export const PLAN_BY_CLASS = [
  { classNo: '1반', teacher: '최지원', o: 312, x: 41, unwritten: 1 },
  { classNo: '2반', teacher: '김유진', o: 338, x: 36, unwritten: 2 },
  { classNo: '3반', teacher: '이장원', o: 291, x: 74, unwritten: 5 },
  { classNo: '4반', teacher: '박서영', o: 343, x: 62, unwritten: 3 },
]

/* ── 실시간 활동 ── */
export interface Activity {
  at: string
  text: string
  who?: string
  tone: 'in' | 'late' | 'req' | 'sys' | 'out'
}

export const ACTIVITIES: Activity[] = [
  { at: '09:34', text: '지각 등원 · 알림톡 발송', who: '김하윤', tone: 'late' },
  { at: '09:21', text: '결석 사유 신청 (병원 진료)', who: '박서준', tone: 'req' },
  { at: '09:05', text: '외출 신청 승인', who: '정민재', tone: 'out' },
  { at: '08:47', text: '등원', who: '최유나', tone: 'in' },
  { at: '08:31', text: '학부모 승인 완료 · 조퇴', who: '강도현', tone: 'req' },
  { at: '08:12', text: '등원 알림톡 271건 자동 발송', tone: 'sys' },
  { at: '07:58', text: '등원', who: '이승민', tone: 'in' },
  { at: '07:40', text: '키오스크 수신 시작', tone: 'sys' },
]

/* ── 주간 출결 추이 ── */
export const WEEKLY = [
  { d: '05/22', dow: '금', arrived: 268, late: 16, absent: 5 },
  { d: '05/25', dow: '월', arrived: 274, late: 11, absent: 4 },
  { d: '05/26', dow: '화', arrived: 279, late: 9, absent: 3 },
  { d: '05/27', dow: '수', arrived: 276, late: 12, absent: 4 },
  { d: '05/28', dow: '목', arrived: 271, late: 14, absent: 7 },
]

/* ── 순공시간 랭킹 ── */
export const RANKING = [
  { rank: 1, name: '이승민', classNo: '3반', min: 812 },
  { rank: 2, name: '최유나', classNo: '1반', min: 794 },
  { rank: 3, name: '강도현', classNo: '3반', min: 771 },
  { rank: 4, name: '김하윤', classNo: '1반', min: 748 },
  { rank: 5, name: '정민재', classNo: '2반', min: 736 },
]

/* ── 요약 카드 ── */
export const MEAL = { today: 241, month: 4820, unpaid: 6, deadline: '05/31' }
export const PAYMENT = { collected: 41_280, target: 46_500, unpaidCount: 12, unpaidAmount: 1_840 }
export const SCORE = { round: 'THE PREMIUM 05/20', synced: 289, total: 296, avgDelta: +2.4 }

/* ── 최근 공지 ── */
export const NOTICES = [
  { title: '6월 평가원 모의고사 응시 안내', scope: '전체', at: '오늘 09:00', read: 281, total: 296 },
  { title: '분당지점 6월 급식 신청 마감 안내', scope: '지점', at: '어제 17:30', read: 96, total: 104 },
  { title: '3반 주간 학습계획 제출 요청', scope: '반', at: '어제 08:15', read: 13, total: 14 },
]

/* ── 다가오는 일정 (연간 행사 마스터) ── */
export const UPCOMING = [
  { date: '06/04', dday: 'D-7', title: '6월 평가원 모의고사', type: '모의고사' },
  { date: '06/13', dday: 'D-16', title: '2027학년도 입학 설명회 (1차)', type: '설명회' },
  { date: '06/22', dday: 'D-25', title: '6월 단과 특강 주간', type: '특강' },
]
