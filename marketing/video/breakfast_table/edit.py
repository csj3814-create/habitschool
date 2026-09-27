"""「아침 식탁」 편집 — 컷을 잘라 짧은 디졸브로 잇고, 기록 자막과 끝 문구를 얹는다.

    python marketing/video/breakfast_table/edit.py [ko|en]

클립은 Downloads\\해빛스쿨_홍보영상\\breakfast_table\\ 의 sNN.mp4 (Seedance 2.0 fast, 720x1280 5초)
와 calendar.mp4 (calendar_graphic.py). 결과: 같은 폴더 breakfast_table_{ko|en}.mp4
(1080x1920, 24fps, 무음 — 음악은 인스타 앱에서 붙인다).

v3 (2026-09-27 사용자 지적 반영): 키 재기는 머리 높이에 긋는 새 컷, 그네 대신 걷기만,
"기록하는 가족"(아침상 사진 + 해빛 도장 달력)과 "함께 걷는 70대 부부"를 넣어
기록 습관 → 건강 → 세대를 잇는 행복이 보이게 했다.
"""
import os
import subprocess
import sys

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\breakfast_table')
LANG = sys.argv[1] if len(sys.argv) > 1 else 'ko'

# (파일, 시작초, 길이초, 자막) — 컷마다 동작이 한 번에 읽히는 구간만.
CUTS = [
    ('s01b.mp4', 1.8, 2.8, False),      # 바랜 두 컵, 손을 포갬
    ('s02.mp4', 0.2, 2.3, False),       # 신혼, 탄 토스트 — 접시가 갑자기 생기기(2.5초) 전까지만
    ('s03.mp4', 0.4, 2.4, False),       # 아기 의자, 밥알
    ('s04v2.mp4', 0.3, 2.3, False),     # 딸 키 재기 — 머리 높이에 긋는 데까지
    ('s05.mp4', 0.8, 1.8, False),       # 바쁜 몇 년, 잠든 아빠
    ('s06.mp4', 0.2, 3.4, False),       # 딸의 그림 → 아빠가 보고 노트북을 닫음
    ('s12.mp4', 0.0, 3.0, True),        # 다음 날 아침, 아침상을 찍는 아빠와 딸
    ('calendar.mp4', 0.0, 3.5, True),   # 해빛 도장으로 채워지는 달력 → 1년
    ('s07v2.mp4', 0.0, 2.1, False),     # 셋이 손잡고 걷기 (들어 올리기 전까지만)
    ('s13.mp4', 0.3, 2.8, False),       # 함께 걷는 건강한 70대 부부
    ('s08.mp4', 0.8, 2.0, False),       # 어른이 된 딸이 아침을 차림
    ('s10v2.mp4', 1.2, 3.4, False),     # 손녀 키 재기, 엄마의 옛 줄 아래
    ('s09.mp4', 0.8, 3.2, False),       # 셋이 빛 속으로, 두 컵이 남음
]
XF = 0.35
END = 3.0
END_CARD = os.path.join(DIR, f'endcard_{LANG}.png')
CAPTION = os.path.join(DIR, f'caption_{LANG}.png')
OUT = os.path.join(DIR, f'breakfast_table_{LANG}.mp4')

inputs, chains = [], []
for i, (name, ss, dur, _) in enumerate(CUTS):
    inputs += ['-ss', str(ss), '-t', str(dur), '-i', os.path.join(DIR, name)]
    chains.append(f'[{i}:v]scale=1080:1920:flags=lanczos,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{i}]')
n = len(CUTS)
inputs += ['-loop', '1', '-t', str(END), '-i', END_CARD]
chains.append(f'[{n}:v]scale=1080:1920,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{n}]')
inputs += ['-loop', '1', '-i', CAPTION]

durs = [c[2] for c in CUTS] + [END]
starts = [0.0]
prev, length = 'v0', durs[0]
for i in range(1, n + 1):
    # 세월을 크게 건너뛸 때(산책 → 70대)와 끝 문구로 갈 때는 조금 길게 녹인다.
    xf = 0.7 if CUTS[i - 1][0] in ('s07v2.mp4',) or i == n else XF
    offset = length - xf
    chains.append(f'[{prev}][v{i}]xfade=transition=fade:duration={xf}:offset={offset:.3f}[x{i}]')
    starts.append(offset)
    length = offset + durs[i]
    prev = f'x{i}'

# 자막은 기록 장면(아침상 사진 + 달력)에만.
cap_idx = [i for i, c in enumerate(CUTS) if c[3]]
cap_from = starts[cap_idx[0]] + 0.3
cap_to = starts[cap_idx[-1]] + durs[cap_idx[-1]] - 0.2
chains.append(f'[{n + 1}:v]format=rgba,fade=t=in:st={cap_from:.2f}:d=0.3:alpha=1,fade=t=out:st={cap_to - 0.3:.2f}:d=0.3:alpha=1[cap]')
chains.append(f"[{prev}][cap]overlay=0:0:enable='between(t,{cap_from:.2f},{cap_to:.2f})':shortest=1[out]")
print(f'길이 {length:.1f}초, 자막 {cap_from:.1f}~{cap_to:.1f}초')

cmd = [FF, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[out]', '-t', f'{length:.2f}',
       '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]
subprocess.run(cmd, check=True)
print(OUT)
