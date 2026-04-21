export const MEDITATION_METHOD_IDS = Object.freeze({
    ABDOMINAL: 'abdominal_breathing',
    FOUR_SEVEN_EIGHT: 'four_seven_eight',
    BOX: 'box_breathing',
    MINDFULNESS: 'short_mindfulness'
});

export const DEFAULT_MEDITATION_METHOD_ID = MEDITATION_METHOD_IDS.ABDOMINAL;

const METHOD_LIST = Object.freeze([
    {
        id: MEDITATION_METHOD_IDS.ABDOMINAL,
        name: '복식호흡',
        guide: '배를 부풀리며 4초 들이쉼, 6초 내쉼',
        durationSec: 180,
        phaseSteps: [
            { label: '들이쉼', seconds: 4, visual: 'inhale', line: '배를 부풀리며 천천히 들이마셔요.' },
            { label: '내쉼', seconds: 6, visual: 'exhale', line: '배를 가라앉히며 길게 내쉬어요.' }
        ],
        completionLine: '복식호흡으로 몸의 긴장을 풀었어요.'
    },
    {
        id: MEDITATION_METHOD_IDS.FOUR_SEVEN_EIGHT,
        name: '4-7-8 호흡',
        guide: '4초 들이쉼, 7초 멈춤, 8초 내쉼',
        durationSec: 180,
        phaseSteps: [
            { label: '들이쉼', seconds: 4, visual: 'inhale', line: '4초 동안 코로 들이마셔요.' },
            { label: '멈춤', seconds: 7, visual: 'hold', line: '숨을 멈추고 가슴을 편하게 둬요.' },
            { label: '내쉼', seconds: 8, visual: 'exhale', line: '8초 동안 길게 내쉬어요.' }
        ],
        completionLine: '4-7-8 호흡으로 호흡 리듬을 정리했어요.'
    },
    {
        id: MEDITATION_METHOD_IDS.BOX,
        name: '박스호흡',
        guide: '4초 들이쉼, 4초 멈춤, 4초 내쉼, 4초 멈춤',
        durationSec: 180,
        phaseSteps: [
            { label: '들이쉼', seconds: 4, visual: 'inhale', line: '4초 동안 들이마셔요.' },
            { label: '멈춤', seconds: 4, visual: 'hold', line: '숨을 멈추고 어깨 힘을 빼요.' },
            { label: '내쉼', seconds: 4, visual: 'exhale', line: '4초 동안 천천히 내쉬어요.' },
            { label: '멈춤', seconds: 4, visual: 'hold', line: '빈 호흡으로 잠시 머물러요.' }
        ],
        completionLine: '박스호흡으로 긴장을 차분히 가라앉혔어요.'
    },
    {
        id: MEDITATION_METHOD_IDS.MINDFULNESS,
        name: '짧은 마음챙김',
        guide: '호흡과 몸감각에 집중하고 떠오른 생각은 흘려보내기',
        durationSec: 300,
        segments: [
            { untilRatio: 0.25, line: '호흡에서 시작되는 감각을 살펴보세요.' },
            { untilRatio: 0.5, line: '어깨와 턱의 힘을 천천히 빼요.' },
            { untilRatio: 0.75, line: '떠오른 생각은 흘려보내고 다시 호흡으로 돌아와요.' },
            { untilRatio: 1, line: '마지막 세 호흡은 길게 마무리해요.' }
        ],
        completionLine: '마음챙김으로 몸과 생각을 다시 고르게 했어요.'
    }
]);

const METHOD_MAP = new Map(METHOD_LIST.map((method) => [method.id, method]));

export const MEDITATION_COMMON_NOTE = '편하게 앉고, 무리하지 말고, 어지러우면 중단.';

export function listMeditationMethods() {
    return METHOD_LIST.map((method) => ({ ...method }));
}

export function getMeditationMethodMeta(methodId = '') {
    const normalizedId = String(methodId || '').trim();
    return METHOD_MAP.get(normalizedId) || METHOD_MAP.get(DEFAULT_MEDITATION_METHOD_ID);
}

export function formatMeditationDurationLabel(durationSec = 0) {
    const safeSec = Math.max(0, Number(durationSec) || 0);
    const minutes = Math.max(1, Math.round(safeSec / 60));
    return `${minutes}분`;
}

export function normalizeMeditationLog(sleepAndMind = {}) {
    const source = sleepAndMind && typeof sleepAndMind === 'object' ? sleepAndMind : {};
    const rawMethodId = String(source.meditationMethodId || '').trim();
    const hasMethodId = METHOD_MAP.has(rawMethodId);
    const rawDuration = Number(source.meditationDurationSec || 0);
    const durationSec = Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.round(rawDuration)
        : 0;
    return {
        meditationDone: !!source.meditationDone,
        meditationMethodId: hasMethodId ? rawMethodId : '',
        meditationDurationSec: durationSec,
        meditationCompletedAt: typeof source.meditationCompletedAt === 'string'
            ? source.meditationCompletedAt
            : ''
    };
}

export function buildMeditationCompletionLabel(log = {}) {
    const normalized = {
        ...normalizeMeditationLog(log),
        completionMethodId: typeof log.completionMethodId === 'string' ? log.completionMethodId : '',
        completionDurationSec: Number(log.completionDurationSec || 0)
    };
    if (!normalized.meditationDone && !log.done) return '';
    const completionMethodId = normalized.completionMethodId || normalized.meditationMethodId || '';
    const methodMeta = getMeditationMethodMeta(completionMethodId || DEFAULT_MEDITATION_METHOD_ID);
    const completionDurationSec = Number.isFinite(normalized.completionDurationSec) && normalized.completionDurationSec > 0
        ? Math.round(normalized.completionDurationSec)
        : normalized.meditationDurationSec;
    const parts = ['오늘 명상 완료'];
    if (completionMethodId) parts.push(methodMeta.name);
    if (completionDurationSec > 0) {
        parts.push(formatMeditationDurationLabel(completionDurationSec));
    }
    return parts.join(' · ');
}

export function getMeditationPhaseLine(methodId = '', {
    elapsedSec = 0,
    remainingSec = 0,
    totalSec = 0
} = {}) {
    if (remainingSec <= 0) {
        return getMeditationMethodMeta(methodId).completionLine;
    }

    const method = getMeditationMethodMeta(methodId);
    if (Array.isArray(method.phaseSteps) && method.phaseSteps.length > 0) {
        const cycleSec = method.phaseSteps.reduce((sum, phase) => sum + Number(phase.seconds || 0), 0) || 1;
        let offset = ((Math.max(0, Math.floor(elapsedSec)) % cycleSec) + cycleSec) % cycleSec;
        for (const phase of method.phaseSteps) {
            const phaseSec = Math.max(1, Number(phase.seconds || 0));
            if (offset < phaseSec) return phase.line;
            offset -= phaseSec;
        }
        return method.phaseSteps[0].line;
    }

    if (Array.isArray(method.segments) && method.segments.length > 0) {
        const safeTotal = Math.max(1, Number(totalSec || method.durationSec || 1));
        const progress = Math.min(1, Math.max(0, Number(elapsedSec || 0) / safeTotal));
        const segment = method.segments.find((item) => progress <= Number(item.untilRatio || 1))
            || method.segments[method.segments.length - 1];
        return segment.line;
    }

    return method.guide;
}

export function getMeditationPhaseUiState(methodId = '', {
    elapsedSec = 0,
    remainingSec = 0,
    totalSec = 0
} = {}) {
    const method = getMeditationMethodMeta(methodId);
    if (!Array.isArray(method.phaseSteps) || method.phaseSteps.length === 0) {
        return null;
    }

    const steps = method.phaseSteps.map((step) => ({ ...step }));
    if (remainingSec <= 0) {
        return {
            steps,
            activeIndex: steps.length - 1
        };
    }

    const cycleSec = steps.reduce((sum, phase) => sum + Math.max(1, Number(phase.seconds || 0)), 0) || 1;
    const wholeElapsedSec = Math.max(0, Math.floor(elapsedSec));
    const cycleIndex = Math.max(0, Math.floor(wholeElapsedSec / cycleSec));
    let offset = ((wholeElapsedSec % cycleSec) + cycleSec) % cycleSec;
    for (let index = 0; index < steps.length; index += 1) {
        const phaseSec = Math.max(1, Number(steps[index].seconds || 0));
        if (offset < phaseSec) {
            return {
                steps,
                activeIndex: Math.min(index, steps.length - 1),
                cycleIndex
            };
        }
        offset -= phaseSec;
    }

    const safeTotal = Math.max(1, Number(totalSec || method.durationSec || 1));
    const ratio = Math.min(1, Math.max(0, Number(elapsedSec || 0) / safeTotal));
    return {
        steps,
        activeIndex: Math.min(steps.length - 1, Math.floor(ratio * steps.length))
    };
}
