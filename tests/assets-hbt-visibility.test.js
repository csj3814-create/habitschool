import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createGuestDemoSession, renderGuestDemoTab } from '../js/guest-demo.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readRepoFile = (path) => readFileSync(resolve(ROOT, path), 'utf8');

const indexSource = readRepoFile('index.html');
const appSource = readRepoFile('js/app-core.js');
const featureStyles = readRepoFile('styles-features.css');
const guestStyles = readRepoFile('styles-guest-demo.css');

function getFunctionSection(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe('asset HBT visibility and information architecture', () => {
    it('keeps point and HBT balances together with explicit onchain context', () => {
        const assetCard = indexSource.slice(
            indexSource.indexOf('id="wallet-asset-section"'),
            indexSource.indexOf('id="asset-reward-goal-card"')
        );

        expect(assetCard).toContain('id="asset-points-display"');
        expect(assetCard).toContain('id="asset-hbt-display"');
        expect(assetCard).toContain('💎 보유 HBT');
        expect(assetCard).toContain('id="asset-hbt-onchain"');
        expect(assetCard).toContain('id="asset-hbt-onchain-text"');
        // 안내문은 한 줄로 유지(모바일 2줄 꺾임 방지).
        expect(assetCard).toContain('HBT는 건강 챌린지 참여에 써요');
        expect(assetCard).toContain('가격이나 가치 상승을 보장하지 않습니다');
        expect(assetCard).not.toContain('>0 HBT<');
    });

    it('places HBT conversion at the top level and folds only secondary token tools', () => {
        const iaSection = getFunctionSection(
            appSource,
            'function ensureAssetInformationArchitecture()',
            'function updateAssetRewardGoal('
        );

        expect(iaSection).toContain("const convertCard = section.querySelector('.wallet-convert-card');");
        expect(iaSection).toContain('assetCard.after(convertCard);');
        expect(iaSection).toContain("summary.textContent = '채굴 정보 · 지갑 · 거래 기록 더 보기';");
        // 건강 습관 챌린지는 접힘 밖에 상시 노출(couponCard 바로 아래).
        expect(iaSection).toContain('if (challengeCard) couponCard.after(challengeCard);');
        expect(iaSection).not.toContain('asset-advanced-hbt');
        expect(iaSection).not.toContain("body.appendChild(section.querySelector('.wallet-convert-card'))");
        expect(iaSection).not.toContain("section.querySelector('.wallet-convert-card'),\n        section.querySelector('.wallet-halving-card')");
        expect(iaSection).toContain("section.querySelector('.wallet-challenge-card')");
        expect(iaSection).toContain("section.querySelector('.wallet-halving-card')");
        expect(iaSection).toContain("section.querySelector('.wallet-info-card')");
        expect(iaSection).toContain("section.querySelector('.wallet-tx-card')");
    });

    it('removes the redundant market jump while leaving the market directly after the goal', () => {
        expect(indexSource).not.toContain('해빛 마켓 보기');
        expect(indexSource).not.toContain('asset-reward-market-btn');
        expect(appSource).not.toContain('scrollToRewardMarket');
        expect(guestStyles).not.toContain('.asset-reward-market-btn');
        expect(appSource).toContain('goalCard.after(marketCard, couponCard);');
    });

    it('states the irreversible conversion and active BSC network without investment promises', () => {
        expect(indexSource).toContain('전환 후 되돌릴 수 없으며');
        // 배지는 한 줄 유지: 메인넷은 체인명만, 테스트넷만 '테스트용 HBT'로 구분한다.
        expect(appSource).toContain("isTestnet ? `${chainLabel} · 테스트용 HBT` : chainLabel");
        expect(appSource).toContain('`${chainLabel} · 현재 ${eraToLabel(currentPhase)}구간');
        expect(appSource).toContain('전환 후 되돌릴 수 없으며, 현재 비율은');
        expect(indexSource).not.toMatch(/수익|가격 상승|투자 기회/);
    });

    it('ends an unavailable onchain lookup in an explicit delayed state', () => {
        const delayedSection = getFunctionSection(
            appSource,
            'function markAssetHbtBalanceDelayed',
            'function applyAssetWalletSnapshot('
        );

        expect(delayedSection).toContain("display.textContent = '조회 지연';");
        expect(delayedSection).toContain("/\\d/.test(String(display.textContent || ''))");
        expect(delayedSection).toContain('_assetHbtDelayedStateTimer = setTimeout(applyState, 4000);');
        expect(appSource).toContain("markAssetHbtBalanceDelayed({ defer: window._blockchainLoaded !== true });");
        expect(appSource.match(/markAssetHbtBalanceDelayed\(/g)?.length).toBeGreaterThanOrEqual(7);
    });

    it('keeps the restored controls usable on small screens, in dark mode, and with reduced motion', () => {
        expect(featureStyles).toContain('font-size: clamp(17px, 5vw, 22px);');
        expect(featureStyles).toMatch(/\.wallet-preset-btn\s*\{[\s\S]*?min-height:\s*44px;/);
        expect(guestStyles).toContain('body.dark-mode .asset-reward-goal-card');
        expect(guestStyles).toContain('body.dark-mode .wallet-convert-card h3');
        expect(guestStyles).toContain('body.dark-mode .wallet-convert-desc');
        expect(guestStyles).toContain('.wallet-minichart-bar');
        expect(guestStyles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none;/);
    });
});

// 예전에는 체험 자산 탭에도 HBT를 실었고, 이 테스트가 "고급 기능으로 숨기지 말 것"을
// 지키고 있었다. 그 의도는 로그인 뒤 자산 탭에 그대로 살아 있다(위 describe 블록).
//
// 체험에서만 뺀 이유는 다르다. 구글플레이는 앱 안의 암호화폐 표현을 따로 심사하는데,
// 로그인도 하지 않은 첫 화면에서 토큰부터 보여 줄 이유가 없다.
describe('guest asset demo keeps the token out of the pre-login view', () => {
    it('shows points and the coupon goal, not the onchain token', () => {
        const html = renderGuestDemoTab('assets', createGuestDemoSession());

        expect(html).toContain('예시 포인트');
        expect(html).toContain('커피 쿠폰');
        // 체험에는 토큰이 등장하지 않는다.
        expect(html).not.toContain('HBT');
        expect(html).not.toContain('온체인');
        expect(html).not.toContain('지갑');
        // 숨긴 게 아니라 뺀 것이다 — 접어 두면 여전히 앱 안에 있는 셈이다.
        expect(html).not.toContain('고급 자산 기능');
        expect(html).not.toContain('<details');
    });

    // 체험 포인트는 쿠폰에 닿는 순간을 보여주려고 미리 채워 둔 값이라 실제 지급액이 아니다.
    // 2,000P를 받는다고 오해하면 가입 직후 200P를 보고 속았다고 느낀다.
    it('says plainly what a real signup actually grants', () => {
        const html = renderGuestDemoTab('assets', createGuestDemoSession());

        expect(html).toContain('예시');
        expect(html).toContain('200P');
        expect(html).toMatch(/실제로 가입하면/);
    });

    // 실제 지급액은 서버가 한 번만, 200P로 준다. 위 안내 문구가 이 값과 어긋나면 안 된다.
    it('matches the welcome bonus the server actually credits', () => {
        const functionsSource = readRepoFile('functions/runtime.js');

        expect(functionsSource).toContain('coins: FieldValue.increment(200)');
        expect(functionsSource).toContain('return { success: true, bonus: 200 };');
        // 중복 지급 방지 — 원장과 플래그 두 겹으로 막는다.
        expect(functionsSource).toContain('if (ledgerSnap.exists || userData.welcomeBonusGiven === true) {');
    });
});
