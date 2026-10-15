r"""플레이스토어 출시 영상 조립 — 대표 영상(A)과 기능 쇼츠(B1~B6).

    python marketing/video/play_launch/build.py            # 전부
    python marketing/video/play_launch/build.py A B4       # 골라서

장면마다 있는 재료 중 가장 좋은 것을 쓴다. 그래서 재료가 늘면 같은 명령으로 다시 돌리기만 하면 된다.
- AI 장면: clips\<이름>.mp4 (Kling 3초) → 없으면 img\<이름>.png 를 천천히 확대
- 앱 장면: rec\<이름>.mp4 (사용자 화면 녹화) → 없으면 앞 게시물 캡처를 카드로 띄움
폴더: Downloads\해빛스쿨_홍보영상\play_launch\ (clips, img, rec, out)
결과는 무음이다. 음악은 앱에서 붙인다(붙여서 내보낼 땐 recut_endcards.loudnorm_filter 로 -14 LUFS).
"""
import os
import subprocess
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from brand import caption, endcard

FF = r'C:\SJ\antigravity\habitschool\functions\node_modules\ffmpeg-static\ffmpeg.exe'
BASE = os.path.expanduser(r'~\Downloads\해빛스쿨_홍보영상')
D = os.path.join(BASE, 'play_launch')
IMG, CLIPS, REC, OUT, WORK = (os.path.join(D, x) for x in ('img', 'clips', 'rec', 'out', 'work'))
BODY = os.path.join(BASE, 'body_composition')
DL = os.path.expanduser(r'~\Downloads')
POSTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'posts')
W, H, FPS, XF = 1080, 1920, 24, 0.35

# 화면 녹화가 오기 전까지 대신 띄울 실제 앱 캡처
CAPS = {
    'diet': os.path.join(DL, '해빛스쿨_2편_네이버', '1_초가공식품_AI식단분석_해빛스쿨.jpg'),
    'diet_day': os.path.join(DL, '해빛스쿨_2편_네이버', '4_초가공식품_하루총평_해빛스쿨.jpg'),
    'steps': os.path.join(DL, '해빛스쿨_3편_네이버', '02_운동기록앱_운동탭_해빛스쿨.jpg'),
    'week': os.path.join(DL, '해빛스쿨_3편_네이버', '01_운동권장량_주150분_이번주운동.jpg'),
    'sleep': os.path.join(DL, '해빛스쿨_4편_네이버', '02_수면앱캡처_AI분석_등급.jpg'),
    'body': os.path.join(POSTS, '05_body_composition', 'captures', '02_인바디결과지_사진인식.jpg'),
    'score': os.path.join(POSTS, '06_health_scores', 'captures', '02_LE8_건강습관점수_카드.jpg'),
    'score_sum': os.path.join(POSTS, '06_health_scores', 'captures', '01_건강습관점수_대사건강점수_요약.jpg'),
    'report': os.path.join(POSTS, '07_30day_report', 'captures', '01_30일결과지_종합요약_카테고리.jpg'),
    'calendar': os.path.join(POSTS, '07_30day_report', 'captures', '05_습관기록_날짜별_달력.jpg'),
}

# 사용자 화면 녹화(설치된 앱, 10-14) — (파일, 시작초, 끝초). 장면 길이에 맞춰 빠르게 돌린다.
# 빼야 할 곳: 갤러리 고르는 화면(개인 사진), 소모임(다른 회원 이름), 스토어 앱 페이지("내부 베타" 문구).
RECS = {
    'diet': ('mobizen_20261014_233035.mp4', 10.5, 19.5),       # 사진 → 분석 중 → A 등급
    'diet_day': ('mobizen_20261014_233035.mp4', 19.0, 24.5),   # 미량영양소 점수 → 팁
    'week': ('mobizen_20261014_233138.mp4', 0.0, 3.5),         # 이번 주 운동 68/150분
    'steps': ('mobizen_20261014_233138.mp4', 8.5, 13.5),       # 헬스커넥트 걸음수 2,150
    'sleep': ('mobizen_20261014_233222.mp4', 9.5, 22.0),       # 수면 캡처 → 분석 → B
    'body': ('mobizen_20261014_233326.mp4', 88.0, 102.0),      # 채워진 칸 → 저장 → 점수
    'score': ('mobizen_20261014_233524.mp4', 0.5, 10.0),       # 건강습관 93 → 대사건강 96
    'score_sum': ('mobizen_20261014_233524.mp4', 12.5, 14.8),  # 내 기록 탭 점수 요약
    'report': ('mobizen_20261014_233524.mp4', 24.0, 33.0),     # 30일 결과지
    'report_top': ('mobizen_20261014_233524.mp4', 24.0, 27.5),  # 30일 결과지 첫 화면(대표 영상용)
    'calendar': ('mobizen_20261014_233524.mp4', 47.5, 52.5),   # 날짜별 기록 달력
    'store': ('mobizen_20261014_233723.mp4', 9.0, 15.0),       # 플레이스토어 '해빛스쿨' 검색 결과
}
# 녹화 화면 720x1518: 위 상태 표시줄, 아래 워터마크, 오른쪽 끝에 걸친 Mobizen 버튼(x 637~)을 잘라 9:16 으로. 앱 카드 테두리는 x 630 안쪽. 왼쪽 0~18 은 검은 띠.
REC_CROP = 'crop=614:1092:20:52'

# (종류, 이름, 길이, 자막 줄, 자막 높이 또는 None)
A = [
    ('ai', 'a_alarm', 3.0, ['건강 챙기겠다고 앱 깔았다가', '사흘 만에 지운 적 있으시죠?'], None),
    ('ai', 'k02', 3.0, ['그래서 적지 않고', '찍기만 하면 되게 만들었어요'], None),
    ('ai', 'a_breakfast', 2.6, ['아침상 한 장 찍으시면'], 1500),
    ('app', 'diet', 3.6, ['AI가 음식 종류를 분석하고', '자연식품 비율을 알려 줘요'], None),
    ('ai', 'a_walk', 2.6, ['걸음수는 저절로 들어오고요'], None),
    ('app', 'steps', 2.4, [], None),
    ('ai', 'a_night', 2.6, ['잠은 수면 앱 캡처', '한 장이면 돼요'], 1500),
    ('app', 'score_sum', 2.0, ['쌓인 기록은 점수랑'], None),
    ('app', 'report_top', 2.6, ['한 달 결과지로 보여 드려요'], None),
    ('app', 'store', 3.0, ['이제 플레이스토어에서', '받으실 수 있어요'], None),
    ('end', '오늘 한 끼만 찍어 보세요', 3.5, [], None),
]
B = {
    'B1_diet': [
        ('ai', 'a_breakfast', 3.0, ['오늘 먹은 초가공식품,', '몇 개일까요?'], 1500),
        ('app', 'diet', 4.5, ['사진 한 장이면', '음식 종류를 분석해 줘요'], None),
        ('app', 'diet_day', 4.0, ['비타민·무기질·식이섬유 점수랑', '식단 팁까지 알려 드려요'], None),
        ('end', '오늘 한 끼만 찍어 보세요', 3.5, [], None),
    ],
    'B2_steps': [
        ('ai', 'b_shoes', 3.0, ['이번 주에 운동,', '몇 분 하셨어요?'], 520),
        ('app', 'steps', 3.5, ['걸음수는 헬스커넥트에서', '저절로 들어와요'], None),
        ('app', 'week', 4.0, ['주 150분을 채우려면', '오늘 몇 분 남았는지 알려 드려요'], None),
        ('end', '오늘은 20분만 걸어 보세요', 3.5, [], None),
    ],
    'B3_sleep': [
        ('ai', 'b_dawn_bed', 3.0, ['어젯밤,', '몇 시간 주무셨어요?'], None),
        ('app', 'sleep', 4.5, ['아침에 수면 앱 캡처', '한 장이면 돼요'], None),
        ('ai', 'a_night', 3.5, ['잔 시간이 건강 점수에', '바로 반영돼요'], 1500),
        ('end', '오늘 밤은 7시간 자 보세요', 3.5, [], None),
    ],
    'B4_body': [
        ('ai', 'k01', 3.0, ['인바디 결과지,', '어디 두셨어요?'], None),
        ('app', 'body', 4.5, ['사진 올리시면', 'AI가 읽어서 칸을 채워 드려요'], None),
        ('ai', 'k04', 3.5, ['같은 기기로,', '같은 시간에 재 주세요'], 520),
        ('end', '결과지 한 장부터 올려 보세요', 3.5, [], None),
    ],
    'B5_score': [
        ('ai', 'b_bp', 3.0, ['혈압이랑 공복혈당,', '재고 나서 어디 적으세요?'], 520),
        ('app', 'score', 4.5, ['적어 두시면', '점수 두 개로 보여 드려요'], None),
        ('app', 'score_sum', 3.5, ['다음에 채우면 좋은 항목', '하나만 알려 드려요'], None),
        ('end', '오늘 아침 숫자 하나부터', 3.5, [], None),
    ],
    'B6_report': [
        ('ai', 'b_calendar', 3.0, ['한 달 동안 어떻게 지냈는지', '기억나세요?'], None),
        ('app', 'report', 4.5, ['기록 30일치를', '한 장으로 모아 드려요'], None),
        ('app', 'calendar', 4.0, ['하루하루 기록이', '날짜별로 한눈에 보여요'], 640),
        ('end', '오늘부터 30일, 시작해 보세요', 3.5, [], None),
    ],
}


def run(cmd):
    subprocess.run([FF, '-v', 'error', '-y', *cmd], check=True)


def ai_image(name):
    for p in (os.path.join(IMG, name + '.png'), os.path.join(BODY, name + '.png')):
        if os.path.exists(p):
            return p
    raise FileNotFoundError(name)


def gradient(w=W, h=H):
    im = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h
        d.line([(0, y), (w, y)], fill=(255, int(214 - 60 * t), int(120 - 80 * t)))
    return im


def phone_stage(pw, ph, w=1920, h=1080, top=40):
    """가로판 앱 장면 바탕: 주황 바탕 가운데 휴대폰 화면 자리의 그림자."""
    im = gradient(w, h)
    x = (w - pw) // 2
    sh = Image.new('L', (pw + 120, ph + 120), 0)
    ImageDraw.Draw(sh).rounded_rectangle([60, 70, pw + 60, ph + 70], 44, fill=130)
    im.paste((150, 70, 0), (x - 60, top - 60), sh.filter(ImageFilter.GaussianBlur(26)))
    return im, x


def cap_card(path):
    """앱 캡처를 주황 바탕 위 둥근 카드로. 자막 자리(아래쪽)는 비운다."""
    im = gradient()
    shot = Image.open(path).convert('RGB')
    bw, bh = W - 120, 1120
    s = min(bw / shot.width, bh / shot.height)
    shot = shot.resize((int(shot.width * s), int(shot.height * s)), Image.LANCZOS)
    x, y = (W - shot.width) // 2, 170 + (bh - shot.height) // 2
    sh = Image.new('L', (shot.width + 80, shot.height + 80), 0)
    ImageDraw.Draw(sh).rounded_rectangle([40, 48, shot.width + 40, shot.height + 48], 40, fill=120)
    im.paste((150, 70, 0), (x - 40, y - 40), sh.filter(ImageFilter.GaussianBlur(20)))
    m = Image.new('L', shot.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, *shot.size], 32, fill=255)
    im.paste(shot, (x, y), m)
    return im


def segment(i, kind, name, dur, lines, cy, tag, wide=False):
    """장면 하나를 무음 mp4 로. 세로 1080x1920, wide 면 가로 1920x1080."""
    w, h = (1920, 1080) if wide else (W, H)
    sfx = '_16x9' if wide else ''
    out = os.path.join(WORK, f'{tag}{sfx}_{i:02d}.mp4')
    cp = os.path.join(WORK, f'{tag}{sfx}_{i:02d}_cap.png')
    # 가로판 자막은 장면과 상관없이 아래쪽 한 자리
    caption(lines, W=w, H=h, cy=(950 if wide else cy), size=(54 if wide else 68)).save(cp)
    cover = f'scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={FPS}'
    if kind == 'app' and name in RECS and os.path.exists(os.path.join(REC, RECS[name][0])):
        f, t0, t1 = RECS[name]
        k = dur / (t1 - t0)   # 0.5 이면 두 배 빠르게
        if wide:
            # 녹화(630x1120)를 높이 1000 으로 세워 주황 무대 가운데에
            pw, ph = 562, 1000
            bg, x = phone_stage(pw, ph)
            bgp = os.path.join(WORK, f'{tag}{sfx}_{i:02d}_stage.png')
            bg.save(bgp)
            fc = (f'[0:v]{REC_CROP},setpts={k:.4f}*(PTS-STARTPTS),scale={pw}:{ph},setsar=1,fps={FPS},'
                  f'tpad=stop_mode=clone:stop_duration={dur}[r];'
                  f'[2:v][r]overlay={x}:40[v];[v][1:v]overlay=0:0,fps={FPS},setsar=1,format=yuv420p')
            run(['-ss', str(t0), '-t', str(t1 - t0), '-i', os.path.join(REC, f), '-loop', '1', '-i', cp,
                 '-loop', '1', '-i', bgp, '-filter_complex', fc, '-t', str(dur), '-an', '-c:v', 'libx264',
                 '-crf', '18', out])
        else:
            run(['-ss', str(t0), '-t', str(t1 - t0), '-i', os.path.join(REC, f), '-loop', '1', '-i', cp,
                 '-filter_complex',
                 f'[0:v]{REC_CROP},setpts={k:.4f}*(PTS-STARTPTS),{cover},tpad=stop_mode=clone:stop_duration={dur}[v];'
                 f'[v][1:v]overlay=0:0,format=yuv420p',
                 '-t', str(dur), '-an', '-c:v', 'libx264', '-crf', '18', out])
        return out, f'rec x{1 / k:.1f}'
    clip = os.path.join(CLIPS if kind == 'ai' else REC, name + sfx + '.mp4')
    if kind != 'end' and os.path.exists(clip):
        # 영상 재료: 모자라면 마지막 프레임을 늘려서 길이를 맞춘다
        run(['-i', clip, '-loop', '1', '-i', cp, '-filter_complex',
             f'[0:v]{cover},tpad=stop_mode=clone:stop_duration={dur}[v];[v][1:v]overlay=0:0,format=yuv420p',
             '-t', str(dur), '-an', '-c:v', 'libx264', '-crf', '18', out])
        return out, ('clip' if kind == 'ai' else 'rec')
    if kind == 'ai':
        bp = ai_image(name + sfx)   # 가로판은 <이름>_16x9.png — 세로 그림을 늘려 쓰지 않는다
        src = 'img'
    elif kind == 'app':
        bp = os.path.join(WORK, f'{tag}{sfx}_{i:02d}_base.png')
        if wide:
            bg, x = phone_stage(562, 1000)
            shot = ImageOps.fit(Image.open(CAPS[name]).convert('RGB'), (562, 1000), Image.LANCZOS)
            bg.paste(shot, (x, 40))
            bg.save(bp)
        else:
            cap_card(CAPS[name]).save(bp)
        src = 'capture'
    else:
        bp = os.path.join(WORK, f'{tag}{sfx}_{i:02d}_base.png')
        endcard(w, h, line=name).save(bp)
        src = 'endcard'
    n = int(round(dur * FPS))
    zmax = {'ai': 1.08, 'app': 1.0 if wide else 1.04}.get(kind, 1.0)
    ydir = '0' if i % 2 else '(ih-ih/zoom)'
    run(['-loop', '1', '-t', str(dur), '-i', bp, '-loop', '1', '-i', cp, '-filter_complex',
         f"[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},scale={w * 2}:{h * 2},"
         f"zoompan=z='1+({zmax}-1)*on/{n}':x='(iw-iw/zoom)/2':y='{ydir}*on/{n}':d=1:s={w}x{h}:fps={FPS},"
         f"setsar=1[z];[z][1:v]overlay=0:0,format=yuv420p",
         '-t', str(dur), '-an', '-c:v', 'libx264', '-crf', '18', out])
    return out, src


def build(tag, scenes, wide=False):
    segs, used = [], []
    for i, sc in enumerate(scenes):
        p, src = segment(i, *sc, tag, wide=wide)
        segs.append((p, sc[2]))
        used.append(f'{sc[1]}:{src}')
    inputs, chains, prev, length = [], [], '0:v', segs[0][1]
    for p, _ in segs:
        inputs += ['-i', p]
    for i in range(1, len(segs)):
        off = length - XF
        chains.append(f'[{prev}][{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[x{i}]')
        prev, length = f'x{i}', off + segs[i][1]
    out = os.path.join(OUT, f'{tag}_{"16x9" if wide else "9x16"}.mp4')
    run([*inputs, '-filter_complex', ';'.join(chains), '-map', f'[{prev}]', '-c:v', 'libx264', '-crf', '18',
         '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
    print(f'{tag}{" 16:9" if wide else ""}: {length:.1f}s  ' + ' '.join(used))
    return out


def main():
    for p in (WORK, OUT, CLIPS, REC):
        os.makedirs(p, exist_ok=True)
    want = sys.argv[1:]
    if not want or 'A' in want:
        build('A_launch', A)
        build('A_launch', A, wide=True)   # 플레이스토어 등록정보 홍보 동영상용
    for tag, scenes in B.items():
        if not want or tag in want or tag.split('_')[0] in want:
            build(tag, scenes)


if __name__ == '__main__':
    main()
