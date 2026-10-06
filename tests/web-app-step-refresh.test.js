import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const fnSource = (name) => {
    const start = APP.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return APP.slice(start, APP.indexOf('\n}\n', start) + 2);
};

// 2026-10-02 제보: "삼성헬스 8100, 위젯 6900, 앱에는 2200". 홈 화면 웹앱은 Health Connect
// 를 읽는 길(Play 앱이 열릴 때)을 지나지 않아 오전 숫자가 밤까지 남았다.
function load({ nativeSource = '', ua = 'Mozilla/5.0 (Linux; Android 10; K)', selected = '2026-10-02', today = '2026-10-02' } = {}) {
    return new Function(
        'ENABLE_HEALTH_CONNECT_STEP_IMPORT', 'getRememberedNativeAppSource', 'navigator', 'document', 'getKstDateString',
        `const WEB_APP_STEP_STALE_MS = 30 * 60 * 1000;
        ${fnSource('shouldOfferStepRefreshFromWebApp')}
        return shouldOfferStepRefreshFromWebApp;`
    )(
        true,
        () => nativeSource,
        { userAgent: ua },
        { getElementById: () => ({ value: selected }) },
        () => today
    );
}

describe('the home-screen web app can ask the Play app for fresh steps', () => {
    const now = Date.parse('2026-10-02T11:10:00Z');
    const morning = Date.parse('2026-10-02T02:31:00Z');

    it('offers the button when the steps on an Android web app are hours old', () => {
        expect(load()(morning, now)).toBe(true);
    });

    it('does not offer it inside the Play app, which re-reads on return by itself', () => {
        expect(load({ nativeSource: 'android-shell' })(morning, now)).toBe(false);
    });

    it('does not offer it off Android, for a past day, or for fresh steps', () => {
        expect(load({ ua: 'Mozilla/5.0 (iPhone)' })(morning, now)).toBe(false);
        expect(load({ selected: '2026-10-01' })(morning, now)).toBe(false);
        expect(load()(now - 5 * 60 * 1000, now)).toBe(false);
    });

    it('opens the Play app sync screen, or the store when the app is missing', () => {
        const url = new Function(`const ANDROID_APP_PACKAGE = 'com.habitschool.app';
            ${fnSource('buildAndroidStepSyncIntentUrl')} return buildAndroidStepSyncIntentUrl;`)()('https://habitschool.web.app/?tab=exercise');
        expect(url.startsWith('intent://health-connect/sync?')).toBe(true);
        expect(url).toContain('#Intent;scheme=habitschool;package=com.habitschool.app;');
        expect(url).toContain('returnTo=https%3A%2F%2Fhabitschool.web.app%2F%3Ftab%3Dexercise');
        expect(url).toContain('S.browser_fallback_url=' + encodeURIComponent('https://play.google.com/store/apps/details?id=com.habitschool.app'));
        expect(url.endsWith(';end')).toBe(true);
    });
});
