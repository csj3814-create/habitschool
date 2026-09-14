import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEEKLY_ACTIVITY_TARGET_MINUTES, resolveDailyActivityMinutes, summarizeWeeklyActivity } from '../js/le8-score.js';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14: "운동량을 평가해 적절한 양을 제시하고 완수율을 보여준다"
// 평가는 이미 calcActivityScore 안에 있었다(주 150분, WHO·AHA). 빠진 것은 그 숫자를
// 기록하는 자리에 내보이는 일과, 자가 둘로 갈라진 것이었다.
describe('one ruler for physical activity', () => {
    it('is the WHO/AHA weekly target, named once', () => {
        expect(WEEKLY_ACTIVITY_TARGET_MINUTES).toBe(150);
        // 점수 문턱도 같은 상수를 본다 — 숫자를 손으로 적어 두면 한쪽만 바뀐다.
        expect(read('js/le8-score.js')).toContain('if (weeklyMinutes >= WEEKLY_ACTIVITY_TARGET_MINUTES) score = 100;');
    });

    it('has the analysis card measure against that target, not a daily one', () => {
        const client = read('js/diet-analysis.js');
        expect(client).toContain("import { WEEKLY_ACTIVITY_TARGET_MINUTES } from './le8-score.js");
        expect(client).toContain('weightedMinutes / WEEKLY_ACTIVITY_TARGET_MINUTES');
        // 하루 30분짜리 두 번째 자는 없어져야 한다.
        expect(client).not.toContain('recommendedDailyProgress');
        expect(read('functions/runtime.js')).not.toContain('"recommendedDailyProgress"');
    });

    it('weights intensity the same way on both sides', () => {
        const le8 = read('js/le8-score.js');
        const runtime = read('functions/runtime.js');
        for (const pair of ["'저강도': 0.5", "'중강도': 1", "'고강도': 2", "'초고강도': 3"]) {
            expect(le8).toContain(pair);
            expect(runtime).toContain(pair.split("'").join('"'));
        }
    });

    it('does the goal arithmetic on the server, not in the model', () => {
        // 모델에게 달성률을 시키면 지어낸 숫자가 그대로 점수가 된다.
        const norm = read('functions/runtime.js').split('function normalizeExerciseAnalysis(')[1].split('\n}\n')[0];
        expect(norm).toContain('durationMinutes * (EXERCISE_INTENSITY_MINUTE_WEIGHTS[intensity] || 1)');
        expect(norm).toContain('durationMinutes !== null');
    });
});

describe('one rule for daily minutes, read by two windows', () => {
    it('counts health-app minutes when the app gives them', () => {
        const day = resolveDailyActivityMinutes({ steps: { active_minutes: 42, count: 12000 } });
        expect(day.minutes).toBe(42);
        expect(day.usedHealthApp).toBe(true);
        expect(day.hasSignal).toBe(true);
    });

    it('subtracts everyday walking from the step count', () => {
        // 4000보는 일상 이동으로 보고 뺀다. 분당 100보.
        expect(resolveDailyActivityMinutes({ steps: { count: 8000 } }).minutes).toBe(40);
        expect(resolveDailyActivityMinutes({ steps: { count: 3000 } }).minutes).toBe(0);
    });

    it('uses the minutes the AI actually read from the photo', () => {
        const day = resolveDailyActivityMinutes({
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 60 } }] }
        });
        expect(day.minutes).toBe(60);
    });

    it('falls back to the old estimate when nothing was read', () => {
        // 예전 기록에는 aiAnalysis 가 없다. 30분 추정이 그대로 살아 있어야 한다.
        const day = resolveDailyActivityMinutes({ exercise: { cardioList: [{}], strengthList: [{}] } });
        expect(day.minutes).toBe(60);
    });

    it('caps what one day of photos can claim', () => {
        const day = resolveDailyActivityMinutes({
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 600 } }] }
        });
        expect(day.minutes).toBe(120);
    });

    it('never adds steps and photos of the same walk together', () => {
        const day = resolveDailyActivityMinutes({
            steps: { count: 14000 },
            exercise: { cardioList: [{ aiAnalysis: { weightedMinutes: 30 } }] }
        });
        expect(day.minutes).toBe(100);
    });

    it('says "unknown", not "zero", when there is no record at all', () => {
        expect(resolveDailyActivityMinutes(null).hasSignal).toBe(false);
        expect(resolveDailyActivityMinutes({}).minutes).toBe(0);
    });
});

describe('the weekly bar tells you what today asks of you', () => {
    const weekStrs = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

    it('divides what is left by the days that are left', () => {
        // 남은 양 ÷ 남은 일수가 곧 처방이다.
        const summary = summarizeWeeklyActivity(
            [{ date: '2026-09-14', steps: { count: 8000 } }],
            { todayStr: '2026-09-16', weekStrs }
        );
        expect(summary.weeklyMinutes).toBe(40);
        expect(summary.targetMinutes).toBe(150);
        expect(summary.percent).toBe(27);
        expect(summary.remainingMinutes).toBe(110);
        // 수(오늘)부터 일요일까지 5일. 오늘도 아직 할 수 있는 날이다.
        expect(summary.daysLeft).toBe(5);
        expect(summary.perDayNeeded).toBe(22);
        expect(summary.met).toBe(false);
    });

    it('stops at 100% and says it is done', () => {
        const summary = summarizeWeeklyActivity(
            weekStrs.map((date) => ({ date, steps: { count: 12000 } })),
            { todayStr: '2026-09-20', weekStrs }
        );
        expect(summary.met).toBe(true);
        expect(summary.percent).toBe(100);
        expect(summary.remainingMinutes).toBe(0);
    });

    it('marks each day so the week reads at a glance', () => {
        const summary = summarizeWeeklyActivity(
            [{ date: '2026-09-14', steps: { count: 9000 } }],
            { todayStr: '2026-09-15', weekStrs }
        );
        expect(summary.days).toHaveLength(7);
        expect(summary.days[0].minutes).toBe(50);
        expect(summary.days[1].isToday).toBe(true);
        expect(summary.days[1].isFuture).toBe(false);
        expect(summary.days[2].isFuture).toBe(true);
    });

    it('holds up on an empty week without dividing by zero', () => {
        const summary = summarizeWeeklyActivity([], { todayStr: '2026-09-20', weekStrs });
        expect(summary.weeklyMinutes).toBe(0);
        expect(summary.percent).toBe(0);
        expect(summary.daysLeft).toBe(1);
        expect(summary.perDayNeeded).toBe(150);
    });
});

describe('the weekly bar sits where the recording happens', () => {
    const app = read('js/app-core.js');

    it('is at the top of the exercise tab', () => {
        const html = read('index.html');
        const tab = html.indexOf('<div id="exercise" class="content-section">');
        const card = html.indexOf('id="weekly-activity-card"');
        const guide = html.indexOf('data-record-guide="exercise"');
        expect(card).toBeGreaterThan(tab);
        expect(card).toBeLessThan(guide);
    });

    it('refreshes when the tab opens and after a save lands', () => {
        expect(app).toContain("if (resolvedTabName === 'exercise' && user) {");
        expect(app).toContain('refreshWeeklyActivityCard();');
        expect(app.split('refreshWeeklyActivityCard({ force: true });').length - 1).toBe(2);
    });

    it('does not block recording when it cannot load', () => {
        const fn = app.split('async function refreshWeeklyActivityCard(')[1].split('\n}\n')[0];
        expect(fn).toContain('.catch(');
        expect(fn).toContain('console.warn(');
        expect(fn).not.toContain('showToast(');
    });

    it('does not nag a week that is already met', () => {
        const fn = app.split('function renderWeeklyActivityCard(')[1].split('\n}\n')[0];
        expect(fn).toContain('const guide = met');
        expect(fn).toContain('남은 날은 덤입니다');
        expect(fn).toContain('하루 ${perDayNeeded}분씩이면 채워요');
    });
});
