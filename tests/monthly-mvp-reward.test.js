import { describe, expect, it } from 'vitest';
import {
    getPreviousMonthIdFromKstDateString,
    shouldAttemptMonthlyMvpRewardFromKstDateString
} from '../js/monthly-mvp-reward.js';
import { readRepoFile } from './source-helpers.js';

describe('monthly MVP reward helper', () => {
    it('targets the previous month from a KST date string', () => {
        expect(getPreviousMonthIdFromKstDateString('2026-05-01')).toBe('2026-04');
        expect(getPreviousMonthIdFromKstDateString('2026-01-02')).toBe('2025-12');
    });

    it('only attempts the app-side reward fallback during the first three KST days', () => {
        expect(shouldAttemptMonthlyMvpRewardFromKstDateString('2026-05-01')).toBe(true);
        expect(shouldAttemptMonthlyMvpRewardFromKstDateString('2026-05-03')).toBe(true);
        expect(shouldAttemptMonthlyMvpRewardFromKstDateString('2026-05-04')).toBe(false);
    });

    it('does not rely on an undefined Date object in the app-side fallback', () => {
        const source = readRepoFile('js/app-core.js');
        expect(source).toContain('shouldAttemptMonthlyMvpRewardFromKstDateString(todayStr)');
        expect(source).toContain('getPreviousMonthIdFromKstDateString(todayStr)');
        expect(source).not.toContain('today.getUTCDate()');
    });
});
