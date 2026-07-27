/* ============================================================================
 * 오픈이슈 관리대장 — `DSA_DLab_요구사항정의서.xlsx` 5시트 (총 42건)
 * 우선순위 집계: 최우선 7 / 높음 15 / 중 16 / 하 4
 * ========================================================================== */

export type Priority = '최우선' | '높음' | '중' | '하'

/** 원 코드 접두어로 구분되는 확인 대상 계열 */
export type Area = '대성전산' | 'D.Lab사이트(DSD)' | '기타 외부연동' | '내부(운영팀)' | '내부/대성전산'

export interface Issue {
  no: number
  /** 원 코드 — D-n / S-n / E-n / I-n */
  code: string
  priority: Priority
  area: Area
  kind: string
  body: string
  owner: string
  memo: string
}

export const PRIORITY_ORDER: Priority[] = ['최우선', '높음', '중', '하']

export const ISSUES: Issue[] = [
  { no: 1, code: 'D-1', priority: '최우선', area: '대성전산', kind: '데이터', body: '기존 DSA 데이터(학생·상벌점·반·출결) export 가능 여부/포맷/범위, 초기 셋업 방식. 계약 종료 전 병행 운영 가능성 → 단방향 1회 이관이 아닌 양방향 동기화 어댑터 전제 설계 필요', owner: '대성전산 협의', memo: '코드 없이 API 기반 이관만 가능' },
  { no: 2, code: 'D-2', priority: '최우선', area: '대성전산', kind: '연동', body: '키오스크 소유·펌웨어 제어 주체, Webhook 엔드포인트 변경 가능 여부, payload 포맷, NFC/RFID 카드-학번 매핑, 식사체크 로직', owner: '대성전산 협의', memo: '출결·식사체크 전체 기능의 Phase 1 착수 블로커' },
  { no: 3, code: 'D-3', priority: '높음', area: '대성전산', kind: '연동', body: '대성전산 API 조회라면 엔드포인트·인증·응답 필드·실시간성(webhook/polling)·미납자 데이터 명세', owner: '대성전산 협의', memo: '수납 현황·미납자·급식 수납 연동' },
  { no: 4, code: 'D-4', priority: '중', area: '대성전산', kind: '데이터모델', body: '디멤버 정의(급식/회원?), 앱 급식 대체 후 역할 존치 여부, API 명세. 확정: 재원생=앱 사용 / 교사=디멤버 사이트 관리', owner: '대성전산 협의', memo: '급식·수납 연동 범위' },
  { no: 5, code: 'D-5', priority: '최우선', area: '대성전산', kind: '아키텍처', body: 'v1.1엔 있고 v1.2엔 없음 → 대성전산 API를 수납만 남기는지 / 전면 제거인지 최종 확정', owner: '내부 확정', memo: '아키텍처 전제 조건' },
  { no: 6, code: 'D-6', priority: '높음', area: '대성전산', kind: '연동', body: '앱 급식 결제/취소가 대성전산 수납에 반영되는 방식(직접 write? pull?)', owner: '대성전산 협의', memo: '급식 결제 + 수납 연동' },
  { no: 7, code: 'D-7', priority: '높음', area: '대성전산', kind: '데이터', body: '입학예약폼 항목 확정본 전달 요청(대성 확정 후 개발팀 전달)', owner: '대성전산 협의', memo: '대기자 관리 연동 착수 블로커' },
  { no: 8, code: 'D-8', priority: '중', area: '대성전산', kind: '일정', body: '대성전산 DSA 계약 종료 시점(병행 운영 기간·전환 시점) → 동기화 전략·컷오버 계획', owner: '행정팀 확인', memo: '마이그레이션·컷오버(Phase 4)' },
  { no: 9, code: 'D-9', priority: '최우선', area: '대성전산', kind: '결제', body: '등록비(TUITION) 결제 주체 확정 — 기술문서는 학원명의 PG 직접결제 전제 vs 기획/미팅은 수납=대성전산으로 상충', owner: '기획·행정 확정', memo: '결제·수납 아키텍처 근간, D-5와 연동' },

  { no: 10, code: 'S-1', priority: '높음', area: 'D.Lab사이트(DSD)', kind: '연동', body: '디멤버 사이트 입학예약폼 확정본 + 데이터 연동 방식(API/DB)', owner: 'DSD 협의', memo: '대기자 관리, D-7과 연동' },
  { no: 11, code: 'S-2', priority: '중', area: 'D.Lab사이트(DSD)', kind: '연동', body: '성적표 PDF → D.Lab 사이트 업로드 API/엔드포인트', owner: 'DSD 협의', memo: '성적 관리' },
  { no: 12, code: 'S-3', priority: '하', area: 'D.Lab사이트(DSD)', kind: '연동', body: "2027-12까지 웹뷰 URL·세션 연동 방식(v1.1 '보류' 표기 → 진행 여부)", owner: 'DSD 협의', memo: '부가 기능(Phase 4)' },
  { no: 13, code: 'S-4', priority: '중', area: 'D.Lab사이트(DSD)', kind: '연동', body: '현재 DSA에 API 연동으로 상담신청 중 → 해당 엔드포인트 명세 요청', owner: 'DSD 협의', memo: '대기자·상담 연동' },
  { no: 14, code: 'S-5', priority: '하', area: 'D.Lab사이트(DSD)', kind: '행정', body: 'DSD가 스토어 계정 보유 → 신규 앱 배포용 계정 사용/권한 위임 방식 확정', owner: 'DSD 협의', memo: '앱 배포(Phase 4)' },

  { no: 15, code: 'E-1', priority: '중', area: '기타 외부연동', kind: '연동', body: 'Zyxel Nebula API 크레덴셜/권한, 제어 단위(학생·단말 vs 정책·그룹), 인강 화이트리스트 관리', owner: '자이엘코리아', memo: '와이파이 방화벽 해제' },
  { no: 16, code: 'E-2', priority: '높음', area: '기타 외부연동', kind: '연동', body: '더프리미엄모의고사 API 명세·인증, 전화번호 기반 응답 필드, rate limit, 성적표 원본 제공 여부', owner: '더프리미엄', memo: '성적 관리(Phase 3) 착수 블로커' },
  { no: 17, code: 'E-3', priority: '높음', area: '기타 외부연동', kind: '연동', body: '급식업체가 이미 계약된 PG사를 사용 중 — 신규 선정 대상 아님. 해당 PG사의 가맹점 사업자정보, 카드·가상계좌 발급 연동 API 스펙, 정산주기 확보 필요', owner: '급식업체(PG 연동정보 요청)', memo: '급식 관리(Phase 2) — 선정 절차 아님' },
  { no: 18, code: 'E-4', priority: '높음', area: '기타 외부연동', kind: '계약', body: '급식업체 연락처, 3일 이내 취소 전달 방식, 환불 프로세스, 식수 마감·신청 데이터 전달', owner: '급식업체', memo: '급식 관리' },
  { no: 19, code: 'E-5', priority: '최우선', area: '기타 외부연동', kind: '연동', body: '카카오 알림톡 발신 프로필, 템플릿 사전 승인, 문자 대체발송', owner: '카카오', memo: '문자/알림 발송(Phase 1) 착수 블로커' },
  { no: 20, code: 'E-6', priority: '높음', area: '기타 외부연동', kind: '선정', body: '1:1 채팅용 외부 유료 메신저 1만명 규모 제품 선정, React 연동(담당: 서지원), 개인정보/보안 검토', owner: '개발팀 조사', memo: '메시지 관리(Phase 3) 착수 블로커' },

  { no: 21, code: 'I-1', priority: '최우선', area: '내부(운영팀)', kind: '정책', body: "교무업무 '구분 항목' 재정의 — 현재 불명확", owner: '운영팀', memo: '개발 착수 전 필수 · 유일한 우회 불가 항목' },
  { no: 22, code: 'I-2', priority: '중', area: '내부(운영팀)', kind: '정책', body: '상담 양식 + 상담 리포트 양식 및 발송 주기 확정', owner: '운영팀', memo: '성적/상담 모듈 착수 전' },
  { no: 23, code: 'I-3', priority: '중', area: '내부(운영팀)', kind: '정책', body: '앱 행정 요청 클릭 항목 리스트', owner: '운영팀', memo: '메시지 모듈 착수 전' },
  { no: 24, code: 'I-4', priority: '중', area: '내부(운영팀)', kind: '정책', body: '알림톡/푸시 전체 문구', owner: '운영팀', memo: '알림 연동 전' },
  { no: 25, code: 'I-5', priority: '높음', area: '내부(운영팀)', kind: '정책', body: '데일리루틴·출결 → 상벌점 자동 부여 규칙 매핑', owner: '운영팀', memo: '상벌점 엔진 설계 시 착수 블로커' },
  { no: 26, code: 'I-6', priority: '중', area: '내부(운영팀)', kind: '정책', body: '순공부시간 산출 정의(입퇴실/좌석없음 반영 기준)', owner: '운영팀', memo: 'Daily Report 설계 시' },
  { no: 27, code: 'I-7', priority: '중', area: '내부(운영팀)', kind: '정책', body: "학습계획 '파란색' 항목 정의(선생님 편집 vs 학생 입력 경계)", owner: '운영팀', memo: '학습계획 모듈' },
  { no: 28, code: 'I-8', priority: '하', area: '내부(운영팀)', kind: '정책', body: '성적 리포트 상세 추후 확정 항목', owner: '운영팀', memo: '성적 모듈 후반' },
  { no: 29, code: 'I-9', priority: '높음', area: '내부(운영팀)', kind: '디자인', body: 'D.Lab 디자인 가이드 제공 예정', owner: '기획팀', memo: 'FE 착수 전 필수' },
  { no: 30, code: 'I-10', priority: '중', area: '내부(운영팀)', kind: '정책', body: "'벌점 확정 후 사유 승인 불가'의 확정 기준", owner: '운영팀', memo: '사유/벌점 로직' },
  { no: 31, code: 'I-11', priority: '높음', area: '내부(운영팀)', kind: '정책', body: '성적 엑셀 양식 자체 제작 여부, 내년 양식 변경 대응(유연 매핑), API/엑셀 경계', owner: '운영팀', memo: '성적 모듈 착수 전' },
  { no: 32, code: 'I-12', priority: '높음', area: '내부(운영팀)', kind: '정책', body: '학생 신청 항목별 승인 주체(학부모/선생님/자동) 확정, 방화벽 해제 승인 주체', owner: '운영팀', memo: '승인 로직 설계 전 착수 블로커' },
  { no: 33, code: 'I-13', priority: '중', area: '내부(운영팀)', kind: '정책', body: '데스크 당일 급식 신청 결제 방식(PG카드/현금/수납), 취소·환불 주체, 관리자 직접 등록 화면 필요 여부', owner: '운영팀', memo: '급식 모듈 착수 전' },
  { no: 34, code: 'I-14', priority: '중', area: '내부(운영팀)', kind: '정책', body: '알림톡 심사 통과 여부에 따라 FCM 단독 vs 알림톡 병행 확정', owner: '운영팀', memo: '알림 연동 시' },
  { no: 35, code: 'I-15', priority: '높음', area: '내부(운영팀)', kind: '마이그레이션', body: '구글 시트 2개(상담·학생관리) 실제 구조·컬럼 파악, 이관 계획', owner: '개발팀·운영팀', memo: 'Phase 0 착수 항목' },
  { no: 36, code: 'I-16', priority: '높음', area: '내부/대성전산', kind: '연동', body: '좌석 이탈/복귀 — 위치 구분값·좌석표 실시간 반영·앱↔키오스크 병행 처리·잔여 키오스크(6대) 연동 범위', owner: '운영팀·대성전산', memo: '좌석이탈(F-4.11-8), D-2 연계' },
  { no: 37, code: 'I-17', priority: '최우선', area: '내부(운영팀)', kind: '정책', body: '신상기록부 4종 양식·항목·학년별 폼 분기·PDF 양식 확정(입학 필수·회원가입 강제 단계)', owner: '운영팀', memo: '신상기록부·회원가입 온보딩 착수 전 필수' },
  { no: 38, code: 'I-18', priority: '중', area: '기타 외부연동', kind: '연동', body: '급식 식사체크 방식 — 관리자용(키오스크/소형 패드), 안면·지문 생체인식 채택 여부(채택 시 개인정보/ISMS 검토 필수)', owner: '운영팀·개발팀', memo: '급식(F-4.5)' },
  { no: 39, code: 'I-19', priority: '높음', area: '내부(운영팀)', kind: '정책', body: '학습계획 이행 표시 방식 — % + 드래그 / ○△빈칸 3단계 중 확정, 상담 별점과의 층위 정리', owner: '운영팀·개발팀', memo: '학습계획·상담' },
  { no: 40, code: 'I-20', priority: '중', area: '내부(운영팀)', kind: '정책', body: '승인 타임아웃/에스컬레이션 — 부모 미응답 응답시간, 입학 시 승인자 사전지정 가능 여부(클라이언트 미확약)', owner: '운영팀·개발팀', memo: '승인(F-4.11-5), I-12 확장' },
  { no: 41, code: 'I-21', priority: '중', area: '내부(운영팀)', kind: '정책', body: '연간 행사 마스터 — 입력 주체·행사 유형·학습계획 반영 규칙', owner: '운영팀', memo: '연간행사(F-4.11-10)' },
  { no: 42, code: 'I-22', priority: '하', area: '내부(운영팀)', kind: '정책', body: '계열 명칭·순서 표준(마스터) — 메디컬 등 5분류', owner: '운영팀', memo: '실적/신상/목표 공통' },
]

const BY_NO = new Map(ISSUES.map((i) => [i.no, i]))

/** menu.ts의 `#25(I-5)` 형태 문자열을 Issue로 해석 */
export const resolveIssue = (ref: string): Issue | undefined => {
  const m = /^#(\d+)/.exec(ref)
  return m ? BY_NO.get(Number(m[1])) : undefined
}

export const countByPriority = (p: Priority) => ISSUES.filter((i) => i.priority === p).length
