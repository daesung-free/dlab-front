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

Flyway는 스키마만 만든다. **데이터는 하나도 없다** — 계정이 없어 로그인부터 막힌다.

```bash
# 지점·교시·지점별 단가 (dlab-api가 들고 있는 시드)
#   ⚠️ local 프로필의 flyway locations는 db/migration 뿐이라 db/seed 는 자동 적용되지 않는다
cd ../dlab-api
for f in src/main/resources/db/seed/*.sql; do
  docker exec -i dlab-postgres-local psql -U dlab -d dlab_local -v ON_ERROR_STOP=1 < "$f"
done

# 관리자 계정 + 샘플 학생 60명 (이 레포)
cd ../dlab-front
docker exec -i dlab-postgres-local psql -U dlab -d dlab_local -v ON_ERROR_STOP=1 < scripts/dev-seed.sql
```

`scripts/dev-seed.sql`은 몇 번 돌려도 안전하다(이미 있으면 건너뛴다).

| 항목 | 값 |
|---|---|
| 계정 1 | `admin` / `dlab1234!` — `SUPER_ADMIN` (전 지점) |
| 계정 2 | `branch` / `dlab1234!` — `BRANCH_ADMIN` (분당) |
| 샘플 학생 | 60명 / 2026년 / 분당·이매·목동 20명씩 |

> 계정이 둘인 이유: 출결·상벌점·상담 등 8개 엔드포인트는 **전 지점 권한으로는 호출이 막힌다**
> ("지점을 지정해야 합니다"). 그 화면들은 `branch` 계정으로 확인해야 한다.
> 자세한 것은 `docs/API_GAPS.md` 1-1.

> ⚠️ 로컬 전용이다. 이 비밀번호와 SQL을 운영에 쓰지 않는다.

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

- `src/api/` — 공통 클라이언트(401 재발급·에러 정규화·페이징 두 형태 흡수), 인증, 학생 검색
- `src/auth/` — 로그인 화면과 인증 컨텍스트

**아직 화면에는 연결하지 않았다.** 목업 화면과 실제 API 응답이 어긋나는 부분이 있어
(`docs/API_GAPS.md`) 백엔드 보완 후 한 번에 붙인다.
