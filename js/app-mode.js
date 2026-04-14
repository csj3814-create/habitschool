const DEFAULT_MODE = 'default';
const SIMPLE_MODE = 'simple';
const SIMPLE_MODE_PATH = '/simple';

const DEFAULT_TABS = ['dashboard', 'diet', 'exercise', 'sleep', 'profile', 'gallery', 'assets'];
const SIMPLE_TABS = ['diet', 'exercise', 'sleep', 'profile'];

export function normalizeAppPath(pathname = '/') {
    const normalized = String(pathname || '/').replace(/\/+$/, '');
    return normalized || '/';
}

export function getAppModeFromPath(pathname = window.location.pathname) {
    return normalizeAppPath(pathname) === SIMPLE_MODE_PATH ? SIMPLE_MODE : DEFAULT_MODE;
}

export function isSimpleMode(pathname = window.location.pathname) {
    return getAppModeFromPath(pathname) === SIMPLE_MODE;
}

export function getAllowedTabsForMode(mode = getAppModeFromPath()) {
    return mode === SIMPLE_MODE ? [...SIMPLE_TABS] : [...DEFAULT_TABS];
}

export function getDefaultTabForMode(mode = getAppModeFromPath()) {
    return mode === SIMPLE_MODE ? 'profile' : 'dashboard';
}

export function normalizeTabForMode(tabName, mode = getAppModeFromPath()) {
    const fallback = getDefaultTabForMode(mode);
    return getAllowedTabsForMode(mode).includes(tabName) ? tabName : fallback;
}

export function buildAppModeUrl(mode = getAppModeFromPath(), tabName = '') {
    const nextMode = mode === SIMPLE_MODE ? SIMPLE_MODE : DEFAULT_MODE;
    const url = new URL(window.location.origin + (nextMode === SIMPLE_MODE ? SIMPLE_MODE_PATH : '/'));
    const defaultTab = getDefaultTabForMode(nextMode);
    const normalizedTab = normalizeTabForMode(tabName || defaultTab, nextMode);
    if (normalizedTab !== defaultTab) {
        url.hash = `#${normalizedTab}`;
    }
    return url.toString();
}

export function applyAppModeChrome(doc = document) {
    const simpleMode = isSimpleMode(doc.defaultView?.location?.pathname || window.location.pathname);
    doc.documentElement?.classList.toggle('simple-mode', simpleMode);
    if (doc.body) {
        doc.body.classList.toggle('simple-mode', simpleMode);
        doc.body.dataset.appMode = simpleMode ? SIMPLE_MODE : DEFAULT_MODE;
    }

    const skipLink = doc.querySelector('.skip-to-content');
    if (skipLink) {
        skipLink.setAttribute('href', simpleMode ? '#profile' : '#dashboard');
    }

    const userGreeting = doc.getElementById('user-greeting');
    if (userGreeting) {
        userGreeting.setAttribute('tabindex', '0');
        userGreeting.setAttribute('aria-label', simpleMode ? '간편 프로필 열기' : '프로필 열기');
    }

    return simpleMode;
}
