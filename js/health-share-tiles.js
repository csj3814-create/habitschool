/**
 * 「내 카드 공유」에 들어가는 워치 운동·수면 타일 (2026-11-27 대표: "자랑 카드는 갤러리 내 카드
 * 공유로 넘기는 게 나을듯. 1:1이 인스타 공유하기엔 제일 좋지").
 *
 * 사진처럼 정사각형 그림(1080×1080)을 만들어 공유 카드의 사진 칸에 넣는다. 공유 카드는 칸 모양에
 * 맞춰 가운데를 잘라 쓰므로(drawPosterMediaTiles, cover), 글자와 그림은 가운데 760×760 안에 둔다.
 *
 * 지도 없이 달린 길 모양만 — 여기 오는 동선은 기기에서 비율만 남긴 모양이다(WorkoutDetailCodec).
 * 그리기만 한다. 의존성은 카드 모듈의 작은 도우미뿐이다.
 */
import { formatPace, hypnogramRuns, routePoints, smoothHypnogramPath } from './health-cards.js?v=622';

export const TILE_SIZE = 1080;
// 가운데 안전 상자 — 칸이 가로·세로로 길어도 잘리지 않는 곳
const SAFE = { x: 160, y: 160, w: 760, h: 760 };
const FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';

const TYPE_NAMES = {
    walking: ['걷기', 'Walk', '🚶'], running: ['달리기', 'Run', '🏃'], running_treadmill: ['러닝머신', 'Treadmill', '🏃'],
    hiking: ['등산', 'Hike', '🥾'], biking: ['자전거', 'Ride', '🚴'], biking_stationary: ['실내 자전거', 'Indoor ride', '🚴'],
    swimming_pool: ['수영', 'Swim', '🏊'], strength_training: ['근력 운동', 'Strength', '💪'], yoga: ['요가', 'Yoga', '🧘'],
    pilates: ['필라테스', 'Pilates', '🧘'], hiit: ['인터벌 운동', 'HIIT', '🔥']
};

/** 59분 → 59:00, 62분 → 1:02:00 */
export function formatClockDuration(totalMinutes, startMs, endMs) {
    const seconds = Number.isFinite(endMs - startMs) && endMs > startMs
        ? Math.round((endMs - startMs) / 1000)
        : Math.round(Number(totalMinutes) * 60);
    if (!(seconds > 0)) return '';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function durationText(minutes, english) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (english) return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m} min`;
    return h ? (m ? `${h}시간 ${m}분` : `${h}시간`) : `${m}분`;
}

/** 운동 타일에 쓸 글자·숫자. 그리기와 떼어 두어 테스트한다. */
export function buildWorkoutTileModel(item, { english = false, startClock = '' } = {}) {
    if (!item || typeof item !== 'object') return null;
    const minutes = Number(item.minutes);
    if (!(minutes > 0) || minutes > 600) return null;
    const [ko, en, emoji] = TYPE_NAMES[item.type] || [String(item.label || '운동').slice(0, 12), 'Workout', '🏅'];
    const km = Number(item.distanceKm) > 0 && Number(item.distanceKm) <= 300 ? Number(item.distanceKm) : 0;
    const pace = km > 0 ? formatPace(minutes, km) : '';
    const time = formatClockDuration(minutes, Number(item.startEpochMillis), Number(item.endEpochMillis));
    const stats = [
        km > 0 ? time : '',
        pace ? `${pace}/km` : '',
        Number(item.hrAvg) > 0 && Number(item.hrAvg) <= 230 ? `♥ ${Math.round(item.hrAvg)}` : '',
        Number(item.kcal) > 0 && Number(item.kcal) <= 5000 ? `${Math.round(item.kcal)}kcal` : ''
    ].filter(Boolean).slice(0, 3);
    return {
        title: `${emoji} ${english ? en : ko}`,
        when: startClock,
        big: km > 0 ? km.toFixed(2) : time,
        unit: km > 0 ? 'km' : '',
        stats,
        route: routePoints(item.route),
        provider: String(item.providerLabel || 'Health Connect').slice(0, 30)
    };
}

/** 수면 타일 모델. night 는 sleepAndMind.sleepSync. */
export function buildSleepTileModel(night, { english = false, startClock = '', endClock = '' } = {}) {
    if (!night || typeof night !== 'object') return null;
    const asleep = Number(night.asleepMinutes);
    if (!(asleep > 0) || asleep > 24 * 60) return null;
    const span = (Number(night.endEpochMillis) - Number(night.startEpochMillis)) / 60000;
    const stages = Array.isArray(night.stages) && night.hasStages === true ? night.stages.map(Number) : [];
    const totals = [
        ['deep', english ? 'Deep' : '깊은 잠', Number(night.deepMinutes) || 0],
        ['rem', english ? 'REM' : '렘', Number(night.remMinutes) || 0],
        ['light', english ? 'Light' : '얕은 잠', Number(night.lightMinutes) || 0]
    ].filter(([, , m]) => m > 0 && m <= 24 * 60);
    return {
        title: `🌙 ${english ? 'Sleep' : '수면'}`,
        big: durationText(asleep, english),
        window: startClock && endClock ? `${startClock} ~ ${endClock}` : '',
        span: span > 0 && span <= 24 * 60 ? span : 0,
        stages,
        totals: night.hasStages === true ? totals : [],
        provider: String(night.providerLabel || 'Health Connect').slice(0, 30),
        english
    };
}

function background(ctx, from, mid, to, glowColor) {
    const S = TILE_SIZE;
    const bg = ctx.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, from);
    bg.addColorStop(0.55, mid);
    bg.addColorStop(1, to);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, S, S);
    const glow = ctx.createRadialGradient(S * 0.72, S * 0.3, 30, S * 0.72, S * 0.3, 560);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let i = 40; i < S; i += 80) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
}

function header(ctx, title, right) {
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 60px ${FONT}`;
    ctx.fillText(title, SAFE.x + 10, SAFE.y + 70);
    if (right) {
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.font = `600 34px ${FONT}`;
        ctx.fillText(right, SAFE.x + SAFE.w - 10, SAFE.y + 66);
        ctx.textAlign = 'left';
    }
}

function glowGradient(ctx, box) {
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    gradient.addColorStop(0, '#69F0AE');
    gradient.addColorStop(0.55, '#FFE57F');
    gradient.addColorStop(1, '#FF9E40');
    return gradient;
}

function strokeGlow(ctx, box, drawPath, width = 20) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(105, 240, 174, 0.55)';
    ctx.shadowBlur = 32;
    ctx.strokeStyle = glowGradient(ctx, box);
    ctx.lineWidth = width;
    drawPath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = width * 0.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    drawPath();
    ctx.stroke();
    ctx.restore();
}

function dot(ctx, x, y, color) {
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
}

function drawRoute(ctx, points, box) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const spanX = Math.max(1, Math.max(...xs) - minX);
    const spanY = Math.max(1, Math.max(...ys) - minY);
    const scale = Math.min(box.w / spanX, box.h / spanY);
    const offX = box.x + (box.w - spanX * scale) / 2;
    const offY = box.y + (box.h - spanY * scale) / 2;
    const mapped = points.map(([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale]);
    strokeGlow(ctx, box, () => {
        ctx.beginPath();
        mapped.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    });
    const [sx, sy] = mapped[0];
    const [ex, ey] = mapped[mapped.length - 1];
    dot(ctx, sx, sy, '#00E676');
    dot(ctx, ex, ey, '#FF6D00');
}

/** 동선이 없을 때(러닝머신·권한 없음·워치 앱이 안 씀) 그리는 육상 트랙. */
function drawTrack(ctx, box) {
    const w = box.w;
    const h = Math.min(box.h, w * 0.5);
    const x = box.x;
    const y = box.y + (box.h - h) / 2;
    const lane = (inset) => {
        const r = (h - inset * 2) / 2;
        ctx.beginPath();
        ctx.moveTo(x + inset + r, y + inset);
        ctx.lineTo(x + w - inset - r, y + inset);
        ctx.arc(x + w - inset - r, y + h / 2, r, -Math.PI / 2, Math.PI / 2);
        ctx.lineTo(x + inset + r, y + h - inset);
        ctx.arc(x + inset + r, y + h / 2, r, Math.PI / 2, Math.PI * 1.5);
        ctx.closePath();
    };
    strokeGlow(ctx, box, () => lane(0), 18);
    ctx.save();
    ctx.setLineDash([16, 14]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    lane(40);
    ctx.stroke();
    lane(80);
    ctx.stroke();
    ctx.restore();
    const r = h / 2;
    const angle = Math.PI * 0.2;
    dot(ctx, x + w - r + Math.cos(angle) * r, y + h / 2 + Math.sin(angle) * r, '#FF6D00');
}

/** 운동 타일 (1080×1080). */
export function drawWorkoutTile(canvas, model) {
    const S = TILE_SIZE;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    background(ctx, '#0A1A2F', '#0B3A3A', '#10462F', 'rgba(255, 183, 77, 0.22)');
    header(ctx, model.title, model.when);

    const box = { x: SAFE.x + 70, y: SAFE.y + 120, w: SAFE.w - 140, h: 330 };
    if (model.route.length >= 2) drawRoute(ctx, model.route, box);
    else drawTrack(ctx, box);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 150px ${FONT}`;
    const bigWidth = ctx.measureText(model.big).width;
    ctx.font = `700 56px ${FONT}`;
    const unitWidth = model.unit ? ctx.measureText(model.unit).width + 14 : 0;
    const startX = S / 2 - (bigWidth + unitWidth) / 2;
    ctx.textAlign = 'left';
    ctx.font = `900 150px ${FONT}`;
    ctx.fillText(model.big, startX, SAFE.y + 615);
    if (model.unit) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.font = `700 56px ${FONT}`;
        ctx.fillText(model.unit, startX + bigWidth + 14, SAFE.y + 615);
    }

    if (model.stats.length) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = `700 46px ${FONT}`;
        ctx.fillText(model.stats.join('   ·   '), S / 2, SAFE.y + 705);
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.font = `500 30px ${FONT}`;
    ctx.fillText(model.provider, S / 2, SAFE.y + 760);
    ctx.textAlign = 'left';
    return canvas;
}

/** 수면 타일 (1080×1080). */
export function drawSleepTile(canvas, model) {
    const S = TILE_SIZE;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    background(ctx, '#0B1026', '#1A1A4A', '#2A1F5C', 'rgba(255, 224, 130, 0.18)');
    header(ctx, model.title, model.provider);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 120px ${FONT}`;
    ctx.fillText(model.big, S / 2, SAFE.y + 250);
    if (model.window) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `600 42px ${FONT}`;
        ctx.fillText(model.window, S / 2, SAFE.y + 320);
    }
    ctx.textAlign = 'left';

    const box = { x: SAFE.x + 80, y: SAFE.y + 380, w: SAFE.w - 100, h: 240 };
    const row = box.h / 4;
    if (model.stages.length >= 3 && model.span > 0) {
        // 밤사이 단계 — 위에서부터 깸 · 렘 · 얕은 잠 · 깊은 잠
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        for (let r = 0; r < 4; r++) {
            ctx.beginPath();
            ctx.moveTo(box.x, box.y + r * row + row / 2);
            ctx.lineTo(box.x + box.w, box.y + r * row + row / 2);
            ctx.stroke();
        }
        // 깸·렘·얕은 잠·깊은 잠을 오르내리는 계단선 (기록 카드와 같은 hypnogramRuns)
        const runs = hypnogramRuns(model.stages, model.span);
        const yOf = (level) => box.y + level * row + row / 2;
        const xOf = (t) => box.x + t * box.w;
        const stroke = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
        stroke.addColorStop(0.1, '#FFB74D');
        stroke.addColorStop(0.38, '#B39DDB');
        stroke.addColorStop(0.62, '#9FA8DA');
        stroke.addColorStop(0.9, '#7986CB');
        const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
        fill.addColorStop(0, 'rgba(179, 157, 219, 0.35)');
        fill.addColorStop(1, 'rgba(121, 134, 203, 0.05)');
        const trace = (cmds) => cmds.forEach(([op, ...n]) => {
            if (op === 'M') ctx.moveTo(n[0], n[1]);
            else if (op === 'L') ctx.lineTo(n[0], n[1]);
            else ctx.bezierCurveTo(n[0], n[1], n[2], n[3], n[4], n[5]);
        });
        const paths = runs.map((run) => smoothHypnogramPath(run, xOf, yOf));
        paths.forEach((cmds, i) => {
            const run = runs[i];
            ctx.beginPath();
            ctx.moveTo(xOf(run[0].x0), box.y + box.h);
            ctx.lineTo(xOf(run[0].x0), yOf(run[0].level));
            trace(cmds.slice(1));
            ctx.lineTo(xOf(run[run.length - 1].x1), box.y + box.h);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
        });
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(179, 157, 219, 0.6)';
        ctx.shadowBlur = 18;
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 8;
        paths.forEach((cmds) => {
            ctx.beginPath();
            trace(cmds);
            ctx.stroke();
        });
        ctx.restore();
        // 줄 이름
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = `600 24px ${FONT}`;
        ctx.textAlign = 'right';
        (model.english ? ['Awake', 'REM', 'Light', 'Deep'] : ['깸', '렘', '얕은', '깊은'])
            .forEach((label, r) => ctx.fillText(label, box.x - 12, yOf(r) + 8));
        ctx.textAlign = 'left';
    } else if (model.totals.length) {
        // 단계 조각이 없으면 비율 막대
        const total = model.totals.reduce((sum, [, , m]) => sum + m, 0);
        let x = box.x;
        const colors = { deep: '#5C6BC0', rem: '#B39DDB', light: '#9FA8DA' };
        model.totals.forEach(([key, , m]) => {
            const w = (m / total) * box.w;
            ctx.fillStyle = colors[key];
            ctx.fillRect(x, box.y + box.h / 2 - 28, w, 56);
            x += w;
        });
    }

    if (model.totals.length) {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.font = `600 38px ${FONT}`;
        ctx.fillText(model.totals.map(([, label, m]) => `${label} ${durationText(m, model.english)}`).join('  ·  '), S / 2, SAFE.y + 700);
        ctx.textAlign = 'left';
    }
    return canvas;
}
