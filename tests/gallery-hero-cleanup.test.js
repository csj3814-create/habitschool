// 갤러리 위쪽 정리 (2026-11-18 대표 캡처)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p) => readFileSync(resolve(p), 'utf8');

describe('gallery hero', () => {
    it('keeps the short guide sentence on one line where it fits (no ch width for Korean)', () => {
        const css = read('styles-features.css');
        const rule = css.slice(css.indexOf('.gallery-hero-desc {'), css.indexOf('}', css.indexOf('.gallery-hero-desc {')));
        expect(rule).not.toMatch(/max-width:\s*\d+ch/);
        expect(rule).toContain('word-break: keep-all;');
    });

    it('no longer shows recent posts · members · my longest streak, for anyone', () => {
        for (const page of ['index.html', 'en/index.html']) {
            const html = read(page);
            expect(html).not.toContain('id="gallery-total-posts"');
            expect(html).not.toContain('id="gallery-my-streak"');
            expect(html).not.toContain('class="gallery-hero-stats"');
        }
    });

    it('still refreshes the feed title without the number boxes', () => {
        const core = read('js/app-core.js');
        const fn = core.slice(core.indexOf('function renderGalleryHeroStats('), core.indexOf('}', core.indexOf('function renderGalleryHeroStats(')) + 1);
        expect(fn).toContain('updateGalleryFeedHeader();');
        expect(fn).not.toContain('return;');
    });
});
