import { describe, expect, it } from 'vitest';
import { buildProductEvent } from '../js/product-events.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 2026-11-21 대표: "앱의 취지를 더 알고 싶은 사람만 클릭해서 웰컴 페이지를 볼 수 있게 하고 아니면 간단하게 닫을 수 있게 하자."
// "초기 사용자는 가능하면 구글플레이 앱을 권하는 게 맞는 것 같다. 플레이 앱으로 받기 링크 넣어줘."
// 설계: tasks/2026-11-21_소개페이지_대신_로그인위_소개레이어_설계.md. 첫 방문 판정은 tests/korean-landing.test.js.
const HTML = readRepoFile('index.html');
const EN_HTML = readRepoFile('en/index.html');
const CSS = readRepoFile('styles-base.css');
const APP = readAppSource();
const AUTH = readRepoFile('js/auth.js');
const EN_DICT = readRepoFile('js/i18n-en.js');

function layer(html = HTML) {
    const at = html.indexOf('<div id="intro-layer"');
    expect(at).toBeGreaterThan(-1);
    return html.slice(at, html.indexOf('<div class="app-container">', at));
}

describe('로그인 창 위 소개 창', () => {
    it('앱의 취지를 짧게 말하고, 포인트·쿠폰은 앞세우지 않는다', () => {
        const text = layer().replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ');
        expect(text).toContain('응급의학과 전문의 최석재');
        expect(text).toContain('같이 해요');
        expect(text).not.toContain('포인트');
        expect(text).not.toContain('쿠폰');
    });

    it('닫는 길이 여럿이다 — ✕, 시작하기, 웹에서 시작, 바탕, Esc', () => {
        const box = layer();
        expect(box).toContain('data-intro-close="x"');
        expect(box).toContain('data-intro-close="start"');
        expect(box).toContain('data-intro-close="web"');
        expect(APP).toContain("closeIntroLayer('backdrop')");
        expect(APP).toContain("closeIntroLayer('escape')");
    });

    it('더 알고 싶은 사람만 소개 페이지로 간다 — 한국어 /welcome, 영어 /en/welcome', () => {
        expect(layer()).toMatch(/class="intro-layer__more" href="\/welcome"[^>]*data-intro-more/);
        expect(layer(EN_HTML)).toMatch(/class="intro-layer__more" href="\/en\/welcome"/);
    });

    it('안드로이드는 플레이 앱 받기가 큰 단추다', () => {
        const android = layer().slice(layer().indexOf('intro-layer__android'), layer().indexOf('intro-layer__others'));
        expect(android).toMatch(/class="intro-layer__primary" data-intro-store href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.habitschool\.app/);
        expect(android).toContain('걸음수');
        expect(CSS).toContain('html.intro-android .intro-layer__android { display: block; }');
        expect(CSS).toContain('html.intro-android .intro-layer__others { display: none; }');
        // 앱 안 브라우저는 소개 페이지처럼 플레이 앱을 바로 연다.
        expect(APP).toContain('buildPlayStoreIntentUrl(store.href)');
    });

    // 처음에는 <html> 표시 이름도 intro-layer 였다. 그러면 ".intro-layer { display: none; }" 이 <html> 자체를 숨겨
    // 첫 방문자에게 하얀 화면만 보였다(2026-11-21 로컬 확인). 표시 이름은 창의 클래스와 달라야 한다.
    it('<html> 표시 이름은 창의 클래스 이름과 겹치지 않는다', () => {
        const head = HTML.split('</head>')[0];
        expect(head).toContain("root.classList.add('show-intro')");
        expect(head).not.toContain("classList.add('intro-layer')");
        expect(layer()).not.toMatch(/class="[^"]*\bshow-intro\b/);
        expect(CSS).not.toMatch(/(^|[\s,}])\.show-intro\b/m);
    });

    it('html.show-intro 일 때만 보이고, 병원 QR·제휴 커버·소개 페이지 위에는 뜨지 않는다', () => {
        expect(CSS).toContain('.intro-layer { display: none; }');
        expect(CSS).toContain('html.show-intro:not(.ko-landing):not(.clinic-entry):not(.partner-cover) .intro-layer {');
    });

    it('닫으면 이 기기에서 다시 띄우지 않는다', () => {
        expect(APP).toContain("const INTRO_SEEN_KEY = 'habitschool-intro-seen-v1';");
        expect(HTML.split('</head>')[0]).toContain("localStorage.getItem('habitschool-intro-seen-v1')");
        const fn = AUTH.split('function applySignedInShellUi(user) {')[1].split('\n}\n')[0];
        expect(fn).toContain("classList.remove('show-intro')");
    });

    it('영어 앱은 사전 키로 같은 창을 영어로 보인다', () => {
        const keys = [...layer().matchAll(/data-i18n(?:-aria-label|-href)?="(intro\.[^"]+)"/g)].map((m) => m[1]);
        expect(keys.length).toBeGreaterThanOrEqual(10);
        keys.forEach((key) => expect(EN_DICT, key).toContain(`'${key}':`));
        expect(layer(EN_HTML)).not.toMatch(/[가-힣]/);
    });

    it('본 수와 닫은 방법을 센다', () => {
        expect(buildProductEvent('intro_layer_view', { locale: 'ko' })).toBeTruthy();
        expect(buildProductEvent('intro_layer_close', { how: 'store', locale: 'en' }).params).toMatchObject({ how: 'store', locale: 'en' });
    });
});
