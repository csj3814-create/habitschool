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
    const state = { now: 1_000_000, created: 0, terminated: [], banners: 0, brokenEvents: 0 };
    const original = { id: 'original' };
    const api = new Function(
        'state', 'original', 'removable', 'window', 'console',
        `let db = original;
        let _firestoreSdkBroken = false;
        let _firestoreReconnectProbeFailures = 2;
        const Date = { now: () => state.now };
        const CustomEvent = function (type) { this.type = type; };
        function createFirestore() {
            if (!removable) return db;
            state.created += 1;
            return { id: 'fresh-' + state.created };
        }
        function terminate(instance) { state.terminated.push(instance.id); return Promise.reject(new Error('queue failed')); }
        function normalizeFirestoreReconnectErrorMessage(e) { return String(e?.message || e || ''); }
        function reportFirstFirestoreInternalAssertion() {}
        function showFirestoreBrokenBanner() { state.banners += 1; }
        ${CONFIG.slice(start, end)}
        return {
            mark: markFirestoreSdkBroken,
            db: () => db,
            broken: () => _firestoreSdkBroken,
            probeFailures: () => _firestoreReconnectProbeFailures
        };`
    )(state, original, removable, { dispatchEvent: () => { state.brokenEvents += 1; } }, { warn() {} });
    return { api, state };
}

describe('a broken Firestore SDK is swapped for a new one in place', () => {
    it('replaces the instance without a banner or a reload signal', () => {
        const { api, state } = load();
        api.mark('unhandledrejection', ASSERTION);
        expect(state.terminated).toEqual(['original']);
        expect(api.db().id).toBe('fresh-1');
        expect(api.broken()).toBe(false);
        expect(state.banners).toBe(0);
        expect(state.brokenEvents).toBe(0);
        expect(api.probeFailures()).toBe(0);
    });

    it('ignores late failures from the old instance right after the swap', () => {
        const { api, state } = load();
        api.mark('unhandledrejection', ASSERTION);
        state.now += 3_000;
        api.mark('caught', ASSERTION);
        expect(api.db().id).toBe('fresh-1');
        expect(state.created).toBe(1);
    });

    it('swaps at most three times in ten minutes, then falls back to the reload banner', () => {
        const { api, state } = load();
        for (let i = 0; i < 3; i += 1) {
            api.mark('error', ASSERTION);
            state.now += 60_000;
        }
        expect(api.db().id).toBe('fresh-3');
        api.mark('error', ASSERTION);
        expect(state.created).toBe(3);
        expect(api.broken()).toBe(true);
        expect(state.banners).toBe(1);
        expect(state.brokenEvents).toBe(1);
    });

    it('swaps again once the ten minutes have passed', () => {
        const { api, state } = load();
        for (let i = 0; i < 3; i += 1) {
            api.mark('error', ASSERTION);
            state.now += 60_000;
        }
        state.now += 10 * 60 * 1000;
        api.mark('error', ASSERTION);
        expect(api.db().id).toBe('fresh-4');
        expect(api.broken()).toBe(false);
    });

    it('shows the banner when the old instance could not be detached', () => {
        const { api, state } = load({ removable: false });
        api.mark('error', ASSERTION);
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
