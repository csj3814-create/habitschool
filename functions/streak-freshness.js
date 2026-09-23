/**
 * 저장된 연속 기록을 오늘의 값으로 환산한다.
 *
 * `users/{uid}.currentStreak` 은 **기록을 저장할 때만** 쓰인다. 그만둔 사람에게는
 * 쓰는 순간이 오지 않으므로 값이 마지막 기록일에 멈춘 채 남는다. 그래서 저장된
 * 값의 뜻은 "오늘의 연속" 이 아니라 **"`lastLogDate` 시점의 연속"** 이다.
 *
 * 2026-09-23 운영 측정: `currentStreak > 0` 인 회원 121명 중 어제·오늘 기록한
 * 사람은 14명이었다. 81명은 마지막 기록이 46일 넘게 지났고, 180일 전에 멈춘
 * 사람이 `currentStreak = 2` 로 남아 있었다.
 *
 * **리셋을 쓸 자리가 없다.** 값을 틀리게 만드는 것은 사건이 아니라 사건의
 * 부재(기록을 안 함)다. 매일 밤 전체를 쓸어도 다음 날이면 같은 문제로 돌아온다.
 * 대신 `lastLogDate` 가 이미 회원 문서에 있으므로, 두 값을 함께 읽으면 오늘의
 * 연속은 언제든 다시 구할 수 있다. 읽는 자리에서 한 번 환산한다.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function shiftDateString(dateStr, days) {
    const at = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(at.getTime())) return "";
    at.setUTCDate(at.getUTCDate() + Number(days || 0));
    return at.toISOString().slice(0, 10);
}

/**
 * 연속이 오늘도 살아 있나. 오늘 기록했거나, 어제까지 기록했고 오늘은 아직 남았거나.
 *
 * @param {string} lastLogDate 'YYYY-MM-DD'
 * @param {string} todayStr 'YYYY-MM-DD' (KST 기준 오늘)
 */
function isStreakAlive(lastLogDate, todayStr) {
    const last = String(lastLogDate || "").trim();
    const today = String(todayStr || "").trim();
    if (!DATE_PATTERN.test(last) || !DATE_PATTERN.test(today)) return false;
    return last === today || last === shiftDateString(today, -1);
}

/**
 * 회원 문서에서 오늘의 연속 기록을 구한다.
 *
 * `lastLogDate` 가 비어 있으면 0 으로 본다 — 언제 기록했는지 모르는 값을 살아
 * 있다고 우길 근거가 없다. (2026-09-01 백필로 기록이 있는 회원은 모두 채워졌다.)
 * `todayStr` 이 없으면 판단하지 않고 저장값을 그대로 돌려준다 — 날짜를 모르는
 * 채로 0 을 만들면 멀쩡한 연속까지 지운다.
 *
 * @param {{currentStreak?: number, lastLogDate?: string}} userData
 * @param {string} todayStr 'YYYY-MM-DD' (KST 기준 오늘)
 * @returns {number}
 */
function resolveStoredStreak(userData, todayStr) {
    const stored = Math.max(0, Number((userData || {}).currentStreak) || 0);
    if (stored === 0) return 0;
    if (!DATE_PATTERN.test(String(todayStr || "").trim())) return stored;
    return isStreakAlive((userData || {}).lastLogDate, todayStr) ? stored : 0;
}

module.exports = { isStreakAlive, resolveStoredStreak };
