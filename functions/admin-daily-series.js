"use strict";

/**
 * 관제탑 대시보드 "일별 활성 유저 · 지급 포인트" 시계열 (7 · 30 · 100 · 365일).
 *
 * 비용: 365일을 누를 때마다 daily_logs 1년치를 읽지 않는다.
 * - 날짜별 합계(활성 회원 수, 기록 포인트)를 meta/adminDailySeries 한 문서에 날짜 키로 모아 둔다.
 * - 기록은 그날·다음날 고쳐질 수 있으니 오늘부터 SETTLE_DAYS 일 전까지는 매번 다시 센다.
 *   그보다 오래된 날은 한 번 센 값을 그대로 쓴다. 처음 한 번만 1년치를 읽는다.
 * - 보너스 포인트(가입·초대·챌린지·월간 보상)는 회원 문서·거래 기록에서 나온다. 대시보드 첫
 *   화면이 이미 매번 읽는 것과 같은 양이라 저장하지 않고 매번 계산한다.
 *
 * 합계만 돌려준다. 회원 하나를 가리키는 값은 내보내지 않는다.
 */

const { getAwardedPointsTotal } = require("./challenge-utils");

const SERIES_RANGE_DAYS = [7, 30, 100, 365];
// 오늘 포함 이만큼(오늘·어제·그제)은 캐시를 믿지 않고 다시 센다.
const SETTLE_DAYS = 3;
// 캐시에 남겨 둘 날 수. 365일 보기에 여유를 둔다.
const CACHE_KEEP_DAYS = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function addDateKeyDays(dateKey, days) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ""));
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
}

function isValidDateKey(value) {
    return DATE_RE.test(String(value || "")) && addDateKeyDays(value, 0) === value;
}

function normalizeRangeDays(value) {
    const days = Number(value);
    return SERIES_RANGE_DAYS.includes(days) ? days : 0;
}

/** todayStr 에서 끝나는 days 일의 날짜 키(오래된 날부터). */
function listDateKeys(todayStr, days) {
    const keys = [];
    for (let i = days - 1; i >= 0; i -= 1) keys.push(addDateKeyDays(todayStr, -i));
    return keys;
}

/**
 * 어느 날부터 daily_logs 를 다시 읽어야 하는지.
 * 캐시에 없는 가장 이른 날, 또는 정산 기간 시작일 중 이른 쪽. 그 날부터 오늘까지 한 번에 읽는다.
 */
function planLogReadStart({ dateKeys, cachedDays = {}, todayStr }) {
    const settleStart = addDateKeyDays(todayStr, -(SETTLE_DAYS - 1));
    let start = settleStart;
    for (const key of dateKeys) {
        if (key >= settleStart) break;
        if (!cachedDays[key]) { start = key; break; }
    }
    return start < dateKeys[0] ? dateKeys[0] : start;
}

/** daily_logs 행들({date, userId, awardedPoints})을 날짜별 {active, points} 로 모은다. */
function aggregateLogsByDate(logs = [], startDate, endDate) {
    const users = {};
    const points = {};
    logs.forEach((log) => {
        const date = String(log?.date || "");
        if (!date || date < startDate || date > endDate) return;
        if (!users[date]) { users[date] = new Set(); points[date] = 0; }
        const userId = String(log.userId || "");
        if (userId) users[date].add(userId);
        points[date] += getAwardedPointsTotal(log.awardedPoints || {});
    });
    const days = {};
    for (let key = startDate; key && key <= endDate; key = addDateKeyDays(key, 1)) {
        days[key] = { active: users[key] ? users[key].size : 0, points: points[key] || 0 };
    }
    return days;
}

/**
 * 가입·초대·챌린지·월간 보상 포인트를 날짜별로. getAdminDashboardSnapshot 과 같은 규칙.
 * users: users 문서 data 배열, challengeTxs: 성공한 챌린지 정산 거래, monthlyRewards: monthly_rewards 문서.
 */
function buildBonusPointsMap({ users = [], challengeTxs = [], monthlyRewards = [], startDate, endDate, toKstDateKey }) {
    const map = {};
    const add = (dateKey, value) => {
        const amount = Number(value) || 0;
        if (!dateKey || dateKey < startDate || dateKey > endDate || amount <= 0) return;
        map[dateKey] = (map[dateKey] || 0) + amount;
    };
    users.forEach((data = {}) => {
        const createdDate = toKstDateKey(data.createdAt);
        if (data.welcomeBonusGiven) add(createdDate, 200);
        if (data.referredBy) add(createdDate, 200);
        if (data.referralDay3BonusGiven) add(toKstDateKey(data.referralDay3BonusAt || data.referralDay3BonusDate), 500);
        if (data.referralDay7BonusGiven) add(toKstDateKey(data.referralDay7BonusAt || data.referralDay7BonusDate), 300);
        // 친구가 기록한 날마다 초대한 사람에게 나간 몫(2026-11-03). 마지막으로 나간 날에 모아 센다 — 근사치다.
        if (data.referralRecordPoints) add(toKstDateKey(data.referralRecordRewardedAt), data.referralRecordPoints);
    });
    challengeTxs.forEach((data = {}) => {
        if (data.status !== "success") return;
        add(String(data.date || "") || toKstDateKey(data.updatedAt || data.timestamp), data.rewardPoints);
    });
    monthlyRewards.forEach((data = {}) => {
        const dateKey = toKstDateKey(data.distributedAt);
        (Array.isArray(data.winners) ? data.winners : []).forEach((winner) => add(dateKey, winner?.reward));
    });
    return map;
}

/**
 * 캐시와 새로 센 날을 합쳐 화면에 줄 행과, 다시 저장할 캐시를 만든다.
 * 오늘·어제·그제는 캐시에 넣지 않는다(아직 바뀔 수 있다).
 */
function buildDailySeries({ dateKeys, cachedDays = {}, freshDays = {}, bonusPointsMap = {}, todayStr }) {
    const rows = dateKeys.map((date) => {
        const base = freshDays[date] || cachedDays[date] || { active: 0, points: 0 };
        return {
            date,
            active: Number(base.active) || 0,
            points: (Number(base.points) || 0) + (Number(bonusPointsMap[date]) || 0),
        };
    });

    const settleStart = addDateKeyDays(todayStr, -(SETTLE_DAYS - 1));
    const keepFrom = addDateKeyDays(todayStr, -(CACHE_KEEP_DAYS - 1));
    const nextCache = {};
    Object.entries(cachedDays).forEach(([date, value]) => {
        if (date >= keepFrom && date < settleStart) nextCache[date] = value;
    });
    Object.entries(freshDays).forEach(([date, value]) => {
        if (date >= keepFrom && date < settleStart) {
            nextCache[date] = { active: Number(value.active) || 0, points: Number(value.points) || 0 };
        }
    });
    const sameDay = (a, b) => !!a && !!b && Number(a.active) === Number(b.active) && Number(a.points) === Number(b.points);
    const cacheChanged = Object.keys(cachedDays).length !== Object.keys(nextCache).length
        || Object.keys(nextCache).some((date) => !sameDay(nextCache[date], cachedDays[date]));
    return { rows, nextCache, cacheChanged };
}

module.exports = {
    SERIES_RANGE_DAYS,
    SETTLE_DAYS,
    CACHE_KEEP_DAYS,
    addDateKeyDays,
    isValidDateKey,
    normalizeRangeDays,
    listDateKeys,
    planLogReadStart,
    aggregateLogsByDate,
    buildBonusPointsMap,
    buildDailySeries,
};
