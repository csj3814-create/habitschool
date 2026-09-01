"use strict";

/**
 * 커뮤니티 현황의 "꾸준함" 칸 — 단일 진실 공급원.
 *
 * 이 파일이 생긴 이유:
 * 원래 이 칸은 "누가 제일 오래 했나" 였다. 31일짜리 달에서 매일 기록한 사람은 전부
 * 31일이라 한 명을 뽑을 수가 없다. 옛 코드는 `>` 비교여서 동점이면 먼저 스캔된
 * 사람이 뽑혔고, 매시간 재집계에서 이름이 바뀔 수 있었다 — mvp-score.js 가 MVP
 * 순위에 대해 고쳐 놓은 그 문제가 이 칸에는 그대로 남아 있었다.
 *
 * 매일 기록하는 사람이 많아진 커뮤니티에서 1등 이름은 정보가 아니다.
 * 그래서 "누가" 를 버리고 "몇 명" 을 센다. 동점이라는 개념 자체가 사라지고,
 * 사람이 늘수록 숫자가 커져 오히려 자랑이 된다.
 *
 * 식을 고칠 일이 있으면 여기만 고친다. 집계는 두 곳(매시간·아카이브 백필)에서
 * 도는데, 그 둘이 갈라지면 이번 달과 지난 달의 기준이 달라진다.
 */

/**
 * 연속 기록 자랑 칸. 위에서부터 인원이 충분한 첫 단계를 쓴다.
 * 최장 기록자 한 명을 세우면 같은 사람이 계속 1등이라 화면이 굳는다.
 */
const STREAK_TIERS = Object.freeze([
    Object.freeze({ days: 100, label: "100일 이상" }),
    Object.freeze({ days: 30, label: "한 달 이상" }),
]);

/** "2명" 은 자랑이 아니라 두 사람 이야기다. 이보다 적으면 아래 단계로 내려간다. */
const STREAK_TIER_MIN_PEOPLE = 3;

/** 달 초에는 "개근" 이 "오늘 했다" 와 같은 말이다. 며칠은 지나야 뜻이 생긴다. */
const PERFECT_ATTENDANCE_MIN_DAYS = 5;

/**
 * 몇 명이 얼마나 오래 이어왔는지 한 줄로 고른다.
 *
 * @param {Array<number>} streakDays 회원별 현재 연속 기록 일수
 * @returns {{days: number, label: string, count: number}|null} 보여줄 게 없으면 null
 */
function pickStreakTier(streakDays) {
    const days = (Array.isArray(streakDays) ? streakDays : [])
        .map((value) => Number(value) || 0)
        .filter((value) => value > 0);

    // 인원을 채운 단계가 없으면, 그래도 사람이 있는 가장 낮은 단계를 쓴다.
    // 단계는 위에서 아래로 내려가므로 마지막에 남는 값이 곧 가장 낮은 단계다.
    let fallback = null;
    for (const tier of STREAK_TIERS) {
        const count = days.filter((value) => value >= tier.days).length;
        if (count >= STREAK_TIER_MIN_PEOPLE) {
            return { days: tier.days, label: tier.label, count };
        }
        if (count > 0) fallback = { days: tier.days, label: tier.label, count };
    }
    return fallback;
}

/**
 * 이 달이 며칠째인지. 지난 달이면 그 달의 전체 일수.
 *
 * @param {string} month 'YYYY-MM'
 * @param {string} todayKst 'YYYY-MM-DD' (KST 기준 오늘)
 */
function getElapsedDaysInMonth(month, todayKst) {
    const target = String(month || "");
    if (!/^\d{4}-\d{2}$/.test(target)) return 0;

    const today = String(todayKst || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(today) && today.slice(0, 7) === target) {
        return Number(today.slice(8, 10)) || 0;
    }

    const [year, month1] = target.split("-").map(Number);
    // UTC 기준 '다음 달 0일' = 이번 달 마지막 날
    return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/**
 * 카테고리별로 하루도 빠지지 않은 사람이 몇 명인지.
 *
 * @param {object} userStats uid -> { diet, exercise, mind } (카테고리별 기록 일수)
 * @param {number} elapsedDays 이 달이 며칠째인지
 * @returns {{days: number, diet: number, exercise: number, mind: number}|null}
 */
function countPerfectAttendance(userStats, elapsedDays) {
    const days = Math.max(0, Math.floor(Number(elapsedDays) || 0));
    if (days < PERFECT_ATTENDANCE_MIN_DAYS) return null;

    const users = Object.values(userStats || {});
    // `>=` 로 세는 이유: 자정 근처 시차로 기록 일수가 경과일을 한 칸 넘을 수 있다.
    // 그때 `===` 로 세면 가장 성실한 사람이 오히려 빠진다.
    const count = (field) => users.filter((user) => (Number(user && user[field]) || 0) >= days).length;

    return { days, diet: count("diet"), exercise: count("exercise"), mind: count("mind") };
}

/**
 * 이 달에 기록한 회원들의 현재 연속 기록 일수를 모은다.
 *
 * 이 달 참여자만 보는 이유: `users/{uid}.currentStreak` 은 기록을 쓸 때만 갱신된다.
 * 석 달 전에 그만둔 사람의 문서에는 그때의 120일이 그대로 남아 있어서, 전체를 세면
 * "100일 이상 N명" 이 떠난 사람까지 세는 숫자가 된다.
 *
 * @param {object} db Firestore 인스턴스
 * @param {Array<string>} userIds 이 달에 기록이 있는 회원
 * @returns {Promise<Array<number>>}
 */
async function collectCurrentStreaks(db, userIds) {
    const ids = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
    const streaks = [];

    for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200).map((uid) => db.doc(`users/${uid}`));
        if (chunk.length === 0) continue;
        const snaps = await db.getAll(...chunk, { fieldMask: ["currentStreak"] });
        for (const snap of snaps) {
            if (!snap.exists) continue;
            const value = Number((snap.data() || {}).currentStreak) || 0;
            if (value > 0) streaks.push(value);
        }
    }

    return streaks;
}

module.exports = {
    STREAK_TIERS,
    STREAK_TIER_MIN_PEOPLE,
    PERFECT_ATTENDANCE_MIN_DAYS,
    pickStreakTier,
    getElapsedDaysInMonth,
    countPerfectAttendance,
    collectCurrentStreaks,
};
