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
// 2026-11-02: 언제 권할지는 운동·마음 탭 카드가 정한다(tests/health-helper-card.test.js, 30분 넘게 묵으면 'refresh').
// 여기서는 그 카드가 쓰는 길 — 안드로이드 앱의 Health Connect 읽기 화면, 앱이 없으면 스토어 — 만 본다.
describe('the web app hands off to the Android app to read Health Connect', () => {
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
