#!/usr/bin/env node
"use strict";

/**
 * 갤러리 게시물에 감사 일기·수면 분석을 다시 싣는다 (2026-10-15).
 *
 * functions/gallery-posts.js 가 이제 마음 칸에 감사 일기와 수면 분석(등급·요약)을
 * 싣는다. 새로 저장되는 기록은 트리거가 알아서 하지만, 이미 있는 게시물은 이걸
 * 돌려야 바뀐다.
 *
 * scripts/backfill-gallery-posts-2026-07-10.js 와 다른 점 — **게시물 순서를 건드리지
 * 않는다.** 그 스크립트는 고친 게시물마다 updatedAt 을 지금으로 찍는데, 갤러리는
 * updatedAt 순으로 받아 온다. 3월부터 수천 개를 한꺼번에 고치면 옛 게시물이 피드
 * 맨 위로 몰려 최근 게시물이 밀린다. 그래서:
 *   - 이미 있는 게시물: 원래 updatedAt 을 그대로 둔다
 *   - 새로 생기는 게시물(감사 일기만 쓴 날): 그 기록의 timestamp, 없으면 그날 정오(KST)
 *
 * 손대는 범위도 좁힌다 — 감사 일기나 수면 분석이 있는 기록만, 그리고 고친 결과가
 * '게시물 있음' 인 경우만(지우는 일은 하지 않는다). 공유 설정은 투영 함수가 지킨다.
 *
 * 사용법 (기본은 건조 실행 — 아무것도 쓰지 않고 숫자만 센다):
 *   node scripts/backfill-gallery-mind-2026-10-15.js --project staging
 *   node scripts/backfill-gallery-mind-2026-10-15.js --project staging --apply
 *   node scripts/backfill-gallery-mind-2026-10-15.js --project prod --from 2026-03-01 --apply
 *
 * 출력은 숫자뿐이다. 회원 이름·글은 찍지 않는다.
 */

const {
    resolveProjectId,
    getKstDateString,
    shiftIsoDate,
    planGalleryProjection,
    getProjectStorageBuckets,
    createRestContext,
    getFirebaseAccessToken,
    firestoreRequest,
    batchGetDocuments,
    decodeDocument,
    documentName,
    encodeFirestoreFields,
} = require("./backfill-gallery-posts-2026-07-10.js");

const DEFAULT_FROM = "2026-03-01";
const READ_BATCH_SIZE = 100;
const WRITE_CONCURRENCY = 8;

function parseArgs(argv = []) {
    const args = { apply: false, project: "", from: DEFAULT_FROM, to: "" };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--apply") args.apply = true;
        else if (arg === "--project") args.project = argv[++i] || "";
        else if (arg === "--from") args.from = argv[++i] || "";
        else if (arg === "--to") args.to = argv[++i] || "";
        else throw new Error(`알 수 없는 인자: ${arg}`);
    }
    if (!args.project) throw new Error("--project staging 또는 --project prod 가 필요합니다.");
    for (const key of ["from", "to"]) {
        if (args[key] && !/^\d{4}-\d{2}-\d{2}$/.test(args[key])) throw new Error(`--${key} 는 YYYY-MM-DD`);
    }
    return { ...args, projectId: resolveProjectId(args.project) };
}

/** 이 백필이 손댈 기록인가 — 감사 일기나 수면 분석이 있는 날. */
function hasMindContent(dailyLog = {}) {
    const mind = dailyLog?.sleepAndMind;
    if (!mind || typeof mind !== "object") return false;
    const gratitude = typeof mind.gratitude === "string" ? mind.gratitude.trim() : "";
    const analysis = mind.sleepAnalysis && typeof mind.sleepAnalysis === "object";
    return !!gratitude || !!analysis;
}

/** 게시물 순서를 그대로 둘 updatedAt. */
function resolvePreservedUpdatedAt(existingPost, dailyLog = {}) {
    const existing = existingPost?.updatedAt;
    if (existing instanceof Date && !Number.isNaN(existing.getTime())) return existing;
    const timestamp = dailyLog?.timestamp;
    if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) return timestamp;
    if (typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))) return new Date(timestamp);
    const date = String(dailyLog?.date || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(`${date}T12:00:00+09:00`);
    return null;
}

/**
 * 쓸 내용. 게시물이 생기거나 바뀌는 경우만(지우는 일은 하지 않는다).
 * updatedAt 은 서버 시각으로 덮지 않고 원래 값을 넣는다.
 */
function createOrderPreservingWrite(context, plan, existingPost) {
    if (plan.action !== "upsert") return null;
    const updatedAt = resolvePreservedUpdatedAt(existingPost, plan.dailyLog);
    if (!updatedAt) return null;
    if (plan.existingState.exists && !plan.existingState.updateTime) return null;
    return {
        update: {
            name: documentName(context, "gallery_posts", plan.logId),
            fields: encodeFirestoreFields({ ...plan.payload, updatedAt }),
        },
        currentDocument: plan.existingState.exists
            ? { updateTime: plan.existingState.updateTime }
            : { exists: false },
    };
}

function monthWindows(from, to) {
    const windows = [];
    let start = from;
    while (start <= to) {
        const [y, m] = start.split("-").map(Number);
        const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
        const end = shiftIsoDate(nextMonth, -1);
        windows.push({ startDate: start, endDate: end < to ? end : to });
        start = nextMonth;
    }
    return windows;
}

async function loadDailyLogs(context, { startDate, endDate }) {
    const rows = await firestoreRequest(context, `${context.documentsUrl}:runQuery`, {
        method: "POST",
        body: JSON.stringify({
            structuredQuery: {
                from: [{ collectionId: "daily_logs" }],
                where: {
                    compositeFilter: {
                        op: "AND",
                        filters: [
                            { fieldFilter: { field: { fieldPath: "date" }, op: "GREATER_THAN_OR_EQUAL", value: { stringValue: startDate } } },
                            { fieldFilter: { field: { fieldPath: "date" }, op: "LESS_THAN_OR_EQUAL", value: { stringValue: endDate } } },
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

async function run(args) {
    const context = createRestContext(args.projectId, getFirebaseAccessToken());
    const to = args.to || getKstDateString(new Date());
    const counts = { scanned: 0, mindLogs: 0, update: 0, create: 0, unchanged: 0, written: 0 };

    for (const window of monthWindows(args.from, to)) {
        const logs = (await loadDailyLogs(context, window));
        counts.scanned += logs.length;
        const targets = logs.filter(({ dailyLog }) => hasMindContent(dailyLog));
        counts.mindLogs += targets.length;

        for (let offset = 0; offset < targets.length; offset += READ_BATCH_SIZE) {
            const batch = targets.slice(offset, offset + READ_BATCH_SIZE);
            const names = batch.map(({ logId }) => documentName(context, "gallery_posts", logId));
            const existing = await batchGetDocuments(context, names);
            const writes = [];
            for (const { logId, dailyLog } of batch) {
                const post = existing.get(documentName(context, "gallery_posts", logId));
                const plan = planGalleryProjection({
                    logId,
                    dailyLog,
                    existingPost: post?.exists ? post.data : null,
                    existingUpdateTime: post?.updateTime || "",
                    allowedStorageBuckets: getProjectStorageBuckets(context.projectId),
                });
                plan.dailyLog = dailyLog;
                const write = createOrderPreservingWrite(context, plan, post?.exists ? post.data : null);
                if (!write) { counts.unchanged += 1; continue; }
                if (post?.exists) counts.update += 1; else counts.create += 1;
                writes.push(write);
            }
            if (args.apply) {
                for (let i = 0; i < writes.length; i += WRITE_CONCURRENCY) {
                    const chunk = writes.slice(i, i + WRITE_CONCURRENCY);
                    const results = await Promise.allSettled(chunk.map((write) => firestoreRequest(context, `${context.documentsUrl}:commit`, {
                        method: "POST",
                        body: JSON.stringify({ writes: [write] }),
                    })));
                    counts.written += results.filter((r) => r.status === "fulfilled").length;
                    const failed = results.filter((r) => r.status === "rejected").length;
                    // 그 사이 회원이 기록을 고쳐 게시물이 바뀌었으면 트리거가 이미 새로 만들었다.
                    if (failed) console.warn(`- 건너뜀 ${failed}건 (그 사이 바뀐 게시물 — 트리거가 최신으로 만든다)`);
                }
            }
        }
        console.log(`${window.startDate}~${window.endDate}: 기록 ${logs.length}, 마음 내용 ${targets.length}`);
    }

    console.log("갤러리 마음 칸 백필");
    console.log(`- 프로젝트: ${args.projectId} · ${args.apply ? "실제로 씀" : "건조 실행(쓰지 않음)"}`);
    console.log(`- 범위: ${args.from} ~ ${to}`);
    console.log(`- 훑은 기록 ${counts.scanned} · 감사 일기/수면 분석 있는 기록 ${counts.mindLogs}`);
    console.log(`- 고칠 게시물 ${counts.update} · 새로 생길 게시물 ${counts.create} · 손대지 않음 ${counts.unchanged}`);
    console.log(`- 쓴 것 ${counts.written}`);
    return counts;
}

if (require.main === module) {
    Promise.resolve()
        .then(() => run(parseArgs(process.argv.slice(2))))
        .catch((error) => {
            console.error(`백필 실패: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = { parseArgs, hasMindContent, resolvePreservedUpdatedAt, createOrderPreservingWrite, monthWindows };
