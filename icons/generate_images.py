# -*- coding: utf-8 -*-
"""
feature-graphic 다양한 버전 생성 스크립트
실행: python generate_images.py
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

from PIL import Image, ImageDraw, ImageFont

BASE    = 'C:/SJ/antigravity/habitschool/icons'
ICON    = BASE + '/icon-192.png'
BOLD    = 'C:/Windows/Fonts/malgunbd.ttf'
REG     = 'C:/Windows/Fonts/malgun.ttf'
W, H    = 1024, 500


def gradient(size, top, bottom):
    img = Image.new('RGBA', size)
    w, h = size
    for y in range(h):
        t = y / h
        r = int(top[0] + (bottom[0]-top[0])*t)
        g = int(top[1] + (bottom[1]-top[1])*t)
        b = int(top[2] + (bottom[2]-top[2])*t)
        ImageDraw.Draw(img).line([(0,y),(w,y)], fill=(r,g,b,255))
    return img


def paste_icon(canvas, icon_rgba, cx, cy, size):
    icon = icon_rgba.resize((size, size), Image.LANCZOS)
    canvas.paste(icon, (cx - size//2, cy - size//2), icon)


def draw_badges(draw, labels_colors, cy, font):
    """컬러 pill 배지 그리기"""
    pad_x, pad_y, gap = 22, 10, 20
    sizes = []
    for label, bg, _ in labels_colors:
        bb = draw.textbbox((0,0), label, font=font)
        sizes.append((bb[2]-bb[0]+pad_x*2, bb[3]-bb[1]+pad_y*2))
    total_w = sum(s[0] for s in sizes) + gap*(len(sizes)-1)
    bx = (W - total_w) // 2
    for i, (label, bg, fg) in enumerate(labels_colors):
        bw, bh = sizes[i]
        r = bh // 2
        draw.rounded_rectangle([bx, cy, bx+bw, cy+bh], radius=r, fill=bg)
        bb = draw.textbbox((0,0), label, font=font)
        lw, lh = bb[2]-bb[0], bb[3]-bb[1]
        draw.text((bx+(bw-lw)//2, cy+(bh-lh)//2-2), label, font=font, fill=fg)
        bx += bw + gap


def make_version(filename, bg_top, bg_bottom, deco_color, deco_alpha,
                 title_color, sub_color, bottom_color,
                 tagline, badges, bottom_text,
                 icon_y=148, title_y=228, sub_y=308, badge_y=370, bottom_y=442):
    img = gradient((W, H), bg_top, bg_bottom)

    # 반투명 원 장식
    overlay = Image.new('RGBA', (W,H), (0,0,0,0))
    d = ImageDraw.Draw(overlay)
    for cx, cy, r in [(-90,-90,200),(W+50,-80,190),(-80,H+60,210),(W+60,H+40,200)]:
        d.ellipse([cx-r,cy-r,cx+r,cy+r], fill=(*deco_color, deco_alpha))
    img = Image.alpha_composite(img, overlay)

    draw = ImageDraw.Draw(img)

    # 아이콘
    icon = Image.open(ICON).convert('RGBA')
    paste_icon(img, icon, W//2, icon_y, 130)

    # 타이틀
    f_title = ImageFont.truetype(BOLD, 64)
    bb = draw.textbbox((0,0), '해빛스쿨', font=f_title)
    draw.text(((W-(bb[2]-bb[0]))//2, title_y), '해빛스쿨', font=f_title, fill=title_color)

    # 서브타이틀
    f_sub = ImageFont.truetype(BOLD, 28)
    bb = draw.textbbox((0,0), tagline, font=f_sub)
    draw.text(((W-(bb[2]-bb[0]))//2, sub_y), tagline, font=f_sub, fill=sub_color)

    # 배지
    f_badge = ImageFont.truetype(BOLD, 22)
    draw_badges(draw, badges, badge_y, f_badge)

    # 하단 문구 (bold로 렌더링 - regular에서 '받' 깨짐 방지)
    f_bottom = ImageFont.truetype(BOLD, 21)
    bb = draw.textbbox((0,0), bottom_text, font=f_bottom)
    draw.text(((W-(bb[2]-bb[0]))//2, bottom_y), bottom_text, font=f_bottom, fill=bottom_color)

    out = BASE + '/' + filename
    img.convert('RGB').save(out, 'PNG', optimize=True)
    print(f'  saved: {filename}')


# ──────────────────────────────────────────────────────────────────
# 버전 정의
# ──────────────────────────────────────────────────────────────────

versions = [

    # 1. 기본 오렌지 (브랜드 컬러)
    dict(
        filename='feature-graphic.png',
        bg_top=(255,168,20), bg_bottom=(225,75,0),
        deco_color=(255,200,80), deco_alpha=45,
        title_color='#3E1F00', sub_color='#5C2800', bottom_color='#7B3000',
        tagline='건강한 습관이 가치가 되는 곳',
        badges=[('식단','#E65100','#FFF3E0'),('운동','#BF360C','#FBE9E7'),('마음','#4A148C','#EDE7F6')],
        bottom_text='매일 인증하고, 포인트 받고, 함께 성장하세요!',
    ),

    # 2. 새벽 (Dawn) — 네이비→오렌지
    dict(
        filename='feature-graphic-dawn.png',
        bg_top=(22,30,70), bg_bottom=(200,80,0),
        deco_color=(100,140,255), deco_alpha=30,
        title_color='#FFE0B2', sub_color='#FFCC80', bottom_color='#FFB74D',
        tagline='새벽의 한 걸음이 건강을 만듭니다',
        badges=[('식단','#1565C0','#E3F2FD'),('운동','#E65100','#FFF3E0'),('마음','#4A148C','#EDE7F6')],
        bottom_text='매일 인증하고, 포인트 받고, 함께 성장하세요!',
    ),

    # 3. 그린 (Green) — 건강·자연
    dict(
        filename='feature-graphic-green.png',
        bg_top=(56,142,60), bg_bottom=(27,94,32),
        deco_color=(150,255,150), deco_alpha=35,
        title_color='#F1F8E9', sub_color='#DCEDC8', bottom_color='#C5E1A5',
        tagline='오늘의 식단이 내일의 건강입니다',
        badges=[('식단','#2E7D32','#F1F8E9'),('운동','#F57F17','#FFFDE7'),('마음','#1B5E20','#E8F5E9')],
        bottom_text='매일 인증하고, 포인트 받고, 함께 성장하세요!',
    ),

    # 4. 다크 프리미엄 (Dark)
    dict(
        filename='feature-graphic-dark.png',
        bg_top=(30,30,40), bg_bottom=(15,15,25),
        deco_color=(255,160,50), deco_alpha=25,
        title_color='#FFD54F', sub_color='#BDBDBD', bottom_color='#9E9E9E',
        tagline='응급의학과 전문의가 직접 만든 건강 앱',
        badges=[('식단','#FF6F00','#FFF8E1'),('운동','#D84315','#FBE9E7'),('마음','#6A1B9A','#F3E5F5')],
        bottom_text='매일 인증하고, 포인트 받고, 함께 성장하세요!',
    ),

    # 5. 미니멀 화이트 (Minimal)
    dict(
        filename='feature-graphic-minimal.png',
        bg_top=(255,255,255), bg_bottom=(255,243,224),
        deco_color=(255,160,0), deco_alpha=20,
        title_color='#3E1F00', sub_color='#E65100', bottom_color='#BF360C',
        tagline='즐겁게 좋은 습관 만들기',
        badges=[('식단','#FF6D00','#FFF3E0'),('운동','#E64A19','#FBE9E7'),('마음','#512DA8','#EDE7F6')],
        bottom_text='매일 인증하고, 포인트 받고, 함께 성장하세요!',
    ),
]


# og-image 재생성 (흰 귀퉁이 수정 유지)
def make_og():
    OG = BASE + '/og-image.png'
    img = gradient((1200, 630), (255,235,180), (255,200,100))
    draw = ImageDraw.Draw(img)
    icon = Image.open(ICON).convert('RGBA')
    paste_icon(img, icon, 600, 220, 180)
    f_t = ImageFont.truetype(BOLD, 72)
    bb = draw.textbbox((0,0), '해빛스쿨', font=f_t)
    draw.text(((1200-(bb[2]-bb[0]))//2, 332), '해빛스쿨', font=f_t, fill='#3E1F00')
    f_s = ImageFont.truetype(BOLD, 36)
    sub = '즐겁게 좋은 습관 만들기'
    bb = draw.textbbox((0,0), sub, font=f_s)
    draw.text(((1200-(bb[2]-bb[0]))//2, 424), sub, font=f_s, fill='#7B4A00')
    img.convert('RGBA').save(OG, 'PNG', optimize=True)
    print(f'  saved: og-image.png')


if __name__ == '__main__':
    print('Generating images...')
    for v in versions:
        make_version(**v)
    make_og()
    # 테스트 파일 삭제
    for f in ['test_font.png','test_font2.png']:
        p = BASE+'/'+f
        if os.path.exists(p): os.remove(p)
    print('All done!')
