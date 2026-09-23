import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const rewardMarket = require('../functions/reward-market.js');
const {
    resolveFirstRedemptionDiscount,
    applyFirstRedemptionDiscount,
    quoteCatalogItem,
    DEFAULT_FIRST_REDEMPTION_POINT_COST
} = rewardMarket.__test;

const SOURCE = readRepoFile('functions/reward-market.js');
const POINTS_CONFIG = { settlementAsset: 'points', minRedeemPoints: 500 };

describe('첫 교환 할인 자격', () => {
    it('아직 안 쓴 회원에게는 할인가를 준다', () => {
        expect(resolveFirstRedemptionDiscount({}, POINTS_CONFIG))
            .toBe(DEFAULT_FIRST_REDEMPTION_POINT_COST);
    });

    it('이미 쓴 회원에게는 주지 않는다', () => {
        expect(resolveFirstRedemptionDiscount(
            { firstRewardDiscountUsedAt: new Date() },
            POINTS_CONFIG
        )).toBeNull();
    });

    it('꺼 두면 아무에게도 주지 않는다', () => {
        expect(resolveFirstRedemptionDiscount({}, { ...POINTS_CONFIG, firstRedemptionEnabled: false }))
            .toBeNull();
    });

    it('HBT 정산에는 끼어들지 않는다', () => {
        // 소각 금액이 따로 묶여 있어서 같은 할인을 끼우면 스냅샷과 소각량이 어긋난다.
        expect(resolveFirstRedemptionDiscount({}, { settlementAsset: 'hbt' })).toBeNull();
    });

    it('최소 교환 한도 아래로는 내려가지 않는다', () => {
        expect(resolveFirstRedemptionDiscount({}, {
            settlementAsset: 'points',
            minRedeemPoints: 1800,
            firstRedemptionPointCost: 1400
        })).toBe(1800);
    });
});

describe('할인 적용', () => {
    it('원래 가격보다 쌀 때만 바꾼다', () => {
        expect(applyFirstRedemptionDiscount({ pointCost: 2000, hbtCost: 2000 }, 1400)).toEqual({
            pointCost: 1400,
            hbtCost: 1400,
            originalPointCost: 2000,
            firstRedemptionDiscount: true
        });
    });

    it('이미 더 싼 상품의 값을 올리지 않는다', () => {
        // 할인이 값을 올리면 그건 할인이 아니다.
        const cheap = { pointCost: 1000, hbtCost: 1000 };
        expect(applyFirstRedemptionDiscount(cheap, 1400)).toEqual(cheap);
    });

    it('자격이 없으면 손대지 않는다', () => {
        const item = { pointCost: 2000, hbtCost: 2000 };
        expect(applyFirstRedemptionDiscount(item, null)).toEqual(item);
    });

    it('할인을 안 받은 상품에는 표식이 붙지 않는다', () => {
        expect(applyFirstRedemptionDiscount({ pointCost: 2000 }, null).firstRedemptionDiscount)
            .toBeUndefined();
    });
});

describe('견적에 그대로 실린다', () => {
    const item = { sku: 'mega-ice-americano-60d', pointCost: 2000, hbtCost: 2000 };

    it('할인가로 견적이 나가야 교환 때 금액이 맞는다', () => {
        // 스냅샷이 2,000P 로 나가면 교환 쪽 Math.max 가 그 값을 골라 할인이 사라진다.
        const quoted = quoteCatalogItem(item, {}, POINTS_CONFIG, 1400);
        expect(quoted.pointCost).toBe(1400);
        expect(quoted.hbtCost).toBe(1400);
        expect(quoted.originalPointCost).toBe(2000);
    });

    it('자격이 없으면 정가 그대로', () => {
        const quoted = quoteCatalogItem(item, {}, POINTS_CONFIG, null);
        expect(quoted.pointCost).toBe(2000);
        expect(quoted.firstRedemptionDiscount).toBeUndefined();
    });
});

describe('한 번만 나가고, 우리 실패로 잃지는 않는다', () => {
    it('차감 트랜잭션 안에서 표식을 다시 확인한다', () => {
        // 두 탭에서 동시에 누르면 할인가로 두 번 살 수 있다.
        expect(SOURCE).toMatch(
            /if \(usedFirstRedemptionDiscount && freshUserData\.firstRewardDiscountUsedAt\) \{[\s\S]*?throw new HttpsError\(\s*"failed-precondition"/
        );
    });

    it('금액을 몰래 올려 받지 않는다', () => {
        // 버튼에 적힌 것과 다른 금액을 동의 없이 빼 가느니 다시 열어 보게 한다.
        expect(SOURCE).toContain('화면을 새로 고치면 지금 가격으로 보여드릴게요.');
    });

    it('차감이 실제로 일어날 때만 표식을 찍는다', () => {
        expect(SOURCE).toMatch(
            /if \(usedFirstRedemptionDiscount && shouldChargePointsNow\) \{\s*userUpdate\.firstRewardDiscountUsedAt = FieldValue\.serverTimestamp\(\);/
        );
    });

    it('환불되면 할인도 돌려준다', () => {
        expect(SOURCE).toMatch(
            /if \(redemptionData\.firstRedemptionDiscount === true\) \{\s*userUpdate\.firstRewardDiscountUsedAt = FieldValue\.delete\(\);/
        );
    });

    it('교환 문서에 할인 여부와 원래 가격을 남긴다', () => {
        // 남겨 두지 않으면 환불 때 할인 건인지 알 수 없고, 정산도 맞춰 볼 수 없다.
        expect(SOURCE).toContain('firstRedemptionDiscount: usedFirstRedemptionDiscount,');
        expect(SOURCE).toContain('originalPointCost: parseNumber(product.originalPointCost, requestedQuotedPointCost),');
    });
});
