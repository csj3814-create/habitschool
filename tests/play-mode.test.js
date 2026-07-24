import { describe, expect, it } from 'vitest';
import { getRouteContext, isPlayModeActive } from '../js/app-mode.js';
import { readRepoFile } from './source-helpers.js';

describe('play (Google Play lite) mode', () => {
    it('routes /app to play mode with full tabs, not simple', () => {
        const ctx = getRouteContext('/app');
        expect(ctx.isPlay).toBe(true);
        expect(ctx.isSimple).toBe(false);
        expect(ctx.mode).toBe('default');
        expect(ctx.basePath).toBe('/app');
        expect(ctx.locale).toBe('ko');
    });

    it('treats /app/index.html as play mode too', () => {
        expect(getRouteContext('/app/index.html').isPlay).toBe(true);
    });

    it('leaves the normal root and other routes on-chain', () => {
        expect(getRouteContext('/').isPlay).toBe(false);
        expect(getRouteContext('/simple').isPlay).toBe(false);
        expect(getRouteContext('/en').isPlay).toBe(false);
        expect(isPlayModeActive('/')).toBe(false);
    });

    it('reports play mode active on the /app path', () => {
        expect(isPlayModeActive('/app')).toBe(true);
    });

    it('never loads the blockchain module in play mode (no wallet is created)', () => {
        const main = readRepoFile('js/main.js');
        // 중앙 게이트웨이가 play 모드에서 거부한다.
        expect(main).toContain('window.__HABITSCHOOL_PLAY_MODE');
        expect(main).toContain("if (window.__HABITSCHOOL_PLAY_MODE) return Promise.reject(new Error('play_mode_no_blockchain'));");

        const appCore = readRepoFile('js/app-core.js');
        // 최상위 동적 import도 play 모드에서 건너뛴다.
        expect(appCore).toContain('const _playModeNoBlockchain =');
        expect(appCore).toContain('if (!_playModeNoBlockchain) import(BLOCKCHAIN_MANAGER_MODULE_PATH)');
    });

    it('hides on-chain UI via the play-mode body class', () => {
        const css = readRepoFile('styles-base.css');
        expect(css).toContain('body.play-mode #wallet-asset-hbt-item');
        expect(css).toContain('body.play-mode .wallet-convert-card');
        expect(css).toContain('body.play-mode .asset-advanced-details');
        expect(css).toContain('body.play-mode #tier-card-weekly');
        expect(css).toContain('body.play-mode #tier-card-master');
    });

    it('serves /app from the shared index via a hosting rewrite', () => {
        const firebase = JSON.parse(readRepoFile('firebase.json'));
        const rewrites = firebase.hosting[0].rewrites;
        expect(rewrites.some(r => r.source === '/app' && r.destination === '/index.html')).toBe(true);
    });

    it('points the Android TWA at the /app lite entry', () => {
        const manifest = readRepoFile('android/app/src/main/AndroidManifest.xml');
        expect(manifest).toContain('https://habitschool.web.app/app');
    });
});
