/**
 * Health Connect 에서 넘어온 수면·운동을 오늘 기록으로 바꾼다.
 *
 * 네이티브(android/.../HealthConnectActivityCodec)는 읽은 것을 고르지 않고 JSON 으로
 * 주소의 `hcActivity` 에 실어 보낸다. 여기서 고른다:
 *
 * - **밤잠은 깬 날짜에 붙인다.** 기상 후에 기록하니까. 23:10~06:40 잠은 06:40 의 날.
 *   그날 끝난 세션 중 가장 긴 것이 밤잠이고, 그 앞뒤 2시간 안에 붙은 조각은 같은
 *   밤으로 합친다(중간에 깼다 다시 잔 것). 떨어진 낮잠은 뺀다.
 * - 운동은 오늘 시작한 세션만. 걸음수가 이미 세는 종류(걷기·달리기·등산·계단)는
 *   표시해 두고, 건강습관 점수가 걸음수와 두 번 세지 않게 한다.
 *
 * 주소는 누구든 만들 수 있다. 말이 안 되는 값은 버린다.
 * 의존성이 없는 순수 모듈이다.
 */
import { healthConnectOriginLabel } from './health-connect-body.js?v=456';

// 이 번호 이상의 Android 셸만 수면·운동 권한을 선언한다. 체성분과 같이 1.0.10(13)에서
// 선언한다 — 프로덕션 액세스 재신청 전에 건강 권한을 늘리지 않기로 했다. 1.0.9(12)에는
// 코드만 있다.
export const HEALTH_CONNECT_ACTIVITY_MIN_NATIVE_VERSION = 13;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
// 같은 밤으로 볼 조각 사이의 최대 간격.
const NIGHT_JOIN_GAP_MS = 2 * 60 * MINUTE_MS;
// 이보다 짧게 누워 있었으면 밤잠이 아니라 낮잠이다.
const MIN_NIGHT_IN_BED_MINUTES = 120;
const MAX_SLEEP_SESSION_MINUTES = 20 * 60;
const MAX_EXERCISE_MINUTES = 600;
const MAX_SESSIONS = 12;

/**
 * Health Connect 운동 종류. 키는 네이티브의 EXERCISE_TYPE_KEYS 와 같다.
 * stepCounted: 걸음수가 이미 세어 주는 운동인가. 기계 위에서 걷는 것(천국의 계단·
 * 일립티컬)은 시계에 따라 걸음이 잡히기도 한다 — 모르면 겹친다고 본다. 부풀리는
 * 쪽으로 틀리지 않기 위해서다 (le8-score.js 의 같은 원칙).
 */
export const HEALTH_EXERCISE_TYPES = Object.freeze({
    walking: { label: '걷기', emoji: '🚶', stepCounted: true },
    running: { label: '달리기', emoji: '🏃', stepCounted: true },
    running_treadmill: { label: '러닝머신', emoji: '🏃', stepCounted: true },
    hiking: { label: '등산', emoji: '🥾', stepCounted: true },
    stair_climbing: { label: '계단 오르기', emoji: '🪜', stepCounted: true },
    stair_climbing_machine: { label: '천국의 계단', emoji: '🪜', stepCounted: true },
    biking: { label: '자전거', emoji: '🚴', stepCounted: false },
    biking_stationary: { label: '실내 자전거', emoji: '🚴', stepCounted: false },
    elliptical: { label: '일립티컬', emoji: '🏋️', stepCounted: true },
    rowing_machine: { label: '로잉머신', emoji: '🚣', stepCounted: false },
    swimming_pool: { label: '수영', emoji: '🏊', stepCounted: false },
    swimming_open_water: { label: '야외 수영', emoji: '🏊', stepCounted: false },
    strength_training: { label: '근력 운동', emoji: '💪', stepCounted: false },
    weightlifting: { label: '웨이트', emoji: '🏋️', stepCounted: false },
    calisthenics: { label: '맨몸 운동', emoji: '💪', stepCounted: false },
    hiit: { label: '인터벌 운동', emoji: '🔥', stepCounted: false },
    boot_camp: { label: '서킷 운동', emoji: '🔥', stepCounted: false },
    exercise_class: { label: '운동 수업', emoji: '🤸', stepCounted: false },
    pilates: { label: '필라테스', emoji: '🧘', stepCounted: false },
    yoga: { label: '요가', emoji: '🧘', stepCounted: false },
    stretching: { label: '스트레칭', emoji: '🤸', stepCounted: false },
    dancing: { label: '댄스', emoji: '💃', stepCounted: false },
    martial_arts: { label: '무술', emoji: '🥋', stepCounted: false },
    boxing: { label: '복싱', emoji: '🥊', stepCounted: false },
    badminton: { label: '배드민턴', emoji: '🏸', stepCounted: false },
    tennis: { label: '테니스', emoji: '🎾', stepCounted: false },
    table_tennis: { label: '탁구', emoji: '🏓', stepCounted: false },
    squash: { label: '스쿼시', emoji: '🎾', stepCounted: false },
    golf: { label: '골프', emoji: '⛳', stepCounted: false },
    soccer: { label: '축구', emoji: '⚽', stepCounted: false },
    basketball: { label: '농구', emoji: '🏀', stepCounted: false },
    volleyball: { label: '배구', emoji: '🏐', stepCounted: false },
    baseball: { label: '야구', emoji: '⚾', stepCounted: false },
    rock_climbing: { label: '클라이밍', emoji: '🧗', stepCounted: false },
    skiing: { label: '스키', emoji: '⛷️', stepCounted: false },
    snowboarding: { label: '스노보드', emoji: '🏂', stepCounted: false },
    skating: { label: '스케이트', emoji: '⛸️', stepCounted: false },
    guided_breathing: { label: '호흡 운동', emoji: '🌬️', stepCounted: false },
    wheelchair: { label: '휠체어', emoji: '♿', stepCounted: false },
    other: { label: '운동', emoji: '🏅', stepCounted: false }
});

function exerciseType(key) {
    return HEALTH_EXERCISE_TYPES[String(key || '')] || HEALTH_EXERCISE_TYPES.other;
}

function epoch(raw) {
    const ms = Number(raw);
    // 2024년 이후, 지금보다 하루 이상 미래는 아닌 값만.
    if (!Number.isFinite(ms) || ms < Date.UTC(2024, 0, 1)) return null;
    if (ms > Date.now() + 24 * 60 * MINUTE_MS) return null;
    return Math.round(ms);
}

function minutes(raw, max) {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > max) return null;
    return Math.round(value);
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

export function toKstDateString(epochMillis) {
    const ms = Number(epochMillis);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function formatKstClock(epochMillis) {
    const ms = Number(epochMillis);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    return new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16);
}

export function formatDurationKo(totalMinutes) {
    const value = Math.max(0, Math.round(Number(totalMinutes) || 0));
    const h = Math.floor(value / 60);
    const m = value % 60;
    if (h && m) return `${h}시간 ${m}분`;
    if (h) return `${h}시간`;
    return `${m}분`;
}

export function supportsHealthConnectActivity(nativeVersion) {
    const version = Number.parseInt(nativeVersion, 10);
    return Number.isFinite(version) && version >= HEALTH_CONNECT_ACTIVITY_MIN_NATIVE_VERSION;
}

function sanitizeSleepSession(raw) {
    const start = epoch(raw?.start);
    const end = epoch(raw?.end);
    if (start === null || end === null || end <= start) return null;
    const inBed = Math.round((end - start) / MINUTE_MS);
    if (inBed > MAX_SLEEP_SESSION_MINUTES) return null;
    const asleep = minutes(raw?.asleep, inBed);
    if (asleep === null) return null;
    return {
        start,
        end,
        inBed,
        asleep,
        awake: minutes(raw?.awake, inBed) ?? 0,
        deep: minutes(raw?.deep, inBed) ?? 0,
        rem: minutes(raw?.rem, inBed) ?? 0,
        light: minutes(raw?.light, inBed) ?? 0,
        staged: raw?.staged === true,
        origin: String(raw?.origin || '').slice(0, 200)
    };
}

/**
 * `todayStr` 에 깬 밤잠 하나. 없으면 null.
 */
export function pickNightSleep(sessions = [], todayStr = '') {
    const candidates = (sessions || [])
        .map(sanitizeSleepSession)
        .filter((s) => s && toKstDateString(s.end) === todayStr)
        .sort((a, b) => a.start - b.start);
    if (!candidates.length) return null;

    const main = candidates.reduce((best, s) => (s.inBed > best.inBed ? s : best));
    let clusterStart = main.start;
    let clusterEnd = main.end;
    const night = [main];
    // 붙어 있는 조각을 바깥으로 넓혀 가며 모은다.
    let grew = true;
    while (grew) {
        grew = false;
        for (const s of candidates) {
            if (night.includes(s)) continue;
            if (s.end >= clusterStart - NIGHT_JOIN_GAP_MS && s.start <= clusterEnd + NIGHT_JOIN_GAP_MS) {
                night.push(s);
                clusterStart = Math.min(clusterStart, s.start);
                clusterEnd = Math.max(clusterEnd, s.end);
                grew = true;
            }
        }
    }

    const sum = (key) => night.reduce((total, s) => total + s[key], 0);
    const inBedMinutes = sum('inBed');
    if (inBedMinutes < MIN_NIGHT_IN_BED_MINUTES) return null;
    const asleepMinutes = sum('asleep');
    if (asleepMinutes <= 0) return null;

    return {
        wakeDate: todayStr,
        startEpochMillis: clusterStart,
        endEpochMillis: clusterEnd,
        asleepMinutes,
        inBedMinutes,
        awakeMinutes: sum('awake'),
        deepMinutes: sum('deep'),
        remMinutes: sum('rem'),
        lightMinutes: sum('light'),
        hasStages: night.some((s) => s.staged),
        providerLabel: healthConnectOriginLabel(main.origin),
        sleepHours: round1(asleepMinutes / 60)
    };
}

function sanitizeExercise(raw, todayStr) {
    const start = epoch(raw?.start);
    const end = epoch(raw?.end);
    if (start === null || end === null || end <= start) return null;
    if (toKstDateString(start) !== todayStr) return null;
    const durationMinutes = Math.round((end - start) / MINUTE_MS);
    if (durationMinutes < 1 || durationMinutes > MAX_EXERCISE_MINUTES) return null;
    const type = String(raw?.type || 'other');
    const known = HEALTH_EXERCISE_TYPES[type] ? type : 'other';
    const kcal = minutes(raw?.kcal, 5000);
    const dist = minutes(raw?.dist, 300000);
    return {
        type: known,
        label: exerciseType(known).label,
        startEpochMillis: start,
        endEpochMillis: end,
        minutes: durationMinutes,
        kcal: kcal && kcal > 0 ? kcal : null,
        distanceKm: dist && dist > 0 ? round1(dist / 1000) : null,
        stepCounted: exerciseType(known).stepCounted,
        providerLabel: healthConnectOriginLabel(raw?.origin)
    };
}

/**
 * 주소의 hcActivity 를 읽는다. 없거나 깨졌으면 null.
 */
export function parseHealthConnectActivity(raw, { todayStr = '' } = {}) {
    if (!raw || !todayStr) return null;
    let data;
    try {
        data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (_) {
        return null;
    }
    if (!data || typeof data !== 'object' || data.v !== 1) return null;

    const seen = new Set();
    const exercises = (Array.isArray(data.exercise) ? data.exercise : [])
        .slice(0, MAX_SESSIONS)
        .map((item) => sanitizeExercise(item, todayStr))
        .filter((item) => {
            if (!item) return false;
            const key = `${item.type}:${item.startEpochMillis}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => a.startEpochMillis - b.startEpochMillis);

    return {
        syncedAtEpochMillis: epoch(data.syncedAt) || 0,
        sleepPermitted: data.sleepOk === true,
        exercisePermitted: data.exerciseOk === true,
        sleep: pickNightSleep(Array.isArray(data.sleep) ? data.sleep.slice(0, MAX_SESSIONS) : [], todayStr),
        exercises
    };
}

/** `sleepAndMind.sleepSync` 로 저장하는 모양. firestore.rules 는 map 만 확인한다. */
export function buildSleepSyncRecord(night, { syncedAtEpochMillis = 0 } = {}) {
    if (!night) return null;
    return {
        source: 'health_connect',
        providerLabel: night.providerLabel,
        wakeDate: night.wakeDate,
        startEpochMillis: night.startEpochMillis,
        endEpochMillis: night.endEpochMillis,
        asleepMinutes: night.asleepMinutes,
        inBedMinutes: night.inBedMinutes,
        awakeMinutes: night.awakeMinutes,
        deepMinutes: night.deepMinutes,
        remMinutes: night.remMinutes,
        lightMinutes: night.lightMinutes,
        hasStages: night.hasStages,
        sleepHours: night.sleepHours,
        syncedAtEpochMillis: Number(syncedAtEpochMillis) || 0
    };
}

export function describeHealthSleep(night) {
    if (!night) return '';
    const window = `${formatKstClock(night.startEpochMillis)}~${formatKstClock(night.endEpochMillis)}`;
    const stages = night.hasStages
        ? [
            night.deepMinutes ? `깊은 잠 ${formatDurationKo(night.deepMinutes)}` : '',
            night.remMinutes ? `렘 ${formatDurationKo(night.remMinutes)}` : '',
            night.awakeMinutes ? `깸 ${formatDurationKo(night.awakeMinutes)}` : ''
        ].filter(Boolean).join(' · ')
        : '';
    return `${night.providerLabel} · ${window} · ${formatDurationKo(night.asleepMinutes)} 잠${stages ? ` (${stages})` : ''}`;
}

export function describeHealthExercise(item) {
    if (!item) return '';
    const type = exerciseType(item.type);
    return [
        `${type.emoji} ${item.label || type.label}`,
        formatKstClock(item.startEpochMillis),
        formatDurationKo(item.minutes),
        item.kcal ? `${item.kcal}kcal` : '',
        item.distanceKm ? `${item.distanceKm}km` : ''
    ].filter(Boolean).join(' · ');
}
