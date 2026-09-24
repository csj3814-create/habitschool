/**
 * 오류 제보를 서버가 대신 저장한다 — 앱의 Firestore 가 무너졌을 때의 길.
 *
 * 2026-09-20, 2026-09-24: "제보 전송에 실패했어요 (FIRESTORE (10.8.0) INTERNAL
 * ASSERTION FAILED: Unexpected state)". Firestore SDK 내부 상태가 한 번 깨지면 그
 * 페이지의 모든 쓰기가 같은 오류로 막힌다. 하필 그때가 제보를 가장 보내고 싶은
 * 순간이다. 연결을 다시 세우고 한 번 더 보내는 것(sendBugReport)으로는 돌아오지
 * 않았다 — 깨진 것은 연결이 아니라 SDK 의 큐다.
 *
 * 함수 호출은 Firestore SDK 를 거치지 않으므로 이 길은 살아 있다. 앱이 모은
 * 제보를 그대로 받아, 로그인한 본인 이름으로 bug_reports 에 적는다.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const MAX_MESSAGE_LENGTH = 2000;
const MAX_CONSOLE_ENTRIES = 50;
const MAX_CONSOLE_TEXT = 1000;
const MAX_JSON_BYTES = 16 * 1024;

function boundedJson(value, fallback) {
    try {
        const text = JSON.stringify(value ?? fallback);
        if (!text || text.length > MAX_JSON_BYTES) return fallback;
        return JSON.parse(text);
    } catch (_) {
        return fallback;
    }
}

/** 받은 제보를 저장할 모양으로 다듬는다 (순수 함수 — 테스트 대상). */
function sanitizeFallbackReport(data = {}, { uid, email = null, name = null, bucket = "" } = {}) {
    const message = String(data.message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (message.length < 5) return null;

    const consoleEntries = (Array.isArray(data.consoleEntries) ? data.consoleEntries : [])
        .slice(-MAX_CONSOLE_ENTRIES)
        .map((entry) => ({
            level: String(entry?.level || "log").slice(0, 10),
            text: String(entry?.text || "").slice(0, MAX_CONSOLE_TEXT),
            at: String(entry?.at || "").slice(0, 40),
        }));

    // 스크린샷은 본인 폴더에 올린 것만 받는다. 다른 주소를 제보에 싣지 않는다.
    const ownPrefix = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/bug_reports%2F${uid}%2F`;
    const screenshotUrl = typeof data.screenshotUrl === "string" && bucket && data.screenshotUrl.startsWith(ownPrefix)
        ? data.screenshotUrl.slice(0, 1000)
        : null;

    return {
        uid,
        email,
        displayName: name,
        message,
        device: boundedJson(data.device, {}),
        consoleEntries,
        pendingUploads: boundedJson(Array.isArray(data.pendingUploads) ? data.pendingUploads.slice(0, 20) : [], []),
        screenshotUrl,
        screenshotError: data.screenshotError ? String(data.screenshotError).slice(0, 200) : null,
        status: "open",
        // 어느 길로 들어왔는지와 앱 쪽 실패 사유. 이 자체가 진단 재료다.
        via: "server-fallback",
        clientError: String(data.clientError || "").slice(0, 300),
    };
}

exports.submitBugReportFallback = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        const uid = request.auth?.uid;
        if (!uid) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        const report = sanitizeFallbackReport(request.data || {}, {
            uid,
            email: request.auth.token?.email || null,
            name: request.auth.token?.name || null,
            bucket: admin.storage().bucket().name,
        });
        if (!report) throw new HttpsError("invalid-argument", "무슨 일이 있었는지 조금만 더 적어 주세요.");
        const created = await admin.firestore().collection("bug_reports").add({
            ...report,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[submitBugReportFallback] ${uid} ${created.id} (${report.clientError.slice(0, 80)})`);
        return { id: created.id };
    }
);

exports._test = { sanitizeFallbackReport };
