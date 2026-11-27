/**
 * 워치·휴대폰이 잰 운동·수면을 AI 분석에 넘길 글로 바꾼다 (2026-11-27 대표: "AI 분석도 붙어야지").
 * 사진 분석과 같은 함수(analyzeExercise · analyzeSleepMind)에 사진 대신 이 글을 보낸다.
 * 숫자만 담는다 — 이름·위치는 없다(동선 모양도 보내지 않는다).
 * 의존성이 없는 순수 모듈이다.
 */

const EXERCISE_NAMES = {
    walking: ['걷기', 'Walking'], running: ['달리기', 'Running'], running_treadmill: ['러닝머신', 'Treadmill run'],
    hiking: ['등산', 'Hiking'], biking: ['자전거', 'Cycling'], biking_stationary: ['실내 자전거', 'Indoor cycling'],
    swimming_pool: ['수영', 'Swimming'], strength_training: ['근력 운동', 'Strength training'],
    weightlifting: ['웨이트', 'Weightlifting'], yoga: ['요가', 'Yoga'], pilates: ['필라테스', 'Pilates'], hiit: ['인터벌 운동', 'HIIT']
};

function duration(minutes, english) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (english) return h ? `${h}h ${m}m` : `${m} min`;
    return h ? `${h}시간 ${m}분` : `${m}분`;
}

function paceText(minutes, km) {
    if (!(minutes > 0) || !(km >= 0.2)) return '';
    const perKm = minutes / km;
    if (perKm > 60) return '';
    let m = Math.floor(perKm);
    let s = Math.round((perKm - m) * 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}'${String(s).padStart(2, '0')}"`;
}

/** 분 칸 숫자 줄을 10칸 이하로 줄여 흐름만 (0 은 빈칸). */
function trend(series, maxPoints = 10) {
    const values = (Array.isArray(series) ? series : []).map(Number);
    if (values.filter((n) => n > 0).length < 2) return '';
    const step = Math.max(1, Math.ceil(values.length / maxPoints));
    const out = [];
    for (let i = 0; i < values.length; i += step) {
        const chunk = values.slice(i, i + step).filter((n) => n > 0);
        out.push(chunk.length ? Math.round(chunk.reduce((a, b) => a + b, 0) / chunk.length) : '-');
    }
    return out.join(', ');
}

function paceSeriesText(series) {
    const values = (Array.isArray(series) ? series : []).map(Number);
    if (values.filter((n) => n > 0).length < 2) return '';
    const step = Math.max(1, Math.ceil(values.length / 10));
    const out = [];
    for (let i = 0; i < values.length; i += step) {
        const chunk = values.slice(i, i + step).filter((n) => n > 0);
        if (!chunk.length) { out.push('-'); continue; }
        const sec = Math.round(chunk.reduce((a, b) => a + b, 0) / chunk.length);
        out.push(`${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, '0')}"`);
    }
    return out.join(', ');
}

/** 운동 한 번 → 분석용 글. 말이 안 되면 ''. */
export function buildExerciseAnalysisText(session, { english = false, formatClock = null } = {}) {
    if (!session || typeof session !== 'object') return '';
    const minutes = Number(session.minutes);
    if (!(minutes >= 1) || minutes > 600) return '';
    const [ko, en] = EXERCISE_NAMES[session.type] || [String(session.label || '운동').slice(0, 20), 'Workout'];
    const km = Number(session.distanceKm) > 0 ? Number(session.distanceKm) : 0;
    const start = typeof formatClock === 'function' ? formatClock(Number(session.startEpochMillis)) : '';
    const pace = paceText(minutes, km);
    const hrTrend = trend(session.hr);
    const paceTrend = paceSeriesText(session.pace);
    const lines = english
        ? [
            `Type: ${en}`,
            `Start: ${start || 'unknown'}, duration ${duration(minutes, true)}`,
            km ? `Distance: ${km} km` : '',
            pace ? `Average pace: ${pace}/km` : '',
            Number(session.kcal) > 0 ? `Active calories: ${Math.round(session.kcal)} kcal` : '',
            Number(session.hrAvg) > 0 ? `Heart rate: average ${Math.round(session.hrAvg)} bpm, max ${Math.round(session.hrMax || session.hrAvg)} bpm` : '',
            hrTrend ? `Heart rate over time: ${hrTrend}` : '',
            paceTrend ? `Pace over time (per km): ${paceTrend}` : '',
            `Measured by: ${String(session.providerLabel || 'Health Connect').slice(0, 60)}`
        ]
        : [
            `종목: ${ko}`,
            `시작: ${start || '모름'}, 운동 시간 ${duration(minutes, false)}`,
            km ? `거리: ${km}km` : '',
            pace ? `평균 페이스: ${pace}/km` : '',
            Number(session.kcal) > 0 ? `활동 칼로리: ${Math.round(session.kcal)}kcal` : '',
            Number(session.hrAvg) > 0 ? `심박: 평균 ${Math.round(session.hrAvg)}bpm, 최고 ${Math.round(session.hrMax || session.hrAvg)}bpm` : '',
            hrTrend ? `시간에 따른 심박: ${hrTrend}` : '',
            paceTrend ? `시간에 따른 1km 페이스: ${paceTrend}` : '',
            `측정 기기: ${String(session.providerLabel || 'Health Connect').slice(0, 60)}`
        ];
    return lines.filter(Boolean).join('\n');
}

/** 밤잠 한 번(sleepSync) → 분석용 글. 말이 안 되면 ''. */
export function buildSleepAnalysisText(sync, { english = false, formatClock = null } = {}) {
    if (!sync || typeof sync !== 'object') return '';
    const asleep = Number(sync.asleepMinutes);
    if (!(asleep > 0) || asleep > 24 * 60) return '';
    const clock = (ms) => (typeof formatClock === 'function' ? formatClock(Number(ms)) : '');
    const start = clock(sync.startEpochMillis);
    const end = clock(sync.endEpochMillis);
    // 깨어 있던 긴 틈 (조각 사이 30분 넘게 빈 곳)
    const gaps = [];
    const stages = Array.isArray(sync.stages) ? sync.stages.map(Number) : [];
    let lastEnd = null;
    for (let i = 0; i + 2 < stages.length; i += 3) {
        const from = stages[i];
        if (lastEnd !== null && from - lastEnd >= 30) gaps.push([lastEnd, from]);
        lastEnd = Math.max(lastEnd ?? 0, from + stages[i + 1]);
    }
    const base = Number(sync.startEpochMillis);
    const gapText = gaps.slice(0, 3).map(([a, b]) => `${clock(base + a * 60000)}~${clock(base + b * 60000)}`).join(', ');
    const stagesKnown = sync.hasStages === true;
    const lines = english
        ? [
            `Bedtime ${start || 'unknown'}, wake time ${end || 'unknown'}`,
            `Total sleep: ${duration(asleep, true)} (${Number(sync.sleepHours) || Math.round(asleep / 6) / 10} h)`,
            stagesKnown ? `Deep ${duration(sync.deepMinutes, true)}, REM ${duration(sync.remMinutes, true)}, light ${duration(sync.lightMinutes, true)}, awake ${duration(sync.awakeMinutes, true)}` : 'Sleep stages: not measured',
            gapText ? `Long awake periods in the night: ${gapText}` : '',
            `Measured by: ${String(sync.providerLabel || 'Health Connect').slice(0, 60)} (watch, no photo)`
        ]
        : [
            `잠든 시각 ${start || '모름'}, 깬 시각 ${end || '모름'}`,
            `잔 시간: ${duration(asleep, false)} (${Number(sync.sleepHours) || Math.round(asleep / 6) / 10}시간)`,
            stagesKnown ? `깊은 잠 ${duration(sync.deepMinutes, false)}, 렘 ${duration(sync.remMinutes, false)}, 얕은 잠 ${duration(sync.lightMinutes, false)}, 깸 ${duration(sync.awakeMinutes, false)}` : '수면 단계: 측정 안 됨',
            gapText ? `밤사이 길게 깨어 있던 때: ${gapText}` : '',
            `측정 기기: ${String(sync.providerLabel || 'Health Connect').slice(0, 60)} (워치 기록, 사진 없음)`
        ];
    return lines.filter(Boolean).join('\n');
}

/** 이 운동에 분석을 새로 붙여야 하는가 — 없거나, 분석 뒤 기록이 바뀌었을 때. */
export function needsExerciseAnalysis(session) {
    if (!session || typeof session !== 'object') return false;
    if (!(Number(session.minutes) >= 10)) return false;
    const analysis = session.aiAnalysis;
    if (!analysis || typeof analysis !== 'object') return true;
    return analysis.basis !== analysisBasis(session);
}

/** 분석을 만든 기록의 지문 — 거리·시간·심박 칸 수가 바뀌면 다시 분석한다. */
export function analysisBasis(session) {
    return [
        Number(session?.startEpochMillis) || 0,
        Number(session?.minutes) || 0,
        Number(session?.distanceKm) || 0,
        Array.isArray(session?.hr) ? session.hr.length : 0,
        Array.isArray(session?.pace) ? session.pace.length : 0
    ].join(':');
}

/** 수면 분석을 새로 붙여야 하는가. 수면 캡처 분석이 있으면 그것이 먼저다. */
export function needsSleepAnalysis(sleepAndMind) {
    const sam = sleepAndMind && typeof sleepAndMind === 'object' ? sleepAndMind : {};
    const sync = sam.sleepSync;
    if (!sync || sync.source !== 'health_connect' || sam.sleepImageUrl) return false;
    if (Number(sam.sleepHours) !== Number(sync.sleepHours)) return false;
    const analysis = sam.sleepAnalysis;
    if (!analysis || typeof analysis !== 'object') return true;
    if (analysis.source !== 'health_connect') return false; // 회원이 따로 받은 분석은 두고
    return analysis.basis !== sleepBasis(sync);
}

export function sleepBasis(sync) {
    return [
        Number(sync?.startEpochMillis) || 0,
        Number(sync?.endEpochMillis) || 0,
        Number(sync?.asleepMinutes) || 0,
        Array.isArray(sync?.stages) ? sync.stages.length : 0
    ].join(':');
}
