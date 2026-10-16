// 회원별 시간대 — "지금이 며칠·몇 시인가" 의 단일 출처 (화면)
//
// 서버 functions/member-time.js 와 "공통 계산" 부분이 글자 하나까지 같다
// (tests/member-time-korea-unchanged.test.js). 고칠 때는 두 파일을 같이 고친다.
// 회원 시간대가 없으면 Asia/Seoul — 한국 회원의 날짜·시각은 바꾸기 전과 같다.

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

// ---- 화면 전용 ----
// 로그인한 회원의 시간대. 앱의 "오늘"(ui-helpers getKstDateString 등)이 모두 이 값을 따른다.
// 회원 문서를 읽기 전에도 날짜가 깜빡이지 않도록 회원별로 기기에 기억해 둔다.
const ACTIVE_TIME_ZONE_STORAGE_PREFIX = 'habitschool_member_time_zone_';
// 값은 모듈이 아니라 globalThis 에 둔다. `member-time.js?v=A` 와 `?v=B` 처럼 주소가 다르면
// 브라우저는 모듈을 두 벌 띄운다(배포 직후 캐시가 섞일 때). 그래도 앱의 "오늘" 은 하나여야 한다.
const ACTIVE_TIME_ZONE_GLOBAL_KEY = '__habitschoolActiveMemberTimeZone';

function setActiveMemberTimeZone(timeZone) {
    const next = normalizeTimeZone(timeZone);
    globalThis[ACTIVE_TIME_ZONE_GLOBAL_KEY] = next;
    return next;
}

function getActiveMemberTimeZone() {
    return normalizeTimeZone(globalThis[ACTIVE_TIME_ZONE_GLOBAL_KEY]);
}

function getActiveMemberToday(now = Date.now()) {
    return getDateStringInZone(now, getActiveMemberTimeZone());
}

function getActiveMemberHour(now = Date.now()) {
    return getHourInZone(now, getActiveMemberTimeZone());
}

function rememberMemberTimeZone(uid, timeZone) {
    if (!uid) return;
    try {
        localStorage.setItem(ACTIVE_TIME_ZONE_STORAGE_PREFIX + uid, normalizeTimeZone(timeZone));
    } catch (error) {
        console.warn('[member-time] 시간대를 기기에 기억하지 못했습니다:', error?.message || error);
    }
}

function recallMemberTimeZone(uid) {
    if (!uid) return DEFAULT_TIME_ZONE;
    try {
        return normalizeTimeZone(localStorage.getItem(ACTIVE_TIME_ZONE_STORAGE_PREFIX + uid));
    } catch (_) {
        return DEFAULT_TIME_ZONE; // 저장소를 못 쓰는 브라우저 — 회원 문서가 오면 맞춰진다
    }
}

// 기기의 시간대(위치 권한 없이 기기 설정만으로 안다). 모르면 빈 문자열.
function getDeviceTimeZone() {
    try {
        return resolveTimeZoneName(Intl.DateTimeFormat().resolvedOptions().timeZone) || '';
    } catch (_) {
        return '';
    }
}

// 날짜 옆 배지는 기기 시계가 기록 기준 시계와 다를 때만 띄운다. 이름이 아니라 지금 시계를
// 비교한다 — 일본(Asia/Tokyo)에 있는 한국 회원은 시계가 같아 날짜가 어긋나지 않으므로
// 바꾸기 전처럼 띄우지 않는다. 한국 회원이 한국에 있으면 물론 보이지 않는다.
function shouldShowTimeZoneBadge({ deviceTimeZone = '', memberTimeZone, now = Date.now() } = {}) {
    const device = resolveTimeZoneName(deviceTimeZone);
    if (!device) return false;
    const member = normalizeTimeZone(memberTimeZone);
    return getDateStringInZone(now, device) !== getDateStringInZone(now, member)
        || getMinutesOfDayInZone(now, device) !== getMinutesOfDayInZone(now, member);
}

// 배지·안내에 쓰는 짧은 이름 (예: PDT, GMT+13). 모르면 IANA 이름 그대로.
function formatTimeZoneShortName(timeZone, now = Date.now(), locale = 'en-US') {
    const zone = normalizeTimeZone(timeZone);
    try {
        const part = new Intl.DateTimeFormat(locale, { timeZone: zone, timeZoneName: 'short' })
            .formatToParts(new Date(toEpochMillis(now)))
            .find(({ type }) => type === 'timeZoneName');
        return part?.value || zone;
    } catch (_) {
        return zone;
    }
}

export {
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
    setActiveMemberTimeZone,
    getActiveMemberTimeZone,
    getActiveMemberToday,
    getActiveMemberHour,
    rememberMemberTimeZone,
    recallMemberTimeZone,
    getDeviceTimeZone,
    shouldShowTimeZoneBadge,
    formatTimeZoneShortName,
};
