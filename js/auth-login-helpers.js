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

export function isSamsungInternetUserAgent(userAgent = '') {
    const ua = String(userAgent || '').trim();
    return /SamsungBrowser/i.test(ua);
}

export function shouldForceGoogleRedirectLogin({ userAgent = '', isStandalone = false } = {}) {
    return isSamsungInternetUserAgent(userAgent) && !!isStandalone;
}

export function resolveGoogleLoginMode({ userAgent = '', isStandalone = false, overrideMode = '' } = {}) {
    if (shouldForceGoogleRedirectLogin({ userAgent, isStandalone })) return 'redirect';

    const normalizedOverride = normalizeGoogleLoginMode(overrideMode);
    if (normalizedOverride) return normalizedOverride;

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

// 온보딩 모달을 실제로 통과했다는 유일한 증거. 습관을 고른 핸들러에서만 쓴다.
// `onboardingComplete` 는 모달을 못 본 사람에게도 자동으로 찍히므로 증거가 못 된다.
export function hasChosenPrimaryHabit(userData = {}) {
    return !!String(userData?.settings?.primaryHabit || '').trim();
}

// 이미 기록을 시작했나. `lastLogDate` 는 awardPoints 가 쓰지만 2026-09-01 백필
// 이전 회원은 비어 있을 수 있어 `currentStreak` 도 같이 본다. 쉬는 회원의
// currentStreak 는 마지막 값에 멈춰 있으므로 "기록한 적 있음"의 표식이 된다.
export function hasStartedRecording(userData = {}) {
    if (String(userData?.lastLogDate || '').trim()) return true;
    return (Number(userData?.currentStreak) || 0) > 0;
}

// 온보딩을 띄울지는 **휘발성 표식이 아니라 서버에 남는 불일치**로 정한다.
//
// 예전에는 sessionStorage 의 30분짜리 표식이 유일한 근거였다. 리다이렉트 로그인
// (삼성 인터넷·카카오 인앱)·탭 종료·30분 경과로 그 표식을 잃으면 모달이 영영
// 뜨지 않았고, 그 뒤 `onboardingComplete` 가 자동으로 찍히고 웰컴 보너스가
// 지급되면서 게이트가 영구히 닫혔다. 2026-09-07 측정에서 608명 중 390명(64.1%)이
// 모달을 한 번도 보지 못한 채 완료로 찍혀 있었고, 기록이 0인 431명 중 311명이
// 정확히 이 상태였다.
//
// 조건을 "방금 가입했다는 표식이 있나" → "이 회원이 습관을 고른 적이 있나"로
// 바꾼다. 서버 문서에 남는 값이라 한 번 놓쳐도 다음 접속에서 저절로 회복된다.
// (tasks/lessons.md 2026-09-06 — "변화가 아니라 불일치를 조건으로 삼는다")
export function shouldShowSignupOnboarding({ userId = '', userData = {}, pendingState = null } = {}) {
    const normalizedUserId = String(userId || '').trim();

    // 이미 골랐으면 끝난 일이다.
    if (hasChosenPrimaryHabit(userData)) return false;

    // 기록을 시작한 회원은 멈춰 세우지 않는다. 이 모달에는 닫기 버튼이 없어서
    // 쓰고 있는 사람에게 띄우면 길을 막는다. 온보딩은 활성화 장치다.
    if (hasStartedRecording(userData)) return false;

    // 가입 직후 — 사용자 문서가 아직 안 읽혔어도 표식만으로 띄운다.
    if (pendingState?.uid && pendingState.uid === normalizedUserId) return true;

    // 표식이 없어도 습관을 고른 적이 없으면 아직 온보딩을 못 받은 것이다.
    // 웰컴 보너스 수령 여부는 보지 않는다 — 그건 중복지급을 막는 표식이지
    // 온보딩을 막을 이유가 아니었고, 바로 그 오해가 게이트를 닫아 왔다.
    const createdAtMs = toTimestampMs(userData?.createdAt);
    if (!Number.isFinite(createdAtMs) || createdAtMs < WELCOME_BONUS_FEATURE_START_MS) {
        return false;
    }
    return true;
}

export function shouldAutoGrantWelcomeBonus(userData = {}) {
    if (userData?.welcomeBonusGiven || !userData?.onboardingComplete) {
        return false;
    }
    const createdAtMs = toTimestampMs(userData?.createdAt);
    return Number.isFinite(createdAtMs) && createdAtMs >= WELCOME_BONUS_FEATURE_START_MS;
}
