# CLAUDE.md — 이 레포에서 작업할 때

DSA/D.Lab 통합관리 **웹 관리자 프론트엔드**. 백엔드(`dlab-api`, Java Spring)는 별도 팀이다.
실행·빌드 명령은 `README.md`, 로컬 연동 환경은 `docs/LOCAL_DEV.md`를 본다.

---

## 1. 목업을 함부로 바꾸지 않는다 ★

`src/pages/screens/*.tsx` 36개는 **요구사항정의서 기준으로 확정된 화면**이다. 클라이언트 확인을
거친 것이라 **목업이 정본이고, 못 맞추는 쪽은 API다.**

- API가 값을 안 준다고 해서 **컬럼·검색조건을 지우지 말 것.**
  → `docs/API_GAPS.md`에 적고 백엔드에 요청한다. (실제로 이 방식으로 대부분 채워졌다)
- 화면 구성을 바꿔야겠다는 판단이 서면 **먼저 물어본다.** 목업 수정은 승인 사항이다.
- 화면 IA(`src/data/menu.ts`)는 요구사항정의서가 SSOT다. 임의로 화면을 추가·삭제하지 않는다.

## 2. 자동 생성 문서를 직접 고치지 않는다

| 파일 | 출처 |
|---|---|
| `docs/BACKEND_HANDOFF.md` · `ASKS.md` · `ASSUMPTIONS.md` | `src/data/menu.ts`·`issues.ts`·`assumptions.ts` → `npm run docs` |
| `docs/API_GAPS.md` · `LOCAL_DEV.md` · `CONNECT_PLAN.md` | **수기 작성.** 여기에 적는다 |

생성물에 적으면 다음 `npm run docs`에서 날아간다.

## 3. API 연동 규약

`src/api/`가 유일한 통신 경로다. 화면에서 `fetch`를 직접 쓰지 않는다.

```
client.ts   request / requestPaged — 401 재발급, 에러 정규화, 목록 응답 2형태 흡수
tokens.ts   토큰 보관(localStorage) + 변경 구독
auth.ts     로그인·로그아웃, JWT payload 해석
students.ts 도메인별 모듈은 이 파일을 본떠 만든다
schema.d.ts npm run api:types 로 생성. 직접 수정 금지
```

서버 계약에서 **모르면 반드시 틀리는 것 5가지**:

1. **지점 스코프** — 대부분의 목록은 `academyId`를 받고, **전 지점 권한(SUPER_ADMIN) 계정은
   안 보내면 400**이다. 지점 관리자는 안 보내면 자기 지점이고, 남의 지점을 보내면 403이다.
   단 `/students`만은 `academyId`를 안 받고 응답의 `academyName`으로 구분한다.
2. **마스킹** — 응답의 `masked: true`면 `phone`·`birthDate`가 **서버에서 이미 가려져 온다**
   (`2007-**-**`). 프론트에서 또 가리면 이중 마스킹이다. `MaskToggle`은 이 값을 보고 동작해야 한다.
3. **정렬** — 허용 키만 먹고 **그 밖의 값은 400이 아니라 조용히 무시**된다. 학생 검색은
   `studentNo, name, grade, track, enrollmentStatus, admissionDate` 6개
   (`src/api/students.ts`의 `SORTABLE`). **허용 목록에 없는 컬럼에는 정렬 UI를 붙이지 않는다.**
   다중 정렬은 `?sort=a,asc&sort=b,asc` — `request`의 `repeatable` 옵션을 쓴다.
4. **페이징** — `page`는 **0-based**(Spring Data 규약). 변환하면 오프바이원이 조용히 생긴다.
5. **`month` 파라미터** — 전 엔드포인트 `yyyy-MM`.

## 4. 화면 연동 현황

**실연동된 화면은 학원생 검색(F-4.1-1) 하나뿐이다.** 나머지 35개는 아직 목업이다.

화면별 연동 순서와 담당은 `docs/CONNECT_PLAN.md`에 있다. **작업 시작 전에 거기에 담당을 적는다.**

### 목록 화면을 새로 붙일 때

`src/pages/screens/StudentSearch.tsx`를 본뜬다. 목록 화면에 필요한 게 전부 들어 있다.

```tsx
// 1. 검색조건 → 서버 파라미터.  ★ useMemo 필수 — 매 렌더 새 객체면 무한 요청이 된다
const params = useMemo(() => ({ keyword: one(query.keyword), academyId }), [query, academyId])

// 2. 호출·페이징·정렬·로딩·에러를 한 번에
const table = useServerTable({ fetcher: searchStudents, params, sortable: SORTABLE })

// 3. 표에 그대로 넘긴다
<DataTable rows={table.rows} serverPaging={table.serverPaging} loading={table.loading} … />
```

직접 `useEffect`로 짜지 않는다. 취소 처리(느린 응답이 최신 결과를 덮어쓰는 것)와
조건 변경 시 1페이지 복귀를 빠뜨리게 된다.

**지점은 `useAcademy()`의 `academyId`를 파라미터로 넘긴다.** 안 넘기면 전 지점 권한 계정이
400을 받아 화면이 빈 것처럼 보인다. 아직 못 고른 상태(`null`)면 `enabled: false`로 호출을 막는다.
단 `/students`만은 `academyId`를 받지 않는다(3-1 참고).

**API가 아예 없어 목업으로 두는 화면 6개** — 붙일 엔드포인트를 찾지 말 것:
대기자 관리(F-4.2) · 신상기록부(F-4.11-9) · 실적 관리(F-4.10-6) ·
Daily Report 집계(F-4.11-6) · 금일 수정 이력(F-C-1) · 결제 관리(F-C-5)

나머지 화면의 필드 부족 현황은 `docs/API_GAPS.md` 2부에 화면별로 정리돼 있다.
**연동 작업 전에 그 화면 항목을 먼저 읽는다.**

## 5. 백엔드가 안 주는 걸 발견하면

화면을 깎지 말고 `docs/API_GAPS.md`에 적는다. 적을 때 지킬 것:

- **실제로 호출해서 확인한 것만 적는다.** 추측은 "미확인"으로 표시한다.
- 요청 URL과 응답 본문을 그대로 붙인다. 백엔드가 재현할 수 있어야 한다.
- 스펙(`/v3/api-docs`)과 실제 응답이 다를 수 있다 — **실제 응답을 믿는다.**

로컬 백엔드 기동과 시드 계정은 `docs/LOCAL_DEV.md`. 계정 2개(`admin` 전 지점 / `branch` 분당)를
쓰는 이유가 위 1번(지점 스코프)이다.

## 6. 코드 스타일

- 주석은 **왜**를 적는다. 무엇을 하는지는 코드가 말한다.
  특히 "이렇게 안 하면 무엇이 조용히 깨지는지"를 남긴다 — 이 레포 기존 주석이 그 톤이다.
- 공통 컴포넌트(`src/components/common/`)를 고칠 때는 36개 화면이 전부 쓴다는 걸 전제한다.
  기존 사용처가 깨지지 않도록 **옵션은 추가로**, 기본 동작은 그대로 둔다.
