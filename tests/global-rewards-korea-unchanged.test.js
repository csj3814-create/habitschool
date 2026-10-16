// 해외 2단계(해빛 배지·기프트카드 투표)를 넣어도 한국 회원의 기프티쇼 교환은 하나도 바뀌지 않는다.
// 이 파일은 해외 기능 코드보다 먼저 썼다. 여기 값이 바뀌면 한국 회원의 쿠폰 교환에 무언가 달라진 것이다.
// (2026-10-16 대표 결정으로 해빛 배지는 국내 회원에게도 열었다 — 접힌 카드로. 기프트카드 투표는 해외만.)

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';
import { createFakeFirestore, FakeFieldValue, FakeHttpsError } from './fake-firestore.js';
import { isOverseasTimeZone } from '../js/global-rewards-core.js';

const require = createRequire(import.meta.url);
const rewardMarket = require('../functions/reward-market.js');
const globalRewards = require('../functions/global-rewards.js');
const T = rewardMarket.__test;

const KOREAN_MEMBERS = [
    ['시간대가 없는 회원(2026-10-16 이전 가입자 전부)', { coins: 5000 }],
    ['Asia/Seoul 회원', { coins: 5000, timeZone: 'Asia/Seoul' }],
    ['잘못된 시간대 값', { coins: 5000, timeZone: 'Mars/Olympus' }],
    ['빈 문자열', { coins: 5000, timeZone: '' }],
];

describe('기프티쇼 설정·가격·한도는 지금 값 그대로', () => {
    it('기본 설정', () => {
        const config = T.buildRewardMarketConfig({});
        expect({
            mode: config.mode,
            settlementAsset: config.settlementAsset,
            pricingMode: config.pricingMode,
            deliveryMode: config.deliveryMode,
            minRedeemPoints: config.minRedeemPoints,
            dailyLimitPoints: config.dailyLimitPoints,
            weeklyLimitPoints: config.weeklyLimitPoints,
            monthlyLimitPoints: config.monthlyLimitPoints,
            firstRedemptionPointCost: config.firstRedemptionPointCost,
            firstRedemptionEnabled: config.firstRedemptionEnabled,
        }).toEqual({
            mode: 'mock',
            settlementAsset: 'points',
            pricingMode: 'phase1_fixed_internal',
            deliveryMode: 'app_vault',
            minRedeemPoints: 500,
            dailyLimitPoints: 2000,
            weeklyLimitPoints: 5000,
            monthlyLimitPoints: 10000,
            firstRedemptionPointCost: 1400,
            firstRedemptionEnabled: true,
        });
    });

    it('기본 상품 두 개 — 2,000P = 2,000원, 매입가 1,880원', () => {
        const catalog = T.buildFallbackCatalog(T.buildRewardMarketConfig({}));
        expect(catalog.map((item) => [item.sku, item.pointCost, item.faceValueKrw, item.purchasePriceKrw])).toEqual([
            ['mega-ice-americano-60d', 2000, 2000, 1880],
            ['paikdabang-iced-americano-60d', 2000, 2000, 1880],
        ]);
    });

    it('첫 교환 할인 1,400P 는 시간대와 상관없이 그대로', () => {
        const config = T.buildRewardMarketConfig({});
        for (const [, userData] of KOREAN_MEMBERS) {
            expect(T.resolveFirstRedemptionDiscount(userData, config)).toBe(1400);
        }
        expect(T.resolveFirstRedemptionDiscount({ timeZone: 'America/Los_Angeles' }, config)).toBe(1400);
    });

    it('받는 번호는 여전히 한국 휴대폰만', () => {
        expect(T.isValidRecipientPhone('01012345678')).toBe(true);
        expect(T.normalizeRecipientPhone('+82 10-1234-5678')).toBe('01012345678');
        expect(T.isValidRecipientPhone('+15551234567')).toBe(false);
    });

    it('기프티쇼 모듈이 내보내는 함수 목록이 그대로', () => {
        expect(Object.keys(rewardMarket)).toEqual([
            'REWARD_MARKET_MIN_REDEMPTION_HBT',
            'buildRewardMarketConfig',
            'buildRewardMarketSnapshot',
            'redeemRewardCoupon',
            'reconcileRewardCoupon',
            'resendRewardCoupon',
            'dismissRewardCoupon',
            'markRewardCouponUsed',
            'deleteRewardCoupon',
            'cleanupExpiredRewardCoupons',
            'adminResendRewardCoupon',
            'adminReconcileRewardCoupon',
            'adminRefundRewardCoupon',
            'syncRewardMarketOps',
            '__test',
        ]);
    });
});

describe('기프티쇼 스냅샷은 해외 컬렉션을 읽지 않고, 해외 회원에게도 똑같다', () => {
    const GIFTISHOW_COLLECTIONS = [
        'reward_catalog',
        'reward_market_feeds',
        'reward_market_pricing',
        'reward_redemptions',
        'reward_reserve_metrics',
    ];

    async function snapshotFor(userData) {
        const fake = createFakeFirestore({
            'global_giftcard_votes/u1': { uid: 'u1', country: 'US' },
            'global_badge_purchases/u1_sprout': { uid: 'u1', badgeId: 'sprout', pointCost: 300 },
        });
        const config = rewardMarket.buildRewardMarketConfig({});
        const snapshot = await rewardMarket.buildRewardMarketSnapshot({ db: fake.db, uid: 'u1', config, userData });
        return { fake, snapshot };
    }

    // 스냅샷 곳곳에 '지금 시각' 이 들어간다. 시계를 멈춰 두고 통째로 비교한다.
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('읽는 컬렉션은 지금 5개뿐', async () => {
        const { fake } = await snapshotFor({ coins: 5000 });
        expect([...fake.touched].sort()).toEqual(GIFTISHOW_COLLECTIONS);
    });

    it('미국 시간대 회원과 한국 회원의 기프티쇼 화면 데이터가 같다', async () => {
        const korean = await snapshotFor({ coins: 5000 });
        const overseas = await snapshotFor({ coins: 5000, timeZone: 'America/Los_Angeles' });
        expect(overseas.snapshot).toEqual(korean.snapshot);
        expect([...overseas.fake.touched].sort()).toEqual(GIFTISHOW_COLLECTIONS);
    });

    it('해외 모듈은 기프티쇼 교환 기록·한도 컬렉션을 건드리지 않는다', () => {
        const source = readRepoFile('functions/global-rewards.js');
        for (const name of GIFTISHOW_COLLECTIONS) {
            expect(source).not.toContain(name);
        }
        expect(source).not.toContain('reward-market');
    });
});

describe('국내 회원 — 배지는 살 수 있고, 해외 기프트카드 투표는 못 한다', () => {
    it.each(KOREAN_MEMBERS)('%s → 해외 아님', (_, userData) => {
        expect(globalRewards.isOverseasMember(userData)).toBe(false);
        expect(isOverseasTimeZone(userData.timeZone)).toBe(false);
    });

    it.each(KOREAN_MEMBERS)('%s → 스냅샷에 투표가 없고, 투표 컬렉션을 읽지 않는다(보유자 수만 센다)', async (_, userData) => {
        const fake = createFakeFirestore();
        const snapshot = await globalRewards.buildGlobalRewardSnapshot({ db: fake.db, uid: 'u1', userData });
        expect(snapshot.overseas).toBe(false);
        expect(snapshot.vote).toBeNull();
        expect(snapshot.badges).toHaveLength(7);
        expect([...fake.touched]).toEqual(['global_badge_purchases']);
    });

    it.each(KOREAN_MEMBERS)('%s → 기프트카드 투표 거절', async (_, userData) => {
        const fake = createFakeFirestore({ 'users/u1': userData });
        await expect(globalRewards.voteGlobalGiftCard({
            db: fake.db, FieldValue: FakeFieldValue, HttpsError: FakeHttpsError, uid: 'u1', country: 'US',
        })).rejects.toMatchObject({ code: 'failed-precondition' });
        expect(fake.paths()).toEqual(['users/u1']);
    });
});

describe('화면 — 국내 접속은 해빛 배지를 접어 두고, 해빛 마켓은 그대로', () => {
    const source = readRepoFile('js/global-rewards.js');
    const load = source.slice(source.indexOf('export async function loadGlobalRewards'));

    it('국내 기본값: 배지 접힘, 마켓 펼침', () => {
        expect(load).toContain("collapse = { key, badge: !overseas, market: overseas };");
    });

    it('접혀 있으면 서버를 부르기 전에 돌아간다', () => {
        const guard = load.indexOf('if (collapse.badge && !lastSnapshot) {');
        const call = load.indexOf('await fetchAndRender();');
        expect(guard).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(guard);
        expect(load.slice(guard, call)).toContain('return;');
    });

    it('국내 접속이면 해빛 마켓의 접기 버튼·접힘을 걷어 낸다', () => {
        const fn = source.slice(source.indexOf('function applyMarketCollapse(overseas)'));
        const domestic = fn.slice(0, fn.indexOf('if (!toggle) {'));
        expect(domestic).toContain('if (!overseas) {');
        expect(domestic).toContain('toggle?.remove();');
        expect(domestic).toContain('marketCard.classList.remove(COLLAPSED_CLASS);');
    });

    it('index.html 에는 해외 카드가 없다(필요할 때 스크립트가 만든다)', () => {
        expect(readRepoFile('index.html')).not.toContain('global-reward');
    });

    it('기프티쇼 화면 모듈은 해외 모듈을 모른다', () => {
        expect(readRepoFile('js/reward-market.js')).not.toContain('global-reward');
    });
});

describe('쿠폰 수령 연락처 — 제목 아래 안내 줄은 지웠다(2026-10-16 대표 요청)', () => {
    it('화면과 렌더러에 "쓸 번호예요" 문구가 없다', () => {
        expect(readRepoFile('index.html')).not.toContain('reward-market-phone-copy');
        const market = readRepoFile('js/reward-market.js');
        const view = market.slice(market.indexOf('function renderRewardRecipientPhonePanelView()'));
        const body = view.slice(0, view.indexOf('\n}\n'));
        expect(body).not.toContain('copyEl');
    });
});
