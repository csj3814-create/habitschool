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
 *   3. 로그인한 웹이 `claimSharedUpload` 로 파일을 받아 간다
 *   4. 같은 때 `classifySharedHealthImage` 가 서버에 있는 그 파일로 어디에 넣을지 본다
 *      (2026-11-06: 폰이 사진을 줄여 다시 올리던 왕복을 없앴다). 받기와 분류 중
 *      나중에 끝난 쪽이 지운다. 분류하지 않는 공유는 받는 즉시 지운다.
 *
 * 올리는 쪽은 로그인이 없다(앱 셸은 Firebase 로그인을 모른다). 그래서
 *  - 사진·CSV 만, 파일 하나 8MB 까지 받고
 *  - id 는 추측할 수 없는 128비트이며
 *  - 다 쓰면 바로, 어느 쪽이 멈춰도 한 시간 뒤에는 지운다.
 * 회원의 체성분 화면이 잠깐 서버에 머무는 것이므로 오래 두지 않는 것이 핵심이다.
 */

const { onCall: baseOnCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
// 콜러블이 던진 오류 문장에 영어를 싣는다(functions/error-messages.js, 해외 3단계 E6-2).
const { localizedOnCall } = require("./error-messages");
const onCall = localizedOnCall(baseOnCall);
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

const GEMINI_API_KEY = defineSecret("GEMINI_API_KEY");
// classifySharedHealthImage 는 함수 타임아웃이 20초다. 다른 AI 함수와 같은 자를 쓸 수 없다.
const AI_MODEL_FAST_TIMEOUT_MS = 14000;

const SHARED_UPLOAD_PREFIX = "shared_uploads";
const SHARED_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;
const SHARED_UPLOAD_TTL_MS = 60 * 60 * 1000;
const SHARED_UPLOAD_ID_PATTERN = /^[a-f0-9]{32}$/;
// 서버에 있는 원본을 그대로 모델에 보낼 수 있는 것. 그 밖(GIF, 아주 큰 사진, CSV)은
// 웹이 예전처럼 줄여서 보낸다.
const SHARED_CLASSIFY_IMAGE_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp", "image/heic"]);
const SHARED_CLASSIFY_MAX_BYTES = 5 * 1024 * 1024;
const SHARED_RELEASE_RETRY_MS = Object.freeze([60, 150, 400]);

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

// 공유 함수는 runtime.js 없이 혼자 뜰 수 있다(functions/index.js). 그때는 여기서 초기화한다.
function sharedUploadBucket() {
    if (!admin.apps.length) admin.initializeApp();
    return admin.storage().bucket();
}

function isSharedUploadExpired(metadata) {
    const createdAt = Date.parse(metadata?.timeCreated || "");
    return !Number.isFinite(createdAt) || Date.now() - createdAt > SHARED_UPLOAD_TTL_MS;
}

/**
 * 받기와 분류가 같은 파일을 쓴다. 각자 끝나면 자기 표시를 남기고, 상대 표시가 이미
 * 있으면 지운다 — 나중에 끝난 쪽이 지우게 된다. 표시를 못 남겨도 받은 사람에게는
 * 영향이 없고 한 시간 청소가 지운다.
 */
async function releaseSharedUpload(file, role) {
    const other = role === "claimed" ? "classified" : "claimed";
    for (let attempt = 0; attempt <= SHARED_RELEASE_RETRY_MS.length; attempt += 1) {
        try {
            const [updated] = await file.setMetadata({ metadata: { [role]: "1" } });
            if (updated?.metadata?.[other]) await file.delete({ ignoreNotFound: true });
            return;
        } catch (error) {
            if (error?.code === 404) return;
            // 같은 파일에 동시에 쓰면 저장소가 한쪽을 409 로 돌려보낸다(스테이징 실측 10번 중 10번).
            // 그대로 두면 양쪽 다 상대 표시를 못 보고 파일이 한 시간 남는다. 다시 쓰면 상대 표시가 보인다.
            if (error?.code === 409 && attempt < SHARED_RELEASE_RETRY_MS.length) {
                await new Promise((resolve) => setTimeout(resolve, SHARED_RELEASE_RETRY_MS[attempt]));
                continue;
            }
            console.warn(`[shared-upload] ${role} 표시 실패:`, error?.message || error);
            return;
        }
    }
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
            await sharedUploadBucket().file(sharedUploadPath(id)).save(body, {
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

        const file = sharedUploadBucket().file(sharedUploadPath(id));
        // 정보와 내용을 동시에 읽는다. 차례로 읽으면 저장소를 한 번 더 기다린다.
        let metadata;
        let buffer;
        try {
            [[metadata], [buffer]] = await Promise.all([file.getMetadata(), file.download()]);
        } catch (error) {
            if (error?.code === 404) return { found: false };
            throw error;
        }
        if (isSharedUploadExpired(metadata)) {
            await file.delete({ ignoreNotFound: true });
            return { found: false, expired: true };
        }

        if (request.data?.keepForClassify === true) {
            await releaseSharedUpload(file, "claimed");
        } else {
            // 받아 간 순간 지운다. 같은 id 로 두 번 받을 일이 없다.
            await file.delete({ ignoreNotFound: true });
        }
        const type = EXTENSION_BY_TYPE[metadata.contentType] ? metadata.contentType : "image/jpeg";
        return {
            found: true,
            type,
            name: `shared-upload.${EXTENSION_BY_TYPE[type]}`,
            data: buffer.toString("base64"),
        };
    }
);

async function buildInlineImagePartFromUrl(imageUrl = "") {
    const normalizedUrl = String(imageUrl || "").trim();
    if (!normalizedUrl) {
        throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
    }

    if (!normalizedUrl.startsWith("https://firebasestorage.googleapis.com/") && !normalizedUrl.startsWith("data:")) {
        throw new HttpsError("invalid-argument", "허용되지 않은 이미지 URL입니다.");
    }

    if (normalizedUrl.startsWith("data:")) {
        const matches = normalizedUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new HttpsError("invalid-argument", "잘못된 data URL 형식입니다.");
        }
        const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
        if (!allowedMimes.includes(matches[1])) {
            throw new HttpsError("invalid-argument", "허용되지 않은 이미지 형식입니다.");
        }
        if (matches[2].length > 5 * 1024 * 1024 * 1.37) {
            throw new HttpsError("invalid-argument", "이미지 크기가 너무 큽니다 (최대 5MB).");
        }
        return {
            inlineData: {
                data: matches[2],
                mimeType: matches[1]
            }
        };
    }

    const imgResponse = await fetch(normalizedUrl);
    if (!imgResponse.ok) {
        throw new HttpsError("not-found", "이미지를 불러올 수 없습니다.");
    }

    const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
    const contentType = imgResponse.headers.get("content-type") || "image/jpeg";
    return {
        inlineData: {
            data: imgBuffer.toString("base64"),
            mimeType: contentType
        }
    };
}

const SHARED_HEALTH_IMAGE_CLASSIFICATION_PROMPT = `당신은 해빛스쿨 PWA의 공유 이미지 분류기입니다.

사용자가 다른 앱에서 이미지를 공유하면, 이 이미지가 아래 중 어디에 들어가야 하는지 빠르게 판별하세요.
- diet: 식단 사진, 음식 사진, 식사 트레이, 음료, 영양 화면
- exercise: 운동 인증 사진, 운동 장면, 걷기/러닝/헬스 캡처, 피트니스 앱 스크린샷
- sleep: 수면 앱 캡처, 수면 그래프, 취침/기상 기록, 수면 품질 화면
- body: 체성분 측정 결과 — 체중계 화면, Fitdays·인바디 같은 앱에서 체중·체지방률·골격근량·내장지방·기초대사량이 나열된 화면
- unknown: 확신이 부족하거나 네 카테고리와 맞지 않음

추가 규칙:
- exercise 카테고리일 때만 exerciseMode를 채우세요.
- exerciseMode는 아래 둘 중 하나입니다.
  - step_screenshot: 삼성헬스/건강앱 같은 걸음수, 거리, 칼로리, 활동시간이 보이는 앱 캡처
  - cardio_image: 일반 운동 사진 또는 기타 운동 이미지
- 체중·체지방률·골격근량 같은 체성분 수치 표는 운동 앱처럼 보여도 exercise 가 아니라 body 입니다.
- 확신이 낮으면 category를 unknown으로 두거나 confidence를 낮게 주세요.
- 반드시 보수적으로 판단하세요. 자동 라우팅이 걸리므로 과한 추측을 하면 안 됩니다.

반드시 아래 JSON만 출력하세요.
{
  "category": "diet|exercise|sleep|body|unknown",
  "confidence": 0.0,
  "reason": "짧은 근거",
  "exerciseMode": "step_screenshot|cardio_image|null"
}`;

function withDeadline(promise, timeoutMs, label) {
    let timer = null;
    const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}_timeout_${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

// 서버에 있는 공유 파일을 모델에 넘길 모양으로. 쓸 수 없으면 null.
async function readSharedUploadImagePart(file) {
    try {
        const [metadata] = await file.getMetadata();
        if (isSharedUploadExpired(metadata)) return null;
        if (!SHARED_CLASSIFY_IMAGE_TYPES.includes(metadata?.contentType)) return null;
        if (!(Number(metadata?.size) <= SHARED_CLASSIFY_MAX_BYTES)) return null;
        const [buffer] = await file.download();
        return { inlineData: { data: buffer.toString("base64"), mimeType: metadata.contentType } };
    } catch (error) {
        if (error?.code !== 404) {
            console.warn("[classifySharedHealthImage] 공유 파일을 읽지 못했다:", error?.message || error);
        }
        return null;
    }
}

exports.classifySharedHealthImage = onCall(
    {
        secrets: [GEMINI_API_KEY],
        region: "asia-northeast3",
        maxInstances: 20,
        timeoutSeconds: 20
    },
    async (request) => {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }

        const { imageUrl, sharedUploadId, fileName, fileCount } = request.data || {};
        // 공유 파일 id 로 부르면 서버에 있는 원본으로 본다. 쓸 수 없는 파일이면 fallback 을
        // 돌려주고, 웹이 예전처럼 사진을 줄여 imageUrl 로 다시 부른다.
        let uploadFile = null;
        let imagePart = null;
        if (sharedUploadId !== undefined) {
            const id = String(sharedUploadId || "").trim();
            if (!SHARED_UPLOAD_ID_PATTERN.test(id)) {
                throw new HttpsError("invalid-argument", "잘못된 공유 id 입니다.");
            }
            uploadFile = sharedUploadBucket().file(sharedUploadPath(id));
            imagePart = await readSharedUploadImagePart(uploadFile);
            if (!imagePart) {
                await releaseSharedUpload(uploadFile, "classified");
                return { success: true, classification: null, fallback: true };
            }
        } else if (!imageUrl || typeof imageUrl !== "string") {
            throw new HttpsError("invalid-argument", "이미지 URL이 필요합니다.");
        }

        try {
            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY.value());
            const model = genAI.getGenerativeModel({
                model: "gemini-2.5-flash",
                generationConfig: {
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            const result = await withDeadline(
                model.generateContent([
                    SHARED_HEALTH_IMAGE_CLASSIFICATION_PROMPT,
                    `파일 이름: ${String(fileName || "").trim() || "-"}`,
                    `공유된 이미지 수: ${Number(fileCount || 0) || 1}`,
                    imagePart || await buildInlineImagePartFromUrl(imageUrl)
                ]),
                AI_MODEL_FAST_TIMEOUT_MS,
                "classifySharedHealthImage_model"
            );

            const responseText = result.response.text();
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const parsed = JSON.parse(jsonStr);
            const category = ["diet", "exercise", "sleep", "body", "unknown"].includes(String(parsed?.category || "").trim())
                ? String(parsed.category).trim()
                : "unknown";
            const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence || 0) || 0));
            const exerciseMode = category === "exercise" && String(parsed?.exerciseMode || "").trim() === "step_screenshot"
                ? "step_screenshot"
                : (category === "exercise" ? "cardio_image" : null);

            return {
                success: true,
                classification: {
                    category,
                    confidence,
                    reason: String(parsed?.reason || "").trim(),
                    exerciseMode
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            if (error instanceof HttpsError) throw error;
            // 마감선에 걸린 것은 고장이 아니라 늦은 것이다. 다시 눌러보게 한다.
            if (String(error?.message || "").includes("_timeout_")) {
                console.warn("classifySharedHealthImage 마감선 초과:", error.message);
                throw new HttpsError("deadline-exceeded", "분석이 너무 오래 걸렸어요. 다시 시도해주세요.");
            }
            console.error("classifySharedHealthImage 오류:", error);
            throw new HttpsError("internal", "공유 이미지 분류 중 오류가 발생했습니다.");
        } finally {
            if (uploadFile) await releaseSharedUpload(uploadFile, "classified");
        }
    }
);

// ── 단계별 걸린 시간 ────────────────────────────────────────────────────
// 공유는 한 달에 수십 건뿐이고, 등록하지 않은 GA 매개변수는 나눠 볼 수 없다. 한 건도
// 놓치지 않고 정확한 값을 보려고 서버 로그에 한 줄로 남긴다(Cloud Logging 에서
// `[shared-import-timing]` 으로 찾는다). uid·사진·건강 수치는 받지도 남기지도 않는다.
const SHARED_IMPORT_TIMING_STEPS = Object.freeze([
    "app_code_ready",
    "auth_ready",
    "claim_done",
    "daily_log_ready",
    "sheet_open",
    "classify_done",
    "target_set",
    "upload_done",
    "analysis_done",
    "save_click",
    "save_ready",
    "save_done",
]);
const SHARED_IMPORT_TIMING_INFO = Object.freeze({
    outcome: ["placed", "saved", "closed", "failed"],
    classify: ["server", "client", "none"],
    target: ["diet", "exercise", "sleep", "body"],
    method: ["auto", "tap"],
    network: ["slow-2g", "2g", "3g", "4g", "unknown"],
    worker: ["controlled", "none"],
});
const SHARED_IMPORT_TIMING_MAX_MS = 60 * 60 * 1000;

function sanitizeSharedImportTiming(raw = {}) {
    const trace = String(raw?.trace || "");
    if (!/^[a-f0-9]{8}$/.test(trace)) return null;
    const steps = {};
    SHARED_IMPORT_TIMING_STEPS.forEach((step) => {
        const ms = Number(raw?.steps?.[step]);
        if (Number.isFinite(ms) && ms >= 0 && ms <= SHARED_IMPORT_TIMING_MAX_MS) steps[step] = Math.round(ms);
    });
    if (Object.keys(steps).length === 0) return null;
    const line = { trace, steps };
    Object.entries(SHARED_IMPORT_TIMING_INFO).forEach(([key, allowed]) => {
        if (allowed.includes(raw?.[key])) line[key] = raw[key];
    });
    const files = Number(raw?.files);
    if (Number.isInteger(files) && files >= 0 && files <= 5) line.files = files;
    const kb = Number(raw?.kb);
    if (Number.isFinite(kb) && kb >= 0 && kb <= 50000) line.kb = Math.round(kb);
    const version = Number(raw?.version);
    if (Number.isInteger(version) && version > 0 && version < 100000) line.version = version;
    return line;
}

exports.reportSharedImportTiming = onCall(
    { region: "asia-northeast3", maxInstances: 5, timeoutSeconds: 10 },
    async (request) => {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
        }
        const line = sanitizeSharedImportTiming(request.data);
        if (!line) return { ok: false };
        console.log(`[shared-import-timing] ${JSON.stringify(line)}`);
        return { ok: true };
    }
);

// 받아 가지 않은 것은 한 시간이 지나면 지운다. 매시간 돈다.
exports.cleanupSharedUploads = onSchedule(
    { schedule: "15 * * * *", region: "asia-northeast3", timeZone: "Asia/Seoul" },
    async () => {
        const [files] = await sharedUploadBucket().getFiles({ prefix: `${SHARED_UPLOAD_PREFIX}/` });
        const cutoff = Date.now() - SHARED_UPLOAD_TTL_MS;
        const stale = files.filter((file) => {
            const created = Date.parse(file.metadata?.timeCreated || "");
            return !Number.isFinite(created) || created < cutoff;
        });
        await Promise.all(stale.map((file) => file.delete({ ignoreNotFound: true })));
        if (stale.length > 0) console.log(`[cleanupSharedUploads] ${stale.length}건 삭제`);
    }
);

exports._test = {
    sniffSharedUpload,
    releaseSharedUpload,
    sanitizeSharedImportTiming,
    readSharedUploadImagePart,
    SHARED_UPLOAD_ID_PATTERN,
    SHARED_UPLOAD_MAX_BYTES,
    SHARED_UPLOAD_TTL_MS,
    SHARED_CLASSIFY_MAX_BYTES,
    SHARED_IMPORT_TIMING_STEPS,
};
