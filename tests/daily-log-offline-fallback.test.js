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
});
