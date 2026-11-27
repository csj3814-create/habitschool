/**
 * 워치·폰이 잰 수면과 운동을 카드로 그린다 (2026-11-27 대표: "수면 그래프 채로,
 * 따로 이미지 공유로 수면 등록할 필요 없이. 운동도 마찬가지").
 *
 * 사진 파일을 만들지 않는다. 기록에 이미 있는 값(sleepAndMind.sleepSync,
 * exercise.healthSessions)으로 그때그때 그린다. 기록 화면과 갤러리가 같은 카드를 쓴다.
 *
 * 들어오는 값은 저장된 기록이다 — 누구든 고칠 수 있다고 보고 숫자만 받아 쓴다.
 * 의존성이 없는 순수 모듈이다.
 */

const STAGES = [
    { key: 'deepMinutes', cls: 'deep', ko: '깊은 잠', en: 'Deep' },
    { key: 'remMinutes', cls: 'rem', ko: '렘', en: 'REM' },
    { key: 'lightMinutes', cls: 'light', ko: '얕은 잠', en: 'Light' },
    { key: 'awakeMinutes', cls: 'awake', ko: '깸', en: 'Awake' }
];

const EXERCISE_EMOJI = {
    walking: '🚶', running: '🏃', running_treadmill: '🏃', hiking: '🥾',
    stair_climbing: '🪜', stair_climbing_machine: '🪜', biking: '🚴', biking_stationary: '🚴',
    swimming_pool: '🏊', swimming_open_water: '🏊', strength_training: '💪', weightlifting: '🏋️',
    yoga: '🧘', pilates: '🧘', hiit: '🔥', dancing: '💃'
};
const EXERCISE_EN = {
    walking: 'Walking', running: 'Running', running_treadmill: 'Treadmill', hiking: 'Hiking',
    biking: 'Cycling', biking_stationary: 'Indoor cycling', swimming_pool: 'Swimming',
    swimming_open_water: 'Open-water swimming', strength_training: 'Strength training',
    weightlifting: 'Weightlifting', yoga: 'Yoga', pilates: 'Pilates', hiit: 'HIIT', dancing: 'Dancing'
};
// 페이스(분/km)를 보여 주는 종목.
const PACE_TYPES = new Set(['walking', 'running', 'running_treadmill', 'hiking']);

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function num(value, max) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= max ? n : 0;
}

function duration(totalMinutes, english) {
    const value = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (english) return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m} min`;
    return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}

function clock(epochMillis, formatClock) {
    const ms = Number(epochMillis);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return typeof formatClock === 'function' ? formatClock(ms) : '';
}

// 시간축 그래프의 줄 — 위에서부터 깸 · 렘 · 얕은 잠 · 깊은 잠 (흔히 쓰는 수면 그래프 순서).
// 코드는 js/health-connect-activity.js SLEEP_STAGE_CODES. 0(단계 모름)은 얕은 잠 줄에 회색으로.
const HYPNO_ROWS = { 1: [0, 'awake'], 4: [1, 'rem'], 2: [2, 'light'], 3: [3, 'deep'], 0: [2, 'sleeping'] };

/**
 * 단계 조각(펴 놓은 [시작 분, 길이 분, 코드, …])으로 시간축 수면 그래프 SVG.
 * 그릴 것이 없으면 ''.
 */
export function buildHypnogramSvg(stages, totalMinutes, { english = false } = {}) {
    const total = Number(totalMinutes);
    if (!Array.isArray(stages) || stages.length < 3 || !(total > 0) || total > 24 * 60) return '';
    const W = 300;
    const ROW = 16;
    const rects = [];
    for (let i = 0; i + 2 < stages.length && rects.length < 120; i += 3) {
        const from = Number(stages[i]);
        const length = Number(stages[i + 1]);
        const row = HYPNO_ROWS[Number(stages[i + 2])];
        if (!row || !(from >= 0) || !(length > 0) || from + length > total + 1) continue;
        const x = (from / total) * W;
        const w = Math.max(0.8, (length / total) * W);
        rects.push(`<rect class="hc-hyp-${row[1]}" x="${x.toFixed(1)}" y="${row[0] * ROW + 2}" width="${w.toFixed(1)}" height="${ROW - 4}" rx="2"/>`);
    }
    if (!rects.length) return '';
    const label = english ? 'Sleep stages over the night' : '밤사이 수면 단계';
    const rowLabels = english ? ['Awake', 'REM', 'Light', 'Deep'] : ['깸', '렘', '얕은', '깊은'];
    return `<div class="hc-hypnogram"><div class="hc-hyp-labels">${rowLabels.map((t) => `<span>${t}</span>`).join('')}</div>`
        + `<svg viewBox="0 0 ${W} ${ROW * 4}" preserveAspectRatio="none" role="img" aria-label="${label}">`
        + `${[0, 1, 2, 3].map((r) => `<line class="hc-hyp-grid" x1="0" x2="${W}" y1="${r * ROW + ROW / 2}" y2="${r * ROW + ROW / 2}"/>`).join('')}`
        + `${rects.join('')}</svg></div>`;
}

/** 1km 에 걸린 시간. 6'10" */
export function formatPace(minutes, distanceKm) {
    const min = Number(minutes);
    const km = Number(distanceKm);
    if (!(min > 0) || !(km >= 0.2)) return '';
    const perKm = min / km;
    if (perKm > 60) return '';
    let m = Math.floor(perKm);
    let s = Math.round((perKm - m) * 60);
    if (s === 60) { m += 1; s = 0; }
    return `${m}'${String(s).padStart(2, '0')}"`;
}

/**
 * 수면 카드. night 는 sleepSync 또는 pickNightSleep 결과.
 * formatClock(ms) 는 회원 시간대의 "HH:MM" 을 돌려준다.
 */
export function buildHealthSleepCardHtml(night, { english = false, formatClock = null, compact = false } = {}) {
    if (!night || typeof night !== 'object') return '';
    const asleep = num(night.asleepMinutes, 24 * 60);
    if (!(asleep > 0)) return '';
    const provider = String(night.providerLabel || 'Health Connect').slice(0, 40);
    const start = clock(night.startEpochMillis, formatClock);
    const end = clock(night.endEpochMillis, formatClock);
    const stages = STAGES
        .map((s) => ({ ...s, minutes: num(night[s.key], 24 * 60) }))
        .filter((s) => s.minutes > 0);
    const total = stages.reduce((sum, s) => sum + s.minutes, 0);
    const showStages = night.hasStages === true && total > 0;

    const bar = showStages
        ? `<div class="hc-stage-bar" role="img" aria-label="${esc(stages.map((s) => `${english ? s.en : s.ko} ${duration(s.minutes, english)}`).join(', '))}">${
            stages.map((s) => `<span class="hc-stage hc-stage-${s.cls}" style="width:${(s.minutes / total * 100).toFixed(1)}%"></span>`).join('')
        }</div>`
        : '';
    const legend = showStages
        ? `<div class="hc-stage-legend">${stages.map((s) =>
            `<span><i class="hc-dot hc-stage-${s.cls}"></i>${esc(english ? s.en : s.ko)} ${esc(duration(s.minutes, english))}</span>`).join('')}</div>`
        : '';

    // 단계 조각이 있으면(플레이 앱 1.0.15~) 시간축 그래프, 없으면 비율 막대.
    const spanMinutes = (Number(night.endEpochMillis) - Number(night.startEpochMillis)) / 60000;
    const hypnogram = showStages ? buildHypnogramSvg(night.stages, spanMinutes, { english }) : '';
    const axis = hypnogram && start && end
        ? `<div class="hc-hyp-axis"><span>${esc(start)}</span><span>${esc(end)}</span></div>`
        : '';

    return `<div class="hc-card hc-sleep-card${compact ? ' hc-card-compact' : ''}">
        <div class="hc-card-head"><span class="hc-card-kind">🌙 ${english ? 'Sleep' : '수면'}</span><span class="hc-card-src">${esc(provider)}</span></div>
        <div class="hc-card-main"><strong>${esc(duration(asleep, english))}</strong>${start && end ? `<span>${esc(start)} ~ ${esc(end)}</span>` : ''}</div>
        ${hypnogram ? hypnogram + axis : bar}${legend}
    </div>`;
}

/** 운동 카드 하나. item 은 exercise.healthSessions 의 한 칸. */
export function buildHealthExerciseCardHtml(item, { english = false, formatClock = null, label = '', compact = false } = {}) {
    if (!item || typeof item !== 'object') return '';
    const minutes = num(item.minutes, 600);
    if (!(minutes > 0)) return '';
    const type = String(item.type || 'other');
    const name = english ? (EXERCISE_EN[type] || 'Workout') : (label || item.label || '운동');
    const emoji = EXERCISE_EMOJI[type] || '🏅';
    const provider = String(item.providerLabel || 'Health Connect').slice(0, 40);
    const km = num(item.distanceKm, 300);
    const kcal = num(item.kcal, 5000);
    const pace = PACE_TYPES.has(type) ? formatPace(minutes, km) : '';
    const start = clock(item.startEpochMillis, formatClock);

    const headline = km > 0
        ? `<strong>${esc(km)}<small>km</small></strong><span>${esc(duration(minutes, english))}</span>`
        : `<strong>${esc(duration(minutes, english))}</strong>`;
    const stats = [
        pace ? [english ? 'Pace' : '페이스', `${pace}/km`] : null,
        kcal > 0 ? [english ? 'Calories' : '칼로리', `${Math.round(kcal)}kcal`] : null,
        start ? [english ? 'Start' : '시작', start] : null
    ].filter(Boolean);

    return `<div class="hc-card hc-exercise-card${compact ? ' hc-card-compact' : ''}">
        <div class="hc-card-head"><span class="hc-card-kind">${emoji} ${esc(name)}</span><span class="hc-card-src">${esc(provider)}</span></div>
        <div class="hc-card-main">${headline}</div>
        ${stats.length ? `<div class="hc-card-stats">${stats.map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}</div>` : ''}
    </div>`;
}
