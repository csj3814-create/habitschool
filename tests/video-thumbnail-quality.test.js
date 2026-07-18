import { describe, expect, it } from 'vitest';
import {
    isRenderableVideoFramePixels,
    scoreVideoFramePixels
} from '../js/video-thumbnail-quality.js';

function createPixels(values) {
    return new Uint8ClampedArray(values.flatMap(([red, green, blue, alpha = 255]) => [
        red,
        green,
        blue,
        alpha
    ]));
}

describe('video thumbnail frame quality', () => {
    it('rejects a uniform black decoder frame', () => {
        const pixels = createPixels(Array.from({ length: 64 }, () => [4, 6, 8]));

        expect(scoreVideoFramePixels(pixels)).toBe(0);
        expect(isRenderableVideoFramePixels(pixels)).toBe(false);
    });

    it('rejects an almost-black frame with only decoder noise', () => {
        const pixels = createPixels(Array.from({ length: 64 }, (_, index) => (
            index % 9 === 0 ? [15, 14, 16] : [2, 3, 4]
        )));

        expect(isRenderableVideoFramePixels(pixels)).toBe(false);
    });

    it('accepts a dark but visibly detailed workout frame', () => {
        const pixels = createPixels(Array.from({ length: 64 }, (_, index) => (
            index % 4 === 0 ? [80, 62, 45] : [12 + index, 18 + index, 22 + index]
        )));

        expect(scoreVideoFramePixels(pixels)).toBeGreaterThan(0);
        expect(isRenderableVideoFramePixels(pixels)).toBe(true);
    });

    it('accepts a normal daylight frame', () => {
        const pixels = createPixels(Array.from({ length: 64 }, (_, index) => [
            70 + (index * 2),
            110 + index,
            150 - index
        ]));

        expect(isRenderableVideoFramePixels(pixels)).toBe(true);
    });
});
