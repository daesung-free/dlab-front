import re, io, sys
"""화면과 메뉴 코드 매핑이 어긋나지 않았는지 본다.

   매핑이 빠지면 그 화면은 **아무에게도 안 감춰진다** — 계정별 노출 설정이 조용히 새는 셈이다.
   반대로 없는 화면을 매핑하면 코드만 남아 다음 사람이 헷갈린다."""
menu = io.open('src/data/menu.ts', encoding='utf-8').read()
# SCREENS 배열만 본다 — GROUPS 는 한 줄짜리라 `groupId` 가 없어도 걸리던 적이 있다
start = menu.index('export const SCREENS')
ids = []
for b in re.split(r'\n  \{\n', menu[start:]):
    m = re.search(r"id: '([a-z0-9-]+)'", b)
    if m and 'groupId' in b:
        ids.append(m.group(1))
codes = io.open('src/data/menuCodes.ts', encoding='utf-8').read()
mapped = set(re.findall(r"^  '?([a-z0-9-]+)'?: \[", codes, re.M))
miss = [i for i in ids if i not in mapped]
extra = [m for m in mapped if m not in ids]
for i in miss:
    print(f"  매핑 없는 화면: {i}  (menuCodes.ts 에 추가한다)")
for e in extra:
    print(f"  화면 없는 매핑: {e}  (menu.ts 에서 지워진 화면이다)")
print(f"\n화면 {len(ids)}개 / 매핑 {len(mapped)}개 · 어긋남 {len(miss)+len(extra)}건")
sys.exit(1 if (miss or extra) else 0)
