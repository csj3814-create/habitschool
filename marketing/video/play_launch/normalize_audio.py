r"""음악이 있는 기존 영상의 음량만 유튜브 기준(-14 LUFS, 피크 -1 dBTP)으로 맞춘다. 화면은 다시 인코딩하지 않는다.

    python marketing/video/play_launch/normalize_audio.py

결과: Downloads\해빛스쿨_홍보영상\play_launch\loudnorm\ (끝 카드를 바꾼 영상은 recut\ 에 이미 맞춰져 있다)
"""
import glob
import os
import subprocess
from recut_endcards import FF, SRC, JOBS, loudnorm_filter

OUT = os.path.join(SRC, 'play_launch', 'loudnorm')
done = {os.path.basename(j[0]) for j in JOBS if not j[0].endswith('_en.mp4')}
files = glob.glob(os.path.join(SRC, '*.mp4')) + glob.glob(os.path.join(SRC, 'breakfast_table', 'bt*_music_*.mp4'))
os.makedirs(OUT, exist_ok=True)
for src in sorted(files):
    name = os.path.basename(src)
    if name in done or 'silent' in name:
        continue
    probe = subprocess.run([FF, '-i', src], capture_output=True, text=True, errors='ignore').stderr
    if 'Audio:' not in probe:
        continue
    af, before = loudnorm_filter(src)
    subprocess.run([FF, '-v', 'error', '-y', '-i', src, '-map', '0:v', '-map', '0:a', '-c:v', 'copy',
                    '-af', f'{af},aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    os.path.join(OUT, name)], check=True)
    print(f'{name}  {before:.1f} LUFS -> -14')
