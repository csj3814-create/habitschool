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
            DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN,
            DIET_PROGRAM_METHOD_IDS.MEDITERRANEAN,
            DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
            DIET_PROGRAM_METHOD_IDS.SWITCH_ON
        ]);
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

    it('calculates intermittent fasting phases in KST and avoids live copy on past dates', () => {
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
        expect(staticGuide.status).toContain('12:00~20:00');
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
        expect(summary.methodId).toBe(DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN);
        expect(summary.chipLabel).toBeTruthy();
        expect(summary.summaryLine).toBeTruthy();
        expect(summary.reminderLine).toBeTruthy();
        expect(getDietProgramAnalysisTip({
            methodId: DIET_PROGRAM_METHOD_IDS.SWITCH_ON
        })).toBeTruthy();
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
        expect(APP_SOURCE).not.toContain("if (resolvedTabName === 'assets' && user) {\r\n            updateAssetDisplay();");
        expect(APP_SOURCE).not.toContain("if (resolvedTabName === 'assets' && user) {\n            updateAssetDisplay();");
    });
});
