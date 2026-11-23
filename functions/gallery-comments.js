/**
 * 갤러리 댓글 달기 — 답글·알림·댓글 포인트.
 *
 * 2026-11-22: 「게시」를 누르고 3초쯤 아무 반응이 없다는 대표 의견. 운영 로그(30일, 39건)로 보니
 * 깨어 있는 함수는 0.09초에 끝났지만 절반이 콜드 스타트였고, 그때는 인스턴스 시작부터 응답까지
 * 3초 남짓(시작 약 2.4초 + 처리 약 0.95초)이었다. 그래서 runtime.js(1만 4천 줄, ethers·ffmpeg 등)를
 * 읽지 않고 이 파일만 읽게 했다(functions/index.js 의 FAST_START_MODULES, PC 측정 0.59초 → 0.38초).
 * 화면은 누르는 즉시 댓글을 흐리게 붙이고 이 함수의 답으로 확정한다(js/app-core.js addComment).
 *
 * 같은 날 대표 결정(tasks/2026-11-22_갤러리_댓글_알림_계획.md):
 *  - 답글: replyToCommentId 를 받으면 그 댓글의 쓴 사람을 replyTo 로 함께 남긴다.
 *  - 알림: 내 글에 댓글 → 글 주인에게 gallery_comment, 내 댓글에 답글 → 그 댓글 쓴 사람에게
 *    gallery_reply 를 notifications 에 남긴다. 푸시는 runtime.js 의 sendGalleryCommentPush 가
 *    이 알림 문서를 보고 보낸다(푸시 도구가 runtime.js 에 있고, 회원이 푸시를 기다릴 필요는 없다).
 *  - 댓글 포인트: 반응처럼 쓴 사람·글 주인 각 +1P. 남의 글에, 글마다 한 번, 하루 5번까지,
 *    공백을 뺀 4글자 이상. 원장은 reaction_point_ledger 에 kind:'comment' 로 남긴다 — 회원이
 *    이미 읽을 수 있는 원장이라 포인트 내역에 바로 보이고 규칙을 바꿀 필요가 없다.
 *    하루 횟수는 comment_point_daily/{uid}_{KST 날짜} 가 센다(서버만 쓴다).
 */

const { onCall: baseOnCall, HttpsError } = require("firebase-functions/v2/https");
// 콜러블이 던진 오류 문장에 영어를 싣는다(functions/error-messages.js, 해외 3단계 E6-2).
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const crypto = require("crypto");
const { resolveDisplayBadgeEmoji } = require("./global-rewards");
const { getCurrentKstDateString } = require("./challenge-utils");

const COMMENT_MAX_CHARS = 200;
const COMMENT_POINT = 1;
const COMMENT_POINT_DAILY_LIMIT = 5;
const COMMENT_POINT_MIN_CHARS = 4;
const NOTIFICATION_PREVIEW_CHARS = 80;
const GALLERY_COMMENT_NOTIFICATION_TYPES = Object.freeze(["gallery_comment", "gallery_reply"]);

function getDb() {
    if (!admin.apps.some((app) => app?.name === "[DEFAULT]")) admin.initializeApp();
    return admin.firestore();
}

function normalizeCommentText(value) {
    return String(value || "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, COMMENT_MAX_CHARS);
}

// 이모지 하나도 한 글자로 센다.
function countVisibleChars(text) {
    return [...String(text || "").replace(/\s+/g, "")].length;
}

function findReplyTarget(comments, replyToCommentId) {
    if (!replyToCommentId || !Array.isArray(comments)) return null;
    const target = comments.find((comment) => comment && comment.id === replyToCommentId);
    if (!target || !target.userId) return null;
    return {
        id: String(target.id),
        userId: String(target.userId),
        userName: String(target.userName || "").slice(0, 80),
    };
}

/**
 * 누구에게 알릴지. 본인에게는 알리지 않고, 답글 대상이 글 주인이면 한 번(답글)만 알린다.
 */
function planCommentNotifications({ uid, postOwnerId, replyTo }) {
    const recipients = [];
    if (replyTo && replyTo.userId && replyTo.userId !== uid) {
        recipients.push({ uid: replyTo.userId, type: "gallery_reply" });
    }
    if (postOwnerId && postOwnerId !== uid && postOwnerId !== replyTo?.userId) {
        recipients.push({ uid: postOwnerId, type: "gallery_comment" });
    }
    return recipients;
}

function decideCommentPoints({ uid, postOwnerId, text, alreadyAwarded, todayCount }) {
    if (!postOwnerId || postOwnerId === uid) return false;
    if (alreadyAwarded) return false;
    if (countVisibleChars(text) < COMMENT_POINT_MIN_CHARS) return false;
    return Number(todayCount || 0) < COMMENT_POINT_DAILY_LIMIT;
}

async function addGalleryCommentHandler(request, { db = getDb(), now = Date.now() } = {}) {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    const postId = String(request.data?.postId || "").trim();
    const text = normalizeCommentText(request.data?.text);
    const replyToCommentId = String(request.data?.replyToCommentId || "").trim().slice(0, 80);
    if (!postId || postId.includes("/") || !text) throw new HttpsError("invalid-argument", "댓글 내용이 필요합니다.");

    // 사용자 문서는 트랜잭션 밖에서 읽는다(포인트 지급과 서로 잠그지 않게).
    const userSnapshot = await db.doc(`users/${uid}`).get();
    const userData = userSnapshot.data() || {};
    const comment = {
        id: crypto.randomUUID(),
        userId: uid,
        userName: String(userData.customDisplayName || userData.displayName || "회원").slice(0, 80),
        text,
        timestamp: now,
    };
    // 해빛 배지: 댓글을 달 때의 대표 배지를 함께 남긴다(나중에 배지를 바꿔도 이 댓글은 그대로).
    const userBadge = resolveDisplayBadgeEmoji(userData);
    if (userBadge) comment.userBadge = userBadge;

    const today = getCurrentKstDateString(new Date(now));
    const postRef = db.doc(`gallery_posts/${postId}`);
    const ledgerRef = db.doc(`reaction_point_ledger/comment_${postId}_${uid}`);
    const dailyRef = db.doc(`comment_point_daily/${uid}_${today}`);

    const outcome = await db.runTransaction(async (tx) => {
        const [postSnapshot, ledgerSnapshot, dailySnapshot] = await Promise.all([
            tx.get(postRef),
            tx.get(ledgerRef),
            tx.get(dailyRef),
        ]);
        if (!postSnapshot.exists) throw new HttpsError("not-found", "게시물을 찾을 수 없습니다.");
        const post = postSnapshot.data() || {};
        const postOwnerId = String(post.userId || "");

        const replyTo = findReplyTarget(post.comments, replyToCommentId);
        const savedComment = replyTo ? { ...comment, replyTo } : comment;
        tx.update(postRef, { comments: FieldValue.arrayUnion(savedComment) });

        const pointsAwarded = decideCommentPoints({
            uid,
            postOwnerId,
            text,
            alreadyAwarded: ledgerSnapshot.exists,
            todayCount: dailySnapshot.exists ? dailySnapshot.data()?.count : 0,
        });
        if (pointsAwarded) {
            tx.set(db.doc(`users/${uid}`), { coins: FieldValue.increment(COMMENT_POINT) }, { merge: true });
            tx.set(db.doc(`users/${postOwnerId}`), { coins: FieldValue.increment(COMMENT_POINT) }, { merge: true });
            tx.create(ledgerRef, {
                kind: "comment",
                postId,
                commentId: comment.id,
                reactorUserId: uid,
                postOwnerId,
                pointsPerUser: COMMENT_POINT,
                date: today,
                createdAt: FieldValue.serverTimestamp(),
            });
            tx.set(dailyRef, { uid, date: today, count: FieldValue.increment(1) }, { merge: true });
        }

        planCommentNotifications({ uid, postOwnerId, replyTo }).forEach((recipient) => {
            tx.set(db.collection("notifications").doc(), {
                postOwnerId: recipient.uid,
                type: recipient.type,
                fromUserId: uid,
                fromUserName: comment.userName,
                postId,
                commentId: comment.id,
                preview: text.slice(0, NOTIFICATION_PREVIEW_CHARS),
                createdAt: FieldValue.serverTimestamp(),
            });
        });

        return { savedComment, pointsAwarded };
    });

    return { comment: outcome.savedComment, pointsAwarded: outcome.pointsAwarded ? COMMENT_POINT : 0 };
}

exports.addGalleryComment = onCall(
    { region: "asia-northeast3" },
    (request) => addGalleryCommentHandler(request)
);

exports.GALLERY_COMMENT_NOTIFICATION_TYPES = GALLERY_COMMENT_NOTIFICATION_TYPES;
exports._test = {
    addGalleryCommentHandler,
    normalizeCommentText,
    countVisibleChars,
    findReplyTarget,
    planCommentNotifications,
    decideCommentPoints,
    COMMENT_POINT_DAILY_LIMIT,
};
