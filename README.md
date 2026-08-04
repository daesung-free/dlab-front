# DLab 통합관리프로그램 — 프론트엔드

DSA/D.Lab 통합관리프로그램 재구축의 웹 관리자 프론트엔드입니다.
현재 단계는 **화면 IA 확정 + 전체 화면 목업**이며, 백엔드(Java Spring)는 별도 팀이 담당합니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # dist/
npm run typecheck
```

## 공유 · 문서

```bash
npm run docs           # docs/ 2종을 데이터에서 재생성 (이슈가 풀릴 때마다 실행)
npm run build:offline  # dist-offline/ — 웹서버 없이 index.html 더블클릭으로 열림
```

| 문서 | 내용 |
|---|---|
| [docs/BACKEND_HANDOFF.md](docs/BACKEND_HANDOFF.md) | 화면 30개 × API·테이블·오픈이슈 매핑 |
| [docs/ASKS.md](docs/ASKS.md) | 착수 요청 목록 — 누구에게 무엇을 받아야 하는가 |

두 문서 모두 `src/data/menu.ts` · `issues.ts` 에서 **자동 생성**됩니다.
직접 고치지 말고 데이터를 고친 뒤 `npm run docs` 를 다시 돌리세요.

> ⚠ **공개 호스팅 금지.** 오픈이슈 42건에 거래처 협상 상태·계약 종료 시점·인력 구성이
> 그대로 들어 있습니다. 사내 private 저장소 / 사내망으로만 공유하세요.

## 이 저장소가 기준으로 삼는 문서

| 문서 | 이 저장소에서의 역할 |
|---|---|
| `DSA_DLab_요구사항정의서.xlsx` | **화면 구성의 단일 진실 소스.** 대분류 11개 / 화면 30개, 구분·로직·데이터항목·오픈이슈 |
| `DSA_DLab_개발착수_실행가이드.xlsx` | Phase(0~4) 배정, FE 작업 순서(1~8순위) |
| `00~03_admin_*.html` | **디자인 기준.** 색·타이포·레이아웃·컴포넌트를 여기서 이관 |

> ⚠ **중요 전제** — DSA 레거시 소스코드·DB에 접근할 수 없습니다.
> 기존 화면은 *요구사항 검증 근거 + UX 참고자료*일 뿐이며, 코드는 예외 없이 전량 신규입니다.
> 따라서 `요구사항 검증됨`으로 분류된 화면도 구현 공수는 완전 신규와 동일하게 산정해야 합니다.

## 구조

```
src/
  data/
    menu.ts        ← 화면 IA (SSOT). 문서가 갱신되면 여기부터 고친다
    nav.ts         ← 메뉴 트리. 클라이언트 메뉴표(대분류>중분류>기능)에 화면을 배치
    issues.ts      ← 오픈이슈 관리대장 42건
  styles/
    tokens.css     ← 시안 :root 변수 통합 (4개 HTML에 복제돼 있던 것)
    base.css       ← 리셋 + 배지 + 버튼·패널 + 칩 + .layout 2단 그리드
    forms.css      ← 폼 프리미티브 (.frow/.inp/.sel/.ta/.type-pick/.link-box)
  layout/
    AppLayout.tsx  ← 상단탭 + 사이드바 + 본문 셸
    TopNav.tsx     ← 대분류 2개 탭 (학원생 관리 / 관리자)
    SideNav.tsx    ← 홈=요약 / 대분류=중분류별 기능 목록
  components/
    Icon.tsx           ← 시안의 kebab 아이콘명 → lucide-react 매핑
    PageHead.tsx       ← 모든 페이지 공통 헤더 (crumb + 제목 + 액션)
    StudentList.tsx    ← 좌측 재원생 목록 패널
    StudentHeader.tsx  ← 학생 상세 헤더 (아바타 + 원생코드 + 배지)
    Tabs.tsx           ← 패널 내부 탭 / 단독 탭
    ScreenCard.tsx     ← 화면 1건 카드
  pages/
    Home.tsx       ← 메인화면 (전체 화면 구성 IA)
    GroupPage.tsx  ← 대분류별 화면 카드 목록
    ScreenPage.tsx ← 개별 화면 — 목업 있으면 [화면 목업 | 요구사항 명세] 탭
    screens/       ← 화면별 목업
      index.ts             ← screenId → 목업 레지스트리
      ConsultLog.tsx       ← F-4.11-4 상담(일지)
      ScoreReport.tsx      ← F-4.6 성적 리포트
      AdmissionPipeline.tsx ← F-4.2 입학예약 파이프라인
public/design/     ← 기존 정적 HTML 시안 (비교용, 앱에서 링크로 열림)
```

### IA가 두 겹인 이유 — `menu.ts` vs `nav.ts`

요구사항정의서의 화면 분류(4.1~4.11)와 클라이언트가 실제로 쓰는 메뉴 구조가 서로 다릅니다.
하나로 합치려다 보면 둘 중 하나가 반드시 망가지므로, **역할을 나눠 두 겹으로 둡니다.**

| | `data/menu.ts` | `data/nav.ts` |
|---|---|---|
| 기준 | 요구사항정의서 (SSOT) | 클라이언트 메뉴표 |
| 담는 것 | F-4.x 코드 · Phase · 구분 · 오픈이슈 · 테이블 | 대분류 > 중분류 > 기능 배치 |
| 쓰는 곳 | `docs/` 자동 생성, `/spec` 명세 뷰 | 상단탭 · 사이드바 · 대분류 허브 |
| 바꾸면 | 백엔드 핸드오프 문서가 바뀐다 | 메뉴 위치만 바뀐다 |

**화면을 새로 만들 때 등록 순서**

1. `data/menu.ts` — `SCREENS` 에 추가 (SSOT)
2. `pages/screens/` — 목업 컴포넌트 작성 후 `index.ts` 의 `MOCKUPS` 에 등록
3. `data/nav.ts` — 어느 중분류에 걸지 배치
4. `npm run docs` — 문서 3종 재생성

요구사항정의서에 없고 클라이언트 메뉴표에만 있는 화면은 코드를 `F-C-n` 으로 부여해
원본(`F-4.x`)과 구분합니다. 메뉴에서 노란 점(`nwdot`)이 붙은 항목은 반대로,
클라이언트 메뉴표에 없던 기획 신규 도메인을 그 자리에 편입한 것입니다.

## 디자인 시스템 (시안 3개 이관으로 확정)

시안 HTML 3개를 React로 옮기면서 중복을 걷어내고 공유 자산으로 정리했습니다.
**새 화면을 만들 때 아래를 먼저 찾아 쓰고, 없을 때만 새로 만듭니다.**

| 자산 | 위치 | 어디서 왔나 |
|---|---|---|
| 색·타이포·라운드·그림자 | `styles/tokens.css` | 4개 시안의 `:root` 통합 |
| Phase/구분 배지, 버튼, 패널, 칩 | `styles/base.css` | 시안 전역 |
| 2단 목록+상세 그리드 `.layout` | `styles/base.css` | 상담·성적 공통 |
| 폼 프리미티브 | `styles/forms.css` | 상담 `.frow` 계열 |
| 페이지 헤더 | `PageHead` | 시안 `.topbar` + `.m-head` |
| 재원생 목록 | `StudentList` | 상담·성적에 **동일 마크업 중복** |
| 학생 상세 헤더 | `StudentHeader` | 상담·성적에 **동일 마크업 중복** |
| 탭 | `Tabs` | 상담 `.tabs` |

화면 고유 스타일은 `.p-consult` / `.p-score` / `.p-admission` 으로 스코프를 걸었습니다.
전역 이름 충돌을 막기 위한 것이므로, 새 화면도 `.p-<screenId>` 규칙을 따릅니다.

> 시안의 `.detail-grid`(성적 과목상세)는 공통 `.detail-grid`(명세 2단)와 이름이 겹쳐
> `.subj-grid`로 바꿨습니다. 시안 `.body`도 `.panel-body`로 바꿨습니다.

## 공통 컴포넌트 (FE 1순위)

실행가이드가 Phase 0 / FE 1순위로 지정한 4종입니다 — *"이후 모든 화면의 개발 속도를 좌우"*.
`src/components/common/`에 있고 `import { ... } from '../../components/common'` 로 씁니다.

| 컴포넌트 | 하는 일 |
|---|---|
| `SearchForm` | 다중조건 검색 패널. `text / select / dateRange / chips` 필드, **검색조건 저장**(F-4.1-1 신규 요구사항) |
| `DataTable` | 목록 그리드. 정렬·페이징·체크박스 일괄선택, **컬럼 단위 마스킹** |
| `ExcelButton` | CSV 다운로드. `CopyButton` / `PrintButton` / `MaskToggle` 동봉 (교무업무 Copy·Excel·Print) |
| `DateRange` | 기간 선택 + 빠른 선택 칩(오늘·최근 7일·이번 달·지난 달) |

```tsx
const COLUMNS: Column<Student>[] = [
  { key: 'studentNo', header: '학번', sortable: true, value: (r) => r.studentNo },
  { key: 'phone', header: '전화번호', mask: 'phone', value: (r) => r.phone },  // ← 마스킹 대상
]

<SearchForm fields={FIELDS} onSearch={setQuery} presetKey="student-search" />
<DataTable columns={COLUMNS} rows={rows} rowKey={(r) => r.id} selectable
           toolbar={<ExcelButton filename="재원생_명부" columns={COLUMNS} rows={rows} />} />
```

### 개인정보 마스킹

크로스커팅 3.2 *"엑셀 다운로드 마스킹 기본 ON(010-\*\*\*\*-1234)"* 을 컴포넌트에 내장했습니다.

- 컬럼에 `mask: 'phone' | 'name' | 'birth' | 'address' | 'email'` 만 붙이면
  **화면 표시와 엑셀 Export가 같은 규칙으로** 가려집니다 (`DataTable`과 `ExcelButton`이 `displayCell`을 공유).
- `masked` 기본값이 `true`라 **끄는 걸 잊는 사고는 나도 켜는 걸 잊는 사고는 안 납니다.**
- ⚠ 화면단 마스킹은 표시용 방어선일 뿐입니다. 실제 차단은 BE의 RBAC 필드 권한이 담당하며
  (`전화·주소·생년월일은 BRANCH_ADMIN 이상`), 해제 권한도 서버 응답이 결정합니다.

### BE 연동 시 교체될 부분

- `lib/csv.ts` — 지금은 FE에서 CSV를 만듭니다. BE에 엑셀 Export 프레임워크가 생기면
  서버가 xlsx를 만들어 내려주고 FE는 링크만 여는 형태로 바뀝니다.
- `SearchForm`의 `presetKey` — 검색조건을 localStorage에 저장합니다. 사용자별 저장 API가 생기면 교체.
- `screens/mockStudents.ts` — 목업 데이터. 통째로 교체될 자리입니다.

## 목업 추가하는 법

```tsx
// src/pages/screens/MyScreen.tsx
export const myMockup: Mockup = {
  Content,                       // 본문만. 헤더·탭은 ScreenPage가 그린다
  actions: <button className="btn pri">저장</button>,  // 헤더 우측 버튼
}

// src/pages/screens/index.ts
export const MOCKUPS = { ..., 'my-screen-id': myMockup }
```

레지스트리에 등록하면 `/s/<id>`에 [화면 목업 | 요구사항 명세] 탭이 자동으로 붙습니다.
등록 전에는 명세 스텁이 그대로 보이므로, 목업이 없는 화면도 링크는 항상 살아 있습니다.

## 라우트

| 경로 | 화면 |
|---|---|
| `/` | 메인 — 대분류 11개 / 화면 30개 전체 구성 |
| `/g/:groupId` | 대분류별 화면 카드 (구분·Phase·로직·데이터·이슈) |
| `/s/:screenId` | 개별 화면 — 목업 자리 + 요구사항 명세 |

## 목업 진행 현황 — **30 / 30 완료**

요구사항정의서 1시트의 화면 30개 전부에 목업이 있습니다.
스모크 테스트가 커버리지를 검사하므로, 화면이 추가되면 목업 없이는 테스트가 실패합니다.

| Phase | 화면 | 비고 |
|---|---|---|
| 1 | F-4.1-1 학원생 검색·조회 | 공통 컴포넌트 4종 최초 실사용 |
| 1 | F-4.1-2 상벌점 관리 | 수기 일괄부여만 동작. 자동 규칙은 I-5 대기 |
| 1 | F-4.1-3 신규 접수 등록 | 학번 채번 미리보기 |
| 1 | F-4.1-4 반 배정(고정반) | 전년도 복사 의존순서 표기 |
| 1 | F-4.1-5 사유 신청 관리 | 승인 라우팅 — Phase 3 F-4.11-5의 선행 구현 |
| 1 | F-4.2 대기자 관리 | 입학예약 파이프라인 (시안 이관) |
| 1 | F-4.3 출결 관리 | 상태 5종. D-2 미확정이라 목업 payload 기준 |
| 1 | F-4.4 문자 → 카카오톡 발송 | 채널 3종 + 템플릿. E-5 심사 대기 |
| 1 | F-4.10-1 기초 관리 | 마스터 9종 + 복사 의존 그래프 |
| 1 | F-4.11-9 신상기록부 | **폼 없음** — I-17 양식 확정 대기 |
| 2 | F-4.5 급식 관리 | MealPolicy 달력 · 결제/취소 2트랙 · 상태 전이 |
| 2 | F-4.7 특강 관리 | 목록·신청명단·대기자·출석부 |
| 2 | F-4.8 수납현황 | **레이아웃만** — D-3/D-5/D-9 우회 불가 |
| 2 | F-4.9 교무업무 명단 | **'구분' 컬럼 비움** — I-1 우회 불가 |
| 2 | F-4.10-3 배정 관리 | 기숙사·사물함·독서실 배치도 |
| 2 | F-4.10-4 특강 기초 설정 | 특강 마스터 + 설명회 |
| 2 | F-4.10-5 청구기준 관리 | 청구·환불 기준. D-9 상충 표시 |
| 2 | F-4.10-6 실적 관리 | 계열 5분류 표준(I-22) 집계 |
| 2 | F-4.11-8 좌석 이탈/복귀 | 실시간 좌석표 · 순찰기록 재정의 |
| 3 | F-4.6 성적 관리 | 시안 이관 |
| 3 | F-4.6-부속 설문 관리 | 가채점·템플릿. **블로커 없음** |
| 3 | F-4.11-1 데일리 루틴 | 결과 입력까지. 자동 상벌점은 I-5 대기 |
| 3 | F-4.11-2 주·일 학습 계획 | **FE 최대 공수.** 0723 항목 9개 반영 |
| 3 | F-4.11-3 메시지 관리 | 공지만 가능. 채팅은 E-6 대기 |
| 3 | F-4.11-4 상담(일지) | 시안 이관 |
| 3 | F-4.11-5 승인 라우팅 | 항목 × 주체 매트릭스. I-12 미결 2건 표시 |
| 3 | F-4.11-6 Daily Report 집계 | 원시로그 집계만. I-6 대기 |
| 3 | F-4.11-7 대면QnA·영단어 | 의존성 최저 |
| 3 | F-4.11-10 연간 행사 마스터 | 학습계획·급식이 참조 |
| 0 | F-4.10-2 사용자 관리 | RBAC 5단계 + 권한 매트릭스 초안 |

### 화면별 공수 실측 (파일 크기)

| 화면 | 크기 |
|---|---|
| **F-4.11-2 학습계획** | **24.4KB** |
| F-4.5 급식 관리 | 15.1KB |
| F-4.11-4 상담일지 | 13.6KB |
| (Phase 2 평균) | 약 10KB |

학습계획 하나가 2위의 1.6배입니다. 공통 컴포넌트(`DataTable`/`SearchForm`)를 **하나도
재사용하지 못한 유일한 화면**이라, 실행가이드가 별도 버퍼를 지정한 판단이 맞았습니다.

### 미확정 이슈를 화면에 드러냈습니다

실행가이드 3.4가 경고하는 실패 패턴 — *"미확정 항목이 시간이 지나며 조용히 '해결된 것처럼' 방치되는 것"* —
을 막으려고, 화면을 막고 있는 오픈이슈를 해당 화면 상단에 **`.blocked-note`** 로 항상 띄웁니다.
이슈 번호·우선순위·확인 대상·우회 방식까지 적혀 있어서, 화면을 여는 사람이 무엇이 확정되어야 하는지 바로 봅니다.

특히 **신상기록부(F-4.11-9)는 입력 폼을 일부러 만들지 않았습니다.** I-17(양식 4종·학년별 분기·PDF)이
최우선 미해결이라 항목을 지어내면 재작업이 확정적입니다. 양식과 무관하게 확정 가능한
*작성 현황 관리*만 만들고, 폼 자리는 잠금 상태로 뒀습니다.

## 화면 목업 진행 방식

`ScreenPage`는 지금 요구사항 명세를 보여주는 스텁입니다.
화면을 구현할 때 `src/pages/screens/<screenId>.tsx`를 만들고 `ScreenPage`에서 분기하면
IA·명세는 그대로 둔 채 목업만 갈아끼울 수 있습니다.

FE 작업 순서는 실행가이드 2시트를 따릅니다 (카드의 `FE n순위` 배지).
공통 컴포넌트 → 학생/상벌점/대기자/출결/문자발송 → 급식/수납/교무/특강/관리자 →
성적/설문/데일리루틴 → **학습계획** → 상담 → 메시지 → 대면QnA/영단어.

> 학습계획(F-4.11-2)은 이 프로젝트에서 가장 이질적이고 공수가 큰 단일 화면입니다.
> 실행가이드가 별도 일정 버퍼를 요구하고 있으므로 **일찍 손대지 않습니다** —
> 공통 컴포넌트가 그 화면에 맞춰 왜곡될 위험이 있습니다.

## 알려진 사항

- `react-router` GHSA-qwww-vcr4-c8h2 (high) — **RSC 모드 CSRF** 이슈입니다.
  이 앱은 RSC·server action을 쓰지 않는 순수 CSR SPA라 해당하지 않습니다.
  `npm audit fix --force`는 7.11.0으로 breaking 다운그레이드를 시도하므로 적용하지 않았습니다.
- 디자인 가이드(오픈이슈 #29 / I-9)는 아직 미수령입니다. 현재 토큰은 기존 HTML 시안 값이며,
  가이드 수령 시 `src/styles/tokens.css`만 교체하면 전체에 반영됩니다.
