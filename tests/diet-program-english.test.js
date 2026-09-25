import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DIET_PROGRAM_METHOD_IDS,
    buildDietProgramDashboardSummary,
    buildDietProgramGuideState,
    getDietProgramAnalysisTip,
    getDietProgramIntermittentFastingPhase,
    getDietProgramReminderPlanLabel,
    getDietProgramReminderToggleCopy,
    listDietProgramMethods
} from '../js/diet-program.js';

// 2026-09-25 제보: 영문(/en) 식단 분석 결과 아래에
// "식단 팁 · 과자·가공육·달콤한 음료를 멈추고 단백질과 채소로 채우기" 가 떴다.
// 식단 방법 카탈로그는 한국어뿐이라 영문 화면에서도 그대로 나왔다.
// 로케일은 주소로 정해진다(js/app-mode.js) — /en 이면 영어다.

const HANGUL = /[가-힣]/;

function useEnglishPath() {
    vi.stubGlobal('window', { location: { pathname: '/en' } });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('diet program copy on the English site', () => {
    it('shows the food tip in English', () => {
        useEnglishPath();
        expect(getDietProgramAnalysisTip({ methodId: DIET_PROGRAM_METHOD_IDS.SWITCH_ON }))
            .toBe('Food tip · Cut snacks, processed meat and sweet drinks; fill up on protein and vegetables');
    });

    it('keeps every method tip free of Korean', () => {
        useEnglishPath();
        for (const method of listDietProgramMethods()) {
            const tip = getDietProgramAnalysisTip({ methodId: method.id });
            expect(tip, method.id).toMatch(/^Food tip · /);
            expect(tip, method.id).not.toMatch(HANGUL);
        }
    });

    it('writes the guide card, summary and reminder copy in English', () => {
        useEnglishPath();
        const texts = [];
        for (const count of [0, 2, 4]) {
            const state = buildDietProgramGuideState(null, { dietPhotoCount: count, fastingMetricsCount: 0 });
            texts.push(state.badge, state.status, state.helper);
        }
        const metricsOnly = buildDietProgramGuideState(null, { dietPhotoCount: 0, fastingMetricsCount: 2 });
        texts.push(metricsOnly.status, metricsOnly.helper);
        for (const method of listDietProgramMethods()) {
            const prefs = { methodId: method.id, remindersEnabled: false };
            const state = buildDietProgramGuideState(prefs, { dietPhotoCount: 1, dateStr: '2026-09-25', todayStr: '2026-09-24' });
            texts.push(state.badge, state.status, state.helper);
            const summary = buildDietProgramDashboardSummary(prefs, {});
            texts.push(summary.chipLabel, summary.summaryLine, summary.reminderLine);
            texts.push(getDietProgramReminderToggleCopy(prefs, { connected: false }));
        }
        texts.push(buildDietProgramDashboardSummary(null, {}).chipLabel);
        texts.push(getDietProgramReminderPlanLabel(null));
        // 공복·식사 중·마감 임박·끝남 네 단계를 하루 중 시각으로 훑는다(KST).
        const fasting = { methodId: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING };
        for (const hourKst of [8, 13, 19.75, 22]) {
            const nowMs = Date.UTC(2026, 8, 25, 0, 0) + ((hourKst - 9) * 60 * 60 * 1000);
            const phase = getDietProgramIntermittentFastingPhase(nowMs, fasting);
            texts.push(phase.label, phase.status, phase.helper);
        }
        for (const text of texts) {
            expect(text).toBeTruthy();
            expect(text).not.toMatch(HANGUL);
        }
    });

    it('leaves the Korean copy exactly as it was', () => {
        expect(getDietProgramAnalysisTip({ methodId: DIET_PROGRAM_METHOD_IDS.SWITCH_ON }))
            .toBe('식단 팁 · 과자·가공육·달콤한 음료를 멈추고 단백질과 채소로 채우기');
        expect(buildDietProgramGuideState(null, { dietPhotoCount: 2 }).badge).toBe('사진 2/4');
        expect(getDietProgramReminderPlanLabel(null)).toBe('알림 없음');
    });
});
