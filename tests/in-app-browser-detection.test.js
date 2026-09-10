import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-08: 웨일 사용자에게 로그인 버튼이 아예 보이지 않았다. `/Whale\//i` 를
// auth.js 목록에서 뺐는데도 화면은 그대로였다 — 같은 판정이 세 파일에 복사돼
// 있었고, 목록마다 내용이 달랐고, 남은 패턴이 여전히 웨일을 잡았다.
//
// 여기서 지키는 것은 패턴의 생김새가 아니라 **보장**이다.
//   1. 알려진 독립 브라우저는 어떤 경우에도 인앱으로 분류되지 않는다
//   2. 판정하는 곳은 하나뿐이다
//   3. 판정을 못 읽으면 막지 않는다(막히면 되돌아올 수 없으므로)
const loadDetect = () => {
    const source = readRepoFile('js/browser-detect.js');
    const global = { navigator: { userAgent: '' } };
    // eslint-disable-next-line no-new-func
    new Function('window', `${source}`)(global);
    return global.HabitSchoolBrowserDetect;
};

const UA = {
    whaleWithWebViewToken: 'Mozilla/5.0 (Linux; Android 13; SM-S911N Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Whale/1.0.0.0 Crosswalk/28.120 Mobile Safari/537.36',
    whalePlain: 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Whale/1.0.0.0 Mobile Safari/537.36',
    whaleDesktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Whale/4.0.0.0 Safari/537.36',
    samsung: 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    chromeAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    safariIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    kakao: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 KAKAOTALK 10.4.5',
    naverApp: 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 NAVER(inapp; search; 1000; 12.5.0)',
    instagram: 'Mozilla/5.0 (Linux; Android 13; wv) AppleWebKit/537.36 Instagram 300.0.0'
};

describe('독립 브라우저는 인앱으로 분류되지 않는다', () => {
    const detect = loadDetect();

    // 웨일은 크로미움 기반이라 UA 에 `; wv)` 를 함께 실어 보내는 형태가 있다.
    // 목록에서 이름만 빼는 방식이 실패한 이유가 정확히 이것이다.
    it.each([
        ['웨일 (UA 에 wv 토큰 포함)', UA.whaleWithWebViewToken],
        ['웨일 (일반)', UA.whalePlain],
        ['웨일 데스크톱', UA.whaleDesktop],
        ['삼성 인터넷', UA.samsung],
        ['크롬 Android', UA.chromeAndroid],
        ['iOS 사파리', UA.safariIOS]
    ])('%s 는 통과한다', (_label, ua) => {
        expect(detect.isInAppBrowser(ua)).toBe(false);
    });

    it.each([
        ['카카오톡', UA.kakao],
        ['네이버 앱', UA.naverApp],
        ['인스타그램', UA.instagram]
    ])('%s 는 인앱으로 잡는다', (_label, ua) => {
        expect(detect.isInAppBrowser(ua)).toBe(true);
    });

    it('독립 브라우저 판정이 인앱 패턴보다 먼저다', () => {
        // wv 토큰을 달고 있어도 웨일이면 독립이다.
        expect(detect.isStandaloneBrowser(UA.whaleWithWebViewToken)).toBe(true);
        expect(detect.isInAppBrowser(UA.whaleWithWebViewToken)).toBe(false);
    });
});

describe('판정하는 곳은 하나뿐이다', () => {
    const auth = readRepoFile('js/auth.js');
    const install = readRepoFile('js/pwa-install.js');
    const redirect = readRepoFile('js/webview-detect.js');

    it.each([
        ['js/auth.js', auth],
        ['js/pwa-install.js', install]
    ])('%s 는 자체 패턴 목록을 갖지 않는다', (_label, source) => {
        // 사본이 생기는 순간 갈라지고, 갈라진 쪽이 사용자를 막는다.
        expect(source).not.toContain('/KAKAOTALK/i');
        expect(source).toContain('HabitSchoolBrowserDetect');
    });

    it('자동 이동은 독립 브라우저를 건드리지 않는다', () => {
        const guard = redirect.slice(0, redirect.indexOf('KAKAOTALK'));
        expect(guard).toContain('isStandaloneBrowser(ua)');
        expect(guard).toContain('return;');
    });
});

describe('판정을 못 읽으면 막지 않는다', () => {
    // 비대칭: 잘못 막으면 로그인 버튼이 사라져 되돌아올 수 없다.
    // 잘못 통과시키면 팝업이 한 번 실패할 뿐이다.
    it('auth.js 의 isWebView 는 공용 판정이 없으면 false 다', () => {
        const auth = readRepoFile('js/auth.js');
        const body = auth.slice(auth.indexOf('function isWebView() {'));
        const fn = body.slice(0, body.indexOf('\n}') + 2);
        // eslint-disable-next-line no-new-func
        const isWebView = new Function('window', `${fn}\nreturn isWebView();`);
        expect(isWebView({})).toBe(false);
    });
});

describe('로딩 순서와 캐시', () => {
    it('browser-detect.js 가 webview-detect.js 보다 먼저 실려야 한다', () => {
        const html = readRepoFile('index.html');
        const detectAt = html.indexOf('js/browser-detect.js');
        const redirectAt = html.indexOf('js/webview-detect.js');
        expect(detectAt).toBeGreaterThan(-1);
        expect(detectAt).toBeLessThan(redirectAt);
    });

    it('서비스 워커가 새 파일을 함께 캐시한다', () => {
        expect(readRepoFile('sw.js')).toContain('./js/browser-detect.js');
    });
});

describe('로그인이 막히면 셀 수 있어야 한다', () => {
    it('로그인 버튼을 숨기는 분기가 계측을 남긴다', () => {
        const auth = readRepoFile('js/auth.js');
        const branch = auth.slice(auth.indexOf('if (isWebView()) {'));
        expect(branch.slice(0, 400)).toContain("trackProductEvent('auth_browser_blocked')");
    });

    it('이벤트 이름이 허용 목록에 등록돼 있다', () => {
        expect(readRepoFile('js/product-events.js')).toContain("'auth_browser_blocked'");
    });
});
