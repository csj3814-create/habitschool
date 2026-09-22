import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-22 제보: "팝업에서 어떻게 하는지 보기 눌렀는데 반응 없고 배너에서
// 앱으로 열기 눌렀는데 반응이 없는데? 삼성인터넷에서 시험했어."
//
// 안내는 멀쩡히 만들어지고 있었다. 떼어 내서 폰 크기로 띄워 보니 3단계가 다
// 그려지고 display:flex, z-index 2400 으로 화면을 덮었다.
//
// 문제는 **언제** 붙느냐였다. 안내는 누르는 동작 중에 화면에 붙는다. 그 한 번의
// 탭이 끝나며 나오는 click 은 이제 손가락 밑에 있는 backdrop 으로 간다. 브라우저에서
// 재 보니 탭 직후 그 자리의 요소가 정확히 android-install-guide 였다. backdrop 은
// "바깥을 누르면 닫는다" 니까 그대로 닫힌다 — 열림과 닫힘이 한 동작에 끝나서
// 아무 반응도 없어 보인다. 마우스로는 재현되지 않아 터치 기기에서만 드러났다.

const APP = readRepoFile('js/app-core.js');

function loadHelper() {
    const start = APP.indexOf('const BACKDROP_IGNORE_CLICK_MS');
    const end = APP.indexOf('window.openAndroidApp = function openAndroidApp', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const timers = [];
    const api = Function('setTimeout', `${APP.slice(start, end)}
        return { attachBackdropDismiss, BACKDROP_IGNORE_CLICK_MS };`)(
        (fn) => { timers.push(fn); return timers.length; }
    );
    return { ...api, flushTimers: () => { timers.splice(0).forEach((fn) => fn()); } };
}

function fakeBackdrop() {
    const listeners = [];
    return {
        addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); },
        click(target) { listeners.forEach((fn) => fn({ target: target ?? this })); },
        listenerCount: () => listeners.length,
    };
}

describe('a sheet does not close on the tap that opened it', () => {
    it('attaches nothing while the opening event is still running', () => {
        const { attachBackdropDismiss } = loadHelper();
        const el = fakeBackdrop();
        attachBackdropDismiss(el, () => {});
        // 여는 탭이 흘러들어올 수 있는 동안에는 들을 귀가 없어야 한다.
        expect(el.listenerCount()).toBe(0);
    });

    it('ignores the click that arrives with the opening tap', () => {
        const { attachBackdropDismiss, flushTimers } = loadHelper();
        const el = fakeBackdrop();
        const dismiss = vi.fn();
        attachBackdropDismiss(el, dismiss);
        flushTimers();
        el.click();
        expect(dismiss).not.toHaveBeenCalled();
    });

    it('still closes when the member taps outside a moment later', () => {
        const { attachBackdropDismiss, flushTimers, BACKDROP_IGNORE_CLICK_MS } = loadHelper();
        const el = fakeBackdrop();
        const dismiss = vi.fn();
        const now = Date.now();
        const spy = vi.spyOn(Date, 'now');
        spy.mockReturnValue(now);
        attachBackdropDismiss(el, dismiss);
        flushTimers();
        spy.mockReturnValue(now + BACKDROP_IGNORE_CLICK_MS + 1);
        el.click();
        spy.mockRestore();
        expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('never closes from a tap inside the sheet', () => {
        const { attachBackdropDismiss, flushTimers } = loadHelper();
        const el = fakeBackdrop();
        const dismiss = vi.fn();
        const now = Date.now();
        const spy = vi.spyOn(Date, 'now');
        spy.mockReturnValue(now);
        attachBackdropDismiss(el, dismiss);
        flushTimers();
        spy.mockReturnValue(now + 5000);
        el.click({ inside: true });   // target !== backdrop
        spy.mockRestore();
        expect(dismiss).not.toHaveBeenCalled();
    });

    it('does nothing when handed nothing', () => {
        const { attachBackdropDismiss } = loadHelper();
        expect(() => attachBackdropDismiss(null, () => {})).not.toThrow();
        expect(() => attachBackdropDismiss(fakeBackdrop(), null)).not.toThrow();
    });
});

describe('every backdrop goes through that one door', () => {
    it('leaves no sheet closing itself the old way', () => {
        // 한 곳이라도 옛 방식으로 남아 있으면 그 시트만 같은 증상을 낸다.
        expect(APP).not.toContain('if (event.target === guide)');
        expect(APP).not.toContain('if (event.target === sheet)');
    });

    it('covers the install guide, the after-save sheet and the invite sheet', () => {
        expect(APP).toContain('attachBackdropDismiss(guide, () => window.closeAndroidInstallGuide());');
        expect(APP).toContain('attachBackdropDismiss(sheet, () => window.dismissAppAfterSave());');
        expect(APP).toContain('attachBackdropDismiss(sheet, () => window.dismissAndroidAppSheet());');
    });

    it('keeps the buttons working, which never depended on the backdrop', () => {
        const guide = APP.split('window.openAndroidApp = function openAndroidApp() {')[1].slice(0, 2600);
        expect(guide).toContain('onclick="closeAndroidInstallGuide(); goToAndroidApp();"');
        expect(guide).toContain('onclick="closeAndroidInstallGuide()"');
    });
});
