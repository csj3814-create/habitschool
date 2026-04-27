import { describe, expect, it } from 'vitest';

import { getResumableUploadTimeouts, shouldFastPathImageCompression } from '../js/upload-performance.js';

describe('shouldFastPathImageCompression', () => {
    it('keeps smaller jpeg uploads on the fast path', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(1.2 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(true);
    });

    it('does not skip conversion for HEIC uploads', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/heic',
            size: Math.round(0.8 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(false);
    });

    it('keeps larger or analysis-target images on the compression path', () => {
        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(2.5 * 1024 * 1024)
        }, {
            maxWidth: 640,
            maxHeight: 640,
            quality: 0.6
        })).toBe(false);

        expect(shouldFastPathImageCompression({
            type: 'image/jpeg',
            size: Math.round(1.2 * 1024 * 1024)
        }, {
            maxWidth: 1280,
            maxHeight: 1280,
            quality: 0.82
        })).toBe(false);
    });
});

describe('getResumableUploadTimeouts', () => {
    it('keeps image uploads on a short photo-oriented budget', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'image/jpeg',
            size: Math.round(2 * 1024 * 1024)
        });

        expect(timeouts).toEqual({
            hardTimeoutMs: 60 * 1000,
            idleTimeoutMs: 30 * 1000,
            finalizeTimeoutMs: 10 * 1000
        });
    });

    it('gives video uploads a mobile-friendly progress-aware budget', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'video/mp4',
            size: Math.round(40 * 1024 * 1024)
        });

        expect(timeouts.hardTimeoutMs).toBeGreaterThanOrEqual(8 * 60 * 1000);
        expect(timeouts.idleTimeoutMs).toBeGreaterThanOrEqual(90 * 1000);
        expect(timeouts.finalizeTimeoutMs).toBe(30 * 1000);
    });

    it('caps very large video timeout budgets', () => {
        const timeouts = getResumableUploadTimeouts({
            type: 'video/mp4',
            size: Math.round(150 * 1024 * 1024)
        });

        expect(timeouts.hardTimeoutMs).toBe(20 * 60 * 1000);
        expect(timeouts.idleTimeoutMs).toBe(3 * 60 * 1000);
    });
});
