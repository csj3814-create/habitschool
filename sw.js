/**
 * Service Worker - 해빛스쿨 PWA
 * 오프라인 캐싱 및 백그라운드 동기화
 */

// Firebase Messaging (백그라운드 푸시 수신)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyDICPw7HTmu5znaRCYC93-zTux4dYYN9eI",
    authDomain: "habitschool-8497b.firebaseapp.com",
    projectId: "habitschool-8497b",
    storageBucket: "habitschool-8497b.firebasestorage.app",
    messagingSenderId: "628617480821",
    appId: "1:628617480821:web:2756952ab78e8edf97463c"
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신 (앱이 닫혀 있거나 탭이 비활성일 때)
messaging.onBackgroundMessage((payload) => {
    const d = payload.data || {};
    self.registration.showNotification(d.title || '해빛스쿨', {
        body: d.body || '',
        icon: d.icon || './icons/icon-192.svg',
        badge: './icons/icon-192.svg',
        tag: d.tag || 'habitschool',
        data: { url: d.url || '/' },
        vibrate: [100, 50, 100]
    });
});

const CACHE_NAME = 'habitschool-v97';
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

// 설치: 즉시 활성화 (구버전 캐시로 인한 지연 방지)
self.addEventListener('install', (event) => {
    console.log('[SW] 설치 시작');
    event.waitUntil(self.skipWaiting());
});

// 활성화: 구 캐시 정리 + 즉시 제어
self.addEventListener('activate', (event) => {
    console.log('[SW] 활성화');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] 구 캐시 삭제:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// 모든 요청: Network First, Cache Fallback (항상 최신 파일 우선)
self.addEventListener('fetch', (event) => {
    const { request } = event;

    if (
        request.method !== 'GET' ||
        !request.url.startsWith(self.location.origin)
    ) {
        return;
    }

    event.respondWith(
        fetch(request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => caches.match(request).then(r => r || new Response('', { status: 503 })))
    );
});

// 푸시 알림 클릭 처리
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    if (event.action === 'close') return;

    const url = event.notification.data?.url || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // 이미 열린 탭이 있으면 포커스
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        return client.focus();
                    }
                }
                // 새 탭 열기
                return self.clients.openWindow(url);
            })
    );
});
