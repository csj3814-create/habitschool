/**
 * 갤러리 댓글·답글 푸시 (2026-11-22 대표 결정, tasks/2026-11-22_갤러리_댓글_알림_계획.md).
 *
 * addGalleryComment(functions/gallery-comments.js)가 notifications 에 gallery_comment /
 * gallery_reply 를 남기면 runtime.js 의 sendGalleryCommentPush 가 이 파일로 보낼지 정하고 알림을 만든다.
 *  - 좋아요는 푸시하지 않는다(과하다). 댓글·답글만.
 *  - 받는 사람이 그 회원을 차단했으면 알림 문서까지 지운다.
 *  - 설정에서 껐으면(settings.commentPushOptOut) 앱 안 소식으로만 남긴다.
 *  - 밤 10시~아침 8시(회원 시각)에는 깨우지 않는다. 앱 안 소식은 남는다.
 *  - 같은 글 알림은 tag 가 같아 새 알림이 옛 알림을 덮는다.
 * 웹 푸시는 알림에 입력칸을 달 수 없다. 「답글 달기」 단추가 그 글을 열고 입력칸을 준비한다.
 */

const { getHourInZone, getMemberTimeZone } = require("./member-time");

const COMMENT_PUSH_QUIET_START_HOUR = 22;
const COMMENT_PUSH_QUIET_END_HOUR = 8;
const PUSH_PREVIEW_CHARS = 60;

function isCommentPushQuietHour(userData, now = Date.now()) {
    const hour = getHourInZone(now, getMemberTimeZone(userData || {}));
    if (!Number.isFinite(hour)) return false;
    return hour >= COMMENT_PUSH_QUIET_START_HOUR || hour < COMMENT_PUSH_QUIET_END_HOUR;
}

function decideGalleryCommentPush({ notification = {}, recipient = null, now = Date.now() } = {}) {
    if (!recipient) return { action: "skip", reason: "no-user" };
    const blocked = Array.isArray(recipient.blockedUsers) ? recipient.blockedUsers : [];
    if (notification.fromUserId && blocked.includes(notification.fromUserId)) {
        return { action: "delete", reason: "blocked" };
    }
    if (recipient.settings?.commentPushOptOut === true) return { action: "skip", reason: "opt-out" };
    if (isCommentPushQuietHour(recipient, now)) return { action: "skip", reason: "quiet-hours" };
    return { action: "send", reason: "" };
}

function buildGalleryCommentPushPayload(locale, notification = {}, buildPath) {
    const en = String(locale || "").toLowerCase().startsWith("en");
    const isReply = notification.type === "gallery_reply";
    const name = String(notification.fromUserName || "").trim() || (en ? "A member" : "회원");
    const title = en
        ? (isReply ? `↩️ ${name} replied to your comment` : `💬 ${name} commented on your post`)
        : (isReply ? `↩️ ${name}님이 답글을 남겼어요` : `💬 ${name}님이 댓글을 남겼어요`);
    const preview = String(notification.preview || "").trim();
    const body = preview.length > PUSH_PREVIEW_CHARS ? `${preview.slice(0, PUSH_PREVIEW_CHARS)}…` : preview;
    const extras = {
        focus: "gallery-post",
        post: notification.postId,
        comment: notification.commentId,
    };
    const viewUrl = buildPath(locale, "gallery", extras);
    const replyUrl = buildPath(locale, "gallery", { ...extras, reply: "1" });
    return {
        title,
        body,
        tag: `gallery-comment-${notification.postId || "post"}`,
        url: viewUrl,
        actions: [
            { action: "reply", title: en ? "Reply" : "답글 달기", url: replyUrl },
            { action: "view", title: en ? "View" : "보기", url: viewUrl },
        ],
    };
}

module.exports = {
    COMMENT_PUSH_QUIET_START_HOUR,
    COMMENT_PUSH_QUIET_END_HOUR,
    isCommentPushQuietHour,
    decideGalleryCommentPush,
    buildGalleryCommentPushPayload,
};
