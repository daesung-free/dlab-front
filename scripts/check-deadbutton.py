import re, glob, io, sys
"""눌러도 아무 일이 없는 버튼. disabled 도 아니고 onClick 도 없으면 사용자는 고장으로 읽는다."""
bad=[]
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    src=io.open(p,encoding='utf-8').read()
    for m in re.finditer(r'<button\b', src):
        # 태그 끝까지. ★ `>` 가 JSX 식 안에 있을 수 있다(`at >= 0`, `a > b`) —
        #   중괄호 깊이를 세지 않으면 거기서 태그가 끊겨 뒤에 있는 onClick 을 못 본다
        i=m.start(); depth=0; j=i
        while j < len(src):
            c=src[j]
            if c=='{': depth+=1
            elif c=='}': depth-=1
            elif c=='>' and depth==0:
                break
            j+=1
        tag=src[i:j+1]
        if 'onClick' in tag or 'disabled' in tag or 'type="submit"' in tag:
            continue
        line=src[:i].count('\n')+1
        bad.append((p,line,' '.join(tag.split())[:90]))
for f,l,t in bad: print(f"{f}:{l}\n    {t}")
print(f"\n{len(bad)}곳")
sys.exit(1 if bad else 0)
