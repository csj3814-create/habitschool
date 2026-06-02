import { describe, expect, it } from 'vitest';
import { readAppSource, readFunctionsSource, readRepoFile } from './source-helpers.js';

describe('habit group transition', () => {
    it('routes legacy friend challenge entrypoints to habit groups', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("collection(db, 'habit_group_members')");
        expect(appSource).toContain("'habit_group_checkins'");
        expect(appSource).toContain("'exercise_group_reward_progress'");
        expect(appSource).toContain("httpsCallable(functions, 'joinHabitGroup')");
        expect(appSource).toContain("httpsCallable(functions, 'leaveHabitGroup')");
        expect(appSource).toContain("challengeInvites: 0");
        expect(appSource).toContain("showToast('친구 챌린지는 소모임으로 바뀌었어요.');");
        expect(appSource).toContain('return window.openHabitGroupDirectory();');
        expect(appSource).not.toContain('Promise.resolve(window.openChallengeInviteModal?.(challengeId))');
    });

    it('renders exercise-only group reward progress per card', () => {
        const appSource = readAppSource();
        const htmlSource = readRepoFile('index.html');

        expect(appSource).toContain('MAX_HABIT_GROUP_MEMBERSHIPS');
        expect(appSource).toContain('이 소모임 ${progressSummary.submittedCount}/${EXERCISE_GROUP_REWARD_TARGET} 제출');
        expect(appSource).toContain('승인 ${progressSummary.approvedCount} · 확인 대기 ${progressSummary.pendingCount}');
        expect(htmlSource).toContain('운동 소모임은 최대 2개까지 참여할 수 있고');
        expect(htmlSource).not.toContain("setHabitGroupDirectoryFilter('diet')");
        expect(htmlSource).not.toContain("setHabitGroupDirectoryFilter('mind')");
    });

    it('blocks new social challenge writes at rules and functions boundaries', () => {
        const rulesSource = readRepoFile('firestore.rules');
        const runtimeSource = readFunctionsSource();

        expect(rulesSource).toContain('match /habit_group_members/{memberId}');
        expect(rulesSource).toContain('match /habit_group_checkins/{checkinId}');
        expect(rulesSource).toContain('match /exercise_group_reward_progress/{progressId}');
        expect(rulesSource).toContain("request.resource.data.reviewStatus == 'pending'");
        expect(rulesSource).toContain('match /social_challenges/{challengeId}');
        expect(rulesSource).toContain('allow create: if false;');
        expect(runtimeSource).toContain('const MAX_HABIT_GROUP_MEMBERSHIPS = 2;');
        expect(runtimeSource).toContain('exports.joinHabitGroup');
        expect(runtimeSource).toContain('exports.reviewHabitGroupCheckin');
        expect(runtimeSource).toContain('exports.transferHabitGroupLeader');
        expect(runtimeSource).toContain('exports.onHabitGroupCheckinWritten');
        expect(runtimeSource).toContain('blockchain_transactions/exercise_group_reward_${target.groupId}_${target.uid}');
        expect(runtimeSource).toContain('친구 챌린지 신규 생성은 소모임 시스템으로 전환되어 종료되었습니다.');
    });
});
