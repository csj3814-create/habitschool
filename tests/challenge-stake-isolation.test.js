import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('challenge stake isolation', () => {
    it('starts weekly and master stakes in independent on-chain tier slots', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const managerSource = readRepoFile('js/blockchain-manager.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(runtimeSource).toContain('const CHALLENGE_TIER_INDEX = { mini: 0, weekly: 1, master: 2 };');
        expect(runtimeSource).toContain('async function startTieredChallengeStake');
        expect(runtimeSource).toContain('await stakingContract.getChallenge(userWalletAddress, tierIndex)');
        expect(runtimeSource).toContain('await stakingContract.startChallenge(');
        expect(runtimeSource).toContain('const stakeFlowVersionNumber = Number(stakeFlowVersion) || 1;');
        expect(runtimeSource).toContain('const hasTieredStakeRequestHint = !stakeTxHash && (stakeApprovalTxHash || stakeWalletAddress);');
        expect(runtimeSource).toContain('const isTieredStakeRequest = stakeAmount > 0 && (stakeFlowVersionNumber >= 2 || hasTieredStakeRequestHint);');
        expect(runtimeSource).toContain('stakeContractMode = "tiered"');
        expect(runtimeSource).not.toContain('HBT 예치 챌린지는 한 번에 하나만 참여할 수 있습니다.');

        expect(managerSource).toContain('async function verifyPaidChallengeStartEligibility');
        expect(managerSource).toContain('function getPendingChallengeStakeFlowVersion(pending = {})');
        expect(managerSource).toContain('if (pending.stakeApprovalTxHash && !pending.stakeTxHash)');
        expect(managerSource).toContain('stakeFlowVersion: getPendingChallengeStakeFlowVersion(pending)');
        expect(managerSource.match(/stakeFlowVersion: 2/g).length).toBeGreaterThanOrEqual(3);
        expect(managerSource.match(/erc20Contract\.approve\(ACTIVE_STAKING_ADDRESS, rawAmount\)/g)).toHaveLength(2);
        expect(managerSource).not.toContain('stakingContract.stakeForChallenge(rawAmount)');
        expect(managerSource).toContain('동시 진행 지원: mini/weekly/master 티어별 1개');

        expect(appCoreSource).not.toContain('hasAssetOpenPaidChallenge');
        expect(appCoreSource).not.toContain('blockedByPaidChallenge');
    });

    it('syncs and settles only the requested tier', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(runtimeSource).toContain('async function syncTieredChallengeProgress');
        expect(runtimeSource).toContain('await stakingContract.recordDay(userWalletAddress, tierIndex)');
        expect(runtimeSource).toContain('await stakingContract.settleChallenge(userWalletAddress, tierIndex)');
        expect(runtimeSource).toContain('if (preferredMode === "tiered")');
        expect(runtimeSource.match(/\{ tier, completedDays \}/g)).toHaveLength(2);
    });

    it('keeps completion bonus eligibility when principal was already returned by reconciliation', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(runtimeSource).toContain('challenge.stakePrincipalReturnedEarly === true');
        expect(runtimeSource).toContain('challenge.stakeBonusBasis');
        expect(runtimeSource).toContain('const bonusRewardHbt = successRate >= 1.0');
        expect(runtimeSource).toContain('let principalPaidHbt = principalRewardHbt;');
        expect(runtimeSource).toContain('rewardHbt = principalPaidHbt + bonusPaidHbt');
        expect(runtimeSource).toContain('principalRewardHbt: principalPaidHbt');
        expect(runtimeSource).toContain('bonusRewardHbt: bonusPaidHbt');
        expect(runtimeSource).toContain('targetBonusRewardHbt: bonusRewardHbt');
        expect(runtimeSource).toContain('hbtReceived: rewardHbt');
    });

    it('renders a newly started paid challenge from the callable response before Firestore refresh catches up', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const managerSource = readRepoFile('js/blockchain-manager.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(runtimeSource).toContain('activeChallenge: clientChallengeData');
        expect(runtimeSource).toContain('activeChallenges: {');
        expect(managerSource.match(/window\.applyOptimisticChallengeStart\?\.\(/g).length).toBeGreaterThanOrEqual(3);
        expect(appCoreSource).toContain('window.applyOptimisticChallengeStart = function(data = {})');
        expect(appCoreSource).toContain('persistCachedAssetUserData(user.uid, nextUserData);');
        expect(appCoreSource).toContain('renderAssetChallengePanel(getAssetActiveChallengesFromUserData(nextUserData), getKstDateString());');
    });

    it('falls back to the tier default bonus when paid challenge records carry a zero stored rate', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(runtimeSource).toContain('Number.isFinite(stored) && (stored > 0 || tier === "mini")');
        expect(appCoreSource).toContain("Number.isFinite(stored) && (stored > 0 || tier === 'mini')");
    });

    it('reconciles claimable challenge completion with daily logs before payout', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(runtimeSource).toContain('let challenge = normalizeChallengeCompletion(activeChallenges[tier]);');
        expect(runtimeSource).toContain('const dailyLogsByDate = await fetchChallengeDailyLogsByDate(uid, challenge);');
        expect(runtimeSource).toContain('challenge = reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier);');
        expect(runtimeSource).toContain('const successRate = completedDays / totalDays;');
    });
});
