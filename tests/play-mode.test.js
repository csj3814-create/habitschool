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

    it('hides on-chain UI from the play-mode class on html or body', () => {
        const css = readRepoFile('styles-base.css');
        // html.play-mode(첫 페인트)와 body.play-mode(모듈 로드 후) 모두 매칭돼야 한다.
        expect(css).toContain('.play-mode #wallet-asset-hbt-item');
        expect(css).toContain('.play-mode #wallet-minichart');
        expect(css).toContain('.play-mode .wallet-convert-card');
        expect(css).toContain('.play-mode .asset-advanced-details');
        expect(css).toContain('.play-mode #tier-card-weekly');
        expect(css).toContain('.play-mode #tier-card-master');
        // 진행 중(동적 렌더) 위클리·마스터 링 카드도 숨긴다.
        expect(css).toContain('.play-mode .challenge-ring-card.tier-weekly-bg');
        expect(css).toContain('.play-mode .challenge-ring-card.tier-master-bg');
        expect(css).not.toContain('body.play-mode ');
    });

    it('decides play mode synchronously in head, before first paint', () => {
        // 판정이 모듈 로드 후로 밀리면 캐시된 HBT 값이 먼저 그려져 온체인이 순간 노출된다.
        const html = readRepoFile('index.html');
        const head = html.slice(0, html.indexOf('</head>'));
        expect(head).toContain("document.documentElement.classList.add('play-mode')");
        expect(head).toContain('android-app://com.habitschool.app');
        expect(head).toContain("sessionStorage.setItem('hs_play_context', '1')");
        expect(head).toContain('window.__HABITSCHOOL_PLAY_MODE = true');
        // JS 게이트는 head가 확정한 값을 덮어쓰지 않는다.
        expect(readRepoFile('js/main.js')).toContain('window.__HABITSCHOOL_PLAY_MODE === true');
        expect(readRepoFile('js/app-core.js')).toContain('const _playModeNoBlockchain = window.__HABITSCHOOL_PLAY_MODE === true');
    });

    it('drops weekly/master from the active challenge panel in play mode', () => {
        const appCore = readRepoFile('js/app-core.js');
        expect(appCore).toContain('if (_playModeNoBlockchain && activeChallenges');
        expect(appCore).toContain('delete activeChallenges.weekly;');
        expect(appCore).toContain('delete activeChallenges.master;');
    });

    it('keeps a sticky play context so version switching in the TWA never reveals crypto', () => {
        const appMode = readRepoFile('js/app-mode.js');
        expect(appMode).toContain("const PLAY_CONTEXT_KEY = 'hs_play_context';");
        expect(appMode).toContain('android-app://com.habitschool.app');
        expect(appMode).toContain('sessionStorage.setItem(PLAY_CONTEXT_KEY');
        // 블록체인 게이트도 sticky 세션 컨텍스트를 존중한다.
        const main = readRepoFile('js/main.js');
        expect(main).toContain("sessionStorage.getItem('hs_play_context') === '1'");
        const appCore = readRepoFile('js/app-core.js');
        expect(appCore).toContain("sessionStorage.getItem('hs_play_context') === '1'");
    });

    it('exposes a version switcher that maps to the four route paths', () => {
        const appCore = readRepoFile('js/app-core.js');
        expect(appCore).toContain("const APP_VERSION_PATHS = { ko: '/', simple: '/simple', en: '/en', app: '/app' };");
        expect(appCore).toContain('window.switchAppVersion = function');
        const html = readRepoFile('index.html');
        expect(html).toContain('class="version-switcher"');
        expect(html).toContain("switchAppVersion('app')");
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
