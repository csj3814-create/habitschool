import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildGalleryPostFromDailyLog,
    getGalleryProjectionFingerprint,
    normalizeDietAnalysis,
    preserveGalleryEngagement,
    syncGalleryPostFromDailyLog,
} = require('../functions/gallery-posts.js');

const mediaUrl = (folder, name, userId = 'user-1') =>
    `https://firebasestorage.googleapis.com/v0/b/habitschool.appspot.com/o/${encodeURIComponent(`${folder}/${userId}/${name}`)}?alt=media&token=test`;
const MEDIA = Object.freeze({
    breakfast: mediaUrl('diet_images', 'breakfast.jpg'),
    breakfastThumb: mediaUrl('diet_images_thumbnails', 'breakfast-thumb.jpg'),
    cardio: mediaUrl('exercise_images', 'run.jpg'),
    cardioThumb: mediaUrl('exercise_images_thumbnails', 'run-thumb.jpg'),
    strength: mediaUrl('exercise_videos', 'squat.mp4'),
    strengthThumb: mediaUrl('exercise_videos_thumbnails', 'squat-thumb.jpg'),
    sleep: mediaUrl('sleep_images', 'sleep.jpg'),
    sleepThumb: mediaUrl('sleep_images_thumbnails', 'sleep-thumb.jpg'),
});

const baseLog = () => ({
    userId: 'user-1',
    userName: '해빛 학생',
    date: '2026-07-10',
    timestamp: 'private-source-time',
    awardedPoints: {
        diet: true,
        exercise: true,
        mind: true,
        dietPoints: 30,
        exercisePoints: 30,
        mindPoints: 20,
    },
    shareSettings: {
        hideIdentity: false,
        hideDate: false,
        hideDiet: false,
        hideExercise: false,
        hidePoints: false,
        hideMind: false,
    },
    metrics: { weight: 70, glucose: 90, bpSystolic: 120 },
    steps: { count: 8400, screenshotUrl: 'https://example.com/steps.jpg' },
    diet: {
        breakfastUrl: MEDIA.breakfast,
        breakfastThumbUrl: MEDIA.breakfastThumb,
        secretNote: 'remove me',
    },
    dietAnalysis: {
        breakfast: {
            foods: [
                { name: '현미밥', category: 'natural', nutrients: '비공개 영양소 설명' },
                { name: '김치', category: 'processed', unknownFoodField: 'remove me' },
            ],
            scores: {
                vitamins: 82,
                minerals: 76,
                fiber: 91,
                antioxidants: 68,
                unknownScore: 100,
            },
            grade: 'A',
            naturalRatio: 88,
            insulinComment: '통곡물과 채소가 혈당 상승 속도를 낮추는 데 도움이 돼요.',
            suggestion: '단백질 반찬을 하나 더해 보세요.',
            summary: '자연식품 비율이 높은 균형 잡힌 한 끼예요.',
            raw: 'sensitive AI output',
            unknownAnalysisField: 'remove me',
        },
        lunch: {
            foods: [{ name: '사진 없는 식사', category: 'natural' }],
            scores: { vitamins: 100, minerals: 100, fiber: 100, antioxidants: 100 },
            grade: 'A',
            naturalRatio: 100,
            insulinComment: 'must not be projected without a matching photo',
            suggestion: 'must not be projected without a matching photo',
            summary: 'must not be projected without a matching photo',
        },
    },
    exercise: {
        cardioList: [{
            mediaId: 'cardio-1',
            imageUrl: MEDIA.cardio,
            imageThumbUrl: MEDIA.cardioThumb,
            aiAnalysis: { raw: 'remove' },
        }],
        strengthList: [{
            mediaId: 'strength-1',
            videoUrl: MEDIA.strength,
            videoThumbUrl: MEDIA.strengthThumb,
            aiAnalysis: { raw: 'remove' },
        }],
    },
    sleepAndMind: {
        sleepImageUrl: MEDIA.sleep,
        sleepImageThumbUrl: MEDIA.sleepThumb,
        meditationDone: true,
        gratitude: 'private journal',
        sleepAnalysis: { raw: 'remove' },
    },
});

describe('gallery post projection', () => {
    it('projects only allowlisted social fields and a bounded public diet analysis view', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'user-1_2026-07-10',
            dailyLog: baseLog(),
            updatedAt: 'server-time',
        });

        expect(post).toMatchObject({
            schemaVersion: 2,
            sourceLogId: 'user-1_2026-07-10',
            userId: 'user-1',
            userName: '해빛 학생',
            date: '2026-07-10',
            updatedAt: 'server-time',
            diet: {
                breakfastUrl: MEDIA.breakfast,
                breakfastThumbUrl: MEDIA.breakfastThumb,
            },
            dietAnalysis: {
                breakfast: {
                    foods: [
                        { name: '현미밥', category: 'natural' },
                        { name: '김치', category: 'processed' },
                    ],
                    scores: {
                        vitamins: 82,
                        minerals: 76,
                        fiber: 91,
                        antioxidants: 68,
                    },
                    grade: 'A',
                    naturalRatio: 88,
                    insulinComment: '통곡물과 채소가 혈당 상승 속도를 낮추는 데 도움이 돼요.',
                    suggestion: '단백질 반찬을 하나 더해 보세요.',
                    summary: '자연식품 비율이 높은 균형 잡힌 한 끼예요.',
                },
            },
            exercise: {
                cardioList: [{
                    mediaId: 'cardio-1',
                    imageUrl: MEDIA.cardio,
                    imageThumbUrl: MEDIA.cardioThumb,
                }],
                strengthList: [{
                    mediaId: 'strength-1',
                    videoUrl: MEDIA.strength,
                    videoThumbUrl: MEDIA.strengthThumb,
                }],
            },
            sleepAndMind: {
                sleepImageUrl: MEDIA.sleep,
                sleepImageThumbUrl: MEDIA.sleepThumb,
                meditationDone: true,
            },
        });

        const serialized = JSON.stringify(post);
        ['metrics', 'steps', 'aiAnalysis', 'gratitude', 'sleepAnalysis', 'private journal',
            'nutrients', 'sensitive AI output', 'unknownFoodField', 'unknownScore', 'unknownAnalysisField',
            'must not be projected without a matching photo']
            .forEach((forbidden) => expect(serialized).not.toContain(forbidden));
    });

    it('applies every share setting before projection', () => {
        const log = baseLog();
        log.shareSettings = {
            hideIdentity: true,
            hideDate: true,
            hideDiet: true,
            hideExercise: false,
            hidePoints: true,
            hideMind: true,
        };
        const post = buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log, updatedAt: 'server-time' });

        expect(post.userName).toBe('');
        expect(post).not.toHaveProperty('date');
        expect(post).not.toHaveProperty('timestamp');
        expect(post).not.toHaveProperty('awardedPoints');
        expect(post).not.toHaveProperty('diet');
        expect(post).not.toHaveProperty('dietAnalysis');
        expect(post).not.toHaveProperty('sleepAndMind');
        expect(post.exercise.cardioList).toHaveLength(1);
    });

    it('drops analyses for meals without a projected owner photo', () => {
        const log = baseLog();
        log.diet.lunchUrl = mediaUrl('diet_images', 'lunch.jpg', 'other-user');

        const post = buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log });

        expect(post.diet).not.toHaveProperty('lunchUrl');
        expect(post.dietAnalysis).not.toHaveProperty('lunch');
        expect(post.dietAnalysis).toHaveProperty('breakfast');
    });

    it('bounds public AI arrays, enums, numbers, and strings while removing unknown keys', () => {
        const longText = '긴'.repeat(5000);
        const raw = {
            breakfast: {
                foods: Array.from({ length: 40 }, (_, index) => ({
                    name: `${longText}-${index}`,
                    category: index === 0 ? 'not-an-allowed-category' : 'natural',
                    nutrients: longText,
                    extra: longText,
                })),
                scores: {
                    vitamins: 999,
                    minerals: -10,
                    fiber: 72.8,
                    antioxidants: Number.NaN,
                    privateScore: 55,
                },
                grade: 'A',
                naturalRatio: 140,
                insulinComment: longText,
                suggestion: longText,
                summary: longText,
                raw: longText,
            },
            lunch: {
                foods: [{ name: '신뢰할 수 없는 분석', category: 'natural' }],
                scores: { vitamins: 50, minerals: 50, fiber: 50, antioxidants: 50 },
                grade: 'S',
                naturalRatio: 50,
                insulinComment: longText,
                suggestion: longText,
                summary: longText,
            },
        };
        const normalized = normalizeDietAnalysis(raw, {
            breakfastUrl: MEDIA.breakfast,
            lunchUrl: mediaUrl('diet_images', 'lunch.jpg'),
        });
        const breakfast = normalized.breakfast;

        expect(breakfast.foods.length).toBeGreaterThan(0);
        expect(breakfast.foods.length).toBeLessThanOrEqual(16);
        expect(breakfast.foods.every((food) => (
            ['natural', 'processed', 'ultraprocessed'].includes(food.category)
            && food.name.length <= 120
            && Object.keys(food).every((key) => ['name', 'category'].includes(key))
        ))).toBe(true);
        expect(breakfast.scores.vitamins).toBe(100);
        expect(breakfast.scores.minerals).toBe(0);
        expect(breakfast.scores.fiber).toBeGreaterThanOrEqual(0);
        expect(breakfast.scores.fiber).toBeLessThanOrEqual(100);
        expect(Object.keys(breakfast.scores).every((key) => (
            ['vitamins', 'minerals', 'fiber', 'antioxidants'].includes(key)
        ))).toBe(true);
        expect(Object.values(breakfast.scores).every((score) => (
            Number.isFinite(score) && score >= 0 && score <= 100
        ))).toBe(true);
        expect(breakfast.naturalRatio).toBe(100);
        expect(['A', 'B', 'C', 'D', 'F']).toContain(breakfast.grade);
        expect(breakfast.insulinComment.length).toBeLessThanOrEqual(500);
        expect(breakfast.suggestion.length).toBeLessThanOrEqual(500);
        expect(breakfast.summary.length).toBeLessThanOrEqual(500);
        expect(JSON.stringify(breakfast)).not.toContain('nutrients');
        expect(JSON.stringify(breakfast)).not.toContain('privateScore');
        expect(JSON.stringify(breakfast)).not.toContain('raw');
        expect(normalized).not.toHaveProperty('lunch');
    });

    it('changes the projection fingerprint when only diet analysis changes', () => {
        const before = baseLog();
        const after = baseLog();
        after.dietAnalysis.breakfast.summary = '다시 분석한 요약';

        expect(getGalleryProjectionFingerprint(before))
            .not.toBe(getGalleryProjectionFingerprint(after));
    });

    it('returns null when all shareable categories are hidden or empty', () => {
        const log = baseLog();
        log.shareSettings.hideDiet = true;
        log.shareSettings.hideExercise = true;
        log.shareSettings.hideMind = true;
        expect(buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log })).toBeNull();
    });

    it('rejects external URLs and media owned by another account', () => {
        const log = baseLog();
        log.diet.breakfastUrl = 'https://tracker.example/pixel.jpg';
        log.exercise.cardioList[0].imageUrl = mediaUrl('exercise_images', 'run.jpg', 'other-user');
        log.exercise.strengthList = [];
        log.sleepAndMind = { meditationDone: false, sleepImageUrl: 'https://example.com/sleep.jpg' };
        expect(buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log })).toBeNull();
    });

    it('rejects a lookalike path hosted in a foreign Firebase bucket', () => {
        const log = baseLog();
        log.shareSettings.hideExercise = true;
        log.shareSettings.hideMind = true;
        log.diet.breakfastUrl = `https://firebasestorage.googleapis.com/v0/b/attacker.appspot.com/o/${encodeURIComponent('diet_images/user-1/breakfast.jpg')}?alt=media&token=test`;

        expect(buildGalleryPostFromDailyLog({
            logId: 'log-1',
            dailyLog: log,
            allowedStorageBuckets: ['habitschool.appspot.com'],
        })).toBeNull();
    });

    it('preserves engagement only from the existing gallery post', () => {
        const existingPost = {
            comments: [{ userId: 'commenter', userName: '학생', text: '응원해요', timestamp: 1 }],
            reactions: { heart: ['u2', 'u2'], fire: ['u3'], clap: [] },
            reactionPointAwardedUserIds: ['u2'],
            metrics: { leaked: true },
        };
        const preserved = preserveGalleryEngagement(existingPost);
        expect(preserved.comments).toHaveLength(1);
        expect(preserved.reactions.heart).toEqual(['u2']);
        expect(preserved.reactionPointAwardedUserIds).toEqual(['u2']);
        expect(preserved).not.toHaveProperty('metrics');

        const log = baseLog();
        log.comments = [{ userId: 'attacker', text: 'forged' }];
        log.reactions = { heart: ['attacker'] };
        const post = buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log, existingPost });
        expect(post.comments[0].userId).toBe('commenter');
        expect(post.reactions.heart).toEqual(['u2']);
    });

    it('clamps visible points to the daily category caps', () => {
        const log = baseLog();
        log.awardedPoints = { dietPoints: 999, exercisePoints: 999, mindPoints: 999 };
        const post = buildGalleryPostFromDailyLog({ logId: 'log-1', dailyLog: log });
        expect(post.awardedPoints).toEqual({ dietPoints: 30, exercisePoints: 30, mindPoints: 20 });
    });
});

describe('syncGalleryPostFromDailyLog', () => {
    it('overwrites with a sanitized projection and preserves engagement', async () => {
        const set = vi.fn(async () => {});
        const del = vi.fn(async () => {});
        const sourceGet = vi.fn(async () => ({
            exists: true,
            data: () => baseLog(),
        }));
        const galleryGet = vi.fn(async () => ({
            exists: true,
            data: () => ({ comments: [{ userId: 'u2', userName: '친구', text: '좋아요' }] }),
        }));
        const sourceReference = { get: sourceGet };
        const galleryReference = { get: galleryGet, set, delete: del };
        const db = {
            doc: vi.fn((path) => path.startsWith('daily_logs/')
                ? sourceReference
                : galleryReference),
        };
        const FieldValue = { serverTimestamp: vi.fn(() => 'server-ts') };

        const result = await syncGalleryPostFromDailyLog({
            db,
            FieldValue,
            logId: 'log-1',
            after: baseLog(),
        });

        expect(db.doc).toHaveBeenCalledWith('gallery_posts/log-1');
        expect(db.doc).toHaveBeenCalledWith('daily_logs/log-1');
        expect(sourceGet).toHaveBeenCalledTimes(1);
        expect(set).toHaveBeenCalledTimes(1);
        expect(set.mock.calls[0]).toHaveLength(1);
        expect(set.mock.calls[0][0].comments[0].text).toBe('좋아요');
        expect(JSON.stringify(result)).not.toContain('private journal');
        expect(del).not.toHaveBeenCalled();
    });

    it('deletes the projection when the source is deleted or no longer shareable', async () => {
        let liveSource = null;
        const sourceReference = {
            get: vi.fn(async () => ({
                exists: liveSource !== null,
                data: () => liveSource,
            })),
        };
        const galleryReference = {
            get: vi.fn(async () => ({ exists: false, data: () => null })),
            set: vi.fn(async () => {}),
            delete: vi.fn(async () => {}),
        };
        const db = {
            doc: vi.fn((path) => path.startsWith('daily_logs/')
                ? sourceReference
                : galleryReference),
        };
        const FieldValue = { serverTimestamp: () => 'server-ts' };

        await syncGalleryPostFromDailyLog({ db, FieldValue, logId: 'deleted', after: null });
        const hidden = baseLog();
        hidden.shareSettings.hideDiet = true;
        hidden.shareSettings.hideExercise = true;
        hidden.shareSettings.hideMind = true;
        liveSource = hidden;
        await syncGalleryPostFromDailyLog({ db, FieldValue, logId: 'hidden', after: hidden });

        expect(galleryReference.delete).toHaveBeenCalledTimes(2);
        expect(galleryReference.set).not.toHaveBeenCalled();
    });

    it('uses the live source in a transaction so a stale share event cannot undo unshare', async () => {
        const staleSharedEvent = baseLog();
        const liveHiddenSource = baseLog();
        liveHiddenSource.shareSettings.hideDiet = true;
        liveHiddenSource.shareSettings.hideExercise = true;
        liveHiddenSource.shareSettings.hideMind = true;

        const sourceReference = { kind: 'source' };
        const galleryReference = { kind: 'gallery' };
        const tx = {
            get: vi.fn(async (reference) => reference === sourceReference
                ? { exists: true, data: () => liveHiddenSource }
                : { exists: true, data: () => ({ comments: [{ text: '기존 반응' }] }) }),
            set: vi.fn(),
            delete: vi.fn(),
        };
        const db = {
            doc: vi.fn((path) => path.startsWith('daily_logs/')
                ? sourceReference
                : galleryReference),
            runTransaction: vi.fn(async (callback) => callback(tx)),
        };

        await syncGalleryPostFromDailyLog({
            db,
            FieldValue: { serverTimestamp: () => 'server-ts' },
            logId: 'log-1',
            before: null,
            after: staleSharedEvent,
        });

        expect(tx.get).toHaveBeenCalledWith(sourceReference);
        expect(tx.get).toHaveBeenCalledWith(galleryReference);
        expect(tx.delete).toHaveBeenCalledWith(galleryReference);
        expect(tx.set).not.toHaveBeenCalled();
    });
});
