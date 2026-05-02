export function getPreviousMonthIdFromKstDateString(todayStr = '') {
    const normalizedToday = String(todayStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedToday)) return '';

    const [year, month] = normalizedToday.split('-').map(Number);
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    return `${prevMonthDate.getUTCFullYear()}-${String(prevMonthDate.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function shouldAttemptMonthlyMvpRewardFromKstDateString(todayStr = '') {
    const normalizedToday = String(todayStr || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedToday)) return false;

    const day = Number(normalizedToday.slice(8, 10));
    return day >= 1 && day <= 3;
}
