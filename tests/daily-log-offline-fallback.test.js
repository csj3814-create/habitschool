import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

describe('daily log offline fallback', () => {
    it('keeps cached media visible when Firestore daily log reads are delayed', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const DAILY_LOG_LS_PREFIX = 'hs_daily_log_';");
        expect(appSource).toContain('const DAILY_LOG_SDK_TIMEOUT_MS = 3000;');
        expect(appSource).toContain('function createDeferredDailyLogSnap');
        expect(appSource).toContain('function scheduleDailyLogRetry');
        expect(appSource).toContain('async function _fetchDailyLogViaRest(docId)');
        expect(appSource).toContain("noteFirestoreConnectivityFailure(error, 'loadDataForSelectedDate')");
        expect(appSource).toContain("if (myLogDoc.__deferred)");
        expect(appSource).toContain("console.info('[daily-log] keeping current UI while Firestore reconnects');");
        expect(appSource).toContain('let effectiveLogDoc = myLogDoc;');
        expect(appSource).toContain('if (effectiveLogDoc.exists() || pendingOutboxEntry)');
        expect(appSource).not.toContain('getDoc(doc(db, "daily_logs", docId)).catch(() => _empty)');
    });

    it('does not mark a daily log save as acknowledged when the Firestore write times out', () => {
        const appSource = readAppSource();

        expect(appSource).toContain('daily_log_primary_save_timeout');
        expect(appSource).toContain('const DAILY_LOG_PRIMARY_SAVE_TIMEOUT_MS = 12000;');
        expect(appSource).toContain('const doSetDoc = () => withRejectingTimeout');
        expect(appSource).toContain('DAILY_LOG_PRIMARY_SAVE_TIMEOUT_MS');
        expect(appSource).toContain('setDoc(doc(db, "daily_logs", docId), saveData, { merge: true })');
        expect(appSource).toContain('if (isOfflineSaveCandidateError(e))');
        expect(appSource).toContain('if (latestSaveData && docId && isOfflineSaveCandidateError(e))');
        expect(appSource).toContain('queueOfflineOutboxEntry({');
        expect(appSource).toContain('mediaItems: offlineOutboxMediaItems');
        expect(appSource).not.toContain('const doSetDoc = () => withTimeout(');
    });
});
