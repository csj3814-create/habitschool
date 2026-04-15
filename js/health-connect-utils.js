export const HEALTH_CONNECT_SOURCE = 'health_connect';
export const DEFAULT_HEALTH_CONNECT_PROVIDER_LABEL = 'Health Connect';

export function createEmptyStepData() {
    return {
        count: 0,
        source: null,
        screenshotUrl: null,
        screenshotThumbUrl: null,
        imageHash: null,
        distance_km: null,
        calories: null,
        active_minutes: null,
        updatedAt: null,
        providerLabel: null,
        nativeSource: null,
        syncedAtEpochMillis: 0
    };
}

export function normalizeHealthConnectSyncEpoch(rawEpochMillis = 0, fallbackUpdatedAt = '') {
    const parsedEpochMillis = Number.parseInt(rawEpochMillis, 10);
    if (Number.isFinite(parsedEpochMillis) && parsedEpochMillis > 0) {
        return parsedEpochMillis;
    }

    const parsedUpdatedAt = Date.parse(String(fallbackUpdatedAt || '').trim());
    return Number.isFinite(parsedUpdatedAt) && parsedUpdatedAt > 0 ? parsedUpdatedAt : 0;
}

export function buildHealthConnectStepData({
    stepCount = 0,
    stepSource = HEALTH_CONNECT_SOURCE,
    stepProviderLabel = DEFAULT_HEALTH_CONNECT_PROVIDER_LABEL,
    nativeSource = '',
    syncedAtEpochMillis = 0
} = {}) {
    const normalizedStepCount = Math.max(0, Number.parseInt(stepCount, 10) || 0);
    const normalizedSyncEpoch = normalizeHealthConnectSyncEpoch(syncedAtEpochMillis);

    return {
        ...createEmptyStepData(),
        count: normalizedStepCount,
        source: String(stepSource || HEALTH_CONNECT_SOURCE).trim() || HEALTH_CONNECT_SOURCE,
        providerLabel: String(stepProviderLabel || '').trim() || DEFAULT_HEALTH_CONNECT_PROVIDER_LABEL,
        nativeSource: String(nativeSource || '').trim() || null,
        syncedAtEpochMillis: normalizedSyncEpoch,
        updatedAt: normalizedSyncEpoch > 0
            ? new Date(normalizedSyncEpoch).toISOString()
            : new Date().toISOString()
    };
}

export function buildPersistableStepData(stepData = {}, { now = new Date() } = {}) {
    const normalizedCount = Math.max(0, Number.parseInt(stepData?.count, 10) || 0);
    if (normalizedCount <= 0) return null;

    const normalizedSource = String(stepData?.source || 'manual').trim() || 'manual';
    const normalizedSyncEpoch = normalizeHealthConnectSyncEpoch(
        stepData?.syncedAtEpochMillis,
        stepData?.updatedAt
    );
    const updatedAt = normalizedSyncEpoch > 0
        ? new Date(normalizedSyncEpoch).toISOString()
        : (String(stepData?.updatedAt || '').trim() || now.toISOString());

    const payload = {
        count: normalizedCount,
        source: normalizedSource,
        screenshotUrl: stepData?.screenshotUrl || null,
        screenshotThumbUrl: stepData?.screenshotThumbUrl || null,
        imageHash: stepData?.imageHash || null,
        distance_km: stepData?.distance_km || null,
        calories: stepData?.calories || null,
        active_minutes: stepData?.active_minutes || null,
        updatedAt
    };

    if (normalizedSource === HEALTH_CONNECT_SOURCE) {
        payload.providerLabel = String(stepData?.providerLabel || '').trim() || DEFAULT_HEALTH_CONNECT_PROVIDER_LABEL;
        payload.nativeSource = String(stepData?.nativeSource || '').trim() || null;
        payload.syncedAtEpochMillis = normalizedSyncEpoch;
    }

    return payload;
}

export function restoreHealthConnectImportState(stepData = {}) {
    if (String(stepData?.source || '').trim() !== HEALTH_CONNECT_SOURCE) {
        return null;
    }

    return {
        stepCount: Math.max(0, Number.parseInt(stepData?.count, 10) || 0),
        stepSource: HEALTH_CONNECT_SOURCE,
        stepProviderLabel: String(stepData?.providerLabel || '').trim() || DEFAULT_HEALTH_CONNECT_PROVIDER_LABEL,
        nativeSource: String(stepData?.nativeSource || '').trim(),
        syncedAtEpochMillis: normalizeHealthConnectSyncEpoch(
            stepData?.syncedAtEpochMillis,
            stepData?.updatedAt
        )
    };
}
