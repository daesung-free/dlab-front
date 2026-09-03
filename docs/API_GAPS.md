# BE 변경 요청 목록 — 화면이 필요한데 API가 안 주는 것

> ⚠️ 이 파일은 **수기 작성**이다. `ASKS.md`·`ASSUMPTIONS.md`·`BACKEND_HANDOFF.md`는
> `npm run docs`로 재생성되므로 이 내용을 그쪽에 적으면 다음 생성 때 날아간다.
>
> **모아서 한 번에 요청한다.** 화면을 API에 맞춰 깎지 않는다 — 목업이 정본이고, 부족한 쪽은 API다.

> **2026-09-01 2차 갱신** — 백엔드가 1부를 **전부** 정리했고(커밋 `b94b611`~`0b64573`),
> 재기동 후 직접 호출해 확인했다. 2부도 학생·반명단·급식·학습계획이 해결됐다.
> 각 항목 머리의 `✅ 해결됨`이 검증 완료 표시다.
>
> **프론트 필수 조치**: 스키마 이름 28종이 바뀌었으므로 `npm run api:types` **재실행**(완료).

## 한 장 요약

- 화면 **36개** vs 관리자 API **248개**(GET 90개)를 1:1로 대조했다.
- **API가 아예 없는 화면 6개**(도메인 신설 필요 — 여기가 남은 최대 덩어리).
  필드가 모자란 화면은 24개 → **19개**로 줄었다.
  컬럼까지 대조해 그대로 붙는 것이 확인된 화면 2개 + 5개 해결, 나머지 4개는 커스텀 레이아웃이라 미확인.
- 전 화면에 걸린 공통 문제 **5건 전부 해결**(1-1 지점 지정 · 1-2 스키마 충돌 · 1-3 정렬 ·
  1-4 month 통일 · 1-5 타입 오류 400). 목록 응답 형태(1-6)도 `data + meta`로 통일됐다.
- 2부에서 **학생 검색·반 명단·급식 주문·학습 계획**이 해결됐다. 남은 것은 아래 2-1(도메인 신설 6개)과
  2-2의 나머지다.

---

## 검증 방법

로컬에서 **실제로 호출해 확인한 것만** 적는다. 추측은 "미확인"으로 표시한다.

- 대상: `dlab-api` 로컬 `:8080` (`spring.profiles.active=local`), 확인일 **2026-09-01**
- 계정 2개로 각각 확인 — 권한에 따라 결과가 갈리기 때문이다
  - `admin` = SUPER_ADMIN (전 지점)
  - `branch` = BRANCH_ADMIN (분당)
- 방법: GET 90개 전량 호출 + 응답 본문 대조. 재현 환경은 `docs/LOCAL_DEV.md`.

---

# 1부. 전 화면 공통 (먼저 정해야 하는 것)

## 1-1. ✅ 해결됨 — 최상위 관리자가 차단되던 문제

> **검증 (2026-09-01, 커밋 `79a51d0`)**
> ```
> GET /attendance?date=2026-09-01&academyId=8   (admin/SUPER_ADMIN)  → 200, rows 20건
> GET /attendance?date=2026-09-01               (academyId 없음)     → 400 "지점을 지정해야 합니다"
> ```
> 차단됐던 8개(`attendance`, `penalties`, `penalties/items`, `absence-requests`,
> `consults`, `consults/status`, `consults/tags`, `student-signups`) **전부 정상 동작 확인**.
>
> 지점 관리자 쪽 방어도 같이 확인했다 — `branch`(분당) 계정이 `academyId=1`(이매)을 보내면
> `OTHER_BRANCH_ACCESS_DENIED`로 막히고, 안 보내면 자기 지점이 나온다. **의도대로다.**
>
> 프론트 규칙: **전 지점 권한 계정은 지점 선택 UI가 필수다.** 안 고르면 화면이 400으로 비어 보인다.

<details><summary>원래 보고 내용</summary>

### (해결 전) 최상위 관리자가 차단된다 — 지점을 고를 수단이 없다

전 지점 권한(SUPER_ADMIN)으로 호출하면 **8개 엔드포인트가 에러**를 낸다.

```
GET /api/v1/admin/attendance?date=2026-09-01
→ {"success":false,"error":{"code":"INVALID_REQUEST","message":"지점을 지정해야 합니다."}}
```

| 차단되는 엔드포인트 | 걸리는 화면 |
|---|---|
| `/attendance`, `/attendance/export` | 출결 관리 |
| `/penalties`, `/penalties/items` | 상벌점 관리 |
| `/absence-requests` | 사유 신청 관리 |
| `/consults`, `/consults/status`, `/consults/tags` | 상담 |
| `/student-signups` | 가입 승인 |

원인은 서버 코드에 명시적으로 있다 (`AttendanceBoardService.academyOf`, `AdminPenaltyController` 등):

```java
Long academyId = me.academyScopeFilter();
if (academyId == null) {   // null = 전 지점 권한
    throw new BusinessException(ErrorCode.INVALID_REQUEST, "지점을 지정해야 합니다.");
}
```

**모순이다.** "전 지점을 볼 수 있는 권한"이 곧 "지점을 지정할 수 없는 상태"가 되어,
권한이 가장 높은 계정이 이 화면들을 **아예 못 연다**. BRANCH_ADMIN(`branch` 계정)으로는 전부 정상 동작한다.

반면 `/students`는 같은 상황에서 전 지점을 잘 내려준다. **엔드포인트마다 규칙이 다르다.**

> 요청: 이 8개에 `academyId` 쿼리 파라미터를 열고, **전 지점 권한자일 때만** 허용할 것.
> (지점 권한자가 보내면 무시하거나 403 — 지금 `/students`의 `SearchScope` 방어는 그대로 유지)

</details>

## 1-2. ✅ 해결됨 — OpenAPI 스펙이 실제와 다르던 문제

> **검증 (커밋 `b94b611`)** — 21개 엔드포인트가 가리키던 잘못된 타입이 정리됐다.
> ```
> POST /api/v1/admin/classes  requestBody → #/components/schemas/ClassCreate   (전: 방화벽 스키마)
> /attendance 응답 → AttendanceRowResponse (전: 상벌점 RowResponse)
> ```
> 충돌 원인이던 일반 이름(`Create`, `Item`, `Detail`, `Row`, `RowResponse`, `ItemResponse`)이
> **스펙에서 전부 사라졌다**. 스키마 478종.
>
> `npm run api:types` 재생성 완료 — `src/api/schema.d.ts`. 생성된 타입이 실제 응답과 일치하는 것을
> `StudentResponse`·`AttendanceRowResponse`로 확인했다.

<details><summary>원래 보고 내용</summary>

### (해결 전) OpenAPI 스펙의 응답이 실제와 다르다

`/v3/api-docs`가 **틀린 스키마**를 준다. 중첩 record 이름이 겹치는데 springdoc이 하나로 합쳐버린다.

실제 확인 (BRANCH_ADMIN으로 호출):

| 엔드포인트 | 스펙이 말하는 필드 | **실제 응답 필드** |
|---|---|---|
| `/attendance` | `occurredAt, category, itemName, point, grantedBy` (상벌점 필드) | `enrollmentId, studentNo, name, className, seatCd, checkInAt, checkOutAt, status, excused, studyMinutes, studyTime, guardianPhone, unexcusedLate` |
| `/absence-requests` | 위와 동일 (상벌점 필드) | `id, approvalRequestId, submittedAt, studentNo, name, className, type, period, reason, approverType, status, escalationCandidate` |
| `/meals/orders` | 위와 동일 (상벌점 필드) | `id, mealDate, mealType, canceledAt, cancelPath` |
| `/routines` | 특강(`lectureType, capacity, fee`) 필드 | 루틴 필드 |

겹치는 이름이 **25개 이상**이다 (`Create` 7회, `Item` 5회, `Detail`·`Update` 4회, `RowResponse`·`Submit` 3회 …).

**영향**
- `npm run api:types`로 만든 타입이 **조용히 틀린다.** 컴파일은 통과하고 런타임에 `undefined`가 된다.
- Swagger UI의 요청/응답 예시도 같은 이유로 틀리다. 지금은 **문서를 믿을 수 없어 매번 실제 호출로 확인해야 한다.**

> 요청: 중첩 record에 `@Schema(name = "AttendanceRowResponse")`처럼 고유 이름을 주거나,
> springdoc이 바깥 클래스명을 접두어로 붙이도록 설정할 것. 프론트 타입 생성의 전제 조건이다.

</details>

## 1-3. ✅ 해결됨 — 정렬이 조용히 무시되던 문제

> **검증 (2026-09-01, 커밋 `f24f18f`)**
> ```
> ?sort=name,asc               → 강민주, 강민주, 강서연, 강서연
> ?sort=name,desc              → 한하윤, 한수빈, 한민주, 최현준
> ?sort=grade,asc&sort=name,asc → HIGH2 묶음 안에서 이름순 (다중 정렬 동작)
> ?sort=admissionDate,desc     → 반영됨
> ```
> 허용 필드: **`studentNo` · `name` · `grade` · `track` · `enrollmentStatus` · `admissionDate`**
> (`name`은 `student.name`으로 보내도 된다). 마지막에 학번을 tie-breaker로 붙여 페이징이 흔들리지 않는다.
>
> ⚠️ **남은 것 2가지 — 프론트가 알아야 한다**
> - **반(`className`) 정렬은 아직 안 된다.** 목업의 '반' 정렬 컬럼은 켜면 안 된다.
> - **허용 밖 필드는 400이 아니라 조용히 무시**되고 기본 정렬(학번)로 떨어진다
>   (`?sort=nonsense,asc` → 200). 백엔드가 의도한 동작이지만, 오타 하나가 화면에서는
>   "정렬이 안 걸리는" 증상으로만 보인다. **프론트는 위 6개 목록을 코드에 고정해두고
>   그 밖의 컬럼에는 정렬 UI를 붙이지 않는다.**

<details><summary>원래 보고 내용</summary>

### (해결 전) 정렬이 조용히 무시된다

```
GET /api/v1/admin/students?size=3&sort=id,desc   → [2, 3, 1]
GET /api/v1/admin/students?size=3&sort=id,asc    → [2, 3, 1]   (같음)
```

- 원인: `StudentSearchRepository`가 `.orderBy(e.studentNo.asc())`로 고정하고 `pageable.getSort()`를 안 쓴다.
- 컨트롤러가 `Pageable`을 받으니 **에러 없이 200이 온다.** 화면에서는 원인이 안 보인다.
- 목록 화면의 정렬 가능 컬럼이 전부 무력화된다. 한 페이지(20건)만 클라이언트에서 정렬하면
  전체가 정렬된 것처럼 보이지만 아니므로, **서버 정렬 전까지 프론트는 정렬 UI를 켜지 않는다.**

> 요청: `pageable.getSort()` 반영. 어렵다면 지원 정렬키를 정하고 **그 외에는 400**을 낼 것.
> 조용히 무시하는 것이 가장 나쁘다.

</details>

## 1-4. ✅ 해결됨 — `month` 형식 불일치

> **검증 (커밋 `e008ba9`)** — 전 엔드포인트가 `yyyy-MM`으로 통일됐다.
> ```
> /meals/monthly?month=2026-09      → 200
> /routines?month=2026-09           → 200   (전: 400, 정수만 받았다)
> /schedules?month=2026-09          → 200
> /tuition/fee-table?month=2026-09  → 200
> ```

같은 이름인데 형식이 갈리고, 틀리면 **500**이 난다.

| 엔드포인트 | 형식 | 반대로 넣으면 |
|---|---|---|
| `/meals/monthly`, `/meals/closures` | `2026-09` (YYYY-MM) | 500 |
| `/routines`, `/schedules`, `/tuition/fee-table` | `9` (1~12 정수) | 500 |

> 요청: 하나로 통일. `YYYY-MM` 문자열을 권한다 — 연도를 따로 안 보내도 되고 오해가 없다.

## 1-5. ✅ 해결됨 — 타입 오류 400

> **검증 (2026-09-01, 커밋 `aef8a5b`)**
> ```
> ?year=abc   → 400 "파라미터 'year' 값이 올바르지 않습니다: abc"
> ?grade=XXX  → 400 "파라미터 'grade' 값이 올바르지 않습니다: XXX (허용값: HIGH2, HIGH3, N_SU, STAFF)"
> ```
> enum 허용값이 응답에 실려서 프론트가 원인을 바로 안다. **여기까지는 해결.**
>
> ✅ **추가로 보고했던 500 잔존 경로도 해결됐다** (커밋 `ff5cb76`)
> ```
> GET /meals/monthly?academyId=8&month=9
>   → 400 "파라미터 'month' 값이 올바르지 않습니다: 9"   (전: 500 INTERNAL_ERROR)
> ```
> <details><summary>원래 보고 내용</summary>
>
> ```
> GET /meals/monthly?academyId=8&month=9   → 500 INTERNAL_ERROR
> ```
> ```
> java.time.format.DateTimeParseException: Text '9' could not be parsed at index 0
>   at AdminMealController.monthly(AdminMealController.java:60)
> ```
> 원인: 이 컨트롤러는 `month`를 **String으로 받아 메서드 안에서 `YearMonth.parse()`** 한다.
> 새 핸들러는 스프링 바인딩 단계의 `MethodArgumentTypeMismatchException`을 잡는데,
> 이건 바인딩을 통과한 뒤 메서드 본문에서 터지므로 안 걸린다.
> 같은 패턴이 `AdminMealController` 4곳(60·72·126·144행), `AppDailyReportController` 1곳(66행)에 있다.
>
> > 요청: `YearMonth`를 파라미터 타입으로 직접 받거나(`@DateTimeFormat`),
> > `DateTimeParseException`도 400으로 잡을 것.
> </details>

<details><summary>원래 보고 내용</summary>

### (해결 전) 잘못된 타입의 파라미터가 400이 아니라 500이다

```
GET /api/v1/admin/students?year=abc   → 500 INTERNAL_ERROR "서버 오류가 발생했습니다."
```

`MethodArgumentTypeMismatchException`이 `GlobalExceptionHandler`에 없어 그대로 500이 된다.

- 프론트 입장에서 **내 요청이 잘못된 건지 서버가 죽은 건지 구분할 수 없다.** 재시도 여부 판단이 안 된다.
- 운영에서 잘못된 링크·오래된 북마크 하나가 500 알람을 만든다.

> 요청: 타입 불일치는 400 + 어떤 파라미터가 잘못됐는지 메시지에 포함.

</details>

## 1-6. ✅ 통일됨 — 목록 응답 형태

> **검증** — `/students`가 `data + meta` 형태로 바뀌었다.
> ```json
> { "success": true, "data": [ … ], "meta": { "page":0, "size":3, "totalElements":60, "totalPages":20, "hasNext":true } }
> ```
> 프론트 `requestPaged()`는 두 형태를 모두 흡수하도록 만들어둬서 코드 변경 없이 그대로 동작했다.

<details><summary>원래 보고 내용</summary>

### (통일 전) 목록 응답 형태가 두 가지다

```
ApiResponse.from(page)    → { data: [...],                 meta: {page,size,totalElements,...} }
ApiResponse.success(page) → { data: { content:[...], number, totalElements, ... } }   ← /students
```

프론트는 `requestPaged()`에서 둘 다 흡수하도록 만들어뒀다. 다만 새 엔드포인트를 만들 때마다
확인이 필요하므로, 통일하면 양쪽 모두 편해진다.

</details>

---

# 2부. 화면별 대조

## 2-1. API가 아예 없는 화면 (6개) ★

붙일 엔드포인트 자체가 없다. 목업만 있고 서버에 대응 도메인이 없다.

| 화면 | 코드 | 화면이 필요한 것 | 그나마 가까운 것 |
|---|---|---|---|
| 대기자 관리 | F-4.2 | 입학예약 파이프라인(단계·전환·이력) | 없음. `student-signups`는 앱 가입 승인이라 다른 것 |
| 신상기록부 | F-4.11-9 | 폼 정의·작성 현황·제출 내용 | `consults/status.profileWritten` (작성 여부 boolean 하나뿐) |
| 실적 관리 | F-4.10-6 | 합격 대학·학과·전형·등록확정 | 없음 |
| Daily Report 집계 | F-4.11-6 | 학생별 순공/재실/집중도/루틴이행 **집계 + 순위** | `/statistics`(전체 개요), `/learning-plans/.../statistics`(학생 1명) |
| 금일 수정 이력 | F-C-1 | 전 업무영역 감사 로그(수정자·전후값·IP) | `/branch-configs/{id}/history`(지점설정 전용), `/students/{id}/status-logs`(상태변경 전용) |
| 결제 관리 | F-C-5 | PG 거래번호·결제수단·채널 | `/receipt-status`(청구/수납 기준, 거래 단위 아님) |

> ⚠️ 이 6개는 "필드 추가"가 아니라 **도메인 신설**이다. 일정에 별도로 잡아야 한다.
> 특히 감사 로그(F-C-1)는 전 화면의 쓰기 동작에 훅이 필요해 나중에 붙일수록 비싸진다.

## 2-2. 필드가 모자란 화면 (24개 → **19개**)

엔드포인트는 있고, 응답에 화면이 그리는 값이 없다.

### ✅ 해결된 화면 (5개)

| 화면 | 커밋 | 확인 내용 |
|---|---|---|
| F-4.1-1 학원생 검색 | `0b64573` | 응답에 `birthDate, schoolName, academyName, className, homeroomTeacher, seatCd, scholarshipTypes` 추가. 검색조건도 `teacherId`(담임)·`schoolName`(출신학교)·`admittedFrom`/`admittedTo`(등원일 범위) 3종 추가 — **요청한 것이 전부 들어왔다** |
| F-4.9 교무업무 명단 | `0b64573` | 같은 응답을 쓴다. 주소·담임·좌석·장학유형·출신학교가 채워져 16개 컬럼 중 **학부모 연락처·청구기수만 남았다** |
| F-4.1-4 반 배정 / F-4.10-3 배정 관리 | `87c823e` | `Member`에 `grade, track, schoolName, seatCd, academyId, academyName` 추가(전: 3개뿐) |
| F-4.5 급식 관리 | `51e49b3` | `OrderResponse`에 `orderNo, studentNo, studentName, className, amount, paymentMethods, billedAmount, refundableAmount` 추가 |
| F-4.11-2 주·일 학습 계획 | `53f52af` | **`GET /learning-plans` 목록 API 신설.** `completionRate`·`missingDays`까지 온다 — 학생 수만큼 호출하던 문제 해소. 실제 호출로 60명 집계 확인 |

> ⚠️ 학생 응답에 **`masked` 필드**가 새로 생겼다. `true`면 `phone`·`birthDate`가 **서버에서 이미 가려져
> 온다**(`2007-**-**`). 프론트가 또 마스킹하면 이중으로 가려지므로 `MaskToggle`이 이 값을 봐야 한다.

### ❌ 남은 것

#### F-4.1-1 학원생 검색 — `academyId`를 안 받는다 ★★ (우선순위 올림)

다른 목록은 전부 `academyId`를 받는데 **이 엔드포인트만 안 받는다.** 전 지점 권한 계정에는
항상 전 지점이 한 번에 온다.

> **2026-09-02 — 단순 불편이 아니라 기능을 막는 문제로 확인됐다.**
>
> 반 배정 화면에서 미배정 학생을 골라 배정하면 이렇게 된다:
> ```
> GET /students?unassignedClass=true  → 임승민(목동) · 임민주(이매) …   ← 전 지점이 섞여 온다
> POST /classes/4/students/bulk        → 2건 모두 FAILED
>    "다른 지점의 반에는 배정할 수 없습니다."
> ```
> **반은 지점에 속하는데 학생 목록만 전 지점이라, 본사 계정으로는 배정이 거의 실패한다.**
> 지점 계정(`branch`)으로는 자기 지점만 오므로 정상 동작한다 — 즉 **본사 계정에서만 깨진다.**
>
> 서버가 건별로 막아주는 것은 옳다(조용히 넘어가는 것보다 낫다). 다만 프론트가 애초에
> 배정 가능한 학생만 보여줄 방법이 없다.
>
> **학번 검색도 같은 뿌리다.** 학번 유일성이 `UNIQUE(academy_id, year, student_no)` 라
> **지점 축이 있다** — 같은 해에도 지점이 다르면 같은 학번이 존재한다.
> ```
> 2026-0001 → 분당:서도윤 · 이매:임민주 · 목동:임승민   (로컬 시드 실제 데이터)
> ```
> 학번 체계는 이대로가 맞다. 지점별로 따로 매기는 것이 운영 방식이고 바꿀 것이 아니다.
> 문제는 **검색에서 지점을 좁힐 수 없다는 것뿐**이라, 본사 계정으로 학번을 검색하면
> 매번 지점 수만큼 나온다.
>
> 지금 대응: 지점 컬럼을 띄우고, 전 지점 계정에는 "다른 지점 학생이 섞여 있다"는 경고를 보여준다.
>
> **요청: `academyId` 파라미터 하나면 셋 다 풀린다.**
> 1. 반 배정에서 배정 가능한 학생만 보이기
> 2. 학번 검색이 한 명으로 떨어지기
> 3. TopNav 지점 선택과 학생 목록의 스코프가 맞아떨어지기

#### F-4.1-1 학원생 검색 — 재수 구분도 남음

`grade`가 `HIGH2/HIGH3/N_SU`까지라 **N수 안에서 재수·삼수·N수를 못 가른다.**
필드 추가가 아니라 **데이터 모델 결정 사항**이라 그대로 남아 있다.

<details><summary>(해결 전) F-4.1-1 학원생 검색 — <code>GET /students</code></summary>

응답: `enrollmentId, studentId, uniqueCode, studentNo, name, phone, address, year, grade, track, enrollmentStatus, admissionDate`

| 화면 컬럼 | 상태 |
|---|---|
| 출신학교, 생년월일 | **DB엔 있는데 DTO에서만 빠짐** (`student.school_name`, `birth_date`) — 난이도 낮음 |
| 지점 | `academy_id` 있음. 지점**명**까지 필요(전 지점 조회 시 구분 불가) |
| 반, 좌석, 담임 | 조인 필요 |
| 재수 구분(재수/삼수/N수) | `grade`가 `N_SU`까지라 **구분 자체가 없음** — 모델 결정 사항 |

검색조건 12개 중 서버가 받는 것 6개(`keyword, year, grade, track, status, classId`).
없는 것: **담임 · 출신학교 · 등원일 범위**. 지점은 1-1 참고.

교무업무 명단(F-4.9)은 같은 응답을 쓰는데 16개 컬럼 중 학번·성명·계열만 온다.
급식(F-4.5)은 `id, mealDate, mealType, canceledAt, cancelPath`뿐이고,
학습 계획(F-4.11-2)은 학생 1명씩 조회하는 API만 있었다.

</details>

#### 나머지 — 화면 컬럼 대 실제 응답 필드

| 화면 | 엔드포인트 | 빠진 것 |
|---|---|---|
| F-4.1-2 상벌점 | `/penalties` | `className`(반). 검색조건 '재원 상태' 없음. 그 외 일치 |
| F-4.10-2 사용자 관리 | `/staff/employees` | **계정·권한·상태·최근 로그인이 없다.** 직원 인적사항만 준다 — 계정 관리 API가 사실상 없음 |
| F-4.10-1 기초 관리 | `/masters/*` | 코드·비고·사용여부(active) 없음. `name`·`sortOrder`만 |
| F-4.7 특강 | `/lectures` | 담당 강사 없음 |
| F-4.10-4 특강 기초 | `/lectures` | **코드·담당 강사** 없음. '월'은 `startDate`로 대체 가능 |
| F-4.8 수납현황 | `/receipt-status` | **전표번호·지점·결제수단** 없음. 금액·상태는 일치 |
| F-4.10-5 수납 관리 | `/tuition/prices` | 환불 규정(경과 시점·환불 비율) 없음 |
| F-4.4 문자 발송 | `/notification-templates` | 템플릿은 일치. **발송 이력 API가 없다**(화면 하단 표 전체) |
| F-4.11-3 메시지 관리 | `/notices` | **열람 수** 없음. 하단 '요청 관리' 표에 대응하는 API 없음 |
| F-4.11-1 데일리 루틴 | `/routines/{id}/results` | `className`(반)·**이행률**·상벌점 트리거 없음. 루틴 마스터(루틴명·과목·배점)는 별도 확인 필요 |
| F-4.6-부속 설문 | `/surveys` | **응답률** 없음(`questionCount`만). 하단 '템플릿 관리' 표에 대응 API 없음 |
| F-C-4 독서실 좌석배치 | `/seats/layout` | 좌석·배정·재실은 있음. **고정반·이석 위치** 없음 |
| F-4.11-7 질의응답 | `/qna/offline/slots` | 대면 예약만. **온라인 질의응답 없음** |
| F-4.11-10 연간 행사 | `/schedules` | `dayOfWeek, startTime, endTime, title, place` — 화면의 기간·대상·학습계획 연동 없음 |
| F-C-2 학원생 현황 | `/statistics` | 전체 개요만. 화면은 **반별 집계**(정원/재원/휴원/충원율) — 축이 다름 |
| F-C-3 시간표 | `/periods`, `/masters/curriculums` | **이동수업(이동반·강의실·담당) 없음** |
| F-C-6 앱 운영 | `/app-config` | 약관·설정만. **푸시 발송 이력·배너 클릭수 없음** |
| F-4.11-8 좌석 이탈 | `/seats/layout` | 좌석·재실은 있음. **키오스크 단말 관리(펌웨어·최종수신) 없음** — `/branch-configs`에 식별자만 |

## 2-3. 그대로 붙는 화면 (2개)

컬럼을 응답 필드와 하나씩 대조해 **빠진 것이 없음을 확인**했다.

| 화면 | 엔드포인트 | 확인 내용 |
|---|---|---|
| F-4.3 출결 관리 | `/attendance` | 반·좌석·등하원·상태·순공시간·학부모연락처 전부 대응. '알림'은 액션 버튼이라 데이터 아님 |
| F-4.1-5 사유 신청 | `/absence-requests` | 컬럼 9개 전부 대응(`submittedAt, studentNo, name, className, type, period, reason, approverType, status`) |

> 둘 다 전 지점 권한 계정으로 호출하려면 **`academyId`를 함께 보내야 한다**(1-1 해결 내용).
> 지점 선택 UI 없이는 400으로 빈 화면이 된다.

## 2-4. 자동 대조가 안 된 화면 (4개) — 수기 확인 필요

표(`DataTable`) 형태가 아니라 카드·차트·폼 등 커스텀 레이아웃이라 컬럼을 기계적으로 뽑지 못했다.
**"문제 없음"이 아니라 "아직 확인 안 함"이다.**

| 화면 | 후보 엔드포인트 |
|---|---|
| F-4.11-4 상담(일지·리포트) | `/consults`, `/consults/status` — 필드 구성은 좋아 보인다(일지·미상담 현황 모두 있음) |
| F-4.11-5 승인 라우팅 | `/approvals` — 에스컬레이션·타임아웃·인계 필드까지 있음 |
| F-4.6 성적 | `/students/{id}/grades`, `/exam-forms` |
| F-4.1-3 신규 접수 | `POST /students` (학번은 서버 채번) |

# 3부. 프론트가 아직 안 붙인 것 (BE 작업 아님)

"없는 줄 알고" 중복 요청하지 않기 위해 기록해둔다.

- `GET/POST/DELETE /students/saved-searches` — 검색조건 저장. 현재 `SearchForm`이 localStorage에 저장해
  **계정 간 공유가 안 된다.** 교체 대상.
- `GET /students/export`, `/receipt-status/export`, `/attendance/export` — 서버 엑셀.
  현재 `ExcelButton`은 화면에 있는 행만 담으므로 전체 내보내기는 이쪽으로 바꿔야 한다.
- `POST /students/import/preview`, `/import` — 일괄 등록.
- `GET /students/{id}/status-logs` — 상태 변경 이력.
- `/classes` — 반 목록. 여러 화면의 '반' 드롭다운이 이걸로 채워져야 한다(현재 하드코딩).
- `/student-signups` — 앱 가입 승인·OT 완료 처리. **대응 목업 화면이 없다.**
  앱에서 가입한 학생을 관리자가 승인하는 흐름인데 관리 화면이 기획에 없다 — 화면이 필요한지 확인 필요.

---

# 4부. 묶음 A 연동 중 확인된 것 (2026-09-02)

> **2026-09-02 — 6건 전부 해결됐고, 프론트도 반영 완료.** (`#66` 시드 · `#67` API 머지됨)
>
> 검증한 것:
> ```
> ?unassignedClass=true   → 48명   ?unassignedSeat=true → 52명
> ?unassignedLocker=true  → 54명   ?hasScholarship=true → 5명
> ?classId=1&unassignedClass=true → 400 CONFLICTING_SEARCH_CONDITION
> ClassResponse → capacity·memberCount 포함 (고3 1반 3/12 …)
> POST /classes/{id}/students/bulk → 건별 결과 + overCapacity
> DELETE /classes/{id}/students/{enrollmentId} → 200
> ```
> 화면에 붙어 있던 **"(이 페이지 기준)" 표시를 전부 걷어냈다.** 이제 전체 명단이 맞다.
>
> **프론트가 반영해야 할 것**
> | 무엇 | 내용 |
> |---|---|
> | 미배정 조건 | `unassigned=true` 하나가 아니라 **축별로 나뉘었다** — `unassignedClass` · `unassignedSeat` · `unassignedLocker`. 미배정이 반·좌석·사물함 셋이라 하나로는 어느 축인지 못 가린다. Export 에도 열렸다 |
> | 모순 조합 | `classId` + `unassignedClass=true` 는 **400**이다. 빈 목록으로 주면 조건을 잘못 짠 걸 모르고 넘어가므로 의도된 것. 화면에서 두 조건이 동시에 걸리지 않게 할 것 |
> | 정원 초과 | **막지 않는다.** 넘겨야 하는 예외가 실제로 있어서, 응답 `overCapacity` 로 알려준다 — **경고는 화면이 띄운다** |
> | 반 배정 해제 | `DELETE /classes/{classId}/students/{enrollmentId}` — **반 ID가 필요하다.** 한 학생에게 고정반·이동수업반이 동시에 있을 수 있어서다 |
> | 일괄 배정 응답 | **반과 좌석이 다르다.** 반 = 건별 결과(성공/중복/실패 사유), 좌석 = 전부-아니면-전무 + 실패 건 전체 목록. 좌석은 절반만 반영되면 배치가 뒤죽박죽 되기 때문. **화면 처리도 달라야 한다** |
> | 반 목록 정렬 | `name ASC` 인데 콜레이션 때문에 **"빈반"이 "1반"보다 앞에 온다.** 순서를 가정하지 말 것 |
> | 좌석 격자 생성 | `rows`·`columns` 만 주면 서버가 만든다. 통로는 `skips` 로 빼고 번호는 건너뛰고 이어진다 |

교무업무 명단 · 반 배정 · 배정 관리를 붙이면서 실제로 호출해 확인한 것들.

## 4-1. 일괄 배정 API가 없다 ★

화면은 전부 "선택 N명 일괄 배정"인데 서버는 **한 건씩만** 받는다.

| 엔드포인트 | 받는 것 |
|---|---|
| `POST /classes/{classId}/students` | `{ enrollmentId }` 하나 |
| `POST /seats` | `{ seatId, enrollmentId }` 하나 |
| `PUT /masters/lockers/{id}/assignment` | `{ enrollmentId }` 하나 |

- 지금 대응: 순차로 N번 호출하고 **건별 성공/실패를 모아 화면에 표시**한다.
- 문제: 중간에 실패하면 **일부만 배정된 상태로 남는다.** 되돌릴 방법이 없다.
- 요청: 배열을 받는 일괄 배정. 키오스크 `seat-leaves`처럼 건별 결과를 돌려주면 가장 좋다.

## 4-2. "미배정" 조건이 없다 ★

`/students`에 `classId`는 있는데 **"반이 없는 학생"** 을 고르는 조건이 없다.
사물함·좌석도 마찬가지다.

- 걸리는 화면: **반 배정**(미배정 학생 목록이 화면의 본체), 배정 관리
- 지금 대응: 받아온 페이지 안에서 `className`이 빈 학생만 거른다. **전체 미배정 명단이 아니다.**
  화면에 "(이 페이지 기준)"이라고 표시해뒀지만, 실제로 쓰려면 서버 조건이 필요하다.
- 요청: `classId=none` 같은 sentinel 이나 `unassigned=true` 파라미터.

## 4-3. 배정 해제 API가 없다 (반)

좌석·사물함은 해제가 있는데 반은 없다.

| | 해제 |
|---|---|
| 좌석 | `DELETE /seats/students/{enrollmentId}` ✅ |
| 사물함 | `DELETE /masters/lockers/{id}/assignment` ✅ |
| **반** | **없음** ❌ |

반 배정 화면의 '배정 해제' 버튼을 비활성으로 뒀다.

## 4-4. 반 응답에 정원·강의실이 없다

`ClassResponse`: `id, academyId, year, name, classType, homeroomTeacherId, homeroomTeacherName`

목업은 "현재 12 / 정원 14 · 201호"를 그린다. **정원이 없어 충원율을 못 그리고**, 강의실도 없다.
반별 인원도 집계 API가 없어 반마다 `/classes/{id}/students`를 부르고 있다(반이 늘면 부담).

> 요청: `capacity`, `roomName`, 그리고 목록 응답에 `memberCount`.

### ✅ 답변 — 강의실(roomName)은 어느 축인가

**둘 다 있고, 서로 다른 축이다.** 목업 기준으로 확인했다.

| 축 | 어디에 | 목업 근거 |
|---|---|---|
| **반에 고정** (홈룸) | 반 배정 화면 카드, 시간표 좌측 반 정보 | `Timetable.tsx`의 `ClassInfo.room` — `1반 → 201호` 처럼 반마다 하나 |
| **시간표 셀마다** | 교시별 강의실. 이동수업이면 다른 방으로 간다 | `Timetable.tsx`의 `Cell.room` — 같은 반이라도 교시마다 다르다 |

- 자습 교시는 홈룸으로 되돌아온다(`"{반} 교실"`), 식사는 `"식당"`이다.
  즉 **시간표 셀의 강의실이 비면 반의 홈룸으로 떨어지는 관계**로 보인다.
- 그래서 `ClassResponse.roomName`(홈룸)과 시간표 쪽 강의실은 **둘 다 필요하다.**
  지금 요청드리는 건 앞의 것(홈룸)이다.

> ⚠️ 시간표 쪽은 `Timetable.tsx` 주석에 **"(교시, 요일, 강의실) UNIQUE 제약이 서버에 없으면
> 편성 화면에서 아무리 막아도 뚫린다"** 고 적혀 있다. 시간표(F-C-3)를 붙일 때 확인이 필요하다.

## 4-5. 독서실 좌석 마스터를 만들 방법이 없다 ★

`GET /seats/areas`가 빈 배열이고, **좌석 구역·좌석을 등록하는 관리자 API가 없다.**
(`AreaRequest` 스키마가 있지만 키오스크 엔드포인트용이다.)

- 걸리는 화면: 배정 관리(독서실 탭), 독서실 좌석배치표(F-C-4), 좌석 이탈/복귀(F-4.11-8)
- 지금 상태: 구역이 0개라 **배치도가 빈 화면**이다. 화면에 그 사실을 표시해뒀다.
- 요청: 시드로 넣어주거나(지점당 구역·좌석) 등록 API. **좌석을 쓰는 화면이 3개라 이게 막히면 셋 다 못 만든다.**

## 4-6. 장학생 필터가 없다

교무업무 명단의 '장학생 명단' 탭은 장학 대상만 보여야 하는데 `/students`에 조건이 없다.
지금은 페이지 안에서 `scholarshipTypes`가 빈 학생을 거른다 — 전체 집계가 아니다.

> 요청: `hasScholarship=true` 또는 `scholarshipType=...`

## 4-7. 로컬 시드에 없어서 화면이 비어 보이는 것들

API 문제가 아니라 **데이터 문제**다. `seed-local.sh`에 들어가면 세 화면을 바로 확인할 수 있다.

- `student.address` — 전부 `null`. 수강생 대장의 '주소' 컬럼이 빈다
- 장학 정보 — 없음. 장학생 탭이 빈다
- 반(class) — 없음. 반 배정 화면이 빈다 (지금은 로컬에서 직접 만들어 확인했다)
- 사물함·좌석 구역 — 없음. 배정 관리가 빈다

> 요청: 반 4개, 사물함 12칸 정도, 좌석 구역 1~2개와 주소·장학 샘플을 시드에 넣어주면
> 프론트 3개 화면을 시드만으로 확인할 수 있다.

---

# 5부. 묶음 C 연동 중 확인된 것 (2026-09-02)

상담 · 데일리 루틴을 붙이면서 확인한 것들.

## 5-1. 작성자(teacherId)를 알 방법이 없다

`POST /consults`의 `teacherId`는 선택값이라 안 보내도 저장되지만, **그러면 `teacherName`이 빈 채로 남는다.**
상담 이력에서 "누가 상담했는지"가 사라진다.

- 토큰에는 `accountId`만 있고 `teacherId`가 없다. 둘을 잇는 API도 없다
  (`/staff/teachers`는 목록만 주고, 내 계정이 어느 교사인지 모른다)
- 지금 대응: 안 보낸다. 타임라인에 "작성자 미기록"으로 표시된다
- 요청: **`GET /admin/auth/me`** 같은 걸로 로그인한 사람의 `teacherId`·이름을 주거나,
  서버가 토큰으로 작성자를 채워줄 것. 후자가 더 안전하다 — 클라이언트가 남의 id를 보낼 수 없으니

## 5-2. 상담 저장에 학부모 공유 설정이 없다

목업의 '학부모 공유: 요약본 전송 / 안 함 / 전체'에 대응하는 필드가 `WriteRequest`에 없다.
화면 하단 안내는 "학부모 앱에 즉시 반영된다"인데 **무엇을 공유할지 정할 수가 없다.**

## 5-3. 상담 소요시간이 따로 없다

`placeNote` 한 칸뿐이라 "20분 · 상담실 2"를 통째로 넣는다. 나중에 "평균 상담 시간" 같은 걸
집계하려면 숫자 필드가 필요하다. 지금은 문자열이라 못 센다.

## 5-4. 루틴 결과가 학생 × 루틴 매트릭스로 안 온다

화면은 한 표에 루틴이 컬럼으로 펼쳐지는데, API는 `GET /routines/{routineId}/results` —
**루틴 하나당 목록**이다. 루틴이 6개면 6번 호출해서 프론트가 조립한다.

- 지금 대응: `Promise.all`로 병렬 호출 후 `enrollmentId` 기준으로 합친다
- 루틴이 늘면 호출 수가 그대로 늘어난다. 월 20개면 20번이다
- 요청: `GET /routines/results?academyId=&date=` 처럼 **날짜 기준으로 전체 루틴 결과**를 주는 것

## 5-5. 루틴에 상벌점 트리거가 없다 (I-5 대기)

목업의 '상벌점 트리거'·'학생별 상벌점 합계' 컬럼에 대응하는 필드가 없다.
I-5(상벌점 규칙) 확정 대기 항목이라 **지금은 없는 게 맞다.** 확정되면 같이 열어야 한다.

## 5-6. 학습 계획의 이행 표시가 O/X 2종뿐이다

`PlanItem.done`이 boolean이라 **'미체크'와 '미이행'이 구분되지 않는다.**
목업은 O · X · 미체크(·) 3종이고, 이행률 계산에서 "아직 안 찍은 것"과 "못 한 것"은 의미가 다르다.

> 8/3 확정이 "O/X 2종"이었으니 의도된 것일 수 있다. **확인이 필요하다.**

## 5-7. 좌석 배치도에 고정반·이석 위치가 없다

`SeatCellResponse`: `seatId, seatCd, seatNm, xPos, yPos, assignmentState, presence, enrollmentId, studentNo, studentName`

- **고정반** — 목업의 좌석 상세·배정 명단에 '고정반' 컬럼이 있다. 좌석만 보고 "어느 반 학생인지"를
  알 수 없어 현장에서 쓸모가 준다
- **이석 위치** — `presence=OUT`(이석)일 때 어디로 갔는지가 없다. 좌석 이탈/복귀(F-4.11-8)가
  키오스크에서 사유·위치를 받는데 이 응답에는 안 실린다

## 5-8. 좌석 배치도의 학생 이름을 원본으로 받을 수 없다

`/seats/layout`이 이름을 **항상 마스킹해서** 보낸다(`서*윤`). SUPER_ADMIN 으로 불러도 같다.

- `/students`는 `masked` 필드로 알려주고 export 에는 `unmask` 가 있는데, 여기는 파라미터가 없다
- 현장에서 좌석 주인을 확인하는 화면이라 원본이 필요한 상황이 있다
- 지금 대응: 마스킹 토글을 없애고 "이름은 서버에서 마스킹됩니다" 안내로 바꿨다

> 요청: 다른 목록과 같은 규칙으로 맞춰줄 것(`masked` 필드 + 권한에 따른 원본 제공).

## 5-9. 좌석 재배치 API가 없다

목업 '좌석 재배치' 버튼(반·계열 기준으로 자리를 다시 짜는 것)에 대응하는 API가 없다.
지금은 비활성으로 뒀다.

## 5-10. `learning-plans/options` 가 `year` 없이 부르면 500

```
GET /admin/learning-plans/options?academyId=8            → 500 INTERNAL_ERROR
GET /admin/learning-plans/options?academyId=8&year=2026  → 200
```

`year` 는 스펙상 **선택값**인데 안 보내면 서버가 터진다. 1-5(타입 오류 400)와 같은 부류로,
잘못된 요청이 500 으로 나오면 프론트가 "내 잘못인지 서버가 죽었는지" 구분할 수 없다.

> 지금 대응: 항상 현재 연도를 보낸다. 요청: `year` 기본값을 서버가 채우거나 400 을 낼 것.

## 5-11. 학습계획 입력 차단일이 서버에 없다 ★

목업의 핵심 주의사항이다 — **"차단일은 미작성이 아니다."**
연간 행사 마스터에서 '학습계획 입력 차단'으로 등록한 날은 미작성 집계에서 빠져야 하고,
그러지 않으면 **휴원일마다 전교생이 미작성자로 잡혀 경고가 무의미해진다.**

- `/schedules`·`/holidays` 어디에도 "학습계획 입력 차단" 속성이 없다
- board 응답의 `missingDays` 가 **차단일을 빼고 세는지 확인이 필요하다.**
  빼지 않는다면 지금 화면의 '미작성 학생' 수가 전부 틀린 값이다
- 화면에는 확인이 필요하다는 안내를 띄워뒀다

## 5-12. 학습계획 이행 현황에 담임이 없다

`LearningPlanBoardRow` 에 `className` 은 있는데 담임이 없다. 목업에 '담임' 컬럼이 있고,
담임이 자기 반 미작성자를 보는 화면이라 필요하다. 지금은 `<Unfilled/>` 로 뒀다.

---

# 6부. 묶음 D 연동 중 확인된 것 (2026-09-03)

## 6-1. `IssueMonthly.discountRate` 를 생략하면 400 ★

```
POST /admin/tuition/billings/monthly
{"enrollmentId":1,"month":"2026-09","seatType":"GENERAL"}
  → 400 "요청 본문 형식이 올바르지 않습니다."

{"enrollmentId":1,"month":"2026-09","seatType":"GENERAL","discountRate":0}
  → 200
```

`discountRate` 가 **primitive `int`** 라(`Integer` 가 아니라) 값이 없으면 역직렬화가 깨진다.
스펙의 `required` 에는 없어서 **선택값으로 보이는데 실제로는 필수**다.

- 메시지가 "요청 본문 형식이 올바르지 않습니다"라 **어느 필드가 문제인지 알 수 없다.**
  실제로 스펙대로 보냈는데 막혀서 원인을 찾는 데 시간이 걸렸다
- 같은 패턴이 다른 요청에도 있는지 확인이 필요하다(`int`/`long`/`boolean` primitive 필드)

> 요청: `Integer` 로 바꿔 기본값 0을 서버가 채우거나, `required` 에 넣어 스펙과 실제를 맞출 것.

## 6-2. 수납현황에 결제 '거래' 축이 없다

`RowView` 는 청구 단위(누가 얼마 청구받고 얼마 냈나)만 준다. **언제 무엇으로 냈는지가 없다.**

| 목업 컬럼 | 상태 |
|---|---|
| 결제일자 | 없음 |
| 전표번호 | 없음 |
| 결제수단 | 없음 (카드/가상계좌/현금 집계도 못 그림) |
| 지점 | 행에는 없음. 조회가 지점 단위라 헤더로는 표시 가능 |
| 청구기수 | 없음 |

화면 상단 통계에서 **결제수단별 집계 3칸이 못 그려진다.** 지금은 청구 총액·수납률로 대체하고
결제수단 칸은 `<Unfilled/>` 로 뒀다.

> `POST /billings/{id}/payments` 로 수단을 받아 저장은 하고 있으니 데이터는 있을 것이다.
> 조회 응답에 거래 목록(또는 최근 결제 정보)을 실어주면 된다.

## 6-3. 할인 정책 API가 없다

수납현황의 세 번째 탭(할인 정책·청구액 계산)에 대응하는 엔드포인트가 없다.
목업은 정률/정액·적용순서·중복허용·유효기간까지 설계돼 있다.

- `IssueMonthly` 가 `discountRate` 를 받긴 하지만 **호출할 때 넘기는 값**이지 저장된 정책이 아니다
- 목업 주석의 경고가 핵심이다 — **"계산 주체는 서버여야 한다."**
  프론트가 계산한 금액을 결제창에 넘기면 금액을 조작할 수 있다
- 지금 대응: 그 탭은 목업 그대로 두고 화면에 안내를 띄웠다
