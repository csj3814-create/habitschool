import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');

// 2026-09-28 제보: "앱에서 운동탭 새로고침 했는데 걸음수를 못 받아오고 있어."
// 앱(TWA)이 ?native= 없이 다시 열리고 sessionStorage 도 비어 있으면 앱 안인데도
// 웹으로 취급돼 "Health Connect 다시 가져오기" 버튼이 사라졌다.
function loadGetRememberedNativeAppSource({ search = '', referrer = '', stored = null } = {}) {
    const body = APP.split('function getRememberedNativeAppSource() {')[1].split('\n}\n')[0];
    const store = new Map(stored ? [['habitschoolNativeAppSource', stored]] : []);
    const sessionStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v))
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function(
        'window', 'document', 'sessionStorage', 'NATIVE_APP_SOURCE_SESSION_KEY',
        body
    );
    return {
        call: () => fn({ location: { search } }, { referrer }, sessionStorage, 'habitschoolNativeAppSource'),
        store
    };
}

describe('the Android app is recognised even when it reopens without ?native=', () => {
    it('uses the URL marker first', () => {
        const { call } = loadGetRememberedNativeAppSource({ search: '?native=android-widget' });
        expect(call()).toBe('android-widget');
    });

    it('uses the remembered marker next', () => {
        const { call } = loadGetRememberedNativeAppSource({ stored: 'android-launch-sync' });
        expect(call()).toBe('android-launch-sync');
    });

    it('falls back to the TWA referrer and remembers it', () => {
        const { call, store } = loadGetRememberedNativeAppSource({ referrer: 'android-app://com.habitschool.app/' });
        expect(call()).toBe('android-shell');
        expect(store.get('habitschoolNativeAppSource')).toBe('android-shell');
    });

    it('stays web for an ordinary browser visit', () => {
        const { call } = loadGetRememberedNativeAppSource({ referrer: 'https://www.google.com/' });
        expect(call()).toBe('');
    });

    it('does not treat another app as ours', () => {
        const { call } = loadGetRememberedNativeAppSource({ referrer: 'android-app://com.kakao.talk/' });
        expect(call()).toBe('');
    });
});
