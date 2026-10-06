import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const fnSource = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return APP.slice(start, APP.indexOf('\n}\n', start) + 2);
};

// 2026-10-04·05 제보: SDK 내부 오류(ca9 → b815, firebase-js-sdk #10310 열림)로 화면이
// 아무것도 못 읽었다. 저장 안 한 것이 없으면 바로 새로 연다.
function load({ analyses = 0, uploading = false, draft = false, exerciseResult = false, active = null } = {}) {
    return new Function(
        '_runningAiAnalyses', 'hasUploadsInFlight', 'hasAnyLocalDailyLogMediaDraft',
        'hasUnsavedExerciseAnalysisOnScreen', 'document',
        `const FIRESTORE_BROKEN_RELOAD_GAP_MS = 10 * 60 * 1000;
        ${fnSource('hasUnsavedWorkOnScreen')}
        ${fnSource('shouldReloadAfterFirestoreBroke')}
        return shouldReloadAfterFirestoreBroke;`
    )(
        { size: analyses },
        () => uploading,
        () => draft,
        () => exerciseResult,
        { activeElement: active }
    );
}

describe('a page whose Firestore SDK broke reopens itself when nothing would be lost', () => {
    it('reloads a page with nothing unsaved', () => {
        expect(load()(Date.now(), 0)).toBe(true);
    });

    it('keeps the page when photos are picked, uploading or being analyzed', () => {
        expect(load({ draft: true })(Date.now(), 0)).toBe(false);
        expect(load({ uploading: true })(Date.now(), 0)).toBe(false);
        expect(load({ analyses: 1 })(Date.now(), 0)).toBe(false);
        expect(load({ exerciseResult: true })(Date.now(), 0)).toBe(false);
    });

    it('keeps the page while someone is typing', () => {
        expect(load({ active: { tagName: 'TEXTAREA', value: '오늘 감사한 일' } })(Date.now(), 0)).toBe(false);
        expect(load({ active: { tagName: 'TEXTAREA', value: '' } })(Date.now(), 0)).toBe(true);
    });

    it('does not reload again within ten minutes, so it cannot loop', () => {
        const now = Date.now();
        expect(load()(now, now - 60 * 1000)).toBe(false);
        expect(load()(now, now - 11 * 60 * 1000)).toBe(true);
    });

    it('listens for the broken signal the SDK guard sends', () => {
        expect(APP).toContain("window.addEventListener('habitschool:firestore-broken', reloadIfFirestoreBrokeAndSafe);");
        expect(APP).toContain('try { if (isFirestoreSdkBroken()) reloadIfFirestoreBrokeAndSafe(); } catch (_)');
        expect(readFileSync(resolve(ROOT_DIR, 'js/firebase-config.js'), 'utf8'))
            .toContain("window.dispatchEvent(new CustomEvent('habitschool:firestore-broken'))");
    });
});
