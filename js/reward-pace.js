// 화면 문구는 사전(pace.*)에 있다(해외 3단계 E3-1).
import { t } from './i18n.js?v=540';
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
            text: t('pace.gapNow', { gap: gapLabel })
        };
    }

    const bonus = projection.claimableNow + projection.upcomingBonus;
    const bonusNote = bonus > 0 ? t('pace.bonusNote', { bonus: `${formatCount(bonus)}${unit}` }) : '';
    return {
        ...projection,
        text: t('pace.gapDays', { gap: gapLabel, days: formatCount(projection.days), n: projection.days, note: bonusNote })
    };
}

// 마켓 카탈로그를 아직 못 받았을 때만 쓰는 값. 상품 정가다.
export const DEFAULT_REWARD_GOAL_POINTS = 2000;

/**
 * 자산 탭 '가장 가까운 보상' 카드가 겨냥할 값.
 *
 * 카드가 2,000P 를 박아 두고 있을 때, 첫 교환 할인(1,400P)을 아직 쓰지 않은
 * 신규 회원은 같은 탭에서 두 숫자를 봤다 — 마켓 버튼은 "12일이면 돼요", 카드는
 * "약 23일". 값은 서버가 회원별로 매긴 카탈로그의 pointCost 하나만 믿는다.
 * 할인이 남아 있으면 그게 이미 할인가이고, originalPointCost 가 정가다.
 *
 * 포인트로 사는 상품 중 가장 싼 것. HBT 정산 상품은 이 카드가 말하는 단위가 아니다.
 */
export function resolveRewardGoalTarget(catalog = [], settings = {}) {
    const defaultAsset = String(settings?.settlementAsset || 'points').trim().toLowerCase();
    let best = null;
    (Array.isArray(catalog) ? catalog : []).forEach((item) => {
        if (!item || item.available === false) return;
        const asset = String(item.settlementAsset || defaultAsset).trim().toLowerCase();
        if (asset === 'hbt') return;
        const cost = Number(item.pointCost ?? item.hbtCost ?? 0) || 0;
        if (!(cost > 0)) return;
        if (best && best.cost <= cost) return;
        const original = Number(item.originalPointCost || 0);
        const discounted = item.firstRedemptionDiscount === true && original > cost;
        best = { cost, originalCost: discounted ? original : cost, discounted };
    });
    return best;
}

/**
 * 카드에 쓸 문구를 한 번에 만든다. 남은 기간 문구는 마켓 잠금 버튼과 같은
 * describeRewardGap 에서 온다 — 두 화면이 같은 날짜를 말해야 한다.
 */
export function buildRewardGoalView(coins, { catalog = [], settings = {}, context = {} } = {}) {
    const current = Math.max(0, Number(coins) || 0);
    const goal = resolveRewardGoalTarget(catalog, settings)
        || { cost: DEFAULT_REWARD_GOAL_POINTS, originalCost: DEFAULT_REWARD_GOAL_POINTS, discounted: false };
    const target = goal.cost;
    const remaining = Math.max(0, target - current);
    const targetLabel = `${formatCount(target)}P`;

    let estimate;
    if (remaining > 0) {
        estimate = describeRewardGap(remaining, context, 'P')?.text || '';
    } else {
        estimate = t('pace.checkMarket');
    }

    return {
        current,
        target,
        originalCost: goal.originalCost,
        discounted: goal.discounted,
        remaining,
        progress: Math.min(100, (current / target) * 100),
        valueNow: Math.min(current, target),
        heading: goal.discounted
            ? t('pace.headingFirst', { target: targetLabel })
            : t('pace.heading', { target: targetLabel }),
        ariaLabel: t('pace.aria', { target: targetLabel }),
        // 할인가만 보이면 두 번째 교환에서 값이 오른 줄 안다. 마켓 배지와 같은 말을 한다.
        copy: remaining <= 0
            ? t('pace.copyReady', { current: formatCount(current) })
            : goal.discounted
                ? t('pace.copyDiscount', { current: formatCount(current), original: formatCount(goal.originalCost) })
                : t('pace.copyKeepGoing', { current: formatCount(current) }),
        remainingLabel: remaining > 0 ? t('pace.remaining', { n: formatCount(remaining) }) : t('pace.readyNow'),
        estimate
    };
}

/**
 * 첫 기록 결과 창의 "쿠폰까지" 한 줄. 자산 탭 카드와 같은 목표값을 쓴다 —
 * 가입하자마자 본 첫 숫자가 2,000P 이고 마켓에서 1,400P 를 보면 어느 쪽이
 * 맞는지 모른다.
 */
export function describeFirstRecordGoal(view, { english = false } = {}) {
    const target = Number(view?.target) || DEFAULT_REWARD_GOAL_POINTS;
    const remaining = Math.max(0, Number(view?.remaining) || 0);
    if (english) {
        const amount = (value) => `${Number(value).toLocaleString('en-US')}P`;
        return {
            label: view?.discounted ? `To ${amount(target)} (first-exchange price)` : `To ${amount(target)}`,
            remaining: remaining > 0 ? `${amount(remaining)} to go` : 'Reached'
        };
    }
    return {
        label: view?.discounted ? `첫 교환 ${formatCount(target)}P 쿠폰까지` : `${formatCount(target)}P 쿠폰까지`,
        remaining: remaining > 0 ? `${formatCount(remaining)}P 남음` : '교환 가능'
    };
}
