export const GOOGLE_LOGIN_PENDING_STATE_KEY = 'habitschoolPendingGoogleLogin';
export const GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY = 'habitschoolPendingGoogleLoginPersistent';
export const GOOGLE_LOGIN_MODE_OVERRIDE_KEY = 'habitschoolGoogleLoginModeOverride';
const GOOGLE_LOGIN_PENDING_MAX_AGE_MS = 10 * 60 * 1000;
export const GOOGLE_REDIRECT_RECOVERY_GRACE_MS = 20 * 1000;
export const PENDING_SIGNUP_ONBOARDING_MAX_AGE_MS = 30 * 60 * 1000;
export const WELCOME_BONUS_FEATURE_START_MS = Date.parse('2026-03-28T00:00:00+09:00');

export function normalizeGoogleLoginMode(mode = '') {
    return mode === 'redirect' || mode === 'popup' ? mode : '';
}

export function resolveGoogleLoginMode({ userAgent = '', isStandalone = false, overrideMode = '' } = {}) {
    const normalizedOverride = normalizeGoogleLoginMode(overrideMode);
    if (normalizedOverride) return normalizedOverride;

    const ua = String(userAgent || '').trim();
    if (/SamsungBrowser/i.test(ua) && isStandalone === true) {
        return 'redirect';
    }

    return 'popup';
}

export function shouldUseGoogleRedirectLogin(options = {}) {
    return resolveGoogleLoginMode(options) === 'redirect';
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

export function shouldKeepPendingGoogleRedirectRecovery(pendingState = null, now = Date.now()) {
    return getPendingGoogleRedirectRecoveryRemainingMs(pendingState, now) > 0;
}

export function getPendingGoogleRedirectRecoveryRemainingMs(pendingState = null, now = Date.now()) {
    if (!pendingState || pendingState.mode !== 'redirect') return 0;
    const createdAt = Number(pendingState.createdAt || 0);
    if (!createdAt) return 0;
    const elapsedMs = (Number(now) || Date.now()) - createdAt;
    return Math.max(0, GOOGLE_REDIRECT_RECOVERY_GRACE_MS - Math.max(elapsedMs, 0));
}

export function resolvePendingGoogleLoginState({ sessionValue = null, persistentValue = null, now = Date.now() } = {}) {
    const sessionState = parsePendingGoogleLoginState(sessionValue, now);
    if (sessionState) {
        return { state: sessionState, source: 'session' };
    }

    const persistentState = parsePendingGoogleLoginState(persistentValue, now);
    if (persistentState) {
        return { state: persistentState, source: 'persistent' };
    }

    return { state: null, source: '' };
}

export function createPendingSignupOnboardingState(uid = '', now = Date.now()) {
    const normalizedUid = String(uid || '').trim();
    const createdAt = Number(now) || Date.now();
    if (!normalizedUid || createdAt <= 0) return null;
    return { uid: normalizedUid, createdAt };
}

export function parsePendingSignupOnboardingState(rawValue, now = Date.now()) {
    if (!rawValue) return null;
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        const uid = String(parsed?.uid || '').trim();
        const createdAt = Number(parsed?.createdAt || 0);
        if (!uid || !createdAt) return null;
        if ((Number(now) || Date.now()) - createdAt > PENDING_SIGNUP_ONBOARDING_MAX_AGE_MS) return null;
        return { uid, createdAt };
    } catch (_) {
        return null;
    }
}

function toTimestampMs(value) {
    if (!value) return NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value?.milliseconds === 'number') return value.milliseconds;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return parsed.getTime();
    }
    return NaN;
}

export function isNewUserCredential(result = null) {
    if (!result || typeof result !== 'object') return false;
    if (typeof result?.additionalUserInfo?.isNewUser === 'boolean') {
        return result.additionalUserInfo.isNewUser;
    }
    if (typeof result?._tokenResponse?.isNewUser === 'boolean') {
        return result._tokenResponse.isNewUser;
    }
    return false;
}

export function shouldShowSignupOnboarding({ userId = '', userData = {}, pendingState = null, now = Date.now() } = {}) {
    const normalizedUserId = String(userId || '').trim();
    if (pendingState?.uid && pendingState.uid === normalizedUserId) {
        return true;
    }
    if (userData?.welcomeBonusGiven || userData?.onboardingComplete) {
        return false;
    }
    const createdAtMs = toTimestampMs(userData?.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < WELCOME_BONUS_FEATURE_START_MS) {
        return false;
    }
    return ((Number(now) || Date.now()) - createdAtMs) <= PENDING_SIGNUP_ONBOARDING_MAX_AGE_MS;
}

export function shouldAutoGrantWelcomeBonus(userData = {}) {
    if (userData?.welcomeBonusGiven || !userData?.onboardingComplete) {
        return false;
    }
    const createdAtMs = toTimestampMs(userData?.createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs >= WELCOME_BONUS_FEATURE_START_MS;
}
