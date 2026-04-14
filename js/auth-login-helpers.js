export const GOOGLE_LOGIN_PENDING_STATE_KEY = 'habitschoolPendingGoogleLogin';
const GOOGLE_LOGIN_PENDING_MAX_AGE_MS = 10 * 60 * 1000;

export function shouldUseGoogleRedirectLogin(userAgent = '') {
    const ua = String(userAgent || '').trim();
    return /SamsungBrowser/i.test(ua);
}

export function createPendingGoogleLoginState(mode = 'popup', now = Date.now()) {
    return {
        mode: mode === 'redirect' ? 'redirect' : 'popup',
        createdAt: Number(now) || Date.now()
    };
}

export function parsePendingGoogleLoginState(rawValue, now = Date.now()) {
    if (!rawValue) return null;
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        const mode = parsed?.mode === 'redirect' ? 'redirect' : parsed?.mode === 'popup' ? 'popup' : '';
        const createdAt = Number(parsed?.createdAt || 0);
        if (!mode || !createdAt) return null;
        if ((Number(now) || Date.now()) - createdAt > GOOGLE_LOGIN_PENDING_MAX_AGE_MS) return null;
        return { mode, createdAt };
    } catch (_) {
        return null;
    }
}
