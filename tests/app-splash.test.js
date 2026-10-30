import { describe, expect, it } from 'vitest';
import vm from 'node:vm';
import { readRepoFile } from './source-helpers.js';

// 2026-10-30 대표: "앱 열릴 때 내 기록 탭의 식단 운동 마음이 0/30 으로 잠깐 1-2초 보이다가 숫자가
// 채워지거든? 그 잠깐동안 보여줄 해빛스쿨 대문 화면이 필요할 것 같아."
// 그 1~2초는 Firebase 가 저장된 로그인을 확인하는 시간이다(auth-restoring). 그동안 빈 틀 대신
// 로고 대문을 보이고, 내 기록 숫자가 채워지면 걷는다. 로그인했던 표시가 없는 기기는 지금처럼
// 로그인 화면이 바로 나온다.

const INDEX = readRepoFile('index.html');
const AUTH = readRepoFile('js/auth.js');
const APP_CORE = readRepoFile('js/app-core.js');

const HEAD = INDEX.split('<body>')[0];
const SPLASH_SCRIPT = HEAD.split('// ---- 대문 화면 시작 ----')[1]?.split('// ---- 대문 화면 끝 ----')[0] || '';

function runHeadScript({ path = '/app', hint = { at: Date.now() - 1000 }, search = '', dark = false, english = false, extraClasses = [] } = {}) {
    const classes = new Set([...(english ? ['locale-en', 'auth-pending', 'locale-loading'] : ['locale-ko']), ...extraClasses]);
    const root = {
        classList: {
            add: (...names) => names.forEach((n) => classes.add(n)),
            remove: (...names) => names.forEach((n) => classes.delete(n)),
            contains: (n) => classes.has(n),
        },
    };
    const store = {
        'habitschool-signed-in-hint-v1': hint ? JSON.stringify(hint) : null,
        darkMode: dark ? 'on' : null,
    };
    const timers = [];
    const sandbox = {
        window: {},
        document: { documentElement: root },
        localStorage: { getItem: (k) => store[k] ?? null },
        location: { pathname: path, search },
        URLSearchParams,
        Date,
        Number,
        JSON,
        console: { warn: () => {} },
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    };
    vm.runInNewContext(SPLASH_SCRIPT, sandbox);
    return { classes, timers, hide: sandbox.window.__hideAppSplash };
}

describe('대문 화면 — 언제 보이나', () => {
    it('로그인했던 기기는 대문이 보이고 로그인 화면은 숨는다 (한국어)', () => {
        const { classes } = runHeadScript();
        expect(classes.has('app-splash')).toBe(true);
        expect(classes.has('auth-restoring')).toBe(true);
    });

    it('로그인했던 표시가 없거나 60일이 지났으면 대문 없이 로그인 화면 (지금과 같다)', () => {
        expect(runHeadScript({ hint: null }).classes.has('app-splash')).toBe(false);
        expect(runHeadScript({ hint: null }).classes.has('auth-restoring')).toBe(false);
        const old = runHeadScript({ hint: { at: Date.now() - 61 * 24 * 60 * 60 * 1000 } });
        expect(old.classes.has('app-splash')).toBe(false);
        expect(old.classes.has('auth-restoring')).toBe(false);
    });

    it('영어 앱도 대문이 보인다 — 영어는 auth-restoring 대신 auth-pending 이 화면을 숨기던 그대로', () => {
        const { classes } = runHeadScript({ path: '/en', english: true });
        expect(classes.has('app-splash')).toBe(true);
        expect(classes.has('auth-restoring')).toBe(false);
        expect(classes.has('auth-pending')).toBe(true);
    });

    it('공유로 들어오면 대문 대신 지금의 "가져오는 중" 창을 보인다', () => {
        const { classes } = runHeadScript({ search: '?focus=shared-upload' });
        expect(classes.has('shared-import-waiting')).toBe(true);
        expect(classes.has('app-splash')).toBe(false);
    });

    it('소개 페이지(/welcome, /en/welcome)에는 대문을 띄우지 않는다', () => {
        // ko-landing·en-landing 은 앞 스크립트가 먼저 붙인다.
        const ko = runHeadScript({ path: '/welcome', extraClasses: ['ko-landing'] });
        expect(ko.classes.has('app-splash')).toBe(false);
        expect(ko.classes.has('auth-restoring')).toBe(true); // 로그인 화면 숨김은 지금과 같다
        const en = runHeadScript({ path: '/en/welcome', english: true, extraClasses: ['en-landing'] });
        expect(en.classes.has('app-splash')).toBe(false);
    });

    it('다크 모드 회원은 어두운 대문', () => {
        expect(runHeadScript({ dark: true }).classes.has('app-splash-dark')).toBe(true);
        expect(runHeadScript().classes.has('app-splash-dark')).toBe(false);
    });
});

describe('대문 화면 — 언제 걷히나', () => {
    it('걷을 때는 흐려지며 사라지고, 두 번 불러도 한 번만 걷는다', () => {
        const { classes, timers, hide } = runHeadScript();
        hide('dashboard');
        expect(classes.has('app-splash-leaving')).toBe(true);
        hide('signed-in-fallback');
        const removal = timers.filter((t) => t.ms < 1000);
        expect(removal).toHaveLength(1);
        removal[0].fn();
        expect(classes.has('app-splash')).toBe(false);
        expect(classes.has('app-splash-leaving')).toBe(false);
    });

    it('12초 안에 판정이 안 나면 지금처럼 로그인 화면으로 — 대문도 함께 걷는다', () => {
        const { classes, timers } = runHeadScript();
        const cap = timers.find((t) => t.ms === 12000);
        cap.fn();
        expect(classes.has('auth-restoring')).toBe(false);
        expect(classes.has('app-splash-leaving')).toBe(true);
    });

    it('내 기록 숫자를 그린 뒤 걷는다', () => {
        const render = APP_CORE.split('function _renderDashboardWithData(')[1].split('\n}\n')[0];
        const tail = render.split("console.error('대시보드 렌더링 오류:', error);")[1];
        expect(tail).toContain("window.__hideAppSplash?.('dashboard');");
    });

    it('로그아웃 판정·보관 계정 질문에서는 바로 걷고, 로그인됐는데 숫자가 늦으면 잠시 뒤 걷는다', () => {
        const end = AUTH.split('function endAuthRestoringShell(')[1].split('\n}\n')[0];
        expect(end).toContain("window.__hideAppSplash?.('signed-out')");
        const held = AUTH.split('function showHeldAccountPrompt(')[1].split('\n}\n')[0];
        expect(held).toContain("window.__hideAppSplash?.('held-account')");
        const signedIn = AUTH.split('function applySignedInShellUi(')[1].split('\n}\n')[0];
        expect(signedIn).toMatch(/setTimeout\(\(\) => window\.__hideAppSplash\?\.\('signed-in-fallback'\), APP_SPLASH_SIGNED_IN_FALLBACK_MS\)/);
    });
});

describe('대문 화면 — 생김새', () => {
    it('본문 맨 앞에 로고와 이름이 있고, 화면 읽기 프로그램은 건너뛴다', () => {
        const body = INDEX.split('<body>')[1];
        const first = body.trim().split('\n')[0];
        expect(first).toContain('<div id="app-splash" aria-hidden="true">');
        const splash = body.split('<div id="app-splash"')[1].split('</div>')[0];
        expect(splash).toContain('src="icons/app-icon.svg"');
        expect(splash).toContain('data-i18n="app.name"');
        expect(splash).toContain('해빛스쿨');
    });

    it('그라데이션 빛 위로 로고가 나타나고, 움직임 줄이기 설정을 따른다', () => {
        expect(HEAD).toContain('html.app-splash #app-splash');
        expect(HEAD).toContain('radial-gradient');
        expect(HEAD).toContain('@keyframes app-splash-in');
        expect(HEAD).toContain('prefers-reduced-motion');
        // 영어 앱은 확인 동안 body 를 visibility:hidden 으로 숨긴다 — 대문만 보이게 한다.
        expect(HEAD).toMatch(/html\.app-splash #app-splash \{[^}]*visibility: visible/);
    });
});
