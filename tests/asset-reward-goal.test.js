import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { buildRewardGoalView, describeRewardGap } from '../js/reward-pace.js';

// 자산 탭의 '가장 가까운 보상' 카드가 1,835P 를 가진 화면에서도
// '현재 포인트를 확인하고 있어요 / 2,000P 남음' 으로 남아 있었다.
//
// 원인은 타이밍이 아니라 구조였다. 포인트 숫자를 화면에 쓰는 곳이 다섯 군데인데
// 그중 하나만 진행바를 함께 갱신했다. 캐시로 숫자만 올라온 화면에서는 카드가
// index.html 에 박힌 초기 문구 그대로 남았다.
const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

// 본문의 여는 중괄호부터 센다. 파라미터의 구조분해({ a = 0 })를 본문 시작으로
// 오해하면 시그니처만 잘라 온다.
const sliceFn = (source, header) => {
    const start = source.indexOf(header);
    if (start < 0) return '';
    const bodyStart = source.indexOf(') {', start);
    if (bodyStart < 0) return '';
    let depth = 0;
    for (let i = bodyStart + 2; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
    return '';
};

// 배포되는 소스에서 함수를 그대로 떼어내 가짜 DOM 위에서 돌린다.
// 마켓 쪽 입력(카탈로그·마일스톤)은 getRewardGoalInputs 자리에 넣어 준다.
function runUpdateAssetRewardGoal(coins, inputs = {}) {
    const heading = { textContent: '🎟️ 2,000P 쿠폰' };
    const els = {
        'asset-reward-goal-card': { querySelector: (sel) => (sel === 'h3' ? heading : null) },
        'asset-reward-goal-copy': { textContent: '' },
        'asset-reward-remaining': { textContent: '' },
        'asset-reward-estimate': { hidden: false, textContent: '' },
    };
    const progressbar = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } };
    els['asset-reward-progress-fill'] = { style: {}, parentElement: progressbar };
    const document = { getElementById: (id) => els[id] || null };
    const body = sliceFn(app, 'function updateAssetRewardGoal(coins)');
    if (!body) throw new Error('updateAssetRewardGoal 을 찾지 못했다');
    // eslint-disable-next-line no-new-func
    new Function(
        'document', 'buildRewardGoalView', 'getRewardGoalInputs',
        `let _assetRewardGoalCoins = null;\n${body}\nupdateAssetRewardGoal(${JSON.stringify(coins)});`
    )(document, buildRewardGoalView, () => ({ catalog: [], settings: {}, context: {}, ...inputs }));
    return {
        heading: heading.textContent,
        copy: els['asset-reward-goal-copy'].textContent,
        remaining: els['asset-reward-remaining'].textContent,
        estimate: els['asset-reward-estimate'].textContent,
        estimateHidden: els['asset-reward-estimate'].hidden,
        width: els['asset-reward-progress-fill'].style.width,
        valuenow: progressbar.attrs['aria-valuenow'],
        valuemax: progressbar.attrs['aria-valuemax'],
        ariaLabel: progressbar.attrs['aria-label'],
    };
}

describe('보상 진행바 계산', () => {
    it('신고된 화면(1,835P)에서 남은 포인트를 제대로 낸다', () => {
        const r = runUpdateAssetRewardGoal(1835);
        // 화면에 있던 '2,000P 남음' 은 renderer 가 만들 수 없는 값이었다
        expect(r.remaining).toBe('165P 남음');
        expect(r.remaining).not.toBe('2,000P 남음');
        expect(r.copy).toContain('1,835P');
        expect(r.copy).not.toContain('확인하고 있어요');
        expect(r.width).toBe(`${(1835 / 2000) * 100}%`);
        expect(r.valuenow).toBe('1835');
    });

    it('목표를 채우면 교환 가능으로 바뀐다', () => {
        const r = runUpdateAssetRewardGoal(2400);
        expect(r.remaining).toBe('지금 교환 가능');
        expect(r.width).toBe('100%');
        expect(r.valuenow).toBe('2000');
    });

    it('0P 여도 초기 문구가 아니라 계산된 문구가 나온다', () => {
        const r = runUpdateAssetRewardGoal(0);
        expect(r.remaining).toBe('2,000P 남음');
        // 숫자는 같아도 설명은 반드시 갱신돼야 한다 — 이게 초기 상태와의 구분점이다
        expect(r.copy).toContain('현재 0P');
    });
});

// 2026-09-08: 이 자리에 '최근 7일 평균 기준 약 1253일' 이 떠 있었다. 기록이 드문
// 사람일수록 평균이 0 에 가까워져 숫자가 커지는 구조였다 — 계산은 맞았지만 시작한
// 사람을 정확히 겨냥해 낙담시켰다. 도달 일수는 이제 하루 상한(80P) 기준으로 낸다.
describe('남은 기간 안내', () => {
    it('평균이 아니라 하루 상한으로 계산한다', () => {
        const r = runUpdateAssetRewardGoal(0);
        expect(r.estimateHidden).toBe(false);
        expect(r.estimate).toContain('25일');       // 2000 / 80, 보너스 정보 없음
        expect(r.estimate).not.toContain('평균');
    });

    it('포인트가 쌓일수록 짧아진다', () => {
        expect(runUpdateAssetRewardGoal(1835).estimate).toContain('3일');   // 165 / 80
    });

    it('잔액만 아는 경로에서도 안내가 보인다 — 기록 목록을 기다리지 않는다', () => {
        // 예전에는 logs 를 못 받으면 통째로 숨겼다. 그래서 캐시로 숫자만 올라온
        // 화면에서는 남은 기간이 아예 사라졌다.
        expect(runUpdateAssetRewardGoal(500).estimateHidden).toBe(false);
    });
});

// 2026-10-14: 가입 200P 신규 회원에게 해빛 마켓은 "12일이면 돼요"(첫 교환 1,400P,
// 마일스톤 보너스 포함), 바로 위 카드는 "2,000P · 약 23일" 이라고 말했다.
// 카드는 이제 마켓이 받은 카탈로그 가격과 같은 describeRewardGap 을 쓴다.
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

describe('보상 카드와 해빛 마켓이 같은 숫자를 말한다', () => {
    it('첫 교환 할인이 남은 신규 회원(200P)은 1,400P 를 목표로 한다', () => {
        const r = runUpdateAssetRewardGoal(200, { catalog: discountedCatalog, context: freshContext });
        expect(r.heading).toBe('🎟️ 첫 교환 1,400P 쿠폰');
        expect(r.remaining).toBe('1,200P 남음');
        expect(r.valuemax).toBe('1400');
        expect(r.valuenow).toBe('200');
        expect(r.ariaLabel).toBe('1,400P 쿠폰까지 포인트');
        expect(r.width).toBe(`${(200 / 1400) * 100}%`);
        expect(r.copy).toContain('원래 2,000P');
    });

    it('남은 기간 문구가 마켓 잠금 버튼과 글자 하나까지 같다', () => {
        const r = runUpdateAssetRewardGoal(200, { catalog: discountedCatalog, context: freshContext });
        // 마켓: describeRewardGap(requiredCost - pointBalance, getRewardProjectionContext(), costUnit)
        const market = describeRewardGap(1400 - 200, freshContext, 'P').text;
        expect(r.estimate).toBe(market);
        expect(r.estimate).toContain('12일이면 돼요');
        expect(r.estimate).toContain('보너스');
        expect(r.estimate).not.toContain('23일');
    });

    it('할인을 이미 쓴 회원은 정가로, "첫 교환" 없이 센다', () => {
        const r = runUpdateAssetRewardGoal(200, { catalog: fullPriceCatalog, context: freshContext });
        expect(r.heading).toBe('🎟️ 2,000P 쿠폰');
        expect(r.remaining).toBe('1,800P 남음');
        expect(r.valuemax).toBe('2000');
        expect(r.copy).not.toContain('원래');
        expect(r.estimate).toBe(describeRewardGap(1800, freshContext, 'P').text);
    });

    it('할인가에 닿으면 바로 교환 가능으로 바뀐다', () => {
        const r = runUpdateAssetRewardGoal(1450, { catalog: discountedCatalog, context: freshContext });
        expect(r.remaining).toBe('지금 교환 가능');
        expect(r.valuenow).toBe('1400');
        expect(r.width).toBe('100%');
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

    it('카탈로그를 아직 못 받았으면 정가 2,000P 로 그린다', () => {
        const view = buildRewardGoalView(0, {});
        expect(view.target).toBe(2000);
        expect(view.heading).toBe('🎟️ 2,000P 쿠폰');
        // 초기 마크업도 같은 값이어야 화면이 깜빡이지 않는다
        expect(html).toContain('<h3>🎟️ 2,000P 쿠폰</h3>');
        expect(html).toContain('aria-label="2,000P 쿠폰까지 포인트"');
    });
});

describe('마켓이 늦게 와도 카드가 따라온다', () => {
    const market = readRepoFile('js/reward-market.js');

    it('마켓을 그릴 때마다 카드를 다시 센다', () => {
        const body = sliceFn(market, 'function renderRewardMarketSnapshot()');
        expect(body).toContain('window.refreshAssetRewardGoal()');
    });

    it('다른 회원의 카탈로그(할인 여부가 다르다)는 넘기지 않는다', () => {
        const body = sliceFn(market, 'export function getRewardGoalInputs()');
        expect(body).toContain('rewardMarketState.uid === uid');
        expect(body).toContain('getRewardProjectionContext()');
    });

    it('카드는 마지막 잔액으로 다시 그린다', () => {
        const body = sliceFn(app, 'window.refreshAssetRewardGoal = function');
        expect(body).toContain('updateAssetRewardGoal(_assetRewardGoalCoins)');
    });
});

describe('포인트를 쓰는 모든 경로가 진행바도 갱신한다', () => {
    // 이 목록에서 하나라도 빠지면 "숫자는 보이는데 진행바만 초기 상태" 가 재발한다.
    const writers = [
        'function applyCachedPointBalanceFromStorage(',
        'function applyPointBalanceSnapshot(',
        'function applyKnownCoinBalanceToUi(',
    ];

    it.each(writers)('%s 가 진행바를 함께 갱신한다', (header) => {
        const body = sliceFn(app, header);
        expect(body).not.toBe('');
        expect(body).toMatch(/updateAssetRewardGoal\(|applyKnownCoinBalanceToUi\(/);
    });

    it('캐시 표시 경로가 공용 writer 를 거친다', () => {
        const body = sliceFn(app, 'function applyCachedAssetDisplay(uid)');
        expect(body).toContain('applyKnownCoinBalanceToUi(pointsValue)');
    });

    it('포인트를 HBT 로 바꾸면 남은 포인트도 다시 계산된다', () => {
        const body = sliceFn(app, 'window.applyOptimisticConversionResult = function');
        expect(body).toContain('updateAssetRewardGoal(nextPoints)');
    });
});

describe('자산 재조회를 건너뛰는 경로', () => {
    it('30초 캐시 히트에서도 진행바를 맞춘다', () => {
        const display = sliceFn(app, 'window.updateAssetDisplay = async function');
        const cacheHit = display.slice(display.indexOf('_assetCache.uid === user.uid'));
        const untilReturn = cacheHit.slice(0, cacheHit.indexOf('return;'));
        expect(untilReturn).toContain('ensureAssetRewardGoalRendered(user.uid)');
    });

    it('사용자 문서를 못 받아도 캐시 잔액으로 진행바를 채운다', () => {
        expect(app).toContain('ensureAssetRewardGoalRendered(user.uid)');
        expect(app.match(/ensureAssetRewardGoalRendered\(user\.uid\)/g) || []).toHaveLength(2);
    });

    it('ensureAssetRewardGoalRendered 는 성공 경로와 같은 순서로 잔액을 찾는다', () => {
        const body = sliceFn(app, 'function ensureAssetRewardGoalRendered(uid)');
        expect(body).toContain('readAssetDisplayCache(uid)');
        expect(body).toContain("parseDisplayedAssetNumber('asset-points-display')");
        expect(body).toContain('updateAssetRewardGoal(coins)');
        // 잔액을 모르면 아무것도 하지 않아야 한다(0 으로 덮어쓰면 안 됨)
        expect(body).toContain('if (coins == null) return false;');
    });
});

describe('초기 마크업', () => {
    it('초기 문구가 여전히 화면 기본값으로 존재한다 — 갱신되지 않으면 이게 보인다', () => {
        expect(html).toContain('현재 포인트를 확인하고 있어요.');
        expect(html).toContain('id="asset-reward-remaining"');
    });
});
