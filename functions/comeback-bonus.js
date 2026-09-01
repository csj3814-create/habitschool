"use strict";

/**
 * 복귀 보너스 — 규칙 한 곳.
 *
 * 오래 쉬었다가 다시 기록한 회원에게 한 번 얹어 준다. 미활동 안내 메일이 "돌아오면
 * 좋은 일이 있다" 고 말하려면, 그 좋은 일이 실제로 있어야 한다.
 *
 * 이 파일에서 가장 중요한 것은 금액이 아니라 **결석에 보상하지 않는 것**이다.
 * 7일을 쉬면 그동안 기록으로 벌 수 있었던 것이 300~560P(하루 최대 80P)다. 복귀
 * 보너스가 거기에 가까워지면 쉬는 쪽이 이득이 되고, 그 순간 이 보상은 습관을 돕는
 * 것이 아니라 습관을 깨는 값이 된다. 그래서 하루치 기록 수준으로 묶는다.
 *
 * 포인트 값어치 기준(2026-09): 아메리카노 쿠폰 2,000P = 2,000원 → 1P ≈ 1원.
 * 가입 축하 200P, 추천 500/300P, 마일스톤 5~100P.
 */

/** 하루치 기록(40~80P)과 비슷한 수준. 마일스톤 최고액(100P)의 절반. */
const COMEBACK_BONUS_POINTS = 50;

/** 이만큼 이상 비었다가 돌아와야 한다. 3일은 "떠났다" 가 아니라 "바빴다" 다. */
const COMEBACK_MIN_GAP_DAYS = 7;

/**
 * 한 번 받으면 이 기간 안에는 다시 받지 못한다.
 * 이게 없으면 "일주일 쉬고 → 하루 기록 → 보너스" 를 반복할 수 있다.
 */
const COMEBACK_COOLDOWN_DAYS = 30;

function daysBetween(fromDateStr, toDateStr) {
    const from = new Date(`${fromDateStr}T12:00:00Z`).getTime();
    const to = new Date(`${toDateStr}T12:00:00Z`).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
    return Math.round((to - from) / 86400000);
}

function isDateString(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

/**
 * 이번 기록으로 복귀 보너스를 받을 자격이 있는지.
 *
 * @param {object} input
 * @param {string} input.logDate        이번에 기록한 날 'YYYY-MM-DD'
 * @param {string} input.previousLogDate 그 전 마지막 기록일 (없으면 '')
 * @param {string} input.lastBonusDate  마지막으로 복귀 보너스를 받은 날 (없으면 '')
 * @returns {{earned: boolean, points: number, gapDays: number|null, reason: string}}
 */
function decideComebackBonus({ logDate, previousLogDate, lastBonusDate } = {}) {
    const deny = (reason, gapDays = null) => ({ earned: false, points: 0, gapDays, reason });

    if (!isDateString(logDate)) return deny("invalid_date");

    // 처음 기록하는 사람에게는 '복귀' 가 없다. 가입 축하가 그 자리를 맡는다.
    if (!isDateString(previousLogDate)) return deny("no_previous_record");

    // 지난 기록을 나중에 고치는 경우. 그건 돌아온 것이 아니다.
    if (logDate <= previousLogDate) return deny("not_a_new_day");

    const gapDays = daysBetween(previousLogDate, logDate);
    if (gapDays === null) return deny("invalid_date");
    if (gapDays < COMEBACK_MIN_GAP_DAYS) return deny("gap_too_short", gapDays);

    if (isDateString(lastBonusDate)) {
        const sinceBonus = daysBetween(lastBonusDate, logDate);
        if (sinceBonus !== null && sinceBonus < COMEBACK_COOLDOWN_DAYS) {
            return deny("cooldown", gapDays);
        }
    }

    return { earned: true, points: COMEBACK_BONUS_POINTS, gapDays, reason: "earned" };
}

module.exports = {
    COMEBACK_BONUS_POINTS,
    COMEBACK_MIN_GAP_DAYS,
    COMEBACK_COOLDOWN_DAYS,
    daysBetween,
    decideComebackBonus,
};
