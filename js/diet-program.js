export const DIET_PROGRAM_METHOD_IDS = Object.freeze({
    NONE: 'none',
    BROWN_RICE_GREEN_VEGGIES: 'brown_rice_green_veggies',
    HIGH_PROTEIN: 'high_protein',
    MEDITERRANEAN: 'mediterranean',
    LOW_CARB: 'low_carb',
    INTERMITTENT_FASTING: 'intermittent_fasting',
    SWITCH_ON: 'switch_on'
});

export const DIET_PROGRAM_FASTING_PRESET = '16_8_1200_2000';
export const DIET_PROGRAM_EATING_WINDOW = Object.freeze({
    startMinutes: 12 * 60,
    warningMinutes: (19 * 60) + 30,
    endMinutes: 20 * 60
});

const METHOD_CATALOG = Object.freeze([
    {
        id: DIET_PROGRAM_METHOD_IDS.NONE,
        displayOrder: 0,
        name: '선택 안 함',
        difficultyLabel: '기본',
        summary: '현재처럼 자유 기록 모드로 사용할 수 있어요.',
        mealGuide: '',
        dashboardTip: '가이드와 알림이 바뀌어요.',
        exerciseSupportTip: '운동·명상·수면 기록은 그대로예요.',
        mindSleepSupportTip: '운동·명상·수면 기록은 그대로예요.',
        reminderPlan: '알림 없음',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.BROWN_RICE_GREEN_VEGGIES,
        displayOrder: 1,
        name: '현미밥 채소 식단',
        difficultyLabel: '쉬움',
        summary: '통곡물과 채소 중심의 기초 건강식',
        mealGuide: '통곡물과 채소 중심의 기초 건강식',
        dashboardTip: '통곡물과 채소 중심의 기초 건강식',
        exerciseSupportTip: '가볍게 걷기부터 이어가요.',
        mindSleepSupportTip: '늦은 야식만 줄여도 좋아요.',
        reminderPlan: '11:30·17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.MEDITERRANEAN,
        displayOrder: 2,
        name: '지중해식 식단',
        difficultyLabel: '보통',
        summary: '올리브유와 생선 중심의 심혈관 건강식',
        mealGuide: '올리브유와 생선 중심의 심혈관 건강식',
        dashboardTip: '올리브유와 생선 중심의 심혈관 건강식',
        exerciseSupportTip: '짧은 걷기와 잘 어울려요.',
        mindSleepSupportTip: '규칙적인 수면과 잘 맞아요.',
        reminderPlan: '11:30·17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
        displayOrder: 3,
        name: '저탄수 고단백 식단',
        difficultyLabel: '보통',
        summary: '당질은 줄이고 단백질로 근육과 포만감',
        mealGuide: '당질은 줄이고 단백질로 근육과 포만감',
        dashboardTip: '당질은 줄이고 단백질로 근육과 포만감',
        exerciseSupportTip: '적응기엔 가볍게 움직여요.',
        mindSleepSupportTip: '무리한 제한은 피하는 편이 좋아요.',
        reminderPlan: '11:30·17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
        displayOrder: 4,
        name: '16:8 간헐적 단식',
        difficultyLabel: '도전',
        summary: '공복 시간 확보로 체지방 감량 도모',
        mealGuide: '공복 시간 확보로 체지방 감량 도모',
        dashboardTip: '공복 시간 확보로 체지방 감량 도모',
        exerciseSupportTip: '공복 시간엔 가볍게 움직여요.',
        mindSleepSupportTip: '수면 시간을 일정하게 잡아보세요.',
        reminderPlan: '12:00·19:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.SWITCH_ON,
        displayOrder: 5,
        name: '스위치온 다이어트',
        difficultyLabel: '도전',
        summary: '3주간 대사 회복 및 체질 개선',
        mealGuide: '3주간 대사 회복 및 체질 개선',
        dashboardTip: '3주간 대사 회복 및 체질 개선',
        exerciseSupportTip: '초기엔 가볍게 시작하세요.',
        mindSleepSupportTip: '생활 리듬부터 지켜보세요.',
        reminderPlan: '11:30·17:30',
        cautionText: ''
    }
]);

const METHOD_MAP = new Map(METHOD_CATALOG.map((method) => [method.id, method]));

function resolveDietProgramMethodId(methodId = '') {
    if (methodId === DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN) {
        return DIET_PROGRAM_METHOD_IDS.LOW_CARB;
    }
    return METHOD_MAP.has(methodId) ? methodId : DIET_PROGRAM_METHOD_IDS.NONE;
}

function cloneMethod(method) {
    return { ...(method || METHOD_MAP.get(DIET_PROGRAM_METHOD_IDS.NONE)) };
}

function getDefaultGuideState({ dietPhotoCount = 0, fastingMetricsCount = 0 } = {}) {
    let helper = '식단 사진 1장부터 저장할 수 있어요.';
    let status = '첫 식사 사진을 올리면 오늘 식단 저장 준비가 됩니다.';

    if (dietPhotoCount > 0 && dietPhotoCount < 4) {
        status = `식단 사진 ${dietPhotoCount}장이 준비됐어요. 더 올리면 최대 30P까지 반영됩니다.`;
        helper = fastingMetricsCount > 0
            ? `식단 ${dietPhotoCount}장 · 공복 지표를 함께 저장할 수 있어요.`
            : `식단 사진 ${dietPhotoCount}장을 지금 저장할 수 있어요.`;
    } else if (dietPhotoCount === 0 && fastingMetricsCount > 0) {
        status = '공복 지표가 입력됐어요. 식단 사진을 더하면 한 번에 같이 저장됩니다.';
        helper = '공복 지표를 지금 저장할 수 있어요.';
    } else if (dietPhotoCount === 4) {
        status = '식단 칸이 모두 채워졌어요. 저장하면 오늘 식단 포인트가 반영됩니다.';
        helper = '식단 준비 완료 · 저장하면 반영돼요.';
    }

    return {
        badge: `사진 ${dietPhotoCount}/4`,
        status,
        helper
    };
}

function getKstClock(nowMs = Date.now()) {
    const kstDate = new Date(nowMs + (9 * 60 * 60 * 1000));
    return {
        dateStr: kstDate.toISOString().slice(0, 10),
        hour: kstDate.getUTCHours(),
        minute: kstDate.getUTCMinutes(),
        totalMinutes: (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes()
    };
}

function hasMealPhoto(dailyLog = {}, slot = '') {
    const diet = dailyLog?.diet || {};
    const value = diet[`${slot}Url`];
    return typeof value === 'string' && value.trim().length > 0;
}

function getMealProgressLabel(dailyLog = {}) {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    return slots.filter((slot) => hasMealPhoto(dailyLog, slot)).length;
}

function getIntermittentFastingPhase(nowMs = Date.now()) {
    const { totalMinutes } = getKstClock(nowMs);
    if (totalMinutes < DIET_PROGRAM_EATING_WINDOW.startMinutes) {
        return {
            key: 'fasting',
            label: '공복',
            status: '공복 시간이에요.',
            helper: '식사 시간은 12:00~20:00예요.'
        };
    }

    if (totalMinutes < DIET_PROGRAM_EATING_WINDOW.warningMinutes) {
        return {
            key: 'eating',
            label: '식사 중',
            status: '지금은 식사 시간이에요.',
            helper: '20:00 전에 마무리해보세요.'
        };
    }

    if (totalMinutes < DIET_PROGRAM_EATING_WINDOW.endMinutes) {
        return {
            key: 'closing',
            label: '마감 임박',
            status: '식사 마감이 가까워졌어요.',
            helper: '20:00 전에 마무리해보세요.'
        };
    }

    return {
        key: 'fasting',
        label: '공복',
        status: '오늘 식사 시간은 끝났어요.',
        helper: '기록은 계속 남길 수 있어요.'
    };
}

function buildSelectedMethodGuideState(meta, {
    fastingMetricsCount = 0,
    dateStr = '',
    todayStr = '',
    nowMs = Date.now()
} = {}) {
    if (meta.id === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING) {
        const isToday = !!dateStr && !!todayStr && dateStr === todayStr;
        const phase = isToday
            ? getIntermittentFastingPhase(nowMs)
            : {
                key: 'preset',
                label: '16:8',
                status: '식사 시간은 12:00~20:00예요.',
                helper: '기록은 자유롭게 남길 수 있어요.'
            };

        return {
            badge: phase.label,
            status: meta.mealGuide,
            helper: phase.helper
        };
    }

    return {
        badge: meta.difficultyLabel,
        status: meta.mealGuide,
        helper: fastingMetricsCount > 0 ? '공복 지표만 먼저 저장할 수 있어요.' : meta.dashboardTip
    };
}

export function listDietProgramMethods() {
    return METHOD_CATALOG
        .filter((method) => method.id !== DIET_PROGRAM_METHOD_IDS.NONE)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(cloneMethod);
}

export function getDietProgramMethodMeta(methodId = DIET_PROGRAM_METHOD_IDS.NONE) {
    return cloneMethod(METHOD_MAP.get(resolveDietProgramMethodId(methodId)) || METHOD_MAP.get(DIET_PROGRAM_METHOD_IDS.NONE));
}

export function normalizeDietProgramPreferences(rawDietPreferences = null) {
    const source = rawDietPreferences && typeof rawDietPreferences === 'object'
        ? rawDietPreferences
        : {};
    const methodId = resolveDietProgramMethodId(source.methodId);

    return {
        methodId,
        remindersEnabled: methodId === DIET_PROGRAM_METHOD_IDS.NONE ? false : source.remindersEnabled === true,
        activatedAt: typeof source.activatedAt === 'string' ? source.activatedAt : '',
        fastingPreset: typeof source.fastingPreset === 'string' && source.fastingPreset.trim()
            ? source.fastingPreset
            : DIET_PROGRAM_FASTING_PRESET
    };
}

export function normalizeDietProgramEnvelope(rawProgramPreferences = null) {
    const source = rawProgramPreferences && typeof rawProgramPreferences === 'object'
        ? rawProgramPreferences
        : {};
    return {
        diet: normalizeDietProgramPreferences(source.diet)
    };
}

export function buildDietProgramGuideState(dietPreferences = null, options = {}) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) {
        return getDefaultGuideState(options);
    }

    const meta = getDietProgramMethodMeta(normalized.methodId);
    return buildSelectedMethodGuideState(meta, options);
}

export function buildDietProgramDashboardSummary(dietPreferences = null, {
    dailyLog = {},
    dateStr = '',
    todayStr = '',
    nowMs = Date.now()
} = {}) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    const meta = getDietProgramMethodMeta(normalized.methodId);

    if (meta.id === DIET_PROGRAM_METHOD_IDS.NONE) {
        return {
            active: false,
            methodId: meta.id,
            chipLabel: '식단 방법 미선택',
            summaryLine: meta.dashboardTip,
            supportTip: '',
            reminderLine: ''
        };
    }

    const guideState = buildDietProgramGuideState(normalized, {
        dailyLog,
        dateStr,
        todayStr,
        nowMs,
        dietPhotoCount: getMealProgressLabel(dailyLog)
    });

    return {
        active: true,
        methodId: meta.id,
        chipLabel: `${meta.name} · ${meta.difficultyLabel}`,
        summaryLine: guideState.status,
        supportTip: '',
        reminderLine: normalized.remindersEnabled ? meta.reminderPlan : '방법 알림은 현재 꺼져 있어요.'
    };
}

export function getDietProgramAnalysisTip(dietPreferences = null) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) return '';

    const meta = getDietProgramMethodMeta(normalized.methodId);
    return `식단 팁 · ${meta.mealGuide}`;
}

export function getDietProgramReminderToggleCopy(dietPreferences = null, pushState = {}) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) {
        return '식단 방법을 먼저 선택하면 방법 알림을 켤 수 있어요.';
    }

    if (normalized.remindersEnabled && !pushState.connected) {
        return '방법 알림은 켜져 있지만 이 기기 알림은 꺼져 있어요.';
    }

    if (normalized.remindersEnabled) {
        return '선택한 식단 방법에 맞춘 알림을 이 기기에서 받고 있어요.';
    }

    return '방법 선택은 유지되고, 알림은 필요할 때만 따로 켤 수 있어요.';
}

export function isDietProgramMethodActive(dietPreferences = null) {
    return normalizeDietProgramPreferences(dietPreferences).methodId !== DIET_PROGRAM_METHOD_IDS.NONE;
}

export function getDietProgramKstClock(nowMs = Date.now()) {
    return getKstClock(nowMs);
}

export function getDietProgramIntermittentFastingPhase(nowMs = Date.now()) {
    return getIntermittentFastingPhase(nowMs);
}
