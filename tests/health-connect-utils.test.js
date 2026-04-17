import { describe, expect, it } from 'vitest';

import {
    buildHealthConnectStepData,
    buildPersistableStepData,
    choosePreferredHealthConnectImport,
    createEmptyStepData,
    restoreHealthConnectImportState
} from '../js/health-connect-utils.js';

describe('health connect step helpers', () => {
    it('builds imported step state with provider and native metadata', () => {
        const result = buildHealthConnectStepData({
            stepCount: 8421,
            stepProviderLabel: 'Samsung Health',
            nativeSource: 'android-launch-sync',
            syncedAtEpochMillis: 1760000000000
        });

        expect(result.count).toBe(8421);
        expect(result.source).toBe('health_connect');
        expect(result.providerLabel).toBe('Samsung Health');
        expect(result.nativeSource).toBe('android-launch-sync');
        expect(result.syncedAtEpochMillis).toBe(1760000000000);
        expect(result.updatedAt).toBe(new Date(1760000000000).toISOString());
    });

    it('persists health connect metadata but keeps non-health-connect payloads lean', () => {
        const healthConnectPayload = buildPersistableStepData({
            ...createEmptyStepData(),
            count: 5000,
            source: 'health_connect',
            providerLabel: 'Health Connect',
            nativeSource: 'android-widget',
            syncedAtEpochMillis: 1760100000000
        });
        const manualPayload = buildPersistableStepData({
            ...createEmptyStepData(),
            count: 3200,
            source: 'manual'
        }, {
            now: new Date('2026-04-16T00:00:00.000Z')
        });

        expect(healthConnectPayload.providerLabel).toBe('Health Connect');
        expect(healthConnectPayload.nativeSource).toBe('android-widget');
        expect(healthConnectPayload.syncedAtEpochMillis).toBe(1760100000000);
        expect(manualPayload.providerLabel).toBeUndefined();
        expect(manualPayload.nativeSource).toBeUndefined();
        expect(manualPayload.syncedAtEpochMillis).toBeUndefined();
        expect(manualPayload.updatedAt).toBe('2026-04-16T00:00:00.000Z');
    });

    it('restores saved health connect state and falls back to updatedAt when sync epoch is absent', () => {
        const restored = restoreHealthConnectImportState({
            count: 6789,
            source: 'health_connect',
            updatedAt: '2026-04-16T01:23:45.000Z'
        });

        expect(restored).toEqual({
            stepCount: 6789,
            stepSource: 'health_connect',
            stepProviderLabel: 'Health Connect',
            nativeSource: '',
            syncedAtEpochMillis: Date.parse('2026-04-16T01:23:45.000Z')
        });
        expect(restoreHealthConnectImportState({ count: 1, source: 'manual' })).toBeNull();
    });

    it('prefers the current-session native import over stale saved steps for today', () => {
        const preferred = choosePreferredHealthConnectImport({
            activeImport: {
                stepCount: 8765,
                stepProviderLabel: 'Samsung Health',
                nativeSource: 'android-web-sync',
                syncedAtEpochMillis: 1760400000000
            },
            savedStepData: {
                count: 6244,
                source: 'health_connect',
                providerLabel: 'Samsung Health',
                nativeSource: 'android-launch-sync',
                syncedAtEpochMillis: 1760390000000
            },
            selectedDateStr: '2026-04-17',
            todayStr: '2026-04-17'
        });

        expect(preferred).toEqual({
            stepCount: 8765,
            stepSource: 'health_connect',
            stepProviderLabel: 'Samsung Health',
            nativeSource: 'android-web-sync',
            syncedAtEpochMillis: 1760400000000
        });
    });

    it('ignores in-memory native imports when the selected date is not today', () => {
        expect(choosePreferredHealthConnectImport({
            pendingImport: {
                stepCount: 8765,
                stepProviderLabel: 'Samsung Health',
                nativeSource: 'android-web-sync',
                syncedAtEpochMillis: 1760400000000
            },
            selectedDateStr: '2026-04-16',
            todayStr: '2026-04-17'
        })).toBeNull();
    });
});
