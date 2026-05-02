import { describe, expect, it } from 'vitest';
import {
    SOCIAL_CHALLENGE_MIN_ACTIVITY_DAYS,
    buildSocialChallengeLookbackDateStrings,
    summarizeSocialChallengeReadinessLogs
} from '../js/social-challenge-readiness.js';

describe('social challenge friend readiness', () => {
    it('builds the readiness window across month boundaries', () => {
        const dates = buildSocialChallengeLookbackDateStrings('2026-05-01');

        expect(dates[0]).toBe('2026-05-01');
        expect(dates).toContain('2026-04-30');
        expect(dates).toContain('2026-04-27');
        expect(dates.length).toBeGreaterThan(SOCIAL_CHALLENGE_MIN_ACTIVITY_DAYS);
    });

    it('counts previous-month records toward the five-day requirement', () => {
        const summary = summarizeSocialChallengeReadinessLogs([
            { date: '2026-04-27', data: { awardedPoints: { dietPoints: 30 } } },
            { date: '2026-04-28', data: { awardedPoints: { exercisePoints: 30 } } },
            { date: '2026-04-29', data: { awardedPoints: { mindPoints: 20 } } },
            { date: '2026-04-30', data: { awardedPoints: { dietPoints: 30, mindPoints: 20 } } },
            { date: '2026-05-01', data: { awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 20 } } }
        ], {
            todayStr: '2026-05-01',
            weekStrs: ['2026-04-27', '2026-04-28', '2026-04-29', '2026-04-30', '2026-05-01']
        });

        expect(summary.recentDays).toBe(5);
        expect(summary.weekDays).toBe(5);
        expect(summary.todayCompleted).toBe(3);
        expect(summary.eligible).toBe(true);
        expect(summary.shortfall).toBe(0);
    });

    it('counts unique record dates instead of duplicate documents', () => {
        const summary = summarizeSocialChallengeReadinessLogs([
            { date: '2026-04-30', data: { awardedPoints: { dietPoints: 30 } } },
            { date: '2026-04-30', data: { awardedPoints: { dietPoints: 30, exercisePoints: 30 } } },
            { date: '2026-05-01', data: { awardedPoints: { mindPoints: 20 } } }
        ], {
            todayStr: '2026-05-01',
            weekStrs: ['2026-04-30', '2026-05-01']
        });

        expect(summary.recentDays).toBe(2);
        expect(summary.weekDays).toBe(2);
        expect(summary.eligible).toBe(false);
        expect(summary.shortfall).toBe(3);
    });
});
