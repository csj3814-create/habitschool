import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('same-day challenge restart flow', () => {
    it('records challenge settlement by tier and defers same-day restarts to tomorrow', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(runtimeSource).toContain('updateData[`lastChallengeSettlementByTier.${tier}`]');
        expect(runtimeSource).toContain('const sameTierSettledToday = String(lastTierSettlement?.date || \'\') === todayStr;');
        expect(runtimeSource).toContain('const startDate = sameTierSettledToday');
        expect(runtimeSource).toContain('? addDaysToKstDateString(todayStr, 1)');
        expect(runtimeSource).toContain('if (!sameTierSettledToday && startDate === todayStr)');
        expect(runtimeSource).toContain('deferredStart: sameTierSettledToday');
    });

    it('forces authoritative asset refreshes after claim/start mutations', () => {
        const managerSource = readRepoFile('js/blockchain-manager.js');
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(managerSource).toContain('async function refreshAssetDisplayAfterChallengeMutation');
        expect(managerSource).toContain("await refreshAssetDisplayAfterChallengeMutation('challenge-start-recovery');");
        expect(managerSource).toContain("await refreshAssetDisplayAfterChallengeMutation('challenge-start');");
        expect(managerSource).toContain("await refreshAssetDisplayAfterChallengeMutation('challenge-claim');");
        expect(managerSource).toContain('export async function updateChallengeProgress(options = {})');
        expect(managerSource).toContain('const targetDate = normalizeChallengeProgressDate(progressOptions.dateStr) || today;');
        expect(managerSource).toContain('dailyLogsByDate[targetDate] = dailyLogData;');
        expect(managerSource).toContain('const isTargetDateInChallengeRange = getChallengeDateRange(challenge).includes(targetDate);');
        expect(managerSource).toContain('challengeStartInFlight.add(startLockKey);');
        expect(appCoreSource).toContain('updateChallengeProgress({ dateStr }).catch(error => {');
        expect(appCoreSource).toContain('dateStr: selectedDateStr');
        expect(appCoreSource).toContain('dailyLogData: saveData');
        expect(appCoreSource).toContain('class="challenge-ring-progress"');
        expect(appCoreSource).toContain('function renderAssetChallengePendingState');
        expect(appCoreSource).toContain("renderAssetChallengePendingState(userDocDeferred ? 'user-doc-deferred' : 'user-doc-missing');");
        expect(appCoreSource).toContain('? getDocFromServer(userRef).catch((serverError) => {');
        expect(appCoreSource).toContain("noteFirestoreConnectivityFailure(serverError, 'asset-display user-doc-server')");
    });
});
