import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-30 제보: 수면 탭에서 Firestore 10.8.0 이 "INTERNAL ASSERTION FAILED:
// Unexpected state" 로 무너진 뒤, 30일 결과지의 "다시 시도" 가 몇 번을 눌러도 같은
// 오류였다. 그 페이지에서는 새로 여는 것만 통한다 — 그렇게 말해야 한다.

const CONFIG = readRepoFile('js/firebase-config.js');
const CORE = readRepoFile('js/app-core.js');

describe('a page whose Firestore SDK broke', () => {
    it('remembers it and asks to reload, from both uncaught and caught errors', () => {
        expect(CONFIG).toContain('export function isFirestoreSdkBroken()');
        expect(CONFIG).toContain("markFirestoreSdkBroken('unhandledrejection', event.reason)");
        expect(CONFIG).toContain("markFirestoreSdkBroken('error', event.error || event.message)");
        expect(CONFIG).toContain("if (isKnownFirestoreWatchAssertion(error)) markFirestoreSdkBroken(context || 'caught', error);");
        expect(CONFIG).toContain("button.addEventListener('click', () => window.location.reload());");
    });

    it('does not reload by itself, so unsaved input survives', () => {
        const fn = CONFIG.slice(CONFIG.indexOf('function markFirestoreSdkBroken'), CONFIG.indexOf('function bindFirestoreInternalErrorGuard'));
        expect(fn).not.toContain('location.reload');
    });

    it('turns the 30-day report retry and the record reload into a page reload', () => {
        const report = CORE.slice(CORE.indexOf("console.error('30일 결과지 오류:', e);"));
        expect(report.slice(0, 900)).toContain('if (isFirestoreSdkBroken() || isFirestoreInternalStateError(e))');
        expect(report.slice(0, 1600)).toContain('onclick="location.reload()">새로고침</button>');
        const retry = CORE.slice(CORE.indexOf('function retryDailyLogLoad()'));
        expect(retry.slice(0, 300)).toContain('if (isFirestoreSdkBroken())');
    });
});
