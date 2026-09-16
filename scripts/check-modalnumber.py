import glob, io, sys
"""Modal 은 내용을 <form> 으로 감싸고 확인 버튼이 submit 이다.
   그 안 <input type="number"> 의 step 배수가 아닌 값은 **브라우저가 제출을 막는다.**
   화면에는 우리 오류가 안 뜨고(네이티브 말풍선이 잠깐 뜰 뿐) 버튼만 안 먹는 것처럼 보인다.
   step={100} · min={1} 에서 7,700 이 막혔다 — step 기준점이 min 이라 7,701 만 유효했다.
   소수가 필요하면 step="any" 를 쓴다."""
bad = []
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    depth = 0
    incomment = False
    for i, line in enumerate(io.open(p, encoding='utf-8').read().split('\n')):
        if incomment:
            if '*/' in line:
                incomment = False
            continue
        if '{/*' in line and '*/' not in line:
            incomment = True
            continue
        if '<Modal' in line:
            depth += 1
        if '</Modal>' in line:
            depth = max(0, depth - 1)
        if depth > 0 and 'step=' in line and 'step="any"' not in line:
            bad.append((p, i + 1))
for f, n in bad:
    print(f"{f}:{n}  ← Modal 안 number 입력의 step. 배수가 아닌 값은 저장이 막힌다")
print(f"\n{len(bad)}곳")
sys.exit(1 if bad else 0)
