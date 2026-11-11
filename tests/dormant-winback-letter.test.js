import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

// 2026-11-11: 오래 쉰 분께 보낸 복귀 캠페인은 모두 같은 글이었고 14일 안에 돌아온 분이
// 47명 중 2명, 63명 중 2명이었다. 이번 편지는 그분이 남긴 기록으로 시작한다.

const {
    WINBACK_CAMPAIGN,
    WINBACK_UPDATES,
    pickWinbackUpdates,
    summarizeWinbackHistory,
    decideWinbackTarget,
    nextMondayAfter,
    buildDormantWinbackEmailTemplate,
} = emailModule;
const RUNTIME = readRepoFile('functions/runtime.js');
const FN = RUNTIME.split('exports.sendDormantWinbackLetters = onCall(')[1].split('\n);')[0];
const COLLECT = RUNTIME.split('async function collectDormantWinbackTargets(')[1].split('\n}\n')[0];

function log(date, { diet = 0, exercise = 0, weight = '' } = {}) {
    return {
        date,
        awardedPoints: { dietPoints: diet, exercisePoints: exercise, mindPoints: 0 },
        metrics: { weight: String(weight), glucose: '', bpSystolic: '', bpDiastolic: '' },
    };
}

function daysFrom(start, count, extra = {}) {
    const rows = [];
    const d = new Date(`${start}T12:00:00Z`);
    for (let i = 0; i < count; i += 1) {
        rows.push(log(d.toISOString().slice(0, 10), { diet: 10, ...extra }));
        d.setUTCDate(d.getUTCDate() + 1);
    }
    return rows;
}

describe('dormant win-back history', () => {
    it('counts only real record days and measures the gap from the last one', () => {
        const logs = [
            ...daysFrom('2026-07-01', 5),
            log('2026-07-20', { exercise: 10 }),
            log('2026-07-21'), // 빈 문서는 기록이 아니다
            log('2026-07-22', { weight: 60 }), // 체중만 적은 날은 기록이다
        ];
        const h = summarizeWinbackHistory(logs, '2026-11-11');
        expect(h.recordDays).toBe(7);
        expect(h.firstDate).toBe('2026-07-01');
        expect(h.lastDate).toBe('2026-07-22');
        expect(h.gapDays).toBe(112);
        expect(h.longestStreak).toBe(5);
        expect(h.highlight).toEqual({ kind: 'streak', days: 5 });
    });

    it('quotes weight only when it went down by 1kg or more, ignoring typos', () => {
        const logs = [
            log('2026-06-01', { diet: 10, weight: 58.3 }),
            log('2026-06-10', { diet: 10, weight: 159 }), // 59 를 잘못 친 값
            log('2026-07-16', { diet: 10, weight: 56 }),
        ];
        const h = summarizeWinbackHistory(logs, '2026-11-11');
        expect(h.highlight).toMatchObject({ kind: 'weight_loss', startKg: 58.3, endKg: 56, lossKg: 2.3 });

        const gained = summarizeWinbackHistory([
            log('2026-06-01', { diet: 10, weight: 48.4 }),
            log('2026-07-01', { diet: 10, weight: 48.7 }),
        ], '2026-11-11');
        expect(gained.weightLoss).toBeNull();
    });

    it('targets only people silent for more than 45 days with 10 or more record days', () => {
        expect(decideWinbackTarget(summarizeWinbackHistory(daysFrom('2026-08-01', 12), '2026-11-11')).eligible).toBe(true);
        // 마지막 기록이 정확히 45일 전이면 아직 자동 안내 몫이다.
        const last45 = summarizeWinbackHistory(daysFrom('2026-09-16', 12), '2026-11-11');
        expect(last45.lastDate).toBe('2026-09-27');
        expect(decideWinbackTarget(last45).reason).toBe('recent');
        expect(decideWinbackTarget(summarizeWinbackHistory(daysFrom('2026-07-01', 9), '2026-11-11')).reason).toBe('few_days');
        expect(decideWinbackTarget(summarizeWinbackHistory([], '2026-11-11')).eligible).toBe(false);
    });
});

describe('dormant win-back letter', () => {
    const history = summarizeWinbackHistory(daysFrom('2026-05-04', 20), '2026-11-11');
    const base = {
        name: '해빛',
        history,
        updates: pickWinbackUpdates(history.lastDate),
        startDate: '2026-11-16',
        todayStr: '2026-11-11',
        coins: 891,
        comebackBonusPoints: 50,
        link: 'https://h/?tab=dashboard&panel=challenge&utm_source=email&utm_medium=winback&utm_campaign=dormant_personal_v1',
    };

    it('opens with the member\'s own records', () => {
        const ko = buildDormantWinbackEmailTemplate(base);
        expect(ko.subject).toBe('해빛님, 기록하신 20일을 다시 꺼내 봤습니다');
        expect(ko.html).toContain('5월 4일부터 5월 23일까지 <strong>20일</strong>을 기록하셨습니다');
        expect(ko.html).toContain('가장 길게는 20일을 하루도 빠짐없이 이어 가셨습니다');
        expect(ko.html.indexOf('기록하셨습니다')).toBeLessThan(ko.html.indexOf('달라졌습니다'));
    });

    it('makes one dated invitation that matches the current group rules', () => {
        const ko = buildDormantWinbackEmailTemplate(base);
        expect(ko.html).toContain('11월 16일 월요일, 운동 소모임에 함께해 주세요');
        expect(ko.html).toContain('4주 동안 운동을 14번 인증하시면 1,000P를 드립니다');
        expect(ko.html).toContain('11월 16일에 들어오시면 12월 13일까지입니다');
        expect(ko.html).toContain('참가비 200P는 지금 가지신 891P로 충분합니다');
        expect(ko.html.match(/<a /g)).toHaveLength(1);
        expect(ko.html).toContain(`href="${base.link}"`);

        const groups = readRepoFile('js/habit-groups.js');
        expect(groups).toContain('export const EXERCISE_GROUP_ENTRY_FEE_POINTS = 200;');
        expect(groups).toContain('export const EXERCISE_GROUP_REWARD_TARGET = 14;');
        expect(groups).toContain('export const EXERCISE_GROUP_REWARD_POINTS = 1000;');
        expect(groups).toContain('export const EXERCISE_GROUP_REWARD_WINDOW_DAYS = 28;');
        expect(RUNTIME).toContain('startDate: todayStr }),');
    });

    it('mentions the comeback bonus and the fee only when they are true', () => {
        const without = buildDormantWinbackEmailTemplate({ ...base, comebackBonusPoints: 0, coins: 120 });
        expect(without.html).not.toContain('복귀 보너스');
        expect(without.html).toContain('참가비는 200P입니다');
        expect(buildDormantWinbackEmailTemplate(base).html).toContain('복귀 보너스 50P도 드립니다');
        const bonus = readRepoFile('functions/comeback-bonus.js');
        expect(bonus).toContain('const COMEBACK_BONUS_POINTS = 50;');
    });

    it('does not put a member-written name into the HTML as markup', () => {
        const ko = buildDormantWinbackEmailTemplate({ ...base, name: '<b>해빛</b>' });
        expect(ko.html).toContain('&lt;b&gt;해빛&lt;/b&gt;님, 안녕하세요');
        expect(ko.html).not.toContain('<b>해빛');
    });

    it('writes English for English members', () => {
        const en = buildDormantWinbackEmailTemplate({ ...base, name: 'Sun', locale: 'en' });
        expect(en.subject).toBe('Sun, I looked back at your 20 days');
        expect(en.html).toContain('From May 4 to May 23, you recorded on <strong>20 days</strong>.');
        expect(en.html).toContain('join an exercise group on Monday, Nov 16');
        expect(en.html).not.toMatch(/[가-힣]/);
    });

    it('lists only updates released after the member\'s last record', () => {
        expect(pickWinbackUpdates('2026-05-23').map((u) => u.version)).toEqual(['v401', 'v410', 'v450']);
        expect(pickWinbackUpdates('2026-09-20').map((u) => u.version)).toEqual(['v450', 'v508', 'v456']);
        expect(pickWinbackUpdates('2026-12-01')).toEqual([]);
        const noUpdates = buildDormantWinbackEmailTemplate({ ...base, updates: [] });
        expect(noUpdates.html).not.toContain('달라졌습니다');
    });

    it('quotes each update from a real CHANGELOG release', () => {
        const changelog = readRepoFile('CHANGELOG.md');
        for (const update of WINBACK_UPDATES) {
            expect(changelog).toContain(`## ${update.version} · ${update.date} `);
        }
    });

    it('starts the group on the coming Monday by default', () => {
        expect(nextMondayAfter('2026-11-11')).toBe('2026-11-16'); // 수 → 다음 월
        expect(nextMondayAfter('2026-11-16')).toBe('2026-11-23'); // 월 → 그다음 월
        expect(nextMondayAfter('2026-11-15')).toBe('2026-11-16'); // 일 → 다음 날
    });
});

describe('sendDormantWinbackLetters', () => {
    it('is admin only and previews by default', () => {
        expect(FN).toContain('await assertAdminRequest(request);');
        expect(FN).toContain('const preview = request.data?.preview !== false;');
        expect(FN.indexOf('if (preview) {')).toBeLessThan(FN.indexOf('transporter.sendMail('));
        expect(RUNTIME).not.toMatch(/onSchedule\([^)]*\)[\s\S]{0,400}collectDormantWinbackTargets/);
    });

    it('sends one at a time and records the campaign in emailLogs', () => {
        expect(FN).toContain('setTimeout(resolve, REENGAGEMENT_SEND_GAP_MS)');
        expect(FN).toContain('trigger: WINBACK_CAMPAIGN,');
        expect(FN).toContain('reEngagementHistory: [historyEntry, ...existingHistory].slice(0, 12),');
        expect(FN).toContain('if (alreadyGotWinback(existingLog)) continue;');
        expect(WINBACK_CAMPAIGN).toBe('dormant_personal_v1');
    });

    it('measures the gap from daily_logs and skips staff, deleting accounts and repeats', () => {
        expect(COLLECT).toContain('summarizeWinbackHistory(logsSnap.docs');
        expect(COLLECT).toContain('accountDeletionPending');
        expect(COLLECT).toContain('stats_exclusions');
        expect(COLLECT).toContain('alreadyGotWinback(emailLogSnap.data())');
        expect(COLLECT).toContain('decideComebackBonus({');
        expect(COLLECT).toContain('const cutoffStr = shiftDateString(todayStr, WINBACK_MIN_GAP_DAYS);');
    });

    it('opens the group card on the dashboard with utm tags', () => {
        const link = RUNTIME.split('function buildWinbackLink(locale) {')[1].split('\n}\n')[0];
        expect(link).toContain('buildLocalizedAppPath(locale, "dashboard", {');
        expect(link).toContain('panel: "challenge",');
        expect(link).toContain('utm_medium: "winback",');
        expect(link).toContain('utm_campaign: WINBACK_CAMPAIGN,');
    });

    it('has a button in the console that confirms before sending', () => {
        const adminHtml = readRepoFile('admin.html');
        expect(adminHtml).toContain('onclick="sendDormantWinbackLetters()"');
        const caller = adminHtml.split('window.sendDormantWinbackLetters = async function() {')[1].split('\n    };')[0];
        expect(caller.indexOf('preview: true')).toBeLessThan(caller.indexOf('if (!confirm('));
        expect(caller.indexOf('if (!confirm(')).toBeLessThan(caller.indexOf('preview: false'));
    });
});
