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

/**
 * 저장된 연속 기록(`users/{uid}.currentStreak`)을 오늘의 값으로 환산한다.
 *
 * 그 필드는 **기록을 저장할 때만** 쓰인다. 그만둔 사람에게는 쓰는 순간이 오지
 * 않으므로 값이 마지막 기록일에 멈춘 채 남는다. 뜻은 "오늘의 연속" 이 아니라
 * **"`lastLogDate` 시점의 연속"** 이다.
 *
 * 2026-09-23 운영 측정: `currentStreak > 0` 인 121명 중 어제·오늘 기록한 사람은
 * 14명. 180일 전에 멈춘 사람이 `currentStreak = 2` 로 남아 있었다.
 *
 * `lastLogDate` 가 비면 0 으로 본다 — 언제 기록했는지 모르는 값을 살아 있다고
 * 우길 근거가 없다. `todayStr` 이 없으면 판단하지 않고 저장값을 그대로 둔다.
 * (같은 규칙이 서버에도 있다: functions/streak-freshness.js)
 */
export function resolveStoredStreak(userData = {}, todayStr = '') {
    const stored = Math.max(0, Number(userData?.currentStreak) || 0);
    if (stored === 0) return 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(todayStr || '').trim())) return stored;
    const lastLogDate = String(userData?.lastLogDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastLogDate)) return 0;
    return (lastLogDate === todayStr || lastLogDate === addCalendarDays(todayStr, -1)) ? stored : 0;
}
