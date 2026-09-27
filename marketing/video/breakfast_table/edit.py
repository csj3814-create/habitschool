"""「아침 식탁」 30초 편집 — 컷을 잘라 짧은 디졸브로 잇고 끝 문구를 붙인다.

    python marketing/video/breakfast_table/edit.py [ko|en]

클립은 Downloads\\해빛스쿨_홍보영상\\breakfast_table\\ 의 sNN.mp4 (Seedance 2.0 fast, 720x1280 5초).
결과: 같은 폴더 breakfast_table_{ko|en}.mp4 (1080x1920, 24fps, 무음 — 음악은 인스타 앱에서 붙인다).
"""
import os
import subprocess
import sys

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\breakfast_table')
LANG = sys.argv[1] if len(sys.argv) > 1 else 'ko'

# (파일, 시작초, 길이초) — 컷마다 동작이 한 번에 읽히는 구간만.
CUTS = [
    ('s01b.mp4', 1.8, 2.8),  # 주름진 두 손, 바랜 컵, 손을 포갬
    ('s02.mp4', 1.2, 3.3),   # 신혼, 탄 토스트를 아내가 대신 먹음
    ('s03.mp4', 0.4, 2.8),   # 아기 의자, 밥알
    ('s04.mp4', 0.3, 3.2),   # 딸 키 재기, 까치발
    ('s05.mp4', 0.8, 2.6),   # 바쁜 몇 년, 식탁에서 잠든 아빠
    ('s06.mp4', 0.2, 4.2),   # 딸의 그림, 아빠가 깨어 보고 노트북을 닫음
    ('s07.mp4', 0.4, 3.3),   # 저녁 산책, 그네
    ('s08.mp4', 0.8, 3.0),   # 어른이 된 딸이 아침을 차림
    ('s10.mp4', 0.3, 3.4),   # 손녀 키 재기, 엄마의 옛 줄 아래
    ('s09.mp4', 0.8, 4.0),   # 셋이 빛 속으로, 두 컵이 남음 (1번과 이어짐)
]
XF = 0.35        # 컷 사이 디졸브
END = 2.6        # 끝 문구 길이
END_CARD = os.path.join(DIR, f'endcard_{LANG}.png')
OUT = os.path.join(DIR, f'breakfast_table_{LANG}.mp4')

inputs, chains = [], []
for i, (name, ss, dur) in enumerate(CUTS):
    inputs += ['-ss', str(ss), '-t', str(dur), '-i', os.path.join(DIR, name)]
    chains.append(f'[{i}:v]scale=1080:1920:flags=lanczos,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{i}]')
n = len(CUTS)
inputs += ['-loop', '1', '-t', str(END), '-i', END_CARD]
chains.append(f'[{n}:v]scale=1080:1920,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{n}]')

durs = [c[2] for c in CUTS] + [END]
prev, length = 'v0', durs[0]
for i in range(1, n + 1):
    # 어른이 된 딸로 건너갈 때(25년)와 끝 문구로 갈 때는 조금 길게 녹인다.
    xf = 0.7 if CUTS[i - 1][0] == 's07.mp4' or i == n else XF
    offset = length - xf
    chains.append(f'[{prev}][v{i}]xfade=transition=fade:duration={xf}:offset={offset:.3f}[x{i}]')
    length = offset + durs[i]
    prev = f'x{i}'
print(f'길이 {length:.1f}초')

cmd = [FF, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{prev}]',
       '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]
subprocess.run(cmd, check=True)
print(OUT)
