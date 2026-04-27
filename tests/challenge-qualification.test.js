import { describe, expect, it } from 'vitest';
import {
    CHALLENGE_DAILY_MIN_POINTS,
    getChallengeDateRange,
    doesAwardedPointsMeetChallengeRule,
    formatChallengeQualificationLabel,
    getAwardedPointsTotal,
    getChallengeCompletedDays,
    getChallengeTimelineState,
    getDefaultChallengeQualificationPolicy,
    normalizeChallengeCompletion,
    normalizeChallengeQualificationPolicy,
    reconcileActiveChallengesWithDailyLog,
    reconcileChallengeCompletionWithDailyLogs
} from '../js/blockchain-config.js';

describe('challenge qualification policy', () => {
    it('uses 65-point rule for new weekly and master challenges', () => {
        expect(getDefaultChallengeQualificationPolicy('weekly')).toMatchObject({
            type: 'daily_min_points',
            dailyMinPoints: CHALLENGE_DAILY_MIN_POINTS
        });
        expect(getDefaultChallengeQualificationPolicy('master')).toMatchObject({
            type: 'daily_min_points',
            dailyMinPoints: CHALLENGE_DAILY_MIN_POINTS
        });
    });

    it('keeps legacy all-category rule for mini challenges', () => {
        expect(getDefaultChallengeQualificationPolicy('mini')).toMatchObject({
            type: 'all_categories',
            requiredCategories: ['diet', 'exercise', 'mind']
        });
    });

    it('counts explicit awarded point totals for new token challenges', () => {
        expect(getAwardedPointsTotal({
            dietPoints: 30,
            exercisePoints: 30,
            mindPoints: 0
        })).toBe(60);

        expect(doesAwardedPointsMeetChallengeRule({
            dietPoints: 30,
            exercisePoints: 30,
            mindPoints: 0
        }, 'weekly')).toBe(false);

        expect(doesAwardedPointsMeetChallengeRule({
            dietPoints: 30,
            exercisePoints: 15,
            mindPoints: 20
        }, 'weekly')).toBe(true);
    });

    it('falls back to legacy booleans when point fields are absent', () => {
        expect(getAwardedPointsTotal({
            diet: true,
            exercise: true,
            mind: true
        })).toBe(30);
    });

    it('normalizes stored point-based policies and formats labels', () => {
        const normalized = normalizeChallengeQualificationPolicy({
            type: 'daily_min_points',
            ruleVersion: 2,
            dailyMinPoints: 65,
            pointsScaleMax: 80
        }, 'master');

        expect(normalized).toMatchObject({
            type: 'daily_min_points',
            ruleVersion: 2,
            tier: 'master',
            dailyMinPoints: 65
        });
        expect(formatChallengeQualificationLabel(normalized)).toBe('하루 65P 이상이면 1일 인정');
    });

    it('preserves legacy all-category requirement for existing challenges without a stored policy', () => {
        const legacyPolicy = normalizeChallengeQualificationPolicy(null, 'master');
        expect(legacyPolicy.type).toBe('all_categories');
        expect(doesAwardedPointsMeetChallengeRule({
            dietPoints: 30,
            exercisePoints: 30,
            mindPoints: 0,
            diet: true,
            exercise: true,
            mind: false
        }, legacyPolicy)).toBe(false);
    });

    it('normalizes completed day counts from stored completedDates', () => {
        const normalized = normalizeChallengeCompletion({
            completedDays: 5,
            completedDates: ['2026-04-12', '2026-04-13', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16']
        });

        expect(normalized.completedDates).toEqual([
            '2026-04-12',
            '2026-04-13',
            '2026-04-14',
            '2026-04-15',
            '2026-04-16'
        ]);
        expect(getChallengeCompletedDays(normalized)).toBe(5);

        expect(getChallengeCompletedDays({
            completedDays: 5,
            completedDates: ['2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17']
        })).toBe(6);
    });

    it('treats endDate as the final countable day and the day after as past end', () => {
        expect(getChallengeTimelineState({ endDate: '2026-04-19' }, '2026-04-19')).toEqual({
            isFinalDay: true,
            isPastEnd: false
        });

        expect(getChallengeTimelineState({ endDate: '2026-04-19' }, '2026-04-20')).toEqual({
            isFinalDay: false,
            isPastEnd: true
        });
    });

    it('rebuilds expired weekly progress from authoritative daily logs before failure settlement', () => {
        const challenge = {
            challengeId: 'challenge-7d',
            tier: 'weekly',
            startDate: '2026-04-20',
            endDate: '2026-04-26',
            totalDays: 7,
            completedDays: 5,
            completedDates: ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24'],
            qualificationPolicy: getDefaultChallengeQualificationPolicy('weekly')
        };
        const dailyLogsByDate = Object.fromEntries(getChallengeDateRange(challenge).map((date) => [
            date,
            { awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 15 } }
        ]));

        const reconciled = reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, 'weekly');

        expect(reconciled.completedDates).toEqual([
            '2026-04-20',
            '2026-04-21',
            '2026-04-22',
            '2026-04-23',
            '2026-04-24',
            '2026-04-25',
            '2026-04-26'
        ]);
        expect(reconciled.completedDays).toBe(7);
        expect(getChallengeCompletedDays(reconciled) / reconciled.totalDays).toBe(1);
    });

    it('does not count records outside the challenge date range during reconciliation', () => {
        const challenge = {
            challengeId: 'challenge-7d',
            tier: 'weekly',
            startDate: '2026-04-20',
            endDate: '2026-04-26',
            totalDays: 7,
            completedDays: 0,
            completedDates: ['2026-04-19', '2026-04-20', '2026-04-27'],
            qualificationPolicy: getDefaultChallengeQualificationPolicy('weekly')
        };

        const reconciled = reconcileChallengeCompletionWithDailyLogs(challenge, {
            '2026-04-19': { awardedPoints: { dietPoints: 80 } },
            '2026-04-20': { awardedPoints: { dietPoints: 80 } },
            '2026-04-27': { awardedPoints: { dietPoints: 80 } }
        }, 'weekly');

        expect(reconciled.completedDates).toEqual(['2026-04-20']);
        expect(reconciled.completedDays).toBe(1);
    });

    it('projects active weekly progress from today daily log for asset display', () => {
        const challenge = {
            challengeId: 'challenge-7d',
            tier: 'weekly',
            startDate: '2026-04-27',
            endDate: '2026-05-03',
            totalDays: 7,
            completedDays: 0,
            completedDates: [],
            qualificationPolicy: getDefaultChallengeQualificationPolicy('weekly'),
            status: 'ongoing'
        };

        const result = reconcileActiveChallengesWithDailyLog({
            weekly: challenge
        }, '2026-04-27', {
            awardedPoints: { dietPoints: 30, exercisePoints: 30, mindPoints: 10 }
        });

        expect(result.changed).toBe(true);
        expect(result.activeChallenges.weekly.completedDates).toEqual(['2026-04-27']);
        expect(result.activeChallenges.weekly.completedDays).toBe(1);
    });
});
