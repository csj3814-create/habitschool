import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { getFirestoreDocViaRest } from '../js/firestore-rest.js';

// 2026-09-30 제보: "프로필 탭에 대사점수 안 뜨는데?" — 휴대폰의 읽기가 멈춰 있던 때였다.
// 점수 읽기에 기다리는 시간이 없어 칸이 숨은 채로 남았다.

const APP = readRepoFile('js/app-core.js');

describe('health scores survive a stalled read', () => {
    it('gives the SDK 4 seconds, then reads the same three records over a plain request', () => {
        const read = APP.split('async function readScoreInputs(user) {')[1].split('\n}\n')[0];
        expect(read).toContain('withAsyncTimeout(readScoreInputsViaSdk(user.uid), SCORE_READ_TIMEOUT_MS, SCORE_READ_TIMEOUT_MESSAGE)');
        expect(read).toContain('return readScoreInputsViaRest(user);');
        expect(APP).toContain('const SCORE_READ_TIMEOUT_MS = 4000;');
        const rest = APP.split('async function readScoreInputsViaRest(user) {')[1].split('\n}\n')[0];
        expect(rest).toContain('path: `users/${user.uid}`');
        expect(rest).toContain("collectionId: 'daily_logs'");
        expect(rest).toContain("collectionId: 'bloodTests'");
    });

    it('says the scores could not load instead of leaving the space empty', () => {
        const fn = APP.split('async function updateMetabolicScoreUI() {')[1].split('\n};\n')[0];
        expect(fn).toContain('await readScoreInputs(user);');
        expect(fn).toContain('renderScoreLoadFailure(le8Container);');
        expect(APP).toContain('건강 점수를 불러오지 못했어요.');
    });

    it('reads one document over REST and treats a missing one as empty', async () => {
        let seen;
        const ok = await getFirestoreDocViaRest({
            projectId: 'p1', idToken: 't', path: 'users/u1',
            fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ fields: { healthProfile: { mapValue: { fields: { height: { integerValue: '184' } } } } } }) }; }
        });
        expect(ok).toEqual({ healthProfile: { height: 184 } });
        expect(seen.url).toBe('https://firestore.googleapis.com/v1/projects/p1/databases/(default)/documents/users/u1');
        expect(seen.init.headers.Authorization).toBe('Bearer t');
        const missing = await getFirestoreDocViaRest({ projectId: 'p1', idToken: 't', path: 'users/none', fetchImpl: async () => ({ ok: false, status: 404 }) });
        expect(missing).toBeNull();
    });
});
