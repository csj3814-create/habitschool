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

function createHarness({ ua, nativeSource = '', snoozedAt = null, writeBehaviour = async () => {} }) {
    const body = sliceFn('function detectWebPlatform()', 'async function recordNativeAppOpen(');
    const box = { hidden: true, innerHTML: '' };
    const store = new Map();
    if (snoozedAt != null) store.set('habitschool_android_invite_snoozed_at', String(snoozedAt));

    const win = { location: { href: '' } };
    const setDoc = vi.fn(() => writeBehaviour());
    const api = Function(
        'navigator', 'document', 'localStorage', 'window', 'getRememberedNativeAppSource',
        'setDoc', 'doc', 'db', 'console', 'isEnglishLocale', 'escapeHtml',
        'withAsyncTimeout', 'increment',
        `${body}
        return { renderAndroidAppInvite, detectWebPlatform, recordWebPlatform,
                 dismiss: window.dismissAndroidAppInvite, open: window.openAndroidApp };`
    )(
        { userAgent: ua, maxTouchPoints: /macintosh/i.test(ua) ? 5 : 0 },
        { getElementById: (id) => (id === 'android-app-invite' ? box : null) },
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
        () => 'INC'
    );
    return { api, box, store, win, setDoc };
}

const ANDROID = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/152 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36';

describe('the invitation reaches exactly the people who can act on it', () => {
    it('shows on an Android phone opened through the web', () => {
        const { api, box } = createHarness({ ua: ANDROID });
        api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
        expect(box.innerHTML).toContain('걸음수가 자동으로 들어옵니다');
    });

    it('stays away when they are already in the app', () => {
        const { api, box } = createHarness({ ua: ANDROID, nativeSource: 'android-shell' });
        api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
        expect(box.innerHTML).toBe('');
    });

    it('stays away on iPhone, which cannot join a Play test at all', () => {
        const { api, box } = createHarness({ ua: IPHONE });
        api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(true);
    });

    it('stays away on desktop and when signed out', () => {
        const desktop = createHarness({ ua: DESKTOP });
        desktop.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(desktop.box.hidden).toBe(true);

        const guest = createHarness({ ua: ANDROID });
        guest.api.renderAndroidAppInvite(null);
        expect(guest.box.hidden).toBe(true);
    });

    it('never mentions the tester count', () => {
        // 2026-09-18 지시: "앱 안에서 참여자 숫자를 사용자들이 보게 할 필요는 없어."
        const { api, box } = createHarness({ ua: ANDROID });
        api.renderAndroidAppInvite({ uid: 'u1' });
        for (const leak of ['12명', '8명', '심사', '테스터']) {
            expect(box.innerHTML, leak).not.toContain(leak);
        }
    });
});

describe('a closed invitation stays closed for a few days', () => {
    it('does not come back right after it is dismissed', () => {
        const { api, box, store } = createHarness({ ua: ANDROID });
        api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
        api.dismiss();
        expect(box.hidden).toBe(true);
        expect(store.get('habitschool_android_invite_snoozed_at')).toBeTruthy();

        const again = createHarness({ ua: ANDROID, snoozedAt: Date.now() });
        again.api.renderAndroidAppInvite({ uid: 'u1' });
        expect(again.box.hidden).toBe(true);
    });

    it('comes back after the snooze runs out', () => {
        const fourDaysAgo = Date.now() - 4 * 24 * 60 * 60 * 1000;
        const { api, box } = createHarness({ ua: ANDROID, snoozedAt: fourDaysAgo });
        api.renderAndroidAppInvite({ uid: 'u1' });
        expect(box.hidden).toBe(false);
    });
});

describe('one button covers both installed and not installed', () => {
    it('hands Android an intent with a store fallback', () => {
        const { api, win } = createHarness({ ua: ANDROID });
        api.open();
        expect(win.location.href).toContain('intent://');
        expect(win.location.href).toContain('package=com.habitschool.app');
        // 안 깔린 사람은 참여 페이지로 간다. 이게 없으면 아무 일도 안 일어난다.
        expect(win.location.href).toContain('S.browser_fallback_url=');
        expect(decodeURIComponent(win.location.href)).toContain('play.google.com/apps/testing/com.habitschool.app');
    });
});

describe('we record which device the web visitor is on', () => {
    it('tells the three apart', () => {
        expect(createHarness({ ua: ANDROID }).api.detectWebPlatform()).toBe('android');
        expect(createHarness({ ua: IPHONE }).api.detectWebPlatform()).toBe('ios');
        expect(createHarness({ ua: DESKTOP }).api.detectWebPlatform()).toBe('desktop');
    });

    it('counts an iPad that pretends to be a Mac as ios', () => {
        const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
        expect(createHarness({ ua: ipad }).api.detectWebPlatform()).toBe('ios');
    });

    it('writes inside settings, which the rules already allow', () => {
        // users/ 에는 필드 화이트리스트가 있다. 새 최상위 필드를 쓰면 규칙을 함께
        // 배포해야 하고, 빠뜨리면 쓰기가 조용히 거부된다(2026-08-15 consents).
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain('settings: { lastWebOpenDate: today, lastWebPlatform:');
        expect(fn).toContain('{ merge: true }');
    });

    it('writes once a day, and not when they came through the app', () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain('if (!user || getRememberedNativeAppSource()) return;');
        expect(fn).toContain('settings.lastWebOpenDate === today');
    });

    it('says so when the write fails', () => {
        const fn = sliceFn('async function recordWebPlatform(', '// 안드로이드에서 웹으로 쓰는 분께만');
        expect(fn).toContain("console.warn('[웹 기기 기록] 저장 실패:'");
    });
});

describe('the banner has a place to render', () => {
    it('sits above the dashboard, hidden until it decides to show', () => {
        expect(INDEX).toContain('<div id="android-app-invite" hidden></div>');
        expect(INDEX.indexOf('id="android-app-invite"'))
            .toBeLessThan(INDEX.indexOf('<div id="dashboard"'));
    });

    it('is drawn from the same place that reads the user document', () => {
        expect(APP).toContain('renderAndroidAppInvite(user);');
        expect(APP).toContain('recordWebPlatform(user, ud.settings)');
    });
});

// 배너를 본 사람과 누른 사람을 가를 수 없으면, 숫자가 안 오를 때 문구가 약한
// 것인지 설치 단계에서 막히는 것인지 알 수 없다. 둘은 할 일이 전혀 다르다.
describe('we can tell a tap from a glance', () => {
    it('records the tap before sending them off', async () => {
        const h = createHarness({ ua: ANDROID });
        h.api.renderAndroidAppInvite({ uid: 'u1' });
        await h.api.open();
        expect(h.setDoc).toHaveBeenCalledTimes(1);
        const written = h.setDoc.mock.calls[0][1];
        expect(written.settings.lastAppInviteTapDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(written.settings.appInviteTapCount).toBe('INC');
        expect(h.setDoc.mock.calls[0][2]).toEqual({ merge: true });
        expect(h.win.location.href).toContain('intent://');
    });

    it('still opens the app when the write hangs', async () => {
        // 기록은 우리 사정이고, 사람은 앱으로 가려고 누른 것이다. 연결이 끊긴
        // 쓰기는 끝나지 않으므로(tests/consent-save-does-not-hang) 붙잡히면 안 된다.
        const h = createHarness({ ua: ANDROID, writeBehaviour: () => new Promise(() => {}) });
        h.api.renderAndroidAppInvite({ uid: 'u1' });
        await h.api.open();
        expect(h.win.location.href).toContain('intent://');
    });

    it('opens even for someone the banner never greeted', async () => {
        const h = createHarness({ ua: ANDROID });
        await h.api.open();
        expect(h.win.location.href).toContain('intent://');
    });
});
