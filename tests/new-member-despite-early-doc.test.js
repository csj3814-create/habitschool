import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-27: 9/21 이후 가입한 11명 모두 createdAt·referredBy 가 없었다.
// 앱을 열자마자 도는 웹 기기 기록(recordWebPlatform)이 회원 문서를 먼저 만들어,
// 로그인 처리가 "문서가 있다 → 기존 회원" 으로 보고 가입일·초대 연결을 건너뛰었다.

const AUTH = readRepoFile('js/auth.js');
const HOUR = 60 * 60 * 1000;

function decide({ exists, data, accountAgeMs }) {
    const start = AUTH.indexOf('const accountCreatedMs = Date.parse(');
    const end = AUTH.indexOf('const isNewUser = ', start);
    const line = AUTH.slice(end, AUTH.indexOf('\n', end));
    expect(start).toBeGreaterThan(-1);
    const now = Date.parse('2026-09-27T03:00:00Z');
    const user = { metadata: { creationTime: new Date(now - accountAgeMs).toUTCString() } };
    return Function(
        'user', 'resolvedUserDoc', 'resolvedUserData', 'NEW_ACCOUNT_WINDOW_MS', 'Date',
        `${AUTH.slice(start, end)}${line}\nreturn { isNewUser, missingSignupRecord, accountCreatedMs };`
    )(
        user,
        { exists: () => exists },
        data,
        24 * HOUR,
        Object.assign(function () {}, { parse: Date.parse, now: () => now })
    );
}

describe('a brand-new member is new even when another write made the document first', () => {
    it('treats a fresh account whose document has no signup date as new', () => {
        const r = decide({ exists: true, data: { settings: { lastWebOpenDate: '2026-09-27' } }, accountAgeMs: 2 * 60 * 1000 });
        expect(r.isNewUser).toBe(true);
    });

    it('still treats a missing document as new', () => {
        expect(decide({ exists: false, data: {}, accountAgeMs: 1000 }).isNewUser).toBe(true);
    });

    it('does not re-run signup for a member who already has a signup date', () => {
        const r = decide({ exists: true, data: { createdAt: { seconds: 1 } }, accountAgeMs: 5 * 60 * 1000 });
        expect(r.isNewUser).toBe(false);
        expect(r.missingSignupRecord).toBe(false);
    });

    it('backfills rather than re-signs-up an older account that lost its signup date', () => {
        const r = decide({ exists: true, data: { settings: {} }, accountAgeMs: 5 * 24 * HOUR });
        expect(r.isNewUser).toBe(false);
        expect(r.missingSignupRecord).toBe(true);
        expect(AUTH).toContain('updateData.createdAt = new Date(accountCreatedMs);');
    });

    it('lets those members pick up a pending invite link', () => {
        expect(AUTH).toContain('isNewUser: isNewUser || missingSignupRecord');
    });
});
