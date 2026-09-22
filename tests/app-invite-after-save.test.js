import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-22 요청: "기록 저장 직후 권유 만들어줘."
//
// 앱 권유는 탭을 열 때만 떴다. 그 순간에는 앱이 무엇을 더 해 주는지 말할 근거가
// 없다 — 아직 아무 일도 안 했으니까. 방금 기록을 마친 사람에게는 있다.
//
// 다만 저장 직후는 이미 붐비는 자리다. 공유 권유, 첫 기록 축하, 배지 축하가
// 전부 거기서 뜬다. **부탁은 한 번에 하나만** 이라는 것이 이 시험의 절반이다.

const APP = readRepoFile('js/app-core.js');

function createHarness({
    installed = false,
    platform = 'android',
    nativeSource = '',
    storage = {},
    existingNodes = [],
    consentOpen = false,
} = {}) {
    const start = APP.indexOf("const APP_AFTER_SAVE_AT_KEY = 'habitschool_app_after_save_at';");
    const end = APP.indexOf('function showAndroidAppSheet(en) {', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const canOffer = APP.slice(
        APP.indexOf('async function canOfferAndroidApp(user) {'),
        APP.indexOf('async function renderAndroidAppInvite(user) {')
    );

    const appended = [];
    const win = { __HABITSCHOOL_CONSENT_GATE_OPEN__: consentOpen };
    const localStorage = {
        getItem: (k) => (k in storage ? storage[k] : null),
        setItem: (k, v) => { storage[k] = v; },
    };

    const api = Function(
        'window', 'localStorage', 'document', 'getRememberedNativeAppSource',
        'detectWebPlatform', 'isEnglishLocale', 'console',
        `${canOffer}
         ${APP.slice(start, end)}
         return { offer: maybeOfferAppAfterSave, dismiss: window.dismissAppAfterSave,
                  snoozed: isAppAfterSaveSnoozed, count: readAppAfterSaveCount };`
    )(
        win,
        localStorage,
        {
            getElementById: (id) => (existingNodes.includes(id) ? { id, remove() {} } : null),
            createElement: () => ({
                style: {}, innerHTML: '',
                setAttribute() {}, addEventListener() {}, remove() {},
            }),
            body: { appendChild: (el) => appended.push(el) },
        },
        () => nativeSource,
        () => platform,
        () => false,
        { warn: () => {} }
    );

    win.detectInstalledPlayApp = vi.fn(async () => installed);
    return { api, appended, storage, win };
}

const USER = { uid: 'u1' };

describe('the app invite takes the moment right after a save', () => {
    it('offers once to an Android member still on the web', async () => {
        const h = createHarness();
        await expect(h.api.offer(USER)).resolves.toBe(true);
        expect(h.appended).toHaveLength(1);
    });

    it('never offers on a phone that cannot install it', async () => {
        // 아이폰 회원에게 안드로이드 앱을 권하면 실망만 드린다.
        const h = createHarness({ platform: 'ios' });
        await expect(h.api.offer(USER)).resolves.toBe(false);
        expect(h.appended).toEqual([]);
    });

    it('never offers to someone already in the app', async () => {
        const h = createHarness({ nativeSource: 'android-shell' });
        await expect(h.api.offer(USER)).resolves.toBe(false);
    });

    it('never offers when the app is already installed', async () => {
        const h = createHarness({ installed: true });
        await expect(h.api.offer(USER)).resolves.toBe(false);
    });

    it('waits three days before asking again', async () => {
        const storage = {};
        const first = createHarness({ storage });
        await first.api.offer(USER);
        const again = createHarness({ storage });
        await expect(again.api.offer(USER)).resolves.toBe(false);
        expect(again.appended).toEqual([]);
    });

    it('stops after three times, because three noes are an answer', async () => {
        const storage = { habitschool_app_after_save_count: '3' };
        const h = createHarness({ storage });
        await expect(h.api.offer(USER)).resolves.toBe(false);
    });

    it('keeps out of the way of anything already on screen', async () => {
        for (const id of ['android-app-sheet', 'android-install-guide', 'app-after-save-sheet']) {
            const h = createHarness({ existingNodes: [id] });
            await expect(h.api.offer(USER), `${id} 위에 겹쳤다`).resolves.toBe(false);
        }
    });

    it('never lands on top of the consent gate', async () => {
        const h = createHarness({ consentOpen: true });
        await expect(h.api.offer(USER)).resolves.toBe(false);
    });

    it('does not burn a turn of the snooze when it decides not to show', async () => {
        // 안 띄웠는데 사흘을 써 버리면, 조건이 풀린 뒤에도 사흘을 기다리게 된다.
        const storage = {};
        const h = createHarness({ platform: 'ios', storage });
        await h.api.offer(USER);
        expect(storage.habitschool_app_after_save_at).toBeUndefined();
        expect(storage.habitschool_app_after_save_count).toBeUndefined();
    });

    it('survives a browser that refuses local storage', async () => {
        const h = createHarness();
        h.api.snoozed();
        await expect(h.api.offer(USER)).resolves.toBe(true);
    });
});

describe('only one thing is asked for after a save', () => {
    const save = APP.split('// 완료 토스트가 뜬 다음 한 박자 뒤에 공유를 권한다.')[1].slice(0, 1200);

    it('gives the slot to the share prompt first', () => {
        expect(save).toContain('const sharePrompted = maybeShowShareAfterSave({');
        expect(save).toContain('if (!sharePrompted');
    });

    it('stays quiet when the first-record celebration took the screen', () => {
        expect(save).toContain('!firstRecordResultShown');
    });

    it('stays quiet when something failed to upload', () => {
        // 사진이 안 올라간 사람에게 앱을 권하는 것은 순서가 틀렸다.
        expect(save).toContain('uploadFailures.length === 0');
    });

    it('reports a failure rather than swallowing it', () => {
        expect(save).toContain("maybeOfferAppAfterSave(user).catch(onRefreshFailure('앱 권유'))");
    });
});

describe('both invite places agree on who may be asked', () => {
    it('shares one eligibility check instead of two copies', () => {
        // 기준이 둘이 되면 한쪽은 권하고 다른 쪽은 안 권하는 일이 생긴다.
        expect(APP).toContain('async function canOfferAndroidApp(user) {');
        const banner = APP.split('async function renderAndroidAppInvite(user) {')[1].slice(0, 600);
        expect(banner).toContain('if (!(await canOfferAndroidApp(user))) return;');
        expect(banner).not.toContain("detectWebPlatform() !== 'android'");
        const after = APP.split('async function maybeOfferAppAfterSave(user) {')[1].slice(0, 900);
        expect(after).toContain('if (!(await canOfferAndroidApp(user))) return false;');
    });

    it('sends the tap through the same recorder and guide', () => {
        // openAndroidApp 이 누름을 남기고 설치 안내를 띄운다. 그 길을 그대로 쓴다.
        const after = APP.split('async function maybeOfferAppAfterSave(user) {')[1].slice(0, 2400);
        expect(after).toContain('openAndroidApp()');
    });
});
