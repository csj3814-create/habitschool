import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('challenge failure settlement guardrails', () => {
    it('rechecks daily logs before allowing failed challenge settlement', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const managerSource = readRepoFile('js/blockchain-manager.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(runtimeSource).toContain('async function fetchChallengeDailyLogsByDate(uid, challenge = {})');
        expect(runtimeSource).toContain('reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier)');
        expect(runtimeSource).toContain('skippedFailure: true');
        expect(runtimeSource).toContain('claimable: true');
        expect(runtimeSource).toContain('function canSettleChallengeAsClaimable');
        expect(runtimeSource).toContain('마지막 날은 임무를 완료해야 바로 수령할 수 있고, 부분 달성 정산은 다음날부터 가능합니다.');

        expect(managerSource).toContain('const dailyLogsByDate = await fetchChallengeDailyLogsByDate(currentUser.uid, storedChallenge);');
        expect(managerSource).toContain('reconcileChallengeCompletionWithDailyLogs(storedChallenge, dailyLogsByDate, tier)');
        expect(managerSource).toContain('async function fetchChallengeDailyLogsByDateInTransaction');
        expect(managerSource).toContain('const dailyLogsByDate = await fetchChallengeDailyLogsByDateInTransaction(transaction, currentUser.uid, challenge);');
        expect(managerSource).toContain('const rangeReconciledChallenge = reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier);');
        expect(managerSource).toContain('settleResult.data?.skippedFailure || settleResult.data?.claimable');
        expect(managerSource).toContain('if (isFinalDay && !isFullCompletion)');
        expect(managerSource).toContain("showToast('⏳ 앱 지갑을 준비 중이에요. 잠시만 기다려 주세요.');");
        expect(managerSource).toContain("showToast('❌ 앱 지갑을 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');");
        expect(managerSource).toContain('async function ensureChallengeSigningWalletReady');

        expect(appCoreSource).toContain('function renderAssetChallengePanel(activeChallenges = {}, todayStr = getKstDateString())');
        expect(appCoreSource).toContain('renderAssetChallengePanel(activeChallenges, _todayStr);');
        expect(appCoreSource).toContain('function shouldHideAssetHbtHistoryTransaction(tx = {})');
        expect(appCoreSource).toContain('if (shouldHideAssetHbtHistoryTransaction(tx)) return;');
    });
});
