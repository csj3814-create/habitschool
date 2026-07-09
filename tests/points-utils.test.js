import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DAILY_POINT_CAPS, clampDailyAwardTotal } = require('../functions/points-utils.js');

// C1 회귀 방지: awardPoints 트리거가 클라이언트의 awardedPoints를 그대로 신뢰하면
// 조작된 값(예: dietPoints=999999)만큼 coins가 무한 발행된다. 클램프가 이를 막아야 한다.
describe('clampDailyAwardTotal (C1 coin-mint exploit guard)', () => {
    it('sums legitimate points normally within caps', () => {
        expect(clampDailyAwardTotal({ dietPoints: 30, exercisePoints: 30, mindPoints: 20 })).toBe(80);
        expect(clampDailyAwardTotal({ dietPoints: 10, exercisePoints: 15, mindPoints: 5 })).toBe(30);
    });

    it('caps each category so an inflated field cannot mint coins', () => {
        expect(clampDailyAwardTotal({ dietPoints: 999999 })).toBe(DAILY_POINT_CAPS.dietPoints);
        expect(clampDailyAwardTotal({
            dietPoints: 1e9,
            exercisePoints: 1e9,
            mindPoints: 1e9,
        })).toBe(80); // 30 + 30 + 20, not billions
    });

    it('never contributes negative or non-numeric values', () => {
        expect(clampDailyAwardTotal({ dietPoints: -50, exercisePoints: 'abc', mindPoints: null })).toBe(0);
        expect(clampDailyAwardTotal({ dietPoints: NaN, exercisePoints: Infinity })).toBe(0); // 비유한값은 0으로 거부
        expect(clampDailyAwardTotal({})).toBe(0);
        expect(clampDailyAwardTotal(undefined)).toBe(0);
    });

    it('makes the credited diff safe even against a tampered write', () => {
        // 트리거의 diff = clamp(new) - clamp(old)
        const tamperedNew = clampDailyAwardTotal({ dietPoints: 999999, exercisePoints: 999999, mindPoints: 999999 });
        const legitOld = clampDailyAwardTotal({ dietPoints: 10 });
        expect(tamperedNew - legitOld).toBe(70); // 80 - 10, 최대 하루치 범위 내
    });
});
