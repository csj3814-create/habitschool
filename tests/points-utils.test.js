import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { DAILY_POINT_CAPS, clampDailyAwardTotal, computeReactionToggle } = require('../functions/points-utils.js');

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

// 리액션 코인 발행 취약점(#1) 회귀 방지: 서버가 request.auth.uid로만 토글하고,
// (post, reactor)당 최초 1회만, 본인 게시물 제외로 지급해야 한다. uid는 서버 검증값이므로
// 위조 삽입(타인 UID로 코인 발행)이 원천 불가하다.
describe('computeReactionToggle (reaction coin-mint exploit guard)', () => {
    it('adds reactor and awards once for a first-time reaction on someone else post', () => {
        const r = computeReactionToggle({ userId: 'owner', reactions: {} }, 'reactorA', 'heart');
        expect(r.active).toBe(true);
        expect(r.award).toBe(true);
        expect(r.postOwnerId).toBe('owner');
        expect(r.reactions.heart).toEqual(['reactorA']);
        expect(r.count).toBe(1);
    });

    it('never awards for reacting to your own post (self-mint blocked)', () => {
        const r = computeReactionToggle({ userId: 'owner', reactions: {} }, 'owner', 'fire');
        expect(r.active).toBe(true);
        expect(r.award).toBe(false);
    });

    it('does not double-award the same reactor on the same post', () => {
        const log = { userId: 'owner', reactions: {}, reactionPointAwardedUserIds: ['reactorA'] };
        const r = computeReactionToggle(log, 'reactorA', 'clap');
        expect(r.active).toBe(true);
        expect(r.award).toBe(false); // 이미 지급 원장에 있음
    });

    it('un-reacts without clawback and without award', () => {
        const log = { userId: 'owner', reactions: { heart: ['reactorA'] }, reactionPointAwardedUserIds: ['reactorA'] };
        const r = computeReactionToggle(log, 'reactorA', 'heart');
        expect(r.active).toBe(false);
        expect(r.award).toBe(false);
        expect(r.reactions.heart).toEqual([]);
    });
});
