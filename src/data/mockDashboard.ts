/* 대시보드 목업 데이터 — 결정적 생성(랜덤 없음). BE 연동 시 통째로 교체될 자리. */

export const TODAY = '2026-05-28'
export const TODAY_LABEL = '2026년 5월 28일 목요일'

export const ME = { name: '관리자', role: '분당 지점관리자', branch: '분당', initial: '관' }

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
  { classNo: '1반', teacher: '담임 A', o: 312, x: 41, unwritten: 1 },
  { classNo: '2반', teacher: '담임 B', o: 338, x: 36, unwritten: 2 },
  { classNo: '3반', teacher: '담임 C', o: 291, x: 74, unwritten: 5 },
  { classNo: '4반', teacher: '담임 D', o: 343, x: 62, unwritten: 3 },
]

/* ── 실시간 활동 ── */
/* ★ 사람 이름을 실명처럼 짓지 않는다. '최지원'·'김하윤' 처럼 그럴듯하면 클라이언트가
     **자기 학생인 줄 안다** — 「표시용 예시」 라벨이 붙어 있어도 이름은 이름으로 읽힌다.
     집계 API 가 붙으면 이 배열은 통째로 없어진다(2026-09-16). */
export interface Activity {
  at: string
  text: string
  who?: string
  tone: 'in' | 'late' | 'req' | 'sys' | 'out'
}

export const ACTIVITIES: Activity[] = [
  { at: '09:34', text: '지각 등원 · 알림톡 발송', who: '학생 A', tone: 'late' },
  { at: '09:21', text: '결석 사유 신청 (병원 진료)', who: '학생 B', tone: 'req' },
  { at: '09:05', text: '외출 신청 승인', who: '학생 C', tone: 'out' },
  { at: '08:47', text: '등원', who: '학생 D', tone: 'in' },
  { at: '08:31', text: '학부모 승인 완료 · 조퇴', who: '학생 E', tone: 'req' },
  { at: '08:12', text: '등원 알림톡 271건 자동 발송', tone: 'sys' },
  { at: '07:58', text: '등원', who: '학생 F', tone: 'in' },
  { at: '07:40', text: '키오스크 수신 시작', tone: 'sys' },
]

/* ── 주간 출결 추이 ──
 *
 * ★ 날짜를 박아두지 않는다. 전에는 05/22~05/28 이 고정돼 있었는데, 몇 달 뒤에 보면
 *   '표시용 예시' 라벨이 붙어 있어도 **화면이 고장 난 것으로 읽힌다** — 실제로 그렇게
 *   올라왔다(2026-09-13). 숫자는 예시라도 날짜는 오늘 기준이어야 한다.
 * ★ 주말은 뺀다. 이 학원은 토요일에도 운영하지만 '주간 추이'의 가로축은 평일 5일이 읽기 쉽다. */
const WEEKDAY_LABEL = ['일', '월', '화', '수', '목', '금', '토']

function lastWeekdays(n: number): { d: string; dow: string }[] {
  const out: { d: string; dow: string }[] = []
  const cur = new Date()
  while (out.length < n) {
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      out.unshift({
        d: `${String(cur.getMonth() + 1).padStart(2, '0')}/${String(cur.getDate()).padStart(2, '0')}`,
        dow: WEEKDAY_LABEL[cur.getDay()],
      })
    }
    cur.setDate(cur.getDate() - 1)
  }
  return out
}

const WEEKLY_COUNTS = [
  { arrived: 268, late: 16, absent: 5 },
  { arrived: 274, late: 11, absent: 4 },
  { arrived: 279, late: 9, absent: 3 },
  { arrived: 276, late: 12, absent: 4 },
  { arrived: 271, late: 14, absent: 7 },
]

export const WEEKLY = lastWeekdays(5).map((d, i) => ({ ...d, ...WEEKLY_COUNTS[i] }))

/* ── 순공시간 랭킹 ── */
export const RANKING = [
  { rank: 1, name: '학생 F', classNo: '3반', min: 812 },
  { rank: 2, name: '학생 D', classNo: '1반', min: 794 },
  { rank: 3, name: '학생 E', classNo: '3반', min: 771 },
  { rank: 4, name: '학생 A', classNo: '1반', min: 748 },
  { rank: 5, name: '학생 C', classNo: '2반', min: 736 },
]

/* ── 요약 카드 ── */
export const MEAL = { today: 241, month: 4820, unpaid: 6, deadline: inDays(9).date }
export const PAYMENT = { collected: 41_280, target: 46_500, unpaidCount: 12, unpaidAmount: 1_840 }
/* ★ 회차 이름에 날짜를 박아두면 철 지난 값이 된다 — 회차 이름만 쓴다 */
export const SCORE = { round: '최근 모의고사', synced: 289, total: 296, avgDelta: +2.4 }

/* ── 최근 공지 ── */
export const NOTICES = [
  { title: '평가원 모의고사 응시 안내', scope: '전체', at: '오늘 09:00', read: 281, total: 296 },
  { title: '다음 달 급식 신청 마감 안내', scope: '지점', at: '어제 17:30', read: 96, total: 104 },
  { title: '3반 주간 학습계획 제출 요청', scope: '반', at: '어제 08:15', read: 13, total: 14 },
]

/* ── 다가오는 일정 (연간 행사 마스터) ── */

/**
 * 오늘로부터 며칠 뒤.
 *
 * ★ 날짜를 문자열로 박아두면 안 된다. `06/04 · D-7` 이 9월에도 그대로 떠서
 *   **예시가 아니라 고장으로 읽혔다** — 「표시용 예시」 라벨을 붙여도 지난 날짜가
 *   D-7 로 남아 있으면 그 라벨까지 못 미덥게 만든다(2026-09-16).
 */
function inDays(n: number): { date: string; dday: string } {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return {
    date: `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`,
    dday: `D-${n}`,
  }
}

export const UPCOMING = [
  { ...inDays(7), title: '평가원 모의고사', type: '모의고사' },
  { ...inDays(16), title: '입학 설명회 (1차)', type: '설명회' },
  { ...inDays(25), title: '단과 특강 주간', type: '특강' },
]
