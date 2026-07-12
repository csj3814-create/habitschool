import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const APP_CORE_SOURCE = readRepoFile('js/app-core.js');

function readDashboardScoringHelpers() {
    const start = APP_CORE_SOURCE.indexOf('const DASHBOARD_ACTION_POINT_CAPS = {');
    const end = APP_CORE_SOURCE.indexOf('function applyDashboardLifecycleState(', start);

    expect(start, 'dashboard point caps should exist').toBeGreaterThanOrEqual(0);
    expect(end, 'dashboard lifecycle boundary should exist').toBeGreaterThan(start);

    const source = APP_CORE_SOURCE.slice(start, end);
    return Function(`
        ${source}
        return {
            getDashboardTodayPointTotal,
            isDashboardDailyGoalMet
        };
    `)();
}

function readDashboardActionRenderSource() {
    const heroStart = APP_CORE_SOURCE.indexOf('function _renderDashboardHeroState(');
    const renderStart = APP_CORE_SOURCE.indexOf('async function renderDashboard()', heroStart);

    expect(heroStart, 'dashboard hero renderer should exist').toBeGreaterThanOrEqual(0);
    expect(renderStart, 'dashboard render boundary should exist').toBeGreaterThan(heroStart);

    const heroSource = APP_CORE_SOURCE.slice(heroStart, renderStart);
    const actionStart = heroSource.indexOf('order.forEach(type => {');
    expect(actionStart, 'dashboard action-card loop should exist').toBeGreaterThanOrEqual(0);
    return heroSource.slice(actionStart);
}

describe('dashboard full-routine completion', () => {
    it('uses 65P as the success boundary while 64P remains incomplete', () => {
        const { getDashboardTodayPointTotal, isDashboardDailyGoalMet } = readDashboardScoringHelpers();
        const sixtyFivePoints = {
            dietPoints: 30,
            exercisePoints: 15,
            mindPoints: 20
        };
        const sixtyFourPoints = {
            dietPoints: 30,
            exercisePoints: 14,
            mindPoints: 20
        };

        expect(getDashboardTodayPointTotal(sixtyFivePoints)).toBe(65);
        expect(isDashboardDailyGoalMet(sixtyFivePoints)).toBe(true);
        expect(getDashboardTodayPointTotal(sixtyFourPoints)).toBe(64);
        expect(isDashboardDailyGoalMet(sixtyFourPoints)).toBe(false);
    });

    it('renders every action card with the green completion state once the 65P routine is met', () => {
        const actionSource = readDashboardActionRenderSource();

        expect(actionSource).toContain('const isVisuallyComplete = dailyGoalMet || isMaxed;');
        expect(actionSource).toContain("button.classList.toggle('is-complete', isVisuallyComplete);");
        expect(actionSource).toContain("button.classList.toggle('is-progress', !dailyGoalMet && hasProgress && !isMaxed);");
    });

    it('prioritizes full-routine completion copy without hiding the actual category score', () => {
        const actionSource = readDashboardActionRenderSource();
        const routineCompleteBranch = actionSource.indexOf('if (dailyGoalMet) {');
        const categoryMaxedBranch = actionSource.indexOf('} else if (isMaxed) {');

        expect(routineCompleteBranch).toBeGreaterThanOrEqual(0);
        expect(categoryMaxedBranch).toBeGreaterThan(routineCompleteBranch);
        expect(actionSource).toContain('label.textContent = meta.doneLabel;');
        expect(actionSource).toContain("`${isSelectedToday ? '오늘' : selectedDateLabel} 기준 달성 · ${earnedPoints}/${maxPoints}`");
        expect(actionSource).toContain('score.textContent = `${earnedPoints}/${maxPoints}`;');
    });
});
