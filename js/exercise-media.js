export function normalizeExerciseMediaUrl(value = '') {
    return String(value || '').trim();
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
