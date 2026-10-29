# -*- coding: utf-8 -*-
"""
플레이스토어 영어(en-US) 등록정보용 그래픽 이미지 (1024×500).
한국어 판(feature-graphic-minimal.png, generate_images.py)과 같은 배치·색에
글자만 영어로, 아이콘은 글자 없는 해 아이콘(app-icon-512.png)으로.
실행: python icons/generate_feature_graphic_en.py
"""
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

from PIL import Image, ImageDraw, ImageFont

BASE = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(BASE, 'app-icon-512.png')
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'
SEMI = 'C:/Windows/Fonts/seguisb.ttf'
W, H = 1024, 500

TITLE = 'Habit School'
TAGLINE = 'Better habits, one day at a time.'
BADGES = [('Food', '#FF6D00', '#FFF3E0'), ('Exercise', '#E64A19', '#FBE9E7'), ('Mind', '#512DA8', '#EDE7F6')]
# 쿠폰은 한국 전용이라 영어 판에서 약속하지 않는다(tasks/2026-10-30_play_store_english_listing.md).
BOTTOM = 'Snap a photo, get AI feedback, keep going together.'


def gradient(size, top, bottom):
    img = Image.new('RGBA', size)
    w, h = size
    draw = ImageDraw.Draw(img)
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    return img


def centered(draw, text, y, font, fill):
    bb = draw.textbbox((0, 0), text, font=font)
    draw.text(((W - (bb[2] - bb[0])) // 2 - bb[0], y), text, font=font, fill=fill)


def draw_badges(draw, y, font):
    pad_x, pad_y, gap = 24, 9, 18
    sizes = []
    for label, _, _ in BADGES:
        bb = draw.textbbox((0, 0), label, font=font)
        sizes.append((bb[2] - bb[0] + pad_x * 2, bb[3] - bb[1] + pad_y * 2, bb))
    x = (W - (sum(s[0] for s in sizes) + gap * (len(sizes) - 1))) // 2
    for (label, bg, fg), (bw, bh, bb) in zip(BADGES, sizes):
        draw.rounded_rectangle([x, y, x + bw, y + bh], radius=bh // 2, fill=bg)
        draw.text((x + pad_x - bb[0], y + pad_y - bb[1]), label, font=font, fill=fg)
        x += bw + gap


def main():
    img = gradient((W, H), (255, 255, 255), (255, 243, 224))
    overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    for cx, cy, r in [(-90, -90, 200), (W + 50, -80, 190), (-80, H + 60, 210), (W + 60, H + 40, 200)]:
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 160, 0, 20))
    img = Image.alpha_composite(img, overlay)

    icon = Image.open(ICON).convert('RGBA').resize((132, 132), Image.LANCZOS)
    img.paste(icon, (W // 2 - 66, 148 - 66 - 12), icon)

    draw = ImageDraw.Draw(img)
    centered(draw, TITLE, 214, ImageFont.truetype(BOLD, 66), '#3E1F00')
    centered(draw, TAGLINE, 302, ImageFont.truetype(SEMI, 30), '#E65100')
    draw_badges(draw, 360, ImageFont.truetype(BOLD, 22))
    centered(draw, BOTTOM, 432, ImageFont.truetype(SEMI, 22), '#BF360C')

    out = os.path.join(BASE, 'feature-graphic-en.png')
    img.convert('RGB').save(out, 'PNG', optimize=True)
    print(f'saved: {out} ({W}x{H})')


if __name__ == '__main__':
    main()
