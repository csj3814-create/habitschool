const DEFAULT_MODE = 'default';
const SIMPLE_MODE = 'simple';
const SIMPLE_MODE_PATH = '/simple';
const ENGLISH_ENTRY_PATH = '/en';

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
    const isEnglishEntry = path === ENGLISH_ENTRY_PATH || path === `${ENGLISH_ENTRY_PATH}/index.html`;
    const isKoreanSimple = path === SIMPLE_MODE_PATH;
    const locale = isEnglishEntry ? ENGLISH_LOCALE : DEFAULT_LOCALE;
    const mode = (isEnglishEntry || isKoreanSimple) ? SIMPLE_MODE : DEFAULT_MODE;
    const defaultTab = locale === ENGLISH_LOCALE ? 'diet' : (mode === SIMPLE_MODE ? 'profile' : 'dashboard');

    return {
        path,
        locale,
        mode,
        isEnglish: locale === ENGLISH_LOCALE,
        isSimple: mode === SIMPLE_MODE,
        defaultTab,
        basePath: locale === ENGLISH_LOCALE ? ENGLISH_ENTRY_PATH : (mode === SIMPLE_MODE ? SIMPLE_MODE_PATH : '/')
    };
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

    doc.documentElement?.classList.toggle('simple-mode', simpleMode);
    doc.documentElement?.classList.toggle('locale-en', englishMode);
    doc.documentElement?.classList.toggle('locale-ko', !englishMode);
    if (doc.documentElement) doc.documentElement.lang = routeContext.locale;

    if (doc.body) {
        doc.body.classList.toggle('simple-mode', simpleMode);
        doc.body.classList.toggle('locale-en', englishMode);
        doc.body.classList.toggle('locale-ko', !englishMode);
        doc.body.dataset.appMode = simpleMode ? SIMPLE_MODE : DEFAULT_MODE;
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
