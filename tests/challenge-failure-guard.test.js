import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('challenge failure settlement guardrails', () => {
    it('rechecks daily logs before allowing failed challenge settlement', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');
        const managerSource = readRepoFile('js/blockchain-manager.js');

        expect(runtimeSource).toContain('async function fetchChallengeDailyLogsByDate(uid, challenge = {})');
        expect(runtimeSource).toContain('reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier)');
        expect(runtimeSource).toContain('skippedFailure: true');
        expect(runtimeSource).toContain('claimable: true');

        expect(managerSource).toContain('const dailyLogsByDate = await fetchChallengeDailyLogsByDate(currentUser.uid, storedChallenge);');
        expect(managerSource).toContain('reconcileChallengeCompletionWithDailyLogs(storedChallenge, dailyLogsByDate, tier)');
        expect(managerSource).toContain('settleResult.data?.skippedFailure || settleResult.data?.claimable');
    });
});
