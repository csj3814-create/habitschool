"use strict";

const { DAILY_POINT_CAPS, isAllowedUserMediaUrl } = require("./points-utils");

const GALLERY_POST_SCHEMA_VERSION = 2;
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
const DIET_ANALYSIS_GRADES = Object.freeze(["A", "B", "C", "D", "F"]);
const DIET_FOOD_CATEGORIES = Object.freeze(["natural", "processed", "ultraprocessed"]);
const DIET_ANALYSIS_SCORE_KEYS = Object.freeze(["vitamins", "minerals", "fiber", "antioxidants"]);
const MAX_DIET_ANALYSIS_FOODS = 16;
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

function normalizePercent(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function normalizeDietAnalysisEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

    const grade = normalizeString(raw.grade, 2).toUpperCase();
    if (!DIET_ANALYSIS_GRADES.includes(grade)) return null;

    const result = { grade };
    const foods = [];
    const rawFoods = Array.isArray(raw.foods) ? raw.foods : [];
    for (const food of rawFoods) {
        if (foods.length >= MAX_DIET_ANALYSIS_FOODS) break;
        if (!food || typeof food !== "object" || Array.isArray(food)) continue;
        const name = normalizeString(food.name, 80);
        const category = normalizeString(food.category, 32);
        if (!name || !DIET_FOOD_CATEGORIES.includes(category)) continue;
        foods.push({ name, category });
    }
    if (foods.length > 0) result.foods = foods;

    if (raw.scores && typeof raw.scores === "object" && !Array.isArray(raw.scores)) {
        const scores = {};
        for (const key of DIET_ANALYSIS_SCORE_KEYS) {
            const value = normalizePercent(raw.scores[key]);
            if (value !== null) scores[key] = value;
        }
        if (Object.keys(scores).length > 0) result.scores = scores;
    }

    const naturalRatio = normalizePercent(raw.naturalRatio);
    if (naturalRatio !== null) result.naturalRatio = naturalRatio;

    const summary = normalizeString(raw.summary, 280);
    const insulinComment = normalizeString(raw.insulinComment, 500);
    const suggestion = normalizeString(raw.suggestion, 500);
    if (summary) result.summary = summary;
    if (insulinComment) result.insulinComment = insulinComment;
    if (suggestion) result.suggestion = suggestion;

    return result;
}

/**
 * Rebuilds the public AI payload from display-only fields. Analysis is shared
 * only for a meal whose owner-validated image is present in the same post.
 */
function normalizeDietAnalysis(raw, diet) {
    if (!raw || typeof raw !== "object" || !diet) return null;
    const result = {};

    for (const slot of DIET_SLOTS) {
        if (!diet[`${slot}Url`]) continue;
        const analysis = normalizeDietAnalysisEntry(raw[slot]);
        if (analysis) result[slot] = analysis;
    }

    return Object.keys(result).length > 0 ? result : null;
}

function normalizeMediaId(value, fallback) {
    const candidate = normalizeString(value, 128);
    if (candidate && /^[A-Za-z0-9_-]+$/.test(candidate)) return candidate;
    return fallback;
}

// 갤러리가 운동 분석을 보여줄 수 있게 함께 내보낸다.
// 식단(normalizeDietAnalysis)은 이미 내보내는데 운동만 빠져 있었다. 그래서 화면의
// '분석 확인' 버튼 코드가 있어도 운동 사진에는 영영 뜨지 않았다.
// 화면이 실제로 쓰는 것만 추린다 — 원문을 통째로 실어 보내지 않는다.
const EXERCISE_INTENSITY_WORDS = ["저강도", "중강도", "고강도", "초고강도"];

function normalizeExerciseAnalysisEntry(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    // 운동이 아니라고 판정된 것은 갤러리에 내보내지 않는다. 남들에게 보일 자리다.
    if (raw.isExercise === false) return null;

    const intensity = normalizeString(raw.intensity, 8);
    if (!EXERCISE_INTENSITY_WORDS.includes(intensity)) return null;

    const entry = { intensity };
    const exerciseType = normalizeString(raw.exerciseType, 40);
    if (exerciseType) entry.exerciseType = exerciseType;
    const timeAnalysis = normalizeString(raw.timeAnalysis, 200);
    if (timeAnalysis) entry.timeAnalysis = timeAnalysis;
    const feedback = normalizeString(raw.feedback, 500);
    if (feedback) entry.feedback = feedback;
    const formTip = normalizeString(raw.formTip, 300);
    if (formTip) entry.formTip = formTip;

    const weighted = Number(raw.weightedMinutes);
    if (Number.isFinite(weighted) && weighted > 0) entry.weightedMinutes = Math.min(1440, Math.round(weighted));

    return entry;
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

        const analysis = normalizeExerciseAnalysisEntry(source.aiAnalysis);
        if (analysis) item.aiAnalysis = analysis;

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

/**
 * 갤러리에 나가는 수면 칸. **수면 분석(sleepAnalysis)은 일부러 싣지 않는다.**
 *
 * 2026-09-17 에 한 번 실었다가 2026-09-18 에 다시 뺐다. 갤러리는 남들이 보는
 * 자리이고, 수면 캡처를 공유하는 것과 "이 사람의 수면은 B 등급" 이라는 AI 판단을
 * 함께 거는 것은 다른 일이다. 회원 본인 화면(js/app-core.js 기록 탭)에서는
 * 그대로 볼 수 있다.
 *
 * 되살리려면 여기서 raw.sleepAnalysis 를 추려 담고, js/app-core.js 갤러리
 * 카드에 분석 확인 버튼을 되돌리면 된다 — 화면 쪽 오버레이(toggleGalleryAiOverlay)는
 * 종류만 맞으면 그대로 받는다.
 */
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

function getGalleryProjectionFingerprint(log = null) {
    if (!log) return "deleted";
    return JSON.stringify({
        userId: log.userId || "",
        userName: log.userName || "",
        date: log.date || "",
        timestamp: log.timestamp || null,
        awardedPoints: log.awardedPoints || null,
        shareSettings: log.shareSettings || null,
        diet: log.diet || null,
        dietAnalysis: log.dietAnalysis || null,
        exercise: log.exercise || null,
        sleepAndMind: log.sleepAndMind || null,
    });
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
    const dietAnalysis = shareSettings.hideDiet ? null : normalizeDietAnalysis(source.dietAnalysis, diet);
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
    if (dietAnalysis) post.dietAnalysis = dietAnalysis;
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
    normalizeDietAnalysis,
    preserveGalleryEngagement,
    getGalleryProjectionFingerprint,
    buildGalleryPostFromDailyLog,
    sanitizeDailyLogForGallery: buildGalleryPostFromDailyLog,
    syncGalleryPostFromDailyLog,
};
