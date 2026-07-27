/* ============================================================================
 * 화면별 잠정 결정 사항
 *
 * 목업을 "실제 제품처럼" 보이게 만들려면 아직 확정되지 않은 항목도 일단 그려야 한다.
 * 그렇게 임의로 정한 것들을 여기에 모아 둔다. 화면에는 띄우지 않고 문서로만 관리한다.
 *   → `npm run docs` 가 docs/ASSUMPTIONS.md 로 내보낸다.
 *
 * ⚠ 여기 있는 항목은 전부 "확정되면 화면을 고쳐야 하는" 것들이다.
 *   해당 이슈가 닫히면 이 파일에서도 지울 것.
 * ========================================================================== */

export interface Assumption {
  /** 무엇을 임의로 정했는가 */
  what: string
  /** 확정되면 어떻게 바뀌는가 */
  onDecision: string
  /** 관련 오픈이슈 코드 */
  issue?: string
}

export const ASSUMPTIONS: Record<string, Assumption[]> = {
  'student-penalty': [
    {
      what: '상벌점 자동 부여 트리거 8종(ATTENDANCE_LATE, ROUTINE_INCOMPLETE 등)과 배점을 임의 지정',
      onDecision: 'PenaltyRuleEngine 매핑 규칙이 확정되면 트리거·배점 전면 교체. 현재 동작은 수기 부여만',
      issue: 'I-5',
    },
    {
      what: "학생 노출 명칭을 '상벌점' 그대로 사용",
      onDecision: "완화 명칭(관리점수/나의점수 등) 확정 시 라벨 일괄 변경",
    },
  ],
  attendance: [
    {
      what: '키오스크 payload를 목업으로 가정하고 상태 5종(ON_TIME/LATE/ABSENT/OUT/EXCUSED) 자체 정의',
      onDecision: '실제 payload 포맷 수령 시 수신부 교체. 상태 enum도 대성전산 정의에 맞춰 재정의될 수 있음',
      issue: 'D-2',
    },
    {
      what: '순공시간을 단순 재실시간으로 계산',
      onDecision: '입퇴실·좌석없음 차감 규칙 확정 시 산출식 교체',
      issue: 'I-6',
    },
  ],
  'message-send': [
    {
      what: '알림톡을 주 채널로 두고 SMS를 폴백으로 배치. 템플릿 문구 6종 임의 작성',
      onDecision: '심사 결과에 따라 FCM 단독으로 바뀔 수 있음. 문구는 운영팀 확정본으로 전량 교체',
      issue: 'E-5 / I-4 / I-14',
    },
  ],
  'student-absence': [
    {
      what: '항목별 승인 주체(결석=학부모, 지각=담임 등)와 응답 제한시간(30~240분)을 임의 배정',
      onDecision: '승인 주체 매트릭스 확정 시 전면 교체',
      issue: 'I-12',
    },
    {
      what: "'벌점 확정 후 사유 승인 불가' 기준이 없어 승인 버튼을 항상 활성으로 둠",
      onDecision: '기준 확정 시 조건부 비활성 처리 추가',
      issue: 'I-10',
    },
  ],
  'profile-form': [
    {
      what: '신상기록부 입력 폼 항목을 학년별 분기(고2·고3 단순형 / 재수·N수 4종)로만 구성하고 세부 문항은 비움',
      onDecision: '4종 양식·항목·PDF 양식 확정 시 폼 전체를 새로 구성',
      issue: 'I-17',
    },
  ],
  meal: [
    {
      what: '1식 6,500원, 가상계좌 만료 10분 주기, 전표번호 형식 MO-YYYYMM-NNNN 을 임의 지정',
      onDecision: 'PG 연동정보 수령 시 전표 체계·정산주기 재설계',
      issue: 'E-3 / E-4',
    },
    {
      what: '데스크 당일 신청의 결제·환불 주체를 관리자 즉시 처리로 가정',
      onDecision: '결제 방식(PG카드/현금/수납)과 환불 주체 확정 시 흐름 변경',
      issue: 'I-13',
    },
  ],
  payment: [
    {
      what: '전표번호 형식 DS-YYYY-NNNNNN, 항목 4종(등록비·교습비·특강비·급식비)을 임의 지정',
      onDecision: '대성전산 채번 체계를 그대로 쓸지 자체 채번할지 확정 후 교체',
      issue: 'D-3 / D-5',
    },
    {
      what: '등록비 결제 경로를 PG·VAN 으로 표시',
      onDecision: '결제 주체가 대성전산으로 확정되면 경로·화면 흐름 모두 변경',
      issue: 'D-9',
    },
  ],
  affairs: [
    {
      what: "수강생 대장의 '구분' 컬럼을 값 없이 비워 둠 (유일하게 우회 불가 항목이라 임의 정의하지 않음)",
      onDecision: '항목 재정의 수령 시 컬럼 정의·필터·엑셀 양식 확정',
      issue: 'I-1',
    },
  ],
  'seat-move': [
    {
      what: '위치 구분값 5종(SEAT/CLASSROOM/RESTROOM/COMMON/SUBJECT)을 자체 제안',
      onDecision: '운영팀·대성전산 확정 시 enum 교체. 키오스크 병행 범위도 함께 결정',
      issue: 'I-16 / D-2',
    },
  ],
  'admin-billing': [
    {
      what: '환불 기준을 학원법 시행령(경과 비율)으로 가정',
      onDecision: '급식 환불 주체 확정 시 급식 항목만 별도 규칙으로 분리',
      issue: 'I-13',
    },
  ],
  'admin-lecture': [
    {
      what: '설명회를 특강 마스터의 유형 하나로 처리',
      onDecision: '별도 도메인으로 분리할지 확정 필요',
    },
  ],
  'admin-result': [
    {
      what: '계열 5분류(메디컬·서울 최상위·서울 지거국·수도권·지방 4년제)를 0723 표준안대로 적용',
      onDecision: '마스터 확정 시 실적·신상기록부·목표 세 곳이 같은 마스터를 참조하도록 정리',
      issue: 'I-22',
    },
  ],
  'admin-user': [
    {
      what: 'RBAC 5단계 × 기능영역 12개 권한 매트릭스를 초안으로 작성',
      onDecision: '운영팀 검토 후 확정. FE 라우트 가드가 이 표와 1:1 대응해야 함',
    },
  ],
  'learning-plan': [
    {
      what: '교사 편집 영역(파란 셀)을 1·2교시와 마지막 교시로 가정',
      onDecision: "'파란색' 정의 확정 시 편집 권한 분기 재작성",
      issue: 'I-7',
    },
    {
      what: '이행 표시를 1안(바+%) / 2안(○△빈칸) 두 가지로 모두 구현해 토글 제공',
      onDecision: '한 가지로 확정되면 나머지 제거. 상담 리포트 별점과의 층위도 함께 정리',
      issue: 'I-19',
    },
    {
      what: '교시 단위로 구성 (20분 세분 편집 미반영)',
      onDecision: 'UI 복잡도 대비 실익이 낮다는 개발팀 의견 회신 예정. 채택되면 셀 분할 구조 필요',
    },
  ],
  'daily-routine': [
    {
      what: '루틴 6종과 배점, 트리거 코드를 임의 지정',
      onDecision: '상벌점 규칙 확정 시 자동 부여 연동. 현재는 결과 입력까지만 동작',
      issue: 'I-5',
    },
  ],
  chat: [
    {
      what: '행정 요청 항목 6종을 임의 제안',
      onDecision: '항목 확정 시 담당 부서 라우팅 규칙도 함께 정의',
      issue: 'I-3',
    },
    {
      what: '1:1 채팅·가족 채팅방 화면을 빈 상태로 둠',
      onDecision: '외부 메신저 선정 후 SDK 연동. chat_threads 메타 구조는 유지',
      issue: 'E-6',
    },
  ],
  approval: [
    {
      what: '방화벽 해제·전자기기 반입 항목의 승인 주체를 미지정 상태로 둠',
      onDecision: '매트릭스 확정 시 지정',
      issue: 'I-12',
    },
    {
      what: '에스컬레이션 응답 제한시간을 임시값(30~240분)으로 표시',
      onDecision: '클라이언트 확약 시 실제 값 적용. 스키마 필드는 이미 확보',
      issue: 'I-20',
    },
  ],
  'daily-report': [
    {
      what: '순공시간을 재실시간에 임시 계수를 곱해 산출',
      onDecision: '차감 규칙 확정 시 배치 집계 로직 확정. 좌석 이탈 위치값과 함께 결정하는 것이 효율적',
      issue: 'I-6 / I-16',
    },
  ],
  'annual-events': [
    {
      what: '행사 유형 5종과 학습계획 차단 여부를 자체 제안',
      onDecision: '입력 주체·유형·반영 규칙 확정 시 교체. 휴원과 공휴일 provider의 관계도 정리 필요',
      issue: 'I-21',
    },
  ],
  waitlist: [
    {
      what: '입학예약 카드 필드를 디멤버 폼 항목으로 가정',
      onDecision: '폼 확정본 수령 시 필드 전면 교체',
      issue: 'D-7 / S-1',
    },
  ],
  score: [
    {
      what: '등급·백분위·평균을 모두 병기',
      onDecision: '등급 표기 방식 회신 시 한 가지로 정리',
    },
  ],
}

export const assumptionsOf = (screenId: string) => ASSUMPTIONS[screenId] ?? []

export const totalAssumptions = Object.values(ASSUMPTIONS).reduce((a, v) => a + v.length, 0)
