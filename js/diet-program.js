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
        summary: '현재처럼 자유 기록 중심으로 사용해요.',
        mealGuide: '',
        dashboardTip: '오늘 식사 가이드와 알림이 바뀌어요.',
        exerciseSupportTip: '운동·명상·수면 기록은 그대로예요.',
        mindSleepSupportTip: '방법을 고르기 전에도 마음 기록과 수면 기록은 그대로 유지돼요.',
        reminderPlan: '방법 알림 없음',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.BROWN_RICE_GREEN_VEGGIES,
        displayOrder: 1,
        name: '현미밥 초록채소 식단',
        difficultyLabel: '쉬움',
        summary: '현실 식사 안에서 가장 오래 가기 쉬운 기본형 식단이에요.',
        mealGuide: '현미밥 소량, 초록채소 충분, 단백질 반찬 함께 구성',
        dashboardTip: '한 끼를 고를 때 밥은 가볍게, 초록채소와 단백질 반찬은 충분히 담아보세요.',
        exerciseSupportTip: '식후 가벼운 걷기를 더하면 부담 없이 리듬을 유지하기 좋아요.',
        mindSleepSupportTip: '늦은 야식만 줄여도 수면 리듬이 한결 안정되기 쉬워요.',
        reminderPlan: '식전 알림 11:30, 17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.HIGH_PROTEIN,
        displayOrder: 2,
        name: '고단백 식단',
        difficultyLabel: '쉬움',
        summary: '포만감을 높이고 근손실을 줄이기 쉬운 단백질 우선 전략이에요.',
        mealGuide: '이번 식사에서 단백질 소스를 먼저 확보',
        dashboardTip: '식사 전에 닭가슴살, 두부, 달걀, 생선 같은 단백질 소스를 먼저 떠올려보세요.',
        exerciseSupportTip: '가벼운 근력 운동을 함께 하면 유지 체감이 더 좋아질 수 있어요.',
        mindSleepSupportTip: '단백질 위주 식사는 늦은 폭식을 줄이는 데에도 도움이 될 수 있어요.',
        reminderPlan: '식전 알림 11:30, 17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.MEDITERRANEAN,
        displayOrder: 3,
        name: '지중해식 식단',
        difficultyLabel: '보통',
        summary: '채소, 과일, 생선, 올리브유 중심으로 구성하는 균형형 식단이에요.',
        mealGuide: '채소, 과일, 생선, 올리브유 중심 / 가공식품과 붉은 고기 줄이기',
        dashboardTip: '오늘 한 끼는 채소와 생선, 올리브유 같은 좋은 지방을 중심으로 골라보세요.',
        exerciseSupportTip: '짧은 산책이나 가벼운 유산소와 함께 가면 생활 리듬을 맞추기 쉬워요.',
        mindSleepSupportTip: '규칙적인 수면과 함께 가면 폭식 리듬을 줄이는 데 도움이 될 수 있어요.',
        reminderPlan: '식전 알림 11:30, 17:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.LOW_CARB,
        displayOrder: 4,
        name: '저탄수화물 식단',
        difficultyLabel: '보통',
        summary: '탄수화물 양을 줄이고 단백질과 지방 비중을 높이는 방식이에요.',
        mealGuide: '탄수화물 양 줄이기 / 단백질, 지방, 채소 우선',
        dashboardTip: '밥이나 면은 한 단계 줄이고, 단백질과 채소를 먼저 채워보세요.',
        exerciseSupportTip: '초기 적응기에는 강한 운동보다 걷기와 가벼운 운동이 더 편할 수 있어요.',
        mindSleepSupportTip: '극단적으로 줄이기보다 오래 갈 수 있는 수준으로 맞추는 편이 좋아요.',
        reminderPlan: '식전 알림 11:30, 17:30',
        cautionText: '극단적 제한보다 지속 가능한 저탄수 버전을 권장해요.'
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING,
        displayOrder: 5,
        name: '간헐적 단식',
        difficultyLabel: '도전',
        summary: '16시간 공복, 8시간 식사 창을 기준으로 리듬을 맞추는 방식이에요.',
        mealGuide: '기본 식사 가능 시간은 12:00~20:00 / 식사는 단백질과 채소부터 시작',
        dashboardTip: '오늘은 12:00부터 20:00까지 식사할 수 있어요. 공복 시간에도 기록은 자유롭게 남길 수 있어요.',
        exerciseSupportTip: '공복 시간에는 무리한 고강도 운동보다 가벼운 활동부터 시작해보세요.',
        mindSleepSupportTip: '초반 적응기에는 수면 시간을 일정하게 잡아두면 흐름을 유지하기 쉬워요.',
        reminderPlan: '식사 시작 알림 12:00, 마감 임박 19:30',
        cautionText: ''
    },
    {
        id: DIET_PROGRAM_METHOD_IDS.SWITCH_ON,
        displayOrder: 6,
        name: '스위치온 다이어트',
        difficultyLabel: '도전',
        summary: '초기에는 탄수화물을 줄이고, 이후 균형 식단으로 전환하는 완화형 가이드예요.',
        mealGuide: '초기 저탄수 + 단백질, 지방, 채소 중심에서 균형 식단으로 전환',
        dashboardTip: '한동안은 탄수화물보다 단백질과 채소를 먼저 고르고, 점차 균형 식단으로 옮겨가 보세요.',
        exerciseSupportTip: '초기 적응기에는 걷기와 가벼운 근력 운동부터 붙이면 부담이 덜해요.',
        mindSleepSupportTip: '강한 단식 단계는 넣지 않고, 생활 리듬을 무너뜨리지 않는 쪽으로 안내해요.',
        reminderPlan: '식전 알림 11:30, 17:30',
        cautionText: '72시간 금식이나 강한 phase 강제는 v1에 넣지 않아요.'
    }
]);

const METHOD_MAP = new Map(METHOD_CATALOG.map((method) => [method.id, method]));

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
            label: '공복 시간',
            status: '공복 시간이에요. 12:00부터 20:00까지 식사할 수 있어요.',
            helper: '첫 식사는 단백질과 채소부터 시작하면 리듬을 맞추기 쉬워요.'
        };
    }

    if (totalMinutes < DIET_PROGRAM_EATING_WINDOW.warningMinutes) {
        return {
            key: 'eating',
            label: '식사 가능 시간',
            status: '식사 가능 시간이에요. 20:00 전에 식사를 마무리해보세요.',
            helper: '식사 창 안에서는 단백질과 채소를 먼저 고르면 더 안정적으로 이어가기 쉬워요.'
        };
    }

    if (totalMinutes < DIET_PROGRAM_EATING_WINDOW.endMinutes) {
        return {
            key: 'closing',
            label: '마감 임박',
            status: '오늘 식사 창 마감이 가까워졌어요. 20:00 전에 마무리해보세요.',
            helper: '늦은 시간에는 가벼운 식사로 마무리하면 다음 공복 시간을 지키기 편해져요.'
        };
    }

    return {
        key: 'fasting',
        label: '공복 시간',
        status: '오늘 식사 창이 끝났어요. 다음 식사 전까지는 공복 시간으로 이어가요.',
        helper: '계획과 실제 식사가 달라도 기록은 그대로 남겨두면 흐름을 보기 쉬워요.'
    };
}

function buildSelectedMethodGuideState(meta, {
    dietPhotoCount = 0,
    fastingMetricsCount = 0,
    dailyLog = {},
    dateStr = '',
    todayStr = '',
    nowMs = Date.now()
} = {}) {
    const mealProgress = getMealProgressLabel(dailyLog);
    const baseBadge = dietPhotoCount > 0 ? `사진 ${dietPhotoCount}/4` : meta.difficultyLabel;

    if (meta.id === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING) {
        const isToday = !!dateStr && !!todayStr && dateStr === todayStr;
        const phase = isToday
            ? getIntermittentFastingPhase(nowMs)
            : {
                key: 'preset',
                label: '16:8',
                status: '간헐적 단식 기본 식사 가능 시간은 12:00~20:00예요.',
                helper: '지난 날짜 기록도 계획과 별개로 자유롭게 남길 수 있어요.'
            };

        const helper = dietPhotoCount > 0
            ? `기록 ${dietPhotoCount}장 준비됨 · 공복/식사 창과 별개로 저장할 수 있어요.`
            : phase.helper;

        return {
            badge: phase.label,
            status: phase.status,
            helper
        };
    }

    let status = `${meta.name} · ${meta.mealGuide}`;
    let helper = meta.dashboardTip;

    if (dietPhotoCount > 0) {
        status = `${meta.name} 기준으로 사진 ${dietPhotoCount}장이 준비됐어요. ${meta.mealGuide}`;
        helper = `기록 ${dietPhotoCount}장 준비됨 · ${meta.dashboardTip}`;
    }

    if (mealProgress >= 2 && dietPhotoCount > 0) {
        helper = `${meta.name} 흐름으로 ${mealProgress}끼를 채웠어요. 지금 저장하면 이어서 보기 쉬워요.`;
    }

    if (dietPhotoCount === 0 && fastingMetricsCount > 0) {
        helper = `${meta.name} 가이드와 함께 공복 지표를 먼저 저장할 수 있어요.`;
    }

    return {
        badge: baseBadge,
        status,
        helper
    };
}

export function listDietProgramMethods() {
    return METHOD_CATALOG
        .filter((method) => method.id !== DIET_PROGRAM_METHOD_IDS.NONE)
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map(cloneMethod);
}

export function getDietProgramMethodMeta(methodId = DIET_PROGRAM_METHOD_IDS.NONE) {
    return cloneMethod(METHOD_MAP.get(methodId) || METHOD_MAP.get(DIET_PROGRAM_METHOD_IDS.NONE));
}

export function normalizeDietProgramPreferences(rawDietPreferences = null) {
    const source = rawDietPreferences && typeof rawDietPreferences === 'object'
        ? rawDietPreferences
        : {};
    const methodId = METHOD_MAP.has(source.methodId)
        ? source.methodId
        : DIET_PROGRAM_METHOD_IDS.NONE;

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
            supportTip: meta.exerciseSupportTip,
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
        chipLabel: meta.name,
        summaryLine: guideState.status,
        supportTip: `${meta.exerciseSupportTip} ${meta.mindSleepSupportTip}`.trim(),
        reminderLine: normalized.remindersEnabled ? meta.reminderPlan : '방법 알림은 현재 꺼져 있어요.'
    };
}

export function getDietProgramAnalysisTip(dietPreferences = null) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) return '';

    const meta = getDietProgramMethodMeta(normalized.methodId);
    if (meta.id === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING) {
        return '간헐적 단식 팁 · 식사 가능 시간에는 단백질과 채소부터 시작하고 20:00 전에 마무리해보세요.';
    }

    return `${meta.name} 팁 · ${meta.mealGuide}`;
}

export function getDietProgramReminderToggleCopy(dietPreferences = null, pushState = {}) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) {
        return '식단 방법을 먼저 선택하면 방법 알림을 켤 수 있어요.';
    }

    if (normalized.remindersEnabled && !pushState.connected) {
        return '방법 알림은 켜져 있지만, 이 기기의 앱 알림이 비활성 상태예요.';
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
