import { describe, expect, it } from 'vitest';
import { buildHealthExerciseCardHtml, buildHealthSleepCardHtml, buildHypnogramSvg, formatPace, hypnogramRuns, smoothHypnogramPath } from '../js/health-cards.js';
import { hasHealthConnectExerciseCredit } from '../js/health-connect-activity.js';
import { createRequire } from 'node:module';
import { readFileSync as readFs } from 'node:fs';
const readFileSync = (path) => readFs(new URL(`../${path}`, import.meta.url), 'utf8');

const require = createRequire(import.meta.url);
const { calculateServerAwardedPoints, hasHealthConnectExerciseEvidence } = require('../functions/points-utils.js');

// 한국 시각으로 만든다. kst(27, 8, 49) = 2026-11-27 08:49 KST.
const kst = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour - 9, minute);
const clock = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);

// 대표 11/27 실제 기록 (Nothing X)
const night = {
    source: 'health_connect', providerLabel: 'Nothing X', wakeDate: '2026-11-27',
    startEpochMillis: kst(26, 20, 28), endEpochMillis: kst(27, 9, 54),
    asleepMinutes: 568, inBedMinutes: 568, deepMinutes: 116, remMinutes: 121, lightMinutes: 331, awakeMinutes: 0,
    hasStages: true, sleepHours: 9.5
};
const run = {
    type: 'running', label: '달리기', startEpochMillis: kst(27, 8, 49), endEpochMillis: kst(27, 9, 48),
    minutes: 59, kcal: 212, distanceKm: 2.7, stepCounted: true, providerLabel: 'Nothing X'
};

describe('수면 카드 — 캡처 대신 (2026-11-27)', () => {
    it('출처 · 잔 시간 · 시각 · 단계 막대', () => {
        const html = buildHealthSleepCardHtml(night, { formatClock: clock });
        expect(html).toContain('Nothing X');
        expect(html).toContain('9시간 28분');
        expect(html).toContain('20:28 ~ 09:54');
        expect(html).toContain('hc-stage-bar');
        expect(html.match(/class="hc-stage hc-stage-/g)).toHaveLength(3); // 깸 0분은 그리지 않는다
        expect(html).toContain('깊은 잠 1시간 56분');
    });

    it('단계가 없으면 막대 없이', () => {
        const html = buildHealthSleepCardHtml({ ...night, hasStages: false }, { formatClock: clock });
        expect(html).toContain('9시간 28분');
        expect(html).not.toContain('hc-stage-bar');
    });

    it('영어 앱에는 한글이 없다', () => {
        const html = buildHealthSleepCardHtml(night, { english: true, formatClock: clock });
        expect(html).not.toMatch(/[가-힣]/);
        expect(html).toContain('9h 28m');
    });

    it('기록은 누구든 고칠 수 있다 — 글자는 이스케이프, 말이 안 되는 값은 그리지 않는다', () => {
        const html = buildHealthSleepCardHtml({ ...night, providerLabel: '<img src=x onerror=alert(1)>' });
        expect(html).not.toContain('<img');
        expect(buildHealthSleepCardHtml({ ...night, asleepMinutes: 99999 })).toBe('');
        expect(buildHealthSleepCardHtml(null)).toBe('');
    });
});

describe('운동 카드', () => {
    it('거리 · 시간 · 페이스 · 칼로리 · 출처', () => {
        const html = buildHealthExerciseCardHtml(run, { formatClock: clock });
        expect(html).toContain('🏃 달리기');
        expect(html).toContain('Nothing X');
        expect(html).toContain('2.7<small>km</small>');
        expect(html).toContain('59분');
        expect(html).toContain('21&#39;51&quot;/km'); // 21'51"/km
        expect(html).toContain('212kcal');
        expect(html).toContain('08:49');
    });

    it('거리가 없는 운동은 시간이 크게, 페이스 없이', () => {
        const html = buildHealthExerciseCardHtml({ type: 'strength_training', label: '근력 운동', minutes: 40, kcal: 150 });
        expect(html).toContain('<strong>40분</strong>');
        expect(html).not.toContain('페이스');
    });

    it('페이스 계산', () => {
        expect(formatPace(30, 5)).toBe(`6'00"`);
        expect(formatPace(32, 4.12)).toBe(`7'46"`);
        expect(formatPace(10, 0.1)).toBe('');
    });

    it('영어 앱에는 한글이 없다', () => {
        expect(buildHealthExerciseCardHtml(run, { english: true, formatClock: clock })).not.toMatch(/[가-힣]/);
    });
});

describe('워치 운동도 유산소 캡처처럼 10P (2026-11-27 대표)', () => {
    const log = (sessions, extra = {}) => ({
        userId: 'u1', date: '2026-11-27', exercise: { healthSessions: sessions }, ...extra
    });

    it('그날 시작한 10분 이상 운동이면 인정 — 서버와 화면이 같다', () => {
        expect(hasHealthConnectExerciseEvidence({ healthSessions: [run] }, '2026-11-27')).toBe(true);
        expect(hasHealthConnectExerciseCredit({ healthSessions: [run] }, '2026-11-27')).toBe(true);
    });

    it('짧거나 다른 날 운동은 인정하지 않는다', () => {
        const short = { ...run, endEpochMillis: run.startEpochMillis + 9 * 60000 };
        const yesterday = { ...run, startEpochMillis: kst(26, 8, 0), endEpochMillis: kst(26, 9, 0) };
        for (const s of [short, yesterday]) {
            expect(hasHealthConnectExerciseEvidence({ healthSessions: [s] }, '2026-11-27')).toBe(false);
            expect(hasHealthConnectExerciseCredit({ healthSessions: [s] }, '2026-11-27')).toBe(false);
        }
    });

    it('정산: 워치 운동 여러 개여도 캡처 한 장 — 10P', async () => {
        const result = await calculateServerAwardedPoints(log([run, { ...run, startEpochMillis: kst(27, 18, 0), endEpochMillis: kst(27, 18, 40) }]), { isValidMedia: () => false });
        const units = (result.ledgerUnits || result.units || []).filter((u) => u.category === 'exercise');
        expect(units).toHaveLength(1);
        expect(units[0].points).toBe(10);
        expect(units[0].evidenceType).toBe('health_connect_exercise');
    });

    it('정산: 워치 운동 + 8,000보 = 10P + 5P (캡처 두 장과 같다)', async () => {
        const result = await calculateServerAwardedPoints(log([run], { steps: { count: 9000 } }), { isValidMedia: () => false });
        const units = (result.ledgerUnits || result.units || []).filter((u) => u.category === 'exercise');
        expect(units.map((u) => u.points)).toEqual([10, 5]);
    });
});

describe('갤러리에도 카드로 (functions/gallery-posts.js)', () => {
    const { buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');
    const build = (extra = {}) => buildGalleryPostFromDailyLog({
        logId: 'u1_2026-11-27',
        dailyLog: { userId: 'u1', date: '2026-11-27', userName: '회원', ...extra },
        updatedAt: 'now'
    });

    it('사진이 없어도 워치 운동·수면이 있으면 게시물이 된다', () => {
        const post = build({
            exercise: { healthSessions: [run] },
            sleepAndMind: { sleepHours: 9.5, sleepSync: night }
        });
        expect(post.exercise.healthSessions[0]).toMatchObject({ type: 'running', distanceKm: 2.7, kcal: 212, providerLabel: 'Nothing X' });
        expect(post.sleepAndMind.sleepSync).toMatchObject({ providerLabel: 'Nothing X', asleepMinutes: 568, hasStages: true });
    });

    it('회원이 고친 수면 시간이면 기기 수면을 싣지 않는다', () => {
        const post = build({ sleepAndMind: { sleepHours: 7, sleepSync: night } });
        expect(post).toBeNull();
    });

    it('공유를 끈 칸은 싣지 않는다', () => {
        const post = build({
            shareSettings: { hideExercise: true, hideMind: true },
            exercise: { healthSessions: [run] },
            sleepAndMind: { sleepHours: 9.5, sleepSync: night }
        });
        expect(post).toBeNull();
    });

    it('숫자만 옮기고 이상한 값은 버린다', () => {
        const post = build({ exercise: { healthSessions: [{ ...run, type: '<script>', kcal: 1e9, extra: 'x' }, { minutes: 'x' }] } });
        expect(post.exercise.healthSessions).toHaveLength(1);
        expect(post.exercise.healthSessions[0].type).toBe('other');
        expect(post.exercise.healthSessions[0].kcal).toBeUndefined();
        expect(post.exercise.healthSessions[0].extra).toBeUndefined();
    });
});

describe('시간축 수면 그래프', () => {
    const staged = { ...night, stages: [0, 30, 2, 30, 60, 3, 90, 280, 4, 608, 198, 2] };

    it('조각이 있으면 비율 막대 대신 시간축 그래프와 시각', () => {
        const html = buildHealthSleepCardHtml(staged, { formatClock: clock });
        expect(html).toContain('<svg');
        // 막대가 아니라 부드러운 선 (2026-11-27 대표: "바 말고 그래프로", "부드러운 선으로")
        expect(html).not.toContain('<rect ');
        expect(html).toContain('class="hc-hyp-line"');
        expect(html).toMatch(/class="hc-hyp-line" d="M[^"]* C/);
        expect(html).toContain('hc-hyp-axis');
        expect(html).not.toContain('hc-stage-bar');
        expect(html).toContain('깊은 잠'); // 범례는 그대로
    });

    it('조각이 밤 밖으로 나가면 그리지 않는다', () => {
        expect(buildHypnogramSvg([0, 5000, 2], 600)).toBe('');
        expect(buildHypnogramSvg([], 600)).toBe('');
        expect(buildHypnogramSvg([0, 10, 99], 600)).toBe('');
    });

    it('영어 앱에는 한글이 없다', () => {
        expect(buildHealthSleepCardHtml(staged, { english: true, formatClock: clock })).not.toMatch(/[가-힣]/);
    });

    it('갤러리 게시물에도 조각이 숫자만 간다', () => {
        const { buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-11-27',
            dailyLog: { userId: 'u1', date: '2026-11-27', sleepAndMind: { sleepHours: 9.5, sleepSync: { ...staged, stages: [...staged.stages, 'x', 1, 2] } } },
            updatedAt: 'now'
        });
        expect(post.sleepAndMind.sleepSync.stages).toEqual(staged.stages);
    });
});

describe('러닝 동선 · 심박 · 페이스 (1.0.16)', async () => {
    const { sanitizeWorkoutDetail } = await import('../js/health-connect-activity.js');
    const { buildWorkoutTileModel, buildSleepTileModel, formatClockDuration } = await import('../js/health-share-tiles.js');
    const route = [0, 500, 200, 300, 400, 100, 700, 200, 900, 500, 700, 800, 400, 900, 100, 700];
    const detailed = { ...run, route, hr: [0, 120, 135, 142, 150, 148], pace: [400, 390, 0, 380, 370] };

    it('숫자만 받고, 말이 안 되는 칸은 그 칸만 버린다', () => {
        const d = sanitizeWorkoutDetail(detailed);
        expect(d.route).toEqual(route);
        expect(d.hrAvg).toBe(139);
        expect(d.hrMax).toBe(150);
        expect(d.pace).toEqual([400, 390, 0, 380, 370]);
        expect(sanitizeWorkoutDetail({ route: [1, 2, 3], hr: [500], pace: ['x'] })).toEqual({});
        expect(sanitizeWorkoutDetail({ route: [37.5, 127.0, 37.6, 127.1] })).toEqual({}); // 위도·경도 같은 소수는 받지 않는다
    });

    it('운동 카드: 동선 모양 · 심박 · 페이스 그래프', () => {
        const html = buildHealthExerciseCardHtml({ ...detailed, ...sanitizeWorkoutDetail(detailed) }, { formatClock: clock });
        expect(html).toContain('class="hc-route"');
        expect(html).toContain('hc-series-hr');
        expect(html).toContain('hc-series-pace');
        expect(html).toContain('평균 심박');
        // 자랑 카드는 갤러리 「내 카드 공유」로 옮겼다 — 운동 카드에는 단추가 없다.
        expect(html).not.toContain('data-hc-share');
    });

    it('동선·심박이 없는 달리기에는 권한을 켜는 단추를 한 번 권한다', () => {
        expect(buildHealthExerciseCardHtml(run, { offerDetail: true })).toContain('data-hc-detail');
        expect(buildHealthExerciseCardHtml({ ...detailed, ...sanitizeWorkoutDetail(detailed) }, { offerDetail: true })).not.toContain('data-hc-detail');
        expect(buildHealthExerciseCardHtml({ type: 'yoga', label: '요가', minutes: 30 }, { offerDetail: true })).not.toContain('data-hc-detail');
        expect(buildHealthExerciseCardHtml(run)).not.toContain('data-hc-detail');
    });

    it('공유 카드 운동 타일 모델', () => {
        const model = buildWorkoutTileModel({ ...detailed, ...sanitizeWorkoutDetail(detailed) }, { startClock: '08:49' });
        expect(model.title).toBe('🏃 달리기');
        expect(model.big).toBe('2.70');
        expect(model.unit).toBe('km');
        expect(model.when).toBe('08:49');
        expect(model.stats).toEqual(['59:00', `21'51"/km`, '♥ 139']);
        expect(model.route).toHaveLength(8);
        // 거리가 없으면 시간이 크게
        expect(buildWorkoutTileModel({ type: 'strength_training', minutes: 40 }).big).toBe('40:00');
        expect(formatClockDuration(59, 0, 0)).toBe('59:00');
        expect(formatClockDuration(0, 0, 3723000)).toBe('1:02:03');
        expect(JSON.stringify(buildWorkoutTileModel(detailed, { english: true }))).not.toMatch(/[가-힣]/);
        expect(buildWorkoutTileModel({ minutes: 0 })).toBeNull();
    });

    it('공유 카드 수면 타일 모델', () => {
        const staged = { ...night, stages: [0, 30, 2, 30, 60, 3] };
        const model = buildSleepTileModel(staged, { startClock: '20:28', endClock: '09:54' });
        expect(model.big).toBe('9시간 28분');
        expect(model.window).toBe('20:28 ~ 09:54');
        expect(model.stages).toEqual([0, 30, 2, 30, 60, 3]);
        expect(model.totals.map(([k]) => k)).toEqual(['deep', 'rem', 'light']);
        expect(JSON.stringify(buildSleepTileModel(staged, { english: true }))).not.toMatch(/[가-힣]/);
    });

    it('「내 카드 공유」가 워치 운동·수면 타일을 사진처럼 싣는다', () => {
        const app = readFileSync('js/app-core.js');
        expect(app).toContain("const tile = getHealthShareTile('exercise', session);");
        expect(app).toContain("const tile = getHealthShareTile('sleep', latest.sleepAndMind.sleepSync);");
        expect(app).not.toContain('shareHealthWorkoutCard');
    });

    it('갤러리 게시물에도 숫자만 간다', () => {
        const { buildGalleryPostFromDailyLog } = require('../functions/gallery-posts.js');
        const post = buildGalleryPostFromDailyLog({
            logId: 'u1_2026-11-27',
            dailyLog: { userId: 'u1', date: '2026-11-27', exercise: { healthSessions: [{ ...detailed, route: [...route, 5000, 1] }] } },
            updatedAt: 'now'
        });
        const s = post.exercise.healthSessions[0];
        expect(s.route).toBeUndefined(); // 범위를 벗어난 점이 있으면 동선 전체를 버린다
        expect(s.hrAvg).toBe(139);
        expect(s.pace).toEqual([400, 390, 0, 380, 370]);
    });

    it('네이티브: 권한 셋, 위도·경도를 웹으로 보내지 않는다', () => {
        const manifest = readFileSync('android/app/src/main/AndroidManifest.xml');
        ['READ_EXERCISE_ROUTES', 'READ_HEART_RATE', 'READ_SPEED'].forEach((p) => expect(manifest).toContain(`android.permission.health.${p}`));
        const codec = readFileSync('android/app/src/main/java/com/habitschool/app/health/WorkoutDetailCodec.kt');
        expect(codec).toContain('fun shapeRoute(points: List<Pair<Double, Double>>): IntArray');
        const activity = readFileSync('android/app/src/main/java/com/habitschool/app/health/HealthConnectActivity.kt');
        expect(activity).toContain('put("route"');
        expect(activity).not.toMatch(/latitude|longitude/);
        const permission = readFileSync('android/app/src/main/java/com/habitschool/app/HealthConnectPermissionActivity.kt');
        expect(permission).toContain('"activity_permissions_asked_v2"');
    });
});

describe('수면 선 — 이어진 곳은 한 선, 깨어 있던 사이는 끊는다', () => {
    it('같은 단계가 이어지면 한 칸으로, 2분 넘게 비면 새 선', () => {
        const runs = hypnogramRuns([0, 30, 2, 30, 60, 3, 90, 10, 3, 608, 198, 2], 806);
        expect(runs).toHaveLength(2);
        expect(runs[0].map((c) => c.level)).toEqual([2, 3]);
        expect(runs[0][1].x1).toBeCloseTo(100 / 806);
        expect(runs[1]).toHaveLength(1);
    });

    it('칸 사이는 S자 곡선, 시작은 M, 끝은 L', () => {
        const cmds = smoothHypnogramPath([{ x0: 0, x1: 0.5, level: 2 }, { x0: 0.5, x1: 1, level: 3 }], (t) => t * 100, (l) => l * 10);
        expect(cmds.map((c) => c[0])).toEqual(['M', 'L', 'C', 'L']);
        expect(cmds[2][5]).toBeCloseTo(51.8);
        expect(cmds[2][6]).toBe(30);
    });
});

describe('갤러리 격자에 워치 달리기·수면 (2026-11-27 대표: "다른 기록처럼 3칸에, 분석 확인 누르면 크게")', () => {
    const app = readFileSync('js/app-core.js');
    const collect = app.split('function collectGalleryMedia(data) {')[1].split('\n}\n')[0];

    it('운동·마음 칸 격자에 사진처럼 들어간다 — 따로 넓은 카드를 두지 않는다', () => {
        expect(collect).toContain("result.exerciseHtml += buildGalleryHealthTileHtml('exercise', session);");
        expect(collect).toContain("result.mindHtml += buildGalleryHealthTileHtml('sleep', data.sleepAndMind.sleepSync);");
        expect(collect).not.toContain('exerciseCards');
        expect(app).not.toContain('gallery-health-cards">');
    });

    it('수면 캡처가 있는 날은 캡처만', () => {
        expect(collect).toContain('data.sleepAndMind?.sleepSync && !data.sleepAndMind?.sleepImageUrl');
    });

    it('「분석 확인」은 사진 칸처럼 갤러리 안에서 펼친다 — 따로 뜨는 창 없음', () => {
        const tile = app.split('function buildGalleryHealthTileHtml(kind, data) {')[1].split('\n}\n')[0];
        expect(tile).toContain('toggleGalleryAiOverlay(this)');
        expect(tile).toContain('<div class="gallery-ai-overlay" style="display:none;"></div>');
        expect(tile).toContain('getHealthTileDataUrl(kind, data, 540)');
        expect(app).not.toContain('openGalleryHealthCard');
        const overlay = app.split('function renderGalleryAiOverlayContent(wrapper, overlay) {')[1].split('\n}\n')[0];
        expect(overlay).toContain('buildHealthSleepCardHtml(data, { english, formatClock: formatKstClock })');
        expect(overlay).toContain('buildHealthExerciseCardHtml(data, { english, formatClock: formatKstClock })');
        // 펼치면 칸이 격자 전체 너비 — 같은 그림을 큰 크기로
        expect(app).toContain("getHealthTileDataUrl(wrapper.dataset.healthKind === 'sleep' ? 'sleep' : 'exercise', healthData, 1080)");
    });
});
