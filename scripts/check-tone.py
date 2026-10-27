"""화면 문구 점검 — 일상적 표현이 남아 있는지 찾는다 (2026-10-27 기준서).

   ★ **존댓말 여부가 아니라 표현 자체를 본다.** '~합니다' 로 끝나도 「나갑니다」·「붙습니다」
     처럼 일상적인 말이면 대상이다.

   ★ 주석은 화면이 아니다 — 설계 근거는 주석에 남기므로(CLAUDE.md 1-1) 건너뛴다.
   ★ 공개 페이지(학부모 대상)는 **사용자가 확정한 문안**이라 건너뛴다.
"""
import re, io, sys, glob, os

# 화면이 아닌 것
SKIP_FILES = {
    'PublicWaitlist.tsx', 'PublicNotice.tsx', 'PublicOnly.tsx', 'DoorPublic.tsx',
    'SpecHub.tsx',          # 개발 빌드 전용
}

# 기준서 9항의 재검색 목록 + 같은 결의 표현
PATTERNS = [
    (r'나갑니다|나가므로|나간다면', '발송됩니다'),
    (r'붙습니다|붙은 뒤', '등록됩니다'),
    (r'잡힙니다|잡아', '반영됩니다'),
    (r'묶입니다', '통합됩니다'),
    (r'채워집니다|채워 둔|채워 두', '자동 입력됩니다'),
    (r'넘어갑니다|넘어갔', '이관됩니다'),
    (r'끊었습니다|끊깁니다|끊어', '해제되었습니다'),
    (r'뗄까요|떼어', '연결 해제'),
    (r'고른 |고르세요|골라|고를 ', '선택'),
    (r'고칩니다|고칠 수|고쳐', '수정'),
    (r'따라옵니다|따라오지', '복제'),
    (r'손대지 않으면|그대로 둡니다', '유지'),
    (r'건너뜁니다|건너뛴다면', '제외됩니다'),
    (r'올릴 수 있습니다', '첨부할 수 있습니다'),
    (r'닫습니다|닫히지', '해지'),
    (r'씁니다|쓰면', '사용'),
    (r'적으세요|적습니다', '입력'),
    # ── 2차(2026-10-27 화면 확인 중 추가)
    (r'빠집니다|빠진다면', '제외됩니다'),
    (r'막힙니다', '차단됩니다'),
    (r'생깁니다', '생성됩니다'),
    (r'내려받습니다|내려받을', '다운로드'),
    (r'띄웁니다', '표시합니다'),
    (r'걸러', '필터'),
]
COMPILED = [(re.compile(p), hint) for p, hint in PATTERNS]

# JSX/문자열 안의 한글 문구만 본다 — 변수명·API 필드는 대상이 아니다
HANGUL = re.compile(r'[가-힣]')


def strip_comments(src: str) -> list[str]:
    """주석을 빈 줄로 바꿔 돌려준다.

    ★ **여는 줄만 보고 걸러서는 안 된다.** 이 레포 주석은 여러 줄이고 이어지는 줄이
      `*` 로 시작하지 않는 경우가 많아, 설계 근거가 화면 문구로 잘못 잡혔다(오탐 13건).
    """
    out, in_block = [], False
    for line in src.split('\n'):
        s = line.strip()
        if in_block:
            out.append('')
            if '*/' in line:
                in_block = False
            continue
        if s.startswith('//'):
            out.append(''); continue
        if '/*' in line and '*/' not in line:
            out.append(line[:line.index('/*')])
            in_block = True
            continue
        if '/*' in line and '*/' in line:          # 한 줄 주석
            out.append(line[:line.index('/*')] + line[line.index('*/') + 2:])
            continue
        out.append(line)
    return out


def main() -> int:
    hits = []
    for path in sorted(glob.glob('src/pages/**/*.tsx', recursive=True)):
        if os.path.basename(path) in SKIP_FILES:
            continue
        src = io.open(path, encoding='utf-8').read()
        for i, line in enumerate(strip_comments(src), 1):
            if not HANGUL.search(line):
                continue
            for rx, hint in COMPILED:
                m = rx.search(line)
                if m:
                    hits.append((path, i, m.group(0), hint, line.strip()[:90]))
                    break
    for path, i, found, hint, text in hits:
        print(f'{path}:{i}  「{found}」 → {hint}\n    {text}')
    print(f'\n{len(hits)}곳')
    return 1 if hits else 0


if __name__ == '__main__':
    sys.exit(main())
