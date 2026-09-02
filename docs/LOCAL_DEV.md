# 로컬 연동 개발 환경

목업을 실제 API에 붙여 확인하려면 백엔드(`dlab-api`)가 로컬에 떠 있어야 한다.

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

| 계정 1 | `admin` / `dlab1234!` — `SUPER_ADMIN` (전 지점) |
|---|---|
| 계정 2 | `branch` / `dlab1234!` — `BRANCH_ADMIN` (분당) |
| 샘플 학생 | 60명 / 2026년 / 분당·이매·목동 20명씩 |

> 계정이 둘인 이유: 출결·상벌점·상담 등 8개 엔드포인트는 **전 지점 권한이면 `academyId`를
> 함께 보내야 한다.** 안 보내고 확인하려면 `branch` 계정을 쓴다. 자세한 것은 `API_GAPS.md` 1-1.

> ⚠️ 로컬 전용이다. 이 비밀번호와 시드를 운영에 쓰지 않는다.

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
