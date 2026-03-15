"""
폰 스크린샷(1080x2400)을 태블릿 스크린샷(1080x1920, 9:16)으로 변환
Google Play 요구사항:
- 7인치: 16:9 또는 9:16, 320~3840px
- 10인치: 16:9 또는 9:16, 1080~7680px
"""
from PIL import Image
import os

INPUT_DIR = r"c:\SJ\antigravity\img"
OUTPUT_DIR_7 = r"c:\SJ\antigravity\img\tablet_7inch"
OUTPUT_DIR_10 = r"c:\SJ\antigravity\img\tablet_10inch"

os.makedirs(OUTPUT_DIR_7, exist_ok=True)
os.makedirs(OUTPUT_DIR_10, exist_ok=True)

for fname in sorted(os.listdir(INPUT_DIR)):
    if not fname.lower().endswith(('.jpg', '.jpeg', '.png')):
        continue
    
    path = os.path.join(INPUT_DIR, fname)
    img = Image.open(path)
    w, h = img.size
    print(f"{fname}: {w}x{h}")
    
    # 9:16 비율로 크롭 (위아래 균등 자르기)
    target_h = int(w * 16 / 9)  # 1080 -> 1920
    if h > target_h:
        crop_top = (h - target_h) // 2
        crop_bottom = crop_top + target_h
        cropped = img.crop((0, crop_top, w, crop_bottom))
    else:
        cropped = img
    
    print(f"  -> cropped to {cropped.size[0]}x{cropped.size[1]}")
    
    # 7인치용 (1080x1920 그대로)
    out7 = os.path.join(OUTPUT_DIR_7, fname)
    cropped.save(out7, quality=95)
    
    # 10인치용 (1200x2133으로 약간 스케일업 - 더 선명하게)
    scaled = cropped.resize((1200, 2133), Image.LANCZOS)
    out10 = os.path.join(OUTPUT_DIR_10, fname)
    scaled.save(out10, quality=95)
    
    print(f"  7inch: {out7}")
    print(f"  10inch: {out10}")

print("\n완료!")
