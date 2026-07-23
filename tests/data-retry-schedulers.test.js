import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

function sliceSource(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

function createAssetRetryHarness() {
    const source = readAppSource();
    const functionsSource = sliceSource(
        source,
        'function clearAssetRetry(uid)',
        '// 자산 표시 업데이트 함수'
    );
    const auth = { currentUser: { uid: 'user-1' } };
    const updateAssetDisplay = vi.fn(() => Promise.resolve());
    const window = { updateAssetDisplay };
    const harness = Function('auth', 'window', `
        const ASSET_RETRY_DELAY_MS = 2000;
        const ASSET_MAX_RETRY_ATTEMPTS = 3;
        let _assetRetryTimer = null;
        const _assetRetryCounts = new Map();
        let _assetRetrySignalSequence = 0;
        const _assetOptionalQueryLogAt = new Map();
        const ASSET_OPTIONAL_QUERY_LOG_TTL_MS = 30_000;
        const APP_ENV = 'prod';
        ${functionsSource}
        return {
            schedule: scheduleAssetRetry,
            count: () => _assetRetryCounts.get('user-1') || 0,
            hasTimer: () => Boolean(_assetRetryTimer)
        };
    `)(auth, window);
    return { harness, executeSpy: updateAssetDisplay };
}

function createGalleryRetryHarness() {
    const source = readAppSource();
    const functionsSource = sliceSource(
        source,
        "function clearGalleryRetry(uid = auth.currentUser?.uid || 'guest')",
        'async function loadGalleryData(forceReload = false)'
    );
    const auth = { currentUser: { uid: 'user-1' } };
    const loadGalleryData = vi.fn(() => Promise.resolve());
    const harness = Function('auth', 'loadGalleryData', `
        const GALLERY_RETRY_DELAY_MS = 2000;
        const GALLERY_MAX_RETRY_ATTEMPTS = 3;
        let _galleryRetryTimer = null;
        const _galleryRetryCounts = new Map();
        ${functionsSource}
        return {
            schedule: scheduleGalleryRetry,
            count: () => _galleryRetryCounts.get('user-1') || 0,
            hasTimer: () => Boolean(_galleryRetryTimer)
        };
    `)(auth, loadGalleryData);
    return { harness, executeSpy: loadGalleryData };
}

function createRewardMarketRetryHarness() {
    const source = readRepoFile('js/reward-market.js');
    const functionsSource = sliceSource(
        source,
        "function clearRewardMarketRetry(uid = '')",
        'async function withRewardMarketTimeout'
    );
    const auth = { currentUser: { uid: 'user-1' } };
    const loadRewardMarketSnapshot = vi.fn(() => Promise.resolve());
    const harness = Function('auth', 'loadRewardMarketSnapshot', `
        const REWARD_MARKET_RETRY_DELAY_MS = 2000;
        const REWARD_MARKET_MAX_RETRY_ATTEMPTS = 3;
        let rewardMarketRetryTimer = null;
        let rewardMarketRetryUid = '';
        let rewardMarketRetryAttempts = 0;
        ${functionsSource}
        return {
            schedule: scheduleRewardMarketRetry,
            count: () => rewardMarketRetryAttempts,
            hasTimer: () => Boolean(rewardMarketRetryTimer)
        };
    `)(auth, loadRewardMarketSnapshot);
    return { harness, executeSpy: loadRewardMarketSnapshot };
}

async function verifyFixedRetryScheduler(harness, executeSpy) {
    expect(harness.schedule('user-1', 'first-gap')).toBe(true);
    expect(harness.schedule('user-1', 'second-gap')).toBe(true);
    expect(harness.count()).toBe(0);
    expect(harness.hasTimer()).toBe(true);

    await vi.advanceTimersByTimeAsync(2000);
    expect(executeSpy).toHaveBeenCalledTimes(1);
    expect(harness.count()).toBe(1);

    for (let attempt = 2; attempt <= 3; attempt += 1) {
        expect(harness.schedule('user-1', `gap-${attempt}`)).toBe(true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(executeSpy).toHaveBeenCalledTimes(attempt);
        expect(harness.count()).toBe(attempt);
    }

    expect(harness.schedule('user-1', 'over-limit')).toBe(false);
    await vi.advanceTimersByTimeAsync(4000);
    expect(executeSpy).toHaveBeenCalledTimes(3);
}

describe('bounded incomplete-data retry schedulers', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('coalesces asset gaps and counts only three actual 2-second reloads', async () => {
        vi.useFakeTimers();
        const { harness, executeSpy } = createAssetRetryHarness();
        await verifyFixedRetryScheduler(harness, executeSpy);
    });

    it('coalesces gallery gaps and counts only three actual 2-second reloads', async () => {
        vi.useFakeTimers();
        const { harness, executeSpy } = createGalleryRetryHarness();
        await verifyFixedRetryScheduler(harness, executeSpy);
    });

    it('coalesces reward-market gaps and stops after three actual retries', async () => {
        vi.useFakeTimers();
        const { harness, executeSpy } = createRewardMarketRetryHarness();
        await verifyFixedRetryScheduler(harness, executeSpy);
    });
});
