// Service Worker 등록 & PWA 설치 프롬프트
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('✅ SW 등록:', reg.scope);
                reg.update();
            })
            .catch(err => console.warn('⚠️ SW 등록 실패:', err));
    });
}

// PWA 앱 설치 프롬프트
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (localStorage.getItem('pwa_install_dismissed')) return;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) {
        banner.style.display = 'flex';
        banner.classList.add('pwa-banner-animate');
        setTimeout(() => {
            banner.classList.add('pwa-banner-fadeout');
            setTimeout(() => {
                banner.style.display = 'none';
                banner.classList.remove('pwa-banner-fadeout', 'pwa-banner-animate');
            }, 500);
        }, 6000);
    }
});

// 이미 설치된 상태면 배너 숨기기
window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    console.log('✅ 해빛스쿨 앱 설치 완료!');
});

function installPWA() {
    if (!deferredInstallPrompt) {
        alert('홈 화면에 추가하려면:\n\n📱 iOS: 공유 버튼(□↑) → "홈 화면에 추가"\n💻 PC: 주소창 오른쪽 설치 아이콘 클릭');
        return;
    }
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then(choice => {
        if (choice.outcome === 'accepted') {
            console.log('✅ 사용자가 앱 설치를 수락했습니다.');
        }
        deferredInstallPrompt = null;
        document.getElementById('pwa-install-banner').style.display = 'none';
    });
}

function dismissInstallBanner() {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('pwa_install_dismissed', Date.now());
}
