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

describe('gallery top is one row; card and settings fold (2026-11-21 대표)', () => {
    const core = read('js/app-core.js');

    it('drops the hero title, the 1-2-3 steps and the fold button, in both apps', () => {
        for (const page of ['index.html', 'en/index.html']) {
            const html = read(page);
            expect(html).not.toContain('id="gallery-hero"');
            expect(html).not.toContain('gallery-hero-action');
            expect(html).not.toContain('id="gallery-hero-toggle"');
            expect(html).toContain('class="gallery-quickbar"');
            expect(html).toContain('id="gallery-share-card-toggle"');
            expect(html).toContain('id="gallery-share-settings-toggle"');
            expect(html).toContain('<div id="gallery-share-settings-shell" class="gallery-share-settings-shell" hidden>');
            expect(html).toContain('<div id="gallery-share-card-panel" class="gallery-share-card-panel" hidden>');
            expect(html).toContain('class="gallery-feed-heading sr-only"');
        }
        expect(core).not.toContain('toggleGalleryHeroGuide');
        expect(core).not.toContain('setGalleryHeroCollapsed');
    });

    it('starts folded and the record form reset does not open the settings', () => {
        expect(core).toContain('let _shareSettingsExpanded = false;');
        expect(core).toContain('let _shareCardPanelExpanded = false;');
        const anchor = 'applyShareSettingsToControls(_accountShareSettings || getDefaultShareSettings());';
        const reset = core.slice(core.indexOf(anchor), core.indexOf(anchor) + 140);
        expect(reset).not.toContain('setShareSettingsExpanded(true);');
    });

    it('the share flow opens my card (or the settings from the mind shortcut)', () => {
        const fn = core.slice(core.indexOf('async function triggerGalleryShareAction('), core.indexOf('function focusGalleryFeed()'));
        expect(fn).toContain('const toSettings = forceExpanded === true;');
        expect(fn).toContain('if (toSettings) setShareSettingsExpanded(true);');
        expect(fn).toContain('else setShareCardPanelExpanded(true);');
    });

    it('keeps the toggle label and shows the short state on it', () => {
        const fn = core.slice(core.indexOf('function setShareSettingsExpanded('), core.indexOf('function toggleShareSettingsPanel('));
        expect(fn).not.toContain('textContent');
        expect(core).toContain("t('gallery.quick.summaryDefault')");
        expect(read('js/i18n-en.js')).toContain("'gallery.quick.shareCard': '📤 Share my card'");
    });
});

describe('record guide cards only in simple mode (2026-11-21 대표)', () => {
    it('hides the diet · exercise · mind guide card outside simple mode', () => {
        const css = read('styles-reports.css');
        expect(css).toContain('html:not(.simple-mode) body:not(.simple-mode) .record-flow-card {\n    display: none;');
    });
});

describe('gallery privacy note (2026-11-18)', () => {
    it('drops the 「기본 공유」 note that repeated the sharing settings, for everyone', () => {
        for (const page of ['index.html', 'en/index.html']) {
            expect(read(page)).not.toContain('class="gallery-privacy-note"');
        }
    });
});

