const KB = 1024;
const MB = 1024 * KB;

const FAST_PATH_IMAGE_LIMITS = Object.freeze({
    'image/jpeg': Math.round(1.8 * MB),
    'image/jpg': Math.round(1.8 * MB),
    'image/webp': Math.round(1.8 * MB),
    'image/png': Math.round(0.9 * MB)
});

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
