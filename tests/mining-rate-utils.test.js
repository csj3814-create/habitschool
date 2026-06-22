import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    getKstIsoWeekId,
    isCompletedRateDecision,
} = require('../functions/mining-rate-utils.js');

describe('mining rate schedule helpers', () => {
    it('assigns the Sunday UTC schedule run to the new Monday KST ISO week', () => {
        expect(getKstIsoWeekId(new Date('2026-04-05T15:00:00Z'))).toBe('2026-W15');
        expect(getKstIsoWeekId(new Date('2026-06-21T15:00:00Z'))).toBe('2026-W26');
    });

    it('handles the ISO week-year boundary in KST', () => {
        expect(getKstIsoWeekId(new Date('2025-12-31T15:00:00Z'))).toBe('2026-W01');
    });

    it('only treats completed decisions as idempotent', () => {
        expect(isCompletedRateDecision('success')).toBe(true);
        expect(isCompletedRateDecision('no_change')).toBe(true);
        expect(isCompletedRateDecision('manual')).toBe(true);
        expect(isCompletedRateDecision('error')).toBe(false);
        expect(isCompletedRateDecision('evaluating')).toBe(false);
    });
});
