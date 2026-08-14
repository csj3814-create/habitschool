export function normalizeExerciseMediaUrl(value = '') {
    return String(value || '').trim();
}

export function dataUrlToBlob(dataUrl = '') {
    const normalized = String(dataUrl || '').trim();
    if (!normalized.startsWith('data:')) return null;

    const separatorIndex = normalized.indexOf(',');
    if (separatorIndex < 5) return null;

    try {
        const metadataParts = normalized.slice(5, separatorIndex).split(';');
        const isBase64 = metadataParts.some((part) => part.toLowerCase() === 'base64');
        const mimeType = metadataParts
            .filter((part) => part && part.toLowerCase() !== 'base64')
            .join(';') || 'application/octet-stream';
        const payload = normalized.slice(separatorIndex + 1);

        if (isBase64) {
            const decoded = atob(payload);
            const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
            return new Blob([bytes], { type: mimeType });
        }

        const decoded = decodeURIComponent(payload);
        return new Blob([new TextEncoder().encode(decoded)], { type: mimeType });
    } catch (_) {
        return null;
    }
}

export function hasStepPointCredit(steps = {}) {
    const count = Number(steps?.count || 0);
    return Number.isFinite(count) && count >= 8000;
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

// 유산소 사진에는 프레임 추출이 없어 생성 자체는 빠르다. 남는 건 원본과 같은 큐를
// 쓰는 업로드 시간이라 근력보다 짧게 잡는다.
//
// 기다림은 썸네일이 아직 안 끝났을 때만 발생한다. 대부분은 이미 끝나 있어
// 그냥 지나가고, 늦은 경우에만 이만큼 붙는다 — 그 늦은 경우가 지금까지
// imageThumbUrl: null 로 굳어 버리던 자리다.
export function getCardioThumbSaveWaitMs() {
    return 2500;
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
