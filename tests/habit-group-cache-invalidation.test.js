import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

const SOURCE = readAppSource();

function block(marker, span = 900) {
    const at = SOURCE.indexOf(marker);
    expect(at, `${marker} not found`).toBeGreaterThan(-1);
    return SOURCE.slice(at, at + span);
}

// 컨펌 직후 재조회가 승인 전 목록을 돌려받으면 처리한 카드가 되살아난다.
// 값 캐시(loadedAt)와 진행 중 promise 캐시는 함께 버려야 한다.
describe('habit group cache invalidation', () => {
    const INVALIDATE = 'function invalidateHabitGroupCaches()';

    it('drops the value caches', () => {
        const b = block(INVALIDATE);
        ['_habitGroupMembershipCache', '_habitGroupCheckinCache',
            '_habitGroupProgressCache', '_habitGroupLeaderPendingReviewCache']
            .forEach((name) => expect(b).toContain(`${name}.loadedAt = 0`));
    });

    it('also drops the in-flight promise caches', () => {
        const b = block(INVALIDATE);
        expect(b).toContain('_habitGroupMembershipPromise = null');
        expect(b).toContain("_habitGroupMembershipPromiseUid = ''");
        expect(b).toContain('_habitGroupLeaderPendingReviewPromise = null');
        expect(b).toContain("_habitGroupLeaderPendingReviewPromiseKey = ''");
    });

    it('never resurrects an invalidated pending-review list on query failure', () => {
        // 같은 문자열이 withAsyncTimeout 라벨로도 쓰여서, catch 안쪽을 집어야 한다.
        const b = block("logOptionalDataTimeout('habit_group_pending_reviews_timeout'", 700);
        expect(b).toContain('_habitGroupLeaderPendingReviewCache.loadedAt > 0');
        // cacheMatches 만 보고 되돌려주면 무효화가 무의미해진다.
        expect(b).not.toMatch(/return cacheMatches \? _habitGroupLeaderPendingReviewCache\.items : \[\]/);
    });

    it('still invalidates before re-rendering after a leader review', () => {
        const b = block('window.reviewHabitGroupCheckin', 1400);
        expect(b).toContain('invalidateHabitGroupCaches()');
        expect(b).toContain('renderSocialChallenges(');
    });
});
