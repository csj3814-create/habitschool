import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';
import {
    DIET_PROGRAM_FASTING_PRESET,
    DIET_PROGRAM_METHOD_IDS,
    buildDietProgramDashboardSummary,
    buildDietProgramGuideState,
    getDietProgramAnalysisTip,
    getDietProgramIntermittentFastingPhase,
    listDietProgramMethods,
    normalizeDietProgramPreferences
} from '../js/diet-program.js';

const APP_SOURCE = readAppSource({ includeEntrypoint: true });

describe('diet program helpers', () => {
    it('keeps the agreed method order for selection cards', () => {
        expect(listDietProgramMethods().map((method) => method.id)).toEqual([
            DIET_PROGRAM_METHOD_IDS.BROWN_RICE_GREEN_VEGGIES,
            DIET_PROGRAM_METHOD_IDS.MEDITERRANEAN,
            DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
            DIET_PROGRAM_METHOD_IDS.SWITCH_ON
        ]);
    });

    it('uses the refreshed short Korean copy for the record-flow methods', () => {
        const methods = listDietProgramMethods();

        expect(methods[0].name).toBe('현미밥 채소 식단');
        expect(methods[0].mealGuide).toBe('통곡물과 채소 중심의 기초 건강식');
        expect(methods[2].name).toBe('저탄수 고단백 식단');
        expect(methods[2].mealGuide).toBe('당질은 줄이고 단백질로 근육과 포만감');
        expect(methods[3].name).toBe('16:8 간헐적 단식');
        expect(methods[3].mealGuide).toBe('공복 시간 확보로 체지방 감량 도모');
        expect(methods[4].mealGuide).toBe('3주간 대사 회복 및 체질 개선');
    });

    it('maps removed high-protein selections onto low-carb high-protein copy', () => {
        expect(normalizeDietProgramPreferences({
            methodId: DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN,
            remindersEnabled: true
        })).toEqual({
            methodId: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            remindersEnabled: true,
            activatedAt: '',
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        });
    });

    it('normalizes invalid preferences back to none', () => {
        expect(normalizeDietProgramPreferences({
            methodId: 'unknown',
            remindersEnabled: true
        })).toEqual({
            methodId: DIET_PROGRAM_METHOD_IDS.NONE,
            remindersEnabled: false,
            activatedAt: '',
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        });
    });

    it('keeps legacy default guide shape when no method is selected', () => {
        const guide = buildDietProgramGuideState(null, {
            dietPhotoCount: 2,
            fastingMetricsCount: 0
        });

        expect(guide.badge).toContain('2/4');
        expect(guide.status).toContain('2');
        expect(guide.helper).toContain('2');
    });

    it('calculates intermittent fasting phases in KST and uses the new static guide copy on past dates', () => {
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 2, 30)).key).toBe('fasting');
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 3, 0)).key).toBe('eating');
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 10, 35)).key).toBe('closing');

        const staticGuide = buildDietProgramGuideState({
            methodId: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
            remindersEnabled: true
        }, {
            dateStr: '2026-04-19',
            todayStr: '2026-04-20',
            nowMs: Date.UTC(2026, 3, 20, 10, 35)
        });

        expect(staticGuide.badge).toBe('16:8');
        expect(staticGuide.status).toBe('공복 시간 확보로 체지방 감량 도모');
    });

    it('builds dashboard and analysis copy for selected methods', () => {
        const summary = buildDietProgramDashboardSummary({
            methodId: DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN,
            remindersEnabled: false
        }, {
            dailyLog: {
                diet: {
                    lunchUrl: 'https://example.com/lunch.jpg'
                }
            },
            dateStr: '2026-04-20',
            todayStr: '2026-04-20'
        });

        expect(summary.active).toBe(true);
        expect(summary.methodId).toBe(DIET_PROGRAM_METHOD_IDS.LOW_CARB);
        expect(summary.chipLabel).toContain('저탄수 고단백 식단');
        expect(summary.chipLabel).toContain('보통');
        expect(summary.summaryLine).toBe('당질은 줄이고 단백질로 근육과 포만감');
        expect(summary.supportTip).toBe('');
        expect(summary.reminderLine).toBeTruthy();
        expect(getDietProgramAnalysisTip({
            methodId: DIET_PROGRAM_METHOD_IDS.SWITCH_ON
        })).toBe('식단 팁 · 3주간 대사 회복 및 체질 개선');
    });

    it('removes dynamic photo-prepared copy from the selected diet guide box', () => {
        const guide = buildDietProgramGuideState({
            methodId: DIET_PROGRAM_METHOD_IDS.BROWN_RICE_GREEN_VEGGIES,
            remindersEnabled: true
        }, {
            dietPhotoCount: 2,
            fastingMetricsCount: 0,
            dailyLog: {
                diet: {
                    breakfastUrl: 'https://example.com/a.jpg',
                    lunchUrl: 'https://example.com/b.jpg'
                }
            },
            dateStr: '2026-04-21',
            todayStr: '2026-04-21'
        });

        expect(guide.badge).toBe('쉬움');
        expect(guide.status).toBe('통곡물과 채소 중심의 기초 건강식');
        expect(guide.helper).toBe('통곡물과 채소 중심의 기초 건강식');
        expect(guide.status).not.toContain('준비됨');
        expect(guide.helper).not.toContain('준비됨');
    });

    it('keeps diet-program boot hooks queued until app boot is ready', () => {
        expect(APP_SOURCE.indexOf('let _stepData = createEmptyStepData();')).toBeGreaterThan(-1);
        expect(APP_SOURCE).toContain('let _appBootReady = false;');
        expect(APP_SOURCE).toContain('let _pendingBootTabRequest = null;');
        expect(APP_SOURCE).toContain('let _pendingDietProgramUserData = null;');
        expect(APP_SOURCE).toContain('if (!_appBootReady) {');
        expect(APP_SOURCE).toContain('_pendingBootTabRequest = { tabName: resolvedTabName, pushState };');
        expect(APP_SOURCE).toContain('_pendingDietProgramUserData = userData;');
        expect(APP_SOURCE).toContain('_appBootReady = true;');
        expect(APP_SOURCE).toContain('openTab(pendingBootTabRequest.tabName, pendingBootTabRequest.pushState);');
        expect(APP_SOURCE).not.toContain('window.applyDietProgramUserData?.();');
        expect(APP_SOURCE).toContain('window.updateAssetDisplay?.();');
        expect(APP_SOURCE).not.toContain('프로필에서 바꾸기');
        expect(APP_SOURCE).not.toContain("if (resolvedTabName === 'assets' && user) {\r\n            updateAssetDisplay();");
        expect(APP_SOURCE).not.toContain("if (resolvedTabName === 'assets' && user) {\n            updateAssetDisplay();");
    });
});
