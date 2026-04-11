// Service Worker registration & fixed install CTA orchestration
let deferredInstallPrompt = null;
const INSTALL_STATE_STORAGE_KEY = 'habitschool_pwa_installed';
let cachedInstalledAppState = readStoredInstallState();

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
    if (!isMobileInstallDevice()) return false;
    if (isStandaloneInstallMode()) return false;
    if (cachedInstalledAppState) return false;
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
            buttonLabel: '해빛스쿨 앱 설치',
            helperText: '설치하면 앱처럼 바로 열 수 있어요.'
        };
    }

    if (isIOSInstallDevice()) {
        return {
            visible: true,
            buttonLabel: '설치 방법 보기',
            helperText: isSafariBrowser()
                ? '홈 화면에 추가하면 앱처럼 쓸 수 있어요.'
                : 'Safari로 열면 설치할 수 있어요.'
        };
    }

    if (isLikelyInstallWebView()) {
        return {
            visible: true,
            buttonLabel: '설치 방법 보기',
            helperText: '기본 브라우저로 열면 설치할 수 있어요.'
        };
    }

    return {
        visible: true,
        buttonLabel: deferredInstallPrompt ? '해빛스쿨 앱 설치' : '설치 방법 보기',
        helperText: '설치하면 앱처럼 바로 열 수 있어요.'
    };
}

function notifyInstallCtaStateChanged() {
    window.dispatchEvent(new CustomEvent('install-cta-state-changed'));
}

async function handleInstallCtaAction() {
    if (deferredInstallPrompt) {
        try {
            deferredInstallPrompt.prompt();
            const choice = await deferredInstallPrompt.userChoice;
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
            navigator.serviceWorker.register('./sw.js?v=126')
                .then((reg) => {
                    console.log('PWA service worker registered:', reg.scope);
                    reg.update();
                })
                .catch((error) => console.warn('PWA service worker registration failed:', error));
        }
    }

    await refreshInstalledAppState();
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
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
