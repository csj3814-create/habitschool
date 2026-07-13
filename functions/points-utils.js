// 일일 인증 포인트 정산 헬퍼
//
// 클라이언트가 보낸 daily_logs의 증거 필드만 받아 서버가 검증·계산한다. coins는 실물
// 쿠폰으로 교환되므로 awardedPoints 자체는 신뢰하지 않는다. 이 헬퍼는 소유자가 맞는
// Storage 증거와 자기보고형 마음 기록을 카테고리별 상한 안에서 원장 단위로 산출한다:
//   diet ≤ 30, exercise ≤ 30, mind ≤ 20 (하루 최대 80P)
const crypto = require('crypto');

const DAILY_POINT_CAPS = Object.freeze({
    dietPoints: 30,
    exercisePoints: 30,
    mindPoints: 20,
});

const ALLOWED_MEDIA_FOLDERS = Object.freeze([
    'diet_images',
    'diet_images_thumbnails',
    'exercise_images',
    'exercise_images_thumbnails',
    'exercise_videos',
    'exercise_videos_thumbnails',
    'sleep_images',
    'sleep_images_thumbnails',
    'step_screenshots',
]);

const ALLOWED_MEDIA_FOLDER_SET = new Set(ALLOWED_MEDIA_FOLDERS);

/**
 * Parse the object path from a Firebase Storage download URL.
 *
 * This intentionally accepts only the canonical Firebase download host and
 * endpoint. Returning null instead of throwing lets callers reject untrusted
 * daily-log evidence without turning malformed client input into a retry loop.
 */
function parseFirebaseStorageDownloadUrl(value) {
    if (typeof value !== 'string' || !value.trim()) return null;

    let parsed;
    try {
        parsed = new URL(value.trim());
    } catch (_) {
        return null;
    }

    if (
        parsed.protocol !== 'https:'
        || parsed.hostname !== 'firebasestorage.googleapis.com'
        || parsed.username
        || parsed.password
        || parsed.port
        || parsed.hash
        || parsed.searchParams.get('alt') !== 'media'
    ) {
        return null;
    }

    const match = parsed.pathname.match(/^\/v0\/b\/([A-Za-z0-9._-]+)\/o\/(.+)$/);
    if (!match) return null;

    let objectPath;
    try {
        objectPath = decodeURIComponent(match[2]);
    } catch (_) {
        return null;
    }

    if (
        !objectPath
        || objectPath.startsWith('/')
        || objectPath.endsWith('/')
        || objectPath.includes('\\')
        || /[\u0000-\u001f\u007f]/.test(objectPath)
        // Do not allow a second decoding pass to change path boundaries.
        || /%(?:2f|5c)/i.test(objectPath)
    ) {
        return null;
    }

    const segments = objectPath.split('/');
    if (segments.length < 3 || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
        return null;
    }

    return { bucket: match[1], objectPath };
}

function parseFirebaseStorageObjectPath(value) {
    return parseFirebaseStorageDownloadUrl(value)?.objectPath || null;
}

function isAllowedUserMediaPath(objectPath, userId, expectedFolder = null) {
    if (typeof objectPath !== 'string' || typeof userId !== 'string') return false;

    const normalizedUserId = userId.trim();
    if (
        !normalizedUserId
        || normalizedUserId !== userId
        || normalizedUserId === '.'
        || normalizedUserId === '..'
        || normalizedUserId.includes('/')
        || normalizedUserId.includes('\\')
    ) {
        return false;
    }

    const segments = objectPath.split('/');
    if (
        segments.length < 3
        || segments.some((segment) => !segment || segment === '.' || segment === '..')
        || objectPath.includes('\\')
        || /[\u0000-\u001f\u007f]/.test(objectPath)
        || /%(?:2f|5c)/i.test(objectPath)
    ) {
        return false;
    }

    const folder = segments[0];
    if (!ALLOWED_MEDIA_FOLDER_SET.has(folder) || segments[1] !== normalizedUserId) return false;
    if (expectedFolder !== null && folder !== expectedFolder) return false;
    return true;
}

function isAllowedUserMediaUrl(value, userId, expectedFolder = null, allowedStorageBuckets = null) {
    const parsed = parseFirebaseStorageDownloadUrl(value);
    if (!parsed || !isAllowedUserMediaPath(parsed.objectPath, userId, expectedFolder)) return false;

    if (Array.isArray(allowedStorageBuckets) && allowedStorageBuckets.length > 0) {
        const allowed = new Set(allowedStorageBuckets
            .map((bucket) => String(bucket || '').trim().toLowerCase())
            .filter(Boolean));
        if (!allowed.has(parsed.bucket.toLowerCase())) return false;
    }
    return true;
}

function getKstDateStringFromTimestamp(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isEvidenceCreatedForLogDate(timeCreated, logDate) {
    const normalizedLogDate = typeof logDate === 'string' ? logDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedLogDate)) return false;
    return getKstDateStringFromTimestamp(timeCreated) === normalizedLogDate;
}

function isEvidenceCreatedWithinRewardWindow(timeCreated, logDate, maximumDelayDays = 1) {
    const normalizedLogDate = typeof logDate === 'string' ? logDate.trim() : '';
    const createdDate = getKstDateStringFromTimestamp(timeCreated);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedLogDate)
        || !/^\d{4}-\d{2}-\d{2}$/.test(String(createdDate || ''))
        || !Number.isInteger(maximumDelayDays)
        || maximumDelayDays < 0
        || maximumDelayDays > 7) {
        return false;
    }
    const sourceTime = Date.parse(`${normalizedLogDate}T00:00:00.000Z`);
    const createdTime = Date.parse(`${createdDate}T00:00:00.000Z`);
    const delayDays = Math.round((createdTime - sourceTime) / 86400000);
    return delayDays >= 0 && delayDays <= maximumDelayDays;
}

function getRewardEvidenceClaimId(userId, unit = {}) {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    const objectPath = String(unit.objectPath || '').trim();
    const objectGeneration = String(unit.objectGeneration || '').trim();
    if (!normalizedUserId || !objectPath || !/^\d+$/.test(objectGeneration)) return null;
    const verifiedImageHash = String(unit.verifiedImageHash || '').trim().toLowerCase();
    const contentHash = String(unit.contentHash || '').trim();
    const identity = /^[a-f0-9]{64}$/.test(verifiedImageHash)
        ? `sha256:${verifiedImageHash}`
        : (contentHash || `object:${objectPath}@${objectGeneration}`);
    return crypto.createHash('sha256')
        .update(`${normalizedUserId}\n${identity}`)
        .digest('hex');
}

function normalizeEvidenceHash(value) {
    const hash = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return /^[a-f0-9]{64}$/.test(hash) ? hash : null;
}

function createLedgerUnit(key, category, points, evidenceType, evidence = null) {
    const unit = {
        id: key,
        key,
        category,
        points,
        evidenceType,
    };
    if (evidence?.objectPath) {
        unit.objectPath = evidence.objectPath;
        unit.objectGeneration = evidence.objectGeneration;
        unit.contentHash = evidence.contentHash;
        unit.verifiedImageHash = evidence.verifiedImageHash;
    }
    return Object.freeze(unit);
}

function mediaCandidate(url, folder, evidenceType, imageHash = null) {
    return { url, folder, evidenceType, imageHash: normalizeEvidenceHash(imageHash) };
}

function stepCountCandidate(count) {
    return { evidenceType: 'step_count', stepCount: Number(count) };
}

function getDietCandidates(log) {
    const diet = log && typeof log.diet === 'object' && log.diet ? log.diet : {};
    const analysis = log && typeof log.dietAnalysis === 'object' && log.dietAnalysis ? log.dietAnalysis : {};
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    return slots.map((slot) => mediaCandidate(
        diet[`${slot}Url`],
        'diet_images',
        'diet_photo',
        analysis[slot]?.imageHash
    ));
}

function getCardioCandidates(log) {
    const exercise = log && typeof log.exercise === 'object' && log.exercise ? log.exercise : {};
    const candidates = [];
    const cardioList = Array.isArray(exercise.cardioList) ? exercise.cardioList : [];

    cardioList.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        candidates.push(mediaCandidate(
            item.imageUrl,
            'exercise_images',
            'exercise_cardio_image',
            item.imageHash
        ));
    });

    if (exercise.cardioImageUrl) {
        candidates.push(mediaCandidate(
            exercise.cardioImageUrl,
            'exercise_images',
            'exercise_cardio_image',
            exercise.cardioImageHash
        ));
    }

    const steps = log && typeof log.steps === 'object' && log.steps ? log.steps : {};
    if (Number(steps.count) >= 8000) {
        candidates.push(stepCountCandidate(steps.count));
    }

    return candidates;
}

function getStrengthCandidates(log) {
    const exercise = log && typeof log.exercise === 'object' && log.exercise ? log.exercise : {};
    const candidates = [];
    const strengthList = Array.isArray(exercise.strengthList) ? exercise.strengthList : [];

    strengthList.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        candidates.push(mediaCandidate(
            item.videoUrl,
            'exercise_videos',
            'exercise_strength_video',
            item.videoHash || item.imageHash
        ));
    });

    if (exercise.strengthVideoUrl) {
        candidates.push(mediaCandidate(
            exercise.strengthVideoUrl,
            'exercise_videos',
            'exercise_strength_video',
            exercise.strengthVideoHash
        ));
    }

    return candidates;
}

/**
 * Calculate authoritative daily awards from raw evidence.
 *
 * A user-entered count of 8,000+ steps is one cardio unit without media.
 * Other evidence remains media-backed: isValidMedia receives (downloadUrl, context) and must return true (or
 * { valid: true }) only after checking the referenced Storage object. Media
 * evidence fails closed when the verifier is omitted. Verifier errors are
 * allowed to propagate so a transient Storage failure can retry safely.
 */
async function calculateServerAwardedPoints(log = {}, { isValidMedia } = {}) {
    const source = log && typeof log === 'object' ? log : {};
    const userId = typeof source.userId === 'string' ? source.userId : '';
    const verifier = typeof isValidMedia === 'function' ? isValidMedia : null;
    const usedObjectPaths = new Set();
    const usedHashes = new Set();
    const ledgerUnits = [];

    async function validateCandidate(candidate) {
        if (candidate?.evidenceType === 'step_count') {
            return Number.isFinite(candidate.stepCount) && candidate.stepCount >= 8000
                ? Object.freeze({})
                : false;
        }
        if (!verifier || !candidate || typeof candidate.url !== 'string') return false;
        const objectPath = parseFirebaseStorageObjectPath(candidate.url);
        if (!objectPath || !isAllowedUserMediaPath(objectPath, userId, candidate.folder)) return false;
        if (usedObjectPaths.has(objectPath)) return false;
        if (candidate.imageHash && usedHashes.has(candidate.imageHash)) return false;

        const verification = await verifier(candidate.url, Object.freeze({
            objectPath,
            userId,
            logDate: typeof source.date === 'string' ? source.date : '',
            folder: candidate.folder,
            evidenceType: candidate.evidenceType,
            imageHash: candidate.imageHash,
        }));
        const valid = verification === true
            || (!!verification && typeof verification === 'object' && verification.valid === true);
        if (!valid) return false;

        usedObjectPaths.add(objectPath);
        if (candidate.imageHash) usedHashes.add(candidate.imageHash);
        const verificationData = verification && typeof verification === 'object'
            ? verification
            : {};
        const objectGeneration = String(
            verificationData.objectGeneration || verificationData.generation || ''
        ).trim();
        const contentHash = String(verificationData.contentHash || '').trim().slice(0, 256);
        return Object.freeze({
            objectPath,
            objectGeneration: /^\d+$/.test(objectGeneration) ? objectGeneration : '',
            contentHash,
            verifiedImageHash: normalizeEvidenceHash(verificationData.verifiedImageHash),
        });
    }

    let dietIndex = 0;
    for (const candidate of getDietCandidates(source)) {
        if (dietIndex >= 3) break;
        const evidence = await validateCandidate(candidate);
        if (!evidence) continue;
        dietIndex += 1;
        ledgerUnits.push(createLedgerUnit(`diet_${dietIndex}`, 'diet', 10, candidate.evidenceType, evidence));
    }

    let cardioIndex = 0;
    for (const candidate of getCardioCandidates(source)) {
        if (cardioIndex >= 2) break;
        const evidence = await validateCandidate(candidate);
        if (!evidence) continue;
        cardioIndex += 1;
        ledgerUnits.push(createLedgerUnit(
            `exercise_cardio_${cardioIndex}`,
            'exercise',
            cardioIndex === 1 ? 10 : 5,
            candidate.evidenceType,
            evidence
        ));
    }

    let strengthIndex = 0;
    for (const candidate of getStrengthCandidates(source)) {
        if (strengthIndex >= 2) break;
        const evidence = await validateCandidate(candidate);
        if (!evidence) continue;
        strengthIndex += 1;
        ledgerUnits.push(createLedgerUnit(
            `strength_${strengthIndex}`,
            'exercise',
            strengthIndex === 1 ? 10 : 5,
            candidate.evidenceType,
            evidence
        ));
    }

    const mind = source.sleepAndMind && typeof source.sleepAndMind === 'object'
        ? source.sleepAndMind
        : {};
    const sleepCandidate = mediaCandidate(
        mind.sleepImageUrl,
        'sleep_images',
        'sleep_image',
        mind.sleepImageHash || mind.imageHash
    );
    const sleepEvidence = await validateCandidate(sleepCandidate);
    if (sleepEvidence) {
        ledgerUnits.push(createLedgerUnit('mind_sleep', 'mind', 10, sleepCandidate.evidenceType, sleepEvidence));
    }

    const gratitude = typeof mind.gratitude === 'string'
        ? mind.gratitude.trim()
        : (typeof mind.gratitudeJournal === 'string' ? mind.gratitudeJournal.trim() : '');
    if (mind.meditationDone === true || gratitude) {
        ledgerUnits.push(createLedgerUnit(
            'mind_reflection',
            'mind',
            10,
            mind.meditationDone === true ? 'meditation' : 'gratitude'
        ));
    }

    const sumCategory = (category) => ledgerUnits
        .filter((unit) => unit.category === category)
        .reduce((sum, unit) => sum + unit.points, 0);
    const dietPoints = Math.min(sumCategory('diet'), DAILY_POINT_CAPS.dietPoints);
    const exercisePoints = Math.min(sumCategory('exercise'), DAILY_POINT_CAPS.exercisePoints);
    const mindPoints = Math.min(sumCategory('mind'), DAILY_POINT_CAPS.mindPoints);

    return Object.freeze({
        awardedPoints: Object.freeze({
            dietPoints,
            exercisePoints,
            mindPoints,
            diet: dietPoints > 0,
            exercise: exercisePoints > 0,
            mind: mindPoints > 0,
        }),
        ledgerUnits: Object.freeze(ledgerUnits),
    });
}

function clampField(value, cap) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(n, cap);
}

// awardedPoints 맵을 받아 상한으로 클램프한 총점을 반환한다.
function clampDailyAwardTotal(awarded = {}) {
    return clampField(awarded.dietPoints, DAILY_POINT_CAPS.dietPoints)
        + clampField(awarded.exercisePoints, DAILY_POINT_CAPS.exercisePoints)
        + clampField(awarded.mindPoints, DAILY_POINT_CAPS.mindPoints);
}

// 리액션 토글 결정(순수 함수). 실제 저장(coins increment 등)은 호출자가 트랜잭션에서
// 수행한다. uid는 반드시 서버가 검증한 request.auth.uid여야 한다(위조 불가). 정책:
//   - 이미 리액션함 → 취소(표시 배열에서 제거, 포인트 회수 없음, award=false)
//   - 처음 리액션 → 추가, 본인 게시물이 아니고 (post,reactor) 최초일 때만 award=true
function computeReactionToggle(logData, uid, reactionType) {
    const src = (logData && typeof logData.reactions === 'object' && logData.reactions) ? logData.reactions : {};
    const reactions = { ...src };
    const list = Array.isArray(reactions[reactionType]) ? [...reactions[reactionType]] : [];
    const postOwnerId = logData && logData.userId ? logData.userId : null;

    if (list.includes(uid)) {
        reactions[reactionType] = list.filter((u) => u !== uid);
        return { active: false, award: false, reactions, postOwnerId, count: reactions[reactionType].length };
    }

    list.push(uid);
    reactions[reactionType] = list;
    const rewardedUserIds = Array.isArray(logData && logData.reactionPointAwardedUserIds)
        ? logData.reactionPointAwardedUserIds
        : [];
    const award = !!postOwnerId && postOwnerId !== uid && !rewardedUserIds.includes(uid);
    return { active: true, award, reactions, postOwnerId, count: reactions[reactionType].length };
}

module.exports = {
    DAILY_POINT_CAPS,
    ALLOWED_MEDIA_FOLDERS,
    parseFirebaseStorageDownloadUrl,
    parseFirebaseStorageObjectPath,
    isAllowedUserMediaPath,
    isAllowedUserMediaUrl,
    getKstDateStringFromTimestamp,
    isEvidenceCreatedForLogDate,
    isEvidenceCreatedWithinRewardWindow,
    getRewardEvidenceClaimId,
    calculateServerAwardedPoints,
    clampDailyAwardTotal,
    computeReactionToggle,
};
