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
// 동선·심박·속도를 읽는 종목 — android HealthConnectManager.DETAIL_EXERCISE_TYPES 와 같다.
const DETAIL_TYPES = new Set(['walking', 'running', 'running_treadmill', 'hiking', 'biking']);
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
/**
 * 단계 조각 → 이어진 구간 묶음. 이어진 조각(2분 안)은 한 묶음, 떨어진 곳(깨어 있던 사이 등)은 끊는다.
 * 묶음은 평평한 칸 [{ x0, x1, level }] 의 목록 — x 는 0~1, level 은 0 깸 · 1 렘 · 2 얕은 · 3 깊은.
 */
export function hypnogramRuns(stages, totalMinutes) {
    const total = Number(totalMinutes);
    if (!Array.isArray(stages) || stages.length < 3 || !(total > 0) || total > 24 * 60) return [];
    const segments = [];
    for (let i = 0; i + 2 < stages.length && segments.length < 120; i += 3) {
        const from = Number(stages[i]);
        const length = Number(stages[i + 1]);
        const row = HYPNO_ROWS[Number(stages[i + 2])];
        if (!row || !(from >= 0) || !(length > 0) || from + length > total + 1) continue;
        segments.push({ from, to: from + length, level: row[0] });
    }
    segments.sort((x, y) => x.from - y.from);
    const runs = [];
    let run = null;
    let lastEnd = -Infinity;
    segments.forEach(({ from, to, level }) => {
        if (!run || from - lastEnd > 2) {
            run = [];
            runs.push(run);
        }
        const prev = run[run.length - 1];
        if (prev && prev.level === level) prev.x1 = Math.min(1, to / total);
        else run.push({ x0: from / total, x1: Math.min(1, to / total), level });
        lastEnd = Math.max(lastEnd, to);
    });
    return runs;
}

/**
 * 부드러운 수면 선 (2026-11-27 대표: "부드러운 선으로"). 칸과 칸 사이를 S자 곡선으로 잇는다.
 * 돌려주는 것: ['M', x, y] · ['L', x, y] · ['C', c1x, c1y, c2x, c2y, x, y] — SVG 와 캔버스가 같이 쓴다.
 * bend: 곡선이 차지하는 가로 길이(0~1). 칸이 짧으면 그 절반까지만.
 */
export function smoothHypnogramPath(run, toX, toY, bend = 0.018) {
    if (!Array.isArray(run) || !run.length) return [];
    const cmds = [['M', toX(run[0].x0), toY(run[0].level)]];
    run.forEach((cell, i) => {
        const next = run[i + 1];
        if (!next) {
            cmds.push(['L', toX(cell.x1), toY(cell.level)]);
            return;
        }
        const edge = (cell.x1 + next.x0) / 2;
        const r = Math.min(bend, (cell.x1 - cell.x0) / 2, (next.x1 - next.x0) / 2);
        cmds.push(['L', toX(edge - r), toY(cell.level)]);
        cmds.push(['C', toX(edge), toY(cell.level), toX(edge), toY(next.level), toX(edge + r), toY(next.level)]);
    });
    return cmds;
}

function pathString(cmds) {
    return cmds.map(([op, ...n]) => `${op}${n.map((v) => v.toFixed(1)).join(' ')}`).join(' ');
}

let hypnogramId = 0;

/**
 * 단계 조각(펴 놓은 [시작 분, 길이 분, 코드, …])으로 밤사이 수면 그래프 SVG — 깸·렘·얕은 잠·깊은 잠을
 * 부드럽게 오르내리는 선(2026-11-27 대표: "수면은 바 말고 그래프로", "부드러운 선으로"). 없으면 ''.
 */
export function buildHypnogramSvg(stages, totalMinutes, { english = false } = {}) {
    const runs = hypnogramRuns(stages, totalMinutes);
    if (!runs.length) return '';
    const W = 300;
    const ROW = 16;
    const H = ROW * 4;
    const toX = (t) => t * W;
    const toY = (level) => level * ROW + ROW / 2;
    const id = `hcHyp${++hypnogramId}`;
    const paths = runs.map((run) => smoothHypnogramPath(run, toX, toY));
    const line = paths.map(pathString).join(' ');
    const area = paths.map((cmds, i) => {
        const run = runs[i];
        return `M${toX(run[0].x0).toFixed(1)} ${H} L${toX(run[0].x0).toFixed(1)} ${toY(run[0].level)} `
            + pathString(cmds.slice(1)) + ` L${toX(run[run.length - 1].x1).toFixed(1)} ${H} Z`;
    }).join(' ');
    const label = english ? 'Sleep stages over the night' : '밤사이 수면 단계';
    const rowLabels = english ? ['Awake', 'REM', 'Light', 'Deep'] : ['깸', '렘', '얕은', '깊은'];
    // 위(깸)는 주황, 아래(깊은 잠)는 남색 — 선 색이 높이를 따라 바뀐다.
    const gradient = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">`
        + `<stop offset="0.1" stop-color="#F2A93B"/><stop offset="0.38" stop-color="#9575CD"/>`
        + `<stop offset="0.62" stop-color="#7986CB"/><stop offset="0.9" stop-color="#303F9F"/></linearGradient>`;
    return `<div class="hc-hypnogram"><div class="hc-hyp-labels">${rowLabels.map((t) => `<span>${t}</span>`).join('')}</div>`
        + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${label}"><defs>${gradient}</defs>`
        + `${[0, 1, 2, 3].map((r) => `<line class="hc-hyp-grid" x1="0" x2="${W}" y1="${toY(r)}" y2="${toY(r)}"/>`).join('')}`
        + `<path class="hc-hyp-area" d="${area}" fill="url(#${id})"/>`
        + `<path class="hc-hyp-line" d="${line}" stroke="url(#${id})"/></svg></div>`;
}

/** 동선 모양 [x, y, …](0~1000) → 점 목록. 말이 안 되면 []. 공유 카드 타일(js/health-share-tiles.js)도 쓴다. */
export function routePoints(route) {
    if (!Array.isArray(route) || route.length < 4 || route.length % 2) return [];
    const points = [];
    for (let i = 0; i + 1 < route.length && points.length < 150; i += 2) {
        const x = Number(route[i]);
        const y = Number(route[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) return [];
        points.push([x, y]);
    }
    return points;
}

/** 달린 길 모양. 지도 없이 선만 — 비율만 남은 모양이라 어디인지 알 수 없다. */
export function buildRouteSvg(route, { english = false } = {}) {
    const points = routePoints(route);
    if (points.length < 2) return '';
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const pad = 40;
    const minX = Math.min(...xs) - pad;
    const minY = Math.min(...ys) - pad;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2;
    const h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
    const [sx, sy] = points[0];
    const [ex, ey] = points[points.length - 1];
    return `<svg class="hc-route" viewBox="${minX} ${minY} ${w} ${h}" role="img" aria-label="${english ? 'Route shape' : '달린 길 모양'}">`
        + `<path class="hc-route-line" d="${d}"/>`
        + `<circle class="hc-route-start" cx="${sx}" cy="${sy}" r="${Math.max(w, h) * 0.022}"/>`
        + `<circle class="hc-route-end" cx="${ex}" cy="${ey}" r="${Math.max(w, h) * 0.022}"/>`
        + `</svg>`;
}

/** 분 단위 값 줄그래프. 0 은 빈칸(끊어 그린다). invert: 작을수록 위(페이스). */
export function buildSeriesSvg(series, { invert = false, cls = '' } = {}) {
    if (!Array.isArray(series) || series.length < 2) return '';
    const values = series.map(Number).filter((n) => n > 0);
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const W = 300;
    const H = 40;
    const step = W / (series.length - 1);
    let d = '';
    let pen = false;
    series.forEach((raw, i) => {
        const v = Number(raw);
        if (!(v > 0)) { pen = false; return; }
        const t = (v - min) / span;
        const y = 4 + (invert ? t : 1 - t) * (H - 8);
        d += `${pen ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)} `;
        pen = true;
    });
    return `<svg class="hc-series ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d.trim()}"/></svg>`;
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
export function buildHealthExerciseCardHtml(item, { english = false, formatClock = null, label = '', compact = false, offerDetail = false } = {}) {
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
    const hrAvg = num(item.hrAvg, 230);
    const stats = [
        pace ? [english ? 'Pace' : '페이스', `${pace}/km`] : null,
        hrAvg > 0 ? [english ? 'Avg HR' : '평균 심박', `${Math.round(hrAvg)}bpm`] : null,
        kcal > 0 ? [english ? 'Calories' : '칼로리', `${Math.round(kcal)}kcal`] : null,
        start ? [english ? 'Start' : '시작', start] : null
    ].filter(Boolean);

    // 1.0.16: 동선 · 심박 · 구간 페이스
    const routeSvg = buildRouteSvg(item.route, { english });
    const hrSvg = buildSeriesSvg(item.hr, { cls: 'hc-series-hr' });
    const paceSvg = buildSeriesSvg(item.pace, { invert: true, cls: 'hc-series-pace' });
    const series = [
        hrSvg ? `<div class="hc-series-row"><em>${english ? 'Heart rate' : '심박'}</em>${hrSvg}</div>` : '',
        paceSvg ? `<div class="hc-series-row"><em>${english ? 'Pace' : '페이스'}</em>${paceSvg}</div>` : ''
    ].join('');
    // 동선·심박·속도 권한은 앱을 열 때 묻지 않는다(시작이 느려지면 안 된다). 여기서 한 번 권한다.
    const detailButton = offerDetail && DETAIL_TYPES.has(type) && !routeSvg && !hrSvg && !paceSvg
        ? `<button type="button" class="hc-detail-btn" data-hc-detail="1">🗺️ ${english ? 'Show my route & heart rate' : '동선·심박도 가져오기'}</button>`
        : '';

    return `<div class="hc-card hc-exercise-card${compact ? ' hc-card-compact' : ''}${routeSvg ? ' has-route' : ''}">
        <div class="hc-card-head"><span class="hc-card-kind">${emoji} ${esc(name)}</span><span class="hc-card-src">${esc(provider)}</span></div>
        <div class="hc-card-body">
            <div class="hc-card-text">
                <div class="hc-card-main">${headline}</div>
                ${stats.length ? `<div class="hc-card-stats">${stats.map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}</div>` : ''}
            </div>
            ${routeSvg}
        </div>
        ${series}${detailButton}
    </div>`;
}
