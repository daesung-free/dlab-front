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
  /** 핵심 요구사항 / 로직 (G열) */
  logic: string[]
  /** 주요 데이터 항목 (H열) */
  tables: string[]
  /** 관련 이슈 No. (K열) */
  issues: string[]
  /** DSA 화면 실사 근거 (J열) — UX 참고용, 코드 아님 */
  dsaNote: string
  /** 7/23 미팅 반영분 (▷[0723]) */
  note0723?: string
  /** 기존 정적 HTML 시안 */
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
    logic: [
      'GET /api/v1/students — QueryDSL 동적 검색 빌더 활용',
      '공통 검색 파라미터(year · branchId · keyword 등)',
      '엑셀 Export 마스킹 기본 ON (010-****-1234)',
    ],
    tables: ['students'],
    issues: [],
    dsaNote:
      "DSA '학원생>메인메뉴'에서 12개 조건 검색필터, 394명 목록 확인. 결과 정렬·검색조건 저장은 화면에서 미확인 → 신규 요구사항으로 취급",
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
    logic: [
      'PenaltyRuleEngine — 트리거(지각/결석/루틴미완료)→점수 매핑 규칙 기반 자동 부여',
      'YearlySnapshotService로 항목 전년도 복사',
      '중복 트리거 방지를 위한 멱등성 보장 필요',
    ],
    tables: ['penalty_items', 'penalty_rules'],
    issues: ['#25(I-5)'],
    dsaNote:
      "DSA 'D.Lab>상벌점 내역 조회/관리'에서 조건검색·선택 일괄 점수부여·엑셀다운로드 확인(전체/재원생/퇴원생 3필터). 자동 룰 부여 로직은 없음 — 수기 부여만 가능한 구조",
    note0723: '학생 노출 명칭 완화 검토(관리점수 / 나의점수 등) — 운영팀 확정 대기',
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
    logic: [
      'POST /api/v1/students',
      '학번 채번 규칙: year + %04d(nextSeq) → 예 2026-0001',
      'UNIQUE(year, student_no) — 학번을 PK로 사용 금지',
    ],
    tables: ['students'],
    issues: [],
    dsaNote:
      "DSA '학원생>NEW접수>합격생등록'에서 다중조건검색(모집반/계열/전형)·합격생등록 버튼 확인. 학번 자동부여·매년초기화 로직 자체는 화면상 검증 불가",
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
    logic: [
      'class_assignments',
      '복사 의존순서: department → course_type → class_group → curriculum → penalty_item → tuition',
      'YearlySnapshotService — 단순 INSERT SELECT 금지',
    ],
    tables: ['class_groups', 'class_assignments'],
    issues: [],
    dsaNote:
      "DSA '교무업무>고정반 관리'에서 고정반목록(계열/학과/담임/정원/원생수)·배정/원생/그룹/등록 버튼 확인. 전년도 복사는 미검증",
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
    logic: [
      '승인 라우팅(approval_items.approver_type: PARENT / TEACHER / AUTO)에 따라 학부모 또는 담임으로 분기',
      '⚠ Phase 3 승인 라우팅(F-4.11-5)과 데이터모델 공유 — 스키마를 Phase 1에 미리 반영해 이중설계 회피',
    ],
    tables: ['absence_requests', 'approval_items', 'approval_requests'],
    issues: ['#32(I-12)', '#30(I-10)'],
    dsaNote:
      "DSA 'D.Lab>사유 신청권 설정'에서 사유목록(결석/지각/조퇴/외출)·선택삭제/등록/수정 확인. 현재는 관리자가 직접 등록/수정 — 앱 실시간 제출→승인 흐름은 신규",
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
    logic: [
      'GET/POST/DELETE /api/v1/waitlist',
      'POST .../notify · .../message · .../convert',
      '대성 입학예약폼 확정 전까지 목데이터로 개발',
    ],
    tables: ['student_waitlist'],
    issues: ['#1(D-1)', '#7(D-7)', '#10(S-1)'],
    dsaNote:
      "DSA에는 '특강관리>접수>대기자 접수'(특강 대기자) 화면만 존재하며 대상 자체가 다름. ⚠ 특강대기자 로직을 그대로 이식하지 말 것",
    refHtml: '/design/02_admin_ipsi.html',
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
    logic: [
      'POST /webhooks/kiosk/attendance — 서명검증(HMAC) → NFC/RFID 카드-학번 매핑 → 상태계산 → 알림톡 → PenaltyRuleEngine',
      '상태값 5종: ON_TIME / LATE / ABSENT / OUT / EXCUSED',
      '결석은 배치 스케줄러로 최종 확정',
      '키오스크 스펙(D-2) 미확정 시 목업 payload로 개발',
    ],
    tables: ['attendance_logs', 'absence_requests', 'study_sessions'],
    issues: ['#2(D-2)'],
    dsaNote:
      "DSA 'D.Lab>출결 관리'에서 검색(학번/반/좌석/날짜)·출결목록(등원/하원/외출/공부시간)·학습시간 일괄계산 확인. 직접 Webhook 연동은 신규",
    note0723:
      '사유 지각신청 없이 미등원 시 학생·학부모에게 지각 알림 + 지각사유 회신 요청 자동 발송(무단지각 자동 감지)',
  },

  /* ─────────────── 4.4 메시지 / 알림 ─────────────── */
  {
    id: 'message-send',
    code: 'F-4.4',
    groupId: 'message',
    name: '문자 발송 → 카카오톡 발송(문자 병행)',
    icon: 'message-circle',
    kind: 'supplement',
    phase: 1,
    feOrder: 2,
    summary: '개별·단체 발송, 출결 자동 발송 템플릿(등원·지각·결석), 대기자 알림 자동 발송',
    logic: [
      '알림 채널 이중화 — 카카오 알림톡 + FCM',
      '알림톡 심사 결과에 따라 문자 병행 여부 결정',
      '심사 지연 시 SMS 폴백으로 착수',
    ],
    tables: ['notification_logs', 'notification_templates'],
    issues: ['#19(E-5)', '#24(I-4)', '#34(I-14)'],
    dsaNote:
      "DSA '문자발송>메시지 단체발송'에서 상세 검색필터·대상 조회인원(189명)·직접입력/고정메시지·예약발송 확인. 카카오 알림톡 전환·자동발송 템플릿은 신규",
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
      '월별 신청 현황·결제 내역 조회, 관리자 취소(즉시)/앱 취소(3일 전 PG 자동환불), 수납 자동 반영, 데스크 당일 신청',
    logic: [
      'MealPolicy — 주말 + 공휴일 제외',
      'createOrder(카드 / 가상계좌 분기) · cancelItem(앱 3일전 PG환불 / 관리자 즉시) 2트랙',
      '가상계좌 만료 스케줄러(10분 주기)',
      '⚠ 화면보다 결제/정산 상태모델을 먼저 확정할 것',
    ],
    tables: ['meal_orders', 'meal_order_items', 'meal_policies', 'payment_transactions'],
    issues: ['#4(D-4)', '#6(D-6)', '#17(E-3)', '#18(E-4)', '#33(I-13)', '#38(I-18)'],
    dsaNote:
      "DSA에는 '디멤버 급식신청>신청관리'(디멤버+종이) 화면만 존재. 결제분기·3일취소·수납자동반영 등 핵심 로직은 완전 신규. PG사는 급식업체가 이미 확보 — 신규 선정 불필요, 연동정보(E-3) 수급이 관건",
    note0723:
      '식사체크 주체 = 관리자(교직원), 학생 아님. 키오스크 + 관리자용 소형 패드 병행. 안면/지문 생체인식은 검토 대상(ISMS 유의)',
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
    logic: [
      'ScoreService.fetchAndSync — 전화번호 기반 조회',
      'uploadScorePdf — Storage 업로드 + 대성 알림',
      'previewDetail — 엑셀 미리보기, ColumnMapping 기반 유연 매핑(양식 변경 대응)',
    ],
    tables: ['score_records', 'score_detail_uploads'],
    issues: ['#16(E-2)', '#11(S-2)', '#31(I-11)'],
    dsaNote:
      "DSA '교무업무>모의고사 결시자 현황'은 결시자 체크 전용으로 목적이 다름. 성적 자동조회·PDF업로드·상세분석 전체가 신규",
    note0723: '전과목 등급 표시. 등급 표기 방식(등급 / 백분위% / 평균)은 클라이언트 회신 대기',
    refHtml: '/design/03_admin_seongjeok.html',
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
    summary: '가채점 설문 생성·배포·수집, 설문 템플릿(재사용)',
    logic: [
      'POST /api/v1/surveys (+ publish)',
      'GET .../responses | .../results',
      'survey-templates CRUD + instantiate',
      '성적 모듈과 병행 가능 — 의존성 낮음',
    ],
    tables: ['surveys', 'survey_questions', 'survey_responses', 'survey_answers', 'survey_templates'],
    issues: [],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규. 성적 관리(F-4.6)의 하위 도메인',
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
    summary: '특강 신청자·대기자 목록 조회·관리, 출석 현황 관리, 설명회 신청 관리(신규)',
    logic: ['기술문서 내 별도 API 명세 없음', '공통 모듈(동적 검색 빌더, 엑셀 Import/Export) 활용'],
    tables: [],
    issues: [],
    dsaNote:
      "DSA '특강관리>접수>신청명단'에서 조건검색(월/과정/학과)·진행상태·일괄이동/수정 확인. 신청명단·출석부는 검증됨, '설명회 신청'만 보완 개발 필요",
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
    summary: '카드·가상계좌·등록비 통합 매출 조회, 기간별·지점별 수납 통계, 미납자 목록·알림톡 자동 발송',
    logic: [
      'RBAC: SUPER / BRANCH 전체, STAFF 조회만',
      '대성전산 API 연동으로 조회 전제',
      'API 확정 전까지 목데이터 그리드로 레이아웃만 완성',
    ],
    tables: ['payment_transactions'],
    issues: ['#3(D-3)', '#5(D-5)', '#9(D-9)'],
    dsaNote:
      "DSA '수납현황>통합 매출장'에서 기간·청구기준 검색·매출목록·엑셀다운로드 확인. 수납 개발주체가 대성전산으로 추정돼 API 스펙 확정 전까지 연동방식 미확정",
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
    logic: [
      '엑셀 Import/Export 프레임워크 활용',
      '엑셀 다운로드 마스킹 기본 ON',
      '⚠ I-1(구분 항목 재정의) 확정 전 임의로 필드정의하고 개발 시작 금지 — 우회 불가 항목',
    ],
    tables: [],
    issues: ['#21(I-1)'],
    dsaNote:
      "DSA '교무업무>명단조회/출력>수강생대장'에서 조건검색·테이블·Copy/Excel/Print 확인. '구분 항목 불명확'으로 화면에 (!!) 표기 — 운영팀 재정의 필요",
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
    logic: ['YearlySnapshotService 기반 전년도 복사', '공통 컬럼 규칙 적용'],
    tables: ['departments', 'course_types', 'class_groups', 'curriculums'],
    issues: [],
    dsaNote: "DSA '기초관리>과정 관리'에서 과정목록·등록/수정/삭제 확인",
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
    logic: [
      'RBAC 5단계: SUPER_ADMIN / BRANCH_ADMIN / TEACHER / STAFF / READONLY',
      'Supabase Auth + JWT 검증 필터',
      '전화·주소·생년월일 포함 응답은 BRANCH_ADMIN 이상만 조회',
      '⚠ Phase 0에서 완성 필수 — 권한 골격 없이 Phase 1 진입 시 보안구멍',
    ],
    tables: ['users', 'roles', 'branch_configs'],
    issues: [],
    dsaNote:
      "DSA '사용자 관리'에서 지점선택·사용자목록·상세/승인/탈퇴/삭제 확인, 지점별 접근제어 운영 중으로 관찰. RBAC 5단계 세부모델은 전량 신규 설계",
  },
  {
    id: 'admin-assign',
    code: 'F-4.10-3',
    groupId: 'admin',
    name: '배정 관리(기숙사·사물함·독서실)',
    icon: 'armchair',
    kind: 'verified',
    phase: 2,
    feOrder: 3,
    summary: '기숙사 / 사물함 / 독서실 배정',
    logic: ['기술문서 내 별도 API 명세 없음 — 기초관리 하위 구조 재사용 예상'],
    tables: [],
    issues: [],
    dsaNote: "DSA '관리자>배정관리>기숙사 배정 관리'에서 학생목록·일괄배정/해제·기숙사목록 확인. 사물함/독서실도 동일 구조",
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
    logic: ['기술문서 내 별도 API 명세 없음'],
    tables: [],
    issues: [],
    dsaNote: "DSA '관리자>특강관리'에서 상태별 필터·특강목록·등록/배정/수정/삭제 확인. 설명회 신청 항목은 별도 추가 개발 가능성",
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
    logic: ['PG사(가상계좌·카드) 연동 설정 — 급식 PG와 별개', '등록비는 TuitionPgClient 전제(D-9 확정 필요)'],
    tables: ['payment_transactions'],
    issues: ['#9(D-9)'],
    dsaNote: "DSA '관리자>수납관리>청구기준 관리'에서 청구기준목록(가상계좌/PG·VAN)·수납/메시지/수정/삭제 확인",
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
    logic: ['기술문서 내 별도 API 명세 없음'],
    tables: [],
    issues: ['#42(I-22)'],
    dsaNote: "DSA '실적>실적 입력(부산기숙)'에서 연도/시험선택·실적목록·수정 확인. 실적 통계(집계) 화면은 별도 확인 필요",
    note0723: '목표 계열 명칭·순서 표준화 — ①메디컬 ②서울 최상위 ③서울 지거국 ④수도권 ⑤지방 4년제(마스터)',
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
    logic: [
      'GET/POST /api/v1/routines · copy-from-month · .../{id}/results',
      '결과 입력 시 PenaltyRuleEngine.apply() 자동 연동',
      'I-5 미확정 시 결과입력까지만, 자동 상벌점 연동은 후행',
    ],
    tables: ['daily_routines', 'daily_routine_results'],
    issues: ['#25(I-5)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규(기획서 4.11, 7/10 미팅 반영)',
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
    summary: '주간 학습계획 비교그래프(계획 대비 실제), 교시×요일 그리드, 관리자 편집, 과목/형태별 시간·비율 파이',
    logic: [
      'GET learning-plans(그리드) · PATCH items(파란색 = 교사 편집만)',
      'GET compare(비교그래프) · GET composition(파이)',
      'learning-plan-options — 드롭다운 마스터',
      '⚠ FE 최대 공수 단일화면. 별도 일정 버퍼 필수 — 최우선 보호 대상',
    ],
    tables: ['learning_plans', 'learning_plan_items', 'learning_plan_options'],
    issues: ['#27(I-7)', '#39(I-19)', '#41(I-21)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규',
    note0723:
      '①점심·저녁 시간대 입력 허용 ②지난주·이전일 계획 복사 ③스크롤 시 요일 헤더 고정 ④비율 게이지 가로형·편집 ⑤과목별 누계+비율 ⑥탐구1/2 분리 ⑦주중·주말 × 모의고사/학습 모드 ⑧이행 표시 %·드래그 or ○△빈칸(회신 대기) ⑨연간행사 마스터 반영 / ※교시 20분 세분 편집은 UI 복잡도로 개발팀 반대의견 회신 예정',
  },
  {
    id: 'chat',
    code: 'F-4.11-3',
    groupId: 'expand',
    name: '메시지 관리(공지·행정요청·1:1채팅·가족채팅방)',
    icon: 'messages-square',
    kind: 'brandnew',
    phase: 3,
    feOrder: 7,
    summary: '발송 범위별 권한(전체=본사 / 지점=지점관리자 / 반=담임), 1:1 채팅 외부 메신저 React 연동, 가족 채팅방, 행정 요청 수신함',
    logic: [
      'POST /api/v1/notices — scope: ALL / BRANCH / CLASS / INDIVIDUAL',
      'GET admin-requests — 행정 요청 수신함',
      'POST chat/threads — DIRECT_1TO1 | FAMILY',
      '본문은 외부 벤더 저장, 메타·참조ID만 자체 DB',
      '공지·행정요청은 선행 가능, 1:1채팅은 메신저 선정(E-6) 선결',
    ],
    tables: ['notices', 'admin_requests', 'chat_threads'],
    issues: ['#20(E-6)', '#23(I-3)'],
    dsaNote: 'F-4.4(문자발송)와 발송권한 개념만 유사. 1:1채팅·가족채팅방·행정요청 수신함은 완전 신규',
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
    logic: [
      'GET/POST consult-logs · POST consult-reports',
      'consult-tags — 마스터, max_display(최대 노출 개수)',
      '성적 상세 · 학습계획 비교 데이터 결합',
      '⚠ 반드시 성적상세(F-4.6)·학습계획(F-4.11-2) 이후 착수 — 순서를 바꾸면 두 도메인을 목데이터로 두 번 개발',
    ],
    tables: ['consult_tags', 'consult_report_subjects', 'consult_logs'],
    issues: ['#22(I-2)', '#39(I-19)', '#37(I-17)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규(구글시트로 운영 중이던 것을 시스템화, I-15 연계)',
    note0723:
      '담임별/반별 필터 상담현황 조회. 필요항목: 이름·반·학번·좌석번호·입학일·신상기록부 작성여부·초도상담현황(미상담 시 빨간 경고)·상담일자·상담유형. 담임별 학생명단 조회·출력. 이행률(별점) vs % vs ○△✗ 표기 정합 필요',
    refHtml: '/design/01_admin_sangdam.html',
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
    logic: [
      'approval_items — approver_type: PARENT | TEACHER | AUTO',
      'GET /approvals?assignee=me · POST .../:approve | :reject',
      'Phase 1 임시모델을 정식화. I-12 선결',
      'Phase 0 스키마에 타임아웃·에스컬레이션 필드 선반영',
    ],
    tables: ['approval_items', 'approval_requests'],
    issues: ['#32(I-12)', '#40(I-20)'],
    dsaNote: 'DSA는 F-4.1-5에서 관리자가 직접 처리하는 구조만 확인 — 승인주체 자동분기 라우팅 자체가 신규',
    note0723:
      '승인 대기 UI = 시안1. 에스컬레이션: 부모 승인 → 일정시간 미응답 → 담임 승인. 응답시간·입학시 승인자 사전지정은 클라이언트 미확약',
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
    logic: [
      'GET daily-reports/{studentId}/{date} · .../monthly',
      'PATCH .../self-feedback',
      'GET study-time-rankings — scope × period 배치 집계',
      '순공시간 산출(I-6) 미확정 시 원시로그 집계만',
    ],
    tables: ['daily_report_feedback', 'study_time_rankings'],
    issues: ['#26(I-6)', '#34(I-14)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규(앱 데이터 원천, 서버 집계)',
  },
  {
    id: 'qna-vocab',
    code: 'F-4.11-7',
    groupId: 'expand',
    name: '대면 질의응답·영단어 시험 관리',
    icon: 'calendar-clock',
    kind: 'brandnew',
    phase: 3,
    feOrder: 8,
    summary: '대면(OFF) 질의응답 예약(상담실 타임 개설·예약 현황), 데일리 시험(디랩 콘텐츠) 생성·배포·응시결과',
    logic: [
      'GET/POST qna/offline/slots · GET qna/offline/reservations',
      'GET/POST vocab-tests · GET vocab-tests/{id}/results',
      '의존성 가장 낮음 — 여유 시 배치',
    ],
    tables: ['qna_offline_slots', 'qna_offline_reservations', 'vocab_tests', 'vocab_test_results'],
    issues: [],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규. 영단어 시험 결과는 Daily Report 링크로 노출 연동',
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
    logic: [
      '패드 소지 = 앱 신청 / 미소지 = 키오스크 병행',
      '순찰기록을 "좌석 이탈 현황"으로 재정의·연동',
      '배경: 키오스크 증설 중단(잔여 6대)으로 앱 대체',
      'D-2 종속 — 미확정 시 앱만 우선',
    ],
    tables: ['seat_move_requests', 'seat_map(가칭)', 'patrol_logs(재정의)'],
    issues: ['#36(I-16)', '#2(D-2)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규(0723 앱 디자인 피드백). 키오스크 대체 목적',
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
    logic: [
      '가입 기본정보 자동표시(설문 입력 제외)',
      '관리 학생상담 탭에서 열람 + PDF 다운로드',
      '미작성 시 등록 미완',
      '⚠ 양식(I-17) 확정 전 폼 확정 불가 — 온보딩 착수 전 필수',
    ],
    tables: ['student_profiles', 'profile_forms(가칭)'],
    issues: ['#37(I-17)', '#35(I-15)'],
    dsaNote: '구글시트로 운영 중이던 초도상담 자료의 앱화(0723 피드백, I-15 연계). 완전 신규',
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
    logic: ['행사 유형·기간 마스터', '학습계획(F-4.11-2)에서 참조', '기초설정(4.10) 하위 배치 가능'],
    tables: ['annual_events(가칭)'],
    issues: ['#41(I-21)'],
    dsaNote: 'DSA에 대응 화면 없음 — 완전 신규(0723 피드백)',
  },
]

/* ─────────────── 파생 헬퍼 ─────────────── */

export const screensOf = (groupId: string) => SCREENS.filter((s) => s.groupId === groupId)

export const findScreen = (id: string) => SCREENS.find((s) => s.id === id)

export const findGroup = (id: string) => GROUPS.find((g) => g.id === id)

export const countByKind = (kind: Kind) => SCREENS.filter((s) => s.kind === kind).length

export const countByPhase = (phase: PhaseNo) => SCREENS.filter((s) => s.phase === phase).length
