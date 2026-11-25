import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import {
    MONTHLY_COACHING_COST as CLIENT_COST,
    MONTHLY_COACHING_FIRST_COST as CLIENT_FIRST_COST,
    MONTHLY_COACHING_INTERVAL_DAYS as CLIENT_INTERVAL,
    describeCoachingCard,
    formatCoachingPeriod,
    formatCoachingPeriodShort
} from '../js/monthly-coaching-core.js';

const require = createRequire(import.meta.url);
const {
    MONTHLY_COACHING_COST,
    MONTHLY_COACHING_FIRST_COST,
    MONTHLY_COACHING_MIN_RECORDED_DAYS,
    MONTHLY_COACHING_DOCTOR_DAYS,
    coachingPriceFor,
    canBuyCoachingOn,
    nextCoachingDate,
    MONTHLY_COACHING_INTERVAL_DAYS,
    decideCoachingPurchase,
    normalizeCoachingReport,
    summarizeCoachingLogs,
    buildCoachingPrompt,
    coachingPromptData,
    memberJoinedDate
} = require('../functions/monthly-coaching.js')._test;

const day = (date, extra = {}) => ({ date, awardedPoints: { dietPoints: 10 }, ...extra });

// 2026-11-23 대표: 한 달 코칭. 처음 300P, 두 번째부터 500P. 해빛코치(AI) 즉시 + 해빛닥터 최석재 3일 안 직접.
describe('monthly coaching price', () => {
    it('charges 300P the first time and 500P after that', () => {
        expect(MONTHLY_COACHING_FIRST_COST).toBe(300);
        expect(MONTHLY_COACHING_COST).toBe(500);
        expect(coachingPriceFor(0)).toBe(300);
        expect(coachingPriceFor(1)).toBe(500);
        expect([CLIENT_FIRST_COST, CLIENT_COST]).toEqual([300, 500]);
    });

    it('shows the same price on the card as the server takes', () => {
        expect(describeCoachingCard({ reports: [], todayStr: '2026-11-23' })).toMatchObject({ price: 300, firstTime: true, canBuy: true });
        expect(describeCoachingCard({ reports: [{ id: '2026-10-20', periodStart: '2026-09-23', periodEnd: '2026-10-20' }], todayStr: '2026-11-23' }))
            .toMatchObject({ price: 500, firstTime: false, canBuy: true, latest: null });
    });
});

// 같은 날 대표: 달력의 달 대신 「산 날까지의 4주」. 다음 코칭은 그 4주가 끝나고 4주 뒤 — 겹쳐 읽지 않는다.
describe('coaching period', () => {
    const latest = { id: '2026-11-23', periodStart: '2026-10-27', periodEnd: '2026-11-23', doctor: { status: 'sent' } };

    it('waits four weeks after the last period, the same on both sides', () => {
        expect([MONTHLY_COACHING_INTERVAL_DAYS, CLIENT_INTERVAL]).toEqual([28, 28]);
        expect(nextCoachingDate('2026-11-23')).toBe('2026-12-21');
        expect(canBuyCoachingOn('2026-12-20', '2026-11-23')).toBe(false);
        expect(canBuyCoachingOn('2026-12-21', '2026-11-23')).toBe(true);
        expect(canBuyCoachingOn('2026-11-23', null)).toBe(true);
    });

    it('shows the latest letter and the next date until the four weeks pass', () => {
        expect(describeCoachingCard({ reports: [latest], todayStr: '2026-12-20' }))
            .toMatchObject({ canBuy: false, nextDate: '2026-12-21', latest: { id: '2026-11-23' }, doctorArrived: true, past: [] });
        const later = describeCoachingCard({ reports: [latest], todayStr: '2026-12-21' });
        expect(later).toMatchObject({ canBuy: true, price: 500, latest: null });
        expect(later.past.map((r) => r.id)).toEqual(['2026-11-23']);
    });

    it('names each letter by the four weeks it read', () => {
        expect(formatCoachingPeriod(latest)).toBe('10월 27일 ~ 11월 23일');
        expect(formatCoachingPeriod(latest, { english: true })).toBe('Oct 27 ~ Nov 23');
        expect(formatCoachingPeriodShort(latest)).toBe('10/27~11/23');
    });
});

describe('monthly coaching buy rules', () => {
    it('names the box 해빛 코칭 and strikes 500P through on the first buy', () => {
        const card = readRepoFile('js/monthly-coaching.js');
        expect(card).toContain("copy('해빛 코칭', 'Haebit Coaching')");
        expect(card).toContain('<s class="monthly-coaching-was">${MONTHLY_COACHING_COST}P</s>');
        expect(card).toContain('${was} ${MONTHLY_COACHING_FIRST_COST}P로 받기');
        expect(card).not.toContain('다음부터');
    });

    it('stops before the AI when points or records are short, and never sells twice a month', () => {
        expect(MONTHLY_COACHING_MIN_RECORDED_DAYS).toBe(7);
        expect(decideCoachingPurchase({ coins: 299, recordedDays: 20, price: 300 }).reason).toBe('not_enough_points');
        expect(decideCoachingPurchase({ coins: 400, recordedDays: 20, price: 500 }).reason).toBe('not_enough_points');
        expect(decideCoachingPurchase({ coins: 500, recordedDays: 6, price: 300 }).reason).toBe('not_enough_days');
        expect(decideCoachingPurchase({ coins: 500, recordedDays: 7, price: 500 }).ok).toBe(true);
        expect(decideCoachingPurchase({ existing: true, coins: 9999, recordedDays: 28 }).reason).toBe('already_bought');
    });
});

describe('monthly coaching summary', () => {
    it('reads four weeks into weekly numbers, leaving unrecorded weeks empty', () => {
        const logs = [
            day('2026-10-26', { metrics: { weight: 70 }, dietAnalysis: { breakfast: { grade: 'A' } } }),
            day('2026-11-22', { metrics: { weight: 68 }, steps: { count: 8000 }, sleepAndMind: { sleepHours: 7 } }),
            day('2026-11-23', { exercise: { cardioList: [{ aiAnalysis: { durationMinutes: 30 } }] } }),
            day('2026-10-01'),
        ];
        const summary = summarizeCoachingLogs(logs, { todayStr: '2026-11-23' });
        expect(summary.from).toBe('2026-10-27');
        expect(summary.recordedDays).toBe(2);
        expect(summary.weekly).toHaveLength(4);
        expect(summary.weekly[0].weightAvg).toBeNull();
        expect(summary.weekly[3]).toMatchObject({ weightAvg: 68, stepsAvg: 8000, sleepHoursAvg: 7, exerciseDays: 1, exerciseMinutes: 30 });
    });

    // 2026-11-23 식단 등급 S~F(체크 5개). 2판은 체크 수로, 옛 등급은 같은 0~5 눈금으로 읽는다. 간식은 빼고.
    it('scores meals by the five diet checks, old grades on the same scale', () => {
        const pass = (n) => Object.fromEntries(['vegetables', 'protein', 'ultraprocessed', 'carbs', 'sodium'].map((k, i) => [k, i < n]));
        const logs = [
            day('2026-11-20', { dietAnalysis: {
                breakfast: { version: 2, mealType: 'meal', checks: pass(5) },
                lunch: { version: 2, mealType: 'meal', checks: pass(3) },
                snack: { version: 2, mealType: 'snack', checks: pass(0) },
            } }),
            day('2026-11-19', { dietAnalysis: { dinner: { grade: 'A' } } }),
        ];
        const summary = summarizeCoachingLogs(logs, { todayStr: '2026-11-23' });
        expect(summary.weekly[3].dietScoreAvg).toBe(4);
        expect(summary.dietScoredMeals).toBe(3);
        expect(summary.dietCheckedMeals).toBe(2);
        expect(summary.dietMissedChecks).toEqual({ vegetables: 0, protein: 0, ultraprocessed: 0, carbs: 1, sodium: 1 });
    });

    it('refuses a thin AI answer so the member is not charged for it', () => {
        expect(normalizeCoachingReport({ headline: '', summary: 'x', wins: ['a'], nextSteps: [{ title: 't', how: 'h' }] })).toBeNull();
        expect(normalizeCoachingReport({ headline: 'h', summary: 's', wins: ['a', 'b', 'c', 'd'], nextSteps: [{ title: 't', how: 'h' }], doctorDraft: '초안' }))
            .toMatchObject({ wins: ['a', 'b', 'c'], doctorDraft: '초안', caution: null });
    });
});

describe('monthly coaching wiring', () => {
    const server = readRepoFile('functions/monthly-coaching.js');
    const buy = server.slice(server.indexOf('exports.buyMonthlyCoaching'), server.indexOf('async function assertAdmin'));

    it('writes the letter before it takes the points', () => {
        expect(buy.indexOf('await writeCoachingLetter(')).toBeGreaterThan(0);
        expect(buy.indexOf('await writeCoachingLetter(')).toBeLessThan(buy.indexOf('db.runTransaction('));
        expect(buy).toContain('FieldValue.increment(-price)');
        expect(buy).toContain('const price = coachingPriceFor(freshLatest ? 1 : 0);');
        expect(buy).toContain('if (freshLatest && !canBuyCoachingOn(todayStr, freshLatest.periodEnd))');
    });

    it('keeps the AI draft for Dr. Choi out of the member letter', () => {
        expect(MONTHLY_COACHING_DOCTOR_DAYS).toBe(3);
        expect(buy).toContain('const { doctorDraft, ...coachLetter } = letter;');
        expect(buy).toContain('doctor: { status: "pending", dueBy: doctorDueBy }');
        expect(buy).toContain('doctorDraft: doctorDraft || ""');
    });

    it('sends the doctor note only from an admin, through the dashboard note too', () => {
        const send = server.slice(server.indexOf('exports.sendCoachingDoctorNote'), server.indexOf('exports._test'));
        expect(send).toContain('await assertAdmin(request)');
        expect(send).toContain('adminFeedback: note');
        expect(send).toContain('draftKey: "monthly_coaching"');
        expect(readRepoFile('admin.html')).toContain("httpsCallable(fns, 'sendCoachingDoctorNote')");
    });

    it('lets only the server write letters, and the member read their own', () => {
        const rules = readRepoFile('firestore.rules');
        const block = rules.slice(rules.indexOf('match /coachingReports/{reportId}'), rules.indexOf('// ===== Push Tokens'));
        expect(block).toContain('allow read: if isOwner(userId) || isAdmin();');
        expect(block).toContain('allow write: if false;');
    });

    it('shows in the control tower ledger in Korean with the points spent', () => {
        expect(readRepoFile('admin.html')).toContain("monthly_coaching: '해빛 코칭',");
        const helper = readRepoFile('functions/runtime.js').split('function adminTxPointsDelta(')[1].split('\n}\n')[0];
        expect(helper).toContain('row.type === "monthly_coaching"');
    });

    it('is exported and starts fast', () => {
        const index = readRepoFile('functions/index.js');
        expect(index).toContain('buyMonthlyCoaching: "./monthly-coaching"');
        expect(index).toContain('getCoachingReviewQueue,');
        expect(index).toContain('sendCoachingDoctorNote,');
        expect(readRepoFile('sw.js')).toContain("'./js/monthly-coaching.js?v=");
    });
});

// 2026-11-25 대표: 앞 2주가 입학 전인 회원에게 AI 가 "3주차부터 시작", "마지막 주 급증", "지난 한 달간" 이라고 썼다.
// 대표는 "해빛스쿨 입학 후 최근 2주 기록만 있네요." 로 고쳐 보냈다.
describe('coaching prompt for members with only the last weeks recorded', () => {
    const todayStr = '2026-11-24';
    const lateLogs = ['2026-11-15', '2026-11-16', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
        '2026-11-22', '2026-11-23', '2026-11-24'].map((date) => day(date));

    it('drops the empty weeks before the first record and renumbers', () => {
        const summary = summarizeCoachingLogs(lateLogs, { todayStr });
        expect(summary.weekly.map((w) => w.recordedDays)).toEqual([0, 0, 2, 7]);
        const data = coachingPromptData(summary, { joinedDate: '2026-11-15' });
        expect(data.weekly.map((w) => [w.week, w.recordedDays])).toEqual([[1, 2], [2, 7]]);
        expect(data.recordedWeeks).toBe(2);
        expect(data.joinedRecently).toBe(true);
        expect(data.from).toBe(data.weekly[0].from);
        // 편지 화면이 쓰는 4주 원본은 건드리지 않는다.
        expect(summary.weekly).toHaveLength(4);
    });

    it('tells the AI to open the doctor draft the way the doctor does', () => {
        const prompt = buildCoachingPrompt(summarizeCoachingLogs(lateLogs, { todayStr }), 'ko', { joinedDate: '2026-11-15' });
        expect(prompt).toContain('해빛스쿨 입학 후 최근 2주 기록만 있네요.');
        expect(prompt).toContain('"한 달"');
        expect(prompt).not.toContain('"week":4');
    });

    it('does not say 입학 for a long-time member who came back', () => {
        const prompt = buildCoachingPrompt(summarizeCoachingLogs(lateLogs, { todayStr }), 'ko', { joinedDate: '2026-03-31' });
        expect(prompt).toContain('"최근 2주 기록만 있네요."');
        expect(prompt).not.toContain('입학 후');
    });

    it('adds nothing for a member with all four weeks', () => {
        const full = Array.from({ length: 28 }, (_, i) => day(new Date(Date.parse('2026-10-28T12:00:00Z') + i * 86400000).toISOString().slice(0, 10)));
        const summary = summarizeCoachingLogs(full, { todayStr });
        expect(coachingPromptData(summary, { joinedDate: '2026-03-31' }).recordedWeeks).toBe(4);
        expect(buildCoachingPrompt(summary, 'ko', { joinedDate: '2026-03-31' })).not.toContain('기록만 있네요');
    });

    it('reads the join date in Korean time from a Timestamp or a string', () => {
        expect(memberJoinedDate({ createdAt: { toMillis: () => Date.parse('2026-11-14T16:30:00Z') } })).toBe('2026-11-15');
        expect(memberJoinedDate({ createdAt: '2026-11-13T10:01:16Z' })).toBe('2026-11-13');
        expect(memberJoinedDate({})).toBe('');
    });
});
