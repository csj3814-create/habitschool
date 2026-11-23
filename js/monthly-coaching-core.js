// 해빛 코칭 카드의 판단만 모은 순수 모듈(화면·서버를 읽지 않는다 — 시험할 수 있게).
// 값은 서버(functions/monthly-coaching.js)와 같아야 한다. 실제로 빼는 값과 날짜는 서버가 정한다.
// 2026-11-23 대표: 처음 300P, 두 번째부터 500P. 한 번의 코칭은 산 날까지의 4주를 읽고,
// 다음 코칭은 그 4주가 끝난 날부터 4주 뒤에 살 수 있다(두 편지가 같은 기록을 겹쳐 읽지 않게).
export const MONTHLY_COACHING_FIRST_COST = 300;
export const MONTHLY_COACHING_COST = 500;
export const MONTHLY_COACHING_INTERVAL_DAYS = 28;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function addDaysToDate(dateStr, days) {
    if (!DATE_RE.test(String(dateStr || ''))) return '';
    const stamp = Date.parse(`${dateStr}T12:00:00Z`);
    return new Date(stamp + days * 86400000).toISOString().slice(0, 10);
}

export function nextCoachingDate(lastPeriodEnd) {
    return addDaysToDate(lastPeriodEnd, MONTHLY_COACHING_INTERVAL_DAYS) || null;
}

/** 「11월 23일」 / 「Nov 23」 */
export function formatCoachingDate(dateStr, { english = false } = {}) {
    const match = DATE_RE.exec(String(dateStr || ''));
    if (!match) return '';
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (english) {
        const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${names[month - 1]} ${day}`;
    }
    return `${month}월 ${day}일`;
}

/** 편지 이름이 되는 기간. 「10월 27일 ~ 11월 23일」 */
export function formatCoachingPeriod(report, { english = false } = {}) {
    const start = formatCoachingDate(report?.periodStart, { english });
    const end = formatCoachingDate(report?.periodEnd, { english });
    return start && end ? `${start} ~ ${end}` : end || start || '';
}

/** 목록 버튼에 쓰는 짧은 기간. 「10/27~11/23」 */
export function formatCoachingPeriodShort(report) {
    const short = (dateStr) => {
        const match = DATE_RE.exec(String(dateStr || ''));
        return match ? `${Number(match[2])}/${Number(match[3])}` : '';
    };
    const start = short(report?.periodStart);
    const end = short(report?.periodEnd);
    return start && end ? `${start}~${end}` : end || start || '';
}

/**
 * 카드에 무엇을 보일지.
 *  - 지난 코칭이 없으면: 첫 값(300P)으로 살 수 있다.
 *  - 지난 코칭의 4주가 안 지났으면: 그 편지를 「최근 해빛 코칭 보기」로, 다음 날짜를 함께.
 *  - 지났으면: 500P 로 살 수 있고, 지난 편지는 모두 목록으로.
 */
export function describeCoachingCard({ reports: list = [], todayStr = '' } = {}) {
    const items = (Array.isArray(list) ? list : [])
        .filter((report) => DATE_RE.test(String(report?.periodEnd || '')))
        .slice()
        .sort((a, b) => String(b.periodEnd).localeCompare(String(a.periodEnd)));
    const latest = items[0] || null;
    const nextDate = latest ? nextCoachingDate(latest.periodEnd) : null;
    const canBuy = !latest || (!!todayStr && String(todayStr) >= String(nextDate));
    return {
        price: latest ? MONTHLY_COACHING_COST : MONTHLY_COACHING_FIRST_COST,
        firstTime: !latest,
        canBuy,
        nextDate,
        latest: canBuy ? null : latest,
        doctorArrived: !canBuy && latest?.doctor?.status === 'sent',
        past: canBuy ? items : items.slice(1),
    };
}
