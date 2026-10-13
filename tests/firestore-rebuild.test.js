import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-08 제보(운동 화면, "와이파이 좋은데 왜 업로드 에러가?"): Firestore SDK 가
// 내부 오류로 무너졌다. 화면에 고른 사진이 있어 자동 새로고침 대신 "새로고침" 단추만
// 떴고, 저장은 무너진 인스턴스로 가서 기다리다 실패했다. 이제는 그 자리에서 인스턴스만
// 바꿔 끼우고, 화면의 사진과 글은 그대로 둔다.

const CONFIG = readRepoFile('js/firebase-config.js');
const CORE = readRepoFile('js/app-core.js');
const ASSERTION = new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)');

function load({ removable = true } = {}) {
    const start = CONFIG.indexOf('const FIRESTORE_REBUILD_LIMIT');
    const end = CONFIG.indexOf('function bindFirestoreInternalErrorGuard');
    expect(start).toBeGreaterThan(-1);
    // probe: 'ok' | 'denied' | 'assert' | 'hang' — 지금 인스턴스에 물었을 때의 대답
    const state = { now: 1_000_000, created: 0, terminated: [], banners: 0, brokenEvents: 0, probes: 0, probe: 'ok' };
    const original = { id: 'original' };
    const api = new Function(
        'state', 'original', 'removable', 'window', 'console', 'navigator',
        `let db = original;
        let _firestoreSdkBroken = false;
        let _firestoreReconnectProbeFailures = 2;
        const FIRESTORE_RECONNECT_PROBE_TIMEOUT_MS = 5000;
        const Date = { now: () => state.now };
        const CustomEvent = function (type) { this.type = type; };
        function createFirestore() {
            if (!removable) return db;
            state.created += 1;
            return { id: 'fresh-' + state.created };
        }
        function terminate(instance) { state.terminated.push(instance.id); return Promise.reject(new Error('queue failed')); }
        function doc(instance, ...path) { return { instance, path }; }
        function getDocFromServer() {
            state.probes += 1;
            if (state.probe === 'ok') return Promise.resolve({ exists: () => false });
            if (state.probe === 'denied') return Promise.reject(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
            if (state.probe === 'assert') return Promise.reject(new Error('FIRESTORE (12.19.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815)'));
            return new Promise(() => {});
        }
        function delay(ms) { return state.probe === 'hang' ? Promise.resolve() : new Promise(() => {}); }
        function isKnownFirestoreWatchAssertion(e) { return String(e?.message || e || '').includes('INTERNAL ASSERTION FAILED: Unexpected state'); }
        function isRetryableFirestoreConnectivityError(e) { return ['unavailable', 'deadline-exceeded'].includes(e?.code); }
        function normalizeFirestoreReconnectErrorMessage(e) { return String(e?.message || e || ''); }
        function reportFirstFirestoreInternalAssertion() {}
        function showFirestoreBrokenBanner() { state.banners += 1; }
        ${CONFIG.slice(start, end)}
        return {
            mark: markFirestoreSdkBroken,
            settle: async () => { for (let i = 0; i < 5; i += 1) await Promise.resolve(); await (_firestoreHealthCheckPromise || Promise.resolve()); },
            db: () => db,
            broken: () => _firestoreSdkBroken,
            probeFailures: () => _firestoreReconnectProbeFailures
        };`
    )(state, original, removable, { dispatchEvent: () => { state.brokenEvents += 1; } }, { warn() {}, info() {} }, { onLine: true });
    return { api, state };
}

async function markAndSettle(api) {
    api.mark('error', ASSERTION);
    await api.settle();
}

describe('a broken Firestore SDK is swapped for a new one in place', () => {
    it('replaces the instance on the first failure without asking, a banner or a reload signal', async () => {
        const { api, state } = load();
        await markAndSettle(api);
        expect(state.terminated).toEqual(['original']);
        expect(api.db().id).toBe('fresh-1');
        expect(state.probes).toBe(0);
        expect(api.broken()).toBe(false);
        expect(state.banners).toBe(0);
        expect(state.brokenEvents).toBe(0);
        expect(api.probeFailures()).toBe(0);
    });

    // 2026-10-13 스테이징: 옛 인스턴스가 4분 넘게 같은 오류를 냈고, 그걸 세어 단추가 떴다.
    it('keeps the new instance while the old one goes on failing for minutes', async () => {
        const { api, state } = load();
        await markAndSettle(api);
        for (let i = 0; i < 12; i += 1) {
            state.now += 25_000;
            await markAndSettle(api);
        }
        expect(state.created).toBe(1);
        expect(api.db().id).toBe('fresh-1');
        expect(api.broken()).toBe(false);
        expect(state.banners).toBe(0);
        // 매번 묻지 않는다 — 살아 있다고 확인하면 1분은 믿는다.
        expect(state.probes).toBeLessThanOrEqual(6);
    });

    it('counts a refusal from the server as an answer', async () => {
        const { api, state } = load();
        await markAndSettle(api);
        state.probe = 'denied';
        state.now += 25_000;
        await markAndSettle(api);
        expect(state.created).toBe(1);
        expect(state.banners).toBe(0);
    });

    it('swaps again when the new instance fails the same way', async () => {
        const { api, state } = load();
        await markAndSettle(api);
        state.probe = 'assert';
        state.now += 25_000;
        await markAndSettle(api);
        expect(api.db().id).toBe('fresh-2');
    });

    it('swaps again when the new instance does not answer', async () => {
        const { api, state } = load();
        await markAndSettle(api);
        state.probe = 'hang';
        state.now += 25_000;
        await markAndSettle(api);
        expect(api.db().id).toBe('fresh-2');
    });

    it('swaps at most three times in ten minutes, then falls back to the reload banner', async () => {
        const { api, state } = load();
        state.probe = 'assert';
        for (let i = 0; i < 3; i += 1) {
            await markAndSettle(api);
            state.now += 60_000;
        }
        expect(api.db().id).toBe('fresh-3');
        await markAndSettle(api);
        expect(state.created).toBe(3);
        expect(api.broken()).toBe(true);
        expect(state.banners).toBe(1);
        expect(state.brokenEvents).toBe(1);
    });

    it('shows the banner when the old instance could not be detached', async () => {
        const { api, state } = load({ removable: false });
        await markAndSettle(api);
        expect(api.db().id).toBe('original');
        expect(api.broken()).toBe(true);
        expect(state.banners).toBe(1);
    });
});

describe('everything else follows the swapped instance', () => {
    it('exports db as a live binding that can be reassigned', () => {
        expect(CONFIG).toContain('let db = createFirestore();');
        expect(CONFIG).toContain('export { app, auth, db, storage, functions };');
        expect(CONFIG).not.toMatch(/const db\s*=/);
    });

    it('never captures db into a long-lived reference or a realtime listener', () => {
        for (const file of ['js/app-core.js', 'js/auth.js', 'js/bug-report.js', 'js/blockchain-manager.js', 'js/reward-market.js']) {
            const src = readRepoFile(file);
            expect(src, file).not.toMatch(/onSnapshot\(/);
            expect(src, file).not.toMatch(/^(const|let|var) [^=]+=\s*db\b/m);
            expect(src, file).not.toMatch(/^(const|let|var) .*\b(doc|collection|query)\(db/m);
        }
    });

    it('hands the failed error to the reconnect so the save retry uses a new instance', () => {
        expect(CONFIG).toContain('if (isKnownFirestoreWatchAssertion(error)) markFirestoreSdkBroken(reason, error);');
        expect(CORE).toContain("await forceFirestoreReconnect('daily-log-primary-save', e)");
        expect(CORE).toContain("await forceFirestoreReconnect('bug-report-retry', error)");
        expect(CORE).toContain("await forceFirestoreReconnect('report-30day-retry', error)");
        // 재시도는 부를 때마다 db 를 다시 읽는다.
        expect(CORE).toContain('setDoc(doc(db, "daily_logs", docId), getClientWritableDailyLogData(saveData), { merge: true })');
    });
});
