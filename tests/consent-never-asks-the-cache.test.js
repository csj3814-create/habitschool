import { describe, expect, it, vi } from 'vitest';
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

/**
 * 로그인 관문에서 동의 창을 띄울지 정하는 대목만 떼어 와 돌린다.
 * 캐시가 답했는지 서버가 답했는지에 따라 무엇이 달라지는지가 이 시험의 전부다.
 */
function decide({ data, fromCache }) {
    const { hasNoConsentRecord, needsConsentRefresh } = loadDeciders();
    const OPEN_LINE = '                        openReconsentModal(user, consentData, { firstTime });';
    const gate = AUTH.slice(
        AUTH.indexOf('                        const firstTime = hasNoConsentRecord(consentData);'),
        AUTH.indexOf(OPEN_LINE) + OPEN_LINE.length
    );

    const opened = [];
    const rechecks = [];
    const warnings = [];
    Function(
        'consentData', 'userDocFromCache', 'hasNoConsentRecord', 'openReconsentModal',
        'scheduleConsentRecheck', 'console', 'user',
        `(function () {${gate}})();`
    )(
        data,
        fromCache,
        hasNoConsentRecord,
        (_u, d, opts) => opened.push({ firstTime: opts.firstTime, data: d }),
        () => rechecks.push('scheduled'),
        { warn: (m) => warnings.push(m) },
        { uid: 'u1' }
    );
    return { opened, rechecks, warnings, needsRefresh: needsConsentRefresh(data) };
}

describe('consent is never decided by an answer the cache gave', () => {
    it('does not ask when the cache says the version is stale', () => {
        // 제보의 장면. 캐시에는 낡은 판본이 있고, 서버에는 최신 동의가 있다.
        const cached = { consents: fullConsents(agreedOld) };
        expect(decide({ data: cached, fromCache: true }).needsRefresh).toBe(true);
        const r = decide({ data: cached, fromCache: true });
        expect(r.opened).toEqual([]);
        expect(r.rechecks).toEqual(['scheduled']);
    });

    it('still does not ask when the cache says there is no record at all', () => {
        // 2026-09-18 에 막아 둔 쪽. 그대로 막혀 있어야 한다.
        const r = decide({ data: {}, fromCache: true });
        expect(r.opened).toEqual([]);
        expect(r.rechecks).toEqual(['scheduled']);
    });

    it('asks when the server itself says the record is missing', () => {
        const r = decide({ data: {}, fromCache: false });
        expect(r.opened).toHaveLength(1);
        expect(r.opened[0].firstTime).toBe(true);
        expect(r.rechecks).toEqual([]);
    });

    it('asks when the server itself says the version is stale', () => {
        const r = decide({ data: { consents: fullConsents(agreedOld) }, fromCache: false });
        expect(r.opened).toHaveLength(1);
        // 이미 동의한 적 있는 사람이므로 "처음 오셨군요" 가 아니라 개정 안내다.
        expect(r.opened[0].firstTime).toBe(false);
    });

    it('leaves someone alone whose record is current', () => {
        const r = decide({ data: { consents: fullConsents(agreedNow) }, fromCache: false });
        expect(r.needsRefresh).toBe(false);
    });
});

describe('deferring is not the same as letting it go', () => {
    it('goes back to the server once instead of waiting for the next sign-in', () => {
        const fn = AUTH.split('function scheduleConsentRecheck(user) {')[1].split('\n}\n')[0];
        // 캐시가 아니라 서버에 묻는다. 이 자리에서 getDoc 을 쓰면 같은 병이 재발한다.
        expect(fn).toContain('getDocFromServer(');
        expect(fn).not.toMatch(/[^m]getDoc\(/);
        expect(fn).toContain("forceFirestoreReconnect('consent-recheck')");
        // 서버 답이 필요 없다고 하면 조용히 끝난다.
        expect(fn).toContain('if (!needsConsentRefresh(data)) return;');
        // 두 번 띄우지 않는다.
        expect(fn).toContain('if (window.__HABITSCHOOL_CONSENT_GATE_OPEN__) return;');
        // 여기까지 실패해도 모르는 채로 묻지 않는다 — 다음 로그인에 다시 본다.
        expect(fn).toContain('console.warn');
        expect(fn).not.toContain('openReconsentModal(user, {}');
    });

    it('verifies a stale-looking cached record with the server before believing it', () => {
        const resolver = AUTH.split('async function resolveLatestUserDocData(')[1].split('\n}\n')[0];
        // hasNoConsentRecord 만 보면 "판본이 낡았다" 는 캐시 답을 확인 없이 믿는다.
        expect(resolver).toContain('|| needsConsentRefresh(resolvedData);');
        expect(resolver).toContain('getDocFromServer(userRef)');
    });
});
