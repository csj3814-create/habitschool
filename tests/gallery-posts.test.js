import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
    buildGalleryPostFromDailyLog,
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
    dietAnalysis: { breakfast: { raw: 'sensitive AI output' } },
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
    it('projects only allowlisted social fields and strips health, steps, AI, and journal text', () => {
        const post = buildGalleryPostFromDailyLog({
            logId: 'user-1_2026-07-10',
            dailyLog: baseLog(),
            updatedAt: 'server-time',
        });

        expect(post).toMatchObject({
            schemaVersion: 1,
            sourceLogId: 'user-1_2026-07-10',
            userId: 'user-1',
            userName: '해빛 학생',
            date: '2026-07-10',
            updatedAt: 'server-time',
            diet: {
                breakfastUrl: MEDIA.breakfast,
                breakfastThumbUrl: MEDIA.breakfastThumb,
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
        ['metrics', 'steps', 'dietAnalysis', 'aiAnalysis', 'gratitude', 'sleepAnalysis', 'private journal']
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
        expect(post).not.toHaveProperty('sleepAndMind');
        expect(post.exercise.cardioList).toHaveLength(1);
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
