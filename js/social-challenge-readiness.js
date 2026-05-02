export const SOCIAL_CHALLENGE_MIN_ACTIVITY_DAYS = 5;
export const SOCIAL_CHALLENGE_ACTIVITY_LOOKBACK_DAYS = 30;

export function addDaysFromKstDateString(dateStr, diffDays) {
    const base = new Date(`${dateStr}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + diffDays);
    return base.toISOString().split('T')[0];
}

export function buildSocialChallengeLookbackDateStrings(todayStr, lookbackPastDays = SOCIAL_CHALLENGE_ACTIVITY_LOOKBACK_DAYS) {
    const safeToday = String(todayStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeToday)) return [];

    const dates = [];
    for (let offset = 0; offset <= lookbackPastDays; offset += 1) {
        dates.push(addDaysFromKstDateString(safeToday, -offset));
    }
    return dates;
}

export function countCompletedHabitBuckets(awardedPoints = {}) {
    const dietDone = (Number(awardedPoints.dietPoints) || 0) > 0 || !!awardedPoints.diet;
    const exerciseDone = (Number(awardedPoints.exercisePoints) || 0) > 0 || !!awardedPoints.exercise;
    const mindDone = (Number(awardedPoints.mindPoints) || 0) > 0 || !!awardedPoints.mind;
    return [dietDone, exerciseDone, mindDone].filter(Boolean).length;
}

export function summarizeSocialChallengeReadinessLogs(logs = [], {
    todayStr = '',
    weekStrs = [],
    minActivityDays = SOCIAL_CHALLENGE_MIN_ACTIVITY_DAYS
} = {}) {
    const weekSet = new Set(Array.isArray(weekStrs) ? weekStrs : []);
    const recentDateSet = new Set();
    const weekDateSet = new Set();
    let todayCompleted = 0;

    logs.forEach((entry) => {
        const data = entry?.data || entry || {};
        const date = String(entry?.date || data.date || '').trim();
        if (!date) return;

        recentDateSet.add(date);
        if (weekSet.has(date)) weekDateSet.add(date);
        if (date === todayStr) {
            todayCompleted = Math.max(todayCompleted, countCompletedHabitBuckets(data.awardedPoints || {}));
        }
    });

    const recentDays = recentDateSet.size;
    const eligible = recentDays >= minActivityDays;
    return {
        todayCompleted,
        weekDays: weekDateSet.size,
        recentDays,
        eligible,
        shortfall: Math.max(0, minActivityDays - recentDays)
    };
}
