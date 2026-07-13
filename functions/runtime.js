/**
 * HaBit (HBT) Cloud Functions v18
 *
 * 블록체인 민팅, 잔액 조회, 토큰 통계, AI 식단/운동 분석을 처리하는 서버리스 함수
 *
 * 엔드포인트:
 *   - mintHBT: 포인트를 HBT 온체인 민팅
 *   - getOnchainBalance: 사용자의 온체인 HBT 잔액 조회
 *   - getTokenStats: 전체 토큰 통계 조회
 *   - analyzeDiet: AI 식단/운동 사진 분석
 *   - analyzeSleepMind: AI 수면/마음 분석
 *   - awardPoints: daily_logs 변경 시 포인트 자동 정산 (Firestore 트리거)
 *   - awardMilestoneBonus: 마일스톤 보너스 지급 (Firestore 트리거)
 *
 * 보안:
 *   - Firebase Auth 인증 필수 (onCall)
 *   - Server Minter 키는 Secret Manager에서 가져옴
 *   - 포인트 잔액은 Firestore에서 서버가 검증
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { ethers } = require("ethers");
const ffmpegPath = require("ffmpeg-static");
const contractAbi = require("./contract-abi.json");
const { buildInviteLeaderboard } = require("./admin-invite-leaderboard");
const { buildReEngagementEmailTemplate } = require("./reengagement-email");
const {
    getKstIsoWeekId,
    isCompletedRateDecision,
} = require("./mining-rate-utils");
const {
    calculateServerAwardedPoints,
    computeReactionToggle,
    isEvidenceCreatedWithinRewardWindow,
    getRewardEvidenceClaimId,
    isAllowedUserMediaUrl,
    parseFirebaseStorageObjectPath,
} = require("./points-utils");
const {
    getGalleryProjectionFingerprint,
    syncGalleryPostFromDailyLog,
} = require("./gallery-posts");
const { updateGuestActivity } = require("./guest-activity");
const {
    normalizeReminderPreference,
    getKstHour,
    buildNotificationLedgerId,
    getReminderTarget,
} = require("./notification-utils");
const {
    CHALLENGE_BASE_BONUS_BPS,
    CHALLENGE_DAILY_MIN_POINTS,
    LEGACY_CHALLENGE_REQUIRED_CATEGORIES,
    getCurrentKstDateString,
    addDaysToKstDateString,
    isValidDateString,
    getLegacyChallengeBonusBps,
    buildLegacyChallengeQualificationPolicy,
    buildDefaultChallengeQualificationPolicy,
    normalizeChallengeQualificationPolicy,
    getAwardedPointsTotal,
    doesAwardedPointsMeetChallengeRule,
    formatChallengeQualificationLabel,
    getChallengeCompletedDays,
    normalizeChallengeCompletion,
    isChallengePastEnd,
    canSettleChallengeAsClaimable,
    getChallengeDateRange,
    reconcileChallengeCompletionWithDailyLogs,
} = require("./challenge-utils");
const {
    buildRewardMarketConfig,
    buildRewardMarketSnapshot,
    redeemRewardCoupon: redeemRewardCouponFlow,
    dismissRewardCoupon: dismissRewardCouponFlow,
    markRewardCouponUsed: markRewardCouponUsedFlow,
    deleteRewardCoupon: deleteRewardCouponFlow,
    cleanupExpiredRewardCoupons: cleanupExpiredRewardCouponsFlow,
    adminResendRewardCoupon: adminResendRewardCouponFlow,
    adminReconcileRewardCoupon: adminReconcileRewardCouponFlow,
    adminRefundRewardCoupon: adminRefundRewardCouponFlow,
    syncRewardMarketOps,
} = require("./reward-market");

// Firebase
admin.initializeApp();
const db = admin.firestore();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "";
const APP_BASE_URL = PROJECT_ID === "habitschool-staging"
    ? "https://habitschool-staging.web.app"
    : "https://habitschool.web.app";
const APP_ICON_URL = `${APP_BASE_URL}/icons/icon-192.svg`;
const ADMIN_EMAILS = ["csj3814@gmail.com"];
const PUSH_TOKEN_SUBCOLLECTION = "pushTokens";

// 비밀 키 (Firebase Secret Manager)
const SERVER_MINTER_KEY = defineSecret("SERVER_MINTER_KEY");
const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
const GMAIL_USER = defineSecret("GMAIL_USER");
const GMAIL_APP_PASSWORD = defineSecret("GMAIL_APP_PASSWORD");

// 컨트랙트 주소 (BSC Chapel 테스트넷) — v4 (RATE_UPDATER_ROLE 추가)
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const BSC_CHAIN_CONFIG = {
    testnet: {
        key: "testnet",
        label: "BSC Testnet",
        networkTag: "bscTestnet",
        chainId: 97,
        rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545/",
        explorerUrl: "https://testnet.bscscan.com",
        gasToken: "tBNB",
        habitAddress: process.env.HABIT_TESTNET_ADDRESS || "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B",
        stakingAddress: process.env.STAKING_TESTNET_ADDRESS || "0x7e8c29699F382B553891f853299e615257491F9D",
    },
    mainnet: {
        key: "mainnet",
        label: "BSC Mainnet",
        networkTag: "bsc",
        chainId: 56,
        rpcUrl: "https://bsc-dataseed.binance.org/",
        explorerUrl: "https://bscscan.com",
        gasToken: "BNB",
        habitAddress: process.env.HABIT_MAINNET_ADDRESS || ZERO_ADDRESS,
        stakingAddress: process.env.STAKING_MAINNET_ADDRESS || ZERO_ADDRESS,
    }
};
const DEFAULT_CHAIN_KEY = "testnet";
const ACTIVE_CHAIN_KEY = process.env.ONCHAIN_NETWORK === "mainnet" ? "mainnet" : DEFAULT_CHAIN_KEY;
const ACTIVE_CHAIN = BSC_CHAIN_CONFIG[ACTIVE_CHAIN_KEY];
const HABIT_ADDRESS = ACTIVE_CHAIN.habitAddress;
const STAKING_ADDRESS = ACTIVE_CHAIN.stakingAddress;
const RPC_URL = ACTIVE_CHAIN.rpcUrl;
const CHAIN_ID = ACTIVE_CHAIN.chainId;
const HISTORY_RPC_URLS = ACTIVE_CHAIN_KEY === "mainnet"
    ? [
        "https://bsc-rpc.publicnode.com",
        "https://1rpc.io/bnb",
        RPC_URL
    ]
    : [RPC_URL];
const EXPLORER_URL = ACTIVE_CHAIN.explorerUrl;
const GAS_TOKEN_SYMBOL = ACTIVE_CHAIN.gasToken;
const MAINNET_CHALLENGE_CUTOVER_DATE = "2026-04-12";
const HBT_DECIMALS = 8;
const HBT_TRANSFER_INTERFACE = new ethers.Interface([
    "event Transfer(address indexed from, address indexed to, uint256 value)"
]);
const HABIT_CONTRACT_INTERFACE = new ethers.Interface(contractAbi.HaBit || []);
const HBT_TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");
const DEFAULT_HBT_TRANSFER_HISTORY_LIMIT = 50;
const MAX_HBT_TRANSFER_HISTORY_LIMIT = 100;
const HBT_TRANSFER_SCAN_CHUNK = ACTIVE_CHAIN_KEY === "mainnet" ? 50000 : 200000;
const HBT_TRANSFER_MIN_SCAN_CHUNK = ACTIVE_CHAIN_KEY === "mainnet" ? 5000 : 50000;
const HBT_TRANSFER_MAX_CHUNKS = ACTIVE_CHAIN_KEY === "mainnet" ? 20 : 20;

// 일일 변환 한도
const MAX_DAILY_HBT = 12000;
const MIN_POINTS = 100;
const RECENT_MINT_TX_LOOKBACK_LIMIT = 100;
const CHATBOT_LINK_CODE_LENGTH = 8;
const CHATBOT_LINK_CODE_TTL_MINUTES = 10;
const FRIEND_REQUEST_TTL_DAYS = 3;
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_CODE_MAX_ATTEMPTS = 24;
const REFERRAL_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeReferralCode(rawCode) {
    const normalized = String(rawCode || "").trim().toUpperCase();
    const pattern = new RegExp(`^[A-Z0-9]{${REFERRAL_CODE_LENGTH}}$`);
    return pattern.test(normalized) ? normalized : "";
}

function getMintResetWindowInfo(now = new Date()) {
    const cycleStart = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0, 0, 0, 0
    ));
    return {
        cycleStart,
        cycleEnd: new Date(cycleStart.getTime() + 24 * 60 * 60 * 1000),
        resetCopy: "매일 오전 9시 reset"
    };
}

function normalizeFirestoreTimestampLike(value) {
    if (value?.toDate instanceof Function) {
        const date = value.toDate();
        return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value;
    }
    return null;
}

function sumSuccessfulConversionHbtInWindow(entries = [], {
    networkTag = "",
    cycleStart,
    cycleEnd
} = {}) {
    if (!(cycleStart instanceof Date) || !(cycleEnd instanceof Date)) {
        return 0;
    }
    return entries.reduce((total, entry) => {
        const data = typeof entry?.data === "function" ? entry.data() : (entry || {});
        if (!data || data.type !== "conversion" || data.status !== "success") {
            return total;
        }
        if (networkTag && String(data.network || "").trim() !== networkTag) {
            return total;
        }
        const timestamp = normalizeFirestoreTimestampLike(data.timestamp);
        if (!timestamp || timestamp < cycleStart || timestamp >= cycleEnd) {
            return total;
        }
        return total + Number(data.hbtReceived || 0);
    }, 0);
}

function buildMintDailyLimitMessage(usedHbt = 0, limitHbt = MAX_DAILY_HBT) {
    const safeUsed = Math.max(0, Number(usedHbt || 0));
    const safeLimit = Math.max(0, Number(limitHbt || 0));
    return `일일 변환 한도 초과. 현재 ${safeUsed.toLocaleString("ko-KR")} / ${safeLimit.toLocaleString("ko-KR")} HBT 사용 중이며 매일 오전 9시 reset 후 다시 시도해주세요.`;
}

function generateReferralCodeCandidate() {
    let code = "";
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
        code += REFERRAL_CODE_CHARS[Math.floor(Math.random() * REFERRAL_CODE_CHARS.length)];
    }
    return code;
}

async function ensureStableReferralCode(userRef) {
    return db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        }

        const existingCode = normalizeReferralCode(userSnap.data()?.referralCode);
        if (existingCode) {
            const codeRef = db.doc(`referral_codes/${existingCode}`);
            const codeSnap = await tx.get(codeRef);
            const mappedUid = String(codeSnap.data()?.uid || "").trim();
            if (!codeSnap.exists || !mappedUid || mappedUid === userRef.id) {
                tx.set(codeRef, {
                    uid: userRef.id,
                    createdAt: codeSnap.data()?.createdAt || FieldValue.serverTimestamp(),
                    updatedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }
            return existingCode;
        }

        for (let attempt = 0; attempt < REFERRAL_CODE_MAX_ATTEMPTS; attempt += 1) {
            const candidate = generateReferralCodeCandidate();
            const codeRef = db.doc(`referral_codes/${candidate}`);
            const codeSnap = await tx.get(codeRef);
            if (codeSnap.exists) continue;
            const duplicateUserQuery = db.collection("users")
                .where("referralCode", "==", candidate)
                .limit(1);
            const duplicateUserSnap = await tx.get(duplicateUserQuery);
            if (!duplicateUserSnap.empty) continue;

            tx.set(codeRef, {
                uid: userRef.id,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp()
            });
            tx.set(userRef, { referralCode: candidate }, { merge: true });
            return candidate;
        }

        throw new HttpsError("resource-exhausted", "초대 코드를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    });
}

function isConfiguredAddress(address) {
    return !!address && String(address).trim() !== "" && String(address).toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

function assertOnchainRuntimeConfigured() {
    if (!isConfiguredAddress(HABIT_ADDRESS)) {
        throw new Error(`[onchain-config] HABIT address is not configured for ${ACTIVE_CHAIN_KEY}.`);
    }
    if (ACTIVE_CHAIN_KEY === "mainnet" && !isConfiguredAddress(STAKING_ADDRESS)) {
        throw new Error("[onchain-config] STAKING address is required for mainnet runtime.");
    }
}

assertOnchainRuntimeConfigured();

function getChallengeChainKey(challenge = null) {
    const explicitChainKey = String(challenge?.chainKey || "").trim().toLowerCase();
    if (explicitChainKey === "mainnet" || explicitChainKey === "testnet") {
        return explicitChainKey;
    }

    const networkTag = String(challenge?.network || challenge?.networkTag || "").trim();
    if (networkTag === "bsc") return "mainnet";
    if (networkTag === "bscTestnet") return "testnet";
    return "";
}

function shouldDropChallengeForActiveChain(challenge = null) {
    if (!challenge || typeof challenge !== "object") return false;

    const status = String(challenge.status || "").trim();
    if (!["ongoing", "claimable", "expired"].includes(status)) {
        return false;
    }

    const challengeChainKey = getChallengeChainKey(challenge);
    if (challengeChainKey && challengeChainKey !== ACTIVE_CHAIN_KEY) {
        return true;
    }

    if (ACTIVE_CHAIN_KEY !== "mainnet" || challengeChainKey === "mainnet") {
        return false;
    }

    const startDate = String(challenge.startDate || "").trim();
    return !!startDate && startDate < MAINNET_CHALLENGE_CUTOVER_DATE;
}

async function sanitizeUserChallengesForActiveChain(userRef, userData = {}) {
    const activeChallenges = userData.activeChallenges && typeof userData.activeChallenges === "object"
        ? { ...userData.activeChallenges }
        : {};
    const cleanupUpdate = {};

    Object.entries(activeChallenges).forEach(([tier, challenge]) => {
        if (shouldDropChallengeForActiveChain(challenge)) {
            delete activeChallenges[tier];
            cleanupUpdate[`activeChallenges.${tier}`] = FieldValue.delete();
        }
    });

    let legacyActiveChallenge = userData.activeChallenge || null;
    if (shouldDropChallengeForActiveChain(legacyActiveChallenge)) {
        legacyActiveChallenge = null;
        cleanupUpdate.activeChallenge = FieldValue.delete();
    }

    if (Object.keys(cleanupUpdate).length > 0) {
        await userRef.update(cleanupUpdate);
    }

    const sanitizedUserData = {
        ...userData,
        activeChallenges
    };
    if (legacyActiveChallenge) {
        sanitizedUserData.activeChallenge = legacyActiveChallenge;
    } else {
        delete sanitizedUserData.activeChallenge;
    }
    return sanitizedUserData;
}

function normalizeAddress(address) {
    return String(address || "").trim().toLowerCase();
}

function toChecksumAddressOrEmpty(address) {
    try {
        return ethers.getAddress(String(address || "").trim());
    } catch (_) {
        return "";
    }
}

function isBootstrapAdminEmail(email) {
    return ADMIN_EMAILS.includes(normalizeEmail(email));
}

async function upsertAdminDoc(uid, email, extra = {}) {
    const normalizedEmail = normalizeEmail(email);
    await db.doc(`admins/${uid}`).set({
        uid,
        email: normalizedEmail,
        updatedAt: new Date(),
        ...extra
    }, { merge: true });
}

async function assertAdminRequest(request) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
    const adminSnap = await db.collection("admins").doc(uid).get();
    if (!adminSnap.exists) {
        throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
    }
    return uid;
}

function buildFriendshipId(uidA, uidB) {
    return [uidA, uidB].sort().join("__");
}

function buildFriendshipUsers(uidA, uidB) {
    return [uidA, uidB].sort();
}

function getUserLabel(userData, fallback = "회원") {
    return userData?.customDisplayName || userData?.displayName || fallback;
}

function getEffectiveWalletAddress(userData) {
    return String(userData?.externalWalletAddress || userData?.walletAddress || '').trim() || null;
}

function toDateFromValue(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === "function") return value.toDate();
    if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

function getUniqueReactionUserIds(logData = {}) {
    const uniqueUserIds = new Set();
    const reactions = logData?.reactions || {};
    ["heart", "fire", "clap"].forEach((type) => {
        const userIds = Array.isArray(reactions[type]) ? reactions[type] : [];
        userIds.forEach((uid) => {
            if (uid) uniqueUserIds.add(uid);
        });
    });
    return [...uniqueUserIds];
}

function getUniqueCommentUserIds(logData = {}) {
    const uniqueUserIds = new Set();
    const comments = Array.isArray(logData?.comments) ? logData.comments : [];
    comments.forEach((comment) => {
        if (comment?.userId) uniqueUserIds.add(comment.userId);
    });
    return [...uniqueUserIds];
}

function isPendingFriendshipExpired(friendshipData) {
    if (!friendshipData || friendshipData.status !== "pending") return false;
    const expiresAt = toDateFromValue(friendshipData.expiresAt);
    return !!expiresAt && expiresAt.getTime() < Date.now();
}

function getOtherFriendUid(friendshipData, uid) {
    const users = Array.isArray(friendshipData?.users) ? friendshipData.users : [];
    return users.find(candidateUid => candidateUid !== uid) || null;
}

function applyFriendCacheUpdate(tx, uidA, uidB, isActive) {
    const updateValue = isActive ? FieldValue.arrayUnion : FieldValue.arrayRemove;
    tx.set(db.doc(`users/${uidA}`), { friends: updateValue(uidB) }, { merge: true });
    tx.set(db.doc(`users/${uidB}`), { friends: updateValue(uidA) }, { merge: true });
}

function upsertActiveFriendship(tx, {
    uidA,
    uidB,
    nameA,
    nameB,
    source,
    requesterUid = uidA,
    requestedAt = FieldValue.serverTimestamp(),
    inviterUid = "",
    inviteeUid = "",
}) {
    const friendshipId = buildFriendshipId(uidA, uidB);
    const friendshipRef = db.doc(`friendships/${friendshipId}`);
    const now = FieldValue.serverTimestamp();
    const requesterName = requesterUid === uidA ? nameA : nameB;

    const payload = {
        users: buildFriendshipUsers(uidA, uidB),
        userNames: {
            [uidA]: nameA,
            [uidB]: nameB,
        },
        status: "active",
        requesterUid,
        requesterName,
        pendingForUid: null,
        requestedAt,
        acceptedAt: now,
        respondedAt: now,
        updatedAt: now,
        expiresAt: null,
        source,
    };
    if (inviterUid) payload.inviterUid = inviterUid;
    if (inviteeUid) payload.inviteeUid = inviteeUid;

    tx.set(friendshipRef, payload, { merge: true });

    applyFriendCacheUpdate(tx, uidA, uidB, true);
    return { friendshipId, friendshipRef };
}

function createFriendConnectedNotifications(tx, {
    uidA,
    uidB,
    nameA,
    nameB,
    friendshipId,
}) {
    const now = FieldValue.serverTimestamp();
    tx.set(db.collection("notifications").doc(), {
        postOwnerId: uidA,
        type: "friend_connected",
        fromUserId: uidB,
        fromUserName: nameB,
        friendshipId,
        createdAt: now,
    });
    tx.set(db.collection("notifications").doc(), {
        postOwnerId: uidB,
        type: "friend_connected",
        fromUserId: uidA,
        fromUserName: nameA,
        friendshipId,
        createdAt: now,
    });
}

function extractStoragePathFromUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
        const parsed = new URL(String(rawUrl));
        const markerIndex = parsed.pathname.indexOf("/o/");
        if (markerIndex === -1) return "";
        return decodeURIComponent(parsed.pathname.slice(markerIndex + 3) || "");
    } catch (_) {
        return "";
    }
}

async function sendPushToUsers(userIds, payload) {
    const targetIds = [...new Set((userIds || []).filter(Boolean))];
    if (targetIds.length === 0) return 0;

    const targets = await collectPushTargetsForUsers(targetIds);
    if (targets.length === 0) return 0;
    await sendMulticast(targets, payload);
    return targets.length;
}

function addPushTarget(targetMap, {
    token,
    uid,
    locale = "ko",
    tokenDocRef = null,
    legacyUserRef = null
}) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken || !uid) return;

    const existing = targetMap.get(normalizedToken) || {
        token: normalizedToken,
        uid,
        locale: normalizeLocale(locale),
        userIds: new Set(),
        tokenDocRefs: [],
        legacyUserRefs: []
    };

    existing.locale = normalizeLocale(locale || existing.locale);
    existing.userIds.add(uid);
    if (tokenDocRef) existing.tokenDocRefs.push(tokenDocRef);
    if (legacyUserRef) existing.legacyUserRefs.push(legacyUserRef);
    targetMap.set(normalizedToken, existing);
}

function finalizePushTargets(targetMap) {
    return Array.from(targetMap.values()).map((target) => ({
        token: target.token,
        uid: target.uid,
        userIds: Array.from(target.userIds),
        tokenDocRefs: target.tokenDocRefs,
        legacyUserRefs: target.legacyUserRefs
    }));
}

async function collectLegacyPushTargets(targetMap, userIds = null) {
    let usersSnap;
    if (Array.isArray(userIds) && userIds.length > 0) {
        const userDocs = await Promise.all(userIds.map(uid => db.doc(`users/${uid}`).get()));
        usersSnap = { docs: userDocs.filter((snap) => snap.exists) };
    } else {
        usersSnap = await db.collection("users")
            .where("fcmToken", "!=", "")
            .select("fcmToken", "locale")
            .get();
    }

    usersSnap.docs.forEach((snap) => {
        const token = String(snap.data()?.fcmToken || "").trim();
        if (!token) return;
        addPushTarget(targetMap, {
            token,
            uid: snap.id,
            locale: snap.data()?.locale,
            legacyUserRef: snap.ref
        });
    });
}

async function collectPushTargetsForUsers(userIds) {
    const targetMap = new Map();
    const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
    if (uniqueUserIds.length === 0) return [];

    const userLocaleById = new Map();
    try {
        const userRefs = uniqueUserIds.map((uid) => db.doc(`users/${uid}`));
        const userSnaps = userRefs.length ? await db.getAll(...userRefs) : [];
        userSnaps.forEach((snap) => {
            if (snap.exists) userLocaleById.set(snap.id, snap.data()?.locale);
        });
    } catch (_) {}

    await Promise.all(uniqueUserIds.map(async (uid) => {
        const tokenSnap = await db.collection(`users/${uid}/${PUSH_TOKEN_SUBCOLLECTION}`)
            .select("token", "enabled")
            .get()
            .catch(() => null);

        tokenSnap?.docs?.forEach((docSnap) => {
            const data = docSnap.data() || {};
            if (data.enabled === false) return;
            addPushTarget(targetMap, {
                token: data.token,
                uid,
                locale: userLocaleById.get(uid),
                tokenDocRef: docSnap.ref
            });
        });
    }));

    await collectLegacyPushTargets(targetMap, uniqueUserIds);
    return finalizePushTargets(targetMap);
}

async function collectAllPushTargets() {
    const targetMap = new Map();

    const tokenSnap = await db.collectionGroup(PUSH_TOKEN_SUBCOLLECTION)
        .where("enabled", "==", true)
        .select("token")
        .get()
        .catch(() => null);

    tokenSnap?.docs?.forEach((docSnap) => {
        const uid = docSnap.ref.parent?.parent?.id;
        if (!uid) return;
        addPushTarget(targetMap, {
            token: docSnap.data()?.token,
            uid,
            tokenDocRef: docSnap.ref
        });
    });

    await collectLegacyPushTargets(targetMap);
    return finalizePushTargets(targetMap);
}

function buildAppPath(tab = "dashboard", extras = {}) {
    const params = new URLSearchParams();
    if (tab) params.set("tab", tab);
    Object.entries(extras || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
    });
    const query = params.toString();
    return query ? `/?${query}` : "/";
}

function buildNotificationActions(actions = []) {
    return (actions || [])
        .filter(action => action?.action && action?.title)
        .slice(0, 2)
        .map(action => ({
            action: String(action.action),
            title: String(action.title),
            url: action.url ? String(action.url) : ""
        }));
}

async function hydratePushTargetLocales(targets = []) {
    const normalizedTargets = Array.isArray(targets) ? targets : [];
    const missingLocaleUserIds = [...new Set(normalizedTargets
        .filter((target) => target?.uid && !target.locale)
        .map((target) => target.uid))];
    if (missingLocaleUserIds.length === 0) {
        return normalizedTargets.map((target) => ({
            ...target,
            locale: normalizeLocale(target?.locale)
        }));
    }

    const localeByUid = new Map();
    try {
        const snaps = await db.getAll(...missingLocaleUserIds.map((uid) => db.doc(`users/${uid}`)));
        snaps.forEach((snap) => {
            if (snap.exists) localeByUid.set(snap.id, snap.data()?.locale);
        });
    } catch (_) {}

    return normalizedTargets.map((target) => ({
        ...target,
        locale: normalizeLocale(target?.locale || localeByUid.get(target?.uid))
    }));
}

function groupPushTargetsByLocale(targets = []) {
    return targets.reduce((acc, target) => {
        const locale = normalizeLocale(target?.locale);
        if (!acc[locale]) acc[locale] = [];
        acc[locale].push(target);
        return acc;
    }, { ko: [], en: [] });
}

function buildLocalizedAppPath(locale = "ko", tab = "dashboard", extras = {}) {
    if (normalizeLocale(locale) !== "en") return buildAppPath(tab, extras);

    const params = new URLSearchParams();
    Object.entries(extras || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        params.set(key, String(value));
    });
    const query = params.toString();
    const normalizedTab = ["diet", "exercise", "sleep", "profile"].includes(tab) ? tab : "diet";
    const hash = normalizedTab && normalizedTab !== "diet" ? `#${normalizedTab}` : "";
    return `/en${query ? `?${query}` : ""}${hash}`;
}

async function sendLocalizedMulticast(targets = [], payloadBuilder) {
    const localizedTargets = await hydratePushTargetLocales(targets);
    const grouped = groupPushTargetsByLocale(localizedTargets);
    await Promise.all(Object.entries(grouped).map(async ([locale, localeTargets]) => {
        if (!localeTargets.length) return;
        await sendMulticast(localeTargets, payloadBuilder(locale));
    }));
}

function buildFriendRequestPushPayload({ requesterName, friendshipId }) {
    const url = buildAppPath("profile", { panel: "friends", friendshipId });
    return {
        title: "친구 요청이 도착했어요",
        body: `${requesterName || "친구"}님이 친구 요청을 보냈어요.`,
        tag: "friend-request",
        url,
        requireInteraction: true,
        actions: buildNotificationActions([
            { action: "open-friends", title: "요청 확인", url },
            { action: "dismiss", title: "나중에" }
        ])
    };
}

function buildFriendConnectedPushPayload({ friendName, friendshipId = "" }) {
    const url = buildAppPath("profile", { panel: "friends", friendshipId });
    return {
        title: "친구 연결이 완료됐어요",
        body: `${friendName || "친구"}님과 이제 함께 기록할 수 있어요.`,
        tag: "friend-connected",
        url,
        actions: buildNotificationActions([
            { action: "open-friends", title: "친구 보기", url }
        ])
    };
}

function buildFriendDeclinedPushPayload({ friendName, friendshipId = "" }) {
    const url = buildAppPath("profile", { panel: "friends", friendshipId });
    return {
        title: "친구 요청이 보류됐어요",
        body: `${friendName || "상대"}님이 이번 친구 요청은 보류했어요.`,
        tag: "friend-declined",
        url,
        actions: buildNotificationActions([
            { action: "open-friends", title: "다시 확인", url }
        ])
    };
}

function buildChallengeInvitePushPayload({ challengeId, creatorName, type, durationDays, stakePoints }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    return {
        title: isCompetition ? "1:1 경쟁 초대가 왔어요" : "단체 목표 초대가 왔어요",
        body: isCompetition
            ? `${creatorName || "친구"}님이 ${durationDays}일 경쟁에 ${stakePoints || 0}P 스테이크로 초대했어요.`
            : `${creatorName || "친구"}님이 ${durationDays}일 단체 목표에 초대했어요.`,
        tag: isCompetition ? "challenge-invite-competition" : "challenge-invite-group",
        url,
        requireInteraction: true,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "초대 확인", url },
            { action: "dismiss", title: "나중에" }
        ])
    };
}

function buildChallengeStartedPushPayload({ challengeId, type, durationDays }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    return {
        title: isCompetition ? "1:1 경쟁이 시작됐어요" : "단체 목표가 시작됐어요",
        body: `${durationDays}일 동안 같이 달려볼까요?`,
        tag: isCompetition ? "challenge-started-competition" : "challenge-started-group",
        url,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "챌린지 보기", url }
        ])
    };
}

function buildChallengePendingUpdatePushPayload({ challengeId, accepterName, type }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    return {
        title: isCompetition ? "경쟁 응답이 도착했어요" : "단체 목표 응답이 도착했어요",
        body: `${accepterName || "친구"}님이 수락했어요. 나머지 응답을 기다리는 중이에요.`,
        tag: isCompetition ? "challenge-pending-competition" : "challenge-pending-group",
        url,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "상태 확인", url }
        ])
    };
}

function buildChallengeDeclinedPushPayload({ challengeId, responderName, type }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    return {
        title: isCompetition ? "경쟁 초대가 거절됐어요" : "단체 목표 초대가 거절됐어요",
        body: `${responderName || "친구"}님이 이번 초대는 보류했어요.`,
        tag: isCompetition ? "challenge-declined-competition" : "challenge-declined-group",
        url,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "다시 확인", url }
        ])
    };
}

function buildChallengeCancelledPushPayload({ challengeId, creatorName, type }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    return {
        title: isCompetition ? "경쟁 초대가 취소됐어요" : "단체 목표 초대가 취소됐어요",
        body: `${creatorName || "친구"}님이 대기 중이던 챌린지를 취소했어요.`,
        tag: isCompetition ? "challenge-cancelled-competition" : "challenge-cancelled-group",
        url,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "챌린지 보기", url }
        ])
    };
}

function buildChallengeSettledPushPayload({ challengeId, type, outcome, bonusPoints }) {
    const isCompetition = type === "competition";
    const url = buildAppPath("dashboard", { panel: "challenge", challengeId });
    const outcomeTextMap = {
        success: "단체 목표를 달성했어요",
        win: "경쟁에서 승리했어요",
        loss: "이번 경쟁은 아쉬웠어요",
        draw: "이번 경쟁은 무승부예요",
        void: "활동 부족으로 챌린지가 무효 처리됐어요",
        missed: "이번 목표는 달성하지 못했어요"
    };
    return {
        title: isCompetition ? "챌린지 결과가 나왔어요" : "단체 목표 결과가 나왔어요",
        body: `${outcomeTextMap[outcome] || "결과를 확인해 보세요"}${bonusPoints > 0 ? ` · 보너스 ${bonusPoints}P` : ""}`,
        tag: isCompetition ? "challenge-settled-competition" : "challenge-settled-group",
        url,
        actions: buildNotificationActions([
            { action: "open-challenge", title: "결과 보기", url }
        ])
    };
}

function inferImageContentType(storagePath = "") {
    const lowerPath = String(storagePath || "").toLowerCase();
    if (lowerPath.endsWith(".png")) return "image/png";
    if (lowerPath.endsWith(".webp")) return "image/webp";
    if (lowerPath.endsWith(".gif")) return "image/gif";
    if (lowerPath.endsWith(".svg")) return "image/svg+xml";
    return "image/jpeg";
}

function normalizeShareMediaRequestItem(rawItem = {}, index = 0) {
    const candidateUrls = Array.isArray(rawItem?.candidateUrls)
        ? rawItem.candidateUrls.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 6)
        : [];
    return {
        category: String(rawItem?.category || `기록 ${index + 1}`).trim() || `기록 ${index + 1}`,
        type: String(rawItem?.type || "image").trim() || "image",
        candidateUrls,
    };
}

async function removeTempDir(tempDir = "") {
    if (!tempDir) return;
    try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (_) {}
}

async function runFfmpeg(args = []) {
    if (!ffmpegPath) {
        throw new Error("ffmpeg binary is unavailable");
    }

    await new Promise((resolve, reject) => {
        const child = spawn(ffmpegPath, args, {
            stdio: ["ignore", "ignore", "pipe"],
        });
        let stderr = "";

        child.stderr.on("data", (chunk) => {
            stderr += String(chunk || "");
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
        });
    });
}

async function generateShareVideoThumbDataUrl(storagePath = "") {
    const normalizedPath = String(storagePath || "").trim();
    if (!normalizedPath || !ffmpegPath) return "";

    const bucket = admin.storage().bucket();
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "share-video-thumb-"));
    const inputPath = path.join(tempDir, "input-video");
    const outputPath = path.join(tempDir, "thumb.jpg");

    try {
        await bucket.file(normalizedPath).download({ destination: inputPath });
        const captureOffsets = ["0.8", "1.8", "0.1"];

        for (const offset of captureOffsets) {
            try {
                await runFfmpeg([
                    "-y",
                    "-ss",
                    offset,
                    "-i",
                    inputPath,
                    "-frames:v",
                    "1",
                    "-vf",
                    "scale=300:300:force_original_aspect_ratio=increase,crop=300:300",
                    "-q:v",
                    "2",
                    outputPath,
                ]);
                const buffer = await fs.promises.readFile(outputPath);
                if (buffer?.length) {
                    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
                }
            } catch (_) {}
        }
    } catch (error) {
        console.warn("[prepareShareMediaAssets] video thumb generation failed:", normalizedPath, error?.message || error);
    } finally {
        await removeTempDir(tempDir);
    }

    return "";
}

async function loadShareMediaDataUrl(candidateUrls = []) {
    const bucket = admin.storage().bucket();
    let videoStoragePath = "";

    for (const rawUrl of candidateUrls) {
        const storagePath = extractStoragePathFromUrl(rawUrl);
        if (!storagePath) continue;
        if (/\.(mp4|mov|webm|m4v)$/i.test(storagePath)) {
            if (!videoStoragePath) videoStoragePath = storagePath;
            continue;
        }

        try {
            const file = bucket.file(storagePath);
            const [metadata] = await file.getMetadata();
            const contentType = String(metadata?.contentType || inferImageContentType(storagePath));
            if (!contentType.startsWith("image/")) continue;

            const byteSize = Number(metadata?.size || 0);
            if (byteSize > 6 * 1024 * 1024) {
                console.warn("[prepareShareMediaAssets] skip oversized media:", storagePath, byteSize);
                continue;
            }

            const [buffer] = await file.download();
            if (!buffer || !buffer.length) continue;
            return `data:${contentType};base64,${buffer.toString("base64")}`;
        } catch (error) {
            console.warn("[prepareShareMediaAssets] media load failed:", storagePath, error?.message || error);
        }
    }

    if (videoStoragePath) {
        const generatedVideoThumb = await generateShareVideoThumbDataUrl(videoStoragePath);
        if (generatedVideoThumb) return generatedVideoThumb;
    }

    return "";
}

async function getActiveFriendIds(userId) {
    const snap = await db.collection("friendships")
        .where("users", "array-contains", userId)
        .get();

    return snap.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .filter(friendship => friendship.status === "active" && !isPendingFriendshipExpired(friendship))
        .map(friendship => getOtherFriendUid(friendship, userId))
        .filter(Boolean);
}

exports.getFriendActivityReadiness = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const today = getCurrentKstDateString();
        const earliest = addDaysToKstDateString(today, -30);
        const requestedDates = [...new Set((Array.isArray(request.data?.dateStrs) ? request.data.dateStrs : [])
            .map((value) => String(value || "").trim())
            .filter((value) => isValidDateString(value) && value >= earliest && value <= today))]
            .slice(0, 14);
        if (requestedDates.length === 0) return { items: [] };

        const authorizedFriendIds = new Set(await getActiveFriendIds(uid));
        const requestedFriendIds = [...new Set((Array.isArray(request.data?.friendIds) ? request.data.friendIds : [])
            .map((value) => String(value || "").trim())
            .filter((friendId) => friendId && authorizedFriendIds.has(friendId)))]
            .slice(0, 20);
        if (requestedFriendIds.length === 0) return { items: [] };

        const refs = [];
        const metadata = [];
        requestedFriendIds.forEach((friendId) => {
            requestedDates.forEach((date) => {
                refs.push(db.doc(`daily_logs/${friendId}_${date}`));
                metadata.push({ friendId, date });
            });
        });
        const profileRefs = requestedFriendIds.map((friendId) => db.doc(`users/${friendId}`));
        const [snapshots, profileSnapshots] = await Promise.all([
            refs.length > 0 ? db.getAll(...refs) : [],
            profileRefs.length > 0 ? db.getAll(...profileRefs) : [],
        ]);
        const logsByFriend = new Map(requestedFriendIds.map((friendId) => [friendId, []]));
        const profilesByFriend = new Map();
        snapshots.forEach((snapshot, index) => {
            if (!snapshot.exists) return;
            const awarded = normalizeAwardMap(snapshot.data()?.awardedPoints || {});
            logsByFriend.get(metadata[index].friendId)?.push({
                date: metadata[index].date,
                awardedPoints: awarded,
            });
        });
        profileSnapshots.forEach((snapshot, index) => {
            const friendId = requestedFriendIds[index];
            const profile = snapshot.exists ? (snapshot.data() || {}) : {};
            const displayName = String(profile.customDisplayName || profile.displayName || "")
                .trim()
                .slice(0, 40);
            profilesByFriend.set(friendId, {
                displayName,
                currentStreak: Math.max(0, Math.min(3650, Number(profile.currentStreak || 0) || 0)),
            });
        });

        return {
            items: requestedFriendIds.map((friendId) => ({
                friendId,
                ...(profilesByFriend.get(friendId) || { displayName: "", currentStreak: 0 }),
                logs: logsByFriend.get(friendId) || [],
            })),
        };
    }
);

function generateAlphaNumericCode(length) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = crypto.randomBytes(length);
    let code = "";
    for (let i = 0; i < length; i += 1) {
        code += alphabet[bytes[i] % alphabet.length];
    }
    return code;
}

/**
 * ethers Provider & Wallet 인스턴스 생성
 */
function getProviderAndWallet(privateKey) {
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const wallet = new ethers.Wallet(privateKey.trim(), provider);
    return { provider, wallet };
}

/**
 * HaBit 컨트랙트 인스턴스 생성
 */
function getHabitContract(signerOrProvider) {
    if (!contractAbi.HaBit) {
        throw new Error("[onchain-config] HaBit ABI is missing.");
    }
    return new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signerOrProvider);
}

async function verifyRewardBurnTx({ burnTxHash = "", userData = {}, expectedHbtCost = 0, sku = "" }) {
    const normalizedHash = String(burnTxHash || "").trim();
    if (!normalizedHash) {
        throw new HttpsError("failed-precondition", "소각 트랜잭션 해시가 필요합니다.");
    }

    const walletAddress = getEffectiveWalletAddress(userData);
    if (!walletAddress) {
        throw new HttpsError("failed-precondition", "연결된 지갑 주소를 먼저 확인해 주세요.");
    }

    const normalizedWallet = ethers.getAddress(walletAddress);
    const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
    const receipt = await provider.getTransactionReceipt(normalizedHash);
    if (!receipt || receipt.status !== 1) {
        throw new HttpsError("failed-precondition", "소각 트랜잭션을 확인하지 못했어요.");
    }

    const tx = await provider.getTransaction(normalizedHash);
    if (!tx || !tx.from) {
        throw new HttpsError("failed-precondition", "소각 트랜잭션 발신자를 확인하지 못했어요.");
    }

    if (ethers.getAddress(tx.from) !== normalizedWallet) {
        throw new HttpsError("permission-denied", "현재 사용자 지갑과 일치하지 않는 소각 트랜잭션입니다.");
    }

    const receiptTo = receipt.to ? ethers.getAddress(receipt.to) : "";
    const habitAddress = ethers.getAddress(HABIT_ADDRESS);
    if (receiptTo && receiptTo !== habitAddress) {
        throw new HttpsError("failed-precondition", "HBT 컨트랙트에서 발생한 소각 트랜잭션이 아니에요.");
    }

    const habitContract = getHabitContract(provider);
    const decimals = await habitContract.decimals();
    const expectedRawAmount = ethers.parseUnits(String(expectedHbtCost || 0), decimals);
    let burnedRawAmount = 0n;

    for (const log of receipt.logs || []) {
        if (!log?.topics?.length) continue;
        if (!log.address || ethers.getAddress(log.address) !== habitAddress) continue;

        let parsed = null;
        try {
            parsed = habitContract.interface.parseLog({
                topics: log.topics,
                data: log.data,
            });
        } catch (_) {
            parsed = null;
        }
        if (!parsed || parsed.name !== "Transfer") continue;

        const fromAddress = parsed.args?.from ? ethers.getAddress(parsed.args.from) : "";
        const toAddress = parsed.args?.to ? ethers.getAddress(parsed.args.to) : "";
        if (fromAddress !== normalizedWallet || toAddress !== ZERO_ADDRESS) continue;

        const value = BigInt(parsed.args?.value || 0n);
        burnedRawAmount += value;
    }

    if (burnedRawAmount < expectedRawAmount) {
        throw new HttpsError(
            "failed-precondition",
            `${sku || "reward"} 교환에 필요한 HBT 소각량이 확인되지 않았어요.`
        );
    }

    return {
        walletAddress: normalizedWallet,
        burnedRawAmount: burnedRawAmount.toString(),
        expectedRawAmount: expectedRawAmount.toString(),
    };
}

function normalizeMintAttemptId(rawAttemptId) {
    const normalized = String(rawAttemptId || "").trim();
    return /^[A-Za-z0-9_-]{8,120}$/.test(normalized) ? normalized : "";
}

function extractContractErrorData(error) {
    const candidates = [
        error?.data,
        error?.error?.data,
        error?.info?.error?.data,
        error?.info?.payload?.params?.[0]?.data,
        error?.receipt?.revertReason
    ];
    const found = candidates.find((value) => typeof value === "string" && value.startsWith("0x"));
    return found || "";
}

function serializeDecodedErrorArg(value) {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(serializeDecodedErrorArg);
    if (value && typeof value === "object") {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (_) {
            return String(value);
        }
    }
    return value;
}

function decodeContractError(contractInterface, error) {
    const errorData = extractContractErrorData(error);
    if (!errorData) return null;

    const decoded = {
        selector: errorData.slice(0, 10),
        data: errorData
    };

    try {
        const parsed = contractInterface.parseError(errorData);
        if (parsed) {
            decoded.name = parsed.name || null;
            decoded.signature = parsed.signature || null;
            decoded.args = Array.from(parsed.args || []).map(serializeDecodedErrorArg);
        }
    } catch (_) {
        // Keep selector/data only when ABI decode is unavailable.
    }

    return decoded;
}

function buildMintFailureLogContext(error) {
    const decoded = decodeContractError(HABIT_CONTRACT_INTERFACE, error);
    return {
        errorCode: error?.code || null,
        shortMessage: error?.shortMessage || null,
        message: error?.message || String(error || ""),
        errorName: error?.errorName || decoded?.name || null,
        errorSignature: error?.errorSignature || decoded?.signature || null,
        errorSelector: decoded?.selector || null,
        errorArgs: decoded?.args || [],
        errorData: decoded?.data || extractContractErrorData(error) || null
    };
}

function getStakingContract(signerOrProvider) {
    if (!isConfiguredAddress(STAKING_ADDRESS) || !contractAbi.HaBitStaking) {
        return null;
    }
    return new ethers.Contract(STAKING_ADDRESS, contractAbi.HaBitStaking, signerOrProvider);
}

function createReadOnlyProvider(rpcUrl = RPC_URL) {
    return new ethers.JsonRpcProvider(rpcUrl, CHAIN_ID, {
        batchMaxCount: 1
    });
}

function getIndexedAddressTopic(address) {
    return ethers.zeroPadValue(ethers.getAddress(address), 32);
}

function classifyHbtTransfer(fromAddress, toAddress, walletAddress) {
    const normalizedWallet = normalizeAddress(walletAddress);
    const normalizedFrom = normalizeAddress(fromAddress);
    const normalizedTo = normalizeAddress(toAddress);
    const normalizedStaking = normalizeAddress(STAKING_ADDRESS);

    const direction = normalizedFrom === normalizedWallet && normalizedTo === normalizedWallet
        ? "self"
        : normalizedTo === normalizedWallet
            ? "in"
            : "out";

    let kind = "external";
    if (normalizedFrom === normalizeAddress(ZERO_ADDRESS)) {
        kind = "mint";
    } else if (normalizedTo === normalizeAddress(ZERO_ADDRESS)) {
        kind = "burn";
    } else if (
        normalizedStaking &&
        (normalizedFrom === normalizedStaking || normalizedTo === normalizedStaking)
    ) {
        kind = "staking";
    } else if (direction === "self") {
        kind = "self";
    }

    const counterparty = direction === "in"
        ? toChecksumAddressOrEmpty(fromAddress)
        : toChecksumAddressOrEmpty(toAddress);

    return { direction, kind, counterparty };
}

function isRpcRateLimitError(error) {
    const batchedErrors = Array.isArray(error?.value) ? error.value : [];
    const messages = [
        error?.shortMessage,
        error?.message,
        error?.error?.message,
        error?.info?.error?.message,
        ...batchedErrors.map(entry => entry?.error?.message)
    ]
        .map(value => String(value || "").toLowerCase())
        .filter(Boolean);

    const errorCodes = batchedErrors
        .map(entry => Number(entry?.error?.code))
        .filter(code => Number.isFinite(code));

    return errorCodes.includes(-32005) || messages.some(message =>
        message.includes("rate limit") ||
        message.includes("too many requests") ||
        message.includes("limit exceeded") ||
        message.includes("blocks range") ||
        message.includes("block range") ||
        message.includes("0 - 10000") ||
        message.includes("limited to")
    );
}

async function getRecentHbtTransferHistory(provider, walletAddress, limit = DEFAULT_HBT_TRANSFER_HISTORY_LIMIT) {
    const safeLimit = Math.min(
        Math.max(Number(limit) || DEFAULT_HBT_TRANSFER_HISTORY_LIMIT, 1),
        MAX_HBT_TRANSFER_HISTORY_LIMIT
    );
    const normalizedWallet = ethers.getAddress(walletAddress);
    const walletTopic = getIndexedAddressTopic(normalizedWallet);
    const latestBlock = await provider.getBlockNumber();
    const collected = new Map();
    let toBlock = latestBlock;
    let chunkCount = 0;
    let chunkSize = HBT_TRANSFER_SCAN_CHUNK;

    while (toBlock >= 0 && chunkCount < HBT_TRANSFER_MAX_CHUNKS && collected.size < safeLimit) {
        const fromBlock = Math.max(0, toBlock - chunkSize + 1);
        let incomingLogs = [];
        let outgoingLogs = [];

        try {
            incomingLogs = await provider.getLogs({
                address: HABIT_ADDRESS,
                topics: [HBT_TRANSFER_TOPIC, null, walletTopic],
                fromBlock,
                toBlock
            });

            outgoingLogs = await provider.getLogs({
                address: HABIT_ADDRESS,
                topics: [HBT_TRANSFER_TOPIC, walletTopic, null],
                fromBlock,
                toBlock
            });
        } catch (error) {
            if (!isRpcRateLimitError(error)) throw error;

            if (chunkSize > HBT_TRANSFER_MIN_SCAN_CHUNK) {
                const nextChunkSize = Math.max(
                    HBT_TRANSFER_MIN_SCAN_CHUNK,
                    Math.floor(chunkSize / 2)
                );
                console.warn(
                    `[hbt-history] RPC rate limited for blocks ${fromBlock}-${toBlock}; retrying with chunk ${nextChunkSize}`
                );
                chunkSize = nextChunkSize;
                continue;
            }

            console.warn(
                `[hbt-history] RPC rate limited at minimum chunk ${chunkSize}; returning partial HBT history`
            );
            break;
        }

        [...incomingLogs, ...outgoingLogs].forEach((log) => {
            const mapKey = `${String(log.transactionHash || "").toLowerCase()}:${log.index}`;
            if (collected.has(mapKey)) return;

            let parsed;
            try {
                parsed = HBT_TRANSFER_INTERFACE.parseLog(log);
            } catch (_) {
                return;
            }

            const fromAddress = parsed?.args?.from;
            const toAddress = parsed?.args?.to;
            const rawValue = parsed?.args?.value;
            if (!fromAddress || !toAddress || rawValue === undefined || rawValue === null) {
                return;
            }

            const amountRaw = BigInt(rawValue.toString());
            if (!(amountRaw > 0n)) return;

            const { direction, kind, counterparty } = classifyHbtTransfer(
                fromAddress,
                toAddress,
                normalizedWallet
            );

            collected.set(mapKey, {
                txHash: log.transactionHash,
                logIndex: log.index,
                blockNumber: log.blockNumber,
                from: toChecksumAddressOrEmpty(fromAddress),
                to: toChecksumAddressOrEmpty(toAddress),
                amount: ethers.formatUnits(amountRaw, HBT_DECIMALS),
                amountRaw: amountRaw.toString(),
                direction,
                kind,
                counterparty,
                network: ACTIVE_CHAIN.networkTag
            });
        });

        toBlock = fromBlock - 1;
        chunkCount += 1;
        if (chunkSize < HBT_TRANSFER_SCAN_CHUNK) {
            chunkSize = Math.min(HBT_TRANSFER_SCAN_CHUNK, chunkSize * 2);
        }
    }

    const sortedTransfers = Array.from(collected.values())
        .sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) {
                return b.blockNumber - a.blockNumber;
            }
            return b.logIndex - a.logIndex;
        })
        .slice(0, safeLimit);

    const uniqueBlockNumbers = [...new Set(sortedTransfers.map((item) => item.blockNumber))];
    const blockTimestampMap = new Map();
    for (const blockNumber of uniqueBlockNumbers) {
        const block = await provider.getBlock(blockNumber).catch(() => null);
        if (block) {
            blockTimestampMap.set(blockNumber, Number(block.timestamp) * 1000);
        }
    }

    return sortedTransfers.map((transfer) => {
        const timestampMs = blockTimestampMap.get(transfer.blockNumber) || 0;
        return {
            ...transfer,
            timestampMs,
            date: timestampMs
                ? new Date(timestampMs + 9 * 60 * 60 * 1000).toISOString().split("T")[0]
                : ""
        };
    });
}

async function getRecentHbtTransferHistoryWithFallbacks(walletAddress, limit = DEFAULT_HBT_TRANSFER_HISTORY_LIMIT) {
    let lastError = null;

    for (const rpcUrl of HISTORY_RPC_URLS) {
        try {
            const provider = createReadOnlyProvider(rpcUrl);
            return await getRecentHbtTransferHistory(provider, walletAddress, limit);
        } catch (error) {
            lastError = error;
            console.warn(
                `[hbt-history] provider failed: ${rpcUrl} :: ${error?.shortMessage || error?.message || error}`
            );
        }
    }

    if (lastError) throw lastError;
    return [];
}

function resolveStakeContractModeFromReceipt(receipt) {
    const target = normalizeAddress(receipt?.to || receipt?.contractAddress);
    if (target && target === normalizeAddress(STAKING_ADDRESS) && isConfiguredAddress(STAKING_ADDRESS)) {
        return "staking";
    }
    if (target && target === normalizeAddress(HABIT_ADDRESS)) {
        return "legacy";
    }
    return isConfiguredAddress(STAKING_ADDRESS) ? "staking" : "legacy";
}

function readTieredChallengeTuple(tuple = []) {
    return {
        challengeId: String(tuple?.[0] || ""),
        stakedRaw: BigInt(tuple?.[1] || 0),
        completedDays: Number(tuple?.[2] || 0),
        totalDays: Number(tuple?.[3] || 0),
        settled: !!tuple?.[4]
    };
}

async function startTieredChallengeStake(wallet, {
    userWalletAddress,
    challengeId,
    tier,
    totalDays,
    stakeAmount
}) {
    const stakingContract = getStakingContract(wallet);
    if (!stakingContract) {
        throw new Error("Tiered challenge staking contract is unavailable");
    }

    const tierIndex = CHALLENGE_TIER_INDEX[tier];
    if (!Number.isInteger(tierIndex)) {
        throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 단계입니다.");
    }

    const expectedRaw = ethers.parseUnits(String(stakeAmount), HBT_DECIMALS);
    const existing = readTieredChallengeTuple(
        await stakingContract.getChallenge(userWalletAddress, tierIndex)
    );
    if (existing.stakedRaw > 0n && !existing.settled) {
        if (
            existing.challengeId === challengeId &&
            existing.stakedRaw === expectedRaw &&
            existing.totalDays === Number(totalDays)
        ) {
            return { recovered: true, txHash: null, tierIndex };
        }
        throw new HttpsError(
            "failed-precondition",
            "해당 단계의 온체인 챌린지가 이미 진행 중입니다."
        );
    }

    const habitContract = getHabitContract(wallet);
    const allowanceRaw = await habitContract.allowance(userWalletAddress, STAKING_ADDRESS);
    if (allowanceRaw < expectedRaw) {
        throw new HttpsError(
            "failed-precondition",
            "HBT 예치 권한이 부족합니다. 지갑에서 예치 승인을 다시 진행해 주세요."
        );
    }

    const tx = await stakingContract.startChallenge(
        userWalletAddress,
        challengeId,
        tierIndex,
        Number(totalDays),
        expectedRaw
    );
    const receipt = await tx.wait();
    return { recovered: false, txHash: receipt.hash, tierIndex };
}

async function syncTieredChallengeProgress(wallet, userWalletAddress, tier, completedDays) {
    const stakingContract = getStakingContract(wallet);
    if (!stakingContract) {
        throw new Error("Tiered challenge staking contract is unavailable");
    }

    const tierIndex = CHALLENGE_TIER_INDEX[tier];
    if (!Number.isInteger(tierIndex)) {
        throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 단계입니다.");
    }

    let onchain = readTieredChallengeTuple(
        await stakingContract.getChallenge(userWalletAddress, tierIndex)
    );
    if (onchain.settled || onchain.totalDays === 0) {
        throw new HttpsError("failed-precondition", "온체인 챌린지 예치 내역을 찾을 수 없습니다.");
    }

    const targetDays = Math.min(
        onchain.totalDays,
        Math.max(0, Number(completedDays) || 0)
    );
    while (onchain.completedDays < targetDays) {
        const recordTx = await stakingContract.recordDay(userWalletAddress, tierIndex);
        await recordTx.wait();
        onchain = {
            ...onchain,
            completedDays: onchain.completedDays + 1
        };
    }

    return { stakingContract, tierIndex, onchain };
}

async function resolveChallengeStake(
    wallet,
    userWalletAddress,
    isSuccess,
    preferredMode = "staking",
    options = {}
) {
    if (preferredMode === "tiered") {
        const { stakingContract, tierIndex } = await syncTieredChallengeProgress(
            wallet,
            userWalletAddress,
            options.tier,
            options.completedDays
        );
        const tx = await stakingContract.settleChallenge(userWalletAddress, tierIndex);
        return { tx, mode: "tiered" };
    }

    const modes = preferredMode === "legacy"
        ? ["legacy", "staking"]
        : ["staking", "legacy"];

    let lastError = null;
    for (const mode of modes) {
        try {
            if (mode === "staking") {
                const stakingContract = getStakingContract(wallet);
                if (!stakingContract) continue;
                const tx = await stakingContract.resolveChallenge(userWalletAddress, isSuccess);
                return { tx, mode };
            }

            const habitContract = getHabitContract(wallet);
            const tx = await habitContract.resolveChallenge(userWalletAddress, isSuccess);
            return { tx, mode };
        } catch (error) {
            lastError = error;
        }
    }

    throw lastError || new Error("No challenge settlement contract available");
}

async function assertIsolatedChallengeStake(wallet, userWalletAddress, expectedStake, preferredMode = "staking") {
    if (preferredMode === "tiered") return;

    const expectedRaw = ethers.parseUnits(String(expectedStake), 8);
    const contract = preferredMode === "legacy"
        ? getHabitContract(wallet)
        : getStakingContract(wallet);
    if (!contract) {
        throw new Error(`Challenge staking contract is unavailable for mode: ${preferredMode}`);
    }

    const actualRaw = await contract.challengeStakes(userWalletAddress);
    if (actualRaw !== expectedRaw) {
        // actualRaw === 0 → 이 지갑에 잠긴 예치가 없음(원금이 이미 반환/정산된 상태).
        // 이는 "티어 섞임"이 아니라 이미 반환된 경우다. 여기서 막지 않고 통과시키면,
        // 뒤이은 resolveChallengeStake가 NoStakeFound로 되돌아오고, 기존 핸들러가
        // 원금 재지급 없이(이중지급 없음) 보너스만 정상 정산한다.
        if (actualRaw === 0n) return;
        console.error("Challenge stake isolation mismatch", {
            userWalletAddress,
            preferredMode,
            expectedStake: String(expectedStake),
            expectedRaw: expectedRaw.toString(),
            actualRaw: actualRaw.toString()
        });
        throw new HttpsError(
            "failed-precondition",
            "챌린지 예치 내역이 서로 섞여 있어 자동 정산을 중단했습니다. 운영 확인 후 안전하게 정산됩니다."
        );
    }
}

// ========================================
// 1. 포인트에서 HBT 온체인 민팅
// ========================================
exports.mintHBT = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",  // 서울 리전
        maxInstances: 10,
        invoker: "public"  // Cloud Run 공개 접근 허용 (Firebase Auth는 onCall 내부에서 검증)
    },
    async (request) => {
        // 인증 확인
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const { pointAmount } = request.data;
        const attemptId = normalizeMintAttemptId(request.data?.attemptId)
            || `mint_${uid.slice(0, 8)}_${Date.now().toString(36)}`;

        if (!pointAmount || typeof pointAmount !== "number" || pointAmount < MIN_POINTS) {
            throw new HttpsError("invalid-argument", `최소 ${MIN_POINTS}P 이상 필요합니다.`);
        }
        if (pointAmount % 100 !== 0) {
            throw new HttpsError("invalid-argument", "100P 단위로만 변환 가능합니다.");
        }

        // 0. 중복 요청 방지: 원자적 락. create()는 문서가 이미 있으면 실패하므로 진짜
        //    상호배제가 된다(기존 get-then-set은 동시 두 요청이 모두 통과 가능 →
        //    포인트 이중 차감·이중 온체인 민팅 위험). 락 획득은 아래 처리 try 바깥에서
        //    수행해, 락 경쟁에서 패한 동시 요청이 승자의 락을 지우지 않게 한다.
        const lockRef = db.collection("mint_locks").doc(uid);
        const existingLock = await lockRef.get();
        if (existingLock.exists) {
            const lockAge = Date.now() - (existingLock.data().timestamp?.toMillis?.() || 0);
            if (lockAge < 60000) {
                throw new HttpsError("already-exists", "이전 변환이 처리 중입니다. 잠시 후 다시 시도해주세요.");
            }
            // 60초 넘은 죽은 락은 인수(재시도 허용)
            await lockRef.delete().catch(() => {});
        }
        try {
            await lockRef.create({
                timestamp: FieldValue.serverTimestamp(),
                pointAmount: pointAmount,
                attemptId
            });
        } catch (lockErr) {
            // create() 실패 = 다른 호출이 방금 락을 선점 → 동시 요청
            throw new HttpsError("already-exists", "이전 변환이 처리 중입니다. 잠시 후 다시 시도해주세요.");
        }

        try {
            // 1. Firestore에서 사용자 데이터 확인
            const userRef = db.collection("users").doc(uid);
            const userSnap = await userRef.get();

            if (!userSnap.exists) {
                await lockRef.delete();
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const userData = userSnap.data();
            const currentCoins = userData.coins || 0;
            const walletAddress = getEffectiveWalletAddress(userData);

            if (!walletAddress) {
                throw new HttpsError("failed-precondition", "지갑이 생성되지 않았습니다. 앱을 다시 로드해주세요.");
            }

            if (currentCoins < pointAmount) {
                throw new HttpsError("failed-precondition", `포인트가 부족합니다. 필요: ${pointAmount}P, 보유: ${currentCoins}P`);
            }

            // 일일 변환 한도 확인 (온체인과 동일한 UTC day = KST 오전 9시 reset 기준)
            const mintResetWindow = getMintResetWindowInfo();
            const recentTxSnap = await db.collection("blockchain_transactions")
                .where("userId", "==", uid)
                .orderBy("timestamp", "desc")
                .limit(RECENT_MINT_TX_LOOKBACK_LIMIT)
                .get();
            const todayMinted = sumSuccessfulConversionHbtInWindow(recentTxSnap.docs, {
                networkTag: ACTIVE_CHAIN.networkTag,
                cycleStart: mintResetWindow.cycleStart,
                cycleEnd: mintResetWindow.cycleEnd
            });

            // 2. 온체인에서 변환 비율 확인
            const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            // v2: currentRate는 RATE_SCALE(10^8) 단위, 1P = currentRate/10^8 HBT
            const currentRateRaw = await habitContract.currentRate();
            const rateNumber = Number(currentRateRaw);
            const [currentPhase] = await habitContract.getCurrentPhase();
            const phaseNumber = Number(currentPhase);

            // HBT 계산: pointAmount * currentRate / RATE_SCALE
            const RATE_SCALE = 1e8;
            const hbtAmount = (pointAmount * rateNumber) / RATE_SCALE;

            if (todayMinted + hbtAmount > MAX_DAILY_HBT) {
                throw new HttpsError("resource-exhausted",
                    buildMintDailyLimitMessage(todayMinted, MAX_DAILY_HBT),
                    {
                        kind: "daily_limit_exceeded",
                        usedHbt: todayMinted,
                        limitHbt: MAX_DAILY_HBT,
                        resetCopy: mintResetWindow.resetCopy
                    });
            }

            // 3. Firestore 포인트 차감 (트랜잭션)
            await db.runTransaction(async (transaction) => {
                const freshSnap = await transaction.get(userRef);
                const freshCoins = freshSnap.data().coins || 0;
                if (freshCoins < pointAmount) {
                    throw new HttpsError("failed-precondition", "포인트가 부족합니다 (동시 요청 감지).");
                }
                transaction.update(userRef, {
                    coins: FieldValue.increment(-pointAmount)
                });
            });

            // 4. 온체인 민팅 (habitMine 호출)
            let txHash = null;

            try {
                const tx = await habitContract.mint(walletAddress, pointAmount);
                const receipt = await tx.wait();
                txHash = receipt.hash;
            } catch (chainError) {
                // 온체인 실패 시 포인트 복원
                const failureContext = buildMintFailureLogContext(chainError);
                console.error("[mintHBT] onchain mint failed; restoring points", {
                    uid,
                    attemptId,
                    pointAmount,
                    walletAddress,
                    hbtAmount,
                    conversionRate: rateNumber,
                    phase: phaseNumber,
                    chainKey: ACTIVE_CHAIN.key,
                    network: ACTIVE_CHAIN.networkTag,
                    ...failureContext
                });
                await userRef.update({
                    coins: FieldValue.increment(pointAmount)
                });
                await lockRef.delete();
                if (failureContext.errorName === "ExceedsUserDailyCap") {
                    throw new HttpsError(
                        "resource-exhausted",
                        buildMintDailyLimitMessage(MAX_DAILY_HBT, MAX_DAILY_HBT),
                        {
                            kind: "daily_limit_exceeded",
                            attemptId,
                            errorName: failureContext.errorName,
                            errorSignature: failureContext.errorSignature,
                            errorSelector: failureContext.errorSelector,
                            limitHbt: MAX_DAILY_HBT,
                            resetCopy: mintResetWindow.resetCopy,
                            network: ACTIVE_CHAIN.networkTag,
                            phase: phaseNumber
                        }
                    );
                }
                throw new HttpsError(
                    "internal",
                    "온체인 민팅에 실패했습니다. 잠시 후 다시 시도해주세요.",
                    {
                        kind: "onchain_mint_failed",
                        attemptId,
                        errorName: failureContext.errorName,
                        errorSignature: failureContext.errorSignature,
                        errorSelector: failureContext.errorSelector,
                        network: ACTIVE_CHAIN.networkTag,
                        phase: phaseNumber
                    }
                );
            }

            // 5. Firestore 업데이트 (온체인 민팅 기록만, hbtBalance는 온체인이 진실의 원천)
            await userRef.update({
                totalHbtEarned: FieldValue.increment(hbtAmount)
            });

            // 6. 락 해제
            await lockRef.delete();

            // 7. 거래 기록 저장
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const txRecordRef = db.collection("blockchain_transactions").doc();
            await txRecordRef.set({
                userId: uid,
                type: "conversion",
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                conversionRate: rateNumber,
                phase: phaseNumber,
                txHash,
                attemptId,
                walletAddress,
                date: today,
                timestamp: FieldValue.serverTimestamp(),
                status: "success",
                network: ACTIVE_CHAIN.networkTag
            });

            console.log("[mintHBT] success", {
                uid,
                attemptId,
                transactionId: txRecordRef.id,
                pointAmount,
                hbtReceived: hbtAmount,
                txHash,
                walletAddress,
                conversionRate: rateNumber,
                phase: phaseNumber,
                chainKey: ACTIVE_CHAIN.key,
                network: ACTIVE_CHAIN.networkTag
            });

            return {
                success: true,
                attemptId,
                transactionId: txRecordRef.id,
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                txHash,
                explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
                conversionRate: rateNumber,
                phase: phaseNumber
            };

        } catch (error) {
            // 에러 시 락 해제
            try { await db.collection("mint_locks").doc(uid).delete(); } catch (_) {}
            if (error instanceof HttpsError) throw error;
            console.error("[mintHBT] unexpected error", {
                uid,
                attemptId,
                errorCode: error?.code || null,
                message: error?.message || String(error || ""),
                stack: error?.stack || null
            });
            throw new HttpsError("internal", "변환 처리 중 오류가 발생했습니다.", { attemptId });
        }
    }
);

// ========================================
// 2. 온체인 HBT 잔액 조회
// ========================================
exports.getOnchainBalance = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 20
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const targetUid = String(request.data?.targetUid || uid).trim();
        if (!targetUid || targetUid.includes("/")) {
            throw new HttpsError("invalid-argument", "유효하지 않은 사용자입니다.");
        }

        try {
            if (targetUid !== uid) {
                const email = normalizeEmail(request.auth?.token?.email);
                const uidAdminSnap = await db.doc(`admins/${uid}`).get();
                const emailAdminSnap = email ? await db.doc(`admins/${email}`).get() : null;
                if (!uidAdminSnap.exists && !emailAdminSnap?.exists && !isBootstrapAdminEmail(email)) {
                    throw new HttpsError("permission-denied", "관리자 권한 필요");
                }
            }

            const userSnap = await db.collection("users").doc(targetUid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const walletAddress = getEffectiveWalletAddress(userSnap.data());
            if (!walletAddress) {
                return { balance: "0", balanceFormatted: "0", uid: targetUid };
            }

            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const balance = await habitContract.balanceOf(walletAddress);
            const decimals = await habitContract.decimals();
            const formatted = ethers.formatUnits(balance, decimals);

            return {
                balance: balance.toString(),
                balanceFormatted: formatted,
                uid: targetUid,
                walletAddress: walletAddress
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getOnchainBalance 오류:", error);
            throw new HttpsError("internal", "잔액 조회 중 오류가 발생했습니다.");
        }
    }
);

exports.getRewardMarketSnapshot = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 30
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }

            const config = buildRewardMarketConfig(process.env);
            const snapshot = await buildRewardMarketSnapshot({
                db,
                uid,
                config,
                userData: userSnap.data() || {},
            });

            return {
                success: true,
                ...snapshot
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getRewardMarketSnapshot error:", error);
            throw new HttpsError("internal", "보상 마켓 정보를 불러오는 중 오류가 발생했습니다.");
        }
    }
);

exports.redeemRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10,
        // lost-write 방지: 기프티쇼 발급이 성공한 뒤 issued 기록 전에 함수가 타임아웃으로
        // 죽으면 pending_issue에 갇힌다. 창을 넓혀 발급 후 기록까지 완료되도록 한다.
        timeoutSeconds: 180
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }

            const config = buildRewardMarketConfig(process.env);
            const result = await redeemRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                uid,
                userData: userSnap.data() || {},
                config,
                sku: request.data?.sku,
                recipientPhone: request.data?.recipientPhone,
                quoteVersion: request.data?.quoteVersion,
                quoteSource: request.data?.quoteSource,
                quotedPointCost: request.data?.quotedPointCost,
                clientRequestId: request.data?.clientRequestId,
                authPhoneNumber: request.auth.token?.phone_number,
            });

            return {
                success: true,
                ...result
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("redeemRewardCoupon error:", error);
            throw new HttpsError("internal", "쿠폰 교환 처리 중 오류가 발생했습니다.");
        }
    }
);

exports.dismissRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        try {
            return await dismissRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                uid: request.auth.uid,
                redemptionId: request.data?.redemptionId,
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("dismissRewardCoupon error:", error);
            throw new HttpsError("internal", "쿠폰 목록을 정리하는 중 오류가 발생했습니다.");
        }
    }
);

exports.markRewardCouponUsed = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        try {
            return await markRewardCouponUsedFlow({
                db,
                FieldValue,
                HttpsError,
                uid: request.auth.uid,
                redemptionId: request.data?.redemptionId,
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("markRewardCouponUsed error:", error);
            throw new HttpsError("internal", "쿠폰 사용 완료 처리 중 오류가 발생했습니다.");
        }
    }
);

exports.deleteRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        try {
            return await deleteRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                uid: request.auth.uid,
                redemptionId: request.data?.redemptionId,
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("deleteRewardCoupon error:", error);
            throw new HttpsError("internal", "쿠폰 삭제 중 오류가 발생했습니다.");
        }
    }
);

exports.adminResendRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 5,
        timeoutSeconds: 60
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        try {
            const config = buildRewardMarketConfig(process.env);
            const result = await adminResendRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                adminUid,
                config,
                redemptionId: request.data?.redemptionId,
                reason: request.data?.reason,
                forceSms: request.data?.forceSms === true
            });

            return {
                success: true,
                ...result
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("adminResendRewardCoupon error:", error);
            throw new HttpsError("internal", "쿠폰 재확인 처리 중 문제가 발생했어요.");
        }
    }
);

exports.adminReconcileRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 5,
        timeoutSeconds: 60
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        try {
            return await adminReconcileRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                adminUid,
                redemptionId: request.data?.redemptionId,
                providerOrderId: request.data?.providerOrderId,
                note: request.data?.note,
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("adminReconcileRewardCoupon error:", error);
            throw new HttpsError("internal", "발급완료 정정 중 오류가 발생했어요.");
        }
    }
);

exports.adminRefundRewardCoupon = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 5,
        timeoutSeconds: 60
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        try {
            return await adminRefundRewardCouponFlow({
                db,
                FieldValue,
                HttpsError,
                adminUid,
                redemptionId: request.data?.redemptionId,
                note: request.data?.note,
            });
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("adminRefundRewardCoupon error:", error);
            throw new HttpsError("internal", "환불 처리 중 오류가 발생했어요.");
        }
    }
);

// 관리자: 온체인 예치가 남아 있지 않은데 앱에는 '수령 대기'로 갇힌 챌린지를 정리한다.
// (구 스테이킹 컨트랙트가 지갑당 예치를 합산 저장해, 한 티어를 정산하면 다른 티어 예치도
//  함께 반환돼 버리는 격리 결함의 뒤처리.) 자금 이동/민팅 없이 앱 레코드만 정리하되,
// 반드시 온체인 예치가 0인지 재확인한 뒤에만 지운다(잠긴 자금 스트랜딩 방지).
exports.adminSettleStuckChallenge = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 3,
        timeoutSeconds: 60
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        const targetUid = String(request.data?.uid || request.auth?.uid || "").trim();
        const tier = String(request.data?.tier || "").trim();
        if (!targetUid) throw new HttpsError("invalid-argument", "대상 사용자(uid)가 필요합니다.");
        if (!["mini", "weekly", "master"].includes(tier)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 티어입니다.");
        }

        const userRef = db.doc(`users/${targetUid}`);
        const snap = await userRef.get();
        if (!snap.exists) throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        const userData = snap.data() || {};
        const challenge = (userData.activeChallenges || {})[tier];
        if (!challenge) return { success: true, alreadyClear: true, tier, uid: targetUid };

        // 온체인 안전 가드: 이 티어(및 지갑)에 잠긴 예치가 조금이라도 있으면 정리 거부.
        const walletAddress = String(challenge.stakeWalletAddress || "").trim() || getEffectiveWalletAddress(userData);
        if (walletAddress) {
            let lockedRaw = 0n;
            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const staking = getStakingContract(wallet);
                const tierIndex = CHALLENGE_TIER_INDEX[tier];
                if (staking && Number.isInteger(tierIndex)) {
                    const t = readTieredChallengeTuple(await staking.getChallenge(walletAddress, tierIndex));
                    if (!t.settled) lockedRaw += t.stakedRaw;
                    lockedRaw += BigInt(await staking.challengeStakes(walletAddress).catch(() => 0n));
                }
                lockedRaw += BigInt(await getHabitContract(wallet).challengeStakes(walletAddress).catch(() => 0n));
            } catch (chainErr) {
                throw new HttpsError("failed-precondition",
                    "온체인 예치 확인에 실패해 정리를 중단했습니다: " + (chainErr?.shortMessage || chainErr?.message || "unknown"));
            }
            if (lockedRaw > 0n) {
                throw new HttpsError("failed-precondition",
                    `이 티어에 온체인 예치(${ethers.formatUnits(lockedRaw, HBT_DECIMALS)} HBT)가 아직 잠겨 있어 정리할 수 없습니다. 온체인 정산이 먼저 필요합니다.`);
            }
        }

        // 잠긴 예치 없음(원금 이미 반환/미예치) → 앱 레코드만 정리. 자금 이동/민팅 없음.
        const now = new Date();
        await userRef.set({
            activeChallenges: { [tier]: FieldValue.delete() },
            stuckChallengeSettled: {
                [tier]: {
                    settledByAdminUid: adminUid,
                    settledAt: now,
                    clearedChallengeId: String(challenge.challengeId || challenge.id || ""),
                    note: String(request.data?.note || "admin_settle_stuck_no_onchain_stake").slice(0, 300)
                }
            },
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`adminSettleStuckChallenge: cleared ${tier} for ${targetUid} by ${adminUid} (no on-chain stake)`);
        return { success: true, cleared: true, tier, uid: targetUid };
    }
);

// 관리자: 보상 창(어제~오늘) daily_logs를 가볍게 건드려 awardPoints(onDocumentWritten)를
// 재발동시킨다. 구 awardPoints가 정산 못 한 기록(신 클라가 awardedPoints를 안 쓰기 때문)을
// 신 서버정산 버전으로 재정산하기 위한 일회성 백필. awardPoints는 point_ledger +
// rewardLedgerVersion:2로 멱등이라, 이미 정산된 기록은 건너뛰고 이중지급이 없다.
exports.adminResettleDailyLogs = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 2,
        timeoutSeconds: 540
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        const todayStr = getCurrentKstDateString();
        const dateFrom = String(request.data?.dateFrom || addDaysToKstDateString(todayStr, -1)).trim();
        const dateTo = String(request.data?.dateTo || todayStr).trim();
        const maxDocs = Math.max(1, Math.min(50000, Number(request.data?.max) || 20000));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
            throw new HttpsError("invalid-argument", "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).");
        }

        // 커서(orderBy date + startAfter)로 범위를 끝까지 순회한다. orderBy가 없으면
        // limit이 임의 500건만 반환하고 재호출해도 진행이 안 되므로 반드시 필요.
        const pageSize = 300;
        const deadline = Date.now() + 480_000; // 타임아웃(540s) 전에 안전하게 종료
        let touched = 0;
        let cursor = null;
        let complete = false;
        while (touched < maxDocs && Date.now() < deadline) {
            let q = db.collection("daily_logs")
                .where("date", ">=", dateFrom)
                .where("date", "<=", dateTo)
                .orderBy("date")
                .limit(pageSize);
            if (cursor) q = q.startAfter(cursor);
            const snap = await q.get();
            if (snap.empty) { complete = true; break; }

            const batch = db.batch();
            for (const docSnap of snap.docs) {
                batch.set(docSnap.ref, {
                    resettleTriggerAt: FieldValue.serverTimestamp(),
                    resettleBy: adminUid
                }, { merge: true });
            }
            await batch.commit();
            touched += snap.size;
            cursor = snap.docs[snap.docs.length - 1];
            if (snap.size < pageSize) { complete = true; break; }
        }

        console.log(`adminResettleDailyLogs: touched ${touched} logs [${dateFrom}~${dateTo}] complete=${complete} by ${adminUid}`);
        // complete=false면 아직 남음 → 같은 인자로 다시 호출하면 이어서 처리(멱등이라 겹쳐도 안전).
        return { success: true, touched, dateFrom, dateTo, complete };
    }
);

// 관리자: 과거 daily_logs를 gallery_posts로 투영하는 백필. syncGalleryPostProjection
// 트리거는 '투영 지문이 바뀔 때만' 동작하므로, 문서를 단순 터치해서는 이미 존재하던
// 옛 기록이 투영되지 않는다(지문 불변 → 스킵). 여기서는 투영 함수를 직접 호출해
// 지문 가드를 우회하고 강제 투영한다(공유 설정에 맞는 것만 gallery_posts에 기록됨).
exports.adminBackfillGalleryPosts = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 2,
        timeoutSeconds: 540
    },
    async (request) => {
        const adminUid = await assertAdminRequest(request);
        const todayStr = getCurrentKstDateString();
        const dateFrom = String(request.data?.dateFrom || addDaysToKstDateString(todayStr, -1)).trim();
        const dateTo = String(request.data?.dateTo || todayStr).trim();
        const maxDocs = Math.max(1, Math.min(50000, Number(request.data?.max) || 20000));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
            throw new HttpsError("invalid-argument", "날짜 형식이 올바르지 않습니다(YYYY-MM-DD).");
        }

        const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").trim();
        const allowedStorageBuckets = [...new Set([
            admin.storage().bucket().name,
            projectId ? `${projectId}.firebasestorage.app` : "",
            projectId ? `${projectId}.appspot.com` : "",
        ].filter(Boolean))];

        const pageSize = 200;
        const deadline = Date.now() + 480_000;
        let processed = 0;
        let projected = 0;
        let cursor = null;
        let complete = false;
        while (processed < maxDocs && Date.now() < deadline) {
            let q = db.collection("daily_logs")
                .where("date", ">=", dateFrom)
                .where("date", "<=", dateTo)
                .orderBy("date")
                .limit(pageSize);
            if (cursor) q = q.startAfter(cursor);
            const snap = await q.get();
            if (snap.empty) { complete = true; break; }

            for (const docSnap of snap.docs) {
                try {
                    const payload = await syncGalleryPostFromDailyLog({
                        db,
                        FieldValue,
                        logId: docSnap.id,
                        before: null,
                        after: docSnap.data(),
                        allowedStorageBuckets
                    });
                    if (payload) projected += 1;
                } catch (projectErr) {
                    console.warn(`gallery backfill skip ${docSnap.id}: ${projectErr?.message || projectErr}`);
                }
                processed += 1;
            }
            cursor = snap.docs[snap.docs.length - 1];
            if (snap.size < pageSize) { complete = true; break; }
        }

        console.log(`adminBackfillGalleryPosts: processed ${processed}, projected ${projected} [${dateFrom}~${dateTo}] complete=${complete} by ${adminUid}`);
        return { success: true, processed, projected, dateFrom, dateTo, complete };
    }
);

exports.cleanupExpiredRewardCoupons = onSchedule(
    {
        region: "asia-northeast3",
        schedule: "20 3 * * *",
        timeZone: "Asia/Seoul",
        timeoutSeconds: 120,
        memory: "256MiB"
    },
    async () => {
        try {
            const result = await cleanupExpiredRewardCouponsFlow({
                db,
                now: new Date()
            });
            console.log("expired reward coupons cleaned", {
                deletedCount: result?.deletedCount || 0,
                checkedCount: result?.checkedCount || 0
            });
        } catch (error) {
            console.error("cleanupExpiredRewardCoupons error:", error);
            throw error;
        }
    }
);

exports.refreshRewardMarketOps = onSchedule(
    {
        region: "asia-northeast3",
        schedule: "every 60 minutes",
        timeZone: "Asia/Seoul",
        timeoutSeconds: 120,
        memory: "256MiB"
    },
    async () => {
        const config = buildRewardMarketConfig(process.env);
        try {
            const result = await syncRewardMarketOps({
                db,
                config,
                now: new Date()
            });
            console.log("reward market ops refreshed", {
                pricingMode: result?.pricing?.pricingMode,
                quoteState: result?.pricing?.quoteState,
                bizmoneyStatus: result?.bizmoney?.status
            });
        } catch (error) {
            console.error("refreshRewardMarketOps error:", error);
            throw error;
        }
    }
);

exports.refreshRewardMarketOpsNow = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 3,
        timeoutSeconds: 60
    },
    async (request) => {
        await assertAdminRequest(request);
        const config = buildRewardMarketConfig(process.env);
        try {
            const result = await syncRewardMarketOps({
                db,
                config,
                now: new Date()
            });

            return {
                success: true,
                pricingMode: result?.pricing?.pricingMode || "",
                quoteState: result?.pricing?.quoteState || "",
                quotedAt: result?.pricing?.quotedAt || "",
                bizmoneyStatus: result?.bizmoney?.status || "",
                bizmoneyBalanceKrw: result?.bizmoney?.balanceKrw || 0
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("refreshRewardMarketOpsNow error:", error);
            throw new HttpsError("internal", "보상 마켓 운영 상태를 갱신하지 못했어요.");
        }
    }
);

// ========================================
// 2-1. 사용자 지갑 가스(ETH) 자동 충전
// ========================================
exports.getHbtTransferHistory = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const requestedLimit = Number(request.data?.limit);
        const limit = Number.isFinite(requestedLimit)
            ? requestedLimit
            : DEFAULT_HBT_TRANSFER_HISTORY_LIMIT;

        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const walletAddress = getEffectiveWalletAddress(userSnap.data());
            if (!walletAddress) {
                return {
                    walletAddress: "",
                    chainKey: ACTIVE_CHAIN.key,
                    network: ACTIVE_CHAIN.networkTag,
                    transfers: []
                };
            }

            const transfers = await getRecentHbtTransferHistoryWithFallbacks(walletAddress, limit);

            return {
                walletAddress,
                chainKey: ACTIVE_CHAIN.key,
                network: ACTIVE_CHAIN.networkTag,
                transfers
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getHbtTransferHistory error:", error);
            throw new HttpsError("internal", "HBT 거래 이력을 불러오는 중 오류가 발생했습니다.");
        }
    }
);

exports.prefundWallet = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.collection("users").doc(uid);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        let userData = userSnap.data();
        userData = await sanitizeUserChallengesForActiveChain(userRef, userData);
        const walletAddress = getEffectiveWalletAddress(userData);
        if (!walletAddress) {
            throw new HttpsError("failed-precondition", "지갑 주소가 없습니다.");
        }

        // 24시간 충전 제한
        const lastFunded = userData.lastGasFunded;
        if (lastFunded) {
            const elapsed = Date.now() - lastFunded.toMillis();
            if (elapsed < 24 * 60 * 60 * 1000) {
                return { funded: false, reason: "24시간 내 이미 충전됨" };
            }
        }

        const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
        const bnbBalance = await provider.getBalance(walletAddress);
        const THRESHOLD = ethers.parseEther("0.003");

        if (bnbBalance >= THRESHOLD) {
            return { funded: false, reason: `${GAS_TOKEN_SYMBOL} 잔액 충분` };
        }

        const FUND_AMOUNT = ethers.parseEther("0.005");
        const tx = await wallet.sendTransaction({ to: walletAddress, value: FUND_AMOUNT });
        await tx.wait();

        await userRef.update({ lastGasFunded: FieldValue.serverTimestamp() });

        console.log(`✅ 가스 충전 완료: ${walletAddress} +0.005 ${GAS_TOKEN_SYMBOL}`);
        return { funded: true, amount: "0.005", txHash: tx.hash };
    }
);

// ========================================
// 3. 토큰 전체 통계 조회
// ========================================
exports.getTokenStats = onCall(
    {
        region: "asia-northeast3",
        maxInstances: 10
    },
    async (request) => {
        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const stats = await habitContract.getTokenStats();
            const decimals = await habitContract.decimals();
            let totalStaked = stats[7];
            let totalSlashed = stats[8];
            const currentPhase = Number(stats[4]);

            try {
                const stakingContract = getStakingContract(provider);
                if (stakingContract) {
                    const stakingStats = await stakingContract.getStakingStats();
                    totalStaked = stakingStats[0];
                    totalSlashed = stakingStats[2];
                }
            } catch (stakingError) {
                console.warn("[getTokenStats] staking stats fallback to token contract:", stakingError?.message || stakingError);
            }

            const challengeMetrics = await getChallengeBonusMetrics();
            const challengeBonusPolicy = buildChallengeBonusPolicy({
                phase: currentPhase,
                mse30: challengeMetrics.mse30
            });

            // v2 getTokenStats 반환: totalSupply, totalMined, totalBurned, currentRate, currentPhase, weeklyTarget, remainingInPool, totalStaked, totalSlashed
            return {
                totalSupply: ethers.formatUnits(stats[0], decimals),
                totalMined: ethers.formatUnits(stats[1], decimals),
                totalBurned: ethers.formatUnits(stats[2], decimals),
                currentRate: Number(stats[3]),
                currentPhase,
                chainKey: ACTIVE_CHAIN.key,
                chainLabel: ACTIVE_CHAIN.label,
                networkTag: ACTIVE_CHAIN.networkTag,
                habitAddress: HABIT_ADDRESS,
                stakingAddress: STAKING_ADDRESS,
                weeklyTarget: ethers.formatUnits(stats[5], decimals),
                remainingInPool: ethers.formatUnits(stats[6], decimals),
                totalStaked: ethers.formatUnits(totalStaked, decimals),
                totalSlashed: ethers.formatUnits(totalSlashed, decimals),
                challengeBonusPolicy: {
                    ...challengeBonusPolicy,
                    masterFullCompletionStaked: challengeMetrics.masterFullCompletionStaked,
                    masterFullCompletionCount: challengeMetrics.masterFullCompletionCount,
                    updatedDate: challengeMetrics.updatedDate
                }
            };

        } catch (error) {
            console.error("getTokenStats 오류:", error);
            throw new HttpsError("internal", "통계 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 4. AI 식단 분석 (Gemini Vision API)
// ========================================
const { GoogleGenerativeAI } = require("@google/generative-ai");

function normalizeLocale(rawLocale = "ko") {
    return String(rawLocale || "ko").trim().toLowerCase().startsWith("en") ? "en" : "ko";
}

const DIET_ANALYSIS_PROMPT = `당신은 최고건강전문 영양 분석 AI입니다. 사진 속 음식을 분석해주세요.

## 핵심 철학
- 탄수화물/단백질/지방 비율보다 **식품의 질(Quality)**이 중요합니다.
- 비타민, 무기질, 식이섬유, 항산화물질이 풍부한 자연식품으로 식량을 채우는 것이 핵심입니다.
- 초가공식품(라면, 소시지, 과자, 탄산음료, 즉석식품 등)은 인슐린 저항성을 악화시킵니다.
- 같은 칼로리라도 자연식품과 초가공식품이 신체에 미치는 영향은 완전히 다릅니다.

## 분석 기준
1. **음식 인식**: 사진에 보이는 모든 음식/식재료명 나열
2. **자연식품 vs 초가공식품**: 각 음식의 분류
   - natural: 자연 그대로이거나 최소 가공(채소, 과일, 생선, 살코기, 견과류, 잡곡 등)
   - processed: 일반 가공(치즈, 김치, 된장 등 전통 발효식품)
   - ultraprocessed: 초가공(라면, 햄, 소시지, 과자, 빵, 탄산음료, 패스트푸드)
3. **미량영양소 점수** (각 0~100):
   - vitamins: 비타민류(B, C 등) 존재 비율
   - minerals: 무기질(칼슘, 마그네슘, 아연 등) 존재 비율
   - fiber: 식이섬유 함량
   - antioxidants: 항산화물질(폴리페놀, 카로티노이드 등) 함량
4. **한끼 등급** (A~F):
   - A: 초가공 0%, 미량영양소 풍부, 완벽한 자연식품
   - B: 초가공 10% 미만, 미량영양소 양호
   - C: 초가공 20% 미만, 약간의 개선 필요
   - D: 초가공 30% 이상, 미량영양소 부족
   - F: 초가공 50% 이상, 자연식품 거의 없음
5. **인슐린/혈당 관련 코멘트**: 이 식사가 인슐린/혈당에 미치는 영향 (1-2문장)
6. **개선 제안**: 구체적이고 실천 가능한 한 가지 대안 (1문장)

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "foods": [
    {"name": "음식명", "category": "natural|processed|ultraprocessed", "nutrients": "주요 영양소 한줄 설명"}
  ],
  "scores": {
    "vitamins": 80,
    "minerals": 70,
    "fiber": 90,
    "antioxidants": 60
  },
  "grade": "A|B|C|D|F",
  "naturalRatio": 80,
  "insulinComment": "인슐린/혈당 관련 코멘트",
  "suggestion": "개선 제안",
  "summary": "한줄 총평"
}`;

const DIET_ANALYSIS_PROMPT_EN = `You are a practical nutrition analysis AI for Habit School. Analyze the food visible in the image.

Return only valid JSON with the exact same schema:
{
  "foods": [
    {"name": "food name", "category": "natural|processed|ultraprocessed", "nutrients": "short nutrient note"}
  ],
  "scores": {
    "vitamins": 80,
    "minerals": 70,
    "fiber": 90,
    "antioxidants": 60
  },
  "grade": "A|B|C|D|F",
  "naturalRatio": 80,
  "insulinComment": "1-2 sentence comment about likely glucose/insulin impact",
  "suggestion": "one specific practical improvement",
  "summary": "short overall summary"
}

Food quality matters more than calories alone. Classify whole/minimally processed foods as "natural", traditional/simple processed foods as "processed", and packaged instant snacks, sweet drinks, processed meats, ramen, and similar industrial foods as "ultraprocessed". Write all user-facing strings in natural English.`;

exports.analyzeDiet = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, locale: rawLocale } = request.data || {};
        const locale = normalizeLocale(rawLocale);
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF/교차 사용자 방지: 로그인 사용자의 식단 이미지 객체만 허용
        if (!isAllowedUserMediaUrl(imageUrl, request.auth.uid, "diet_images")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            // 이미지 다운로드
            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
                throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
            }
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const base64Image = imgBuffer.toString("base64");

            // Gemini API 호출
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await model.generateContent([
                locale === "en" ? DIET_ANALYSIS_PROMPT_EN : DIET_ANALYSIS_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();

            // JSON 추출 (마크다운 코드블록 제거)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);

            return {
                success: true,
                analysis: analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeDiet 오류:", error);

            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }
            throw new HttpsError("internal", "식단 분석 중 오류가 발생했습니다.");
        }
    }
);

async function buildInlineImagePartFromUrl(imageUrl = "") {
    const normalizedUrl = String(imageUrl || "").trim();
    if (!normalizedUrl) {
        throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
    }

    if (!normalizedUrl.startsWith("https://firebasestorage.googleapis.com/") && !normalizedUrl.startsWith("data:")) {
        throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
    }

    if (normalizedUrl.startsWith("data:")) {
        const matches = normalizedUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new HttpsError("invalid-argument", "잘못된 data URL 형식입니다.");
        }
        const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
        if (!allowedMimes.includes(matches[1])) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 형식입니다.");
        }
        if (matches[2].length > 5 * 1024 * 1024 * 1.37) {
            throw new HttpsError("invalid-argument", "이미지 크기가 너무 큽니다 (최대 5MB).");
        }
        return {
            inlineData: {
                data: matches[2],
                mimeType: matches[1]
            }
        };
    }

    const imgResponse = await fetch(normalizedUrl);
    if (!imgResponse.ok) {
        throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
    }

    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    return {
        inlineData: {
            data: imgBuffer.toString("base64"),
            mimeType: contentType
        }
    };
}

const SHARED_HEALTH_IMAGE_CLASSIFICATION_PROMPT = `당신은 해빛스쿨 PWA의 공유 이미지 분류기입니다.

사용자가 다른 앱에서 이미지를 공유하면, 이 이미지가 아래 중 어디에 들어가야 하는지 빠르게 판별하세요.
- diet: 식단 사진, 음식 사진, 식사 트레이, 음료, 영양 화면
- exercise: 운동 인증 사진, 운동 장면, 걷기/러닝/헬스 캡처, 피트니스 앱 스크린샷
- sleep: 수면 앱 캡처, 수면 그래프, 취침/기상 기록, 수면 품질 화면
- unknown: 확신이 부족하거나 세 카테고리와 맞지 않음

추가 규칙:
- exercise 카테고리일 때만 exerciseMode를 채우세요.
- exerciseMode는 아래 둘 중 하나입니다.
  - step_screenshot: 삼성헬스/건강앱 같은 걸음수, 거리, 칼로리, 활동시간이 보이는 앱 캡처
  - cardio_image: 일반 운동 사진 또는 기타 운동 이미지
- 확신이 낮으면 category를 unknown으로 두거나 confidence를 낮게 주세요.
- 반드시 보수적으로 판단하세요. 자동 라우팅이 걸리므로 과한 추측을 하면 안 됩니다.

반드시 아래 JSON만 출력하세요.
{
  "category": "diet|exercise|sleep|unknown",
  "confidence": 0.0,
  "reason": "짧은 근거",
  "exerciseMode": "step_screenshot|cardio_image|null"
}`;

exports.classifySharedHealthImage = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 20
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, fileName, fileCount } = request.data || {};
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await model.generateContent([
                SHARED_HEALTH_IMAGE_CLASSIFICATION_PROMPT,
                `파일 이름: ${String(fileName || "").trim() || "-"}`,
                `공유된 이미지 수: ${Number(fileCount || 0) || 1}`,
                await buildInlineImagePartFromUrl(imageUrl)
            ]);

            const responseText = result.response.text();
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr);
            const category = ["diet", "exercise", "sleep", "unknown"].includes(String(parsed?.category || "").trim())
                ? String(parsed.category).trim()
                : "unknown";
            const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence || 0) || 0));
            const exerciseMode = category === "exercise" && String(parsed?.exerciseMode || "").trim() === "step_screenshot"
                ? "step_screenshot"
                : (category === "exercise" ? "cardio_image" : null);

            return {
                success: true,
                classification: {
                    category,
                    confidence,
                    reason: String(parsed?.reason || "").trim(),
                    exerciseMode
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("classifySharedHealthImage 오류:", error);
            throw new HttpsError("internal", "공유 이미지 분류 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 5. AI 수면/마음 분석 (Gemini Vision API)
// ========================================

const SLEEP_MIND_ANALYSIS_PROMPT = `당신은 수면 건강 전문가이자 마음챙김 코치 AI입니다.

## 분석 대상
사용자가 수면 앱/시계 캡처 사진 또는 마음 관련 텍스트(감사일기, 명상 기록)를 제공합니다.

## 분석 기준
### 수면 캡처 사진일 경우:
- 총 수면 시간, 수면 효율, 깊은수면/렘수면 비율을 인식
- 수면 패턴 품질 평가 (A~F)
- 개선 가능한 수면 습관 팁

### 마음 텍스트일 경우:
- 감성 분석 (긍정/중립/부정)
- 스트레스 수준 추정
- 마음 건강 관련 피드백

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "type": "sleep" | "mind",
  "grade": "A" | "B" | "C" | "D" | "F",
  "summary": "한줄 총평",
  "details": {
    "sleepDuration": "수면 시간 (예: '7시간 30분') 또는 null",
    "sleepQuality": "수면 품질 설명 또는 null",
    "emotionTone": "감정 톤 (긍정적/중립/부정적) 또는 null",
    "stressLevel": "스트레스 수준 (낮음/보통/높음) 또는 null"
  },
  "tip": "실천 가능한 개선 팁 1가지",
  "feedback": "격려 및 분석 코멘트 (2~3문장)"
}
마크다운 코드 블록으로 출력하지 말고, 순수 JSON만 출력하세요.`;

const SLEEP_MIND_ANALYSIS_PROMPT_EN = `You are a sleep health expert and mindfulness coach for Habit School.

The user may provide a sleep tracker screenshot or a mind-related text record such as a gratitude journal or meditation note.

Return only valid JSON with the exact same schema:
{
  "type": "sleep" | "mind",
  "grade": "A" | "B" | "C" | "D" | "F",
  "summary": "short overall summary",
  "details": {
    "sleepDuration": "sleep duration such as 7h 30m, or null",
    "sleepQuality": "short sleep quality note, or null",
    "emotionTone": "positive/neutral/negative, or null",
    "stressLevel": "low/medium/high, or null"
  },
  "tip": "one practical improvement",
  "feedback": "2-3 encouraging analysis sentences"
}

Use the requested analysis type when the evidence is ambiguous. Keep all user-facing strings in natural English.`;

exports.analyzeSleepMind = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, textData, analysisType, locale: rawLocale } = request.data || {};
        const locale = normalizeLocale(rawLocale);
        if (!imageUrl && !textData) {
            throw new HttpsError("invalid-argument", "이미지 또는 텍스트 데이터가 필요합니다.");
        }

        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const contentParts = [locale === "en" ? SLEEP_MIND_ANALYSIS_PROMPT_EN : SLEEP_MIND_ANALYSIS_PROMPT];

            if (imageUrl && typeof imageUrl === "string") {
                // SSRF/교차 사용자 방지: 로그인 사용자의 수면 이미지 객체만 허용
                if (!isAllowedUserMediaUrl(imageUrl, request.auth.uid, "sleep_images")) {
                    throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
                }
                try {
                    const imgResponse = await fetch(imageUrl);
                    if (imgResponse.ok) {
                        const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                        const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
                        contentParts.push({
                            inlineData: {
                                data: imgBuffer.toString("base64"),
                                mimeType: contentType
                            }
                        });
                    }
                } catch (imgError) {
                    console.warn("수면 이미지 처리 실패:", imgError.message);
                }
            }

            if (textData) {
                contentParts.push(locale === "en" ? `User record: ${textData}` : `사용자 기록: ${textData}`);
            }

            contentParts.push(locale === "en" ? `Analysis type: ${analysisType || 'sleep'}` : `분석 유형: ${analysisType || 'sleep'}`);

            const result = await model.generateContent(contentParts);
            const responseText = result.response.text();

            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            } else {
                const braceMatch = responseText.match(/\{[\s\S]*\}/);
                if (braceMatch) jsonStr = braceMatch[0];
            }

            let analysis;
            try {
                analysis = JSON.parse(jsonStr);
            } catch (parseErr) {
                console.error("SleepMind JSON 파싱 실패. 원본:", responseText.substring(0, 500));
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }

            return {
                analysis: analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeSleepMind 오류:", error.message || error);
            throw new HttpsError("internal", "수면/마음 분석 중 오류가 발생했습니다. 다시 시도해주세요.");
        }
    }
);

// ========================================
// 6. AI 걸음수 스크린샷 분석 (Gemini Vision API)
// ========================================


const STEP_SCREENSHOT_PROMPT = `당신은 건강 앱 스크린샷을 분석하는 AI입니다.
사용자가 삼성헬스, Apple 건강, 또는 기타 건강/만보기 앱의 스크린샷을 제공합니다.

## 분석 대상
화면에 보이는 걸음수, 거리, 칼로리, 활동 시간 등의 데이터를 정확히 추출합니다.

## 분석 기준
1. **걸음수**: 메인 숫자(보통 가장 크게 표시됨)를 인식
2. **거리**: km 또는 miles 단위 (없으면 null)
3. **칼로리**: kcal 또는 cal (없으면 null)
4. **활동 시간**: 분 단위로 환산 (없으면 null)
5. **날짜**: 화면에 표시된 날짜 (없으면 null)
6. **앱 종류**: 삼성헬스/Apple건강/기타 판별

## 주의사항
- 걸음수에 쉼표(,)가 있으면 제거하고 순수 숫자로 반환
- 거리 단위가 miles인 경우 km로 변환 (×1.609)
- 화면이 건강/만보기 앱이 아닌 경우 "notHealthApp": true 반환
- 숫자를 정확히 읽을 수 없는 경우 null 반환

## 응답 형식 (반드시 아래 JSON 형식으로만 응답)
{
  "steps": 8432,
  "distance_km": 5.2,
  "calories": 312,
  "active_minutes": 45,
  "date": "2025-03-22",
  "source": "samsung_health" | "apple_health" | "other",
  "notHealthApp": false,
  "confidence": "high" | "medium" | "low",
  "summary": "오늘 8,432보를 걸어 약 5.2km를 이동했습니다."
}
마크다운 코드 블록으로 출력하지 말고, 순수 JSON만 출력하세요.`;

const STEP_SCREENSHOT_PROMPT_EN = `You are an AI that extracts step-count data from health app screenshots.

Analyze screenshots from Samsung Health, Apple Health, or another health/step-count app.

Return only valid JSON with the exact same schema:
{
  "steps": 8432,
  "distance_km": 5.2,
  "calories": 312,
  "active_minutes": 45,
  "date": "2025-03-22",
  "source": "samsung_health" | "apple_health" | "other",
  "notHealthApp": false,
  "confidence": "high" | "medium" | "low",
  "summary": "Today you walked 8,432 steps and moved about 5.2 km."
}

If the image is not a health or step-count app screenshot, return "notHealthApp": true. Convert miles to kilometers. Use natural English for summary.`;

exports.analyzeStepScreenshot = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, locale: rawLocale } = request.data || {};
        const locale = normalizeLocale(rawLocale);
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF/교차 사용자 방지: 로그인 사용자의 걸음 캡처 객체만 허용
        if (!isAllowedUserMediaUrl(imageUrl, request.auth.uid, "step_screenshots")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            // URL을 직접 fetch하지 않고 현재 프로젝트의 Storage 객체를 generation에 고정해 읽는다.
            const objectPath = parseFirebaseStorageObjectPath(imageUrl);
            const bucket = admin.storage().bucket();
            const sourceFile = bucket.file(objectPath);
            const [metadata] = await sourceFile.getMetadata();
            const objectGeneration = String(metadata?.generation || "").trim();
            const contentType = String(metadata?.contentType || "").toLowerCase();
            if (!/^\d+$/.test(objectGeneration)
                || !(Number(metadata?.size || 0) > 0)
                || !contentType.startsWith("image/")) {
                throw new HttpsError("failed-precondition", "유효한 걸음수 이미지가 아닙니다.");
            }
            const generationFile = bucket.file(objectPath, { generation: objectGeneration });
            const [imgBuffer] = await generationFile.download();
            const base64Image = imgBuffer.toString("base64");

            // 이미지 SHA-256 해시 계산 (중복 감지용)
            const imageHash = crypto.createHash('sha256').update(imgBuffer).digest('hex');

            // Gemini API 호출
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await model.generateContent([
                locale === "en" ? STEP_SCREENSHOT_PROMPT_EN : STEP_SCREENSHOT_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();

            // JSON 추출 (마크다운 코드블록 제거)
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);
            const verifiedSteps = Number.parseInt(analysis?.steps, 10) || 0;
            const confidence = String(analysis?.confidence || "").trim().toLowerCase();
            if (analysis?.notHealthApp === true || verifiedSteps <= 0 || verifiedSteps > 200000) {
                throw new HttpsError("failed-precondition", "유효한 건강 앱 걸음수 화면을 확인하지 못했습니다.");
            }
            if (confidence && !["high", "medium"].includes(confidence)) {
                throw new HttpsError("failed-precondition", "걸음수 인식 신뢰도가 낮습니다. 더 선명한 화면을 올려주세요.");
            }

            const contentHash = metadata?.md5Hash
                ? `md5:${metadata.md5Hash}`
                : (metadata?.crc32c ? `crc32c:${metadata.crc32c}` : "");
            const verificationId = `${request.auth.uid}_${imageHash}`;
            await db.doc(`step_verifications/${verificationId}`).set({
                userId: request.auth.uid,
                imageHash,
                objectPath,
                objectGeneration,
                contentHash,
                steps: verifiedSteps,
                source: String(analysis?.source || "other").slice(0, 32),
                verifiedAt: FieldValue.serverTimestamp(),
            });

            return {
                success: true,
                analysis: analysis,
                imageHash: imageHash,
                verificationId,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeStepScreenshot 오류:", error);

            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 다시 시도해주세요.");
            }
            throw new HttpsError("internal", "걸음수 분석 중 오류가 발생했습니다.");
        }
    }
);

/**
 * daily_logs 문서 변경 시 포인트(coins) 자동 정산
 * Storage 증거를 서버가 확인하고 날짜·카테고리·임계치별 불변 원장으로 정산한다.
 */
async function verifyDailyRewardMedia(_url, context = {}) {
    const objectPath = String(context.objectPath || "");
    if (!objectPath) return false;
    try {
        const [metadata] = await admin.storage().bucket().file(objectPath).getMetadata();
        if (!(Number(metadata?.size || 0) > 0)) return false;
        if (!isEvidenceCreatedWithinRewardWindow(metadata?.timeCreated, context.logDate, 1)) return false;
        const objectGeneration = String(metadata?.generation || "").trim();
        if (!/^\d+$/.test(objectGeneration)) return false;
        const contentHash = metadata?.md5Hash
            ? `md5:${metadata.md5Hash}`
            : (metadata?.crc32c ? `crc32c:${metadata.crc32c}` : "");
        const contentType = String(metadata?.contentType || "").toLowerCase();
        const expectsVideo = context.evidenceType === "exercise_strength_video";
        if (expectsVideo ? !contentType.startsWith("video/") : !contentType.startsWith("image/")) {
            return false;
        }

        let verifiedImageHash = null;
        if (context.evidenceType === "step_screenshot") {
            const hash = String(context.imageHash || "").toLowerCase();
            if (!/^[a-f0-9]{64}$/.test(hash)) return false;
            const verification = await db.doc(`step_verifications/${context.userId}_${hash}`).get();
            if (!verification.exists) return false;
            const data = verification.data() || {};
            if (data.userId !== context.userId
                || data.imageHash !== hash
                || data.objectPath !== objectPath
                || String(data.objectGeneration || "") !== objectGeneration
                || Number(data.steps || 0) < 8000) {
                return false;
            }
            verifiedImageHash = hash;
        }
        return {
            valid: true,
            objectGeneration,
            contentHash,
            verifiedImageHash,
        };
    } catch (error) {
        const code = String(error?.code || "").toLowerCase();
        if (code.includes("404") || code.includes("not-found")) return false;
        throw error;
    }
}

function normalizeAwardMap(awarded = {}) {
    const dietPoints = Math.max(0, Math.min(30, Number(awarded.dietPoints || 0) || 0));
    const exercisePoints = Math.max(0, Math.min(30, Number(awarded.exercisePoints || 0) || 0));
    const mindPoints = Math.max(0, Math.min(20, Number(awarded.mindPoints || 0) || 0));
    return {
        dietPoints,
        exercisePoints,
        mindPoints,
        diet: dietPoints > 0,
        exercise: exercisePoints > 0,
        mind: mindPoints > 0,
    };
}

function sameAwardMap(left, right) {
    const a = normalizeAwardMap(left);
    const b = normalizeAwardMap(right);
    return a.dietPoints === b.dietPoints
        && a.exercisePoints === b.exercisePoints
        && a.mindPoints === b.mindPoints
        && a.diet === b.diet
        && a.exercise === b.exercise
        && a.mind === b.mind;
}

function getDailyRewardEvidenceFingerprint(log = {}) {
    return JSON.stringify({
        userId: log.userId || "",
        date: log.date || "",
        diet: log.diet || null,
        dietAnalysis: log.dietAnalysis || null,
        exercise: log.exercise || null,
        steps: log.steps || null,
        sleepAndMind: log.sleepAndMind || null,
    });
}

function getAwardMapFromLedgerUnits(units = []) {
    const totals = { dietPoints: 0, exercisePoints: 0, mindPoints: 0 };
    for (const unit of units) {
        const pointKey = unit?.category === "diet"
            ? "dietPoints"
            : (unit?.category === "exercise" ? "exercisePoints" : (unit?.category === "mind" ? "mindPoints" : ""));
        if (pointKey) totals[pointKey] += Math.max(0, Number(unit.points || 0) || 0);
    }
    return normalizeAwardMap(totals);
}

exports.awardPoints = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();

        // 삭제된 경우 무시
        if (!after) return;

        if (before?.rewardLedgerVersion === 2
            && sameAwardMap(before.awardedPoints, after.awardedPoints)
            && getDailyRewardEvidenceFingerprint(before) === getDailyRewardEvidenceFingerprint(after)) {
            return;
        }

        try {
            const logRef = event.data.after.ref;
            const liveLogSnapshot = await logRef.get();
            if (!liveLogSnapshot.exists) return;
            const liveLog = liveLogSnapshot.data() || {};
            const userId = String(liveLog.userId || "").trim();
            const logDate = String(liveLog.date || "").trim();
            if (!userId) return;

            const todayStr = getCurrentKstDateString();
            const yesterdayStr = addDaysToKstDateString(todayStr, -1);
            const isRewardEligibleDate = !!logDate && logDate >= yesterdayStr && logDate <= todayStr;
            if (!isRewardEligibleDate) {
                console.log(`awardPoints skip: ${userId} ${logDate || '(no-date)'} outside reward window`);
                return;
            }

            const calculated = await calculateServerAwardedPoints(liveLog, {
                isValidMedia: verifyDailyRewardMedia,
            });
            const sourceFingerprint = getDailyRewardEvidenceFingerprint(liveLog);
            const legacy = normalizeAwardMap(liveLog.awardedPoints || {});
            const userRef = db.doc(`users/${userId}`);
            const ledgerRoot = db.doc(`point_ledger/${userId}_${logDate}`);
            const entriesQuery = ledgerRoot.collection("entries");
            const evidenceDescriptors = new Map();
            const evidenceDescriptorByUnitKey = new Map();
            calculated.ledgerUnits.forEach((unit) => {
                if (!unit.objectPath) return;
                const evidenceId = getRewardEvidenceClaimId(userId, unit);
                if (!evidenceId) return;
                const descriptor = evidenceDescriptors.get(evidenceId) || {
                    evidenceId,
                    unit,
                    reference: db.doc(`reward_evidence_ledger/${evidenceId}`),
                };
                evidenceDescriptors.set(evidenceId, descriptor);
                evidenceDescriptorByUnitKey.set(unit.key, descriptor);
            });
            const descriptorList = [...evidenceDescriptors.values()];
            const settlement = await db.runTransaction(async (tx) => {
                const [entriesSnapshot, currentLogSnapshot, ...evidenceSnapshots] = await Promise.all([
                    tx.get(entriesQuery),
                    tx.get(logRef),
                    ...descriptorList.map((descriptor) => tx.get(descriptor.reference)),
                ]);
                if (!currentLogSnapshot.exists) {
                    return { stale: true, canonical: normalizeAwardMap({}), pointsToCredit: 0 };
                }
                const currentLog = currentLogSnapshot.data() || {};
                if (String(currentLog.userId || "").trim() !== userId
                    || String(currentLog.date || "").trim() !== logDate
                    || getDailyRewardEvidenceFingerprint(currentLog) !== sourceFingerprint) {
                    return { stale: true, canonical: normalizeAwardMap(currentLog.awardedPoints || {}), pointsToCredit: 0 };
                }

                const evidenceSnapshotById = new Map(descriptorList.map((descriptor, index) => [
                    descriptor.evidenceId,
                    evidenceSnapshots[index],
                ]));
                const seenEvidenceIds = new Set();
                const eligibleEvidenceIds = new Set();
                const eligibleUnits = calculated.ledgerUnits.filter((unit) => {
                    if (!unit.objectPath) return true;
                    const descriptor = evidenceDescriptorByUnitKey.get(unit.key);
                    if (!descriptor || seenEvidenceIds.has(descriptor.evidenceId)) return false;
                    seenEvidenceIds.add(descriptor.evidenceId);
                    const claimSnapshot = evidenceSnapshotById.get(descriptor.evidenceId);
                    if (claimSnapshot?.exists) {
                        const claim = claimSnapshot.data() || {};
                        if (claim.userId !== userId
                            || claim.sourceLogId !== event.params.logId
                            || claim.date !== logDate
                            || claim.category !== unit.category) {
                            return false;
                        }
                    }
                    eligibleEvidenceIds.add(descriptor.evidenceId);
                    return true;
                });
                const desired = getAwardMapFromLedgerUnits(eligibleUnits);
                const totals = { diet: 0, exercise: 0, mind: 0 };
                entriesSnapshot.docs.forEach((snapshot) => {
                    const data = snapshot.data() || {};
                    if (Object.prototype.hasOwnProperty.call(totals, data.category)) {
                        totals[data.category] += Math.max(0, Number(data.points || 0) || 0);
                    }
                });

                let pointsToCredit = 0;
                for (const category of ["diet", "exercise", "mind"]) {
                    const pointKey = `${category}Points`;
                    if (totals[category] <= 0 && legacy[pointKey] > 0) {
                        const legacyPoints = legacy[pointKey];
                        tx.create(entriesQuery.doc(`legacy_${category}`), {
                            userId,
                            date: logDate,
                            category,
                            points: legacyPoints,
                            threshold: legacyPoints,
                            source: "legacy_daily_record",
                            sourceLogId: event.params.logId,
                            migratedAt: FieldValue.serverTimestamp(),
                        });
                        totals[category] = legacyPoints;
                    }

                    if (desired[pointKey] > totals[category]) {
                        const incrementPoints = desired[pointKey] - totals[category];
                        tx.create(entriesQuery.doc(`earned_${category}_${desired[pointKey]}`), {
                            userId,
                            date: logDate,
                            category,
                            points: incrementPoints,
                            threshold: desired[pointKey],
                            evidenceTypes: eligibleUnits
                                .filter((unit) => unit.category === category)
                                .map((unit) => unit.evidenceType),
                            evidenceIds: eligibleUnits
                                .filter((unit) => unit.category === category)
                                .map((unit) => evidenceDescriptorByUnitKey.get(unit.key)?.evidenceId)
                                .filter(Boolean),
                            source: "daily_record",
                            sourceLogId: event.params.logId,
                            createdAt: FieldValue.serverTimestamp(),
                        });
                        totals[category] = desired[pointKey];
                        pointsToCredit += incrementPoints;
                    }
                }

                for (const evidenceId of eligibleEvidenceIds) {
                    const descriptor = evidenceDescriptors.get(evidenceId);
                    const claimSnapshot = evidenceSnapshotById.get(evidenceId);
                    if (!descriptor || claimSnapshot?.exists) continue;
                    const unit = descriptor.unit;
                    tx.create(descriptor.reference, {
                        userId,
                        sourceLogId: event.params.logId,
                        date: logDate,
                        category: unit.category,
                        evidenceType: unit.evidenceType,
                        objectPath: unit.objectPath,
                        objectGeneration: unit.objectGeneration,
                        contentHash: unit.contentHash || null,
                        verifiedImageHash: unit.verifiedImageHash || null,
                        createdAt: FieldValue.serverTimestamp(),
                    });
                }

                const canonical = normalizeAwardMap({
                    dietPoints: totals.diet,
                    exercisePoints: totals.exercise,
                    mindPoints: totals.mind,
                });
                if (!sameAwardMap(currentLog.awardedPoints, canonical) || currentLog.rewardLedgerVersion !== 2) {
                    tx.set(logRef, {
                        awardedPoints: canonical,
                        rewardLedgerVersion: 2,
                    }, { merge: true });
                }
                if (pointsToCredit > 0) {
                    tx.set(userRef, { coins: FieldValue.increment(pointsToCredit) }, { merge: true });
                }
                tx.set(ledgerRoot, {
                    userId,
                    date: logDate,
                    lastSettledAt: FieldValue.serverTimestamp(),
                    version: 2,
                }, { merge: true });
                return { stale: false, canonical, pointsToCredit };
            });

            if (settlement.stale) return;

            console.log(`awardPoints ledger: ${userId} ${logDate} +${settlement.pointsToCredit}P`);

            // 스트릭 계산 및 저장
            const canonicalTotal = settlement.canonical.dietPoints
                + settlement.canonical.exercisePoints
                + settlement.canonical.mindPoints;
            if (canonicalTotal > 0) {
                const streak = await calculateStreak(userId, logDate);
                if (Number(after.currentStreak || 0) !== streak) {
                    await event.data.after.ref.set({ currentStreak: streak }, { merge: true });
                }
                console.log(`streak: ${userId} ${logDate} → ${streak}일`);

                // 추천인 마일스톤 보상
                await checkReferralMilestone(userId, streak);

                // 스트릭 달성 시 친구 알림
                await notifyFriendsOnStreak(userId, streak, logDate, after.userName);
            }
        } catch (err) {
            console.error("awardPoints 오류:", err);
        }
    }
);

/** Private daily log -> signed-in, allowlist-only social projection. */
exports.syncGalleryPostProjection = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3", retry: true },
    async (event) => {
        const before = event.data?.before?.data() || null;
        const after = event.data?.after?.data() || null;
        if (before && after && getGalleryProjectionFingerprint(before) === getGalleryProjectionFingerprint(after)) {
            return;
        }
        const projectId = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || "").trim();
        const allowedStorageBuckets = [...new Set([
            admin.storage().bucket().name,
            projectId ? `${projectId}.firebasestorage.app` : "",
            projectId ? `${projectId}.appspot.com` : "",
        ].filter(Boolean))];
        await syncGalleryPostFromDailyLog({
            db,
            FieldValue,
            logId: event.params.logId,
            before,
            after,
            allowedStorageBuckets,
        });
    }
);

// 연속 인증 스트릭 계산 (날짜 역순 탐색)
async function calculateStreak(userId, currentDate) {
    let streak = 1;
    const d = new Date(currentDate + "T00:00:00Z");
    for (let i = 1; i <= 100; i++) {
        d.setUTCDate(d.getUTCDate() - 1);
        const prevDateStr = d.toISOString().split("T")[0];
        const snap = await db.collection("daily_logs")
            .where("userId", "==", userId)
            .where("date", "==", prevDateStr)
            .limit(1)
            .get();
        if (snap.empty) break;
        const prevData = snap.docs[0].data();
        const prevTotal = (prevData.awardedPoints?.dietPoints || 0) +
                          (prevData.awardedPoints?.exercisePoints || 0) +
                          (prevData.awardedPoints?.mindPoints || 0);
        if (prevTotal <= 0) break;
        streak++;
    }
    return streak;
}

// 스트릭 달성 시 친구들에게 알림 (3, 7, 14, 30일 마일스톤)
async function notifyFriendsOnStreak(userId, streak, logDate, userName) {
    const MILESTONES = [3, 7, 14, 30];
    if (!MILESTONES.includes(streak)) return;

    try {
        // 중복 알림 방지: daily_log에 이미 보낸 milestone 기록
        const logRef = db.doc(`daily_logs/${userId}_${logDate}`);
        const logSnap = await logRef.get();
        const notifiedDays = logSnap.exists() ? (logSnap.data().streakNotifiedDays || []) : [];
        if (notifiedDays.includes(streak)) return; // 이미 발송
        await logRef.set({ streakNotifiedDays: FieldValue.arrayUnion(streak) }, { merge: true });

        // 친구 목록 조회
        const userSnap = await db.doc(`users/${userId}`).get();
        if (!userSnap.exists) return;
        const friends = await getActiveFriendIds(userId);
        if (friends.length === 0) return;

        const displayName = userName || userSnap.data().customDisplayName || userSnap.data().displayName || '친구';
        const batch = db.batch();
        friends.forEach(friendId => {
            const notifRef = db.collection('notifications').doc();
            batch.set(notifRef, {
                postOwnerId: friendId,
                type: 'friend_streak',
                fromUserId: userId,
                fromUserName: displayName,
                streakDays: streak,
                createdAt: FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        console.log(`notifyFriendsOnStreak: ${displayName} ${streak}일 달성 → ${friends.length}명 알림`);
    } catch (e) {
        console.warn('notifyFriendsOnStreak 오류:', e.message);
    }
}

// 추천인 마일스톤 보상 (3일: 추천인 +500P, 7일: 신규 유저 +300P)
async function checkReferralMilestone(userId, streak) {
    if (streak !== 3 && streak !== 7) return;
    const participantRef = db.doc(`users/${userId}`);
    const result = await db.runTransaction(async (tx) => {
        const participantSnap = await tx.get(participantRef);
        if (!participantSnap.exists) return null;
        const participant = participantSnap.data() || {};
        const referrerUid = String(participant.referredBy || "").trim();
        if (!referrerUid) return null;

        const recipientUid = streak === 3 ? referrerUid : userId;
        const points = streak === 3 ? 500 : 300;
        const flag = streak === 3 ? "referralDay3BonusGiven" : "referralDay7BonusGiven";
        const ledgerRoot = db.doc(`point_ledger/${recipientUid}_bonuses`);
        const ledgerEntry = ledgerRoot.collection("entries").doc(`referral_day${streak}_${userId}`);
        const recipientRef = db.doc(`users/${recipientUid}`);
        const ledgerSnap = await tx.get(ledgerEntry);
        const recipientSnap = recipientUid === userId
            ? participantSnap
            : await tx.get(recipientRef);
        if (!recipientSnap.exists) return null;

        if (ledgerSnap.exists || participant[flag] === true) {
            if (!ledgerSnap.exists) {
                tx.create(ledgerEntry, {
                    userId: recipientUid,
                    category: `referral_day${streak}`,
                    points,
                    sourceUserId: userId,
                    source: "legacy_referral_milestone",
                    credited: false,
                    migratedAt: FieldValue.serverTimestamp(),
                });
                tx.set(ledgerRoot, {
                    userId: recipientUid,
                    type: "bonus",
                    version: 2,
                    lastSettledAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            return { credited: false, recipientUid, points };
        }

        tx.create(ledgerEntry, {
            userId: recipientUid,
            category: `referral_day${streak}`,
            points,
            sourceUserId: userId,
            source: "referral_milestone",
            credited: true,
            createdAt: FieldValue.serverTimestamp(),
        });
        tx.set(ledgerRoot, {
            userId: recipientUid,
            type: "bonus",
            version: 2,
            lastSettledAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (recipientUid === userId) {
            tx.set(participantRef, {
                coins: FieldValue.increment(points),
                [flag]: true,
            }, { merge: true });
        } else {
            tx.set(recipientRef, { coins: FieldValue.increment(points) }, { merge: true });
            tx.set(participantRef, { [flag]: true }, { merge: true });
        }
        return { credited: true, recipientUid, points };
    });

    if (result?.credited) {
        console.log(`referral ${streak}-day: ${userId} → ${result.recipientUid} +${result.points}P`);
    }
}

const MILESTONE_DEFINITIONS = Object.freeze([
    ["streak1", "streak", 1, 5], ["streak3", "streak", 3, 10],
    ["streak7", "streak", 7, 20], ["streak14", "streak", 14, 30],
    ["streak30", "streak", 30, 50], ["streak60", "streak", 60, 100],
    ["diet1", "diet", 1, 5], ["diet3", "diet", 3, 10],
    ["diet7", "diet", 7, 15], ["diet14", "diet", 14, 25], ["diet30", "diet", 30, 50],
    ["exercise1", "exercise", 1, 5], ["exercise3", "exercise", 3, 10],
    ["exercise7", "exercise", 7, 15], ["exercise14", "exercise", 14, 25], ["exercise30", "exercise", 30, 50],
    ["mind1", "mind", 1, 5], ["mind3", "mind", 3, 10],
    ["mind7", "mind", 7, 15], ["mind14", "mind", 14, 25], ["mind30", "mind", 30, 50],
].map(([id, category, target, reward]) => Object.freeze({ id, category, target, reward })));
const MILESTONE_DEFINITION_BY_ID = new Map(MILESTONE_DEFINITIONS.map((definition) => [definition.id, definition]));

function getAwardTotal(awarded = {}) {
    const normalized = normalizeAwardMap(awarded);
    return normalized.dietPoints + normalized.exercisePoints + normalized.mindPoints;
}

function calculateCurrentActivityStreak(activeDates, today = getCurrentKstDateString()) {
    const dates = activeDates instanceof Set ? activeDates : new Set(activeDates || []);
    let cursor = dates.has(today) ? today : addDaysToKstDateString(today, -1);
    if (!dates.has(cursor)) return 0;
    let streak = 0;
    while (dates.has(cursor) && streak < 400) {
        streak += 1;
        cursor = addDaysToKstDateString(cursor, -1);
    }
    return streak;
}

async function getAuthoritativeMilestoneStats(userId) {
    const snapshot = await db.collection("daily_logs")
        .where("userId", "==", userId)
        .orderBy("date", "desc")
        .limit(400)
        .get();
    const activeDates = new Set();
    const categoryDates = { diet: new Set(), exercise: new Set(), mind: new Set() };
    snapshot.docs.forEach((docSnapshot) => {
        const data = docSnapshot.data() || {};
        const date = String(data.date || "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const awarded = normalizeAwardMap(data.awardedPoints || {});
        if (getAwardTotal(awarded) > 0) activeDates.add(date);
        if (awarded.dietPoints > 0) categoryDates.diet.add(date);
        if (awarded.exercisePoints > 0) categoryDates.exercise.add(date);
        if (awarded.mindPoints > 0) categoryDates.mind.add(date);
    });
    return {
        streak: calculateCurrentActivityStreak(activeDates),
        diet: categoryDates.diet.size,
        exercise: categoryDates.exercise.size,
        mind: categoryDates.mind.size,
    };
}

async function refreshMilestoneStateForUser(userId) {
    const stats = await getAuthoritativeMilestoneStats(userId);
    const userRef = db.doc(`users/${userId}`);
    return db.runTransaction(async (tx) => {
        const userSnapshot = await tx.get(userRef);
        if (!userSnapshot.exists) throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
        const existing = userSnapshot.data()?.milestones || {};
        const milestones = {};
        const newMilestones = [];
        const today = getCurrentKstDateString();
        MILESTONE_DEFINITIONS.forEach((definition) => {
            if (Number(stats[definition.category] || 0) < definition.target) return;
            const previous = existing[definition.id] || {};
            milestones[definition.id] = {
                achieved: true,
                date: String(previous.date || today),
                bonusClaimed: previous.bonusClaimed === true,
                ...(previous.bonusClaimed === true ? { bonusAmount: definition.reward } : {}),
            };
            if (!previous.achieved) newMilestones.push(definition.id);
        });
        tx.set(userRef, {
            milestones,
            currentStreak: stats.streak,
        }, { merge: true });
        return { stats, milestones, newMilestones };
    });
}

exports.refreshMilestones = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        return refreshMilestoneStateForUser(uid);
    }
);

exports.claimMilestoneBonus = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const milestoneId = String(request.data?.milestoneId || "").trim();
        const definition = MILESTONE_DEFINITION_BY_ID.get(milestoneId);
        if (!definition) throw new HttpsError("invalid-argument", "유효하지 않은 마일스톤입니다.");

        const refreshed = await refreshMilestoneStateForUser(uid);
        if (Number(refreshed.stats[definition.category] || 0) < definition.target) {
            throw new HttpsError("failed-precondition", "아직 달성하지 못한 마일스톤입니다.");
        }

        const userRef = db.doc(`users/${uid}`);
        const ledgerRoot = db.doc(`point_ledger/${uid}_milestones`);
        const ledgerEntry = ledgerRoot.collection("entries").doc(`milestone_${milestoneId}`);
        let result = null;
        await db.runTransaction(async (tx) => {
            const [userSnapshot, ledgerSnapshot] = await Promise.all([
                tx.get(userRef),
                tx.get(ledgerEntry),
            ]);
            const userData = userSnapshot.data() || {};
            const milestones = { ...(userData.milestones || {}) };
            if (ledgerSnapshot.exists || milestones[milestoneId]?.bonusClaimed === true) {
                throw new HttpsError("already-exists", "이미 보너스를 수령했습니다.");
            }
            milestones[milestoneId] = {
                achieved: true,
                date: String(milestones[milestoneId]?.date || getCurrentKstDateString()),
                bonusClaimed: true,
                bonusAmount: definition.reward,
            };
            tx.create(ledgerEntry, {
                userId: uid,
                category: "milestone",
                milestoneId,
                points: definition.reward,
                source: "milestone_bonus",
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.set(ledgerRoot, {
                userId: uid,
                type: "milestone",
                lastSettledAt: FieldValue.serverTimestamp(),
                version: 2,
            }, { merge: true });
            tx.set(userRef, {
                milestones,
                coins: FieldValue.increment(definition.reward),
            }, { merge: true });
            result = {
                milestones,
                balance: Math.max(0, Number(userData.coins || 0)) + definition.reward,
            };
        });
        return {
            success: true,
            milestoneId,
            reward: definition.reward,
            milestones: result?.milestones || refreshed.milestones,
            balance: result?.balance ?? null,
        };
    }
);

/**
 * 갤러리 리액션 토글 (서버 authoritative) + 포인트 지급
 *
 * 이전에는 클라이언트가 daily_logs.reactions 배열에 직접 자기 UID를 arrayUnion하고
 * onDocumentWritten 트리거가 새 UID마다 게시물 주인에게 +1P를 지급했다. 그러나 firestore
 * 룰이 아무 로그인 사용자에게 reactions 쓰기를 허용했고 daily_logs는 공개 읽기라 UID를
 * 수집할 수 있어서, 자기 게시물에 타인 UID 수백 개를 위조 삽입해 코인을 무한 발행할 수
 * 있었다(C1과 동종 경제 취약점). 이제 리액션 쓰기를 이 callable로만 제한하고(룰에서 클라
 * 직접 쓰기 차단), 서버가 request.auth.uid(위조 불가)로만 토글·정산한다.
 *
 * 정책 유지: 리액션 누른 사람 +1P, 게시물 주인 +1P, 본인 게시물 제외,
 *           (post, reactor)당 최초 1회만 지급, 리액션 취소 시 회수 없음.
 */
exports.toggleReactionOnPost = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const logId = typeof request.data?.logId === "string" ? request.data.logId.trim() : "";
        const reactionType = typeof request.data?.reactionType === "string" ? request.data.reactionType.trim() : "";
        if (!logId) throw new HttpsError("invalid-argument", "logId가 필요합니다.");
        if (!["heart", "fire", "clap"].includes(reactionType)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 리액션 유형입니다.");
        }

        const logRef = db.doc(`gallery_posts/${logId}`);
        const reactionLedgerRef = db.doc(`reaction_point_ledger/${logId}_${uid}`);
        return await db.runTransaction(async (tx) => {
            const [snap, reactionLedgerSnap] = await Promise.all([
                tx.get(logRef),
                tx.get(reactionLedgerRef),
            ]);
            if (!snap.exists) throw new HttpsError("not-found", "게시물을 찾을 수 없습니다.");

            const decision = computeReactionToggle(snap.data() || {}, uid, reactionType);

            const update = { reactions: decision.reactions };
            if (decision.award && !reactionLedgerSnap.exists) {
                tx.set(db.doc(`users/${uid}`), { coins: FieldValue.increment(1) }, { merge: true });
                tx.set(db.doc(`users/${decision.postOwnerId}`), { coins: FieldValue.increment(1) }, { merge: true });
                tx.create(reactionLedgerRef, {
                    postId: logId,
                    reactorUserId: uid,
                    postOwnerId: decision.postOwnerId,
                    pointsPerUser: 1,
                    date: getCurrentKstDateString(),
                    createdAt: FieldValue.serverTimestamp(),
                });
                console.log(`reactionPoints: ${uid} → ${decision.postOwnerId} +1P each (first reaction on post)`);
            }
            tx.set(logRef, update, { merge: true });

            return { active: decision.active, count: decision.count };
        });
    }
);

exports.addGalleryComment = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const postId = String(request.data?.postId || "").trim();
        const text = String(request.data?.text || "")
            .replace(/[\u0000-\u001f\u007f]/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);
        if (!postId || !text) throw new HttpsError("invalid-argument", "댓글 내용이 필요합니다.");

        const userSnapshot = await db.doc(`users/${uid}`).get();
        const userData = userSnapshot.data() || {};
        const comment = {
            id: crypto.randomUUID(),
            userId: uid,
            userName: String(userData.customDisplayName || userData.displayName || "회원").slice(0, 80),
            text,
            timestamp: Date.now(),
        };
        const postRef = db.doc(`gallery_posts/${postId}`);
        await db.runTransaction(async (tx) => {
            const postSnapshot = await tx.get(postRef);
            if (!postSnapshot.exists) {
                throw new HttpsError("not-found", "게시물을 찾을 수 없습니다.");
            }
            tx.update(postRef, {
                comments: FieldValue.arrayUnion(comment),
            });
        });
        return { comment };
    }
);

exports.deleteGalleryComment = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const postId = String(request.data?.postId || "").trim();
        const commentId = String(request.data?.commentId || "").trim();
        const commentIndex = Number.parseInt(request.data?.commentIndex, 10);
        if (!postId) throw new HttpsError("invalid-argument", "postId가 필요합니다.");

        const postRef = db.doc(`gallery_posts/${postId}`);
        return db.runTransaction(async (tx) => {
            const snapshot = await tx.get(postRef);
            if (!snapshot.exists) throw new HttpsError("not-found", "게시물을 찾을 수 없습니다.");
            const comments = Array.isArray(snapshot.data()?.comments) ? snapshot.data().comments : [];
            const targetIndex = commentId
                ? comments.findIndex((comment) => comment?.id === commentId)
                : commentIndex;
            const target = comments[targetIndex];
            if (!target || target.userId !== uid) {
                throw new HttpsError("permission-denied", "본인 댓글만 삭제할 수 있습니다.");
            }
            const nextComments = comments.filter((_, index) => index !== targetIndex);
            tx.set(postRef, { comments: nextComments }, { merge: true });
            return { success: true, comments: nextComments };
        });
    }
);

/**
 * 친구 초대 코드 처리 (신규 가입자 +200P, referredBy 저장)
 * 클라이언트가 ?ref=CODE로 접속 후 가입 시 호출
 */
exports.processReferralSignup = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const { code } = request.data;
        if (!code || typeof code !== "string" || code.length !== 6) {
            throw new HttpsError("invalid-argument", "유효하지 않은 초대 코드");
        }
        const upperCode = code.toUpperCase();

        // 코드 → 추천인 UID 조회 (users 컬렉션에서 referralCode 필드 검색)
        const codeQuery = await db.collection("users")
            .where("referralCode", "==", upperCode)
            .limit(1)
            .get();
        if (codeQuery.empty) throw new HttpsError("not-found", "존재하지 않는 초대 코드");
        const referrerUid = codeQuery.docs[0].id;

        // 자기 자신 초대 방지
        if (referrerUid === uid) throw new HttpsError("invalid-argument", "본인 초대 코드 사용 불가");

        const userRef = db.doc(`users/${uid}`);
        const referrerRef = db.doc(`users/${referrerUid}`);
        const friendshipRef = db.doc(`friendships/${buildFriendshipId(uid, referrerUid)}`);
        const signupLedgerRoot = db.doc(`point_ledger/${uid}_bonuses`);
        const signupLedgerEntry = signupLedgerRoot.collection("entries").doc("referral_signup");

        const outcome = await db.runTransaction(async (tx) => {
            const [userSnap, referrerSnap, friendshipSnap, signupLedgerSnap] = await Promise.all([
                tx.get(userRef),
                tx.get(referrerRef),
                tx.get(friendshipRef),
                tx.get(signupLedgerEntry),
            ]);

            if (!userSnap.exists) {
                throw new HttpsError("not-found", "가입 사용자 정보를 찾을 수 없습니다.");
            }
            if (!referrerSnap.exists) {
                throw new HttpsError("not-found", "초대한 사용자를 찾을 수 없습니다.");
            }
            if (userSnap.data()?.referredBy || signupLedgerSnap.exists) {
                throw new HttpsError("already-exists", "이미 초대 코드를 사용했습니다");
            }

            const userData = userSnap.data() || {};
            const referrerData = referrerSnap.data() || {};
            const inviteeName = getUserLabel(userData, request.auth?.token?.name || "회원");
            const referrerName = getUserLabel(referrerData, "친구");
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : null;
            const existingRequestedAt = friendshipData?.requestedAt || FieldValue.serverTimestamp();

            tx.set(userRef, {
                referredBy: referrerUid,
                coins: FieldValue.increment(200),
            }, { merge: true });
            tx.create(signupLedgerEntry, {
                userId: uid,
                category: "referral_signup",
                points: 200,
                referrerUserId: referrerUid,
                source: "referral_signup",
                credited: true,
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.set(signupLedgerRoot, {
                userId: uid,
                type: "bonus",
                version: 2,
                lastSettledAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            const { friendshipId } = upsertActiveFriendship(tx, {
                uidA: referrerUid,
                uidB: uid,
                nameA: referrerName,
                nameB: inviteeName,
                source: "invite_link_signup",
                requesterUid: friendshipData?.requesterUid || referrerUid,
                requestedAt: existingRequestedAt,
                inviterUid: referrerUid,
                inviteeUid: uid,
            });

            if (friendshipData?.status !== "active") {
                createFriendConnectedNotifications(tx, {
                    uidA: referrerUid,
                    uidB: uid,
                    nameA: referrerName,
                    nameB: inviteeName,
                    friendshipId,
                });
            }

            return {
                success: true,
                bonus: 200,
                inviterUid: referrerUid,
                inviterName: referrerName,
                friendshipId,
                friendshipStatus: friendshipData?.status === "active" ? "already_active" : "connected",
            };
        });

        if (outcome.friendshipStatus === "connected") {
            await sendPushToUsers([referrerUid], buildFriendConnectedPushPayload({
                friendName: outcome.inviterName,
                friendshipId: outcome.friendshipId
            }));
        }

        console.log(`referral signup: ${uid} ← ${referrerUid} (code: ${upperCode}) +200P +friendship`);
        return outcome;
    }
);

async function settleWelcomeBonus(uid) {
    const userRef = db.doc(`users/${uid}`);
    const ledgerRoot = db.doc(`point_ledger/${uid}_bonuses`);
    const ledgerEntry = ledgerRoot.collection("entries").doc("welcome_bonus");
    const result = await db.runTransaction(async (tx) => {
            const [userSnap, ledgerSnap] = await Promise.all([
                tx.get(userRef),
                tx.get(ledgerEntry),
            ]);
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }

            const userData = userSnap.data() || {};
            if (ledgerSnap.exists || userData.welcomeBonusGiven === true) {
                // 구 버전에서 이미 지급된 회원도 원장에 한 번만 이관하되 재지급하지 않는다.
                if (!ledgerSnap.exists) {
                    tx.create(ledgerEntry, {
                        userId: uid,
                        category: "welcome",
                        points: 200,
                        source: "legacy_welcome_bonus",
                        credited: false,
                        migratedAt: FieldValue.serverTimestamp(),
                    });
                    tx.set(ledgerRoot, {
                        userId: uid,
                        type: "bonus",
                        version: 2,
                        lastSettledAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                return { success: false, reason: "already_given" };
            }

            tx.create(ledgerEntry, {
                userId: uid,
                category: "welcome",
                points: 200,
                source: "welcome_bonus",
                credited: true,
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.set(ledgerRoot, {
                userId: uid,
                type: "bonus",
                version: 2,
                lastSettledAt: FieldValue.serverTimestamp(),
            }, { merge: true });
            tx.set(userRef, {
                welcomeBonusGiven: true,
                coins: FieldValue.increment(200)
            }, { merge: true });
            return { success: true, bonus: 200 };
    });

    if (result.success) console.log(`welcome bonus +200P: ${uid}`);
    return result;
}

/**
 * 가입 축하 보너스 +200P (온보딩 완료 시 1회만 지급)
 */
exports.awardWelcomeBonus = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
        return settleWelcomeBonus(uid);
    }
);

/**
 * 기존 회원 전체 가입 축하금 소급 지급 (관리자 전용)
 */
exports.ensureAdminAccess = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const email = normalizeEmail(request.auth?.token?.email);
        const uidRef = db.doc(`admins/${uid}`);
        const uidSnap = await uidRef.get();
        if (uidSnap.exists) {
            if (email && uidSnap.data()?.email !== email) {
                await upsertAdminDoc(uid, email);
            }
            return { success: true, source: "uid" };
        }

        if (email) {
            const legacyEmailRef = db.doc(`admins/${email}`);
            const legacyEmailSnap = await legacyEmailRef.get();
            if (legacyEmailSnap.exists) {
                const legacyData = legacyEmailSnap.data() || {};
                await upsertAdminDoc(uid, email, {
                    ...legacyData,
                    legacySource: email,
                    migratedFromLegacyEmailDoc: true
                });
                return { success: true, source: "legacy-email-doc" };
            }
        }

        if (isBootstrapAdminEmail(email)) {
            await upsertAdminDoc(uid, email, {
                grantedByEmailWhitelist: true,
                grantedAt: new Date()
            });
            return { success: true, source: "email-whitelist" };
        }

        throw new HttpsError("permission-denied", "관리자 권한 필요");
    }
);

/**
 * 해빛코치 연결 코드 생성 (10분 유효)
 */
exports.generateChatbotLinkCode = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        let code = "";
        let collision = true;
        for (let attempt = 0; attempt < 5 && collision; attempt += 1) {
            code = generateAlphaNumericCode(CHATBOT_LINK_CODE_LENGTH);
            const existing = await db.collection("users")
                .where("chatbotLinkCode", "==", code)
                .limit(1)
                .get();
            collision = !existing.empty;
        }

        if (collision || !code) {
            throw new HttpsError("aborted", "연결 코드 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
        }

        const expiresAt = new Date(Date.now() + CHATBOT_LINK_CODE_TTL_MINUTES * 60 * 1000);
        await userRef.set({
            chatbotLinkCode: code,
            chatbotLinkCodeExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            chatbotLinkCodeGeneratedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            code,
            expiresAt: expiresAt.toISOString(),
            ttlMinutes: CHATBOT_LINK_CODE_TTL_MINUTES
        };
    }
);

exports.prepareShareMediaAssets = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const rawItems = Array.isArray(request.data?.items) ? request.data.items.slice(0, 4) : [];
        if (!rawItems.length) return { items: [] };

        const normalizedItems = rawItems.map((item, index) => normalizeShareMediaRequestItem(item, index));
        const items = await Promise.all(normalizedItems.map(async (item) => {
            const src = await loadShareMediaDataUrl(item.candidateUrls);
            return {
                category: item.category,
                type: item.type,
                src,
                prepared: !!src,
            };
        }));

        return { items };
    }
);

exports.ensureReferralCode = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const userRef = db.doc(`users/${uid}`);
        const referralCode = await ensureStableReferralCode(userRef);
        return {
            success: true,
            referralCode,
            link: `${APP_BASE_URL}?ref=${referralCode}`
        };
    }
);

exports.acceptInviteLinkFriendship = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const referralCode = String(request.data?.referralCode || "").trim().toUpperCase();
        const previewOnly = request.data?.previewOnly === true;
        if (!referralCode || referralCode.length !== 6) {
            throw new HttpsError("invalid-argument", "유효하지 않은 초대 코드");
        }

        const inviterQuery = await db.collection("users")
            .where("referralCode", "==", referralCode)
            .limit(1)
            .get();

        if (inviterQuery.empty) {
            throw new HttpsError("not-found", "존재하지 않는 초대 링크입니다.");
        }

        const inviterUid = inviterQuery.docs[0].id;
        const inviterRef = db.doc(`users/${inviterUid}`);
        const userRef = db.doc(`users/${uid}`);
        const friendshipRef = db.doc(`friendships/${buildFriendshipId(uid, inviterUid)}`);

        if (inviterUid === uid) {
            return { success: true, status: "self" };
        }

        if (previewOnly) {
            const [userSnap, inviterSnap, friendshipSnap] = await Promise.all([
                userRef.get(),
                inviterRef.get(),
                friendshipRef.get(),
            ]);

            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }
            if (!inviterSnap.exists) {
                throw new HttpsError("not-found", "초대한 사용자를 찾을 수 없습니다.");
            }

            const inviterData = inviterSnap.data() || {};
            const inviterName = getUserLabel(inviterData, "친구");
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : null;

            if (friendshipData?.status === "active") {
                return {
                    success: true,
                    status: "already_active",
                    inviterUid,
                    inviterName,
                };
            }

            return {
                success: true,
                status: friendshipData?.status === "pending" && !isPendingFriendshipExpired(friendshipData)
                    ? "pending_to_active"
                    : "ready_to_connect",
                inviterUid,
                inviterName,
            };
        }

        const outcome = await db.runTransaction(async (tx) => {
            const [userSnap, inviterSnap, friendshipSnap] = await Promise.all([
                tx.get(userRef),
                tx.get(inviterRef),
                tx.get(friendshipRef),
            ]);

            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자 정보를 찾을 수 없습니다.");
            }
            if (!inviterSnap.exists) {
                throw new HttpsError("not-found", "초대한 사용자를 찾을 수 없습니다.");
            }

            const userData = userSnap.data() || {};
            const inviterData = inviterSnap.data() || {};
            const userName = getUserLabel(userData, request.auth?.token?.name || "회원");
            const inviterName = getUserLabel(inviterData, "친구");
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : null;

            if (friendshipData?.status === "active") {
                applyFriendCacheUpdate(tx, inviterUid, uid, true);
                return {
                    success: true,
                    status: "already_active",
                    inviterUid,
                    inviterName,
                };
            }

            const requestedAt = friendshipData?.requestedAt || FieldValue.serverTimestamp();
            const { friendshipId } = upsertActiveFriendship(tx, {
                uidA: inviterUid,
                uidB: uid,
                nameA: inviterName,
                nameB: userName,
                source: "invite_link_existing",
                requesterUid: friendshipData?.requesterUid || inviterUid,
                requestedAt,
                inviterUid,
                inviteeUid: uid,
            });

            createFriendConnectedNotifications(tx, {
                uidA: inviterUid,
                uidB: uid,
                nameA: inviterName,
                nameB: userName,
                friendshipId,
            });

            return {
                success: true,
                status: friendshipData?.status === "pending" && !isPendingFriendshipExpired(friendshipData)
                    ? "pending_promoted"
                    : "connected",
                inviterUid,
                inviterName,
                friendshipId,
            };
        });

        if (outcome.status === "connected" || outcome.status === "pending_promoted") {
            await sendPushToUsers([inviterUid], buildFriendConnectedPushPayload({
                friendName: outcome.inviterName,
                friendshipId: outcome.friendshipId
            }));
        }

        return outcome;
    }
);

/**
 * 앱에서 친구 요청 생성
 */
exports.getInviteLeaderboard = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        await assertAdminRequest(request);

        const [usersSnap, friendshipsSnap] = await Promise.all([
            db.collection("users").get(),
            db.collection("friendships").where("status", "==", "active").get(),
        ]);

        return {
            rows: buildInviteLeaderboard({
                users: usersSnap.docs,
                friendships: friendshipsSnap.docs,
            }).slice(0, 10),
            generatedAt: new Date().toISOString(),
        };
    }
);

exports.requestFriend = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const rawTargetUid = typeof request.data?.targetUid === "string" ? request.data.targetUid.trim() : "";
        const rawFriendCode = typeof request.data?.friendCode === "string" ? request.data.friendCode.trim().toUpperCase() : "";

        let targetUid = rawTargetUid;
        if (!targetUid && rawFriendCode) {
            const targetQuery = await db.collection("users")
                .where("referralCode", "==", rawFriendCode)
                .limit(1)
                .get();
            if (targetQuery.empty) {
                throw new HttpsError("not-found", "해당 친구 코드를 가진 사용자를 찾지 못했습니다.");
            }
            targetUid = targetQuery.docs[0].id;
        }

        if (!targetUid) {
            throw new HttpsError("invalid-argument", "친구 대상 정보가 필요합니다.");
        }
        if (targetUid === uid) {
            throw new HttpsError("invalid-argument", "자기 자신에게는 친구 요청을 보낼 수 없습니다.");
        }

        const friendshipId = buildFriendshipId(uid, targetUid);
        const friendshipRef = db.doc(`friendships/${friendshipId}`);
        const requesterRef = db.doc(`users/${uid}`);
        const targetRef = db.doc(`users/${targetUid}`);
        const notificationRef = db.collection("notifications").doc();

        const outcome = await db.runTransaction(async (tx) => {
            const [requesterSnap, targetSnap, friendshipSnap] = await Promise.all([
                tx.get(requesterRef),
                tx.get(targetRef),
                tx.get(friendshipRef)
            ]);

            if (!requesterSnap.exists) {
                throw new HttpsError("not-found", "요청자 정보를 찾을 수 없습니다.");
            }
            if (!targetSnap.exists) {
                throw new HttpsError("not-found", "친구 요청 대상을 찾을 수 없습니다.");
            }

            const requesterData = requesterSnap.data() || {};
            const targetData = targetSnap.data() || {};
            const requesterName = getUserLabel(requesterData, request.auth?.token?.name || "회원");
            const targetName = getUserLabel(targetData, "친구");
            const friendshipData = friendshipSnap.exists ? (friendshipSnap.data() || {}) : null;

            if (friendshipData?.status === "active") {
                applyFriendCacheUpdate(tx, uid, targetUid, true);
                return { status: "already_friends", friendshipId, targetUid, targetName };
            }

            if (friendshipData?.status === "pending" && !isPendingFriendshipExpired(friendshipData)) {
                if (friendshipData.pendingForUid === uid) {
                    return { status: "incoming_pending", friendshipId, targetUid, targetName };
                }
                if (friendshipData.requesterUid === uid) {
                    return { status: "pending_exists", friendshipId, targetUid, targetName };
                }
                return { status: "pending_exists", friendshipId, targetUid, targetName };
            }

            if (isPendingFriendshipExpired(friendshipData)) {
                tx.set(friendshipRef, {
                    status: "expired",
                    updatedAt: FieldValue.serverTimestamp(),
                    respondedAt: FieldValue.serverTimestamp()
                }, { merge: true });
            }

            const expiresAt = new Date(Date.now() + FRIEND_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000);
            const requestedAt = FieldValue.serverTimestamp();

            tx.set(friendshipRef, {
                users: buildFriendshipUsers(uid, targetUid),
                userNames: {
                    [uid]: requesterName,
                    [targetUid]: targetName
                },
                status: "pending",
                requesterUid: uid,
                requesterName,
                pendingForUid: targetUid,
                requestedAt,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
                respondedAt: null,
                acceptedAt: null,
                source: "app",
                updatedAt: requestedAt
            }, { merge: true });

            tx.set(notificationRef, {
                postOwnerId: targetUid,
                type: "friend_request",
                fromUserId: uid,
                fromUserName: requesterName,
                friendshipId,
                createdAt: requestedAt,
                expiresAt: admin.firestore.Timestamp.fromDate(expiresAt)
            });

            return { status: "pending_created", friendshipId, targetUid, targetName, requesterName };
        });

        if (outcome.status === "pending_created") {
            await sendPushToUsers([outcome.targetUid], buildFriendRequestPushPayload({
                requesterName: outcome.requesterName,
                friendshipId: outcome.friendshipId
            }));
        }

        return outcome;
    }
);

/**
 * 친구 요청 수락/거절
 */
exports.respondFriendRequest = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const friendshipId = typeof request.data?.friendshipId === "string" ? request.data.friendshipId.trim() : "";
        const accept = request.data?.accept;
        if (!friendshipId) {
            throw new HttpsError("invalid-argument", "friendshipId가 필요합니다.");
        }
        if (typeof accept !== "boolean") {
            throw new HttpsError("invalid-argument", "accept 값이 필요합니다.");
        }

        const friendshipRef = db.doc(`friendships/${friendshipId}`);
        const outcome = await db.runTransaction(async (tx) => {
            const friendshipSnap = await tx.get(friendshipRef);
            if (!friendshipSnap.exists) {
                throw new HttpsError("not-found", "친구 요청을 찾을 수 없습니다.");
            }

            const friendshipData = friendshipSnap.data() || {};
            if (!Array.isArray(friendshipData.users) || !friendshipData.users.includes(uid)) {
                throw new HttpsError("permission-denied", "이 친구 요청에 응답할 권한이 없습니다.");
            }
            if (friendshipData.status === "active") {
                return { result: "already_active", friendshipId };
            }
            if (friendshipData.status !== "pending") {
                throw new HttpsError("failed-precondition", "이미 처리된 친구 요청입니다.");
            }
            if (friendshipData.pendingForUid !== uid) {
                throw new HttpsError("permission-denied", "수락 또는 거절은 요청을 받은 사용자만 할 수 있습니다.");
            }
            if (isPendingFriendshipExpired(friendshipData)) {
                tx.set(friendshipRef, {
                    status: "expired",
                    updatedAt: FieldValue.serverTimestamp(),
                    respondedAt: FieldValue.serverTimestamp()
                }, { merge: true });
                throw new HttpsError("deadline-exceeded", "친구 요청이 만료되었습니다.");
            }

            const requesterUid = friendshipData.requesterUid;
            const requesterRef = db.doc(`users/${requesterUid}`);
            const targetRef = db.doc(`users/${uid}`);
            const [requesterSnap, targetSnap] = await Promise.all([
                tx.get(requesterRef),
                tx.get(targetRef)
            ]);

            if (!requesterSnap.exists || !targetSnap.exists) {
                throw new HttpsError("not-found", "친구 요청 사용자 정보를 찾을 수 없습니다.");
            }

            const requesterData = requesterSnap.data() || {};
            const targetData = targetSnap.data() || {};
            const requesterName = getUserLabel(requesterData, friendshipData.requesterName || "친구");
            const targetName = getUserLabel(targetData, request.auth?.token?.name || "친구");
            const now = FieldValue.serverTimestamp();

            if (!accept) {
                tx.set(friendshipRef, {
                    users: buildFriendshipUsers(requesterUid, uid),
                    userNames: {
                        [requesterUid]: requesterName,
                        [uid]: targetName
                    },
                    status: "declined",
                    respondedAt: now,
                    updatedAt: now
                }, { merge: true });
                applyFriendCacheUpdate(tx, requesterUid, uid, false);

                tx.set(db.collection("notifications").doc(), {
                    postOwnerId: requesterUid,
                    type: "friend_declined",
                    fromUserId: uid,
                    fromUserName: targetName,
                    friendshipId,
                    createdAt: now
                });

                return {
                    result: "declined",
                    friendshipId,
                    friendName: requesterName,
                    requesterUid,
                    responderName: targetName
                };
            }

            tx.set(friendshipRef, {
                users: buildFriendshipUsers(requesterUid, uid),
                userNames: {
                    [requesterUid]: requesterName,
                    [uid]: targetName
                },
                status: "active",
                pendingForUid: null,
                acceptedAt: now,
                respondedAt: now,
                updatedAt: now
            }, { merge: true });
            applyFriendCacheUpdate(tx, requesterUid, uid, true);

            tx.set(db.collection("notifications").doc(), {
                postOwnerId: requesterUid,
                type: "friend_connected",
                fromUserId: uid,
                fromUserName: targetName,
                friendshipId,
                createdAt: now
            });
            tx.set(db.collection("notifications").doc(), {
                postOwnerId: uid,
                type: "friend_connected",
                fromUserId: requesterUid,
                fromUserName: requesterName,
                friendshipId,
                createdAt: now
            });

            return {
                result: "accepted",
                friendshipId,
                friendName: requesterName,
                requesterUid,
                responderName: targetName
            };
        });

        if (outcome.result === "accepted" && outcome.requesterUid) {
            await sendPushToUsers([outcome.requesterUid], buildFriendConnectedPushPayload({
                friendName: outcome.responderName,
                friendshipId: outcome.friendshipId
            }));
        } else if (outcome.result === "declined" && outcome.requesterUid) {
            await sendPushToUsers([outcome.requesterUid], buildFriendDeclinedPushPayload({
                friendName: outcome.responderName,
                friendshipId: outcome.friendshipId
            }));
        }

        return outcome;
    }
);

/**
 * 친구 관계 삭제 / 보낸 요청 취소
 */
exports.removeFriendship = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const friendshipId = typeof request.data?.friendshipId === "string" ? request.data.friendshipId.trim() : "";
        if (!friendshipId) {
            throw new HttpsError("invalid-argument", "friendshipId가 필요합니다.");
        }

        const friendshipRef = db.doc(`friendships/${friendshipId}`);
        const outcome = await db.runTransaction(async (tx) => {
            const friendshipSnap = await tx.get(friendshipRef);
            if (!friendshipSnap.exists) {
                throw new HttpsError("not-found", "친구 관계를 찾을 수 없습니다.");
            }

            const friendshipData = friendshipSnap.data() || {};
            const users = Array.isArray(friendshipData.users) ? friendshipData.users : [];
            if (!users.includes(uid) || users.length !== 2) {
                throw new HttpsError("permission-denied", "이 친구 관계를 수정할 권한이 없습니다.");
            }

            const [uidA, uidB] = users;
            tx.set(friendshipRef, {
                status: "removed",
                updatedAt: FieldValue.serverTimestamp(),
                respondedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            applyFriendCacheUpdate(tx, uidA, uidB, false);

            return {
                result: friendshipData.status === "pending" ? "cancelled" : "removed",
                friendshipId
            };
        });

        return outcome;
    }
);

/**
 * 기존 회원 전체 가입 축하금 소급 지급 (관리자 전용)
 */
exports.grantWelcomeBonusToAll = onCall(
    { region: "asia-northeast3", timeoutSeconds: 300 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const adminDoc = await db.doc(`admins/${uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자 권한 필요");

        // where != null은 존재하지 않는 필드를 못 잡으므로 전체 조회 후 필터
        const allSnap = await db.collection("users").get();
        const targets = allSnap.docs.filter(d => !d.data().welcomeBonusGiven);

        if (targets.length === 0) return { grantedCount: 0, message: "모든 회원이 이미 지급받았습니다" };

        const results = await Promise.allSettled(targets.map(d => settleWelcomeBonus(d.id)));

        const grantedCount = results.filter(r => r.status === "fulfilled" && r.value?.success).length;
        console.log(`grantWelcomeBonusToAll: ${grantedCount}/${targets.length} 지급 완료`);
        return { grantedCount, totalTargets: targets.length };
    }
);

// ========================================
// 8. AI 혈액검사 결과지 분석 (Gemini Vision API)
// ========================================

const BLOOD_TEST_ANALYSIS_PROMPT = `당신은 임상병리 전문의 AI입니다. 혈액검사/건강검진 결과지 사진을 분석하여 주요 수치를 정확히 추출합니다.

## 추출 대상 수치 (사진에 보이는 항목만 추출, 없으면 null)
- glucose: 공복혈당 (mg/dL)
- hba1c: 당화혈색소 HbA1c (%)
- triglyceride: 중성지방 TG (mg/dL)
- totalCholesterol: 총콜레스테롤 (mg/dL)
- hdl: HDL 콜레스테롤 (mg/dL)
- ldl: LDL 콜레스테롤 (mg/dL)
- ast: AST/GOT 간수치 (U/L)
- alt: ALT/GPT 간수치 (U/L)
- ggt: 감마GT (U/L)
- creatinine: 크레아티닌 (mg/dL)
- gfr: 사구체여과율 eGFR (mL/min)
- uricAcid: 요산 (mg/dL)
- hemoglobin: 헤모글로빈 (g/dL)
- vitaminD: 비타민D (ng/mL)
- tsh: 갑상선자극호르몬 TSH (mIU/L)
- bpSystolic: 수축기 혈압 (mmHg)
- bpDiastolic: 이완기 혈압 (mmHg)
- bmi: BMI (kg/m²)

## 분석 기준
각 수치에 대해:
1. 정상 범위 판정: normal / borderline / abnormal
2. 대사건강 관점의 해석

## 종합 의견
- 대사증후군 관련 위험인자 개수 (혈당, 혈압, 중성지방, HDL, 허리둘레 중 해당 항목)
- 가장 주의할 항목과 생활습관 개선 조언

## 응답 형식 (반드시 아래 JSON으로만 응답)
{
  "metrics": {
    "glucose": { "value": 95, "unit": "mg/dL", "status": "normal", "reference": "70-99" },
    "hba1c": { "value": 5.8, "unit": "%", "status": "borderline", "reference": "<5.7" },
    ...(발견된 항목만)
  },
  "riskFactors": 2,
  "riskItems": ["공복혈당 경계", "중성지방 높음"],
  "overallGrade": "B",
  "summary": "전반적으로 양호하나 혈당과 중성지방 관리가 필요합니다.",
  "advice": "초가공식품을 줄이고 식이섬유가 풍부한 식단으로 중성지방을 낮춰보세요.",
  "testDate": "2026-03-01"
}`;

exports.analyzeBloodTest = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
        }

        try {
            const imgResponse = await fetch(imageUrl);
            if (!imgResponse.ok) {
                throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
            }
            const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
            const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
            const base64Image = imgBuffer.toString("base64");

            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await model.generateContent([
                BLOOD_TEST_ANALYSIS_PROMPT,
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: contentType
                    }
                }
            ]);

            const responseText = result.response.text();
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const analysis = JSON.parse(jsonStr);

            // Firestore에 결과 저장
            const uid = request.auth.uid;
            const dateStr = new Date().toISOString().slice(0, 10);
            await db.doc(`users/${uid}/bloodTests/${dateStr}`).set({
                ...analysis,
                imageUrl,
                analyzedAt: FieldValue.serverTimestamp()
            });

            // healthProfile에 주요 수치 자동 반영
            const metrics = analysis.metrics || {};
            const profileUpdate = {};
            if (metrics.glucose?.value) profileUpdate['healthProfile.latestGlucose'] = metrics.glucose.value;
            if (metrics.hba1c?.value) profileUpdate['healthProfile.hba1c'] = String(metrics.hba1c.value);
            if (metrics.triglyceride?.value) profileUpdate['healthProfile.latestTriglyceride'] = metrics.triglyceride.value;
            if (Object.keys(profileUpdate).length > 0) {
                await db.doc(`users/${uid}`).set(profileUpdate, { merge: true });
            }

            return {
                success: true,
                analysis,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("analyzeBloodTest 오류:", error);
            if (error.message && error.message.includes("JSON")) {
                throw new HttpsError("internal", "AI 응답 파싱에 실패했습니다. 사진이 선명한지 확인해주세요.");
            }
            throw new HttpsError("internal", "혈액검사 분석 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 9. 챌린지 보상 수령
// ========================================

// 챌린지 보상 테이블 (blockchain-config.js와 동기화)
const CHALLENGE_REWARDS = {
    'challenge-3d': { rewardPoints: 30 },
    'challenge-7d': { rewardPoints: 100 },
    'challenge-30d': { rewardPoints: 500 }
};

// 하위 호환: 기존 ID로도 조회 가능
const CHALLENGE_ID_MAP = {
    'challenge-diet-3d': 'challenge-3d', 'challenge-exercise-3d': 'challenge-3d',
    'challenge-mind-3d': 'challenge-3d', 'challenge-all-3d': 'challenge-3d',
    'challenge-diet-7d': 'challenge-7d', 'challenge-exercise-7d': 'challenge-7d',
    'challenge-mind-7d': 'challenge-7d', 'challenge-all-7d': 'challenge-7d',
    'challenge-diet-30d': 'challenge-30d', 'challenge-exercise-30d': 'challenge-30d',
    'challenge-mind-30d': 'challenge-30d', 'challenge-all-30d': 'challenge-30d'
};

// 챌린지 정의 (duration, hbtStake, category, tier)
const CHALLENGE_DEFS = {
    'challenge-3d': { duration: 3, hbtStake: 0, category: 'all', tier: 'mini' },
    'challenge-7d': { duration: 7, hbtStake: 50, maxStake: 5000, category: 'all', tier: 'weekly' },
    'challenge-30d': { duration: 30, hbtStake: 100, maxStake: 10000, category: 'all', tier: 'master' }
};
const CHALLENGE_TIER_INDEX = { mini: 0, weekly: 1, master: 2 };

// 챌린지 정산 상수·순수 함수는 ./challenge-utils 로 추출됨(위 require 참고).
const CHALLENGE_BONUS_WINDOW_DAYS = 30;
const CHALLENGE_MSE30_DIVISOR = 10000;
const CHALLENGE_MSE30_EXTRA_HALVING_THRESHOLD = 3;
const CHALLENGE_BONUS_DAILY_COLLECTION = "challenge_bonus_daily";
const CHALLENGE_BONUS_META_DOC = "meta/challenge_bonus_policy";

function getRecentKstDateStrings(days = CHALLENGE_BONUS_WINDOW_DAYS, date = new Date()) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return Array.from({ length: days }, (_, index) => {
        const target = new Date(kst);
        target.setUTCDate(target.getUTCDate() - index);
        return target.toISOString().slice(0, 10);
    });
}

function halveInteger(value, count) {
    let next = Math.max(0, Number(value) || 0);
    for (let i = 0; i < count; i += 1) {
        next = Math.floor(next / 2);
    }
    return next;
}

function roundMetric(value, digits = 3) {
    const factor = 10 ** digits;
    return Math.round((Number(value) || 0) * factor) / factor;
}

function formatBonusPercentLabel(bps = 0) {
    const pct = (Number(bps) || 0) / 100;
    if (Number.isInteger(pct)) return `${pct}%`;
    return `${pct.toFixed(pct >= 10 ? 1 : 2).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}%`;
}

async function fetchChallengeDailyLogsByDate(uid, challenge = {}) {
    const dates = getChallengeDateRange(challenge);
    if (!uid || dates.length === 0) return {};

    const refs = dates.map((date) => db.doc(`daily_logs/${uid}_${date}`));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    return snaps.reduce((acc, snap, index) => {
        if (snap.exists) acc[dates[index]] = snap.data() || {};
        return acc;
    }, {});
}

async function buildAuthoritativeChallengeProgress(uid, userData = {}) {
    const activeChallenges = { ...(userData.activeChallenges || {}) };
    if (userData.activeChallenge && typeof userData.activeChallenge === "object") {
        const legacyId = CHALLENGE_ID_MAP[userData.activeChallenge.challengeId]
            || userData.activeChallenge.challengeId;
        const legacyTier = CHALLENGE_DEFS[legacyId]?.tier || userData.activeChallenge.tier || "master";
        if (!activeChallenges[legacyTier]) activeChallenges[legacyTier] = userData.activeChallenge;
    }

    const projections = {};
    await Promise.all(Object.entries(activeChallenges).map(async ([tier, stored]) => {
        if (!CHALLENGE_TIER_INDEX.hasOwnProperty(tier) || !stored || typeof stored !== "object") return;
        if (!["ongoing", "claimable", "expired"].includes(String(stored.status || "ongoing"))) return;
        const normalized = normalizeChallengeCompletion(stored);
        const dailyLogsByDate = await fetchChallengeDailyLogsByDate(uid, normalized);
        const reconciled = reconcileChallengeCompletionWithDailyLogs(normalized, dailyLogsByDate, tier);
        const totalDays = Math.max(1, Number(reconciled.totalDays || CHALLENGE_DEFS[
            CHALLENGE_ID_MAP[reconciled.challengeId] || reconciled.challengeId
        ]?.duration || 1));
        const completedDays = getChallengeCompletedDays(reconciled);
        let status = String(stored.status || "ongoing");
        if (canSettleChallengeAsClaimable(reconciled, completedDays, totalDays)) {
            status = "claimable";
        } else if (isChallengePastEnd(reconciled)) {
            status = "expired";
        } else if (status === "expired") {
            status = "ongoing";
        }
        projections[tier] = {
            ...reconciled,
            tier,
            totalDays,
            completedDays,
            status,
        };
    }));
    return projections;
}

exports.refreshChallengeProgress = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const userRef = db.doc(`users/${uid}`);
        const initialSnapshot = await userRef.get();
        if (!initialSnapshot.exists) throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        const sanitizedUserData = await sanitizeUserChallengesForActiveChain(userRef, initialSnapshot.data() || {});
        const projections = await buildAuthoritativeChallengeProgress(uid, sanitizedUserData);

        const activeChallenges = await db.runTransaction(async (tx) => {
            const currentSnapshot = await tx.get(userRef);
            if (!currentSnapshot.exists) throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            const currentData = currentSnapshot.data() || {};
            const next = { ...(currentData.activeChallenges || {}) };
            Object.entries(projections).forEach(([tier, projected]) => {
                const current = next[tier];
                const legacy = currentData.activeChallenge;
                const source = current || legacy;
                if (!source) return;
                const sameChallenge = String(source.challengeId || "") === String(projected.challengeId || "")
                    && String(source.startDate || "") === String(projected.startDate || "");
                if (!sameChallenge) return;
                next[tier] = projected;
            });
            tx.set(userRef, {
                activeChallenges: next,
                activeChallenge: FieldValue.delete(),
            }, { merge: true });
            return next;
        });

        return { success: true, activeChallenges };
    }
);

function buildChallengeBonusPolicy({ phase = 1, mse30 = 0 } = {}) {
    const safePhase = Math.max(1, Number(phase) || 1);
    const safeMse30 = Math.max(0, Number(mse30) || 0);
    const phaseHalvingCount = Math.max(0, safePhase - 1);
    const extraHalvingApplied = safeMse30 >= CHALLENGE_MSE30_EXTRA_HALVING_THRESHOLD;

    const buildTierPolicy = (tier) => {
        const baseBonusBps = CHALLENGE_BASE_BONUS_BPS[tier] || 0;
        const effectiveHalvingCount = phaseHalvingCount + (extraHalvingApplied && baseBonusBps > 0 ? 1 : 0);
        const effectiveBonusBps = halveInteger(baseBonusBps, effectiveHalvingCount);
        return {
            tier,
            baseBonusBps,
            effectiveHalvingCount,
            bonusBps: effectiveBonusBps,
            bonusPercentLabel: formatBonusPercentLabel(effectiveBonusBps)
        };
    };

    return {
        phase: safePhase,
        mse30: roundMetric(safeMse30, 3),
        extraHalvingApplied,
        windowDays: CHALLENGE_BONUS_WINDOW_DAYS,
        tiers: {
            mini: buildTierPolicy("mini"),
            weekly: buildTierPolicy("weekly"),
            master: buildTierPolicy("master")
        }
    };
}

async function recomputeChallengeBonusMetrics(date = new Date()) {
    const dateIds = getRecentKstDateStrings(CHALLENGE_BONUS_WINDOW_DAYS, date);
    const refs = dateIds.map((dateId) => db.doc(`${CHALLENGE_BONUS_DAILY_COLLECTION}/${dateId}`));
    const snaps = refs.length ? await db.getAll(...refs) : [];

    const masterFullCompletionStaked = snaps.reduce((sum, snap) => {
        return sum + Number(snap.data()?.masterFullCompletionStaked || 0);
    }, 0);
    const masterFullCompletionCount = snaps.reduce((sum, snap) => {
        return sum + Number(snap.data()?.masterFullCompletionCount || 0);
    }, 0);
    const mse30 = masterFullCompletionStaked / CHALLENGE_MSE30_DIVISOR;

    const snapshot = {
        updatedDate: getCurrentKstDateString(date),
        updatedAt: FieldValue.serverTimestamp(),
        windowDays: CHALLENGE_BONUS_WINDOW_DAYS,
        masterFullCompletionStaked: roundMetric(masterFullCompletionStaked, 4),
        masterFullCompletionCount,
        mse30: roundMetric(mse30, 3),
        extraHalvingApplied: mse30 >= CHALLENGE_MSE30_EXTRA_HALVING_THRESHOLD
    };

    await db.doc(CHALLENGE_BONUS_META_DOC).set(snapshot, { merge: true });
    return snapshot;
}

async function getChallengeBonusMetrics(date = new Date()) {
    const today = getCurrentKstDateString(date);
    const snap = await db.doc(CHALLENGE_BONUS_META_DOC).get();
    if (snap.exists) {
        const data = snap.data() || {};
        if (data.updatedDate === today && Number.isFinite(Number(data.mse30))) {
            return {
                updatedDate: data.updatedDate,
                windowDays: Number(data.windowDays || CHALLENGE_BONUS_WINDOW_DAYS),
                masterFullCompletionStaked: Number(data.masterFullCompletionStaked || 0),
                masterFullCompletionCount: Number(data.masterFullCompletionCount || 0),
                mse30: Number(data.mse30 || 0),
                extraHalvingApplied: !!data.extraHalvingApplied
            };
        }
    }
    return recomputeChallengeBonusMetrics(date);
}

function getStoredChallengeBonusBps(challenge, tier) {
    const stored = Number(
        challenge?.bonusPolicy?.rateBps ??
        challenge?.bonusRateBps
    );
    if (Number.isFinite(stored) && (stored > 0 || tier === "mini")) {
        return stored;
    }
    return getLegacyChallengeBonusBps(tier);
}

async function recordMasterFullCompletionStake(stakedAmount, date = new Date()) {
    const safeAmount = Number(stakedAmount || 0);
    if (!(safeAmount > 0)) return null;

    const dateId = getCurrentKstDateString(date);
    await db.doc(`${CHALLENGE_BONUS_DAILY_COLLECTION}/${dateId}`).set({
        date: dateId,
        masterFullCompletionStaked: FieldValue.increment(safeAmount),
        masterFullCompletionCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return recomputeChallengeBonusMetrics(date);
}

exports.startChallenge = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 120
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const {
            challengeId,
            hbtAmount,
            stakeTxHash,
            stakeApprovalTxHash,
            stakeWalletAddress,
            stakeFlowVersion = 1,
            preflightOnly = false
        } = request.data;
        // 하위 호환: 기존 ID를 새 ID로 매핑
        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const def = CHALLENGE_DEFS[resolvedId];
        if (!def) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지입니다.");
        }

        const stakeAmount = parseFloat(hbtAmount) || 0;
        const stakeFlowVersionNumber = Number(stakeFlowVersion) || 1;
        const hasTieredStakeRequestHint = !stakeTxHash && (stakeApprovalTxHash || stakeWalletAddress);
        const isTieredStakeRequest = stakeAmount > 0 && (stakeFlowVersionNumber >= 2 || hasTieredStakeRequestHint);
        let stakeContractMode = stakeAmount > 0
            ? (isTieredStakeRequest ? "tiered" : "staking")
            : null;
        let resolvedStakeTxHash = null;
        let resolvedStakeWalletAddress = null;
        if (stakeAmount > 0 && stakeWalletAddress) {
            try {
                resolvedStakeWalletAddress = ethers.getAddress(String(stakeWalletAddress));
            } catch (_) {
                throw new HttpsError("invalid-argument", "예치 지갑 주소가 올바르지 않습니다.");
            }
        }
        if (def.hbtStake > 0 && stakeAmount < def.hbtStake) {
            throw new HttpsError("invalid-argument", `최소 ${def.hbtStake} HBT 이상 예치해야 합니다.`);
        }
        if (def.maxStake && stakeAmount > def.maxStake) {
            throw new HttpsError("invalid-argument", `최대 ${def.maxStake} HBT까지만 예치 가능합니다.`);
        }

        const uid = request.auth.uid;
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        let userData = userSnap.data();
        userData = await sanitizeUserChallengesForActiveChain(userRef, userData);
        const activeChallenges = userData.activeChallenges || {};
        if (preflightOnly) {
            const existingChallenge = activeChallenges[def.tier] || null;
            if (existingChallenge &&
                ["ongoing", "claimable", "expired"].includes(String(existingChallenge.status || ""))) {
                throw new HttpsError(
                    "failed-precondition",
                    "이미 해당 단계에서 진행 중이거나 정산할 챌린지가 있습니다."
                );
            }
            return {
                success: true,
                eligible: true,
                tier: def.tier,
                duration: def.duration
            };
        }
        if (stakeAmount > 0) {
            if (!resolvedStakeWalletAddress) {
                throw new HttpsError("failed-precondition", "예치 지갑 주소가 필요합니다.");
            }
            const effectiveWalletAddress = getEffectiveWalletAddress(userData);
            if (
                effectiveWalletAddress &&
                normalizeAddress(effectiveWalletAddress) !== normalizeAddress(resolvedStakeWalletAddress)
            ) {
                throw new HttpsError(
                    "failed-precondition",
                    "로그인 계정에 연결된 지갑과 예치 지갑이 다릅니다."
                );
            }
        }
        let appliedChallengeBonusPolicy = null;

        try {
            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);
            const stats = await habitContract.getTokenStats();
            const currentPhase = Number(stats[4]) || 1;
            const challengeMetrics = await getChallengeBonusMetrics();
            const currentBonusPolicy = buildChallengeBonusPolicy({
                phase: currentPhase,
                mse30: challengeMetrics.mse30
            });
            const tierPolicy = currentBonusPolicy.tiers[def.tier] || currentBonusPolicy.tiers.mini;
            appliedChallengeBonusPolicy = {
                phase: currentBonusPolicy.phase,
                mse30: currentBonusPolicy.mse30,
                extraHalvingApplied: currentBonusPolicy.extraHalvingApplied,
                rateBps: tierPolicy.bonusBps,
                rateLabel: tierPolicy.bonusPercentLabel,
                halvingCount: tierPolicy.effectiveHalvingCount,
                windowDays: currentBonusPolicy.windowDays
            };
        } catch (policyError) {
            console.error("챌린지 보너스 정책 조회 오류:", policyError?.message || policyError);
            throw new HttpsError("internal", "현재 챌린지 보상 정책을 불러오지 못했습니다.");
        }

        // 기존 캐시 클라이언트의 직접 예치와 신규 클라이언트의 approve 경로를 모두 검증한다.
        if (stakeAmount > 0) {
            try {
                const { provider } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                if (!isTieredStakeRequest && !stakeTxHash) {
                    throw new HttpsError("failed-precondition", "온체인 예치 트랜잭션이 필요합니다.");
                }
                const authorizationTxHash = stakeApprovalTxHash || stakeTxHash || null;
                if (authorizationTxHash) {
                    const receipt = await provider.getTransactionReceipt(authorizationTxHash);
                    if (!receipt || receipt.status !== 1) {
                        throw new HttpsError("failed-precondition", "온체인 예치 승인 트랜잭션이 아직 확인되지 않았습니다.");
                    }
                    const txInfo = await provider.getTransaction(authorizationTxHash).catch(() => null);
                    if (txInfo?.from) {
                        const txFrom = ethers.getAddress(txInfo.from);
                        if (txFrom !== resolvedStakeWalletAddress) {
                            throw new HttpsError("failed-precondition", "예치 승인 지갑이 챌린지 시작 요청과 다릅니다.");
                        }
                    }

                    if (stakeApprovalTxHash) {
                        const txTarget = normalizeAddress(txInfo?.to);
                        if (txTarget && txTarget !== normalizeAddress(HABIT_ADDRESS)) {
                            throw new HttpsError("failed-precondition", "HBT 예치 승인 트랜잭션이 아닙니다.");
                        }
                    } else {
                        stakeContractMode = resolveStakeContractModeFromReceipt(receipt);
                        resolvedStakeTxHash = stakeTxHash;
                    }
                }
            } catch (verifyErr) {
                if (verifyErr.code) throw verifyErr; // HttpsError는 그대로 전달
                console.error("온체인 예치 승인 검증 오류:", verifyErr.message);
                throw new HttpsError("internal", "온체인 예치 승인을 확인하지 못했습니다.");
            }
        }

        // 같은 티어에 진행 중인 챌린지 확인
        const existingChallenge = activeChallenges[def.tier] || null;
        if (existingChallenge &&
            (existingChallenge.status === 'ongoing' || existingChallenge.status === 'claimable')) {
            const normalizedExistingId = CHALLENGE_ID_MAP[existingChallenge.challengeId] || existingChallenge.challengeId;
            const sameStakeAmount = Math.abs(Number(existingChallenge.hbtStaked || 0) - stakeAmount) < 0.0000001;
            const sameStakeWallet =
                !resolvedStakeWalletAddress ||
                normalizeAddress(existingChallenge.stakeWalletAddress) === normalizeAddress(resolvedStakeWalletAddress);
            if (sameStakeAmount && sameStakeWallet && normalizedExistingId === resolvedId) {
                const recoveredQualificationPolicy = normalizeChallengeQualificationPolicy(existingChallenge.qualificationPolicy, def.tier);
                const recoveredBonusRateBps = getStoredChallengeBonusBps(existingChallenge, def.tier);
                const {
                    calculatedAt: _ignoredCalculatedAt,
                    ...recoveredBonusPolicy
                } = existingChallenge?.bonusPolicy || {};
                const recoveredClientChallenge = {
                    ...existingChallenge,
                    qualificationPolicy: recoveredQualificationPolicy,
                    bonusPolicy: {
                        ...recoveredBonusPolicy,
                        rateBps: recoveredBonusRateBps,
                        rateLabel: existingChallenge?.bonusPolicy?.rateLabel || formatBonusPercentLabel(recoveredBonusRateBps)
                    },
                    status: existingChallenge.status || "ongoing",
                    tier: def.tier
                };
                return {
                    success: true,
                    recovered: true,
                    tier: def.tier,
                    duration: def.duration,
                    hbtStaked: Number(existingChallenge.hbtStaked || stakeAmount),
                    initialCompletedDays: Number(existingChallenge.completedDays || 0),
                    bonusRateBps: recoveredBonusRateBps,
                    bonusRateLabel: existingChallenge?.bonusPolicy?.rateLabel || formatBonusPercentLabel(recoveredBonusRateBps),
                    bonusPhase: Number(existingChallenge?.bonusPolicy?.phase || 1),
                    bonusMse30: Number(existingChallenge?.bonusPolicy?.mse30 || 0),
                    bonusExtraHalvingApplied: !!existingChallenge?.bonusPolicy?.extraHalvingApplied,
                    startDate: existingChallenge.startDate || null,
                    endDate: existingChallenge.endDate || null,
                    deferredStart: !!existingChallenge.deferredStart,
                    qualificationPolicy: recoveredQualificationPolicy,
                    qualificationLabel: formatChallengeQualificationLabel(recoveredQualificationPolicy),
                    challengeId: resolvedId,
                    activeChallenge: recoveredClientChallenge,
                    activeChallenges: {
                        [def.tier]: recoveredClientChallenge
                    }
                };
            }
        }
        if (activeChallenges[def.tier] && 
            (activeChallenges[def.tier].status === 'ongoing' || activeChallenges[def.tier].status === 'claimable')) {
            throw new HttpsError("failed-precondition", "이미 해당 티어에 진행 중인 챌린지가 있습니다.");
        }

        if (isTieredStakeRequest) {
            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const tieredStart = await startTieredChallengeStake(wallet, {
                    userWalletAddress: resolvedStakeWalletAddress,
                    challengeId: resolvedId,
                    tier: def.tier,
                    totalDays: def.duration,
                    stakeAmount
                });
                resolvedStakeTxHash = tieredStart.txHash;
                stakeContractMode = "tiered";
            } catch (stakeError) {
                if (stakeError instanceof HttpsError || stakeError?.code) {
                    throw stakeError;
                }
                console.error("챌린지 단계별 예치 오류:", stakeError);
                throw new HttpsError("internal", "챌린지 예치를 완료하지 못했습니다.");
            }
        }

        // KST 날짜 계산
        const todayStr = getCurrentKstDateString();
        const lastTierSettlement = userData?.lastChallengeSettlementByTier?.[def.tier] || null;
        const settledTodaySameTier = String(lastTierSettlement?.date || '') === todayStr;
        // 내일로 미루는 건 '오늘 기록이 직전 같은 티어 챌린지에 이미 카운트된' 경우만
        // (하루가 두 챌린지에 이중 카운트되는 것 방지). 다음날 정산(마지막 인정일이 어제
        // 이전, 정산만 오늘)이면 오늘 기록은 미사용이므로 오늘부터 시작해 인정한다.
        // lastCountedDate가 없는 구 정산 기록은 기존 보수적 동작(내일 시작)을 유지한다.
        const lastCountedDate = String(lastTierSettlement?.lastCountedDate || '');
        const sameTierSettledToday = settledTodaySameTier
            && (lastCountedDate ? lastCountedDate >= todayStr : true);
        const startDate = sameTierSettledToday
            ? addDaysToKstDateString(todayStr, 1)
            : todayStr;
        const endDateObj = new Date(startDate + 'T12:00:00Z');
        endDateObj.setUTCDate(endDateObj.getUTCDate() + Math.max(0, def.duration - 1));
        const endDate = endDateObj.toISOString().split('T')[0];

        const qualificationPolicy = buildDefaultChallengeQualificationPolicy(def.tier);

        // 오늘 인증 확인
        let initialCompletedDays = 0;
        let initialCompletedDates = [];
        try {
            if (!sameTierSettledToday && startDate === todayStr) {
                const todayLogSnap = await db.doc(`daily_logs/${uid}_${todayStr}`).get();
                if (todayLogSnap.exists) {
                    const ap = todayLogSnap.data().awardedPoints || {};
                    if (doesAwardedPointsMeetChallengeRule(ap, qualificationPolicy)) {
                        initialCompletedDays = 1;
                        initialCompletedDates = [todayStr];
                    }
                }
            }
        } catch (e) {
            // 무시
        }

        const clientChallengeData = {
            challengeId: resolvedId,
            startDate,
            endDate,
            scheduleVersion: 2,
            completedDays: initialCompletedDays,
            completedDates: initialCompletedDates,
            totalDays: def.duration,
            hbtStaked: stakeAmount,
            stakeTxHash: resolvedStakeTxHash || stakeTxHash || null,
            stakeApprovalTxHash: stakeApprovalTxHash || null,
            stakeWalletAddress: stakeAmount > 0 ? (resolvedStakeWalletAddress || getEffectiveWalletAddress(userData)) : null,
            stakedOnChain: stakeAmount > 0,
            stakeContract: stakeContractMode,
            bonusPolicy: {
                ...appliedChallengeBonusPolicy,
                calculatedAt: new Date().toISOString()
            },
            qualificationPolicy,
            deferredStart: sameTierSettledToday,
            deferredStartReason: sameTierSettledToday ? 'same_day_restart_after_claim' : null,
            status: 'ongoing',
            tier: def.tier,
            chainKey: ACTIVE_CHAIN.key,
            network: ACTIVE_CHAIN.networkTag,
            chainId: ACTIVE_CHAIN.chainId,
            chainLabel: ACTIVE_CHAIN.label
        };
        const challengeData = {
            ...clientChallengeData,
            bonusPolicy: {
                ...appliedChallengeBonusPolicy,
                calculatedAt: FieldValue.serverTimestamp()
            }
        };

        const updateData = {};
        updateData[`activeChallenges.${def.tier}`] = challengeData;
        if (userData.activeChallenge) updateData.activeChallenge = FieldValue.delete();
        await userRef.update(updateData);

        // 거래 기록
        if (stakeAmount > 0) {
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: 'staking',
                challengeId: resolvedId,
                amount: stakeAmount,
                stakeTxHash: resolvedStakeTxHash || stakeTxHash || null,
                stakeApprovalTxHash: stakeApprovalTxHash || null,
                stakeWalletAddress: resolvedStakeWalletAddress || null,
                stakeContract: stakeContractMode,
                onChain: true,
                network: ACTIVE_CHAIN.networkTag,
                timestamp: FieldValue.serverTimestamp(),
                status: 'success'
            });
        }

        return {
            success: true,
            tier: def.tier,
            duration: def.duration,
            hbtStaked: stakeAmount,
            initialCompletedDays,
            initialCompletedDates,
            startDate,
            endDate,
            deferredStart: sameTierSettledToday,
            challengeId: resolvedId,
            activeChallenge: clientChallengeData,
            activeChallenges: {
                [def.tier]: clientChallengeData
            },
            bonusRateBps: appliedChallengeBonusPolicy?.rateBps || 0,
            bonusRateLabel: appliedChallengeBonusPolicy?.rateLabel || "0%",
            bonusPhase: appliedChallengeBonusPolicy?.phase || 1,
            bonusMse30: appliedChallengeBonusPolicy?.mse30 || 0,
            bonusExtraHalvingApplied: !!appliedChallengeBonusPolicy?.extraHalvingApplied,
            qualificationPolicy,
            qualificationLabel: formatChallengeQualificationLabel(qualificationPolicy)
        };
    }
);

exports.claimChallengeReward = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 300
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { tier } = request.data;
        if (!tier || !['mini', 'weekly', 'master'].includes(tier)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 티어입니다.");
        }

        const uid = request.auth.uid;

        // H1: 동시 이중청구(double-claim) 방지 — 온체인 정산(수 초 소요) 도중 두 번째 호출이
        // 같은 claimable 챌린지를 다시 정산하지 못하도록 원자적 락을 건다. admin SDK의 create()는
        // 문서가 이미 존재하면 실패하므로 진짜 상호배제가 된다(mint_locks의 get-then-set은 racy).
        // 아래 handler 전체를 try/finally로 감싸 정산 완료·실패와 무관하게 락을 해제한다.
        const claimLockRef = db.doc(`challenge_claim_locks/${uid}_${tier}`);
        const CLAIM_LOCK_STALE_MS = 300000; // 함수 타임아웃(300s)보다 오래된 락은 죽은 것으로 인수
        const existingLock = await claimLockRef.get();
        if (existingLock.exists) {
            const lockAgeMs = Date.now() - (existingLock.data().timestamp?.toMillis?.() || 0);
            if (lockAgeMs < CLAIM_LOCK_STALE_MS) {
                throw new HttpsError("already-exists", "이전 보상 정산이 처리 중입니다. 잠시 후 다시 시도해주세요.");
            }
            await claimLockRef.delete().catch(() => {});
        }
        try {
            await claimLockRef.create({ uid, tier, timestamp: FieldValue.serverTimestamp() });
        } catch (lockErr) {
            // create() 실패 = 다른 호출이 방금 락을 선점 → 동시 요청
            throw new HttpsError("already-exists", "이전 보상 정산이 처리 중입니다. 잠시 후 다시 시도해주세요.");
        }

        try {
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        let userData = userSnap.data();
        userData = await sanitizeUserChallengesForActiveChain(userRef, userData);
        const activeChallenges = userData.activeChallenges || {};
        let challenge = normalizeChallengeCompletion(activeChallenges[tier]);

        if (!challenge || challenge.status !== 'claimable') {
            throw new HttpsError("failed-precondition", "수령할 보상이 없습니다.");
        }

        const dailyLogsByDate = await fetchChallengeDailyLogsByDate(uid, challenge);
        challenge = reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier);

        const totalDays = challenge.totalDays || 30;
        const completedDays = getChallengeCompletedDays(challenge);
        const successRate = completedDays / totalDays;
        if (!canSettleChallengeAsClaimable(challenge, completedDays, totalDays)) {
            throw new HttpsError(
                "failed-precondition",
                "마지막 날은 임무를 완료해야 바로 수령할 수 있고, 부분 달성 정산은 다음날부터 가능합니다."
            );
        }
        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const resolvedChallengeId = CHALLENGE_ID_MAP[challenge.challengeId] || challenge.challengeId;
        const challengeDef = CHALLENGE_REWARDS[resolvedChallengeId] || {};
        const baseRewardP = challengeDef.rewardPoints || 0;
        let rewardHbt = 0;
        let rewardPoints = 0;
        let resolveTxHash = null;
        let bonusTxHash = null;
        const preferredStakeContract = challenge.stakeContract || "legacy";
        const bonusRateBps = getStoredChallengeBonusBps(challenge, tier);
        const bonusRateLabel = formatBonusPercentLabel(bonusRateBps);
        const principalAlreadyReturned = challenge.stakePrincipalReturnedEarly === true;
        const bonusEligibleStake = Math.max(
            0,
            Number(
                challenge.stakeBonusBasis ??
                (stakedOnChain || principalAlreadyReturned ? staked : 0)
            ) || 0
        );
        const principalRewardHbt = stakedOnChain && !principalAlreadyReturned ? Number(staked) : 0;
        const bonusRewardHbt = successRate >= 1.0
            ? (bonusEligibleStake * bonusRateBps) / 10000
            : 0;
        let principalPaidHbt = principalRewardHbt;
        let bonusPaidHbt = 0;

        if (staked > 0 || bonusEligibleStake > 0) {
            if (successRate >= 1.0) {
                rewardHbt = principalRewardHbt + bonusRewardHbt;
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                rewardHbt = principalRewardHbt;
                rewardPoints = baseRewardP;
            }
        } else {
            if (successRate >= 1.0) {
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                rewardPoints = Math.round(baseRewardP * 0.5);
            }
        }

        // 온체인 정산: resolveChallenge(user, true) → 스테이킹 100% 반환
        if (stakedOnChain && staked > 0 && successRate >= 0.8) {
            const userWalletAddress = String(challenge.stakeWalletAddress || '').trim() || getEffectiveWalletAddress(userData);
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                await assertIsolatedChallengeStake(
                    wallet,
                    userWalletAddress,
                    staked,
                    preferredStakeContract
                );

                // 1) resolveChallenge(user, true) — 스테이킹 원금 100% 반환
                const { tx: resolveTx } = await resolveChallengeStake(
                    wallet,
                    userWalletAddress,
                    true,
                    preferredStakeContract,
                    { tier, completedDays }
                );
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;
            } catch (onChainErr) {
                if (onChainErr instanceof HttpsError || onChainErr?.code === "failed-precondition") {
                    throw onChainErr;
                }
                // NoStakeFound(0x59be8f02): 이미 온체인 정산 완료 → Firestore 정리만 진행
                // ethers v6가 커스텀 에러를 "unknown custom error"로 표시하므로 data 셀렉터로 판별
                const errData = onChainErr?.data || onChainErr?.error?.data || '';
                const isAlreadySettled =
                    onChainErr?.errorName === 'NoStakeFound' ||
                    (onChainErr?.message || '').includes('NoStakeFound') ||
                    String(errData).startsWith('0x59be8f02'); // NoStakeFound() selector
                if (isAlreadySettled) {
                    console.warn("온체인 이미 정산됨(NoStakeFound), Firestore 정리만 진행합니다.");
                    principalPaidHbt = 0;
                    rewardHbt = bonusRewardHbt;
                } else {
                    console.error("온체인 정산 오류:", onChainErr.message);
                    throw new HttpsError("internal", "온체인 챌린지 정산에 실패했습니다.");
                }
            }
        }

        if (bonusRewardHbt > 0) {
            const userWalletAddress = String(challenge.stakeWalletAddress || '').trim() || getEffectiveWalletAddress(userData);
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }
            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const habitContract = getHabitContract(wallet);
                const bonusHbtRaw = ethers.parseUnits(bonusRewardHbt.toString(), HBT_DECIMALS);
                const currentRate = await habitContract.currentRate();
                const pointAmount = (bonusHbtRaw + currentRate - 1n) / currentRate;
                if (pointAmount > 0n) {
                    const bonusTx = await habitContract.mint(userWalletAddress, pointAmount);
                    const bonusReceipt = await bonusTx.wait();
                    bonusTxHash = bonusReceipt.hash;
                    bonusPaidHbt = Number(ethers.formatUnits(pointAmount * currentRate, HBT_DECIMALS));
                }
            } catch (bonusError) {
                console.error("챌린지 보너스 민팅 오류:", bonusError);
                // 일일 발행 한도 초과(ExceedsUserDailyCap 0xfeb8983d / ExceedsGlobalDailyCap
                // 0x6513cf71)는 모호한 500 대신, 예치금 안전·챌린지 유지·재수령 시점을
                // 명확히 안내한다. 챌린지는 claimable 상태로 남아 다음 날 다시 수령 가능.
                const capData = String(
                    bonusError?.data
                    || bonusError?.error?.data
                    || bonusError?.info?.error?.data
                    || ""
                );
                const capMsg = String(bonusError?.message || "");
                const isCapExceeded =
                    bonusError?.errorName === "ExceedsUserDailyCap"
                    || bonusError?.errorName === "ExceedsGlobalDailyCap"
                    || capData.startsWith("0xfeb8983d")
                    || capData.startsWith("0x6513cf71")
                    || capMsg.includes("ExceedsUserDailyCap")
                    || capMsg.includes("ExceedsGlobalDailyCap");
                if (isCapExceeded) {
                    throw new HttpsError(
                        "failed-precondition",
                        "오늘 HBT 일일 발행 한도를 초과해 보너스를 지금 지급할 수 없어요. 예치금은 안전하고 챌린지는 그대로 유지되니, 한도가 초기화되는 다음 날(한국시간 오전 9시) 이후 다시 수령해 주세요."
                    );
                }
                throw new HttpsError("internal", "챌린지 보너스 지급에 실패했습니다.");
            }
            if (!(bonusPaidHbt > 0)) {
                throw new HttpsError("internal", "챌린지 보너스 지급이 완료되지 않았습니다.");
            }
        }

        if (staked > 0 || bonusEligibleStake > 0) {
            if (successRate >= 1.0) {
                rewardHbt = principalPaidHbt + bonusPaidHbt;
            } else if (successRate >= 0.8) {
                rewardHbt = principalPaidHbt;
            }
        }

        if (tier === "master" && successRate >= 1.0 && bonusEligibleStake > 0) {
            try {
                await recordMasterFullCompletionStake(bonusEligibleStake);
            } catch (metricsError) {
                console.warn("master completion aggregate update failed:", metricsError?.message || metricsError);
            }
        }

        // Firestore 업데이트 (hbtBalance 제거 — 온체인이 진실의 원천)
        const settlementDate = getCurrentKstDateString();
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = FieldValue.delete();
        updateData[`lastChallengeSettlementByTier.${tier}`] = {
            date: settlementDate,
            challengeId: resolvedChallengeId,
            completedDays,
            totalDays,
            successRate,
            // 직전 챌린지가 실제로 카운트한 마지막 날짜. 다음날 정산(마지막 인정일=어제,
            // 정산=오늘) 후 재시작 시 오늘부터 카운트할지 판단하는 기준이 된다.
            lastCountedDate: (Array.isArray(challenge.completedDates) && challenge.completedDates.length
                ? challenge.completedDates[challenge.completedDates.length - 1]
                : null),
            settledAt: FieldValue.serverTimestamp()
        };
        if (rewardPoints > 0) updateData.coins = FieldValue.increment(rewardPoints);
        if (bonusPaidHbt > 0) updateData.totalHbtEarned = FieldValue.increment(bonusPaidHbt);

        await userRef.update(updateData);

        // 거래 기록 (온체인 TX 해시 포함, date 필드 추가 — 앱의 날짜별 HBT 집계에 필요)
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_settlement',
            challengeId: challenge.challengeId,
            amount: rewardHbt,
            hbtReceived: rewardHbt,
            date: settlementDate,
            staked: staked,
            bonusEligibleStake,
            principalRewardHbt: principalPaidHbt,
            bonusRewardHbt: bonusPaidHbt,
            targetBonusRewardHbt: bonusRewardHbt,
            principalAlreadyReturned,
            stakeWalletAddress: challenge.stakeWalletAddress || null,
            successRate: successRate,
            completedDays,
            completedDates: challenge.completedDates || [],
            startDate: challenge.startDate || null,
            endDate: challenge.endDate || null,
            tier,
            bonusRateBps,
            bonusRateLabel,
            bonusPolicyPhase: challenge?.bonusPolicy?.phase || null,
            bonusPolicyMse30: challenge?.bonusPolicy?.mse30 || 0,
            bonusExtraHalvingApplied: !!challenge?.bonusPolicy?.extraHalvingApplied,
            onChain: stakedOnChain,
            network: ACTIVE_CHAIN.networkTag,
            resolveTxHash,
            bonusTxHash,
            timestamp: FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            rewardHbt,
            principalRewardHbt: principalPaidHbt,
            bonusRewardHbt: bonusPaidHbt,
            targetBonusRewardHbt: bonusRewardHbt,
            rewardPoints,
            tier,
            settlementDate,
            bonusRateBps,
            bonusRateLabel,
            successRate: Math.round(successRate * 100),
            resolveTxHash,
            bonusTxHash
        };
        } finally {
            // H1: 정산 완료·실패와 무관하게 락 해제 (재시도 가능하게). 성공 시에는 챌린지가
            // activeChallenges에서 제거되므로 재시도해도 claimable 전제조건에서 막힌다.
            await claimLockRef.delete().catch(() => {});
        }
    }
);

// ========================================
// 9-1. 챌린지 실패 정산 (온체인 소각)
// ========================================
exports.settleChallengeFailure = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 300
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { tier } = request.data;
        const forceForfeit = request.data?.forceForfeit === true;
        if (!tier || !['mini', 'weekly', 'master'].includes(tier)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지 티어입니다.");
        }

        const uid = request.auth.uid;
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        let userData = userSnap.data();
        userData = await sanitizeUserChallengesForActiveChain(userRef, userData);
        const activeChallenges = userData.activeChallenges || {};
        const originalChallenge = activeChallenges[tier];

        if (!originalChallenge) {
            throw new HttpsError("failed-precondition", "해당 티어의 챌린지를 찾을 수 없습니다.");
        }

        let challenge = normalizeChallengeCompletion(originalChallenge);
        const dailyLogsByDate = await fetchChallengeDailyLogsByDate(uid, challenge);
        challenge = reconcileChallengeCompletionWithDailyLogs(challenge, dailyLogsByDate, tier);
        const totalDays = challenge.totalDays || 30;
        const completedDays = getChallengeCompletedDays(challenge);
        const successRate = completedDays / totalDays;

        const canClaimInsteadOfFailing = canSettleChallengeAsClaimable(challenge, completedDays, totalDays);
        if (!forceForfeit && (canClaimInsteadOfFailing || (challenge.status === "claimable" && isChallengePastEnd(challenge)))) {
            const claimableChallenge = {
                ...challenge,
                status: "claimable"
            };
            await userRef.update({
                [`activeChallenges.${tier}`]: claimableChallenge
            });
            return {
                success: true,
                skippedFailure: true,
                claimable: true,
                tier,
                completedDays,
                totalDays,
                successRate: Math.round(successRate * 100)
            };
        }

        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        let resolveTxHash = null;
        const preferredStakeContract = challenge.stakeContract || "legacy";

        // 온체인 정산: resolveChallenge(user, false) → 50% 소각 + 50% 반환
        if (stakedOnChain && staked > 0) {
            const userWalletAddress = String(challenge.stakeWalletAddress || '').trim() || getEffectiveWalletAddress(userData);
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                await assertIsolatedChallengeStake(
                    wallet,
                    userWalletAddress,
                    staked,
                    preferredStakeContract
                );
                const { tx: resolveTx } = await resolveChallengeStake(
                    wallet,
                    userWalletAddress,
                    false,
                    preferredStakeContract,
                    { tier, completedDays }
                );
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;
            } catch (onChainErr) {
                if (onChainErr instanceof HttpsError || onChainErr?.code === "failed-precondition") {
                    throw onChainErr;
                }
                console.error("온체인 소각 정산 오류:", onChainErr.message);
                throw new HttpsError("internal", "온체인 챌린지 실패 정산에 실패했습니다.");
            }
        }

        // Firestore 업데이트: 챌린지 제거
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = FieldValue.delete();

        await userRef.update(updateData);

        // 거래 기록 (date 필드 추가 — 일관성)
        const _kstDateStrFail = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_failure',
            challengeId: challenge.challengeId,
            date: _kstDateStrFail,
            staked: staked,
            stakeWalletAddress: challenge.stakeWalletAddress || null,
            burned: stakedOnChain ? staked / 2 : 0,
            returned: stakedOnChain ? staked / 2 : 0,
            successRate: successRate,
            completedDays,
            completedDates: challenge.completedDates || [],
            startDate: challenge.startDate || null,
            endDate: challenge.endDate || null,
            tier,
            onChain: stakedOnChain,
            network: ACTIVE_CHAIN.networkTag,
            resolveTxHash,
            timestamp: FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            tier,
            staked,
            burned: stakedOnChain ? staked / 2 : 0,
            returned: stakedOnChain ? staked / 2 : 0,
            resolveTxHash
        };
    }
);

// ========================================
// 10. 월간 MVP 보상 자동 지급
// ========================================

const MVP_REWARDS = [
    { rank: 1, points: 5000, label: '🥇 1위' },
    { rank: 2, points: 2000, label: '🥈 2위' },
    { rank: 3, points: 500, label: '🥉 3위' }
];

// MVP 보상 지급 핵심 로직 (callable + scheduled 공용)
async function distributeMvpRewardForMonth(targetMonth, distributedBy) {
    const rewardRef = db.doc(`monthly_rewards/${targetMonth}`);
    const rewardSnap = await rewardRef.get();
    if (rewardSnap.exists) {
        return { alreadyDistributed: true, ...rewardSnap.data() };
    }

    const monthStart = `${targetMonth}-01`;
    const monthEnd = `${targetMonth}-31`;
    const snap = await db.collection("daily_logs")
        .where("date", ">=", monthStart)
        .where("date", "<=", monthEnd)
        .get();

    if (snap.empty) {
        return { alreadyDistributed: false, winners: [] };
    }

    const userStats = {};
    snap.forEach(doc => {
        const log = doc.data();
        if (log.userId) {
            if (!userStats[log.userId]) {
                userStats[log.userId] = { days: 0, comments: 0, reactions: 0, name: log.userName || '익명' };
            }
            userStats[log.userId].days++;
        }
        if (log.comments && Array.isArray(log.comments)) {
            getUniqueCommentUserIds(log).forEach((commenterUid) => {
                const commentEntry = log.comments.find((comment) => comment?.userId === commenterUid) || {};
                if (!userStats[commenterUid]) {
                    userStats[commenterUid] = {
                        days: 0, comments: 0, reactions: 0,
                        name: commentEntry.userName || "익명"
                    };
                }
                userStats[commenterUid].comments++;
            });
        }
        if (log.reactions) {
            getUniqueReactionUserIds(log).forEach((reactorUid) => {
                if (!userStats[reactorUid]) userStats[reactorUid] = { days: 0, comments: 0, reactions: 0, name: "회원" };
                userStats[reactorUid].reactions++;
            });
        }
    });

    Object.values(userStats).forEach(u => {
        u.score = (u.days * 10) + (u.comments * 3) + (u.reactions * 1);
    });

    const ranked = Object.entries(userStats)
        .map(([userId, stat]) => ({ userId, ...stat }))
        .filter(u => u.days > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (ranked.length === 0) {
        return { alreadyDistributed: false, winners: [] };
    }

    const batch = db.batch();
    const winners = [];
    for (let i = 0; i < ranked.length; i++) {
        const reward = MVP_REWARDS[i];
        const winner = ranked[i];
        const userRef = db.doc(`users/${winner.userId}`);
        batch.set(userRef, {
            coins: FieldValue.increment(reward.points)
        }, { merge: true });
        winners.push({
            rank: i + 1,
            userId: winner.userId,
            name: winner.name,
            days: winner.days,
            comments: winner.comments,
            reactions: winner.reactions,
            score: winner.score,
            reward: reward.points
        });
    }

    batch.set(rewardRef, {
        month: targetMonth,
        winners,
        distributedAt: FieldValue.serverTimestamp(),
        distributedBy
    });

    await batch.commit();
    console.log(`✅ MVP 보상 지급 완료 (${targetMonth}):`, winners);
    return { alreadyDistributed: false, winners };
}

exports.distributeMonthlyMvpReward = onCall(
    { region: "asia-northeast3", maxInstances: 5, timeoutSeconds: 30 },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        const { targetMonth } = request.data;
        if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 월 형식입니다. (YYYY-MM)");
        }
        return distributeMvpRewardForMonth(targetMonth, request.auth.uid);
    }
);

// 매월 2일 오전 09:05 KST (= UTC 00:05) 에 전달 MVP 자동 지급
exports.distributeMonthlyMvpRewardScheduled = onSchedule(
    { schedule: "5 0 2 * *", region: "asia-northeast3", timeoutSeconds: 60 },
    async () => {
        // KST 2일 → 전달 계산
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        // 현재 달의 1일로 이동 후 하루 빼면 전달 마지막 날
        const firstOfThisMonth = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
        const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
        const prevMonth = `${lastOfPrevMonth.getUTCFullYear()}-${String(lastOfPrevMonth.getUTCMonth() + 1).padStart(2, '0')}`;
        console.log(`⏰ 자동 MVP 지급 시작: ${prevMonth}`);
        await distributeMvpRewardForMonth(prevMonth, 'auto-scheduler');
    }
);

// ========================================
// 11. 오프체인 hbtBalance → coins 마이그레이션
// ========================================
exports.migrateHbtToCoins = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 120
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 관리자 확인 (본인 UID만 허용)
        const adminUids = ['YOUR_ADMIN_UID']; // 필요 시 수정
        const isAdmin = adminUids.includes(request.auth.uid);
        // 관리자가 아닌 경우 본인 계정만 마이그레이션
        const targetUid = isAdmin ? (request.data?.targetUid || null) : request.auth.uid;

        const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
        const habitContract = getHabitContract(provider);
        const results = [];

        async function migrateUser(uid) {
            const userRef = db.doc(`users/${uid}`);
            const userSnap = await userRef.get();
            if (!userSnap.exists) return null;

            const userData = userSnap.data();
            const hbtBalance = parseFloat(userData.hbtBalance || 0);
            if (hbtBalance <= 0) return { uid, hbtBalance: 0, converted: 0, skipped: true };

            // 온체인 잔액 + 스테이킹 잔액 조회
            let onChainHbt = 0;
            let stakedHbt = 0;
            const walletAddress = getEffectiveWalletAddress(userData);
            if (walletAddress) {
                try {
                    const rawBalance = await habitContract.balanceOf(walletAddress);
                    const rawStaked = await habitContract.challengeStakes(walletAddress);
                    onChainHbt = parseFloat(ethers.formatUnits(rawBalance, 8));
                    stakedHbt = parseFloat(ethers.formatUnits(rawStaked, 8));
                } catch (e) {
                    console.warn(`온체인 조회 실패 (${uid}):`, e.message);
                }
            }

            // 오프체인 초과분 = hbtBalance - (온체인 잔액 + 스테이킹)
            const realHbt = onChainHbt + stakedHbt;
            const offChainExcess = Math.max(0, hbtBalance - realHbt);

            if (offChainExcess <= 0) {
                // hbtBalance가 온체인보다 적거나 같으면 그냥 0으로 초기화
                await userRef.update({ hbtBalance: 0 });
                return { uid, hbtBalance, onChainHbt, stakedHbt, converted: 0, note: 'no excess' };
            }

            // 오프체인 초과분을 포인트(coins)로 전환
            const pointsToAdd = Math.round(offChainExcess);
            await userRef.update({
                hbtBalance: 0,
                coins: FieldValue.increment(pointsToAdd)
            });

            // 마이그레이션 기록
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: 'hbt_migration',
                offChainHbt: hbtBalance,
                onChainHbt,
                stakedHbt,
                convertedToCoins: pointsToAdd,
                network: ACTIVE_CHAIN.networkTag,
                timestamp: FieldValue.serverTimestamp(),
                status: 'success'
            });

            return { uid, hbtBalance, onChainHbt, stakedHbt, converted: pointsToAdd };
        }

        if (targetUid) {
            // 특정 유저만 마이그레이션
            const result = await migrateUser(targetUid);
            results.push(result);
        } else if (isAdmin) {
            // 전체 유저 마이그레이션
            const usersSnap = await db.collection("users").where("hbtBalance", ">", 0).get();
            for (const doc of usersSnap.docs) {
                const result = await migrateUser(doc.id);
                if (result) results.push(result);
            }
        }

        return { success: true, migrated: results.length, results };
    }
);

// ========================================
// 12. 주간 채굴 난이도 자동 조절 (매주 월요일 00:00 KST)
// ========================================

// 난이도 조절 상수
const RATE_SCALE = 100_000_000; // 10^8 (온체인 비율 스케일)
const MAX_RATE = 4.0;           // 1P = 최대 4 HBT
const MIN_RATE = 0.5;           // 최소 비율 (Phase 1 기준: 0.5 HBT/P)
const MAX_RATE_MULTIPLIER = 2.0; // 주당 최대 2배 상승
const MIN_RATE_MULTIPLIER = 0.5; // 주당 최소 절반 하락

// Phase 경계값 (HBT 단위)
const PHASE1_END = 35_000_000;
const PHASE2_END = 52_500_000;
const PHASE3_END = 61_250_000;
const MINING_POOL = 70_000_000;

// Phase별 주간 목표
const PHASE1_WEEKLY = 140_000;
const PHASE2_WEEKLY = 70_000;
const PHASE3_WEEKLY = 35_000;

/**
 * 누적 채굴량 기반 Phase 및 주간 목표 결정
 */
function getPhaseAndWeeklyTarget(totalMinedHbt) {
    if (totalMinedHbt < PHASE1_END) return { phase: 1, weeklyTarget: PHASE1_WEEKLY };
    if (totalMinedHbt < PHASE2_END) return { phase: 2, weeklyTarget: PHASE2_WEEKLY };
    if (totalMinedHbt < PHASE3_END) return { phase: 3, weeklyTarget: PHASE3_WEEKLY };

    // Phase 4+: 무한 반감
    let remaining = MINING_POOL - PHASE3_END;
    let extraMined = totalMinedHbt - PHASE3_END;
    let target = PHASE3_WEEKLY;
    let threshold = remaining / 2;
    let phase = 4;

    while (extraMined >= threshold && threshold > 0) {
        extraMined -= threshold;
        threshold /= 2;
        target /= 2;
        phase++;
    }
    if (target < 1) target = 1;
    return { phase, weeklyTarget: target };
}

/**
 * 새로운 P:HBT 교환 비율 계산
 */
function calculateNewRate(currentRate, last7DaysMinted, totalMinedHbt) {
    const { phase, weeklyTarget } = getPhaseAndWeeklyTarget(totalMinedHbt);

    // 조정 비율 계산
    let rawRatio;
    if (last7DaysMinted <= 0) {
        rawRatio = MAX_RATE_MULTIPLIER; // 채굴 없음 → 최대 상승
    } else {
        rawRatio = weeklyTarget / last7DaysMinted;
    }

    // 변동폭 제한 (Smoothing)
    let adjustmentRatio = rawRatio;
    let clamped = false;
    let clampReason = "";

    if (adjustmentRatio > MAX_RATE_MULTIPLIER) {
        adjustmentRatio = MAX_RATE_MULTIPLIER;
        clamped = true;
        clampReason = `상승 제한 (${rawRatio.toFixed(4)}x → ${MAX_RATE_MULTIPLIER}x)`;
    } else if (adjustmentRatio < MIN_RATE_MULTIPLIER) {
        adjustmentRatio = MIN_RATE_MULTIPLIER;
        clamped = true;
        clampReason = `하락 제한 (${rawRatio.toFixed(4)}x → ${MIN_RATE_MULTIPLIER}x)`;
    }

    let newRate = currentRate * adjustmentRatio;

    // Phase 동적 상한선/하한선 (반감기마다 절반)
    const phaseMultiplier = Math.pow(2, phase - 1);
    const effectiveMaxRate = MAX_RATE / phaseMultiplier;
    const effectiveMinRate = MIN_RATE / phaseMultiplier;

    if (newRate > effectiveMaxRate) {
        newRate = effectiveMaxRate;
        clamped = true;
        clampReason = `상한선 적용 (Phase ${phase}: → ${effectiveMaxRate} HBT/P)`;
    }
    if (newRate < effectiveMinRate) {
        newRate = effectiveMinRate;
        clamped = true;
        clampReason = `하한선 적용 (Phase ${phase}: → ${effectiveMinRate} HBT/P)`;
    }

    // 온체인 형식 변환 (RATE_SCALE = 10^8)
    let newRateScaled = Math.round(newRate * RATE_SCALE);
    if (newRateScaled < 1) newRateScaled = 1;

    return {
        newRate: parseFloat(newRate.toFixed(8)),
        newRateScaled,
        phase,
        weeklyTarget,
        adjustmentRatio: parseFloat(adjustmentRatio.toFixed(6)),
        rawRatio: parseFloat(rawRatio.toFixed(6)),
        clamped,
        clampReason
    };
}

/**
 * 매주 월요일 00:00 KST (일요일 15:00 UTC) 자동 실행
 * 지난 7일간 채굴량을 평가하고 온체인 교환 비율을 갱신합니다.
 */
exports.adjustMiningRate = onSchedule(
    {
        schedule: "0 15 * * 0",  // 매주 일요일 15:00 UTC = 월요일 00:00 KST
        timeZone: "UTC",
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        timeoutSeconds: 120,
        maxInstances: 1
    },
    async (event) => {
        console.log("⛏️ 주간 채굴 난이도 조절 시작...");
        const currentWeekId = getKstIsoWeekId();
        const decisionContext = {};

        try {
            // 멱등성 보장: Firestore mining_rate_history에 이번 주(weekId) 기록이 이미 있으면 스킵
            const existingRecord = await db.collection("mining_rate_history").doc(currentWeekId).get();
            if (existingRecord.exists && isCompletedRateDecision(existingRecord.data()?.status)) {
                console.log(`⏭️ 이미 이번 주(${currentWeekId}) 비율 조정 완료, 건너뜁니다.`);
                return;
            }

            await db.collection("mining_rate_history").doc(currentWeekId).set({
                weekId: currentWeekId,
                timestamp: FieldValue.serverTimestamp(),
                status: "evaluating",
                source: "scheduled",
                reason: "주간 마이닝 레이트 검토 중"
            }, { merge: true });

            // 1. 온체인 현재 상태 조회
            const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            const currentRateRaw = await habitContract.currentRate();
            const totalMintedRaw = await habitContract.totalMintedFromMining();
            const decimals = await habitContract.decimals();

            const currentRateNumber = Number(currentRateRaw) / RATE_SCALE; // HBT per P
            const totalMinedHbt = parseFloat(ethers.formatUnits(totalMintedRaw, decimals));
            decisionContext.previousRate = currentRateNumber;
            decisionContext.totalMinedHbt = totalMinedHbt;

            console.log(`📊 현재 비율: ${currentRateNumber} HBT/P (raw: ${currentRateRaw})`);
            console.log(`📊 누적 채굴량: ${totalMinedHbt.toLocaleString()} HBT`);

            // 2. 지난 7일간 실제 채굴량 조회 (blockchain_transactions)
            // startDateStr: 7일 전 KST 날짜 (포함), endDateStr: 어제 KST 날짜 (포함, 오늘 제외)
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const toKstDateStr = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
            const startDateStr = toKstDateStr(sevenDaysAgo);
            const endDateStr = toKstDateStr(yesterday);

            const txQuery = db.collection("blockchain_transactions")
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("network", "==", ACTIVE_CHAIN.networkTag)
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr);

            let txSnap;
            try {
                txSnap = await txQuery.get();
            } catch (queryError) {
                if (Number(queryError?.code) !== 9) throw queryError;
                console.warn("⚠️ network 복합 인덱스 준비 중: 기본 주간 거래 쿼리로 재시도합니다.");
                txSnap = await db.collection("blockchain_transactions")
                    .where("type", "==", "conversion")
                    .where("status", "==", "success")
                    .where("date", ">=", startDateStr)
                    .where("date", "<=", endDateStr)
                    .get();
            }
            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                const txData = doc.data();
                if (txData.network !== ACTIVE_CHAIN.networkTag) return;
                last7DaysMinted += txData.hbtReceived || 0;
                txCount++;
            });
            decisionContext.last7DaysMinted = last7DaysMinted;
            decisionContext.transactionCount = txCount;

            console.log(`📊 7일간 채굴량: ${last7DaysMinted.toLocaleString()} HBT (${txCount}건)`);

            // 3. 새 비율 계산
            const result = calculateNewRate(currentRateNumber, last7DaysMinted, totalMinedHbt);

            console.log(`📊 Phase: ${result.phase}, 주간 목표: ${result.weeklyTarget.toLocaleString()} HBT`);
            console.log(`📊 조정 배수: ${result.adjustmentRatio}x${result.clamped ? ` (${result.clampReason})` : ""}`);
            console.log(`📊 새 비율: ${result.newRate} HBT/P (raw: ${result.newRateScaled})`);

            // 4. 비율 변경이 없으면 스킵
            if (result.newRateScaled === Number(currentRateRaw)) {
                console.log("⏭️ 비율 변경 없음, 스킵합니다.");
                await saveRateHistory(
                    result,
                    currentRateNumber,
                    last7DaysMinted,
                    totalMinedHbt,
                    txCount,
                    null,
                    "no_change",
                    null,
                    { weekId: currentWeekId, documentId: currentWeekId, source: "scheduled" }
                );
                return;
            }

            // 5. 온체인 updateRate() 호출 (RateChangeExceedsLimit 시 이분탐색 재시도)
            let txHash = null;
            let attemptRateScaled = result.newRateScaled;
            const currentRateScaled = Number(currentRateRaw);

            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    const tx = await habitContract.updateRate(BigInt(attemptRateScaled));
                    const receipt = await tx.wait();
                    txHash = receipt.hash;
                    console.log(`✅ 온체인 비율 업데이트 완료! TX: ${EXPLORER_URL}/tx/${txHash}`);
                    break;
                } catch (chainError) {
                    const chainErrorMsg = chainError.message || "";
                    const isLimitError = chainErrorMsg.includes("RateChangeExceedsLimit") ||
                        chainErrorMsg.includes("rate change exceeds");
                    console.error(`❌ 온체인 updateRate 시도 ${attempt + 1} 실패:`, chainErrorMsg);
                    if (isLimitError && attempt < 3) {
                        const mid = Math.round((currentRateScaled + attemptRateScaled) / 2);
                        if (mid === currentRateScaled || mid === attemptRateScaled) {
                            console.log("⚠️ 이분탐색 더 이상 불가, 업데이트 중단.");
                            break;
                        }
                        attemptRateScaled = mid;
                        console.log(`🔄 이분탐색 재시도 (${currentRateScaled} → ${attemptRateScaled})`);
                    } else {
                        await saveRateHistory(
                            result,
                            currentRateNumber,
                            last7DaysMinted,
                            totalMinedHbt,
                            txCount,
                            null,
                            "chain_error",
                            chainErrorMsg,
                            { weekId: currentWeekId, documentId: currentWeekId, source: "scheduled" }
                        );
                        return;
                    }
                }
            }
            if (!txHash) {
                await saveRateHistory(
                    result,
                    currentRateNumber,
                    last7DaysMinted,
                    totalMinedHbt,
                    txCount,
                    null,
                    "chain_error",
                    "RateChangeExceedsLimit: 이분탐색 실패",
                    { weekId: currentWeekId, documentId: currentWeekId, source: "scheduled" }
                );
                return;
            }

            // 6. Firestore에 이력 저장
            await saveRateHistory(
                result,
                currentRateNumber,
                last7DaysMinted,
                totalMinedHbt,
                txCount,
                txHash,
                "success",
                null,
                { weekId: currentWeekId, documentId: currentWeekId, source: "scheduled" }
            );

            console.log("✅ 주간 채굴 난이도 조절 완료!");

        } catch (error) {
            console.error("❌ 주간 난이도 조절 오류:", error);
            try {
                await saveRateDecisionFailure({
                    weekId: currentWeekId,
                    documentId: currentWeekId,
                    source: "scheduled",
                    error,
                    ...decisionContext,
                });
            } catch (historyError) {
                console.error("❌ 마이닝 레이트 실패 이력 저장 오류:", historyError);
            }
        }
    }
);

/**
 * 비율 조정 이력 Firestore 저장
 */
async function saveRateHistory(
    result,
    previousRate,
    last7DaysMinted,
    totalMinedHbt,
    txCount,
    txHash,
    status,
    errorMessage,
    options = {}
) {
    const weekId = options.weekId || getKstIsoWeekId();
    const documentId = options.documentId || weekId;
    const reasonByStatus = {
        success: "주간 검토 완료 · 레이트 조정",
        no_change: "주간 검토 완료 · 변동 없음",
        chain_error: "주간 검토 완료 · 온체인 반영 실패",
        manual: "관리자 수동 검토 완료",
    };

    await db.collection("mining_rate_history").doc(documentId).set({
        weekId,
        timestamp: FieldValue.serverTimestamp(),
        source: options.source || "scheduled",
        previousRate,
        newRate: result.newRate,
        newRateScaled: result.newRateScaled,
        phase: result.phase,
        weeklyTarget: result.weeklyTarget,
        last7DaysMinted,
        totalMinedHbt,
        transactionCount: txCount,
        adjustmentRatio: result.adjustmentRatio,
        rawRatio: result.rawRatio,
        clamped: result.clamped,
        clampReason: result.clampReason || "",
        txHash: txHash || null,
        status,
        reason: reasonByStatus[status] || "마이닝 레이트 검토",
        errorMessage: errorMessage || null
    }, { merge: true });
}

async function saveRateDecisionFailure({
    weekId = getKstIsoWeekId(),
    documentId = weekId,
    source = "scheduled",
    error,
    previousRate = null,
    totalMinedHbt = null,
    last7DaysMinted = null,
    transactionCount = null,
}) {
    const errorMessage = String(error?.message || error || "Unknown error").slice(0, 1500);
    await db.collection("mining_rate_history").doc(documentId).set({
        weekId,
        timestamp: FieldValue.serverTimestamp(),
        source,
        status: "error",
        reason: "주간 검토 실패",
        errorMessage,
        previousRate,
        totalMinedHbt,
        last7DaysMinted,
        transactionCount,
    }, { merge: true });
}

/**
 * 수동 채굴 난이도 조절 (관리자용)
 * adjustMiningRate 스케줄러와 동일한 로직을 즉시 실행합니다.
 */
exports.adjustMiningRateManual = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 120
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 관리자 확인
        const adminDoc = await db.doc("admins/" + request.auth.uid).get();
        if (!adminDoc.exists) {
            throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
        }

        try {
            const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            const currentRateRaw = await habitContract.currentRate();
            const totalMintedRaw = await habitContract.totalMintedFromMining();
            const decimals = await habitContract.decimals();

            const currentRateNumber = Number(currentRateRaw) / RATE_SCALE;
            const totalMinedHbt = parseFloat(ethers.formatUnits(totalMintedRaw, decimals));

            // 7일간 채굴량 조회
            const now = new Date();
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const toKstDateStr = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
            const startDateStr = toKstDateStr(sevenDaysAgo);
            const endDateStr = toKstDateStr(now);

            const txQuery = db.collection("blockchain_transactions")
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("network", "==", ACTIVE_CHAIN.networkTag)
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr);

            let txSnap;
            try {
                txSnap = await txQuery.get();
            } catch (queryError) {
                if (Number(queryError?.code) !== 9) throw queryError;
                txSnap = await db.collection("blockchain_transactions")
                    .where("type", "==", "conversion")
                    .where("status", "==", "success")
                    .where("date", ">=", startDateStr)
                    .where("date", "<=", endDateStr)
                    .get();
            }

            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                const txData = doc.data();
                if (txData.network !== ACTIVE_CHAIN.networkTag) return;
                last7DaysMinted += txData.hbtReceived || 0;
                txCount++;
            });

            const result = calculateNewRate(currentRateNumber, last7DaysMinted, totalMinedHbt);

            // dryRun 모드: 계산만 하고 실제 온체인 갱신은 안 함
            if (request.data?.dryRun) {
                return {
                    dryRun: true,
                    currentRate: currentRateNumber,
                    ...result,
                    last7DaysMinted,
                    totalMinedHbt,
                    transactionCount: txCount
                };
            }

            // 온체인 비율 갱신 (RateChangeExceedsLimit 시 이분탐색 재시도)
            if (result.newRateScaled !== Number(currentRateRaw)) {
                let txHash = null;
                let attemptRateScaled = result.newRateScaled;
                const currentRateScaled = Number(currentRateRaw);

                for (let attempt = 0; attempt < 4; attempt++) {
                    try {
                        const tx = await habitContract.updateRate(BigInt(attemptRateScaled));
                        const receipt = await tx.wait();
                        txHash = receipt.hash;
                        break;
                    } catch (chainError) {
                        const chainErrorMsg = chainError.message || "";
                        const isLimitError = chainErrorMsg.includes("RateChangeExceedsLimit") ||
                            chainErrorMsg.includes("rate change exceeds");
                        if (isLimitError && attempt < 3) {
                            const mid = Math.round((currentRateScaled + attemptRateScaled) / 2);
                            if (mid === currentRateScaled || mid === attemptRateScaled) break;
                            attemptRateScaled = mid;
                        } else {
                            throw chainError;
                        }
                    }
                }
                await saveRateHistory(
                    result,
                    currentRateNumber,
                    last7DaysMinted,
                    totalMinedHbt,
                    txCount,
                    txHash,
                    "manual",
                    null,
                    {
                        weekId: getKstIsoWeekId(),
                        documentId: `manual_${Date.now()}`,
                        source: "manual",
                    }
                );
                return {
                    success: true,
                    txHash,
                    currentRate: currentRateNumber,
                    ...result,
                    last7DaysMinted,
                    totalMinedHbt,
                    transactionCount: txCount
                };
            }

            await saveRateHistory(
                result,
                currentRateNumber,
                last7DaysMinted,
                totalMinedHbt,
                txCount,
                null,
                "no_change",
                null,
                {
                    weekId: getKstIsoWeekId(),
                    documentId: `manual_${Date.now()}`,
                    source: "manual",
                }
            );
            return {
                success: true,
                noChange: true,
                currentRate: currentRateNumber,
                ...result,
                last7DaysMinted,
                totalMinedHbt,
                transactionCount: txCount
            };

        } catch (error) {
            console.error("수동 난이도 조절 오류:", error);
            throw new HttpsError("internal", "난이도 조절 중 오류가 발생했습니다: " + error.message);
        }
    }
);

/**
 * 커뮤니티 통계를 수동으로 새로고침 (관리자 전용)
 */
exports.refreshCommunityStats = onCall(
    { region: "asia-northeast3", timeoutSeconds: 120 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const adminDoc = await db.doc(`admins/${request.auth.uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자만 가능");
        await computeCommunityStatsLogic();
        return { success: true };
    }
);

async function computeCommunityStatsLogic() {
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kst = new Date(now.getTime() + kstOffset);
    const year = kst.getUTCFullYear();
    const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
    const monthStart = `${year}-${month}-01`;
    const monthEnd = `${year}-${month}-31`;

    const snap = await db.collection("daily_logs")
        .where("date", ">=", monthStart)
        .where("date", "<=", monthEnd)
        .get();

    const userStats = {};
    const userDates = {};
    snap.forEach(d => {
        const log = d.data();
        if (!log.userId) return;
        const uid = log.userId;
        if (!userStats[uid]) userStats[uid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: log.userName || "익명" };
        userStats[uid].days++;
        if (log.userName) userStats[uid].name = log.userName;
        if (log.awardedPoints?.diet) userStats[uid].diet++;
        if (log.awardedPoints?.exercise) userStats[uid].exercise++;
        if (log.awardedPoints?.mind) userStats[uid].mind++;
        if (!userDates[uid]) userDates[uid] = new Set();
        userDates[uid].add(log.date);

        if (log.comments && Array.isArray(log.comments)) {
            getUniqueCommentUserIds(log).forEach((commenterUid) => {
                const commentEntry = log.comments.find((comment) => comment?.userId === commenterUid) || {};
                if (!userStats[commenterUid]) {
                    userStats[commenterUid] = {
                        days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0,
                        name: commentEntry.userName || "익명"
                    };
                }
                userStats[commenterUid].comments++;
            });
        }
        if (log.reactions) {
            getUniqueReactionUserIds(log).forEach((reactorUid) => {
                if (!userStats[reactorUid]) {
                    userStats[reactorUid] = {
                        days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0,
                        name: "회원"
                    };
                }
                userStats[reactorUid].reactions++;
            });
        }
    });

    let bestStreak = 0, bestStreakName = "";
    Object.entries(userDates).forEach(([uid, dates]) => {
        const sorted = [...dates].sort();
        let streak = 1, maxS = 1;
        for (let i = 1; i < sorted.length; i++) {
            const diff = (new Date(sorted[i] + "T12:00:00Z") - new Date(sorted[i - 1] + "T12:00:00Z")) / 86400000;
            streak = diff === 1 ? streak + 1 : 1;
            if (streak > maxS) maxS = streak;
        }
        if (maxS > bestStreak) { bestStreak = maxS; bestStreakName = userStats[uid]?.name || "익명"; }
    });

    const active = Object.values(userStats).filter(u => u.days > 0);
    const pick = (field) => active.reduce((best, u) => u[field] > (best?.[field] || 0) ? u : best, null);
    const dietKing = pick("diet");
    const exerciseKing = pick("exercise");
    const mindKing = pick("mind");

    Object.values(userStats).forEach(u => { u.score = u.days * 10 + u.comments * 3 + u.reactions; });
    const ranked = Object.entries(userStats)
        .map(([userId, s]) => ({ userId, ...s }))
        .filter(u => u.days > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const totalUsers = Object.keys(userStats).filter(uid => userStats[uid].days > 0).length;
    const totalDays = Object.values(userStats).reduce((s, u) => s + u.days, 0);
    const totalComments = Object.values(userStats).reduce((s, u) => s + u.comments, 0);
    const totalReactions = Object.values(userStats).reduce((s, u) => s + u.reactions, 0);

    let newMemberCount = 0;
    try {
        // 이번 달 1일에서 하루 빼면 안전하게 전달 말일을 구할 수 있음
        // setUTCMonth(month - 1)은 말일이 29~31일이면 오버플로 발생 (예: 3/31 → 2월로 설정 시 3/3으로 변환됨)
        const firstOfThisMonth = new Date(Date.UTC(year, kst.getUTCMonth(), 1));
        const lastMonthDate = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
        const pYear = lastMonthDate.getUTCFullYear();
        const pMonth = String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0");
        const pStart = `${pYear}-${pMonth}-01`;
        const pEnd = `${pYear}-${pMonth}-31`;
        const prevSnap = await db.collection("daily_logs").where("date", ">=", pStart).where("date", "<=", pEnd).get();
        const prevUsers = new Set();
        prevSnap.forEach(d => { if (d.data().userId) prevUsers.add(d.data().userId); });
        const thisUsers = new Set(Object.keys(userStats).filter(uid => userStats[uid].days > 0));
        newMemberCount = [...thisUsers].filter(uid => !prevUsers.has(uid)).length;
    } catch (_) {}

    const currentMonth = `${year}-${month}`;
    const newStats = {
        month: currentMonth,
        totalUsers, totalDays, totalComments, totalReactions,
        newMemberCount, bestStreak, bestStreakName,
        dietKing: dietKing ? { name: dietKing.name, count: dietKing.diet } : null,
        exerciseKing: exerciseKing ? { name: exerciseKing.name, count: exerciseKing.exercise } : null,
        mindKing: mindKing ? { name: mindKing.name, count: mindKing.mind } : null,
        ranked: ranked.map(r => ({ name: r.name, days: r.days, comments: r.comments, reactions: r.reactions, score: r.score })),
        updatedAt: FieldValue.serverTimestamp()
    };

    // 월이 바뀌면 기존 데이터를 아카이브에 저장
    try {
        const existing = await db.doc("meta/communityStats").get();
        if (existing.exists) {
            const prevData = existing.data();
            if (prevData.month && prevData.month !== currentMonth) {
                await db.doc(`communityStats_archive/${prevData.month}`).set(prevData);
                console.log(`📦 커뮤니티 통계 아카이브 저장: ${prevData.month}`);
            }
        }
    } catch (e) {
        console.warn("아카이브 저장 실패 (무시):", e.message);
    }

    await db.doc("meta/communityStats").set(newStats);
    console.log(`✅ communityStats ${currentMonth} 업데이트 완료: ${totalUsers}명, ${snap.size}건 처리`);
}

/**
 * 커뮤니티 월간 통계 사전 계산 (1시간마다)
 * 결과를 meta/communityStats 문서에 저장하여 클라이언트가 문서 1개만 읽으면 됨
 */
exports.computeCommunityStats = onSchedule(
    { schedule: "every 1 hours", region: "asia-northeast3", timeoutSeconds: 120 },
    async () => { await computeCommunityStatsLogic(); }
);

/**
 * 특정 달의 커뮤니티 통계를 communityStats_archive에 백필 (관리자 전용, 1회성)
 */
exports.backfillCommunityStatsArchive = onCall(
    { region: "asia-northeast3", timeoutSeconds: 120 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const adminDoc = await db.doc(`admins/${request.auth.uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자만 가능");

        const { targetMonth } = request.data;
        if (!targetMonth || !/^\d{4}-\d{2}$/.test(targetMonth)) {
            throw new HttpsError("invalid-argument", "유효하지 않은 월 형식 (YYYY-MM)");
        }

        const [year, mon] = targetMonth.split("-").map(Number);
        const monthStart = `${targetMonth}-01`;
        const monthEnd = `${targetMonth}-31`;

        const snap = await db.collection("daily_logs")
            .where("date", ">=", monthStart)
            .where("date", "<=", monthEnd)
            .get();

        const userStats = {};
        const userDates = {};
        snap.forEach(d => {
            const log = d.data();
            if (!log.userId) return;
            const uid = log.userId;
            if (!userStats[uid]) userStats[uid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: log.userName || "익명" };
            userStats[uid].days++;
            if (log.userName) userStats[uid].name = log.userName;
            if (log.awardedPoints?.diet) userStats[uid].diet++;
            if (log.awardedPoints?.exercise) userStats[uid].exercise++;
            if (log.awardedPoints?.mind) userStats[uid].mind++;
            if (!userDates[uid]) userDates[uid] = new Set();
            userDates[uid].add(log.date);
            if (log.comments && Array.isArray(log.comments)) {
                getUniqueCommentUserIds(log).forEach((commenterUid) => {
                    const commentEntry = log.comments.find((comment) => comment?.userId === commenterUid) || {};
                    if (!userStats[commenterUid]) {
                        userStats[commenterUid] = {
                            days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0,
                            name: commentEntry.userName || "익명"
                        };
                    }
                    userStats[commenterUid].comments++;
                });
            }
            if (log.reactions) {
                getUniqueReactionUserIds(log).forEach((reactorUid) => {
                    if (!userStats[reactorUid]) {
                        userStats[reactorUid] = {
                            days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0,
                            name: "회원"
                        };
                    }
                    userStats[reactorUid].reactions++;
                });
            }
        });

        let bestStreak = 0, bestStreakName = "";
        Object.entries(userDates).forEach(([uid, dates]) => {
            const sorted = [...dates].sort();
            let streak = 1, maxS = 1;
            for (let i = 1; i < sorted.length; i++) {
                const diff = (new Date(sorted[i] + "T12:00:00Z") - new Date(sorted[i - 1] + "T12:00:00Z")) / 86400000;
                streak = diff === 1 ? streak + 1 : 1;
                if (streak > maxS) maxS = streak;
            }
            if (maxS > bestStreak) { bestStreak = maxS; bestStreakName = userStats[uid]?.name || "익명"; }
        });

        const active = Object.values(userStats).filter(u => u.days > 0);
        const pick = (field) => active.reduce((best, u) => u[field] > (best?.[field] || 0) ? u : best, null);
        const dietKing = pick("diet");
        const exerciseKing = pick("exercise");
        const mindKing = pick("mind");

        Object.values(userStats).forEach(u => { u.score = u.days * 10 + u.comments * 3 + u.reactions; });
        const ranked = Object.entries(userStats)
            .map(([userId, s]) => ({ userId, ...s }))
            .filter(u => u.days > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3);

        const totalUsers = Object.keys(userStats).filter(uid => userStats[uid].days > 0).length;
        const totalDays = Object.values(userStats).reduce((s, u) => s + u.days, 0);
        const totalComments = Object.values(userStats).reduce((s, u) => s + u.comments, 0);
        const totalReactions = Object.values(userStats).reduce((s, u) => s + u.reactions, 0);

        // 이전 달 신규 회원 계산
        let newMemberCount = 0;
        try {
            const firstOfThisMonth = new Date(Date.UTC(year, mon - 1, 1));
            const lastMonthDate = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
            const pYear = lastMonthDate.getUTCFullYear();
            const pMonth = String(lastMonthDate.getUTCMonth() + 1).padStart(2, "0");
            const prevSnap = await db.collection("daily_logs")
                .where("date", ">=", `${pYear}-${pMonth}-01`)
                .where("date", "<=", `${pYear}-${pMonth}-31`)
                .get();
            const prevUsers = new Set();
            prevSnap.forEach(d => { if (d.data().userId) prevUsers.add(d.data().userId); });
            const thisUsers = new Set(Object.keys(userStats).filter(uid => userStats[uid].days > 0));
            newMemberCount = [...thisUsers].filter(uid => !prevUsers.has(uid)).length;
        } catch (_) {}

        const archiveData = {
            month: targetMonth,
            totalUsers, totalDays, totalComments, totalReactions,
            newMemberCount, bestStreak, bestStreakName,
            dietKing: dietKing ? { name: dietKing.name, count: dietKing.diet } : null,
            exerciseKing: exerciseKing ? { name: exerciseKing.name, count: exerciseKing.exercise } : null,
            mindKing: mindKing ? { name: mindKing.name, count: mindKing.mind } : null,
            ranked: ranked.map(r => ({ name: r.name, days: r.days, comments: r.comments, reactions: r.reactions, score: r.score })),
            updatedAt: FieldValue.serverTimestamp()
        };

        await db.doc(`communityStats_archive/${targetMonth}`).set(archiveData);
        console.log(`✅ 백필 완료: communityStats_archive/${targetMonth} (${totalUsers}명, ${snap.size}건)`);
        return { success: true, totalUsers, totalDays };
    }
);

// 대시보드 데이터 일괄 조회 (모바일 로딩 최적화: 4개 쿼리 → 1 HTTP 호출)
exports.getDashboardData = onCall(
    { region: "asia-northeast3", timeoutSeconds: 10 },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const uid = request.auth.uid;
        const { weekStart, weekEnd } = request.data || {};
        if (!weekStart || !weekEnd) throw new HttpsError("invalid-argument", "weekStart, weekEnd 필수");

        const [userSnap, weekSnap, streakSnap, statsSnap] = await Promise.all([
            db.doc(`users/${uid}`).get(),
            db.collection("daily_logs")
                .where("userId", "==", uid)
                .where("date", ">=", weekStart)
                .where("date", "<=", weekEnd)
                .get(),
            db.collection("daily_logs")
                .where("userId", "==", uid)
                .orderBy("date", "desc")
                .limit(30)
                .get(),
            db.doc("meta/communityStats").get()
        ]);

        const user = userSnap.exists ? userSnap.data() : {};
        const weekLogs = [];
        weekSnap.forEach(d => {
            const dd = d.data();
            weekLogs.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} });
        });
        const streakLogs = [];
        streakSnap.forEach(d => {
            const dd = d.data();
            streakLogs.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} });
        });
        const communityStats = statsSnap.exists ? statsSnap.data() : null;

        return { user, weekLogs, streakLogs, communityStats };
    }
);

// ========================================
// 미활동 유저 재참여 이메일 발송
// ========================================
exports.sendReEngagementEmails = onCall(
    {
        secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 300,
        invoker: "public"
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        // 관리자 권한 확인
        const adminSnap = await db.collection("admins").doc(request.auth.uid).get();
        if (!adminSnap.exists) {
            throw new HttpsError("permission-denied", "관리자 권한이 필요합니다.");
        }

        const { days, preview } = request.data;
        if (![3, 7].includes(days)) {
            throw new HttpsError("invalid-argument", "days는 3 또는 7이어야 합니다.");
        }

        // 기준 날짜 계산 (KST)
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const cutoffDate = new Date(kst);
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10); // YYYY-MM-DD

        // 전체 유저 목록 조회
        const usersSnap = await db.collection("users").get();
        const allUids = usersSnap.docs.map(d => d.id);

        // 각 유저의 최근 daily_log 날짜 조회
        const inactiveUids = [];
        await Promise.all(allUids.map(async (uid) => {
            const logSnap = await db.collection("daily_logs")
                .where("userId", "==", uid)
                .orderBy("date", "desc")
                .limit(1)
                .get();

            let lastDate = null;
            if (!logSnap.empty) {
                lastDate = logSnap.docs[0].data().date;
            }

            // 한 번도 기록 없거나 기준일 이전이면 대상
            if (!lastDate || lastDate < cutoffStr) {
                inactiveUids.push(uid);
            }
        }));

        // 각 유저의 이메일 + 이름 조회
        const targets = [];
        await Promise.all(inactiveUids.map(async (uid) => {
            try {
                // Firestore에서 먼저 시도 (로그인한 적 있는 유저)
                const userDoc = usersSnap.docs.find(d => d.id === uid);
                const userData = userDoc ? userDoc.data() : {};
                const name = userData.customDisplayName || userData.displayName || '회원';
                let email = userData.email || '';

                // email이 없으면 Firebase Auth에서 조회
                if (!email) {
                    try {
                        const authUser = await admin.auth().getUser(uid);
                        email = authUser.email || '';
                    } catch (_) {}
                }

                if (email) {
                    targets.push({ uid, name, email });
                }
            } catch (_) {}
        }));

        // preview 모드: 발송 안 하고 대상자 목록만 반환
        if (preview) {
            return {
                count: targets.length,
                targets: targets.map(t => ({ name: t.name, email: t.email }))
            };
        }

        // 이메일 발송
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: GMAIL_USER.value(),
                pass: GMAIL_APP_PASSWORD.value()
            }
        });

        const sendResults = await Promise.allSettled(targets.map(async (t) => {
            const subject = days === 3
                ? `[해빛스쿨] ${t.name}님, 오늘 건강 기록은 어떠세요? 🌟`
                : `[해빛스쿨] ${t.name}님이 보고 싶어요 💙`;

            const html = days === 3 ? `
<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#f9a825,#ff7043);padding:32px 24px;text-align:center;">
    <img src="${APP_ICON_URL}" width="60" style="border-radius:12px;" alt="해빛스쿨"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">오늘의 건강 기록 🌟</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">작은 기록이 큰 변화를 만들어요</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;"><strong>${t.name}</strong>님, 안녕하세요 👋</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">최근 3일간 해빛스쿨에 기록이 없으셨어요.<br>오늘 식단, 운동, 수면 기록 한 번만 해도 스트릭이 이어져요!</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_BASE_URL}" style="background:linear-gradient(135deg,#f9a825,#ff7043);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">지금 기록하러 가기 →</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">꾸준한 기록이 건강한 습관을 만듭니다 💪</p>
  </div>
</div>` : `
<div style="font-family:Apple SD Gothic Neo,Malgun Gothic,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #f0f0f0;">
  <div style="background:linear-gradient(135deg,#1565c0,#42a5f5);padding:32px 24px;text-align:center;">
    <img src="${APP_ICON_URL}" width="60" style="border-radius:12px;" alt="해빛스쿨"/>
    <h2 style="color:#fff;margin:16px 0 4px;font-size:22px;">${t.name}님이 보고 싶어요 💙</h2>
    <p style="color:rgba(255,255,255,0.9);margin:0;font-size:15px;">함께하는 건강 여정을 기다리고 있어요</p>
  </div>
  <div style="padding:28px 24px;">
    <p style="font-size:16px;color:#333;line-height:1.6;"><strong>${t.name}</strong>님, 잘 지내고 계신가요? 💙</p>
    <p style="font-size:15px;color:#555;line-height:1.7;">7일 이상 기록이 없으셨네요. 바쁘셨던 거 알아요.<br>오늘 다시 시작해도 늦지 않아요. 해빛스쿨이 응원합니다!</p>
    <div style="background:#f8f9ff;border-radius:12px;padding:16px;margin:20px 0;text-align:center;">
      <p style="margin:0;font-size:14px;color:#666;">다시 시작하면 <strong style="color:#1565c0;">복귀 보너스 포인트</strong>가 기다려요 🎁</p>
    </div>
    <div style="text-align:center;margin:28px 0;">
      <a href="${APP_BASE_URL}" style="background:linear-gradient(135deg,#1565c0,#42a5f5);color:#fff;text-decoration:none;padding:14px 36px;border-radius:50px;font-size:16px;font-weight:600;display:inline-block;">해빛스쿨로 돌아가기 →</a>
    </div>
    <p style="font-size:13px;color:#aaa;text-align:center;">당신의 건강한 하루를 함께 만들어가고 싶어요 🌱</p>
  </div>
</div>`;

            await transporter.sendMail({
                from: `"해빛스쿨" <${GMAIL_USER.value()}>`,
                to: t.email,
                subject,
                html
            });

            // 발송 이력 저장
            await db.collection("emailLogs").doc(t.uid).set({
                lastSentAt: FieldValue.serverTimestamp(),
                lastSentDays: days,
                sentCount: FieldValue.increment(1)
            }, { merge: true });

            console.log(`✅ 이메일 발송: ${t.email} (${t.name})`);
        }));

        const sentCount = sendResults.filter(r => r.status === "fulfilled").length;
        const errors = sendResults
            .map((r, i) => r.status === "rejected" ? { email: targets[i].email, error: r.reason?.message } : null)
            .filter(Boolean);
        sendResults.forEach((r, i) => {
            if (r.status === "rejected") console.error(`❌ 이메일 실패: ${targets[i].email}`, r.reason?.message);
        });

        return { sentCount, totalTargets: targets.length, errors };
    }
);

// ========================================
// 푸시 알림 — 일일 기록 알림 + 연속 습관 달성 위기 알림
// ========================================

/**
 * KST 기준 오늘 날짜 문자열 (YYYY-MM-DD)
 */
function getTodayKST() {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10);
}

/**
 * 오늘 기록한 userId Set 조회
 */
async function getTodayLoggedUserIds(todayKST) {
    const snap = await db.collection("daily_logs")
        .where("date", "==", todayKST)
        .select("userId")
        .get();
    return new Set(snap.docs.map(d => d.data().userId).filter(Boolean));
}

async function reserveNotificationDeliveries(targets = [], {
    dateStr = getTodayKST(),
    kind = "habit-reminder",
} = {}) {
    const uniqueUserIds = [...new Set((targets || []).map((target) => target?.uid).filter(Boolean))];
    const decisions = await Promise.all(uniqueUserIds.map(async (uid) => {
        const ledgerId = buildNotificationLedgerId(uid, dateStr, kind);
        const ledgerRef = db.doc(`notification_delivery_ledger/${ledgerId}`);
        try {
            return await db.runTransaction(async (tx) => {
                const snapshot = await tx.get(ledgerRef);
                if (snapshot.exists) return false;
                tx.create(ledgerRef, {
                    userId: uid,
                    date: dateStr,
                    kind,
                    status: "reserved",
                    reservedAt: FieldValue.serverTimestamp(),
                });
                return true;
            });
        } catch (error) {
            console.warn(`notification ledger reservation skipped (${kind}/${uid}):`, error.message);
            return false;
        }
    }));
    const reservedUserIds = new Set(uniqueUserIds.filter((_, index) => decisions[index] === true));
    return (targets || []).filter((target) => reservedUserIds.has(target?.uid));
}

async function getPersonalizedReminderUsers(currentHourKst) {
    const snapshot = await db.collection("users")
        .where("settings.reminderPreference.enabled", "==", true)
        .select("settings")
        .get();
    return snapshot.docs
        .map((docSnapshot) => ({
            uid: docSnapshot.id,
            preference: normalizeReminderPreference(docSnapshot.data() || {}),
        }))
        .filter(({ preference }) => preference.enabled && preference.hourKst === currentHourKst);
}

function buildPersonalizedReminderPayload(locale, category) {
    const target = getReminderTarget(category);
    const url = buildLocalizedAppPath(locale, target.tab, { focus: target.focus, source: "habit-reminder" });
    const english = normalizeLocale(locale) === "en";
    const copy = {
        diet: english
            ? ["Ready for today’s meal record?", "One food photo is enough to keep the habit going."]
            : ["오늘 식단을 기록할 시간이에요", "음식 사진 한 장이면 건강 습관을 이어갈 수 있어요."],
        exercise: english
            ? ["Ready for today’s movement record?", "Add your steps or one workout photo to keep going."]
            : ["오늘 움직임을 기록할 시간이에요", "걸음수나 운동 사진 하나로 흐름을 이어가세요."],
        sleep: english
            ? ["Ready for today’s mind record?", "A sleep capture or five-minute meditation is enough."]
            : ["오늘 마음을 돌볼 시간이에요", "수면 캡처나 5분 명상 하나면 충분해요."],
    }[category] || null;
    return {
        title: copy?.[0] || (english ? "Ready for today’s record?" : "오늘 기록할 시간이에요"),
        body: copy?.[1] || (english ? "A small record keeps the habit going." : "작은 기록 하나로 습관을 이어가세요."),
        tag: "habit-reminder",
        url,
        actions: buildNotificationActions([
            { action: "record-now", title: english ? "Record now" : "지금 기록", url }
        ]),
    };
}

const DIET_PROGRAM_METHOD_IDS = Object.freeze({
    NONE: "none",
    INTERMITTENT_FASTING: "intermittent_fasting"
});

function normalizeDietProgramPreference(userData = {}) {
    const rawDietPreference = userData?.programPreferences?.diet || {};
    const methodId = typeof rawDietPreference.methodId === "string"
        ? rawDietPreference.methodId.trim()
        : "";
    const normalizedMethodId = methodId || DIET_PROGRAM_METHOD_IDS.NONE;
    return {
        methodId: normalizedMethodId,
        remindersEnabled: rawDietPreference.remindersEnabled === true
    };
}

function isLoggedDietSlot(dailyLog = {}, slot = "") {
    const url = dailyLog?.diet?.[`${slot}Url`];
    return typeof url === "string" && url.trim().length > 0;
}

async function getDailyLogMapForUsers(userIds = [], dateStr = "") {
    const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
    if (uniqueUserIds.length === 0 || !dateStr) return new Map();

    const refs = uniqueUserIds.map((uid) => db.doc(`daily_logs/${uid}_${dateStr}`));
    const snaps = await db.getAll(...refs);
    const logMap = new Map();
    snaps.forEach((snap, index) => {
        logMap.set(uniqueUserIds[index], snap.exists ? (snap.data() || {}) : {});
    });
    return logMap;
}

async function getDietReminderEligibleUsers({ intermittentFasting = false } = {}) {
    const usersSnap = await db.collection("users")
        .where("programPreferences.diet.remindersEnabled", "==", true)
        .select("programPreferences")
        .get();

    return usersSnap.docs
        .map((snap) => ({
            uid: snap.id,
            preference: normalizeDietProgramPreference(snap.data() || {})
        }))
        .filter(({ preference }) => {
            if (!preference.remindersEnabled) return false;
            if (intermittentFasting) {
                return preference.methodId === DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING;
            }
            return preference.methodId !== DIET_PROGRAM_METHOD_IDS.NONE
                && preference.methodId !== DIET_PROGRAM_METHOD_IDS.INTERMITTENT_FASTING;
        });
}

async function sendDietProgramReminder({
    intermittentFasting = false,
    slot = "",
    title = "",
    titleEn = "",
    body = "",
    bodyEn = "",
    tag = "diet-program",
    focus = "upload"
} = {}) {
    const todayKST = getTodayKST();
    const eligibleUsers = await getDietReminderEligibleUsers({ intermittentFasting });
    if (eligibleUsers.length === 0) {
        console.log(`${tag}: no eligible users`);
        return 0;
    }

    const eligibleUserIds = eligibleUsers.map((entry) => entry.uid);
    const logMap = await getDailyLogMapForUsers(eligibleUserIds, todayKST);
    const targetUserIds = eligibleUserIds.filter((uid) => {
        if (!slot) return true;
        return !isLoggedDietSlot(logMap.get(uid), slot);
    });

    if (targetUserIds.length === 0) {
        console.log(`${tag}: no remaining users after slot filter`);
        return 0;
    }

    let targets = await collectPushTargetsForUsers(targetUserIds);
    if (targets.length === 0) {
        console.log(`${tag}: no push targets`);
        return 0;
    }

    targets = await reserveNotificationDeliveries(targets, {
        dateStr: todayKST,
        kind: `diet-program-${tag}`,
    });
    if (targets.length === 0) {
        console.log(`${tag}: already reserved today`);
        return 0;
    }

    await sendLocalizedMulticast(targets, (locale) => {
        const reminderUrl = buildLocalizedAppPath(locale, "diet", { focus, source: tag });
        const en = normalizeLocale(locale) === "en";
        return {
            title: en ? (titleEn || title) : title,
            body: en ? (bodyEn || body) : body,
            tag,
            url: reminderUrl,
            actions: buildNotificationActions([
                { action: "record-now", title: en ? "Record now" : "지금 기록", url: reminderUrl }
            ])
        };
    });
    console.log(`${tag}: ${targets.length} targets`);
    return targets.length;
}

/**
 * FCM 일괄 발송 (500개 청크 분할)
 * 유효하지 않은 토큰은 Firestore에서 자동 삭제
 */
async function sendMulticast(targets, payload) {
    if (!Array.isArray(targets) || targets.length === 0) return;
    const {
        title = "",
        body = "",
        tag = "general",
        url = "/",
        icon = APP_ICON_URL,
        actions = [],
        requireInteraction = false,
        badgeCount = null
    } = payload || {};
    const normalizedActions = buildNotificationActions(actions);
    const actionUrls = normalizedActions.reduce((acc, action) => {
        if (action.url) acc[action.action] = action.url;
        return acc;
    }, {});
    const CHUNK = 500;
    for (let i = 0; i < targets.length; i += CHUNK) {
        const chunkTargets = targets.slice(i, i + CHUNK);
        const chunkTokens = chunkTargets.map((target) => target.token);
        const res = await admin.messaging().sendEachForMulticast({
            tokens: chunkTokens,
            data: {
                title,
                body,
                tag,
                url,
                icon,
                actions: JSON.stringify(normalizedActions.map(({ action, title }) => ({ action, title }))),
                actionUrls: JSON.stringify(actionUrls),
                requireInteraction: requireInteraction ? "true" : "false",
                badgeCount: badgeCount == null ? "" : String(badgeCount)
            },
            webpush: {
                fcmOptions: {
                    link: url.startsWith("http") ? url : `${APP_BASE_URL}${url}`
                }
            }
        });
        // 유효하지 않은 토큰 정리
        const deletes = [];
        res.responses.forEach((r, idx) => {
            if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
                const target = chunkTargets[idx];
                (target?.tokenDocRefs || []).forEach((ref) => {
                    deletes.push(ref.delete());
                });
                (target?.legacyUserRefs || []).forEach((ref) => {
                    deletes.push(ref.set({ fcmToken: FieldValue.delete() }, { merge: true }));
                });
            }
        });
        if (deletes.length) await Promise.allSettled(deletes);
        console.log(`FCM chunk ${i / CHUNK + 1}: ${res.successCount} 성공, ${res.failureCount} 실패`);
    }
}

/**
 * 매일 저녁 8시 KST (UTC 11:00) — 오늘 기록 없는 유저에게 알림
 */
exports.sendReEngagementEmailsV2 = onCall(
    {
        secrets: [GMAIL_USER, GMAIL_APP_PASSWORD],
        region: "asia-northeast3",
        maxInstances: 1,
        timeoutSeconds: 300,
        invoker: "public"
    },
    async (request) => {
        await assertAdminRequest(request);

        const { days, preview } = request.data || {};
        if (![3, 7].includes(days)) {
            throw new HttpsError("invalid-argument", "days는 3 또는 7이어야 합니다.");
        }

        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        const cutoffDate = new Date(kst);
        cutoffDate.setDate(cutoffDate.getDate() - days);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);

        const usersSnap = await db.collection("users").get();
        const allUids = usersSnap.docs.map((docSnap) => docSnap.id);

        const inactiveUids = [];
        await Promise.all(allUids.map(async (uid) => {
            const logSnap = await db.collection("daily_logs")
                .where("userId", "==", uid)
                .orderBy("date", "desc")
                .limit(1)
                .get();

            const lastDate = logSnap.empty ? null : logSnap.docs[0].data().date;
            if (!lastDate || lastDate < cutoffStr) {
                inactiveUids.push(uid);
            }
        }));

        const userDocMap = new Map(usersSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() || {}]));
        const targets = [];
        await Promise.all(inactiveUids.map(async (uid) => {
            try {
                const userData = userDocMap.get(uid) || {};
                const name = userData.customDisplayName || userData.displayName || "회원";
                const locale = normalizeLocale(userData.locale);
                let email = String(userData.email || "").trim();
                if (!email) {
                    try {
                        const authUser = await admin.auth().getUser(uid);
                        email = String(authUser.email || "").trim();
                    } catch (_) {}
                }

                if (email) {
                    targets.push({ uid, name, email, locale });
                }
            } catch (_) {}
        }));

        if (preview) {
            return {
                count: targets.length,
                targets: targets.map((target) => ({ name: target.name, email: target.email, locale: target.locale })),
            };
        }

        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: GMAIL_USER.value(),
                pass: GMAIL_APP_PASSWORD.value(),
            }
        });

        const sendResults = await Promise.allSettled(targets.map(async (target) => {
            const template = buildReEngagementEmailTemplate({
                days,
                name: target.name,
                appBaseUrl: target.locale === "en" ? `${APP_BASE_URL}/en` : APP_BASE_URL,
                appIconUrl: APP_ICON_URL,
                locale: target.locale,
            });
            const sentAtIso = new Date().toISOString();
            const emailLogRef = db.collection("emailLogs").doc(target.uid);
            const emailLogSnap = await emailLogRef.get();
            const existingLog = emailLogSnap.exists ? (emailLogSnap.data() || {}) : {};
            const existingHistory = Array.isArray(existingLog.reEngagementHistory)
                ? existingLog.reEngagementHistory
                : [];
            const historyEntry = {
                days,
                sentAt: sentAtIso,
                recipientEmail: target.email,
                locale: target.locale,
                method: template.method,
                subject: template.subject,
                summary: template.summary,
                html: template.html,
            };

            await transporter.sendMail({
                from: `"${target.locale === "en" ? "Habit School" : "해빛스쿨"}" <${GMAIL_USER.value()}>`,
                to: target.email,
                subject: template.subject,
                html: template.html,
            });

            await emailLogRef.set({
                lastSentAt: FieldValue.serverTimestamp(),
                lastSentDays: days,
                sentCount: FieldValue.increment(1),
                lastSentRecipient: target.email,
                lastSentMethod: template.method,
                lastSentSubject: template.subject,
                lastSentSummary: template.summary,
                lastSentHtml: template.html,
                reEngagementByDays: {
                    [`day${days}`]: historyEntry,
                },
                reEngagementHistory: [historyEntry, ...existingHistory].slice(0, 12),
            }, { merge: true });

            console.log(`[sendReEngagementEmailsV2] ${target.email} (${target.name}) days=${days}`);
        }));

        const sentCount = sendResults.filter((result) => result.status === "fulfilled").length;
        const errors = sendResults
            .map((result, index) => result.status === "rejected"
                ? { email: targets[index].email, error: result.reason?.message }
                : null)
            .filter(Boolean);

        sendResults.forEach((result, index) => {
            if (result.status === "rejected") {
                console.error(`[sendReEngagementEmailsV2] failed: ${targets[index].email}`, result.reason?.message);
            }
        });

        return {
            sentCount,
            totalTargets: targets.length,
            errors,
        };
    }
);

exports.refreshGuestActivity = onSchedule(
    { schedule: "0 * * * *", region: "asia-northeast3", timeZone: "Asia/Seoul" },
    async () => {
        const payload = await updateGuestActivity({ db, FieldValue });
        console.log("refreshGuestActivity:", {
            windowDays: payload.windowDays,
            recordCountBucket: payload.recordCountBucket,
            activeUserCountBucket: payload.activeUserCountBucket,
        });
    }
);

exports.sendDailyReminder = onSchedule(
    { schedule: "0 * * * *", region: "asia-northeast3", timeZone: "Asia/Seoul" },
    async () => {
        const todayKST = getTodayKST();
        const currentHourKst = getKstHour();
        const loggedIds = await getTodayLoggedUserIds(todayKST);
        const reminderUsers = (await getPersonalizedReminderUsers(currentHourKst))
            .filter(({ uid }) => !loggedIds.has(uid));
        let sentTargetCount = 0;

        for (const category of ["diet", "exercise", "sleep"]) {
            const userIds = reminderUsers
                .filter(({ preference }) => preference.category === category)
                .map(({ uid }) => uid);
            if (userIds.length === 0) continue;
            let targets = await collectPushTargetsForUsers(userIds);
            targets = await reserveNotificationDeliveries(targets, {
                dateStr: todayKST,
                kind: "habit-reminder",
            });
            if (targets.length === 0) continue;
            await sendLocalizedMulticast(targets, (locale) => buildPersonalizedReminderPayload(locale, category));
            sentTargetCount += targets.length;
        }

        console.log(`sendDailyReminder: ${sentTargetCount} targets at ${currentHourKst}:00 KST / ${loggedIds.size} logged today`);
    }
);

/**
 * 매일 밤 10시 KST (UTC 13:00) — 연속 달성 있는데 오늘 기록 없는 유저에게 위기 알림
 */
exports.sendStreakAlert = onSchedule(
    { schedule: "0 13 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => {
        const todayKST = getTodayKST();
        const loggedIds = await getTodayLoggedUserIds(todayKST);

        const usersSnap = await db.collection("users")
            .where("currentStreak", ">", 0)
            .select("currentStreak")
            .get();

        const eligibleUserIds = [];
        usersSnap.docs.forEach((d) => {
            if (!loggedIds.has(d.id)) {
                eligibleUserIds.push(d.id);
            }
        });

        let targets = await collectPushTargetsForUsers(eligibleUserIds);
        targets = await reserveNotificationDeliveries(targets, {
            dateStr: todayKST,
            kind: "habit-reminder",
        });
        console.log(`sendStreakAlert: ${targets.length} targets`);
        await sendLocalizedMulticast(targets, (locale) => {
            const streakUrl = buildLocalizedAppPath(locale, "diet", { focus: "upload", source: "streak-alert" });
            if (normalizeLocale(locale) === "en") {
                return {
                    title: "Time to keep your streak alive",
                    body: "Record now to protect the momentum you have built.",
                    tag: "streak-alert",
                    url: streakUrl,
                    actions: buildNotificationActions([
                        { action: "record-now", title: "Record now", url: streakUrl }
                    ])
                };
            }
            return {
                title: "연속 기록을 이어갈 시간이에요",
                body: "지금 기록하면 이어온 흐름을 지킬 수 있어요.",
                tag: "streak-alert",
                url: streakUrl,
                actions: buildNotificationActions([
                    { action: "record-now", title: "지금 기록", url: streakUrl }
                ])
            };
        }); /*
            sendJobs.map(j => j.token),
            sendJobs.map(j => j.uid),
            "🔥 연속 습관 달성이 끊길 위기!",
            "지금 기록하면 연속 달성을 지킬 수 있어요",
            "streak-alert"
        ); */
    }
);

exports.sendDietProgramLunchReminder = onSchedule(
    { schedule: "30 2 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => sendDietProgramReminder({
        slot: "lunch",
        title: "점심 전에 식단 방법을 떠올려볼까요?",
        titleEn: "Quick meal-method check before lunch",
        body: "선택한 식단 방법에 맞춰 이번 식사를 준비해보세요.",
        bodyEn: "Use your selected food method to prepare this meal.",
        tag: "diet-program-pre-lunch",
        focus: "lunch"
    })
);

exports.sendDietProgramDinnerReminder = onSchedule(
    { schedule: "30 8 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => sendDietProgramReminder({
        slot: "dinner",
        title: "저녁 전에 식단 방법을 한번 더 체크해볼까요?",
        titleEn: "One more meal-method check before dinner",
        body: "오늘 저녁도 선택한 식단 방법 흐름에 맞춰 준비해보세요.",
        bodyEn: "Keep tonight’s dinner aligned with the food method you chose.",
        tag: "diet-program-pre-dinner",
        focus: "dinner"
    })
);

exports.sendDietProgramFastingStartReminder = onSchedule(
    { schedule: "0 3 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => sendDietProgramReminder({
        intermittentFasting: true,
        title: "간헐적 단식 식사 시간이 열렸어요",
        titleEn: "Your intermittent-fasting eating window is open",
        body: "12:00부터 20:00까지 식사할 수 있어요. 첫 식사는 단백질과 채소부터 시작해보세요.",
        bodyEn: "You can eat from 12:00 to 20:00. Try starting with protein and vegetables.",
        tag: "diet-program-fasting-start",
        focus: "lunch"
    })
);

exports.sendDietProgramFastingClosingReminder = onSchedule(
    { schedule: "30 10 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => sendDietProgramReminder({
        intermittentFasting: true,
        title: "오늘 식사 창 마감이 가까워졌어요",
        titleEn: "Your eating window is closing soon",
        body: "지금은 19:30이에요. 20:00 전에 식사를 마무리해보세요.",
        bodyEn: "It is 19:30 now. Try to finish eating before 20:00.",
        tag: "diet-program-fasting-close",
        focus: "dinner"
    })
);

/**
 * 전체 푸시 알림 발송 (관리자 전용)
 */
exports.sendBroadcastNotification = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
        const adminDoc = await db.doc(`admins/${uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자 권한 필요");

        const { title, body } = request.data;
        if (!title || !body) throw new HttpsError("invalid-argument", "제목과 내용 필요");

        const targets = await collectAllPushTargets();
        if (targets.length === 0) return { sentCount: 0 };
        await sendMulticast(targets, { title, body, tag: "broadcast", url: buildAppPath("dashboard") });
        console.log(`sendBroadcastNotification: ${targets.length} targets sent`);
        return { sentCount: targets.length };
    }
);

/**
 * 포인트 수동 지급/차감 (관리자 전용)
 */
exports.adjustUserCoins = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");
        const adminDoc = await db.doc(`admins/${uid}`).get();
        if (!adminDoc.exists) throw new HttpsError("permission-denied", "관리자 권한 필요");

        const { targetUid, amount, reason } = request.data;
        if (!targetUid) throw new HttpsError("invalid-argument", "대상 유저 필요");
        if (!amount || typeof amount !== "number") throw new HttpsError("invalid-argument", "유효한 포인트 값 필요");
        if (!reason) throw new HttpsError("invalid-argument", "사유 필요");

        const targetRef = db.doc(`users/${targetUid}`);
        const targetSnap = await targetRef.get();
        if (!targetSnap.exists) throw new HttpsError("not-found", "유저를 찾을 수 없음");

        await targetRef.set({ coins: FieldValue.increment(amount) }, { merge: true });

        // 조정 이력 기록
        await db.collection("pointAdjustments").add({
            targetUid,
            amount,
            reason,
            adjustedBy: uid,
            adjustedAt: FieldValue.serverTimestamp()
        });

        console.log(`adjustUserCoins: ${targetUid} ${amount > 0 ? '+' : ''}${amount}P (${reason}) by ${uid}`);
        return { success: true };
    }
);

// ========================================
// EXERCISE HABIT GROUPS
// ========================================

const MAX_HABIT_GROUP_MEMBERSHIPS = 2;
const EXERCISE_GROUP_ENTRY_FEE_POINTS = 200;
const EXERCISE_GROUP_REWARD_TARGET = 100;
const EXERCISE_GROUP_REWARD_POINTS = 3000;
const EXERCISE_GROUP_REWARD_WINDOW_DAYS = 120;
const EXERCISE_HABIT_GROUPS = Object.freeze([
    {
        id: "exercise-walking-10000",
        type: "exercise",
        title: "만보 걷기",
        requirement: { kind: "steps", minSteps: 10000 },
    },
    {
        id: "exercise-home-training",
        type: "exercise",
        title: "홈트 인증방",
        requirement: { kind: "exercise_record" },
    },
    {
        id: "exercise-gym-checkin",
        type: "exercise",
        title: "헬스장 출석",
        requirement: { kind: "exercise_record" },
    },
    {
        id: "exercise-running-club",
        type: "exercise",
        title: "러닝 클럽",
        requirement: { kind: "exercise_record" },
    },
]);
const EXERCISE_HABIT_GROUP_IDS = new Set(EXERCISE_HABIT_GROUPS.map(group => group.id));
const HABIT_GROUP_REVIEW_STATUSES = new Set(["pending", "approved", "rejected"]);
const HABIT_GROUP_LEADER_ROLES = new Set(["leader", "owner"]);

function getExerciseHabitGroup(groupId = "") {
    const normalizedId = String(groupId || "").trim();
    return EXERCISE_HABIT_GROUPS.find(group => group.id === normalizedId) || null;
}

function getHabitGroupMemberDocId(groupId = "", uid = "") {
    return `${String(groupId || "").trim()}_${String(uid || "").trim()}`;
}

function getHabitGroupCheckinDocId(groupId = "", dateStr = "", uid = "") {
    return `${String(groupId || "").trim()}_${String(dateStr || "").trim()}_${String(uid || "").trim()}`;
}

function getExerciseGroupRewardProgressDocId(groupId = "", uid = "") {
    return getHabitGroupMemberDocId(groupId, uid);
}

function normalizeDateArray(values = []) {
    return [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || "").trim())
        .filter(Boolean))]
        .sort();
}

function isKstDateString(value = "") {
    return /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(value || "").trim());
}

function getHabitGroupDisplayName(request) {
    return String(
        request.data?.displayName
        || request.auth?.token?.name
        || request.auth?.token?.email
        || "회원"
    ).trim().slice(0, 40);
}

function getHabitGroupPhotoUrl(request) {
    const url = String(request.data?.photoURL || request.auth?.token?.picture || "").trim();
    return url.startsWith("https://") ? url.slice(0, 500) : null;
}

function normalizeHabitGroupReviewStatus(status = "pending") {
    const normalized = String(status || "pending").trim();
    return HABIT_GROUP_REVIEW_STATUSES.has(normalized) ? normalized : "pending";
}

function normalizeHabitGroupCheckinForProgress(data = null) {
    if (!data || typeof data !== "object") return null;
    const groupId = String(data.groupId || "").trim();
    const uid = String(data.uid || "").trim();
    const date = String(data.date || "").trim();
    if (!EXERCISE_HABIT_GROUP_IDS.has(groupId) || !uid || !isKstDateString(date)) return null;
    return {
        groupId,
        uid,
        date,
        reviewStatus: normalizeHabitGroupReviewStatus(data.reviewStatus),
        countsTowardReward: data.countsTowardReward !== false,
    };
}

function removeHabitGroupDate(progress, date) {
    if (!date) return;
    ["submittedDates", "approvedDates", "pendingDates", "rejectedDates"].forEach(key => {
        progress[key] = normalizeDateArray(progress[key]).filter(item => item !== date);
    });
}

function addHabitGroupDate(progress, key, date) {
    if (!date) return;
    progress[key] = normalizeDateArray([...normalizeDateArray(progress[key]), date]);
}

function isHabitGroupDateInWindow(date, progress) {
    if (!date) return false;
    const startedDate = String(progress.startedDate || "").trim();
    const windowEndDate = String(progress.windowEndDate || "").trim();
    if (startedDate && date < startedDate) return false;
    if (windowEndDate && date > windowEndDate) return false;
    return true;
}

function applyHabitGroupProgressMutation(progress = {}, previousCheckin = null, nextCheckin = null) {
    const next = {
        ...progress,
        submittedDates: normalizeDateArray(progress.submittedDates),
        approvedDates: normalizeDateArray(progress.approvedDates),
        pendingDates: normalizeDateArray(progress.pendingDates),
        rejectedDates: normalizeDateArray(progress.rejectedDates),
    };

    if (previousCheckin?.date) {
        removeHabitGroupDate(next, previousCheckin.date);
    }

    if (nextCheckin?.date && isHabitGroupDateInWindow(nextCheckin.date, next)) {
        const reviewStatus = normalizeHabitGroupReviewStatus(nextCheckin.reviewStatus);
        if (nextCheckin.countsTowardReward !== false && (reviewStatus === "pending" || reviewStatus === "approved")) {
            addHabitGroupDate(next, "submittedDates", nextCheckin.date);
            addHabitGroupDate(next, reviewStatus === "approved" ? "approvedDates" : "pendingDates", nextCheckin.date);
        } else if (reviewStatus === "rejected") {
            addHabitGroupDate(next, "rejectedDates", nextCheckin.date);
        }
    }

    next.submittedDates = normalizeDateArray(next.submittedDates);
    next.approvedDates = normalizeDateArray(next.approvedDates);
    next.pendingDates = normalizeDateArray(next.pendingDates);
    next.rejectedDates = normalizeDateArray(next.rejectedDates);
    next.submittedCount = next.submittedDates.length;
    next.approvedCount = next.approvedDates.length;
    next.pendingCount = next.pendingDates.length;
    next.rejectedCount = next.rejectedDates.length;
    return next;
}

function buildInitialHabitGroupProgress({ groupId, uid, startDate = "" } = {}) {
    const startedDate = isKstDateString(startDate) ? startDate : getCurrentKstDateString();
    return {
        groupId,
        uid,
        startedDate,
        windowEndDate: addDaysToKstDateString(startedDate, EXERCISE_GROUP_REWARD_WINDOW_DAYS - 1),
        submittedDates: [],
        approvedDates: [],
        pendingDates: [],
        rejectedDates: [],
        submittedCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        rewardStatus: "in_progress",
        entryFeePoints: EXERCISE_GROUP_ENTRY_FEE_POINTS,
        rewardPoints: EXERCISE_GROUP_REWARD_POINTS,
    };
}

async function assertHabitGroupReviewer(uid, email, groupId) {
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    if (!getExerciseHabitGroup(groupId)) {
        throw new HttpsError("invalid-argument", "유효하지 않은 운동 소모임입니다.");
    }
    if (isBootstrapAdminEmail(email)) return true;

    const [adminSnap, memberSnap] = await Promise.all([
        db.doc(`admins/${uid}`).get(),
        db.doc(`habit_group_members/${getHabitGroupMemberDocId(groupId, uid)}`).get(),
    ]);
    if (adminSnap.exists) return true;

    const member = memberSnap.exists ? (memberSnap.data() || {}) : {};
    if (member.active !== false && HABIT_GROUP_LEADER_ROLES.has(String(member.role || "").trim())) {
        return true;
    }
    throw new HttpsError("permission-denied", "모임장 또는 관리자 권한이 필요합니다.");
}

exports.joinHabitGroup = onCall(
    { region: "asia-northeast3", maxInstances: 20, timeoutSeconds: 30 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const groupId = String(request.data?.groupId || "").trim();
        const group = getExerciseHabitGroup(groupId);
        if (!group) throw new HttpsError("invalid-argument", "유효하지 않은 운동 소모임입니다.");

        const email = normalizeEmail(request.auth?.token?.email);
        const memberRef = db.doc(`habit_group_members/${getHabitGroupMemberDocId(group.id, uid)}`);
        const progressRef = db.doc(`exercise_group_reward_progress/${getExerciseGroupRewardProgressDocId(group.id, uid)}`);
        const adminRef = db.doc(`admins/${uid}`);
        const userRef = db.doc(`users/${uid}`);
        const entryFeeRef = db.doc(`blockchain_transactions/exercise_group_entry_${group.id}_${uid}`);
        const membershipQuery = db.collection("habit_group_members")
            .where("uid", "==", uid)
            .limit(20);
        const todayStr = getCurrentKstDateString();
        const now = FieldValue.serverTimestamp();
        const displayName = getHabitGroupDisplayName(request);
        const photoURL = getHabitGroupPhotoUrl(request);

        const result = await db.runTransaction(async (tx) => {
            const [membershipSnap, memberSnap, progressSnap, adminSnap, userSnap, entryFeeSnap] = await Promise.all([
                tx.get(membershipQuery),
                tx.get(memberRef),
                tx.get(progressRef),
                tx.get(adminRef),
                tx.get(userRef),
                tx.get(entryFeeRef),
            ]);

            const activeMemberships = [];
            membershipSnap.forEach(docSnap => {
                const data = docSnap.data() || {};
                if (data.active !== false && EXERCISE_HABIT_GROUP_IDS.has(String(data.groupId || "").trim())) {
                    activeMemberships.push({ id: docSnap.id, groupId: data.groupId });
                }
            });

            const alreadyActive = activeMemberships.some(item => item.groupId === group.id);
            if (!alreadyActive && activeMemberships.length >= MAX_HABIT_GROUP_MEMBERSHIPS) {
                throw new HttpsError(
                    "failed-precondition",
                    `운동 소모임은 최대 ${MAX_HABIT_GROUP_MEMBERSHIPS}개까지 동시에 참여할 수 있습니다.`
                );
            }

            const existingMember = memberSnap.exists ? (memberSnap.data() || {}) : {};
            const existingRole = String(existingMember.role || "").trim();
            const isAdminLeader = adminSnap.exists || isBootstrapAdminEmail(email);
            const role = HABIT_GROUP_LEADER_ROLES.has(existingRole) || isAdminLeader ? "leader" : "member";
            const hasPaidEntryFee = entryFeeSnap.exists
                || existingMember.entryFeePaid === true
                || Number(existingMember.entryFeePoints || 0) >= EXERCISE_GROUP_ENTRY_FEE_POINTS;
            const shouldChargeEntryFee = !alreadyActive && !hasPaidEntryFee;
            const userData = userSnap.exists ? (userSnap.data() || {}) : {};
            const currentCoins = Number(userData.coins || 0) || 0;

            if (shouldChargeEntryFee && currentCoins < EXERCISE_GROUP_ENTRY_FEE_POINTS) {
                throw new HttpsError(
                    "failed-precondition",
                    `소모임 참여에는 ${EXERCISE_GROUP_ENTRY_FEE_POINTS}P가 필요합니다. 현재 ${currentCoins}P예요.`
                );
            }

            if (shouldChargeEntryFee) {
                tx.set(userRef, {
                    coins: FieldValue.increment(-EXERCISE_GROUP_ENTRY_FEE_POINTS),
                }, { merge: true });
                tx.set(entryFeeRef, {
                    userId: uid,
                    uid,
                    type: "exercise_group_entry",
                    groupId: group.id,
                    groupTitle: group.title,
                    pointsUsed: EXERCISE_GROUP_ENTRY_FEE_POINTS,
                    entryFeePoints: EXERCISE_GROUP_ENTRY_FEE_POINTS,
                    date: todayStr,
                    timestamp: now,
                    status: "success",
                }, { merge: false });
            }

            const entryFeeStatus = shouldChargeEntryFee || hasPaidEntryFee
                ? "paid"
                : String(existingMember.entryFeeStatus || "grandfathered").trim();

            tx.set(memberRef, {
                groupId: group.id,
                groupType: "exercise",
                groupTitle: group.title,
                uid,
                displayName,
                photoURL,
                active: true,
                role,
                joinedAt: alreadyActive && existingMember.joinedAt ? existingMember.joinedAt : now,
                leftAt: FieldValue.delete(),
                rewardProgressId: progressRef.id,
                entryFeePoints: shouldChargeEntryFee || hasPaidEntryFee
                    ? EXERCISE_GROUP_ENTRY_FEE_POINTS
                    : Number(existingMember.entryFeePoints || 0) || 0,
                entryFeePaid: shouldChargeEntryFee || hasPaidEntryFee,
                entryFeeStatus,
                entryFeePaidAt: shouldChargeEntryFee ? now : (existingMember.entryFeePaidAt || FieldValue.delete()),
                updatedAt: now,
            }, { merge: true });

            if (!progressSnap.exists) {
                tx.set(progressRef, {
                    ...buildInitialHabitGroupProgress({ groupId: group.id, uid, startDate: todayStr }),
                    startedAt: now,
                    createdAt: now,
                    updatedAt: now,
                }, { merge: true });
            } else {
                tx.set(progressRef, {
                    groupId: group.id,
                    uid,
                    entryFeePoints: EXERCISE_GROUP_ENTRY_FEE_POINTS,
                    rewardPoints: EXERCISE_GROUP_REWARD_POINTS,
                    updatedAt: now,
                }, { merge: true });
            }

            return {
                groupId: group.id,
                activeCount: alreadyActive ? activeMemberships.length : activeMemberships.length + 1,
                role,
                entryFeeCharged: shouldChargeEntryFee,
                entryFeePoints: EXERCISE_GROUP_ENTRY_FEE_POINTS,
                coins: shouldChargeEntryFee ? currentCoins - EXERCISE_GROUP_ENTRY_FEE_POINTS : currentCoins,
            };
        });

        return {
            success: true,
            ...result,
            maxMemberships: MAX_HABIT_GROUP_MEMBERSHIPS,
        };
    }
);

exports.leaveHabitGroup = onCall(
    { region: "asia-northeast3", maxInstances: 20, timeoutSeconds: 30 },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const groupId = String(request.data?.groupId || "").trim();
        const group = getExerciseHabitGroup(groupId);
        if (!group) throw new HttpsError("invalid-argument", "유효하지 않은 운동 소모임입니다.");

        const memberRef = db.doc(`habit_group_members/${getHabitGroupMemberDocId(group.id, uid)}`);
        const memberSnap = await memberRef.get();
        if (!memberSnap.exists) {
            return { success: true, groupId: group.id, active: false };
        }

        await memberRef.set({
            groupId: group.id,
            groupType: "exercise",
            groupTitle: group.title,
            uid,
            active: false,
            leftAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        return { success: true, groupId: group.id, active: false };
    }
);

exports.reviewHabitGroupCheckin = onCall(
    { region: "asia-northeast3", maxInstances: 20, timeoutSeconds: 30 },
    async (request) => {
        const reviewerUid = request.auth?.uid;
        if (!reviewerUid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const groupId = String(request.data?.groupId || "").trim();
        const targetUid = String(request.data?.uid || request.data?.targetUid || "").trim();
        const date = String(request.data?.date || "").trim();
        const reviewStatus = normalizeHabitGroupReviewStatus(request.data?.reviewStatus);
        const reviewNote = String(request.data?.reviewNote || "").trim().slice(0, 500);
        const group = getExerciseHabitGroup(groupId);
        if (!group || !targetUid || !isKstDateString(date)) {
            throw new HttpsError("invalid-argument", "소모임, 회원, 날짜 정보가 필요합니다.");
        }
        if (reviewStatus === "pending") {
            throw new HttpsError("invalid-argument", "승인 또는 반려 상태만 선택할 수 있습니다.");
        }

        await assertHabitGroupReviewer(reviewerUid, request.auth?.token?.email, group.id);

        const checkinRef = db.doc(`habit_group_checkins/${getHabitGroupCheckinDocId(group.id, date, targetUid)}`);
        const checkinSnap = await checkinRef.get();
        if (!checkinSnap.exists) throw new HttpsError("not-found", "확인할 제출 기록이 없습니다.");

        const checkin = checkinSnap.data() || {};
        if (String(checkin.groupId || "") !== group.id || String(checkin.uid || "") !== targetUid) {
            throw new HttpsError("failed-precondition", "제출 기록 정보가 소모임과 일치하지 않습니다.");
        }

        const now = FieldValue.serverTimestamp();
        await checkinRef.set({
            reviewStatus,
            countsTowardReward: reviewStatus === "approved",
            reviewedBy: reviewerUid,
            reviewedAt: now,
            reviewNote: reviewNote || FieldValue.delete(),
            approvedAt: reviewStatus === "approved" ? now : FieldValue.delete(),
            rejectedAt: reviewStatus === "rejected" ? now : FieldValue.delete(),
            updatedAt: now,
        }, { merge: true });

        return { success: true, groupId: group.id, uid: targetUid, date, reviewStatus };
    }
);

exports.transferHabitGroupLeader = onCall(
    { region: "asia-northeast3", maxInstances: 10, timeoutSeconds: 30 },
    async (request) => {
        const currentLeaderUid = request.auth?.uid;
        if (!currentLeaderUid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

        const groupId = String(request.data?.groupId || "").trim();
        const nextLeaderUid = String(request.data?.nextLeaderUid || request.data?.targetUid || "").trim();
        const group = getExerciseHabitGroup(groupId);
        if (!group || !nextLeaderUid) {
            throw new HttpsError("invalid-argument", "소모임과 새 모임장 정보가 필요합니다.");
        }

        await assertHabitGroupReviewer(currentLeaderUid, request.auth?.token?.email, group.id);

        const currentRef = db.doc(`habit_group_members/${getHabitGroupMemberDocId(group.id, currentLeaderUid)}`);
        const nextRef = db.doc(`habit_group_members/${getHabitGroupMemberDocId(group.id, nextLeaderUid)}`);
        const now = FieldValue.serverTimestamp();

        await db.runTransaction(async (tx) => {
            const [nextSnap, currentSnap] = await Promise.all([
                tx.get(nextRef),
                tx.get(currentRef),
            ]);
            if (!nextSnap.exists || nextSnap.data()?.active === false) {
                throw new HttpsError("failed-precondition", "새 모임장은 현재 참여 중인 회원이어야 합니다.");
            }

            tx.set(nextRef, {
                role: "leader",
                leaderGrantedAt: now,
                leaderGrantedBy: currentLeaderUid,
                updatedAt: now,
            }, { merge: true });

            if (currentSnap.exists && String(currentSnap.data()?.role || "") === "leader") {
                tx.set(currentRef, {
                    role: "member",
                    leaderTransferredAt: now,
                    leaderTransferredTo: nextLeaderUid,
                    updatedAt: now,
                }, { merge: true });
            }
        });

        return { success: true, groupId: group.id, nextLeaderUid };
    }
);

exports.onHabitGroupCheckinWritten = onDocumentWritten(
    { document: "habit_group_checkins/{checkinId}", region: "asia-northeast3", maxInstances: 30, timeoutSeconds: 30 },
    async (event) => {
        const before = normalizeHabitGroupCheckinForProgress(event.data?.before?.data());
        const after = normalizeHabitGroupCheckinForProgress(event.data?.after?.data());
        const target = after || before;
        if (!target) return;

        const progressRef = db.doc(`exercise_group_reward_progress/${getExerciseGroupRewardProgressDocId(target.groupId, target.uid)}`);
        const memberRef = db.doc(`habit_group_members/${getHabitGroupMemberDocId(target.groupId, target.uid)}`);
        const payoutRef = db.doc(`blockchain_transactions/exercise_group_reward_${target.groupId}_${target.uid}`);
        const userRef = db.doc(`users/${target.uid}`);
        const todayStr = getCurrentKstDateString();
        const now = FieldValue.serverTimestamp();

        await db.runTransaction(async (tx) => {
            const [progressSnap, memberSnap, payoutSnap] = await Promise.all([
                tx.get(progressRef),
                tx.get(memberRef),
                tx.get(payoutRef),
            ]);

            if (!progressSnap.exists && !after) return;
            const memberData = memberSnap.exists ? (memberSnap.data() || {}) : {};
            if (after && (!memberSnap.exists || memberData.active === false)) return;

            const baseProgress = progressSnap.exists
                ? (progressSnap.data() || {})
                : buildInitialHabitGroupProgress({ groupId: target.groupId, uid: target.uid, startDate: target.date });
            const progress = applyHabitGroupProgressMutation(baseProgress, before, after);
            const group = getExerciseHabitGroup(target.groupId);
            const windowEndDate = String(progress.windowEndDate || "").trim();
            const shouldPay = progress.approvedCount >= EXERCISE_GROUP_REWARD_TARGET
                && String(baseProgress.rewardStatus || "") !== "paid"
                && !payoutSnap.exists;

            let rewardStatus = String(baseProgress.rewardStatus || "in_progress").trim();
            if (rewardStatus === "paid" || payoutSnap.exists) {
                rewardStatus = "paid";
            } else if (shouldPay) {
                rewardStatus = "paid";
            } else if (progress.approvedCount >= EXERCISE_GROUP_REWARD_TARGET) {
                rewardStatus = "pending_review";
            } else if (progress.submittedCount >= EXERCISE_GROUP_REWARD_TARGET) {
                rewardStatus = "pending_review";
            } else if (windowEndDate && todayStr > windowEndDate) {
                rewardStatus = "expired";
            } else {
                rewardStatus = "in_progress";
            }

            const progressPayload = {
                groupId: target.groupId,
                groupTitle: group?.title || null,
                uid: target.uid,
                startedDate: progress.startedDate || target.date,
                windowEndDate: progress.windowEndDate || addDaysToKstDateString(progress.startedDate || target.date, EXERCISE_GROUP_REWARD_WINDOW_DAYS - 1),
                submittedDates: progress.submittedDates,
                approvedDates: progress.approvedDates,
                pendingDates: progress.pendingDates,
                rejectedDates: progress.rejectedDates,
                submittedCount: progress.submittedCount,
                approvedCount: progress.approvedCount,
                pendingCount: progress.pendingCount,
                rejectedCount: progress.rejectedCount,
                rewardStatus,
                entryFeePoints: Number(baseProgress.entryFeePoints || EXERCISE_GROUP_ENTRY_FEE_POINTS) || EXERCISE_GROUP_ENTRY_FEE_POINTS,
                rewardPoints: EXERCISE_GROUP_REWARD_POINTS,
                updatedAt: now,
            };
            if (!progressSnap.exists) {
                progressPayload.startedAt = now;
                progressPayload.createdAt = now;
            }
            if (rewardStatus === "paid" && !baseProgress.paidAt) {
                progressPayload.paidAt = now;
            }

            tx.set(progressRef, progressPayload, { merge: true });

            if (memberSnap.exists) {
                tx.set(memberRef, {
                    submittedCount: progress.submittedCount,
                    approvedCount: progress.approvedCount,
                    pendingCount: progress.pendingCount,
                    lastCheckinDate: after?.date || memberData.lastCheckinDate || null,
                    updatedAt: now,
                }, { merge: true });
            }

            if (shouldPay) {
                tx.set(userRef, {
                    coins: FieldValue.increment(EXERCISE_GROUP_REWARD_POINTS),
                }, { merge: true });
                tx.set(payoutRef, {
                    userId: target.uid,
                    uid: target.uid,
                    type: "exercise_group_reward",
                    groupId: target.groupId,
                    groupTitle: group?.title || null,
                    progressId: progressRef.id,
                    rewardPoints: EXERCISE_GROUP_REWARD_POINTS,
                    submittedCount: progress.submittedCount,
                    approvedCount: progress.approvedCount,
                    date: todayStr,
                    timestamp: now,
                    status: "success",
                }, { merge: false });
            }
        });
    }
);

// ========================================
// SOCIAL CHALLENGES
// ========================================

const CHALLENGE_TYPES    = ['group_goal', 'competition'];
const CHALLENGE_DURATIONS = [3, 7, 14];
const MAX_STAKE          = 200;
const GROUP_GOAL_THRESHOLD   = 0.7;   // 70% 달성 기준
const GROUP_GOAL_BONUS_PCT   = 0.2;   // 단체 목표 달성 보너스 20%
const COMPETITION_WIN_BONUS_PCT = 0.3; // 경쟁 승리 보너스 30%
const MIN_ACTIVITY_DAYS  = 5;          // 최소 활동 이력 (30일 내)
const CHALLENGE_EXPIRE_HOURS = 48;     // 초대 만료 시간

/** KST 오늘 날짜 (YYYY-MM-DD) */
function todayKST() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/** dateStr + n일 (YYYY-MM-DD) */
function addDaysKST(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    d.setDate(d.getDate() + n);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

/** 지난 30일 내 최소 N일 활동 이력 확인 */
async function hasMinActivity(uid, minDays = MIN_ACTIVITY_DAYS) {
    const thirtyDaysAgo = addDaysKST(todayKST(), -30);
    const snap = await db.collection('daily_logs')
        .where('userId', '==', uid)
        .where('date', '>=', thirtyDaysAgo)
        .limit(minDays)
        .get();
    return snap.size >= minDays;
}

/**
 * createSocialChallenge — 챌린지 생성
 */
exports.createSocialChallenge = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        throw new HttpsError(
            "failed-precondition",
            "친구 챌린지 신규 생성은 소모임 시스템으로 전환되어 종료되었습니다."
        );
        const uid = request.auth.uid;
        const { type, inviteeIds, durationDays, stakePoints } = request.data;

        // 입력 검증
        if (!CHALLENGE_TYPES.includes(type))
            throw new HttpsError("invalid-argument", "올바른 챌린지 유형을 선택해주세요.");
        if (!Array.isArray(inviteeIds) || inviteeIds.length === 0)
            throw new HttpsError("invalid-argument", "초대할 친구를 선택해주세요.");
        if (!CHALLENGE_DURATIONS.includes(durationDays))
            throw new HttpsError("invalid-argument", "기간은 3, 7, 14일 중 선택해주세요.");
        if (inviteeIds.includes(uid))
            throw new HttpsError("invalid-argument", "자기 자신을 초대할 수 없습니다.");
        if (type === 'competition' && inviteeIds.length !== 1)
            throw new HttpsError("invalid-argument", "1:1 경쟁은 상대 1명만 초대할 수 있습니다.");
        if (type === 'group_goal' && inviteeIds.length > 2)
            throw new HttpsError("invalid-argument", "함께 목표는 친구 2명까지만 초대할 수 있습니다.");
        if (type === 'competition') {
            if (!stakePoints || typeof stakePoints !== 'number' || stakePoints <= 0 || stakePoints > MAX_STAKE)
                throw new HttpsError("invalid-argument", `스테이크는 10~${MAX_STAKE}P 사이여야 합니다.`);
            if (stakePoints % 10 !== 0)
                throw new HttpsError("invalid-argument", "스테이크는 10P 단위로 설정해주세요.");
        }

        // 생성자 정보 + 포인트 확인
        const creatorSnap = await db.doc(`users/${uid}`).get();
        if (!creatorSnap.exists) throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        const creatorData = creatorSnap.data();
        const creatorName = creatorData.customDisplayName || creatorData.displayName || '회원';

        if (type === 'competition' && (creatorData.coins || 0) < stakePoints)
            throw new HttpsError("failed-precondition",
                `포인트가 부족합니다. 필요: ${stakePoints}P, 보유: ${creatorData.coins || 0}P`);

        // 생성자 최소 활동 확인
        if (!(await hasMinActivity(uid)))
            throw new HttpsError("failed-precondition",
                `챌린지 참가는 최근 30일 내 ${MIN_ACTIVITY_DAYS}일 이상 기록이 필요합니다.`);

        // 초대 대상 유효성 확인 (생성자와 초대 대상의 active friendship 필요)
        for (const inviteeId of inviteeIds) {
            const inviteeSnap = await db.doc(`users/${inviteeId}`).get();
            if (!inviteeSnap.exists)
                throw new HttpsError("not-found", "초대 대상 유저를 찾을 수 없습니다.");

            const friendshipSnap = await db.doc(`friendships/${buildFriendshipId(uid, inviteeId)}`).get();
            if (!friendshipSnap.exists || friendshipSnap.data()?.status !== "active")
                throw new HttpsError("failed-precondition",
                    "챌린지는 active friendship 상태인 친구와만 만들 수 있습니다.");
        }

        // 진행 중인 챌린지 중복 확인 (생성자 기준)
        const existingSnap = await db.collection('social_challenges')
            .where('creatorId', '==', uid)
            .where('status', 'in', ['pending', 'active'])
            .get();
        const openTypes = new Set();
        const busyFriendIds = new Set();
        existingSnap.forEach(docSnap => {
            const challenge = docSnap.data() || {};
            openTypes.add(challenge.type === 'competition' ? 'competition' : 'group_goal');
            const participants = Array.isArray(challenge.participants) ? challenge.participants : [];
            const invitees = Array.isArray(challenge.invitees) ? challenge.invitees : [];
            [...participants, ...invitees].forEach(participantId => {
                if (participantId && participantId !== uid) busyFriendIds.add(participantId);
            });
        });
        if (openTypes.has(type)) {
            throw new HttpsError(
                "already-exists",
                type === 'competition'
                    ? "이미 진행 중이거나 수락 대기 중인 1:1 경쟁이 있어요. 기존 경쟁을 정리한 뒤 다시 시도해 주세요."
                    : "이미 진행 중이거나 수락 대기 중인 단체 목표가 있어요. 기존 목표를 정리한 뒤 다시 시도해 주세요."
            );
        }

        if (inviteeIds.some(inviteeId => busyFriendIds.has(inviteeId))) {
            throw new HttpsError(
                "failed-precondition",
                "이미 진행 중이거나 수락 대기 중인 친구는 새 챌린지에 다시 초대할 수 없어요."
            );
        }

        // 경쟁 모드: 스테이크 락업
        if (type === 'competition') {
            await db.doc(`users/${uid}`).update({
                coins: FieldValue.increment(-stakePoints)
            });
        }

        // 챌린지 문서 생성
        const now = FieldValue.serverTimestamp();
        const expiresAt = new Date(Date.now() + CHALLENGE_EXPIRE_HOURS * 60 * 60 * 1000);
        const challengeData = {
            type,
            status: 'pending',
            creatorId: uid,
            creatorName,
            invitees: inviteeIds,
            participants: [uid],
            durationDays,
            startDate: null,
            endDate: null,
            expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
            createdAt: now,
            results: {},
            ...(type === 'competition'
                ? { stakePoints, stakes: { [uid]: stakePoints } }
                : { targetCompletionPct: GROUP_GOAL_THRESHOLD })
        };

        const challengeRef = await db.collection('social_challenges').add(challengeData);
        const challengeId = challengeRef.id;

        // 초대 알림 발송
        for (const inviteeId of inviteeIds) {
            await db.collection('notifications').add({
                postOwnerId: inviteeId,
                type: 'challenge_invite',
                fromUserId: uid,
                fromUserName: creatorName,
                challengeId,
                challengeType: type,
                durationDays,
                stakePoints: stakePoints || null,
                createdAt: now
            });
        }

        await sendPushToUsers(
            inviteeIds,
            buildChallengeInvitePushPayload({ challengeId, creatorName, type, durationDays, stakePoints })
        );

        console.log(`[createSocialChallenge] ${uid} → ${inviteeIds.join(',')} (${type}, ${durationDays}일)`);
        return { challengeId };
    }
);

/**
 * respondSocialChallenge — 초대 수락/거절
 */
exports.respondSocialChallenge = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인 필요");
        const uid = request.auth.uid;
        const { challengeId, accept } = request.data;

        if (!challengeId) throw new HttpsError("invalid-argument", "챌린지 ID 필요");
        if (typeof accept !== 'boolean') throw new HttpsError("invalid-argument", "수락 여부(accept) 필요");

        const challengeRef = db.doc(`social_challenges/${challengeId}`);
        const challengeSnap = await challengeRef.get();
        if (!challengeSnap.exists) throw new HttpsError("not-found", "챌린지를 찾을 수 없습니다.");

        const challenge = challengeSnap.data();
        if (challenge.status !== 'pending')
            throw new HttpsError("failed-precondition", "이미 시작되었거나 종료된 챌린지입니다.");
        if (!challenge.invitees.includes(uid))
            throw new HttpsError("permission-denied", "이 챌린지에 초대되지 않았습니다.");

        // 만료 확인
        if (challenge.expiresAt.toMillis() < Date.now()) {
            await challengeRef.update({ status: 'cancelled' });
            if (challenge.type === 'competition' && challenge.stakes?.[challenge.creatorId]) {
                await db.doc(`users/${challenge.creatorId}`).update({
                    coins: FieldValue.increment(challenge.stakes[challenge.creatorId])
                });
            }
            throw new HttpsError("deadline-exceeded", "챌린지 초대가 만료되었습니다.");
        }

        if (!accept) {
            // 거절: invitees에서 제거
            const newInvitees = challenge.invitees.filter(id => id !== uid);
            if (newInvitees.length === 0) {
                // 모든 초대 거절 → 취소, 생성자 스테이크 반환
                await challengeRef.update({ status: 'cancelled', invitees: [] });
                if (challenge.type === 'competition' && challenge.stakes?.[challenge.creatorId]) {
                    await db.doc(`users/${challenge.creatorId}`).update({
                        coins: FieldValue.increment(challenge.stakes[challenge.creatorId])
                    });
                }
            } else {
                await challengeRef.update({ invitees: newInvitees });
            }
            await sendPushToUsers(
                [challenge.creatorId],
                buildChallengeDeclinedPushPayload({ challengeId, responderName: null, type: challenge.type })
            );
            console.log(`[respondSocialChallenge] ${uid} 거절: ${challengeId}`);
            return { result: 'declined' };
        }

        // 수락: 최소 활동 이력 확인
        if (!(await hasMinActivity(uid)))
            throw new HttpsError("failed-precondition",
                `챌린지 참가는 최근 30일 내 ${MIN_ACTIVITY_DAYS}일 이상 기록이 필요합니다.`);

        const userSnap = await db.doc(`users/${uid}`).get();
        const userData = userSnap.data();
        const responderName = getUserLabel(userData, request.auth?.token?.name || "Friend");

        // 경쟁 모드: 포인트 락업
        if (challenge.type === 'competition') {
            if ((userData.coins || 0) < challenge.stakePoints)
                throw new HttpsError("failed-precondition",
                    `포인트가 부족합니다. 필요: ${challenge.stakePoints}P, 보유: ${userData.coins || 0}P`);
            await db.doc(`users/${uid}`).update({
                coins: FieldValue.increment(-challenge.stakePoints)
            });
        }

        const newInvitees = challenge.invitees.filter(id => id !== uid);
        const newParticipants = [...challenge.participants, uid];
        const updateData = {
            invitees: newInvitees,
            participants: newParticipants,
            ...(challenge.type === 'competition' ? { [`stakes.${uid}`]: challenge.stakePoints } : {})
        };

        // 모든 초대 수락 → active 전환
        if (newInvitees.length === 0) {
            const startDate = todayKST();
            const endDate = addDaysKST(startDate, challenge.durationDays - 1);
            updateData.status = 'active';
            updateData.startDate = startDate;
            updateData.endDate = endDate;

            const now = FieldValue.serverTimestamp();
            for (const participantId of newParticipants) {
                await db.collection('notifications').add({
                    postOwnerId: participantId,
                    type: 'challenge_started',
                    challengeId,
                    challengeType: challenge.type,
                    durationDays: challenge.durationDays,
                    startDate,
                    endDate,
                    createdAt: now
                });
            }
            await sendPushToUsers(
                newParticipants,
                buildChallengeStartedPushPayload({ challengeId, type: challenge.type, durationDays: challenge.durationDays })
            );
        } else {
            await sendPushToUsers(
                [challenge.creatorId],
                buildChallengePendingUpdatePushPayload({ challengeId, accepterName: responderName, type: challenge.type })
            );
        }

        await challengeRef.update(updateData);
        const newStatus = newInvitees.length === 0 ? 'active' : 'pending';
        console.log(`[respondSocialChallenge] ${uid} 수락: ${challengeId} → ${newStatus}`);
        return { result: 'accepted', status: newStatus };
    }
);

/**
 * cancelSocialChallenge — 생성자가 보낸 pending 챌린지 초대 취소
 */
exports.cancelSocialChallenge = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "로그인이 필요");
        const uid = request.auth.uid;
        const challengeId = typeof request.data?.challengeId === "string" ? request.data.challengeId.trim() : "";
        if (!challengeId) throw new HttpsError("invalid-argument", "챌린지 ID 필요");

        const challengeRef = db.doc(`social_challenges/${challengeId}`);
        const outcome = await db.runTransaction(async (tx) => {
            const challengeSnap = await tx.get(challengeRef);
            if (!challengeSnap.exists) {
                throw new HttpsError("not-found", "챌린지를 찾을 수 없습니다.");
            }

            const challenge = challengeSnap.data() || {};
            if (challenge.creatorId !== uid) {
                throw new HttpsError("permission-denied", "이 챌린지를 취소할 권한이 없습니다.");
            }
            if (challenge.status !== "pending") {
                throw new HttpsError("failed-precondition", "이미 시작되었거나 종료된 챌린지예요.");
            }

            const now = FieldValue.serverTimestamp();
            tx.update(challengeRef, {
                status: "cancelled",
                cancelledAt: now,
                updatedAt: now
            });

            const refundPoints = challenge.type === "competition"
                ? Number(challenge.stakes?.[uid] || challenge.stakePoints || 0)
                : 0;
            if (refundPoints > 0) {
                tx.update(db.doc(`users/${uid}`), {
                    coins: FieldValue.increment(refundPoints)
                });
            }

            return {
                result: "cancelled",
                challengeId,
                refundPoints,
                inviteeIds: Array.isArray(challenge.invitees) ? challenge.invitees : [],
                creatorName: challenge.creatorName || null,
                challengeType: challenge.type || "group_goal"
            };
        });

        if (outcome.inviteeIds?.length) {
            await sendPushToUsers(
                outcome.inviteeIds,
                buildChallengeCancelledPushPayload({
                    challengeId,
                    creatorName: outcome.creatorName,
                    type: outcome.challengeType
                })
            );
        }

        console.log(`[cancelSocialChallenge] ${uid} 취소: ${challengeId}`);
        return outcome;
    }
);

/**
 * 챌린지 결산 내부 헬퍼
 */
async function settleChallengeById(challengeId) {
    const challengeRef = db.doc(`social_challenges/${challengeId}`);
    const challengeSnap = await challengeRef.get();
    if (!challengeSnap.exists) return;
    const challenge = challengeSnap.data();
    if (challenge.status !== 'active') return;

    const { type, participants, startDate, endDate, stakePoints, stakes, durationDays } = challenge;
    const now = FieldValue.serverTimestamp();

    // 각 참가자 기간 내 daily_logs 집계
    const participantStats = {};
    for (const pid of participants) {
        const logsSnap = await db.collection('daily_logs')
            .where('userId', '==', pid)
            .where('date', '>=', startDate)
            .where('date', '<=', endDate)
            .get();
        let totalPoints = 0;
        let activeDays = 0;
        logsSnap.forEach(docSnap => {
            const d = docSnap.data();
            const ap = d.awardedPoints || {};
            totalPoints += (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0);
            activeDays++;
        });
        participantStats[pid] = { totalPoints, activeDays };
    }

    const results = {};

    if (type === 'group_goal') {
        let allAchieved = true;
        for (const [pid, stats] of Object.entries(participantStats)) {
            const completionPct = durationDays > 0 ? stats.activeDays / durationDays : 0;
            const achieved = completionPct >= GROUP_GOAL_THRESHOLD;
            results[pid] = {
                habitPoints: stats.totalPoints,
                activeDays: stats.activeDays,
                completionPct: Math.round(completionPct * 100) / 100,
                achieved,
                bonusPoints: 0,
                outcome: achieved ? 'achieved' : 'missed'
            };
            if (!achieved) allAchieved = false;
        }

        if (allAchieved) {
            for (const pid of participants) {
                const bonus = Math.floor(results[pid].habitPoints * GROUP_GOAL_BONUS_PCT);
                results[pid].bonusPoints = bonus;
                results[pid].outcome = 'success';
                if (bonus > 0) {
                    await db.doc(`users/${pid}`).update({
                        coins: FieldValue.increment(bonus)
                    });
                }
            }
        }

    } else if (type === 'competition') {
        const [pid0, pid1] = participants;
        const s0 = participantStats[pid0];
        const s1 = participantStats[pid1];

        if (s0.activeDays === 0 || s1.activeDays === 0) {
            // 어뷰징 방지: 한쪽 0일 → 스테이크 전액 반환, 무효
            for (const pid of participants) {
                const refund = stakes?.[pid] || stakePoints || 0;
                if (refund > 0) {
                    await db.doc(`users/${pid}`).update({
                        coins: FieldValue.increment(refund)
                    });
                }
            }
            results[pid0] = { habitPoints: s0.totalPoints, activeDays: s0.activeDays, bonusPoints: 0, outcome: 'void' };
            results[pid1] = { habitPoints: s1.totalPoints, activeDays: s1.activeDays, bonusPoints: 0, outcome: 'void' };
        } else if (s0.totalPoints === s1.totalPoints) {
            // 동점: 스테이크 반환
            for (const pid of participants) {
                const refund = stakes?.[pid] || stakePoints || 0;
                if (refund > 0) {
                    await db.doc(`users/${pid}`).update({
                        coins: FieldValue.increment(refund)
                    });
                }
            }
            results[pid0] = { habitPoints: s0.totalPoints, activeDays: s0.activeDays, bonusPoints: 0, outcome: 'draw' };
            results[pid1] = { habitPoints: s1.totalPoints, activeDays: s1.activeDays, bonusPoints: 0, outcome: 'draw' };
        } else {
            const winnerId = s0.totalPoints > s1.totalPoints ? pid0 : pid1;
            const loserId  = winnerId === pid0 ? pid1 : pid0;
            const winnerStake = stakes?.[winnerId] || stakePoints || 0;
            const loserStake  = stakes?.[loserId]  || stakePoints || 0;
            const winnerBonus = Math.floor(participantStats[winnerId].totalPoints * COMPETITION_WIN_BONUS_PCT);

            await db.doc(`users/${winnerId}`).update({
                coins: FieldValue.increment(winnerStake + loserStake + winnerBonus)
            });

            results[winnerId] = {
                habitPoints: participantStats[winnerId].totalPoints,
                activeDays: participantStats[winnerId].activeDays,
                bonusPoints: loserStake + winnerBonus,
                outcome: 'win'
            };
            results[loserId] = {
                habitPoints: participantStats[loserId].totalPoints,
                activeDays: participantStats[loserId].activeDays,
                bonusPoints: 0,
                outcome: 'loss'
            };
        }
    }

    await challengeRef.update({ status: 'settled', results, settledAt: now });

    // 결산 알림
    for (const pid of participants) {
        await db.collection('notifications').add({
            postOwnerId: pid,
            type: 'challenge_settled',
            challengeId,
            challengeType: type,
            outcome: results[pid]?.outcome || 'unknown',
            bonusPoints: results[pid]?.bonusPoints || 0,
            createdAt: now
        });
    }

    for (const pid of participants) {
        await sendPushToUsers(
            [pid],
            buildChallengeSettledPushPayload({
                challengeId,
                type,
                outcome: results[pid]?.outcome || "unknown",
                bonusPoints: results[pid]?.bonusPoints || 0
            })
        );
    }

    console.log(`[settleChallengeById] ${challengeId} settled (${type})`);
}

/**
 * settleDueSocialChallenges — 매일 00:10 KST 자동 결산
 * 00:10 KST = 15:10 UTC
 */
exports.settleDueSocialChallenges = onSchedule(
    { schedule: "10 15 * * *", timeZone: "UTC", region: "asia-northeast3" },
    async () => {
        // 만료된 pending 챌린지 취소 + 스테이크 반환
        const pendingSnap = await db.collection('social_challenges')
            .where('status', '==', 'pending')
            .get();
        for (const docSnap of pendingSnap.docs) {
            const data = docSnap.data();
            if (data.expiresAt?.toMillis() < Date.now()) {
                await docSnap.ref.update({ status: 'cancelled' });
                if (data.type === 'competition' && data.stakes?.[data.creatorId]) {
                    await db.doc(`users/${data.creatorId}`).update({
                        coins: FieldValue.increment(data.stakes[data.creatorId])
                    });
                }
                console.log(`[settleDue] pending 만료 취소: ${docSnap.id}`);
            }
        }

        // 종료된 active 챌린지 결산
        const today = todayKST();
        const dueSnap = await db.collection('social_challenges')
            .where('status', '==', 'active')
            .where('endDate', '<', today)
            .get();
        console.log(`[settleDueSocialChallenges] 결산 대상: ${dueSnap.size}개`);
        for (const docSnap of dueSnap.docs) {
            try {
                await settleChallengeById(docSnap.id);
            } catch (e) {
                console.error(`[settleDue] ${docSnap.id} 결산 실패:`, e.message);
            }
        }
    }
);

