"""「아침 식탁」 1분 버전 — 30초판 컷을 길게 쓰고, 장면 이미지에 천천히 다가가는 움직임을 더한다.

    python marketing/video/breakfast_table/edit60.py [ko|en]

추가 생성 비용 없음. 재료는 Downloads\\해빛스쿨_홍보영상\\breakfast_table\\ 의
sNN.mp4, calendar.mp4, 장면 이미지 kN.png, endcard/caption png.
결과: breakfast_table_60_{ko|en}.mp4 (1080x1920, 24fps, 무음).
"""
import os
import subprocess
import sys

from PIL import Image

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\breakfast_table')
LANG = sys.argv[1] if len(sys.argv) > 1 else 'ko'
W, H, FPS = 1080, 1920, 24


def still(name, png, dur, box_from, box_to):
    """장면 이미지 한 장을 box_from → box_to 로 천천히 다가가는 영상으로 만든다 (box = 원본 좌표 x0,y0,x1,y1)."""
    out = os.path.join(DIR, f'{name}.mp4')
    if os.path.exists(out):
        return out
    frames = os.path.join(DIR, f'{name}_frames')
    os.makedirs(frames, exist_ok=True)
    src = Image.open(os.path.join(DIR, png)).convert('RGB')
    total = int(dur * FPS)
    for f in range(total):
        t = f / max(1, total - 1)
        t = t * t * (3 - 2 * t)  # 부드럽게 시작·끝
        box = [a + (b - a) * t for a, b in zip(box_from, box_to)]
        src.crop([int(v) for v in box]).resize((W, H), Image.LANCZOS).save(os.path.join(frames, f'{f:03d}.png'))
    subprocess.run([FF, '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(frames, '%03d.png'),
                    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], check=True)
    return out


def window_montage():
    """부엌 창밖 나무로 세월이 흐른다: 묘목 → 가을 밤 → 큰 나무. 장면마다 0.8초."""
    out = os.path.join(DIR, 'window_montage.mp4')
    if os.path.exists(out):
        return out
    frames = os.path.join(DIR, 'window_frames')
    os.makedirs(frames, exist_ok=True)
    # k3(벚꽃)는 뺀다 — 벚꽃 가지가 창틀 앞(부엌 안쪽)에 그려져 있다(2026-09-27 사용자 지적).
    seq = ['k2.png', 'k5.png', 'k8.png']
    per = int(0.8 * FPS)
    k = 0
    for i, png in enumerate(seq):
        src = Image.open(os.path.join(DIR, png)).convert('RGB')
        for f in range(per):
            z = 1 + 0.04 * f / per
            w, h = 700 / z, 1244 / z
            cx, cy = 330, 640
            img = src.crop((int(cx - w / 2), int(cy - h / 2), int(cx + w / 2), int(cy + h / 2))).resize((W, H), Image.LANCZOS)
            if i > 0 and f < 5:  # 앞 장면과 짧게 녹인다
                prev = Image.open(os.path.join(frames, f'{k - 1:03d}.png'))
                img = Image.blend(prev, img, (f + 1) / 6)
            img.save(os.path.join(frames, f'{k:03d}.png'))
            k += 1
    subprocess.run([FF, '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(frames, '%03d.png'),
                    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], check=True)
    return out


FULL = (0, 0, 1536, 2752)
drawing = still('drawing_zoom', 'k6.png', 2.6, FULL, (750, 1330, 1290, 2290))      # 딸의 그림으로 다가감
sunset = still('sunset_hold', 'k7.png', 2.4, (60, 110, 1476, 2642), FULL)          # 노을 산책, 천천히 물러남
window = window_montage()

# (파일, 시작초, 길이초, 자막)
CUTS = [
    ('s01b.mp4', 0.3, 4.6, False),      # 바랜 두 컵, 손을 포갬
    ('s02.mp4', 0.2, 2.3, False),       # 신혼, 탄 토스트 — 접시가 갑자기 생기기(2.5초) 전까지만
    ('s03.mp4', 0.2, 4.4, False),       # 아기 의자, 밥알
    ('s04v2.mp4', 0.2, 2.4, False),     # 딸 키 재기 (머리 높이에 긋는 데까지)
    ('s05.mp4', 0.2, 4.4, False),       # 바쁜 몇 년, 잠든 아빠
    (drawing, 0.0, 2.6, False),         # 딸의 그림
    ('s06.mp4', 0.2, 4.6, False),       # 아빠가 깨어 그림을 보고 노트북을 닫음
    ('s12.mp4', 0.0, 4.9, True),        # 다음 날 아침, 아침상을 찍는 아빠와 딸
    ('calendar.mp4', 0.0, 3.5, True),   # 해빛 도장 달력 → 1년
    (sunset, 0.0, 2.4, False),          # 노을 산책
    ('s07v2.mp4', 0.0, 2.1, False),     # 셋이 손잡고 걷기
    (window, 0.0, 2.4, False),          # 창밖 나무로 25년이 흐름
    ('s13.mp4', 0.2, 4.6, False),       # 함께 걷는 70대 부부
    ('s08.mp4', 0.3, 4.4, False),       # 어른이 된 딸이 아침을 차림
    ('s10v2.mp4', 0.5, 4.3, False),     # 손녀 키 재기, 엄마의 옛 줄 아래
    ('s09.mp4', 0.3, 4.6, False),       # 셋이 빛 속으로, 두 컵이 남음
]
XF = 0.45
END = 3.5
END_CARD = os.path.join(DIR, f'endcard_{LANG}.png')
CAPTION = os.path.join(DIR, f'caption_{LANG}.png')
OUT = os.path.join(DIR, f'breakfast_table_60_{LANG}.mp4')

inputs, chains = [], []
for i, (name, ss, dur, _) in enumerate(CUTS):
    path = name if os.path.isabs(name) else os.path.join(DIR, name)
    inputs += ['-ss', str(ss), '-t', str(dur), '-i', path]
    chains.append(f'[{i}:v]scale=1080:1920:flags=lanczos,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{i}]')
n = len(CUTS)
inputs += ['-loop', '1', '-t', str(END), '-i', END_CARD]
chains.append(f'[{n}:v]scale=1080:1920,setsar=1,fps=24,format=yuv420p,settb=AVTB[v{n}]')
inputs += ['-loop', '1', '-i', CAPTION]

durs = [c[2] for c in CUTS] + [END]
starts = [0.0]
prev, length = 'v0', durs[0]
for i in range(1, n + 1):
    xf = 0.8 if i == n else XF
    offset = length - xf
    chains.append(f'[{prev}][v{i}]xfade=transition=fade:duration={xf}:offset={offset:.3f}[x{i}]')
    starts.append(offset)
    length = offset + durs[i]
    prev = f'x{i}'

cap_idx = [i for i, c in enumerate(CUTS) if c[3]]
cap_from = starts[cap_idx[0]] + 0.4
cap_to = starts[cap_idx[-1]] + durs[cap_idx[-1]] - 0.2
chains.append(f'[{n + 1}:v]format=rgba,fade=t=in:st={cap_from:.2f}:d=0.3:alpha=1,fade=t=out:st={cap_to - 0.3:.2f}:d=0.3:alpha=1[cap]')
chains.append(f"[{prev}][cap]overlay=0:0:enable='between(t,{cap_from:.2f},{cap_to:.2f})':shortest=1[out]")
print(f'길이 {length:.1f}초, 자막 {cap_from:.1f}~{cap_to:.1f}초')

cmd = [FF, '-v', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', '[out]', '-t', f'{length:.2f}',
       '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT]
subprocess.run(cmd, check=True)
print(OUT)
