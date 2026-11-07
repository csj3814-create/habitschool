# 업데이트 노트 v574 인스타 캐러셀 1080x1350 (새벽 배너와 어울리는 짙은 남색 + 주황). 걸음수 카드는 휴대폰 캡처가 없어 글자 카드.
import os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(HERE, '..', 'captures'); ROOT = os.path.join(HERE, '..', '..', '..', '..')
W, H = 1080, 1350
BG, INK, ACC, SUB, BOX = (28, 36, 62), (248, 247, 242), (255, 183, 77), (182, 190, 214), (48, 58, 92)
B = 'C:/Windows/Fonts/malgunbd.ttf'; R = 'C:/Windows/Fonts/malgun.ttf'
f = lambda p, s: ImageFont.truetype(p, s)
TOTAL = 5
def center(d, y, t, font, fill):
    w = d.textlength(t, font=font); d.text(((W - w) / 2, y), t, font=font, fill=fill)
def footer(d, n): center(d, 1270, f'해빛스쿨 업데이트 v574  ·  {n}/{TOTAL}', f(R, 32), SUB)
def rounded(img, r):
    m = Image.new('L', img.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, *img.size], r, fill=255)
    o = Image.new('RGBA', img.size); o.paste(img, (0, 0), m); return o
def card1():
    im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line([(0, y), (W, y)], fill=(int(24 + 14 * t), int(30 + 12 * t), int(56 + 14 * t)))
    ic = Image.open(os.path.join(ROOT, 'icons', 'app-icon-512.png')).convert('RGBA').resize((260, 260))
    im.paste(ic, ((W - 260) // 2, 200), ic)
    center(d, 570, '친구가 기록한 날마다', f(B, 80), INK)
    center(d, 680, '포인트가 들어와요', f(B, 80), ACC)
    center(d, 850, '해빛스쿨 업데이트 v574', f(R, 50), SUB)
    footer(d, 1); return im
def textcard(n, l1, l2, lines):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    center(d, 230, l1, f(B, 72), INK); center(d, 330, l2, f(B, 72), ACC)
    for i, t in enumerate(lines):
        y = 560 + i * 120
        d.rounded_rectangle([110, y, 970, y + 92], 46, fill=BOX)
        center(d, y + 18, t, f(R, 44), INK)
    footer(d, n); return im
def capcard(n, title, sub, path):
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    center(d, 150, title, f(B, 62), INK); center(d, 250, sub, f(R, 40), ACC)
    cap = Image.open(path).convert('RGB'); maxw, maxh = 980, 860
    s = min(maxw / cap.width, maxh / cap.height); cap = cap.resize((int(cap.width * s), int(cap.height * s)), Image.LANCZOS)
    x, y = (W - cap.width) // 2, 360 + (maxh - cap.height) // 2
    rc = rounded(cap, 32); im.paste(rc, (x, y), rc); footer(d, n); return im
card1().save(os.path.join(HERE, '1.jpg'), quality=92)
textcard(2, '친구 초대 보상을', '나눠서 드려요', ['친구 첫 기록에 300P', '그 뒤 기록한 날마다 100P', '3일까지 모두 500P', '연속이 아니어도 괜찮아요']).save(os.path.join(HERE, '2.jpg'), quality=92)
capcard(3, '프로필 탭 → 친구 초대하기', '보너스 안내를 펼치면 보여요', os.path.join(CAP, '친구초대포인트_보너스안내_해빛스쿨.jpg')).save(os.path.join(HERE, '3.jpg'), quality=92)
textcard(4, '안드로이드 걸음수·수면은', '자동으로', ['Google Play 앱을 함께 깔고', '하루 한 번 열어 주시면', '걸음수·수면이 저장되고', '쓰시던 웹에서도 보여요']).save(os.path.join(HERE, '4.jpg'), quality=92)
textcard(5, '그 밖에', '바뀐 것', ['앱을 열 때 해 로고가 먼저', '안드로이드 홈 화면에 앱 설치', '친구가 어디까지 왔는지 보여요', '프로필 링크에서 가입하면 200P']).save(os.path.join(HERE, '5.jpg'), quality=92)
