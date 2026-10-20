// 언어별 사전(해외 3단계, 2026-10-21). 키 기반 번역으로 옮기는 동안 사전끼리 어긋나지 않게 묶는다.

import { afterEach, describe, expect, it } from 'vitest';
import { KO_MESSAGES } from '../js/i18n-ko.js';
import { EN_MESSAGES } from '../js/i18n-en.js';
import { t } from '../js/i18n.js';

const HANGUL = /[가-힣]/;
// 영어 화면에 일부러 한국어로 두는 값. 늘릴 때는 이유를 적는다.
const ENGLISH_VALUES_ALLOWED_TO_HOLD_KOREAN = new Set([
    'profile.languageKorean', // 한국어로 바꾸는 버튼은 한국어 이름으로 보여야 찾는다
    'login.switchToKorean', // 같은 이유 — 영어 로그인 화면의 한국어 단추
]);

function onPath(pathname) {
    globalThis.window = { location: { pathname, origin: 'https://habitschool.web.app' } };
}

afterEach(() => {
    delete globalThis.window;
});

describe('사전 짝', () => {
    it('한국어 사전의 키는 영어 사전에도 있다', () => {
        const missing = Object.keys(KO_MESSAGES).filter((key) => !(key in EN_MESSAGES));
        expect(missing).toEqual([]);
    });

    it('영어 사전 값에는 한글이 없다', () => {
        const korean = Object.entries(EN_MESSAGES)
            .filter(([key, value]) => HANGUL.test(value) && !ENGLISH_VALUES_ALLOWED_TO_HOLD_KOREAN.has(key))
            .map(([key]) => key);
        expect(korean).toEqual([]);
    });

    it('빈 값이 없다', () => {
        for (const table of [KO_MESSAGES, EN_MESSAGES]) {
            expect(Object.entries(table).filter(([, value]) => !String(value).trim())).toEqual([]);
        }
    });
});

describe('t() 가 고르는 값', () => {
    it('한국어 화면은 한국어 사전 값을 그대로 준다', () => {
        onPath('/');
        expect(t('common.save')).toBe(KO_MESSAGES['common.save']);
        expect(t('reconsent.signup.later')).toBe('그만두기');
    });

    it('한국어 화면에서 한국어 사전에 없는 키는 지금처럼 키 이름이 나온다 (영어로 물러서지 않는다)', () => {
        onPath('/app');
        const englishOnlyKey = Object.keys(EN_MESSAGES).find((key) => !(key in KO_MESSAGES));
        expect(englishOnlyKey).toBeTruthy();
        expect(t(englishOnlyKey)).toBe(englishOnlyKey);
    });

    it('영어 화면은 영어 사전 값을 준다', () => {
        onPath('/en');
        expect(t('common.save')).toBe(EN_MESSAGES['common.save']);
    });

    it('자리표시를 채운다', () => {
        onPath('/en');
        const key = Object.keys(EN_MESSAGES).find((k) => /\{\w+\}/.test(EN_MESSAGES[k]));
        const name = EN_MESSAGES[key].match(/\{(\w+)\}/)[1];
        expect(t(key, { [name]: 'X7' })).toContain('X7');
    });
});

describe('화면 바꿔 끼우기', () => {
    it('사전에 없는 키는 글자를 키 이름으로 덮어쓰지 않는다 (옛 사전이 브라우저에 남았을 때)', async () => {
        onPath('/en');
        const { applyDomTranslations } = await import('../js/i18n.js');
        const make = (attr, key, text) => {
            const el = { getAttribute: (name) => (name === attr ? key : null), textContent: text, innerHTML: text, attrs: {}, setAttribute(name, value) { this.attrs[name] = value; } };
            return el;
        };
        const fresh = make('data-i18n', 'no.such.key.yet', 'Upload a meal photo!');
        const known = make('data-i18n', 'common.save', '저장하기');
        const aria = make('data-i18n-aria-label', 'no.such.key.yet', '');
        const doc = {
            querySelector: () => null,
            querySelectorAll: (selector) => ({ '[data-i18n]': [fresh, known], '[data-i18n-aria-label]': [aria] }[selector] || []),
            getElementById: () => null,
        };
        applyDomTranslations(doc);
        expect(fresh.textContent).toBe('Upload a meal photo!');
        expect(known.textContent).toBe(EN_MESSAGES['common.save']);
        expect(aria.attrs).toEqual({});
    });
});
