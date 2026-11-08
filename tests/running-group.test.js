import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    DEFAULT_HABIT_GROUPS,
    EXERCISE_GROUP_REWARD_TARGET,
    RUNBICKERS_GROUP_ID,
    evaluateRunningRecord,
    getHabitGroupByLinkSlug,
    getHabitGroupRecordStatus,
    getHabitGroupRules,
    summarizeHabitGroupProgress
} from '../js/habit-groups.js';

const require = createRequire(import.meta.url);
const server = require('../functions/running-group.js');
const read = (path) => readFileSync(resolve(path), 'utf8');

const REQUIREMENT = { kind: 'running', minKm: 1, maxPaceMinPerKm: 12 };
const run = (distanceKm, durationMinutes, exerciseType = '달리기', extra = {}) => ({
    imageUrl: 'https://example.test/run.jpg',
    imageThumbUrl: 'https://example.test/run_thumb.jpg',
    aiAnalysis: { isExercise: true, exerciseType, distanceKm, durationMinutes },
    ...extra
});

const CASES = [
    ['5km 30분', { cardioList: [run(5, 30)] }, true, ''],
    ['딱 1km, 딱 12분', { cardioList: [run(1, 12)] }, true, ''],
    ['러닝머신도 달리기', { cardioList: [run(3, 20, '러닝머신')] }, true, ''],
    ['영어 분석 결과', { cardioList: [run(3, 20, 'running')] }, true, ''],
    ['시간은 회원이 적은 값으로', { cardioList: [{ ...run(3, null), durationMinutes: 20 }] }, true, ''],
    ['1km 미만', { cardioList: [run(0.9, 6)] }, false, 'short'],
    ['12분/km 보다 느림', { cardioList: [run(2, 25)] }, false, 'slow'],
    ['걷기는 빨라도 달리기가 아님', { cardioList: [run(2, 20, '걷기')] }, false, 'not_running'],
    ['거리를 못 읽음', { cardioList: [run(null, 30)] }, false, 'unread'],
    ['사람이 낼 수 없는 빠르기는 잘못 읽은 것', { cardioList: [run(30, 30)] }, false, 'unread'],
    ['분석이 아직 없음', { cardioList: [{ imageUrl: 'https://example.test/a.jpg' }] }, false, 'no_analysis'],
    ['사진 없이 분석만 있음', { cardioList: [{ aiAnalysis: run(5, 30).aiAnalysis }] }, false, 'no_analysis'],
    ['운동 기록 없음', {}, false, 'no_record'],
    ['여러 건을 더하지 않음', { cardioList: [run(0.5, 3), run(0.5, 3)] }, false, 'short'],
    ['여러 건 중 하나가 넘으면 인증', { cardioList: [run(0.5, 3), run(2, 12)] }, true, ''],
];

describe('running group check-in rule', () => {
    it.each(CASES)('%s', (_name, exercise, qualified, reason) => {
        const result = evaluateRunningRecord(exercise, REQUIREMENT);
        expect(result.qualified).toBe(qualified);
        expect(result.reason).toBe(reason);
    });

    it('gives the same answer in the app and on the server', () => {
        CASES.forEach(([, exercise]) => {
            expect(server.evaluateRunningRecord(exercise, REQUIREMENT)).toEqual(evaluateRunningRecord(exercise, REQUIREMENT));
        });
    });

    it('keeps the fastest legal pace and the point of the rule in the numbers it returns', () => {
        expect(evaluateRunningRecord({ cardioList: [run(5, 30)] }, REQUIREMENT)).toMatchObject({
            distanceKm: 5,
            durationMinutes: 30,
            paceMinPerKm: 6,
            imageThumbUrl: 'https://example.test/run_thumb.jpg'
        });
    });
});

describe('Runbickers group rules', () => {
    it('uses the rules the owner decided', () => {
        expect(getHabitGroupRules(RUNBICKERS_GROUP_ID)).toEqual({
            entryFeePoints: 200,
            rewardTarget: 14,
            rewardPoints: 1000,
            windowDays: 28
        });
    });

    // 2026-11-08 대표 결정: 다른 소모임도 같은 4주 규칙이다.
    it('puts the other groups on the same four-week rules', () => {
        expect(getHabitGroupRules('exercise-running-club')).toEqual({
            entryFeePoints: 200,
            rewardTarget: EXERCISE_GROUP_REWARD_TARGET,
            rewardPoints: 1000,
            windowDays: 28
        });
        expect(EXERCISE_GROUP_REWARD_TARGET).toBe(14);
    });

    it('counts progress against the group target', () => {
        const summary = summarizeHabitGroupProgress({ groupId: RUNBICKERS_GROUP_ID, submittedDates: ['2026-11-07'] }, '2026-11-07');
        expect(summary.target).toBe(14);
        expect(summary.remainingCount).toBe(13);
        expect(summary.rewardPoints).toBe(1000);
    });

    it('reads a record through the running rule, not the any-exercise rule', () => {
        const group = DEFAULT_HABIT_GROUPS.find(item => item.id === RUNBICKERS_GROUP_ID);
        const walking = { exercise: { cardioList: [run(2, 20, '걷기')] } };
        expect(getHabitGroupRecordStatus(group, walking)).toMatchObject({ complete: false, reason: 'not_running' });
        expect(getHabitGroupRecordStatus('exercise-running-club', walking).complete).toBe(true);
    });

    it('resolves the link name only for a group that has one', () => {
        expect(getHabitGroupByLinkSlug('RunBickers')?.id).toBe(RUNBICKERS_GROUP_ID);
        expect(getHabitGroupByLinkSlug('exercise-running-club')).toBeNull();
        expect(getHabitGroupByLinkSlug('')).toBeNull();
    });
});

describe('Runbickers group wiring', () => {
    const runtime = read('functions/runtime.js');
    const app = read('js/app-core.js');
    const css = read('styles-guest-demo.css');

    it('has the same rules on the server as in the app', () => {
        expect(runtime).toContain('id: "exercise-runbickers"');
        expect(runtime).toContain('rules: { entryFeePoints: 200, rewardTarget: 14, rewardPoints: 1000, windowDays: 28 }');
        expect(runtime).toContain('requirement: { kind: "running", minKm: 1, maxPaceMinPerKm: 12 }');
    });

    it('pays the reward by the group rule, not the fixed 100', () => {
        const trigger = runtime.slice(runtime.indexOf('exports.onHabitGroupCheckinWritten'), runtime.indexOf('async function writeRunningGroupCheckin'));
        expect(trigger).toContain('const shouldPay = progress.approvedCount >= rules.rewardTarget');
        expect(trigger).toContain('coins: FieldValue.increment(rules.rewardPoints)');
        expect(trigger).not.toContain('EXERCISE_GROUP_REWARD_TARGET');
    });

    it('lets the server, not the member, write running check-ins', () => {
        // 규칙의 회원 쓰기 허용 목록에 넣지 않는다.
        const rules = read('firestore.rules');
        const allowed = rules.slice(rules.indexOf('function isExerciseHabitGroupId'), rules.indexOf('function isHabitGroupLeader'));
        expect(allowed).not.toContain('exercise-runbickers');
        expect(app).toContain("if (group.requirement?.kind === 'running') {");
        expect(runtime).toContain('exports.syncRunningGroupCheckin = onDocumentWritten(');
    });

    it('still lets a member read their own running check-in before it exists', () => {
        const rules = read('firestore.rules');
        expect(rules).toContain("checkinId.matches('^exercise-[a-z0-9-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_' + request.auth.uid + '$')");
        expect(`${RUNBICKERS_GROUP_ID}_2026-11-07_uid`).toMatch(/^exercise-[a-z0-9-]+_[0-9]{4}-[0-9]{2}-[0-9]{2}_uid$/);
    });

    it('shows the card to anyone in a group, however few records they have', () => {
        expect(css).toContain('#dashboard[data-lifecycle="first"] .dashboard-extra-stack > :not(.mission-card-enhanced):not(.is-member-visible)');
        expect(css).toContain('#dashboard[data-lifecycle="repeat"] .social-challenge-dashboard-card:not(.is-member-visible)');
        expect(css).toContain('#dashboard[data-lifecycle="forming"] .social-challenge-dashboard-card:not(.is-member-visible)');
        expect(app).toContain('else revealHabitGroupCardForMember(user)');
    });

    it('checks the account age when the code comes from the group screen', () => {
        expect(runtime).toContain('request.data?.source === "habit_group"');
        expect(runtime).toContain('14 * 86400000');
    });
});
