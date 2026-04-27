import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rewardMarketSource = readFileSync(
    path.resolve(__dirname, '../js/reward-market.js'),
    'utf8'
);
const rewardMarketStyles = readFileSync(
    path.resolve(__dirname, '../styles-reward-market.css'),
    'utf8'
);

describe('reward market UI render wiring', () => {
    it('keeps recipient phone input wired to the current snapshot renderer', () => {
        expect(rewardMarketSource).toMatch(
            /window\.handleRewardRecipientPhoneInput\s*=\s*function\s*\(\)\s*\{\s*renderRewardMarketSnapshot\(\);/s
        );
    });

    it('rerenders the current reward-market snapshot after saving the recipient phone', () => {
        expect(rewardMarketSource).toMatch(
            /async function persistRewardRecipientPhone[\s\S]*renderRewardMarketSnapshot\(\);[\s\S]*showToast\('쿠폰 수령 연락처를 저장했어요\.'\);/s
        );
    });

    it('renders compact reward-market values and formats stock validity labels', () => {
        expect(rewardMarketSource).toContain('const faceValueLabel = formatKrw(item.faceValueKrw || 0);');
        expect(rewardMarketSource).toContain('priceA11yLabel');
        expect(rewardMarketSource).toContain('aria-label');
        expect(rewardMarketSource).toContain('reward-market-price-chip');
        expect(rewardMarketSource).toContain('reward-market-price-separator');
        expect(rewardMarketSource).toContain("'<span class=\"reward-market-price-chip\"><strong>' + formatNumber(costValue)");
        expect(rewardMarketSource).toContain("'<span class=\"reward-market-price-chip\"><strong>' + escapeHtml(faceValueLabel)");
        expect(rewardMarketStyles).toContain('justify-content: center;');
        expect(rewardMarketStyles).toContain('overflow: hidden;');
        expect(rewardMarketStyles).toMatch(/\.reward-market-price-chip strong\s*\{[\s\S]*font-size: 17px;/);
        expect(rewardMarketSource).toContain('formatRewardMarketStockLabel');
        expect(rewardMarketSource).toContain('유효기간 ${match[1]}일');
    });

    it('wires coupon visual expand and dismiss handlers for the vault', () => {
        expect(rewardMarketSource).toContain('window.toggleRewardCouponVisual = function');
        expect(rewardMarketSource).toContain('window.dismissRewardCouponItem = async function');
        expect(rewardMarketSource).toContain('reward-coupon-remove');
        expect(rewardMarketSource).toContain('사용 완료');
        expect(rewardMarketSource).toContain('reward-coupon-product-thumb');
    });

    it('supports collapsed reward phone view with an explicit edit action', () => {
        expect(rewardMarketSource).toContain('phoneEditorOpen');
        expect(rewardMarketSource).toContain('reward-market-phone-summary');
        expect(rewardMarketSource).toContain('window.editRewardRecipientPhone = function');
    });

    it('marks barcode lightbox state explicitly for rotated fullscreen rendering', () => {
        expect(rewardMarketSource).toContain("lightboxEl.classList.toggle('is-barcode-open'");
        expect(rewardMarketSource).toContain("lightboxEl.classList.remove('is-barcode-open')");
        expect(rewardMarketSource).toContain("imageEl.classList.toggle('is-rotated-barcode'");
        expect(rewardMarketSource).toContain("expiresLabel === '-' ? expiresLabel : `${expiresLabel}까지`");
    });
});
