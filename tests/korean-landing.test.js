import { describe, expect, it } from 'vitest';
import { getRouteContext } from '../js/app-mode.js';
import { readAppSource, readRepoFile } from './source-helpers.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = readRepoFile('index.html');
const CSS = readRepoFile('styles-base.css');
const APP = readAppSource();
const FIREBASE = JSON.parse(readRepoFile('firebase.json'));
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function koreanLandingPage() {
    const at = HTML.indexOf('id="korean-public-page"');
    expect(at).toBeGreaterThan(-1);
    return HTML.slice(at, HTML.indexOf('<footer class="ko-public-footer">', at));
}

// 실제 사용자는 전부 한국어인데 소개 페이지는 영어에만 있었다. 유튜브에서 온 사람이
// 곧바로 로그인 화면을 만났고, 그 화면은 무엇을 얻는지 말하지 않는다.
describe('Korean landing page', () => {
    it('is served at /welcome', () => {
        const rewrites = FIREBASE.hosting?.[0]?.rewrites || FIREBASE.hosting?.rewrites || [];
        const match = rewrites.find((r) => r.source === '/welcome');
        expect(match, '/welcome rewrite missing').toBeTruthy();
        expect(match.destination).toBe('/index.html');
    });

    it('is decided before first paint, like the English one', () => {
        // 모듈 로드 뒤로 밀면 로그인 화면이 잠깐 비쳤다가 바뀌어 깜빡인다.
        const headScript = HTML.slice(0, HTML.indexOf('</head>'));
        expect(headScript).toContain("normalizedPath === '/welcome'");
        expect(headScript).toContain("classList.add('ko-landing')");
    });

    it('does not rely on the hidden attribute nothing removes', () => {
        // 영어 랜딩은 auth.js 가 hidden 을 벗겨 준다. 한국어에는 그 경로가 없어서
        // 속성을 붙여 두면 CSS 가 켜도 화면에 나오지 않는다.
        const at = HTML.indexOf('id="korean-public-page"');
        const tag = HTML.slice(at, HTML.indexOf('>', at) + 1);
        expect(tag).not.toContain('hidden');
    });

    it('hides the app shell while the landing shows', () => {
        expect(CSS).toContain('html.ko-landing .ko-public-page');
        expect(CSS).toMatch(/html\.ko-landing[^{]*#login-modal/);
        expect(CSS).toContain('html:not(.ko-landing) .ko-public-page');
    });

    // 2026-11-02 대표: "내용이 아주 AI 티가 많이 나고 가입하고 싶은 느낌이 전혀 들지 않아".
    // 글은 marketing/WRITING_VOICE.md 대로 교수님이 영상에서 실제로 한 말을 재료로 다시 썼다.
    it("opens in the founder's own words, without rewards in the hero", () => {
        const page = koreanLandingPage().replace(/<!--[\s\S]*?-->/g, '');
        const hero = page.slice(0, page.indexOf('ko-story'));
        expect(hero).toContain('혼자 하면 잘 안 되더라고요.');
        expect(hero).toContain('응급의학과 전문의 최석재');
        // 포인트·쿠폰을 앞세우지 않는다. 보상으로 온 사람은 보상이 끊기면 떠난다(2026-08-31).
        expect(hero).not.toContain('포인트');
        expect(hero).not.toContain('쿠폰');
    });

    it('quotes the video it took the story from', () => {
        const page = koreanLandingPage();
        expect(page).toContain('class="ko-story-quote"');
        expect(page).toContain('https://www.youtube.com/watch?v=YBVmArT3y2c');
        expect(page).toContain('황성수 힐링스쿨');
    });

    it('speaks like the videos: no "~습니다" outside the disclaimer', () => {
        const text = koreanLandingPage()
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<p class="ko-disclaimer">[\s\S]*?<\/p>/, '')
            .replace(/<[^>]+>/g, ' ');
        expect(text).not.toMatch(/니다[.!]/);
    });

    it('shows the real app with images that exist and describe themselves', () => {
        const page = koreanLandingPage();
        const images = [...page.matchAll(/<img src="(img\/welcome\/[^"]+)"[^>]*>/g)];
        expect(images.length).toBeGreaterThanOrEqual(3);
        images.forEach(([tag, src]) => {
            expect(existsSync(resolve(ROOT, src)), src).toBe(true);
            expect(tag).toMatch(/alt="[^"]{10,}"/);
            expect(tag).toMatch(/width="\d+" height="\d+"/);
        });
    });

    it('still names what the app does beyond the daily log', () => {
        const page = koreanLandingPage();
        ['건강검진 결과지', '대사건강 점수', '자연식품인지 초가공식품인지']
            .forEach((h) => expect(page).toContain(h));
    });

    it('keeps the medical disclaimer on the page that makes the claim', () => {
        const page = koreanLandingPage();
        expect(page).toContain('의학적 진단이나 치료를');
    });

    it('honours the "look around first" link instead of dropping people at a login', () => {
        const page = koreanLandingPage();
        expect(page).toContain('/?guest=1');
        expect(APP).toContain('startGuestDemoFromQuery');
        const fn = APP.slice(APP.indexOf('startGuestDemoFromQuery'), APP.indexOf('startGuestDemoFromQuery') + 700);
        expect(fn).toContain("params.get('guest') !== '1'");
        // 이미 로그인한 사람에게 데모를 씌우지 않는다.
        expect(fn).toContain('auth.currentUser');
    });

    it('does not disturb the existing routes', () => {
        expect(getRouteContext('/').locale).toBe('ko');
        expect(getRouteContext('/app').isPlay).toBe(true);
        expect(getRouteContext('/en').isEnglish).toBe(true);
        expect(getRouteContext('/welcome').isKoreanLanding).toBe(true);
        expect(getRouteContext('/').isKoreanLanding).toBe(false);
    });
});

// 2026-11-03 설계(tasks/2026-11-03_입구_합치기_설계.md). 골든타임 영상 링크는 `/` 그대로다(대표: 주소 뒤에 뭘 붙이면
// 피싱 걱정을 만든다). 그 링크로 처음 온 사람은 로그인 화면이 아니라 소개 페이지를 본다.
import vm from 'node:vm';

const ENTRY_SCRIPT = HTML.split('</head>')[0]
    .split('<script>')
    .map((chunk) => chunk.split('</script>')[0])
    .find((chunk) => chunk.includes("classList.add('ko-landing')"));

function entry({ path = '/', search = '', hint = null, playSticky = false, referrer = '' } = {}) {
    const classes = new Set();
    const local = { 'habitschool-signed-in-hint-v1': hint ? JSON.stringify(hint) : null };
    const session = { hs_play_context: playSticky ? '1' : null };
    vm.runInNewContext(ENTRY_SCRIPT, {
        document: {
            documentElement: { classList: { add: (...n) => n.forEach((c) => classes.add(c)), contains: (c) => classes.has(c) }, lang: '' },
            referrer,
        },
        location: { pathname: path, search, hostname: 'habitschool.web.app', replace: () => {}, href: '' },
        localStorage: { getItem: (k) => local[k] ?? null, setItem: () => {} },
        sessionStorage: { getItem: (k) => session[k] ?? null, setItem: () => {} },
        window: {},
        navigator: { languages: ['ko-KR'], language: 'ko-KR' },
        history: { replaceState: () => {} },
        URLSearchParams,
        Date,
        JSON,
        Number,
    });
    return classes.has('ko-landing');
}

describe('first-time visitors at / see the landing page (the YouTube link)', () => {
    it('shows it to someone who never signed in on this device and came with a bare link', () => {
        expect(entry()).toBe(true);
        expect(entry({ path: '/index.html' })).toBe(true);
        // 광고·SNS 가 붙이는 추적 꼬리는 처음 온 사람이다.
        expect(entry({ search: '?utm_source=youtube&utm_medium=video' })).toBe(true);
        expect(entry({ search: '?fbclid=abc' })).toBe(true);
    });

    it('keeps the login screen for someone who signed in here before', () => {
        expect(entry({ hint: { at: Date.now() - 1000 } })).toBe(false);
    });

    it('keeps the login screen when the link says what they came for', () => {
        ['?ref=ABC123', '?focus=shared-upload', '?tab=diet', '?guest=1', '?start=1',
            '?utm_source=email&utm_medium=email', '?utm_medium=push']
            .forEach((search) => expect(entry({ search }), search).toBe(false));
    });

    it('stays out of the Play app and the English app', () => {
        expect(entry({ path: '/app' })).toBe(false);
        expect(entry({ playSticky: true })).toBe(false);
        expect(entry({ referrer: 'android-app://com.habitschool.app' })).toBe(false);
        expect(entry({ path: '/en' })).toBe(false);
    });

    it('still shows /welcome to everyone, as before', () => {
        expect(entry({ path: '/welcome', hint: { at: Date.now() } })).toBe(true);
    });

    it('sends the start and login buttons past the landing page with ?start=1', () => {
        const page = koreanLandingPage();
        const footer = HTML.slice(HTML.indexOf('<footer class="ko-public-footer">'));
        const header = HTML.slice(HTML.indexOf('<section id="korean-public-page"'), HTML.indexOf('<main class="ko-public-main">'));
        expect(page).not.toMatch(/class="ko-cta-primary" href="\/"/);
        expect((page.match(/class="ko-cta-primary" href="\/\?start=1"/g) || []).length).toBe(2);
        expect(header).toContain('<a class="ko-public-login" href="/?start=1">');
        expect(footer.length).toBeGreaterThan(0);
    });

    it('counts how many see it', () => {
        expect(APP).toContain("trackProductEvent('landing_view'");
    });
});

describe('the login screen speaks like the landing page', () => {
    it('opens with the same line', () => {
        const login = HTML.slice(HTML.indexOf('<div id="login-modal"'), HTML.indexOf('<div id="login-modal"') + 3000);
        expect(login).toContain('혼자 하면 잘 안 되더라고요.<br>그래서 좋은 습관 같이 하는 앱을 만들었어요.');
        expect(login).not.toContain('병원과 의사는 큰 위기만 막을 뿐');
    });
});

describe('someone already signed in is never stuck on the landing page at /', () => {
    it('steps the landing aside once sign-in is confirmed, except at /welcome', () => {
        const auth = readRepoFile('js/auth.js');
        const fn = auth.split('function applySignedInShellUi(user) {')[1].split('\n}\n')[0];
        expect(fn).toContain("!== '/welcome'");
        expect(fn).toContain("document.documentElement.classList.remove('ko-landing');");
    });
});
