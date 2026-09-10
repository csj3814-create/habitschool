import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('PWA-only pivot guardrails', () => {
    // 2026-09-10: 이 가드는 원래 "4월 PWA-only pivot 상태를 유지한다"였다. 그런데 그
    // pivot 은 7월에 이미 뒤집혔다 — Play 라이트 빌드(bbe1f2b), Play 서명키 등록
    // (f645c50), versionCode 6(19665d7). 웹 플래그만 4월 상태로 남아 브리지가 죽어
    // 있었다. 그래서 가드의 의도를 "기능 OFF 고정"에서 "브리지가 살아 있고 양쪽
    // 폴백이 남아 있다"로 바꾼다. READ_STEPS 는 f9d0d81(4/8)부터 매니페스트에 있어
    // 트랙의 versionCode 2·3·4·5 가 전부 이 권한을 달고 통과했으므로, 되살리는 데
    // 새 Android 권한은 필요 없다.
    it('keeps the Health Connect step bridge wired end to end', () => {
        const indexSource = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(indexSource).toContain('exercise-health-connect-btn');
        expect(indexSource).toContain('onclick="startNativeHealthConnectSync()"');
        expect(appSource).toContain('const ENABLE_HEALTH_CONNECT_STEP_IMPORT = true;');
        expect(appSource).toContain('window.startNativeHealthConnectSync = startNativeHealthConnectSync;');
    });

    // 네이티브 셸(AppRoutes.kt)이 값을 넘기는 통로는 이 두 가지뿐이다. TWA 에는 JS
    // 브리지가 없어서 딥링크와 URL 쿼리 말고는 방법이 없다. 이름이 바뀌면 앱을
    // 다시 배포하기 전까지 걸음 수가 조용히 안 들어온다.
    it('keeps the native handoff contract that the Android shell writes', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("new URL('habitschool://health-connect/sync')");
        expect(appSource).toContain("syncUrl.searchParams.set('returnTo'");
        for (const param of ['stepCount', 'stepSource', 'stepProvider', 'syncedAt']) {
            expect(appSource, `native handoff param "${param}" should survive`).toContain(param);
        }
    });

    it('uses PWA-first install copy instead of native app wording', () => {
        const appSource = readAppSource();
        const pwaInstallSource = readRepoFile('js/pwa-install.js');

        // 문구는 그대로 'PWA 설치'다. 다만 영어 앱에서 이 버튼만 한국어로 남아 있어,
        // 상수를 로케일을 보는 함수로 바꿨다(자바스크립트가 그리는 자리라 data-i18n이 닿지 않는다).
        expect(pwaInstallSource).toContain("window.getInstallButtonLabel = function ()");
        expect(pwaInstallSource).toContain("'홈 화면에 앱 설치'");
        expect(pwaInstallSource).toContain("'Add to home screen'");
        expect(pwaInstallSource).toContain('buttonLabel: window.getInstallButtonLabel()');
        expect(appSource).toContain("installState.buttonLabel || window.getInstallButtonLabel?.() || '홈 화면에 앱 설치'");
        // 네이티브 앱 문구로 돌아가지 않는다.
        expect(pwaInstallSource).not.toContain("buttonLabel: '해빛스쿨 앱 설치'");
        // pwa-install.js 는 일반 스크립트로 로드된다. export 를 쓰면 그 자리에서 깨진다.
        expect(pwaInstallSource).not.toMatch(/^export /m);
    });

    it('stops exposing direct APK hosting paths from firebase hosting config', () => {
        const firebaseConfig = JSON.parse(readRepoFile('firebase.json'));
        const hostingConfig = firebaseConfig.hosting[0];

        expect(hostingConfig.predeploy).toBeUndefined();
        expect(hostingConfig.ignore).toContain('android/**');
        expect(hostingConfig.ignore).toContain('install/**');
        expect(hostingConfig.ignore).toContain('scripts/**');
    });

    it('waits briefly for supported Android install prompts but avoids Samsung Internet dead waits', () => {
        const pwaInstallSource = readRepoFile('js/pwa-install.js');

        expect(pwaInstallSource).toContain('let installPromptWaiters = [];');
        expect(pwaInstallSource).toContain('function canWaitForNativeInstallPrompt() {');
        expect(pwaInstallSource).toContain('function isSamsungInternetBrowser() {');
        expect(pwaInstallSource).toContain('&& !isSamsungInternetBrowser();');
        expect(pwaInstallSource).toContain('async function waitForDeferredInstallPrompt(timeoutMs = ANDROID_INSTALL_PROMPT_WAIT_MS) {');
        expect(pwaInstallSource).toContain('const promptEvent = deferredInstallPrompt || await waitForDeferredInstallPrompt();');
        expect(pwaInstallSource).toContain('flushInstallPromptWaiters(event);');
    });

    it('shows a Samsung Internet fallback with a Chrome open option instead of promising one-click install', () => {
        const pwaInstallSource = readRepoFile('js/pwa-install.js');

        expect(pwaInstallSource).toContain('function showSamsungInstallFallback() {');
        expect(pwaInstallSource).toContain("body.textContent = '삼성 인터넷은 주소창 설치 아이콘을 브라우저가 조건에 맞을 때만 보여줘요.';");
        expect(pwaInstallSource).toContain("const chromeButton = createInstallFallbackButton('Chrome에서 열기', 'primary');");
        expect(pwaInstallSource).toContain('window.location.href = getChromeIntentUrl();');
        expect(pwaInstallSource).toContain('if (!deferredInstallPrompt && isSamsungInternetBrowser()) {');
        expect(pwaInstallSource).toContain('showSamsungInstallFallback();');
        expect(pwaInstallSource).not.toContain('SAMSUNG_INSTALL_PROMPT_WAIT_MS');
    });

    // 2026-09-07: 배너가 "앱이 설치돼 있어요" 라고 알리기만 하고 여는 방법이 없었다.
    // 배너 전체가 누르는 자리이고, 닫기(×)만 전파를 끊어야 한다.
    it('opens the installed Android app from anywhere on the banner, except the dismiss button', () => {
        const indexSource = readRepoFile('index.html');
        const pwaInstallSource = readRepoFile('js/pwa-install.js');

        expect(indexSource).toContain('onclick="openInInstalledApp()" onkeydown="handleOpenInAppBannerKeydown(event)"');
        expect(indexSource).toContain('onclick="event.stopPropagation(); dismissOpenInAppBanner();"');

        // 해시는 intent URI 의 구분자와 충돌하므로 담지 않는다. 폴백은 반드시 붙인다.
        expect(pwaInstallSource).toContain("const APP_ANDROID_PACKAGE_NAME = 'com.habitschool.app';");
        expect(pwaInstallSource).toContain('S.browser_fallback_url=${fallbackUrl};end');
        expect(pwaInstallSource).not.toContain('${currentUrl.hash}');
        expect(pwaInstallSource).toContain('window.openInInstalledApp = openInInstalledApp;');
    });
});

// 2026-09-08: 삼성 인터넷의 팝업 로그인이 Gmail 로 새던 문제를 고쳐 배포했는데,
// 그 전에 열어 둔 탭에서 로그인하니 같은 증상이 다시 났다. 배포된 코드는 멀쩡했고
// 그 탭만 옛 자바스크립트를 쥐고 있었다. skipWaiting + clients.claim 은 캐시 주인만
// 바꾸지 페이지를 다시 읽지 않는다.
describe('a tab that was open before the deploy does not keep the old login code', () => {
    it('reloads on controllerchange, but only from the login screen', () => {
        const pwa = readRepoFile('js/pwa-install.js');
        expect(pwa).toContain('function watchForServiceWorkerTakeover()');
        expect(pwa).toContain("navigator.serviceWorker.addEventListener('controllerchange'");
        expect(pwa).toContain('watchForServiceWorkerTakeover();');

        const fn = pwa.split('function watchForServiceWorkerTakeover() {')[1].split('\n}\n')[0];
        // 로그인 중이거나 로그인한 뒤에 페이지를 날리면 그게 더 큰 사고다.
        expect(fn).toContain('if (window._isPopupLogin) return;');
        expect(fn).toContain("classList.contains('signed-in')");
        expect(fn).toContain('onLoginScreen');
        // 한 번만. 반복 리로드는 무한 루프가 된다.
        expect(fn).toContain('if (serviceWorkerTakeoverHandled) return;');
        expect(fn).toContain('serviceWorkerTakeoverHandled = true;');
        expect(fn).toContain('location.reload();');
    });

    it('still lets the worker take over immediately', () => {
        const sw = readRepoFile('sw.js');
        expect(sw).toContain('self.skipWaiting()');
        expect(sw).toContain('self.clients.claim()');
    });
});
