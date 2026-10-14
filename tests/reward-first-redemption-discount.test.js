import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const rewardMarket = require('../functions/reward-market.js');
const {
    resolveFirstRedemptionDiscount,
    resolveFirstRedemptionDiscountForMember,
    countsAsPriorRedemption,
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

// 2026-10-14: 스테이징에서 여러 번 교환한 계정에 "첫 교환 1,400P" 가 떴다.
// 표식(firstRewardDiscountUsedAt)은 v436 부터 찍었는데 자격은 표식만 봤다.
// 그 전에 교환한 회원은 표식이 없어서 몇 번을 교환했든 할인가를 받았다.
describe('지난 교환 기록이 있으면 첫 교환이 아니다', () => {
    function fakeDb(docs) {
        const calls = [];
        const query = {
            where(field, op, value) { calls.push(['where', field, op, value]); return query; },
            select(...fields) { calls.push(['select', ...fields]); return query; },
            async get() {
                return { docs: docs.map(([id, data]) => ({ id, data: () => data })) };
            }
        };
        return {
            calls,
            collection(name) { calls.push(['collection', name]); return query; }
        };
    }
    const ask = (db, extra = {}) => resolveFirstRedemptionDiscountForMember({
        db, uid: 'u1', userData: {}, config: POINTS_CONFIG, ...extra
    });

    it('표식 없이 예전에 교환한 회원에게는 할인을 주지 않는다', async () => {
        const db = fakeDb([['old-1', { status: 'issued' }], ['old-2', { status: 'used_completed' }]]);
        expect(await ask(db)).toBeNull();
        expect(db.calls).toContainEqual(['collection', 'reward_redemptions']);
        expect(db.calls).toContainEqual(['where', 'userId', '==', 'u1']);
    });

    it('교환한 적이 없으면 할인가를 준다', async () => {
        expect(await ask(fakeDb([]))).toBe(DEFAULT_FIRST_REDEMPTION_POINT_COST);
    });

    it('환불·취소된 건과 차감 전에 막힌 건은 세지 않는다', async () => {
        // 환불 때 할인 표식을 돌려주는 것과 같은 기준이다.
        const db = fakeDb([
            ['a', { status: 'issued', pointsCharged: true, pointsRefundedAt: new Date() }],
            ['b', { status: 'cancelled' }],
            ['c', { status: 'refunded' }],
            ['d', { status: 'failed_manual_review', pointsCharged: false }],
        ]);
        expect(await ask(db)).toBe(DEFAULT_FIRST_REDEMPTION_POINT_COST);
    });

    it('같은 요청의 재시도는 자기 문서를 지난 교환으로 세지 않는다', async () => {
        const db = fakeDb([['req-1', { status: 'pending_issue', pointsCharged: true }]]);
        expect(await ask(db, { excludeId: 'req-1' })).toBe(DEFAULT_FIRST_REDEMPTION_POINT_COST);
        expect(await ask(db)).toBeNull();
    });

    it('표식이 있거나 할인이 꺼져 있으면 기록을 조회하지 않는다', async () => {
        const marked = fakeDb([]);
        expect(await ask(marked, { userData: { firstRewardDiscountUsedAt: new Date() } })).toBeNull();
        expect(marked.calls).toEqual([]);
        const off = fakeDb([]);
        expect(await ask(off, { config: { ...POINTS_CONFIG, firstRedemptionEnabled: false } })).toBeNull();
        expect(off.calls).toEqual([]);
    });

    it('pointsCharged 가 없던 시절의 교환도 센다', () => {
        expect(countsAsPriorRedemption({ status: 'issued' })).toBe(true);
        expect(countsAsPriorRedemption({ status: 'pending_issue' })).toBe(true);
    });

    it('스냅샷과 교환 두 경로 모두 기록을 본다', () => {
        // 한쪽만 고치면 버튼은 2,000P 인데 1,400P 로 빠지거나 그 반대가 된다.
        const calls = SOURCE.match(/await resolveFirstRedemptionDiscountForMember\(/g) || [];
        expect(calls).toHaveLength(2);
        expect(SOURCE).toContain('excludeId: buildRedemptionRequestDocId(uid, normalizedRequestId),');
        expect(SOURCE).not.toMatch(/const firstRedemptionCost = resolveFirstRedemptionDiscount\(/);
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
