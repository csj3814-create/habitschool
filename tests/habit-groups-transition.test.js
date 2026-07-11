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
        expect(appSource).toContain('const HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT = 4;');
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
        expect(appSource).not.toContain('hydrateHabitGroupReviewMediaFromDailyLogs');
        expect(appSource).not.toContain("getDoc(doc(db, 'daily_logs', docId))");
        expect(appSource).toContain('개인 원문인 daily_logs를 다른 사용자 세션에서 다시 읽지 않는다.');
        expect(appSource).toContain("if (resolvedType === 'video' && !hasHabitGroupPlayableVideoUrl(original))");
        expect(appSource).toContain("if (previewUrl) addMedia('image', previewUrl, previewUrl);");
        expect(appSource).toContain('if (videoUrl) summary.videoUrl = videoUrl;');
        expect(appSource).toContain('if (imageThumbUrl) summary.imageThumbUrl = imageThumbUrl;');
        expect(appSource).toContain('const existingCheckinSnap = await withAsyncTimeout(');
        expect(appSource).toContain("'habit_group_existing_checkin_timeout'");
        expect(appSource).toContain("const preserveApprovedReview = String(existingCheckin?.reviewStatus || '').trim() === 'approved';");
        expect(appSource).toContain("reviewStatus: preserveApprovedReview ? 'approved' : 'pending'");
        expect(appSource).toContain('if (!preserveApprovedReview) {');
        expect(appSource).toContain('window.openHabitGroupReviewImage');
        expect(appSource).toContain('window.handleHabitGroupReviewVideoKeydown');
        expect(appSource).toContain('playGalleryVideo(this)');
        expect(appSource).toContain('data-full-url');
        expect(appSource).toContain('window.reviewHabitGroupCheckin');
        expect(appSource).not.toContain('오늘 제출 · 확인 대기');
        expect(appSource).toContain('showUnavailableAction: canJoinMore');
        expect(appSource).toContain(".slice(0, HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT)");
        expect(appSource).toContain("buildCommunityExpandableRows('habit-groups-recommended', rows, HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT)");
        expect(appSource).toContain("buildCommunityExpandableRows('habit-groups-recommended-full', rows, HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT)");
        expect(appSource).toContain("buildCommunityExpandableRows('habit-group-recommendations', recommendedRows, HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT)");
        expect(appSource).toContain("buildCommunityExpandableRows('habit-groups-joined', joinedRows, HABIT_GROUP_DASHBOARD_VISIBLE_LIMIT)");
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

    it('keeps habit group review media wrapped inside moderation cards', () => {
        const styleSource = readRepoFile('styles-features.css');

        expect(styleSource).toContain('.habit-group-review-row .social-challenge-main');
        expect(styleSource).toContain('flex: 1 1 180px;');
        expect(styleSource).toContain('.habit-group-review-media-strip');
        expect(styleSource).toContain('max-width: 100%;');
        expect(styleSource).toContain('flex-wrap: wrap;');
        expect(styleSource).toContain('.habit-group-review-media-item.video-thumb-wrapper.playing');
        expect(styleSource).toContain('flex: 1 0 100%;');
    });

    it('blocks new social challenge writes at rules and functions boundaries', () => {
        const rulesSource = readRepoFile('firestore.rules');
        const indexesSource = readRepoFile('firestore.indexes.json');
        const runtimeSource = readFunctionsSource();

        expect(rulesSource).toContain('match /habit_group_members/{memberId}');
        expect(rulesSource).toContain('match /habit_group_checkins/{checkinId}');
        expect(rulesSource).toContain('match /exercise_group_reward_progress/{progressId}');
        expect(rulesSource).toContain("request.resource.data.reviewStatus == 'pending'");
        expect(rulesSource).toContain("!request.resource.data.keys().hasAny(['reviewedBy', 'reviewedAt', 'reviewNote', 'approvedAt', 'rejectedAt'])");
        expect(rulesSource).toContain('function isApprovedHabitGroupCheckinUpdate(checkinId)');
        expect(rulesSource).toContain("resource.data.reviewStatus == 'approved'");
        expect(rulesSource).toContain("request.resource.data.reviewStatus == 'approved'");
        expect(rulesSource).toContain("resource.data.reviewStatus != 'approved'");
        expect(rulesSource).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly([");
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
