# -*- coding: utf-8 -*-
"""
/play 공유 링크의 미리보기 이미지(icons/og-play.png, 1200x630)를 만든다.

플레이스토어 주소를 카톡에 그대로 붙이면 구글이 정한 미리보기가 나오고 우리가
바꿀 수 없다. 그래서 habitschool.web.app/play 를 공유하고, 그 페이지가 이 이미지를
og:image 로 내보낸 뒤 사람은 스토어로 넘긴다 (play.html).

실행: python scripts/generate_og_play.py
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = 'C:/SJ/antigravity/habitschool'
ICON = ROOT + '/icons/app-icon-512.png'
OUT  = ROOT + '/icons/og-play.png'
BOLD = 'C:/Windows/Fonts/malgunbd.ttf'
REG  = 'C:/Windows/Fonts/malgun.ttf'
W, H = 1200, 630


def gradient(size, top, bottom):
    img = Image.new('RGBA', size)
    d = ImageDraw.Draw(img)
    w, h = size
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)) + (255,))
    return img


def main():
    img = gradient((W, H), (255, 243, 214), (255, 214, 140))

    # 아이콘: 왼쪽, 은은한 그림자
    icon_size = 300
    ix, iy = 110, (H - icon_size) // 2
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        [ix + 6, iy + 14, ix + icon_size + 6, iy + icon_size + 14], radius=66, fill=(180, 90, 0, 90))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
    icon = Image.open(ICON).convert('RGBA').resize((icon_size, icon_size), Image.LANCZOS)
    img.paste(icon, (ix, iy), icon)

    d = ImageDraw.Draw(img)
    tx = ix + icon_size + 70

    d.text((tx, 150), '해빛스쿨', font=ImageFont.truetype(BOLD, 96), fill=(74, 40, 8))
    sub = ImageFont.truetype(REG, 38)
    d.text((tx, 272), '식단 · 운동 · 수면 기록으로', font=sub, fill=(110, 64, 20))
    d.text((tx, 322), '즐겁게 좋은 습관 만들기', font=sub, fill=(110, 64, 20))

    # 스토어 버튼 모양의 알약 (글자만, 구글 로고는 쓰지 않는다)
    label = 'Google Play에서 받기  ›'
    font = ImageFont.truetype(BOLD, 34)
    bb = d.textbbox((0, 0), label, font=font)
    bw, bh = bb[2] - bb[0] + 64, 76
    by = 410
    d.rounded_rectangle([tx, by, tx + bw, by + bh], radius=bh // 2, fill=(32, 33, 36))
    d.text((tx + 32, by + (bh - (bb[3] - bb[1])) // 2 - bb[1]), label, font=font, fill=(255, 255, 255))

    img.convert('RGB').save(OUT, optimize=True)
    print('saved:', OUT)


if __name__ == '__main__':
    main()
