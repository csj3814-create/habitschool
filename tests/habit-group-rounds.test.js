import { describe, expect, it } from 'vitest';
import { isHabitGroupRoundOver, summarizeHabitGroupProgress } from '../js/habit-groups.js';
import { readAppSource, readFunctionsSource } from './source-helpers.js';

const RUNTIME = readFunctionsSource();
const APP = readAppSource();

const serverFn = (name) => {
    const start = RUNTIME.indexOf(`function ${name}(`);
    expect(start).toBeGreaterThan(-1);
    return RUNTIME.slice(start, RUNTIME.indexOf('\n}\n', start) + 2);
};
const exportBody = (name) => RUNTIME.split(`exports.${name} = onCall(`)[1].split('\n);\n')[0];

// 2026-10-03 제보: "소모임 기간 종료가 지났는데 계속 떠있네? 마무리하고 결과 알려주고
// 리워드 확인하는 절차가 나오고, 새로 소모임을 시작하는 절차가 필요하겠어."
describe('a habit group runs in rounds: finish one, start the next', () => {
    const ledgerId = new Function(`${serverFn('getHabitGroupRoundLedgerId')} return getHabitGroupRoundLedgerId;`)();
    const roundOver = new Function('getCurrentKstDateString', `${serverFn('isHabitGroupRoundOver')} return isHabitGroupRoundOver;`)(() => '2026-10-06');

    it('keeps the first round on the old ledger ids, so paid rewards stay linked', () => {
        expect(ledgerId('reward', 'exercise-home-training', 'u1', {})).toBe('exercise_group_reward_exercise-home-training_u1');
        expect(ledgerId('reward', 'exercise-home-training', 'u1', { round: 1, startedDate: '2026-06-04' }))
            .toBe('exercise_group_reward_exercise-home-training_u1');
    });

    it('gives later rounds their own ids, so a second reward can be paid', () => {
        expect(ledgerId('reward', 'g', 'u1', { round: 2, startedDate: '2026-10-06' })).toBe('exercise_group_reward_g_u1_2026-10-06');
        expect(ledgerId('entry', 'g', 'u1', { round: 3, startedDate: '2027-02-10' })).toBe('exercise_group_entry_g_u1_2027-02-10');
    });

    it('calls a round over when its window passed, its reward was paid or it was finished', () => {
        expect(roundOver({ windowEndDate: '2026-10-01', rewardStatus: 'in_progress' })).toBe(true);
        expect(roundOver({ windowEndDate: '2026-12-01', rewardStatus: 'paid' })).toBe(true);
        expect(roundOver({ windowEndDate: '2026-12-01', finishedAt: { seconds: 1 } })).toBe(true);
        expect(roundOver({ windowEndDate: '2026-12-01', rewardStatus: 'in_progress' })).toBe(false);
        expect(roundOver({ windowEndDate: '2026-10-06', rewardStatus: 'in_progress' })).toBe(false); // 마지막 날은 아직
    });

    it('finishes only a round that is over, keeps its result and frees the slot', () => {
        const fn = exportBody('finishHabitGroup');
        expect(fn).toContain('if (!isHabitGroupRoundOver(progress, todayStr)) {');
        expect(fn).toContain('tx.set(progressRef.collection("rounds").doc(');
        expect(fn).toContain('active: false,');
        expect(fn).toContain('rewardStatus: rewardPaid ? "paid" : "expired",');
    });

    it('starts a fresh 120 days, with a fresh entry fee, when someone rejoins after a round ended', () => {
        const fn = exportBody('joinHabitGroup');
        expect(fn).toContain('const startsNewRound = !alreadyActive && !!previousProgress && isHabitGroupRoundOver(previousProgress, todayStr);');
        expect(fn).toContain('if (!progressSnap.exists || startsNewRound) {');
        expect(fn).toContain('|| (!startsNewRound && (existingMember.entryFeePaid === true');
        // 마무리를 누르지 않고 다시 들어와도 지난 바퀴가 남는다.
        expect(fn).toContain('if (startsNewRound && !previousProgress.finishedAt) {');
    });

    it('shows an ended round with its result and a finish button instead of "기록하기"', () => {
        const today = '2026-10-06';
        const expired = summarizeHabitGroupProgress({ startedDate: '2026-06-04', windowEndDate: '2026-10-01', approvedDates: [] }, today);
        const paidEarly = summarizeHabitGroupProgress({ startedDate: '2026-09-01', windowEndDate: '2026-12-29', rewardStatus: 'paid' }, today);
        const running = summarizeHabitGroupProgress({ startedDate: '2026-09-01', windowEndDate: '2026-12-29' }, today);
        expect(isHabitGroupRoundOver(expired)).toBe(true);
        expect(isHabitGroupRoundOver(paidEarly)).toBe(true);
        expect(isHabitGroupRoundOver(running)).toBe(false);

        expect(APP).toContain('if (roundOver) {\n        return buildFinishedHabitGroupRow(group, progressSummary);');
        const row = APP.split('function buildFinishedHabitGroupRow(')[1].split('\n}\n')[0];
        expect(row).toContain(`onclick="finishHabitGroup('\${group.id}')">마무리하기</button>`);
        expect(row).not.toContain('기록하기');
        expect(APP).toContain("const fn = httpsCallable(functions, 'finishHabitGroup');");
    });
});
