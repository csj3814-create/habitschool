import { describe, expect, it } from 'vitest';

import { shouldFastPathImageCompression } from '../js/upload-performance.js';

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
