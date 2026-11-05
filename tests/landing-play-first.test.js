import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildPlayStoreIntentUrl, PLAY_STORE_INTENT_URL, PLAY_STORE_LISTING_URL } from '../js/play-review.js';
import { buildProductEvent } from '../js/product-events.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 2026-11-05 설계(tasks/2026-11-05_안드로이드_플레이_먼저_설계.md).
const HTML = readRepoFile('index.html');
const CSS = readRepoFile('styles-base.css');
const APP = readAppSource();

const ENTRY_SCRIPT = HTML.split('</head>')[0]
    .split('<script>')
    .map((chunk) => chunk.split('</script>')[0])
    .find((chunk) => chunk.includes("classList.add('ko-android')"));

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36';
const KAKAO = `${ANDROID} KAKAOTALK 25.9.0`;
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0 Safari/537.36';

function classesFor({ userAgent = ANDROID, path = '/', search = '', hint = null, referrer = '' } = {}) {
    const classes = new Set();
    vm.runInNewContext(ENTRY_SCRIPT, {
        document: {
            documentElement: { classList: { add: (...n) => n.forEach((c) => classes.add(c)), contains: (c) => classes.has(c) }, lang: '' },
            referrer,
        },
        location: { pathname: path, search, hostname: 'habitschool.web.app', replace: () => {}, href: '' },
        localStorage: { getItem: (k) => (k === 'habitschool-signed-in-hint-v1' && hint ? JSON.stringify(hint) : null), setItem: () => {} },
        sessionStorage: { getItem: () => null, setItem: () => {} },
        window: {},
        navigator: { languages: ['ko-KR'], language: 'ko-KR', userAgent },
        history: { replaceState: () => {} },
        URLSearchParams,
        Date,
        JSON,
        Number,
    });
    return classes;
}

function isPlayFirst(options) {
    return classesFor(options).has('ko-android');
}

function publicPage() {
    return HTML.slice(HTML.indexOf('<main class="ko-public-main">'), HTML.indexOf('</main>', HTML.indexOf('<main class="ko-public-main">')));
}

describe('안드로이드 소개 페이지는 플레이를 먼저 권한다', () => {
    it('처음 온 안드로이드 방문자에게 적용한다 — 카카오톡 안 브라우저 포함', () => {
        expect(isPlayFirst()).toBe(true);
        expect(isPlayFirst({ userAgent: KAKAO })).toBe(true);
        expect(isPlayFirst({ path: '/welcome' })).toBe(true);
        expect(isPlayFirst({ search: '?utm_source=youtube' })).toBe(true);
    });

    it('아이폰과 PC 는 지금 버튼 그대로다', () => {
        expect(isPlayFirst({ userAgent: IPHONE })).toBe(false);
        expect(isPlayFirst({ userAgent: PC })).toBe(false);
        expect(classesFor({ userAgent: IPHONE }).has('ko-landing')).toBe(true);
    });

    // 플레이 설치는 초대 코드를 넘기지 못한다. 보내면 초대한 사람의 보상이 끊긴다.
    it('초대 코드가 있으면 플레이로 보내지 않는다', () => {
        expect(isPlayFirst({ search: '?ref=ABC123' })).toBe(false);
        expect(isPlayFirst({ path: '/welcome', search: '?ref=ABC123' })).toBe(false);
    });

    it('소개 페이지가 아닌 곳에는 붙지 않는다', () => {
        expect(isPlayFirst({ search: '?start=1' })).toBe(false);
        expect(isPlayFirst({ hint: { at: Date.now() - 1000 } })).toBe(false);
        expect(isPlayFirst({ path: '/app' })).toBe(false);
        expect(isPlayFirst({ referrer: 'android-app://com.habitschool.app' })).toBe(false);
        expect(isPlayFirst({ path: '/en' })).toBe(false);
    });

    it('맨 위와 맨 아래에 플레이 버튼과 웹 시작 버튼이 있고, 다른 기기 버튼은 그대로다', () => {
        const page = publicPage();
        expect((page.match(/data-landing-store href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.habitschool\.app/g) || []).length).toBe(2);
        expect((page.match(/구글 플레이에서 앱 받기/g) || []).length).toBe(2);
        expect((page.match(/<a class="ko-cta-secondary" href="\/\?start=1">웹에서 바로 시작하기<\/a>/g) || []).length).toBe(2);
        expect((page.match(/<a class="ko-cta-primary" href="\/\?start=1">구글 계정으로 시작하기<\/a>/g) || []).length).toBe(2);
        expect(page).toContain('앱에서는 걸음수와 수면도 자동으로 들어와요');
        expect(page).toContain('<a class="ko-hero-guest" href="/?guest=1">');
    });

    it('한 번에 한 벌만 보인다', () => {
        expect(CSS).toContain('html.ko-android .ko-for-others');
        expect(CSS).toContain('html:not(.ko-android) .ko-for-android');
    });

    it('플레이 버튼 클릭을 세고, 앱 안 브라우저에서는 플레이 앱을 바로 연다', () => {
        expect(APP).toContain("trackProductEvent('landing_store_click'");
        expect(APP).toContain('buildPlayStoreIntentUrl(link.href)');
        expect(buildProductEvent('landing_store_click', { entry_point: 'root' })?.params).toEqual({ entry_point: 'root' });
    });

    it('플레이 앱 여는 주소에 유입 표시가 실린다', () => {
        const listing = `${PLAY_STORE_LISTING_URL}&referrer=utm_source%3Dwelcome%26utm_medium%3Dlanding`;
        const intent = buildPlayStoreIntentUrl(listing);
        expect(intent).toContain('intent://details?id=com.habitschool.app&referrer=utm_source%3Dwelcome%26utm_medium%3Dlanding#Intent;');
        expect(intent).toContain('scheme=market;package=com.android.vending;');
        expect(intent).toContain(`S.browser_fallback_url=${encodeURIComponent(listing)};end`);
        // 평점 부탁 카드가 쓰던 주소는 그대로다.
        expect(PLAY_STORE_INTENT_URL).toBe(`intent://details?id=com.habitschool.app#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_LISTING_URL)};end`);
    });
});
