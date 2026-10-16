// 회원별 시간대 — "지금이 며칠·몇 시인가" 의 단일 출처 (서버)
//
// 2026-10-16: 하루 기준이 한국 시간(KST)으로 고정돼 있어, 미국 회원은 현지 아침에 날짜가
// 넘어가고 뉴질랜드 회원의 현지 오늘 기록은 "한국으로는 내일" 이라 포인트를 받지 못했다.
// 이제 users/{uid}.timeZone(IANA 이름)으로 계산한다. **값이 없으면 Asia/Seoul** — 지금
// 한국 회원 전원은 아무것도 달라지지 않는다(tests/member-time-korea-unchanged.test.js).
//
// 화면 js/member-time.js 에 같은 계산이 한 벌 있다. 서버 배포에는 functions/ 만 올라가므로
// 한 파일을 함께 쓸 수 없다. 아래 "공통 계산" 부분은 두 파일이 글자 하나까지 같아야 한다
// (테스트가 확인한다). 고칠 때는 두 파일을 같이 고친다.

// ---- 공통 계산 시작 ----
const DEFAULT_TIME_ZONE = 'Asia/Seoul';
const TIME_ZONE_CHANGE_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// 지역 이름(Asia/Seoul, America/Argentina/Buenos_Aires, Etc/GMT+12)과 UTC 만 받는다.
// Intl 은 '+05:30' 같은 오프셋도 받아 주지만, 오프셋은 서머타임을 따라가지 못한다.
const TIME_ZONE_NAME_PATTERN = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;

const partsFormatterCache = new Map();

function getPartsFormatter(timeZone) {
    let formatter = partsFormatterCache.get(timeZone);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        });
        partsFormatterCache.set(timeZone, formatter);
    }
    return formatter;
}

const resolvedNameCache = new Map();

function resolveTimeZoneName(value) {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw || raw.length > 64 || !TIME_ZONE_NAME_PATTERN.test(raw)) return null;
    if (resolvedNameCache.has(raw)) return resolvedNameCache.get(raw);
    let resolved = null;
    try {
        resolved = new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone || null;
    } catch (_) {
        resolved = null; // 모르는 이름 — 부르는 쪽이 Asia/Seoul 로 돌아간다
    }
    // 회원이 보낸 글자가 들어오는 자리라 캐시가 끝없이 자라지 않게 한다.
    if (resolvedNameCache.size < 1000) resolvedNameCache.set(raw, resolved);
    return resolved;
}

function isSupportedTimeZone(value) {
    return resolveTimeZoneName(value) !== null;
}

function normalizeTimeZone(value) {
    return resolveTimeZoneName(value) || DEFAULT_TIME_ZONE;
}

function getMemberTimeZone(userData) {
    return normalizeTimeZone(userData && typeof userData === 'object' ? userData.timeZone : undefined);
}

// Date · epoch 밀리초 · ISO 문자열 · Firestore Timestamp 를 받는다. 읽을 수 없으면 NaN.
function toEpochMillis(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
    if (typeof value === 'string' && value.trim()) return Date.parse(value);
    return Number.NaN;
}

function getZoneParts(instant, timeZone) {
    const ms = toEpochMillis(instant);
    if (!Number.isFinite(ms)) return null;
    const parts = {};
    getPartsFormatter(normalizeTimeZone(timeZone)).formatToParts(new Date(ms)).forEach(({ type, value }) => {
        parts[type] = value;
    });
    return {
        date: `${parts.year}-${parts.month}-${parts.day}`,
        hour: Number(parts.hour),
        minute: Number(parts.minute),
    };
}

function getDateStringInZone(instant, timeZone) {
    const parts = getZoneParts(instant, timeZone);
    return parts ? parts.date : null;
}

function getHourInZone(instant, timeZone) {
    const parts = getZoneParts(instant, timeZone);
    return parts ? parts.hour : Number.NaN;
}

function getMinutesOfDayInZone(instant, timeZone) {
    const parts = getZoneParts(instant, timeZone);
    return parts ? (parts.hour * 60) + parts.minute : Number.NaN;
}

function formatClockInZone(instant, timeZone) {
    const parts = getZoneParts(instant, timeZone);
    if (!parts) return '';
    return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

// 달력 날짜 글자에 하루를 더하고 뺀다. 시간대와 무관하다.
function addDaysToDateString(dateStr, diffDays) {
    const base = new Date(`${dateStr}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + diffDays);
    return base.toISOString().slice(0, 10);
}

function getMemberToday(userData, now = Date.now()) {
    return getDateStringInZone(now, getMemberTimeZone(userData));
}

function getMemberYesterday(userData, now = Date.now()) {
    const today = getMemberToday(userData, now);
    return today ? addDaysToDateString(today, -1) : null;
}

function getMemberHour(userData, now = Date.now()) {
    return getHourInZone(now, getMemberTimeZone(userData));
}

function getMemberMinutesOfDay(userData, now = Date.now()) {
    return getMinutesOfDayInZone(now, getMemberTimeZone(userData));
}

// 시간대는 30일에 한 번 바꾼다. 하루 경계를 옮겨 날짜를 당겨 쓰는 일을 막는다.
function validateTimeZoneChange(userData, requestedTimeZone, now = Date.now()) {
    const timeZone = resolveTimeZoneName(requestedTimeZone);
    if (!timeZone) return { ok: false, reason: 'invalid' };
    const previousTimeZone = getMemberTimeZone(userData);
    if (timeZone === previousTimeZone) return { ok: false, reason: 'same', timeZone };
    const changedAtMs = toEpochMillis(userData && typeof userData === 'object' ? userData.timeZoneChangedAt : undefined);
    const nowMs = toEpochMillis(now);
    if (Number.isFinite(changedAtMs)) {
        const nextAllowedAt = changedAtMs + (TIME_ZONE_CHANGE_COOLDOWN_DAYS * DAY_MS);
        if (nowMs < nextAllowedAt) return { ok: false, reason: 'cooldown', timeZone, nextAllowedAt };
    }
    return { ok: true, timeZone, previousTimeZone };
}
// ---- 공통 계산 끝 ----

module.exports = {
    DEFAULT_TIME_ZONE,
    TIME_ZONE_CHANGE_COOLDOWN_DAYS,
    isSupportedTimeZone,
    normalizeTimeZone,
    getMemberTimeZone,
    toEpochMillis,
    getDateStringInZone,
    getHourInZone,
    getMinutesOfDayInZone,
    formatClockInZone,
    addDaysToDateString,
    getMemberToday,
    getMemberYesterday,
    getMemberHour,
    getMemberMinutesOfDay,
    validateTimeZoneChange,
};
