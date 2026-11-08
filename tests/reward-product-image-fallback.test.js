import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-11-08: 기프티쇼 이미지 서버가 서비스 시간 밖에 사진 대신 안내 페이지를 돌려, 쿠폰 카드에 상품 이름 글자가 떴다.
describe('a coupon photo that fails to load falls back to the brand logo', () => {
    const market = read('js/reward-market.js');

    it('marks both product images for the fallback', () => {
        expect(market).toContain('loading="lazy"\' + buildRewardProductImageFallbackAttrs(item)');
        expect(market).toContain('loading="lazy"${buildRewardProductImageFallbackAttrs(item)}');
    });

    it('tries the logo once, then hides the box instead of showing the alt text', () => {
        const fn = market.split('function handleRewardProductImageError(')[1].split('\n}\n')[0];
        expect(fn).toContain("!imageEl.classList.contains('is-brand-fallback')");
        expect(fn).toContain("imageEl.classList.add('is-image-missing')");
        expect(fn).toContain("imageEl.alt = ''");
        expect(market).toContain("document.addEventListener('error', handleRewardProductImageError, true)");
    });

    it('has styles for both states', () => {
        const css = read('styles-reward-market.css');
        expect(css).toContain('.reward-market-hero-image.is-brand-fallback');
        expect(css).toContain('.reward-market-hero-image.is-image-missing');
    });
});
