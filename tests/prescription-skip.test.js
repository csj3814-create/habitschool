import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_ALERT_THRESHOLDS as ADMIN_THRESHOLDS,
    ADMIN_PRESCRIPTION_ALERT_MIN_REPEATS_ALONE as MIN_REPEATS,
} from '../js/admin-utils.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');
const RULES = read('firestore.rules');
const TODAY = '2026-09-15';

const DATES = ['2026-09-04', '2026-08-26', '2026-08-17'];
// 여러 날짜에 걸친 기록. 한쪽만 걸린 혈압은 반복돼야 경보가 되므로 필요하다.
const alertOver = (...days) => buildAdminPrescriptionDrafts({
    name: '헤이',
    logs: days.map((metrics, i) => ({ date: DATES[i], metrics })),
    todayStr: TODAY,
}).find((d) => d.key.includes('alert'));
const alertFor = (metrics) => alertOver(metrics);

// 2026-09-15 지적: "132/90 처럼 아슬아슬하게 높은 건 메세지 보내기가 그래."
//
// 보내기 꺼려진 이유의 절반은 문장이었다. 132/90 인데 "기준 140/90 mmHg를
// 넘었고" 라고 나갔다 — 132 는 140 을 넘지 않았다. 걸린 것은 이완기 90 하나뿐이고
// 그것도 넘은 게 아니라 닿은 것이다.
describe('a borderline reading is described as what it is', () => {
    it('says "touched the line" when the value equals it', () => {
        expect(alertFor({ glucose: 126 }).message).toContain('딱 닿는 값이고');
        expect(alertFor({ bpSystolic: 140, bpDiastolic: 90 }).message).toContain('딱 닿는 값이고');
        expect(alertOver({ bpSystolic: 145, bpDiastolic: 80 }, { bpSystolic: 146, bpDiastolic: 80 })
            .message).toContain('딱 닿는 값이고');
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

    it('names the half that crossed, and never the one that did not', () => {
        const draft = alertOver({ bpSystolic: 199, bpDiastolic: 67 }, { bpSystolic: 188, bpDiastolic: 70 });
        expect(draft.message).toContain('수축기혈압이 199 mmHg');
        expect(draft.message).toContain('145 mmHg보다 높고');
        // 걸리지 않은 쪽을 기준과 나란히 두면 그쪽도 넘은 것처럼 읽힌다.
        expect(draft.message).not.toContain('140/90');
        // 전체 수치는 맥락으로 함께 보여준다.
        expect(draft.message).toContain('혈압 199/67 mmHg');
    });

    it('counts each kind on its own', () => {
        // 혈당 1회 + 수축기 2회인 분께 혈당 메시지가 "30일에 3번" 이라고 나갔다.
        const draft = alertOver(
            { glucose: 141 },
            { bpSystolic: 199, bpDiastolic: 67 },
            { bpSystolic: 190, bpDiastolic: 67 }
        );
        expect(draft.message).toContain('공복혈당이 141 mg/dL');
        expect(draft.message).toContain('최근 30일에 1번입니다');
    });
});

// 2026-09-15 요청: "수축기, 이완기 단독은 145, 95부터, 2회 이상 반복될 때만
// 경보로 바꿔줘."
//
// 140/90 을 양쪽에 그대로 적용하니 132/90, 128/90 처럼 이완기 하나만 아슬아슬하게
// 닿은 값이 대기열 맨 위를 차지했다. 한 번 잰 값으로 연락할 일이 아니다.
describe('one high number on its own is not an alert', () => {
    it('lets the readings that crowded the queue go quiet', () => {
        expect(alertFor({ bpSystolic: 132, bpDiastolic: 90 })).toBeUndefined();
        expect(alertFor({ bpSystolic: 128, bpDiastolic: 90 })).toBeUndefined();
        expect(alertFor({ bpSystolic: 199, bpDiastolic: 67 })).toBeUndefined();
    });

    it('holds the line at 145 and 95, not 140 and 90', () => {
        const twice = (m) => alertOver(m, m);
        expect(twice({ bpSystolic: 144, bpDiastolic: 80 })).toBeUndefined();
        expect(twice({ bpSystolic: 145, bpDiastolic: 80 })).toBeTruthy();
        expect(twice({ bpSystolic: 130, bpDiastolic: 94 })).toBeUndefined();
        expect(twice({ bpSystolic: 130, bpDiastolic: 95 })).toBeTruthy();
    });

    it('needs it to happen twice', () => {
        expect(alertOver({ bpSystolic: 199, bpDiastolic: 67 })).toBeUndefined();
        expect(alertOver({ bpSystolic: 199, bpDiastolic: 67 }, { bpSystolic: 188, bpDiastolic: 70 })).toBeTruthy();
        expect(alertOver({ bpSystolic: 130, bpDiastolic: 95 })).toBeUndefined();
        expect(alertOver({ bpSystolic: 130, bpDiastolic: 95 }, { bpSystolic: 130, bpDiastolic: 96 })).toBeTruthy();
    });

    it('does not make the two halves cover for each other', () => {
        // 한 번은 수축기만, 한 번은 이완기만 — 같은 종류가 두 번 나온 것이 아니다.
        expect(alertOver({ bpSystolic: 150, bpDiastolic: 80 }, { bpSystolic: 120, bpDiastolic: 96 }))
            .toBeUndefined();
    });

    it('still raises both-high on the first reading', () => {
        // 양쪽이 함께 걸린 것은 아슬아슬한 값이 아니다. 기다릴 이유가 없다.
        expect(alertFor({ bpSystolic: 140, bpDiastolic: 90 })).toBeTruthy();
        expect(alertFor({ bpSystolic: 160, bpDiastolic: 100 })).toBeTruthy();
    });

    it('leaves fasting glucose alone — one reading is enough there', () => {
        expect(alertFor({ glucose: 126 })).toBeTruthy();
        expect(alertFor({ glucose: 141 })).toBeTruthy();
        expect(alertFor({ glucose: 125 })).toBeUndefined();
    });

    it('keeps the two thresholds in one place', () => {
        expect(ADMIN_THRESHOLDS.bpSystolicAlone).toBe(145);
        expect(ADMIN_THRESHOLDS.bpDiastolicAlone).toBe(95);
        expect(ADMIN_THRESHOLDS.bpSystolic).toBe(140);
        expect(ADMIN_THRESHOLDS.bpDiastolic).toBe(90);
        expect(MIN_REPEATS).toBe(2);
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
