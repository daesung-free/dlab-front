/**
 * 잠정 결정 사항 문서 생성 — `npm run assumptions`
 *
 * 목업이 "실제 제품처럼" 보이려면 미확정 항목도 일단 그려야 한다.
 * 그렇게 임의로 정한 것들을 화면에서 걷어내고 이 문서로만 관리한다.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { SCREENS, PHASE, findScreen } from '../src/data/menu.ts'
import { ASSUMPTIONS, totalAssumptions } from '../src/data/assumptions.ts'
import { ISSUES } from '../src/data/issues.ts'

const out: string[] = []
const w = (s = '') => out.push(s)

w('# 잠정 결정 사항 — 확정되면 화면을 고쳐야 하는 것들')
w()
w('> `npm run assumptions` 로 자동 생성. 원본은 `src/data/assumptions.ts`.')
w()
w('목업을 실제 제품처럼 보이게 만들려면 아직 확정되지 않은 항목도 일단 그려야 합니다.')
w('그렇게 **임의로 정한 것**을 여기에 모았습니다. 화면에는 표시하지 않습니다.')
w()
w(`**${Object.keys(ASSUMPTIONS).length}개 화면 · ${totalAssumptions}건**`)
w()
w('> ⚠ 아래 항목은 전부 "확정되면 화면을 고쳐야 하는" 것들입니다.')
w('> 데모에서 보이는 수치·명칭·코드값을 확정 사항으로 오해하지 마세요.')
w()

/* ── 이슈별 역인덱스: 이슈 하나가 몇 개 화면의 가정을 붙잡고 있는가 ── */
const byIssue = new Map<string, { screen: string; what: string }[]>()
for (const [sid, list] of Object.entries(ASSUMPTIONS)) {
  for (const a of list) {
    if (!a.issue) continue
    for (const code of a.issue.split('/').map((s) => s.trim())) {
      if (!byIssue.has(code)) byIssue.set(code, [])
      byIssue.get(code)!.push({ screen: findScreen(sid)?.code ?? sid, what: a.what })
    }
  }
}

w('## 이슈 하나가 몇 군데를 붙잡고 있나')
w()
w('확정 하나로 여러 화면이 동시에 풀리는 순서입니다.')
w()
w('| 이슈 | 우선순위 | 걸린 가정 | 영향 화면 |')
w('|---|---|---|---|')
const sorted = [...byIssue.entries()].sort((a, b) => b[1].length - a[1].length)
for (const [code, list] of sorted) {
  const issue = ISSUES.find((i) => i.code === code)
  const screens = [...new Set(list.map((l) => l.screen))].join(', ')
  w(`| \`${code}\` | ${issue?.priority ?? '-'} | ${list.length}건 | ${screens} |`)
}
w()

/* ── 화면별 ── */
w('## 화면별 상세')
w()
for (const s of SCREENS) {
  const list = ASSUMPTIONS[s.id]
  if (!list?.length) continue
  w(`### \`${s.code}\` ${s.name}`)
  w()
  w(`${PHASE[s.phase].name} · 화면 경로 \`/s/${s.id}\``)
  w()
  for (const a of list) {
    w(`- **임의 결정** ${a.what}`)
    w(`  - 확정 시 → ${a.onDecision}`)
    if (a.issue) w(`  - 관련 이슈 \`${a.issue}\``)
  }
  w()
}

w('## 확정 없이 만든 화면이 아닌 것들')
w()
w('아래 화면은 잠정 결정 없이 요구사항대로 구현했습니다.')
w()
const clean = SCREENS.filter((s) => !ASSUMPTIONS[s.id]?.length)
for (const s of clean) w(`- \`${s.code}\` ${s.name}`)
w()

mkdirSync('docs', { recursive: true })
writeFileSync('docs/ASSUMPTIONS.md', out.join('\n'), 'utf8')

console.log(
  `docs/ASSUMPTIONS.md 생성 — ${Object.keys(ASSUMPTIONS).length}개 화면 · ${totalAssumptions}건 · 이슈 ${byIssue.size}종`,
)
