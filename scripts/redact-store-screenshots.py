# -*- coding: utf-8 -*-
"""Play 스토어 스크린샷에서 표시 이름을 '해빛'으로 치환한다.
원본은 건드리지 않고 play_ready/ 에 순서대로 저장한다."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = r'C:\SJ\antigravity\260827해빛스쿨스크린샷'
OUT = os.path.join(SRC, 'play_ready')
FONT_BD = r'C:\Windows\Fonts\malgunbd.ttf'
NAME = '해빛'

os.makedirs(OUT, exist_ok=True)


def src(tag):
    return os.path.join(SRC, 'KakaoTalk_20260827_120414295%s.jpg' % tag)


def fit_font(text, target_h, path=FONT_BD):
    """글리프 높이가 target_h 에 가장 가까운 폰트 크기를 찾는다."""
    best, best_d = None, 1e9
    for size in range(10, 200):
        f = ImageFont.truetype(path, size)
        box = f.getbbox(text)
        h = box[3] - box[1]
        d = abs(h - target_h)
        if d < best_d:
            best, best_d = (f, box), d
    return best


def draw_name(img, box, color, text=NAME, path=FONT_BD):
    """box=(x0,y0,x1,y1) 를 지우고 같은 자리에 text 를 그린다."""
    x0, y0, x1, y1 = box
    a = np.array(img)
    # 지울 영역의 배경색은 바로 왼쪽/오른쪽 여백에서 가져온다
    bg = a[y0:y1, max(0, x0 - 6)].mean(axis=0).round().astype(int)
    ImageDraw.Draw(img).rectangle([x0, y0, x1, y1], fill=tuple(bg))
    font, gb = fit_font(text, y1 - y0, path)
    d = ImageDraw.Draw(img)
    d.text((x0 - gb[0], y0 - gb[1]), text, font=font, fill=color)
    return img


# --- 상단바: 6장 모두 같은 좌표 ---------------------------------------------
TOPBAR = (135, 52, 246, 123)      # '최석재' 글리프 범위
TOPBAR_CLEAR = (126, 38, 262, 138)
TOPBAR_COLOR = (255, 139, 0)

# --- 출력 순서 ---------------------------------------------------------------
PLAN = [
    ('_01', '01_dashboard'),
    ('_04', '02_diet'),
    ('_06', '03_exercise'),
    ('_08', '04_mind'),
    ('_10', '05_points'),
    ('_12', '06_gallery'),
    ('_02', '07_mission_group'),
    ('_09', '08_breathing'),
]
HAS_TOPBAR = {'_01', '_04', '_06', '_08', '_10', '_12'}

for tag, name in PLAN:
    im = Image.open(src(tag)).convert('RGB')

    if tag in HAS_TOPBAR:
        a = np.array(im)
        bg = tuple(a[TOPBAR_CLEAR[1]:TOPBAR_CLEAR[3], 262].mean(axis=0).round().astype(int))
        ImageDraw.Draw(im).rectangle(list(TOPBAR_CLEAR), fill=bg)
        font, gb = fit_font(NAME, TOPBAR[3] - TOPBAR[1])
        ImageDraw.Draw(im).text(
            (TOPBAR[0] - gb[0], TOPBAR[1] - gb[1]), NAME, font=font, fill=TOPBAR_COLOR)

    if tag == '_12':
        a = np.array(im).astype(int)
        # 피드 작성자 이름
        nm = a[1011:1042, 218:307].reshape(-1, 3)
        ncolor = tuple(nm[np.argsort(nm.sum(axis=1))[:80]].mean(axis=0).round().astype(int))
        # 지우는 폭은 글리프 끝(307px)보다 넉넉히 잡는다 — 한 칼럼이 남았었다
        a2 = np.array(im)
        bg2 = tuple(a2[1005:1050, 330].mean(axis=0).round().astype(int))
        ImageDraw.Draw(im).rectangle([212, 1005, 318, 1048], fill=bg2)
        font2, gb2 = fit_font(NAME, 1041 - 1011)
        ImageDraw.Draw(im).text((218 - gb2[0], 1011 - gb2[1]), NAME, font=font2, fill=ncolor)
        # 아바타 이니셜 '최' -> '해'
        av = a[1035:1068, 120:148].reshape(-1, 3)
        acolor = tuple(av[np.argsort(av.sum(axis=1))[:60]].mean(axis=0).round().astype(int))
        draw_name(im, (120, 1035, 147, 1067), acolor, text='해')

    if tag == '_10':
        # 하단에 걸린 '저장한 연락처 010-****-1411' 을 카드 배경으로 덮는다
        a = np.array(im)
        row = a[2239].copy()
        a[2240:] = row
        im = Image.fromarray(a)

    im.save(os.path.join(OUT, name + '.jpg'), quality=95, subsampling=0)
    print('saved', name, im.size)
