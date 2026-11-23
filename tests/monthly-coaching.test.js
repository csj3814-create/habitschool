import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import {
    MONTHLY_COACHING_COST as CLIENT_COST,
    MONTHLY_COACHING_FIRST_COST as CLIENT_FIRST_COST,
    describeCoachingCard
} from '../js/monthly-coaching-core.js';

const require = createRequire(import.meta.url);
const {
    MONTHLY_COACHING_COST,
    MONTHLY_COACHING_FIRST_COST,
    MONTHLY_COACHING_MIN_RECORDED_DAYS,
    MONTHLY_COACHING_DOCTOR_DAYS,
    coachingPriceFor,
    decideCoachingPurchase,
    normalizeCoachingReport,
    summarizeCoachingLogs
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
        expect(describeCoachingCard({ reports: [], monthKey: '2026-11' })).toMatchObject({ price: 300, firstTime: true });
        expect(describeCoachingCard({ reports: [{ month: '2026-10' }], monthKey: '2026-11' })).toMatchObject({ price: 500, firstTime: false, boughtThisMonth: false });
        expect(describeCoachingCard({ reports: [{ month: '2026-11', doctor: { status: 'sent' } }], monthKey: '2026-11' }))
            .toMatchObject({ boughtThisMonth: true, doctorArrived: true });
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
        expect(buy).toContain('const price = coachingPriceFor(previous.size);');
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
        const block = rules.slice(rules.indexOf('match /coachingReports/{monthKey}'), rules.indexOf('// ===== Push Tokens'));
        expect(block).toContain('allow read: if isOwner(userId) || isAdmin();');
        expect(block).toContain('allow write: if false;');
    });

    it('is exported and starts fast', () => {
        const index = readRepoFile('functions/index.js');
        expect(index).toContain('buyMonthlyCoaching: "./monthly-coaching"');
        expect(index).toContain('getCoachingReviewQueue,');
        expect(index).toContain('sendCoachingDoctorNote,');
        expect(readRepoFile('sw.js')).toContain("'./js/monthly-coaching.js?v=");
    });
});
