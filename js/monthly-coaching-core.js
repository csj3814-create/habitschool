// 한 달 코칭 카드의 판단만 모은 순수 모듈(화면·서버를 읽지 않는다 — 시험할 수 있게).
// 값은 서버(functions/monthly-coaching.js)와 같아야 한다. 실제로 빼는 값은 서버가 정한다.
// 2026-11-23 대표: 처음 300P, 두 번째부터 500P.
export const MONTHLY_COACHING_FIRST_COST = 300;
export const MONTHLY_COACHING_COST = 500;

/** 카드에 무엇을 보일지. */
export function describeCoachingCard({ reports: list = [], monthKey = '' } = {}) {
    const items = Array.isArray(list) ? list : [];
    const current = items.find((report) => report?.month === monthKey) || null;
    const past = items.filter((report) => report?.month && report.month !== monthKey);
    return {
        price: past.length > 0 || current ? MONTHLY_COACHING_COST : MONTHLY_COACHING_FIRST_COST,
        firstTime: !current && past.length === 0,
        boughtThisMonth: !!current,
        doctorArrived: current?.doctor?.status === 'sent',
        current,
        past,
    };
}
