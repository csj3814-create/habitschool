import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-15 발견: 코치 메시지를 한 번 닫으면 그 뒤 어떤 메시지도 보이지 않았다.
// 닫기 표식이 'hide_fb_<uid>' 라 메시지를 구분하지 못했다. 보낸 쪽은 관제탑에서
// "3일간 노출됩니다" 토스트를 보고 전달된 줄 알았다 — 아무 신호도 없는 실패였다.
describe('dismissing one coach message does not silence the next', () => {
    const auth = read('js/auth.js');
    const app = read('js/app-core.js');

    it('keys the dismissal by message, not by member', () => {
        expect(auth).toContain('localStorage.getItem(`hide_fb_${user.uid}_${ud.feedbackDate}`)');
        expect(app).toContain('const key = `hide_fb_${user.uid}_${feedbackDate}`;');
        // 회원 단위로 막던 예전 표식은 남아 있으면 안 된다.
        expect(auth).not.toContain("localStorage.getItem('hide_fb_' + user.uid)");
        expect(app).not.toContain("localStorage.setItem('hide_fb_' + user.uid, 'true')");
    });

    it('carries the date on the box so the closer knows what it closed', () => {
        expect(auth).toContain('feedbackDate: ud.feedbackDate,');
        const show = app.split('window.showCoachMessage = function (')[1].split('\n};\n')[0];
        expect(show).toContain('box.dataset.feedbackDate = feedbackDate;');
        const fn = app.split('window.hideFeedback = function () {')[1].split('\n};\n')[0];
        expect(fn).toContain('box.dataset.feedbackDate');
    });

    it('writes no marker when it cannot tell which message it is', () => {
        // 날짜가 없는데 표식을 남기면 예전 버그가 다른 모양으로 돌아온다.
        const fn = app.split('window.hideFeedback = function () {')[1].split('\n};\n')[0];
        expect(fn).toContain('if (user && feedbackDate)');
    });
});
