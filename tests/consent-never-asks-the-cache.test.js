import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 제보: "앱을 열자마자 약관 동의 뜨는데 새로고침 하니까 안 떠.
// 혹시 열자마자 약관 동의 상태를 못 받아와서 띄우는 건가?"
//
// 그렇다. 앱을 처음 열 때는 연결이 아직 덜 서서 캐시가 답하고, 새로고침 때는
// 이미 선 연결로 서버가 답한다. 같은 계정, 같은 기록인데 답하는 쪽이 다르다.
//
// 2026-09-18 에 이미 절반은 막아 두었는데 firstTime 일 때만 걸리는 검사였다.
//
//   캐시가 "기록이 아예 없다"  → 막힘   (firstTime)
//   캐시가 "판본이 낡았다"     → 통과   ← 여기로 샜다
//
// 둘 다 모른다는 뜻이다. 모를 때는 묻지 않는다.

const AUTH = readRepoFile('js/auth.js');

const CURRENT = '2026-08-15';
const agreedNow = () => ({ agreed: true, at: '2026-09-01T00:00:00.000Z', version: CURRENT });
const agreedOld = () => ({ agreed: true, at: '2026-05-01T00:00:00.000Z', version: '2026-01-01' });
const fullConsents = (entry) => ({ terms: entry(), privacy: entry(), age14: entry(), sensitive: entry() });

/** 동의 판정 두 함수를 소스에서 그대로 떼어 온다. */
function loadDeciders() {
    const grab = (name) => {
        const s = AUTH.indexOf(`function ${name}(`);
        expect(s, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
        return AUTH.slice(s, AUTH.indexOf('\n}\n', s) + 2);
    };
    return Function('CONSENT_DOC_VERSION', 'RECONSENT_REQUIRED_KEYS', `
        ${grab('hasNoConsentRecord')}
        ${grab('needsConsentRefresh')}
        return { hasNoConsentRecord, needsConsentRefresh };
    `)(CURRENT, ['terms', 'privacy', 'age14']);
}

// 2026-09-26: 창을 열지는 이제 기기 캐시든 기기의 "서버 답" 이든 믿지 않고 서버 함수
// (getMyConsents)가 읽은 기록으로 정한다. 그 동작은 tests/consent-gate-offline.test.js 가 본다.
// 여기서는 판정 함수 자체가 그대로인지 본다.
describe('consent is never decided by an answer the cache gave', () => {
    it('treats a stale version as needing consent again', () => {
        const { needsConsentRefresh, hasNoConsentRecord } = loadDeciders();
        const stale = { consents: fullConsents(agreedOld) };
        expect(needsConsentRefresh(stale)).toBe(true);
        // 이미 동의한 적 있는 사람이므로 "처음 오셨군요" 가 아니라 개정 안내다.
        expect(hasNoConsentRecord(stale)).toBe(false);
    });

    it('treats an empty record as first time', () => {
        const { needsConsentRefresh, hasNoConsentRecord } = loadDeciders();
        expect(needsConsentRefresh({})).toBe(true);
        expect(hasNoConsentRecord({})).toBe(true);
    });

    it('leaves someone alone whose record is current', () => {
        const { needsConsentRefresh } = loadDeciders();
        expect(needsConsentRefresh({ consents: fullConsents(agreedNow) })).toBe(false);
    });

    it('never opens the screen from what the device read', () => {
        const gate = AUTH.slice(
            AUTH.indexOf('if (needsConsentRefresh({ ...resolvedUserData, ...updateData })) {'),
            AUTH.indexOf('const ud = {')
        );
        expect(gate).not.toContain('openReconsentModal(');
        expect(gate).toContain('openConsentGateIfServerAgrees(user');
    });
});

describe('deferring is not the same as letting it go', () => {
    it('goes back to the server once instead of waiting for the next sign-in', () => {
        const fn = AUTH.split('function scheduleConsentRecheck(user) {')[1].split('\n}\n')[0];
        // 기기 SDK 가 아니라 서버 함수에 묻는다.
        expect(fn).toContain("openConsentGateIfServerAgrees(user, 'recheck')");
        expect(fn).not.toMatch(/[^m]getDoc\(/);
        // 두 번 띄우지 않는다.
        expect(fn).toContain('if (window.__HABITSCHOOL_CONSENT_GATE_OPEN__) return;');
        // 여기까지 실패해도 모르는 채로 묻지 않는다 — 다음 로그인에 다시 본다.
        expect(fn).toContain('console.warn');
        expect(fn).not.toContain('openReconsentModal(');
    });

    it('verifies a stale-looking cached record with the server before believing it', () => {
        const resolver = AUTH.split('async function resolveLatestUserDocData(')[1].split('\n}\n')[0];
        // hasNoConsentRecord 만 보면 "판본이 낡았다" 는 캐시 답을 확인 없이 믿는다.
        expect(resolver).toContain('|| needsConsentRefresh(resolvedData);');
        expect(resolver).toContain('getDocFromServer(userRef)');
    });
});
