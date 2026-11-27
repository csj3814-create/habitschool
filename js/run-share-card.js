/**
 * 워치로 잰 운동 한 번을 SNS 에 올릴 「자랑 카드」 이미지로 그린다 (2026-11-27 대표:
 * "달리기 데이터와 주행 동선 잘 조합해서 이쁜 SNS로 자랑하고 싶은 카드로 만들어 줘").
 *
 * 1080×1350 (인스타그램 세로). 지도 없이 달린 길 모양만 — 위도·경도는 기기 밖으로 나오지
 * 않고, 여기 오는 것은 비율만 남은 모양이다(android/.../WorkoutDetailCodec).
 *
 * 그리기만 한다. 공유·저장은 js/app-core.js shareHealthWorkoutCard 가 한다.
 */
import { formatPace, routePoints } from './health-cards.js?v=620';

export const RUN_CARD_WIDTH = 1080;
export const RUN_CARD_HEIGHT = 1350;

const FONT = '"Pretendard", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';

const TYPE_NAMES = {
    walking: ['걷기', 'Walk', '🚶'], running: ['달리기', 'Run', '🏃'], running_treadmill: ['러닝머신', 'Treadmill run', '🏃'],
    hiking: ['등산', 'Hike', '🥾'], biking: ['자전거', 'Ride', '🚴']
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

/** 카드에 쓸 글자·숫자. 그리기와 떼어 두어 테스트한다. */
export function buildRunCardModel(item, { english = false, dateLabel = '', startClock = '' } = {}) {
    if (!item || typeof item !== 'object') return null;
    const minutes = Number(item.minutes);
    if (!(minutes > 0)) return null;
    const [ko, en, emoji] = TYPE_NAMES[item.type] || [item.label || '운동', 'Workout', '🏅'];
    const km = Number(item.distanceKm) > 0 ? Number(item.distanceKm) : 0;
    const pace = km > 0 ? formatPace(minutes, km) : '';
    const stats = [
        { label: english ? 'Time' : '시간', value: formatClockDuration(minutes, Number(item.startEpochMillis), Number(item.endEpochMillis)) },
        pace ? { label: english ? 'Pace' : '페이스', value: `${pace}`, unit: '/km' } : null,
        Number(item.hrAvg) > 0 ? { label: english ? 'Avg HR' : '평균 심박', value: String(Math.round(item.hrAvg)), unit: 'bpm' } : null,
        Number(item.kcal) > 0 ? { label: english ? 'Calories' : '칼로리', value: String(Math.round(item.kcal)), unit: 'kcal' } : null
    ].filter(Boolean).slice(0, 3);
    return {
        title: `${emoji} ${english ? en : ko}`,
        when: [dateLabel, startClock].filter(Boolean).join(' · '),
        distance: km > 0 ? km.toFixed(2) : '',
        headline: km > 0 ? '' : formatClockDuration(minutes, Number(item.startEpochMillis), Number(item.endEpochMillis)),
        stats,
        route: routePoints(item.route),
        series: Array.isArray(item.pace) && item.pace.some((n) => n > 0)
            ? { values: item.pace, invert: true, label: english ? 'Pace' : '페이스', color: '#64B5F6' }
            : (Array.isArray(item.hr) && item.hr.some((n) => n > 0)
                ? { values: item.hr, invert: false, label: english ? 'Heart rate' : '심박', color: '#FF8A80' }
                : null),
        provider: String(item.providerLabel || 'Health Connect').slice(0, 40),
        brand: english ? 'Habit School' : '해빛스쿨'
    };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
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
    const at = ([x, y]) => [offX + (x - minX) * scale, offY + (y - minY) * scale];
    const mapped = points.map(at);

    const path = () => {
        ctx.beginPath();
        mapped.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    };
    const [sx, sy] = mapped[0];
    const [ex, ey] = mapped[mapped.length - 1];
    // 출발과 도착이 같은 곳이면(한 바퀴) 두 점 사이 그라데이션은 아무것도 칠하지 않는다 — 상자 대각선으로.
    const gradient = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h);
    gradient.addColorStop(0, '#69F0AE');
    gradient.addColorStop(0.55, '#FFE57F');
    gradient.addColorStop(1, '#FF9E40');

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // 빛번짐
    ctx.shadowColor = 'rgba(105, 240, 174, 0.55)';
    ctx.shadowBlur = 36;
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 22;
    path();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    path();
    ctx.stroke();
    // 출발 · 도착
    [[sx, sy, '#00E676'], [ex, ey, '#FF6D00']].forEach(([x, y, color]) => {
        ctx.beginPath();
        ctx.arc(x, y, 17, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 7;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
    });
    ctx.restore();
}

function drawSeries(ctx, series, box) {
    const values = series.values.map(Number);
    const present = values.filter((n) => n > 0);
    if (present.length < 2) return;
    const min = Math.min(...present);
    const span = Math.max(1, Math.max(...present) - min);
    const step = box.w / (values.length - 1);
    ctx.save();
    const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    fill.addColorStop(0, `${series.color}66`);
    fill.addColorStop(1, `${series.color}00`);
    let segment = [];
    const flush = () => {
        if (segment.length > 1) {
            ctx.beginPath();
            ctx.moveTo(segment[0][0], box.y + box.h);
            segment.forEach(([x, y]) => ctx.lineTo(x, y));
            ctx.lineTo(segment[segment.length - 1][0], box.y + box.h);
            ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.beginPath();
            segment.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.strokeStyle = series.color;
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        segment = [];
    };
    values.forEach((v, i) => {
        if (!(v > 0)) { flush(); return; }
        const t = (v - min) / span;
        segment.push([box.x + i * step, box.y + (series.invert ? t : 1 - t) * box.h]);
    });
    flush();
    ctx.restore();
}

/** 캔버스에 그린다. canvas 는 1080×1350. */
export function drawRunShareCard(canvas, model) {
    const W = RUN_CARD_WIDTH;
    const H = RUN_CARD_HEIGHT;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 배경 — 새벽 하늘 같은 짙은 청록
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#0A1A2F');
    bg.addColorStop(0.55, '#0B3A3A');
    bg.addColorStop(1, '#10462F');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.75, H * 0.28, 40, W * 0.75, H * 0.28, 620);
    glow.addColorStop(0, 'rgba(255, 183, 77, 0.22)');
    glow.addColorStop(1, 'rgba(255, 183, 77, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    // 잔 격자 — 지도 대신 깔리는 결
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 2;
    for (let x = 60; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 60; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    ctx.textBaseline = 'alphabetic';
    // 머리
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText(model.title, 72, 128);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = `500 34px ${FONT}`;
    if (model.when) ctx.fillText(model.when, 72, 182);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#FFB74D';
    ctx.font = `800 36px ${FONT}`;
    ctx.fillText(`☀ ${model.brand}`, W - 72, 128);
    ctx.textAlign = 'left';

    // 동선 (없으면 큰 숫자로 채운다)
    const routeBox = { x: 120, y: 250, w: W - 240, h: 560 };
    if (model.route.length >= 2) {
        drawRoute(ctx, model.route, routeBox);
    } else {
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.font = `900 220px ${FONT}`;
        ctx.fillText(model.distance || model.headline, W / 2, 620);
        if (model.distance) {
            ctx.font = `700 64px ${FONT}`;
            ctx.fillText('km', W / 2, 710);
        }
        ctx.textAlign = 'left';
    }

    // 큰 거리
    let y = 1000;
    if (model.route.length >= 2 && (model.distance || model.headline)) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 150px ${FONT}`;
        const big = model.distance || model.headline;
        ctx.fillText(big, 72, y);
        if (model.distance) {
            const w = ctx.measureText(big).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
            ctx.font = `700 56px ${FONT}`;
            ctx.fillText('km', 72 + w + 16, y);
        }
    } else {
        y = 900;
    }

    // 숫자 세 칸
    const top = y + 40;
    roundRect(ctx, 56, top, W - 112, 150, 28);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    const colW = (W - 112) / Math.max(1, model.stats.length);
    model.stats.forEach((stat, i) => {
        const cx = 56 + colW * i + 40;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.font = `600 30px ${FONT}`;
        ctx.fillText(stat.label, cx, top + 54);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `800 54px ${FONT}`;
        ctx.fillText(stat.value, cx, top + 118);
        if (stat.unit) {
            const w = ctx.measureText(stat.value).width;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.font = `600 28px ${FONT}`;
            ctx.fillText(stat.unit, cx + w + 8, top + 118);
        }
    });

    // 구간 그래프
    if (model.series) {
        drawSeries(ctx, model.series, { x: 72, y: top + 178, w: W - 144, h: 48 });
    }

    // 바닥
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = `500 28px ${FONT}`;
    ctx.fillText(model.provider, 72, H - 48);
    ctx.textAlign = 'right';
    ctx.fillText('habitschool.kr', W - 72, H - 48);
    ctx.textAlign = 'left';
    return canvas;
}
