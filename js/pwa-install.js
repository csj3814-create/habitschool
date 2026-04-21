// Service Worker registration & fixed install CTA orchestration
let deferredInstallPrompt = null;
const INSTALL_STATE_STORAGE_KEY = 'habitschool_pwa_installed';
const APP_SERVICE_WORKER_PATH = '/sw.js';
let cachedInstalledAppState = readStoredInstallState();
let installPromptWaiters = [];

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
                '3. "홈 화면에 추가"를 선택하면 해빛스쿨을 앱처럼 사용할 수 있어요.'
            ].join('\n');
        }

        return [
            '설치 방법',
            '',
            '1. Safari 하단의 공유 버튼을 누르세요.',
            '2. "홈 화면에 추가"를 선택하세요.',
            '3. 추가가 끝나면 홈 화면의 해빛스쿨 아이콘으로 바로 열 수 있어요.'
        ].join('\n');
    }

    if (isLikelyInstallWebView()) {
        return [
            '설치 방법',
            '',
            '1. 현재 인앱 브라우저 메뉴를 여세요.',
            '2. "기본 브라우저로 열기" 또는 "외부 브라우저에서 열기"를 누르세요.',
            '3. Chrome이나 Safari에서 열린 뒤 브라우저 메뉴의 "앱 설치" 또는 "홈 화면에 추가"를 선택하세요.'
        ].join('\n');
    }

    if (/Android/i.test(getInstallUA())) {
        return [
            '설치 방법',
            '',
            '1. 주소창 오른쪽 설치 아이콘이 보이면 바로 눌러주세요.',
            '2. 아이콘이 없으면 브라우저 메뉴를 열어 "앱 설치" 또는 "홈 화면에 추가"를 선택하세요.',
            '3. 일부 브라우저는 잠시 더 사용한 뒤 설치 메뉴가 나타날 수 있어요.'
        ].join('\n');
    }

    return [
        '설치 방법',
        '',
        '브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가"를 찾아 실행해주세요.'
    ].join('\n');
}

function getInstallCopy() {
    if (!shouldShowInstallCta()) {
        return { visible: false };
    }

    if (deferredInstallPrompt) {
        return {
            visible: true,
            buttonLabel: '홈 화면에 추가',
            helperText: '설치하면 앱처럼 바로 열 수 있어요.'
        };
    }

    if (isIOSInstallDevice()) {
        return {
            visible: true,
            buttonLabel: '홈 화면에 추가',
            helperText: isSafariBrowser()
                ? '홈 화면에 추가하면 앱처럼 쓸 수 있어요.'
                : 'Safari로 열면 설치할 수 있어요.'
        };
    }

    if (isLikelyInstallWebView()) {
        return {
            visible: true,
            buttonLabel: '홈 화면에 추가',
            helperText: '기본 브라우저로 열면 설치할 수 있어요.'
        };
    }

    return {
        visible: true,
        buttonLabel: '홈 화면에 추가',
        helperText: '설치하면 앱처럼 바로 열 수 있어요.'
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
    return /Android/i.test(getInstallUA()) && !isIOSInstallDevice() && !isLikelyInstallWebView();
}

async function waitForDeferredInstallPrompt(timeoutMs = 1800) {
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

async function handleInstallCtaAction() {
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
