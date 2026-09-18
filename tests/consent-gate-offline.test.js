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
        'noteFirestoreConnectivityFailure', 'hasNoConsentRecord', 'console',
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

    it('does not spend a server read when the cached document already has one', async () => {
        const { resolver, getDocFromServer } = createResolver({ serverSnap: snapOf(CONSENTED, false) });
        const result = await resolver({ id: 'user-1' }, snapOf(CONSENTED, true));
        expect(getDocFromServer).not.toHaveBeenCalled();
        expect(result.fromCache).toBe(true);
    });

    it('reports a cache-only answer as such when the server cannot be reached', async () => {
        const { resolver } = createResolver({ serverError: new Error('client is offline') });
        const result = await resolver({ id: 'user-1' }, snapOf({ coins: 100, referralCode: 'ABC123' }, true));
        // 동의 기록이 없어 보이지만 서버는 아무 말도 하지 않았다. 그 사실이 남아야
        // 부르는 쪽이 "모른다" 와 "없다" 를 가를 수 있다.
        expect(result.fromCache).toBe(true);
    });
});

describe('the sign-in gate holds its tongue when it did not hear from the server', () => {
    const gate = sliceFn('if (needsConsentRefresh({ ...resolvedUserData, ...updateData })) {', 'const ud = {');

    it('skips the first-time prompt on a cache-only read', () => {
        expect(gate).toContain('if (firstTime && userDocFromCache)');
        // 가드가 창을 여는 호출보다 앞에 있어야 의미가 있다.
        expect(gate.indexOf('if (firstTime && userDocFromCache)'))
            .toBeLessThan(gate.indexOf('openReconsentModal('));
    });

    it('still opens it once the server has answered', () => {
        expect(gate).toContain('openReconsentModal(user, consentData, { firstTime })');
    });

    it('takes the cache flag from the resolver, not from a guess', () => {
        expect(AUTH).toContain('data: resolvedUserData, fromCache: userDocFromCache } = await resolveLatestUserDocData');
    });

    it('leaves the terms-changed prompt alone', () => {
        // 이미 동의한 사람의 버전이 어긋난 경우는 캐시로도 알 수 있다. 그 창까지
        // 막으면 약관 개정을 알릴 길이 없어진다.
        const guard = gate.slice(gate.indexOf('if (firstTime && userDocFromCache)'));
        expect(guard.slice(0, 200)).toContain('return;');
        expect(gate).toContain('const firstTime = hasNoConsentRecord(consentData)');
    });
});
