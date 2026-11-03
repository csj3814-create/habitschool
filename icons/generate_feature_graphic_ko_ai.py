# -*- coding: utf-8 -*-
"""
플레이스토어 한국어 그래픽 이미지 (1024×500) — 새 앱 이름 「해빛스쿨: AI 식단 분석과 운동·수면 습관 기록」에 맞춘 판.
예전 판(feature-graphic-minimal.png)의 문구 "즐겁게 좋은 습관 만들기"는 옛 이름이다.

등록정보에 동영상이 있으면 플레이가 그래픽 한가운데 재생 단추를 얹는다. 그래서 가운데를 비우고
글은 왼쪽, 실제 앱 화면(식단 AI 분석)은 오른쪽에 둔다.
화면은 대표 본인 기록 캡처다(marketing/shots/2026-10-30_v563/02_diet_ai_analysis.jpg, 저장소 밖에 둔 캡처).
실행: python icons/generate_feature_graphic_ko_ai.py
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from PIL import Image, ImageDraw, ImageFilter, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
ICON = os.path.join(BASE, 'app-icon-512.png')
SHOT = os.path.join(ROOT, 'marketing', 'shots', '2026-10-30_v563', '02_diet_ai_analysis.jpg')
OUT = os.path.join(BASE, 'feature-graphic-ai-diet.png')
BOLD = 'C:/Windows/Fonts/malgunbd.ttf'
REG = 'C:/Windows/Fonts/malgun.ttf'
W, H = 1024, 500

BRAND = '해빛스쿨'
HEAD = ['사진 한 장이면', 'AI가 식단을 분석해요']
SUB = '운동·수면·마음까지, 매일 습관 기록'
BADGES = [('식단', '#FF6D00'), ('운동', '#E64A19'), ('수면', '#3949AB'), ('마음', '#512DA8')]
# 캡처에서 쓸 부분: 사과 사진 → A등급 → 자연식품 100%. 그 아래 음식 목록은 뺀다 — AI 가 사과 하나를
# '토마토'로 적어 두어서, 스토어 첫 그림에 오답이 보이게 된다. 작은 글씨도 스토어에서는 안 읽힌다.
CROP = (70, 95, 1010, 1010)


def gradient(size, top, bottom):
    img = Image.new('RGBA', size)
    w, h = size
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    return img


def rounded(im, radius):
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), mask)
    return out


def main():
    img = gradient((W, H), (255, 253, 248), (255, 236, 207))
    deco = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dd = ImageDraw.Draw(deco)
    for cx, cy, r in [(-110, -120, 230), (W + 70, H + 60, 260)]:
        dd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 205, 140, 70))
    img = Image.alpha_composite(img, deco)
    d = ImageDraw.Draw(img)

    # 왼쪽 글
    x = 60
    icon = Image.open(ICON).convert('RGBA').resize((64, 64), Image.LANCZOS)
    img.alpha_composite(icon, (x, 58))
    d.text((x + 80, 64), BRAND, font=ImageFont.truetype(BOLD, 36), fill='#4A2A0A')

    head_font = ImageFont.truetype(BOLD, 40)
    d.text((x, 160), HEAD[0], font=head_font, fill='#3E2410')
    d.text((x, 220), HEAD[1], font=head_font, fill='#E65100')
    d.text((x, 296), SUB, font=ImageFont.truetype(REG, 23), fill='#6D4C2F')

    bf = ImageFont.truetype(BOLD, 20)
    bx, by = x, 356
    for label, color in BADGES:
        bb = d.textbbox((0, 0), label, font=bf)
        bw, bh = bb[2] - bb[0] + 36, 40
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=bh // 2, fill=color)
        d.text((bx + 18 - bb[0], by + (bh - (bb[3] - bb[1])) // 2 - bb[1]), label, font=bf, fill='white')
        bx += bw + 12

    # 오른쪽 앱 화면 카드
    shot = Image.open(SHOT).convert('RGB').crop(CROP)
    card_h = 400
    card_w = round(shot.width * card_h / shot.height)
    shot = rounded(shot.resize((card_w, card_h), Image.LANCZOS).convert('RGBA'), 26)
    cx, cy = W - card_w - 64, (H - card_h) // 2
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([cx + 4, cy + 12, cx + card_w + 4, cy + card_h + 12], radius=28, fill=(120, 70, 20, 90))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(14)))
    ring = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle([cx - 6, cy - 6, cx + card_w + 6, cy + card_h + 6], radius=32, fill=(255, 255, 255, 255))
    img = Image.alpha_composite(img, ring)
    img.alpha_composite(shot, (cx, cy))

    img.convert('RGB').save(OUT, optimize=True)
    print(OUT, img.size, 'card', (cx, cy, card_w, card_h))


if __name__ == '__main__':
    main()
