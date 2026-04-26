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
    it('renders reward-market values on a single inline row', () => {
        expect(rewardMarketSource).toContain('reward-market-price-chip');
        expect(rewardMarketSource).toContain('reward-market-price-separator');
    });

    it('wires coupon visual expand and dismiss handlers for the vault', () => {
        expect(rewardMarketSource).toContain('window.toggleRewardCouponVisual = function');
        expect(rewardMarketSource).toContain('window.dismissRewardCouponItem = async function');
        expect(rewardMarketSource).toContain('reward-coupon-remove');
        expect(rewardMarketSource).toContain('사용 완료');
        expect(rewardMarketSource).toContain('reward-coupon-product-thumb');
    });
});
