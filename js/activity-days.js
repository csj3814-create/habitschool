export function isActiveAward(awarded = {}) {
    return Number(awarded?.dietPoints || 0) > 0
        || Number(awarded?.exercisePoints || 0) > 0
        || Number(awarded?.mindPoints || 0) > 0
        || awarded?.diet === true
        || awarded?.exercise === true
        || awarded?.mind === true;
}

export function addCalendarDays(dateStr, amount) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return '';
    date.setUTCDate(date.getUTCDate() + Number(amount || 0));
    return date.toISOString().slice(0, 10);
}

export function getActiveDateSet(logs = []) {
    return new Set((Array.isArray(logs) ? logs : [])
        .filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(String(log?.date || '')))
        .filter((log) => isActiveAward(log.awardedPoints || log.awarded || {}))
        .map((log) => log.date));
}

export function countActiveDays(logs = []) {
    return getActiveDateSet(logs).size;
}

/** Today counts when active; otherwise yesterday may continue the visible streak. */
export function calculateActivityStreak(logs = [], todayStr = '') {
    const dates = getActiveDateSet(logs);
    let cursor = dates.has(todayStr) ? todayStr : addCalendarDays(todayStr, -1);
    if (!cursor || !dates.has(cursor)) return 0;
    let streak = 0;
    while (dates.has(cursor) && streak < 400) {
        streak += 1;
        cursor = addCalendarDays(cursor, -1);
    }
    return streak;
}

export function calculateWeeklyParticipation(logs = [], weekDates = []) {
    const dates = getActiveDateSet(logs);
    const validWeekDates = [...new Set((Array.isArray(weekDates) ? weekDates : [])
        .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))))];
    const activeDays = validWeekDates.filter((date) => dates.has(date)).length;
    return {
        activeDays,
        totalDays: validWeekDates.length,
        rate: validWeekDates.length > 0 ? Math.round((activeDays / validWeekDates.length) * 100) : 0,
    };
}
