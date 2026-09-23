/**
 * 첫 교환까지 남은 거리를 "매일 다 채우면 며칠"로 바꾼다.
 *
 * 처음에는 최근 7일 평균 속도로 날짜를 셌다. 그런데 그 숫자는 지금 모습을
 * 비추기만 한다 — 주 2회 쓰는 회원에게 "약 26일"은 의지를 만들지 못한다.
 * 보여 줄 것은 **해내면 얼마나 가까운가**다. 하루 최대 80P 에 그 사이 넘게 될
 * 마일스톤 보너스까지 더해, 가장 빠르게 닿는 날을 말한다.
 *
 * 부풀리지는 않는다. 카테고리별 기록 일수는 회원 문서에 없어서 이미 달성한
 * 마일스톤의 목표값을 하한으로 쓴다. 실제가 더 많으면 보너스가 더 일찍 오므로
 * 예고한 날짜보다 늦어지는 일은 없다.
 *
 * 의존성이 없는 순수 모듈이다. reward-market.js 는 gstatic 을 import 해서
 * 테스트에서 그대로 불러올 수 없기 때문에, 계산만 여기로 떼어 둔다.
 */

// 식단 30 + 운동 30 + 마음 20. functions/points-utils.js 의 DAILY_POINT_CAPS 합.
export const DAILY_MAX_POINTS = 80;
const PROJECTION_LIMIT_DAYS = 365;

function formatCount(value) {
    return Number(value || 0).toLocaleString('ko-KR');
}

/**
 * 매일 최대로 기록했을 때 교환까지 걸리는 날과, 그 사이 받는 보너스.
 *
 * definitions  js/firebase-config.js 의 MILESTONES
 * state        회원 문서의 milestones ({ id: { achieved, bonusClaimed } })
 * streak       회원 문서의 currentStreak
 *
 * 돌려주는 것:
 *   days           0 이면 지금 받을 수 있는 보너스만으로 충분하다
 *   claimableNow   이미 달성했는데 아직 안 받은 보너스
 *   upcomingBonus  그 사이 새로 달성해서 받을 보너스
 */
export function projectFastestRedemption(gapPoints, { definitions = {}, state = {}, streak = 0 } = {}) {
    const gap = Math.ceil(Number(gapPoints) || 0);
    if (!Number.isFinite(gap) || gap <= 0) return null;

    const milestoneState = state && typeof state === 'object' ? state : {};
    let claimableNow = 0;
    const pending = [];
    const baseByCategory = {};

    Object.entries(definitions || {}).forEach(([category, catData]) => {
        const levels = Array.isArray(catData?.levels) ? catData.levels : [];
        let highestAchieved = 0;
        levels.forEach((level) => {
            const entry = milestoneState[level.id] || {};
            const reward = Number(level.reward) || 0;
            const target = Number(level.target) || 0;
            if (entry.achieved) {
                highestAchieved = Math.max(highestAchieved, target);
                if (!entry.bonusClaimed) claimableNow += reward;
            } else {
                pending.push({ category, target, reward });
            }
        });
        // 연속 기록은 회원 문서에 값이 있다. 나머지는 달성한 목표가 하한이다.
        baseByCategory[category] = category === 'streak'
            ? Math.max(Number(streak) || 0, 0)
            : highestAchieved;
    });

    let remaining = gap - claimableNow;
    let upcomingBonus = 0;
    let days = 0;
    const reached = new Set();

    while (remaining > 0 && days < PROJECTION_LIMIT_DAYS) {
        days += 1;
        remaining -= DAILY_MAX_POINTS;
        pending.forEach((item, index) => {
            if (reached.has(index)) return;
            if ((baseByCategory[item.category] || 0) + days < item.target) return;
            reached.add(index);
            remaining -= item.reward;
            upcomingBonus += item.reward;
        });
    }

    return { gap, days, claimableNow, upcomingBonus };
}

/**
 * 한 줄로 만든다.
 *
 * 보너스를 따로 말하는 이유: "12일"만 적으면 80P × 12 가 1,140 보다 적은데
 * 왜 되는지 회원이 계산해 보고 의심한다. 보너스가 들어 있다고 말하면 숫자가
 * 믿을 만해지고, 마일스톤을 챙길 이유도 생긴다.
 */
export function describeRewardGap(gapPoints, context = {}, unitLabel = 'P') {
    const projection = projectFastestRedemption(gapPoints, context);
    if (!projection) return null;

    const unit = String(unitLabel || 'P');
    const gapLabel = `${formatCount(projection.gap)}${unit}`;

    if (projection.days === 0) {
        return {
            ...projection,
            text: `${gapLabel} 남았어요 · 받을 수 있는 마일스톤 보너스만 받아도 바로 교환돼요`
        };
    }

    const bonus = projection.claimableNow + projection.upcomingBonus;
    const bonusNote = bonus > 0 ? ` (보너스 +${formatCount(bonus)}${unit} 포함)` : '';
    return {
        ...projection,
        text: `${gapLabel} 남았어요 · 매일 다 채우면 ${formatCount(projection.days)}일이면 돼요${bonusNote}`
    };
}
