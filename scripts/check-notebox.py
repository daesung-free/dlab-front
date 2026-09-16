import re, glob, io, sys
""".note-box 는 flex 다(styles/blocks.css). 글자와 <b> 를 나란히 두면 **각각이 칸이 되어**
   가운데가 세로로 눌린다 — .frow 와 같은 함정이다. 한 칸(.tx 나 div)에 묶어야 한다.

   글자만 있는 것(<div className="note-box">저장했습니다.</div>)은 칸이 하나라 괜찮다.
   태그로 시작하는 것(<div className="ic">…</div><div>…</div>)은 원래 쓰던 2칸 배치다."""
OPEN = re.compile(r'<div\s+className="note-box[^"]*"[^>]*>', re.S)
bad = []
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    src = io.open(p, encoding='utf-8').read()
    for m in OPEN.finditer(src):
        rest = src[m.end():]
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
