"use strict";

const GUEST_ACTIVITY_WINDOW_DAYS = 7;
const GUEST_ACTIVITY_PRIVACY_THRESHOLD = 10;
const GUEST_ACTIVITY_BUCKETS = Object.freeze([10, 25, 50, 100, 250, 500]);
const DAILY_LOGS_COLLECTION = "daily_logs";
const PUBLIC_ACTIVITY_DOCUMENT = "public_stats/guest_activity";
// 소개 페이지 「지금까지 N명 넘는 분들이 가입했어요」(2026-11-21 대표 "현재 가입자 수 알아서 증가 되게 해줘").
// 정확한 수 대신 50명 단위로 내린 수만 공개한다. 100명 아래면 싣지 않는다.
const MEMBER_COUNT_STEP = 50;
const MEMBER_COUNT_MINIMUM = 100;
const USERS_COLLECTION = "users";

function toValidDate(value = new Date()) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new TypeError("A valid date is required");
    }
    return date;
}

function getKstDateString(value = new Date()) {
    const date = toValidDate(value);
    return new Date(date.getTime() + 9 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
}

function isValidDateString(value) {
    const dateString = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;

    const parsed = new Date(`${dateString}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime())
        && parsed.toISOString().slice(0, 10) === dateString;
}

function addDaysToDateString(dateString, difference) {
    if (!isValidDateString(dateString)) {
        throw new TypeError("A valid YYYY-MM-DD date is required");
    }

    const date = new Date(`${dateString}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + Number(difference || 0));
    return date.toISOString().slice(0, 10);
}

/**
 * Returns the inclusive KST calendar range for today and the previous six days.
 */
function getGuestActivityWindow(value = new Date()) {
    const endDate = getKstDateString(value);
    return {
        windowDays: GUEST_ACTIVITY_WINDOW_DAYS,
        startDate: addDaysToDateString(endDate, -(GUEST_ACTIVITY_WINDOW_DAYS - 1)),
        endDate,
    };
}

function getDocumentData(entry) {
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry.data === "function") return entry.data();
    return entry;
}

function normalizeDailyLogActivityInput(entry) {
    const data = getDocumentData(entry);
    if (!data || typeof data !== "object") return null;

    const ownerUid = typeof data.userId === "string" ? data.userId.trim() : "";
    const date = typeof data.date === "string" ? data.date.trim() : "";
    if (!ownerUid || !isValidDateString(date)) return null;

    // Only the two values needed for an in-memory aggregate survive normalization.
    return { ownerUid, date };
}

function toDocumentArray(input) {
    if (Array.isArray(input)) return input;
    if (Array.isArray(input?.docs)) return input.docs;

    if (input && typeof input.forEach === "function") {
        const docs = [];
        input.forEach((entry) => docs.push(entry));
        return docs;
    }

    return [];
}

function aggregateDailyLogActivity(input, range = {}) {
    const startDate = isValidDateString(range.startDate) ? range.startDate : null;
    const endDate = isValidDateString(range.endDate) ? range.endDate : null;
    const owners = new Set();
    const records = new Set();

    for (const entry of toDocumentArray(input)) {
        const normalized = normalizeDailyLogActivityInput(entry);
        if (!normalized) continue;
        if (startDate && normalized.date < startDate) continue;
        if (endDate && normalized.date > endDate) continue;

        owners.add(normalized.ownerUid);
        // A daily log represents one owner's activity for one KST calendar day.
        records.add(`${normalized.ownerUid}\u0000${normalized.date}`);
    }

    return {
        recordCount: records.size,
        activeUserCount: owners.size,
    };
}

function normalizeCount(value) {
    const count = Number(value);
    if (!Number.isFinite(count) || count <= 0) return 0;
    return Math.floor(count);
}

function floorMemberCount(value) {
    const count = normalizeCount(value);
    if (count < MEMBER_COUNT_MINIMUM) return null;
    return Math.floor(count / MEMBER_COUNT_STEP) * MEMBER_COUNT_STEP;
}

function bucketActivityCount(value) {
    const count = normalizeCount(value);
    let selected = null;

    for (const threshold of GUEST_ACTIVITY_BUCKETS) {
        if (count < threshold) break;
        selected = threshold;
    }

    return selected === null ? null : `${selected}+`;
}

/**
 * Builds the complete public document. Exact counts and owner identifiers are
 * intentionally not accepted as output fields and never leave this function.
 */
function buildGuestActivityDocument({ recordCount, activeUserCount, memberCount, updatedAt } = {}) {
    if (updatedAt === undefined) {
        throw new TypeError("updatedAt is required");
    }

    const normalizedActiveUsers = normalizeCount(activeUserCount);
    const normalizedRecords = Math.max(normalizeCount(recordCount), normalizedActiveUsers);
    const meetsPrivacyThreshold = normalizedActiveUsers >= GUEST_ACTIVITY_PRIVACY_THRESHOLD;

    return {
        windowDays: GUEST_ACTIVITY_WINDOW_DAYS,
        recordCountBucket: meetsPrivacyThreshold
            ? bucketActivityCount(normalizedRecords)
            : null,
        activeUserCountBucket: meetsPrivacyThreshold
            ? bucketActivityCount(normalizedActiveUsers)
            : null,
        memberCountFloor: floorMemberCount(memberCount),
        updatedAt,
    };
}

// 회원 문서 수만 센다(집계 쿼리 — 문서를 읽지 않는다). 못 세면 null: 활동 통계 갱신을 막지 않는다.
async function countMembers(db) {
    try {
        const query = db.collection(USERS_COLLECTION);
        if (typeof query?.count !== "function") return null;
        const snapshot = await query.count().get();
        const count = Number(snapshot?.data?.()?.count);
        return Number.isFinite(count) ? count : null;
    } catch (error) {
        console.warn("guest-activity: 회원 수를 세지 못했어요", error?.code || error?.message || error);
        return null;
    }
}

function resolveDb({ db, admin } = {}) {
    if (db) return db;
    if (typeof admin?.firestore === "function") return admin.firestore();
    if (admin?.firestore && typeof admin.firestore === "object") return admin.firestore;
    return null;
}

function resolveUpdatedAt({ serverTimestamp, FieldValue, firestore, admin, now } = {}) {
    if (typeof serverTimestamp === "function") return serverTimestamp();

    const candidates = [
        FieldValue,
        firestore?.FieldValue,
        admin?.firestore?.FieldValue,
        admin?.FieldValue,
    ];
    for (const candidate of candidates) {
        if (typeof candidate?.serverTimestamp === "function") {
            return candidate.serverTimestamp();
        }
    }

    return toValidDate(now || new Date());
}

function getPublicActivityDocumentReference(db) {
    if (typeof db.doc === "function") return db.doc(PUBLIC_ACTIVITY_DOCUMENT);
    if (typeof db.collection === "function") {
        return db.collection("public_stats").doc("guest_activity");
    }
    return null;
}

/**
 * Reads private daily logs with an Admin Firestore interface and overwrites one
 * public document with coarse buckets only. Nothing from a source document is
 * logged, returned, or persisted.
 */
async function updateGuestActivity({
    db,
    admin,
    firestore,
    FieldValue,
    serverTimestamp,
    now = new Date(),
} = {}) {
    const resolvedDb = resolveDb({ db, admin });
    if (!resolvedDb || typeof resolvedDb.collection !== "function") {
        throw new TypeError("An Admin Firestore db interface is required");
    }

    const range = getGuestActivityWindow(now);
    const snapshot = await resolvedDb.collection(DAILY_LOGS_COLLECTION)
        .where("date", ">=", range.startDate)
        .where("date", "<=", range.endDate)
        .get();
    const counts = aggregateDailyLogActivity(snapshot, range);
    const memberCount = await countMembers(resolvedDb);
    const payload = buildGuestActivityDocument({
        ...counts,
        memberCount,
        updatedAt: resolveUpdatedAt({
            serverTimestamp,
            FieldValue,
            firestore,
            admin,
            now,
        }),
    });

    const target = getPublicActivityDocumentReference(resolvedDb);
    if (!target || typeof target.set !== "function") {
        throw new TypeError("The Firestore db interface cannot write public_stats/guest_activity");
    }

    // Deliberately overwrite instead of merge so legacy or accidental fields
    // cannot remain on the public document.
    await target.set(payload);
    return payload;
}

module.exports = {
    GUEST_ACTIVITY_WINDOW_DAYS,
    GUEST_ACTIVITY_PRIVACY_THRESHOLD,
    GUEST_ACTIVITY_BUCKETS,
    getKstDateString,
    isValidDateString,
    addDaysToDateString,
    getGuestActivityWindow,
    normalizeDailyLogActivityInput,
    aggregateDailyLogActivity,
    bucketActivityCount,
    floorMemberCount,
    buildGuestActivityDocument,
    updateGuestActivity,
};
