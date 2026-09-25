import re, glob, io, sys
"""DataTable 은 selectable 만 주면 체크박스가 그려지되 **눌러도 안 찍힌다.**
   selected + onSelectedChange 가 있어야 켜진다."""
bad=[]
for p in sorted(glob.glob('src/**/*.tsx', recursive=True)):
    lines=io.open(p,encoding='utf-8').read().split('\n')
    for i,l in enumerate(lines):
        if l.strip()!='selectable': continue
        blk='\n'.join(lines[max(0,i-14):i+16])
        if 'onSelectedChange' not in blk:
            bad.append((p,i+1))
for f,n in bad: print(f"{f}:{n}  ← selectable 만 있고 onSelectedChange 가 없다")
print(f"\n{len(bad)}곳")
sys.exit(1 if bad else 0)
