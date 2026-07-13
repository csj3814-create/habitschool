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

describe('guest asset demo token visibility', () => {
    it('shows example HBT and its conversion path without hiding it as an advanced feature', () => {
        const html = renderGuestDemoTab('assets', createGuestDemoSession());

        expect(html).toContain('두 가지 예시 자산');
        expect(html).toContain('예시 HBT');
        expect(html).toContain('포인트로 HBT 모으기');
        expect(html).toContain('로그인하고 HBT 시작하기');
        expect(html).toContain('data-guest-login-action="open_wallet"');
        expect(html).not.toContain('고급 자산 기능');
        expect(html).not.toContain('<details');
    });
});
