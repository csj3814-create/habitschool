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

// 식사 창은 사용자가 바꿀 수 있다. 저장 위치는 기존 필드
// programPreferences.diet.fastingPreset 하나이며, 형식은 레거시 값과 호환되게
// `{단식h}_{식사h}_{시작HHMM}_{종료HHMM}`을 유지한다(파서는 마지막 두 세그먼트만 신뢰).
// 이 필드는 firestore.rules에 이미 허용돼 있어 규칙 변경이 필요 없다.
export const DIET_PROGRAM_WINDOW_STEP_MINUTES = 30;
export const DIET_PROGRAM_MIN_WINDOW_MINUTES = 4 * 60;
// 16:8은 식사 창이 8시간으로 고정이다. 종료 시각은 시작에서 자동 계산하고
// 사용자가 따로 고르지 않는다(그래야 이름과 실제 동작이 어긋나지 않는다).
export const DIET_PROGRAM_FASTING_EATING_MINUTES = 8 * 60;
export const DIET_PROGRAM_FASTING_MAX_START_MINUTES = (24 * 60) - DIET_PROGRAM_FASTING_EATING_MINUTES;

export function isFixedEatingWindowMethod(methodId = '') {
    return methodId === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING;
}

// 16:8에서 시작 시각으로부터 창을 만든다(자정을 넘지 않도록 시작을 제한).
export function buildFixedFastingWindow(startMinutes = 0) {
    const start = Math.max(0, Math.min(DIET_PROGRAM_FASTING_MAX_START_MINUTES, Math.round(Number(startMinutes) || 0)));
    return { startMinutes: start, endMinutes: start + DIET_PROGRAM_FASTING_EATING_MINUTES };
}

// 메서드별 기본 창. 설정을 한 번도 바꾸지 않은 사용자의 알림 시각이 기존과 완전히
// 같아지도록 현재 동작(간헐적 단식 12:00·19:30 / 그 외 11:30·17:30)에 맞춘 값이다.
const FASTING_DEFAULT_WINDOW = Object.freeze({ startMinutes: 12 * 60, endMinutes: 20 * 60 });
const GENERAL_DEFAULT_WINDOW = Object.freeze({ startMinutes: (11 * 60) + 30, endMinutes: 18 * 60 });

export function getDefaultEatingWindow(methodId = '') {
    return methodId === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING
        ? FASTING_DEFAULT_WINDOW
        : GENERAL_DEFAULT_WINDOW;
}

export function formatWindowLabel(totalMinutes = 0) {
    const safe = Math.max(0, Math.min(24 * 60, Math.round(Number(totalMinutes) || 0)));
    const hour = Math.floor(safe / 60);
    const minute = safe % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseHhmmSegment(segment = '') {
    const digits = String(segment || '').trim();
    if (!/^\d{3,4}$/.test(digits)) return null;
    const padded = digits.padStart(4, '0');
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2));
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    if (hour > 23 || minute > 59) return null;
    return (hour * 60) + minute;
}

// 잘못된 값에서도 절대 throw하지 않는다. 실패하면 null을 주고 호출부가 기본값으로 폴백한다.
export function parseEatingWindowPreset(preset = '') {
    const parts = String(preset || '').trim().split('_');
    if (parts.length < 2) return null;
    const startMinutes = parseHhmmSegment(parts[parts.length - 2]);
    const endMinutes = parseHhmmSegment(parts[parts.length - 1]);
    if (startMinutes === null || endMinutes === null) return null;
    if (endMinutes - startMinutes < DIET_PROGRAM_MIN_WINDOW_MINUTES) return null;
    return { startMinutes, endMinutes };
}

// 사용자가 직접 저장한 창은 레거시 센티넬(`16_8_1200_2000`)과 구분되도록 `win_` 형식으로 쓴다.
// 그래야 비단식 사용자가 12:00~20:00을 고르더라도 '미설정'으로 오해되지 않는다.
export function buildEatingWindowPreset(startMinutes = 0, endMinutes = 0) {
    const hhmm = (minutes) => formatWindowLabel(minutes).replace(':', '');
    return `win_${hhmm(startMinutes)}_${hhmm(endMinutes)}`;
}

// 안내 문구·단계 판정·알림이 모두 이 함수 하나를 기준으로 움직인다.
export function resolveEatingWindow(dietPreferences = null, methodId = '') {
    const resolvedMethodId = methodId
        || resolveDietProgramMethodId(dietPreferences?.methodId || '');
    const fallback = getDefaultEatingWindow(resolvedMethodId);
    const raw = typeof dietPreferences?.fastingPreset === 'string'
        ? dietPreferences.fastingPreset.trim()
        : '';
    // 레거시 고정값은 앱이 항상 써 온 값이라 사용자 선택으로 볼 수 없다 → 메서드 기본 창 사용.
    // (이 구분이 없으면 기존 비단식 사용자의 알림이 11:30→12:00으로 밀린다.)
    const parsed = raw && raw !== DIET_PROGRAM_FASTING_PRESET
        ? parseEatingWindowPreset(raw)
        : null;
    const stored = parsed || fallback;
    // 16:8은 창 길이가 8시간으로 고정 → 저장값이 달라도 시작 기준으로 다시 맞춘다.
    // (다른 방법에서 긴 창을 설정한 뒤 단식으로 바꿔도 16:8이 깨지지 않는다.)
    const window = isFixedEatingWindowMethod(resolvedMethodId)
        ? buildFixedFastingWindow(stored.startMinutes)
        : stored;
    return {
        startMinutes: window.startMinutes,
        warningMinutes: Math.max(window.startMinutes, window.endMinutes - 30),
        endMinutes: window.endMinutes
    };
}

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
        // 표시명은 일반명사로 둔다. 앱에는 특정 도서의 3주 프로토콜 로직이 없고,
        // '대사 회복·체질 개선' 같은 효능 주장도 하지 않는다. 내부 ID는 기존 사용자
        // 데이터·firestore.rules 호환을 위해 switch_on을 유지한다.
        name: '단기 집중 식단',
        difficultyLabel: '도전',
        summary: '짧게 집중해서 식습관을 다시 잡는 방법',
        mealGuide: '짧게 집중해서 식습관을 다시 잡는 방법',
        dashboardTip: '짧게 집중해서 식습관을 다시 잡는 방법',
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

function getIntermittentFastingPhase(nowMs = Date.now(), dietPreferences = null) {
    const { totalMinutes } = getKstClock(nowMs);
    // 사용자가 설정한 창을 그대로 쓴다. 설정이 없으면 메서드 기본값(12:00~20:00).
    const window = resolveEatingWindow(dietPreferences, DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING);
    const startLabel = formatWindowLabel(window.startMinutes);
    const endLabel = formatWindowLabel(window.endMinutes);

    if (totalMinutes < window.startMinutes) {
        return {
            key: 'fasting',
            label: '공복',
            status: '공복 시간이에요.',
            helper: `식사 시간은 ${startLabel}~${endLabel}예요.`
        };
    }

    if (totalMinutes < window.warningMinutes) {
        return {
            key: 'eating',
            label: '식사 중',
            status: '지금은 식사 시간이에요.',
            helper: `${endLabel} 전에 마무리해보세요.`
        };
    }

    if (totalMinutes < window.endMinutes) {
        return {
            key: 'closing',
            label: '마감 임박',
            status: '식사 마감이 가까워졌어요.',
            helper: `${endLabel} 전에 마무리해보세요.`
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
} = {}, dietPreferences = null) {
    if (meta.id === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING) {
        const isToday = !!dateStr && !!todayStr && dateStr === todayStr;
        const window = resolveEatingWindow(dietPreferences, meta.id);
        const phase = isToday
            ? getIntermittentFastingPhase(nowMs, dietPreferences)
            : {
                key: 'preset',
                label: '16:8',
                status: `식사 시간은 ${formatWindowLabel(window.startMinutes)}~${formatWindowLabel(window.endMinutes)}예요.`,
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
        // 형식이 깨진 값은 메서드 기본 창으로 정규화한다(파싱은 절대 throw하지 않음).
        fastingPreset: resolveStoredWindowPreset(source.fastingPreset)
    };
}

function resolveStoredWindowPreset(rawPreset = '') {
    const raw = typeof rawPreset === 'string' ? rawPreset.trim() : '';
    if (raw && parseEatingWindowPreset(raw)) return raw;
    // 레거시 상수는 '사용자가 직접 설정하지 않음'을 뜻하는 센티넬로 남긴다.
    return DIET_PROGRAM_FASTING_PRESET;
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
    return buildSelectedMethodGuideState(meta, options, normalized);
}

// 알림 시각은 창에서 파생한다: 시작 알림 = 창 시작, 마감 임박 알림 = 창 종료 − 30분.
// 카탈로그의 reminderPlan 하드코딩 대신 이 값을 표시한다.
export function getDietProgramReminderPlanLabel(dietPreferences = null) {
    const normalized = normalizeDietProgramPreferences(dietPreferences);
    if (normalized.methodId === DIET_PROGRAM_METHOD_IDS.NONE) return '알림 없음';
    const window = resolveEatingWindow(normalized, normalized.methodId);
    return `${formatWindowLabel(window.startMinutes)}·${formatWindowLabel(window.warningMinutes)}`;
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
        reminderLine: normalized.remindersEnabled
            ? getDietProgramReminderPlanLabel(normalized)
            : '식사 시간대 알림이 꺼져 있어요.'
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
        return '식단 방법을 먼저 선택하면 알림을 켤 수 있어요.';
    }

    if (normalized.remindersEnabled && !pushState.connected) {
        return '식사 시간대 알림은 켜져 있지만 이 기기 알림이 꺼져 있어요.';
    }

    if (normalized.remindersEnabled) {
        return '선택한 식단 방법에 맞춘 알림을 이 기기에서 받고 있어요.';
    }

    return '식단 방법은 그대로 두고, 알림만 필요할 때 켤 수 있어요.';
}

export function isDietProgramMethodActive(dietPreferences = null) {
    return normalizeDietProgramPreferences(dietPreferences).methodId !== DIET_PROGRAM_METHOD_IDS.NONE;
}

export function getDietProgramKstClock(nowMs = Date.now()) {
    return getKstClock(nowMs);
}

export function getDietProgramIntermittentFastingPhase(nowMs = Date.now(), dietPreferences = null) {
    return getIntermittentFastingPhase(nowMs, dietPreferences);
}
