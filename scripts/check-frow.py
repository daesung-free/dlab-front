import re, glob, io, sys
"""`.frow` 는 `112px 1fr` 2열 그리드다. 직계 자식이 2개(라벨+컨트롤)를 넘으면
셋째부터 라벨 칸으로 떨어져 왼쪽에 눌려 붙는다. 안내문은 컨트롤과 한 칸에 넣어야 한다."""
bad = []
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    lines = io.open(p, encoding='utf-8').read().split('\n')
    i = 0
    while i < len(lines):
        if not re.search(r'<div className="frow[" ]', lines[i]):
            i += 1; continue
        base = len(lines[i]) - len(lines[i].lstrip())
        j, has_label, direct_hint = i + 1, False, None
        while j < len(lines):
            ln, st = lines[j], lines[j].strip()
            ind = len(ln) - len(ln.lstrip())
            if st.startswith('</div>') and ind == base:
                break
            if ind == base + 2:
                if st.startswith('<label'):
                    has_label = True
                # 직계 자식으로 놓인 안내문 — 라벨 칸으로 떨어진다
                if 'className="hint' in st and st.startswith('<div'):
                    direct_hint = j + 1
                if st.startswith('{') and 'className="hint' in st:
                    direct_hint = j + 1
            j += 1
        if direct_hint:
            bad.append((p, i + 1, direct_hint, has_label))
        i = j + 1
for f, frow, hint, lab in bad:
    print(f"{f}:{hint}   (frow {frow} · label {'있음' if lab else '없음'})")
print(f"\n{len(bad)}곳")
sys.exit(1 if bad else 0)
