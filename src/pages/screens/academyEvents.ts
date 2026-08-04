/* ============================================================================
 * 학원 일정 마스터 (F-4.11-10) — 학습계획 차단의 단일 소스
 *
 * 관리자가 캘린더에 일정을 입력하면 그날은 학생이 학습계획을 세울 수 없다.
 * 그래서 이 데이터는 연간행사 화면과 학습계획 화면이 함께 읽어야 한다.
 * 각 화면이 따로 들고 있으면 "달력엔 휴원인데 계획은 써지는" 상태가 생긴다.
 *
 * ⚠ 차단은 '입력 금지'이지 '삭제'가 아니다.
 *   이미 계획을 쓴 날을 나중에 차단으로 바꾸면 기존 계획을 어떻게 할지 정해야 한다.
 *   (보존 후 읽기전용 / 이행 집계에서 제외 / 학생에게 알림) — 정책 미확정.
 *
 * ⚠ 차단일은 '미작성'이 아니다.
 *   담임 화면의 미작성 집계에서 반드시 빼야 한다. 그러지 않으면
 *   휴원일마다 전교생이 미작성자로 잡혀 경고가 무의미해진다.
 * ========================================================================== */

export type EventType = '모의고사' | '휴원' | '특강' | '설명회' | '행사'

export const TYPE_META: Record<EventType, { cls: string; color: string }> = {
  모의고사: { cls: 'brandnew', color: 'var(--amber)' },
  휴원: { cls: 'brandnew', color: 'var(--red)' },
  특강: { cls: 'supplement', color: 'var(--blue)' },
  설명회: { cls: 'supplement', color: 'var(--violet)' },
  행사: { cls: 'verified', color: 'var(--mint)' },
}

export interface AcademyEvent {
  id: string
  /** YYYY-MM-DD */
  from: string
  to: string
  title: string
  type: EventType
  target: string
  /** 이 기간 동안 학생의 학습계획 작성을 막는다 */
  blockPlan: boolean
  note: string
}

export const ACADEMY_EVENTS: AcademyEvent[] = [
  { id: 'e1', from: '2026-03-26', to: '2026-03-26', title: '3월 학력평가', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e2', from: '2026-04-10', to: '2026-04-10', title: '4월 학력평가', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e3', from: '2026-04-16', to: '2026-04-16', title: 'THE PREMIUM 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일' },
  { id: 'e4', from: '2026-05-05', to: '2026-05-05', title: '어린이날 휴원', type: '휴원', target: '전체', blockPlan: true, note: '공휴일 · 급식 제외' },
  { id: 'e5', from: '2026-05-20', to: '2026-05-20', title: 'THE PREMIUM 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일' },
  { id: 'e6', from: '2026-05-24', to: '2026-05-25', title: '부처님오신날 · 대체공휴일', type: '휴원', target: '전체', blockPlan: true, note: '연휴 · 급식 제외' },
  { id: 'e7', from: '2026-06-04', to: '2026-06-04', title: '6월 평가원 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e8', from: '2026-06-06', to: '2026-06-06', title: '현충일 휴원', type: '휴원', target: '전체', blockPlan: true, note: '공휴일 · 급식 제외' },
  { id: 'e9', from: '2026-06-13', to: '2026-06-13', title: '2027학년도 입학 설명회 (1차)', type: '설명회', target: '외부', blockPlan: false, note: '재원생 학습 영향 없음' },
  { id: 'e10', from: '2026-06-22', to: '2026-06-26', title: '6월 단과 특강 주간', type: '특강', target: '신청자', blockPlan: false, note: '특강 신청자만' },
  { id: 'e11', from: '2026-09-03', to: '2026-09-03', title: '9월 평가원 모의고사', type: '모의고사', target: '전체', blockPlan: true, note: '종일 · 학습계획 차단' },
  { id: 'e12', from: '2026-11-19', to: '2026-11-19', title: '2027학년도 수능', type: '모의고사', target: '전체', blockPlan: true, note: '수능 당일' },
  { id: 'e13', from: '2026-11-20', to: '2026-11-20', title: '가채점 설문 · 상담 주간 시작', type: '행사', target: '전체', blockPlan: false, note: '설문 배포 연동' },
]

/** 해당 날짜에 걸친 일정 전부 (ISO 문자열이라 사전순 비교로 충분하다) */
export const eventsOn = (date: string): AcademyEvent[] =>
  ACADEMY_EVENTS.filter((e) => e.from <= date && date <= e.to)

/**
 * 해당 날짜의 학습계획을 막는 일정. 없으면 undefined.
 * 학생 앱과 관리자 화면이 같은 함수를 봐야 판정이 갈리지 않는다.
 */
export const planBlockOn = (date: string): AcademyEvent | undefined =>
  ACADEMY_EVENTS.find((e) => e.blockPlan && e.from <= date && date <= e.to)
