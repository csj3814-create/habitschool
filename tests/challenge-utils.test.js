import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const cu = require('../functions/challenge-utils.js');

// 서버(runtime.js) 챌린지 정산 계산의 behavioral 회귀 방지.
// 이 로직은 원금/보너스, 일일 로그 재계산, 부분달성 정산 등 반복 버그 최다 구역이라
// (lessons.md) 실제 함수를 실행해 검증한다. 모든 케이스는 todayStr을 주입해 시간 비의존.

describe('challenge qualification policy', () => {
    it('weekly/master require 65P/day (daily_min_points)', () => {
        expect(cu.buildDefaultChallengeQualificationPolicy('weekly')).toMatchObject({
            type: 'daily_min_points', dailyMinPoints: 65,
        });
        expect(cu.buildDefaultChallengeQualificationPolicy('master')).toMatchObject({
            type: 'daily_min_points', dailyMinPoints: 65,
        });
    });

    it('mini falls back to all-categories legacy rule', () => {
        expect(cu.buildDefaultChallengeQualificationPolicy('mini')).toMatchObject({
            type: 'all_categories', requiredCategories: ['diet', 'exercise', 'mind'],
        });
    });

    it('normalizes a stored policy round-trip and rejects garbage to legacy', () => {
        const p = cu.normalizeChallengeQualificationPolicy({ type: 'daily_min_points', dailyMinPoints: 65, tier: 'weekly' }, 'weekly');
        expect(p).toMatchObject({ type: 'daily_min_points', dailyMinPoints: 65 });
        expect(cu.normalizeChallengeQualificationPolicy(null, 'mini').type).toBe('all_categories');
        expect(cu.normalizeChallengeQualificationPolicy({ type: 'bogus' }, 'mini').type).toBe('all_categories');
    });
});

describe('doesAwardedPointsMeetChallengeRule', () => {
    it('65P threshold: 64 fails, 65 passes for weekly', () => {
        expect(cu.doesAwardedPointsMeetChallengeRule({ dietPoints: 30, exercisePoints: 30, mindPoints: 4 }, 'weekly')).toBe(false); // 64
        expect(cu.doesAwardedPointsMeetChallengeRule({ dietPoints: 30, exercisePoints: 30, mindPoints: 5 }, 'weekly')).toBe(true);  // 65
    });

    it('mini all-categories needs diet+exercise+mind all present', () => {
        expect(cu.doesAwardedPointsMeetChallengeRule({ diet: true, exercise: true, mind: true }, 'mini')).toBe(true);
        expect(cu.doesAwardedPointsMeetChallengeRule({ diet: true, exercise: true, mind: false }, 'mini')).toBe(false);
    });

    it('getAwardedPointsTotal uses explicit points, else category fallback', () => {
        expect(cu.getAwardedPointsTotal({ dietPoints: 10, exercisePoints: 15, mindPoints: 5 })).toBe(30);
        expect(cu.getAwardedPointsTotal({ diet: true, exercise: true, mind: true })).toBe(30); // 10+15+5 fallback
        expect(cu.getAwardedPointsTotal({})).toBe(0);
    });
});

describe('completion counting', () => {
    it('dedupes completedDates and takes max(completedDays, unique dates)', () => {
        expect(cu.getChallengeCompletedDays({ completedDates: ['2026-01-01', '2026-01-01', '2026-01-02'] })).toBe(2);
        expect(cu.getChallengeCompletedDays({ completedDays: 5, completedDates: ['2026-01-01'] })).toBe(5);
        const norm = cu.normalizeChallengeCompletion({ completedDates: ['2026-01-01', '2026-01-01'] });
        expect(norm.completedDates).toEqual(['2026-01-01']);
        expect(norm.completedDays).toBe(1);
    });
});

describe('canSettleChallengeAsClaimable (failure/partial-settlement guardrails)', () => {
    const challenge = { endDate: '2026-01-07' };

    it('full completion is claimable regardless of date', () => {
        expect(cu.canSettleChallengeAsClaimable(challenge, 7, 7, '2026-01-05')).toBe(true);
    });

    it('past end + >=80% is claimable', () => {
        // 6/7 = 0.857 >= 0.8, and today after endDate
        expect(cu.canSettleChallengeAsClaimable(challenge, 6, 7, '2026-01-08')).toBe(true);
    });

    it('past end + <80% is NOT claimable', () => {
        // 5/7 = 0.714 < 0.8
        expect(cu.canSettleChallengeAsClaimable(challenge, 5, 7, '2026-01-08')).toBe(false);
    });

    it('not past end + partial is NOT claimable (must finish or wait)', () => {
        expect(cu.canSettleChallengeAsClaimable(challenge, 6, 7, '2026-01-05')).toBe(false);
    });

    it('isChallengePastEnd compares KST date strings', () => {
        expect(cu.isChallengePastEnd({ endDate: '2026-01-07' }, '2026-01-08')).toBe(true);
        expect(cu.isChallengePastEnd({ endDate: '2026-01-07' }, '2026-01-07')).toBe(false);
    });
});

describe('getChallengeDateRange', () => {
    it('expands startDate + totalDays', () => {
        expect(cu.getChallengeDateRange({ startDate: '2026-01-01', totalDays: 3 }))
            .toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    });

    it('expands startDate + endDate inclusive', () => {
        expect(cu.getChallengeDateRange({ startDate: '2026-01-01', endDate: '2026-01-03' }))
            .toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    });

    it('falls back to sorted unique completedDates when no valid range', () => {
        expect(cu.getChallengeDateRange({ completedDates: ['2026-01-03', '2026-01-01', '2026-01-01'] }))
            .toEqual(['2026-01-01', '2026-01-03']);
    });
});

describe('reconcileChallengeCompletionWithDailyLogs (recompute from daily logs at payout)', () => {
    // 실제 weekly/master 챌린지는 시작 시 qualificationPolicy(65P)를 저장한다.
    const challenge = {
        startDate: '2026-01-01', totalDays: 3, endDate: '2026-01-03',
        completedDates: [], completedDays: 0,
        qualificationPolicy: cu.buildDefaultChallengeQualificationPolicy('weekly'),
    };

    it('WITHOUT a stored policy, falls back to legacy all-categories (not the tier default 65P)', () => {
        // 주의(문서화): policy 미저장 시 normalize(null, tier)는 tier 무관하게 all_categories.
        const noPolicy = { startDate: '2026-01-01', totalDays: 1, endDate: '2026-01-01', completedDates: [] };
        const numericOnly = { '2026-01-01': { awardedPoints: { dietPoints: 80 } } }; // 80P지만 카테고리 플래그 없음
        expect(cu.reconcileChallengeCompletionWithDailyLogs(noPolicy, numericOnly, 'weekly').completedDays).toBe(0);
        const allCats = { '2026-01-01': { awardedPoints: { diet: true, exercise: true, mind: true } } };
        expect(cu.reconcileChallengeCompletionWithDailyLogs(noPolicy, allCats, 'weekly').completedDays).toBe(1);
    });

    it('counts only days whose logs meet the qualification rule', () => {
        const logs = {
            '2026-01-01': { awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 5 } }, // 65 ok
            '2026-01-02': { awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 4 } }, // 64 fail
            '2026-01-03': { awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 20 } }, // 80 ok
        };
        const r = cu.reconcileChallengeCompletionWithDailyLogs(challenge, logs, 'weekly');
        expect(r.completedDates).toEqual(['2026-01-01', '2026-01-03']);
        expect(r.completedDays).toBe(2);
    });

    it('clamps reconciled days to totalDays (cannot exceed challenge length)', () => {
        const seeded = { ...challenge, completedDays: 99 };
        const r = cu.reconcileChallengeCompletionWithDailyLogs(seeded, {}, 'weekly');
        expect(r.completedDays).toBe(3); // min(totalDays=3, max(99, 0))
    });

    it('drops pre-existing completedDates that fall outside the challenge range', () => {
        const seeded = { ...challenge, completedDates: ['2025-12-31', '2026-01-02'] };
        const logs = { '2026-01-02': { awardedPoints: { dietPoints: 65 } } };
        const r = cu.reconcileChallengeCompletionWithDailyLogs(seeded, logs, 'weekly');
        expect(r.completedDates).toEqual(['2026-01-02']); // out-of-range 2025-12-31 dropped
        expect(r.completedDays).toBe(1);
    });

    it('keeps a pre-existing in-range completed date even without a matching log', () => {
        const seeded = { ...challenge, completedDates: ['2026-01-01'] };
        const r = cu.reconcileChallengeCompletionWithDailyLogs(seeded, {}, 'weekly');
        expect(r.completedDates).toEqual(['2026-01-01']);
        expect(r.completedDays).toBe(1);
    });
});
