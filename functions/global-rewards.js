/**
 * 해빛 배지 · 해외 기프트카드 투표 (해외 서비스 2단계, 2026-10-16 대표 결정).
 *
 *   1) 해빛 배지 — 모든 회원이 포인트로 꾸미기 배지를 산다. 돈이 나가지 않는 포인트 사용처.
 *      처음에는 해외 회원 전용이었다가, 같은 날 대표가 국내 회원에게도 열었다(화면에서 기본으로 접힘).
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

// 투표가 이 수를 넘으면 기프트카드 개발을 검토한다. 관제탑과 회원 화면에 그대로 보인다.
const GLOBAL_GIFT_CARD_VOTE_THRESHOLD = 30;
// js/global-rewards-core.js 의 목록과 같아야 한다(테스트가 확인한다).
const GLOBAL_GIFT_CARD_VOTE_COUNTRIES = Object.freeze(["US", "CA", "GB", "AU", "JP", "OTHER"]);

function defineBadge(badge) {
    return Object.freeze({
        ...badge,
        name: Object.freeze({ ...badge.name }),
        desc: Object.freeze({ ...badge.desc }),
    });
}

// 꾸미기용. 다른 기능(챌린지·점수·쿠폰)과 묶지 않는다. 가격을 바꾸면 이미 산 회원은 그대로 둔다.
const GLOBAL_BADGES = Object.freeze([
    defineBadge({
        id: "sprout", emoji: "🌱", pointCost: 300,
        name: { ko: "새싹", en: "Sprout" },
        desc: { ko: "해빛스쿨을 시작했어요", en: "Started the habit journey" },
    }),
    defineBadge({
        id: "globe", emoji: "🌍", pointCost: 1000,
        name: { ko: "세계 회원", en: "Global Member" },
        desc: { ko: "해외에서 함께해요", en: "Building habits from abroad" },
    }),
    defineBadge({
        id: "flame", emoji: "🔥", pointCost: 2000,
        name: { ko: "꾸준함의 불꽃", en: "Habit Flame" },
        desc: { ko: "꾸준히 기록하고 있어요", en: "Keeps the streak burning" },
    }),
    defineBadge({
        id: "plate", emoji: "🥗", pointCost: 3000,
        name: { ko: "균형 잡힌 식탁", en: "Balanced Plate" },
        desc: { ko: "식단을 챙기고 있어요", en: "Eats with care" },
    }),
    defineBadge({
        id: "mover", emoji: "🏃", pointCost: 3000,
        name: { ko: "매일 움직이기", en: "Daily Mover" },
        desc: { ko: "몸을 움직이고 있어요", en: "Moves every day" },
    }),
    defineBadge({
        id: "sleeper", emoji: "🌙", pointCost: 3000,
        name: { ko: "깊은 잠", en: "Deep Sleeper" },
        desc: { ko: "잠과 마음을 챙겨요", en: "Rests well and minds the mind" },
    }),
    defineBadge({
        id: "legend", emoji: "👑", pointCost: 10000,
        name: { ko: "습관의 전설", en: "Habit Legend" },
        desc: { ko: "오래 쌓아 온 습관", en: "A long-standing habit builder" },
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
async function buildGlobalRewardSnapshot({ db, uid, userData = {} }) {
    const overseas = isOverseasMember(userData);
    const owned = ownedBadgeIds(userData);
    let vote = null;
    if (overseas) {
        const [voteSnap, total] = await Promise.all([
            db.collection(GIFT_CARD_VOTES).doc(uid).get(),
            countVotes(db),
        ]);
        vote = buildVoteSummary({ voteData: voteSnap.exists ? voteSnap.data() : null, total });
    }

    return {
        overseas,
        coins: toPoints(userData.coins),
        badges: GLOBAL_BADGES.map((badge) => ({
            id: badge.id,
            emoji: badge.emoji,
            pointCost: badge.pointCost,
            name: { ...badge.name },
            desc: { ...badge.desc },
            owned: owned.has(badge.id),
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

    return db.runTransaction(async (tx) => {
        const [userSnap, purchaseSnap] = await Promise.all([tx.get(userRef), tx.get(purchaseRef)]);
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }
        const userData = userSnap.data() || {};
        const coins = toPoints(userData.coins);
        if (purchaseSnap.exists || ownedBadgeIds(userData).has(badge.id)) {
            return { purchased: false, alreadyOwned: true, badgeId: badge.id, pointCost: badge.pointCost, coins };
        }
        if (coins < badge.pointCost) {
            throw new HttpsError("failed-precondition", "포인트가 모자라요.", {
                reason: "insufficient-points",
                coins,
                pointCost: badge.pointCost,
            });
        }

        tx.set(userRef, {
            coins: FieldValue.increment(-badge.pointCost),
            globalBadges: {
                [badge.id]: { pointCost: badge.pointCost, purchasedAt: FieldValue.serverTimestamp() },
            },
        }, { merge: true });
        tx.set(purchaseRef, {
            uid,
            badgeId: badge.id,
            pointCost: badge.pointCost,
            coinsBefore: coins,
            timeZone: normalizeTimeZone(userData.timeZone),
            overseas: isOverseasMember(userData),
            createdAt: FieldValue.serverTimestamp(),
        });

        return { purchased: true, badgeId: badge.id, pointCost: badge.pointCost, coins: coins - badge.pointCost };
    });
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
    buildGlobalRewardSnapshot,
    purchaseGlobalBadge,
    voteGlobalGiftCard,
    buildAdminGlobalRewardSummary,
};
