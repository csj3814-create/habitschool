import { describe, expect, it } from 'vitest';
import { getRouteContext } from '../js/app-mode.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

const HTML = readRepoFile('index.html');
const CSS = readRepoFile('styles-base.css');
const APP = readAppSource();
const FIREBASE = JSON.parse(readRepoFile('firebase.json'));

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

    it('leads with what the visitor already has, not with the app', () => {
        const at = HTML.indexOf('id="korean-public-page"');
        expect(at).toBeGreaterThan(-1);
        const page = HTML.slice(at, at + 5000);
        expect(page).toContain('건강검진 결과지');
        // 포인트·쿠폰을 앞세우지 않는다. 보상으로 온 사람은 보상이 끊기면 떠난다.
        const hero = page.slice(0, page.indexOf('ko-value'));
        expect(hero).not.toContain('포인트');
        expect(hero).not.toContain('쿠폰');
    });

    it('names the three things it does', () => {
        const at = HTML.indexOf('id="korean-public-page"');
        const page = HTML.slice(at, at + 5000);
        ['혈액검사 결과지 해석', '대사건강 점수', 'AI 식단 분석']
            .forEach((h) => expect(page).toContain(h));
    });

    it('keeps the medical disclaimer on the page that makes the claim', () => {
        const at = HTML.indexOf('id="korean-public-page"');
        const page = HTML.slice(at, at + 5000);
        expect(page).toContain('의학적 진단이나 치료를');
    });

    it('honours the "look around first" link instead of dropping people at a login', () => {
        const at = HTML.indexOf('id="korean-public-page"');
        const page = HTML.slice(at, at + 5000);
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
