import { describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 2026-10-20 대표: 공유로 들어올 때, 그리고 평소 앱을 열 때 로그인했던 회원도 로그인
// 화면을 거친다. 로그인 화면은 "모르면 보여 주는" 기본값이고, Firebase 가 저장된
// 로그인을 확인하는 2~3초(휴대폰 측정) 동안 보였다. 이 기기에서 로그인했던 표시가
// 있으면 그동안 로그인 화면을 숨긴다. 표시는 화면만 정한다.

const HTML = readRepoFile('index.html');
const AUTH = readRepoFile('js/auth.js');
const APP = readAppSource();
const HINT_KEY = 'habitschool-signed-in-hint-v1';
const DAY = 24 * 60 * 60 * 1000;

const headScript = HTML.split('</head>')[0]
    .split('<script>')
    .map((chunk) => chunk.split('</script>')[0])
    // 플레이 앱 첫 화면 언어 스크립트(E1)도 이 키를 읽는다. 로그인 화면을 숨기는 쪽을 고른다.
    .find((chunk) => chunk.includes(HINT_KEY) && chunk.includes("'auth-restoring'"));

function runHeadScript({ hint, search = '', english = false }) {
    const classes = new Set(english ? ['locale-en'] : ['locale-ko']);
    const timers = [];
    const context = {
        document: {
            documentElement: {
                classList: {
                    add: (...names) => names.forEach((n) => classes.add(n)),
                    remove: (...names) => names.forEach((n) => classes.delete(n)),
                    contains: (n) => classes.has(n)
                }
            }
        },
        localStorage: { getItem: (key) => (key === HINT_KEY && hint !== undefined ? JSON.stringify(hint) : null) },
        location: { search },
        URLSearchParams,
        Date,
        JSON,
        Number,
        console: { warn: vi.fn() },
        setTimeout: (fn, ms) => timers.push({ fn, ms })
    };
    vm.runInNewContext(headScript, context);
    return { classes, timers, console: context.console };
}

describe('첫 화면 전에 정한다 (index.html head)', () => {
    it('head 안, body 보다 먼저 있다', () => {
        expect(headScript).toBeTruthy();
    });

    it('표시가 있으면 로그인 화면을 숨긴다', () => {
        const { classes } = runHeadScript({ hint: { at: Date.now() - DAY } });
        expect(classes.has('auth-restoring')).toBe(true);
        expect(HTML).toMatch(/html\.auth-restoring #login-modal \{\s*display: none !important;/);
    });

    it('표시가 없거나 60일이 넘었으면 지금처럼 로그인 화면', () => {
        expect(runHeadScript({}).classes.has('auth-restoring')).toBe(false);
        expect(runHeadScript({ hint: { at: Date.now() - 61 * DAY } }).classes.has('auth-restoring')).toBe(false);
        expect(runHeadScript({ hint: { nope: 1 } }).classes.has('auth-restoring')).toBe(false);
    });

    it('영어 앱은 건드리지 않는다 (auth-pending 이 따로 숨긴다)', () => {
        expect(runHeadScript({ hint: { at: Date.now() }, english: true }).classes.has('auth-restoring')).toBe(false);
    });

    it('공유로 들어왔으면 "가져오는 중" 을 같이 켠다', () => {
        const { classes } = runHeadScript({ hint: { at: Date.now() }, search: '?tab=diet&focus=shared-upload&sharedUploads=ab' });
        expect(classes.has('shared-import-waiting')).toBe(true);
        expect(runHeadScript({ hint: { at: Date.now() }, search: '?tab=diet' }).classes.has('shared-import-waiting')).toBe(false);
    });

    it('12초 안에 판정이 안 오면 지금처럼 로그인 화면으로 돌아가고 남긴다', () => {
        const run = runHeadScript({ hint: { at: Date.now() }, search: '?focus=shared-upload' });
        const fallback = run.timers.find((t) => t.ms === 12000);
        expect(fallback).toBeTruthy();
        fallback.fn();
        expect(run.classes.has('auth-restoring')).toBe(false);
        expect(run.classes.has('shared-import-waiting')).toBe(false);
        expect(run.console.warn).toHaveBeenCalled();
    });
});

describe('판정이 나면 auth.js 가 정리한다', () => {
    const body = (start) => AUTH.split(start)[1].split('\n}\n')[0];

    it('같은 이름의 표시를 쓴다', () => {
        expect(AUTH).toContain(`const SIGNED_IN_HINT_STORAGE_KEY = '${HINT_KEY}';`);
    });

    it('로그인되면 표시를 남기고 숨김을 뗀다', () => {
        const shell = body('function applySignedInShellUi(user) {');
        expect(shell).toContain('rememberSignedInHint();');
        expect(shell).toContain('endAuthRestoringShell();');
    });

    it('로그아웃이면 맨 먼저 표시를 지우고 숨김을 뗀다 — 다음 사람에게는 로그인 화면', () => {
        const signedOut = body('function handleSignedOutAuthState(callbacks) {');
        expect(signedOut.indexOf('forgetSignedInHint();')).toBeGreaterThan(-1);
        expect(signedOut.indexOf('forgetSignedInHint();')).toBeLessThan(signedOut.indexOf('readPendingGoogleLoginState()'));
        expect(signedOut).toContain('endAuthRestoringShell({ signedOut: true });');
        expect(body('function endAuthRestoringShell(')).toContain("root.classList.remove('shared-import-waiting')");
    });

    it('표시 쓰기 실패를 삼키지 않는다', () => {
        expect(body('function rememberSignedInHint() {')).toContain('console.warn(');
        expect(body('function forgetSignedInHint() {')).toContain('console.warn(');
    });
});

describe('공유 처리', () => {
    const flow = APP.split('async function handleSharedUploadDeepLink(')[1].split('\n}\n')[0];

    it('사진 받기를 오늘 기록 읽기와 동시에 시작한다', () => {
        expect(flow.indexOf('claimSharedUploadFiles(uploadIds)')).toBeLessThan(flow.indexOf('await loadDataForSelectedDate('));
        expect(flow.indexOf('await claimPromise')).toBeGreaterThan(flow.indexOf('await loadDataForSelectedDate('));
    });

    it('"가져오는 중" 은 시트·동의 창이 뜨기 전에, 그리고 끝나면 반드시 끈다', () => {
        const off = flow.indexOf('setSharedImportWaiting(false);');
        expect(flow.indexOf('setSharedImportWaiting(true);')).toBeGreaterThan(-1);
        expect(off).toBeGreaterThan(-1);
        expect(off).toBeLessThan(flow.indexOf('importSharedBodyCompositionCsv('));
        expect(off).toBeLessThan(flow.indexOf('ensureBodyCompositionConsent()'));
        expect(off).toBeLessThan(flow.indexOf('openSharedImportSheetFlow('));
        expect(flow.split('.finally(() => {')[1]).toContain('setSharedImportWaiting(false);');
    });

    it('안내 칸이 화면에 있다', () => {
        expect(HTML).toContain('id="shared-import-pending"');
        expect(HTML).toMatch(/html\.shared-import-waiting #shared-import-pending \{\s*display: flex;/);
    });
});
