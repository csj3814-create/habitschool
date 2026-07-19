import { describe, expect, it } from 'vitest';
import { readAppSource, readRepoFile } from './source-helpers.js';

function sliceBetween(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe('weekly mission health-practice flow', () => {
    it('uses the existing weekly mission as the health-practice choice surface', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();
        const saveMissionSource = sliceBetween(
            appSource,
            'async function saveWeeklyMissions()',
            'window.saveWeeklyMissions = saveWeeklyMissions;'
        );

        expect(html).toContain('이루고 싶은 건강 목표를 이번 주의 작은 실천으로 시작해 보세요.');
        expect(html).toContain('건강 목표를 이번 주의 작은 실천으로 골라보세요');
        expect(html).toContain('하나만 골라도 충분해요. 쉬운 행동부터 시작하고, 나중에 다시 바꿀 수 있어요.');
        expect(saveMissionSource).toContain('weeklyMissionData: {');
        expect(saveMissionSource).not.toContain('healthGoal');
        expect(saveMissionSource).not.toContain('selectedMissions:');
    });

    it('maps the existing habit preference to one mission category and selected mission tabs', () => {
        const appSource = readAppSource();
        const helpersSource = sliceBetween(
            appSource,
            'function missionTypeToRecordTab',
            'function focusWeeklyMissionArea'
        );
        const helpers = Function(`${helpersSource}; return { missionTypeToRecordTab, primaryHabitToMissionType, getNextWeeklyMissionRecordTab };`)();

        expect(['diet', 'exercise', 'sleep', '', 'unknown'].map(helpers.primaryHabitToMissionType))
            .toEqual(['diet', 'exercise', 'mind', '', '']);
        expect(['diet', 'exercise', 'mind'].map(helpers.missionTypeToRecordTab))
            .toEqual(['diet', 'exercise', 'sleep']);
        expect(helpers.getNextWeeklyMissionRecordTab([
            { type: 'mind' },
            { type: 'diet' }
        ], { mind: true })).toBe('diet');
        expect(helpers.getNextWeeklyMissionRecordTab([{ type: 'exercise' }], { exercise: true })).toBe('');
    });

    it('defaults only the preferred category to easy without changing active mission data', () => {
        const appSource = readAppSource();

        expect(appSource).toContain("const preferredMissionType = primaryHabitToMissionType(ud.settings?.primaryHabit);");
        expect(appSource).toContain("${cat === preferredMissionType ? 'checked' : ''}");
        expect(appSource).toContain("diff === 'easy' ? 'active' : ''");
        expect(appSource).toContain('const m = levelData[cat].easy;');
        expect(appSource).toContain("btn.classList.toggle('active', btn.dataset.diff === 'easy');");
    });

    it('routes onboarding to mission setup and mission save to the chosen record tab', () => {
        const appSource = readAppSource();
        const onboardingSource = sliceBetween(
            appSource,
            'async function completeOnboarding()',
            'async function maybeRecoverMissedWelcomeBonus'
        );
        const saveMissionSource = sliceBetween(
            appSource,
            'async function saveWeeklyMissions()',
            'window.saveWeeklyMissions = saveWeeklyMissions;'
        );

        expect(onboardingSource).toContain('openWeeklyMissionArea(false);');
        expect(onboardingSource).not.toContain("trackProductEvent('first_record_start'");
        expect(onboardingSource).toContain('if (pendingGuestIntent) {');
        expect(saveMissionSource).toContain('missionTypeToRecordTab(missions[0]?.type)');
        expect(saveMissionSource).toContain('openWeeklyMissionRecord(firstMissionTab, { trackStart: true });');
        expect(appSource).toContain('>오늘 실천 기록하기</button>');
    });

    it('keeps the weekly mission visible in first and repeat lifecycles', () => {
        const styles = readRepoFile('styles-guest-demo.css');

        expect(styles).toContain('#dashboard[data-lifecycle="first"] .dashboard-extra-stack > :not(.mission-card-enhanced)');
        expect(styles).not.toContain('#dashboard[data-lifecycle="first"] .dashboard-extra-stack {\n    display: none;');
        expect(styles).not.toContain('#dashboard[data-lifecycle="repeat"] .mission-card-enhanced,');
        expect(styles).toContain('#dashboard[data-lifecycle="repeat"] .social-challenge-dashboard-card');
    });

    it('adds only a truthful summary to the existing report calculations', () => {
        const html = readRepoFile('index.html');
        const appSource = readAppSource();
        const reportSource = sliceBetween(
            appSource,
            'window.generate30DayReport = async function ()',
            '// 스택 바 차트 그리기'
        );

        expect(html).toContain('최근 기록에서 식단·운동·마음 실천을 얼마나 이어왔는지 확인해 보세요.');
        expect(reportSource).not.toContain('weeklyMissionData');
        expect(reportSource).not.toContain('missionHistory');
    });

    it('persists activation markers only after a sanitized event is sent', () => {
        const appSource = readAppSource();
        const activationSource = sliceBetween(
            appSource,
            'async function trackActivationMilestoneAfterSave',
            'const DIET_CATEGORY_LABELS'
        );

        expect(activationSource).toContain("where('userId', '==', uid)");
        expect(activationSource).toContain("where('date', '>=', startDate)");
        expect(activationSource).toContain("where('date', '<=', endDate)");
        expect(activationSource).toContain("entry_point: 'record_prompt'");
        expect(activationSource).toContain('record_count_bucket: milestone.recordCountBucket');
        expect(activationSource).toContain("variant: 'full'");
        expect(activationSource).toContain('if (sent) setProductEventSentMarker(uid, milestone.eventName);');
        expect(activationSource).not.toContain('weight');
        expect(activationSource).not.toContain('glucose');
        expect(activationSource).not.toContain('journal');
    });
});
