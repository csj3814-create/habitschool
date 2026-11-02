import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const INDEX = readFileSync(resolve(ROOT_DIR, 'index.html'), 'utf8');
const PWA = readFileSync(resolve(ROOT_DIR, 'js/pwa-install.js'), 'utf8');
const HELPERS = readFileSync(resolve(ROOT_DIR, 'js/ui-helpers.js'), 'utf8');

// ui-helpers 는 파이어베이스 CDN 을 import 하므로 직접 들여올 수 없다. 실제
// 구현을 소스에서 떼어 그대로 돌린다.
const TIMEOUT_BODY = HELPERS
    .split('export async function withAsyncTimeout')[1]
    .split('\n}')[0];
const withAsyncTimeout = Function(
    `async function withAsyncTimeout${TIMEOUT_BODY}\n}\nreturn withAsyncTimeout;`
)();

function sliceFn(name, endMarker) {
    const start = APP.indexOf(name);
    const end = APP.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return APP.slice(start, end);
}

// 2026-11-02 대표: "PWA를 사용중인 유저를 구글 플레이스토어 앱을 깔으라고 권유하는 건 아닌 듯.
// HBT 빠진 마이너 버전으로 가라는 것과 같을테니." 9월 플레이 비공개 테스트 때 테스터를 모으려고 만든
// 장치들 — 안드로이드 웹 회원에게 플레이 앱을 권하던 줄(#android-app-invite), 플레이 앱이 깔린 회원에게
// "앱으로 열기" 를 권하던 띠(#open-in-app-banner), 안드로이드에서 웹 앱 설치 카드를 숨기던 스위치
// (SUPPRESS_ANDROID_PWA_INSTALL, "프로덕션 액세스가 나오면 되돌린다") — 을 뺐다.
describe('web members are offered the web app, never the Play app', () => {
    it('no longer draws the Play Store invitation line or the open-in-app bar', () => {
        expect(INDEX).not.toContain('id="android-app-invite"');
        expect(INDEX).not.toContain('id="open-in-app-banner"');
        expect(APP).not.toContain('function renderAndroidAppInvite');
        expect(APP).not.toContain('window.openAndroidApp');
        expect(PWA).not.toContain('function refreshOpenInAppBanner');
        expect(PWA).not.toContain('function openInInstalledApp');
    });

    it('shows the web-app install card on Android as well', () => {
        expect(PWA).not.toContain('SUPPRESS_ANDROID_PWA_INSTALL');
        const fn = PWA.split('function shouldShowInstallCta() {')[1].split('\n}')[0];
        expect(fn).not.toMatch(/android/i);
        expect(fn).toContain('isStandaloneInstallMode()');
    });

    it('the first-record way back offers only the web-app install on the web', () => {
        const fn = APP.split('function renderFirstRecordReturn(')[1].split('\n}\n')[0];
        expect(fn).toContain("action = 'installPWA()';");
        expect(fn).not.toContain('play.google.com');
        expect(fn).not.toContain('Google Play');
    });
});

function createPlatformHarness({ ua, nativeSource = '', writeBehaviour = async () => {} }) {
    const body = sliceFn('function detectWebPlatform()', '// 웹으로 쓰는 분의 기기(');
    const store = new Map();
    const setDoc = vi.fn(() => writeBehaviour());
    const api = Function(
        'navigator', 'localStorage', 'getRememberedNativeAppSource', 'setDoc', 'doc', 'db', 'console', 'withAsyncTimeout',
        `${body}
        return { detectWebPlatform, recordWebPlatform };`
    )(
        { userAgent: ua, maxTouchPoints: /macintosh/i.test(ua) ? 5 : 0 },
        { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) },
        () => nativeSource,
        setDoc,
        () => ({}),
        {},
        { warn: () => {} },
        withAsyncTimeout
    );
    return { api, setDoc };
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';

// 회신 하나가 알려 줬다 — "제가 아이폰이라서요". 웹으로 쓰는 분의 기기를 남겨 둔다
// (2026-11-02 가입자 분석에서도 이 기록으로 "웹만 쓴 40명 중 안드로이드 22명" 을 셌다).
describe('we record which device the web visitor is on', () => {
    it('tells the three apart', () => {
        expect(createPlatformHarness({ ua: ANDROID }).api.detectWebPlatform()).toBe('android');
        expect(createPlatformHarness({ ua: IPHONE }).api.detectWebPlatform()).toBe('ios');
        expect(createPlatformHarness({ ua: DESKTOP }).api.detectWebPlatform()).toBe('desktop');
    });

    it('counts an iPad that pretends to be a Mac as ios', () => {
        const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
        expect(createPlatformHarness({ ua: ipad }).api.detectWebPlatform()).toBe('ios');
    });

    it('writes inside settings, which the rules already allow', () => {
        // users/ 에는 필드 화이트리스트가 있다. 새 최상위 필드를 쓰면 규칙을 함께
        // 배포해야 하고, 빠뜨리면 쓰기가 조용히 거부된다(2026-08-15 consents).
        const fn = sliceFn('async function recordWebPlatform(', '// 웹으로 쓰는 분의 기기(');
        expect(fn).toContain('settings: { lastWebOpenDate: today, lastWebPlatform:');
        expect(fn).toContain('{ merge: true }');
    });

    it('writes once a day, and not when they came through the app', () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 웹으로 쓰는 분의 기기(');
        expect(fn).toContain('if (!user || getRememberedNativeAppSource()) return;');
        expect(fn).toContain('settings.lastWebOpenDate === today');
        expect(fn).toContain('localStorage.getItem(WEB_PLATFORM_WRITTEN_KEY) === today');
    });

    it('says so when the write fails', () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 웹으로 쓰는 분의 기기(');
        expect(fn).toContain("console.warn('[웹 기기 기록] 저장 실패:'");
    });

    it('is decided once per page from the tab switcher, not only when the dashboard draws', () => {
        expect(APP).toContain('rememberWebPlatformOnce(auth.currentUser);');
        const openTab = APP.split('function openTab(tabName, pushState = true) {')[1].split('\nfunction ')[0];
        expect(openTab).toContain('rememberWebPlatformOnce(');
        const fn = APP.split('function rememberWebPlatformOnce(user) {')[1].split('\n}')[0];
        expect(fn).toContain('if (_webPlatformChecked || !user) return;');
    });
});
