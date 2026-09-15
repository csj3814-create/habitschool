import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const ADMIN = read('admin.html');
const RUNTIME = read('functions/runtime.js');

// 관제탑에 있는 함수 본문을 그대로 떼어 와 시험한다. 같은 계산을 옮겨 적으면
// 실제로 도는 코드와 갈라질 수 있다.
const body = ADMIN.split('function daysUntilCanSend(uid) {')[1].split('\n    }')[0];
const daysUntilCanSend = new Function('prescriptionQueue', 'uid', body);
const waitFor = (todayStr, last, sendCooldownDays = 3) => daysUntilCanSend(
    { todayStr, sendCooldownDays, lastSentByUid: last ? { u1: last } : {} },
    'u1'
);

// 2026-09-15 요청: "3일 이내에 보낸 메세지가 있는 사람은 그대로 보내기 버튼을
// 비활성화 하고 3일 뒤 보내기, 2일 뒤 보내기로 언제 다시 보낼 수 있는지 알려줘."
describe('a member who just heard from us is not written to again', () => {
    const TODAY = '2026-09-15';

    it('counts down the days instead of just greying out', () => {
        expect(waitFor(TODAY, '2026-09-15')).toBe(3);   // 오늘 보냄
        expect(waitFor(TODAY, '2026-09-14')).toBe(2);   // 어제
        expect(waitFor(TODAY, '2026-09-13')).toBe(1);   // 2일 전
    });

    it('opens back up on the third day', () => {
        expect(waitFor(TODAY, '2026-09-12')).toBe(0);
        expect(waitFor(TODAY, '2026-09-01')).toBe(0);
    });

    it('says nothing is owed for a member who never got a message', () => {
        expect(waitFor(TODAY, null)).toBe(0);
        expect(waitFor(TODAY, '')).toBe(0);
    });

    it('counts real days across month and year boundaries', () => {
        // 문자열 날짜를 빼면 9/30 과 10/1 이 하루 차이라는 걸 놓치기 쉽다.
        expect(waitFor('2026-10-01', '2026-09-30')).toBe(2);
        expect(waitFor('2026-03-02', '2026-02-28')).toBe(1);
        expect(waitFor('2027-01-01', '2026-12-31')).toBe(2);
    });

    it('never locks the admin out longer than the rule, even on a bad date', () => {
        // 마지막 발송일이 미래로 찍히면 경과가 음수가 되어 8일 뒤가 나왔다.
        // 잘못 들어간 날짜 하나로 관제탑이 며칠씩 잠기면 안 된다.
        expect(waitFor(TODAY, '2026-09-20')).toBe(3);
        expect(waitFor(TODAY, '2027-01-01')).toBe(3);
    });

    it('follows the number the server sends, not one written twice', () => {
        expect(waitFor(TODAY, '2026-09-14', 7)).toBe(6);
        expect(RUNTIME).toContain('const PRESCRIPTION_SEND_COOLDOWN_DAYS = 3;');
        expect(RUNTIME).toContain('sendCooldownDays: PRESCRIPTION_SEND_COOLDOWN_DAYS,');
    });
});

describe('the rule is on the send, not only on the button', () => {
    it('counts any message, including one the admin typed', () => {
        // 종류별 4주 쿨다운은 draftKey 가 있는 것만 세지만, 회원 단위 3일은
        // 받는 쪽 기준이다 — 직접 쓴 메시지도 똑같은 한 통이다.
        const reader = RUNTIME.split('async function readRecentPrescriptionFeedback(todayStr) {')[1].split('\n}\n')[0];
        const lastSent = reader.split('lastSentByUid[row.targetUserId]')[0];
        expect(lastSent).not.toContain('if (!row.draftKey) return;');
        expect(reader).toContain('return { sentKeysByUid, skippedKeysByUid, lastSentByUid, sentLog };');
    });

    it('refuses in the send function too, not just in the markup', () => {
        // 버튼만 막으면 규칙이 아니라 장식이다.
        const fn = ADMIN.split('async function sendPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('const wait = daysUntilCanSend(uid);');
        expect(fn).toContain('if (wait > 0) {');
        const beforeSend = fn.split('submitAdminFeedbackCallable')[0];
        expect(beforeSend).toContain('일 뒤에 보낼 수 있습니다');
    });

    it('starts the countdown the moment it sends', () => {
        const fn = ADMIN.split('async function sendPrescriptionFromQueue(uid, button) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('prescriptionQueue.lastSentByUid[uid] = prescriptionQueue.todayStr;');
    });

    // 2026-09-15 지적: "보낸 메세지는 보낸 메세지함으로 이동하고 전체, 바로 보낼
    // 수 있는 것 에서는 빠져야 하지 않을까? 3일 뒤 똑같은 메세지 보내라는 건
    // 아닐 거 아냐?"
    //
    // 대기 중인 줄을 '3일 뒤 보내기' 로 목록에 남겨 두니, 열한 줄이 전부 그
    // 상태였다. 볼 것과 할 것이 섞이면 목록을 훑는 의미가 없다.
    it('drops a member who was just written to out of the working list', () => {
        const fn = ADMIN.split('window.renderPrescriptionQueue = function() {')[1].split('\n    };')[0];
        expect(fn).toContain('if (daysUntilCanSend(member.uid) > 0) { waitingCount += 1; continue; }');
        // 목록 줄에는 더 이상 대기 버튼이 없다 — 대기 중이면 줄 자체가 없다.
        expect(ADMIN).not.toContain('rxq-wait');
        expect(ADMIN).not.toContain('is-waiting');
    });

    it('says how many are waiting instead of hiding the number', () => {
        const fn = ADMIN.split('window.renderPrescriptionQueue = function() {')[1].split('\n    };')[0];
        expect(fn).toContain('최근 보내서 대기');
        expect(fn).toContain('지금 보낼 수 있는 회원');
        // 목록이 비었을 때 고장인지 할 일이 없는 건지 구분돼야 한다.
        expect(fn).toContain('지금 보낼 회원이 없습니다');
        expect(fn).toContain('보낸 메시지함에서 볼 수 있습니다');
    });

    it('moves the countdown to the sent box, where the member now lives', () => {
        const fn = ADMIN.split('function renderPrescriptionSentBox(term) {')[1].split('\n    }\n')[0];
        expect(fn).toContain('const wait = daysUntilCanSend(row.uid);');
        expect(fn).toContain('일 뒤 다시 보낼 수 있습니다');
        expect(fn).toContain('지금 다시 보낼 수 있습니다');
    });
});
