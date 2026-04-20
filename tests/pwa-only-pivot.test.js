import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

describe('PWA-only pivot guardrails', () => {
    it('keeps Health Connect step import dormant in the web UI while retaining the code path', () => {
        const indexSource = readRepoFile('index.html');
        const appSource = readRepoFile('js/app.js');

        expect(indexSource).not.toContain('exercise-health-connect-btn');
        expect(appSource).toContain('const ENABLE_HEALTH_CONNECT_STEP_IMPORT = false;');
        expect(appSource).toContain('window.startNativeHealthConnectSync = startNativeHealthConnectSync;');
    });

    it('uses PWA-first install copy instead of native app wording', () => {
        const appSource = readRepoFile('js/app.js');
        const pwaInstallSource = readRepoFile('js/pwa-install.js');

        expect(pwaInstallSource).toContain("buttonLabel: '홈 화면에 추가'");
        expect(appSource).toContain("installState.buttonLabel || '홈 화면에 추가'");
        expect(pwaInstallSource).not.toContain("buttonLabel: '해빛스쿨 앱 설치'");
    });

    it('stops exposing direct APK hosting paths from firebase hosting config', () => {
        const firebaseConfig = JSON.parse(readRepoFile('firebase.json'));
        const hostingConfig = firebaseConfig.hosting[0];

        expect(hostingConfig.predeploy).toBeUndefined();
        expect(hostingConfig.ignore).toContain('android/**');
        expect(hostingConfig.ignore).toContain('install/**');
        expect(hostingConfig.ignore).toContain('scripts/**');
    });
});
