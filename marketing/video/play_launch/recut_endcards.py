r"""기존 한국어 영상의 끝 카드만 플레이스토어 안내판으로 바꾼다. 음악·길이는 그대로.

    python marketing/video/play_launch/recut_endcards.py

원본: Downloads\\해빛스쿨_홍보영상\\ (덮어쓰지 않는다)
결과: Downloads\\해빛스쿨_홍보영상\\play_launch\\recut\\ 같은 파일명
끝 카드 시작점은 마지막 프레임과 거의 같아지는 지점을 찾아서 정한다(가족 시리즈는 약 6.3초).
음량은 유튜브 재생 기준 -14 LUFS, 최대 피크 -1 dBTP 로 맞춘다(loudnorm 2회 통과).
"""
import json
import os
import subprocess
import numpy as np
from brand import endcard

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
SRC = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상')
OUT = os.path.join(SRC, 'play_launch', 'recut')
NOTE = '※ 이야기 속 인물은 가상입니다'
FAMILY = [
    ('habitschool_family_01_birth.mp4', ['아이를 돌보는 힘은', '부모의 한 끼에서']),
    ('habitschool_family_02_toddler.mp4', ['아이의 입맛은', '부모의 식탁을 닮습니다']),
    ('habitschool_family_03_preschool.mp4', ['아이와 노는 시간이', '부모의 운동 시간']),
    ('habitschool_family_04_schoolage.mp4', ['아침 한 끼가', '아이의 하루를 바꿉니다']),
    ('habitschool_family_05_teen.mp4', ['잔소리 대신', '같이 지키는 규칙']),
    ('habitschool_family_06_youngadult.mp4', ['부모의 기록이', '아이의 습관이 됩니다']),
    ('habitschool_family_07_marriage.mp4', ['함께 기록하면', '오래 갑니다']),
    ('habitschool_family_08_midlife.mp4', ['20년 뒤의 몸은', '오늘의 기록이 만듭니다']),
    ('habitschool_family_09_laterlife.mp4', ['건강은', '물려줄 수 있는 습관입니다']),
]
JOBS = [(f, lines, NOTE, f'해빛 가족 시리즈 · {i + 1}/9') for i, (f, lines) in enumerate(FAMILY)]
JOBS += [
    ('habitschool_story_jungho.mp4', ['건강한 노년은', '오늘 한 끼부터'], NOTE, None),
    (r'breakfast_table\bt60_music_ko.mp4', ['매일의 작은 기록 습관이,', '세대를 넘어 가족의 행복이 됩니다'], None, None),
    (r'breakfast_table\bt30_music_ko.mp4', ['매일의 작은 기록 습관이,', '세대를 넘어 가족의 행복이 됩니다'], None, None),
]
XF = 0.5


def duration(path):
    out = subprocess.run([FF, '-i', path], capture_output=True, text=True, errors='ignore').stderr
    h, m, s = out.split('Duration: ')[1].split(',')[0].split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def endcard_start(path, dur):
    """마지막 10초에서, 끝까지 마지막 프레임과 거의 같게 이어지는 구간의 시작점."""
    raw = subprocess.run([FF, '-v', 'error', '-sseof', '-10', '-i', path, '-vf',
                          'fps=10,scale=54:96,format=gray', '-f', 'rawvideo', '-'], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8).reshape(-1, 96, 54).astype(float)
    ref = fr[-5]  # 맨 끝 프레임은 페이드 중일 수 있어 0.5초 앞을 기준으로
    diffs = [abs(x - ref).mean() for x in fr[:-5]]
    i = max(i for i, v in enumerate(diffs) if v >= 15) + 1
    return dur - (len(fr) - i) / 10


LOUD = 'I=-14:TP=-1:LRA=11'


def loudnorm_filter(path):
    """1회차: 원본 음량을 재서 2회차(선형 보정)에 넣을 필터를 만든다."""
    err = subprocess.run([FF, '-hide_banner', '-i', path, '-af', f'loudnorm={LOUD}:print_format=json',
                          '-vn', '-f', 'null', '-'], capture_output=True, text=True, errors='ignore').stderr
    m = json.loads(err[err.rindex('{'):err.rindex('}') + 1])
    return (f"loudnorm={LOUD}:measured_I={m['input_i']}:measured_TP={m['input_tp']}:"
            f"measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:"
            f"offset={m['target_offset']}:linear=true,alimiter=limit=0.79:level=false"), float(m['input_i'])


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, lines, note, badge in JOBS:
        src = os.path.join(SRC, name)
        dur = duration(src)
        t0 = endcard_start(src, dur)
        card = os.path.join(OUT, os.path.basename(name).replace('.mp4', '_end.png'))
        endcard(line=lines, note=note, badge=badge).save(card)
        dst = os.path.join(OUT, os.path.basename(name))
        cut = t0 + XF / 2   # 새 카드가 옛 카드 시작점에서 녹아 들어오게
        af, before = loudnorm_filter(src)
        fc = (f'[0:a]{af},aresample=48000[au];'
              f'[0:v]trim=0:{cut:.3f},setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1,format=yuv420p[a];'
              f'[1:v]fps=30,scale=1080:1920,setsar=1,format=yuv420p[b];'
              f'[a][b]xfade=transition=fade:duration={XF}:offset={cut - XF:.3f}[v]')
        cmd = [FF, '-v', 'error', '-y', '-i', src, '-loop', '1', '-t', f'{dur - cut + XF:.3f}', '-i', card,
               '-filter_complex', fc, '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-crf', '18',
               '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k', '-t', f'{dur:.3f}', '-movflags', '+faststart', dst]
        subprocess.run(cmd, check=True)
        print(f'{os.path.basename(name)}  {dur:.1f}s  end card from {t0:.1f}s  {before:.1f} LUFS -> -14')


if __name__ == '__main__':
    main()
