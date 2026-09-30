import { describe, expect, it } from 'vitest';
import { decodeFirestoreFields, runFirestoreQueryViaRest } from '../js/firestore-rest.js';

describe('firestore rest read', () => {
    it('turns REST values into the plain values the SDK gives', () => {
        expect(decodeFirestoreFields({
            date: { stringValue: '2026-09-30' },
            steps: { integerValue: '6560' },
            hours: { doubleValue: 6.9 },
            done: { booleanValue: true },
            none: { nullValue: null },
            awardedPoints: { mapValue: { fields: { diet: { booleanValue: true }, dietPoints: { integerValue: '30' } } } },
            cardioList: { arrayValue: { values: [{ mapValue: { fields: { url: { stringValue: 'a' } } } }] } },
            empty: { arrayValue: {} },
        })).toEqual({
            date: '2026-09-30', steps: 6560, hours: 6.9, done: true, none: null,
            awardedPoints: { diet: true, dietPoints: 30 },
            cardioList: [{ url: 'a' }], empty: [],
        });
    });

    it('sends the signed-in token and keeps only documents', async () => {
        let seen;
        const fetchImpl = async (url, init) => {
            seen = { url, init };
            return { ok: true, json: async () => [{ readTime: 'x' }, { document: { fields: { date: { stringValue: 'd' } } } }] };
        };
        const rows = await runFirestoreQueryViaRest({ projectId: 'p1', idToken: 't', structuredQuery: { limit: 1 }, fetchImpl });
        expect(rows).toEqual([{ date: 'd' }]);
        expect(seen.url).toBe('https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents:runQuery');
        expect(seen.init.headers.Authorization).toBe('Bearer t');
    });

    it('reports a denied read as permission-denied, not as a bad connection', async () => {
        const fetchImpl = async () => ({ ok: false, status: 403 });
        await expect(runFirestoreQueryViaRest({ projectId: 'p1', idToken: 't', structuredQuery: {}, fetchImpl }))
            .rejects.toMatchObject({ code: 'permission-denied' });
    });
});
