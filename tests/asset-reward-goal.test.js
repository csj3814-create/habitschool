import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { buildRewardGoalView, describeRewardGap } from '../js/reward-pace.js';

// 2026-10-16 대표 결정: 자산 탭의 '가장 가까운 보상' 카드를 지웠다.
// 같은 계산(buildRewardGoalView)은 첫 기록 결과 창의 '첫 쿠폰까지' 줄과 해빛 마켓 잠금 버튼이
// 계속 쓴다. 그래서 계산 테스트는 남기고, 카드 배선 테스트는 "카드가 없다" 로 바꿨다.
const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

describe('가장 가까운 보상 카드는 없다', () => {
    it('화면에도, 갱신 코드에도 남아 있지 않다', () => {
        expect(html).not.toContain('asset-reward-goal-card');
        expect(html).not.toContain('가장 가까운 보상');
        expect(html).not.toContain('asset-reward-remaining');
        expect(app).not.toContain('updateAssetRewardGoal');
        expect(app).not.toContain('ensureAssetRewardGoalRendered');
        expect(app).not.toContain("getElementById('asset-reward-goal-card')");
    });

    it('마켓이 다시 그려질 때 첫 기록 줄은 계속 따라온다', () => {
        const start = app.indexOf('window.refreshAssetRewardGoal = function');
        expect(start).toBeGreaterThan(-1);
        expect(app.slice(start, start + 200)).toContain('renderFirstRecordGoalRow();');
    });
});

describe('보상 목표 계산', () => {
    it('1,835P 면 165P 남음', () => {
        const view = buildRewardGoalView(1835, {});
        expect(view.remainingLabel).toBe('165P 남음');
        expect(view.copy).toContain('1,835P');
        expect(view.progress).toBe((1835 / 2000) * 100);
        expect(view.valueNow).toBe(1835);
    });

    it('목표를 채우면 교환 가능', () => {
        const view = buildRewardGoalView(2400, {});
        expect(view.remainingLabel).toBe('지금 교환 가능');
        expect(view.progress).toBe(100);
        expect(view.valueNow).toBe(2000);
    });

    it('남은 기간은 평균이 아니라 하루 상한(80P)으로 센다', () => {
        expect(buildRewardGoalView(0, {}).estimate).toContain('25일');
        expect(buildRewardGoalView(0, {}).estimate).not.toContain('평균');
        expect(buildRewardGoalView(1835, {}).estimate).toContain('3일');
    });
});

const configSource = readRepoFile('js/firebase-config.js');
const MILESTONES = (() => {
    const src = configSource.split('export const MILESTONES = ')[1].split('\n};')[0] + '\n}';
    // eslint-disable-next-line no-new-func
    return Function(`return (${src});`)();
})();
const freshContext = { definitions: MILESTONES, state: {}, streak: 0 };
const discountedCatalog = [{
    sku: 'coffee', available: true, redeemable: true,
    pointCost: 1400, hbtCost: 1400, originalPointCost: 2000, firstRedemptionDiscount: true,
}];
const fullPriceCatalog = [{ sku: 'coffee', available: true, redeemable: true, pointCost: 2000, hbtCost: 2000 }];

describe('첫 교환 할인과 해빛 마켓이 같은 숫자를 말한다', () => {
    it('할인이 남은 신규 회원(200P)은 1,400P 를 목표로 한다', () => {
        const view = buildRewardGoalView(200, { catalog: discountedCatalog, context: freshContext });
        expect(view.heading).toBe('🎟️ 첫 교환 1,400P 쿠폰');
        expect(view.remainingLabel).toBe('1,200P 남음');
        expect(view.target).toBe(1400);
        expect(view.copy).toContain('원래 2,000P');
        expect(view.estimate).toBe(describeRewardGap(1400 - 200, freshContext, 'P').text);
        expect(view.estimate).toContain('12일이면 돼요');
    });

    it('할인을 이미 쓴 회원은 정가로 센다', () => {
        const view = buildRewardGoalView(200, { catalog: fullPriceCatalog, context: freshContext });
        expect(view.heading).toBe('🎟️ 2,000P 쿠폰');
        expect(view.remainingLabel).toBe('1,800P 남음');
        expect(view.copy).not.toContain('원래');
        expect(view.estimate).toBe(describeRewardGap(1800, freshContext, 'P').text);
    });
});

describe('목표 가격 고르기', () => {
    it('포인트 상품 중 가장 싼 것, 준비 중·HBT 정산 상품은 빼고', () => {
        const view = buildRewardGoalView(0, {
            catalog: [
                { sku: 'cake', pointCost: 5000 },
                { sku: 'soon', pointCost: 500, available: false },
                { sku: 'burn', pointCost: 300, hbtCost: 300, settlementAsset: 'hbt' },
                ...discountedCatalog,
            ],
        });
        expect(view.target).toBe(1400);
        expect(view.discounted).toBe(true);
        expect(view.originalCost).toBe(2000);
    });

    it('카탈로그를 아직 못 받았으면 정가 2,000P', () => {
        const view = buildRewardGoalView(0, {});
        expect(view.target).toBe(2000);
        expect(view.heading).toBe('🎟️ 2,000P 쿠폰');
    });
});

describe('다른 회원의 카탈로그를 넘기지 않는다', () => {
    it('getRewardGoalInputs 는 지금 회원의 마켓 상태만 준다', () => {
        const market = readRepoFile('js/reward-market.js');
        const body = market.slice(market.indexOf('export function getRewardGoalInputs()'));
        expect(body.slice(0, 800)).toContain('rewardMarketState.uid === uid');
        expect(body.slice(0, 800)).toContain('getRewardProjectionContext()');
    });
});
