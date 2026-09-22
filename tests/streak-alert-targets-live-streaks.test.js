import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-23: 연속 알림에 메일을 붙이려다 대상 목록이 틀린 것을 발견했다.
//
// users.currentStreak > 0 인 회원이 121명인데, 그중 81명은 마지막 기록이 46일 넘게
// 지났고 180일 전에 멈춘 사람이 currentStreak=2 로 남아 있었다. 매일 밤 121명이
// 대상이 되고 연속이 진짜 살아 있는 사람은 14명이었다.
//
// 푸시 토큰을 가진 회원이 12명뿐이라 이 낭비가 드러나지 않았다. 여기에 메일을
// 그대로 붙였으면 매일 밤 100명 넘는 분께 틀린 메일이 나갔을 것이다.

const RUNTIME = readRepoFile('functions/runtime.js');
const ALERT = RUNTIME.split('exports.sendStreakAlert = onSchedule(')[1].split('\n);')[0];
const MAILER = RUNTIME.split('async function sendStreakAlertEmails(')[1].split('\n}\n')[0];

describe('the alert goes to a streak that is actually alive', () => {
    it('decides from the records, not from the stored streak', () => {
        // 저장된 값은 낡는다. 기록은 낡지 않는다.
        expect(ALERT).not.toContain('.where("currentStreak", ">", 0)');
        expect(ALERT).toContain('getTodayLoggedUserIds(yesterdayKST)');
    });

    it('picks the people who recorded yesterday but not yet today', () => {
        // 이 사람들만 오늘 밤 실제로 무언가를 잃는다.
        expect(ALERT).toContain('const eligibleUserIds = [...loggedYesterday].filter((uid) => !loggedIds.has(uid));');
    });

    it('says how many are actually at risk, so a wrong list shows up in the log', () => {
        expect(ALERT).toContain('live streaks at risk');
    });
});

describe('the alert reaches people push cannot', () => {
    it('emails only those the push did not reach', () => {
        // 같은 밤에 두 번 말을 걸지 않는다.
        expect(ALERT).toContain('const pushedUids = new Set(targets.map((target) => target?.uid).filter(Boolean));');
        expect(ALERT).toContain('const mailUids = eligibleUserIds.filter((uid) => !pushedUids.has(uid));');
        expect(ALERT).toContain('await sendStreakAlertEmails(mailUids, todayKST);');
    });

    it('waits a week between emails to the same person', () => {
        // 메일은 남는다. 이틀에 한 번 기록하는 분께 매일 밤 보내면 잔소리가 된다.
        expect(RUNTIME).toContain('const STREAK_ALERT_EMAIL_COOLDOWN_DAYS = 7;');
        expect(MAILER).toContain('shiftKstDateString(todayKST, STREAK_ALERT_EMAIL_COOLDOWN_DAYS)');
        expect(MAILER).toContain('if (lastSent && lastSent > cooldownStart) {');
    });

    it('remembers when it last wrote to someone', () => {
        expect(MAILER).toContain('streakAlertSentAt: new Date().toISOString()');
    });

    it('skips someone with no address instead of failing the run', () => {
        expect(MAILER).toContain('stats.noEmail += 1;');
        expect(MAILER).toContain('if (!email) {');
    });

    it('reports a failed send instead of counting it as sent', () => {
        expect(MAILER).toContain('stats.failed += 1;');
        expect(MAILER).toContain('console.error(');
        expect(MAILER).not.toContain('catch (_) {}');
    });

    it('does nothing at all when nobody qualifies', () => {
        expect(MAILER).toContain('if (!Array.isArray(uids) || uids.length === 0) return');
        // 아무도 없으면 메일 연결을 열 이유도 없다.
        const beforeTransport = MAILER.split('nodemailer.createTransport')[0];
        expect(beforeTransport).toContain('if (candidates.length === 0) {');
    });

    it('declares the secrets it needs, or the whole night fails', () => {
        // GMAIL_USER.value() 는 시크릿이 없으면 그 자리에서 터지고, 푸시까지 막힌다.
        const config = ALERT.slice(0, ALERT.indexOf('async () =>'));
        expect(config).toContain('secrets: [GMAIL_USER, GMAIL_APP_PASSWORD]');
    });
});
