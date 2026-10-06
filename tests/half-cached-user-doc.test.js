import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(resolve(ROOT_DIR, 'js/app-core.js'), 'utf8');
const AUTH = readFileSync(resolve(ROOT_DIR, 'js/auth.js'), 'utf8');

// 2026-10-05 제보 "식단 조언 대신 '가이드와 알림이 바뀌어요'" · 10-06 "닉네임이 자주 풀려".
// 휴대폰에 남은 회원 문서는 merge 로 적힌 몇 칸뿐인 반쪽이었다. 서버에는 둘 다 그대로 있었다.
describe('the member record on screen comes from the server, not a half copy on the phone', () => {
    it('reads the record at sign-in with a plain request when the SDK cannot', () => {
        expect(AUTH).toContain("import { getFirestoreDocViaRest } from './firestore-rest.js?v=");
        const resolver = AUTH.split('async function resolveLatestUserDocData(')[1].split('\n}\n')[0];
        expect(resolver).toContain('const restData = await readUserDocViaRest(userRef?.id);');
    });

    it('does not let the dashboard paint the diet method from a half copy', () => {
        const direct = APP.split('const _directFirestore = async () => {')[1].split('\n        };')[0];
        expect(direct).toContain('if (ud.coins == null) {');
        expect(direct).toContain('getFirestoreDocViaRest(');
        expect(direct).toContain('return { ud, weekLogs: wl, streakLogs: sl, communityStats: null };');
    });
});
