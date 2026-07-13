import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
    DAILY_POINT_CAPS,
    ALLOWED_MEDIA_FOLDERS,
    parseFirebaseStorageDownloadUrl,
    parseFirebaseStorageObjectPath,
    isAllowedUserMediaPath,
    isAllowedUserMediaUrl,
    getKstDateStringFromTimestamp,
    isEvidenceCreatedForLogDate,
    isEvidenceCreatedWithinRewardWindow,
    getRewardEvidenceClaimId,
    calculateServerAwardedPoints,
    clampDailyAwardTotal,
    computeReactionToggle,
} = require('../functions/points-utils.js');

const TEST_UID = 'user-A_123';
const storageUrl = (folder, file, uid = TEST_UID, token = 'token-1') =>
    `https://firebasestorage.googleapis.com/v0/b/habitschool-test.appspot.com/o/${encodeURIComponent(`${folder}/${uid}/${file}`)}?alt=media&token=${token}`;

describe('Firebase Storage evidence path validation', () => {
    it('parses canonical download URLs and validates the owner folder', () => {
        const url = storageUrl('diet_images', '2026-07-10/breakfast.webp');
        const path = 'diet_images/user-A_123/2026-07-10/breakfast.webp';

        expect(parseFirebaseStorageObjectPath(url)).toBe(path);
        expect(parseFirebaseStorageDownloadUrl(url)).toEqual({
            bucket: 'habitschool-test.appspot.com',
            objectPath: path,
        });
        expect(isAllowedUserMediaPath(path, TEST_UID, 'diet_images')).toBe(true);
        expect(isAllowedUserMediaUrl(url, TEST_UID, 'diet_images')).toBe(true);
        expect(isAllowedUserMediaUrl(url, TEST_UID, 'diet_images', ['habitschool-test.appspot.com'])).toBe(true);
        expect(isAllowedUserMediaUrl(url, TEST_UID, 'diet_images', ['attacker.appspot.com'])).toBe(false);
        expect(ALLOWED_MEDIA_FOLDERS).toEqual([
            'diet_images',
            'diet_images_thumbnails',
            'exercise_images',
            'exercise_images_thumbnails',
            'exercise_videos',
            'exercise_videos_thumbnails',
            'sleep_images',
            'sleep_images_thumbnails',
            'step_screenshots',
        ]);
    });

    it('rejects deceptive hosts, credentials, traversal, malformed encoding, and non-download URLs', () => {
        const encodedPath = encodeURIComponent(`diet_images/${TEST_UID}/photo.webp`);
        const basePath = `/v0/b/habitschool-test.appspot.com/o/${encodedPath}?alt=media`;

        expect(parseFirebaseStorageObjectPath(`https://firebasestorage.googleapis.com.evil.test${basePath}`)).toBeNull();
        expect(parseFirebaseStorageObjectPath(`https://attacker@firebasestorage.googleapis.com${basePath}`)).toBeNull();
        expect(parseFirebaseStorageObjectPath('http://firebasestorage.googleapis.com' + basePath)).toBeNull();
        expect(parseFirebaseStorageObjectPath(storageUrl('diet_images', '../secret.webp'))).toBeNull();
        expect(parseFirebaseStorageObjectPath('https://firebasestorage.googleapis.com/v0/b/test/o/%E0%A4%A?alt=media')).toBeNull();
        expect(parseFirebaseStorageObjectPath(`https://firebasestorage.googleapis.com/v0/b/test/o/${encodedPath}`)).toBeNull();
    });

    it('rejects another user and a category folder mismatch', () => {
        const otherUserUrl = storageUrl('diet_images', 'photo.webp', 'other-user');
        const wrongFolderUrl = storageUrl('sleep_images', 'photo.webp');

        expect(isAllowedUserMediaUrl(otherUserUrl, TEST_UID, 'diet_images')).toBe(false);
        expect(isAllowedUserMediaUrl(wrongFolderUrl, TEST_UID, 'diet_images')).toBe(false);
        expect(isAllowedUserMediaPath('unknown/user-A_123/photo.webp', TEST_UID)).toBe(false);
    });

    it('binds reward evidence to the KST date while allowing one-day offline replay', () => {
        expect(getKstDateStringFromTimestamp('2026-07-10T14:59:59.000Z')).toBe('2026-07-10');
        expect(getKstDateStringFromTimestamp('2026-07-10T15:00:00.000Z')).toBe('2026-07-11');
        expect(isEvidenceCreatedForLogDate('2026-07-10T15:00:00.000Z', '2026-07-11')).toBe(true);
        expect(isEvidenceCreatedForLogDate('2026-07-10T15:00:00.000Z', '2026-07-10')).toBe(false);
        expect(isEvidenceCreatedForLogDate('invalid', '2026-07-11')).toBe(false);
        expect(isEvidenceCreatedWithinRewardWindow('2026-07-10T14:00:00.000Z', '2026-07-10')).toBe(true);
        expect(isEvidenceCreatedWithinRewardWindow('2026-07-10T15:00:00.000Z', '2026-07-10')).toBe(true);
        expect(isEvidenceCreatedWithinRewardWindow('2026-07-11T15:00:00.000Z', '2026-07-10')).toBe(false);
        expect(isEvidenceCreatedWithinRewardWindow('2026-07-08T15:00:00.000Z', '2026-07-10')).toBe(false);
    });

    it('builds one immutable claim for the same verified evidence across paths and days', () => {
        const verifiedHash = 'f'.repeat(64);
        const first = getRewardEvidenceClaimId(TEST_UID, {
            objectPath: `step_screenshots/${TEST_UID}/day-1.webp`,
            objectGeneration: '101',
            verifiedImageHash: verifiedHash,
        });
        const reupload = getRewardEvidenceClaimId(TEST_UID, {
            objectPath: `step_screenshots/${TEST_UID}/day-2.webp`,
            objectGeneration: '202',
            verifiedImageHash: verifiedHash,
        });

        expect(first).toMatch(/^[a-f0-9]{64}$/);
        expect(reupload).toBe(first);
        expect(getRewardEvidenceClaimId('other-user', {
            objectPath: 'step_screenshots/other-user/day-2.webp',
            objectGeneration: '202',
            verifiedImageHash: verifiedHash,
        })).not.toBe(first);
        expect(getRewardEvidenceClaimId(TEST_UID, {
            objectPath: `step_screenshots/${TEST_UID}/missing-generation.webp`,
        })).toBeNull();
    });
});

describe('calculateServerAwardedPoints', () => {
    const acceptMedia = async () => true;

    it('calculates the full 30 + 30 + 20 award and immutable stable ledger units', async () => {
        const verifiedContexts = [];
        const result = await calculateServerAwardedPoints({
            userId: TEST_UID,
            date: '2026-07-11',
            diet: {
                breakfastUrl: storageUrl('diet_images', 'breakfast.webp'),
                lunchUrl: storageUrl('diet_images', 'lunch.webp'),
                dinnerUrl: storageUrl('diet_images', 'dinner.webp'),
                snackUrl: storageUrl('diet_images', 'snack.webp'),
            },
            exercise: {
                cardioList: [{ imageUrl: storageUrl('exercise_images', 'run.webp') }],
                strengthList: [
                    { videoUrl: storageUrl('exercise_videos', 'squat.webm') },
                    { videoUrl: storageUrl('exercise_videos', 'pushup.webm') },
                ],
            },
            steps: {
                count: 8400,
                screenshotUrl: storageUrl('step_screenshots', 'steps.webp'),
                imageHash: 'a'.repeat(64),
                source: 'manual',
            },
            sleepAndMind: {
                sleepImageUrl: storageUrl('sleep_images', 'sleep.webp'),
                gratitude: '오늘 걸을 수 있어 감사합니다.',
            },
        }, {
            isValidMedia: async (_url, context) => {
                verifiedContexts.push(context);
                return {
                    valid: true,
                    objectGeneration: '12345',
                    contentHash: `md5:${context.objectPath}`,
                    verifiedImageHash: context.evidenceType === 'step_screenshot'
                        ? context.imageHash
                        : null,
                };
            },
        });

        expect(result.awardedPoints).toEqual({
            dietPoints: 30,
            exercisePoints: 30,
            mindPoints: 20,
            diet: true,
            exercise: true,
            mind: true,
        });
        expect(result.ledgerUnits.map((unit) => unit.key)).toEqual([
            'diet_1',
            'diet_2',
            'diet_3',
            'exercise_cardio_1',
            'exercise_cardio_2',
            'strength_1',
            'strength_2',
            'mind_sleep',
            'mind_reflection',
        ]);
        expect(result.ledgerUnits.reduce((sum, unit) => sum + unit.points, 0)).toBe(80);
        expect(result.ledgerUnits.find((unit) => unit.key === 'exercise_cardio_2')?.evidenceType).toBe('step_count');
        expect(verifiedContexts.every((context) => context.objectPath.startsWith(`${context.folder}/${TEST_UID}/`))).toBe(true);
        expect(verifiedContexts.every((context) => context.logDate === '2026-07-11')).toBe(true);
        expect(result.ledgerUnits.filter((unit) => unit.objectPath)
            .every((unit) => unit.objectGeneration === '12345')).toBe(true);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.awardedPoints)).toBe(true);
        expect(Object.isFrozen(result.ledgerUnits)).toBe(true);
        expect(result.ledgerUnits.every(Object.isFrozen)).toBe(true);
    });

    it('awards 8000+ entered steps without requiring a screenshot or media verifier', async () => {
        for (const steps of [
            { count: 8000, source: 'manual' },
            { count: 12000, source: 'health_connect' },
            { count: 12000, source: 'manual', screenshotUrl: storageUrl('step_screenshots', 'no-hash.webp') },
        ]) {
            const result = await calculateServerAwardedPoints({ userId: TEST_UID, steps });
            expect(result.awardedPoints.exercisePoints).toBe(10);
            expect(result.ledgerUnits[0].evidenceType).toBe('step_count');
        }

        const belowThreshold = await calculateServerAwardedPoints({
            userId: TEST_UID,
            steps: { count: 7999, source: 'manual' },
        });
        expect(belowThreshold.awardedPoints.exercisePoints).toBe(0);
    });

    it('awards 15 exercise points for one cardio photo plus 8000+ entered steps', async () => {
        const result = await calculateServerAwardedPoints({
            userId: TEST_UID,
            exercise: {
                cardioList: [{ imageUrl: storageUrl('exercise_images', 'walk.webp') }],
            },
            steps: { count: 8023, source: 'manual' },
        }, { isValidMedia: acceptMedia });

        expect(result.awardedPoints.exercisePoints).toBe(15);
        expect(result.ledgerUnits.map((unit) => unit.evidenceType)).toEqual([
            'exercise_cardio_image',
            'step_count',
        ]);
    });

    it('rejects malicious, other-user, wrong-folder, and verifier-rejected media', async () => {
        const result = await calculateServerAwardedPoints({
            userId: TEST_UID,
            diet: {
                breakfastUrl: 'https://firebasestorage.googleapis.com.evil.test/v0/b/test/o/photo?alt=media',
                lunchUrl: storageUrl('diet_images', 'other.webp', 'other-user'),
                dinnerUrl: storageUrl('sleep_images', 'wrong-folder.webp'),
                snackUrl: storageUrl('diet_images', 'rejected.webp'),
            },
        }, {
            isValidMedia: async (url) => !url.includes('rejected'),
        });

        expect(result.awardedPoints.dietPoints).toBe(0);
        expect(result.ledgerUnits).toEqual([]);
    });

    it('does not award the same object or the same media hash twice', async () => {
        const sameDietUrl = storageUrl('diet_images', 'same.webp', TEST_UID, 'token-a');
        const sameDietUrlWithAnotherToken = storageUrl('diet_images', 'same.webp', TEST_UID, 'token-b');
        const duplicateHash = 'd'.repeat(64);
        const result = await calculateServerAwardedPoints({
            userId: TEST_UID,
            diet: {
                breakfastUrl: sameDietUrl,
                lunchUrl: sameDietUrlWithAnotherToken,
                dinnerUrl: sameDietUrl,
            },
            exercise: {
                cardioList: [
                    { imageUrl: storageUrl('exercise_images', 'cardio-a.webp'), imageHash: duplicateHash },
                    { imageUrl: storageUrl('exercise_images', 'cardio-b.webp'), imageHash: duplicateHash },
                ],
            },
        }, { isValidMedia: acceptMedia });

        expect(result.awardedPoints.dietPoints).toBe(10);
        expect(result.awardedPoints.exercisePoints).toBe(10);
        expect(result.ledgerUnits.map((unit) => unit.key)).toEqual(['diet_1', 'exercise_cardio_1']);
    });

    it('fails closed for media when no verifier is provided but keeps non-media reflection credit', async () => {
        const result = await calculateServerAwardedPoints({
            userId: TEST_UID,
            diet: { breakfastUrl: storageUrl('diet_images', 'breakfast.webp') },
            sleepAndMind: { meditationDone: true },
        });

        expect(result.awardedPoints).toMatchObject({ dietPoints: 0, exercisePoints: 0, mindPoints: 10 });
        expect(result.ledgerUnits.map((unit) => unit.key)).toEqual(['mind_reflection']);
    });
});

// C1 회귀 방지: awardPoints 트리거가 클라이언트의 awardedPoints를 그대로 신뢰하면
// 조작된 값(예: dietPoints=999999)만큼 coins가 무한 발행된다. 클램프가 이를 막아야 한다.
describe('clampDailyAwardTotal (C1 coin-mint exploit guard)', () => {
    it('sums legitimate points normally within caps', () => {
        expect(clampDailyAwardTotal({ dietPoints: 30, exercisePoints: 30, mindPoints: 20 })).toBe(80);
        expect(clampDailyAwardTotal({ dietPoints: 10, exercisePoints: 15, mindPoints: 5 })).toBe(30);
    });

    it('caps each category so an inflated field cannot mint coins', () => {
        expect(clampDailyAwardTotal({ dietPoints: 999999 })).toBe(DAILY_POINT_CAPS.dietPoints);
        expect(clampDailyAwardTotal({
            dietPoints: 1e9,
            exercisePoints: 1e9,
            mindPoints: 1e9,
        })).toBe(80); // 30 + 30 + 20, not billions
    });

    it('never contributes negative or non-numeric values', () => {
        expect(clampDailyAwardTotal({ dietPoints: -50, exercisePoints: 'abc', mindPoints: null })).toBe(0);
        expect(clampDailyAwardTotal({ dietPoints: NaN, exercisePoints: Infinity })).toBe(0); // 비유한값은 0으로 거부
        expect(clampDailyAwardTotal({})).toBe(0);
        expect(clampDailyAwardTotal(undefined)).toBe(0);
    });

    it('makes the credited diff safe even against a tampered write', () => {
        // 트리거의 diff = clamp(new) - clamp(old)
        const tamperedNew = clampDailyAwardTotal({ dietPoints: 999999, exercisePoints: 999999, mindPoints: 999999 });
        const legitOld = clampDailyAwardTotal({ dietPoints: 10 });
        expect(tamperedNew - legitOld).toBe(70); // 80 - 10, 최대 하루치 범위 내
    });
});

// 리액션 코인 발행 취약점(#1) 회귀 방지: 서버가 request.auth.uid로만 토글하고,
// (post, reactor)당 최초 1회만, 본인 게시물 제외로 지급해야 한다. uid는 서버 검증값이므로
// 위조 삽입(타인 UID로 코인 발행)이 원천 불가하다.
describe('computeReactionToggle (reaction coin-mint exploit guard)', () => {
    it('adds reactor and awards once for a first-time reaction on someone else post', () => {
        const r = computeReactionToggle({ userId: 'owner', reactions: {} }, 'reactorA', 'heart');
        expect(r.active).toBe(true);
        expect(r.award).toBe(true);
        expect(r.postOwnerId).toBe('owner');
        expect(r.reactions.heart).toEqual(['reactorA']);
        expect(r.count).toBe(1);
    });

    it('never awards for reacting to your own post (self-mint blocked)', () => {
        const r = computeReactionToggle({ userId: 'owner', reactions: {} }, 'owner', 'fire');
        expect(r.active).toBe(true);
        expect(r.award).toBe(false);
    });

    it('does not double-award the same reactor on the same post', () => {
        const log = { userId: 'owner', reactions: {}, reactionPointAwardedUserIds: ['reactorA'] };
        const r = computeReactionToggle(log, 'reactorA', 'clap');
        expect(r.active).toBe(true);
        expect(r.award).toBe(false); // 이미 지급 원장에 있음
    });

    it('un-reacts without clawback and without award', () => {
        const log = { userId: 'owner', reactions: { heart: ['reactorA'] }, reactionPointAwardedUserIds: ['reactorA'] };
        const r = computeReactionToggle(log, 'reactorA', 'heart');
        expect(r.active).toBe(false);
        expect(r.award).toBe(false);
        expect(r.reactions.heart).toEqual([]);
    });
});
