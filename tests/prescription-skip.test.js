import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdminPrescriptionDrafts } from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');
const RULES = read('firestore.rules');
const TODAY = '2026-09-15';

const alertFor = (metrics) => buildAdminPrescriptionDrafts({
    name: '헤이', logs: [{ date: '2026-09-04', metrics }], todayStr: TODAY,
}).find((d) => d.key.includes('alert'));

// 2026-09-15 지적: "132/90 처럼 아슬아슬하게 높은 건 메세지 보내기가 그래."
//
// 보내기 꺼려진 이유의 절반은 문장이었다. 132/90 인데 "기준 140/90 mmHg를
// 넘었고" 라고 나갔다 — 132 는 140 을 넘지 않았다. 걸린 것은 이완기 90 하나뿐이고
// 그것도 넘은 게 아니라 닿은 것이다.
describe('a borderline reading is described as what it is', () => {
    it('names the half that crossed, not both', () => {
        const draft = alertFor({ bpSystolic: 132, bpDiastolic: 90 });
        expect(draft.message).toContain('이완기혈압이 90 mmHg');
        // 걸리지 않은 쪽을 기준과 나란히 두면 그쪽도 넘은 것처럼 읽힌다.
        expect(draft.message).not.toContain('140/90');
        // 전체 수치는 맥락으로 함께 보여준다.
        expect(draft.message).toContain('혈압 132/90 mmHg');
    });

    it('says "touched the line" when the value equals it', () => {
        expect(alertFor({ bpSystolic: 132, bpDiastolic: 90 }).message).toContain('딱 닿는 값이고');
        expect(alertFor({ glucose: 126 }).message).toContain('딱 닿는 값이고');
        expect(alertFor({ bpSystolic: 140, bpDiastolic: 90 }).message).toContain('딱 닿는 값이고');
    });

    it('says "higher than" only when it really is', () => {
        expect(alertFor({ glucose: 141 }).message).toContain('보다 높고');
        expect(alertFor({ glucose: 141 }).message).not.toContain('딱 닿는');
        expect(alertFor({ bpSystolic: 160, bpDiastolic: 100 }).message).toContain('보다 높고');
    });

    it('still uses the pair when both halves crossed', () => {
        const draft = alertFor({ bpSystolic: 160, bpDiastolic: 100 });
        expect(draft.message).toContain('혈압이 160/100 mmHg');
        expect(draft.message).toContain('140/90 mmHg');
    });

    it('names the systolic side when only it crossed', () => {
        const draft = alertFor({ bpSystolic: 145, bpDiastolic: 85 });
        expect(draft.message).toContain('수축기혈압이 145 mmHg');
        expect(draft.message).toContain('140 mmHg보다 높고');
        expect(draft.message).not.toContain('90');
    });

    it('raises no alert when neither half is at the line', () => {
        expect(alertFor({ bpSystolic: 132, bpDiastolic: 85 })).toBeUndefined();
    });

    it('scores a reading that only touches the line below one that clears it', () => {
        expect(alertFor({ bpSystolic: 132, bpDiastolic: 90 }).score)
            .toBeLessThan(alertFor({ bpSystolic: 160, bpDiastolic: 100 }).score);
    });
});

// "코멘트 전송 없이 삭제할 수 있는 버튼도 만들어 줘."
describe('a draft can be put away without sending anything', () => {
    it('writes the skip through a callable, so no rule has to change', () => {
        // 클라이언트가 직접 쓰면 prescription_skips 를 firestore.rules 에 넣고
        // 배포해야 한다. 빠뜨리면 쓰기가 조용히 거부된다(2026-08-15 consents).
        expect(RUNTIME).toContain('exports.skipAdminPrescription = onCall(');
        expect(RUNTIME).toContain('await assertAdminRequest(request)');
        expect(RULES).not.toContain('prescription_skips');
        expect(ADMIN).toContain("httpsCallable(fns, 'skipAdminPrescription')");
    });

    it('refuses a draft key that would break the document path', () => {
        const fn = RUNTIME.split('exports.skipAdminPrescription = onCall(')[1].split('\n);')[0];
        expect(fn).toContain('.test(draftKey)');
        // 실제 초안 종류는 전부 통과해야 한다.
        const guard = /[/.[\]*~]/;
        for (const key of ['improved-steps', 'alert-이완기혈압', 'gap-sleep', 'streak', 'comeback']) {
            expect(guard.test(key), key).toBe(false);
        }
        for (const bad of ['a/b', 'a.b', 'a[0]', 'x*', 'y~z']) {
            expect(guard.test(bad), bad).toBe(true);
        }
    });

    it('filters a skipped draft in the same place as a sent one', () => {
        const fn = ADMIN.split('function topPrescriptionFor(member, todayStr, cooldownDays) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('if (skipped[draft.key] && skipped[draft.key] >= cut) return false;');
        expect(RUNTIME).toContain('skippedKeysByUid[row.targetUserId][row.draftKey]');
    });

    it('keeps skipped drafts out of the sent box and off the 3-day rule', () => {
        // 섞으면 보내지도 않은 것이 보낸 메시지함에 올라오고, 회원 단위 3일
        // 쿨다운이 잘못 걸린다.
        const reader = RUNTIME.split('async function readRecentPrescriptionFeedback(todayStr) {')[1].split('\n}\n')[0];
        // 건너뛴 것을 담는 반복문만 본다. 마지막 return 은 넷을 함께 돌려주므로
        // 거기까지 넣으면 무엇이든 걸린다.
        const skipLoop = reader.split('const skippedKeysByUid = {};')[1].split('return {')[0];
        expect(skipLoop).not.toContain('sentLog.push');
        expect(skipLoop).not.toContain('lastSentByUid');
    });

    it('offers the button on the queue row, next to send', () => {
        const fn = ADMIN.split('window.renderPrescriptionQueue = function() {')[1].split('\n    };')[0];
        expect(fn).toContain('data-rxq-skip=');
        expect(fn).toContain('>삭제</button>');
        expect(ADMIN).toContain('skipPrescriptionFromQueue(button.dataset.rxqSkip, button)');
    });

    it('offers it in the detail modal too, next to the send button', () => {
        expect(ADMIN).toContain('id="fb-skip"');
        expect(ADMIN).toContain('onclick="skipCurrentDraft()"');
        // 초안을 고르지 않았으면 지울 것이 없다 — 직접 쓴 글은 초안이 아니다.
        expect(ADMIN).toContain('function syncDraftSkipButton() {');
        expect(ADMIN).toContain('el.disabled = !pendingDraftKey;');
    });

    it('clears the box so the skipped text cannot be sent by mistake', () => {
        const fn = ADMIN.split('window.skipCurrentDraft = async function() {')[1].split('\n    };')[0];
        expect(fn).toContain("document.getElementById('fb-text').value = '';");
        expect(fn).toContain("pendingDraftKey = '';");
    });

    it('puts the button back when the skip fails', () => {
        const fn = ADMIN.split('async function skipPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        const failure = fn.split('catch (e)')[1];
        expect(failure).toContain('button.disabled = false');
        expect(failure).toContain('삭제 실패');
        expect(failure).not.toContain('markPrescriptionSkipped');
    });

    it('survives a refresh by filling the same place the server reads', () => {
        expect(ADMIN).toContain('function markPrescriptionSkipped(uid, draftKey) {');
        expect(ADMIN).toContain('prescriptionQueue.skippedKeysByUid[uid] = {');
        // 대기열을 안 연 채 상세만 열어 지울 수도 있다.
        expect(ADMIN).toContain('if (!prescriptionQueue) return;');
    });

    it('tells the admin it is a pause, not a deletion of their record', () => {
        const fn = ADMIN.split('async function skipPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('일 동안 이 초안은 다시 올라오지 않습니다');
    });
});
