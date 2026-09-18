import { describe, expect, it } from 'vitest';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_GAP_MAX_TARGET_DAYS as MAX_TARGET,
} from '../js/admin-utils.js';

const TODAY = '2026-09-18';
const day = (offset) => new Date(new Date(`${TODAY}T12:00:00Z`).getTime() - offset * 86400000)
    .toISOString().slice(0, 10);

const DIET = { diet: { breakfastUrl: 'x' } };
const STEPS = { steps: { count: 17524 } };
const SLEEP = { sleepAndMind: { sleepHours: 7 } };

const gapDraft = (logs) => buildAdminPrescriptionDrafts({ logs, todayStr: TODAY })
    .find((d) => d.key.includes('gap'));

// 두 달 전 기록 하나로 '들어오신 지 2주' 문턱을 넘긴다. 최근 7일 밖이라
// 기록 유무 집계에는 들어가지 않는다.
const settled = (recent) => [{ date: day(60), ...DIET }, ...recent];

// 화면의 그 회원: 최근 7일에 식단 5일, 걸음수 하루(09-15), 수면 0일.
const MEMBER = settled([
    { date: day(1), ...DIET },
    { date: day(2), ...DIET },
    { date: day(3), ...DIET, ...STEPS },
    { date: day(4), ...DIET },
    { date: day(6), ...DIET },
]);

// 2026-09-18 지적: "운동과 수면이 다 기록이 없는데 운동하라는 권유는 없고
// 수면 기록 권유만 있네? 이유가 있나?"
//
// 걸음수가 운동 기록으로 세어져 운동은 1일이었다. 규칙은 '정확히 0일' 만
// 대상으로 삼았으므로 1일은 0일도 아니고 사흘도 아닌 중간에 걸려 아무 데도
// 들지 못했다. 0일에서 1일로 올라선 그때부터 조용해지는 셈이었다.
describe('an area with a single day still gets a word', () => {
    it('takes one day as a target, not as silence', () => {
        expect(MAX_TARGET).toBe(1);
        const exerciseOnly = settled([
            { date: day(1), ...DIET, ...SLEEP },
            { date: day(2), ...DIET, ...SLEEP },
            { date: day(3), ...DIET, ...SLEEP, ...STEPS },
            { date: day(4), ...DIET, ...SLEEP },
        ]);
        const draft = gapDraft(exerciseOnly);
        expect(draft.key).toBe('gap-exercise');
    });

    it('speaks to the emptier area first when both are thin', () => {
        // 화면의 회원은 운동 1일 · 수면 0일이었다. 0일 쪽을 먼저 말한다.
        expect(gapDraft(MEMBER).key).toBe('gap-sleep');
    });

    it('scores a started area below an untouched one', () => {
        const started = gapDraft(settled([
            { date: day(1), ...DIET, ...SLEEP },
            { date: day(2), ...DIET, ...SLEEP },
            { date: day(3), ...DIET, ...SLEEP, ...STEPS },
        ]));
        const untouched = gapDraft(settled([
            { date: day(1), ...DIET, ...SLEEP },
            { date: day(2), ...DIET, ...SLEEP },
            { date: day(3), ...DIET, ...SLEEP },
        ]));
        expect(started.key).toBe('gap-exercise');
        expect(untouched.key).toBe('gap-exercise');
        expect(started.score).toBeLessThan(untouched.score);
    });

    it('still says nothing when no area is strong enough to stand on', () => {
        // 셋 다 얇으면 근거로 삼을 것이 없다. 2주 문턱과 함께, 새로 오신 분을
        // 지키는 두 번째 울타리다.
        expect(gapDraft(settled([{ date: day(1), ...DIET }, { date: day(2), ...STEPS }]))).toBeUndefined();
    });
});

// 2026-09-18 지시: "메세지는 운동 기록을 하면 더 좋아진다는 긍정 피드백
// 방향으로 하자."
describe('the message asks for one more, it does not count what is missing', () => {
    const started = () => gapDraft(settled([
        { date: day(1), ...DIET, ...SLEEP },
        { date: day(2), ...DIET, ...SLEEP },
        { date: day(3), ...DIET, ...SLEEP, ...STEPS },
    ]));

    it('names the day they already did instead of calling it empty', () => {
        const draft = started();
        expect(draft.message).toContain('운동도 하루 남기셨습니다');
        expect(draft.message).toContain('며칠만 더 이어가시면');
        expect(draft.label).toContain('이어가기');
    });

    it('leads with what they are doing when the area is untouched', () => {
        const draft = gapDraft(MEMBER);
        expect(draft.message).toContain('식단은 5일 남기셨습니다');
        expect(draft.message).toContain('꾸준하십니다');
        expect(draft.message).toContain('여기에 수면 기록이 더해지면');
    });

    it('never tells a member what they failed to do', () => {
        for (const draft of [started(), gapDraft(MEMBER)]) {
            for (const nag of ['한 번도', '없습니다', '낮게 잡히니', '비어 있습니다']) {
                expect(draft.message + draft.summary, nag).not.toContain(nag);
            }
        }
    });

    it('promises a score that rises, not one that is being docked', () => {
        expect(gapDraft(MEMBER).message).toContain('건강 점수도 하시는 만큼 올라갑니다');
    });

    it('picks the particle by the name it is attached to', () => {
        // 식단은 / 운동은 이 아니라 운동도, 수면은 아니라 수면까지 — 조사가
        // 어색하면 대신 써 준 티가 난다.
        expect(gapDraft(MEMBER).message).toContain('식단은 5일');
        expect(started().message).toMatch(/식단은 \d일, 운동도 하루/);
    });
});

// 관제탑 쪽. 근거 줄에 강한 영역과 빈 영역만 적혀 있어서 "운동은 왜 그냥
// 넘어갔지?" 를 화면에서 알 수 없었다.
describe('the evidence line shows all three areas', () => {
    it('counts every area, including the one in the middle', () => {
        expect(gapDraft(MEMBER).evidence).toBe('최근 7일 · 식단 5일 / 운동 1일 / 수면 0일');
    });
});
