"use strict";

const { DAILY_POINT_CAPS, isAllowedUserMediaUrl } = require("./points-utils");

const GALLERY_POST_SCHEMA_VERSION = 1;
const GALLERY_POSTS_COLLECTION = "gallery_posts";
const SHARE_SETTING_KEYS = Object.freeze([
    "hideIdentity",
    "hideDate",
    "hideDiet",
    "hideExercise",
    "hidePoints",
    "hideMind",
]);
const DIET_SLOTS = Object.freeze(["breakfast", "lunch", "dinner", "snack"]);
const REACTION_TYPES = Object.freeze(["heart", "fire", "clap"]);
const MAX_MEDIA_ITEMS_PER_KIND = 12;

function getDocumentData(value) {
    if (!value || typeof value !== "object") return null;
    if (value.exists === false) return null;
    if (typeof value.data === "function") return value.data() || null;
    return value;
}

function normalizeString(value, maxLength = 256) {
    if (typeof value !== "string") return "";
    return value.trim().slice(0, maxLength);
}

function normalizeShareSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const settings = {};

    for (const key of SHARE_SETTING_KEYS) {
        settings[key] = source[key] === true;
    }

    // Older daily logs used hideMindText before the single mind-sharing switch.
    if (!("hideMind" in source) && source.hideMindText === true) {
        settings.hideMind = true;
    }

    return settings;
}

function normalizePointValue(value, cap) {
    const point = Number(value);
    if (!Number.isFinite(point) || point <= 0) return 0;
    return Math.min(Math.floor(point), cap);
}

function normalizeAwardedPoints(raw, settings = normalizeShareSettings()) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
        dietPoints: settings.hideDiet
            ? 0
            : normalizePointValue(source.dietPoints, DAILY_POINT_CAPS.dietPoints),
        exercisePoints: settings.hideExercise
            ? 0
            : normalizePointValue(source.exercisePoints, DAILY_POINT_CAPS.exercisePoints),
        mindPoints: settings.hideMind
            ? 0
            : normalizePointValue(source.mindPoints, DAILY_POINT_CAPS.mindPoints),
    };
}

function normalizeMediaUrl(value, ownerId, expectedFolder, allowedStorageBuckets = null) {
    const candidate = normalizeString(value, 4096);
    return candidate && isAllowedUserMediaUrl(
        candidate,
        ownerId,
        expectedFolder,
        allowedStorageBuckets
    ) ? candidate : "";
}

function normalizeDiet(raw, ownerId, allowedStorageBuckets = null) {
    if (!raw || typeof raw !== "object") return null;
    const diet = {};

    for (const slot of DIET_SLOTS) {
        const originalUrl = normalizeMediaUrl(raw[`${slot}Url`], ownerId, "diet_images", allowedStorageBuckets);
        if (!originalUrl) continue;

        diet[`${slot}Url`] = originalUrl;
        const thumbUrl = normalizeMediaUrl(raw[`${slot}ThumbUrl`], ownerId, "diet_images_thumbnails", allowedStorageBuckets);
        if (thumbUrl) diet[`${slot}ThumbUrl`] = thumbUrl;
    }

    return Object.keys(diet).length > 0 ? diet : null;
}

function normalizeMediaId(value, fallback) {
    const candidate = normalizeString(value, 128);
    if (candidate && /^[A-Za-z0-9_-]+$/.test(candidate)) return candidate;
    return fallback;
}

function normalizeExerciseList(rawItems, {
    ownerId,
    kind,
    originalKey,
    thumbKey,
    originalFolder,
    thumbFolder,
    allowedStorageBuckets = null,
} = {}) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    const result = [];
    const seenUrls = new Set();

    for (let index = 0; index < items.length && result.length < MAX_MEDIA_ITEMS_PER_KIND; index += 1) {
        const source = items[index];
        if (!source || typeof source !== "object") continue;

        const originalUrl = normalizeMediaUrl(source[originalKey], ownerId, originalFolder, allowedStorageBuckets);
        if (!originalUrl || seenUrls.has(originalUrl)) continue;

        const item = {
            mediaId: normalizeMediaId(source.mediaId, `${kind}-${index + 1}`),
            [originalKey]: originalUrl,
        };
        const thumbUrl = normalizeMediaUrl(source[thumbKey], ownerId, thumbFolder, allowedStorageBuckets);
        if (thumbUrl) item[thumbKey] = thumbUrl;

        seenUrls.add(originalUrl);
        result.push(item);
    }

    return result;
}

function appendLegacyExerciseItem(items, source, {
    ownerId,
    mediaId,
    originalKey,
    thumbKey,
    originalFolder,
    thumbFolder,
    allowedStorageBuckets = null,
} = {}) {
    const originalUrl = normalizeMediaUrl(source?.[originalKey], ownerId, originalFolder, allowedStorageBuckets);
    if (!originalUrl || items.some((item) => item[originalKey] === originalUrl)) return items;

    const legacy = { mediaId, [originalKey]: originalUrl };
    const thumbUrl = normalizeMediaUrl(source?.[thumbKey], ownerId, thumbFolder, allowedStorageBuckets);
    if (thumbUrl) legacy[thumbKey] = thumbUrl;
    return [legacy, ...items].slice(0, MAX_MEDIA_ITEMS_PER_KIND);
}

function normalizeExercise(raw, ownerId, allowedStorageBuckets = null) {
    if (!raw || typeof raw !== "object") return null;

    let cardioList = normalizeExerciseList(raw.cardioList, {
        ownerId,
        kind: "cardio",
        originalKey: "imageUrl",
        thumbKey: "imageThumbUrl",
        originalFolder: "exercise_images",
        thumbFolder: "exercise_images_thumbnails",
        allowedStorageBuckets,
    });
    cardioList = appendLegacyExerciseItem(cardioList, raw, {
        ownerId,
        mediaId: "cardio-legacy",
        originalKey: "cardioImageUrl",
        thumbKey: "cardioImageThumbUrl",
        originalFolder: "exercise_images",
        thumbFolder: "exercise_images_thumbnails",
        allowedStorageBuckets,
    }).map((item) => {
        if (!("cardioImageUrl" in item)) return item;
        const normalized = {
            mediaId: item.mediaId,
            imageUrl: item.cardioImageUrl,
        };
        if (item.cardioImageThumbUrl) normalized.imageThumbUrl = item.cardioImageThumbUrl;
        return normalized;
    });

    let strengthList = normalizeExerciseList(raw.strengthList, {
        ownerId,
        kind: "strength",
        originalKey: "videoUrl",
        thumbKey: "videoThumbUrl",
        originalFolder: "exercise_videos",
        thumbFolder: "exercise_videos_thumbnails",
        allowedStorageBuckets,
    });
    strengthList = appendLegacyExerciseItem(strengthList, raw, {
        ownerId,
        mediaId: "strength-legacy",
        originalKey: "strengthVideoUrl",
        thumbKey: "strengthVideoThumbUrl",
        originalFolder: "exercise_videos",
        thumbFolder: "exercise_videos_thumbnails",
        allowedStorageBuckets,
    }).map((item) => {
        if (!("strengthVideoUrl" in item)) return item;
        const normalized = {
            mediaId: item.mediaId,
            videoUrl: item.strengthVideoUrl,
        };
        if (item.strengthVideoThumbUrl) normalized.videoThumbUrl = item.strengthVideoThumbUrl;
        return normalized;
    });

    const exercise = {};
    if (cardioList.length > 0) exercise.cardioList = cardioList;
    if (strengthList.length > 0) exercise.strengthList = strengthList;
    return Object.keys(exercise).length > 0 ? exercise : null;
}

function normalizeSleepAndMind(raw, ownerId, allowedStorageBuckets = null) {
    if (!raw || typeof raw !== "object") return null;

    const sleepImageUrl = normalizeMediaUrl(raw.sleepImageUrl, ownerId, "sleep_images", allowedStorageBuckets);
    const meditationDone = raw.meditationDone === true;
    if (!sleepImageUrl && !meditationDone) return null;

    const result = { meditationDone };
    if (sleepImageUrl) {
        result.sleepImageUrl = sleepImageUrl;
        const thumbUrl = normalizeMediaUrl(raw.sleepImageThumbUrl, ownerId, "sleep_images_thumbnails", allowedStorageBuckets);
        if (thumbUrl) result.sleepImageThumbUrl = thumbUrl;
    }
    return result;
}

function normalizeComment(comment) {
    if (!comment || typeof comment !== "object") return null;
    const userId = normalizeString(comment.userId, 128);
    const userName = normalizeString(comment.userName, 80);
    const text = normalizeString(comment.text, 200);
    if (!userId || !text) return null;

    const normalized = { userId, userName, text };
    const id = normalizeString(comment.id, 128);
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) normalized.id = id;
    if (comment.timestamp !== undefined && comment.timestamp !== null) {
        normalized.timestamp = comment.timestamp;
    }
    return normalized;
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
        .map((entry) => normalizeString(entry, 128))
        .filter(Boolean)));
}

/**
 * Engagement is copied exclusively from the existing gallery post. It is
 * intentionally never accepted from a daily log, keeping the private source
 * and the signed-in social document as separate trust domains.
 */
function preserveGalleryEngagement(existingPost) {
    const source = getDocumentData(existingPost);
    if (!source) return {};
    const preserved = {};

    if (Array.isArray(source.comments)) {
        preserved.comments = source.comments.map(normalizeComment).filter(Boolean);
    }

    if (source.reactions && typeof source.reactions === "object") {
        preserved.reactions = {};
        for (const type of REACTION_TYPES) {
            preserved.reactions[type] = normalizeStringArray(source.reactions[type]);
        }
    }

    if (Array.isArray(source.reactionPointAwardedUserIds)) {
        preserved.reactionPointAwardedUserIds = normalizeStringArray(
            source.reactionPointAwardedUserIds
        );
    }

    return preserved;
}

function isValidDateString(value) {
    const candidate = normalizeString(value, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return false;
    const parsed = new Date(`${candidate}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === candidate;
}

/**
 * Builds an allowlist-only gallery document from a private daily log.
 * Returning null means there is no shareable media or meditation completion.
 */
function buildGalleryPostFromDailyLog({
    logId,
    dailyLog,
    existingPost = null,
    updatedAt,
    allowedStorageBuckets = null,
} = {}) {
    const source = getDocumentData(dailyLog);
    const resolvedLogId = normalizeString(logId || dailyLog?.id, 256);
    const ownerId = normalizeString(source?.userId, 128);
    if (!source || !resolvedLogId || !ownerId) return null;

    const shareSettings = normalizeShareSettings(source.shareSettings);
    const diet = shareSettings.hideDiet ? null : normalizeDiet(source.diet, ownerId, allowedStorageBuckets);
    const exercise = shareSettings.hideExercise ? null : normalizeExercise(source.exercise, ownerId, allowedStorageBuckets);
    const sleepAndMind = shareSettings.hideMind
        ? null
        : normalizeSleepAndMind(source.sleepAndMind, ownerId, allowedStorageBuckets);

    if (!diet && !exercise && !sleepAndMind) return null;

    const post = {
        schemaVersion: GALLERY_POST_SCHEMA_VERSION,
        sourceLogId: resolvedLogId,
        userId: ownerId,
        userName: shareSettings.hideIdentity
            ? ""
            : normalizeString(source.userName, 80),
        shareSettings,
    };

    if (!shareSettings.hideDate) {
        if (isValidDateString(source.date)) post.date = source.date.trim();
        if (source.timestamp !== undefined && source.timestamp !== null) {
            post.timestamp = source.timestamp;
        }
    }
    if (updatedAt !== undefined && updatedAt !== null) post.updatedAt = updatedAt;
    if (!shareSettings.hidePoints) {
        post.awardedPoints = normalizeAwardedPoints(source.awardedPoints, shareSettings);
    }
    if (diet) post.diet = diet;
    if (exercise) post.exercise = exercise;
    if (sleepAndMind) post.sleepAndMind = sleepAndMind;

    return {
        ...post,
        ...preserveGalleryEngagement(existingPost),
    };
}

function getGalleryPostReference(db, logId) {
    if (typeof db?.doc === "function") {
        return db.doc(`${GALLERY_POSTS_COLLECTION}/${logId}`);
    }
    if (typeof db?.collection === "function") {
        return db.collection(GALLERY_POSTS_COLLECTION).doc(logId);
    }
    return null;
}

function getDailyLogReference(db, logId) {
    if (typeof db?.doc === "function") {
        return db.doc(`daily_logs/${logId}`);
    }
    if (typeof db?.collection === "function") {
        return db.collection("daily_logs").doc(logId);
    }
    return null;
}

function resolveServerTimestamp(FieldValue) {
    if (typeof FieldValue?.serverTimestamp !== "function") {
        throw new TypeError("FieldValue.serverTimestamp is required");
    }
    return FieldValue.serverTimestamp();
}

async function readExistingPost(reference, transaction = null) {
    if (transaction && typeof transaction.get === "function") {
        return transaction.get(reference);
    }
    if (typeof reference.get === "function") return reference.get();
    return null;
}

async function writePost(reference, payload, transaction = null) {
    if (transaction && typeof transaction.set === "function") {
        transaction.set(reference, payload);
        return;
    }
    if (typeof reference.set !== "function") {
        throw new TypeError("The gallery post reference cannot be written");
    }
    // No merge: allowlist reconstruction must remove stale private fields.
    await reference.set(payload);
}

async function deletePost(reference, transaction = null) {
    if (transaction && typeof transaction.delete === "function") {
        transaction.delete(reference);
        return;
    }
    if (typeof reference.delete !== "function") {
        throw new TypeError("The gallery post reference cannot be deleted");
    }
    await reference.delete();
}

/**
 * Synchronizes one private daily log into its signed-in gallery projection.
 * The live private source and current projection are read inside one
 * transaction. This makes out-of-order Firestore trigger delivery harmless:
 * an older event can never recreate a post after the owner has unshared it.
 */
async function syncGalleryPostFromDailyLog({
    db,
    FieldValue,
    logId,
    before, // Kept in the trigger-facing contract; source deletion is driven by after.
    after,
    allowedStorageBuckets = null,
} = {}) {
    void before;
    void after;
    const resolvedLogId = normalizeString(logId, 256);
    if (!resolvedLogId) throw new TypeError("logId is required");

    const reference = getGalleryPostReference(db, resolvedLogId);
    const sourceReference = getDailyLogReference(db, resolvedLogId);
    if (!reference || !sourceReference) {
        throw new TypeError("An Admin Firestore db interface is required");
    }

    const updatedAt = resolveServerTimestamp(FieldValue);
    const synchronize = async (transaction = null) => {
        const [sourceSnapshot, existingSnapshot] = await Promise.all([
            readExistingPost(sourceReference, transaction),
            readExistingPost(reference, transaction),
        ]);
        const source = getDocumentData(sourceSnapshot);
        if (!source) {
            await deletePost(reference, transaction);
            return null;
        }
        const payload = buildGalleryPostFromDailyLog({
            logId: resolvedLogId,
            dailyLog: source,
            existingPost: existingSnapshot,
            updatedAt,
            allowedStorageBuckets,
        });

        if (!payload) {
            await deletePost(reference, transaction);
            return null;
        }

        await writePost(reference, payload, transaction);
        return payload;
    };

    if (typeof db.runTransaction === "function") {
        return db.runTransaction((transaction) => synchronize(transaction));
    }
    return synchronize();
}

module.exports = {
    GALLERY_POST_SCHEMA_VERSION,
    GALLERY_POSTS_COLLECTION,
    SHARE_SETTING_KEYS,
    normalizeShareSettings,
    normalizeAwardedPoints,
    preserveGalleryEngagement,
    buildGalleryPostFromDailyLog,
    sanitizeDailyLogForGallery: buildGalleryPostFromDailyLog,
    syncGalleryPostFromDailyLog,
};
