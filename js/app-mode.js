const DEFAULT_MODE = 'default';
const SIMPLE_MODE = 'simple';
const SIMPLE_MODE_PATH = '/simple';
const ENGLISH_ENTRY_PATH = '/en';
// 영어 소개(랜딩) 페이지. 앱 로그인 화면(/en)과 주소를 나눠 둔다 —
// 외국 포털·검색에서 들어오는 링크는 여기를 가리키고, /en 은 한글판과 같은
// 로그인 화면이 된다. 예전에는 /en 이 로그아웃 상태일 때만 랜딩을 보여 줘서,
// 소개 페이지를 가리킬 안정적인 주소가 없었다.
const ENGLISH_LANDING_PATH = '/en/welcome';
// 구글플레이 TWA 전용 경로. 이 경로에서는 온체인(HBT·지갑·전환·스테이킹) 기능을
// 전부 끈 '라이트' 앱으로 동작한다. 플레이 정책상 개인 계정으로는 암호화폐 지갑을
// 배포할 수 없어, 스토어 빌드는 이 경로만 열도록 TWA를 구성한다.
const PLAY_MODE_PATH = '/app';

const DEFAULT_LOCALE = 'ko';
const ENGLISH_LOCALE = 'en';
const DEFAULT_TABS = ['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets'];
const SIMPLE_TABS = ['diet', 'exercise', 'sleep', 'profile'];

function getCurrentPathname() {
    return typeof window !== 'undefined' && window.location?.pathname
        ? window.location.pathname
        : '/';
}

export function normalizeAppPath(pathname = '/') {
    const normalized = String(pathname || '/').replace(/\/+$/, '');
    return normalized || '/';
}

export function getRouteContext(pathname = getCurrentPathname()) {
    const path = normalizeAppPath(pathname);
    const isEnglishLanding = path === ENGLISH_LANDING_PATH;
    const isEnglishEntry = path === ENGLISH_ENTRY_PATH
        || path === `${ENGLISH_ENTRY_PATH}/index.html`
        || isEnglishLanding;
    const isKoreanSimple = path === SIMPLE_MODE_PATH;
    const isPlay = path === PLAY_MODE_PATH || path === `${PLAY_MODE_PATH}/index.html`;
    const locale = isEnglishEntry ? ENGLISH_LOCALE : DEFAULT_LOCALE;
    // play는 전체 탭을 쓰는 default 계열이지만 온체인 UI만 감춘다(simple과 별개).
    const mode = (isEnglishEntry || isKoreanSimple) ? SIMPLE_MODE : DEFAULT_MODE;
    const defaultTab = locale === ENGLISH_LOCALE ? 'diet' : (mode === SIMPLE_MODE ? 'profile' : 'dashboard');

    return {
        path,
        locale,
        mode,
        isEnglish: locale === ENGLISH_LOCALE,
        isEnglishLanding,
        isSimple: mode === SIMPLE_MODE,
        isPlay,
        defaultTab,
        basePath: isPlay ? PLAY_MODE_PATH
            : (locale === ENGLISH_LOCALE ? ENGLISH_ENTRY_PATH : (mode === SIMPLE_MODE ? SIMPLE_MODE_PATH : '/'))
    };
}

const PLAY_CONTEXT_KEY = 'hs_play_context';

// TWA(안드로이드 앱)로 처음 열리면 android-app referrer가 온다. 그 순간 sessionStorage에
// 표시해 두면, 같은 앱 세션에서 버전 스위처로 어떤 경로(/, /simple, /en)로 이동해도
// 계속 '플레이 컨텍스트'로 남는다 → 앱 안에서는 절대 온체인이 노출되지 않는다.
// sessionStorage는 탭/세션 단위라 사용자의 일반 크롬 사용에는 새지 않는다(웹은 영향 없음).
function markPlayContextIfTwa() {
    try {
        if (typeof document === 'undefined' || typeof sessionStorage === 'undefined') return;
        if (String(document.referrer || '').startsWith('android-app://com.habitschool.app')) {
            sessionStorage.setItem(PLAY_CONTEXT_KEY, '1');
        }
    } catch (_) {}
}

function hasStickyPlayContext() {
    try {
        return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(PLAY_CONTEXT_KEY) === '1';
    } catch (_) {
        return false;
    }
}

// 온체인 기능을 꺼야 하는가. (1) /app 경로, (2) TWA 최초 진입(android-app referrer),
// (3) 같은 TWA 세션에서 한 번이라도 그랬으면 유지(sticky). 웹에서 /app을 직접 열면
// 라이트로 보이지만 sticky는 안 걸려, 다른 버전으로 나가면 정상 복귀한다(의도된 동작).
export function isPlayModeActive(pathname = getCurrentPathname()) {
    markPlayContextIfTwa();
    if (getRouteContext(pathname).isPlay) return true;
    return hasStickyPlayContext();
}

export function getLocale(pathname = getCurrentPathname()) {
    return getRouteContext(pathname).locale;
}

export function getAppModeFromPath(pathname = getCurrentPathname()) {
    return getRouteContext(pathname).mode;
}

export function isSimpleMode(pathname = getCurrentPathname()) {
    return getAppModeFromPath(pathname) === SIMPLE_MODE;
}

export function getAllowedTabsForMode(mode = getAppModeFromPath()) {
    return mode === SIMPLE_MODE ? [...SIMPLE_TABS] : [...DEFAULT_TABS];
}

export function getAllowedTabsForRoute(routeContext = getRouteContext()) {
    return getAllowedTabsForMode(routeContext?.mode || DEFAULT_MODE);
}

export function getDefaultTabForMode(mode = getAppModeFromPath(), locale = getLocale()) {
    if (mode === SIMPLE_MODE && locale === ENGLISH_LOCALE) return 'diet';
    return mode === SIMPLE_MODE ? 'profile' : 'dashboard';
}

export function getDefaultTabForRoute(routeContext = getRouteContext()) {
    return routeContext?.defaultTab || getDefaultTabForMode(routeContext?.mode || DEFAULT_MODE, routeContext?.locale || DEFAULT_LOCALE);
}

export function normalizeTabForMode(tabName, mode = getAppModeFromPath(), locale = getLocale()) {
    const fallback = getDefaultTabForMode(mode, locale);
    return getAllowedTabsForMode(mode).includes(tabName) ? tabName : fallback;
}

export function normalizeTabForRoute(tabName, routeContext = getRouteContext()) {
    const fallback = getDefaultTabForRoute(routeContext);
    return getAllowedTabsForRoute(routeContext).includes(tabName) ? tabName : fallback;
}

function applySearchParamsToUrl(url, searchParams) {
    if (!searchParams) return;

    const nextSearchParams = searchParams instanceof URLSearchParams
        ? new URLSearchParams(searchParams)
        : new URLSearchParams();

    if (!(searchParams instanceof URLSearchParams)) {
        Object.entries(searchParams).forEach(([key, value]) => {
            if (value == null || value === '') return;

            if (Array.isArray(value)) {
                value.forEach((item) => {
                    if (item == null || item === '') return;
                    nextSearchParams.append(key, String(item));
                });
                return;
            }

            nextSearchParams.set(key, String(value));
        });
    }

    const serialized = nextSearchParams.toString();
    url.search = serialized ? `?${serialized}` : '';
}

export function buildAppModeUrl(mode = getAppModeFromPath(), tabName = '', searchParams = null) {
    const nextMode = mode === SIMPLE_MODE ? SIMPLE_MODE : DEFAULT_MODE;
    const url = new URL(window.location.origin + (nextMode === SIMPLE_MODE ? SIMPLE_MODE_PATH : '/'));
    const defaultTab = getDefaultTabForMode(nextMode, DEFAULT_LOCALE);
    const normalizedTab = normalizeTabForMode(tabName || defaultTab, nextMode, DEFAULT_LOCALE);
    applySearchParamsToUrl(url, searchParams);
    if (normalizedTab !== defaultTab) {
        url.hash = `#${normalizedTab}`;
    }
    return url.toString();
}

export function buildLocalizedUrl(locale = getLocale(), tabName = '', searchParams = null) {
    const normalizedLocale = locale === ENGLISH_LOCALE ? ENGLISH_LOCALE : DEFAULT_LOCALE;
    const routeContext = normalizedLocale === ENGLISH_LOCALE
        ? getRouteContext(ENGLISH_ENTRY_PATH)
        : getRouteContext('/');
    const url = new URL(window.location.origin + routeContext.basePath);
    const defaultTab = getDefaultTabForRoute(routeContext);
    const normalizedTab = normalizeTabForRoute(tabName || defaultTab, routeContext);
    applySearchParamsToUrl(url, searchParams);
    if (normalizedTab !== defaultTab) {
        url.hash = `#${normalizedTab}`;
    }
    return url.toString();
}

export function applyAppModeChrome(doc = document) {
    const routeContext = getRouteContext(doc.defaultView?.location?.pathname || window.location.pathname);
    const simpleMode = routeContext.isSimple;
    const englishMode = routeContext.locale === ENGLISH_LOCALE;
    // sticky 포함: TWA 세션이면 /가 아니어도(예: ko로 전환해도) 라이트 UI 유지.
    const playMode = routeContext.isPlay || hasStickyPlayContext();

    doc.documentElement?.classList.toggle('simple-mode', simpleMode);
    doc.documentElement?.classList.toggle('locale-en', englishMode);
    doc.documentElement?.classList.toggle('en-landing', routeContext.isEnglishLanding);
    doc.documentElement?.classList.toggle('locale-ko', !englishMode);
    doc.documentElement?.classList.toggle('play-mode', playMode);
    if (doc.documentElement) doc.documentElement.lang = routeContext.locale;

    if (doc.body) {
        doc.body.classList.toggle('simple-mode', simpleMode);
        doc.body.classList.toggle('locale-en', englishMode);
        doc.body.classList.toggle('locale-ko', !englishMode);
        doc.body.classList.toggle('play-mode', playMode);
        doc.body.dataset.appMode = playMode ? 'play' : (simpleMode ? SIMPLE_MODE : DEFAULT_MODE);
        doc.body.dataset.locale = routeContext.locale;
    }

    const skipLink = doc.querySelector('.skip-to-content');
    if (skipLink) {
        skipLink.setAttribute('href', `#${getDefaultTabForRoute(routeContext)}`);
        if (englishMode) skipLink.textContent = 'Skip to main content';
    }

    const userGreeting = doc.getElementById('user-greeting');
    if (userGreeting) {
        userGreeting.setAttribute('tabindex', '0');
        userGreeting.setAttribute('aria-label', englishMode ? 'Open profile' : (simpleMode ? '간편 프로필 열기' : '프로필 열기'));
    }

    return simpleMode;
}
