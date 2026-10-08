import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const INDEX = readFileSync(resolve(ROOT_DIR, 'index.html'), 'utf8');
const HELPERS = readFileSync(resolve(ROOT_DIR, 'js/ui-helpers.js'), 'utf8');

// ui-helpers 는 파이어베이스 CDN 을 import 하므로 직접 들여올 수 없다. 실제
// 구현을 소스에서 떼어 그대로 돌린다.
const TIMEOUT_BODY = HELPERS
    .split('export async function withAsyncTimeout')[1]
    .split('\n}')[0];
const withAsyncTimeout = Function(
    `async function withAsyncTimeout${TIMEOUT_BODY}\n}\nreturn withAsyncTimeout;`
)();

// 2026-09-19: 92명에게 메일을 보내고 단톡방에도 올렸는데 하루가 지나도 앱을 여는
// 사람이 8명 그대로였다. 메일은 한 번 읽히고 끝이다. 정작 부탁할 사람은 지금
// 안드로이드 폰에서 웹으로 해빛스쿨을 쓰고 있는 사람인데, 그 순간에 말을 걸 수
// 있는 것은 앱뿐이다.
//
// 회신 하나가 또 다른 것을 알려 줬다 — "제가 아이폰이라서요". 아이폰은 Play
// 비공개 테스트에 참여할 방법이 없다. 그래서 같은 배포에 기기 기록도 넣는다.

function sliceFn(name, endMarker) {
    const start = APP.indexOf(name);
    const end = APP.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return APP.slice(start, end);
}

function createHarness({ ua, nativeSource = '', snoozedAt = null, writeBehaviour = async () => {},
                        playAppInstalled = false, english = false, listed = true }) {
    const body = sliceFn('function detectWebPlatform()', 'async function recordNativeAppOpen(');
    const box = { hidden: true, innerHTML: '' };
    const store = new Map();
    if (snoozedAt != null) store.set('habitschool_android_invite_snoozed_at', String(snoozedAt));

    const timers = [];
    const docState = { hidden: false };
    const win = {
        location: { href: '' },
        detectInstalledPlayApp: async () => playAppInstalled,
        isPlayStoreListed: () => listed,
    };
    const setDoc = vi.fn(() => writeBehaviour());
    const api = Function(
        'navigator', 'document', 'localStorage', 'window', 'getRememberedNativeAppSource',
        'setDoc', 'doc', 'db', 'console', 'isEnglishLocale', 'escapeHtml',
        'withAsyncTimeout', 'increment', 'setTimeout',
        `${body}
        return { renderAndroidAppInvite, detectWebPlatform, recordWebPlatform,
                 dismiss: window.dismissAndroidAppInvite, open: window.openAndroidApp,
                 go: goToAndroidApp };`
    )(
        { userAgent: ua, maxTouchPoints: /macintosh/i.test(ua) ? 5 : 0 },
        {
            getElementById: (id) => (id === 'android-app-invite' ? box : null),
            get hidden() { return docState.hidden; },
        },
        {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, v),
        },
        win,
        () => nativeSource,
        setDoc,
        () => ({}),
        {},
        { warn: () => {} },
        () => english,
        (v) => String(v),
        withAsyncTimeout,
        () => 'INC',
        (fn) => { timers.push(fn); return 1; }
    );
    return { api, box, store, win, setDoc, timers, documentHidden: (v) => { docState.hidden = v; } };
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';
const STORE_URL = 'https://play.google.com/store/apps/details?id=com.habitschool.app';
const PWA = readFileSync(resolve(ROOT_DIR, 'js/pwa-install.js'), 'utf8');

// 2026-10-08 지시: 비공개 테스트가 끝났으니 앱 권유를 약하게. 화면을 덮는 시트 둘
// (로그인 뒤, 기록 저장 직후)은 뺀다. 얇은 줄과 "앱으로 열기" 줄은 갈 곳이 테스터
// 참여 페이지뿐이므로 스토어에 정식으로 올라갈 때까지 숨긴다.
describe('nothing invites until the Play Store listing is live', () => {
    it('keeps the thin banner hidden while the app is not listed', async () => {
        const { api, box } = createHarness({ ua: ANDROID, listed: false });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
        expect(box.innerHTML).toBe('');
    });

    it('keeps the "open in the app" banner hidden too', () => {
        const at = PWA.indexOf('async function refreshOpenInAppBanner');
        const block = PWA.slice(at, PWA.indexOf('\n}', at));
        expect(block).toContain('if (!PLAY_STORE_LISTED) {');
        expect(PWA).toContain('window.isPlayStoreListed = () => PLAY_STORE_LISTED;');
    });

    it('is one switch, and says when to flip it', () => {
        expect(PWA).toMatch(/const PLAY_STORE_LISTED = (true|false);/);
        expect(PWA).toContain('스토어 링크가 열리면 true 로');
    });

    it('no longer covers the screen to ask', () => {
        for (const gone of ['android-app-sheet', 'app-after-save-sheet', 'android-install-guide',
            'maybeOfferAppAfterSave', 'showAndroidAppSheet']) {
            expect(APP, gone).not.toContain(gone);
        }
    });

    it('never sends anyone to the tester join page', () => {
        expect(APP).not.toContain('play.google.com/apps/testing');
        expect(APP).not.toContain('테스터 되기');
    });
});

describe('the invitation reaches exactly the people who can act on it', () => {
    it('shows on an Android phone opened through the web', async () => {
        const { api, box } = createHarness({ ua: ANDROID });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
        expect(box.innerHTML).toContain('걸음수가 자동으로 들어옵니다');
    });

    it('stays away when they are already in the app', async () => {
        const { api, box } = createHarness({ ua: ANDROID, nativeSource: 'android-shell' });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
        expect(box.innerHTML).toBe('');
    });

    it('stays away on iPhone, which cannot join a Play test at all', async () => {
        const { api, box } = createHarness({ ua: IPHONE });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
    });

    it('stays away on desktop and when signed out', async () => {
        const desktop = createHarness({ ua: DESKTOP });
        await desktop.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(desktop.box.hidden).toBe(true);

        const guest = createHarness({ ua: ANDROID });
        await guest.api.renderAndroidAppInvite(null);
        expect(guest.box.hidden).toBe(true);
    });

    it('never mentions the tester count', async () => {
        // 2026-09-18 지시: "앱 안에서 참여자 숫자를 사용자들이 보게 할 필요는 없어."
        const { api, box } = createHarness({ ua: ANDROID });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        for (const leak of ['12명', '8명', '심사', '테스터']) {
            expect(box.innerHTML, leak).not.toContain(leak);
        }
    });
});

describe('a closed invitation stays closed for a month', () => {
    it('does not come back right after it is dismissed', async () => {
        const { api, box, store } = createHarness({ ua: ANDROID });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
        api.dismiss();
        expect(box.hidden).toBe(true);
        expect(store.get('habitschool_android_invite_snoozed_at')).toBeTruthy();

        const again = createHarness({ ua: ANDROID, snoozedAt: Date.now() });
        await again.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(again.box.hidden).toBe(true);
    });

    it('is still closed a few days later', async () => {
        const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
        const { api, box } = createHarness({ ua: ANDROID, snoozedAt: fourDaysAgo });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
    });

    it('comes back after the month runs out', async () => {
        const monthAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
        const { api, box } = createHarness({ ua: ANDROID, snoozedAt: monthAgo });
        await api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
    });
});

describe('one button covers both installed and not installed', () => {
    it('hands Android an intent with a store fallback', async () => {
        const { api, win } = createHarness({ ua: ANDROID });
        api.go();
        expect(win.location.href).toContain('intent://');
        expect(win.location.href).toContain('package=com.habitschool.app');
        // 안 깔린 사람은 스토어로 간다. 이게 없으면 아무 일도 안 일어난다.
        expect(win.location.href).toContain('S.browser_fallback_url=');
        expect(decodeURIComponent(win.location.href)).toContain(STORE_URL);
    });
});

describe('we record which device the web visitor is on', () => {
    it('tells the three apart', async () => {
        expect(createHarness({ ua: ANDROID }).api.detectWebPlatform()).toBe('android');
        expect(createHarness({ ua: IPHONE }).api.detectWebPlatform()).toBe('ios');
        expect(createHarness({ ua: DESKTOP }).api.detectWebPlatform()).toBe('desktop');
    });

    it('counts an iPad that pretends to be a Mac as ios', async () => {
        const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
        expect(createHarness({ ua: ipad }).api.detectWebPlatform()).toBe('ios');
    });

    it('writes inside settings, which the rules already allow', async () => {
        // users/ 에는 필드 화이트리스트가 있다. 새 최상위 필드를 쓰면 규칙을 함께
        // 배포해야 하고, 빠뜨리면 쓰기가 조용히 거부된다(2026-08-15 consents).
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain('settings: { lastWebOpenDate: today, lastWebPlatform:');
        expect(fn).toContain('{ merge: true }');
    });

    it('writes once a day, and not when they came through the app', async () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain('if (!user || getRememberedNativeAppSource()) return;');
        expect(fn).toContain('settings.lastWebOpenDate === today');
    });

    it('says so when the write fails', async () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain("console.warn('[웹 기기 기록] 저장 실패:'");
    });
});

describe('the banner has a place to render', () => {
    it('sits above the dashboard, hidden until it decides to show', async () => {
        expect(INDEX).toContain('<div id="android-app-invite" hidden></div>');
        expect(INDEX.indexOf('id="android-app-invite"'))
            .toBeLessThan(INDEX.indexOf('<div id="dashboard"'));
    });

    it('is drawn from the same place that reads the user document', async () => {
        expect(APP).toContain('renderAndroidAppInvite(user)');
        expect(APP).toContain('recordWebPlatform(user, ud.settings)');
    });

    it('does not double up with the banner that already exists', async () => {
        // js/pwa-install.js 의 #open-in-app-banner 가 '앱이 깔려 있어요, 눌러서
        // 열기' 를 이미 맡는다. 이 줄은 아직 앱이 없는 사람 몫이다.
        const installed = createHarness({ ua: ANDROID, playAppInstalled: true });
        await installed.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(installed.box.hidden).toBe(true);

        const notInstalled = createHarness({ ua: ANDROID, playAppInstalled: false });
        await notInstalled.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(notInstalled.box.hidden).toBe(false);
    });
});

// 배너를 본 사람과 누른 사람을 가를 수 없으면, 숫자가 안 오를 때 문구가 약한
// 것인지 설치 단계에서 막히는 것인지 알 수 없다. 둘은 할 일이 전혀 다르다.
describe('we can tell a tap from a glance', () => {
    it('records the tap and goes straight on', async () => {
        const h = createHarness({ ua: ANDROID });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        h.api.open();
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        const written = h.setDoc.mock.calls[0][1];
        expect(written.settings.lastAppInviteTapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(written.settings.appInviteTapCount).toBe('INC');
        expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });
        // 비공개 테스트 때는 세 단계 안내를 먼저 띄웠다. 스토어는 한 화면이라 바로 간다.
        expect(h.win.location.href).toContain('intent://');
    });

    it('still leaves when the write hangs', async () => {
        // 기록은 우리 사정이다. 연결이 끊긴 쓰기는 끝나지 않으므로
        // (tests/consent-save-does-not-hang) 안내가 그것에 붙잡히면 안 된다.
        const h = createHarness({ ua: ANDROID, writeBehaviour: () => new Promise(() => {}) });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        h.api.open();
        expect(h.win.location.href).toContain('intent://');
    });

    it('opens even for someone the banner never greeted', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.go();
        expect(h.win.location.href).toContain('intent://');
    });
});

// 2026-09-19 지시: 안드로이드에서는 PWA 설치 권유를 잠시 끈다.
//
// 안드로이드 화면에 설치 안내가 둘이었다 — 위에는 플레이스토어 앱으로 가는 줄,
// 아래에는 PWA 설치 배너. 잘못 누르면 홈화면 아이콘이 생기는데 그건 웹
// 바로가기라 Play 심사에 잡히지 않는다. 우리가 메일에 "홈화면 아이콘은 웹
// 바로가기일 수 있습니다" 라고 경고한 그 상황을 앱이 스스로 만들고 있었다.
describe('only one install path shows on Android', () => {
    const gate = PWA.split('function shouldShowInstallCta() {')[1].split('\n}')[0];

    const decide = (ua) => Function('navigator', `
        const isLocalHost = () => false;
        const isStandaloneInstallMode = () => false;
        const SUPPRESS_ANDROID_PWA_INSTALL = ${PWA.includes('const SUPPRESS_ANDROID_PWA_INSTALL = true;')};
        ${PWA.split('function isAndroidDevice() {')[1].split('\n}')[0].replace(/^/, 'function isAndroidDevice() {')}
        }
        function shouldShowInstallCta() {${gate}
        }
        return shouldShowInstallCta();`)({ userAgent: ua });

    it('hides the PWA install prompt on Android', () => {
        expect(decide(ANDROID)).toBe(false);
    });

    it('keeps it on iPhone and desktop, where it is the only way to install', () => {
        expect(decide(IPHONE)).toBe(true);
        expect(decide(DESKTOP)).toBe(true);
    });

    it('is one line to undo, and says when to undo it', () => {
        // Play 액세스가 나오면 되돌린다. 왜 껐는지 모르면 영영 꺼진 채로 남는다.
        expect(PWA).toContain('const SUPPRESS_ANDROID_PWA_INSTALL = true;');
        expect(PWA).toContain('Play 프로덕션 액세스가 나오면 이 값을 false 로 되돌린다');
    });
});

// 2026-09-20: 하루를 재 보니 안드로이드 웹으로 쓰는 7명 중 배너를 눌러 본 사람이
// 0명이었다. 문구가 약해서가 아니라 **배너가 뜨지 않고 있었다.**
//
// renderAndroidAppInvite 와 recordWebPlatform 이 _renderDashboardWithData 안에
// 있었고, 그 함수는 '내 기록' 탭을 열 때만 돈다. 식단이나 운동 탭으로 바로
// 들어간 사람에게는 한 번도 그려지지 않았다. 기기 기록이 하루에 16명분밖에
// 쌓이지 않은 것도 같은 이유다.
describe('the invitation does not depend on which tab they opened', () => {
    it('is decided once per page, from the tab switcher', () => {
        expect(APP).toContain('function maybeOfferAndroidApp(user)');
        expect(APP).toContain('maybeOfferAndroidApp(auth.currentUser);');
        // 대시보드 렌더 안에 갇혀 있으면 안 된다.
        const openTab = APP.split('function openTab(tabName, pushState = true) {')[1].split('\nfunction ')[0];
        expect(openTab).toContain('maybeOfferAndroidApp(');
    });

    it('runs once, not on every tab switch', () => {
        const fn = APP.split('function maybeOfferAndroidApp(user) {')[1].split('\n}')[0];
        expect(fn).toContain('if (_androidInviteChecked || !user) return;');
        expect(fn).toContain('_androidInviteChecked = true;');
    });

    it('still writes the device once a day without the user document', () => {
        // 탭 전환마다 부르므로, 설정값을 못 받은 자리에서도 하루 한 번을 지켜야 한다.
        const fn = APP.split('async function recordWebPlatform(')[1].split('// 안드로이드에서 웹으로 쓰는 분께만')[0];
        expect(fn).toContain('WEB_PLATFORM_WRITTEN_KEY');
        expect(fn).toContain('localStorage.getItem(WEB_PLATFORM_WRITTEN_KEY) === today');
    });
});

// 2026-09-20 질문: "앱으로 열기 눌렀을 때 앱이 없으면 테스터 조인 및 설치 링크로
// 바로 이동이 되나?"
//
// intent 의 browser_fallback_url 이 그 일을 한다. 다만 두 가지가 그것을 막을 수
// 있어서 함께 손봤다.
//   1. 크롬은 intent:// 이동을 사용자가 누른 흐름 안에서만 허용한다. 누름을
//      기록하려고 1초씩 기다리면 그 흐름이 끊긴다.
//   2. 앱 안 브라우저(카카오톡 등)는 intent:// 자체를 모른다. fallback 도 안 탄다.
describe('the button always lands somewhere', () => {
    it('does not wait on a write before leaving', async () => {
        // await 가 있으면 사용자 제스처 흐름이 끊겨 외부 앱 실행이 막힐 수 있다.
        const fn = APP.split('window.openAndroidApp = function openAndroidApp() {')[1].split('\n};')[0];
        expect(fn).not.toContain('await ');
        expect(APP).toContain('window.openAndroidApp = function openAndroidApp()');
    });

    it('still records the tap, just without blocking', async () => {
        const h = createHarness({ ua: ANDROID });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        h.api.open();
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        expect(h.setDoc.mock.calls[0][1].settings.lastAppInviteTapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('goes to the store itself when nothing happened', async () => {
        // 앱 안 브라우저에서는 intent 도 fallback 도 동작하지 않는다. 화면이
        // 그대로면 우리가 직접 보낸다.
        const h = createHarness({ ua: ANDROID });
        h.api.go();
        expect(h.timers).toHaveLength(1);
        h.timers[0]();
        expect(h.win.location.href).toBe(STORE_URL);
    });

    it('leaves the page alone when the app did open', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.go();
        const intentUrl = h.win.location.href;
        h.documentHidden(true);   // 앱이 열리면 이 문서는 숨겨진다
        h.timers[0]();
        expect(h.win.location.href).toBe(intentUrl);
    });
});

// 2026-09-25 제보: 영문(/en)에서 가입하자 "Three steps, about two minutes" 시트가 떴고
// 세 단계가 한국어였다. 플레이스토어 앱은 한국어 전용이라, 영문 사이트는 어떤 경로로도
// 그 앱을 안내하지 않는다 — 번역이 아니라 띄우지 않는 것이 답이다.
describe('the English site never points at the Korean-only Play app', () => {
    it('shows no banner on an English Android visit', async () => {
        const h = createHarness({ ua: ANDROID, english: true });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(h.box.hidden).toBe(true);
        expect(h.box.innerHTML).toBe('');
    });

    it('goes nowhere even if the button is reached', () => {
        const h = createHarness({ ua: ANDROID, english: true });
        h.api.open();
        expect(h.setDoc).not.toHaveBeenCalled();
        expect(h.win.location.href).toBe('');
    });

    it('keeps the Korean invitation exactly as it was', async () => {
        const h = createHarness({ ua: ANDROID, english: false });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(h.box.hidden).toBe(false);
        expect(h.box.innerHTML).toContain('걸음수가 자동으로 들어옵니다');
    });

    it('also hides the "open in the installed app" banner on the English site', () => {
        const at = PWA.indexOf('async function refreshOpenInAppBanner');
        const block = PWA.slice(at, PWA.indexOf('\n}', at));
        expect(block).toContain('if (isEnglishInstallLocale()) {');
        expect(block).toContain('banner.hidden = true;');
    });
});
