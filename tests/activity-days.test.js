import { describe, expect, it } from 'vitest';
import {
    calculateActivityStreak,
    calculateWeeklyParticipation,
    countActiveDays,
} from '../js/activity-days.js';

const active = (date) => ({ date, awardedPoints: { dietPoints: 10 } });

describe('KST calendar activity days', () => {
    it('does not turn non-consecutive documents into a streak', () => {
        expect(calculateActivityStreak([
            active('2026-07-10'),
            active('2026-07-08'),
            active('2026-07-07'),
        ], '2026-07-10')).toBe(1);
    });

    it('keeps yesterday as the visible streak until today is recorded', () => {
        expect(calculateActivityStreak([
            active('2026-07-09'),
            active('2026-07-08'),
        ], '2026-07-10')).toBe(2);
    });

    it('deduplicates activity days and calculates weekly participation', () => {
        const logs = [active('2026-07-06'), active('2026-07-06'), active('2026-07-08')];
        expect(countActiveDays(logs)).toBe(2);
        expect(calculateWeeklyParticipation(logs, [
            '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09',
            '2026-07-10', '2026-07-11', '2026-07-12'
        ])).toEqual({ activeDays: 2, totalDays: 7, rate: 29 });
    });
});
