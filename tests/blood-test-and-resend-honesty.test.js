import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

const APP = readAppSource();
const RUNTIME = readRepoFile('functions/runtime.js');
const MARKET = readRepoFile('functions/reward-market.js');

// 사진 한 장을 올렸는데 "일부 업로드 실패" 가 떴다. 사진은 올라가 있었다.
// 확인 함수가 세 가지 상황을 전부 null 로 돌려줬고, 부르는 쪽은 그것을 저장 실패로 읽었다.
describe('an upload we could not verify is not called a failure', () => {
    it('separates "checked and absent" from "could not check"', () => {
        const fn = APP.split('async function verifyBackgroundMediaPersisted({ userId, docId, job, result } = {}) {')[1]
            .split('\n}')[0];
        expect(fn).toContain("return { status: 'persisted', data: persistedData };");
        expect(fn).toContain("{ status: 'absent' }");
        expect(fn).toContain("{ status: 'unknown' }");
    });

    it('only says absent when the server itself answered', () => {
        // 캐시는 방금 쓴 값을 아직 모를 수 있다. 캐시에 없다고 없는 것이 아니다.
        const fn = APP.split('async function verifyBackgroundMediaPersisted({ userId, docId, job, result } = {}) {')[1]
            .split('\n}')[0];
        expect(fn).toContain('let fromServer = true;');
        expect(fn).toContain('fromServer = false;');
        expect(fn).toContain("return fromServer ? { status: 'absent' } : { status: 'unknown' };");
    });

    it('defers an unverified save instead of failing it', () => {
        expect(APP).toContain("} else if (verification.status === 'unknown') {");
        expect(APP).toContain("scheduleBackgroundMediaPatchFlush('background_media_verify_unknown');");
        // deferred 로 표시되면 화면은 '재시도 예약됨' 이 된다 — 실패가 아니다.
        expect(APP).toContain('return { failed: true, deferred: true };');
    });

    it('rebuilds the patch from one shared builder, not a second copy', () => {
        expect(APP).toContain('function buildBackgroundMediaPatch(job, result, baseData = null, docId = \'\')');
        expect(APP).toContain('const rebuilt = buildBackgroundMediaPatch(job, result, null, docId);');
    });

    it('does not say "일부" when there was only one upload', () => {
        expect(APP).toContain("(tracker.jobs.length === 1 ? '업로드 실패' : `업로드 ${failedCount}건 실패`)");
        expect(APP).not.toContain(": '일부 업로드 실패')");
    });
});

// 혈액검사 결과가 healthProfile 에 반영되지 않아, 올려도 대사건강 점수의 인슐린 항목이
// "건강 지표 기록 필요" 로 남았다.
describe('a blood test result reaches the profile it feeds', () => {
    it('uses update, which is the only one that reads dots as paths', () => {
        expect(RUNTIME).toContain('await db.doc(`users/${uid}`).update(profileUpdate)');
        // set() 으로 점 표기를 쓰면 이름에 점이 든 최상위 필드가 만들어진다.
        expect(RUNTIME).not.toContain('await db.doc(`users/${uid}`).set(profileUpdate, { merge: true });');
    });

    it('still writes the nested shape if the member document is missing', () => {
        expect(RUNTIME).toContain('if (error?.code !== 5 && error?.code !== "not-found") throw error;');
        expect(RUNTIME).toContain('healthProfile: {');
    });

    it('files the result under the Korean date, like the rest of the app', () => {
        // toISOString() 은 UTC 라 한국시간 0~9시 검사가 어제 문서로 들어갔다.
        expect(RUNTIME).toContain("const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });");
        expect(RUNTIME).not.toContain('const dateStr = new Date().toISOString().slice(0, 10);');
    });

    it('does not overwrite an earlier result on the same day', () => {
        const block = RUNTIME.split('await db.doc(`users/${uid}/bloodTests/${dateStr}`).set({')[1].split(');')[0];
        expect(block).toContain('{ merge: true }');
    });

    it('checks sensitive consent on the server, not only on screen', () => {
        // 화면 게이트만 있으면 콜러블을 직접 불러 동의 없이 분석·저장할 수 있다.
        expect(RUNTIME).toContain('consentSnap.data()?.consents?.sensitive?.agreed !== true');
        expect(RUNTIME).toContain('건강정보 동의가 필요해요. 프로필에서 동의한 뒤 사용해 주세요.');
    });

    it('has a backfill for the results that never made it', () => {
        const script = readRepoFile('scripts/backfill-bloodtest-health-profile-2026-08-14.js');
        expect(script).toContain('collectionGroup("bloodTests")');
        expect(script).toContain('await userRef.update(patch);');
        // 사용자가 직접 넣은 값을 덮지 않는다.
        expect(script).toContain('profile[nestedKey] === undefined');
        // 실수로 쓰는 것을 막는다.
        expect(script).toContain('--dry-run 또는 --apply 중 하나를 지정해야 한다');
    });
});

// 이미 사용한 쿠폰을 다시 받으려 하면 발송사가 거절하는데, 화면은 "지연되고 있어요,
// 잠시 후 다시 시도해 주세요" 라고 했다. 영영 성공하지 않을 일을 계속 누르게 된다.
describe('a refused resend is not described as a delay', () => {
    it('tells a refusal apart from not having reached the vendor', () => {
        expect(MARKET).toContain('const refusedByProvider = status >= 400 && status < 500;');
    });

    it('says it was refused, and why it might have been', () => {
        expect(MARKET).toContain('발송사에서 이 쿠폰의 재발송을 거절했어요');
        expect(MARKET).toContain('이미 사용했거나 기간이 지난 쿠폰일 수 있어요');
        // 재시도해도 소용없으므로 unavailable(일시적)이 아니라 failed-precondition 이다.
        expect(MARKET).toContain('throw new HttpsError(\n                "failed-precondition",');
    });

    it('keeps the delay wording for the genuinely transient case', () => {
        expect(MARKET).toContain('문자 재발송 요청이 지연되고 있어요. 잠시 후 다시 시도해 주세요.');
    });

    it('records what the vendor actually said, for the next investigation', () => {
        expect(MARKET).toContain('lastUserResendErrorMessage:');
        expect(MARKET).toContain('lastUserResendRefused: refusedByProvider,');
    });
});
