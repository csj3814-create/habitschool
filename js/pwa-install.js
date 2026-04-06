// Service Worker registration & PWA install prompt
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

        if (isLocalHost) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(reg => reg.unregister()));

                if ('caches' in window) {
                    const keys = await caches.keys();
                    await Promise.all(
                        keys
                            .filter(key => key.startsWith('habitschool-'))
                            .map(key => caches.delete(key))
                    );
                }

                console.log('🧹 localhost에서는 SW와 캐시를 비활성화했습니다.');
            } catch (err) {
                console.warn('localhost SW 정리 실패:', err);
            }
            return;
        }

        navigator.serviceWorker.register('./sw.js?v=112')
            .then(reg => {
                console.log('✅ SW 등록:', reg.scope);
                reg.update();
            })
            .catch(err => console.warn('모바일 SW 등록 실패:', err));
    });
}

// PWA install prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (localStorage.getItem('pwa_install_dismissed')) return;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
        banner.style.display = 'flex';
        banner.classList.add('pwa-banner-animate');
        window.scheduleFloatingBarLayoutUpdate?.();
        setTimeout(() => {
            banner.classList.add('pwa-banner-fadeout');
            setTimeout(() => {
                banner.style.display = 'none';
                banner.classList.remove('pwa-banner-fadeout', 'pwa-banner-animate');
            }, 500);
        }, 6000);
    }
});

// Hide banner after install
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    console.log('✅ 앱 설치 완료');
});

function installPWA() {
    if (!deferredInstallPrompt) {
        alert('홈 화면에 추가하려면\n\niOS: 공유 버튼(□↑) → "홈 화면에 추가"\nPC: 주소창 오른쪽 설치 아이콘 클릭');
        return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
            console.log('사용자가 앱 설치를 허용했습니다.');
        }
        deferredInstallPrompt = null;
        document.getElementById('pwa-install-banner').style.display = 'none';
    });
}

function dismissInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    window.scheduleFloatingBarLayoutUpdate?.();
    localStorage.setItem('pwa_install_dismissed', Date.now());
}
