# 로컬 연동 개발 환경

목업을 실제 API에 붙여 확인하려면 백엔드(`dlab-api`)가 로컬에 떠 있어야 한다.

## ★ `api.d-dlab.link` 가 무엇인지 — 먼저 읽는다

이 문서와 `API_GAPS.md` 가 `api.d-dlab.link` 를 **「운영 서버」**라고 부르는데, 정확히는
**아직 실사용 전인 서버 하나**다. `dlab-api/CLAUDE.md` §3:

> 인프라는 **서버 하나를 개발용→운영용으로 그대로 전환하는 방식**이다(별도 dev/prod
> 서버 분리 아님). … 개발 중인 이 DB에는 **실제 학생·학부모 개인정보를 절대 넣지 않고
> 테스트 더미데이터만 사용할 것.**

★ **그래서 그 서버에서 본 숫자를 결함으로 읽지 않는다.**

```
보호자 계정 0명        ★ 결함이 아니다 — 더미만 넣기로 한 원칙을 지킨 상태다
guardianPhone 이 전부
010-1000-0000         ★ 미배정 대역 더미다
결제 24건에 할인 0건    ★ 더미라 그럴 수 있다
```

⚠️ **2026-10-31 에 이걸 거꾸로 읽었다.** 「운영에 보호자가 0명이라 알림톡이 한 통도 못
나간다 → **컷오버를 막는다**」고 사용자에게 올렸는데, 그건 `dlab-api/CLAUDE.md` §4
**컷오버 체크리스트**에 적힌 **그때 할 일**이었다. 백엔드 세션도 그 말을 받아 증폭했고,
사용자가 *「아직 이거 개발서버라고」* 로 바로잡았다.

★ **숫자를 보고 「없다」고 말하기 전에 「지금 없어야 하는 것인가」를 본다.** 확인을
했는데도 틀릴 수 있는 자리가 여기다 — 확인이 아니라 **해석**이 틀렸다.

★ 반면 **시점과 무관한 것은 그대로 유효하다.** 예: 비밀번호가 git 이력에 남는 것은
개발 서버든 아니든 문제다(아래 2절).

## 1. 백엔드 띄우기

```bash
cd ../dlab-api
docker compose up -d                                   # postgres:5432, redis:6379
./gradlew bootRun --args='--spring.profiles.active=local'
```

확인: `curl -s localhost:8080/actuator/health` → `"status":"UP"`
API 스펙: http://localhost:8080/swagger-ui.html

## 2. 데이터 넣기 (최초 1회)

Flyway는 스키마만 만든다. **데이터는 하나도 없어서 계정이 없고, 로그인부터 막힌다.**
백엔드 레포의 스크립트가 지점·교시·지점별 단가·계정·학생을 순서대로 넣어준다.

```bash
cd ../dlab-api
./scripts/seed-local.sh
```

- **앱을 한 번 띄운 뒤에 실행한다** — 테이블이 있어야 들어간다.
- 여러 번 돌려도 된다(전부 멱등).
- 호스트에 `psql`이 없으면 docker 컨테이너의 psql을 알아서 쓴다.

| 계정 1 | `admin` — `SUPER_ADMIN` (전 지점) |
|---|---|
| 계정 2 | `branch` — `BRANCH_ADMIN` (분당) |
| 샘플 학생 | 60명 / 2026년 / 분당·이매·목동 20명씩 |

> 계정이 둘인 이유: 출결·상벌점·상담 등 8개 엔드포인트는 **전 지점 권한이면 `academyId`를
> 함께 보내야 한다.** 안 보내고 확인하려면 `branch` 계정을 쓴다. 자세한 것은 `API_GAPS.md` 1-1.

> ★ **비밀번호는 여기 적지 않는다.** `dlab-api` 의 시드 스크립트(`scripts/seed-local.sh`)가
> 들고 있으니 거기서 본다.
>
> ⚠️ **이 레포는 공개다.** 전에 이 표에 비밀번호를 적어 뒀는데, **운영 계정이 같은 비밀번호를
> 쓰고 있었다** — 「로컬 전용이다」라고 바로 아래 적어 두고도 그랬다. 계정명과 운영 주소
> (`api.d-dlab.link`)가 같은 레포에 있으니 **세 조각이 함께 읽혔다.**
>
> ⚠️ **지금 지워도 git 이력에는 남는다**(커밋 `5d7d623`·`f30669b`). 효과가 있는 것은
> **운영 비밀번호를 바꾸는 것**뿐이다 — 문서에서 지운 것을 「처리했다」로 세지 않는다.

### 시드가 Flyway에 없는 이유

`db/seed`는 **의도적으로** Flyway 밖에 있다. `locations`에 넣으면
· 시드를 고칠 때마다 체크섬 불일치로 **다른 사람 로컬이 안 뜬다** — 시드는 자주 바뀐다
· `flyway_schema_history`에 기록이 남아, 개발 서버를 그대로 운영으로 전환할 때
  prod 프로필에서 `applied but not resolved`로 validate가 실패한다

스키마는 Flyway, 데이터는 스크립트로 나눠 둔 것이다.

## 3. 프론트

```bash
npm install
npm run dev     # http://localhost:5173
```

`.env.development`의 `VITE_API_BASE_URL`이 백엔드 주소다(기본 `http://localhost:8080`).
개인 설정으로 덮으려면 `.env.local`을 만든다(`.gitignore`의 `*.local` 대상).

### ⚠️ `.env.local` 이 있으면 `.env.development` 는 **안 읽힌다**

Vite 우선순위가 `.env.local` > `.env.development` 다. 그리고 `.env.local` 은 깃에 안
올라가서 **남의 화면에는 안 보인다.** 실제로 이렇게 하루를 날렸다(2026-09-16) —

```
.env.development   VITE_API_BASE_URL=http://localhost:8080   ← 고쳐 놓고
.env.local         VITE_API_BASE_URL=https://api.d-dlab.link  ← 이게 이기고 있었다
```

"로컬 백엔드로 바꿨다"고 믿고 작업했는데 화면은 **운영**을 보고 있었다. 로컬 시드가
안 나오니 "실행이 안 된다"로 보인다. 어느 쪽을 보는지 헷갈리면 **먼저 이것부터 확인한다.**

```
cat .env.local 2>/dev/null; cat .env.development
```

**`.env` 는 HMR 로 안 먹는다.** 고쳤으면 dev 서버를 껐다 켠다.

★ 운영 백엔드를 볼 때는 **포트를 3000 으로** 띄운다. 운영 `cors.allowed-origins` 에
`http://localhost:3000` 만 들어 있어서 5173 이면 preflight 가 403 인데, 서버 로그에는
아무것도 안 남아 **"화면이 그냥 빈다"** 로만 보인다.

**dev 프록시를 쓰지 않는다.** 브라우저가 백엔드를 직접 호출하므로 **CORS 목록이 곧 접속 조건**이다.
백엔드 `application-local.yml`의 `cors.allowed-origins`에는 `5173`·`3000`만 있다.
Vite가 5173을 이미 누가 쓰고 있어 **5174로 밀려 뜨면** 그 origin을 백엔드 목록에 추가해야 한다.
증상은 브라우저 콘솔의 CORS 오류뿐이고 **서버 로그에는 아무것도 안 남는다.**

## 4. 타입 생성 (선택)

백엔드가 떠 있는 상태에서:

```bash
npm run api:types      # → src/api/schema.d.ts
```

`openapi-typescript`는 peer로 `typescript@^5`를 요구하는데 이 레포는 7이라
**의존성으로 넣지 않고 npx로 격리 실행**한다. 생성물만 쓰면 되고 빌드에는 필요 없다.

## 5. 지금 붙어 있는 것

- `src/api/` — 공통 클라이언트(401 재발급·에러 정규화·페이징 두 형태 흡수), 인증, 지점, 학생
- `src/auth/` — 로그인 화면·인증 컨텍스트, 지점 스코프(`AcademyContext`)
- `src/components/common/useServerTable.ts` — 목록 화면 공통 훅

**실연동된 화면은 학원생 검색(F-4.1-1) 하나뿐이다.** 나머지 35개는 목업이다.
화면별 진행 상황과 담당은 `docs/CONNECT_PLAN.md`를 본다.
