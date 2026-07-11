#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const {
    buildGalleryPostFromDailyLog,
} = require("../functions/gallery-posts");

const WINDOW_DAYS = 30;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const READ_BATCH_SIZE = 100;
const WRITE_CONCURRENCY = 8;
const PROJECT_ALIASES = Object.freeze({
    prod: "habitschool-8497b",
    production: "habitschool-8497b",
    "habitschool-8497b": "habitschool-8497b",
    staging: "habitschool-staging",
    "habitschool-staging": "habitschool-staging",
});

function resolveProjectId(value) {
    const key = String(value || "").trim().toLowerCase();
    const projectId = PROJECT_ALIASES[key];
    if (!projectId) {
        throw new Error("Unknown project. Use --project staging or --project prod.");
    }
    return projectId;
}

function parseCliArgs(argv = []) {
    let apply = false;
    let help = false;
    let projectValue = "staging";
    let projectWasExplicit = false;

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--apply") {
            apply = true;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            help = true;
            continue;
        }
        if (arg === "--project") {
            if (projectWasExplicit) throw new Error("--project may only be provided once.");
            const nextValue = argv[index + 1];
            if (!nextValue || nextValue.startsWith("--")) {
                throw new Error("--project requires staging or prod.");
            }
            projectValue = nextValue;
            projectWasExplicit = true;
            index += 1;
            continue;
        }
        if (arg.startsWith("--project=")) {
            if (projectWasExplicit) throw new Error("--project may only be provided once.");
            projectValue = arg.slice("--project=".length);
            if (!projectValue) throw new Error("--project requires staging or prod.");
            projectWasExplicit = true;
            continue;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }

    const projectId = resolveProjectId(projectValue);
    if (apply && !projectWasExplicit) {
        throw new Error("--apply requires an explicit --project staging or --project prod.");
    }

    return {
        apply,
        dryRun: !apply,
        help,
        projectId,
        projectWasExplicit,
        windowDays: WINDOW_DAYS,
    };
}

function parseDateInput(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError("A valid current time is required.");
    return date;
}

function shiftIsoDate(dateString, dayDelta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ""))) {
        throw new TypeError("An ISO calendar date is required.");
    }
    const date = new Date(`${dateString}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateString) {
        throw new TypeError("An ISO calendar date is required.");
    }
    date.setUTCDate(date.getUTCDate() + dayDelta);
    return date.toISOString().slice(0, 10);
}

function getKstDateString(now = new Date()) {
    const date = parseDateInput(now);
    return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getBackfillDateWindow(now = new Date(), windowDays = WINDOW_DAYS) {
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 366) {
        throw new RangeError("windowDays must be an integer from 1 through 366.");
    }
    const endDate = getKstDateString(now);
    return {
        startDate: shiftIsoDate(endDate, -(windowDays - 1)),
        endDate,
        windowDays,
    };
}

function snapshotData(value) {
    if (!value || value.exists === false) return null;
    if (typeof value.data === "function") return value.data() || null;
    return value;
}

function planGalleryProjection({
    logId,
    dailyLog,
    existingPost = null,
    existingUpdateTime = "",
    allowedStorageBuckets = null,
} = {}) {
    const existingData = snapshotData(existingPost);
    const existingState = {
        exists: existingData !== null,
        updateTime: existingData !== null ? String(existingUpdateTime || "") : "",
    };
    const payload = buildGalleryPostFromDailyLog({
        logId,
        dailyLog,
        existingPost: existingData,
        allowedStorageBuckets,
    });

    if (payload) return { action: "upsert", logId, dailyLog, payload, existingState };
    if (existingData) {
        return { action: "delete", logId, dailyLog, payload: null, existingState };
    }
    return { action: "noop", logId, dailyLog, payload: null, existingState };
}

function getProjectStorageBuckets(projectId) {
    const normalized = String(projectId || "").trim();
    if (!normalized) return [];
    return [`${normalized}.firebasestorage.app`, `${normalized}.appspot.com`];
}

function summarizeProjectionPlans(plans = []) {
    const summary = { scanned: 0, upsert: 0, delete: 0, noop: 0, writes: 0 };
    for (const plan of plans) {
        summary.scanned += 1;
        if (plan?.action === "upsert") summary.upsert += 1;
        else if (plan?.action === "delete") summary.delete += 1;
        else summary.noop += 1;
    }
    summary.writes = summary.upsert + summary.delete;
    return summary;
}

function getFirebaseAccessToken() {
    if (process.env.FIREBASE_ACCESS_TOKEN) {
        return process.env.FIREBASE_ACCESS_TOKEN.trim();
    }

    const command = process.platform === "win32" ? "firebase.cmd" : "firebase";
    const output = execFileSync(command, ["login:list", "--json"], {
        encoding: "utf8",
        shell: process.platform === "win32",
        stdio: ["ignore", "pipe", "pipe"],
    });
    const parsed = JSON.parse(output);
    const token = parsed?.result?.[0]?.tokens?.access_token;
    if (!token) {
        throw new Error("Firebase CLI access token not found. Run firebase login first.");
    }
    return token;
}

function createRestContext(projectId, accessToken, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") {
        throw new Error("This script requires Node.js with global fetch support.");
    }
    const databaseName = `projects/${projectId}/databases/(default)`;
    return {
        projectId,
        accessToken,
        fetchImpl,
        databaseName,
        documentsUrl: `https://firestore.googleapis.com/v1/${databaseName}/documents`,
    };
}

function documentIdFromName(name = "") {
    return String(name).split("/").pop();
}

function documentName(context, collection, documentId) {
    const normalizedId = String(documentId || "");
    if (!normalizedId || normalizedId.includes("/")) {
        throw new TypeError("A valid Firestore document id is required.");
    }
    return `${context.databaseName}/documents/${collection}/${normalizedId}`;
}

function decodeFirestoreValue(value) {
    if (!value || typeof value !== "object") return undefined;
    if (Object.hasOwn(value, "nullValue")) return null;
    if (Object.hasOwn(value, "stringValue")) return value.stringValue;
    if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
    if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
    if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
    if (Object.hasOwn(value, "timestampValue")) return new Date(value.timestampValue);
    if (Object.hasOwn(value, "arrayValue")) {
        return (value.arrayValue?.values || []).map(decodeFirestoreValue);
    }
    if (Object.hasOwn(value, "mapValue")) {
        return decodeFirestoreFields(value.mapValue?.fields || {});
    }
    return undefined;
}

function decodeFirestoreFields(fields = {}) {
    return Object.fromEntries(Object.entries(fields).map(([key, value]) => [
        key,
        decodeFirestoreValue(value),
    ]));
}

function encodeFirestoreValue(value) {
    if (value === null) return { nullValue: null };
    if (typeof value === "string") return { stringValue: value };
    if (typeof value === "boolean") return { booleanValue: value };
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number.isInteger(value)
            ? { integerValue: String(value) }
            : { doubleValue: value };
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return { timestampValue: value.toISOString() };
    }
    if (Array.isArray(value)) {
        return { arrayValue: { values: value.map(encodeFirestoreValue) } };
    }
    if (value && typeof value === "object") {
        return { mapValue: { fields: encodeFirestoreFields(value) } };
    }
    throw new TypeError("The sanitized projection contains an unsupported Firestore value.");
}

function encodeFirestoreFields(value = {}) {
    return Object.fromEntries(Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, encodeFirestoreValue(entry)]));
}

async function firestoreRequest(context, url, options = {}) {
    const response = await context.fetchImpl(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${context.accessToken}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
    });
    const bodyText = await response.text();
    let body = null;
    if (bodyText) {
        try {
            body = JSON.parse(bodyText);
        } catch (_) {
            body = null;
        }
    }
    if (!response.ok) {
        const error = new Error("Firestore request failed. Response details were withheld.");
        error.status = response.status;
        error.code = body?.error?.status || "FIRESTORE_REQUEST_FAILED";
        throw error;
    }
    return body;
}

function decodeDocument(document) {
    if (!document?.name) return null;
    return {
        id: documentIdFromName(document.name),
        name: document.name,
        data: decodeFirestoreFields(document.fields || {}),
        updateTime: String(document.updateTime || ""),
        exists: true,
    };
}

async function batchGetDocuments(context, names) {
    if (names.length === 0) return new Map();
    const rows = await firestoreRequest(context, `${context.documentsUrl}:batchGet`, {
        method: "POST",
        body: JSON.stringify({ documents: names }),
    });
    const documents = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
        if (row.found) {
            const document = decodeDocument(row.found);
            if (document) documents.set(document.name, document);
        } else if (row.missing) {
            documents.set(row.missing, {
                id: documentIdFromName(row.missing),
                name: row.missing,
                data: null,
                updateTime: "",
                exists: false,
            });
        }
    }
    for (const name of names) {
        if (!documents.has(name)) {
            documents.set(name, {
                id: documentIdFromName(name),
                name,
                data: null,
                updateTime: "",
                exists: false,
            });
        }
    }
    return documents;
}

async function loadRecentDailyLogs(context, { startDate, endDate }) {
    const rows = await firestoreRequest(context, `${context.documentsUrl}:runQuery`, {
        method: "POST",
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "daily_logs" }],
                where: {
                    compositeFilter: {
                        op: "AND",
                        filters: [
                            {
                                fieldFilter: {
                                    field: { fieldPath: "date" },
                                    op: "GREATER_THAN_OR_EQUAL",
                                    value: { stringValue: startDate },
                                },
                            },
                            {
                                fieldFilter: {
                                    field: { fieldPath: "date" },
                                    op: "LESS_THAN_OR_EQUAL",
                                    value: { stringValue: endDate },
                                },
                            },
                        ],
                    },
                },
                orderBy: [{ field: { fieldPath: "date" }, direction: "ASCENDING" }],
            },
        }),
    });
    return (Array.isArray(rows) ? rows : [])
        .map((row) => decodeDocument(row.document))
        .filter(Boolean)
        .map((document) => ({ logId: document.id, dailyLog: document.data }));
}

async function loadExistingGalleryPosts(context, logIds) {
    const result = new Map();
    for (let offset = 0; offset < logIds.length; offset += READ_BATCH_SIZE) {
        const batchIds = logIds.slice(offset, offset + READ_BATCH_SIZE);
        const names = batchIds.map((logId) => documentName(context, "gallery_posts", logId));
        const documents = await batchGetDocuments(context, names);
        for (const document of documents.values()) {
            if (document.exists) result.set(document.id, document);
        }
    }
    return result;
}

async function buildProjectionPlans(context, dailyLogs) {
    const existingPosts = await loadExistingGalleryPosts(
        context,
        dailyLogs.map((entry) => entry.logId)
    );
    return dailyLogs.map(({ logId, dailyLog }) => {
        const existing = existingPosts.get(logId) || null;
        return planGalleryProjection({
            logId,
            dailyLog,
            existingPost: existing?.data || null,
            existingUpdateTime: existing?.updateTime || "",
            allowedStorageBuckets: getProjectStorageBuckets(context.projectId),
        });
    });
}

function createProjectionWrite(context, plan) {
    const name = documentName(context, "gallery_posts", plan.logId);
    if (plan.existingState.exists && !plan.existingState.updateTime) {
        throw new Error("The existing projection is missing its concurrency version.");
    }
    const currentDocument = plan.existingState.exists
        ? { updateTime: plan.existingState.updateTime }
        : { exists: false };

    if (plan.action === "delete") {
        return { delete: name, currentDocument };
    }
    if (plan.action !== "upsert") return null;
    return {
        update: {
            name,
            fields: encodeFirestoreFields(plan.payload),
        },
        updateTransforms: [{
            fieldPath: "updatedAt",
            setToServerValue: "REQUEST_TIME",
        }],
        currentDocument,
    };
}

function isWriteConflict(error) {
    return error?.status === 409
        || error?.code === "ABORTED"
        || error?.code === "FAILED_PRECONDITION";
}

async function getLatestProjectionPlan(context, logId) {
    const dailyLogName = documentName(context, "daily_logs", logId);
    const galleryPostName = documentName(context, "gallery_posts", logId);
    const documents = await batchGetDocuments(context, [dailyLogName, galleryPostName]);
    const source = documents.get(dailyLogName);
    const existing = documents.get(galleryPostName);
    return planGalleryProjection({
        logId,
        dailyLog: source?.exists ? source.data : null,
        existingPost: existing?.exists ? existing.data : null,
        existingUpdateTime: existing?.updateTime || "",
        allowedStorageBuckets: getProjectStorageBuckets(context.projectId),
    });
}

async function applySingleProjection(context, logId, maximumAttempts = 3) {
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
        const plan = await getLatestProjectionPlan(context, logId);
        const write = createProjectionWrite(context, plan);
        if (!write) return false;
        try {
            await firestoreRequest(context, `${context.documentsUrl}:commit`, {
                method: "POST",
                body: JSON.stringify({ writes: [write] }),
            });
            return true;
        } catch (error) {
            if (!isWriteConflict(error) || attempt === maximumAttempts) throw error;
        }
    }
    return false;
}

async function applyProjectionPlans(context, plans) {
    const writablePlans = plans.filter((plan) => plan.action !== "noop");
    let completed = 0;

    for (let offset = 0; offset < writablePlans.length; offset += WRITE_CONCURRENCY) {
        const batch = writablePlans.slice(offset, offset + WRITE_CONCURRENCY);
        try {
            const results = await Promise.all(batch.map((plan) => (
                applySingleProjection(context, plan.logId)
            )));
            completed += results.filter(Boolean).length;
        } catch (_) {
            const batchNumber = Math.floor(offset / WRITE_CONCURRENCY) + 1;
            throw new Error(`Projection write batch ${batchNumber} failed. No document details were printed.`);
        }
    }

    return completed;
}

function printHelp() {
    console.log("Usage:");
    console.log("  node scripts/backfill-gallery-posts-2026-07-10.js [--project staging|prod]");
    console.log("  node scripts/backfill-gallery-posts-2026-07-10.js --apply --project staging|prod");
    console.log("");
    console.log("The default mode is a staging dry-run. --apply and an explicit --project are both required to write.");
}

function printSummary({ args, summary, appliedWrites = 0 }) {
    console.log("Gallery projection backfill");
    console.log(`- Project: ${args.projectId}`);
    console.log(`- Mode: ${args.dryRun ? "DRY RUN (no writes)" : "APPLY"}`);
    console.log(`- Window: ${args.windowDays} KST calendar days`);
    console.log(`- Source logs scanned: ${summary.scanned}`);
    console.log(`- Projection upserts: ${summary.upsert}`);
    console.log(`- Projection deletions: ${summary.delete}`);
    console.log(`- No-op records: ${summary.noop}`);
    if (args.dryRun) {
        console.log(`- Writes performed: 0 (would write ${summary.writes})`);
    } else {
        console.log(`- Writes performed: ${appliedWrites}`);
    }
    console.log("- Privacy: output contains aggregate counts only");
}

async function runBackfill(args, now = new Date()) {
    const accessToken = getFirebaseAccessToken();
    const context = createRestContext(args.projectId, accessToken);
    const dateWindow = getBackfillDateWindow(now, args.windowDays);
    const dailyLogs = await loadRecentDailyLogs(context, dateWindow);
    const plans = await buildProjectionPlans(context, dailyLogs);
    const summary = summarizeProjectionPlans(plans);
    const appliedWrites = args.apply
        ? await applyProjectionPlans(context, plans)
        : 0;
    printSummary({ args, summary, appliedWrites });
    return { summary, appliedWrites };
}

async function main() {
    const args = parseCliArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }
    await runBackfill(args);
}

if (require.main === module) {
    main().catch(() => {
        console.error("Gallery projection backfill failed. No record details were printed.");
        process.exitCode = 1;
    });
}

module.exports = {
    WINDOW_DAYS,
    resolveProjectId,
    parseCliArgs,
    shiftIsoDate,
    getKstDateString,
    getBackfillDateWindow,
    planGalleryProjection,
    getProjectStorageBuckets,
    summarizeProjectionPlans,
    createRestContext,
    decodeFirestoreValue,
    encodeFirestoreValue,
    createProjectionWrite,
    buildProjectionPlans,
    applyProjectionPlans,
    runBackfill,
};
