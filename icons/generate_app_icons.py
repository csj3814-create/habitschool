# -*- coding: utf-8 -*-
"""
런처 아이콘(어댑티브) 전경/모노크롬 레이어와 알림 배지를 생성한다.
실행: python icons/generate_app_icons.py

왜 필요한가
- 어댑티브 아이콘의 전경 레이어는 108dp 캔버스이고 가운데 72dp 원 안쪽만 안전 영역이다.
  기존에는 512px 정사각 앱 아이콘(배경·문구 포함)을 그대로 전경으로 써서, 마스크가
  가장자리를 잘라내 얼굴만 확대돼 보였다. 여기서는 배경/문구를 뺀 해 그림만 안전 영역
  안에 그려 넣는다.
- 알림 작은 아이콘(badge)은 안드로이드가 알파 채널만 읽어 실루엣으로 그린다. 불투명한
  컬러 PNG를 주면 흰 사각형이 된다. 그래서 투명 배경 + 흰색 실루엣을 따로 만든다.
"""
import math
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
ANDROID_RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

SS = 4  # 슈퍼샘플링 배수 (안티에일리어싱)


def _pt(x, y, cx, cy, scale, ox, oy):
    """원본 아이콘 좌표(512 기준)를 출력 캔버스 좌표로 옮긴다."""
    return (ox + (x - cx) * scale, oy + (y - cy) * scale)


def _rotate(px, py, deg):
    rad = math.radians(deg)
    return (px * math.cos(rad) - py * math.sin(rad),
            px * math.sin(rad) + py * math.cos(rad))


def _ellipse_points(cx, cy, rx, ry, rot_deg=0.0, steps=96):
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x, y = rx * math.cos(t), ry * math.sin(t)
        x, y = _rotate(x, y, rot_deg)
        pts.append((cx + x, cy + y))
    return pts


def _quad_points(p0, p1, p2, steps=48):
    pts = []
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        pts.append((u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
                    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]))
    return pts


def draw_sun(size, art_diameter_ratio, mono=False):
    """해 그림(광선 + 얼굴)을 투명 캔버스에 그린다.

    art_diameter_ratio: 캔버스 한 변 대비 그림 지름 비율.
      어댑티브 전경은 안전 영역 72dp보다 약간 작은 70/108, 알림 배지는 여백을 더 둔다.
    mono=True면 알파만 쓰는 흰색 실루엣으로 그린다(알림 배지·테마 아이콘용).
    """
    n = size * SS
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')

    # 원본 SVG(icon-512.svg) 좌표계: 해 중심 (256,250), 광선 끝 반지름 230
    src_cx, src_cy, src_r = 256.0, 250.0, 230.0
    scale = (n * art_diameter_ratio / 2) / src_r
    ox = oy = n / 2

    def P(x, y):
        return _pt(x, y, src_cx, src_cy, scale, ox, oy)

    def L(px, py):  # 해 중심 기준 로컬 좌표
        return P(src_cx + px, src_cy + py)

    WHITE = (255, 255, 255, 255)

    # 1) 긴 광선 8개
    ray_fill = WHITE if mono else (255, 243, 224, 179)
    for k in range(8):
        tri = [(0, -230), (20, -155), (-20, -155)]
        d.polygon([L(*_rotate(x, y, k * 45)) for x, y in tri], fill=ray_fill)

    # 2) 짧은 광선 8개
    short_fill = WHITE if mono else (255, 204, 128, 128)
    for k in range(8):
        pts = _ellipse_points(0, -190, 14, 35)
        d.polygon([L(*_rotate(x, y, 22.5 + k * 45)) for x, y in pts], fill=short_fill)

    face_r = 130.0
    if mono:
        # 실루엣은 얼굴을 단색 원으로 채운다(표정은 작은 크기에서 뭉개진다).
        x0, y0 = L(-face_r, -face_r)
        x1, y1 = L(face_r, face_r)
        d.ellipse([x0, y0, x1, y1], fill=WHITE)
        return img.resize((size, size), Image.LANCZOS)

    # 3) 얼굴 원 — 방사형 그라데이션(#FFEE58 → #FFB300)을 동심원으로 근사
    gx, gy = L(0, -face_r * 0.1)  # SVG 그라데이션 중심(cy 45%)에 맞춘다
    steps = 120
    for i in range(steps, 0, -1):
        t = i / steps
        r = face_r * scale * t
        # t=1(가장자리) → #FFB300, t=0(중심) → #FFEE58
        col = (255, int(238 + (179 - 238) * t), int(88 + (0 - 88) * t), 255)
        d.ellipse([gx - r, gy - r, gx + r, gy + r], fill=col)
    # 얼굴 테두리
    fx0, fy0 = L(-face_r, -face_r)
    fx1, fy1 = L(face_r, face_r)
    d.ellipse([fx0, fy0, fx1, fy1], outline=(249, 168, 37, 255),
              width=max(1, int(4 * scale)))

    # 4) 볼
    for cx in (188, 324):
        x0, y0 = P(cx - 26, 282 - 26)
        x1, y1 = P(cx + 26, 282 + 26)
        d.ellipse([x0, y0, x1, y1], fill=(255, 138, 101, 89))

    # 5) 눈 + 하이라이트
    for cx in (218, 294):
        x0, y0 = P(cx - 13, 235 - 16)
        x1, y1 = P(cx + 13, 235 + 16)
        d.ellipse([x0, y0, x1, y1], fill=(93, 64, 55, 255))
    for cx in (222, 298):
        x0, y0 = P(cx - 5, 229 - 5)
        x1, y1 = P(cx + 5, 229 + 5)
        d.ellipse([x0, y0, x1, y1], fill=(255, 255, 255, 204))

    # 6) 입 (미소)
    mouth = _quad_points((224, 276), (256, 310), (288, 276))
    d.line([P(x, y) for x, y in mouth], fill=(93, 64, 55, 255),
           width=max(1, int(6 * scale)), joint='curve')

    return img.resize((size, size), Image.LANCZOS)


def main():
    outputs = []

    # 어댑티브 아이콘 전경: 108dp 캔버스를 xxxhdpi(4x)인 432px로 만들고
    # 그림은 안전 영역(72dp = 288px) 안에 둔다.
    fg = draw_sun(432, 70 / 108)
    fg_path = os.path.join(ANDROID_RES, 'mipmap-nodpi', 'ic_launcher_foreground_actual.png')
    fg.save(fg_path)
    outputs.append(fg_path)

    # Android 13+ 테마 아이콘용 모노크롬 레이어(알파만 사용된다)
    mono = draw_sun(432, 70 / 108, mono=True)
    mono_path = os.path.join(ANDROID_RES, 'mipmap-nodpi', 'ic_launcher_monochrome.png')
    mono.save(mono_path)
    outputs.append(mono_path)

    # 웹푸시 알림 배지(작은 아이콘): 흰색 실루엣 + 투명 배경
    badge = draw_sun(96, 0.86, mono=True)
    badge_path = os.path.join(BASE, 'notification-badge.png')
    badge.save(badge_path)
    outputs.append(badge_path)

    for path in outputs:
        img = Image.open(path)
        print(f'{os.path.relpath(path, ROOT)} {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
