import { buildLocalizedUrl, getLocale as getRouteLocale } from './app-mode.js?v=250';

const DEFAULT_LOCALE = 'ko';
const ENGLISH_LOCALE = 'en';

const MESSAGES = {
    ko: {
        'common.save': '저장하기',
        'common.logout': '로그아웃',
        'common.loading': '확인 중...',
        'auth.loginRequired': '로그인이 필요합니다.',
        'auth.startWithGoogle': 'Google로 시작하기',
        'profile.languageKorean': '한국어',
        'profile.languageEnglish': 'English',
        'notification.enable': '알림 켜기',
        'toast.aiFailed': 'AI 분석에 실패했습니다. 다시 시도해 주세요.',
        'toast.analysisFailed': '분석 중 오류가 발생했습니다.',
        'toast.notHealthScreenshot': '건강/만보기 앱 캡처가 아닌 것 같습니다.'
    },
    en: {
        'common.save': 'Save',
        'common.logout': 'Log out',
        'common.loading': 'Checking...',
        'auth.loginRequired': 'Please sign in first.',
        'auth.startWithGoogle': 'Start with Google',
        'profile.languageKorean': '한국어',
        'profile.languageEnglish': 'English',
        'notification.enable': 'Turn on notifications',
        'toast.aiFailed': 'AI analysis failed. Please try again.',
        'toast.analysisFailed': 'Something went wrong during analysis.',
        'toast.notHealthScreenshot': 'This does not look like a health or step-count screenshot.',
        'diet.grade.A': 'Excellent',
        'diet.grade.B': 'Good',
        'diet.grade.C': 'Average',
        'diet.grade.D': 'Needs work',
        'diet.grade.F': 'High risk',
        'diet.category.natural': 'Whole food',
        'diet.category.processed': 'Minimally processed',
        'diet.category.ultraprocessed': 'Ultra-processed',
        'diet.category.other': 'Other',
        'diet.score.vitamins': 'Vitamins',
        'diet.score.minerals': 'Minerals',
        'diet.score.fiber': 'Fiber',
        'diet.score.antioxidants': 'Antioxidants',
        'diet.naturalRatio': 'Whole-food ratio',
        'diet.micronutrientScore': 'Micronutrient score',
        'diet.insulinImpact': 'Likely insulin impact',
        'diet.daySummary.wholeFoods': 'Whole foods {value}%',
        'diet.daySummary.ultra': '{count} ultra-processed item(s)',
        'diet.daySummary.noUltra': 'No ultra-processed items',
        'exercise.intensity.low': 'Light',
        'exercise.intensity.moderate': 'Moderate',
        'exercise.intensity.high': 'Hard',
        'exercise.intensity.veryHigh': 'Very hard',
        'exercise.progress.complete': 'Complete!',
        'exercise.progress.almost': 'Almost there',
        'exercise.progress.half': 'Halfway',
        'exercise.progress.keepGoing': 'Keep going',
        'exercise.type': 'Detected',
        'exercise.intensityTitle': 'Exercise intensity analysis',
        'exercise.dailyProgress': 'Daily recommendation progress',
        'exercise.coachFeedback': 'AI trainer feedback',
        'mind.sleepAnalysis': 'Sleep analysis',
        'mind.mindAnalysis': 'Mind analysis',
        'mind.sleepDuration': 'Sleep duration',
        'mind.sleepQuality': 'Sleep quality',
        'mind.emotionTone': 'Emotional tone',
        'mind.stressLevel': 'Stress',
        'mind.coachFeedback': 'AI coach feedback',
        'voice.unsupported': 'Voice input is not supported in this browser.',
        'voice.idle': 'Voice input',
        'voice.starting': 'Listening...',
        'voice.listening': 'Listening...',
        'voice.startStatus': 'Listening. Speak your gratitude journal now.',
        'voice.resultStatus': 'Adding what you said to the journal.',
        'voice.retry': 'Voice input failed. Please try again.',
        'voice.permission': 'Allow microphone permission to use voice input.',
        'voice.noSpeech': 'I could not hear anything. Please try again.',
        'voice.noMic': 'Could not find a microphone.',
        'voice.network': 'Please check your network connection.',
        'voice.done': 'Voice input complete.',
        'voice.tryAgain': 'I could not hear anything. Please try again.',
        'voice.startingMic': 'Opening the microphone...',
        'profile.notificationGranted': 'Notifications are on for this device.',
        'profile.notificationDefault': 'Turn on reminders for check-ins and progress nudges.',
        'profile.notificationDenied': 'Notifications are blocked in your browser settings.',
        'profile.notificationUnsupported': 'This browser does not support push notifications.',
        'profile.notificationInstallRequired': 'Install Habit School to your home screen first on iPhone/iPad.'
    }
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
    ['#simple-mode-default-btn', '한국어'],
    ['button[onclick*="openTab(\'diet\')"]', '🥗 Food'],
    ['button[onclick*="openTab(\'exercise\')"]', '🏃 Exercise'],
    ['button[onclick*="openTab(\'sleep\')"]', '🧘 Mind'],
    ['button[onclick*="openTab(\'profile\')"]', '👤 Profile'],
    ['#diet .record-flow-kicker', 'Guide'],
    ['#diet .simple-mode-record-title', 'Log your food today'],
    ['#diet-guide-body h3', 'Save up to 4 meal photos.'],
    ['#diet-guide-status', 'Add your first meal photo to start today’s food log.'],
    ['#diet-guide-badge', '0/4'],
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
    ['#exercise-guide-badge', '0 ready'],
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
    ['#mind-guide-badge', '0 ready'],
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
    ['#meditation-card-title', '🧘 Today’s meditation'],
    ['#meditation-practice-card .meditation-practice-kicker', 'Breathing guide'],
    ['.meditation-common-note', 'Sit comfortably. Do not force it. Stop if you feel dizzy.'],
    ['.meditation-journal-label', 'Three-line gratitude journal after meditation'],
    ['#gratitude-voice-btn', 'Voice input']
];

const SELECTOR_ATTRS = [
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
    ['#user-greeting', 'aria-label', 'Open profile']
];

function interpolate(template = '', params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, key) => (
        params[key] == null ? '' : String(params[key])
    ));
}

export function getLocale() {
    return getRouteLocale();
}

export function isEnglishLocale() {
    return getLocale() === ENGLISH_LOCALE;
}

export function t(key, params = {}) {
    const locale = getLocale();
    const table = MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE];
    const fallback = MESSAGES[DEFAULT_LOCALE] || {};
    return interpolate(table[key] || fallback[key] || key, params);
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
    SELECTOR_ATTRS.forEach(([selector, attr, value]) => setAttr(doc, selector, attr, value));

    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        if (key) el.textContent = t(key);
    });
    doc.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (key) el.setAttribute('placeholder', t(key));
    });
    doc.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
        const key = el.getAttribute('data-i18n-aria-label');
        if (key) el.setAttribute('aria-label', t(key));
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
