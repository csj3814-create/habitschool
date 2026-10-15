"""플레이스토어 출시 영상 공통 그림 — 끝 카드, 자막.

    python marketing/video/play_launch/brand.py   # 끝 카드 png 미리 만들기

기존 기능 소개 영상(habitschool_01_intro 등)의 주황 햇살 끝 카드와 같은 틀에,
"Google Play에서 '해빛스쿨' 검색"을 가장 크게 둔다. 플레이 앱은 한국어·안드로이드 전용이라
아이폰은 웹 주소로 따로 안내한다(영문판에는 쓰지 않는다).
"""
import math
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
OUT_DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\play_launch')
B = 'C:/Windows/Fonts/malgunbd.ttf'
R = 'C:/Windows/Fonts/malgun.ttf'
INK = (92, 46, 10)


def font(p, s):
    return ImageFont.truetype(p, s)


def center(d, y, t, f, fill, W):
    d.text(((W - d.textlength(t, font=f)) / 2, y), t, font=f, fill=fill)


def sunburst(W, H, cy):
    """주황 바탕에 아이콘 뒤로 퍼지는 햇살."""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(255, int(196 - 50 * t), int(60 - 40 * t)))
    rays = Image.new('L', (W, H), 0)
    rd = ImageDraw.Draw(rays)
    cx, n, L = W / 2, 28, max(W, H) * 1.2
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = a0 + math.pi / n * 0.45
        rd.polygon([(cx, cy), (cx + L * math.cos(a0), cy + L * math.sin(a0)),
                    (cx + L * math.cos(a1), cy + L * math.sin(a1))], fill=70)
    rays = rays.filter(ImageFilter.GaussianBlur(6))
    im.paste((255, 236, 170), (0, 0), rays)
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse([cx - 420, cy - 420, cx + 420, cy + 420], fill=150)
    im.paste((255, 240, 190), (0, 0), glow.filter(ImageFilter.GaussianBlur(120)))
    return im


def play_triangle(d, x, y, s):
    """구글 플레이 느낌의 색 삼각형(공식 배지는 쓰지 않는다)."""
    d.polygon([(x, y), (x + s * 0.87, y + s / 2), (x, y + s)], fill=(52, 168, 83))
    d.polygon([(x, y), (x + s * 0.58, y + s * 0.33), (x, y + s / 2)], fill=(66, 133, 244))
    d.polygon([(x, y + s / 2), (x + s * 0.58, y + s * 0.67), (x, y + s)], fill=(234, 67, 53))
    d.polygon([(x + s * 0.58, y + s * 0.33), (x + s * 0.87, y + s / 2), (x + s * 0.58, y + s * 0.67)],
              fill=(251, 188, 5))


def endcard(W=1080, H=1920, line='오늘 한 끼만 찍어 보세요', note=None, badge=None):
    """세로(1080x1920) 또는 가로(1920x1080) 끝 카드.

    line: 한 줄 문자열 또는 줄 목록. note: 맨 아래 작은 글씨(예: 가상 인물 안내). badge: 맨 위 꼬리표.
    """
    tall = H > W
    k = 1.0 if tall else 0.72
    icon = int(330 * k)
    top = int(H * (0.21 if tall else 0.08))
    im = sunburst(W, H, top + icon / 2)
    d = ImageDraw.Draw(im)
    ic = Image.open(os.path.join(ROOT, 'icons', 'icon-512.png')).convert('RGBA').resize((icon, icon), Image.LANCZOS)
    sh = Image.new('L', (icon + 80, icon + 80), 0)
    ImageDraw.Draw(sh).rounded_rectangle([40, 50, icon + 40, icon + 50], int(icon * 0.22), fill=110)
    im.paste((150, 70, 0), ((W - icon) // 2 - 40, top - 40), sh.filter(ImageFilter.GaussianBlur(18)))
    im.paste(ic, ((W - icon) // 2, top), ic)
    y = top + icon + int(50 * k)
    center(d, y, '해빛스쿨', font(B, int(128 * k)), INK, W)
    y += int(170 * k)
    center(d, y, '응급의학과 전문의가 만든 무료 건강습관 앱', font(B, int(44 * k)), INK, W)
    y += int(110 * k)
    if badge:
        fb = font(B, int(34 * k))
        bw = d.textlength(badge, font=fb) + int(60 * k)
        d.rounded_rectangle([(W - bw) / 2, int(60 * k), (W + bw) / 2, int(60 * k) + int(64 * k)], int(32 * k),
                            fill=(255, 255, 255))
        center(d, int(60 * k) + int(8 * k), badge, fb, (230, 110, 0), W)
    for t in ([line] if isinstance(line, str) else line or []):
        if t:
            center(d, y, t, font(B, int(58 * k)), (255, 255, 255), W)
            y += int(84 * k)
    y += int(46 * k)
    # 플레이스토어 안내 — 가장 크게
    f = font(B, int(48 * k))
    t = "Google Play에서  '해빛스쿨'  검색"
    tw = d.textlength(t, font=f)
    tri = int(58 * k)
    pw = tw + tri + int(130 * k)
    ph = int(130 * k)
    x0 = (W - pw) / 2
    d.rounded_rectangle([x0, y, x0 + pw, y + ph], ph // 2, fill=(255, 255, 255))
    play_triangle(d, x0 + int(50 * k), y + (ph - tri) / 2, tri)
    d.text((x0 + int(50 * k) + tri + int(30 * k), y + (ph - int(48 * k)) / 2 - int(10 * k)), t, font=f, fill=INK)
    y += ph + int(40 * k)
    center(d, y, '아이폰은  habitschool.web.app', font(R, int(40 * k)), INK, W)
    if note:
        center(d, y + int(80 * k), note, font(R, int(34 * k)), INK, W)
    return im


def caption(lines, W=1080, H=1920, cy=None, size=68):
    """투명 바탕 자막. 반투명 띠 위 흰 글씨. cy 기본은 화면 아래 1/4 지점."""
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if not lines:
        return im
    d = ImageDraw.Draw(im)
    while size > 40 and max(d.textlength(t, font=font(B, size)) for t in lines) > W - 180:
        size -= 2   # 긴 줄은 띠가 화면 밖으로 나가지 않게 글자를 줄인다
    f, lh = font(B, size), int(size * 1.44)
    cy = int(H * 0.75) if cy is None else cy
    top = cy - (len(lines) * lh) // 2
    wmax = max(d.textlength(t, font=f) for t in lines)
    d.rounded_rectangle([(W - wmax) / 2 - 50, top - 30, (W + wmax) / 2 + 50, top + len(lines) * lh + 16],
                        40, fill=(0, 0, 0, 120))
    for i, t in enumerate(lines):
        d.text(((W - d.textlength(t, font=f)) / 2, top + i * lh), t, font=f, fill=(255, 255, 255),
               stroke_width=2, stroke_fill=(0, 0, 0))
    return im


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    endcard().save(os.path.join(OUT_DIR, 'endcard_9x16.png'))
    endcard(1920, 1080).save(os.path.join(OUT_DIR, 'endcard_16x9.png'))
    endcard(line='').save(os.path.join(OUT_DIR, 'endcard_9x16_plain.png'))
    print(OUT_DIR)
