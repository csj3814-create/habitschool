import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const RUNTIME = readRepoFile('functions/runtime.js');

// migrateHbtToCoins 는 잔액을 포인트로 바꾸는 함수인데, 관리자 판단을 하드코딩된
// 목록(['YOUR_ADMIN_UID'])으로 하고 있었다. 채워진 적이 없어 아무도 관리자가 아니었고
// 그래서 무해했지만, 누군가 채우는 순간 admins/{uid} 컬렉션과 어긋나는 두 번째 명단이
// 생긴다. 돈이 걸린 함수에서 관리자 명단이 둘이면 곤란하다.
describe('there is one place that decides who is an admin', () => {
    const fn = RUNTIME.split('exports.migrateHbtToCoins = onCall(')[1].split('\n);')[0];

    it('has no hardcoded admin list left in the code', () => {
        // 주석으로 사연을 남기는 것은 괜찮다. 배열 리터럴이 남아 있으면 안 된다.
        expect(fn).not.toContain("const adminUids = [");
        expect(fn).not.toContain('adminUids.includes(');
    });

    it('asks the shared check before touching someone else', () => {
        expect(fn).toContain('await assertAdminRequest(request);');
        expect(fn).toContain('if (requestedTargetUid && requestedTargetUid !== request.auth.uid)');
    });

    it('lets a member migrate only themselves without admin rights', () => {
        expect(fn).toContain('let targetUid = request.auth.uid;');
    });

    it('requires admin for the everyone path too', () => {
        // targetUid 를 비워 두는 것이 '전체' 신호였다. 그 경로가 열려 있으면 안 된다.
        expect(fn).toContain("request.data?.allUsers === true");
        const allUsersBranch = fn.split('request.data?.allUsers === true) {')[1].split('}')[0];
        expect(allUsersBranch).toContain('await assertAdminRequest(request);');
    });

    it('does not reference the variable it used to compute', () => {
        // isAdmin 을 지우고 그 참조를 남겨 두면 ReferenceError 로 함수가 통째로 죽는다.
        expect(fn).not.toContain('isAdmin');
    });

    it('still uses the admins collection everywhere else', () => {
        expect(RUNTIME).toContain('async function assertAdminRequest(request)');
        expect(RUNTIME).toContain('await db.collection("admins").doc(uid).get()');
    });
});
