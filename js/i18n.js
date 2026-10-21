import { buildLocalizedUrl, getLocale as getRouteLocale } from './app-mode.js?v=536';
import { KO_MESSAGES } from './i18n-ko.js?v=536';
import { EN_MESSAGES } from './i18n-en.js?v=536';

const DEFAULT_LOCALE = 'ko';
const ENGLISH_LOCALE = 'en';

const MESSAGES = {
    ko: KO_MESSAGES,
    en: EN_MESSAGES
};

const ENGLISH_TEXT_REPLACEMENTS = new Map([
    ['AI 분석', 'AI analysis'],
    ['분석 보기', 'View analysis'],
    ['분석 중...', 'Analyzing...'],
    ['사진 올리기', 'Upload photo'],
    ['캡처 올리기', 'Upload screenshot'],
    ['운동 이미지 올리기', 'Upload workout photo'],
    ['운동 영상 올리기', 'Upload workout video'],
    ['운동 이미지 등록', 'Add workout photo'],
    ['운동 영상 등록', 'Add workout video'],
    ['운동 이미지', 'Workout photo'],
    ['운동 영상', 'Workout video'],
    ['사진은 촬영 당일에만 등록 가능합니다.', 'Photos can only be uploaded on the day they were taken.'],
    ['영상은 촬영 당일에만 등록 가능합니다.', 'Videos can only be uploaded on the day they were recorded.'],
    ['삭제', 'Remove'],
    ['X 삭제', 'X Remove'],
    ['미달성', 'Not yet'],
    ['입력', 'Enter'],
    ['접기', 'Collapse'],
    ['펼치기', 'Expand'],
    ['시작', 'Start'],
    ['일시정지', 'Pause'],
    ['재개', 'Resume'],
    ['중단', 'Stop'],
    ['식단 저장하기', 'Save food log'],
    ['운동 저장하기', 'Save exercise log'],
    ['마음 저장하기', 'Save mind log'],
    ['식단 저장하고 포인트 받기', 'Save food log'],
    ['운동 저장하고 포인트 받기', 'Save exercise log'],
    ['마음 저장하고 포인트 받기', 'Save mind log'],
    ['2일 이상 지난 날짜에 저장해도 포인트는 올라가지 않습니다.', 'Past-date edits are saved, but points are not added.']
]);

const SELECTOR_TEXTS = [
    ['.skip-to-content', 'Skip to main content'],
    ['#loginBtn', 'Start with Google'],
    // 로그인 화면이 /en 에서도 뜨게 되면서, 여기 한국어가 그대로 보였다.
    ['#login-modal .login-title', 'Habit School'],
    ['#simple-mode-default-btn', '한국어'],
    ['button[onclick*="openTab(\'diet\')"]', '🥗 Food'],
    ['button[onclick*="openTab(\'exercise\')"]', '🏃 Exercise'],
    ['button[onclick*="openTab(\'sleep\')"]', '🧘 Mind'],
    ['button[onclick*="openTab(\'profile\')"]', '👤 Profile'],
    ['#diet .record-flow-kicker', 'Guide'],
    ['#diet .simple-mode-record-title', 'Log your food today'],
    ['#diet-guide-body h3', 'Save up to 4 meal photos.'],
    ['#diet-guide-status', 'Add your first meal photo to start today’s food log.'],
    ['#diet-guide-body .record-flow-actions button:nth-child(1)', 'Take photo'],
    ['#diet-guide-body .record-flow-actions button:nth-child(2)', 'Choose photo'],
    ['#diet-guide-body .record-flow-actions button:nth-child(3)', 'Enter fasting metrics'],
    ['#diet .card h3', '🍽️ Meal photos'],
    ['#diet-box-breakfast .upload-area > span:first-child', 'Meal 1'],
    ['#diet-box-lunch .upload-area > span:first-child', 'Meal 2'],
    ['#diet-box-dinner .upload-area > span:first-child', 'Meal 3'],
    ['#diet-box-snack .upload-area > span:first-child', 'Meal 4'],
    ['#txt-breakfast', 'Upload photo'],
    ['#txt-lunch', 'Upload photo'],
    ['#txt-dinner', 'Upload photo'],
    ['#txt-snack', 'Upload photo'],
    ['#ai-btn-breakfast', '✨ AI analysis'],
    ['#ai-btn-lunch', '✨ AI analysis'],
    ['#ai-btn-dinner', '✨ AI analysis'],
    ['#ai-btn-snack', '✨ AI analysis'],
    ['.card-fasting h3', '📈 Morning fasting metrics'],
    ['#fasting-graph-card h3', '📊 Fasting trends (last 30 days)'],
    ['#exercise .record-flow-kicker', 'Guide'],
    ['#exercise .simple-mode-record-title', 'Log your exercise today'],
    ['#exercise-guide-body h3', 'Steps, workout photos, or workout videos all count.'],
    ['#exercise-guide-status', 'Add steps, a workout photo, or a workout video to save today’s exercise log.'],
    ['#exercise-guide-body .record-flow-actions button:nth-child(1)', 'Enter steps'],
    ['#exercise-guide-body .record-flow-actions button:nth-child(2)', 'Workout photo'],
    ['#exercise-guide-body .record-flow-actions button:nth-child(3)', 'Workout video'],
    ['#exercise .quest-item span:first-child', '🏃 Cardio/steps 10+5P, strength 10+5P'],
    ['#quest-exercise', 'Not yet'],
    ['#step-card h3', '👣 Today’s steps'],
    ['#exercise-cardio-title', '📸 Workout photo'],
    ['#exercise-cardio-date-note', '📸 Photos can only be uploaded on the day they were taken.'],
    ['#exercise-strength-title', '📹 Workout video'],
    ['#exercise-strength-date-note', '📹 Videos can only be uploaded on the day they were recorded.'],
    ['#exercise-strength-date-note + .guide-btn', '📸 Easy 10-second hyperlapse guide'],
    ['#sleep .record-flow-kicker', 'Guide'],
    ['#sleep .simple-mode-record-title', 'Log your mind today'],
    ['#sleep-guide-body h3', 'Reset with sleep, meditation, and gratitude.'],
    ['#mind-guide-status', 'Try a sleep screenshot, meditation, or gratitude journal.'],
    ['#sleep-guide-body .record-flow-actions button:nth-child(1)', 'Sleep screenshot'],
    ['#sleep-guide-body .record-flow-actions button:nth-child(2)', 'Start meditation'],
    ['#sleep-guide-body .record-flow-actions button:nth-child(3)', 'Gratitude journal'],
    ['#sleep .quest-item span:first-child', '🧘 Mind/sleep log (10P each, up to 20P)'],
    ['#quest-mind', 'Not yet'],
    ['#sleep .upload-cta-text strong', 'Upload a sleep screenshot'],
    ['#sleep .upload-cta-text span', 'AI will analyze your sleep pattern and suggest improvements.'],
    ['#sleep .card h3', '🌙 Sleep analysis'],
    ['#sleep-date-note', '📸 Photos can only be uploaded on the day they were taken.'],
    ['#txt-sleep', 'Upload screenshot'],
    ['#ai-btn-sleep', '✨ AI analysis'],
    ['#sleep-hc-btn', 'Import sleep from Health Connect'],
    ['#body-hc-btn', '🔗 Health Connect'],
    ['#meditation-card-title', '🧘 Today’s meditation'],
    ['#meditation-practice-card .meditation-practice-kicker', 'Breathing guide'],
    ['.meditation-common-note', 'Sit comfortably. Do not force it. Stop if you feel dizzy.'],
    ['.meditation-journal-label', 'Three-line gratitude journal after meditation'],
    ['#gratitude-voice-btn', 'Voice input']
];

// 화면에 같은 요소가 여러 벌 있는 곳(버전 스위처는 로그인 화면과 프로필 탭에 하나씩).
// setText 는 첫 번째만 바꾸므로, 전부 바꿔야 하는 선택자는 여기 둔다.
// (기본 목록을 통째로 querySelectorAll 로 바꾸면 '#diet .card h3' 같은 선택자가
//  의도치 않은 요소까지 덮어쓴다.)
const SELECTOR_TEXTS_ALL = [
    // 한국어 기본형 앱. "Full" 로는 한국어 앱이라는 것을 알 수 없어, 한국어 회원이 찾는 이름으로 둔다.
    ['.version-switcher [data-version="ko"]', '한국어'],
    ['.version-switcher [data-version="simple"]', 'Simple'],
    ['.version-switcher [data-version="en"]', 'English'],
    ['.version-switcher [data-version="app"]', 'Lite'],
    // 프로필 탭 약관·방침 링크 텍스트 (로그인 화면·프로필에 각각 있을 수 있음)
    ['a[href="/terms.html"]', 'Terms'],
    ['a[href="/privacy.html"]', 'Privacy']
];

const SELECTOR_ATTRS = [
    // 프로필 맨 아래 약관·방침(E2 2부). 로그인 화면 링크와 따로 고른다 — setAttr 는 첫 요소만 바꾼다.
    ['#profile a[href="/terms.html"]', 'href', '/en/terms'],
    ['#profile a[href="/privacy.html"]', 'href', '/en/privacy'],
    // 화면에 보이는 글자는 다 영어인데 스크린리더가 읽는 값만 한국어로 남아 있었다.
    ['#login-modal > img', 'alt', 'Habit School logo'],
    ['#invite-landing-card', 'alt', 'Record card shared by the friend who invited you'],
    ['#loginBtn', 'aria-label', 'Sign in with Google'],
    ['.version-switcher', 'aria-label', 'App version'],
    ['#guest-demo-entry-btn', 'aria-label', 'Try Habit School without signing in'],
    ['#selected-date', 'aria-label', 'Date'],
    ['#weight', 'placeholder', 'Weight (kg)'],
    ['#glucose', 'placeholder', 'Fasting glucose (mg/dL)'],
    ['#bp-systolic', 'placeholder', 'Systolic BP'],
    ['#bp-diastolic', 'placeholder', 'Diastolic BP'],
    ['#step-manual-input', 'placeholder', 'Enter manually'],
    ['#sleep-img', 'aria-label', 'Upload sleep screenshot'],
    ['#preview-breakfast', 'alt', 'Meal 1 preview'],
    ['#preview-lunch', 'alt', 'Meal 2 preview'],
    ['#preview-dinner', 'alt', 'Meal 3 preview'],
    ['#preview-snack', 'alt', 'Meal 4 preview'],
    ['#preview-sleep', 'alt', 'Sleep screenshot preview'],
    ['#rm-breakfast', 'aria-label', 'Remove meal 1 photo'],
    ['#rm-lunch', 'aria-label', 'Remove meal 2 photo'],
    ['#rm-dinner', 'aria-label', 'Remove meal 3 photo'],
    ['#rm-snack', 'aria-label', 'Remove meal 4 photo'],
    ['#rm-sleep', 'aria-label', 'Remove sleep screenshot'],
    ['#user-greeting', 'aria-label', 'Open profile'],
    // 탭 버튼 aria-label (한국어가 그대로 남아 있었음)
    ['button[onclick="openTab(\'diet\')"]', 'aria-label', 'Diet'],
    ['button[onclick="openTab(\'exercise\')"]', 'aria-label', 'Exercise'],
    ['button[onclick="openTab(\'sleep\')"]', 'aria-label', 'Mind'],
    ['button[onclick="openTab(\'dashboard\')"]', 'aria-label', 'My records'],
    ['button[onclick="openTab(\'assets\')"]', 'aria-label', 'Assets'],
    ['#btn-tab-gallery', 'aria-label', 'Gallery'],
    // 기록 가이드 카드 aria-label
    ['[data-record-guide="diet"]', 'aria-label', 'Diet logging guide'],
    ['[data-record-guide="exercise"]', 'aria-label', 'Exercise logging guide'],
    ['[data-record-guide="sleep"]', 'aria-label', 'Mind & sleep logging guide'],
    // 오류 제보 버튼
    ['#bug-report-fab', 'aria-label', 'Report a bug'],
    // 수면 시간 입력
    ['#sleep-hours', 'placeholder', 'e.g. 7.5'],
    ['#shared-import-preview', 'alt', 'Shared photo preview'],
    ['#share-preview-thumb', 'alt', 'Share preview'],
    ['#bug-report-modal .close-btn', 'aria-label', 'Close'],
    ['#share-platform-modal .share-modal-close-x', 'aria-label', 'Close'],
    // 자산 탭 지갑 주소 단추 (E3-2)
    ['.wallet-addr-btn[onclick*="copyWalletAddress"]', 'title', 'Copy address'],
    ['.wallet-addr-btn[onclick*="openWalletExplorer"]', 'title', 'View in explorer'],
    // 프로필 탭 약관·방침 링크: 한국어 URL → 영문 URL
    ['a[href="/terms.html"]', 'href', '/en/terms'],
    ['a[href="/privacy.html"]', 'href', '/en/privacy']
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

export function translateText(value = '') {
    if (!isEnglishLocale()) return value;
    const raw = String(value || '');
    const trimmed = raw.trim();
    if (!trimmed) return value;
    return ENGLISH_TEXT_REPLACEMENTS.get(trimmed) || value;
}

function setText(doc, selector, value) {
    const el = doc.querySelector(selector);
    if (!el || el.dataset.i18nLocked === 'true') return;
    if (String(el.textContent || '').trim() === value) return;
    el.textContent = value;
}

function setTextAll(doc, selector, value) {
    doc.querySelectorAll(selector).forEach((el) => {
        if (el.dataset.i18nLocked === 'true') return;
        if (String(el.textContent || '').trim() === value) return;
        el.textContent = value;
    });
}

function setAttr(doc, selector, attr, value) {
    const el = doc.querySelector(selector);
    if (!el) return;
    if (el.getAttribute(attr) === value) return;
    el.setAttribute(attr, value);
}

function replaceExactTextNodes(root) {
    if (!root || !isEnglishLocale() || typeof document === 'undefined' || typeof document.createTreeWalker !== 'function') return;
    const filter = window.NodeFilter || NodeFilter;
    const walker = document.createTreeWalker(root, filter.SHOW_TEXT, {
        acceptNode(node) {
            const text = String(node.nodeValue || '').trim();
            if (!text || !ENGLISH_TEXT_REPLACEMENTS.has(text)) return filter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent || parent.closest('script,style,noscript,template')) return filter.FILTER_REJECT;
            return filter.FILTER_ACCEPT;
        }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
        const original = String(node.nodeValue || '');
        const trimmed = original.trim();
        node.nodeValue = original.replace(trimmed, ENGLISH_TEXT_REPLACEMENTS.get(trimmed));
    });
}

export function applyDomTranslations(doc = document) {
    if (!isEnglishLocale()) return;

    SELECTOR_TEXTS.forEach(([selector, value]) => setText(doc, selector, value));
    SELECTOR_TEXTS_ALL.forEach(([selector, value]) => setTextAll(doc, selector, value));
    SELECTOR_ATTRS.forEach(([selector, attr, value]) => setAttr(doc, selector, attr, value));

    // 사전에 없는 키는 건드리지 않는다. 화면(HTML)만 새것이고 사전 파일은 브라우저에 남은 옛것일 때,
    // 키 이름("diet.uploadCta.title")이 글자 대신 찍혔다(2026-10-21 로컬 확인). 빌드가 넣어 둔 영어가 그대로 남는다.
    const has = (key) => key && lookupMessage(key) !== null;
    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (has(key)) el.textContent = t(key);
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
    doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (has(key)) el.setAttribute('placeholder', t(key));
    });
    doc.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria-label');
        if (has(key)) el.setAttribute('aria-label', t(key));
    });

    ['diet', 'exercise', 'sleep', 'profile', 'submit-bar'].forEach((id) => {
        replaceExactTextNodes(doc.getElementById(id));
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
        translateText,
        isEnglishLocale
    };
}
