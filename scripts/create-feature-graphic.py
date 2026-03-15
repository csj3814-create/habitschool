from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1024, 500

img = Image.new('RGB', (W, H), '#FF8C00')
draw = ImageDraw.Draw(img)

# Gradient-like effect with rectangles
for y in range(H):
    r = int(255 - (y / H) * 60)
    g = int(140 - (y / H) * 80)
    b = int(0 + (y / H) * 40)
    draw.line([(0, y), (W, y)], fill=(r, g, b))

# Decorative circles
draw.ellipse([20, 20, 180, 180], fill=(255, 255, 255, 30), outline=None)
draw.ellipse([850, 330, 1010, 490], fill=(255, 255, 255, 30), outline=None)
draw.ellipse([-50, 350, 110, 510], fill=(255, 255, 255, 20), outline=None)
draw.ellipse([700, -30, 860, 130], fill=(255, 255, 255, 20), outline=None)

# Load icon and paste
icon = Image.open('icons/icon-512.png').convert('RGBA')
icon_size = 160
icon_resized = icon.resize((icon_size, icon_size), Image.LANCZOS)

# Create circular mask
mask = Image.new('L', (icon_size, icon_size), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse([0, 0, icon_size, icon_size], fill=255)

# White circle background
icon_x = W // 2 - icon_size // 2
icon_y = 60
draw.ellipse([icon_x - 10, icon_y - 10, icon_x + icon_size + 10, icon_y + icon_size + 10], fill='white')
img.paste(icon_resized, (icon_x, icon_y), mask)

# Try system fonts
font_paths = [
    'C:/Windows/Fonts/malgunbd.ttf',  # 맑은 고딕 Bold
    'C:/Windows/Fonts/malgun.ttf',     # 맑은 고딕
    'C:/Windows/Fonts/NanumGothicBold.ttf',
    'C:/Windows/Fonts/arial.ttf',
]

def get_font(size, bold=True):
    for fp in font_paths:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()

# Title
title_font = get_font(48)
title = "해빛스쿨"
bbox = draw.textbbox((0, 0), title, font=title_font)
tw = bbox[2] - bbox[0]
draw.text(((W - tw) // 2, 240), title, fill='white', font=title_font)

# Subtitle
sub_font = get_font(28)
subtitle = "건강한 습관이 가치가 되는 곳"
bbox2 = draw.textbbox((0, 0), subtitle, font=sub_font)
sw = bbox2[2] - bbox2[0]
draw.text(((W - sw) // 2, 310), subtitle, fill='#FFF3E0', font=sub_font)

# Tags
tag_font = get_font(22, bold=False)
tags = "🥗 식단  ·  🏃 운동  ·  🧘 마음"
bbox3 = draw.textbbox((0, 0), tags, font=tag_font)
tw3 = bbox3[2] - bbox3[0]
draw.text(((W - tw3) // 2, 380), tags, fill='#FFE0B2', font=tag_font)

# Bottom tagline
btm_font = get_font(18, bold=False)
btm = "매일 인증하고, 포인트 받고, 함께 성장하세요!"
bbox4 = draw.textbbox((0, 0), btm, font=btm_font)
bw = bbox4[2] - bbox4[0]
draw.text(((W - bw) // 2, 440), btm, fill='#FFCC80', font=btm_font)

out_path = 'icons/feature-graphic.png'
img.save(out_path, 'PNG')
print(f'Created {out_path} ({W}x{H})')
