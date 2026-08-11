import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('PWA-only pivot guardrails', () => {
    it('keeps Health Connect step import dormant in the web UI while retaining the code path', () => {
        const indexSource = readRepoFile('index.html');
        const appSource = readAppSource();

        expect(indexSource).not.toContain('exercise-health-connect-btn');
        expect(appSource).toContain('const ENABLE_HEALTH_CONNECT_STEP_IMPORT = false;');
        expect(appSource).toContain('window.startNativeHealthConnectSync = startNativeHealthConnectSync;');
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
});
