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

describe('라이트 모드에서 무료 챌린지 시작', () => {
    const importLinesOf = (source) => source
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('import '))
        .join('\n');

    it('시작 버튼이 오지 않을 "잠시 후"를 기다리게 하지 않는다', () => {
        const main = readRepoFile('js/main.js');
        // 라이트는 blockchain-manager 를 영영 안 싣는다. 자리표시자로 두면
        // 3일 미니 챌린지를 눌러도 알림만 뜨고 아무 일도 일어나지 않는다.
        expect(main).toContain("window.startChallenge30D = (challengeId) => import('./challenge-claim.js");
        expect(main).toContain('mod.isFreeChallenge(challengeId)');
        expect(main).toContain('mod.startFreeChallenge(challengeId)');
    });

    it('무료 시작 경로가 지갑 코드를 끌어오지 않는다', () => {
        const claim = readRepoFile('js/challenge-claim.js');
        expect(claim).toContain('export async function startFreeChallenge(');
        expect(claim).toContain("httpsCallable(functions, 'startChallenge')");

        // 검사 대상은 실제 import 줄뿐이다 — 설명 주석에도 같은 낱말이 나온다.
        const imports = importLinesOf(claim);
        expect(imports.length).toBeGreaterThan(0);
        expect(imports).not.toContain('blockchain-manager');
        expect(imports).not.toContain('ethers');
        // 설정 파일은 import 가 하나도 없는 순수 상수라 라이트에서도 안전하다.
        expect(imports).toContain('blockchain-config.js');
        expect(importLinesOf(readRepoFile('js/blockchain-config.js'))).toBe('');
    });

    it('예치가 필요한 티어는 무료 경로로 시작되지 않는다', () => {
        const claim = readRepoFile('js/challenge-claim.js');
        // 유료를 여기로 흘리면 예치 없이 시작된 것처럼 보인다. 조용히 넘기지 않는다.
        expect(claim).toContain('if (Number(def.hbtStake || 0) > 0)');
    });

    it('라이트에서 유료 티어 카드는 감춰져 있다', () => {
        const css = readRepoFile('styles-base.css');
        expect(css).toContain('.play-mode #tier-card-weekly');
        expect(css).toContain('.play-mode #tier-card-master');
    });
});
