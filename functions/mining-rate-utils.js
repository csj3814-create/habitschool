const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function getKstIsoWeekId(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new TypeError("A valid date is required.");
    }

    const kstDate = new Date(date.getTime() + KST_OFFSET_MS);
    const calendarDate = new Date(Date.UTC(
        kstDate.getUTCFullYear(),
        kstDate.getUTCMonth(),
        kstDate.getUTCDate()
    ));
    const isoDay = calendarDate.getUTCDay() || 7;
    calendarDate.setUTCDate(calendarDate.getUTCDate() + 4 - isoDay);

    const isoYear = calendarDate.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const isoWeek = Math.ceil((((calendarDate - yearStart) / 86400000) + 1) / 7);
    return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function isCompletedRateDecision(status) {
    return ["success", "no_change", "manual"].includes(String(status || ""));
}

module.exports = {
    getKstIsoWeekId,
    isCompletedRateDecision,
};
