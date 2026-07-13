export function normalizeExerciseMediaUrl(value = '') {
    return String(value || '').trim();
}

export function hasPotentiallyVerifiableStepEvidence(steps = {}) {
    const count = Number(steps?.count || 0);
    const screenshotUrl = normalizeExerciseMediaUrl(steps?.screenshotUrl);
    const imageHash = String(steps?.imageHash || '').trim().toLowerCase();
    return count >= 8000
        && /^https:\/\//i.test(screenshotUrl)
        && /^[a-f0-9]{64}$/.test(imageHash);
}

export function isLocalExerciseVideoThumb(value = '') {
    return normalizeExerciseMediaUrl(value).startsWith('data:image/');
}

export function resolveStrengthLocalThumbSeed(...candidates) {
    for (const candidate of candidates) {
        const normalizedCandidate = normalizeExerciseMediaUrl(candidate);
        if (isLocalExerciseVideoThumb(normalizedCandidate)) return normalizedCandidate;
    }
    return '';
}

export function getStrengthThumbSaveWaitMs(localThumbSeed = '') {
    return isLocalExerciseVideoThumb(localThumbSeed) ? 2200 : 3600;
}

const STRENGTH_THUMB_UPLOAD_FIRST_SIZE_BYTES = 20 * 1024 * 1024;

export function shouldDeferStrengthThumbUntilUpload(fileSize = 0) {
    const normalizedSize = Math.max(0, Number(fileSize || 0));
    return normalizedSize > STRENGTH_THUMB_UPLOAD_FIRST_SIZE_BYTES;
}

export function getDeferredStrengthThumbDelayMs(fileSize = 0) {
    const normalizedSize = Math.max(0, Number(fileSize || 0));
    if (normalizedSize === 0) return 0;
    if (normalizedSize <= 6 * 1024 * 1024) return 650;
    if (normalizedSize <= 20 * 1024 * 1024) return 350;
    return 0;
}

export function resolveLegacyStrengthVideoThumbUrl(exercise = {}, videoUrl = '') {
    const normalizedVideoUrl = normalizeExerciseMediaUrl(videoUrl);
    const legacyVideoUrl = normalizeExerciseMediaUrl(exercise?.strengthVideoUrl);
    const legacyThumbUrl = normalizeExerciseMediaUrl(exercise?.strengthVideoThumbUrl);
    if (!legacyThumbUrl) return '';
    if (!normalizedVideoUrl) return legacyThumbUrl;
    if (legacyVideoUrl && legacyVideoUrl === normalizedVideoUrl) return legacyThumbUrl;
    return '';
}

export function resolveStrengthVideoThumbUrl(exercise = {}, item = null) {
    const directThumbUrl = normalizeExerciseMediaUrl(item?.videoThumbUrl);
    if (directThumbUrl) return directThumbUrl;
    const itemVideoUrl = normalizeExerciseMediaUrl(item?.videoUrl || exercise?.strengthVideoUrl);
    return resolveLegacyStrengthVideoThumbUrl(exercise, itemVideoUrl);
}

export function buildStrengthExerciseSeed(exercise = {}, item = null) {
    const normalizedVideoUrl = normalizeExerciseMediaUrl(item?.videoUrl || exercise?.strengthVideoUrl);
    if (!normalizedVideoUrl) return null;
    const seed = item && typeof item === 'object' ? { ...item } : {};
    seed.videoUrl = normalizedVideoUrl;
    const resolvedThumbUrl = resolveStrengthVideoThumbUrl(exercise, { ...seed, videoUrl: normalizedVideoUrl });
    if (resolvedThumbUrl) seed.videoThumbUrl = resolvedThumbUrl;
    return seed;
}
