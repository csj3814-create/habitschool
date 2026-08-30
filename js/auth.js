// 인증 관리 모듈
import { auth, db, functions, FCM_PUBLIC_VAPID_KEY, APP_ORIGIN, IS_LOCAL_ENV, noteFirestoreConnectivityFailure } from './firebase-config.js?v=340';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, getDocFromServer, setDoc, deleteDoc, deleteField, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { showToast } from './ui-helpers.js?v=340';
import { getDatesInfo } from './ui-helpers.js?v=340';
import { escapeHtml } from './security.js?v=340';
import { applyDomTranslations, buildLocalizedUrl, getLocale, isEnglishLocale, t } from './i18n.js?v=340';
import {
    GOOGLE_LOGIN_MODE_OVERRIDE_KEY,
    GOOGLE_LOGIN_PENDING_STATE_KEY,
    GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY,
    createPendingGoogleLoginState,
    createPendingSignupOnboardingState,
    getPendingGoogleRedirectRecoveryRemainingMs,
    isNewUserCredential,
    normalizeGoogleLoginMode,
    resolveGoogleLoginMode,
    resolvePendingGoogleLoginState,
    shouldKeepPendingGoogleRedirectRecovery
} from './auth-login-helpers.js?v=340';
import { getAllowedTabsForMode, getDefaultTabForMode, getAppModeFromPath, getRouteContext, normalizeTabForRoute } from './app-mode.js?v=340';
import { trackProductEvent } from './product-events.js?v=340';
// blockchain-manager는 동적 import한다. 로드 실패가 인증 흐름에 영향을 주지 않게 분리한다.

const BLOCKCHAIN_MANAGER_MODULE_PATH = './blockchain-manager.js?v=340';

const PENDING_REFERRAL_CODE_KEY = 'pendingReferralCode';
const PENDING_SIGNUP_ONBOARDING_KEY = 'habitschoolPendingSignupOnboarding';
const PUSH_TOKEN_SUBCOLLECTION = 'pushTokens';
const PUSH_DEVICE_ID_STORAGE_KEY = 'habitschoolPushDeviceId';
const AUTH_POINT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_LS_KEY = 'dashboardData_v1';
const MEDIA_PICKER_RECOVERY_STORAGE_KEY = 'habitschool-media-picker-recovery-v1';
let _messagingPromise = null;
let _foregroundPushListenerBound = false;
let _pushTokenLinked = false;
let _pushTokenValue = '';
let _ensureReferralCodeCallable = null;
let _googleLoginRecoveryBound = false;
let _pendingGoogleLoginResetTimer = null;
let _mediaPickerSignedOutRecoveryTimer = null;
const GOOGLE_LOGIN_RECOVERY_POLL_MS = 1500;

function setEnglishAuthShellState(state = 'pending') {
    if (!isEnglishLocale()) return;
    const root = document.documentElement;
    const signedIn = state === 'signed-in';
    const signedOut = state === 'signed-out';
    root.classList.toggle('signed-in', signedIn);
    root.classList.toggle('signed-out', signedOut);
    root.classList.toggle('auth-pending', !signedIn && !signedOut);

    // 랜딩은 로그인 여부가 아니라 주소로 정해진다(/en/welcome).
    // /en 은 한글판과 같은 로그인 화면을 띄운다 — 동의 체크박스가 거기 있다.
    const isLanding = root.classList.contains('en-landing');
    const landing = document.getElementById('english-public-page');
    if (landing) landing.hidden = !isLanding;
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = (!isLanding && signedOut) ? 'flex' : 'none';
    applyDomTranslations();
}

function updateEnglishProfilePanel(user, userData = {}) {
    if (!isEnglishLocale()) return;
    const displayName = String(userData.customDisplayName || user?.displayName || user?.email || 'Habit School member').trim();
    const email = String(user?.email || userData.email || '').trim();
    const nameEl = document.getElementById('english-profile-name');
    const emailEl = document.getElementById('english-profile-email');
    const localeEl = document.getElementById('english-profile-locale');
    if (nameEl) nameEl.textContent = displayName || 'Habit School member';
    if (emailEl) emailEl.textContent = email || 'Google account';
    if (localeEl) localeEl.textContent = getLocale() === 'en' ? 'English' : '한국어';
}

window.switchHabitSchoolLocale = function (locale = 'ko') {
    const nextLocale = locale === 'en' ? 'en' : 'ko';
    const tabName = typeof getVisibleAuthTabName === 'function' ? getVisibleAuthTabName() : '';
    window.location.assign(buildLocalizedUrl(nextLocale, tabName));
};

function parseCachedPointNumber(value) {
    const numeric = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(numeric) ? numeric : null;
}

function readCachedSignedInPointBalance(uid = '') {
    const normalizedUid = String(uid || '').trim();
    if (!normalizedUid) return null;

    try {
        const wallet = JSON.parse(localStorage.getItem(`hs_wallet_${normalizedUid}`) || 'null');
        const walletAge = Date.now() - Number(wallet?.ts || 0);
        const walletPoints = parseCachedPointNumber(wallet?.coins);
        if (walletPoints != null && walletAge >= 0 && walletAge < AUTH_POINT_CACHE_TTL_MS) {
            return walletPoints;
        }
    } catch (_) {}

    try {
        const dashboard = JSON.parse(localStorage.getItem(DASHBOARD_LS_KEY) || 'null');
        if (dashboard?.uid === normalizedUid) {
            const dashboardAge = Date.now() - Number(dashboard?.ts || 0);
            const dashboardPoints = parseCachedPointNumber(dashboard?.ud?.coins);
            if (dashboardPoints != null && dashboardAge >= 0 && dashboardAge < AUTH_POINT_CACHE_TTL_MS) {
                return dashboardPoints;
            }
        }
    } catch (_) {}

    return null;
}

function applyCachedSignedInPointBalance(uid = '') {
    const cachedPoints = readCachedSignedInPointBalance(uid);
    if (cachedPoints == null) return null;

    const pointBalanceEl = document.getElementById('point-balance');
    if (pointBalanceEl) pointBalanceEl.innerText = cachedPoints;

    const simpleProfilePointsEl = document.getElementById('simple-profile-points');
    if (simpleProfilePointsEl) simpleProfilePointsEl.textContent = `${Number(cachedPoints || 0).toLocaleString()}P`;

    window.applyCachedPointBalanceFromStorage?.(uid);
    return cachedPoints;
}

function readGoogleLoginModeOverride() {
    try {
        return normalizeGoogleLoginMode(localStorage.getItem(GOOGLE_LOGIN_MODE_OVERRIDE_KEY));
    } catch (_) {
        return '';
    }
}

function persistGoogleLoginModeOverride(mode = '') {
    const normalizedMode = normalizeGoogleLoginMode(mode);
    try {
        if (normalizedMode) {
            localStorage.setItem(GOOGLE_LOGIN_MODE_OVERRIDE_KEY, normalizedMode);
        } else {
            localStorage.removeItem(GOOGLE_LOGIN_MODE_OVERRIDE_KEY);
        }
    } catch (_) {}
}

function shouldKeepGoogleRedirectAsPrimary() {
    return resolveGoogleLoginMode({
        userAgent: navigator.userAgent || navigator.vendor || '',
        isStandalone: isStandalonePushMode(),
        overrideMode: ''
    }) === 'redirect';
}

function rememberPopupLoginFallback() {
    if (shouldKeepGoogleRedirectAsPrimary()) {
        persistGoogleLoginModeOverride('');
        return;
    }
    persistGoogleLoginModeOverride('popup');
}

function getPreferredGoogleLoginMode() {
    return resolveGoogleLoginMode({
        userAgent: navigator.userAgent || navigator.vendor || '',
        isStandalone: isStandalonePushMode(),
        overrideMode: readGoogleLoginModeOverride()
    });
}

function getEnsureReferralCodeCallable() {
    if (!_ensureReferralCodeCallable) {
        _ensureReferralCodeCallable = httpsCallable(functions, 'ensureReferralCode');
    }
    return _ensureReferralCodeCallable;
}

function rememberPendingSignupOnboarding(user) {
    try {
        const pendingState = createPendingSignupOnboardingState(user?.uid);
        if (!pendingState) return;
        sessionStorage.setItem(PENDING_SIGNUP_ONBOARDING_KEY, JSON.stringify(pendingState));
    } catch (_) {}
}

function clearPendingSignupOnboarding() {
    try {
        sessionStorage.removeItem(PENDING_SIGNUP_ONBOARDING_KEY);
    } catch (_) {}
}

function persistPendingGoogleLoginState(mode = 'popup') {
    const serializedState = JSON.stringify(createPendingGoogleLoginState(mode));
    try {
        sessionStorage.setItem(GOOGLE_LOGIN_PENDING_STATE_KEY, serializedState);
    } catch (_) {}
    try {
        if (mode === 'redirect') {
            localStorage.setItem(GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY, serializedState);
        } else {
            localStorage.removeItem(GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY);
        }
    } catch (_) {}
}

function readPendingGoogleLoginStateWithSource() {
    let sessionValue = null;
    let persistentValue = null;
    try {
        sessionValue = sessionStorage.getItem(GOOGLE_LOGIN_PENDING_STATE_KEY);
    } catch (_) {
        sessionValue = null;
    }
    try {
        persistentValue = localStorage.getItem(GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY);
    } catch (_) {
        persistentValue = null;
    }

    const resolved = resolvePendingGoogleLoginState({ sessionValue, persistentValue });
    if (resolved.state && resolved.source === 'persistent') {
        try {
            sessionStorage.setItem(GOOGLE_LOGIN_PENDING_STATE_KEY, JSON.stringify(resolved.state));
        } catch (_) {}
    }
    return resolved;
}

function readPendingGoogleLoginState() {
    return readPendingGoogleLoginStateWithSource().state;
}

function clearPendingGoogleLoginState() {
    try {
        sessionStorage.removeItem(GOOGLE_LOGIN_PENDING_STATE_KEY);
    } catch (_) {}
    try {
        localStorage.removeItem(GOOGLE_LOGIN_PENDING_PERSISTENT_STATE_KEY);
    } catch (_) {}
}

function setGoogleLoginPendingUi(loginBtn, isPending) {
    if (!loginBtn) return;
    if (!loginBtn.dataset.originalHtml) {
        loginBtn.dataset.originalHtml = loginBtn.innerHTML;
    }

    if (isPending) {
        loginBtn.disabled = true;
        loginBtn.setAttribute('aria-busy', 'true');
        loginBtn.innerHTML = '로그인 확인 중...';
        return;
    }

    loginBtn.removeAttribute('aria-busy');
    if (loginBtn.dataset.originalHtml) {
        loginBtn.innerHTML = loginBtn.dataset.originalHtml;
    }
    // 대기 상태가 풀렸다고 무조건 열면 안 된다. 필수 동의를 안 했으면 잠긴 채로
    // 둬야 하므로, 열고 닫는 판단은 동의 상태에 맡긴다.
    syncSignupConsentState();
}

function clearPendingGoogleLoginResetTimer() {
    if (_pendingGoogleLoginResetTimer) {
        clearTimeout(_pendingGoogleLoginResetTimer);
        _pendingGoogleLoginResetTimer = null;
    }
}

function schedulePendingGoogleLoginReset(loginBtn, delayMs = GOOGLE_LOGIN_RECOVERY_POLL_MS) {
    clearPendingGoogleLoginResetTimer();
    const pendingState = readPendingGoogleLoginState();
    const remainingMs = getPendingGoogleRedirectRecoveryRemainingMs(pendingState);
    if (auth.currentUser || remainingMs <= 0) {
        if (!auth.currentUser && pendingState?.mode === 'redirect') {
            rememberPopupLoginFallback();
        }
        clearPendingGoogleLoginState();
        window._isPopupLogin = false;
        setGoogleLoginPendingUi(loginBtn, false);
        return;
    }

    _pendingGoogleLoginResetTimer = setTimeout(() => {
        _pendingGoogleLoginResetTimer = null;
        if (auth.currentUser) {
            clearPendingGoogleLoginState();
            window._isPopupLogin = false;
            setGoogleLoginPendingUi(loginBtn, false);
            return;
        }

        const latestPendingState = readPendingGoogleLoginState();
        if (shouldKeepPendingGoogleRedirectRecovery(latestPendingState)) {
            schedulePendingGoogleLoginReset(loginBtn, delayMs);
            return;
        }

        if (latestPendingState?.mode === 'redirect') {
            rememberPopupLoginFallback();
        }
        clearPendingGoogleLoginState();
        window._isPopupLogin = false;
        setGoogleLoginPendingUi(loginBtn, false);
    }, Math.max(250, Math.min(delayMs, remainingMs)));
}

function generatePushDeviceId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `push-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getPushDeviceId() {
    try {
        let deviceId = String(localStorage.getItem(PUSH_DEVICE_ID_STORAGE_KEY) || '').trim();
        if (!deviceId) {
            deviceId = generatePushDeviceId();
            localStorage.setItem(PUSH_DEVICE_ID_STORAGE_KEY, deviceId);
        }
        return deviceId;
    } catch (_) {
        return generatePushDeviceId();
    }
}

function getPushTokenDocRef(userId, deviceId = getPushDeviceId()) {
    return doc(db, 'users', userId, PUSH_TOKEN_SUBCOLLECTION, deviceId);
}

function getPushPlatformLabel() {
    if (isIOSPushDevice()) return 'ios';
    if (isAndroidPushDevice()) return 'android';
    return 'desktop';
}

function getPushBrowserLabel() {
    const ua = navigator.userAgent || navigator.vendor || '';
    if (/SamsungBrowser/i.test(ua)) return 'samsung-internet';
    if (/Whale/i.test(ua)) return 'whale';
    if (/EdgA|Edg\//i.test(ua)) return 'edge';
    if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
    if (/CriOS|Chrome/i.test(ua)) return 'chrome';
    if (/Safari/i.test(ua)) return 'safari';
    return 'unknown';
}

function getPushDisplayModeLabel() {
    return isStandalonePushMode() ? 'standalone' : 'browser';
}

async function hydratePushTokenLinkState(user, legacyUserData = null) {
    if (!user) {
        _pushTokenLinked = false;
        _pushTokenValue = '';
        return { linked: false, token: '' };
    }

    try {
        const tokenDoc = await getDoc(getPushTokenDocRef(user.uid));
        const tokenData = tokenDoc.data() || {};
        const storedToken = typeof tokenData.token === 'string' ? tokenData.token.trim() : '';
        if (tokenDoc.exists() && tokenData.enabled !== false && storedToken) {
            _pushTokenLinked = true;
            _pushTokenValue = storedToken;
            return { linked: true, token: storedToken };
        }
    } catch (error) {
        const connectivityIssue = noteFirestoreConnectivityFailure(error, 'hydratePushTokenLinkState');
        if (connectivityIssue) {
            console.info('[FCM] token link state deferred while Firestore reconnects:', error.message);
        } else {
            console.warn('[FCM] 현재 기기 토큰 상태 확인 실패:', error.message);
        }
    }

    _pushTokenLinked = false;
    _pushTokenValue = '';
    return { linked: false, token: '' };
}

function normalizeInviteRefCode(rawCode) {
    const normalized = String(rawCode || '').trim().toUpperCase();
    return /^[A-Z0-9]{6}$/.test(normalized) ? normalized : '';
}

function getInviteRefFromUrl() {
    return normalizeInviteRefCode(new URLSearchParams(window.location.search).get('ref'));
}

function persistPendingInviteRef(code) {
    const normalized = normalizeInviteRefCode(code);
    if (!normalized) return '';
    localStorage.setItem(PENDING_REFERRAL_CODE_KEY, normalized);
    return normalized;
}

async function resolveLatestUserDocData(userRef, initialSnap) {
    let resolvedSnap = initialSnap;
    let resolvedData = initialSnap.exists() ? (initialSnap.data() || {}) : {};
    const cachedPoints = readCachedSignedInPointBalance(userRef?.id);
    const needsServerRefresh = !initialSnap.exists()
        || resolvedData.coins == null
        || (initialSnap.metadata?.fromCache && Number(resolvedData.coins || 0) === 0 && cachedPoints != null && cachedPoints > 0)
        || !normalizeInviteRefCode(resolvedData.referralCode);

    if (needsServerRefresh) {
        try {
            const serverSnap = await getDocFromServer(userRef);
            if (serverSnap.exists()) {
                resolvedSnap = serverSnap;
                resolvedData = serverSnap.data() || {};
            }
        } catch (error) {
            const connectivityIssue = noteFirestoreConnectivityFailure(error, 'resolveLatestUserDocData');
            if (connectivityIssue) {
                console.info('[auth] latest user document refresh deferred while Firestore reconnects:', error.message);
            } else {
                console.warn('사용자 최신 정보 서버 조회 실패:', error.message);
            }
        }
    }

    return { snap: resolvedSnap, data: resolvedData };
}

async function ensureSignedInUserReferralCode(userData = {}) {
    const existingCode = normalizeInviteRefCode(userData?.referralCode);
    if (existingCode) return existingCode;
    try {
        const result = await getEnsureReferralCodeCallable()({});
        return normalizeInviteRefCode(result?.data?.referralCode);
    } catch (error) {
        console.warn('초대 코드 보장 실패:', error?.message || error);
        return '';
    }
}

async function applySignedInUserUi(user, userData = {}) {
    const nextDisplayName = String(userData.customDisplayName || user.displayName || '사용자').trim() || '사용자';
    window._userDisplayName = nextDisplayName;

    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) {
        greetingEl.innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(nextDisplayName)}`;
    }

    const nicknameInput = document.getElementById('profile-nickname');
    if (nicknameInput) nicknameInput.value = nextDisplayName;

    window._blockedUsers = Array.isArray(userData.blockedUsers) ? userData.blockedUsers : [];
    window.applyDietProgramUserData?.(userData);

    const pointBalanceEl = document.getElementById('point-balance');
    const cachedPoints = readCachedSignedInPointBalance(user.uid);
    const incomingPoints = parseCachedPointNumber(userData.coins);
    const resolvedPoints = (userData.__preferCachedPoints && cachedPoints != null)
        ? cachedPoints
        : (incomingPoints ?? cachedPoints);
    if (userData.__preferCachedPoints && resolvedPoints != null) {
        userData.coins = resolvedPoints;
    }
    if (pointBalanceEl && resolvedPoints != null) {
        pointBalanceEl.innerText = resolvedPoints;
    }

    const referralCode = normalizeInviteRefCode(userData.referralCode);
    // 공유 카드가 프로필 화면을 그리기 전에도 초대 코드를 실을 수 있게 전역에 둔다.
    window.__HABITSCHOOL_REFERRAL_CODE = referralCode;
    const referralUrl = referralCode ? `${APP_ORIGIN}?ref=${referralCode}` : '';
    const profileLinkBox = document.getElementById('profile-invite-link-box');
    const profileLinkEl = document.getElementById('profile-invite-link');
    const profileCodeEl = document.getElementById('profile-invite-code');
    if (profileLinkBox) profileLinkBox.style.display = referralUrl ? 'block' : 'none';
    if (profileLinkEl) profileLinkEl.value = referralUrl;
    if (profileCodeEl) profileCodeEl.textContent = referralCode || '-';

    if (window.refreshSimpleProfilePanel) {
        await window.refreshSimpleProfilePanel(userData).catch(error => {
            console.warn('간편 프로필 후속 갱신 실패:', error.message);
        });
    }
}

function readPendingInviteRef() {
    return normalizeInviteRefCode(localStorage.getItem(PENDING_REFERRAL_CODE_KEY));
}

function clearPendingInviteRef() {
    localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
}

function clearInviteRefFromUrl() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('ref') && !url.searchParams.has('card')) return;
    url.searchParams.delete('ref');
    url.searchParams.delete('card');
    window.history.replaceState({}, '', url.toString());
}

function normalizeCallableErrorCode(rawCode) {
    return String(rawCode || '').trim().toLowerCase();
}

function shouldClearInviteRefError(rawCode) {
    const code = normalizeCallableErrorCode(rawCode);
    return [
        'functions/not-found',
        'functions/invalid-argument',
        'functions/already-exists',
        'functions/failed-precondition',
        'functions/permission-denied'
    ].includes(code);
}

function getInviteLinkErrorMessage(rawCode) {
    const code = normalizeCallableErrorCode(rawCode);
    if (code === 'functions/not-found') return '유효한 초대 링크를 찾지 못했어요.';
    if (code === 'functions/invalid-argument') return '내 링크이거나 사용할 수 없는 초대 링크예요.';
    if (code === 'functions/already-exists') return '이미 이 초대 링크를 사용했어요.';
    if (code === 'functions/failed-precondition') return '이미 처리된 친구 연결이에요.';
    if (code === 'functions/permission-denied') return '이 초대 링크를 처리할 권한이 없어요.';
    return '초대 링크 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.';
}

async function maybePromptExistingMemberInviteFriendship(code) {
    const fn = httpsCallable(functions, 'acceptInviteLinkFriendship');

    try {
        const preview = await fn({ referralCode: code, previewOnly: true });
        const previewData = preview.data || {};
        const inviterName = previewData.inviterName || '친구';

        if (previewData.status === 'self') {
            showToast('내 초대 링크예요. 친구에게 보내보세요.');
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return false;
        }

        if (previewData.status === 'already_active') {
            showToast('이미 친구로 연결되어 있어요.');
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return true;
        }

        const confirmMessage = previewData.status === 'pending_to_active'
            ? `${inviterName}님과 바로 친구로 연결할까요?\n기존 요청이 있으면 바로 연결로 바뀝니다.`
            : `${inviterName}님과 친구로 연결할까요?\n초대 링크로 바로 친구 연결이 완료됩니다.`;

        const confirmed = window.confirm(confirmMessage);
        if (!confirmed) {
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return false;
        }

        const result = await fn({ referralCode: code });
        const resultData = result.data || {};
        showToast(resultData.status === 'already_active'
            ? '이미 친구로 연결되어 있어요.'
            : `${inviterName}님과 친구 연결이 완료됐어요.`);

        clearPendingInviteRef();
        clearInviteRefFromUrl();

        try {
            if (window.loadMyFriendships) await window.loadMyFriendships(true);
            if (window.loadGalleryData) await window.loadGalleryData(true);
            if (window.updateAssetDisplay) window.updateAssetDisplay();
            if (window.renderDashboard) window.renderDashboard();
        } catch (_) {}

        return true;
    } catch (error) {
        console.error('existing member invite-link error:', error);
        showToast(getInviteLinkErrorMessage(error.code || error.message));
        if (shouldClearInviteRefError(error.code || error.message)) {
            clearPendingInviteRef();
            clearInviteRefFromUrl();
        }
        return false;
    }
}

async function maybeHandleInviteLinkAfterAuth(user, userData = {}, options = {}) {
    const code = readPendingInviteRef();
    if (!code) return false;

    const ownCode = normalizeInviteRefCode(userData?.referralCode);
    if (ownCode && ownCode === code) {
        showToast('내 초대 링크예요. 친구에게 보내보세요.');
        clearPendingInviteRef();
        clearInviteRefFromUrl();
        return false;
    }

    const isNewUser = options.isNewUser === true;
    if (isNewUser && !userData?.referredBy) {
        try {
            const processReferral = httpsCallable(functions, 'processReferralSignup');
            const result = await processReferral({ code });
            const bonus = Number(result.data?.bonus || 0);
            showToast(bonus > 0
                ? `초대 보너스 ${bonus}P와 친구 연결이 완료됐어요.`
                : '초대 링크가 적용되고 친구 연결이 완료됐어요.');
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            try {
                if (window.loadMyFriendships) await window.loadMyFriendships(true);
                if (window.loadGalleryData) await window.loadGalleryData(true);
                if (window.updateAssetDisplay) window.updateAssetDisplay();
                if (window.renderDashboard) window.renderDashboard();
            } catch (_) {}
            return true;
        } catch (error) {
            console.error('new member invite-link error:', error);
            showToast(getInviteLinkErrorMessage(error.code || error.message));
            if (shouldClearInviteRefError(error.code || error.message)) {
                clearPendingInviteRef();
                clearInviteRefFromUrl();
            }
            return false;
        }
    }

    return maybePromptExistingMemberInviteFriendship(code);
}

// 페이지 로드 시 ref 파라미터 저장(초대 링크)
const _refCode = getInviteRefFromUrl();
if (_refCode) {
    persistPendingInviteRef(_refCode);
}

// 초대 링크로 들어왔는지는 URL을 정리한 뒤에도 알아야 하므로 따로 기억한다.
const _arrivedViaInviteLink = !!_refCode;
let _inviteLandingTracked = false;

function trackInviteLinkLanding(isSignedIn) {
    if (!_arrivedViaInviteLink || _inviteLandingTracked) return;
    _inviteLandingTracked = true;
    // status로 회원/비회원 유입을 나눈다. 자유 텍스트나 코드 자체는 보내지 않는다.
    trackProductEvent('invite_link_landing', {
        status: isSignedIn ? 'success' : 'empty',
        entry_point: 'invite_link',
        locale: isEnglishLocale() ? 'en' : 'ko',
        app_mode: getAppModeFromPath(window.location.pathname) === 'simple' ? 'simple' : 'default'
    });
}

// 초대 링크로 들어온 비로그인 방문자에게만 안내를 띄운다. 이미 회원이면
// 기존 친구 연결 흐름이 처리하므로 배너는 필요 없다.
function applyInviteLandingBanner(isSignedIn) {
    const banner = document.getElementById('invite-landing-banner');
    if (!banner) return;
    const shouldShow = _arrivedViaInviteLink && !isSignedIn;
    banner.hidden = !shouldShow;
    if (shouldShow) showInvitedCardOnLanding();
}

// 카톡에서 카드를 보고 눌러 들어왔는데 로그인 화면만 덩그러니 나오면, 방금 본
// 그 카드와의 연결이 끊긴다. 미리보기 함수가 주소에 실어 준 토큰으로 같은
// 이미지를 한 번 더 보여 준다. 토큰은 방문자가 이미 들고 있던 값이다.
let _invitedCardRequested = false;

async function showInvitedCardOnLanding() {
    if (_invitedCardRequested) return;
    const cardEl = document.getElementById('invite-landing-card');
    if (!cardEl) return;

    const token = String(new URLSearchParams(window.location.search).get('card') || '').trim();
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return;
    _invitedCardRequested = true;

    try {
        const fn = httpsCallable(functions, 'getSharedCardImage');
        const result = await fn({ token });
        const imageUrl = String(result?.data?.imageUrl || '').trim();
        if (!imageUrl) return;
        // 이미지가 실제로 뜨는 걸 확인한 뒤에 보인다. 깨진 아이콘이 뜨느니 없는 게 낫다.
        cardEl.onload = () => { cardEl.hidden = false; };
        cardEl.onerror = () => { cardEl.hidden = true; };
        cardEl.src = imageUrl;
    } catch (error) {
        console.warn('초대 카드 미리보기 로드 실패:', error?.message || error);
    }
}

const CHATBOT_CONNECT_PENDING_KEY = 'pendingChatbotConnectToken';
const _chatbotConnectTokenFromUrl = String(new URLSearchParams(window.location.search).get('chatbotConnectToken') || '').trim();
if (_chatbotConnectTokenFromUrl) {
    localStorage.setItem(CHATBOT_CONNECT_PENDING_KEY, _chatbotConnectTokenFromUrl);
}

// WebView(인앱 브라우저) 감지
function isWebView() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // 주요 인앱 브라우저 패턴
    const webviewPatterns = [
        /KAKAOTALK/i,
        /NAVER\(/i,           // 네이버 앱 패턴
        /NAVER/i,             // 네이버 관련 일반 패턴
        /NaverMatome/i,
        /FBAN|FBAV/i,         // Facebook
        /FB_IAB/i,            // Facebook In-App Browser
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,          // 다음/카카오 계열
        /everytimeApp/i,
        /BAND\//i,            // 네이버 밴드
        /Whale\//i,           // 네이버 웨일 또는 WebView
        /\bwv\b/i,            // Android WebView 플래그
        /;\s*wv\)/i,          // Android WebView 보조 패턴
        /WebView/i,
        /GSA\//i,             // Google Search App
        /\[FB/i,              // Facebook bracket 패턴
    ];

    // Safari가 아닌 iOS 환경은 WebView 가능성이 높음
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    if (isIOS && !isSafari && !/Chrome|CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua)) return true;

    return webviewPatterns.some(pattern => pattern.test(ua));
}

// 외부 브라우저로 열기(Android intent, iOS Safari fallback)
function openInExternalBrowser() {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent || '';

    if (/android/i.test(ua)) {
        // Android: Chrome intent로 열기
        window.location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        // iOS: Safari로 열기 시도
        window.location.href = currentUrl;
    } else {
        window.open(currentUrl, '_system');
    }
}

// 구글 로그인
export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');

    window.startEnglishGoogleSignIn = function () {
        if (window._isPopupLogin) return;
        loginBtn?.click();
    };

    if (!loginBtn) {
        console.error('로그인 버튼을 찾을 수 없습니다.');
        return;
    }

    // WebView 감지 시 경고 표시
    if (isWebView()) {
        loginBtn.style.display = 'none';
        if (webviewWarning) {
            webviewWarning.style.display = 'block';
            const openBrowserBtn = document.getElementById('openExternalBrowser');
            if (openBrowserBtn) {
                openBrowserBtn.addEventListener('click', openInExternalBrowser);
            }
            const copyLinkBtn = document.getElementById('copyLinkBtn');
            if (copyLinkBtn) {
                copyLinkBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                        showToast('링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    }).catch(() => {
                        // clipboard API ?ㅽ뙣 ???대갚
                        const textArea = document.createElement('textarea');
                        textArea.value = window.location.href;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showToast('링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    });
                });
            }
        }
        return;
    }

    if (shouldDeferLoggedOutShellForMediaPicker()) {
        window._isPopupLogin = true;
        applyMediaPickerAuthRecoveryShellUi(loginBtn);
    }

    bindPendingGoogleLoginRecovery();
    if (readPendingGoogleLoginState()) {
        setGoogleLoginPendingUi(loginBtn, true);
    }
    handleGoogleRedirectLoginResult(loginBtn).catch(() => {});

    loginBtn.addEventListener('click', () => {
        if (window._isPopupLogin) {
            return;
        }
        window._isPopupLogin = true;
        // 리디렉트로 페이지가 날아가기 전에 선택을 붙잡아 둔다.
        persistConsentSelectionSnapshot();
        setGoogleLoginPendingUi(loginBtn, true);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const loginMode = getPreferredGoogleLoginMode();
        const useRedirectLogin = loginMode === 'redirect';
        persistPendingGoogleLoginState(loginMode);

        if (useRedirectLogin) {
            signInWithRedirect(auth, provider).catch(error => {
                console.error('리디렉트 로그인 오류:', error.code, error.message, error);
                clearPendingGoogleLoginState();
                clearPendingGoogleLoginResetTimer();
                window._isPopupLogin = false;
                setGoogleLoginPendingUi(loginBtn, false);
                window.handleGuestAuthenticationFailure?.();

                let errorMsg = '로그인에 실패했습니다.';
                if (error.code === 'auth/network-request-failed') {
                    errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
                } else if (error.code === 'auth/unauthorized-domain') {
                    errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
                }
                showToast(`오류: ${errorMsg} [${error.code || 'unknown'}]`);
            });
            return;
        }

        signInWithPopup(auth, provider).then((result) => {
            bridgePopupLoginSuccess(result?.user || null);
            if (isNewUserCredential(result)) {
                rememberPendingSignupOnboarding(result.user);
            } else {
                clearPendingSignupOnboarding();
            }
        }).catch(error => {
            console.error('로그인 오류:', error.code, error.message, error);

            if (error.message && (error.message.includes('disallowed_useragent') || error.message.includes('web-storage-unsupported'))) {
                clearPendingGoogleLoginState();
                clearPendingGoogleLoginResetTimer();
                setGoogleLoginPendingUi(loginBtn, false);
                showWebViewWarning();
                return;
            }

            if (error.code === 'auth/popup-closed-by-user') {
                clearPendingGoogleLoginState();
                clearPendingGoogleLoginResetTimer();
                window._isPopupLogin = false;
                setGoogleLoginPendingUi(loginBtn, false);
                window.handleGuestAuthenticationFailure?.();
                return;
            }
            clearPendingGoogleLoginState();
            clearPendingGoogleLoginResetTimer();
            window._isPopupLogin = false;
            setGoogleLoginPendingUi(loginBtn, false);
            window.handleGuestAuthenticationFailure?.();

            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/popup-blocked') {
                errorMsg = '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
            }
            showToast(`오류: ${errorMsg} [${error.code || 'unknown'}]`);
        });
    });
}

// WebView 寃쎄퀬 UI ?쒖떆 (?대갚??
function showWebViewWarning() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');
    if (loginBtn) loginBtn.style.display = 'none';
    if (webviewWarning) {
        webviewWarning.style.display = 'block';
        const openBrowserBtn = document.getElementById('openExternalBrowser');
        if (openBrowserBtn) {
            openBrowserBtn.addEventListener('click', openInExternalBrowser);
        }
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    showToast('링크가 복사되었습니다.');
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = window.location.href;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('링크가 복사되었습니다.');
                });
            });
        }
    }
}

function applySignedInShellUi(user) {
    setEnglishAuthShellState('signed-in');
    setMediaPickerAuthRecoveryClass(false);
    const loginBtn = document.getElementById('loginBtn');
    setGoogleLoginPendingUi(loginBtn, false);

    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = 'none';

    const pointBadgeUi = document.getElementById('point-badge-ui');
    if (pointBadgeUi) pointBadgeUi.style.display = 'block';

    const dateUi = document.getElementById('date-ui');
    if (dateUi) dateUi.style.display = 'flex';
    // 기기 시간대가 한국이 아니면 날짜 옆에 KST 기준을 표시한다.
    if (typeof window.updateKstBasisBadge === 'function') window.updateKstBasisBadge();

    window._wasLoggedIn = true;
    window._userDisplayName = user?.displayName || '사용자';

    const greetingEl = document.getElementById('user-greeting');
    if (greetingEl) {
        greetingEl.innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(window._userDisplayName)}`;
    }
}

function bridgePopupLoginSuccess(user) {
    applySignedInShellUi(user);

    let attempts = 0;
    const maxAttempts = 10;
    const tick = () => {
        if (auth.currentUser) return;
        attempts += 1;
        applySignedInShellUi(user);
        if (attempts < maxAttempts) {
            setTimeout(tick, 120);
        }
    };

    setTimeout(tick, 120);
}

function recoverPendingGoogleLoginUi() {
    const pendingState = readPendingGoogleLoginState();
    if (!pendingState || !auth.currentUser) return false;
    bridgePopupLoginSuccess(auth.currentUser);
    return true;
}

function bindPendingGoogleLoginRecovery() {
    if (_googleLoginRecoveryBound) return;
    _googleLoginRecoveryBound = true;

    const recover = () => {
        recoverPendingGoogleLoginUi();
    };

    window.addEventListener('pageshow', recover);
    window.addEventListener('focus', recover);
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) recover();
    });
}

async function handleGoogleRedirectLoginResult(loginBtn) {
    const pendingState = readPendingGoogleLoginState();
    try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
            clearPendingGoogleLoginResetTimer();
            bridgePopupLoginSuccess(result.user);
            if (isNewUserCredential(result)) {
                rememberPendingSignupOnboarding(result.user);
            } else {
                clearPendingSignupOnboarding();
            }
            clearPendingGoogleLoginState();
            return;
        }

        if (pendingState?.mode === 'redirect') {
            if (getPreferredGoogleLoginMode() !== 'redirect') {
                rememberPopupLoginFallback();
                clearPendingGoogleLoginState();
                clearPendingGoogleLoginResetTimer();
                window._isPopupLogin = false;
                setGoogleLoginPendingUi(loginBtn, false);
                return;
            }
            schedulePendingGoogleLoginReset(loginBtn);
            return;
        }
    } catch (error) {
        console.error('리디렉트 로그인 오류:', error.code, error.message, error);
        if (pendingState?.mode === 'redirect') {
            clearPendingGoogleLoginResetTimer();
            rememberPopupLoginFallback();
            clearPendingGoogleLoginState();
            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
            }
            window._isPopupLogin = false;
            setGoogleLoginPendingUi(loginBtn, false);
            showToast(`오류: ${errorMsg} [${error.code || 'unknown'}]`);
        }
    } finally {
        if (!auth.currentUser && pendingState?.mode !== 'redirect') {
            window._isPopupLogin = false;
            setGoogleLoginPendingUi(loginBtn, false);
        }
        if (pendingState && (!shouldKeepPendingGoogleRedirectRecovery(pendingState) || auth.currentUser)) {
            if (!auth.currentUser && pendingState.mode === 'redirect') {
                rememberPopupLoginFallback();
            }
            clearPendingGoogleLoginState();
        }
    }
}

function getVisibleAuthTabName() {
    const appMode = getAppModeFromPath(window.location.pathname);
    const validTabs = getAllowedTabsForMode(appMode);
    return validTabs.find(tabName => {
        const el = document.getElementById(tabName);
        return el && (el.style.display === 'block' || el.classList.contains('active'));
    }) || getDefaultTabForMode(appMode);
}

function scheduleVisibleTabBackgroundRefresh(user, initialDailyLoadPromise = Promise.resolve()) {
    const schedule = (delayMs, task) => {
        Promise.resolve(initialDailyLoadPromise).finally(() => {
            setTimeout(() => {
                if (auth.currentUser?.uid !== user.uid) return;
                task();
            }, delayMs);
        });
    };

    schedule(1200, () => {
        if (getVisibleAuthTabName() === 'gallery') {
            window.loadGalleryData?.();
        }
    });

    schedule(1800, () => {
        if (getVisibleAuthTabName() === 'assets') {
            window.updateAssetDisplay?.();
        }
    });
}

function getMediaPickerAuthRecoveryRemainingMs() {
    const storageRemaining = getStoredMediaPickerAuthRecoveryRemainingMs();
    try {
        const appCoreRemaining = Number(window.getHabitschoolMediaPickerRecoveryRemainingMs?.() || 0);
        return Math.max(0, appCoreRemaining, storageRemaining);
    } catch (_) {
        return storageRemaining;
    }
}

function shouldDeferLoggedOutShellForMediaPicker() {
    return getMediaPickerAuthRecoveryRemainingMs() > 0;
}

function getStoredMediaPickerAuthRecoveryRemainingMs(now = Date.now()) {
    const safeNow = Number(now) || Date.now();
    const stores = [];
    try {
        if (window.sessionStorage) stores.push(window.sessionStorage);
    } catch (_) {}
    try {
        if (window.localStorage) stores.push(window.localStorage);
    } catch (_) {}

    let remainingMs = 0;
    for (const store of stores) {
        try {
            const raw = store.getItem(MEDIA_PICKER_RECOVERY_STORAGE_KEY);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const expiresAt = Number(parsed?.expiresAt || 0);
            if (!Number.isFinite(expiresAt) || expiresAt <= safeNow) {
                store.removeItem(MEDIA_PICKER_RECOVERY_STORAGE_KEY);
                continue;
            }
            remainingMs = Math.max(remainingMs, expiresAt - safeNow);
        } catch (_) {}
    }
    return remainingMs;
}

function setMediaPickerAuthRecoveryClass(isActive) {
    try {
        document.documentElement.classList.toggle('media-picker-auth-recovery', !!isActive);
    } catch (_) {}
}

function applyMediaPickerAuthRecoveryShellUi(loginBtn) {
    setMediaPickerAuthRecoveryClass(true);
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = 'none';
    setGoogleLoginPendingUi(loginBtn, true);
}

function clearMediaPickerSignedOutRecoveryTimer() {
    if (_mediaPickerSignedOutRecoveryTimer) {
        clearTimeout(_mediaPickerSignedOutRecoveryTimer);
        _mediaPickerSignedOutRecoveryTimer = null;
    }
}

function scheduleMediaPickerSignedOutRecovery(callbacks) {
    clearMediaPickerSignedOutRecoveryTimer();
    const delayMs = Math.max(300, getMediaPickerAuthRecoveryRemainingMs() + 80);
    _mediaPickerSignedOutRecoveryTimer = setTimeout(() => {
        _mediaPickerSignedOutRecoveryTimer = null;
        if (auth.currentUser) return;
        handleSignedOutAuthState(callbacks);
    }, delayMs);
}

function handleSignedOutAuthState(callbacks) {
    const loginBtn = document.getElementById('loginBtn');
    const pendingGoogleLoginState = readPendingGoogleLoginState();
    if (getPreferredGoogleLoginMode() !== 'redirect' && pendingGoogleLoginState?.mode === 'redirect') {
        rememberPopupLoginFallback();
        clearPendingGoogleLoginState();
    } else if (shouldKeepPendingGoogleRedirectRecovery(pendingGoogleLoginState)) {
        window._isPopupLogin = true;
        setGoogleLoginPendingUi(loginBtn, true);
        schedulePendingGoogleLoginReset(loginBtn);
        return;
    }

    if (shouldDeferLoggedOutShellForMediaPicker()) {
        window._isPopupLogin = true;
        applyMediaPickerAuthRecoveryShellUi(loginBtn);
        scheduleMediaPickerSignedOutRecovery(callbacks);
        return;
    }

    setMediaPickerAuthRecoveryClass(false);
    clearPendingGoogleLoginResetTimer();
    clearMediaPickerSignedOutRecoveryTimer();
    window._isPopupLogin = false;
    setGoogleLoginPendingUi(loginBtn, false);

    if (window.cleanupGalleryResources) {
        window.cleanupGalleryResources();
    }
    if (!isEnglishLocale() && window.restoreGuestDemoIfAvailable?.()) {
        window._wasLoggedIn = false;
        _pushTokenLinked = false;
        _pushTokenValue = '';
        window.clearPwaActionableBadge?.();
        if (callbacks && callbacks.onLogout) callbacks.onLogout();
        updateNotificationPermissionCard(null);
        return;
    }

    applyInviteLandingBanner(false);
    trackInviteLinkLanding(false);

    if (isEnglishLocale()) {
        setEnglishAuthShellState('signed-out');
    } else {
        document.getElementById('login-modal').style.display = 'flex';
    }
    document.getElementById('point-badge-ui').style.display = 'none';
    document.getElementById('date-ui').style.display = 'none';
    document.getElementById('user-greeting').innerHTML = '';
    window._userDisplayName = null;
    window._blockedUsers = [];
    window.applyDietProgramUserData?.(null);

    // 로그아웃한 경우에만 갤러리 탭으로 이동(초기 cold start는 로그인 모달만 표시)
    if (window._wasLoggedIn && window.openTab) {
        window.openTab('gallery', false);
    }
    window._wasLoggedIn = false;
    _pushTokenLinked = false;
    _pushTokenValue = '';
    window.clearPwaActionableBadge?.();
    const pendingChatbotToken = String(localStorage.getItem(CHATBOT_CONNECT_PENDING_KEY) || '').trim();
    if (pendingChatbotToken && window.handleLoggedOutChatbotConnect) {
        setTimeout(() => {
            window.handleLoggedOutChatbotConnect();
        }, 80);
    }

    // 콜백 실행
    if (callbacks && callbacks.onLogout) {
        callbacks.onLogout();
    }
    updateNotificationPermissionCard(null);
}

// 인증 상태 변경 리스너
export function setupAuthListener(callbacks) {
    const { todayStr } = getDatesInfo();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // 로그인 전에 고른 앱 버전(기본형·심플·라이트·English)이 있으면 그 주소로 옮긴다.
            // 화면을 더 그리기 전에 처리해야 잠깐 다른 버전이 비쳤다가 바뀌는 일이 없다.
            const pendingVersion = window.getPendingAppVersion?.();
            if (pendingVersion) {
                const targetPath = { ko: '/', simple: '/simple', en: '/en', app: '/app' }[pendingVersion];
                const here = String(location.pathname || '/').replace(/\/+$/, '') || '/';
                window.clearPendingAppVersion?.();
                if (targetPath && targetPath !== here && !(targetPath === '/en' && here === '/en/index.html')) {
                    location.replace(targetPath);
                    return;
                }
            }
            clearPendingGoogleLoginResetTimer();
            clearMediaPickerSignedOutRecoveryTimer();
            if (window._isPopupLogin) {
                window._isPopupLogin = false;
            }
            clearPendingGoogleLoginState();
            const guestAuthIntent = window.finishGuestDemoAuthentication?.(true)
                || window.getPendingGuestAuthIntent?.()
                || null;
            applySignedInShellUi(user);
            applyCachedSignedInPointBalance(user.uid);
            applyInviteLandingBanner(true);
            trackInviteLinkLanding(true);

            // 즉시 대시보드 열기(renderDashboard가 자체 데이터 로딩 수행)
            const params = new URLSearchParams(window.location.search);
            const urlTab = params.get('tab');
            const appEntryFocus = params.get('focus');
            const hashTab = window.location.hash.replace('#', '');
            const routeContext = getRouteContext(window.location.pathname);
            const appMode = routeContext.mode;
            const validTabs = getAllowedTabsForMode(appMode);
            const pendingChatbotToken = String(localStorage.getItem(CHATBOT_CONNECT_PENDING_KEY) || '').trim();
            const requestedTab = (guestAuthIntent?.tab && validTabs.includes(guestAuthIntent.tab))
                ? guestAuthIntent.tab
                : (urlTab && validTabs.includes(urlTab))
                ? urlTab
                : (hashTab && validTabs.includes(hashTab))
                    ? hashTab
                    : getDefaultTabForMode(appMode);
            const targetTab = normalizeTabForRoute(requestedTab, routeContext);
            if (window.openTab) {
                window.openTab(targetTab, false);
            }
            const initialDailyLoadPromise = window.loadDataForSelectedDate
                ? Promise.resolve(window.loadDataForSelectedDate(todayStr)).catch(() => {})
                : Promise.resolve();
            // 지난 세션에서 서버까지 못 간 저장이 남아 있으면 여기서 이어서 올린다.
            setTimeout(() => {
                window.resumePendingOfflineSaves?.();
            }, 1200);
            if (window.refreshPwaActionableBadgeFromServer) {
                setTimeout(() => {
                    window.refreshPwaActionableBadgeFromServer(user).catch(() => {});
                }, 180);
            }
            if (window.flushOfflineOutbox) {
                initialDailyLoadPromise.finally(() => {
                    setTimeout(() => {
                        window.flushOfflineOutbox({ quiet: true }).catch(() => {});
                    }, 220);
                });
            }
            if (!pendingChatbotToken && window.handleAppEntryDeepLink) {
                const runAppEntryDeepLink = () => {
                    window.handleAppEntryDeepLink({ initialTab: targetTab }).catch(() => {});
                };
                if (appEntryFocus === 'health-connect-steps') {
                    initialDailyLoadPromise.finally(() => {
                        setTimeout(runAppEntryDeepLink, 80);
                    });
                } else {
                    setTimeout(runAppEntryDeepLink, 120);
                }
            }
            if (pendingChatbotToken && window.maybeHandleChatbotConnect) {
                setTimeout(() => {
                    window.maybeHandleChatbotConnect().catch(() => {});
                }, 120);
            }

            // 갤러리 + 지갑 데이터는 백그라운드 pre-fetch로 미리 로드
            scheduleVisibleTabBackgroundRefresh(user, initialDailyLoadPromise);

            // 백그라운드 사용자 문서 로드(닉네임, 코인, 프로필 업데이트)
            const userRef = doc(db, "users", user.uid);
            getDoc(userRef).then(async userDoc => {
                const { snap: resolvedUserDoc, data: resolvedUserData } = await resolveLatestUserDocData(userRef, userDoc);
                const isNewUser = !resolvedUserDoc.exists();
                const updateData = {
                    email: user.email || '',
                    displayName: user.displayName || '사용자',
                    locale: getLocale()
                };
                if (isNewUser) {
                    updateData.createdAt = serverTimestamp();
                    // 동의는 받은 사실만으로는 증명이 안 된다. 무엇에, 언제,
                    // 어느 문서 버전에 동의했는지 남겨야 나중에 확인할 수 있다.
                    updateData.consents = buildSignupConsentRecord();
                }
                // 이 쓰기를 통째로 삼키면 안 된다. 여기에 신규 회원의 동의 기록이 실려
                // 있는데, Firestore 규칙에 consents 가 없던 동안 계속 거부됐고 아무도
                // 몰랐다. 562명 중 동의 기록을 가진 사람이 0명이 되고서야 드러났다.
                // 로그인 자체는 막지 않되, 실패했다는 사실은 남긴다.
                await setDoc(userRef, updateData, { merge: true }).catch((error) => {
                    console.error('회원 문서 저장 실패:', error?.code || '', error?.message || error);
                    if (updateData.consents) {
                        console.error('동의 기록이 저장되지 않았습니다. Firestore 규칙에 consents 가 있는지 확인하세요.');
                    }
                });
                // 로그인이 끝났으니 이 브라우저는 다시 묻지 않는다. 임시 스냅샷은 역할이 끝났다.
                rememberAcceptedConsent();
                clearConsentSelectionSnapshot();
                // 방금 가입한 사람은 이미 현재 문서에 동의했다. 기존 회원만 확인한다.
                if (!isNewUser && needsConsentRefresh({ ...resolvedUserData, ...updateData })) {
                    setTimeout(() => {
                        if (auth.currentUser?.uid !== user.uid) return;
                        openReconsentModal(user, { ...resolvedUserData, ...updateData });
                    }, 900);
                }
                const ud = {
                    ...resolvedUserData,
                    ...updateData
                };
                if (isNewUser) {
                    rememberPendingSignupOnboarding(user);
                    window.prepareGuestOnboarding?.();
                }
                const ensuredReferralCode = await ensureSignedInUserReferralCode(ud);
                if (ensuredReferralCode) {
                    ud.referralCode = ensuredReferralCode;
                }
                const cachedPoints = readCachedSignedInPointBalance(user.uid);
                if (resolvedUserDoc.metadata?.fromCache && Number(resolvedUserData.coins || 0) === 0 && cachedPoints != null && cachedPoints > 0) {
                    ud.__preferCachedPoints = true;
                }

                await hydratePushTokenLinkState(user, ud);
                updateNotificationPermissionCard(user);
                if (Notification.permission === 'granted') {
                    setTimeout(() => {
                        syncCurrentPushState(user).catch(() => {});
                    }, 400);
                }

                // 건강정보(민감정보) 동의 상태를 화면에 반영한다.
                // 기존 가입자는 consents가 아예 없으므로 동의하지 않은 것으로 본다 —
                // 받은 적 없는 동의를 있다고 보면 안 된다.
                window._sensitiveConsentAgreed = ud?.consents?.sensitive?.agreed === true;
                window.applySensitiveConsentGate?.();

                await applySignedInUserUi(user, ud);
                updateEnglishProfilePanel(user, ud);

                if (isNewUser) {
                    setTimeout(() => window.checkOnboarding?.(), 0);
                } else if (guestAuthIntent) {
                    setTimeout(() => window.resumeGuestIntentForExistingUser?.(), 80);
                }

                await maybeHandleInviteLinkAfterAuth(user, ud, {
                    isNewUser
                }).catch(() => {});

                if (ud.adminFeedback && ud.feedbackDate) {
                    const fbDate = new Date(ud.feedbackDate);
                    const now = new Date(todayStr);
                    const diffDays = (now - fbDate) / (1000 * 60 * 60 * 24);
                    const isHidden = localStorage.getItem('hide_fb_' + user.uid);
                    if (diffDays <= 3 && !isHidden) {
                        document.getElementById('admin-feedback-box').style.display = 'block';
                        document.getElementById('admin-feedback-text').innerText = ud.adminFeedback;
                    }
                }

                if (ud.healthProfile) {
                    const prof = ud.healthProfile;
                    const el = (id) => document.getElementById(id);
                    if (el('prof-smm')) el('prof-smm').value = prof.smm || '';
                    if (el('prof-fat')) el('prof-fat').value = prof.fat || '';
                    if (el('prof-visceral')) el('prof-visceral').value = prof.visceral || '';
                    if (el('prof-bmr')) el('prof-bmr').value = prof.bmr || '';
                    if (el('prof-med-other')) el('prof-med-other').value = prof.medOther || '';
                    if (el('prof-height')) el('prof-height').value = prof.heightCm || '';
                    if (el('prof-total-chol')) el('prof-total-chol').value = prof.totalCholesterol || '';
                    if (el('prof-hdl')) el('prof-hdl').value = prof.hdl || '';
                    if (el('prof-secondhand')) el('prof-secondhand').checked = !!prof.secondhandSmoke;
                    if (prof.smokingStatus) {
                        const smokeEl = document.querySelector(
                            `input[name="smoking-status"][value="${prof.smokingStatus}"]`
                        );
                        if (smokeEl) smokeEl.checked = true;
                    }
                    if (prof.meds) {
                        document.querySelectorAll('input[name="med-chk"]').forEach(chk => {
                            if (prof.meds.includes(chk.value)) chk.checked = true;
                        });
                    }
                    if (prof.updatedAt) {
                        const dateEl = el('prof-last-date');
                        if (dateEl) dateEl.textContent = `마지막 측정: ${prof.updatedAt.slice(0, 10)}`;
                    }
                }
            }).catch(() => {});

            updateNotificationPermissionCard(user);

            // 5초 뒤 부가 기능 초기화(대시보드 우선 표시)
            setTimeout(() => {
                if (window.checkOnboarding) window.checkOnboarding();
                if (window.updateMetabolicScoreUI) window.updateMetabolicScoreUI();
                if (window.loadInbodyHistory) window.loadInbodyHistory();
                if (window.loadBloodTestHistory) window.loadBloodTestHistory();
                syncCurrentPushState(user).catch(() => {});
            }, 5000);

            const bootstrapBlockchainWallet = () => {
                if (!window._loadBlockchainModule) return;
                // 라이트(플레이) 모드에서는 온체인 기능이 꺼져 있어 이 로더가 거절한다.
                // 그건 오류가 아니라 정상 상태인데, catch가 없어 콘솔에 붉은 줄로 쌓였다.
                window._loadBlockchainModule().then(() => {
                    import(BLOCKCHAIN_MANAGER_MODULE_PATH).then(mod => {
                        const initWallet = mod.initializeWalletExternalFirst || mod.initializeUserWallet;
                        initWallet?.().catch(() => {});
                    }).catch(() => {});
                }).catch(() => {});
            };

            setTimeout(bootstrapBlockchainWallet, 1200);

            // 10초 뒤 챌린지 정산 점검
            setTimeout(() => {
                if (window._loadBlockchainModule) {
                    window._loadBlockchainModule().then(() => {
                        import(BLOCKCHAIN_MANAGER_MODULE_PATH).then(mod => {
                            mod.settleExpiredChallenges().then(() => {
                                getDoc(userRef).then(snap => {
                                    const ac = snap.data()?.activeChallenges || {};
                                    const claimable = Object.keys(ac).filter(t => ac[t]?.status === 'claimable');
                                    if (claimable.length > 0) {
                                        showToast('완료된 챌린지가 있습니다. 내 지갑에서 보상을 수령해 주세요.');
                                    }
                                }).catch(() => {});
                            }).catch(() => {});
                        }).catch(() => {});
                    }).catch(() => {});
                }
            }, 10000);

            if (callbacks && callbacks.onLogin) callbacks.onLogin(user);
        } else {
            handleSignedOutAuthState(callbacks);
        }
    });
}

// 로그아웃 후 로그인 화면으로 복귀
window.logoutAndReset = async function () {
    try {
        await signOut(auth);
    } catch (e) {
        console.warn('로그아웃 오류:', e.message);
        location.reload();
    }
};

// 계정 삭제(Firestore 데이터 + Storage 파일 + Auth 계정)
// 동의 문서가 실질적으로 바뀌면 이 값을 올린다. 그래야 어느 판본에 동의했는지
// 구분되고, 재동의를 받아야 하는 이용자를 골라낼 수 있다.
const CONSENT_DOC_VERSION = '2026-08-15';

// 리디렉트 로그인은 구글을 다녀오면서 페이지를 통째로 새로 띄운다. 그러면 체크박스가
// 전부 풀린 상태로 돌아오는데, 하필 그 시점에 신규 회원의 동의 기록이 만들어진다.
// 그대로 두면 분명히 동의하고 가입한 사람의 기록에 '동의 안 함'이 박힌다.
// 그래서 로그인을 시작할 때 선택을 저장해 두고, 돌아왔을 때 그것으로 복원한다.
const CONSENT_SELECTION_KEY = 'habitschool-consent-selection';
const CONSENT_ACCEPTED_KEY = 'habitschool-consent-accepted';
const CONSENT_IDS = ['consent-terms', 'consent-privacy', 'consent-age', 'consent-sensitive'];

function readConsentCheckbox(id) {
    return document.getElementById(id)?.checked === true;
}

function readStoredJson(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function collectConsentSelection() {
    const selection = {};
    CONSENT_IDS.forEach((id) => { selection[id] = readConsentCheckbox(id); });
    return selection;
}

// 로그인을 시작하는 순간 호출한다. 리디렉트로 페이지가 날아가도 선택이 남는다.
function persistConsentSelectionSnapshot() {
    try {
        localStorage.setItem(CONSENT_SELECTION_KEY, JSON.stringify({
            version: CONSENT_DOC_VERSION,
            selection: collectConsentSelection()
        }));
    } catch (_) {}
}

function readConsentSelectionSnapshot() {
    const stored = readStoredJson(CONSENT_SELECTION_KEY);
    if (!stored || stored.version !== CONSENT_DOC_VERSION) return null;
    return stored.selection || null;
}

function clearConsentSelectionSnapshot() {
    try {
        localStorage.removeItem(CONSENT_SELECTION_KEY);
    } catch (_) {}
}

// 화면에 하나라도 체크돼 있으면 그것이 방금 한 선택이다. 전부 비어 있다면 리디렉트를
// 다녀오며 화면이 초기화된 경우이므로 저장해 둔 선택을 쓴다.
function resolveConsentSelection() {
    const live = collectConsentSelection();
    if (Object.values(live).some(Boolean)) return live;
    return readConsentSelectionSnapshot() || live;
}

// 이 브라우저가 이미 동의를 마쳤다는 표시. 문서 버전이 올라가면 다시 받아야 하므로
// 버전을 함께 적는다.
// 재동의 화면에서 부를 때는 그 화면의 선택을 넘긴다. 인자가 없으면 로그인 화면 기준.
function rememberAcceptedConsent(selection = null) {
    const resolved = selection || resolveConsentSelection();
    try {
        localStorage.setItem(CONSENT_ACCEPTED_KEY, JSON.stringify({
            version: CONSENT_DOC_VERSION,
            at: new Date().toISOString(),
            sensitive: resolved['consent-sensitive'] === true
        }));
    } catch (_) {}
}

function readAcceptedConsent() {
    const stored = readStoredJson(CONSENT_ACCEPTED_KEY);
    if (!stored || stored.version !== CONSENT_DOC_VERSION) return null;
    return stored;
}

// 가입 때든 개정 재동의 때든 같은 모양으로 남겨야 한다. 두 벌로 만들면 언젠가 갈라진다.
function buildConsentRecordFromSelection(selection = {}) {
    const at = new Date().toISOString();
    const entry = (agreed) => ({ agreed, at: agreed ? at : null, version: CONSENT_DOC_VERSION });
    return {
        terms: entry(selection['consent-terms'] === true),
        privacy: entry(selection['consent-privacy'] === true),
        // 만 14세 미만은 법정대리인 동의가 필요해(개인정보 보호법 제22조의2) 아예 받지 않는다.
        // 약관에 나이 기준만 적어두고 확인하지 않으면 지킬 수 없는 약속이 된다.
        age14: entry(selection['consent-age'] === true),
        // 건강정보는 개인정보 보호법 제23조 민감정보라 따로 받는다.
        sensitive: entry(selection['consent-sensitive'] === true)
    };
}

function buildSignupConsentRecord() {
    return buildConsentRecordFromSelection(resolveConsentSelection());
}

// ===== 약관 개정 재동의 =====
//
// 문서가 바뀌면 기존 회원은 새 문서에 동의한 적이 없는 상태가 된다. 버전만 올리고
// 넘어가면 "동의를 받았다"고 말할 근거가 그 사람들에게는 없다. 필수 항목의 동의 버전이
// 현재 문서와 다르면 로그인 후 한 번 다시 받는다.
const RECONSENT_REQUIRED_KEYS = ['terms', 'privacy', 'age14'];
const RECONSENT_ID_BY_KEY = {
    'consent-terms': 'reconsent-terms',
    'consent-privacy': 'reconsent-privacy',
    'consent-age': 'reconsent-age',
    'consent-sensitive': 'reconsent-sensitive'
};
let _reconsentUser = null;

function needsConsentRefresh(userData = {}) {
    const consents = userData?.consents;
    if (!consents || typeof consents !== 'object') return true;
    return RECONSENT_REQUIRED_KEYS.some((key) => {
        const entry = consents[key];
        return !entry || entry.agreed !== true || entry.version !== CONSENT_DOC_VERSION;
    });
}

function collectReconsentSelection() {
    const selection = {};
    Object.entries(RECONSENT_ID_BY_KEY).forEach(([key, id]) => {
        selection[key] = document.getElementById(id)?.checked === true;
    });
    return selection;
}

function syncReconsentState() {
    const box = document.getElementById('reconsent-box');
    const submit = document.getElementById('reconsent-submit');
    if (!box || !submit) return;
    const all = [...box.querySelectorAll('input[type="checkbox"]')].filter(el => el.id !== 'reconsent-all');
    const required = [...box.querySelectorAll('input[data-consent-required="true"]')];
    const allBox = document.getElementById('reconsent-all');
    if (allBox) allBox.checked = all.length > 0 && all.every(el => el.checked);
    submit.disabled = !required.every(el => el.checked);
}

function bindReconsentListeners() {
    const box = document.getElementById('reconsent-box');
    if (!box || box.dataset.consentBound === 'true') return;
    box.dataset.consentBound = 'true';
    const allBox = document.getElementById('reconsent-all');
    if (allBox) {
        allBox.addEventListener('change', () => {
            box.querySelectorAll('input[type="checkbox"]').forEach(el => {
                if (el.id !== 'reconsent-all') el.checked = allBox.checked;
            });
            syncReconsentState();
        });
    }
    box.querySelectorAll('input[type="checkbox"]').forEach(el => {
        if (el.id === 'reconsent-all') return;
        el.addEventListener('change', syncReconsentState);
    });
}

function openReconsentModal(user, userData = {}) {
    const modal = document.getElementById('reconsent-modal');
    if (!modal || modal.style.display === 'flex') return;
    _reconsentUser = user;
    bindReconsentListeners();
    // 건강정보는 이미 받아 둔 선택이 있으면 그대로 되살린다. 개정을 빌미로 거부를
    // 동의로 바꾸면 안 된다.
    const sensitiveBox = document.getElementById('reconsent-sensitive');
    if (sensitiveBox) sensitiveBox.checked = userData?.consents?.sensitive?.agreed === true;
    ['reconsent-terms', 'reconsent-privacy', 'reconsent-age', 'reconsent-all'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    syncReconsentState();
    modal.style.display = 'flex';
}

function closeReconsentModal() {
    const modal = document.getElementById('reconsent-modal');
    if (modal) modal.style.display = 'none';
    _reconsentUser = null;
}

window.submitReconsent = async function submitReconsent() {
    const user = _reconsentUser || auth.currentUser;
    if (!user?.uid) return;
    const submit = document.getElementById('reconsent-submit');
    if (submit) submit.disabled = true;

    const record = buildConsentRecordFromSelection(collectReconsentSelection());
    try {
        await setDoc(doc(db, 'users', user.uid), { consents: record }, { merge: true });
    } catch (error) {
        console.error('재동의 저장 실패:', error);
        // 코드를 감추면 "잠시 후 다시" 를 영원히 누르게 된다. permission-denied 는
        // 기다린다고 풀리지 않는다 — 규칙을 고쳐야 하는 상황이고, 그렇게 말해야 한다.
        const code = String(error?.code || '').replace(/^firestore\//, '');
        showToast(code === 'permission-denied'
            ? '⚠️ 동의를 저장할 권한이 없어요. 잠시 후에도 같으면 문의해 주세요. (permission-denied)'
            : `⚠️ 동의 저장에 실패했어요. 잠시 후 다시 시도해 주세요.${code ? ` (${code})` : ''}`);
        if (submit) submit.disabled = false;
        return;
    }

    window._sensitiveConsentAgreed = record.sensitive.agreed === true;
    window.applySensitiveConsentGate?.();
    rememberAcceptedConsent(collectReconsentSelection());
    closeReconsentModal();
    showToast('✅ 동의해 주셔서 감사합니다.');
};

// 동의하지 않으면 계속 이용할 수 없다. 강제로 붙잡아 두는 대신 로그아웃으로 보낸다.
window.declineReconsent = function declineReconsent() {
    closeReconsentModal();
    window.logoutAndReset?.();
};

// 필수 항목을 다 체크해야 로그인 버튼이 열린다.
function syncSignupConsentState() {
    const box = document.getElementById('signup-consent-box');
    if (!box) return;
    const required = [...box.querySelectorAll('input[data-consent-required="true"]')];
    const all = [...box.querySelectorAll('input[type="checkbox"]')].filter(el => el.id !== 'consent-all');
    const allBox = document.getElementById('consent-all');
    const loginBtn = document.getElementById('loginBtn');

    if (allBox) allBox.checked = all.length > 0 && all.every(el => el.checked);
    const ready = required.every(el => el.checked);
    if (loginBtn) {
        loginBtn.disabled = !ready;
        loginBtn.title = ready
            ? ''
            : (document.documentElement.classList.contains('locale-en')
                ? 'Please agree to the required items first.'
                : '필수 항목에 동의해야 시작할 수 있어요.');
    }
}

// 필수 동의를 안 한 채로 다른 화면(버전 전환 등)으로 빠져나가려 할 때,
// 아무 반응 없이 막으면 고장으로 보인다. 무엇을 해야 하는지 그 자리에서 알린다.
const APP_VERSION_LABELS = { ko: '기본형', simple: '심플', en: 'English', app: '라이트' };

// 버전을 고르면 시작 버튼이 어디로 데려갈지 말해 준다.
// 누르는 즉시 이동하지 않으므로, 무엇이 선택됐는지 버튼이 알려 줘야 한다.
window.updateLoginButtonForVersion = function (version) {
    const btn = document.getElementById('loginBtn');
    if (!btn) return;
    const label = APP_VERSION_LABELS[version];
    const note = document.getElementById('login-version-note');
    if (note) {
        note.textContent = label ? `선택한 버전: ${label} · 시작하면 이 버전으로 열려요` : '';
        note.hidden = !label;
    }
};

// 동의 문구 안의 약관·방침 링크.
// 링크가 <label> 안에 있어 브라우저에 따라 라벨이 클릭을 가져가 버리고,
// 그러면 체크박스만 토글되고 문서는 열리지 않는다. 여기서 직접 연다.
window.openConsentDoc = function (event, anchor) {
    if (!anchor?.href) return;
    event.preventDefault();
    event.stopPropagation();
    window.open(anchor.href, '_blank', 'noopener');
};

window.highlightMissingConsents = function () {
    const box = document.getElementById('signup-consent-box');
    if (!box) return false;
    const missing = [...box.querySelectorAll('input[data-consent-required="true"]')].filter(el => !el.checked);
    if (!missing.length) return false;

    box.classList.add('needs-consent');
    missing.forEach(el => el.closest('.consent-row')?.classList.add('is-missing'));
    // 애니메이션을 다시 태우려면 클래스를 한 번 떼야 한다.
    box.classList.remove('shake');
    void box.offsetWidth;
    box.classList.add('shake');

    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    missing[0]?.focus({ preventScroll: true });

    // 체크하면 표시를 지운다.
    missing.forEach(el => {
        el.addEventListener('change', () => {
            if (el.checked) el.closest('.consent-row')?.classList.remove('is-missing');
            if (![...box.querySelectorAll('input[data-consent-required="true"]')].some(x => !x.checked)) {
                box.classList.remove('needs-consent', 'shake');
            }
        }, { once: true });
    });
    return true;
};

// 두 가지를 복원한다.
//  1) 이미 동의를 마친 브라우저라면 다시 묻지 않는다. 체크된 상태로 두고 상자를 감춘다.
//  2) 리디렉트를 다녀오는 중이라면 떠나기 직전의 선택을 되살린다. 이게 없으면
//     돌아온 화면에서 체크가 전부 풀려 시작 버튼이 잠긴 채로 멈춰 보인다.
function restoreConsentSelection() {
    const box = document.getElementById('signup-consent-box');
    if (!box) return;

    const accepted = readAcceptedConsent();
    if (accepted) {
        box.querySelectorAll('input[data-consent-required="true"]').forEach((el) => { el.checked = true; });
        const sensitiveBox = document.getElementById('consent-sensitive');
        if (sensitiveBox) sensitiveBox.checked = accepted.sensitive === true;
        // 감추되 DOM에는 남긴다. 다른 코드가 이 체크박스들을 그대로 읽기 때문에
        // 없애 버리면 동의 기록이 빈 채로 만들어진다.
        box.hidden = true;
        box.setAttribute('aria-hidden', 'true');
        syncSignupConsentState();
        return;
    }

    const snapshot = readConsentSelectionSnapshot();
    if (!snapshot) return;
    Object.entries(snapshot).forEach(([id, checked]) => {
        const el = document.getElementById(id);
        if (el) el.checked = checked === true;
    });
    syncSignupConsentState();
}

function bindSignupConsentListeners() {
    const box = document.getElementById('signup-consent-box');
    if (!box || box.dataset.consentBound === 'true') return;
    box.dataset.consentBound = 'true';

    restoreConsentSelection();

    const allBox = document.getElementById('consent-all');
    if (allBox) {
        allBox.addEventListener('change', () => {
            box.querySelectorAll('input[type="checkbox"]').forEach(el => {
                if (el.id !== 'consent-all') el.checked = allBox.checked;
            });
            syncSignupConsentState();
        });
    }
    box.querySelectorAll('input[type="checkbox"]').forEach(el => {
        if (el.id === 'consent-all') return;
        el.addEventListener('change', syncSignupConsentState);
    });
    syncSignupConsentState();
}

function bindConsentUi() {
    bindSignupConsentListeners();
    // 재동의 상자도 여기서 함께 묶는다. 모달을 여는 쪽에서만 묶으면, 다른 경로로
    // 화면에 뜬 순간 체크박스가 아무 반응도 하지 않는 상자가 된다.
    bindReconsentListeners();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindConsentUi);
} else {
    bindConsentUi();
}

// 건강정보 동의 상태. 화면 여러 곳에서 봐야 해서 전역에 둔다.
window._sensitiveConsentAgreed = false;

window.hasSensitiveDataConsent = function () {
    return window._sensitiveConsentAgreed === true;
};

// 동의하지 않은 사람에게는 이 안내가 매번 화면을 크게 차지한다. 쓰지 않기로 한
// 기능의 설명이 프로필의 절반을 먹을 이유가 없어서 접어 둔다. <details> 를 쓰면
// 열고 닫는 동작·키보드·스크린리더가 브라우저 기본으로 따라온다.
function buildSensitiveGateElement(label) {
    const gate = document.createElement('details');
    gate.className = 'sensitive-gate';
    gate.innerHTML = `
        <summary class="sensitive-gate-summary">🔒 ${escapeHtml(label)} 기능은 건강정보 동의가 필요해요</summary>
        <div class="sensitive-gate-body">
            <div class="sensitive-gate-desc">
                ${escapeHtml(label)} 정보는 개인정보 보호법상 <strong>민감정보</strong>라
                따로 동의를 받은 뒤에만 저장할 수 있어요.<br>
                동의하지 않아도 식단·운동·마음 기록은 그대로 사용할 수 있습니다.
            </div>
            <button type="button" class="sensitive-gate-btn" onclick="grantSensitiveConsent()">동의하고 사용하기</button>
        </div>
    `;
    return gate;
}

function buildSensitiveRevokeRow() {
    const row = document.createElement('div');
    row.className = 'sensitive-revoke-row';
    row.innerHTML = '<button type="button" class="sensitive-revoke-btn" onclick="revokeSensitiveConsent()">건강정보 동의 철회</button>';
    return row;
}

/**
 * 동의가 없으면 건강정보 카드의 입력 수단을 감추고 안내로 바꾼다.
 * 동의를 받았으면 철회 버튼을 붙여 언제든 되돌릴 수 있게 한다.
 */
window.applySensitiveConsentGate = function () {
    const agreed = window.hasSensitiveDataConsent();

    // 세 카드를 하나로 묶어 안내도 한 번만 띄운다. 동의하면 묶음이 통째로 열린다.
    const group = document.getElementById('sensitive-consent-group');
    const groupGate = document.getElementById('sensitive-group-gate');
    const groupCards = document.getElementById('sensitive-consent-cards');
    if (group && groupGate && groupCards) {
        groupGate.hidden = agreed;
        groupCards.hidden = !agreed;
        // 동의 뒤 다시 들어왔을 때 접힌 안내가 열린 채로 남지 않게 한다.
        if (agreed) groupGate.open = false;

        // 철회 버튼은 묶음 끝에 하나만. 카드마다 붙으면 세 번 나온다.
        let revoke = group.querySelector(':scope > .sensitive-revoke-row');
        if (!revoke) {
            revoke = buildSensitiveRevokeRow();
            group.appendChild(revoke);
        }
        revoke.hidden = !agreed;
    }

    // 묶음 밖에 남아 있는 민감정보 카드가 있으면 예전 방식으로 각자 처리한다.
    document.querySelectorAll('[data-sensitive-card]').forEach((card) => {
        if (groupCards && groupCards.contains(card)) {
            // 묶음이 통째로 여닫히므로 카드별 잠금 표시는 필요 없다.
            card.classList.remove('is-locked');
            return;
        }
        const label = card.getAttribute('data-sensitive-card') || '건강';
        let gate = card.querySelector(':scope > .sensitive-gate');
        if (!gate) {
            gate = buildSensitiveGateElement(label);
            card.appendChild(gate);
        }
        let revoke = card.querySelector(':scope > .sensitive-revoke-row');
        if (!revoke) {
            revoke = buildSensitiveRevokeRow();
            card.appendChild(revoke);
        }
        card.classList.toggle('is-locked', !agreed);
        gate.hidden = agreed;
        revoke.hidden = !agreed;
    });
};

async function writeSensitiveConsent(agreed) {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return false;
    }
    try {
        await setDoc(doc(db, 'users', user.uid), {
            consents: {
                sensitive: {
                    agreed,
                    at: agreed ? new Date().toISOString() : null,
                    version: CONSENT_DOC_VERSION
                }
            }
        }, { merge: true });
        window._sensitiveConsentAgreed = agreed;
        window.applySensitiveConsentGate();
        return true;
    } catch (error) {
        console.error('건강정보 동의 저장 실패:', error);
        showToast('동의 상태를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
        return false;
    }
}

window.grantSensitiveConsent = async function () {
    const ok = await writeSensitiveConsent(true);
    if (ok) showToast('건강정보 기능을 사용할 수 있어요.');
};

window.revokeSensitiveConsent = async function () {
    if (!confirm('건강정보 동의를 철회하시겠습니까?\n\n체성분·약물·혈액검사 기능을 더 이상 사용할 수 없게 됩니다.\n이미 저장된 기록은 프로필에서 따로 삭제할 수 있습니다.')) {
        return;
    }
    const ok = await writeSensitiveConsent(false);
    if (ok) showToast('건강정보 동의를 철회했어요.');
};

window.closeDeleteAccountModal = function () {
    const modal = document.getElementById('delete-account-modal');
    if (modal) modal.style.display = 'none';
};

// 개인키를 먼저 빼두면 탈퇴 후에도 토큰을 계속 쓸 수 있다.
// 지갑 화면의 기존 내보내기 모달을 그대로 연다.
window.exportWalletBeforeDelete = function () {
    if (typeof window.openLegacyWalletExportModal !== 'function') {
        showToast('지갑 탭에서 개인키를 먼저 내보내 주세요.');
        return;
    }
    window.closeDeleteAccountModal();
    window.openLegacyWalletExportModal();
};

function syncDeleteAckState() {
    const tokens = document.getElementById('delete-ack-tokens');
    const data = document.getElementById('delete-ack-data');
    const btn = document.getElementById('delete-confirm-btn');
    if (!btn) return;
    // 지갑이 없으면 토큰 확인란은 뜻이 없으므로 데이터 확인만 요구한다.
    const tokenOk = !tokens || tokens.disabled || tokens.checked;
    btn.disabled = !(tokenOk && data?.checked);
}

/**
 * 삭제 전에 지갑 주소와 잔액을 보여 준다.
 * 숫자를 눈으로 봐야 무엇을 잃는지 실감할 수 있다.
 */
async function fillDeleteWalletSummary() {
    const addressEl = document.getElementById('delete-wallet-address');
    const balanceEl = document.getElementById('delete-wallet-balance');
    const warningEl = document.getElementById('delete-token-warning');
    const tokensAck = document.getElementById('delete-ack-tokens');

    let address = '';
    try {
        address = window.getWalletAddress?.() || '';
    } catch (_) { }

    if (!address) {
        // 지갑이 없으면 잃을 토큰도 없다. 겁줄 이유가 없으므로 경고를 감춘다.
        if (warningEl) warningEl.style.display = 'none';
        if (tokensAck) {
            tokensAck.checked = true;
            tokensAck.disabled = true;
            tokensAck.closest('.consent-row')?.style.setProperty('display', 'none');
        }
        syncDeleteAckState();
        return;
    }

    if (warningEl) warningEl.style.display = 'block';
    if (addressEl) addressEl.textContent = `${address.slice(0, 6)}…${address.slice(-4)}`;

    if (balanceEl) {
        balanceEl.textContent = '확인 중…';
        try {
            const balance = await window.fetchOnchainBalance?.();
            const amount = parseFloat(balance?.balanceFormatted);
            balanceEl.textContent = Number.isFinite(amount)
                ? `${amount.toLocaleString()} HBT`
                : '조회 실패 (잔액이 있을 수 있음)';
        } catch (_) {
            // 잔액을 못 읽어도 삭제를 막지는 않는다. 다만 모른다고 말한다.
            balanceEl.textContent = '조회 실패 (잔액이 있을 수 있음)';
        }
    }
    syncDeleteAckState();
}

window.deleteAccountAndData = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return;
    }

    const modal = document.getElementById('delete-account-modal');
    if (!modal) {
        showToast('삭제 화면을 열지 못했어요. 새로고침 후 다시 시도해 주세요.');
        return;
    }

    ['delete-ack-tokens', 'delete-ack-data'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.checked = false; el.disabled = false; }
        el?.closest('.consent-row')?.style.removeProperty('display');
        if (el && !el.dataset.deleteAckBound) {
            el.dataset.deleteAckBound = 'true';
            el.addEventListener('change', syncDeleteAckState);
        }
    });
    syncDeleteAckState();
    modal.style.display = 'flex';
    fillDeleteWalletSummary().catch(() => { });
};

window.confirmDeleteAccount = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return;
    }
    window.closeDeleteAccountModal();

    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = '계정 삭제 중...';
    }

    try {
        // 삭제는 서버가 한다. 클라이언트로는 애초에 끝낼 수 없는 일이었다 —
        // 웹 SDK에는 Storage 폴더 삭제가 없어 사진이 한 장도 지워지지 않았고,
        // 남의 게시물에 남긴 내 댓글·반응은 보안 규칙상 손댈 수 없다.
        const deleteMyAccountFn = httpsCallable(functions, 'deleteMyAccount');
        const result = await deleteMyAccountFn({});
        console.info('[deleteAccount] 서버 처리 결과:', result?.data);

        // 서버가 인증 계정까지 지운다. 토큰이 이미 죽었으므로 signOut은 실패해도 넘어간다.
        try { await signOut(auth); } catch (_) { }

        localStorage.clear();
        showToast('계정이 완전히 삭제되었습니다.');
        setTimeout(() => location.reload(), 1500);
    } catch (err) {
        console.error('계정 삭제 오류:', err);
        showToast('계정 삭제 중 오류가 발생했습니다: ' + (err?.message || err));
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = '계정 삭제';
        }
    }
};


function isIOSPushDevice() {
    const ua = navigator.userAgent || navigator.vendor || '';
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroidPushDevice() {
    const ua = navigator.userAgent || navigator.vendor || '';
    return /Android/i.test(ua);
}

function isStandalonePushMode() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isPushSupportedInBrowser() {
    return !IS_LOCAL_ENV && ('Notification' in window) && ('serviceWorker' in navigator);
}

function getNotificationGuideProfile() {
    const ua = navigator.userAgent || navigator.vendor || '';
    const isAndroid = isAndroidPushDevice();
    const isDesktop = /Windows NT|Macintosh|Linux/i.test(ua) && !isAndroid && !isIOSPushDevice();
    const isSamsungBrowser = /SamsungBrowser/i.test(ua);
    const isEdge = /EdgA|Edg\//i.test(ua);
    const isWhale = /Whale/i.test(ua);

    if (isIOSPushDevice()) {
        return {
            badge: 'iPhone / iPad 안내',
            title: '설정 앱에서 해빛스쿨 알림을 다시 켜요',
            copy: 'iPhone과 iPad는 설치된 앱 권한을 설정 앱에서 바꾸면 됩니다.',
            note: '기기마다 문구가 조금 달라도 보통 설정 앱의 알림 메뉴 안에 있어요.',
            panels: [
                {
                    step: 'STEP 1',
                    title: '설정 앱을 열어요',
                    copy: '브라우저가 아니라 iPhone 설정 앱으로 이동해 주세요.',
                    variant: 'ios-settings-home'
                },
                {
                    step: 'STEP 2',
                    title: '알림 메뉴를 눌러요',
                    copy: '설정 목록에서 알림 메뉴를 열면 앱별 권한을 찾을 수 있어요.',
                    variant: 'ios-settings-notifications'
                },
                {
                    step: 'STEP 3',
                    title: '해빛스쿨 알림을 허용으로 바꿔요',
                    copy: '허용으로 바꾼 뒤 앱으로 돌아오면 다시 알림 켜기를 할 수 있어요.',
                    variant: 'ios-settings-app'
                }
            ]
        };
    }

    if (isAndroid) {
        const browserLabel = isSamsungBrowser
            ? '삼성 인터넷'
            : isEdge
                ? 'Edge'
                : isWhale
                    ? 'Whale'
                    : 'Chrome';

        if (isStandalonePushMode()) {
            return {
                badge: '안드로이드 설치 앱 안내',
                title: `${browserLabel} 사이트 설정에서 해빛스쿨 알림을 다시 켜요`,
                copy: '설치 앱에서도 알림 권한은 같은 사이트 권한으로 관리돼요. 한 번만 브라우저에서 열어 바꿔 주세요.',
                note: '설치 앱 안에는 주소창이 없어서, 같은 주소를 브라우저 탭으로 열어 권한을 바꿔야 해요.',
                panels: [
                    {
                        step: 'STEP 1',
                        title: `${browserLabel}에서 해빛스쿨을 열어요`,
                        copy: '설치 앱이 아니라 브라우저 탭으로 habitschool 웹사이트를 다시 열어 주세요.',
                        variant: 'android-standalone-open-browser'
                    },
                    {
                        step: 'STEP 2',
                        title: '주소창 왼쪽 아이콘을 눌러요',
                        copy: '사이트 정보 패널을 열고 `권한` 또는 `사이트 설정`으로 들어가 주세요.',
                        variant: 'android-address'
                    },
                    {
                        step: 'STEP 3',
                        title: '알림을 허용으로 바꿔요',
                        copy: '허용으로 바꾼 뒤 설치 앱으로 돌아오면 다시 알림을 켤 수 있어요.',
                        variant: 'android-allow'
                    }
                ]
            };
        }

        return {
            badge: `${browserLabel} 안드로이드 안내`,
            title: '주소창 왼쪽 아이콘에서 알림을 다시 켜요',
            copy: '지금 보신 화면처럼 주소창 왼쪽 아이콘을 누르면 권한 메뉴로 들어갈 수 있어요.',
            note: '브라우저마다 이름은 조금 달라도 보통 `권한` 또는 `사이트 설정` 메뉴 안에 있어요.',
            panels: [
                {
                    step: 'STEP 1',
                    title: '주소창 왼쪽 아이콘을 눌러요',
                    copy: '사이트 정보 패널을 여는 버튼입니다.',
                    variant: 'android-address'
                },
                {
                    step: 'STEP 2',
                    title: '권한 메뉴를 눌러요',
                    copy: '`권한` 또는 `사이트 설정` 줄을 열면 알림 상태를 바꿀 수 있어요.',
                    variant: 'android-permissions'
                },
                {
                    step: 'STEP 3',
                    title: '알림을 허용으로 바꿔요',
                    copy: '허용으로 바꾼 뒤 해빛스쿨로 돌아오면 바로 다시 연결할 수 있어요.',
                    variant: 'android-allow'
                }
            ]
        };
    }

    if (isDesktop) {
        const browserLabel = isEdge ? 'Edge' : isWhale ? 'Whale' : 'Chrome';
        return {
            badge: `${browserLabel} 데스크톱 안내`,
            title: '주소창 왼쪽 사이트 아이콘에서 알림을 다시 켜요',
            copy: '데스크톱 브라우저도 거의 같은 위치에서 사이트 알림 권한을 바꿀 수 있어요.',
            note: '브라우저마다 메뉴 이름은 조금 달라도 보통 사이트 설정 또는 권한 메뉴에 있어요.',
            panels: [
                {
                    step: 'STEP 1',
                    title: '주소창 왼쪽 아이콘을 눌러요',
                    copy: '자물쇠나 사이트 정보 아이콘을 클릭해 주세요.',
                    variant: 'desktop-address'
                },
                {
                    step: 'STEP 2',
                    title: '사이트 설정 또는 권한을 열어요',
                    copy: '작은 팝업 안에서 사이트 설정으로 들어가 주세요.',
                    variant: 'desktop-settings'
                },
                {
                    step: 'STEP 3',
                    title: '알림을 허용으로 바꿔요',
                    copy: '허용으로 바꾸면 다시 해빛스쿨 푸시를 켤 수 있어요.',
                    variant: 'desktop-allow'
                }
            ]
        };
    }

    return {
        badge: '브라우저 안내',
        title: '사이트 설정에서 알림을 다시 켜요',
        copy: '브라우저마다 모양은 조금 달라도 보통 주소창 주변의 사이트 설정에서 바꿀 수 있어요.',
        note: '`권한`, `사이트 설정`, `알림` 같은 이름을 찾으면 됩니다.',
        panels: [
            {
                step: 'STEP 1',
                title: '주소창 주변의 사이트 아이콘을 눌러요',
                copy: '자물쇠, 정보, 슬라이더 같은 아이콘일 수 있어요.',
                variant: 'generic-address'
            },
            {
                step: 'STEP 2',
                title: '권한 또는 사이트 설정을 열어요',
                copy: '브라우저마다 이름은 달라도 권한 메뉴 안에 알림이 있어요.',
                variant: 'generic-settings'
            },
            {
                step: 'STEP 3',
                title: '알림을 허용으로 바꿔요',
                copy: '허용으로 바꾼 뒤 해빛스쿨로 돌아와 다시 켜면 됩니다.',
                variant: 'generic-allow'
            }
        ]
    };
}

function isAppPushConnected() {
    return _pushTokenLinked === true;
}

function buildNotificationGuideVisual(variant) {
    switch (variant) {
        case 'android-address':
            return `
                <div class="notification-guide-mock notification-guide-mock-browser is-mobile">
                    <div class="notification-guide-callout top-left">여기를 눌러요</div>
                    <div class="notification-guide-browser-bar">
                        <div class="notification-guide-icon-pill is-highlight">≡</div>
                        <div class="notification-guide-url-pill">habitschool-staging.web.app</div>
                        <div class="notification-guide-toolbar-dot"></div>
                    </div>
                </div>`;
        case 'android-standalone-open-browser':
            return `
                <div class="notification-guide-mock notification-guide-mock-android-app">
                    <div class="notification-guide-mini-card">해빛스쿨 앱</div>
                    <div class="notification-guide-arrow-down">↓</div>
                    <div class="notification-guide-mini-card is-highlight">Chrome에서 열기</div>
                    <div class="notification-guide-setting-hint">같은 주소를 브라우저 탭으로 한 번 열어 주세요</div>
                </div>`;
        case 'android-permissions':
            return `
                <div class="notification-guide-mock notification-guide-mock-sheet">
                    <div class="notification-guide-sheet-row">이 연결은 안전합니다.</div>
                    <div class="notification-guide-sheet-row is-highlight">
                        <div>권한</div>
                        <small>알림 차단됨</small>
                    </div>
                    <div class="notification-guide-sheet-row">최근 방문: 오늘</div>
                </div>`;
        case 'android-allow':
            return `
                <div class="notification-guide-mock notification-guide-mock-settings">
                    <div class="notification-guide-setting-row is-highlight">
                        <span>알림</span>
                        <span class="notification-guide-toggle is-on"><span></span></span>
                    </div>
                    <div class="notification-guide-setting-hint">허용으로 바꾸면 끝나요</div>
                </div>`;
        case 'desktop-address':
            return `
                <div class="notification-guide-mock notification-guide-mock-browser is-desktop">
                    <div class="notification-guide-callout top-left">여기를 눌러요</div>
                    <div class="notification-guide-browser-top"></div>
                    <div class="notification-guide-browser-bar">
                        <div class="notification-guide-icon-pill is-highlight">🔒</div>
                        <div class="notification-guide-url-pill">habitschool-staging.web.app</div>
                        <div class="notification-guide-toolbar-dots"><span></span><span></span><span></span></div>
                    </div>
                </div>`;
        case 'desktop-settings':
            return `
                <div class="notification-guide-mock notification-guide-mock-sheet">
                    <div class="notification-guide-sheet-row">연결은 안전합니다.</div>
                    <div class="notification-guide-sheet-row is-highlight">
                        <div>사이트 설정</div>
                        <small>권한 보기</small>
                    </div>
                    <div class="notification-guide-sheet-row">쿠키 및 사이트 데이터</div>
                </div>`;
        case 'desktop-allow':
            return `
                <div class="notification-guide-mock notification-guide-mock-settings">
                    <div class="notification-guide-setting-row is-highlight">
                        <span>알림</span>
                        <span class="notification-guide-setting-value">허용</span>
                    </div>
                    <div class="notification-guide-setting-hint">드롭다운에서 허용을 선택해 주세요</div>
                </div>`;
        case 'ios-settings-home':
            return `
                <div class="notification-guide-mock notification-guide-mock-ios">
                    <div class="notification-guide-callout top-left">설정 앱</div>
                    <div class="notification-guide-ios-icon is-highlight">⚙️</div>
                    <div class="notification-guide-ios-label">설정</div>
                </div>`;
        case 'ios-settings-notifications':
            return `
                <div class="notification-guide-mock notification-guide-mock-settings">
                    <div class="notification-guide-setting-row">일반</div>
                    <div class="notification-guide-setting-row is-highlight">
                        <span>알림</span>
                        <span class="notification-guide-setting-value">열기</span>
                    </div>
                    <div class="notification-guide-setting-row">개인정보 보호 및 보안</div>
                </div>`;
        case 'ios-settings-app':
            return `
                <div class="notification-guide-mock notification-guide-mock-settings">
                    <div class="notification-guide-setting-row is-highlight">
                        <span>해빛스쿨</span>
                        <span class="notification-guide-toggle is-on"><span></span></span>
                    </div>
                    <div class="notification-guide-setting-hint">알림 허용을 켜 주세요</div>
                </div>`;
        case 'generic-settings':
            return `
                <div class="notification-guide-mock notification-guide-mock-sheet">
                    <div class="notification-guide-sheet-row is-highlight">
                        <div>사이트 설정</div>
                        <small>또는 권한</small>
                    </div>
                    <div class="notification-guide-sheet-row">쿠키 및 사이트 데이터</div>
                </div>`;
        case 'generic-allow':
            return `
                <div class="notification-guide-mock notification-guide-mock-settings">
                    <div class="notification-guide-setting-row is-highlight">
                        <span>알림</span>
                        <span class="notification-guide-setting-value">허용</span>
                    </div>
                </div>`;
        case 'generic-address':
        default:
            return `
                <div class="notification-guide-mock notification-guide-mock-browser is-mobile">
                    <div class="notification-guide-callout top-left">사이트 아이콘</div>
                    <div class="notification-guide-browser-bar">
                        <div class="notification-guide-icon-pill is-highlight">ⓘ</div>
                        <div class="notification-guide-url-pill">habitschool-staging.web.app</div>
                        <div class="notification-guide-toolbar-dot"></div>
                    </div>
                </div>`;
    }
}

function renderNotificationPermissionGuide() {
    const profile = getNotificationGuideProfile();
    const badgeEl = document.getElementById('notification-guide-badge');
    const titleEl = document.getElementById('notification-guide-title');
    const copyEl = document.getElementById('notification-guide-copy');
    const noteEl = document.getElementById('notification-guide-note');
    const panelsEl = document.getElementById('notification-guide-panels');
    if (!badgeEl || !titleEl || !copyEl || !noteEl || !panelsEl) return;

    badgeEl.textContent = profile.badge;
    titleEl.textContent = profile.title;
    copyEl.textContent = profile.copy;
    noteEl.textContent = profile.note;
    panelsEl.innerHTML = profile.panels.map(panel => `
        <section class="notification-guide-panel">
            <div class="notification-guide-panel-step">${panel.step}</div>
            <div class="notification-guide-panel-title">${panel.title}</div>
            <div class="notification-guide-panel-copy">${panel.copy}</div>
            ${buildNotificationGuideVisual(panel.variant)}
        </section>
    `).join('');
}

window.openNotificationPermissionGuide = function () {
    renderNotificationPermissionGuide();
    const modal = document.getElementById('notification-permission-guide-modal');
    if (modal) modal.style.display = 'flex';
};

window.closeNotificationPermissionGuide = function () {
    const modal = document.getElementById('notification-permission-guide-modal');
    if (modal) modal.style.display = 'none';
};

function getPushPermissionUiState(user = auth.currentUser) {
    if (!user) {
        return {
            status: '로그인 후 알림 상태를 확인할 수 있어요.',
            helper: '친구 요청, 챌린지 초대, 리마인더를 푸시 알림으로 받을 수 있어요.',
            buttonLabel: '로그인 필요',
            buttonMode: 'muted',
            disabled: true,
            action: 'login'
        };
    }

    if (!isPushSupportedInBrowser()) {
        return {
            status: '현재 브라우저에서는 푸시 알림을 지원하지 않아요.',
            helper: 'Chrome, Edge, Safari 같은 지원 브라우저에서 알림을 켤 수 있어요.',
            buttonLabel: '알림 미지원',
            buttonMode: 'muted',
            disabled: true,
            action: 'unsupported'
        };
    }

    if (isIOSPushDevice() && !isStandalonePushMode()) {
        return {
            status: 'iPhone과 iPad에서는 홈 화면 앱으로 설치한 뒤 알림을 켤 수 있어요.',
            helper: '먼저 해빛스쿨을 홈 화면 앱으로 설치한 뒤, 설치된 앱에서 이 버튼을 눌러 알림을 켜주세요.',
            buttonLabel: window.getInstallButtonLabel?.() || '홈 화면에 앱 설치',
            buttonMode: 'secondary',
            disabled: false,
            action: 'install'
        };
    }

    if (Notification.permission === 'granted') {
        if (isAppPushConnected()) {
            return {
                status: '이 기기에서 해빛스쿨 푸시 알림이 켜져 있어요.',
                helper: '원하면 버튼 한 번으로 해빛스쿨 푸시 알림만 끌 수 있어요.',
                buttonLabel: '알림 끄기',
                buttonMode: 'secondary',
                disabled: false,
                action: 'disable'
            };
        }

        return {
            status: isStandalonePushMode()
                ? '이 기기 알림 권한은 허용되어 있어요.'
                : '브라우저 알림 권한은 허용되어 있어요.',
            helper: '버튼 한 번으로 해빛스쿨 푸시 알림을 바로 켤 수 있어요.',
            buttonLabel: '알림 켜기',
            buttonMode: 'primary',
            disabled: false,
            action: 'enable'
        };
    }

    if (Notification.permission === 'denied') {
        return {
            status: isStandalonePushMode()
                ? '이 기기에서 해빛스쿨 알림이 차단되어 있어요.'
                : '브라우저에서 알림이 차단되어 있어요.',
            helper: isStandalonePushMode()
                ? '설정 안내를 열면 브라우저에서 다시 켜는 순서를 그림으로 보여드려요.'
                : '버튼을 누르면 지금 쓰는 브라우저 화면 기준으로 어디를 눌러야 하는지 그림으로 보여드려요.',
            buttonLabel: '설정 안내 보기',
            buttonMode: 'secondary',
            disabled: false,
            action: 'guide'
        };
    }

    return {
        status: '버튼을 눌러 푸시 알림을 켜면 친구와 챌린지 소식을 바로 받을 수 있어요.',
        helper: '특히 iPhone은 설치된 홈 화면 앱에서 직접 눌러야 알림 권한을 요청할 수 있어요.',
        buttonLabel: '알림 켜기',
        buttonMode: 'primary',
        disabled: false,
        action: 'enable'
    };
}

window.getAppPushPermissionState = function (user = auth.currentUser) {
    const state = getPushPermissionUiState(user);
    return {
        ...state,
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
        connected: isAppPushConnected()
    };
};

function updateNotificationPermissionCard(user = auth.currentUser) {
    const statusEl = document.getElementById('notification-permission-status');
    const helperEl = document.getElementById('notification-permission-helper');
    const buttonEl = document.getElementById('notification-permission-btn');
    if (!statusEl || !helperEl || !buttonEl) return;

    const state = getPushPermissionUiState(user);
    statusEl.textContent = state.status;
    helperEl.textContent = state.helper;
    buttonEl.textContent = state.buttonLabel;
    buttonEl.disabled = !!state.disabled;
    buttonEl.dataset.action = state.action || '';
    buttonEl.classList.toggle('is-secondary', state.buttonMode === 'secondary');
    buttonEl.classList.toggle('is-muted', state.buttonMode === 'muted');
    window.applyDietProgramUserData?.(window._dietProgramUserDataSnapshot || null);
}

async function ensureFirebaseMessaging() {
    if (_messagingPromise) return _messagingPromise;

    _messagingPromise = import('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js')
        .then(({ getMessaging, getToken, deleteToken, onMessage }) => {
            const messaging = getMessaging();

            if (!_foregroundPushListenerBound) {
                onMessage(messaging, (payload) => {
                    const { title, body } = payload.data || {};
                    if (title || body) showToast(`${title || '해빛스쿨'} - ${body || ''}`);
                });
                _foregroundPushListenerBound = true;
            }

            return { messaging, getToken, deleteToken };
        });

    return _messagingPromise;
}

async function registerFCMToken(user) {
    if (!user || !isPushSupportedInBrowser()) return { status: 'unsupported' };
    if (isIOSPushDevice() && !isStandalonePushMode()) return { status: 'install-required' };
    if (Notification.permission !== 'granted') return { status: Notification.permission || 'default' };

    try {
        const { messaging, getToken } = await ensureFirebaseMessaging();
        const swReg = await navigator.serviceWorker.ready;
        const token = await getToken(messaging, {
            vapidKey: FCM_PUBLIC_VAPID_KEY,
            serviceWorkerRegistration: swReg
        });
        if (!token) return { status: 'token-missing' };

        await setDoc(getPushTokenDocRef(user.uid), {
            userId: user.uid,
            token,
            enabled: true,
            permission: Notification.permission,
            platform: getPushPlatformLabel(),
            browser: getPushBrowserLabel(),
            displayMode: getPushDisplayModeLabel(),
            linkedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        }, { merge: true });

        await setDoc(doc(db, 'users', user.uid), {
            fcmToken: token
        }, { merge: true });

        _pushTokenLinked = true;
        _pushTokenValue = token;
        return { status: 'granted', token };
    } catch (e) {
        console.warn('[FCM] 토큰 등록 실패:', e.message);
        return { status: 'error', message: e.message };
    }
}

async function disableFCMToken(user) {
    if (!user || !isPushSupportedInBrowser()) return { status: 'unsupported' };
    if (Notification.permission !== 'granted') return { status: Notification.permission || 'default' };

    try {
        const { messaging, getToken, deleteToken } = await ensureFirebaseMessaging();
        const swReg = await navigator.serviceWorker.ready;
        let currentToken = '';

        try {
            currentToken = await getToken(messaging, {
                vapidKey: FCM_PUBLIC_VAPID_KEY,
                serviceWorkerRegistration: swReg
            }) || '';
        } catch (_) {}

        await deleteToken(messaging).catch(() => false);

        const userRef = doc(db, 'users', user.uid);
        const storedSnap = await getDoc(userRef).catch(() => null);
        const storedToken = storedSnap?.data?.()?.fcmToken || '';
        await deleteDoc(getPushTokenDocRef(user.uid)).catch(() => {});
        if (!storedToken || !currentToken || storedToken === currentToken || storedToken === _pushTokenValue) {
            await setDoc(userRef, { fcmToken: deleteField() }, { merge: true });
        }

        _pushTokenLinked = false;
        _pushTokenValue = '';
        return { status: 'disabled' };
    } catch (e) {
        console.warn('[FCM] 토큰 해제 실패:', e.message);
        return { status: 'error', message: e.message };
    }
}

async function syncCurrentPushState(user = auth.currentUser) {
    if (!user) {
        _pushTokenLinked = false;
        _pushTokenValue = '';
        updateNotificationPermissionCard(null);
        return { status: 'signed-out' };
    }

    if (Notification.permission !== 'granted') {
        await hydratePushTokenLinkState(user);
        updateNotificationPermissionCard(user);
        return { status: Notification.permission || 'default' };
    }

    const result = await registerFCMToken(user);
    updateNotificationPermissionCard(user);
    return result;
}

window.requestAppNotificationPermission = async function (options = {}) {
    const user = auth.currentUser;
    const state = getPushPermissionUiState(user);
    const ensureEnabled = options?.ensureEnabled === true;
    const buildResult = ({ status = '', connected = isAppPushConnected(), action = state.action || '' } = {}) => ({
        status,
        connected: !!connected,
        action
    });
    if (!user) {
        showToast('먼저 로그인해 주세요.');
        return buildResult({ status: 'signed-out', connected: false, action: 'login' });
    }

    if (state.action === 'unsupported') {
        showToast('이 브라우저에서는 푸시 알림을 지원하지 않아요.');
        updateNotificationPermissionCard(user);
        return buildResult({ status: 'unsupported', connected: false, action: 'unsupported' });
    }

    if (state.action === 'install') {
        window.handleInstallCtaAction?.();
        updateNotificationPermissionCard(user);
        return buildResult({ status: 'install-required', connected: false, action: 'install' });
    }

    if (state.action === 'guide') {
        openNotificationPermissionGuide();
        updateNotificationPermissionCard(user);
        return buildResult({ status: 'permission-denied', connected: false, action: 'guide' });
    }

    const buttonEl = document.getElementById('notification-permission-btn');
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = '확인 중...';
    }

    try {
        if (state.action === 'disable') {
            if (ensureEnabled) {
                return buildResult({ status: 'granted', connected: true, action: 'enable' });
            }
            const result = await disableFCMToken(user);
            if (result.status === 'disabled') {
                showToast('이 기기의 해빛스쿨 푸시 알림을 껐어요.');
            } else {
                showToast('알림 끄기 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
            }
            updateNotificationPermissionCard(user);
            return buildResult({ status: result.status || 'error', connected: false, action: 'disable' });
        }

        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showToast(permission === 'denied' ? '알림 권한이 차단되었어요.' : '알림 권한 요청이 취소되었어요.');
                updateNotificationPermissionCard(user);
                return buildResult({
                    status: permission === 'denied' ? 'permission-denied' : 'permission-dismissed',
                    connected: false,
                    action: 'enable'
                });
            }
        }

        const result = await registerFCMToken(user);
        if (result.status === 'granted') {
            showToast('이 기기의 푸시 알림이 연결되었어요.');
            return buildResult({ status: 'granted', connected: true, action: 'enable' });
        } else if (result.status === 'token-missing') {
            showToast('알림 토큰을 아직 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
        } else if (result.status === 'error') {
            showToast('알림 연결 중 오류가 있었어요. 잠시 후 다시 시도해 주세요.');
        }
        return buildResult({ status: result.status || 'error', connected: false, action: 'enable' });
    } catch (error) {
        console.warn('[FCM] 권한 요청 실패:', error.message);
        showToast('알림 권한 확인 중 문제가 생겼어요.');
        return buildResult({ status: 'error', connected: false, action: state.action || 'enable' });
    } finally {
        updateNotificationPermissionCard(user);
    }
};

window.ensureAppNotificationPermission = function () {
    return window.requestAppNotificationPermission({ ensureEnabled: true });
};

window.addEventListener('pageshow', () => updateNotificationPermissionCard(auth.currentUser));
window.addEventListener('focus', () => updateNotificationPermissionCard(auth.currentUser));
window.addEventListener('install-cta-state-changed', () => updateNotificationPermissionCard(auth.currentUser));
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateNotificationPermissionCard(auth.currentUser);
});
