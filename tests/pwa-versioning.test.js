import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

function captureVersion(source, pattern, label) {
    const match = source.match(pattern);
    expect(match, `${label} version should exist`).toBeTruthy();
    return match[1];
}

function expectVersionedLocalImports(source, releaseVersion, label) {
    const importMatches = [...source.matchAll(/(?:from|import) '\.\/([^']+\.js(?:\?v=\d+)?)'/g)];
    expect(importMatches.length, `${label} should keep local imports explicit`).toBeGreaterThan(0);

    for (const [, specifier] of importMatches) {
        expect(specifier.endsWith(`?v=${releaseVersion}`), `${label} import "${specifier}" should use ?v=${releaseVersion}`).toBe(true);
    }
}

describe('PWA asset versioning', () => {
    it('keeps entrypoint and service worker versions aligned', () => {
        const indexSource = readRepoFile('index.html');
        const mainSource = readRepoFile('js/main.js');
        const appEntrySource = readRepoFile('js/app.js');
        const appCoreSource = readRepoFile('js/app-core.js');
        const authSource = readRepoFile('js/auth.js');
        const blockchainManagerSource = readRepoFile('js/blockchain-manager.js');
        const dataManagerSource = readRepoFile('js/data-manager.js');
        const dietAnalysisSource = readRepoFile('js/diet-analysis.js');
        const pwaInstallSource = readRepoFile('js/pwa-install.js');
        const uiHelpersSource = readRepoFile('js/ui-helpers.js');
        const stylesEntrySource = readRepoFile('styles.css');
        const swSource = readRepoFile('sw.js');
        const firebaseMessagingSwSource = readRepoFile('firebase-messaging-sw.js');
        const firebaseConfig = JSON.parse(readRepoFile('firebase.json'));

        const releaseVersion = captureVersion(indexSource, /js\/app\.js\?v=(\d+)/, 'index app.js');

        expect(captureVersion(indexSource, /styles\.css\?v=(\d+)/, 'index styles.css')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/webview-detect\.js\?v=(\d+)/, 'index webview-detect.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/main\.js\?v=(\d+)/, 'index main.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/diet-analysis\.js\?v=(\d+)/, 'index diet-analysis.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/metabolic-score\.js\?v=(\d+)/, 'index metabolic-score.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/pwa-install\.js\?v=(\d+)/, 'index pwa-install.js')).toBe(releaseVersion);

        expect(captureVersion(mainSource, /\.\/auth\.js\?v=(\d+)/, 'main auth import')).toBe(releaseVersion);
        expect(captureVersion(mainSource, /blockchain-manager\.js\?v=(\d+)/, 'main blockchain import')).toBe(releaseVersion);
        expect(captureVersion(appEntrySource, /app-core\.js\?v=(\d+)/, 'app entry core import')).toBe(releaseVersion);
        expect(captureVersion(appCoreSource, /blockchain-manager\.js\?v=(\d+)/, 'app core blockchain import')).toBe(releaseVersion);
        expect(captureVersion(authSource, /blockchain-manager\.js\?v=(\d+)/, 'auth blockchain import')).toBe(releaseVersion);
        expect(pwaInstallSource).toContain("const APP_SERVICE_WORKER_PATH = '/sw.js';");
        expect(firebaseMessagingSwSource).toContain("importScripts('/sw.js');");
        expect(captureVersion(swSource, /habitschool-v(\d+)/, 'service worker cache')).toBe(releaseVersion);
        expect(captureVersion(stylesEntrySource, /styles-base\.css\?v=(\d+)/, 'styles base import')).toBe(releaseVersion);
        expect(captureVersion(stylesEntrySource, /styles-features\.css\?v=(\d+)/, 'styles features import')).toBe(releaseVersion);
        expect(captureVersion(stylesEntrySource, /styles-dashboard\.css\?v=(\d+)/, 'styles dashboard import')).toBe(releaseVersion);
        expect(captureVersion(stylesEntrySource, /styles-dark-mode\.css\?v=(\d+)/, 'styles dark mode import')).toBe(releaseVersion);
        expect(captureVersion(stylesEntrySource, /styles-reports\.css\?v=(\d+)/, 'styles reports import')).toBe(releaseVersion);

        expectVersionedLocalImports(appEntrySource, releaseVersion, 'app.js');
        expectVersionedLocalImports(appCoreSource, releaseVersion, 'app-core.js');
        expectVersionedLocalImports(authSource, releaseVersion, 'auth.js');
        expectVersionedLocalImports(blockchainManagerSource, releaseVersion, 'blockchain-manager.js');
        expectVersionedLocalImports(dataManagerSource, releaseVersion, 'data-manager.js');
        expectVersionedLocalImports(dietAnalysisSource, releaseVersion, 'diet-analysis.js');
        expectVersionedLocalImports(mainSource, releaseVersion, 'main.js');
        expectVersionedLocalImports(uiHelpersSource, releaseVersion, 'ui-helpers.js');

        expect(swSource).toContain(`'./styles.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./styles-base.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./styles-features.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./styles-dashboard.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./styles-dark-mode.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./styles-reports.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/main.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/app.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/app-core.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/app-mode.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/auth.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/auth-login-helpers.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/blockchain-config.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/blockchain-manager.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/data-manager.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/diet-analysis.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/exercise-media.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/firebase-config.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/health-connect-utils.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/metabolic-score.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/milestone-helpers.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/pwa-install.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/security.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/ui-helpers.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/upload-performance.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/webview-detect.js?v=${releaseVersion}'`);
        expect(swSource).toContain("'./firebase-messaging-sw.js'");

        const headerSources = firebaseConfig.hosting[0].headers.map((item) => item.source);
        expect(headerSources).toContain('/');
        expect(headerSources).toContain('**/*.html');
        expect(headerSources).toContain('/manifest.json');
        expect(headerSources).toContain('/styles.css');
        expect(headerSources).toContain('/js/**');
        expect(headerSources).toContain('/sw.js');
        expect(headerSources).toContain('/firebase-messaging-sw.js');
    });
});
