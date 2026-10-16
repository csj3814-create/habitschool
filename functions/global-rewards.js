/**
 * 해빛 배지 · 해외 기프트카드 투표 (해외 서비스 2단계, 2026-10-16 대표 결정).
 *
 *   1) 해빛 배지 — 모든 회원이 포인트로 배지를 산다. 돈이 나가지 않는 포인트 사용처.
 *      배지마다 활동 기준(기록한 날·연속·식단/운동/마음 일수)을 넘어야 살 수 있다.
 *      대표 배지 하나(users.displayBadge · displayBadgeEmoji)는 카톡 단톡방 챗봇 순위에서 이름 앞에 붙고
 *      (habitchatbot 저장소 modules/leaderboardLabels.js), 갤러리 글·댓글의 "배지 칸"(userBadge)에 서버가 저장한다.
 *      이름(userName) 자체에는 배지를 넣지 않는다. 첫 배지를 사면 대표 배지로 바로 단다.
 *   2) 해외 기프트카드 투표 — 해외 회원만. 한국 매장 쿠폰을 쓸 곳이 없는 회원이 원하는지 센다.
 *      기준(GLOBAL_GIFT_CARD_VOTE_THRESHOLD)을 넘으면 그때 기프트카드 업체(Tremendous) 연결을 개발한다.
 * 설계: tasks/2026-10-16_해외_2단계_보상_조사와_설계.md
 *
 * 한국 기프티쇼 교환과 섞지 않는다. 그쪽 모듈·컬렉션은 읽지도 쓰지도 않는다
 * (그쪽 일·주·월 한도는 서비스 전체 합계라, 같은 컬렉션에 쌓으면 한국 회원 한도가 깎인다).
 * 배지 보유(users.globalBadges)·구매 기록·투표는 서버만 쓴다. 회원이 고칠 수 있는
 * 사용자 필드 화이트리스트에 넣지 않았고, 두 컬렉션은 규칙의 기본 거부에 걸린다.
 */

const { DEFAULT_TIME_ZONE, isSupportedTimeZone, normalizeTimeZone } = require("./member-time");

const BADGE_PURCHASES = "global_badge_purchases";
const GIFT_CARD_VOTES = "global_giftcard_votes";
const GALLERY_POSTS = "gallery_posts";

// 배지 진행 통계를 사용자 문서에 담아 두는 시간. 화면을 열 때마다 기록 수백 개를 읽지 않게 한다.
// 살 때는 담아 둔 값이 아니라 기록을 새로 센다.
const BADGE_STATS_TTL_MS = 6 * 60 * 60 * 1000;
// 마일스톤 통계(functions/runtime.js getAuthoritativeMilestoneStats)와 같은 창.
const BADGE_STATS_LOG_LIMIT = 400;

// 투표가 이 수를 넘으면 기프트카드 개발을 검토한다. 관제탑과 회원 화면에 그대로 보인다.
const GLOBAL_GIFT_CARD_VOTE_THRESHOLD = 30;
// js/global-rewards-core.js 의 목록과 같아야 한다(테스트가 확인한다).
const GLOBAL_GIFT_CARD_VOTE_COUNTRIES = Object.freeze(["US", "CA", "GB", "AU", "JP", "OTHER"]);

function defineBadge(badge) {
    return Object.freeze({
        ...badge,
        name: Object.freeze({ ...badge.name }),
        desc: Object.freeze({ ...badge.desc }),
        requirement: Object.freeze({ ...badge.requirement }),
    });
}

// 다른 기능(챌린지·점수·쿠폰)과 묶지 않는다. 가격·기준을 바꿔도 이미 산 회원은 그대로 둔다.
// 기준 metric: activeDays(포인트를 받은 날) · bestStreak(가장 긴 연속, 한 번이라도) · dietDays · exerciseDays · mindDays
// (2026-10-16 대표 결정: 세계 회원 빼고 6개, 기준은 설계 문서 7절 표)
const GLOBAL_BADGES = Object.freeze([
    defineBadge({
        id: "sprout", emoji: "🌱", pointCost: 300,
        name: { ko: "새싹", en: "Sprout" },
        desc: { ko: "해빛스쿨을 시작했어요", en: "Started the habit journey" },
        requirement: { metric: "activeDays", target: 7 },
    }),
    defineBadge({
        id: "flame", emoji: "🔥", pointCost: 2000,
        name: { ko: "꾸준함의 불꽃", en: "Habit Flame" },
        desc: { ko: "꾸준히 기록하고 있어요", en: "Keeps the streak burning" },
        requirement: { metric: "bestStreak", target: 30 },
    }),
    defineBadge({
        id: "plate", emoji: "🥗", pointCost: 3000,
        name: { ko: "균형 잡힌 식탁", en: "Balanced Plate" },
        desc: { ko: "식단을 챙기고 있어요", en: "Eats with care" },
        requirement: { metric: "dietDays", target: 100 },
    }),
    defineBadge({
        id: "mover", emoji: "🏃", pointCost: 3000,
        name: { ko: "매일 움직이기", en: "Daily Mover" },
        desc: { ko: "몸을 움직이고 있어요", en: "Moves every day" },
        requirement: { metric: "exerciseDays", target: 100 },
    }),
    defineBadge({
        id: "sleeper", emoji: "🌙", pointCost: 3000,
        name: { ko: "좋은 잠과 마음", en: "Good Sleep & Mind" },
        desc: { ko: "잠과 마음을 챙겨요", en: "Rests well and minds the mind" },
        requirement: { metric: "mindDays", target: 100 },
    }),
    defineBadge({
        id: "legend", emoji: "👑", pointCost: 10000,
        name: { ko: "습관의 전설", en: "Habit Legend" },
        desc: { ko: "오래 쌓아 온 습관", en: "A long-standing habit builder" },
        requirement: { metric: "activeDays", target: 300 },
    }),
]);

const BADGES_BY_ID = new Map(GLOBAL_BADGES.map((badge) => [badge.id, badge]));

/**
 * 시간대가 있고 서울이 아니면 해외 회원이다. 시간대는 서버(setMemberTimeZone)만 쓰고
 * 30일에 한 번만 바뀐다. 값이 없거나 읽을 수 없으면 한국 회원으로 본다.
 */
function isOverseasMember(userData) {
    const raw = userData && typeof userData === "object" ? userData.timeZone : undefined;
    if (!isSupportedTimeZone(raw)) return false;
    return normalizeTimeZone(raw) !== DEFAULT_TIME_ZONE;
}

function toPoints(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeVoteCountry(value) {
    const code = String(value || "").trim().toUpperCase();
    return GLOBAL_GIFT_CARD_VOTE_COUNTRIES.includes(code) ? code : "OTHER";
}

function ownedBadgeIds(userData = {}) {
    const owned = userData.globalBadges;
    if (!owned || typeof owned !== "object") return new Set();
    return new Set(Object.keys(owned).filter((id) => BADGES_BY_ID.has(id)));
}

function resolveDisplayBadge(userData = {}) {
    const id = String(userData?.displayBadge || "");
    return ownedBadgeIds(userData || {}).has(id) ? id : "";
}

// 갤러리 글·댓글의 배지 칸에 넣을 이모지. 저장된 이모지가 아니라 배지 목록의 이모지를 쓴다.
function resolveDisplayBadgeEmoji(userData) {
    const id = resolveDisplayBadge(userData || {});
    return id ? BADGES_BY_ID.get(id).emoji : "";
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function positivePoints(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
}

/**
 * daily_logs 에서 배지 기준에 쓰는 숫자를 센다. 마일스톤과 같은 기준 — 그날 포인트를 받은 날만 센다.
 */
function computeBadgeStats(logs = []) {
    const active = new Set();
    const diet = new Set();
    const exercise = new Set();
    const mind = new Set();
    for (const log of logs) {
        const date = String(log?.date || "");
        if (!DATE_PATTERN.test(date)) continue;
        const awarded = log.awardedPoints || {};
        const hasDiet = positivePoints(awarded.dietPoints);
        const hasExercise = positivePoints(awarded.exercisePoints);
        const hasMind = positivePoints(awarded.mindPoints);
        if (hasDiet) diet.add(date);
        if (hasExercise) exercise.add(date);
        if (hasMind) mind.add(date);
        if (hasDiet || hasExercise || hasMind) active.add(date);
    }
    let bestStreak = 0;
    let run = 0;
    let previous = null;
    for (const date of [...active].sort()) {
        const time = Date.parse(`${date}T00:00:00Z`);
        run = previous !== null && time - previous === DAY_MS ? run + 1 : 1;
        bestStreak = Math.max(bestStreak, run);
        previous = time;
    }
    return {
        activeDays: active.size,
        bestStreak,
        dietDays: diet.size,
        exerciseDays: exercise.size,
        mindDays: mind.size,
    };
}

async function countBadgeStats(db, uid) {
    const snapshot = await db.collection("daily_logs")
        .where("userId", "==", uid)
        .orderBy("date", "desc")
        .limit(BADGE_STATS_LOG_LIMIT)
        .get();
    return computeBadgeStats(snapshot.docs.map((docSnap) => docSnap.data() || {}));
}

function isFreshBadgeStats(stats, now) {
    const computedAt = Number(stats?.computedAt);
    return Number.isFinite(computedAt) && now - computedAt >= 0 && now - computedAt < BADGE_STATS_TTL_MS;
}

// 화면용: 담아 둔 통계가 새것이면 그대로, 아니면 새로 세서 담아 둔다.
async function getCachedBadgeStats({ db, uid, userData = {}, now = Date.now() }) {
    if (isFreshBadgeStats(userData.badgeStats, now)) return userData.badgeStats;
    const stats = { ...(await countBadgeStats(db, uid)), computedAt: now };
    await db.collection("users").doc(uid).set({ badgeStats: stats }, { merge: true });
    return stats;
}

// 기록은 최근 400개만 센다. 그보다 오래전에 해낸 연속 기록은 마일스톤(한 번 달성하면 남는다)으로 인정한다.
function withMilestoneFloor(stats = {}, userData = {}) {
    const milestones = userData?.milestones || {};
    let bestStreak = Number(stats.bestStreak) || 0;
    if (milestones.streak60?.achieved) bestStreak = Math.max(bestStreak, 60);
    else if (milestones.streak30?.achieved) bestStreak = Math.max(bestStreak, 30);
    return { ...stats, bestStreak };
}

function evaluateRequirement(badge, stats = {}) {
    const current = Math.max(0, Number(stats[badge.requirement.metric]) || 0);
    return {
        metric: badge.requirement.metric,
        target: badge.requirement.target,
        current,
        met: current >= badge.requirement.target,
    };
}

/**
 * 대표 배지가 바뀌면 그 회원의 갤러리 글 배지 칸을 한꺼번에 맞춘다. 이름을 숨긴 글은 건드리지 않는다.
 * 남의 글에 단 댓글은 그대로 둔다(댓글을 달 때의 배지).
 */
const GALLERY_BADGE_WRITE_CHUNK = 100;

async function applyBadgeToGalleryPosts({ db, FieldValue, uid, emoji }) {
    const snapshot = await db.collection(GALLERY_POSTS).where("userId", "==", uid).get();
    const targets = snapshot.docs.filter((docSnap) => {
        const data = docSnap.data() || {};
        if (!String(data.userName || "").trim()) return false;
        if (emoji) return data.userBadge !== emoji;
        return "userBadge" in data;
    });
    // 글이 많은 회원도 한꺼번에 수백 개를 쏘지 않게 100개씩 나눠 쓴다.
    for (let start = 0; start < targets.length; start += GALLERY_BADGE_WRITE_CHUNK) {
        await Promise.all(targets.slice(start, start + GALLERY_BADGE_WRITE_CHUNK).map((docSnap) => (
            docSnap.ref.set({ userBadge: emoji || FieldValue.delete() }, { merge: true })
        )));
    }
    return targets.length;
}

async function countHolders(db) {
    const counts = await Promise.all(GLOBAL_BADGES.map((badge) => db.collection(BADGE_PURCHASES)
        .where("badgeId", "==", badge.id)
        .count()
        .get()));
    return new Map(GLOBAL_BADGES.map((badge, index) => [badge.id, Number(counts[index].data()?.count) || 0]));
}

async function countVotes(db) {
    const snapshot = await db.collection(GIFT_CARD_VOTES).count().get();
    return Number(snapshot.data()?.count) || 0;
}

function buildVoteSummary({ voteData, total }) {
    return {
        voted: Boolean(voteData),
        country: voteData ? normalizeVoteCountry(voteData.country) : "",
        total,
        threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
    };
}

function assertOverseas(userData, HttpsError) {
    if (!isOverseasMember(userData)) {
        throw new HttpsError("failed-precondition", "해외 기프트카드 투표는 해외 시간대 회원만 할 수 있어요.", {
            reason: "not-overseas",
        });
    }
}

/**
 * 배지 목록·보유 여부·포인트. 투표 현황은 해외 회원에게만 붙인다 — 국내 회원이면 투표 컬렉션을 읽지 않는다.
 */
async function buildGlobalRewardSnapshot({ db, uid, userData = {}, now = Date.now() }) {
    const overseas = isOverseasMember(userData);
    const owned = ownedBadgeIds(userData);
    const [stats, holders, voteSnap, total] = await Promise.all([
        getCachedBadgeStats({ db, uid, userData, now }),
        countHolders(db),
        overseas ? db.collection(GIFT_CARD_VOTES).doc(uid).get() : null,
        overseas ? countVotes(db) : 0,
    ]);
    const vote = overseas
        ? buildVoteSummary({ voteData: voteSnap.exists ? voteSnap.data() : null, total })
        : null;

    return {
        overseas,
        coins: toPoints(userData.coins),
        displayBadge: resolveDisplayBadge(userData),
        badges: GLOBAL_BADGES.map((badge) => ({
            id: badge.id,
            emoji: badge.emoji,
            pointCost: badge.pointCost,
            name: { ...badge.name },
            desc: { ...badge.desc },
            owned: owned.has(badge.id),
            holders: holders.get(badge.id) || 0,
            requirement: evaluateRequirement(badge, withMilestoneFloor(stats, userData)),
        })),
        vote,
    };
}

/**
 * 배지 하나를 산다. 같은 배지는 한 번만 — 구매 기록 문서 ID 가 `${uid}_${badgeId}` 로 정해져 있다.
 * 이미 가진 배지면 포인트를 빼지 않고 그대로 돌려준다(버튼을 두 번 눌러도 안전).
 */
async function purchaseGlobalBadge({ db, FieldValue, HttpsError, uid, badgeId }) {
    const id = String(badgeId || "").trim();
    const badge = BADGES_BY_ID.get(id);
    if (!badge) {
        throw new HttpsError("invalid-argument", "고를 수 없는 배지예요.", { reason: "unknown-badge" });
    }

    const userRef = db.collection("users").doc(uid);
    const purchaseRef = db.collection(BADGE_PURCHASES).doc(`${uid}_${badge.id}`);
    // 살 때는 담아 둔 통계가 아니라 기록을 새로 센다(트랜잭션 밖 — 기록 수백 개를 트랜잭션에 묶지 않는다).
    const stats = await countBadgeStats(db, uid);

    const result = await db.runTransaction(async (tx) => {
        const [userSnap, purchaseSnap] = await Promise.all([tx.get(userRef), tx.get(purchaseRef)]);
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        const userData = userSnap.data() || {};
        const coins = toPoints(userData.coins);
        if (purchaseSnap.exists || ownedBadgeIds(userData).has(badge.id)) {
            return { purchased: false, alreadyOwned: true, badgeId: badge.id, pointCost: badge.pointCost, coins };
        }
        const requirement = evaluateRequirement(badge, withMilestoneFloor(stats, userData));
        if (!requirement.met) {
            throw new HttpsError("failed-precondition", "아직 이 배지의 활동 기준을 넘지 않았어요.", {
                reason: "requirement-not-met",
                metric: requirement.metric,
                target: requirement.target,
                current: requirement.current,
            });
        }
        if (coins < badge.pointCost) {
            throw new HttpsError("failed-precondition", "포인트가 모자라요.", {
                reason: "insufficient-points",
                coins,
                pointCost: badge.pointCost,
            });
        }

        const userUpdate = {
            coins: FieldValue.increment(-badge.pointCost),
            globalBadges: {
                [badge.id]: { pointCost: badge.pointCost, purchasedAt: FieldValue.serverTimestamp() },
            },
            badgeStats: { ...stats, computedAt: Date.now() },
        };
        // 대표 배지가 없으면 방금 산 배지를 단다. 사자마자 단톡방 순위·갤러리에 보여야 산 보람이 있다.
        const autoDisplay = !resolveDisplayBadge(userData);
        if (autoDisplay) {
            userUpdate.displayBadge = badge.id;
            userUpdate.displayBadgeEmoji = badge.emoji;
            userUpdate.displayBadgeUpdatedAt = FieldValue.serverTimestamp();
        }
        tx.set(userRef, userUpdate, { merge: true });
        tx.set(purchaseRef, {
            uid,
            badgeId: badge.id,
            pointCost: badge.pointCost,
            coinsBefore: coins,
            timeZone: normalizeTimeZone(userData.timeZone),
            overseas: isOverseasMember(userData),
            createdAt: FieldValue.serverTimestamp(),
        });

        return {
            purchased: true, badgeId: badge.id, pointCost: badge.pointCost, coins: coins - badge.pointCost, autoDisplay,
        };
    });

    if (!result.purchased) return result;
    const { autoDisplay, ...response } = result;
    if (autoDisplay) await applyBadgeToGalleryPosts({ db, FieldValue, uid, emoji: badge.emoji });
    return response;
}

/**
 * 대표 배지를 바꾼다. 가진 배지만 고를 수 있다. 빈 값이면 뗀다.
 * 챗봇이 배지 목록을 따로 들고 있지 않아도 되게 이모지를 함께 남긴다.
 */
async function setDisplayBadge({ db, FieldValue, HttpsError, uid, badgeId }) {
    const id = String(badgeId || "").trim();
    const badge = id ? BADGES_BY_ID.get(id) : null;
    if (id && !badge) {
        throw new HttpsError("invalid-argument", "고를 수 없는 배지예요.", { reason: "unknown-badge" });
    }
    const userRef = db.collection("users").doc(uid);
    const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        if (badge && !ownedBadgeIds(userSnap.data() || {}).has(badge.id)) {
            throw new HttpsError("failed-precondition", "가진 배지만 대표로 달 수 있어요.", { reason: "not-owned" });
        }
        tx.set(userRef, badge
            ? {
                displayBadge: badge.id,
                displayBadgeEmoji: badge.emoji,
                displayBadgeUpdatedAt: FieldValue.serverTimestamp(),
            }
            : {
                displayBadge: FieldValue.delete(),
                displayBadgeEmoji: FieldValue.delete(),
                displayBadgeUpdatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        return { displayBadge: badge ? badge.id : "", displayBadgeEmoji: badge ? badge.emoji : "" };
    });
    await applyBadgeToGalleryPosts({ db, FieldValue, uid, emoji: result.displayBadgeEmoji });
    return result;
}

/**
 * 해외 기프트카드를 원하는지 투표한다. 한 사람 한 표(문서 ID = uid). 나라를 바꿔도 한 표,
 * withdraw 면 표를 뺀다. 포인트는 건드리지 않는다.
 */
async function voteGlobalGiftCard({ db, FieldValue, HttpsError, uid, country, withdraw = false }) {
    const userRef = db.collection("users").doc(uid);
    const voteRef = db.collection(GIFT_CARD_VOTES).doc(uid);

    const voteData = await db.runTransaction(async (tx) => {
        const [userSnap, voteSnap] = await Promise.all([tx.get(userRef), tx.get(voteRef)]);
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        const userData = userSnap.data() || {};
        assertOverseas(userData, HttpsError);

        if (withdraw) {
            if (voteSnap.exists) tx.delete(voteRef);
            return null;
        }

        const next = {
            uid,
            country: normalizeVoteCountry(country),
            timeZone: normalizeTimeZone(userData.timeZone),
            locale: userData.locale === "en" ? "en" : "ko",
            updatedAt: FieldValue.serverTimestamp(),
        };
        if (!voteSnap.exists) next.createdAt = FieldValue.serverTimestamp();
        tx.set(voteRef, next, { merge: true });
        return next;
    });

    return buildVoteSummary({ voteData, total: await countVotes(db) });
}

/**
 * 관제탑: 투표가 기준에 얼마나 왔는지, 해외 회원이 몇 명인지, 배지가 얼마나 팔렸는지.
 */
async function buildAdminGlobalRewardSummary({ db }) {
    const [votesSnap, purchasesSnap, overseasSnap] = await Promise.all([
        db.collection(GIFT_CARD_VOTES).get(),
        db.collection(BADGE_PURCHASES).get(),
        db.collection("users").where("timeZone", "!=", DEFAULT_TIME_ZONE).count().get(),
    ]);

    const byCountry = {};
    votesSnap.docs.forEach((docSnap) => {
        const country = normalizeVoteCountry(docSnap.data()?.country);
        byCountry[country] = (byCountry[country] || 0) + 1;
    });

    const byBadge = {};
    let pointsSpent = 0;
    purchasesSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const id = String(data.badgeId || "");
        byBadge[id] = (byBadge[id] || 0) + 1;
        pointsSpent += toPoints(data.pointCost);
    });

    const total = votesSnap.size;
    return {
        threshold: GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
        votes: {
            total,
            remaining: Math.max(GLOBAL_GIFT_CARD_VOTE_THRESHOLD - total, 0),
            byCountry,
        },
        overseasMembers: Number(overseasSnap.data()?.count) || 0,
        badges: { purchases: purchasesSnap.size, pointsSpent, byBadge },
    };
}

module.exports = {
    GLOBAL_BADGES,
    GLOBAL_GIFT_CARD_VOTE_THRESHOLD,
    GLOBAL_GIFT_CARD_VOTE_COUNTRIES,
    isOverseasMember,
    normalizeVoteCountry,
    computeBadgeStats,
    resolveDisplayBadgeEmoji,
    buildGlobalRewardSnapshot,
    purchaseGlobalBadge,
    setDisplayBadge,
    voteGlobalGiftCard,
    buildAdminGlobalRewardSummary,
};
