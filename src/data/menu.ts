/* ============================================================================
 * 화면 IA — 전적으로 `DSA_DLab_요구사항정의서.xlsx` 기준
 *
 *  · 대분류/화면 구성 : 1.화면별 요구사항 시트 (30개 화면, F-4.1 ~ F-4.11-10)
 *  · 구분(개발 범위)  : 동 시트 E열 — 코드 재사용 항목은 존재하지 않음(0.개요 경고)
 *  · Phase / FE 순서  : DSA_DLab_개발착수_실행가이드.xlsx
 *                       1.Phase별 실행계획 / 2.직군별 전체작업순서
 *  · 관련 이슈        : 5.오픈이슈 관리대장 (총 42건)
 *
 *  ⚠ 이 파일이 화면 구성의 단일 진실 소스(SSOT). 문서가 갱신되면 여기부터 고칠 것.
 * ========================================================================== */

/** 요구사항정의서 1시트 '구분' 컬럼 — 3종 (레거시 이관 분류 없음) */
export type Kind = 'verified' | 'supplement' | 'brandnew'

export const KIND_LABEL: Record<Kind, string> = {
  verified: '요구사항 검증됨',
  supplement: '요구사항 보완',
  brandnew: '요구사항 신규',
}

export const KIND_DESC: Record<Kind, string> = {
  verified: 'DSA에 대응 화면이 있어 요구사항이 검증된 항목 (코드는 전량 신규)',
  supplement: 'DSA 화면은 있으나 기능 확장이 필요한 항목',
  brandnew: 'DSA에 대응 화면이 전혀 없는 완전 신규 항목',
}

export type PhaseNo = 0 | 1 | 2 | 3 | 4

export const PHASE: Record<PhaseNo, { label: string; name: string; period: string; color: string }> = {
  0: { label: '선행', name: 'Phase 0 · 사전 준비', period: '7월 후반~8월 전반', color: '#3F4753' },
  1: { label: 'MVP', name: 'Phase 1 · MVP', period: '8월~9월 전반', color: '#0b8073' },
  2: { label: '핵심', name: 'Phase 2 · 핵심', period: '9월~10월 전반', color: '#3B6FE0' },
  3: { label: '교육·소통', name: 'Phase 3 · 교육·성적·소통', period: '10월~11월', color: '#6C5CE0' },
  4: { label: '부가', name: 'Phase 4 · 부가', period: '12월 이후', color: '#E8920F' },
}

export interface Group {
  id: string
  /** 요구사항정의서 대분류 번호 */
  no: string
  name: string
  icon: string
  desc: string
}

/**
 * ★ DSA 실사 기록·미팅 메모·DB 테이블명·오픈이슈는 여기 없다 — `menu.internal.ts` 로
 *   옮겼다. 이 파일은 사이드바가 쓰므로 **프로덕션 번들에 반드시 들어가기 때문**이다.
 *   화면에 안 그려도 번들에 있으면 개발자도구에서 읽힌다.
 */
export interface Screen {
  id: string
  /** 요구사항정의서 '구.기능번호' */
  code: string
  groupId: string
  name: string
  icon: string
  kind: Kind
  phase: PhaseNo
  /** 실행가이드 2시트 FE 전체 순서 (1~8순위). 문서에 명시된 것만 부여 */
  feOrder?: number
  /** 기능 개요 (F열) */
  summary: string
  /**
   * 기존 정적 HTML 시안의 **레포 내 경로**. 출처 기록용이고 화면이 링크로 쓰지 않는다.
   *
   * ★ 예전에는 `public/design/` 에 있어서 `/design/*.html` 로 **배포본에 그대로 실렸다.**
   *   거기에 오픈이슈 코드(D-3 등)와 거래처 이름이 들어 있어 레포 안으로 옮겼다.
   *   다시 `public/` 으로 옮기지 말 것 — public 은 통째로 배포된다.
   */
  refHtml?: string
}

export const GROUPS: Group[] = [
  { id: 'student', no: '4.1', name: '학생 관리', icon: 'users', desc: '재원생 검색·상벌점·접수등록·반배정·사유신청' },
  { id: 'waitlist', no: '4.2', name: '대기자 관리', icon: 'list-ordered', desc: '디멤버 입학예약자 대기 등록부터 원생 전환까지' },
  { id: 'attendance', no: '4.3', name: '출결 관리', icon: 'scan-line', desc: '키오스크 직접 연동 기반 출결 수신·승인' },
  { id: 'message', no: '4.4', name: '메시지 / 알림', icon: 'send', desc: '카카오 알림톡·FCM 이중화 발송' },
  { id: 'meal', no: '4.5', name: '급식 관리', icon: 'utensils', desc: '급식 신청·결제·취소와 수납 반영' },
  { id: 'score', no: '4.6', name: '성적 관리', icon: 'line-chart', desc: '더프리미엄 API 연동 성적과 상세 분석·설문' },
  { id: 'lecture', no: '4.7', name: '특강 관리', icon: 'presentation', desc: '특강 신청명단·출석부·설명회 신청' },
  { id: 'payment', no: '4.8', name: '수납 관리', icon: 'credit-card', desc: '통합 매출·수납 통계·미납자 관리' },
  { id: 'affairs', no: '4.9', name: '교무업무', icon: 'folder-open', desc: '수강생 대장·직반·장학생 명단 조회와 출력' },
  { id: 'admin', no: '4.10', name: '관리자 기능', icon: 'settings', desc: '기초·사용자·배정·특강·수납·실적 관리' },
  { id: 'expand', no: '4.11', name: '신규 확장', icon: 'sparkles', desc: 'DSA에 대응 화면이 전혀 없는 완전 신규 도메인' },
]

export const SCREENS: Screen[] = [
  /* ─────────────── 4.1 학생 관리 ─────────────── */
  {
    id: 'student-search',
    code: 'F-4.1-1',
    groupId: 'student',
    name: '학원생 검색·조회',
    icon: 'search',
    kind: 'verified',
    phase: 1,
    feOrder: 2,
    summary: '통합 검색(이름·학번·전화번호)·결과 정렬·검색조건 저장',
  },
  {
    id: 'student-penalty',
    code: 'F-4.1-2',
    groupId: 'student',
    name: '상벌점 관리',
    icon: 'triangle-alert',
    kind: 'supplement',
    phase: 1,
    feOrder: 2,
    summary: '항목 전년도 복사, 학생별 내역 조회·수정, 앱 Daily Report 실시간 연동, 상벌점 규칙 엔진',
  },
  {
    id: 'student-enroll',
    code: 'F-4.1-3',
    groupId: 'student',
    name: '신규 접수 등록(합격생 등록)',
    icon: 'user-plus',
    kind: 'verified',
    phase: 1,
    feOrder: 2,
    summary: '합격생 등록, 학번 자동 부여(매년 초기화)',
  },
  {
    id: 'student-class',
    code: 'F-4.1-4',
    groupId: 'student',
    name: '반 배정(고정반 관리)',
    icon: 'layout-grid',
    kind: 'verified',
    phase: 1,
    feOrder: 2,
    summary: '고정반·이동수업반 배정, 전년도 복사',
  },
  {
    id: 'student-absence',
    code: 'F-4.1-5',
    groupId: 'student',
    name: '사유 신청 관리',
    icon: 'check-check',
    kind: 'supplement',
    phase: 1,
    feOrder: 2,
    summary: '앱에서 사유 즉시 제출 → 실시간 확인/수정 (기존은 관리자 직접 등록/수정 구조)',
  },

  /* ─────────────── 4.2 대기자 관리 ─────────────── */
  {
    id: 'waitlist',
    code: 'F-4.2',
    groupId: 'waitlist',
    name: '대기자 관리',
    icon: 'list-ordered',
    kind: 'brandnew',
    phase: 1,
    feOrder: 2,
    summary:
      'D.Lab 사이트(디멤버) 입학예약자 → 대기자 자동 등록, 순번 처리 알림 자동 발송, 대기자→원생 원클릭 전환 + 앱 초대 알림',
    refHtml: 'design/02_admin_ipsi.html',
  },

  /* ─────────────── 4.3 출결 관리 ─────────────── */
  {
    id: 'attendance',
    code: 'F-4.3',
    groupId: 'attendance',
    name: '출결 관리',
    icon: 'scan-line',
    kind: 'supplement',
    phase: 1,
    feOrder: 2,
    summary: '키오스크 실시간 수신(대성전산 API 경유 제거, 직접 연동), 일별 현황(담당 반 필터), 사유 실시간 수신·승인',
  },

  /* ─────────────── 4.4 메시지 / 알림 ─────────────── */
  {
    id: 'message-send',
    code: 'F-4.4',
    groupId: 'message',
    name: '알림 발송 (알림톡 · 푸시)',
    icon: 'message-circle',
    kind: 'supplement',
    phase: 1,
    feOrder: 2,
    summary: '개별·단체 발송, 출결 자동 발송 템플릿(등원·지각·결석), 대기자 알림 자동 발송, 템플릿 관리·심사 상태',
  },

  /* ─────────────── 4.5 급식 관리 ─────────────── */
  {
    id: 'meal',
    code: 'F-4.5',
    groupId: 'meal',
    name: '급식 관리(디멤버 급식신청 대체)',
    icon: 'utensils',
    kind: 'brandnew',
    phase: 2,
    feOrder: 3,
    summary:
      '월별 신청 현황·결제 내역 조회, 급식 일정 관리(중단일 등록 → 신청 차단), 배식 체크(키오스크·태블릿 RFID/QR), 관리자 취소(즉시)/앱 취소(D-3 PG 자동환불), 수납 자동 반영, 데스크 당일 신청',
  },

  /* ─────────────── 4.6 성적 관리 ─────────────── */
  {
    id: 'score',
    code: 'F-4.6',
    groupId: 'score',
    name: '성적 관리',
    icon: 'line-chart',
    kind: 'brandnew',
    phase: 3,
    feOrder: 4,
    summary:
      '더프리미엄모의고사 API 자동 조회·저장, 성적표 PDF→D.Lab 사이트 업로드, 가채점 설문, 상세 엑셀 업로드 → 상담 리포트 결합',
    refHtml: 'design/03_admin_seongjeok.html',
  },
  {
    id: 'survey',
    code: 'F-4.6-부속',
    groupId: 'score',
    name: '설문 관리(가채점 설문, 템플릿)',
    icon: 'clipboard-list',
    kind: 'brandnew',
    phase: 3,
    feOrder: 4,
    summary: '설문 생성·문항 편집·배포·수집, 설문 템플릿 등록·수정·인스턴스화',
  },

  /* ─────────────── 4.7 특강 관리 ─────────────── */
  {
    id: 'lecture',
    code: 'F-4.7',
    groupId: 'lecture',
    name: '특강 관리',
    icon: 'presentation',
    kind: 'supplement',
    phase: 2,
    feOrder: 3,
    summary: '특강 개설(회차·정원·특강비·대상), 신청자·대기자 목록 조회·관리, 출석 현황 관리, 설명회 신청 관리(신규)',
  },

  /* ─────────────── 4.8 수납 관리 ─────────────── */
  {
    id: 'payment',
    code: 'F-4.8',
    groupId: 'payment',
    name: '수납현황',
    icon: 'receipt',
    kind: 'supplement',
    phase: 2,
    feOrder: 3,
    summary: '카드·가상계좌·등록비 통합 매출 조회, 기간별·지점별 수납 통계, 미납자 목록·알림톡 자동 발송, 할인 정책 관리·청구액 산출',
  },

  /* ─────────────── 4.9 교무업무 ─────────────── */
  {
    id: 'affairs',
    code: 'F-4.9',
    groupId: 'affairs',
    name: '교무업무 — 명단 조회·출력',
    icon: 'file-spreadsheet',
    kind: 'supplement',
    phase: 2,
    feOrder: 3,
    summary: '수강생 대장(청구기수·반 필터, 엑셀 다운로드), 직반·장학생 명단, 구분 항목 정리',
  },

  /* ─────────────── 4.10 관리자 기능 ─────────────── */
  {
    id: 'admin-basic',
    code: 'F-4.10-1',
    groupId: 'admin',
    name: '기초 관리(학과·전형·반·강의실·사물함·장학)',
    icon: 'sliders-horizontal',
    kind: 'verified',
    phase: 1,
    feOrder: 2,
    summary: '기초 데이터 관리, 전년도 복사',
  },
  {
    id: 'admin-user',
    code: 'F-4.10-2',
    groupId: 'admin',
    name: '사용자 관리',
    icon: 'shield-check',
    kind: 'verified',
    phase: 0,
    summary: '직원·강사 계정, 권한 관리, 지점별 접근 제어',
  },
  {
    id: 'admin-assign',
    code: 'F-4.10-3',
    groupId: 'admin',
    name: '배정 관리(사물함·독서실)',
    icon: 'armchair',
    kind: 'verified',
    phase: 2,
    feOrder: 3,
    summary: '사물함 / 독서실 배정 — 명단 선택 후 일괄 배정·해제',
  },
  {
    id: 'admin-lecture',
    code: 'F-4.10-4',
    groupId: 'admin',
    name: '특강 관리(특강 기초 설정)',
    icon: 'calendar-plus',
    kind: 'verified',
    phase: 2,
    feOrder: 3,
    summary: '특강·설명회 기초 설정, 설명회 신청 항목 추가',
  },
  {
    id: 'admin-billing',
    code: 'F-4.10-5',
    groupId: 'admin',
    name: '수납 관리(청구기준 관리)',
    icon: 'badge-dollar-sign',
    kind: 'verified',
    phase: 2,
    feOrder: 3,
    summary: '교습비·특강비·환불 기준 관리, 4.8 수납현황과 연계',
  },
  {
    id: 'admin-result',
    code: 'F-4.10-6',
    groupId: 'admin',
    name: '실적 관리(실적 입력)',
    icon: 'trophy',
    kind: 'verified',
    phase: 2,
    feOrder: 3,
    summary: '합격 실적 입력·현황·통계',
  },

  /* ─────────────── 4.11 신규 확장 ─────────────── */
  {
    id: 'daily-routine',
    code: 'F-4.11-1',
    groupId: 'expand',
    name: '데일리 루틴 관리',
    icon: 'repeat',
    kind: 'brandnew',
    phase: 3,
    feOrder: 4,
    summary: '월별 루틴/테스트 세팅(과목·배점·권장) + 전월 복사, 학생/반별 결과 입력, 상벌점 규칙 매핑 연동',
  },
  {
    id: 'learning-plan',
    code: 'F-4.11-2',
    groupId: 'expand',
    name: '주·일 학습 계획 관리',
    icon: 'calendar-range',
    kind: 'brandnew',
    phase: 3,
    feOrder: 5,
    summary:
      '학생 주도 순번형 학습계획 — 시작시각·소요시간 자유 입력, 과목별 배분 통계(개별 계산), O/X 이행 확인. 관리자는 학생별 조회·통계와 형태·과목 마스터만 관리',
  },
  {
    id: 'chat',
    code: 'F-4.11-3',
    groupId: 'expand',
    name: '메시지 관리(공지·행정요청·1:1채팅)',
    icon: 'messages-square',
    kind: 'brandnew',
    phase: 3,
    feOrder: 7,
    summary: '발송 범위별 권한(전체=본사 / 지점=지점관리자 / 반=담임), 1:1 채팅 외부 메신저 React 연동, 행정 요청 수신함',
  },
  {
    id: 'consult',
    code: 'F-4.11-4',
    groupId: 'expand',
    name: '상담(일지·리포트)',
    icon: 'message-square',
    kind: 'brandnew',
    phase: 3,
    feOrder: 6,
    summary:
      '담임/최근상담일 헤더 + 과목별 학습계획 이행률(별점)·상담 항목 태그·담임 스티커·코멘트. Weekly ABC test·수강진도 결합 노출',
    refHtml: 'design/01_admin_sangdam.html',
  },
  {
    id: 'approval',
    code: 'F-4.11-5',
    groupId: 'expand',
    name: '승인 라우팅 관리',
    icon: 'route',
    kind: 'brandnew',
    phase: 3,
    summary: '학생 신청(사유·정기일정·방화벽) → 항목별 승인 주체(학부모/선생님/자동)에 따라 자동 라우팅',
  },
  {
    id: 'daily-report',
    code: 'F-4.11-6',
    groupId: 'expand',
    name: 'Daily Report 집계(서버)',
    icon: 'gauge',
    kind: 'brandnew',
    phase: 3,
    feOrder: 8,
    summary: '앱 Daily Report의 데이터 원천 — 순공시간 랭킹, 달력 뷰, 학생 셀프 피드백, 매일 밤 FCM 요약 푸시',
  },
  {
    id: 'qna',
    code: 'F-4.11-7',
    groupId: 'expand',
    name: '질의응답 관리 (대면 · 온라인)',
    icon: 'calendar-clock',
    kind: 'brandnew',
    phase: 3,
    feOrder: 8,
    summary:
      '대면 질의응답 타임 개설·예약 현황, 질문 내용·사진 첨부 사전 수집, 유형별 앱 노출 설정, 타임 간격·운영시간 설정',
  },
  {
    id: 'seat-move',
    code: 'F-4.11-8',
    groupId: 'expand',
    name: '좌석 이탈/복귀 신청',
    icon: 'footprints',
    kind: 'brandnew',
    phase: 2,
    feOrder: 3,
    summary: '본인 공부 공간 실시간 변경 신청(강의실·화장실·공용공간·교과실·본인좌석), 실시간 이동현황을 좌석표에 반영',
  },
  {
    id: 'profile-form',
    code: 'F-4.11-9',
    groupId: 'expand',
    name: '신상기록부(입학 필수·학생 입력)',
    icon: 'file-text',
    kind: 'brandnew',
    phase: 1,
    feOrder: 2,
    summary:
      '입학 시 필수 작성. 회원가입 후 앱에서 학생 본인이 설문형 입력 → 강제 진행. 학년별 폼 분기(고2·고3=단순 / 재수·N수=4종)',
  },
  {
    id: 'annual-events',
    code: 'F-4.11-10',
    groupId: 'expand',
    name: '연간 행사 마스터 → 학습계획 반영',
    icon: 'calendar-days',
    kind: 'brandnew',
    phase: 3,
    summary: '관리자가 사전 연간 행사 입력(예: 종일 모의고사일). 학생 학습계획 입력 시 해당일 자동 반영/차단',
  },

  /* ─────────────── 클라이언트 메뉴표 기준 추가분 ───────────────
   * 요구사항정의서 1시트에는 없지만 클라이언트가 전달한 실사용 메뉴표(대분류/중분류/기능)에
   * 존재하는 화면들. 코드는 F-C-n 으로 부여해 F-4.x(요구사항정의서 원본)와 구분한다.
   * 메뉴 배치는 `data/nav.ts` 참조.
   * ⚠ 요구사항정의서에 로직 정의가 없으므로 아래 logic 은 전부 개발팀 제안이며,
   *    운영팀 확인 후 확정해야 한다. */
  {
    id: 'change-log',
    code: 'F-C-1',
    groupId: 'admin',
    name: '금일 수정 이력',
    icon: 'history',
    kind: 'verified',
    phase: 2,
    summary: '금일 변경분 감사 로그 — 누가·언제·무엇을 어떻게 바꿨는지 조회하고 되돌릴 근거를 남긴다',
  },
  {
    id: 'student-status',
    code: 'F-C-2',
    groupId: 'affairs',
    name: '학원생 현황',
    icon: 'bar-chart-3',
    kind: 'verified',
    phase: 2,
    summary: '반·계열·재수구분별 재원/휴원/퇴원 집계, 정원 대비 충원율, 월별 증감',
  },
  {
    id: 'timetable',
    code: 'F-C-3',
    groupId: 'affairs',
    name: '시간표 · 이동수업',
    icon: 'table-2',
    kind: 'supplement',
    phase: 2,
    summary: '반별 주간 시간표 편성(담임·계열·재원·교실 표시), 수준별 이동수업 배정, 강의실 사용 현황·중복 배정 점검',
  },
  {
    id: 'reading-room',
    code: 'F-C-4',
    groupId: 'attendance',
    name: '독서실 좌석배치표',
    icon: 'armchair',
    kind: 'brandnew',
    phase: 2,
    summary: '독서실 실별 좌석 도면, 배정·재실·이석 실시간 표기, 좌석 배정/해제/사용중지',
  },
  {
    id: 'payment-gate',
    code: 'F-C-5',
    groupId: 'payment',
    name: '결제 관리',
    icon: 'wallet',
    kind: 'brandnew',
    phase: 2,
    summary: '카드·가상계좌·간편결제 트랜잭션 조회, 입금대기·만료 관리, 취소·환불 처리, PG 연동 설정',
  },
  {
    id: 'app-manage',
    code: 'F-C-6',
    groupId: 'expand',
    name: '앱 운영 관리',
    icon: 'smartphone',
    kind: 'brandnew',
    phase: 4,
    summary: 'FCM 푸시 발송·예약, 앱 버전 / 강제 업데이트 게이트, 홈 배너·팝업, 약관·동의 버전 관리',
  },
]

/* ─────────────── 파생 헬퍼 ─────────────── */

export const screensOf = (groupId: string) => SCREENS.filter((s) => s.groupId === groupId)

export const findScreen = (id: string) => SCREENS.find((s) => s.id === id)

export const findGroup = (id: string) => GROUPS.find((g) => g.id === id)

export const countByKind = (kind: Kind) => SCREENS.filter((s) => s.kind === kind).length

export const countByPhase = (phase: PhaseNo) => SCREENS.filter((s) => s.phase === phase).length
