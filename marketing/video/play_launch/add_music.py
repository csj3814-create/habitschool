r"""out\ 의 무음 영상에 음원을 깔고 유튜브 기준 음량(-14 LUFS, 피크 -1 dBTP)으로 맞춘다.

    python marketing/video/play_launch/add_music.py

음원: YouTube 오디오 보관함(저작자 표시 필요 없음), Downloads 에 받아 둔 mp3.
주제별 곡은 9월 기능 소개 쇼츠(marketing/video/captions.md)와 같게 맞췄다.
결과: Downloads\해빛스쿨_홍보영상\play_launch\out_music\<같은 이름>.mp4
"""
import os
import subprocess
from recut_endcards import FF, loudnorm_filter

DL = os.path.expanduser(r'~\Downloads')
D = os.path.join(DL, '해빛스쿨_홍보영상', 'play_launch')
SRC, OUT = os.path.join(D, 'out'), os.path.join(D, 'out_music')
TRACKS = {
    'A_launch': 'After Sunset - Alex Jones _ Xander Jones.mp3',
    'B1_diet': 'A Stroll - The Grey Room _ Density & Time.mp3',
    'B2_steps': 'Back To The Start - Patrick Jordan Patrikios.mp3',
    'B3_sleep': 'Nebula - The Grey Room _ Density & Time.mp3',
    'B4_body': 'Time of your life - Patrick Jordan Patrikios.mp3',
    'B5_score': 'A Stroll - The Grey Room _ Density & Time.mp3',
    'B6_report': 'Time of your life - Patrick Jordan Patrikios.mp3',
}


def duration(path):
    err = subprocess.run([FF, '-i', path], capture_output=True, text=True, errors='ignore').stderr
    h, m, s = err.split('Duration: ')[1].split(',')[0].split(':')
    return int(h) * 3600 + int(m) * 60 + float(s)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in sorted(os.listdir(SRC)):
        if not name.endswith('.mp4'):
            continue
        tag = name.rsplit('_', 1)[0]
        track = os.path.join(DL, TRACKS[tag])
        dur = duration(os.path.join(SRC, name))
        tmp = os.path.join(OUT, name.replace('.mp4', '_raw.mp4'))
        # 1) 영상 길이로 자르고 앞 0.3초·끝 1.5초 페이드
        subprocess.run([FF, '-v', 'error', '-y', '-i', os.path.join(SRC, name), '-i', track,
                        '-filter_complex', f'[1:a]atrim=0:{dur:.3f},afade=t=in:d=0.3,'
                        f'afade=t=out:st={dur - 1.5:.3f}:d=1.5,aresample=48000[a]',
                        '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                        '-shortest', tmp], check=True)
        # 2) 음량 맞추기(2회 통과)
        af, before = loudnorm_filter(tmp)
        dst = os.path.join(OUT, name)
        subprocess.run([FF, '-v', 'error', '-y', '-i', tmp, '-map', '0:v', '-map', '0:a', '-c:v', 'copy',
                        '-af', f'{af},aresample=48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                        dst], check=True)
        os.remove(tmp)
        print(f'{name}: {TRACKS[tag][:28]}  {before:.1f} -> -14 LUFS')


if __name__ == '__main__':
    main()
