"""체성분 쇼츠 편집 — AI 정지 이미지와 앱 캡처를 천천히 움직이고, 자막을 얹어 잇는다.

    python marketing/video/body_composition/edit.py

AI 이미지는 Downloads\\해빛스쿨_홍보영상\\body_composition\\ 의 k01.png ~ k04.png (storyboard.md 지시문).
없는 이미지는 회색 임시 그림으로 대신해서 흐름만 먼저 볼 수 있다.
결과: 같은 폴더 body_composition_ko.mp4 (1080x1920, 24fps, 무음 — 음악은 앱에서 붙인다).
"""
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont, ImageOps

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
CAP = os.path.join(ROOT, 'marketing', 'posts', '05_body_composition', 'captures')
DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\body_composition')
WORK = os.path.join(DIR, 'frames')
OUT = os.path.join(DIR, 'body_composition_ko.mp4')
W, H, FPS = 1080, 1920, 24
B = 'C:/Windows/Fonts/malgunbd.ttf'
R = 'C:/Windows/Fonts/malgun.ttf'
font = lambda p, s: ImageFont.truetype(p, s)

# (종류, 파일, 길이초, 자막 줄들[, 자막 가운데 y — 기본 1440])
SCENES = [
    ('ai', 'k01.png', 3.0, ['인바디 결과지,', '어디 두셨어요?']),
    ('ai', 'k02.png', 3.2, ['석 달 뒤에 다시 재도', '지난번 숫자가 없으면', '비교를 못 하잖아요']),
    ('ai', 'k03.png', 2.6, ['사진 한 장 올리시면']),
    ('cap', '02_인바디결과지_사진인식.jpg', 4.2, ['AI가 읽어서 칸을 채워 드려요', '저장은 숫자 보시고 직접']),
    ('cap', '05_인바디_변화추이.jpg', 3.6, ['잴 때마다', '날짜별로 쌓여요']),
    ('ai', 'k04.png', 3.2, ['같은 기기로,', '같은 시간에 재 주세요'], 520),
    ('end', None, 3.0, []),
]
XF = 0.4


def placeholder(name):
    im = Image.new('RGB', (W, H), (70, 80, 90))
    d = ImageDraw.Draw(im)
    t = f'{name} 자리 (AI 이미지)'
    d.text(((W - d.textlength(t, font=font(B, 56))) / 2, H / 2 - 40), t, font=font(B, 56), fill=(200, 210, 220))
    return im


def gradient():
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(20 + 20 * t), int(110 + 60 * t), int(170 + 40 * t)))
    return im


def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, *img.size], r, fill=255)
    return img, m


def base(kind, name):
    """움직일 바탕 그림 (1080x1920)."""
    if kind == 'ai':
        p = os.path.join(DIR, name)
        im = Image.open(p).convert('RGB') if os.path.exists(p) else placeholder(name)
        return ImageOps.fit(im, (W, H), Image.LANCZOS)
    if kind == 'cap':
        im = gradient()
        shot = Image.open(os.path.join(CAP, name)).convert('RGB')
        # 자막 자리(아래 600px)를 비우고 위쪽에 캡처를 크게 둔다.
        box_w, box_h = W - 140, 1080
        s = min(box_w / shot.width, box_h / shot.height)
        shot = shot.resize((int(shot.width * s), int(shot.height * s)), Image.LANCZOS)
        x, y = (W - shot.width) // 2, 150 + (box_h - shot.height) // 2
        shadow = Image.new('L', (shot.width + 40, shot.height + 40), 0)
        ImageDraw.Draw(shadow).rounded_rectangle([20, 24, shot.width + 20, shot.height + 24], 36, fill=90)
        im.paste((10, 40, 70), (x - 20, y - 20), shadow)
        img, m = rounded(shot, 32)
        im.paste(img, (x, y), m)
        return im
    # 끝 카드
    im = gradient()
    d = ImageDraw.Draw(im)
    ic = Image.open(os.path.join(ROOT, 'icons', 'icon-512.png')).convert('RGBA').resize((300, 300))
    im.paste(ic, ((W - 300) // 2, 560), ic)
    for y, t, f, c in [(920, '해빛스쿨', font(B, 96), (255, 255, 255)),
                       (1070, '체성분 결과지 한 장부터', font(R, 52), (230, 245, 255)),
                       (1150, '프로필 링크에서 시작하세요', font(B, 52), (255, 240, 180))]:
        d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=c)
    return im


def caption(lines, cy=1440):
    """투명 바탕 자막 (아래쪽, 반투명 띠 위 흰 글씨)."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if not lines:
        return im
    d = ImageDraw.Draw(im)
    f, lh = font(B, 68), 98
    top = cy - (len(lines) - 1) * lh // 2
    wmax = max(d.textlength(t, font=f) for t in lines)
    d.rounded_rectangle([(W - wmax) / 2 - 50, top - 36, (W + wmax) / 2 + 50, top + len(lines) * lh + 10],
                        40, fill=(0, 0, 0, 120))
    for i, t in enumerate(lines):
        x, y = (W - d.textlength(t, font=f)) / 2, top + i * lh
        d.text((x, y), t, font=f, fill=(255, 255, 255), stroke_width=2, stroke_fill=(0, 0, 0))
    return im


def main():
    os.makedirs(WORK, exist_ok=True)
    inputs, chains = [], []
    for i, (kind, name, dur, lines, *pos) in enumerate(SCENES):
        bp, cp = os.path.join(WORK, f'b{i}.png'), os.path.join(WORK, f'c{i}.png')
        base(kind, name).save(bp)
        caption(lines, *pos).save(cp)
        frames = int(round(dur * FPS))
        # 아주 느린 확대. 짝수 장면은 위로, 홀수 장면은 아래로 살짝 흘려서 단조롭지 않게.
        zmax = 1.0 if kind == 'end' else 1.07
        ydir = '0' if i % 2 else '(ih-ih/zoom)'
        inputs += ['-loop', '1', '-t', str(dur), '-i', bp, '-loop', '1', '-t', str(dur), '-i', cp]
        chains.append(
            f'[{2 * i}:v]scale={W * 2}:{H * 2},'
            f"zoompan=z='1+({zmax}-1)*on/{frames}':x='(iw-iw/zoom)/2':y='{ydir}*on/{frames}'"
            f':d=1:s={W}x{H}:fps={FPS},setsar=1[z{i}];'
            f'[z{i}][{2 * i + 1}:v]overlay=0:0,format=yuv420p,settb=AVTB,trim=duration={dur}[v{i}]')
    prev, length = 'v0', SCENES[0][2]
    for i in range(1, len(SCENES)):
        offset = length - XF
        chains.append(f'[{prev}][v{i}]xfade=transition=fade:duration={XF}:offset={offset:.3f}[x{i}]')
        prev, length = f'x{i}', offset + SCENES[i][2]
    cmd = [FF, '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{prev}]',
           '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-r', str(FPS),
           '-movflags', '+faststart', OUT]
    subprocess.run(cmd, check=True)
    print(OUT, f'{length:.1f}s')


if __name__ == '__main__':
    main()
