/**
 * 착수 요청 목록 생성 — `npm run asks`
 *
 * 오픈이슈를 "누가 답을 갖고 있는가" 기준으로 재배열한다.
 *   · BE 개발자가 직접 움직여야 하는 것
 *   · BE도 기다리고 있는 것 (운영팀·외부 확정 대기)
 *   · FE가 가진 것
 * 회의에 그대로 들고 갈 수 있는 형태를 목표로 한다.
 *
 * Node 24 타입 스트리핑으로 .ts를 그대로 실행한다.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { SCREENS, PHASE } from '../src/data/menu.ts'
import { ISSUES, PRIORITY_ORDER, resolveIssue, type Issue } from '../src/data/issues.ts'

const out: string[] = []
const w = (s = '') => out.push(s)

/** 이슈가 걸려 있는 화면 코드 */
function blockedScreens(code: string): string[] {
  return SCREENS.filter((s) => s.issues.some((r) => resolveIssue(r)?.code === code)).map((s) => s.code)
}

/** 이슈가 가장 먼저 필요한 Phase */
function earliestPhase(code: string): number | null {
  const ps = SCREENS.filter((s) => s.issues.some((r) => resolveIssue(r)?.code === code)).map((s) => s.phase)
  return ps.length ? Math.min(...ps) : null
}

const rank = (i: Issue) => PRIORITY_ORDER.indexOf(i.priority)

/** 확인 대상이 외부/대성전산인 것 = BE가 협의 주체로 움직여야 하는 건 */
const isExternal = (i: Issue) =>
  i.area === '대성전산' || i.area === '기타 외부연동' || i.area === 'D.Lab사이트(DSD)' || i.area === '내부/대성전산'

const sortFn = (a: Issue, b: Issue) => {
  const r = rank(a) - rank(b)
  if (r !== 0) return r
  return (earliestPhase(a.code) ?? 9) - (earliestPhase(b.code) ?? 9)
}

function table(list: Issue[]) {
  if (!list.length) {
    w('_해당 없음_')
    w()
    return
  }
  w('| 코드 | 우선순위 | 착수 Phase | 확인 대상 | 필요한 것 | 막히는 화면 |')
  w('|---|---|---|---|---|---|')
  for (const i of list) {
    const p = earliestPhase(i.code)
    const ph = p === null ? '-' : `P${p}`
    const sc = blockedScreens(i.code)
    w(
      `| \`${i.code}\` | **${i.priority}** | ${ph} | ${i.owner} | ${i.body.replace(/\|/g, '/')} | ${sc.join(', ') || '-'} |`,
    )
  }
  w()
}

w('# 착수 요청 목록 — 무엇을 누구에게 받아야 하는가')
w()
w('> `npm run asks` 로 자동 생성. 원본은 `src/data/issues.ts` (요구사항정의서 5.오픈이슈 관리대장).')
w('> 상세 화면 매핑은 `docs/BACKEND_HANDOFF.md` 참고.')
w()

/* ── 한 장 요약 ── */
const blocking = ISSUES.filter((i) => (i.priority === '최우선' || i.priority === '높음') && blockedScreens(i.code).length)
const p1 = blocking.filter((i) => earliestPhase(i.code) === 1)
const p2 = blocking.filter((i) => earliestPhase(i.code) === 2)

w('## 한 장 요약')
w()
w(`- 오픈이슈 **${ISSUES.length}건** 중, 실제로 화면을 막고 있는 최우선·높음이 **${blocking.length}건**`)
w(`- 그중 **Phase 1(8~9월) 착수분이 ${p1.length}건**, Phase 2(9~10월)가 ${p2.length}건`)
w('- **우회 불가 1건** — `I-1` 교무업무 구분 항목 (운영팀 확정 없이는 필드 정의 자체가 불가)')
w()
w('| 무엇이 | 왜 지금 |')
w('|---|---|')
w('| `I-1` 교무업무 구분 항목 | 42건 중 **유일하게 우회 불가**. 임의 정의하면 재작업 확정 |')
w('| `I-17` 신상기록부 양식 | 회원가입 온보딩 강제 단계라 **가입 플로우 자체가 못 닫힘** |')
w('| `D-2` 키오스크 스펙 | 출결·식사체크·좌석이탈 3개 도메인이 여기 물림 |')
w('| `E-5` 알림톡 심사 | **심사 기간이 있어 지금 넣어야** Phase 1에 맞음 |')
w('| `D-5`·`D-9` 대성전산 API 범위·등록비 주체 | 아키텍처 근간. 확정 전엔 수납 구현 시작 불가 |')
w()

/* ── 1. BE가 협의 주체로 움직여야 하는 것 ── */
w('## 1. BE가 직접 받아와야 하는 것 (외부 협의)')
w()
w('연동 스펙이라 개발자가 상대 개발자와 직접 이야기하는 게 빠른 항목입니다.')
w('FE는 목업/스텁으로 우회 개발 중이라, 스펙이 오면 교체 지점만 바꿉니다.')
w()
table(ISSUES.filter((i) => isExternal(i) && rank(i) <= 1 && blockedScreens(i.code).length).sort(sortFn))

/* ── 2. 운영팀 확정 대기 ── */
w('## 2. 운영팀 확정 대기 (BE·FE 모두 멈춰 있음)')
w()
w('개발이 결정할 수 없는 정책입니다. **회의에서 답을 받아야 하는 항목**입니다.')
w()
table(ISSUES.filter((i) => !isExternal(i) && rank(i) <= 1 && blockedScreens(i.code).length).sort(sortFn))

/* ── 3. 개발팀 내부 결정 ── */
w('## 3. 개발팀이 답을 줘야 하는 것')
w()
w('클라이언트가 개발팀 회신을 기다리는 항목입니다.')
w()
w('| 항목 | 내용 | 현재 상태 |')
w('|---|---|---|')
w(
  '| 학습계획 이행 표시 방식 | `I-19` — 1안(바+%) / 2안(○△빈칸) | **화면에 두 안 모두 구현 완료.** `/s/learning-plan` 토글로 비교 가능 → 보고 고르면 됨 |',
)
w('| 교시 20분 세분 편집 | 학습계획 셀 분할 | UI 복잡도 대비 실익 낮다는 **반대의견 회신 예정** (현재 교시 단위로 구현) |')
w('| 승인 에스컬레이션 응답시간 | `I-20` — 부모 미응답 → 담임 전환 시간 | 클라이언트 미확약. **스키마에 필드만 확보**하고 값은 나중 |')
w('| 외부 메신저 선정 | `E-6` — 1:1 채팅 (1만명 규모) | 개발팀 조사 항목. React 연동 담당 **서지원** |')
w()

/* ── 4. FE가 이미 정리해 둔 것 ── */
w('## 4. FE가 이미 잡아둔 것 (BE가 참고만 하면 되는 것)')
w()
w('아래는 확정을 기다릴 필요 없이 지금 바로 쓸 수 있습니다.')
w()
w('| 항목 | 어디에 |')
w('|---|---|')
w('| 화면 30개 × API·테이블·이슈 매핑 | `docs/BACKEND_HANDOFF.md` |')
w('| 화면 IA 원본 데이터 | `src/data/menu.ts` (SSOT) |')
w('| 오픈이슈 42건 구조화 | `src/data/issues.ts` |')
w('| 상태값 enum 초안 | 출결 5종·급식 5종·승인 3종 — 각 화면 목업에 표기 |')
w('| RBAC 5단계 × 기능영역 12개 권한 매트릭스 초안 | `/s/admin-user` 화면 |')
w('| 개인정보 마스킹 규칙 | `src/lib/mask.ts` — 화면·엑셀이 같은 규칙 공유 |')
w()
w('> ⚠ 마스킹은 **화면단 표시 방어선**일 뿐입니다. 실제 차단은 BE RBAC 필드 권한이 담당해야 하고,')
w('> 마스킹 해제 가능 여부도 서버 응답이 결정해야 합니다.')
w()

/* ── Phase별 데드라인 ── */
w('## Phase별로 언제까지 필요한가')
w()
for (const p of [1, 2, 3] as const) {
  const list = ISSUES.filter((i) => earliestPhase(i.code) === p && rank(i) <= 1)
  if (!list.length) continue
  w(`### ${PHASE[p].name} — ${PHASE[p].period}`)
  w()
  for (const i of list.sort(sortFn)) {
    w(`- \`${i.code}\` (${i.priority}) — ${i.owner} · ${blockedScreens(i.code).join(', ')}`)
  }
  w()
}

mkdirSync('docs', { recursive: true })
writeFileSync('docs/ASKS.md', out.join('\n'), 'utf8')

console.log(`docs/ASKS.md 생성 — 화면 차단 이슈 ${blocking.length}건 · ${out.length}줄`)
