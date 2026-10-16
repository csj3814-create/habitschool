const {
    addDaysToDateString,
    getDateStringInZone,
    getMemberHour,
    getMemberToday,
    getMemberYesterday,
    toEpochMillis,
} = require("./member-time");

const REMINDER_CATEGORIES = Object.freeze(["diet", "exercise", "sleep"]);
// 연속 알림은 회원 시각 밤 10시에 보낸다(한국 회원은 13:00 UTC — 바꾸기 전과 같다).
const STREAK_ALERT_LOCAL_HOUR = 22;
// 시간대를 바꾼 직후에는 "회원 날짜" 가 바뀌어 같은 날 알림이 두 번 갈 수 있다. 하루 쉰다.
const TIME_ZONE_CHANGE_QUIET_MS = 24 * 60 * 60 * 1000;

function normalizeReminderPreference(userData = {}) {
    const raw = userData?.settings?.reminderPreference || {};
    const category = REMINDER_CATEGORIES.includes(raw.category) ? raw.category : "diet";
    const parsedHour = Number(raw.hourKst);
    const hourKst = Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23
        ? parsedHour
        : 20;
    return {
        enabled: raw.enabled === true,
        category,
        hourKst,
    };
}

function getKstHour(now = new Date()) {
    const value = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(value.getTime())) throw new TypeError("A valid date is required");
    return new Date(value.getTime() + 9 * 60 * 60 * 1000).getUTCHours();
}

function isWithinTimeZoneChangeQuietPeriod(userData = {}, now = Date.now()) {
    const changedAtMs = toEpochMillis(userData?.timeZoneChangedAt);
    if (!Number.isFinite(changedAtMs)) return false;
    const nowMs = toEpochMillis(now);
    return nowMs >= changedAtMs && nowMs - changedAtMs < TIME_ZONE_CHANGE_QUIET_MS;
}

// 지구의 모든 회원의 어제·오늘은 한국 날짜 기준 그저께~내일 안에 있다
// (회원 오늘 ∈ 한국 어제~내일). 이 네 날짜의 기록을 읽으면 누구든 판단할 수 있다.
function getPossibleMemberDates(now = Date.now()) {
    const kstToday = getDateStringInZone(now, "Asia/Seoul");
    return [-2, -1, 0, 1].map((offset) => addDaysToDateString(kstToday, offset));
}

/**
 * 지금 습관 알림을 받을 회원. 회원이 고른 시각(회원 시각)이고, 회원의 오늘 아직 기록하지 않았다.
 * @param {{uid: string, data: object}[]} users 알림을 켠 회원(settings, timeZone 포함)
 * @param {{now?: number|Date, loggedDatesByUid: Map<string, Set<string>>}} options
 * @returns {{uid: string, preference: object, today: string}[]} today 는 중복 방지 장부의 날짜
 */
function selectHabitReminderRecipients(users = [], { now = Date.now(), loggedDatesByUid = new Map() } = {}) {
    const recipients = [];
    (users || []).forEach(({ uid, data } = {}) => {
        if (!uid) return;
        const userData = data || {};
        const preference = normalizeReminderPreference(userData);
        // 저장 필드 이름은 hourKst 그대로다. 뜻은 "회원 시각" — 시간대가 없으면 한국 시각.
        if (!preference.enabled || preference.hourKst !== getMemberHour(userData, now)) return;
        if (isWithinTimeZoneChangeQuietPeriod(userData, now)) return;
        const today = getMemberToday(userData, now);
        if (loggedDatesByUid.get(uid)?.has(today)) return;
        recipients.push({ uid, preference, today });
    });
    return recipients;
}

/**
 * 지금 연속 알림을 받을 회원. 회원 시각이 밤 10시이고, 회원의 어제 기록했고 오늘은 아직이다.
 * 오늘 밤 실제로 연속을 잃는 사람만이다(2026-09-23 — 저장된 currentStreak 를 믿지 않는다).
 * @param {{now?: number|Date, loggedDatesByUid: Map<string, Set<string>>, membersByUid?: Map<string, object>}} options
 *   membersByUid: 시간대를 저장한 회원의 {timeZone, timeZoneChangedAt}. 없는 회원은 한국 시간.
 * @returns {{uid: string, today: string}[]}
 */
function selectStreakAlertRecipients({
    now = Date.now(),
    loggedDatesByUid = new Map(),
    membersByUid = new Map(),
    alertHour = STREAK_ALERT_LOCAL_HOUR,
} = {}) {
    const recipients = [];
    loggedDatesByUid.forEach((dates, uid) => {
        const member = membersByUid.get(uid) || {};
        if (getMemberHour(member, now) !== alertHour) return;
        if (isWithinTimeZoneChangeQuietPeriod(member, now)) return;
        const today = getMemberToday(member, now);
        if (!dates?.has(getMemberYesterday(member, now)) || dates.has(today)) return;
        recipients.push({ uid, today });
    });
    return recipients;
}

function normalizeLedgerPart(value = "") {
    return String(value || "")
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .slice(0, 120);
}

function buildNotificationLedgerId(uid, dateStr, kind) {
    const safeUid = normalizeLedgerPart(uid);
    const safeDate = normalizeLedgerPart(dateStr);
    const safeKind = normalizeLedgerPart(kind);
    if (!safeUid || !/^\d{4}-\d{2}-\d{2}$/.test(safeDate) || !safeKind) {
        throw new TypeError("uid, KST date, and kind are required");
    }
    return `${safeUid}_${safeDate}_${safeKind}`;
}

function getReminderTarget(category = "diet") {
    if (category === "exercise") return { tab: "exercise", focus: "record" };
    if (category === "sleep") return { tab: "sleep", focus: "record" };
    return { tab: "diet", focus: "upload" };
}

module.exports = {
    REMINDER_CATEGORIES,
    STREAK_ALERT_LOCAL_HOUR,
    normalizeReminderPreference,
    isWithinTimeZoneChangeQuietPeriod,
    getPossibleMemberDates,
    selectHabitReminderRecipients,
    selectStreakAlertRecipients,
    getKstHour,
    buildNotificationLedgerId,
    getReminderTarget,
};
