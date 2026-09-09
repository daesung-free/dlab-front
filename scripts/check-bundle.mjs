/**
 * 프로덕션 산출물에 내부 문서가 섞였는지 검사한다.
 *
 * ★ 왜 필요한가. README 가 공개 호스팅을 금지하는 이유가 오픈이슈 42건이다 —
 *   거래처 협상 상태·계약 종료 시점·담당자. 실제로 이게 번들에 들어간 채로
 *   배포 직전까지 갔다(2026-09-09). **로그인 게이트는 소용이 없다. 번들은
 *   로그인 전에 브라우저로 내려간다.**
 *
 * ★ 화면에 안 그려도 소용없다. 모듈이 번들에 남으면 개발자도구에서 그대로 읽힌다.
 *   그래서 "라우트를 막았는가"가 아니라 **"산출물에 문자열이 있는가"**를 본다.
 *
 * 새 항목을 넣을 때: 제품 화면에 정상적으로 나오는 말은 넣지 말 것.
 * 예) '대성전산'은 출결 화면 설명에 있어서 못 넣는다. '대성전산 협의'로 좁힌다.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'

/** 산출물에 있으면 안 되는 말. 근거를 함께 적어 나중에 왜 넣었는지 알 수 있게 한다 */
const FORBIDDEN = [
  ['계약 종료', '거래처 계약 종료 시점 (오픈이슈 D-8)'],
  ['대성전산 협의', '오픈이슈 담당자 — 거래처 협상 상태'],
  ['행정팀 확인', '오픈이슈 담당자'],
  ['기획·행정 확정', '오픈이슈 담당자'],
  ['블로커', '오픈이슈 메모'],
  ['오픈이슈', '요구사항정의서 5시트'],
  ['penalty_items', 'DB 테이블명 (menu.ts tables)'],
  ['Supabase', '내부 아키텍처 메모 (menu.ts logic)'],
  ['DSA 화면 실사', 'DSA 실사 근거 (menu.ts dsaNote)'],
]

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

const files = walk(DIST).filter((f) => /\.(js|css|html)$/.test(f))
if (files.length === 0) {
  console.error(`✗ ${DIST}/ 에 검사할 파일이 없다. 빌드가 안 돌았는가?`)
  process.exit(1)
}

let bad = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  for (const [needle, why] of FORBIDDEN) {
    const n = text.split(needle).length - 1
    if (n > 0) {
      console.error(`✗ ${file}  "${needle}" ${n}건 — ${why}`)
      bad += n
    }
  }
}

if (bad > 0) {
  console.error(`\n내부 문서가 산출물에 ${bad}건 섞였다. 이대로 배포하면 링크를 아는 사람은 다 읽는다.`)
  console.error('무엇이 끌고 오는지 찾을 것 — vite.config.ts 의 SpecRoutes alias 주석에 전례가 있다.')
  process.exit(1)
}

console.log(`✓ 검사한 파일 ${files.length}개 — 내부 문서 없음`)
