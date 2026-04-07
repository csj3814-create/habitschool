// Service Worker registration & install banner orchestration
const INSTALL_DISMISS_KEY = 'pwa_install_dismissed_at';
const INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INSTALL_BANNER_COLLAPSE_DELAY_MS = 8000;

let deferredInstallPrompt = null;
let installBannerCollapseTimer = 0;

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

function readInstallDismissedAt() {
    try {
        const raw = window.localStorage?.getItem(INSTALL_DISMISS_KEY);
        const parsed = Number(raw || 0);
        return Number.isFinite(parsed) ? parsed : 0;
    } catch (error) {
        return 0;
    }
}

function clearInstallDismissal() {
    try {
        window.localStorage?.removeItem(INSTALL_DISMISS_KEY);
    } catch (error) {
        // Ignore storage access issues.
    }
}

function isInstallBannerDismissed() {
    const dismissedAt = readInstallDismissedAt();
    if (!dismissedAt) return false;
    if (Date.now() - dismissedAt > INSTALL_DISMISS_TTL_MS) {
        clearInstallDismissal();
        return false;
    }
    return true;
}

function getInstallBanner() {
    return document.getElementById('pwa-install-banner');
}

function getInstallBannerAction() {
    return document.getElementById('pwa-install-action');
}

function getInstallBannerTitle() {
    return document.getElementById('pwa-install-title');
}

function getInstallBannerSubtitle() {
    return document.getElementById('pwa-install-subtitle');
}

function shouldAllowInstallBanner() {
    if (isLocalHost()) return false;
    if (isStandaloneInstallMode()) return false;
    if (isInstallBannerDismissed()) return false;
    if (deferredInstallPrompt) return true;
    return isMobileInstallDevice();
}

function getInstallBannerCopy() {
    if (deferredInstallPrompt) {
        return {
            actionLabel: '\uC124\uCE58',
            subtitle: '\uD648 \uD654\uBA74\uC5D0 \uCD94\uAC00\uD558\uBA74 \uB354 \uBE60\uB974\uAC8C!',
            title: '\uD574\uBE5B\uC2A4\uCFE8 \uC571 \uC124\uCE58'
        };
    }

    if (isIOSInstallDevice()) {
        return {
            actionLabel: '\uBC29\uBC95 \uBCF4\uAE30',
            subtitle: '\uACF5\uC720 \uBA54\uB274\uC5D0\uC11C \uD648 \uD654\uBA74\uC5D0 \uCD94\uAC00\uD560 \uC218 \uC788\uC5B4\uC694',
            title: '\uC544\uC774\uD3F0\uC5D0\uC11C \uC571\uCC98\uB7FC \uC4F0\uAE30'
        };
    }

    if (isLikelyInstallWebView()) {
        return {
            actionLabel: '\uBC29\uBC95 \uBCF4\uAE30',
            subtitle: '\uAE30\uBCF8 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC5F4\uBA74 \uC124\uCE58\uAC00 \uB354 \uC27D\uC2B5\uB2C8\uB2E4',
            title: '\uC678\uBD80 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC124\uCE58'
        };
    }

    return {
        actionLabel: '\uBC29\uBC95 \uBCF4\uAE30',
        subtitle: '\uBE0C\uB77C\uC6B0\uC800 \uBA54\uB274 \uB610\uB294 \uC8FC\uC18C\uCC3D\uC5D0\uC11C \uC124\uCE58\uD560 \uC218 \uC788\uC5B4\uC694',
        title: '\uD574\uBE5B\uC2A4\uCFE8 \uC571 \uC124\uCE58'
    };
}

function updateInstallBannerCopy() {
    const action = getInstallBannerAction();
    const title = getInstallBannerTitle();
    const subtitle = getInstallBannerSubtitle();
    const copy = getInstallBannerCopy();

    if (action) action.textContent = copy.actionLabel;
    if (title) title.textContent = copy.title;
    if (subtitle) subtitle.textContent = copy.subtitle;
}

function clearInstallBannerCollapseTimer() {
    if (installBannerCollapseTimer) {
        window.clearTimeout(installBannerCollapseTimer);
        installBannerCollapseTimer = 0;
    }
}

function scheduleInstallBannerCollapse() {
    clearInstallBannerCollapseTimer();
    const banner = getInstallBanner();
    if (!banner || banner.style.display === 'none') return;
    installBannerCollapseTimer = window.setTimeout(() => {
        banner.classList.add('is-collapsed');
        window.scheduleFloatingBarLayoutUpdate?.();
    }, INSTALL_BANNER_COLLAPSE_DELAY_MS);
}

function hideInstallBanner(options = {}) {
    const { persistDismissal = false } = options;
    const banner = getInstallBanner();
    clearInstallBannerCollapseTimer();
    if (persistDismissal) {
        try {
            window.localStorage?.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
        } catch (error) {
            // Ignore storage access issues.
        }
    }
    if (!banner) return;
    banner.style.display = 'none';
    banner.classList.remove('is-collapsed', 'pwa-banner-fadeout', 'pwa-banner-animate');
    window.scheduleFloatingBarLayoutUpdate?.();
}

function showInstallBanner(options = {}) {
    const { animate = true, expand = true } = options;
    if (!shouldAllowInstallBanner()) return;

    const banner = getInstallBanner();
    if (!banner) return;

    updateInstallBannerCopy();
    banner.style.display = 'flex';
    banner.classList.remove('pwa-banner-fadeout');
    if (expand) {
        banner.classList.remove('is-collapsed');
    }
    if (animate) {
        banner.classList.remove('pwa-banner-animate');
        void banner.offsetWidth;
        banner.classList.add('pwa-banner-animate');
    }

    window.scheduleFloatingBarLayoutUpdate?.();
    scheduleInstallBannerCollapse();
}

function getInstallInstructions() {
    if (deferredInstallPrompt) return '';

    if (isIOSInstallDevice()) {
        return [
            '\uC124\uCE58 \uBC29\uBC95',
            '',
            '1. \uD604\uC7AC \uBE0C\uB77C\uC6B0\uC800\uC758 \uACF5\uC720 \uB610\uB294 \uBA54\uB274 \uBC84\uD2BC\uC744 \uB204\uB974\uC138\uC694.',
            '2. "\uD648 \uD654\uBA74\uC5D0 \uCD94\uAC00" \uBA54\uB274\uB97C \uCC3E\uC544 \uC2E4\uD589\uD558\uC138\uC694.',
            '3. \uBA54\uB274\uAC00 \uBCF4\uC774\uC9C0 \uC54A\uC73C\uBA74 Safari\uC5D0\uC11C \uB2E4\uC2DC \uC5F4\uC5B4 \uC2DC\uB3C4\uD574\uC8FC\uC138\uC694.'
        ].join('\n');
    }

    if (isLikelyInstallWebView()) {
        return [
            '\uC124\uCE58 \uBC29\uBC95',
            '',
            '1. \uD604\uC7AC \uC778\uC571 \uBE0C\uB77C\uC6B0\uC800\uC758 \uBA54\uB274\uB97C \uC5EC\uC138\uC694.',
            '2. "\uC678\uBD80 \uBE0C\uB77C\uC6B0\uC800\uC5D0\uC11C \uC5F4\uAE30" \uB610\uB294 "\uAE30\uBCF8 \uBE0C\uB77C\uC6B0\uC800\uB85C \uC5F4\uAE30"\uB97C \uB204\uB974\uC138\uC694.',
            '3. Chrome \uB610\uB294 Safari\uC5D0\uC11C \uC5F4\uB9B0 \uB4A4 \uBE0C\uB77C\uC6B0\uC800 \uBA54\uB274\uC758 \uC571 \uC124\uCE58 \uB610\uB294 \uD648 \uD654\uBA74 \uCD94\uAC00\uB97C \uC774\uC6A9\uD558\uC138\uC694.'
        ].join('\n');
    }

    if (/Android/i.test(getInstallUA())) {
        return [
            '\uC124\uCE58 \uBC29\uBC95',
            '',
            '1. \uBE0C\uB77C\uC6B0\uC800 \uC8FC\uC18C\uCC3D \uC624\uB978\uCABD\uC758 \uC124\uCE58 \uC544\uC774\uCF58\uC744 \uD655\uC778\uD558\uC138\uC694.',
            '2. \uBCF4\uC774\uC9C0 \uC54A\uC73C\uBA74 \uC6B0\uC0C1\uB2E8 \uBA54\uB274\uC5D0\uC11C "\uC571 \uC124\uCE58" \uB610\uB294 "\uD648 \uD654\uBA74\uC5D0 \uCD94\uAC00"\uB97C \uB204\uB974\uC138\uC694.',
            '3. \uC77C\uBD80 \uBE0C\uB77C\uC6B0\uC800\uB294 \uC57D\uAC04 \uB354 \uC0AC\uC6A9\uD55C \uB4A4 \uC124\uCE58 \uBC84\uD2BC\uC744 \uBCF4\uC5EC\uC90D\uB2C8\uB2E4.'
        ].join('\n');
    }

    return [
        '\uC124\uCE58 \uBC29\uBC95',
        '',
        '\uC8FC\uC18C\uCC3D \uC624\uB978\uCABD \uC124\uCE58 \uC544\uC774\uCF58 \uB610\uB294 \uBE0C\uB77C\uC6B0\uC800 \uBA54\uB274\uC758 "\uC571 \uC124\uCE58"\uB97C \uC774\uC6A9\uD558\uC138\uC694.'
    ].join('\n');
}

function installPWA(event) {
    event?.stopPropagation?.();

    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then((choice) => {
            if (choice.outcome === 'accepted') {
                hideInstallBanner();
                return;
            }

            deferredInstallPrompt = null;
            showInstallBanner({ animate: false, expand: false });
        }).catch(() => {
            deferredInstallPrompt = null;
            showInstallBanner({ animate: false, expand: false });
        });
        return;
    }

    window.alert(getInstallInstructions());
    showInstallBanner({ animate: false, expand: false });
}

function dismissInstallBanner(event) {
    event?.stopPropagation?.();
    hideInstallBanner({ persistDismissal: true });
}

function expandInstallBanner(event) {
    const clickedButton = event?.target?.closest?.('button');
    if (clickedButton) return;

    const banner = getInstallBanner();
    if (!banner || banner.style.display === 'none' || !banner.classList.contains('is-collapsed')) return;

    banner.classList.remove('is-collapsed');
    window.scheduleFloatingBarLayoutUpdate?.();
    scheduleInstallBannerCollapse();
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
            } catch (err) {
                console.warn('localhost service worker cleanup failed:', err);
            }
        } else {
            navigator.serviceWorker.register('./sw.js?v=112')
                .then((reg) => {
                    console.log('PWA service worker registered:', reg.scope);
                    reg.update();
                })
                .catch((err) => console.warn('PWA service worker registration failed:', err));
        }
    }

    window.setTimeout(() => {
        showInstallBanner();
    }, 1200);
});

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (isInstallBannerDismissed()) return;
    showInstallBanner({ animate: true, expand: true });
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    clearInstallDismissal();
    hideInstallBanner();
    console.log('PWA installed');
});

window.installPWA = installPWA;
window.dismissInstallBanner = dismissInstallBanner;
window.expandInstallBanner = expandInstallBanner;
