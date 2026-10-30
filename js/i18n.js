import { buildLocalizedUrl, getLocale as getRouteLocale } from './app-mode.js?v=562';
import { KO_MESSAGES } from './i18n-ko.js?v=562';
import { EN_MESSAGES } from './i18n-en.js?v=562';

const DEFAULT_LOCALE = 'ko';
const ENGLISH_LOCALE = 'en';

const MESSAGES = {
    ko: KO_MESSAGES,
    en: EN_MESSAGES
};

// 글자 말고 속성을 바꾸는 키: data-i18n-placeholder="키" 면 placeholder 를 그 키의 값으로.
// scripts/generate-en-entry.js 에도 같은 목록이 있어 영어 첫 화면을 미리 만든다(둘이 같은지는 테스트가 본다).
export const I18N_ATTRIBUTES = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-alt', 'alt'],
    ['data-i18n-title', 'title'],
    // 영어 판이 따로 있는 문서(약관·방침·토크노믹스)로 가는 링크
    ['data-i18n-href', 'href']
];

// {name} 은 값으로, {name|one|other} 는 값이 1 이면 one, 아니면 other 로 바꾼다(영어 복수형: "{days} {days|day|days}").
function interpolate(template = '', params = {}) {
    return String(template)
        .replace(/\{(\w+)\|([^|{}]*)\|([^{}]*)\}/g, (_, key, one, other) => (Number(params[key]) === 1 ? one : other))
        .replace(/\{(\w+)\}/g, (_, key) => (
            params[key] == null ? '' : String(params[key])
        ));
}

export function getLocale() {
    return getRouteLocale();
}

export function isEnglishLocale() {
    return getLocale() === ENGLISH_LOCALE;
}

// 사전에 그 키가 없을 때 어느 언어로 물러서나. 한국어는 한국어만 본다(지금과 같다).
// 다른 언어는 자기 → 영어 → 한국어. 세 번째 언어에 빠진 키가 있으면 한국어가 아니라 영어가 나온다.
function getFallbackChain(locale) {
    if (locale === DEFAULT_LOCALE) return [DEFAULT_LOCALE];
    return [...new Set([locale, ENGLISH_LOCALE, DEFAULT_LOCALE])];
}

// 사전에 있는 값만 돌려준다. 없으면 null.
function lookupMessage(key) {
    for (const locale of getFallbackChain(getLocale())) {
        const value = MESSAGES[locale]?.[key];
        if (value) return value;
    }
    return null;
}

export function t(key, params = {}) {
    return interpolate(lookupMessage(key) ?? key, params);
}

export function formatDate(value = new Date(), options = {}) {
    const date = value instanceof Date ? value : new Date(value);
    const locale = isEnglishLocale() ? 'en-US' : 'ko-KR';
    return new Intl.DateTimeFormat(locale, {
        timeZone: options.timeZone || 'Asia/Seoul',
        ...options
    }).format(date);
}

export { buildLocalizedUrl };

// 서버(콜러블) 오류 문장을 화면 언어로 고른다(해외 3단계 E6-2). 서버는 한국어 message 와 함께
// details.en 에 영어를 싣는다(functions/error-messages.js). 한국어 화면은 예전처럼 message 그대로,
// 다른 언어는 details[언어] → 한글 없는 message → fallback 순. 영어 화면에 서버 한국어가 나가지 않는다.
export function serverErrorText(error, fallback = '') {
    const message = String(error?.message || '').trim();
    if (getLocale() !== 'ko' && message.toLowerCase() === 'internal') return fallback;
    return localizedServerText(message, error?.details, fallback);
}

// 서버가 한국어로 만든 안내(교환 불가 사유 등)와 그 옆의 다른 언어 글({ en })에서 화면 언어로 고른다(E6-3).
// 한국어 화면은 서버 글 그대로. 다른 언어는 그 언어 글 → 한글 없는 서버 글 → fallback.
export function localizedServerText(text, localized = null, fallback = '') {
    const original = String(text || '').trim();
    const locale = getLocale();
    if (locale === 'ko') return original || fallback;
    const value = localized?.[locale];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (original && !/[가-힣]/.test(original)) return original;
    return fallback;
}

export function applyDomTranslations(doc = document) {
    if (!isEnglishLocale()) return;

    // 사전에 없는 키는 건드리지 않는다. 화면(HTML)만 새것이고 사전 파일은 브라우저에 남은 옛것일 때,
    // 키 이름("diet.uploadCta.title")이 글자 대신 찍혔다(2026-10-21 로컬 확인). 빌드가 넣어 둔 영어가 그대로 남는다.
    // 선택자 표·문장 바꿔치기 표는 2026-10-28(해외 3단계 E6-4)에 모두 이 키들로 옮기고 지웠다.
    const has = (key) => key && lookupMessage(key) !== null;
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (!has(key)) return;
        // 같은 글자를 다시 넣어도 자식 노드가 새로 생겨 화면 감시가 또 깨어난다.
        const value = t(key);
        if (el.textContent !== value) el.textContent = value;
    });
    // 동의 문구처럼 안에 링크가 있는 곳은 textContent로 갈아끼우면 링크가 사라진다.
    // 값은 이 파일 안의 상수뿐이라(사용자 입력이 아니다) innerHTML로 넣어도 안전하다.
    doc.querySelectorAll('[data-i18n-html]').forEach((el) => {
        const key = el.getAttribute('data-i18n-html');
        if (!has(key)) return;
        const html = t(key);
        // 같은 값을 다시 넣으면 안쪽 링크가 통째로 새로 만들어진다. 누르는 도중에
        // 그러면 클릭이 사라진 요소에 남는다.
        if (el.innerHTML === html) return;
        el.innerHTML = html;
    });
    I18N_ATTRIBUTES.forEach(([dataAttr, attr]) => {
        doc.querySelectorAll(`[${dataAttr}]`).forEach((el) => {
            const key = el.getAttribute(dataAttr);
            if (has(key)) el.setAttribute(attr, t(key));
        });
    });
}

let localeObserver = null;
let localeTranslateQueued = false;

export function markLocaleReady(doc = document) {
    doc.documentElement?.classList.remove('locale-loading');
}

export function installLocaleDomObserver(doc = document) {
    if (!isEnglishLocale() || localeObserver || typeof MutationObserver !== 'function') {
        markLocaleReady(doc);
        return;
    }
    const run = () => {
        localeTranslateQueued = false;
        applyDomTranslations(doc);
        markLocaleReady(doc);
    };
    localeObserver = new MutationObserver(() => {
        if (localeTranslateQueued) return;
        localeTranslateQueued = true;
        requestAnimationFrame(run);
    });
    localeObserver.observe(doc.body || doc.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });
    run();
}

if (typeof window !== 'undefined') {
    window.HabitSchoolI18n = {
        getLocale,
        t,
        formatDate,
        buildLocalizedUrl,
        applyDomTranslations,
        isEnglishLocale
    };
}
