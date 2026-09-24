/**
 * 다른 앱에서 공유한 파일을 크롬을 거치지 않고 웹에 넘긴다.
 *
 * 2026-09-24: Play 앱(1.0.7)으로 Fitdays 결과 화면을 공유하면, 앱은 사진을 받아
 * 복사까지 했는데(진단 `copied:jpg`) 크롬이 웹의 /share-target 으로 넘기면서
 * 파일만 버렸다(`files:[]`, 제목만 도착). 크롬 153 의 회귀다(crbug 548571656).
 * 웹 코드로는 손댈 수 없는 자리라, 파일이 크롬을 지나지 않게 길을 돌린다.
 *
 *   1. 앱이 받은 파일을 여기(`receiveSharedUpload`)로 그대로 올린다 → 무작위 id
 *   2. 앱은 `?sharedUploads=<id>` 를 붙여 웹을 연다
 *   3. 로그인한 웹이 `claimSharedUpload` 로 파일을 받아 가고, 받는 즉시 지운다
 *
 * 올리는 쪽은 로그인이 없다(앱 셸은 Firebase 로그인을 모른다). 그래서
 *  - 사진·CSV 만, 파일 하나 8MB 까지 받고
 *  - id 는 추측할 수 없는 128비트이며
 *  - 받아 가면 바로, 안 받아 가도 한 시간 뒤에는 지운다.
 * 회원의 체성분 화면이 잠깐 서버에 머무는 것이므로 오래 두지 않는 것이 핵심이다.
 */

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const crypto = require("crypto");

const SHARED_UPLOAD_PREFIX = "shared_uploads";
const SHARED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const SHARED_UPLOAD_TTL_MS = 60 * 60 * 1000;
const SHARED_UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/;

const EXTENSION_BY_TYPE = Object.freeze({
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/heic": "heic",
    "text/csv": "csv",
});

/**
 * 받은 바이트의 종류를 내용으로 가린다 (앱의 SharedFileRelay, 서비스 워커의
 * sniffSharedFileType 과 같은 판정). 사진도 CSV 도 아니면 null.
 */
function sniffSharedUpload(buffer, declaredType = "") {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    const at = (i) => (i < buffer.length ? buffer[i] : -1);
    if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
    if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
    if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38) return "image/gif";
    if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46
        && at(8) === 0x57 && at(9) === 0x45 && at(10) === 0x42 && at(11) === 0x50) return "image/webp";
    if (at(4) === 0x66 && at(5) === 0x74 && at(6) === 0x79 && at(7) === 0x70) {
        const brand = buffer.subarray(8, 12).toString("ascii");
        if (/^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(brand)) return "image/heic";
    }
    // CSV 는 앞머리 표식이 없다. 보낸 쪽이 CSV 라고 했고, 글자만 있을 때만 믿는다.
    const declared = String(declaredType || "").toLowerCase();
    if (declared.includes("csv")) {
        const head = buffer.subarray(0, 4096);
        if (!head.includes(0)) return "text/csv";
    }
    return null;
}

function sharedUploadPath(id) {
    return `${SHARED_UPLOAD_PREFIX}/${id}`;
}

// Play 앱이 부른다. 로그인이 없는 대신 받는 것을 좁게 제한한다(위 설명).
exports.receiveSharedUpload = onRequest(
    { region: "asia-northeast3", cors: false, maxInstances: 5, timeoutSeconds: 60 },
    async (req, res) => {
        res.set("Cache-Control", "no-store");
        if (req.method !== "POST") {
            res.status(405).json({ error: "method" });
            return;
        }
        const body = req.rawBody;
        if (!Buffer.isBuffer(body) || body.length === 0) {
            res.status(400).json({ error: "empty" });
            return;
        }
        if (body.length > SHARED_UPLOAD_MAX_BYTES) {
            res.status(413).json({ error: "too-large" });
            return;
        }
        const type = sniffSharedUpload(body, req.get("content-type"));
        if (!type) {
            res.status(415).json({ error: "type" });
            return;
        }

        const id = crypto.randomBytes(16).toString("hex");
        try {
            await admin.storage().bucket().file(sharedUploadPath(id)).save(body, {
                resumable: false,
                contentType: type,
                metadata: { cacheControl: "private, no-store" },
            });
        } catch (error) {
            console.error("[receiveSharedUpload] 저장 실패:", error?.message || error);
            res.status(500).json({ error: "store" });
            return;
        }
        console.log(`[receiveSharedUpload] ${type} ${body.length}B`);
        res.status(200).json({ id, type });
    }
);

// 웹이 부른다. 한 번에 파일 하나 — 응답 크기 한도(32MB)를 넘지 않게.
exports.claimSharedUpload = onCall(
    { region: "asia-northeast3" },
    async (request) => {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        const id = String(request.data?.id || "").trim();
        if (!SHARED_UPLOAD_ID_PATTERN.test(id)) {
            throw new HttpsError("invalid-argument", "잘못된 공유 id 입니다.");
        }

        const file = admin.storage().bucket().file(sharedUploadPath(id));
        let metadata;
        try {
            [metadata] = await file.getMetadata();
        } catch (error) {
            if (error?.code === 404) return { found: false };
            throw error;
        }
        const createdAt = Date.parse(metadata?.timeCreated || "");
        if (!Number.isFinite(createdAt) || Date.now() - createdAt > SHARED_UPLOAD_TTL_MS) {
            await file.delete({ ignoreNotFound: true });
            return { found: false, expired: true };
        }

        const [buffer] = await file.download();
        // 받아 간 순간 지운다. 같은 id 로 두 번 받을 일이 없다.
        await file.delete({ ignoreNotFound: true });
        const type = EXTENSION_BY_TYPE[metadata.contentType] ? metadata.contentType : "image/jpeg";
        return {
            found: true,
            type,
            name: `shared-upload.${EXTENSION_BY_TYPE[type]}`,
            data: buffer.toString("base64"),
        };
    }
);

// 받아 가지 않은 것은 한 시간이 지나면 지운다. 매시간 돈다.
exports.cleanupSharedUploads = onSchedule(
    { schedule: "15 * * * *", region: "asia-northeast3", timeZone: "Asia/Seoul" },
    async () => {
        const [files] = await admin.storage().bucket().getFiles({ prefix: `${SHARED_UPLOAD_PREFIX}/` });
        const cutoff = Date.now() - SHARED_UPLOAD_TTL_MS;
        const stale = files.filter((file) => {
            const created = Date.parse(file.metadata?.timeCreated || "");
            return !Number.isFinite(created) || created < cutoff;
        });
        await Promise.all(stale.map((file) => file.delete({ ignoreNotFound: true })));
        if (stale.length > 0) console.log(`[cleanupSharedUploads] ${stale.length}건 삭제`);
    }
);

exports._test = { sniffSharedUpload, SHARED_UPLOAD_ID_PATTERN, SHARED_UPLOAD_MAX_BYTES, SHARED_UPLOAD_TTL_MS };
