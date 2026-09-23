/**
 * 첫 교환까지 남은 거리를 사람 말로 바꾼다.
 *
 * 교환 화면은 오랫동안 거리를 숨기고 있었다 — 포인트가 모자라면 버튼이 잠기고
 * 끝이라, 회원 입장에서는 2주 남은 것과 두 달 남은 것이 똑같아 보였다. 첫 커피가
 * 보통 한 달쯤 뒤에 오는데 그 한 달 내내 아무 표시가 없으면 그냥 멀게만 느껴진다.
 *
 * 의존성이 없는 순수 모듈이다. reward-market.js 는 gstatic 을 import 해서 테스트에서
 * 그대로 불러올 수 없기 때문에, 계산만 여기로 떼어 시험할 수 있게 둔다.
 */

export const REWARD_PACE_WINDOW_DAYS = 7;

function formatCount(value) {
    return Number(value || 0).toLocaleString('ko-KR');
}

/**
 * KST 날짜 문자열을 그대로 며칠 옮긴다. 자정 근처에서 로컬 시간대로 새는 것을
 * 막으려고 UTC 정오가 아니라 UTC 자정 기준으로 더하고 다시 잘라낸다.
 */
export function shiftDateString(dateStr, deltaDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return '';
    const base = new Date(`${dateStr}T00:00:00Z`);
    base.setUTCDate(base.getUTCDate() + (Number(deltaDays) || 0));
    return base.toISOString().slice(0, 10);
}

/**
 * 최근 7일 하루 평균 적립.
 *
 * **기록이 없는 날도 분모에 넣는다.** 기록한 날만 평균 내면 주 2회 쓰는 회원에게
 * 매일 쓰는 사람의 속도를 보여주게 되고, 예고한 날짜가 반드시 빗나간다.
 */
export function computeDailyEarningPace(logs = [], today = '') {
    const since = shiftDateString(today, -(REWARD_PACE_WINDOW_DAYS - 1));
    if (!since) return 0;

    let total = 0;
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const date = String(log?.date || '');
        if (date < since || date > today) return;
        const awarded = log?.awardedPoints;
        if (!awarded || typeof awarded !== 'object') return;
        total += (Number(awarded.dietPoints) || 0)
            + (Number(awarded.exercisePoints) || 0)
            + (Number(awarded.mindPoints) || 0);
    });

    return total / REWARD_PACE_WINDOW_DAYS;
}

/**
 * 남은 포인트와 속도로 한 줄을 만든다.
 *
 * **모르면 말하지 않는다.** 최근에 적립이 없으면 속도를 알 수 없고, 알 수 없는 걸
 * "약 N일" 로 적으면 그 날짜가 지나가는 순간 거짓말이 된다. 그때는 남은 양만 말한다.
 */
export function describeRewardGap(gapPoints, pointsPerDay, unitLabel = 'P') {
    const gap = Math.ceil(Number(gapPoints) || 0);
    if (!Number.isFinite(gap) || gap <= 0) return null;

    const gapLabel = `${formatCount(gap)}${String(unitLabel || 'P')}`;
    const perDay = Number(pointsPerDay);

    if (!Number.isFinite(perDay) || perDay <= 0) {
        return { gap, days: null, text: `${gapLabel} 더 모으면 교환할 수 있어요` };
    }

    const days = Math.ceil(gap / perDay);

    // 두 달 넘게 남았다면 날짜는 격려가 아니라 통보다. 거리만 말하고 길을 알려준다.
    if (days > 60) {
        return { gap, days, text: `${gapLabel} 남았어요 · 하루 한 번만 더 기록해도 훨씬 빨라져요` };
    }

    return { gap, days, text: `${gapLabel} 남았어요 · 요즘 속도면 약 ${formatCount(days)}일` };
}
