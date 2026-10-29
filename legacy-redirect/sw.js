// 옛 사이트(habitschool-8497b.web.app)의 서비스 워커를 걷어 낸다.
// 옛 sw.js 는 4월 판 앱을 캐시해 두고 먼저 내줬다. 이 파일이 그 자리를 이어받아
// 캐시를 비우고 스스로 등록을 풀고, 열려 있던 창을 새로 불러 넘김 페이지로 보낸다.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
        await self.registration.unregister();
        const windows = await self.clients.matchAll({ type: 'window' });
        windows.forEach((client) => client.navigate(client.url));
    })());
});
