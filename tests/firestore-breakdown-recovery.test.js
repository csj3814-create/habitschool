import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const require = createRequire(import.meta.url);
const { _test } = require('../functions/bug-report-fallback.js');

const APP = read('js/app-core.js');
const AUTH = read('js/auth.js');
const BUG = read('js/bug-report.js');
const CONFIG = read('js/firebase-config.js');
const INDEX = read('functions/index.js');

// 2026-09-24: Fitdays 공유로 체성분을 채우고 저장을 누르니 "프로필 저장 실패:
// FIRESTORE (10.8.0) INTERNAL ASSERTION FAILED: Unexpected state". 그 뒤 오류 제보도
// 같은 오류로 막혔다. SDK 큐가 한 번 깨지면 그 페이지의 쓰기는 전부 막힌다.
describe('제보는 Firestore 가 무너져도 서버로 간다', () => {
    const { sanitizeFallbackReport } = _test;
    const who = { uid: 'u1', email: 'a@b.c', name: '회원', bucket: 'bkt' };

    it('앱이 Firestore 로 못 보내면 서버 함수로 보낸다', () => {
        const fn = BUG.split('export async function submitBugReport(')[1].split('\n}\n')[0];
        expect(fn).toContain("httpsCallable(functions, 'submitBugReportFallback')");
        // 스크린샷은 다시 올리지 않는다 — 이미 올라간 주소를 그대로 싣는다.
        expect(fn.indexOf('uploadScreenshot(')).toBeLessThan(fn.indexOf('submitBugReportFallback'));
        expect(INDEX).toContain('submitBugReportFallback,');
    });

    it('로그인한 본인 이름으로만 적는다', () => {
        const r = sanitizeFallbackReport({ message: '저장이 안 돼요', uid: 'someone-else' }, who);
        expect(r.uid).toBe('u1');
        expect(r.status).toBe('open');
        expect(r.via).toBe('server-fallback');
    });

    it('너무 짧은 글은 받지 않는다', () => {
        expect(sanitizeFallbackReport({ message: '앗' }, who)).toBeNull();
    });

    it('스크린샷은 본인 폴더의 주소만 싣는다', () => {
        const own = 'https://firebasestorage.googleapis.com/v0/b/bkt/o/bug_reports%2Fu1%2Fshot.jpg?alt=media';
        const other = 'https://firebasestorage.googleapis.com/v0/b/bkt/o/bug_reports%2Fu2%2Fshot.jpg?alt=media';
        expect(sanitizeFallbackReport({ message: '저장이 안 돼요', screenshotUrl: own }, who).screenshotUrl).toBe(own);
        expect(sanitizeFallbackReport({ message: '저장이 안 돼요', screenshotUrl: other }, who).screenshotUrl).toBeNull();
        expect(sanitizeFallbackReport({ message: '저장이 안 돼요', screenshotUrl: 'https://evil.example/x' }, who).screenshotUrl).toBeNull();
    });

    it('콘솔 기록은 최근 50건, 한 줄 1000자까지', () => {
        const entries = Array.from({ length: 80 }, (_, i) => ({ level: 'error', text: 'x'.repeat(3000), at: String(i) }));
        const r = sanitizeFallbackReport({ message: '저장이 안 돼요', consoleEntries: entries }, who);
        expect(r.consoleEntries).toHaveLength(50);
        expect(r.consoleEntries.at(-1).at).toBe('79');
        expect(r.consoleEntries[0].text).toHaveLength(1000);
    });
});

describe('저장하다 무너지면 입력한 값을 지켜 다시 저장한다', () => {
    const save = APP.split('window.saveHealthProfile = async function () {')[1].split('\n};\n')[0];

    it('그 오류일 때만 적어 두고 새로 연다', () => {
        expect(save).toContain('if (isFirestoreInternalStateError(e) && stashHealthProfileDraftForReload(user.uid))');
        expect(save).toContain('window.location.reload()');
    });

    it('성공하면 적어 둔 것을 지운다', () => {
        expect(save.indexOf('clearHealthProfileDraft();')).toBeLessThan(save.indexOf('describeScoreRefresh(before, after)'));
    });

    it('새로 연 뒤 한 번만 다시 저장한다 — 두 번째 실패에 또 새로고침하지 않는다', () => {
        const stash = APP.split('function stashHealthProfileDraftForReload(uid) {')[1].split('\n}\n')[0];
        expect(stash).toContain('if (previous?.retried) return false;');
        const restore = APP.split('window.restorePendingHealthProfileDraft = function (uid) {')[1].split('\n};')[0];
        expect(restore).toContain('retried: true');
        expect(restore.indexOf('retried: true')).toBeLessThan(restore.indexOf('window.saveHealthProfile?.()'));
        // 다른 계정의 값이나 오래된 값은 채우지 않는다.
        expect(restore).toContain('draft.uid !== uid');
        expect(restore).toContain('HEALTH_PROFILE_DRAFT_TTL_MS');
    });

    it('공유로 받은 출처·측정일도 함께 지킨다', () => {
        expect(APP).toContain('extras: _pendingBodyCompositionExtras || null');
        const restore = APP.split('window.restorePendingHealthProfileDraft = function (uid) {')[1].split('\n};')[0];
        expect(restore).toContain('_pendingBodyCompositionExtras = draft.extras || null;');
    });

    it('로그인 뒤 저장된 값을 채운 다음에 되살린다', () => {
        const at = AUTH.indexOf('window.restorePendingHealthProfileDraft?.(user.uid);');
        expect(at).toBeGreaterThan(AUTH.indexOf("if (el('prof-hdl')) el('prof-hdl').value = prof.hdl || '';"));
    });
});

describe('무너진 순간을 운영에서도 한 번은 남긴다', () => {
    it('제보의 콘솔 기록에 실리도록 경고로 남긴다', () => {
        const fn = CONFIG.split('function reportFirstFirestoreInternalAssertion(')[1].split('\n}\n')[0];
        expect(fn).toContain('console.warn(');
        expect(fn).not.toContain('IS_PROD_ENV');
        expect(CONFIG).toContain("reportFirstFirestoreInternalAssertion('unhandledrejection', event.reason);");
    });
});
