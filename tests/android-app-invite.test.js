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
                        playAppInstalled = false }) {
    const body = sliceFn('function detectWebPlatform()', 'async function recordNativeAppOpen(');
    const box = { hidden: true, innerHTML: '' };
    const store = new Map();
    if (snoozedAt != null) store.set('habitschool_android_invite_snoozed_at', String(snoozedAt));

    // 배너를 그리면 시트도 따라 만든다. 하니스의 document 가 그것까지 받아야 한다.
    const sheets = [];
    const guides = [];
    const timers = [];
    const docState = { hidden: false };
    const makeNode = () => ({
        id: '', className: '', innerHTML: '', removed: false,
        setAttribute() { }, addEventListener() { },
        remove() { this.removed = true; },
    });
    const win = { location: { href: '' }, detectInstalledPlayApp: async () => playAppInstalled };
    const setDoc = vi.fn(() => writeBehaviour());
    const api = Function(
        'navigator', 'document', 'localStorage', 'window', 'getRememberedNativeAppSource',
        'setDoc', 'doc', 'db', 'console', 'isEnglishLocale', 'escapeHtml',
        'withAsyncTimeout', 'increment', 'setTimeout',
        `${body}
        return { renderAndroidAppInvite, detectWebPlatform, recordWebPlatform,
                 dismiss: window.dismissAndroidAppInvite, open: window.openAndroidApp,
                 go: window.goToAndroidApp, closeGuide: window.closeAndroidInstallGuide };`
    )(
        { userAgent: ua, maxTouchPoints: /macintosh/i.test(ua) ? 5 : 0 },
        {
            getElementById: (id) => {
                if (id === 'android-app-invite') return box;
                if (id === 'android-app-sheet') return sheets.find((s) => !s.removed) || null;
                if (id === 'android-install-guide') return guides.find((g) => !g.removed) || null;
                return null;
            },
            get hidden() { return docState.hidden; },
            createElement: makeNode,
            body: { appendChild: (el) => (el.id === 'android-install-guide' ? guides.push(el) : sheets.push(el)) },
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
        () => false,
        (v) => String(v),
        withAsyncTimeout,
        () => 'INC',
        (fn) => { timers.push(fn); return 1; }
    );
    return { api, box, store, win, setDoc, sheets, guides, timers, documentHidden: (v) => { docState.hidden = v; } };
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';

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

describe('a closed invitation stays closed for a few days', () => {
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

    it('comes back after the snooze runs out', async () => {
        const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
        const { api, box } = createHarness({ ua: ANDROID, snoozedAt: fourDaysAgo });
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
        // 안 깔린 사람은 참여 페이지로 간다. 이게 없으면 아무 일도 안 일어난다.
        expect(win.location.href).toContain('S.browser_fallback_url=');
        expect(decodeURIComponent(win.location.href)).toContain('play.google.com/apps/testing/com.habitschool.app');
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
    it('records the tap and shows the guide instead of jumping', async () => {
        const h = createHarness({ ua: ANDROID });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        h.api.open();
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        const written = h.setDoc.mock.calls[0][1];
        expect(written.settings.lastAppInviteTapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(written.settings.appInviteTapCount).toBe('INC');
        expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });
        // 곧바로 구글 페이지로 떨어뜨리지 않는다. 무엇을 하게 되는지 먼저 보여 준다.
        expect(h.win.location.href).toBe('');
        expect(h.guides).toHaveLength(1);
    });

    it('still shows the guide when the write hangs', async () => {
        // 기록은 우리 사정이다. 연결이 끊긴 쓰기는 끝나지 않으므로
        // (tests/consent-save-does-not-hang) 안내가 그것에 붙잡히면 안 된다.
        const h = createHarness({ ua: ANDROID, writeBehaviour: () => new Promise(() => {}) });
        await h.api.renderAndroidAppInvite({ uid: 'u1' });
        h.api.open();
        expect(h.guides).toHaveLength(1);
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
    const PWA = readFileSync(resolve(ROOT_DIR, 'js/pwa-install.js'), 'utf8');
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

describe('a sheet asks once in a while, and lets go', () => {
    it('comes up after the banner is drawn', () => {
        const fn = APP.split('async function renderAndroidAppInvite(user) {')[1].split('\n}')[0];
        expect(fn).toContain('showAndroidAppSheet(en);');
        // 배너가 뜨지 않는 사람에게는 시트도 뜨지 않는다 — 같은 관문을 지난다.
        expect(fn.indexOf('showAndroidAppSheet')).toBeGreaterThan(fn.indexOf('box.hidden = false;'));
    });

    it('shows at most once every three days', () => {
        const fn = APP.split('function showAndroidAppSheet(en) {')[1].split('\n}')[0];
        expect(fn).toContain('if (isAndroidInviteSheetSnoozed()) return;');
        expect(APP).toContain('const ANDROID_INVITE_SHEET_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;');
        // 띄우는 순간 표시를 남긴다. 닫지 않고 나가도 다시 조르지 않는다.
        expect(fn).toContain('localStorage.setItem(ANDROID_INVITE_SHEET_KEY');
    });

    it('closes on the backdrop, not only on the button', () => {
        // 가둬 두면 부탁이 아니라 덫이 된다.
        const fn = APP.split('function showAndroidAppSheet(en) {')[1].split('\n}')[0];
        // 2026-09-22: 닫기를 직접 붙이던 것을 attachBackdropDismiss 로 옮겼다.
        // 여는 탭이 그대로 흘러들어와 열자마자 닫히던 일이 있었다
        // (tests/sheet-survives-the-tap-that-opened-it).
        expect(fn).toContain('attachBackdropDismiss(sheet, () => window.dismissAndroidAppSheet());');
        expect(APP).toContain('window.dismissAndroidAppSheet = function');
    });

    it('keeps the tester count out of it, like the banner', () => {
        const fn = APP.split('function showAndroidAppSheet(en) {')[1].split('\n}')[0];
        for (const leak of ['12명', '심사', '테스터']) {
            expect(fn, leak).not.toContain(leak);
        }
    });

    it('has a look in both themes', () => {
        expect(readFileSync(resolve(ROOT_DIR, 'styles-features.css'), 'utf8')).toContain('.android-sheet-backdrop {');
        expect(readFileSync(resolve(ROOT_DIR, 'styles-dark-mode.css'), 'utf8')).toContain('body.dark-mode .android-sheet {');
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
        expect(h.guides).toHaveLength(1);
    });

    it('carries the tester join page as the fallback', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.go();
        expect(decodeURIComponent(h.win.location.href))
            .toContain('play.google.com/apps/testing/com.habitschool.app');
    });

    it('goes to the join page itself when nothing happened', async () => {
        // 앱 안 브라우저에서는 intent 도 fallback 도 동작하지 않는다. 화면이
        // 그대로면 우리가 직접 보낸다.
        const h = createHarness({ ua: ANDROID });
        h.api.go();
        expect(h.timers).toHaveLength(1);
        h.timers[0]();
        expect(h.win.location.href).toBe('https://play.google.com/apps/testing/com.habitschool.app');
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

// 2026-09-21 제안: "배너 눌렀을 때 미리 과정을 상세히 이미지와 함께 설명해주면
// 되지 않겠어?"
//
// 이유가 있다. 배너를 누른 두 분 다 앱까지 가지 못했다. 누르면 구글 참여
// 페이지로 떨어지는데, 거기서부터 테스터 되기 → 다운로드 → 설치 → 열기 네
// 단계를 혼자 넘어야 한다. 처음 보는 화면이고 무엇을 누르는지 아무도 말해 주지
// 않는다.
describe('the guide says what is about to happen', () => {
    it('shows three steps in order', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.open();
        const html = h.guides[0].innerHTML;
        for (const step of ['테스터 되기', '다운로드', '설치하고 열기']) {
            expect(html, step).toContain(step);
        }
        expect(html).toContain('세 단계, 2분이면 됩니다');
    });

    it('draws a diagram, not a fake Google screen', () => {
        // 진짜처럼 보이는 가짜 화면은 실제와 다를 때 더 헷갈리게 만든다.
        const fn = APP.split('function androidGuideArt(kind) {')[1].split('\n}')[0];
        expect(fn).toContain('<svg viewBox="0 0 64 64" aria-hidden="true">');
        expect(fn).not.toMatch(/googleusercontent|play\.google\.com\/.*\.png/);
    });

    it('leaves for the page only when they say so', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.open();
        // 안내를 띄우는 것만으로는 아무 데도 가지 않는다.
        expect(h.win.location.href).toBe('');
        h.api.go();
        expect(h.win.location.href).toContain('intent://');
    });

    it('can be closed without going anywhere', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.open();
        expect(h.guides[0].removed).toBe(false);
        h.api.closeGuide();
        expect(h.guides[0].removed).toBe(true);
        expect(h.win.location.href).toBe('');
    });

    it('does not stack when tapped twice', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.open();
        h.api.open();
        expect(h.guides).toHaveLength(1);
    });

    it('still keeps the tester count out of it', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.open();
        for (const leak of ['12명', '심사', '테스터가 아']) {
            expect(h.guides[0].innerHTML, leak).not.toContain(leak);
        }
    });
});
