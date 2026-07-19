import { describe, expect, it } from 'vitest';

import {
    buildStrengthExerciseSeed,
    dataUrlToBlob,
    getDeferredStrengthThumbDelayMs,
    getStrengthThumbSaveWaitMs,
    hasStepPointCredit,
    isLocalExerciseVideoThumb,
    resolveLegacyStrengthVideoThumbUrl,
    resolveStrengthLocalThumbSeed,
    resolveStrengthVideoThumbUrl,
    shouldDeferStrengthThumbUntilUpload
} from '../js/exercise-media.js';

describe('dataUrlToBlob', () => {
    it('decodes a base64 image locally while preserving its MIME type and bytes', async () => {
        const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/AA==');

        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('image/jpeg');
        expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([255, 216, 255, 0]);
    });

    it('decodes percent-encoded data without a network request', async () => {
        const blob = dataUrlToBlob('data:text/plain;charset=utf-8,%ED%95%B4%EB%B9%9B');

        expect(blob).toBeInstanceOf(Blob);
        expect(blob.type).toBe('text/plain;charset=utf-8');
        expect(await blob.text()).toBe('해빛');
    });

    it('returns null for malformed or non-data URLs', () => {
        expect(dataUrlToBlob('https://example.com/thumb.jpg')).toBeNull();
        expect(dataUrlToBlob('data:image/jpeg;base64')).toBeNull();
        expect(dataUrlToBlob('data:image/jpeg;base64,%%%')).toBeNull();
    });
});

describe('hasStepPointCredit', () => {
    it('treats manually entered 8000+ steps as one cardio credit', () => {
        expect(hasStepPointCredit({ count: 8000, source: 'manual' })).toBe(true);
        expect(hasStepPointCredit({ count: 8023, source: 'manual' })).toBe(true);
    });

    it('does not require a screenshot URL or hash', () => {
        expect(hasStepPointCredit({
            count: 8023,
            source: 'samsung_screenshot',
            screenshotUrl: '',
            imageHash: ''
        })).toBe(true);
    });

    it('rejects counts below 8000 or non-numeric counts', () => {
        expect(hasStepPointCredit({ count: 7999 })).toBe(false);
        expect(hasStepPointCredit({ count: 'not-a-number' })).toBe(false);
    });
});

describe('resolveLegacyStrengthVideoThumbUrl', () => {
    it('returns the legacy thumb when the legacy video matches', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-thumb.jpg'
        };

        expect(resolveLegacyStrengthVideoThumbUrl(exercise, 'https://example.com/video.mp4'))
            .toBe('https://example.com/video-thumb.jpg');
    });

    it('does not reuse the legacy thumb for a different video URL', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video-a.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-a-thumb.jpg'
        };

        expect(resolveLegacyStrengthVideoThumbUrl(exercise, 'https://example.com/video-b.mp4'))
            .toBe('');
    });
});

describe('resolveStrengthVideoThumbUrl', () => {
    it('prefers the direct item thumb when present', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-thumb.jpg'
        };

        expect(resolveStrengthVideoThumbUrl(exercise, {
            videoUrl: 'https://example.com/video.mp4',
            videoThumbUrl: 'https://example.com/item-thumb.jpg'
        })).toBe('https://example.com/item-thumb.jpg');
    });

    it('falls back to the matching legacy thumb when the list item thumb is missing', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-thumb.jpg'
        };

        expect(resolveStrengthVideoThumbUrl(exercise, {
            videoUrl: 'https://example.com/video.mp4',
            videoThumbUrl: ''
        })).toBe('https://example.com/video-thumb.jpg');
    });
});

describe('buildStrengthExerciseSeed', () => {
    it('hydrates a list item with the matching legacy thumb', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-thumb.jpg'
        };

        expect(buildStrengthExerciseSeed(exercise, {
            videoUrl: 'https://example.com/video.mp4'
        })).toEqual({
            videoUrl: 'https://example.com/video.mp4',
            videoThumbUrl: 'https://example.com/video-thumb.jpg'
        });
    });

    it('hydrates a legacy-only exercise block seed', () => {
        const exercise = {
            strengthVideoUrl: 'https://example.com/video.mp4',
            strengthVideoThumbUrl: 'https://example.com/video-thumb.jpg'
        };

        expect(buildStrengthExerciseSeed(exercise)).toEqual({
            videoUrl: 'https://example.com/video.mp4',
            videoThumbUrl: 'https://example.com/video-thumb.jpg'
        });
    });
});

describe('strength local thumb helpers', () => {
    it('recognizes local data-url thumbs only', () => {
        expect(isLocalExerciseVideoThumb('data:image/jpeg;base64,abc')).toBe(true);
        expect(isLocalExerciseVideoThumb('https://example.com/thumb.jpg')).toBe(false);
    });

    it('picks the first valid local thumb seed', () => {
        expect(resolveStrengthLocalThumbSeed(
            '',
            'https://example.com/thumb.jpg',
            'data:image/png;base64,seed-a',
            'data:image/png;base64,seed-b'
        )).toBe('data:image/png;base64,seed-a');
    });

    it('waits briefly for the remote thumb URL before saving a strength video', () => {
        expect(getStrengthThumbSaveWaitMs('data:image/jpeg;base64,thumb')).toBe(2200);
        expect(getStrengthThumbSaveWaitMs('')).toBe(3600);
    });

    it('delays local thumb extraction briefly for smaller uploads and defers large uploads', () => {
        expect(getDeferredStrengthThumbDelayMs(4 * 1024 * 1024)).toBe(650);
        expect(getDeferredStrengthThumbDelayMs(12 * 1024 * 1024)).toBe(350);
        expect(getDeferredStrengthThumbDelayMs(24 * 1024 * 1024)).toBe(0);
        expect(shouldDeferStrengthThumbUntilUpload(20 * 1024 * 1024)).toBe(false);
        expect(shouldDeferStrengthThumbUntilUpload(24 * 1024 * 1024)).toBe(true);
    });
});
