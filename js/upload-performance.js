const KB = 1024;
const MB = 1024 * KB;

const FAST_PATH_IMAGE_LIMITS = Object.freeze({
    'image/jpeg': Math.round(1.8 * MB),
    'image/jpg': Math.round(1.8 * MB),
    'image/webp': Math.round(1.8 * MB),
    'image/png': Math.round(0.9 * MB)
});

const RESUMABLE_UPLOAD_TIMEOUTS = Object.freeze({
    image: Object.freeze({
        hardTimeoutMs: 60 * 1000,
        idleTimeoutMs: 30 * 1000,
        finalizeTimeoutMs: 10 * 1000
    }),
    video: Object.freeze({
        minHardTimeoutMs: 5 * 60 * 1000,
        maxHardTimeoutMs: 20 * 60 * 1000,
        hardTimeoutPerMbMs: 12 * 1000,
        minIdleTimeoutMs: 90 * 1000,
        maxIdleTimeoutMs: 3 * 60 * 1000,
        idleTimeoutPerMbMs: 4 * 1000,
        finalizeTimeoutMs: 30 * 1000
    })
});

function clampNumber(value, min, max) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return min;
    return Math.max(min, Math.min(max, normalized));
}

export function shouldFastPathImageCompression(file = null, options = {}) {
    if (!file || typeof file !== 'object') return false;

    const type = String(file.type || '').trim().toLowerCase();
    const size = Number(file.size || 0);
    const maxWidth = Number(options.maxWidth || 0);
    const maxHeight = Number(options.maxHeight || 0);
    const quality = Number(options.quality || 0);
    const fastPath = options.fastPath !== false;

    if (!fastPath || !type.startsWith('image/') || size <= 0) return false;

    // Health/AI analysis paths may request a larger target size on purpose.
    if (maxWidth > 1000 || maxHeight > 1000 || quality > 0.85) return false;

    // Keep HEIC/HEIF on the conversion path for browser compatibility.
    if (type === 'image/heic' || type === 'image/heif' || type === 'image/avif') return false;

    const sizeLimit = FAST_PATH_IMAGE_LIMITS[type];
    return Number.isFinite(sizeLimit) && size <= sizeLimit;
}

export function getDeferredVideoThumbDelayMs(fileSize = 0) {
    const normalizedSize = Math.max(0, Number(fileSize || 0));
    if (normalizedSize === 0) return 0;
    if (normalizedSize <= 6 * MB) return 650;
    if (normalizedSize <= 20 * MB) return 350;
    return 0;
}

export function getResumableUploadTimeouts(file = null) {
    const type = String(file?.type || '').trim().toLowerCase();
    const size = Math.max(0, Number(file?.size || 0));

    if (!type.startsWith('video/')) {
        return { ...RESUMABLE_UPLOAD_TIMEOUTS.image };
    }

    const sizeMb = Math.max(1, Math.ceil(size / MB));
    const video = RESUMABLE_UPLOAD_TIMEOUTS.video;

    return {
        hardTimeoutMs: Math.round(clampNumber(
            sizeMb * video.hardTimeoutPerMbMs,
            video.minHardTimeoutMs,
            video.maxHardTimeoutMs
        )),
        idleTimeoutMs: Math.round(clampNumber(
            sizeMb * video.idleTimeoutPerMbMs,
            video.minIdleTimeoutMs,
            video.maxIdleTimeoutMs
        )),
        finalizeTimeoutMs: video.finalizeTimeoutMs
    };
}
