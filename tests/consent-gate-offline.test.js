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

// 2026-09-26 제보: "동의 또 떴어." 9/24 에 이어 세 번째. 서버 쪽에는 동의 기록을
// 지우는 쓰기가 없고(모든 users 쓰기가 merge), 9/24 에는 그 시각 서버 기록이 멀쩡했다.
// 기기 SDK 가 "서버에서 읽었다" 고 표시한 답에서도 동의가 빠졌다. 그래서 창을
// 여는 결정은 기기 SDK 를 거치지 않는 서버 함수(getMyConsents)의 답으로 한다.
function createGate({ serverConsents = null, callableError = null, gateOpen = false } = {}) {
    const body = sliceFn('async function openConsentGateIfServerAgrees', '// 동의 기록이 아예 없는가.');
    const user = { uid: 'user-1' };
    const calls = { open: [], recheck: 0, callable: 0 };
    const win = { __HABITSCHOOL_CONSENT_GATE_OPEN__: gateOpen };
    const fn = Function(
        'auth', 'window', 'getMyConsentsCallable', 'needsConsentRefresh', 'hasNoConsentRecord',
        'openReconsentModal', 'scheduleConsentRecheck', 'console',
        `${body}
        return openConsentGateIfServerAgrees;`
    )(
        { currentUser: user },
        win,
        () => async () => {
            calls.callable += 1;
            if (callableError) throw callableError;
            return { data: { exists: true, consents: serverConsents || {} } };
        },
        (data) => {
            const c = data && data.consents;
            if (!c || typeof c !== 'object') return true;
            return ['terms'].some((k) => !c[k] || c[k].agreed !== true || c[k].version !== '2026-08-15');
        },
        (data) => !data?.consents || Object.keys(data.consents).length === 0,
        (u, data, opts) => calls.open.push({ data, opts }),
        () => { calls.recheck += 1; },
        { warn: () => {}, info: () => {} }
    );
    return { run: (source = 'login') => fn(user, source), calls };
}

describe('the consent screen opens only on the server function\'s word', () => {
    it('stays shut when the server still has the consent record', async () => {
        const { run, calls } = createGate({ serverConsents: CONSENTED.consents });
        expect(await run()).toBe(false);
        expect(calls.open).toHaveLength(0);
    });

    it('opens the first-time screen when the server has no record', async () => {
        const { run, calls } = createGate({ serverConsents: {} });
        expect(await run()).toBe(true);
        expect(calls.open[0].opts.firstTime).toBe(true);
    });

    it('opens the terms-changed screen when the server record is out of date', async () => {
        const { run, calls } = createGate({ serverConsents: { terms: { agreed: true, version: '2026-01-01' } } });
        await run();
        expect(calls.open[0].opts.firstTime).toBe(false);
        // 제출 때 처음 동의 시각을 지키려면 서버가 준 기록을 넘겨야 한다.
        expect(calls.open[0].data.consents.terms.version).toBe('2026-01-01');
    });

    it('does not ask when the server function cannot answer, and tries once more later', async () => {
        const { run, calls } = createGate({ callableError: Object.assign(new Error('unavailable'), { code: 'functions/unavailable' }) });
        expect(await run()).toBe(false);
        expect(calls.open).toHaveLength(0);
        expect(calls.recheck).toBe(1);
    });

    it('does not loop the retry from inside the retry', async () => {
        const { run, calls } = createGate({ callableError: new Error('unavailable') });
        await run('recheck');
        expect(calls.recheck).toBe(0);
    });

    it('does not open twice', async () => {
        const { run, calls } = createGate({ serverConsents: {}, gateOpen: true });
        expect(await run()).toBe(false);
        expect(calls.callable).toBe(0);
    });

    it('is the only way the sign-in path and the retry open the screen', () => {
        const gate = sliceFn('if (needsConsentRefresh({ ...resolvedUserData, ...updateData })) {', 'const ud = {');
        expect(gate).toContain('openConsentGateIfServerAgrees(user');
        expect(gate).not.toContain('openReconsentModal(');
        const recheck = AUTH.split('function scheduleConsentRecheck(user) {')[1].split('\n}\n')[0];
        expect(recheck).toContain('openConsentGateIfServerAgrees(user');
        expect(recheck).not.toContain('openReconsentModal(');
    });
});
