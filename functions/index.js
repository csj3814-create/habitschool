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
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { ethers } = require("ethers");
const contractAbi = require("./contract-abi.json");

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
const HABIT_ADDRESS = "0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B";
const STAKING_ADDRESS = "0x7e8c29699F382B553891f853299e615257491F9D";
const RPC_URL = "https://data-seed-prebsc-1-s1.binance.org:8545/";
const CHAIN_ID = 97;
const EXPLORER_URL = "https://testnet.bscscan.com";

// 일일 변환 한도
const MAX_DAILY_HBT = 12000;
const MIN_POINTS = 100;
const CHATBOT_LINK_CODE_LENGTH = 8;
const CHATBOT_LINK_CODE_TTL_MINUTES = 10;
const FRIEND_REQUEST_TTL_DAYS = 3;

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
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
}) {
    const friendshipId = buildFriendshipId(uidA, uidB);
    const friendshipRef = db.doc(`friendships/${friendshipId}`);
    const now = FieldValue.serverTimestamp();
    const requesterName = requesterUid === uidA ? nameA : nameB;

    tx.set(friendshipRef, {
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
    }, { merge: true });

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
    tokenDocRef = null,
    legacyUserRef = null
}) {
    const normalizedToken = String(token || "").trim();
    if (!normalizedToken || !uid) return;

    const existing = targetMap.get(normalizedToken) || {
        token: normalizedToken,
        uid,
        userIds: new Set(),
        tokenDocRefs: [],
        legacyUserRefs: []
    };

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
            .select("fcmToken")
            .get();
    }

    usersSnap.docs.forEach((snap) => {
        const token = String(snap.data()?.fcmToken || "").trim();
        if (!token) return;
        addPushTarget(targetMap, {
            token,
            uid: snap.id,
            legacyUserRef: snap.ref
        });
    });
}

async function collectPushTargetsForUsers(userIds) {
    const targetMap = new Map();
    const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
    if (uniqueUserIds.length === 0) return [];

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

async function loadShareMediaDataUrl(candidateUrls = []) {
    const bucket = admin.storage().bucket();

    for (const rawUrl of candidateUrls) {
        const storagePath = extractStoragePathFromUrl(rawUrl);
        if (!storagePath) continue;
        if (/\.(mp4|mov|webm|m4v)$/i.test(storagePath)) continue;

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
    return new ethers.Contract(HABIT_ADDRESS, contractAbi.HaBit, signerOrProvider);
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

        if (!pointAmount || typeof pointAmount !== "number" || pointAmount < MIN_POINTS) {
            throw new HttpsError("invalid-argument", `최소 ${MIN_POINTS}P 이상 필요합니다.`);
        }
        if (pointAmount % 100 !== 0) {
            throw new HttpsError("invalid-argument", "100P 단위로만 변환 가능합니다.");
        }

        try {
            // 0. 중복 요청 방지: 처리 중 락
            const lockRef = db.collection("mint_locks").doc(uid);
            const lockSnap = await lockRef.get();
            if (lockSnap.exists) {
                const lockData = lockSnap.data();
                const lockAge = Date.now() - (lockData.timestamp?.toMillis() || 0);
                // 60초 이내 락이면 중복 요청 차단
                if (lockAge < 60000) {
                    throw new HttpsError("already-exists", "이전 변환이 처리 중입니다. 잠시 후 다시 시도해주세요.");
                }
            }
            await lockRef.set({
                timestamp: FieldValue.serverTimestamp(),
                pointAmount: pointAmount
            });

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

            // 일일 변환 한도 확인 (KST 기준 — 프론트엔드와 일치)
            const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            const dailyQuery = await db.collection("blockchain_transactions")
                .where("userId", "==", uid)
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", "==", today)
                .get();

            let todayMinted = 0;
            dailyQuery.forEach(doc => {
                todayMinted += doc.data().hbtReceived || 0;
            });

            // 2. 온체인에서 변환 비율 확인
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
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
                    `일일 변환 한도 초과. 오늘 사용: ${todayMinted} HBT, 한도: ${MAX_DAILY_HBT} HBT`);
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
            let onchainSuccess = false;

            try {
                const tx = await habitContract.mint(walletAddress, pointAmount);
                const receipt = await tx.wait();
                txHash = receipt.hash;
                onchainSuccess = true;
            } catch (chainError) {
                // 온체인 실패 시 포인트 복원
                console.error("온체인 민팅 실패, 포인트 복원:", chainError.message);
                await userRef.update({
                    coins: FieldValue.increment(pointAmount)
                });
                await lockRef.delete();
                throw new HttpsError("internal", "온체인 민팅에 실패했습니다. 잠시 후 다시 시도해주세요.");
            }

            // 5. Firestore 업데이트 (온체인 민팅 기록만, hbtBalance는 온체인이 진실의 원천)
            await userRef.update({
                totalHbtEarned: FieldValue.increment(hbtAmount)
            });

            // 6. 락 해제
            await lockRef.delete();

            // 7. 거래 기록 저장
            await db.collection("blockchain_transactions").add({
                userId: uid,
                type: "conversion",
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                conversionRate: rateNumber,
                phase: phaseNumber,
                txHash: txHash,
                walletAddress: walletAddress,
                date: today,
                timestamp: FieldValue.serverTimestamp(),
                status: "success",
                network: "baseSepolia"
            });

            return {
                success: true,
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                txHash: txHash,
                explorerUrl: `${EXPLORER_URL}/tx/${txHash}`,
                conversionRate: rateNumber,
                phase: phaseNumber
            };

        } catch (error) {
            // 에러 시 락 해제
            try { await db.collection("mint_locks").doc(uid).delete(); } catch (_) {}
            if (error instanceof HttpsError) throw error;
            console.error("mintHBT 오류:", error);
            throw new HttpsError("internal", "변환 처리 중 오류가 발생했습니다.");
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

        try {
            const userSnap = await db.collection("users").doc(uid).get();
            if (!userSnap.exists) {
                throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
            }

            const walletAddress = getEffectiveWalletAddress(userSnap.data());
            if (!walletAddress) {
                return { balance: "0", balanceFormatted: "0" };
            }

            const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
            const habitContract = getHabitContract(provider);

            const balance = await habitContract.balanceOf(walletAddress);
            const decimals = await habitContract.decimals();
            const formatted = ethers.formatUnits(balance, decimals);

            return {
                balance: balance.toString(),
                balanceFormatted: formatted,
                walletAddress: walletAddress
            };

        } catch (error) {
            if (error instanceof HttpsError) throw error;
            console.error("getOnchainBalance 오류:", error);
            throw new HttpsError("internal", "잔액 조회 중 오류가 발생했습니다.");
        }
    }
);

// ========================================
// 2-1. 사용자 지갑 가스(ETH) 자동 충전
// ========================================
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

        const userData = userSnap.data();
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
            return { funded: false, reason: "BNB 잔액 충분" };
        }

        const FUND_AMOUNT = ethers.parseEther("0.005");
        const tx = await wallet.sendTransaction({ to: walletAddress, value: FUND_AMOUNT });
        await tx.wait();

        await userRef.update({ lastGasFunded: FieldValue.serverTimestamp() });

        console.log(`✅ 가스 충전 완료: ${walletAddress} +0.005 BNB`);
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

            // v2 getTokenStats 반환: totalSupply, totalMined, totalBurned, currentRate, currentPhase, weeklyTarget, remainingInPool, totalStaked, totalSlashed
            return {
                totalSupply: ethers.formatUnits(stats[0], decimals),
                totalMined: ethers.formatUnits(stats[1], decimals),
                totalBurned: ethers.formatUnits(stats[2], decimals),
                currentRate: Number(stats[3]),
                currentPhase: Number(stats[4]),
                weeklyTarget: ethers.formatUnits(stats[5], decimals),
                remainingInPool: ethers.formatUnits(stats[6], decimals),
                totalStaked: ethers.formatUnits(stats[7], decimals),
                totalSlashed: ethers.formatUnits(stats[8], decimals)
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

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
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
                generationConfig: { responseMimeType: "application/json" }
            });

            const result = await model.generateContent([
                DIET_ANALYSIS_PROMPT,
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

        const { imageUrl, textData, analysisType } = request.data;
        if (!imageUrl && !textData) {
            throw new HttpsError("invalid-argument", "이미지 또는 텍스트 데이터가 필요합니다.");
        }

        try {
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: { responseMimeType: "application/json" }
            });

            const contentParts = [SLEEP_MIND_ANALYSIS_PROMPT];

            if (imageUrl && typeof imageUrl === "string") {
                // SSRF 방지: Firebase Storage URL 또는 data: URL만 허용
                if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/") && !imageUrl.startsWith("data:")) {
                    throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
                }
                try {
                    if (imageUrl.startsWith("data:")) {
                        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                        if (!matches) {
                            throw new HttpsError("invalid-argument", "잘못된 data URL 형식입니다.");
                        }
                        // MIME 타입 화이트리스트
                        const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
                        if (!allowedMimes.includes(matches[1])) {
                            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 형식입니다.");
                        }
                        // Base64 크기 제한 (5MB)
                        if (matches[2].length > 5 * 1024 * 1024 * 1.37) {
                            throw new HttpsError("invalid-argument", "이미지 크기가 너무 큽니다 (최대 5MB).");
                        }
                        contentParts.push({
                            inlineData: {
                                data: matches[2],
                                mimeType: matches[1]
                            }
                        });
                    } else {
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
                    }
                } catch (imgError) {
                    console.warn("수면 이미지 처리 실패:", imgError.message);
                }
            }

            if (textData) {
                contentParts.push(`사용자 기록: ${textData}`);
            }

            contentParts.push(`분석 유형: ${analysisType || 'sleep'}`);

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

        const { imageUrl } = request.data;
        if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        // SSRF 방지: Firebase Storage URL만 허용
        if (!imageUrl.startsWith("https://firebasestorage.googleapis.com/")) {
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
                STEP_SCREENSHOT_PROMPT,
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
                imageHash: imageHash,
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
 * 클라이언트가 직접 coins를 수정하지 않고, 서버에서 안전하게 처리
 */
exports.awardPoints = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();

        // 삭제된 경우 무시
        if (!after) return;

        const userId = after.userId;
        if (!userId) return;

        const newAwarded = after.awardedPoints || {};
        const oldAwarded = before?.awardedPoints || {};

        const newTotal = (newAwarded.dietPoints || 0) + (newAwarded.exercisePoints || 0) + (newAwarded.mindPoints || 0);
        const oldTotal = (oldAwarded.dietPoints || 0) + (oldAwarded.exercisePoints || 0) + (oldAwarded.mindPoints || 0);
        const diff = newTotal - oldTotal;

        if (diff <= 0) return;

        try {
            const userRef = db.doc(`users/${userId}`);
            await userRef.set({ coins: FieldValue.increment(diff) }, { merge: true });
            console.log(`awardPoints: ${userId} +${diff}P (total: ${newTotal})`);

            // 스트릭 계산 및 저장
            const logDate = after.date;
            if (logDate) {
                const streak = await calculateStreak(userId, logDate);
                await event.data.after.ref.set({ currentStreak: streak }, { merge: true });
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
    const userSnap = await db.doc(`users/${userId}`).get();
    const userData = userSnap.data();
    if (!userData || !userData.referredBy) return;

    if (streak === 3 && !userData.referralDay3BonusGiven) {
        await db.doc(`users/${userData.referredBy}`).set(
            { coins: FieldValue.increment(500) }, { merge: true }
        );
        await db.doc(`users/${userId}`).set({ referralDay3BonusGiven: true }, { merge: true });
        console.log(`referral 3-day: ${userId} → referrer ${userData.referredBy} +500P`);
    }
    if (streak === 7 && !userData.referralDay7BonusGiven) {
        await db.doc(`users/${userId}`).set({
            coins: FieldValue.increment(300),
            referralDay7BonusGiven: true
        }, { merge: true });
        console.log(`referral 7-day: ${userId} +300P`);
    }
}

/**
 * 마일스톤 보너스 지급
 * users 문서의 milestones 필드 변경 시 bonusClaimed가 true로 바뀌면 coins 지급
 */
exports.awardMilestoneBonus = onDocumentWritten(
    { document: "users/{userId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();

        if (!after || !after.milestones) return;

        const newMilestones = after.milestones || {};
        const oldMilestones = before?.milestones || {};

        let totalBonus = 0;
        for (const [key, val] of Object.entries(newMilestones)) {
            if (val.bonusClaimed && val.bonusAmount > 0 && !oldMilestones[key]?.bonusClaimed) {
                totalBonus += val.bonusAmount;
            }
        }

        if (totalBonus <= 0) return;

        try {
            const userRef = db.doc(`users/${event.params.userId}`);
            await userRef.set({ coins: FieldValue.increment(totalBonus) }, { merge: true });
            console.log(`awardMilestoneBonus: ${event.params.userId} +${totalBonus}P`);
        } catch (err) {
            console.error("awardMilestoneBonus 오류:", err);
        }
    }
);

/**
 * 갤러리 리액션 시 포인트 지급
 * heart/fire/clap 배열에 새 UID가 추가되면 리액션 누른 사람 +1P, 게시물 주인 +1P
 * 본인 게시물 제외, 리액션 취소 시 회수 없음
 */
exports.awardReactionPoints = onDocumentWritten(
    { document: "daily_logs/{logId}", region: "asia-northeast3" },
    async (event) => {
        const after = event.data?.after?.data();
        const before = event.data?.before?.data();
        if (!after) return;
        const postOwnerId = after.userId;
        if (!postOwnerId) return;

        for (const type of ["heart", "fire", "clap"]) {
            const afterList = after.reactions?.[type] || [];
            const beforeList = before?.reactions?.[type] || [];
            const added = afterList.filter(uid => !beforeList.includes(uid));
            for (const reactorUid of added) {
                if (reactorUid === postOwnerId) continue;
                await db.doc(`users/${reactorUid}`).set(
                    { coins: FieldValue.increment(1) }, { merge: true }
                );
                await db.doc(`users/${postOwnerId}`).set(
                    { coins: FieldValue.increment(1) }, { merge: true }
                );
                console.log(`reactionPoints: ${reactorUid} → ${postOwnerId} +1P each (${type})`);
            }
        }
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

        const outcome = await db.runTransaction(async (tx) => {
            const [userSnap, referrerSnap, friendshipSnap] = await Promise.all([
                tx.get(userRef),
                tx.get(referrerRef),
                tx.get(friendshipRef),
            ]);

            if (!userSnap.exists) {
                throw new HttpsError("not-found", "가입 사용자 정보를 찾을 수 없습니다.");
            }
            if (!referrerSnap.exists) {
                throw new HttpsError("not-found", "초대한 사용자를 찾을 수 없습니다.");
            }
            if (userSnap.data()?.referredBy) {
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

            const { friendshipId } = upsertActiveFriendship(tx, {
                uidA: referrerUid,
                uidB: uid,
                nameA: referrerName,
                nameB: inviteeName,
                source: "invite_link_signup",
                requesterUid: friendshipData?.requesterUid || referrerUid,
                requestedAt: existingRequestedAt,
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

/**
 * 가입 축하 보너스 +200P (온보딩 완료 시 1회만 지급)
 */
exports.awardWelcomeBonus = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인 필요");

        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        // 이미 지급된 경우 중복 방지
        if (userSnap.exists && userSnap.data().welcomeBonusGiven) {
            return { success: false, reason: "already_given" };
        }

        await userRef.set({
            welcomeBonusGiven: true,
            coins: FieldValue.increment(200)
        }, { merge: true });

        console.log(`welcome bonus +200P: ${uid}`);
        return { success: true, bonus: 200 };
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

        // welcomeBonusGiven 없는 유저 전체 조회
        const usersSnap = await db.collection("users")
            .where("welcomeBonusGiven", "==", null)
            .get()
            .catch(() => null);

        // where != null은 존재하지 않는 필드를 못 잡으므로 전체 조회 후 필터
        const allSnap = await db.collection("users").get();
        const targets = allSnap.docs.filter(d => !d.data().welcomeBonusGiven);

        if (targets.length === 0) return { grantedCount: 0, message: "모든 회원이 이미 지급받았습니다" };

        const results = await Promise.allSettled(targets.map(d =>
            db.doc(`users/${d.id}`).set({
                welcomeBonusGiven: true,
                coins: FieldValue.increment(200)
            }, { merge: true })
        ));

        const grantedCount = results.filter(r => r.status === "fulfilled").length;
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
                generationConfig: { responseMimeType: "application/json" }
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

exports.startChallenge = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 30
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { challengeId, hbtAmount, stakeTxHash } = request.data;
        // 하위 호환: 기존 ID를 새 ID로 매핑
        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const def = CHALLENGE_DEFS[resolvedId];
        if (!def) {
            throw new HttpsError("invalid-argument", "유효하지 않은 챌린지입니다.");
        }

        const stakeAmount = parseFloat(hbtAmount) || 0;
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

        const userData = userSnap.data();

        // 온체인 스테이킹 검증 (HBT 예치가 있는 경우)
        if (stakeAmount > 0) {
            if (!stakeTxHash) {
                throw new HttpsError("failed-precondition", "온체인 예치 트랜잭션이 필요합니다.");
            }
            // 온체인에서 트랜잭션 확인
            try {
                const { provider } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const receipt = await provider.getTransactionReceipt(stakeTxHash);
                if (!receipt || receipt.status !== 1) {
                    throw new HttpsError("failed-precondition", "온체인 예치 트랜잭션이 실패했거나 아직 확인되지 않았습니다.");
                }
            } catch (verifyErr) {
                if (verifyErr.code) throw verifyErr; // HttpsError는 그대로 전달
                console.error("온체인 검증 오류:", verifyErr.message);
                throw new HttpsError("internal", "온체인 예치 검증에 실패했습니다.");
            }
        }

        // 같은 티어에 진행 중인 챌린지 확인
        const activeChallenges = userData.activeChallenges || {};
        if (activeChallenges[def.tier] && 
            (activeChallenges[def.tier].status === 'ongoing' || activeChallenges[def.tier].status === 'claimable')) {
            throw new HttpsError("failed-precondition", "이미 해당 티어에 진행 중인 챌린지가 있습니다.");
        }

        // KST 날짜 계산
        const now = new Date();
        const kstOffset = 9 * 60 * 60 * 1000;
        const kstDate = new Date(now.getTime() + kstOffset);
        const startDate = kstDate.toISOString().split('T')[0];
        const endDateObj = new Date(startDate + 'T12:00:00Z');
        endDateObj.setUTCDate(endDateObj.getUTCDate() + def.duration);
        const endDate = endDateObj.toISOString().split('T')[0];

        // 오늘 인증 확인
        let initialCompletedDays = 0;
        let initialCompletedDates = [];
        try {
            const todayLogSnap = await db.doc(`daily_logs/${uid}_${startDate}`).get();
            if (todayLogSnap.exists) {
                const ap = todayLogSnap.data().awardedPoints || {};
                if (ap.diet && ap.exercise && ap.mind) {
                    initialCompletedDays = 1;
                    initialCompletedDates = [startDate];
                }
            }
        } catch (e) {
            // 무시
        }

        const challengeData = {
            challengeId: resolvedId,
            startDate,
            endDate,
            completedDays: initialCompletedDays,
            completedDates: initialCompletedDates,
            totalDays: def.duration,
            hbtStaked: stakeAmount,
            stakeTxHash: stakeTxHash || null,
            stakedOnChain: stakeAmount > 0,
            status: 'ongoing',
            tier: def.tier
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
                stakeTxHash,
                onChain: true,
                timestamp: FieldValue.serverTimestamp(),
                status: 'success'
            });
        }

        return {
            success: true,
            tier: def.tier,
            duration: def.duration,
            hbtStaked: stakeAmount,
            initialCompletedDays
        };
    }
);

exports.claimChallengeReward = onCall(
    {
        secrets: [SERVER_MINTER_KEY],
        region: "asia-northeast3",
        maxInstances: 10,
        timeoutSeconds: 60
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
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const activeChallenges = userData.activeChallenges || {};
        const challenge = activeChallenges[tier];

        if (!challenge || challenge.status !== 'claimable') {
            throw new HttpsError("failed-precondition", "수령할 보상이 없습니다.");
        }

        const totalDays = challenge.totalDays || 30;
        const successRate = (challenge.completedDays || 0) / totalDays;
        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const resolvedChallengeId = CHALLENGE_ID_MAP[challenge.challengeId] || challenge.challengeId;
        const challengeDef = CHALLENGE_REWARDS[resolvedChallengeId] || {};
        const baseRewardP = challengeDef.rewardPoints || 0;
        let rewardHbt = 0;
        let rewardPoints = 0;
        let resolveTxHash = null;
        let bonusTxHash = null;

        if (staked > 0) {
            if (successRate >= 1.0) {
                const bonusRate = tier === 'master' ? 2.0 : 0.5;
                rewardHbt = staked + (staked * bonusRate);
                rewardPoints = baseRewardP;
            } else if (successRate >= 0.8) {
                rewardHbt = staked;
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
            const userWalletAddress = getEffectiveWalletAddress(userData);
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const habitContract = getHabitContract(wallet);

                // 1) resolveChallenge(user, true) — 스테이킹 원금 100% 반환
                const resolveTx = await habitContract.resolveChallenge(userWalletAddress, true);
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;

                // 2) 100% 달성 시 보너스 HBT 온체인 민팅
                if (successRate >= 1.0) {
                    const DECIMALS = 8;
                    const stakedRaw = ethers.parseUnits(staked.toString(), DECIMALS);
                    const bonusMultiplier = tier === 'master' ? 200n : 50n;
                    const bonusHbtRaw = stakedRaw * bonusMultiplier / 100n;

                    if (bonusHbtRaw > 0n) {
                        const currentRate = await habitContract.currentRate();
                        const pointAmount = bonusHbtRaw / currentRate;
                        if (pointAmount > 0n) {
                            const bonusTx = await habitContract.mint(userWalletAddress, pointAmount);
                            const bonusReceipt = await bonusTx.wait();
                            bonusTxHash = bonusReceipt.hash;
                        }
                    }
                }
            } catch (onChainErr) {
                // NoStakeFound(0x59be8f02): 이미 온체인 정산 완료 → Firestore 정리만 진행
                // ethers v6가 커스텀 에러를 "unknown custom error"로 표시하므로 data 셀렉터로 판별
                const errData = onChainErr?.data || onChainErr?.error?.data || '';
                const isAlreadySettled =
                    onChainErr?.errorName === 'NoStakeFound' ||
                    (onChainErr?.message || '').includes('NoStakeFound') ||
                    String(errData).startsWith('0x59be8f02'); // NoStakeFound() selector
                if (isAlreadySettled) {
                    console.warn("온체인 이미 정산됨(NoStakeFound), Firestore 정리만 진행합니다.");
                    rewardHbt = 0; // HBT는 이미 반환됨
                } else {
                    console.error("온체인 정산 오류:", onChainErr.message);
                    throw new HttpsError("internal", "온체인 챌린지 정산에 실패했습니다.");
                }
            }
        }

        // Firestore 업데이트 (hbtBalance 제거 — 온체인이 진실의 원천)
        const updateData = {};
        updateData[`activeChallenges.${tier}`] = FieldValue.delete();
        if (rewardPoints > 0) updateData.coins = FieldValue.increment(rewardPoints);

        await userRef.update(updateData);

        // 거래 기록 (온체인 TX 해시 포함, date 필드 추가 — 앱의 날짜별 HBT 집계에 필요)
        const _kstDateStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
        await db.collection("blockchain_transactions").add({
            userId: uid,
            type: 'challenge_settlement',
            challengeId: challenge.challengeId,
            amount: rewardHbt,
            date: _kstDateStr,
            staked: staked,
            successRate: successRate,
            completedDays: challenge.completedDays || 0,
            onChain: stakedOnChain,
            resolveTxHash,
            bonusTxHash,
            timestamp: FieldValue.serverTimestamp(),
            status: 'success'
        });

        return {
            success: true,
            rewardHbt,
            rewardPoints,
            tier,
            successRate: Math.round(successRate * 100),
            resolveTxHash,
            bonusTxHash
        };
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
        timeoutSeconds: 60
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
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();

        if (!userSnap.exists) {
            throw new HttpsError("not-found", "사용자를 찾을 수 없습니다.");
        }

        const userData = userSnap.data();
        const activeChallenges = userData.activeChallenges || {};
        const challenge = activeChallenges[tier];

        if (!challenge) {
            throw new HttpsError("failed-precondition", "해당 티어의 챌린지를 찾을 수 없습니다.");
        }

        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const totalDays = challenge.totalDays || 30;
        const successRate = (challenge.completedDays || 0) / totalDays;
        let resolveTxHash = null;

        // 온체인 정산: resolveChallenge(user, false) → 50% 소각 + 50% 반환
        if (stakedOnChain && staked > 0) {
            const userWalletAddress = getEffectiveWalletAddress(userData);
            if (!userWalletAddress) {
                throw new HttpsError("failed-precondition", "사용자 지갑 주소를 찾을 수 없습니다.");
            }

            try {
                const { wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
                const habitContract = getHabitContract(wallet);

                const resolveTx = await habitContract.resolveChallenge(userWalletAddress, false);
                const resolveReceipt = await resolveTx.wait();
                resolveTxHash = resolveReceipt.hash;
            } catch (onChainErr) {
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
            burned: stakedOnChain ? staked / 2 : 0,
            returned: stakedOnChain ? staked / 2 : 0,
            successRate: successRate,
            completedDays: challenge.completedDays || 0,
            onChain: stakedOnChain,
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
            log.comments.forEach(c => {
                if (!c.userId) return;
                if (!userStats[c.userId]) userStats[c.userId] = { days: 0, comments: 0, reactions: 0, name: c.userName || '익명' };
                userStats[c.userId].comments++;
            });
        }
        if (log.reactions) {
            ['heart', 'fire', 'clap'].forEach(type => {
                if (Array.isArray(log.reactions[type])) {
                    log.reactions[type].forEach(uid => {
                        if (!userStats[uid]) userStats[uid] = { days: 0, comments: 0, reactions: 0, name: '회원' };
                        userStats[uid].reactions++;
                    });
                }
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

        try {
            // 1. 온체인 현재 상태 조회
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
            const habitContract = getHabitContract(wallet);

            // 멱등성 보장: Firestore mining_rate_history에 이번 주(weekId) 기록이 이미 있으면 스킵
            // (온체인 lastRateUpdate 6일 기준은 수동 조정 후 다음 주 스케줄이 skip되는 버그 있음)
            const nowForWeek = new Date();
            const dayOfWeekForCheck = (nowForWeek.getUTCDay() + 6) % 7;
            const mondayForCheck = new Date(nowForWeek.getTime() - dayOfWeekForCheck * 86400000);
            const jan4ForCheck = new Date(Date.UTC(mondayForCheck.getUTCFullYear(), 0, 4));
            const isoWeekForCheck = Math.round((mondayForCheck - jan4ForCheck) / (7 * 86400000)) + 1;
            const currentWeekId = `${mondayForCheck.getUTCFullYear()}-W${String(isoWeekForCheck).padStart(2, "0")}`;

            const existingRecord = await db.collection("mining_rate_history").doc(currentWeekId).get();
            if (existingRecord.exists && existingRecord.data()?.status === "success") {
                console.log(`⏭️ 이미 이번 주(${currentWeekId}) 비율 조정 완료, 건너뜁니다.`);
                return;
            }

            const currentRateRaw = await habitContract.currentRate();
            const totalMintedRaw = await habitContract.totalMintedFromMining();
            const decimals = await habitContract.decimals();

            const currentRateNumber = Number(currentRateRaw) / RATE_SCALE; // HBT per P
            const totalMinedHbt = parseFloat(ethers.formatUnits(totalMintedRaw, decimals));

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
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr);

            const txSnap = await txQuery.get();
            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                last7DaysMinted += doc.data().hbtReceived || 0;
                txCount++;
            });

            console.log(`📊 7일간 채굴량: ${last7DaysMinted.toLocaleString()} HBT (${txCount}건)`);

            // 3. 새 비율 계산
            const result = calculateNewRate(currentRateNumber, last7DaysMinted, totalMinedHbt);

            console.log(`📊 Phase: ${result.phase}, 주간 목표: ${result.weeklyTarget.toLocaleString()} HBT`);
            console.log(`📊 조정 배수: ${result.adjustmentRatio}x${result.clamped ? ` (${result.clampReason})` : ""}`);
            console.log(`📊 새 비율: ${result.newRate} HBT/P (raw: ${result.newRateScaled})`);

            // 4. 비율 변경이 없으면 스킵
            if (result.newRateScaled === Number(currentRateRaw)) {
                console.log("⏭️ 비율 변경 없음, 스킵합니다.");
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "no_change");
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
                        await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "chain_error", chainErrorMsg);
                        return;
                    }
                }
            }
            if (!txHash) {
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, null, "chain_error", "RateChangeExceedsLimit: 이분탐색 실패");
                return;
            }

            // 6. Firestore에 이력 저장
            await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, txHash, "success");

            console.log("✅ 주간 채굴 난이도 조절 완료!");

        } catch (error) {
            console.error("❌ 주간 난이도 조절 오류:", error);
        }
    }
);

/**
 * 비율 조정 이력 Firestore 저장
 */
async function saveRateHistory(result, previousRate, last7DaysMinted, totalMinedHbt, txCount, txHash, status, errorMessage) {
    const now = new Date();
    // ISO 8601 주차 계산 (목요일 기준)
    const jan4 = new Date(Date.UTC(now.getUTCFullYear(), 0, 4));
    const dayOfWeek = (now.getUTCDay() + 6) % 7; // 월=0 ... 일=6
    const monday = new Date(now.getTime() - dayOfWeek * 86400000);
    const isoWeek = Math.round((monday - jan4) / (7 * 86400000)) + 1;
    const weekId = `${monday.getUTCFullYear()}-W${String(isoWeek).padStart(2, "0")}`;

    await db.collection("mining_rate_history").doc(weekId).set({
        weekId,
        timestamp: FieldValue.serverTimestamp(),
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
        errorMessage: errorMessage || null
    });
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
            const { provider, wallet } = getProviderAndWallet(SERVER_MINTER_KEY.value());
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

            const txSnap = await db.collection("blockchain_transactions")
                .where("type", "==", "conversion")
                .where("status", "==", "success")
                .where("date", ">=", startDateStr)
                .where("date", "<=", endDateStr)
                .get();

            let last7DaysMinted = 0;
            let txCount = 0;
            txSnap.forEach(doc => {
                last7DaysMinted += doc.data().hbtReceived || 0;
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
                await saveRateHistory(result, currentRateNumber, last7DaysMinted, totalMinedHbt, txCount, txHash, "manual");
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
            log.comments.forEach(c => {
                if (!c.userId) return;
                if (!userStats[c.userId]) userStats[c.userId] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: c.userName || "익명" };
                userStats[c.userId].comments++;
            });
        }
        if (log.reactions) {
            ["heart", "fire", "clap"].forEach(type => {
                if (Array.isArray(log.reactions[type])) {
                    log.reactions[type].forEach(ruid => {
                        if (!userStats[ruid]) userStats[ruid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: "회원" };
                        userStats[ruid].reactions++;
                    });
                }
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
                log.comments.forEach(c => {
                    if (!c.userId) return;
                    if (!userStats[c.userId]) userStats[c.userId] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: c.userName || "익명" };
                    userStats[c.userId].comments++;
                });
            }
            if (log.reactions) {
                ["heart", "fire", "clap"].forEach(type => {
                    if (Array.isArray(log.reactions[type])) {
                        log.reactions[type].forEach(ruid => {
                            if (!userStats[ruid]) userStats[ruid] = { days: 0, comments: 0, reactions: 0, diet: 0, exercise: 0, mind: 0, name: "회원" };
                            userStats[ruid].reactions++;
                        });
                    }
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
// 사용자 지갑 가스(ETH) 자동 충전
// ========================================
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

        const userData = userSnap.data();
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
            return { funded: false, reason: "BNB 잔액 충분" };
        }

        const FUND_AMOUNT = ethers.parseEther("0.005");
        const tx = await wallet.sendTransaction({ to: walletAddress, value: FUND_AMOUNT });
        await tx.wait();

        await userRef.update({ lastGasFunded: FieldValue.serverTimestamp() });

        console.log(`✅ 가스 충전 완료: ${walletAddress} +0.005 BNB`);
        return { funded: true, amount: "0.005", txHash: tx.hash };
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
exports.sendDailyReminder = onSchedule(
    { schedule: "0 11 * * *", region: "asia-northeast3", timeZone: "UTC" },
    async () => {
        const todayKST = getTodayKST();
        const loggedIds = await getTodayLoggedUserIds(todayKST);

        const targets = (await collectAllPushTargets())
            .filter((target) => !loggedIds.has(target.uid));

        console.log(`sendDailyReminder: ${targets.length} targets / ${loggedIds.size} logged today`);
        const reminderUrl = buildAppPath("diet", { focus: "upload" });
        await sendMulticast(targets, {
            title: "오늘 기록을 시작해 볼까요?",
            body: "식단 사진 한 장부터 올리면 오늘 루틴이 바로 시작돼요.",
            tag: "daily-reminder",
            url: reminderUrl,
            actions: buildNotificationActions([
                { action: "record-now", title: "지금 기록", url: reminderUrl }
            ])
        }); /*
            "🌞 오늘 건강 기록하셨나요?",
            "식단·운동·수면 기록으로 건강 습관을 이어가세요!",
            "daily-reminder"
        ); */
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

        const targets = await collectPushTargetsForUsers(eligibleUserIds);
        console.log(`sendStreakAlert: ${targets.length} targets`);
        const streakUrl = buildAppPath("diet", { focus: "upload" });
        await sendMulticast(targets, {
            title: "연속 기록을 이어갈 시간이에요",
            body: "지금 기록하면 이어온 흐름을 지킬 수 있어요.",
            tag: "streak-alert",
            url: streakUrl,
            actions: buildNotificationActions([
                { action: "record-now", title: "지금 기록", url: streakUrl }
            ])
        }); /*
            sendJobs.map(j => j.token),
            sendJobs.map(j => j.uid),
            "🔥 연속 습관 달성이 끊길 위기!",
            "지금 기록하면 연속 달성을 지킬 수 있어요",
            "streak-alert"
        ); */
    }
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
