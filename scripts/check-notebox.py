import re, glob, io, sys
""".note-box 는 flex 다(styles/blocks.css). 글자와 <b> 를 나란히 두면 **각각이 칸이 되어**
   가운데가 세로로 눌린다 — .frow 와 같은 함정이다. 한 칸(.tx 나 div)에 묶어야 한다.

   글자만 있는 것(<div className="note-box">저장했습니다.</div>)은 칸이 하나라 괜찮다.
   태그로 시작하는 것(<div className="ic">…</div><div>…</div>)은 원래 쓰던 2칸 배치다."""
# ★ 여는 태그 끝 `>` 를 찾을 때 **중괄호 안은 건너뛴다** — `style={x > 0 ? …}` 의 `>` 를
#   태그 끝으로 읽어 오탐이 났다(2026-10-27·29 두 번). 속성 값이 JSX 식일 때 생긴다.
ATTR_START = re.compile(r'<div\s+className="note-box[^"]*"')


def open_tag_end(src: str, start: int) -> int:
    """여는 태그의 `>` 위치. 중괄호 깊이를 세어 식 안의 `>` 를 넘긴다. 못 찾으면 -1"""
    depth = 0
    for i in range(start, min(len(src), start + 4000)):
        c = src[i]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
        elif c == '>' and depth == 0:
            return i
    return -1
bad = []
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    src = io.open(p, encoding='utf-8').read()
    for m in ATTR_START.finditer(src):
        end_i = open_tag_end(src, m.end())
        if end_i < 0:
            continue
        rest = src[end_i + 1:]
        end = rest.find('</div>')
        # 자식이 중첩되면 첫 </div> 가 내 것이 아니다 — 시작 부분만 보면 충분하다
        head = rest[:end if end > 0 else 200]
        stripped = head.lstrip()
        if stripped[:1] in ('<', '{', ''):
            continue                      # 태그·표현식으로 시작하면 원래 배치다
        if re.search(r'<(b|span|strong|code)\b', head):
            bad.append((p, src[:m.start()].count('\n') + 1))
for f, n in bad:
    print(f"{f}:{n}  ← note-box 안에서 글자와 태그가 형제다. <div> 로 묶는다")
print(f"\n{len(bad)}곳")
sys.exit(1 if bad else 0)
