import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('challenge failure settlement guardrails', () => {
    it('rechecks daily logs before allowing failed challenge settlement', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const challengeUtilsSource = readRepoFile('functions/challenge-utils.js');
        const managerSource = readRepoFile('js/blockchain-manager.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(runtimeSource).toContain('async function fetchChallengeDailyLogsByDate(uid, challenge = {})');
        expect(runtimeSource).toContain('reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier)');
        expect(runtimeSource).toContain('exports.refreshChallengeProgress = onCall(');
        expect(runtimeSource).toContain('const projections = await buildAuthoritativeChallengeProgress(uid, sanitizedUserData);');
        expect(runtimeSource).toContain('skippedFailure: true');
        expect(runtimeSource).toContain('claimable: true');
        // 정산 계산은 challenge-utils.js로 추출해 runtime에서 서버 권한으로 재사용한다.
        expect(runtimeSource).toContain('require("./challenge-utils")');
        expect(challengeUtilsSource).toContain('function canSettleChallengeAsClaimable');
        expect(runtimeSource).toContain('마지막 날은 임무를 완료해야 바로 수령할 수 있고, 부분 달성 정산은 다음날부터 가능합니다.');
        expect(runtimeSource).toContain('if (!forceForfeit && (canClaimInsteadOfFailing ||');
        expect(runtimeSource).toContain('const dailyLogsByDate = await fetchChallengeDailyLogsByDate(uid, challenge);');

        expect(managerSource).toContain("const refreshProgressFn = httpsCallable(functions, 'refreshChallengeProgress');");
        expect(managerSource).toContain('const refreshResult = await refreshProgressFn({});');
        expect(managerSource).toContain("const settleFn = httpsCallable(functions, 'settleChallengeFailure');");
        expect(managerSource).toContain('await settleFn({ tier });');
        expect(managerSource).toContain('await forfeitFn({ tier, forceForfeit: true });');
        expect(managerSource).not.toContain("doc(db, 'daily_logs'");
        expect(managerSource).not.toContain('fetchChallengeDailyLogsByDateInTransaction');
        expect(managerSource).toContain('async function ensureChallengeSigningWalletReady');

        expect(appCoreSource).toContain('function renderAssetChallengePanel(activeChallenges = {}, todayStr = getKstDateString())');
        expect(appCoreSource).toContain('renderAssetChallengePanel(activeChallenges, _todayStr);');
        expect(appCoreSource).toContain('function shouldHideAssetHbtHistoryTransaction(tx = {})');
        expect(appCoreSource).toContain('if (shouldHideAssetHbtHistoryTransaction(tx)) return;');
    });
});
