import { describe, expect, it } from 'vitest';
import { buildHealthExerciseCardHtml, buildHealthSleepCardHtml, buildHypnogramSvg, formatPace } from '../js/health-cards.js';
import { hasHealthConnectExerciseCredit } from '../js/health-connect-activity.js';
import { createRequire } from 'node:module';

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
        expect(html.match(/<rect /g)).toHaveLength(4);
        expect(html).toContain('hc-hyp-deep');
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
