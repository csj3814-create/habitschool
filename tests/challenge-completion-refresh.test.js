import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 증상: "완료된 챌린지가 있습니다" 토스트를 보고 자산 탭에 갔더니 29/30(97%)이었고,
// 새로고침해도 그대로였다. 다른 앱에 갔다 돌아오니 그제서야 30/30 이 됐다.
//
// 원인: settleExpiredChallenges 는 refreshChallengeProgress 를 불러 서버의 진행도를
// 다시 계산해 둔다. 그런데 화면을 다시 그리는 건 실패(expired)한 티어가 있을 때뿐이었다.
// 마지막 날을 채워 완주하면 expiredTiers 가 비어 있으니 아무것도 다시 그리지 않았다.
// 서버만 고치고 화면은 두고 온 셈이라, 다시 들어와 새로 읽어야 100%가 보였다.

const MANAGER = readRepoFile('js/blockchain-manager.js');
const APP = readAppSource();

describe('finishing a challenge redraws the screen, not just the server', () => {
    it('notices the tiers that became claimable', () => {
        expect(MANAGER).toContain('const claimableTiers = Object.entries(activeChallenges)');
        expect(MANAGER).toContain("challenge?.status === 'claimable'");
    });

    it('refreshes for a completed challenge, not only a failed one', () => {
        expect(MANAGER).toContain('if (expiredTiers.length > 0 || claimableTiers.length > 0) {');
        expect(MANAGER).toContain("expiredTiers.length > 0 ? 'challenge-expiry' : 'challenge-claimable'");
    });

    it('still settles the failed ones first', () => {
        // 순서가 뒤집히면 실패 정산 전 화면을 그려 잠깐 틀린 상태를 보여준다.
        const fn = MANAGER.split('export async function settleExpiredChallenges() {')[1].split('\n}')[0];
        const settleAt = fn.indexOf('await settleFn({ tier });');
        const refreshAt = fn.indexOf('await refreshAssetDisplayAfterChallengeMutation(');
        expect(settleAt).toBeGreaterThan(-1);
        expect(refreshAt).toBeGreaterThan(settleAt);
    });
});

describe('the recompute does not wait behind the wallet', () => {
    it('runs before wallet initialisation on the asset tab', () => {
        // initializeUserWallet 은 최대 6초를 쓴다. 그 뒤에 정산을 걸면 그동안 어제 기준
        // 진행도가 확정처럼 보인다.
        const block = APP.split('const load = window._loadBlockchainModule || (() => Promise.resolve());')[1]
            .split('if (window.fetchOnchainBalance)')[0];
        const settleAt = block.indexOf('window.settleExpiredChallenges()');
        const walletAt = block.indexOf('window.initializeUserWallet()');
        expect(settleAt).toBeGreaterThan(-1);
        expect(walletAt).toBeGreaterThan(-1);
        expect(settleAt).toBeLessThan(walletAt);
    });
});

describe('a number that is about to change does not pretend to be final', () => {
    it('marks a finished-but-unsettled challenge as still being confirmed', () => {
        expect(APP).toContain('const isAwaitingSettlement = ch.status === \'ongoing\'');
        expect(APP).toContain('String(ch.endDate) <= todayStr;');
        expect(APP).toContain("? '정산 확인 중…'");
    });

    it('keeps the normal detail line for a challenge still running', () => {
        expect(APP).toContain(': `${progressPct}% · 남은 ${remain}일`;');
    });

    it('only applies while the status is ongoing, so claimable cards read normally', () => {
        // claimable 이 되면 '30/30일 완료 · 100% 달성'이 맞는 표시다.
        const line = APP.split('const isAwaitingSettlement = ')[1].split(';')[0];
        expect(line).toContain("ch.status === 'ongoing'");
    });
});
