// Service Worker registration & fixed install CTA orchestration
let deferredInstallPrompt = null;
const INSTALL_STATE_STORAGE_KEY = 'habitschool_pwa_installed';
const APP_SERVICE_WORKER_PATH = '/sw.js';
const INSTALL_BUTTON_LABEL = '홈 화면에 앱 설치';
const INSTALL_READY_HELPER_TEXT = '설치하면 앱처럼 바로 열 수 있어요.';
const ANDROID_INSTALL_PROMPT_WAIT_MS = 1800;
const CHROME_ANDROID_PACKAGE_NAME = 'com.android.chrome';
let cachedInstalledAppState = readStoredInstallState();
let installPromptWaiters = [];
let installFallbackModal = null;

function readStoredInstallState() {
    try {
        return localStorage.getItem(INSTALL_STATE_STORAGE_KEY) === '1';
    } catch (_) {
        return false;
    }
}

function persistInstalledAppState(isInstalled) {
    cachedInstalledAppState = !!isInstalled;
    try {
        if (isInstalled) {
            localStorage.setItem(INSTALL_STATE_STORAGE_KEY, '1');
        } else {
            localStorage.removeItem(INSTALL_STATE_STORAGE_KEY);
        }
    } catch (_) {}
}

function getRelatedManifestUrlCandidates() {
    const candidates = new Set(['/manifest.json']);
    try {
        candidates.add(new URL('/manifest.json', location.origin).href);
    } catch (_) {}
    return candidates;
}

function isLocalHost() {
    return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function getInstallUA() {
    return navigator.userAgent || navigator.vendor || '';
}

function isMobileInstallDevice() {
    return /iPhone|iPad|iPod|Android/i.test(getInstallUA());
}

function isIOSInstallDevice() {
    const ua = getInstallUA();
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isSafariBrowser() {
    const ua = getInstallUA();
    return /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|YaBrowser|DuckDuckGo/i.test(ua);
}

function isSamsungInternetBrowser() {
    return /SamsungBrowser/i.test(getInstallUA());
}

function isLikelyInstallWebView() {
    const ua = getInstallUA();
    const webviewPatterns = [
        /KAKAOTALK/i,
        /NAVER\(/i,
        /NAVER/i,
        /NaverMatome/i,
        /FBAN|FBAV/i,
        /FB_IAB/i,
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,
        /everytimeApp/i,
        /BAND\//i,
        /Whale\//i,
        /\bwv\b/i,
        /;\s*wv\)/i,
        /WebView/i,
        /GSA\//i,
        /\[FB/i
    ];

    if (isIOSInstallDevice()) {
        const looksLikeIOSBrowser = /CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
        if (!isSafariBrowser() && !looksLikeIOSBrowser) return true;
    }

    return webviewPatterns.some((pattern) => pattern.test(ua));
}

function isStandaloneInstallMode() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

async function detectInstalledRelatedWebApp() {
    if (typeof navigator.getInstalledRelatedApps !== 'function') return null;
    try {
        const installedApps = await navigator.getInstalledRelatedApps();
        const manifestUrlCandidates = getRelatedManifestUrlCandidates();
        return installedApps.some((app) => {
            const platform = String(app?.platform || '').toLowerCase();
            const id = String(app?.id || '').trim();
            const url = String(app?.url || '').trim();
            return platform === 'webapp' && (id === '/' || manifestUrlCandidates.has(url));
        });
    } catch (error) {
        console.warn('설치 앱 감지 실패:', error?.message || error);
        return null;
    }
}

async function refreshInstalledAppState() {
    let nextInstalled = isStandaloneInstallMode();
    if (!nextInstalled) {
        const relatedInstalled = await detectInstalledRelatedWebApp();
        if (relatedInstalled !== null) {
            nextInstalled = relatedInstalled;
        }
    }
    persistInstalledAppState(nextInstalled);
    notifyInstallCtaStateChanged();
    return nextInstalled;
}

function shouldShowInstallCta() {
    if (isLocalHost()) return false;
    if (isStandaloneInstallMode()) return false;
    return true;
}

function getManualInstallInstructions() {
    if (isIOSInstallDevice()) {
        if (!isSafariBrowser()) {
            return [
                '설치 방법',
                '',
                '1. 현재 페이지를 Safari로 열어주세요.',
                '2. Safari 하단의 공유 버튼을 누르세요.',
                `3. "${INSTALL_BUTTON_LABEL}" 항목이 없으면 "홈 화면에 추가"를 선택하세요.`
            ].join('\n');
        }

        return [
            '설치 방법',
            '',
            '1. Safari 하단의 공유 버튼을 누르세요.',
            `2. "${INSTALL_BUTTON_LABEL}" 항목이 없으면 "홈 화면에 추가"를 선택하세요.`,
            '3. 추가가 끝나면 홈 화면의 해빛스쿨 아이콘으로 바로 열 수 있어요.'
        ].join('\n');
    }

    if (isLikelyInstallWebView()) {
        return [
            '설치 방법',
            '',
            '1. 현재 인앱 브라우저 메뉴를 여세요.',
            '2. "기본 브라우저로 열기" 또는 "외부 브라우저에서 열기"를 누르세요.',
            `3. 기본 브라우저에서 열린 뒤 메뉴의 "${INSTALL_BUTTON_LABEL}" 또는 "앱 설치"를 선택하세요.`
        ].join('\n');
    }

    if (isSamsungInternetBrowser()) {
        return [
            '삼성 인터넷 설치 안내',
            '',
            '삼성 인터넷은 사이트 버튼으로 설치 확인창을 직접 열 수 없어요.',
            `브라우저 메뉴에서 "${INSTALL_BUTTON_LABEL}" 또는 "현재 페이지 추가"를 선택해주세요.`,
            '설치 메뉴가 보이지 않으면 Chrome에서 열어 설치를 시도할 수 있어요.'
        ].join('\n');
    }

    if (/Android/i.test(getInstallUA())) {
        return [
            '설치 방법',
            '',
            '1. 잠시 후 브라우저 설치 창이 뜨면 "설치"를 눌러주세요.',
            `2. 창이 안 뜨면 주소창 오른쪽 설치 아이콘 또는 메뉴의 "${INSTALL_BUTTON_LABEL}"를 선택하세요.`,
            '3. 메뉴 이름이 짧게 "앱 설치"로 보일 수도 있어요.'
        ].join('\n');
    }

    return [
        '설치 방법',
        '',
        `브라우저 메뉴에서 "${INSTALL_BUTTON_LABEL}" 또는 "앱 설치"를 찾아 실행해주세요.`
    ].join('\n');
}

function getInstallCopy() {
    if (!shouldShowInstallCta()) {
        return { visible: false };
    }

    if (deferredInstallPrompt) {
        return {
            visible: true,
            buttonLabel: INSTALL_BUTTON_LABEL,
            helperText: INSTALL_READY_HELPER_TEXT
        };
    }

    if (isIOSInstallDevice()) {
        return {
            visible: true,
            buttonLabel: INSTALL_BUTTON_LABEL,
            helperText: isSafariBrowser()
                ? '홈 화면 앱으로 설치하면 바로 열 수 있어요.'
                : 'Safari로 열면 설치할 수 있어요.'
        };
    }

    if (isLikelyInstallWebView()) {
        return {
            visible: true,
            buttonLabel: INSTALL_BUTTON_LABEL,
            helperText: '기본 브라우저로 열면 설치할 수 있어요.'
        };
    }

    if (isSamsungInternetBrowser()) {
        return {
            visible: true,
            buttonLabel: INSTALL_BUTTON_LABEL,
            helperText: '삼성 인터넷은 메뉴에서 설치해야 해요.'
        };
    }

    return {
        visible: true,
        buttonLabel: INSTALL_BUTTON_LABEL,
        helperText: INSTALL_READY_HELPER_TEXT
    };
}

function notifyInstallCtaStateChanged() {
    window.dispatchEvent(new CustomEvent('install-cta-state-changed'));
}

function flushInstallPromptWaiters(promptEvent = null) {
    if (!installPromptWaiters.length) return;
    const waiters = installPromptWaiters;
    installPromptWaiters = [];
    waiters.forEach((resolve) => resolve(promptEvent));
}

function canWaitForNativeInstallPrompt() {
    return /Android/i.test(getInstallUA())
        && !isIOSInstallDevice()
        && !isLikelyInstallWebView()
        && !isSamsungInternetBrowser();
}

async function waitForDeferredInstallPrompt(timeoutMs = ANDROID_INSTALL_PROMPT_WAIT_MS) {
    if (deferredInstallPrompt) return deferredInstallPrompt;
    if (!canWaitForNativeInstallPrompt()) return null;

    return new Promise((resolve) => {
        let settled = false;
        const finish = (promptEvent) => {
            if (settled) return;
            settled = true;
            resolve(promptEvent || null);
        };

        const waiterResolve = (promptEvent) => {
            clearTimeout(timer);
            finish(promptEvent);
        };

        const timer = setTimeout(() => {
            installPromptWaiters = installPromptWaiters.filter((waiter) => waiter !== waiterResolve);
            finish(null);
        }, timeoutMs);

        installPromptWaiters.push(waiterResolve);
    });
}

function setInlineStyles(element, styles) {
    Object.entries(styles).forEach(([property, value]) => {
        element.style[property] = value;
    });
}

function closeInstallFallbackModal() {
    if (!installFallbackModal) return;
    installFallbackModal.remove();
    installFallbackModal = null;
}

function getChromeIntentUrl() {
    const currentUrl = new URL(window.location.href);
    const scheme = currentUrl.protocol.replace(':', '') || 'https';
    const chromeUrl = `${currentUrl.host}${currentUrl.pathname}${currentUrl.search}`;
    const fallbackUrl = encodeURIComponent(currentUrl.href);
    return `intent://${chromeUrl}#Intent;scheme=${scheme};package=${CHROME_ANDROID_PACKAGE_NAME};S.browser_fallback_url=${fallbackUrl};end`;
}

function openCurrentPageInChrome() {
    try {
        window.location.href = getChromeIntentUrl();
    } catch (_) {
        window.location.href = window.location.href;
    }
}

function createInstallFallbackButton(label, variant = 'secondary') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    setInlineStyles(button, {
        border: variant === 'primary' ? '0' : '1px solid #f0c57e',
        borderRadius: '14px',
        padding: '12px 16px',
        fontSize: '15px',
        fontWeight: '800',
        color: variant === 'primary' ? '#3f2600' : '#6b3f0b',
        background: variant === 'primary' ? 'linear-gradient(135deg, #ffb000, #ff8a00)' : '#fff8ed',
        minHeight: '48px',
        flex: '1 1 140px'
    });
    return button;
}

function showSamsungInstallFallback() {
    closeInstallFallbackModal();

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'samsung-install-fallback-title');
    setInlineStyles(overlay, {
        position: 'fixed',
        inset: '0',
        zIndex: '10000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(28, 23, 18, 0.42)'
    });

    const panel = document.createElement('section');
    setInlineStyles(panel, {
        width: 'min(92vw, 430px)',
        maxHeight: '82vh',
        overflowY: 'auto',
        borderRadius: '22px',
        background: '#fffdf8',
        boxShadow: '0 18px 48px rgba(51, 36, 18, 0.22)',
        padding: '24px',
        color: '#4f2f09',
        fontFamily: 'inherit',
        lineHeight: '1.45'
    });

    const title = document.createElement('h2');
    title.id = 'samsung-install-fallback-title';
    title.textContent = '삼성 인터넷 설치 안내';
    setInlineStyles(title, {
        margin: '0 0 12px',
        fontSize: '22px',
        lineHeight: '1.25',
        letterSpacing: '0',
        color: '#3f2600'
    });

    const body = document.createElement('p');
    body.textContent = '삼성 인터넷은 사이트 버튼으로 설치 확인창을 직접 열 수 없어요.';
    setInlineStyles(body, {
        margin: '0 0 14px',
        fontSize: '16px',
        fontWeight: '700'
    });

    const steps = document.createElement('ol');
    setInlineStyles(steps, {
        margin: '0 0 18px',
        paddingLeft: '20px',
        fontSize: '15px',
        color: '#6f4d24'
    });

    [
        '브라우저 메뉴를 열어주세요.',
        `"${INSTALL_BUTTON_LABEL}" 또는 "현재 페이지 추가"를 선택해주세요.`,
        '설치 메뉴가 보이지 않으면 Chrome에서 열어 설치를 시도해주세요.'
    ].forEach((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        item.style.marginBottom = '8px';
        steps.appendChild(item);
    });

    const actions = document.createElement('div');
    setInlineStyles(actions, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '10px',
        marginTop: '8px'
    });

    const chromeButton = createInstallFallbackButton('Chrome에서 열기', 'primary');
    chromeButton.addEventListener('click', openCurrentPageInChrome);

    const closeButton = createInstallFallbackButton('확인');
    closeButton.addEventListener('click', closeInstallFallbackModal);

    actions.append(chromeButton, closeButton);
    panel.append(title, body, steps, actions);
    overlay.appendChild(panel);
    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeInstallFallbackModal();
    });

    installFallbackModal = overlay;
    document.body.appendChild(overlay);
    closeButton.focus({ preventScroll: true });
}

async function handleInstallCtaAction() {
    if (!deferredInstallPrompt && isSamsungInternetBrowser()) {
        showSamsungInstallFallback();
        notifyInstallCtaStateChanged();
        return;
    }

    const promptEvent = deferredInstallPrompt || await waitForDeferredInstallPrompt();
    if (promptEvent) {
        try {
            deferredInstallPrompt = promptEvent;
            promptEvent.prompt();
            const choice = await promptEvent.userChoice;
            if (choice?.outcome !== 'accepted') {
                deferredInstallPrompt = null;
            }
        } catch (error) {
            console.warn('설치 프롬프트 실행 실패:', error);
            deferredInstallPrompt = null;
        }

        notifyInstallCtaStateChanged();
        return;
    }

    window.alert(getManualInstallInstructions());
    notifyInstallCtaStateChanged();
}

function getCanonicalServiceWorkerScopeUrl() {
    try {
        return new URL('/', location.origin).href;
    } catch (_) {
        return `${location.origin}/`;
    }
}

function getRegistrationScriptUrl(registration) {
    return registration?.active?.scriptURL
        || registration?.waiting?.scriptURL
        || registration?.installing?.scriptURL
        || '';
}

function isCanonicalHabitschoolServiceWorker(registration) {
    const scriptUrl = getRegistrationScriptUrl(registration);
    if (!scriptUrl) return false;

    try {
        const parsed = new URL(scriptUrl);
        return parsed.origin === location.origin
            && parsed.pathname === APP_SERVICE_WORKER_PATH
            && registration.scope === getCanonicalServiceWorkerScopeUrl();
    } catch (_) {
        return false;
    }
}

async function cleanupStaleServiceWorkerRegistrations() {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const staleRegistrations = registrations.filter((registration) => {
        const scriptUrl = getRegistrationScriptUrl(registration);
        if (!scriptUrl) return false;

        try {
            return new URL(scriptUrl).origin === location.origin
                && !isCanonicalHabitschoolServiceWorker(registration);
        } catch (_) {
            return false;
        }
    });

    await Promise.all(staleRegistrations.map(async (registration) => {
        try {
            await registration.unregister();
            console.log('Removed stale service worker registration:', getRegistrationScriptUrl(registration));
        } catch (error) {
            console.warn('Stale service worker cleanup failed:', error?.message || error);
        }
    }));
}

window.addEventListener('load', async () => {
    if ('serviceWorker' in navigator) {
        if (isLocalHost()) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map((reg) => reg.unregister()));

                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(
                        keys
                            .filter((key) => key.startsWith('habitschool-'))
                            .map((key) => caches.delete(key))
                    );
                }

                console.log('localhost service worker and cache disabled.');
            } catch (error) {
                console.warn('localhost service worker cleanup failed:', error);
            }
        } else {
            cleanupStaleServiceWorkerRegistrations()
                .catch((error) => console.warn('Stale service worker scan failed:', error?.message || error))
                .then(() => navigator.serviceWorker.getRegistration('/'))
                .then((existingRegistration) => {
                    if (existingRegistration && isCanonicalHabitschoolServiceWorker(existingRegistration)) {
                        return existingRegistration;
                    }

                    return navigator.serviceWorker.register(APP_SERVICE_WORKER_PATH, { scope: '/' });
                })
                .then((registration) => {
                    console.log('PWA service worker ready:', registration.scope);
                })
                .catch((error) => console.warn('PWA service worker registration failed:', error));
        }
    }

    await refreshInstalledAppState();
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    flushInstallPromptWaiters(event);
    refreshInstalledAppState().catch(() => notifyInstallCtaStateChanged());
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    persistInstalledAppState(true);
    notifyInstallCtaStateChanged();
    console.log('PWA installed');
});

window.addEventListener('pageshow', () => {
    refreshInstalledAppState().catch(() => notifyInstallCtaStateChanged());
});
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        refreshInstalledAppState().catch(() => notifyInstallCtaStateChanged());
    }
});
window.addEventListener('storage', (event) => {
    if (event.key !== INSTALL_STATE_STORAGE_KEY) return;
    cachedInstalledAppState = readStoredInstallState();
    notifyInstallCtaStateChanged();
});

window.getInstallCtaState = getInstallCopy;
window.handleInstallCtaAction = handleInstallCtaAction;
window.installPWA = handleInstallCtaAction;
