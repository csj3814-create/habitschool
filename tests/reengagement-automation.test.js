import { describe, expect, it } from 'vitest';
import { alreadyNudgedForGap } from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

const RUNTIME = readRepoFile('functions/runtime.js');

// 발송 대상은 "3일 이상 기록이 없는 사람" 이다. 한 번 멀어진 사람은 돌아오기 전까지
// 매일 그 조건에 걸리므로, 자동 발송에 가드가 없으면 한 달 쉰 사람에게 서른 통이 간다.
describe('한 공백에 같은 안내를 두 번 보내지 않는다', () => {
    it('마지막 기록 이후에 보낸 적이 있으면 건너뛴다', () => {
        expect(alreadyNudgedForGap({ sentAt: '2026-08-20T01:00:00.000Z' }, '2026-08-17')).toBe(true);
    });

    it('보낸 적이 없으면 보낸다', () => {
        expect(alreadyNudgedForGap(null, '2026-08-17')).toBe(false);
        expect(alreadyNudgedForGap({}, '2026-08-17')).toBe(false);
    });

    it('다시 기록하고 또 멀어지면 다시 보낸다', () => {
        // 8/20 에 안내를 보냈고, 그 뒤 8/25 에 기록했다 → 이건 새로운 공백이다.
        expect(alreadyNudgedForGap({ sentAt: '2026-08-20T01:00:00.000Z' }, '2026-08-25')).toBe(false);
    });

    it('같은 날 기록했다면 아직 그 공백을 안내한 것이 아니다', () => {
        // 보낸 날과 마지막 기록일이 같으면, 보낸 뒤 그 날 안에 돌아온 것으로 본다.
        expect(alreadyNudgedForGap({ sentAt: '2026-08-20T01:00:00.000Z' }, '2026-08-20')).toBe(false);
    });

    it('기록이 한 번도 없는 사람에게는 단계당 한 번이면 충분하다', () => {
        expect(alreadyNudgedForGap({ sentAt: '2026-08-20T01:00:00.000Z' }, null)).toBe(true);
        expect(alreadyNudgedForGap(null, null)).toBe(false);
    });
});

describe('자동 발송이 지키는 것들', () => {
    it('단계를 구간으로 나눈다', () => {
        // "3일 이상" 과 "7일 이상" 을 그대로 쓰면 8일째인 사람이 하루에 두 통을 받는다.
        const fn = RUNTIME.split('function reEngagementTierForGap(gapDays) {')[1].split('\n}')[0];
        expect(fn).toContain('if (gapDays >= 7) return 7;');
        expect(fn).toContain('if (gapDays >= 3) return 3;');
        expect(fn).toContain('return null;');
    });

    it('오래 떠난 분들까지 쫓아가지 않는다', () => {
        // 이게 없으면 자동 발송을 켜는 첫날 수백 통이 한꺼번에 나간다.
        // 회원 606명 중 매일 기록하는 사람은 한 자릿수다.
        expect(RUNTIME).toContain('const REENGAGEMENT_MAX_GAP_DAYS = 45;');
        const fn = RUNTIME.split('function reEngagementTierForGap(gapDays) {')[1].split('\n}')[0];
        expect(fn).toContain('if (gapDays > REENGAGEMENT_MAX_GAP_DAYS) return null;');
        expect(fn).toContain('if (!Number.isFinite(gapDays)) return null;');
    });

    it('한 번에 나가는 통수에 상한이 있다', () => {
        // Gmail 일일 한도에 걸리면 그날 쿠폰 안내까지 같이 막힌다.
        expect(RUNTIME).toContain('const REENGAGEMENT_MAX_PER_RUN = 120;');
        const fn = RUNTIME.split('async function runScheduledReEngagementSweep() {')[1].split('\n}\n')[0];
        expect(fn).toContain('>= REENGAGEMENT_MAX_PER_RUN');
        expect(fn).toContain('stats.deferred += 1;');
    });

    it('회원마다 질의하지 않고 최근 기록을 한 번에 읽는다', () => {
        // 회원 수만큼 질의하면 606명이 606번이 된다.
        const fn = RUNTIME.split('async function runScheduledReEngagementSweep() {')[1].split('\n}\n')[0];
        expect(fn).toContain('db.collection("daily_logs").where("date", ">=", windowStartStr).get()');
        expect(fn).toContain('alreadyNudgedForGap(');
    });

    it('보낸 기록을 남긴다', () => {
        const fn = RUNTIME.split('async function runScheduledReEngagementSweep() {')[1].split('\n}\n')[0];
        expect(fn).toContain('reEngagementByDays: { [`day${days}`]: historyEntry }');
        expect(fn).toContain("trigger: \"scheduled\"");
        // 아무도 안 읽는 본문 HTML 은 저장하지 않는다. 관제탑이 emailLogs 를 통째로 읽는다.
        expect(fn).not.toContain('lastSentHtml');
    });

    it('사람이 누르는 버튼은 그대로 둔다', () => {
        // 관리자가 직접 고른 발송까지 가드로 막으면 다시 보낼 방법이 없어진다.
        expect(RUNTIME).toContain('exports.sendReEngagementEmailsV2 = onCall(');
        expect(RUNTIME).toContain('exports.sendReEngagementEmailsScheduled = onSchedule(');
    });
});

describe('새 제보 알림', () => {
    it('제보가 만들어지면 관리자에게 메일이 간다', () => {
        expect(RUNTIME).toContain('exports.notifyNewBugReport = onDocumentCreated(');
        expect(RUNTIME).toContain('document: "bug_reports/{reportId}"');
    });

    it('알림이 실패해도 던지지 않는다', () => {
        // 제보는 이미 저장됐다. 여기서 던지면 재시도가 돌며 같은 메일만 여러 통 간다.
        const fn = RUNTIME.split('exports.notifyNewBugReport = onDocumentCreated(')[1].split('\n);')[0];
        expect(fn).toContain('} catch (error) {');
        expect(fn).toContain('console.error("[notifyNewBugReport] 알림 실패:"');
        expect(fn).not.toContain('throw');
    });

    it('옛 이메일 문서로 등록된 관리자도 찾는다', () => {
        const fn = RUNTIME.split('async function collectAdminEmails() {')[1].split('\n}')[0];
        expect(fn).toContain('docSnap.id.includes("@")');
    });

    it('제보 내용을 그대로 메일에 끼워 넣지 않는다', () => {
        const fn = RUNTIME.split('function buildBugReportNotification(report) {')[1].split('\n}\n')[0];
        expect(fn).toContain('escapeHtml(message)');
        expect(fn).toContain('.replace(/</g, "&lt;")');
    });
});
