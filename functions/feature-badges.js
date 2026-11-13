"use strict";

/**
 * 해빛 배지 — 기록이 쌓인 회원이 잠긴 기능을 여는 길(2026-11-07 대표 합의).
 *
 * 설계: tasks/2026-11-07_단계별_기능_잠금_설계.md. 화면 쪽 판단은 js/feature-unlock.js 이고,
 * 단계 숫자는 둘이 같아야 한다(tests/feature-unlock.test.js 가 맞춰 본다).
 *
 * 받는 것은 서버만 한다. 회원 문서의 featureBadges 는 쓰기 허용 목록(firestore.rules 의
 * isAllowedUserField)에 없어서 회원이 직접 쓰지 못한다. 기록일은 여기서 다시 세고, 값은
 * 이 파일의 상수만 믿는다 — 앱이 보낸 숫자는 배지 이름 하나뿐이다.
 *
 * 켜고 끄는 것은 meta/featureUnlock 문서 하나다. { enabled: true, launchedAt: ISO 문자열 }.
 * 문서가 없거나 enabled 가 true 가 아니면 아무것도 잠그지 않고, 배지도 주지 않는다.
 * launchedAt 보다 먼저 가입한 회원 중 기록이 있는 사람은 잠그지 않는다(앱이 판단한다).
 */

const { onCall: baseOnCall, HttpsError } = require("firebase-functions/v2/https");
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const admin = require("firebase-admin");
const { getMemberToday } = require("./member-time");

const FEATURE_BADGES = Object.freeze([
    Object.freeze({ id: "first", days: 3, cost: 0, features: Object.freeze(["healthScore", "habitGroup"]) }),
    Object.freeze({ id: "habit", days: 7, cost: 100, features: Object.freeze(["challenge"]) }),
    Object.freeze({ id: "haebit", days: 14, cost: 200, features: Object.freeze(["report30"]) }),
]);

const FEATURE_UNLOCK_SETTINGS_PATH = "meta/featureUnlock";

// 대시보드와 같은 범위(최근 기록 30개)로 센다. 가장 높은 단계가 14일이라 충분하다.
const RECORD_LOOKBACK = 30;

/** js/activity-days.js 의 isActiveAward 와 같은 기준. 포인트를 받은 날만 기록한 날이다. */
function isActiveAward(awarded = {}) {
    return Number(awarded?.dietPoints || 0) > 0
        || Number(awarded?.exercisePoints || 0) > 0
        || Number(awarded?.mindPoints || 0) > 0
        || awarded?.diet === true
        || awarded?.exercise === true
        || awarded?.mind === true;
}

function countRecordedDays(logs = []) {
    const dates = new Set();
    (Array.isArray(logs) ? logs : []).forEach((log) => {
        const date = String(log?.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        if (isActiveAward(log.awardedPoints || log.awarded || {})) dates.add(date);
    });
    return dates.size;
}

function getFeatureBadge(badgeId) {
    return FEATURE_BADGES.find((badge) => badge.id === String(badgeId || "").trim()) || null;
}

/** 대시보드에 함께 보내는 설정. 앱은 이걸로 잠글지 정한다. */
function normalizeFeatureUnlockSettings(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    const launchedAt = String(data.launchedAt || "").trim();
    return {
        enabled: data.enabled === true && Number.isFinite(Date.parse(launchedAt)),
        launchedAt,
    };
}

/**
 * 받을 수 있는가. 같은 배지를 두 번 받지 못하고, 기록일과 포인트가 모자라면 받지 못한다.
 * 앞 단계 배지를 먼저 받을 필요는 없다 — 기록 14일 회원이 해빛 배지만 받아도 된다.
 */
function decideBadgeClaim({ enabled, badgeId, owned = {}, recordedDays = 0, coins = 0 } = {}) {
    const badge = getFeatureBadge(badgeId);
    if (!badge) return { ok: false, reason: "unknown_badge" };
    if (enabled !== true) return { ok: false, reason: "disabled", badge };
    if (owned && owned[badge.id]) return { ok: false, reason: "already_owned", badge };
    const days = Math.max(0, Math.floor(Number(recordedDays) || 0));
    if (days < badge.days) return { ok: false, reason: "not_enough_days", badge, recordedDays: days };
    const balance = Number(coins) || 0;
    if (balance < badge.cost) return { ok: false, reason: "not_enough_points", badge, coins: balance };
    return { ok: true, reason: "ok", badge, recordedDays: days };
}

function featureBadgeLedgerId(badgeId, uid) {
    return `feature_badge_${badgeId}_${uid}`;
}

const CLAIM_ERRORS = {
    unknown_badge: ["invalid-argument", "없는 배지예요."],
    disabled: ["failed-precondition", "지금은 배지를 받을 수 없어요. 모든 기능이 열려 있어요."],
    not_enough_days: ["failed-precondition", "아직 기록일이 모자라요."],
    not_enough_points: ["failed-precondition", "포인트가 모자라요."],
};

exports.claimFeatureBadge = onCall(
    { region: "asia-northeast3", maxInstances: 20, timeoutSeconds: 30 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const badgeId = String(request.data?.badgeId || "").trim();
        if (!getFeatureBadge(badgeId)) throw new HttpsError(...CLAIM_ERRORS.unknown_badge);

        const db = admin.firestore();
        const settingsSnap = await db.doc(FEATURE_UNLOCK_SETTINGS_PATH).get();
        const settings = normalizeFeatureUnlockSettings(settingsSnap.exists ? settingsSnap.data() : null);

        // 기록은 늘기만 하므로 트랜잭션 밖에서 세도 된다.
        const logsSnap = await db.collection("daily_logs")
            .where("userId", "==", uid)
            .orderBy("date", "desc")
            .limit(RECORD_LOOKBACK)
            .get();
        const recordedDays = countRecordedDays(logsSnap.docs.map((docSnap) => docSnap.data() || {}));

        const userRef = db.doc(`users/${uid}`);
        const ledgerRef = db.doc(`blockchain_transactions/${featureBadgeLedgerId(badgeId, uid)}`);

        const result = await db.runTransaction(async (tx) => {
            const [userSnap, ledgerSnap] = await Promise.all([tx.get(userRef), tx.get(ledgerRef)]);
            if (!userSnap.exists) throw new HttpsError("not-found", "회원 정보를 찾지 못했어요.");
            const userData = userSnap.data() || {};
            const owned = { ...(userData.featureBadges || {}) };
            // 원장에 이미 있으면 받은 것이다(회원 문서 쓰기만 어긋난 경우).
            if (ledgerSnap.exists && !owned[badgeId]) owned[badgeId] = { restored: true };

            const decision = decideBadgeClaim({
                enabled: settings.enabled,
                badgeId,
                owned,
                recordedDays,
                coins: userData.coins,
            });
            if (decision.reason === "already_owned") {
                return { badgeId, alreadyOwned: true, cost: 0, coins: Number(userData.coins) || 0 };
            }
            if (!decision.ok) {
                const [code, message] = CLAIM_ERRORS[decision.reason] || ["failed-precondition", "배지를 받을 수 없어요."];
                throw new HttpsError(code, message, { reason: decision.reason });
            }

            const cost = decision.badge.cost;
            const now = admin.firestore.FieldValue.serverTimestamp();
            const update = {
                featureBadges: {
                    [badgeId]: { claimedAt: now, cost, recordedDays },
                },
            };
            if (cost > 0) {
                update.coins = admin.firestore.FieldValue.increment(-cost);
                tx.set(ledgerRef, {
                    userId: uid,
                    uid,
                    type: "feature_badge",
                    badgeId,
                    pointsUsed: cost,
                    date: getMemberToday(userData),
                    timestamp: now,
                    status: "success",
                });
            }
            tx.set(userRef, update, { merge: true });
            return { badgeId, alreadyOwned: false, cost, coins: (Number(userData.coins) || 0) - cost };
        });

        console.log(`feature badge: ${uid} ${badgeId} cost=${result.cost} days=${recordedDays} already=${result.alreadyOwned}`);
        return { ...result, recordedDays };
    }
);

exports._test = {
    FEATURE_BADGES,
    countRecordedDays,
    decideBadgeClaim,
    featureBadgeLedgerId,
    normalizeFeatureUnlockSettings,
};
exports.FEATURE_UNLOCK_SETTINGS_PATH = FEATURE_UNLOCK_SETTINGS_PATH;
exports.normalizeFeatureUnlockSettings = normalizeFeatureUnlockSettings;
