import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

describe('same-day challenge restart flow', () => {
    it('records challenge settlement by tier and defers same-day restarts to tomorrow', () => {
        const runtimeSource = readRepoFile('functions/runtime.js');

        expect(runtimeSource).toContain('updateData[`lastChallengeSettlementByTier.${tier}`]');
        // 내일 시작은 '오늘이 직전 챌린지에 실제 카운트된 경우'만. 다음날 정산이면 오늘부터 시작.
        expect(runtimeSource).toContain("const settledTodaySameTier = String(lastTierSettlement?.date || '') === todayStr;");
        expect(runtimeSource).toContain("const lastCountedDate = String(lastTierSettlement?.lastCountedDate || '');");
        expect(runtimeSource).toContain('const sameTierSettledToday = settledTodaySameTier');
        expect(runtimeSource).toContain('lastCountedDate ? lastCountedDate >= todayStr : true');
        expect(runtimeSource).toContain('lastCountedDate: (Array.isArray(challenge.completedDates)');
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
        // 보상 수령은 Cloud Function 호출뿐이라 challenge-claim.js 로 옮겼다.
        // (블록체인 모듈을 안 싣는 라이트 모드에서도 눌리게 하려면 그래야 했다.)
        // 갱신은 그대로 강제한다 — 위치만 옮겼을 뿐이다.
        const claimSource = readRepoFile('js/challenge-claim.js');
        expect(managerSource).toContain("export { claimChallengeReward } from './challenge-claim.js?v=331';");
        // 갱신은 refreshAfterClaim 으로 모았다 — 성공했을 때와 클라이언트가 기다리다
        // 지쳤을 때(deadline-exceeded) 둘 다 같은 확인을 거쳐야 하기 때문이다.
        expect(claimSource).toContain('window.updateAssetDisplay(true)');
        expect(claimSource).toContain('await refreshAfterClaim();');
        expect(claimSource).toContain('window.applyOptimisticChallengeSettlement?.(data);');
        expect(claimSource).toContain('if (window.loadDashboard) window.loadDashboard();');
        expect(managerSource).toContain('export async function updateChallengeProgress(options = {})');
        expect(managerSource).toContain("const refreshProgressFn = httpsCallable(functions, 'refreshChallengeProgress');");
        expect(managerSource).toContain('const result = await refreshProgressFn({});');
        expect(managerSource).toContain("await refreshAssetDisplayAfterChallengeMutation('challenge-progress');");
        expect(managerSource).not.toContain("doc(db, 'daily_logs'");
        expect(managerSource).not.toContain('fetchChallengeDailyLogsByDateInTransaction');
        expect(managerSource).toContain('challengeStartInFlight.add(startLockKey);');
        expect(appCoreSource).toContain('updateChallengeProgress({ dateStr }).catch(error => {');
        expect(appCoreSource).toContain('dateStr: selectedDateStr');
        expect(appCoreSource).toContain('dailyLogData: challengeDailyLogData');
        expect(appCoreSource).toContain('class="challenge-ring-progress"');
        expect(appCoreSource).toContain('function renderAssetChallengePendingState');
        expect(appCoreSource).toContain('function renderAssetChallengeFromCachedUserData');
        expect(appCoreSource).toContain('function collectChallengeSettlementRecords');
        expect(appCoreSource).toContain('function applyChallengeSettlementRecordsToUserData');
        expect(appCoreSource).toContain('const settleTxSnap = await _p_settleTx;');
        expect(appCoreSource).toContain("renderAssetChallengeFromCachedUserData(\n                user.uid,\n                _todayStr,");
        expect(appCoreSource).toContain("renderAssetChallengePendingState(userDocDeferred ? 'user-doc-deferred' : 'user-doc-missing');");
        expect(appCoreSource).toContain('? getDocFromServer(userRef).catch((serverError) => {');
        expect(appCoreSource).toContain("noteFirestoreConnectivityFailure(serverError, 'asset-display user-doc-server')");
    });

    it('recomputes challenge progress from the latest committed media save after background uploads settle', () => {
        const appCoreSource = readRepoFile('js/app-core.js');

        expect(appCoreSource).toContain('const runPostSaveFollowUps = async ({ forceGalleryRefresh = false, dailyLogData = saveData } = {}) => {');
        expect(appCoreSource).toContain('const challengeDailyLogData = dailyLogData && typeof dailyLogData === \'object\'');
        expect(appCoreSource).toContain('onSettled: ({ failed, latestCommittedData } = {}) => {');
        expect(appCoreSource).toContain('dailyLogData: latestCommittedData || getCachedDailyLog(docId) || saveData');
        expect(appCoreSource).toContain('dailyLogData: challengeDailyLogData');
    });
});
