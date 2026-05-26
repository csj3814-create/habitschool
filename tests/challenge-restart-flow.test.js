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

        expect(managerSource).toContain('if (window.updateAssetDisplay) await window.updateAssetDisplay(true);');
        expect(managerSource).toContain('const isTodayInChallengeRange = getChallengeDateRange(challenge).includes(today);');
        expect(managerSource).toContain('if (isTodayInChallengeRange && !isPastEnd && !completedDates.includes(today))');
        expect(managerSource).toContain('challengeStartInFlight.add(startLockKey);');
        expect(appCoreSource).toContain('? getDocFromServer(userRef).catch((serverError) => {');
        expect(appCoreSource).toContain("noteFirestoreConnectivityFailure(serverError, 'asset-display user-doc-server')");
    });
});
