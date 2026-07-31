import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';
import {
    DIET_PROGRAM_FASTING_PRESET,
    DIET_PROGRAM_METHOD_IDS,
    buildDietProgramDashboardSummary,
    buildDietProgramGuideState,
    buildEatingWindowPreset,
    getDietProgramAnalysisTip,
    getDietProgramIntermittentFastingPhase,
    getDietProgramReminderPlanLabel,
    listDietProgramMethods,
    normalizeDietProgramPreferences,
    parseEatingWindowPreset,
    resolveEatingWindow
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
        // switch_on은 표시명을 일반명사로 바꿨다(타인 브랜드명·효능 주장 제거).
        // 내부 ID는 기존 데이터·rules 호환을 위해 유지한다.
        expect(methods[4].id).toBe(DIET_PROGRAM_METHOD_IDS.SWITCH_ON);
        expect(methods[4].name).toBe('2주 초가공식품 끊기');
        expect(methods[4].mealGuide).toBe('과자·가공육·달콤한 음료를 멈추고 단백질과 채소로 채우기');
        expect(methods.map((method) => method.name).join(' ')).not.toContain('스위치온');
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
        })).toBe('식단 팁 · 과자·가공육·달콤한 음료를 멈추고 단백질과 채소로 채우기');
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

    it('keeps existing users on their current reminder times when they never set a window', () => {
        // 기존 사용자는 메서드와 무관하게 fastingPreset='16_8_1200_2000'이 저장돼 있다.
        // 이 레거시 값을 '미설정' 센티넬로 취급해야 비단식 사용자의 알림이 11:30→12:00으로 밀리지 않는다.
        const fasting = resolveEatingWindow({
            methodId: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        });
        expect([fasting.startMinutes, fasting.warningMinutes, fasting.endMinutes]).toEqual([720, 1170, 1200]);

        const general = resolveEatingWindow({
            methodId: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        });
        expect([general.startMinutes, general.warningMinutes, general.endMinutes]).toEqual([690, 1050, 1080]);

        expect(getDietProgramReminderPlanLabel({
            methodId: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
            remindersEnabled: true,
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        })).toBe('12:00·19:30');
        expect(getDietProgramReminderPlanLabel({
            methodId: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            remindersEnabled: true,
            fastingPreset: DIET_PROGRAM_FASTING_PRESET
        })).toBe('11:30·17:30');
    });

    it('honors a user-set eating window in phase, copy and reminder times', () => {
        const preset = buildEatingWindowPreset(630, 1110); // 10:30~18:30
        expect(preset).toBe('win_1030_1830');
        expect(parseEatingWindowPreset(preset)).toEqual({ startMinutes: 630, endMinutes: 1110 });

        const prefs = { methodId: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING, remindersEnabled: true, fastingPreset: preset };
        expect(getDietProgramReminderPlanLabel(prefs)).toBe('10:30·18:00');

        // 10:00 KST → 공복, 10:35 KST → 식사 중, 18:05 KST → 마감 임박
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 1, 0), prefs).key).toBe('fasting');
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 1, 35), prefs).key).toBe('eating');
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 9, 5), prefs).key).toBe('closing');
        expect(getDietProgramIntermittentFastingPhase(Date.UTC(2026, 3, 20, 1, 0), prefs).helper)
            .toBe('식사 시간은 10:30~18:30예요.');
    });

    it('lets a non-fasting method pick 12:00~20:00 without being read as unset', () => {
        // 사용자가 명시로 고른 값은 `win_` 형식이라 레거시 센티넬과 충돌하지 않는다.
        const window = resolveEatingWindow({
            methodId: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            fastingPreset: buildEatingWindowPreset(720, 1200)
        });
        expect([window.startMinutes, window.endMinutes]).toEqual([720, 1200]);
    });

    it('falls back to the sentinel preset for malformed or too-short windows', () => {
        expect(parseEatingWindowPreset('garbage')).toBeNull();
        expect(parseEatingWindowPreset('win_1200_1300')).toBeNull(); // 4시간 미만
        expect(normalizeDietProgramPreferences({
            methodId: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
            fastingPreset: 'garbage'
        }).fastingPreset).toBe(DIET_PROGRAM_FASTING_PRESET);
    });

    it('keeps the compact profile card to one method line instead of repeating the same copy', () => {
        expect(APP_SOURCE).toContain("supportEl.textContent = hasMethod ? '' : '알림은 따로 켤 수 있어요.';");
        expect(APP_SOURCE).toContain('supportEl.hidden = hasMethod || !supportEl.textContent;');
        expect(APP_SOURCE).not.toContain('supportEl.textContent = meta.dashboardTip;');
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
