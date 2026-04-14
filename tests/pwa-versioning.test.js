import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(TEST_DIR, '..');

function readRepoFile(relativePath) {
    return readFileSync(resolve(ROOT_DIR, relativePath), 'utf8');
}

function captureVersion(source, pattern, label) {
    const match = source.match(pattern);
    expect(match, `${label} version should exist`).toBeTruthy();
    return match[1];
}

describe('PWA asset versioning', () => {
    it('keeps entrypoint and service worker versions aligned', () => {
        const indexSource = readRepoFile('index.html');
        const mainSource = readRepoFile('js/main.js');
        const appSource = readRepoFile('js/app.js');
        const authSource = readRepoFile('js/auth.js');
        const pwaInstallSource = readRepoFile('js/pwa-install.js');
        const swSource = readRepoFile('sw.js');

        const releaseVersion = captureVersion(indexSource, /js\/app\.js\?v=(\d+)/, 'index app.js');

        expect(captureVersion(indexSource, /styles\.css\?v=(\d+)/, 'index styles.css')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/webview-detect\.js\?v=(\d+)/, 'index webview-detect.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/main\.js\?v=(\d+)/, 'index main.js')).toBe(releaseVersion);
        expect(captureVersion(indexSource, /js\/pwa-install\.js\?v=(\d+)/, 'index pwa-install.js')).toBe(releaseVersion);

        expect(captureVersion(mainSource, /\.\/auth\.js\?v=(\d+)/, 'main auth import')).toBe(releaseVersion);
        expect(captureVersion(mainSource, /blockchain-manager\.js\?v=(\d+)/, 'main blockchain import')).toBe(releaseVersion);
        expect(captureVersion(appSource, /blockchain-manager\.js\?v=(\d+)/, 'app blockchain import')).toBe(releaseVersion);
        expect(captureVersion(authSource, /blockchain-manager\.js\?v=(\d+)/, 'auth blockchain import')).toBe(releaseVersion);
        expect(captureVersion(pwaInstallSource, /sw\.js\?v=(\d+)/, 'pwa-install service worker register')).toBe(releaseVersion);
        expect(captureVersion(swSource, /habitschool-v(\d+)/, 'service worker cache')).toBe(releaseVersion);

        expect(swSource).toContain(`'./styles.css?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/main.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/app.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/auth.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/blockchain-manager.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/pwa-install.js?v=${releaseVersion}'`);
        expect(swSource).toContain(`'./js/webview-detect.js?v=${releaseVersion}'`);
    });
});
