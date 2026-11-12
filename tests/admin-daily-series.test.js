import { describe, expect, it } from 'vitest';
import seriesModule from '../functions/admin-daily-series.js';
import { buildAdminDailySeriesView } from '../js/admin-utils.js';
import { readRepoFile } from './source-helpers.js';

// 관제탑 대시보드 일별 활성 유저·지급 포인트 기간 보기 (7·30·100·365일).
// 모두 합성 자료다.

const {
    SETTLE_DAYS,
    listDateKeys,
    normalizeRangeDays,
    isValidDateKey,
    planLogReadStart,
    aggregateLogsByDate,
    buildBonusPointsMap,
    buildDailySeries,
} = seriesModule;

const TODAY = '2026-11-12';
const identityDate = (value) => (typeof value === 'string' ? value : '');

describe('range and dates', () => {
    it('accepts only 7·30·100·365', () => {
        expect([7, 30, 100, 365].map(normalizeRangeDays)).toEqual([7, 30, 100, 365]);
        expect(normalizeRangeDays(14)).toBe(0);
        expect(normalizeRangeDays('365')).toBe(365);
        expect(normalizeRangeDays(undefined)).toBe(0);
    });

    it('lists days ending today, oldest first, across year boundary', () => {
        const keys = listDateKeys(TODAY, 365);
        expect(keys).toHaveLength(365);
        expect(keys[0]).toBe('2025-11-13');
        expect(keys.at(-1)).toBe(TODAY);
        expect(new Set(keys).size).toBe(365);
    });

    it('rejects impossible dates', () => {
        expect(isValidDateKey('2026-02-30')).toBe(false);
        expect(isValidDateKey('2026-11-12')).toBe(true);
    });
});

describe('cost: old days are read once, then come from cache', () => {
    const keys = listDateKeys(TODAY, 365);

    it('with an empty cache, reads the whole range', () => {
        expect(planLogReadStart({ dateKeys: keys, cachedDays: {}, todayStr: TODAY })).toBe(keys[0]);
    });

    it('with a full cache, reads only the last few unsettled days', () => {
        const cachedDays = Object.fromEntries(keys.slice(0, -SETTLE_DAYS).map((d) => [d, { active: 1, points: 10 }]));
        expect(planLogReadStart({ dateKeys: keys, cachedDays, todayStr: TODAY })).toBe('2026-11-10');
    });

    it('a gap in the cache restarts reading from the gap', () => {
        const cachedDays = Object.fromEntries(keys.slice(0, -SETTLE_DAYS).map((d) => [d, { active: 1, points: 10 }]));
        delete cachedDays['2026-10-01'];
        expect(planLogReadStart({ dateKeys: keys, cachedDays, todayStr: TODAY })).toBe('2026-10-01');
    });

    it('a 7-day range never reaches before its own start', () => {
        const short = listDateKeys(TODAY, 7);
        expect(planLogReadStart({ dateKeys: short, cachedDays: {}, todayStr: TODAY })).toBe(short[0]);
    });
});

describe('aggregation', () => {
    it('counts distinct members per day and sums awarded points', () => {
        const days = aggregateLogsByDate([
            { date: '2026-11-11', userId: 'a', awardedPoints: { dietPoints: 10, exercisePoints: 15 } },
            { date: '2026-11-11', userId: 'b', awardedPoints: { mindPoints: 5 } },
            { date: '2026-11-11', userId: 'a', awardedPoints: {} },
            { date: '2026-11-12', userId: 'c', awardedPoints: { diet: true } },
            { date: '2026-11-01', userId: 'x', awardedPoints: { dietPoints: 999 } },
        ], '2026-11-10', TODAY);
        expect(days).toEqual({
            '2026-11-10': { active: 0, points: 0 },
            '2026-11-11': { active: 2, points: 30 },
            '2026-11-12': { active: 1, points: 10 },
        });
    });

    it('bonus points keep the dashboard snapshot rules and the range', () => {
        const map = buildBonusPointsMap({
            users: [
                { createdAt: '2026-11-11', welcomeBonusGiven: true, referredBy: 'u1' },
                { createdAt: '2026-01-01', welcomeBonusGiven: true },
                { referralDay3BonusGiven: true, referralDay3BonusDate: '2026-11-12' },
            ],
            challengeTxs: [
                { status: 'success', date: '2026-11-12', rewardPoints: 100 },
                { status: 'failed', date: '2026-11-12', rewardPoints: 999 },
            ],
            monthlyRewards: [{ distributedAt: '2026-11-11', winners: [{ reward: 50 }, { reward: 30 }] }],
            startDate: '2026-11-01',
            endDate: TODAY,
            toKstDateKey: identityDate,
        });
        expect(map).toEqual({ '2026-11-11': 480, '2026-11-12': 600 });
    });

    it('merges cache, fresh days and bonus; never caches unsettled days', () => {
        const dateKeys = listDateKeys(TODAY, 5); // 11-08 … 11-12
        const { rows, nextCache, cacheChanged } = buildDailySeries({
            dateKeys,
            cachedDays: { '2026-11-08': { active: 4, points: 40 }, '2026-11-11': { active: 99, points: 99 } },
            freshDays: {
                '2026-11-09': { active: 5, points: 50 },
                '2026-11-10': { active: 6, points: 60 },
                '2026-11-11': { active: 7, points: 70 },
                '2026-11-12': { active: 8, points: 80 },
            },
            bonusPointsMap: { '2026-11-12': 200 },
            todayStr: TODAY,
        });
        expect(rows).toEqual([
            { date: '2026-11-08', active: 4, points: 40 },
            { date: '2026-11-09', active: 5, points: 50 },
            { date: '2026-11-10', active: 6, points: 60 },
            { date: '2026-11-11', active: 7, points: 70 },
            { date: '2026-11-12', active: 8, points: 280 },
        ]);
        // 11-10 이후(오늘·어제·그제)는 아직 바뀔 수 있어 캐시에 넣지 않는다. 오래된 캐시 값 11-11 도 버린다.
        expect(nextCache).toEqual({
            '2026-11-08': { active: 4, points: 40 },
            '2026-11-09': { active: 5, points: 50 },
        });
        expect(cacheChanged).toBe(true);
    });

    it('does not rewrite the cache when nothing settled changed', () => {
        const dateKeys = listDateKeys(TODAY, 5);
        const cachedDays = { '2026-11-08': { active: 4, points: 40 }, '2026-11-09': { active: 5, points: 50 } };
        const { cacheChanged } = buildDailySeries({
            dateKeys,
            cachedDays,
            freshDays: { '2026-11-10': { active: 1, points: 1 }, '2026-11-11': { active: 1, points: 1 }, '2026-11-12': { active: 1, points: 1 } },
            todayStr: TODAY,
        });
        expect(cacheChanged).toBe(false);
    });
});

describe('chart view', () => {
    const rows = (n) => listDateKeys(TODAY, n).map((date, i) => ({ date, active: i % 5, points: 10 }));

    it('7 and 30 days stay daily bars', () => {
        const week = buildAdminDailySeriesView(rows(7), 7);
        expect(week.chartType).toBe('bar');
        expect(week.labels).toHaveLength(7);
        expect(week.labels.at(-1)).toBe('11-12');
        expect(buildAdminDailySeriesView(rows(30), 30).chartType).toBe('bar');
    });

    it('100 days is a daily line', () => {
        const view = buildAdminDailySeriesView(rows(100), 100);
        expect(view.chartType).toBe('line');
        expect(view.unit).toBe('day');
        expect(view.labels).toHaveLength(100);
    });

    it('365 days is grouped by week ending today: average active, summed points', () => {
        const view = buildAdminDailySeriesView(rows(365), 365);
        expect(view.chartType).toBe('line');
        expect(view.unit).toBe('week');
        expect(view.labels).toHaveLength(53); // 52주 + 앞의 하루
        expect(view.labels.at(-1)).toBe('11-06'); // 마지막 묶음은 11-06 ~ 11-12
        expect(view.points.at(-1)).toBe(70);
        expect(view.points[0]).toBe(10); // 맨 앞 묶음은 하루뿐
        expect(view.points.reduce((a, b) => a + b, 0)).toBe(3650);
        // 하루 평균 — 같은 회원을 7번 세지 않는다
        const lastWeek = rows(365).slice(-7);
        const avg = lastWeek.reduce((a, r) => a + r.active, 0) / 7;
        expect(view.active.at(-1)).toBeCloseTo(Math.round(avg * 10) / 10, 5);
    });
});

describe('wiring', () => {
    const admin = readRepoFile('admin.html');
    const runtime = readRepoFile('functions/runtime.js');

    it('admin dashboard has the four range buttons and calls the server for long ranges', () => {
        [7, 30, 100, 365].forEach((d) => {
            expect(admin).toContain(`onclick="selectActivityRange(${d})"`);
        });
        expect(admin).toContain("httpsCallable(fns, 'getAdminDailySeries')");
        expect(admin).toContain('buildAdminDailySeriesView');
    });

    it('server function is admin-only, cached, and reads only needed daily_logs fields', () => {
        const start = runtime.indexOf('exports.getAdminDailySeries');
        expect(start).toBeGreaterThan(-1);
        const body = runtime.slice(start, runtime.indexOf('\n);', start));
        expect(body).toContain('await assertAdminRequest(request)');
        expect(body).toContain('meta/adminDailySeries');
        expect(body).toContain('.where("date", ">=", readStart)');
        expect(body).toContain('.select("date", "userId", "awardedPoints")');
    });

    it('dashboard snapshot uses the same bonus rules', () => {
        const start = runtime.indexOf('exports.getAdminDashboardSnapshot');
        const body = runtime.slice(start, runtime.indexOf('\n);', start));
        expect(body).toContain('buildDailySeriesBonusMap(');
    });
});
