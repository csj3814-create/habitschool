import { describe, it, expect } from 'vitest';
import { reconcileMilestoneState } from '../js/milestone-helpers.js';

const TEST_MILESTONES = {
    streak: {
        levels: [
            { id: 'streak1', target: 1, reward: 5 },
            { id: 'streak3', target: 3, reward: 10 },
            { id: 'streak7', target: 7, reward: 20 }
        ]
    },
    diet: {
        levels: [
            { id: 'diet1', target: 1, reward: 5 },
            { id: 'diet3', target: 3, reward: 10 },
            { id: 'diet7', target: 7, reward: 15 }
        ]
    }
};

describe('reconcileMilestoneState', () => {
    it('marks lower levels as claimed when a higher level in the same category was already claimed', () => {
        const result = reconcileMilestoneState({
            diet7: { achieved: true, bonusClaimed: true, bonusAmount: 15 }
        }, TEST_MILESTONES, { today: '2026-04-09' });

        expect(result.milestones.diet1).toMatchObject({
            achieved: true,
            bonusClaimed: true,
            bonusAmount: 0,
            normalizedFromHigherClaim: true
        });
        expect(result.milestones.diet3).toMatchObject({
            achieved: true,
            bonusClaimed: true,
            bonusAmount: 0,
            normalizedFromHigherClaim: true
        });
        expect(result.milestones.diet7).toMatchObject({
            achieved: true,
            bonusClaimed: true,
            bonusAmount: 15
        });
        expect(result.changed).toBe(true);
    });

    it('only reports a fresh milestone when the current total lands exactly on the new target', () => {
        const result = reconcileMilestoneState({}, TEST_MILESTONES, {
            today: '2026-04-09',
            statMap: { diet: 1 }
        });

        expect(result.freshMilestones.map((level) => level.id)).toEqual(['diet1']);
        expect(result.milestones.diet1).toMatchObject({
            achieved: true,
            bonusClaimed: false
        });
    });

    it('does not treat lower inferred levels as fresh when they were only backfilled from a later exact target', () => {
        const result = reconcileMilestoneState({}, TEST_MILESTONES, {
            today: '2026-04-09',
            statMap: { diet: 7 }
        });

        expect(result.freshMilestones.map((level) => level.id)).toEqual(['diet7']);
        expect(result.milestones.diet1).toMatchObject({ achieved: true, bonusClaimed: false });
        expect(result.milestones.diet3).toMatchObject({ achieved: true, bonusClaimed: false });
        expect(result.milestones.diet7).toMatchObject({ achieved: true, bonusClaimed: false });
    });
});
