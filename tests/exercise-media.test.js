import { describe, expect, it } from 'vitest';

import {
    buildStrengthExerciseSeed,
    getDeferredStrengthThumbDelayMs,
    getStrengthThumbSaveWaitMs,
    isLocalExerciseVideoThumb,
    resolveLegacyStrengthVideoThumbUrl,
    resolveStrengthLocalThumbSeed,
    resolveStrengthVideoThumbUrl
} from '../js/exercise-media.js';

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

    it('skips the remote thumb wait when a local thumb already exists', () => {
        expect(getStrengthThumbSaveWaitMs('data:image/jpeg;base64,thumb')).toBe(0);
        expect(getStrengthThumbSaveWaitMs('')).toBe(1200);
    });

    it('delays local thumb extraction briefly for smaller uploads', () => {
        expect(getDeferredStrengthThumbDelayMs(4 * 1024 * 1024)).toBe(650);
        expect(getDeferredStrengthThumbDelayMs(12 * 1024 * 1024)).toBe(350);
        expect(getDeferredStrengthThumbDelayMs(24 * 1024 * 1024)).toBe(0);
    });
});
