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
            icon: d.icon || './icons/icon-192.svg',
            badge: './icons/icon-192.svg',
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

const CACHE_NAME = 'habitschool-v114';
const STATIC_ASSETS = [
    './',
    './styles.css',
    './js/main.js',
    './js/app.js',
    './js/auth.js',
    './js/firebase-config.js',
    './js/data-manager.js',
    './js/diet-analysis.js',
    './js/metabolic-score.js',
    './js/ui-helpers.js',
    './js/security.js',
    './js/blockchain-config.js',
    './js/blockchain-manager.js',
    './js/pwa-install.js',
    './js/webview-detect.js',
    './manifest.json',
    './icons/icon-192.svg',
    './icons/icon-512.svg',
    './icons/icon-512.png',
    './icons/apple-touch-icon.svg'
];

const INDEX_URL = new URL('./', self.location).href;

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
                .filter((name) => name !== CACHE_NAME)
                .map((name) => {
                    console.log('[SW] delete old cache:', name);
                    return caches.delete(name);
                })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) {
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
                    return caches.match(INDEX_URL);
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
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.startsWith(self.location.origin)) {
                        if ('navigate' in client) {
                            return client.navigate(destination).then(() => client.focus());
                        }
                        if ('focus' in client) {
                            return client.focus();
                        }
                    }
                }
                return self.clients.openWindow(destination);
            })
    );
});
