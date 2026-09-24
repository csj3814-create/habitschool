import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const AUTH = readFileSync(resolve(ROOT_DIR, 'js/auth.js'), 'utf8');

// 2026-09-18 제보: "동의 화면이 왜 계속 뜨지? 업데이트마다 다시 받나?"
//
// 서버에서 확인해 보니 그 계정은 기록이 정말 없었고(그날 저장된 것이 처음),
// 저장 경로도 멀쩡했다. 실제로 쓰고 있는 회원 45명 중 동의 기록이 없는 사람은
// 0명이었다 — 관문도 저장도 제 일을 하고 있었다.
//
// 다만 확인하다 이 자리가 걸렸다. 동의 여부는 회원 문서 하나로 판단하는데,
// 그 문서를 **서버에서 들었는지** 를 아무도 보지 않았다. 연결이 끊긴 채 캐시로
// 답한 조회에 대고 "동의한 적 없는 분" 이라고 단정하면, 이미 동의한 사람이
// 가입 창을 다시 보게 된다. 바로 이 제보가 말하는 그 화면이다.
//
// 같은 날 들어온 다른 제보(이번 주 운동 0분)가 이 기기의 연결이 실제로 끊기고
// 있었음을 보여 준다. 그래서 가정이 아니다.

function sliceFn(startMarker, endMarker) {
    const start = AUTH.indexOf(startMarker);
    const end = AUTH.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return AUTH.slice(start, end);
}

const snapOf = (data, fromCache) => ({
    exists: () => data !== null,
    data: () => data,
    metadata: { fromCache },
});

const CONSENTED = {
    coins: 100,
    referralCode: 'ABC123',
    consents: { terms: { agreed: true, version: '2026-08-15' } },
};

function createResolver({ serverSnap = null, serverError = null } = {}) {
    const body = sliceFn('async function resolveLatestUserDocData', 'async function ensureSignedInUserReferralCode');
    const getDocFromServer = vi.fn(async () => {
        if (serverError) throw serverError;
        return serverSnap;
    });
    const resolver = Function(
        'getDocFromServer', 'readCachedSignedInPointBalance', 'normalizeInviteRefCode',
        'noteFirestoreConnectivityFailure', 'hasNoConsentRecord', 'needsConsentRefresh', 'console',
        `${body}
        return resolveLatestUserDocData;`
    )(
        getDocFromServer,
        () => null,
        (code) => String(code || ''),
        () => true,
        (data) => {
            const consents = data && data.consents;
            return !consents || typeof consents !== 'object' || Object.keys(consents).length === 0;
        },
        // 판본까지 본다. 기록이 있어도 낡았으면 서버에 다시 물어야 한다.
        (data) => {
            const consents = data && data.consents;
            if (!consents || typeof consents !== 'object') return true;
            return ['terms'].some((key) => {
                const entry = consents[key];
                return !entry || entry.agreed !== true || entry.version !== '2026-08-15';
            });
        },
        { info: () => {}, warn: () => {} }
    );
    return { resolver, getDocFromServer };
}

describe('we do not decide someone never agreed from a cached answer', () => {
    it('asks the server when the cached document has no consent record', async () => {
        const { resolver, getDocFromServer } = createResolver({ snapOf, serverSnap: snapOf(CONSENTED, false) });
        const cached = snapOf({ coins: 100, referralCode: 'ABC123' }, true);
        const result = await resolver({ id: 'user-1' }, cached);
        expect(getDocFromServer).toHaveBeenCalled();
        expect(result.data.consents).toBeTruthy();
        expect(result.fromCache).toBe(false);
    });

    it('does not spend a server read when the cached record is already current', async () => {
        const { resolver, getDocFromServer } = createResolver({ serverSnap: snapOf(CONSENTED, false) });
        const result = await resolver({ id: 'user-1' }, snapOf(CONSENTED, true));
        expect(getDocFromServer).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
    });

    // 2026-09-21 제보: "앱을 열자마자 약관 동의 뜨는데 새로고침 하니까 안 떠."
    // 캐시가 낡은 판본으로 답하면 "개정됐으니 다시 동의받아야 한다" 가 되는데,
    // 예전에는 기록이 **아예 없을 때만** 서버에 물어서 이 경우가 그냥 통과했다.
    it('asks the server when the cached record looks out of date', async () => {
        const stale = {
            coins: 100,
            referralCode: 'ABC123',
            consents: { terms: { agreed: true, version: '2026-01-01' } },
        };
        const { resolver, getDocFromServer } = createResolver({ serverSnap: snapOf(CONSENTED, false) });
        const result = await resolver({ id: 'user-1' }, snapOf(stale, true));
        expect(getDocFromServer).toHaveBeenCalled();
        expect(result.data.consents.terms.version).toBe('2026-08-15');
        expect(result.fromCache).toBe(false);
    });

    it('reports a cache-only answer as such when the server cannot be reached', async () => {
        const { resolver } = createResolver({ serverError: new Error('client is offline') });
        const result = await resolver({ id: 'user-1' }, snapOf({ coins: 100, referralCode: 'ABC123' }, true));
        // 동의 기록이 없어 보이지만 서버는 아무 말도 하지 않았다. 그 사실이 남아야
        // 부르는 쪽이 "모른다" 와 "없다" 를 가를 수 있다.
        expect(result.fromCache).toBe(true);
        expect(result.serverConfirmed).toBe(false);
    });

    // 2026-09-24 제보: "또 떴어 또." 서버의 동의 기록은 멀쩡했는데 창이 "가입 전
    // 확인" 으로 떴다. 서버 조회가 실패한 채 남은 스냅샷이 동의가 빠진 부분 문서였고,
    // 그 스냅샷이 fromCache:false 로 표시돼 있었다. 표시가 아니라 "서버에 물어 답을
    // 들었는가" 로 가른다.
    it('does not call a snapshot confirmed just because it says it is not from cache', async () => {
        const { resolver } = createResolver({ serverError: new Error('FIRESTORE (10.8.0) INTERNAL ASSERTION FAILED: Unexpected state') });
        const partial = snapOf({ settings: { lastAppOpenDate: '2026-09-24' } }, false);
        const result = await resolver({ id: 'user-1' }, partial);
        expect(result.serverConfirmed).toBe(false);
    });

    it('calls it confirmed only when the server read answered', async () => {
        const { resolver } = createResolver({ serverSnap: snapOf({ coins: 100, referralCode: 'ABC123' }, false) });
        const result = await resolver({ id: 'user-1' }, snapOf({ coins: 100, referralCode: 'ABC123' }, true));
        expect(result.serverConfirmed).toBe(true);
    });
});

describe('the sign-in gate holds its tongue when it did not hear from the server', () => {
    const gate = sliceFn('if (needsConsentRefresh({ ...resolvedUserData, ...updateData })) {', 'const ud = {');

    it('skips any prompt on a cache-only read, not just the first-time one', () => {
        // 2026-09-18 에는 firstTime 일 때만 걸리는 검사였다. "기록이 없다" 는 캐시
        // 답은 막았지만 "판본이 낡았다" 는 캐시 답은 통과해 창을 띄웠다.
        // 둘 다 모른다는 뜻이다 — 모를 때는 묻지 않는다.
        expect(gate).toContain('if (!userDocServerConfirmed) {');
        expect(gate).not.toContain('userDocFromCache');
        // 가드가 창을 여는 호출보다 앞에 있어야 의미가 있다.
        expect(gate.indexOf('if (!userDocServerConfirmed) {'))
            .toBeLessThan(gate.indexOf('openReconsentModal('));
    });

    it('still opens it once the server has answered', () => {
        expect(gate).toContain('openReconsentModal(user, consentData, { firstTime })');
    });

    it('takes the cache flag from the resolver, not from a guess', () => {
        expect(AUTH).toContain('data: resolvedUserData, serverConfirmed: userDocServerConfirmed } = await resolveLatestUserDocData');
    });

    it('does not lose the terms-changed prompt by deferring it', () => {
        // 예전 시험은 여기서 "개정 안내는 캐시로도 알 수 있으니 막지 말자" 고 했다.
        // 걱정 자체는 옳다 — 막기만 하면 약관 개정을 알릴 길이 없어진다.
        // 그래서 막는 대신 **서버에 다시 묻는다.** 미루기가 봐주기가 되면 안 된다.
        const guard = gate.slice(gate.indexOf('if (!userDocServerConfirmed) {'));
        expect(guard.slice(0, 300)).toContain('scheduleConsentRecheck(user);');
        expect(guard.slice(0, 300)).toContain('return;');
        expect(gate).toContain('const firstTime = hasNoConsentRecord(consentData)');
        // 그 재확인은 반드시 서버에 묻는다.
        const recheck = AUTH.split('function scheduleConsentRecheck(user) {')[1].split('\n}\n')[0];
        expect(recheck).toContain('getDocFromServer(');
        expect(recheck).toContain('openReconsentModal(');
    });
});
