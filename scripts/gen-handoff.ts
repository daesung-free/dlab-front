/**
 * 백엔드 인수인계 문서 생성 — `npm run handoff`
 *
 * src/data/menu.ts · issues.ts 에서 화면별 API·테이블·오픈이슈를 뽑아
 * docs/BACKEND_HANDOFF.md 로 내보낸다. 데이터가 SSOT이므로 문서가 따로 늙지 않는다.
 *
 * Node 24의 타입 스트리핑으로 .ts를 그대로 실행한다(빌드 불필요).
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { GROUPS, SCREENS, PHASE, KIND_LABEL, screensOf } from '../src/data/menu.ts'
import { ISSUES, PRIORITY_ORDER, resolveIssue } from '../src/data/issues.ts'

const out: string[] = []
const w = (s = '') => out.push(s)

w('# 백엔드 인수인계 — 화면별 API · 데이터 · 오픈이슈')
w()
w('> 이 문서는 `npm run handoff` 로 자동 생성됩니다. 직접 고치지 말고 `src/data/menu.ts` 를 고치세요.')
w('> 원본 기준: `DSA_DLab_요구사항정의서.xlsx` (1.화면별 요구사항 / 5.오픈이슈 관리대장)')
w()

/* ── 요약 ── */
w('## 요약')
w()
w(`- 대분류 **${GROUPS.length}개** · 화면 **${SCREENS.length}개** (전부 프론트 목업 존재)`)
w(`- 오픈이슈 **${ISSUES.length}건** — ${PRIORITY_ORDER.map((p) => `${p} ${ISSUES.filter((i) => i.priority === p).length}`).join(' / ')}`)
w()
w('| Phase | 기간 | 화면 수 |')
w('|---|---|---|')
for (const p of [0, 1, 2, 3, 4] as const) {
  const n = SCREENS.filter((s) => s.phase === p).length
  if (n) w(`| ${PHASE[p].name} | ${PHASE[p].period} | ${n} |`)
}
w()
w('> ⚠ **DSA 레거시 소스코드·DB 접근 불가.** 코드 재사용 항목은 존재하지 않으며,')
w('> `요구사항 검증됨`으로 분류된 화면도 구현 공수는 완전 신규와 동일하게 산정해야 합니다.')
w()

/* ── 착수 블로커 ── */
w('## 착수를 막고 있는 이슈 (최우선 · 높음)')
w()
w('| No | 코드 | 우선순위 | 확인 대상 | 내용 | 걸려 있는 화면 |')
w('|---|---|---|---|---|---|')
for (const p of ['최우선', '높음'] as const) {
  for (const i of ISSUES.filter((x) => x.priority === p)) {
    const blocked = SCREENS.filter((s) => s.issues.some((r) => resolveIssue(r)?.code === i.code))
      .map((s) => s.code)
      .join(', ')
    const body = i.body.length > 90 ? `${i.body.slice(0, 90)}…` : i.body
    w(`| ${i.no} | \`${i.code}\` | ${i.priority} | ${i.owner} | ${body} | ${blocked || '-'} |`)
  }
}
w()

/* ── 화면별 상세 ── */
w('## 화면별 상세')
w()
for (const g of GROUPS) {
  const list = screensOf(g.id)
  if (!list.length) continue
  w(`### ${g.no} ${g.name}`)
  w()
  w(`${g.desc}`)
  w()
  for (const s of list) {
    w(`#### \`${s.code}\` ${s.name}`)
    w()
    w(`- **구분** ${KIND_LABEL[s.kind]} · **Phase** ${PHASE[s.phase].name}${s.feOrder ? ` · FE ${s.feOrder}순위` : ''}`)
    w(`- **화면 경로** \`/s/${s.id}\``)
    w(`- **기능 개요** ${s.summary}`)
    if (s.tables.length) w(`- **데이터 항목** ${s.tables.map((t) => `\`${t}\``).join(', ')}`)
    if (s.issues.length) {
      const detail = s.issues
        .map((r) => {
          const i = resolveIssue(r)
          return i ? `${r} ${i.code}(${i.priority}·${i.owner})` : r
        })
        .join(' / ')
      w(`- **오픈이슈** ${detail}`)
    }
    if (s.logic.length) {
      w('- **핵심 요구사항 · 로직**')
      for (const l of s.logic) w(`  - ${l}`)
    }
    if (s.note0723) w(`- **[0723 반영]** ${s.note0723}`)
    w(`- **DSA 실사 근거** (코드 아님 · UX 참고용) ${s.dsaNote}`)
    w()
  }
}

/* ── 전체 오픈이슈 ── */
w('## 오픈이슈 관리대장 (전체)')
w()
w('| No | 코드 | 우선순위 | 영역 | 구분 | 내용 | 확인 대상 |')
w('|---|---|---|---|---|---|---|')
for (const i of ISSUES) {
  w(`| ${i.no} | \`${i.code}\` | ${i.priority} | ${i.area} | ${i.kind} | ${i.body.replace(/\|/g, '/')} | ${i.owner} |`)
}
w()

mkdirSync('docs', { recursive: true })
writeFileSync('docs/BACKEND_HANDOFF.md', out.join('\n'), 'utf8')

console.log(`docs/BACKEND_HANDOFF.md 생성 — 화면 ${SCREENS.length}개 · 이슈 ${ISSUES.length}건 · ${out.length}줄`)
