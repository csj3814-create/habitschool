import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 요청: "30일 요약도 새로운 기능들에 맞춰서 업그레이드 필요할 것 같은데?"
//
// 결과지는 포인트·참여율·연속·체중/혈당/혈압에서 멈춰 있었다. 그 뒤로 만든 것이
// 하나도 들어가 있지 않았다 — 운동 시간(v401), 운동 영상 분석(v410), 수면 시간과
// 수면 분석, 걸음수. 매일 쌓고 있는데 한 달을 돌아볼 때는 보이지 않았다.

const APP = readRepoFile('js/app-core.js');
const LE8 = readRepoFile('js/le8-score.js');
const NL = String.fromCharCode(10);

function loadSummary() {
    const start = APP.indexOf('function summarizeReportActivity(logs = []) {');
    const end = APP.indexOf('const REPORT_DIET_AXIS_LABELS', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    // 운동 분은 주간 카드와 같은 함수로 세야 한다. 시험도 진짜 그 함수를 쓴다.
    const le8Body = LE8
        .slice(0, LE8.indexOf('export function summarizeWeeklyActivity'))
        .split(NL)
        .filter((line) => !line.startsWith('import '))
        .join(NL)
        .split('export ')
        .join('');

    return Function(`${le8Body}
        ${APP.slice(start, end)}
        return summarizeReportActivity;`)();
}

const day = (date, extra = {}) => ({ date, userId: 'u1', ...extra });

describe('the 30-day report counts what the app now records', () => {
    const summarize = loadSummary();

    it('reports steps, and says nothing rather than zero when there are none', () => {
        const withSteps = summarize([
            day('2026-09-20', { steps: { count: 8000 } }),
            day('2026-09-21', { steps: { count: 4000 } }),
        ]);
        expect(withSteps.steps.days).toBe(2);
        expect(withSteps.steps.average).toBe(6000);
        expect(withSteps.steps.best).toBe(8000);

        // 기록하지 않은 것과 0보는 다른 일이다.
        const none = summarize([day('2026-09-21')]);
        expect(none.steps.days).toBe(0);
        expect(none.steps.average).toBe(null);
    });

    it('reports sleep hours in a unit a person reads', () => {
        const s = summarize([
            day('2026-09-19', { sleepAndMind: { sleepHours: 3.666666 } }),
            day('2026-09-20', { sleepAndMind: { sleepHours: 9 } }),
            day('2026-09-21', { sleepAndMind: { sleepHours: 7.5 } }),
        ]);
        expect(s.sleep.days).toBe(3);
        expect(s.sleep.shortest).toBe(3.7);
        expect(s.sleep.longest).toBe(9);
        expect(s.sleep.average).toBe(6.7);
    });

    it('counts exercise minutes the same way the weekly card does', () => {
        // 일상 이동분 4000보를 뺀 나머지를 분당 100보로 본다(le8-score).
        // 두 화면이 기준을 따로 가지면 같은 기간이 다른 숫자로 보인다.
        const s = summarize([day('2026-09-21', { steps: { count: 10000 } })]);
        expect(s.exercise.minutes).toBe(60);
        expect(s.exercise.bestDayMinutes).toBe(60);
        expect(s.exercise.targetMinutes).toBe(150);
        expect(s.exercise.stretchMinutes).toBe(300);
    });

    it('turns the total into the weekly figure the member knows', () => {
        // 하루 60분이 열흘이면 주 평균 420분이다.
        const logs = Array.from({ length: 10 }, (_, i) =>
            day(`2026-09-${String(12 + i).padStart(2, '0')}`, { steps: { count: 10000 } }));
        const s = summarize(logs);
        expect(s.exercise.minutes).toBe(600);
        expect(s.exercise.weeklyAverage).toBe(420);
    });

    it('groups the exercise analyses by intensity', () => {
        const s = summarize([
            day('2026-09-20', { exercise: { cardioList: [{ aiAnalysis: { intensity: '중강도' } }] } }),
            day('2026-09-21', { exercise: { strengthList: [
                { aiAnalysis: { intensity: '고강도' } },
                { aiAnalysis: { intensity: '중강도' } },
            ] } }),
        ]);
        expect(s.exercise.analyzed).toBe(3);
        expect(Object.fromEntries(s.exercise.intensity)).toEqual({ 중강도: 2, 고강도: 1 });
    });

    it('groups the sleep analyses by grade', () => {
        const s = summarize([
            day('2026-09-19', { sleepAndMind: { sleepAnalysis: { grade: 'A' } } }),
            day('2026-09-20', { sleepAndMind: { sleepAnalysis: { grade: 'C' } } }),
            day('2026-09-21', { sleepAndMind: { sleepAnalysis: { grade: 'A' } } }),
        ]);
        expect(s.sleep.analyzed).toBe(3);
        expect(Object.fromEntries(s.sleep.grades)).toEqual({ A: 2, C: 1 });
    });

    it('averages the four nutrition axes across every scored meal', () => {
        const scores = (n) => ({ minerals: n, fiber: n, vitamins: n, antioxidants: n });
        const s = summarize([
            day('2026-09-21', { dietAnalysis: { breakfast: { scores: scores(60) }, lunch: { scores: scores(80) } } }),
        ]);
        expect(s.diet.scoredMeals).toBe(2);
        expect(s.diet.axes).toEqual({ minerals: 70, fiber: 70, vitamins: 70, antioxidants: 70 });
    });

    it('survives a day with nothing on it', () => {
        const s = summarize([day('2026-09-21')]);
        expect(s.exercise.minutes).toBe(0);
        expect(s.sleep.average).toBe(null);
        expect(s.diet.scoredMeals).toBe(0);
        expect(s.exercise.intensity).toEqual([]);
    });

    it('survives being handed nothing at all', () => {
        const s = summarize([]);
        expect(s.exercise.weeklyAverage).toBe(0);
        expect(s.steps.average).toBe(null);
    });
});

describe('the new sections are wired into the report', () => {
    const report = APP.slice(
        APP.indexOf('window.generate30DayReport = async function () {'),
        APP.indexOf('const REPORT_PRINT_SHEET_ID')
    );

    it('calculates before it draws', () => {
        const calcAt = report.indexOf('const activity = summarizeReportActivity(logs);');
        const drawAt = report.indexOf('data-report-section="activity"');
        expect(calcAt).toBeGreaterThan(-1);
        expect(calcAt).toBeLessThan(drawAt);
    });

    it('shows the activity section only when there is something in it', () => {
        expect(report).toContain('if (activity.steps.days > 0 || activity.sleep.days > 0 || activity.exercise.minutes > 0) {');
    });

    it('shows the AI section only when something was analysed', () => {
        expect(report).toContain('const hasAiSummary = activity.exercise.analyzed > 0');
        expect(report).toContain('data-report-section="ai"');
    });

    it('names the WHO range rather than inventing a target', () => {
        expect(report).toContain('${ex.targetMinutes}~${ex.stretchMinutes}분');
        expect(report).toContain('세계보건기구');
    });

    it('writes a dash, not a zero, for something never recorded', () => {
        expect(report).toContain('reportValueOrDash(activity.sleep.average');
        expect(report).toContain('reportValueOrDash(activity.steps.average');
        const helper = APP.split('function reportValueOrDash(')[1].split('\n}\n')[0];
        expect(helper).toContain("'—'");
    });

    it('gives both sections a place on the printed sheet', () => {
        expect(APP).toContain("REPORT_PRINT_TOP_SECTIONS = Object.freeze(['summary', 'category', 'activity', 'points']);");
        expect(APP).toContain("REPORT_PRINT_BOTTOM_SECTIONS = Object.freeze(['category-trend', 'ai', 'health', 'calendar']);");
    });

    it('escapes what the model wrote before putting it on the page', () => {
        // 강도와 등급은 AI 가 준 문자열이다. 그대로 끼워 넣지 않는다.
        expect(report).toContain('escapeHtml(level)');
        expect(report).toContain('escapeHtml(grade)');
    });
});
