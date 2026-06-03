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
        expect(appSource).toContain("httpsCallable(functions, 'reviewHabitGroupCheckin')");
        expect(appSource).toContain("challengeInvites: 0");
        expect(appSource).toContain("showToast('친구 챌린지는 소모임으로 바뀌었어요.');");
        expect(appSource).toContain('return window.openHabitGroupDirectory();');
        expect(appSource).not.toContain('Promise.resolve(window.openChallengeInviteModal?.(challengeId))');
    });

    it('renders exercise-only group reward progress per card', () => {
        const appSource = readAppSource();
        const htmlSource = readRepoFile('index.html');

        expect(appSource).toContain('MAX_HABIT_GROUP_MEMBERSHIPS');
        expect(appSource).toContain('EXERCISE_GROUP_ENTRY_FEE_POINTS');
        expect(appSource).toContain('EXERCISE_GROUP_REWARD_POINTS');
        expect(appSource).toContain('formatHabitGroupJoinCta');
        expect(appSource).toContain('buildHabitGroupRecommendationSection');
        expect(appSource).toContain('toggleHabitGroupRecommendationsWhenFull');
        expect(appSource).toContain('getHabitGroupLeaderMemberships');
        expect(appSource).toContain('loadHabitGroupPendingReviewsForLeader');
        expect(appSource).toContain('buildHabitGroupLeaderReviewSection');
        expect(appSource).toContain('buildHabitGroupReviewMediaHtml');
        expect(appSource).toContain('collectHabitGroupReviewMedia');
        expect(appSource).toContain('hasHabitGroupPlayableVideoUrl');
        expect(appSource).toContain('hydrateHabitGroupReviewMediaFromDailyLogs');
        expect(appSource).toContain("getDoc(doc(db, 'daily_logs', docId))");
        expect(appSource).toContain("if (resolvedType === 'video' && !hasHabitGroupPlayableVideoUrl(original))");
        expect(appSource).toContain("if (previewUrl) addMedia('image', previewUrl, previewUrl);");
        expect(appSource).toContain('if (videoUrl) summary.videoUrl = videoUrl;');
        expect(appSource).toContain('if (imageThumbUrl) summary.imageThumbUrl = imageThumbUrl;');
        expect(appSource).toContain('window.openHabitGroupReviewImage');
        expect(appSource).toContain('window.handleHabitGroupReviewVideoKeydown');
        expect(appSource).toContain('playGalleryVideo(this)');
        expect(appSource).toContain('data-full-url');
        expect(appSource).toContain('window.reviewHabitGroupCheckin');
        expect(appSource).not.toContain('오늘 제출 · 확인 대기');
        expect(appSource).toContain('showUnavailableAction: canJoinMore');
        expect(appSource).toContain('최대 2모임');
        expect(appSource).not.toContain('2개 참여 중');
        expect(appSource).toContain('applyPointBalanceSnapshot(result.coins, user.uid)');
        expect(appSource).toContain('${progressSummary.submittedCount}/${EXERCISE_GROUP_REWARD_TARGET}일 완료 · 승인 ${progressSummary.approvedCount} · 확인 대기 ${progressSummary.pendingCount}');
        expect(appSource).toContain('entryFeeCharged');
        expect(appSource).not.toContain('탭 한 번으로 바로 참여');
        expect(appSource).not.toContain('기록을 남기면 제출돼요');
        expect(htmlSource).toContain('200P 예치 후 100일 완료하면 3,000P');
        expect(htmlSource).not.toContain("setHabitGroupDirectoryFilter('diet')");
        expect(htmlSource).not.toContain("setHabitGroupDirectoryFilter('mind')");
    });

    it('blocks new social challenge writes at rules and functions boundaries', () => {
        const rulesSource = readRepoFile('firestore.rules');
        const indexesSource = readRepoFile('firestore.indexes.json');
        const runtimeSource = readFunctionsSource();

        expect(rulesSource).toContain('match /habit_group_members/{memberId}');
        expect(rulesSource).toContain('match /habit_group_checkins/{checkinId}');
        expect(rulesSource).toContain('match /exercise_group_reward_progress/{progressId}');
        expect(rulesSource).toContain("request.resource.data.reviewStatus == 'pending'");
        expect(rulesSource).toContain('function isHabitGroupActiveMember(groupId)');
        expect(rulesSource).toContain('&& isHabitGroupActiveMember(request.resource.data.groupId)');
        expect(rulesSource).toContain('match /social_challenges/{challengeId}');
        expect(rulesSource).toContain('allow create: if false;');
        expect(indexesSource).toContain('"collectionGroup": "habit_group_checkins"');
        expect(indexesSource).toContain('"fieldPath": "reviewStatus"');
        expect(runtimeSource).toContain('const MAX_HABIT_GROUP_MEMBERSHIPS = 2;');
        expect(runtimeSource).toContain('const EXERCISE_GROUP_ENTRY_FEE_POINTS = 200;');
        expect(runtimeSource).toContain('const EXERCISE_GROUP_REWARD_POINTS = 3000;');
        expect(runtimeSource).toContain('exports.joinHabitGroup');
        expect(runtimeSource).toContain('coins: FieldValue.increment(-EXERCISE_GROUP_ENTRY_FEE_POINTS)');
        expect(runtimeSource).toContain('blockchain_transactions/exercise_group_entry_${group.id}_${uid}');
        expect(runtimeSource).toContain('exports.reviewHabitGroupCheckin');
        expect(runtimeSource).toContain('exports.transferHabitGroupLeader');
        expect(runtimeSource).toContain('exports.onHabitGroupCheckinWritten');
        expect(runtimeSource).toContain('blockchain_transactions/exercise_group_reward_${target.groupId}_${target.uid}');
        expect(runtimeSource).toContain('친구 챌린지 신규 생성은 소모임 시스템으로 전환되어 종료되었습니다.');
    });
});
