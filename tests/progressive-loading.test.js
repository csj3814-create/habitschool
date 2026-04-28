import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

describe('progressive loading isolation', () => {
    it('bounds friendship loading and keeps stale in-flight cleanup scoped', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('const FRIENDSHIP_USER_CACHE_TIMEOUT_MS = 1500;');
        expect(appSource).toContain('const FRIENDSHIP_LIVE_QUERY_TIMEOUT_MS = 2500;');
        expect(appSource).toContain('const FRIENDSHIP_CACHE_TTL_MS = 30_000;');
        expect(appSource).toContain('const FRIENDSHIP_RETRY_DELAY_MS = 3000;');
        expect(appSource).toContain('friendship_user_cache_timeout');
        expect(appSource).toContain('friendship_live_query_timeout');
        expect(appSource).toContain('function scheduleFriendshipRetry');
        expect(appSource).toContain("scheduleFriendshipRetry(user.uid, 'live-query');");
        expect(appSource).toContain('const friendshipLoadPromise = (async () => {');
        expect(appSource).toContain('if (_friendshipsLoadingPromise === friendshipLoadPromise)');
        expect(appSource).toContain("console.warn('[friendships] timeout, using current cache');");
        expect(appSource).not.toContain("console.warn('[friendships] timeout, using current cache');\r\n            _friendshipsLoadingPromise = null;");
        expect(appSource).not.toContain("console.warn('[friendships] timeout, using current cache');\n            _friendshipsLoadingPromise = null;");
    });

    it('loads hidden gallery and asset tabs only when they are visible after login', () => {
        const authSource = readRepoFile('js/auth.js');
        const appSource = readAppSource();

        expect(authSource).toContain('function scheduleVisibleTabBackgroundRefresh');
        expect(authSource).toContain("if (getVisibleAuthTabName() === 'gallery')");
        expect(authSource).toContain("if (getVisibleAuthTabName() === 'assets')");
        expect(authSource).not.toContain('if (window.loadGalleryData) window.loadGalleryData();');
        expect(appSource).toMatch(/if \(getVisibleTabName\(\) === 'assets'\) {\r?\n\s+return window\.updateAssetDisplay\(true\);/);
    });

    it('bounds optional asset and reward-market enrichment work', () => {
        const appSource = readAppSource();
        const authSource = readRepoFile('js/auth.js');
        const rewardMarketSource = readRepoFile('js/reward-market.js');

        expect(appSource).toContain('const ASSET_QUERY_TIMEOUT_MS = 3500;');
        expect(appSource).toContain('const ASSET_HISTORY_TIMEOUT_MS = 4500;');
        expect(appSource).toContain('const ASSET_USER_DOC_TIMEOUT_MS = 5000;');
        expect(appSource).toContain('const ASSET_ONCHAIN_TIMEOUT_MS = 6000;');
        expect(appSource).toContain('const ASSET_CHALLENGE_LOG_TIMEOUT_MS = 1800;');
        expect(appSource).toContain('const ASSET_MAX_RETRY_ATTEMPTS = 5;');
        expect(appSource).toContain('const ASSET_OPTIONAL_QUERY_LOG_TTL_MS = 30_000;');
        expect(appSource).toContain('const DASHBOARD_LOAD_TIMEOUT_MS = 6000;');
        expect(appSource).toContain('function withAssetQueryTimeout');
        expect(appSource).toContain('function logAssetOptionalQueryFailure');
        expect(appSource).toContain('function refreshAssetTokenStats(uid = \'\')');
        expect(appSource).toContain('refreshAssetTokenStats(user.uid).catch(() => {});');
        expect(appSource).toContain('function applyCachedPointBalanceFromStorage');
        expect(appSource).toContain('function getAssetWalletSnapshotFromSources');
        expect(appSource).toContain('applyAssetWalletSnapshot(cachedWalletSnapshot);');
        expect(appSource).toContain('window.__assetCachedWalletAddress = effectiveAddress;');
        expect(appSource).toContain('function applyCachedAssetMiniChart');
        expect(appSource).toContain('const hadCachedMiniChart = applyCachedAssetMiniChart(user.uid);');
        expect(appSource).toContain('writeAssetMiniChartCache(user.uid, data, _startDateStr);');
        expect(authSource).toContain('applyCachedSignedInPointBalance(user.uid);');
        expect(appSource).toContain('const userDocPromise = getDoc(userRef).catch((error) => {');
        expect(appSource).toContain('_assetTimeout(ASSET_USER_DOC_TIMEOUT_MS)');
        expect(appSource).toContain('userDocPromise.then(lateSnap => {');
        expect(appSource).toContain('function refreshAssetOnchainBalance(uid)');
        expect(appSource).toContain('refreshAssetOnchainBalance(user.uid).catch(() => {});');
        expect(appSource).toContain("const pointsValue = (hasFreshAssetCache ? getFiniteAssetNumber(cached.coins) : null)");
        expect(appSource).toContain("pointBadge.textContent = String(pointsValue);");
        expect(appSource).toContain("const coinsValue = getFiniteAssetNumber(userData.coins)");
        expect(appSource).toContain("pointBadge.textContent = String(coinsValue);");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'today-points-timeout');");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'today-hbt-timeout');");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'challenge-range-logs-timeout');");
        expect(appSource).toContain('reconcileActiveChallengesWithDailyLogs(activeChallenges, dailyLogsByDate)');
        expect(appSource).toContain('readCachedChallengeDailyLogsByDate');
        expect(appSource).toContain("'challenge-range-cache-projection'");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'mini-chart-timeout');");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'daily-limit-timeout');");
        expect(appSource).toContain("scheduleAssetRetry(user.uid, 'asset-history-timeout');");
        expect(appSource).toContain('const hasHistorySnapshotGap = !txSnap || !pointSnap || !reactionAwardSnap || !notificationSnap;');
        expect(appSource).toContain('_assetHistoryState.isLoading = false;');
        expect(appSource).not.toContain('coins: userData.coins || 0');
        expect(appSource).toContain('optional ${label} timed out; keeping cached/fallback UI');
        expect(appSource).toContain('dashboard_firestore_timeout');
        expect(appSource).toContain('asset_onchain_balance_timeout');
        expect(appSource).toContain('asset_token_stats_timeout');
        expect(rewardMarketSource).toContain('const REWARD_MARKET_SNAPSHOT_TIMEOUT_MS = 7000;');
        expect(rewardMarketSource).toContain('function withRewardMarketTimeout');
        expect(rewardMarketSource).toContain('reward_market_snapshot_timeout');
    });
});
