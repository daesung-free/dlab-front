/* ============================================================================
 * 내비게이션 IA — 클라이언트 메뉴표(대분류 / 중분류 / 기능) 기준
 *
 *  ⚠ `menu.ts` 와 역할이 다르다. 헷갈리면 안 된다.
 *
 *    · menu.ts  = 요구사항정의서 SSOT. F-4.x 코드·Phase·오픈이슈·구분(개발범위).
 *                 docs/ 3종이 여기서 자동 생성되므로 구조를 바꾸면 핸드오프 문서가 깨진다.
 *    · nav.ts   = 클라이언트가 실제로 쓰는 메뉴 트리. 화면을 "어디에 걸어둘 것인가"만 정한다.
 *
 *  즉 nav.ts 는 menu.ts 의 화면(screenId)을 클라이언트 메뉴 구조에 배치하는 매핑 레이어다.
 *  화면을 새로 만들면 menu.ts(SSOT) → screens/index.ts(목업) → nav.ts(메뉴 배치) 순서로 등록한다.
 *
 *  `added: true` = 클라이언트 메뉴표에는 없지만 요구사항정의서 4.11(신규 확장) 등으로
 *  개발이 확정된 화면을 이 자리에 편입한 것. 메뉴에서 점으로 구분 표시된다.
 * ========================================================================== */

export interface NavItem {
  /** menu.ts SCREENS[].id */
  screenId: string
  /** 메뉴 표시명 — 클라이언트 메뉴표 명칭을 우선한다 */
  label: string
  /** 미지정 시 화면 자체 아이콘을 쓴다 */
  icon?: string
  /**
   * 같은 화면을 진입 탭만 달리해 여러 메뉴로 거는 경우.
   * `/s/{screenId}?tab={tab}` 로 연결된다. (예: 기초관리 과정/학과/학과계열)
   */
  tab?: string
  /** 클라이언트 메뉴표에 없던 화면을 이 자리에 편입 */
  added?: boolean
  /** 클라이언트 비고란 원문 또는 배치 근거 */
  note?: string
}

export interface NavSection {
  /** 중분류 */
  name: string
  items: NavItem[]
}

export interface NavCat {
  /** URL: /g/{id} */
  id: string
  /** 대분류 */
  name: string
  icon: string
  desc: string
  sections: NavSection[]
}

export const NAV: NavCat[] = [
  {
    id: 'student-mgmt',
    name: '학원생 관리',
    icon: 'users',
    desc: '원생 등록·출결·학습·상담·수납까지 학생 한 명의 전 주기를 다루는 메뉴',
    sections: [
      {
        name: '학원생',
        items: [
          { screenId: 'student-search', label: '학원생' },
          { screenId: 'student-enroll', label: '신규 접수 등록', added: true, note: '요구사항정의서 F-4.1-3' },
          { screenId: 'waitlist', label: '대기자 관리', added: true, note: '디멤버 입학예약자 → 원생 전환. F-4.2' },
          { screenId: 'profile-form', label: '신상기록부', added: true, note: '입학 필수 · 앱 학생 입력. F-4.11-9' },
        ],
      },
      {
        name: '메모/기타',
        items: [{ screenId: 'change-log', label: '금일 수정 이력' }],
      },
      {
        name: '문자발송',
        items: [
          {
            screenId: 'message-send',
            label: '알림 발송',
            note: 'SMS 제외 — 카카오 알림톡 + 앱 푸시 2종. 템플릿 관리 포함',
          },
          { screenId: 'chat', label: '공지 · 1:1 채팅', added: true, note: '행정요청 수신함 포함. 가족채팅방 제외. F-4.11-3' },
        ],
      },
      {
        name: '디멤버 급식신청',
        items: [
          {
            screenId: 'meal',
            label: '급식신청 · 배식 체크',
            note: '일정 관리(중단일 → 신청 차단) · 학생 앱 QR 배식 체크 + 관리자 수기 확인',
          },
        ],
      },
      {
        name: '교무업무',
        items: [
          { screenId: 'student-status', label: '학원생 현황' },
          { screenId: 'timetable', label: '시간표 · 이동수업' },
          { screenId: 'student-class', label: '고정반 관리', note: '시간표·이동수업과 함께 사용' },
          { screenId: 'affairs', label: '명단 조회 · 출력', note: '직반계/장학생 명단 · 원생항목별 조회·다운로드 사용' },
        ],
      },
      {
        name: '설문관리',
        items: [{ screenId: 'survey', label: '설문관리' }],
      },
      {
        name: '출결/자습/독서실',
        items: [
          { screenId: 'attendance', label: '출결 관리', added: true, note: '키오스크 직접 연동. F-4.3' },
          { screenId: 'student-absence', label: '사유 신청 관리', added: true, note: 'F-4.1-5' },
          { screenId: 'reading-room', label: '독서실 좌석배치표' },
          { screenId: 'seat-move', label: '좌석 이탈 · 복귀', added: true, note: '키오스크 대체 앱 신청. F-4.11-8' },
        ],
      },
      {
        name: '특강관리',
        items: [{ screenId: 'lecture', label: '특강관리', note: '특강출석부 포함' }],
      },
      {
        name: 'D.Lab',
        items: [
          { screenId: 'student-penalty', label: '상벌점 관리' },
          { screenId: 'daily-routine', label: '데일리 루틴', added: true, note: 'F-4.11-1' },
          { screenId: 'learning-plan', label: '주 · 일 학습계획', added: true, note: 'F-4.11-2' },
          { screenId: 'score', label: '성적 관리', added: true, note: '더프리미엄 API 연동. F-4.6' },
          { screenId: 'consult', label: '상담 일지 · 리포트', added: true, note: 'F-4.11-4' },
          { screenId: 'daily-report', label: 'Daily Report', added: true, note: '앱 데이터 원천. F-4.11-6' },
          { screenId: 'qna', label: '질의응답', added: true, note: '대면 운영 · 온라인은 기능만 준비. F-4.11-7' },
        ],
      },
      {
        name: '수납현황',
        items: [{ screenId: 'payment', label: '수납현황' }],
      },
      {
        name: '결제',
        items: [{ screenId: 'payment-gate', label: '결제', note: '카드·가상계좌 등 앱 결제 연동' }],
      },
      {
        name: '앱 관련',
        items: [
          { screenId: 'app-manage', label: '앱과 관련된 기능' },
          { screenId: 'approval', label: '승인 라우팅', added: true, note: '학부모/담임 자동 분기. F-4.11-5' },
        ],
      },
    ],
  },
  {
    id: 'admin',
    name: '관리자',
    icon: 'settings',
    desc: '기초 마스터 · 수납 기준 · 계정 권한 등 운영 설정',
    sections: [
      {
        name: '기초관리',
        items: [
          { screenId: 'admin-basic', label: '과정 관리', tab: 'course_type', icon: 'award' },
          { screenId: 'admin-basic', label: '학과 관리', tab: 'department', icon: 'graduation-cap' },
          { screenId: 'admin-basic', label: '학과계열 관리', tab: 'track', icon: 'git-compare' },
          { screenId: 'admin-basic', label: '그 외 기초 항목', tab: 'class_group', icon: 'sliders-horizontal' },
          { screenId: 'annual-events', label: '연간 행사 마스터', added: true, note: '학습계획 자동 반영. F-4.11-10' },
        ],
      },
      {
        name: '수납관리',
        items: [{ screenId: 'admin-billing', label: '수납관리' }],
      },
      {
        name: '사용자관리',
        items: [{ screenId: 'admin-user', label: '사용자관리' }],
      },
      {
        name: '배정 · 특강 · 실적',
        items: [
          { screenId: 'admin-assign', label: '배정 관리', added: true, note: '사물함·독서실. 기숙사 제외. F-4.10-3' },
          { screenId: 'admin-lecture', label: '특강 기초 설정', added: true, note: 'F-4.10-4' },
          { screenId: 'admin-result', label: '실적 관리', added: true, note: '합격 실적 입력·통계. F-4.10-6' },
        ],
      },
    ],
  },
]

/* ─────────────── 파생 헬퍼 ─────────────── */

/** 메뉴 항목의 링크 경로 */
export const navPath = (item: NavItem): string =>
  item.tab ? `/s/${item.screenId}?tab=${item.tab}` : `/s/${item.screenId}`

export const findNavCat = (id: string): NavCat | undefined => NAV.find((c) => c.id === id)

/** 화면이 걸려 있는 대분류. 같은 화면이 여러 곳에 걸리면 첫 번째를 쓴다 */
export const navCatOfScreen = (screenId: string): NavCat | undefined =>
  NAV.find((c) => c.sections.some((s) => s.items.some((i) => i.screenId === screenId)))

/** 화면이 걸려 있는 중분류 이름 */
export const navSectionOfScreen = (screenId: string): string | undefined => {
  for (const c of NAV) {
    for (const s of c.sections) {
      if (s.items.some((i) => i.screenId === screenId)) return s.name
    }
  }
  return undefined
}

/** 대분류 하위 기능 개수 */
export const navItemCount = (cat: NavCat): number =>
  cat.sections.reduce((n, s) => n + s.items.length, 0)

/** 메뉴에 걸린 고유 화면 id 집합 — 배치 누락 검증용 */
export const navScreenIds = (): string[] => [
  ...new Set(NAV.flatMap((c) => c.sections.flatMap((s) => s.items.map((i) => i.screenId)))),
]
