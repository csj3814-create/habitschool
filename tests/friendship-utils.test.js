import { describe, expect, it } from 'vitest';
import {
    toDateSafe,
    getFriendshipOtherUid,
    isFriendshipExpired,
    getEffectiveFriendshipStatus,
    getFriendshipName,
} from '../js/friendship-utils.js';

describe('toDateSafe', () => {
    it('passes Date through and parses strings/numbers', () => {
        const d = new Date('2026-01-01T00:00:00Z');
        expect(toDateSafe(d)).toBe(d);
        expect(toDateSafe('2026-01-01').getUTCFullYear()).toBe(2026);
        expect(toDateSafe(1735689600000)).toBeInstanceOf(Date); // 유효한 epoch ms
        expect(toDateSafe(0)).toBeNull(); // 0은 falsy → null (실제 동작)
    });
    it('supports Firestore Timestamp toDate()', () => {
        const ts = { toDate: () => new Date('2026-05-05T00:00:00Z') };
        expect(toDateSafe(ts).getUTCMonth()).toBe(4);
    });
    it('returns null for empty/invalid', () => {
        expect(toDateSafe(null)).toBeNull();
        expect(toDateSafe('not-a-date')).toBeNull();
        expect(toDateSafe({})).toBeNull();
    });
});

describe('getFriendshipOtherUid', () => {
    it('returns the other participant', () => {
        expect(getFriendshipOtherUid({ users: ['a', 'b'] }, 'a')).toBe('b');
        expect(getFriendshipOtherUid({ users: ['a', 'b'] }, 'b')).toBe('a');
    });
    it('returns null when absent or malformed', () => {
        expect(getFriendshipOtherUid({ users: ['a'] }, 'a')).toBeNull();
        expect(getFriendshipOtherUid({}, 'a')).toBeNull();
    });
});

describe('isFriendshipExpired / getEffectiveFriendshipStatus', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();

    it('only pending requests can expire', () => {
        expect(isFriendshipExpired({ status: 'pending', expiresAt: past })).toBe(true);
        expect(isFriendshipExpired({ status: 'pending', expiresAt: future })).toBe(false);
        expect(isFriendshipExpired({ status: 'active', expiresAt: past })).toBe(false);
    });

    it('promotes an expired pending request to "expired"', () => {
        expect(getEffectiveFriendshipStatus({ status: 'pending', expiresAt: past })).toBe('expired');
        expect(getEffectiveFriendshipStatus({ status: 'pending', expiresAt: future })).toBe('pending');
        expect(getEffectiveFriendshipStatus({ status: 'active' })).toBe('active');
        expect(getEffectiveFriendshipStatus(null)).toBe('none');
    });
});

describe('getFriendshipName', () => {
    it('prefers userNames map, then requesterName, then default', () => {
        expect(getFriendshipName({ users: ['a', 'b'], userNames: { b: '철수' } }, 'a')).toBe('철수');
        expect(getFriendshipName({ users: ['a', 'b'], requesterUid: 'b', requesterName: '영희' }, 'a')).toBe('영희');
        expect(getFriendshipName({ users: ['a', 'b'] }, 'a')).toBe('친구');
        expect(getFriendshipName({ users: ['a'] }, 'a')).toBe('친구');
    });
});
