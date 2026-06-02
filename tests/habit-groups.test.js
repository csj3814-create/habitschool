import { describe, expect, it } from 'vitest';
import {
    DEFAULT_HABIT_GROUPS,
    EXERCISE_GROUP_REWARD_POINTS,
    EXERCISE_GROUP_REWARD_TARGET,
    MAX_HABIT_GROUP_MEMBERSHIPS,
    applyHabitGroupProgressChange,
    getHabitGroupById,
    getHabitGroupCheckinDocId,
    getHabitGroupMemberDocId,
    getHabitGroupRecordStatus,
    getHabitGroupRewardProgressDocId,
    getRecommendedHabitGroups,
    summarizeHabitGroupProgress,
    summarizeHabitGroups
} from '../js/habit-groups.js';

describe('exercise habit groups', () => {
    it('defines the four exercise-only pilot groups', () => {
        expect(DEFAULT_HABIT_GROUPS).toHaveLength(4);
        expect(new Set(DEFAULT_HABIT_GROUPS.map(group => group.type))).toEqual(new Set(['exercise']));
        expect(DEFAULT_HABIT_GROUPS.map(group => group.id)).toEqual([
            'exercise-walking-10000',
            'exercise-home-training',
            'exercise-gym-checkin',
            'exercise-running-club'
        ]);
        expect(MAX_HABIT_GROUP_MEMBERSHIPS).toBe(2);
    });

    it('requires ten thousand steps for the walking group', () => {
        const group = getHabitGroupById('exercise-walking-10000');

        expect(getHabitGroupRecordStatus(group, { steps: { count: 9999 } }).complete).toBe(false);
        expect(getHabitGroupRecordStatus(group, { steps: { count: 10000 } })).toMatchObject({
            complete: true,
            source: 'steps',
            stepCount: 10000,
            minSteps: 10000
        });
    });

    it('detects exercise records for non-step exercise groups', () => {
        const group = getHabitGroupById('exercise-home-training');
        const dailyLog = {
            exercise: {
                strengthList: [{ name: '스쿼트', videoThumbUrl: 'https://firebasestorage.googleapis.com/v0/b/demo/o/thumb.jpg' }]
            }
        };

        expect(getHabitGroupRecordStatus(group, dailyLog)).toMatchObject({
            complete: true,
            source: 'exercise'
        });
        expect(getHabitGroupRecordStatus(group, { exercise: {}, steps: { count: 12000 } }).complete).toBe(false);
    });

    it('recommends unjoined groups that match today completed exercise first', () => {
        const recommended = getRecommendedHabitGroups({
            steps: { count: 12000 },
            exercise: { cardioList: [{ name: '러닝' }] }
        }, ['exercise-home-training']);

        expect(recommended[0].id).toBe('exercise-walking-10000');
        expect(recommended.some(group => group.id === 'exercise-home-training')).toBe(false);
    });

    it('summarizes joined and non-rejected checkin counts', () => {
        const summary = summarizeHabitGroups({
            memberships: [
                { groupId: 'exercise-walking-10000', active: true },
                { groupId: 'exercise-home-training', active: true },
                { groupId: 'exercise-running-club', active: false }
            ],
            checkins: [
                { groupId: 'exercise-walking-10000', reviewStatus: 'pending' },
                { groupId: 'exercise-home-training', reviewStatus: 'rejected' }
            ]
        });

        expect(summary.joinedCount).toBe(2);
        expect(summary.checkedInCount).toBe(1);
        expect(summary.joinedGroupIds.has('exercise-home-training')).toBe(true);
    });

    it('builds stable member, checkin, and reward progress document ids', () => {
        expect(getHabitGroupMemberDocId('exercise-walking-10000', 'uid123')).toBe('exercise-walking-10000_uid123');
        expect(getHabitGroupCheckinDocId('exercise-walking-10000', '2026-06-01', 'uid123')).toBe('exercise-walking-10000_2026-06-01_uid123');
        expect(getHabitGroupRewardProgressDocId('exercise-walking-10000', 'uid123')).toBe('exercise-walking-10000_uid123');
    });

    it('counts the same date separately for two joined groups', () => {
        const walking = applyHabitGroupProgressChange(
            { groupId: 'exercise-walking-10000', uid: 'uid123' },
            null,
            { groupId: 'exercise-walking-10000', uid: 'uid123', date: '2026-06-01', reviewStatus: 'pending' }
        );
        const homeTraining = applyHabitGroupProgressChange(
            { groupId: 'exercise-home-training', uid: 'uid123' },
            null,
            { groupId: 'exercise-home-training', uid: 'uid123', date: '2026-06-01', reviewStatus: 'pending' }
        );

        expect(getHabitGroupRewardProgressDocId(walking.groupId, walking.uid)).not.toBe(
            getHabitGroupRewardProgressDocId(homeTraining.groupId, homeTraining.uid)
        );
        expect(walking.submittedCount).toBe(1);
        expect(homeTraining.submittedCount).toBe(1);
    });

    it('does not double-count duplicate saves for the same group and date', () => {
        let progress = applyHabitGroupProgressChange(
            { groupId: 'exercise-walking-10000', uid: 'uid123' },
            null,
            { date: '2026-06-01', reviewStatus: 'pending' }
        );
        progress = applyHabitGroupProgressChange(
            progress,
            { date: '2026-06-01', reviewStatus: 'pending' },
            { date: '2026-06-01', reviewStatus: 'pending' }
        );

        expect(progress.submittedDates).toEqual(['2026-06-01']);
        expect(progress.submittedCount).toBe(1);
        expect(progress.pendingCount).toBe(1);
    });

    it('moves approved and rejected dates into separate counters', () => {
        let progress = applyHabitGroupProgressChange(
            { groupId: 'exercise-running-club', uid: 'uid123' },
            null,
            { date: '2026-06-01', reviewStatus: 'pending' }
        );
        progress = applyHabitGroupProgressChange(
            progress,
            { date: '2026-06-01', reviewStatus: 'pending' },
            { date: '2026-06-01', reviewStatus: 'approved' }
        );
        progress = applyHabitGroupProgressChange(
            progress,
            null,
            { date: '2026-06-02', reviewStatus: 'rejected' }
        );

        expect(progress.submittedCount).toBe(1);
        expect(progress.approvedCount).toBe(1);
        expect(progress.pendingCount).toBe(0);
        expect(progress.rejectedCount).toBe(1);
    });

    it('marks one hundred submissions as pending review with a 2,000P group reward', () => {
        const dates = Array.from({ length: EXERCISE_GROUP_REWARD_TARGET }, (_, index) => {
            const date = new Date('2026-06-01T00:00:00Z');
            date.setUTCDate(date.getUTCDate() + index);
            return date.toISOString().slice(0, 10);
        });
        const progress = dates.reduce((current, date) => (
            applyHabitGroupProgressChange(current, null, { date, reviewStatus: 'pending' })
        ), { groupId: 'exercise-gym-checkin', uid: 'uid123' });
        const summary = summarizeHabitGroupProgress(progress);

        expect(summary.submittedCount).toBe(EXERCISE_GROUP_REWARD_TARGET);
        expect(progress.rewardStatus).toBe('pending_review');
        expect(summary.rewardPoints).toBe(EXERCISE_GROUP_REWARD_POINTS);
        expect(EXERCISE_GROUP_REWARD_POINTS).toBe(2000);
    });
});
