"""해빛 도장 달력 — 기록이 쌓이는 3.5초 그래픽 (1080x1920, 24fps).

    python marketing/video/breakfast_table/calendar_graphic.py

휴대폰 화면 속 한 달 달력이 하루씩 해빛 도장으로 채워지고(식사·걷기·잠 점 세 개),
다음 달은 더 빨리, 끝에는 열두 달이 모두 채워진 1년이 한 화면에 보인다.
글자는 넣지 않는다(자막은 edit.py 가 얹는다) — 한국어·영어판이 같은 그래픽을 쓴다.
"""
import os
import subprocess

from PIL import Image, ImageDraw, ImageFilter

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
DIR = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상\breakfast_table')
ICON = r'C:\SJ\antigravity\habitschool\icons\icon-512.png'
W, H, FPS = 1080, 1920, 24
DUR = 3.5
BG = (255, 244, 226)
FRAMES = os.path.join(DIR, 'cal_frames')
os.makedirs(FRAMES, exist_ok=True)

# 아이콘 위쪽(해 얼굴)만 도장으로 쓴다. 아래 글자는 잘라 낸다.
icon = Image.open(ICON).convert('RGBA')
sun = icon.crop((60, 20, 452, 360)).resize((64, 56), Image.LANCZOS)
DOTS = [(255, 152, 0), (76, 175, 80), (126, 87, 194)]  # 식사, 걷기, 잠

PHONE = (240, 330, 840, 1590)  # 휴대폰 바깥
SCREEN = (270, 420, 810, 1500)


def rounded(draw, box, r, fill, outline=None, width=0):
    draw.rounded_rectangle(box, r, fill=fill, outline=outline, width=width)


def draw_month(img, box, filled, cell_scale=1.0):
    """box 안에 7x5 달력. filled 개 칸에 도장."""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    cw, ch = (x1 - x0) / 7, (y1 - y0) / 5
    for k in range(35):
        cx, cy = x0 + (k % 7) * cw, y0 + (k // 7) * ch
        pad = 4 * cell_scale
        if cell_scale < 0.5:
            # 1년 보기: 칸이 작아 해 그림이 뭉개진다. 해빛 주황 칸으로 채운다.
            col = (255, 167, 38) if k < filled else (245, 232, 210)
            rounded(d, (cx + 1.5, cy + 1.5, cx + cw - 1.5, cy + ch - 1.5), 3, col)
            continue
        rounded(d, (cx + pad, cy + pad, cx + cw - pad, cy + ch - pad), int(10 * cell_scale), (255, 255, 255), (240, 225, 200), 1)
        if k < filled:
            s = sun.resize((max(4, int(sun.width * cell_scale * cw / 76)), max(4, int(sun.height * cell_scale * cw / 76))))
            img.paste(s, (int(cx + (cw - s.width) / 2), int(cy + ch * 0.12)), s)
            if cell_scale > 0.5:
                r = 5 * cell_scale
                for j, col in enumerate(DOTS):
                    px = cx + cw / 2 + (j - 1) * 14 * cell_scale
                    py = cy + ch * 0.78
                    d.ellipse((px - r, py - r, px + r, py + r), fill=col)


def phone_frame():
    img = Image.new('RGB', (W, H), BG)
    shadow = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((PHONE[0] + 12, PHONE[1] + 24, PHONE[2] + 12, PHONE[3] + 24), 70, fill=(120, 80, 30, 70))
    img.paste(shadow.filter(ImageFilter.GaussianBlur(24)), (0, 0), shadow.filter(ImageFilter.GaussianBlur(24)))
    d = ImageDraw.Draw(img)
    rounded(d, PHONE, 70, (60, 60, 70))
    rounded(d, SCREEN, 40, (255, 250, 240))
    # 화면 위 작은 해빛 표시(앱 머리)
    top = sun.resize((90, 78))
    img.paste(top, ((W - 90) // 2, SCREEN[1] + 40), top)
    return img


total = int(DUR * FPS)
cal_box = (SCREEN[0] + 30, SCREEN[1] + 170, SCREEN[2] - 30, SCREEN[1] + 170 + 480)
for f in range(total):
    t = f / FPS
    img = phone_frame()
    if t < 1.5:  # 첫 달: 하루씩
        draw_month(img, cal_box, int(min(35, (t / 1.4) * 35)))
    elif t < 2.3:  # 둘째 달: 빠르게, 첫 달은 위로 밀려 작아짐
        u = (t - 1.5) / 0.8
        draw_month(img, cal_box, int(min(35, u * 35 * 1.3)))
    else:  # 1년: 열두 달이 모두 찬 모습으로 줌아웃
        u = min(1.0, (t - 2.3) / 0.6)
        x0, y0, x1, y1 = SCREEN[0] + 24, SCREEN[1] + 170, SCREEN[2] - 24, SCREEN[3] - 60
        gw, gh = (x1 - x0) / 3, (y1 - y0) / 4
        shown = int(1 + u * 11)
        for m in range(12):
            if m >= shown:
                break
            mx, my = x0 + (m % 3) * gw, y0 + (m // 3) * gh
            draw_month(img, (mx + 8, my + 8, mx + gw - 8, my + gh - 8), 35, cell_scale=0.32)
    img.save(os.path.join(FRAMES, f'{f:03d}.png'))

out = os.path.join(DIR, 'calendar.mp4')
subprocess.run([FF, '-v', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(FRAMES, '%03d.png'),
                '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', out], check=True)
print(out)
