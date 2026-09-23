/**
 * Service Worker for the Habitschool PWA.
 * Uses network-first for same-origin GET requests and keeps a small offline cache.
 */

const PROD_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDICPw7HTmu5znaRCYC93-zTux4dYYN9eI",
    authDomain: "habitschool-8497b.firebaseapp.com",
    projectId: "habitschool-8497b",
    storageBucket: "habitschool-8497b.firebasestorage.app",
    messagingSenderId: "628617480821",
    appId: "1:628617480821:web:2756952ab78e8edf97463c"
};

const STAGING_FIREBASE_CONFIG = {
    apiKey: "AIzaSyCFA1-cb_C8O3-9aFHaBu9GxcvpOHv_Q1Q",
    authDomain: "habitschool-staging.firebaseapp.com",
    projectId: "habitschool-staging",
    storageBucket: "habitschool-staging.firebasestorage.app",
    messagingSenderId: "227563724498",
    appId: "1:227563724498:web:4810638c31ff8ccf0bd70b"
};

const hostname = self.location.hostname;
const isLocalEnv = hostname === 'localhost' || hostname === '127.0.0.1';
const isStagingEnv = !isLocalEnv && hostname.includes('habitschool-staging');
const firebaseConfig = isStagingEnv || isLocalEnv ? STAGING_FIREBASE_CONFIG : PROD_FIREBASE_CONFIG;

function parseJson(rawValue, fallbackValue) {
    try {
        return rawValue ? JSON.parse(rawValue) : fallbackValue;
    } catch (_) {
        return fallbackValue;
    }
}

if (!isLocalEnv) {
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        const d = payload.data || {};
        const actions = parseJson(d.actions, [])
            .filter(action => action?.action && action?.title)
            .slice(0, 2);
        const actionUrls = parseJson(d.actionUrls, {});
        const badgeCount = Number(d.badgeCount || '');
        const options = {
            body: d.body || '',
            icon: d.icon || './icons/icon-192.png',
            // 안드로이드는 badge(작은 아이콘)의 알파 채널만 읽어 실루엣으로 그린다.
            // 불투명한 컬러 아이콘을 주면 알림 줄에 흰 사각형만 보인다.
            badge: './icons/notification-badge.png',
            tag: d.tag || 'habitschool',
            data: {
                url: d.url || '/',
                actionUrls
            },
            actions,
            vibrate: [100, 50, 100]
        };

        if (d.requireInteraction === 'true') {
            options.requireInteraction = true;
        }

        self.registration.showNotification(d.title || '해빛스쿨', options)
            .then(() => {
                if (typeof self.navigator?.setAppBadge !== 'function') return;
                if (Number.isFinite(badgeCount) && badgeCount > 0) {
                    return self.navigator.setAppBadge(badgeCount).catch(() => {});
                }
                return self.navigator.setAppBadge().catch(() => {});
            })
            .catch(() => {});
    });
}

const CACHE_NAME = 'habitschool-v440';
const SHARE_TARGET_CACHE_NAME = 'habitschool-share-target-v1';
const SHARE_TARGET_ACTION_PATH = '/share-target';
const SHARE_TARGET_MANIFEST_URL = new URL('/__share_target__/shared/manifest.json', self.location.origin).href;
const LEGACY_SHARE_TARGET_MANIFEST_URL = new URL('/__share_target__/diet/manifest.json', self.location.origin).href;

function buildShareTargetFileUrl(index) {
    return new URL(`/__share_target__/shared/${index}`, self.location.origin).href;
}

async function clearPendingSharedTarget(cache, manifestData = null) {
    const targetCache = cache || await caches.open(SHARE_TARGET_CACHE_NAME);
    let manifest = manifestData;
    if (!manifest) {
        const sharedManifestResponse = await targetCache.match(SHARE_TARGET_MANIFEST_URL);
        if (sharedManifestResponse) {
            manifest = await sharedManifestResponse.json().catch(() => null);
        } else {
            const legacyManifestResponse = await targetCache.match(LEGACY_SHARE_TARGET_MANIFEST_URL);
            manifest = legacyManifestResponse ? await legacyManifestResponse.json().catch(() => null) : null;
        }
    }

    const itemUrls = Array.isArray(manifest?.items)
        ? manifest.items.map((item) => String(item?.url || '')).filter(Boolean)
        : [];

    await Promise.all([
        targetCache.delete(SHARE_TARGET_MANIFEST_URL),
        targetCache.delete(LEGACY_SHARE_TARGET_MANIFEST_URL),
        ...itemUrls.map((url) => targetCache.delete(url))
    ]);
}

async function storeSharedTargetDiagnostics(diagnostics) {
    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    await clearPendingSharedTarget(cache);
    await cache.put(SHARE_TARGET_MANIFEST_URL, new Response(JSON.stringify({
        createdAt: Date.now(),
        items: [],
        diagnostics
    }), {
        headers: {
            'content-type': 'application/json'
        }
    }));
}

async function storePendingSharedTarget(files) {
    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    await clearPendingSharedTarget(cache);

    const createdAt = Date.now();
    const items = [];
    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const url = buildShareTargetFileUrl(index);
        // 공유 시트로 사진만 들어오던 때의 기본값이었다. 이제 Fitdays 가 내보낸
        // 체성분 CSV 도 같은 문으로 들어오므로, 종류를 모른다고 사진이라고
        // 우기지 않는다 — 그러면 CSV 가 사진으로 둔갑해 조용히 버려진다.
        const rawName = String(file?.name || '').trim();
        const looksCsv = /\.csv$/i.test(rawName);
        const fallbackType = looksCsv ? 'text/csv' : 'image/jpeg';
        const type = String(file?.type || fallbackType).trim() || fallbackType;
        const name = rawName || (looksCsv || type === 'text/csv'
            ? `shared-body-composition-${index + 1}.csv`
            : `shared-image-${index + 1}.jpg`);
        const lastModified = Number(file?.lastModified || createdAt) || createdAt;

        items.push({ url, type, name, lastModified });
        await cache.put(url, new Response(file, {
            headers: {
                'content-type': type
            }
        }));
    }

    await cache.put(SHARE_TARGET_MANIFEST_URL, new Response(JSON.stringify({
        createdAt,
        items
    }), {
        headers: {
            'content-type': 'application/json'
        }
    }));
}

// 공유로 받은 파일의 종류를 첫 몇 바이트로 가린다.
//
// 2026-09-23 제보: Fitdays 결과 화면을 공유했더니 "공유한 사진을 찾지 못했어요".
// 안드로이드는 **인텐트**를 image/* 로 넘겨 해빛스쿨을 목록에 띄우지만, 크롬이
// 만드는 File 의 type 은 보낸 앱의 FileProvider 가 알려 주는 값이다. 그 값이
// 비어 있거나 application/octet-stream 이면 예전 필터가 사진을 통째로 버렸다.
// 이름표 대신 내용을 본다.
async function sniffSharedFileType(file) {
    const declared = String(file?.type || '').trim().toLowerCase();
    if (declared.startsWith('image/') && declared !== 'image/*') return declared;
    const name = String(file?.name || '').toLowerCase();
    try {
        const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
        const starts = (...bytes) => bytes.every((b, i) => head[i] === b);
        if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
        if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg';
        if (starts(0x47, 0x49, 0x46, 0x38)) return 'image/gif';
        if (starts(0x52, 0x49, 0x46, 0x46) && head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'image/webp';
        // HEIC/HEIF: 4바이트 길이 뒤에 'ftyp' 와 브랜드
        if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
            const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
            if (/^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(brand)) return 'image/heic';
        }
    } catch (_) {}
    if (declared === 'text/csv' || declared === 'application/csv' || declared === 'text/comma-separated-values') return 'text/csv';
    if (name.endsWith('.csv')) return 'text/csv';
    if (declared === 'image/*') return 'image/jpeg';
    return '';
}

async function handleSharedTarget(request) {
    const formData = await request.formData();
    const received = ['sharedImages', 'dietPhotos']
        .flatMap((fieldName) => formData.getAll(fieldName))
        .filter((value) => value instanceof File);

    const sharedFiles = [];
    const diagnostics = [];
    for (const file of received) {
        const detected = file.size > 0 ? await sniffSharedFileType(file) : '';
        // 무엇이 왔는지 남긴다. 내용은 남기지 않고 종류·크기·이름 끝만.
        diagnostics.push({
            type: String(file.type || '(없음)').slice(0, 60),
            size: file.size,
            ext: (String(file.name || '').match(/\.[a-z0-9]{1,6}$/i) || [''])[0].toLowerCase(),
            detected: detected || '(알 수 없음)'
        });
        if (!detected) continue;
        sharedFiles.push(detected === file.type
            ? file
            : new File([file], file.name || (detected === 'text/csv' ? 'shared.csv' : 'shared-image'), {
                type: detected,
                lastModified: file.lastModified || Date.now()
            }));
    }

    if (sharedFiles.length > 0) {
        await storePendingSharedTarget(sharedFiles);
    } else {
        // 아무것도 못 건졌으면 그 사실과 받은 것의 모양을 남긴다. 예전에는 빈손으로
        // 넘어가 앱이 "사진을 찾지 못했어요" 만 말했고, 무엇이 왔는지 알 길이 없었다.
        // Play 앱(1.0.6~)은 공유 인텐트를 먼저 보고 무엇이 왔는지 title 에 적어 보낸다
        // (SharedFileRelay, "hsdiag:" 로 시작). 크롬이 파일을 버린 뒤라 여기서는 볼 수
        // 없는 것 — 보낸 앱이 준 종류·주소 방식·읽을 수 있었는지 — 이 그 줄에 있다.
        const title = String(formData.get('title') || '');
        const text = String(formData.get('text') || '');
        await storeSharedTargetDiagnostics({
            fields: [...new Set([...formData.keys()])].slice(0, 10),
            files: diagnostics.slice(0, 5),
            relay: title.startsWith('hsdiag:') ? title.slice(0, 480) : '',
            textLength: text.length
        });
    }

    const redirectUrl = new URL('/?tab=diet&focus=shared-upload#diet', self.location.origin);
    return Response.redirect(redirectUrl.href, 303);
}

const STATIC_ASSETS = [
    './',
    './styles.css?v=440',
    './styles-base.css?v=440',
    './styles-en.css?v=440',
    './styles-features.css?v=440',
    './styles-reward-market.css?v=440',
    './styles-dashboard.css?v=440',
    './styles-dark-mode.css?v=440',
    './styles-reports.css?v=440',
    './styles-guest-demo.css?v=440',
    './js/main.js?v=440',
    './js/app.js?v=440',
    './js/app-core.js?v=440',
    './js/auth.js?v=440',
    './js/i18n.js?v=440',
    './js/app-mode.js?v=440',
    './js/auth-login-helpers.js?v=440',
    './js/blockchain-config.js?v=440',
    './js/blockchain-manager.js?v=440',
    './js/challenge-claim.js?v=440',
    './js/video-compress.js?v=440',
    './js/bug-report.js?v=440',
    './js/data-manager.js?v=440',
    './js/diet-program.js?v=440',
    './js/diet-analysis.js?v=440',
    './js/exercise-media.js?v=440',
    './js/firebase-config.js?v=440',
    './js/friendship-utils.js?v=440',
    './js/habit-groups.js?v=440',
    './js/health-connect-utils.js?v=440',
    './js/metabolic-score.js?v=440',
    './js/korean.js?v=440',
    './js/le8-score.js?v=440',
    './js/milestone-helpers.js?v=440',
    './js/monthly-mvp-reward.js?v=440',
    './js/meditation-guide.js?v=440',
    './js/reward-market.js?v=440',
    './js/body-composition-csv.js?v=440',
    './js/mission-gate.js?v=440',
    './js/health-connect-body.js?v=440',
    './js/reward-pace.js?v=440',
    './js/guest-demo.js?v=440',
    './js/product-events.js?v=440',
    './js/activity-days.js?v=440',
    './js/pwa-install.js?v=440',
    './js/media-hosts.js?v=440',
    './js/security.js?v=440',
    './js/community-stats-view.js?v=440',
    './js/social-challenge-readiness.js?v=440',
    './js/ui-helpers.js?v=440',
    './js/upload-performance.js?v=440',
    './js/video-thumbnail-quality.js?v=440',
    './js/browser-detect.js?v=440',
    './js/webview-detect.js?v=440',
    './manifest.json',
    './manifest-en.json',
    './en/index.html',
    './en/privacy.html',
    './en/terms.html',
    './icons/icon-192.png',
    './icons/icon-192.svg',
    './icons/icon-512.png',
    './icons/icon-512.svg',
    './icons/apple-touch-icon.svg',
    './icons/notification-badge.png',
    './icons/feature-graphic.png',
    './icons/feature-graphic-minimal.png',
    './firebase-messaging-sw.js',
    './icons/og-image.png',
    './icons/og-image-en.png',
    './assets/guest-demo/meal.webp',
    './assets/guest-demo/exercise.webp',
    './assets/guest-demo/mind.webp'
];

const INDEX_URL = new URL('./', self.location).href;
const EN_INDEX_URL = new URL('./en/index.html', self.location).href;
const EN_PRIVACY_URL = new URL('./en/privacy.html', self.location).href;
const EN_TERMS_URL = new URL('./en/terms.html', self.location).href;

function getOfflineNavigationFallback(pathname) {
    if (pathname === '/en/privacy' || pathname === '/en/privacy.html') return EN_PRIVACY_URL;
    if (pathname === '/en/terms' || pathname === '/en/terms.html') return EN_TERMS_URL;
    if (pathname === '/en' || pathname === '/en/' || pathname === '/en/index.html' || pathname.startsWith('/en/')) {
        return EN_INDEX_URL;
    }
    return INDEX_URL;
}

self.addEventListener('install', (event) => {
    console.log('[SW] install');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] activate');
    event.waitUntil(
        caches.keys().then((cacheNames) => Promise.all(
            cacheNames
                .filter((name) => ![CACHE_NAME, SHARE_TARGET_CACHE_NAME].includes(name))
                .map((name) => {
                    console.log('[SW] delete old cache:', name);
                    return caches.delete(name);
                })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);

    if (!request.url.startsWith(self.location.origin)) {
        return;
    }

    // Firebase 예약 경로(/__/auth/handler 등)는 손대지 않는다. 리디렉트 로그인이
    // 이 경로로 오가는데, 응답을 캐시에 넣어 두면 그때그때 다른 상태를 담은 페이지에
    // 지난 응답을 돌려주게 된다. 그냥 네트워크에 맡긴다.
    if (requestUrl.pathname.startsWith('/__/')) {
        return;
    }

    if (request.method === 'POST' && requestUrl.pathname === SHARE_TARGET_ACTION_PATH) {
        event.respondWith(
            handleSharedTarget(request).catch((error) => {
                console.warn('[SW] share target handling failed:', error?.message || error);
                const fallbackUrl = new URL('/?tab=diet&focus=upload#diet', self.location.origin);
                return Response.redirect(fallbackUrl.href, 303);
            })
        );
        return;
    }

    if (request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request).then((cached) => {
                if (cached) return cached;
                if (request.mode === 'navigate') {
                    const fallbackUrl = getOfflineNavigationFallback(requestUrl.pathname);
                    return caches.match(fallbackUrl).then((fallback) => fallback || caches.match(INDEX_URL));
                }
                return new Response('', { status: 503 });
            }))
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close' || event.action === 'dismiss') return;

    const actionUrls = event.notification.data?.actionUrls || {};
    const actionUrl = event.action && typeof actionUrls[event.action] === 'string'
        ? actionUrls[event.action]
        : '';
    const url = actionUrl || event.notification.data?.url || '/';
    const destination = new URL(url, self.location.origin).href;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(async (clientList) => {
                const isHabitschoolAppWindowClient = (client) => {
                    try {
                        const url = new URL(client.url);
                        return url.origin === self.location.origin
                            && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/en' || url.pathname === '/en/index.html');
                    } catch (_) {
                        return false;
                    }
                };

                const appClients = clientList.filter(isHabitschoolAppWindowClient);
                const rankedClients = [
                    ...appClients.filter((client) => client.visibilityState === 'visible'),
                    ...appClients.filter((client) => client.focused === true),
                    ...appClients
                ];
                const targetClient = rankedClients[0];

                if (targetClient) {
                    try {
                        if ('focus' in targetClient) {
                            await targetClient.focus();
                        }
                        targetClient.postMessage({
                            type: 'habitschool-notification-open',
                            targetUrl: destination
                        });
                        return targetClient;
                    } catch (error) {
                        console.warn('[SW] notification focus/postMessage failed:', error?.message || error);
                    }
                }

                try {
                    const openedClient = await self.clients.openWindow(destination);
                    if (openedClient && 'focus' in openedClient) {
                        return openedClient.focus();
                    }
                    return openedClient;
                } catch (error) {
                    console.warn('[SW] notification openWindow failed:', error?.message || error);
                    return undefined;
                }
            })
    );
});
