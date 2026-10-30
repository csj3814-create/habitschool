r"""플레이스토어 영어(en-US) 등록정보 홍보 동영상 — 대표 영상(A)의 영어 가로판.

    python marketing/video/play_launch/build_en.py

build.py 의 장면 조립을 그대로 쓰고 바꾸는 것만 바꾼다.
- 자막·끝 카드: 영어. 글꼴은 Segoe UI.
- 앱 장면: 한국어 화면 녹화 대신 영어 앱 스크린샷(2026-10-30, Downloads\habitscreenshot\eng)을 휴대폰 자리에 세운다.
- 건강 점수 장면은 빼고 주간 미션으로(영어 등록정보에서 의료 쪽을 앞세우지 않는다).
  플레이스토어 검색 녹화(한국어)도 뺀다.
- 쿠폰은 한국 전용이라 말하지 않는다. 끝 카드 아이콘은 글자 없는 해 아이콘.
AI 장면(img\<이름>_16x9.png)은 AI 이미지다 — 플레이 'AI 애셋 선언'과 유튜브 '변경·합성 콘텐츠'에 표시한다.
결과: Downloads\해빛스쿨_홍보영상\play_launch\out_music\A_launch_en_16x9.mp4 (음악·-14 LUFS)
"""
import os
import subprocess
from PIL import Image, ImageDraw

import brand
import build
from recut_endcards import FF, loudnorm_filter

SEGOE_B = 'C:/Windows/Fonts/segoeuib.ttf'
SEGOE = 'C:/Windows/Fonts/segoeui.ttf'
ICON = os.path.join(brand.ROOT, 'icons', 'app-icon-512.png')
SHOTS = os.path.expanduser(r'~\Downloads\habitscreenshot\eng')
TRACK = os.path.join(build.DL, 'After Sunset - Alex Jones _ Xander Jones.mp3')

# 영어 앱 스크린샷(1080x2279) → 휴대폰 자리(562x1000) 비율로 자를 세로 시작점
EN_SHOTS = {
    'diet': ('KakaoTalk_20261030_082236265_01.jpg', 0),     # 식단 AI 분석(B, 자연식 비율)
    'steps': ('KakaoTalk_20261030_082236265_04.jpg', 0),    # 오늘 걸음수(헬스커넥트)
    'missions': ('KakaoTalk_20261030_082236265_10.jpg', 0),  # 주간 미션
    'report': ('KakaoTalk_20261030_082236265_13.jpg', 0),   # 30일 결과지
}

A_EN = [
    ('ai', 'a_alarm', 3.0, ['Ever installed a health app', 'and deleted it three days later?'], None),
    ('ai', 'k02', 3.0, ['So we made it simple:', 'no typing, just take a photo'], None),
    ('ai', 'a_breakfast', 2.6, ['Snap your breakfast'], None),
    ('app', 'diet', 3.6, ['AI sorts each food', 'and shows your whole-food ratio'], None),
    ('ai', 'a_walk', 2.6, ['Your steps come in on their own'], None),
    ('app', 'steps', 2.4, [], None),
    ('ai', 'a_night', 2.6, ['Sleep comes in from', 'Health Connect too'], None),
    ('app', 'missions', 2.4, ['Your logs add up to', 'weekly missions'], None),
    ('app', 'report', 2.6, ['and a 30-day report'], None),
    ('end', 'Start with one meal today', 4.0, [], None),
]


def prepare_captures():
    """스크린샷을 휴대폰 자리 비율(562:1000)로 잘라 build.CAPS 자리에 둔다."""
    caps = {}
    for name, (f, y0) in EN_SHOTS.items():
        im = Image.open(os.path.join(SHOTS, f)).convert('RGB')
        h = round(im.width * 1000 / 562)
        p = os.path.join(build.WORK, f'en_cap_{name}.png')
        im.crop((0, y0, im.width, y0 + h)).save(p)
        caps[name] = p
    return caps


def endcard_en(W=1920, H=1080, line='Start with one meal today'):
    """영어 끝 카드. 한국어 brand.endcard 와 같은 햇살 바탕·배치."""
    k = 1.0 if H > W else 0.72
    icon = int(330 * k)
    top = int(H * (0.21 if H > W else 0.08))
    im = brand.sunburst(W, H, top + icon / 2)
    d = ImageDraw.Draw(im)
    ic = Image.open(ICON).convert('RGBA').resize((icon, icon), Image.LANCZOS)
    sh = Image.new('L', (icon + 80, icon + 80), 0)
    ImageDraw.Draw(sh).rounded_rectangle([40, 50, icon + 40, icon + 50], int(icon * 0.22), fill=110)
    from PIL import ImageFilter
    im.paste((150, 70, 0), ((W - icon) // 2 - 40, top - 40), sh.filter(ImageFilter.GaussianBlur(18)))
    im.paste(ic, ((W - icon) // 2, top), ic)
    y = top + icon + int(40 * k)
    brand.center(d, y, 'Habit School', brand.font(SEGOE_B, int(128 * k)), brand.INK, W)
    y += int(175 * k)
    brand.center(d, y, 'Better habits, one day at a time.', brand.font(SEGOE_B, int(48 * k)), brand.INK, W)
    y += int(100 * k)
    # 흰 글씨는 햇살 한가운데(옅은 노랑)에서 읽히지 않는다
    brand.center(d, y, line, brand.font(SEGOE_B, int(58 * k)), (200, 70, 0), W)
    y += int(130 * k)
    f = brand.font(SEGOE_B, int(48 * k))
    t = "Search  'Habit School'  on Google Play"
    tw = d.textlength(t, font=f)
    tri = int(58 * k)
    pw, ph = tw + tri + int(130 * k), int(130 * k)
    x0 = (W - pw) / 2
    d.rounded_rectangle([x0, y, x0 + pw, y + ph], ph // 2, fill=(255, 255, 255))
    brand.play_triangle(d, x0 + int(50 * k), y + (ph - tri) / 2, tri)
    d.text((x0 + int(50 * k) + tri + int(30 * k), y + (ph - int(48 * k)) / 2 - int(12 * k)), t, font=f,
           fill=brand.INK)
    y += ph + int(40 * k)
    brand.center(d, y, 'On iPhone:  habitschool.web.app/en', brand.font(SEGOE, int(40 * k)), brand.INK, W)
    return im


def add_music(src, dst):
    dur = build_duration(src)
    tmp = dst.replace('.mp4', '_raw.mp4')
    subprocess.run([FF, '-v', 'error', '-y', '-i', src, '-i', TRACK, '-filter_complex',
                    f'[1:a]atrim=0:{dur:.3f},afade=t=in:d=0.3,afade=t=out:st={dur - 1.5:.3f}:d=1.5,'
                    'aresample=48000[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac',
                    '-b:a', '192k', '-shortest', tmp], check=True)
    af, before = loudnorm_filter(tmp)
    subprocess.run([FF, '-v', 'error', '-y', '-i', tmp, '-map', '0:v', '-map', '0:a', '-c:v', 'copy',
                    '-af', f'{af},aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    dst], check=True)
    os.remove(tmp)
    print(f'music: {before:.1f} -> -14 LUFS  {dst}')


def build_duration(path):
    err = subprocess.run([FF, '-i', path], capture_output=True, text=True, errors='ignore').stderr
    h, m, s = err.split('Duration: ')[1].split(',')[0].split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def main():
    for p in (build.WORK, build.OUT):
        os.makedirs(p, exist_ok=True)
    os.makedirs(os.path.join(build.D, 'out_music'), exist_ok=True)
    # build.py 의 조립을 영어 재료로 돌린다: 자막 글꼴, 앱 장면 재료, 끝 카드만 바꾼다.
    brand.B = SEGOE_B
    build.RECS = {}
    build.CAPS = prepare_captures()
    build.endcard = lambda w, h, line: endcard_en(w, h, line)
    endcard_en().save(os.path.join(build.D, 'endcard_en_16x9.png'))
    silent = build.build('A_launch_en', A_EN, wide=True)
    add_music(silent, os.path.join(build.D, 'out_music', os.path.basename(silent)))


if __name__ == '__main__':
    main()
