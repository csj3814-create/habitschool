import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { GUIDE_CATALOG, guideHelpButtonHtml, isGuidePublished } from '../js/guide-help.js';

// 사용법 연재 ⓘ (2026-10-07 사용자 결정): 기능 옆 작은 ⓘ → 요약 → "자세히"는 브런치 글.
describe('guide help (사용법 연재 ⓘ)', () => {
    it('published guides link to their Brunch article and have a short summary', () => {
        const published = Object.entries(GUIDE_CATALOG).filter(([id]) => isGuidePublished(id));
        expect(published.length).toBeGreaterThanOrEqual(6);
        for (const [, guide] of published) {
            expect(guide.brunchUrl).toMatch(/^https:\/\/brunch\.co\.kr\/@csj3814\/\d+$/);
            expect(guide.summary.length).toBeGreaterThanOrEqual(2);
            expect(guide.summary.length).toBeLessThanOrEqual(3);
        }
    });

    it('renders the button as a span so it can sit inside the score summary <button>', () => {
        const html = guideHelpButtonHtml('guide-06');
        expect(html.startsWith('<span ')).toBe(true);
        expect(html).toContain('data-guide-id="guide-06"');
        expect(html).toContain('role="button"');
    });

    it('renders nothing for an unpublished or unknown guide', () => {
        expect(guideHelpButtonHtml('guide-10')).toBe('');
        expect(guideHelpButtonHtml('nope')).toBe('');
    });

    it('stops the click before it reaches the outer button and hides in the English app', () => {
        const source = readRepoFile('js/guide-help.js');
        expect(source).toContain("document.addEventListener('click', onHelpClick, true)");
        expect(source).toContain('event.stopPropagation()');
        expect(source).toContain("classList.add('guide-help-off')");
        expect(readRepoFile('styles-features.css')).toContain('.guide-help-off .guide-help-btn');
    });

    it('places a button next to each published feature in index.html', () => {
        const index = readRepoFile('index.html');
        for (const id of ['guide-01', 'guide-02', 'guide-03', 'guide-04', 'guide-05', 'guide-06']) {
            expect(index).toContain(`data-guide-id="${id}"`);
        }
        // 영어 화면에서 i18n 이 제목 글자를 바꿔도 ⓘ 가 지워지지 않도록 글자는 따로 감싼다.
        expect(index).toContain('<span data-i18n="bodyComp.scale.title">');
    });
});
