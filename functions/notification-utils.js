const REMINDER_CATEGORIES = Object.freeze(["diet", "exercise", "sleep"]);

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
    normalizeReminderPreference,
    getKstHour,
    buildNotificationLedgerId,
    getReminderTarget,
};
