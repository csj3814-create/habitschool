// ?몄쬆 愿由?紐⑤뱢
import { auth, db, functions, FCM_PUBLIC_VAPID_KEY, APP_ORIGIN, IS_LOCAL_ENV } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, getDocFromServer, setDoc, collection, query, where, getDocs, deleteDoc, deleteField, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { showToast } from './ui-helpers.js';
import { getDatesInfo } from './ui-helpers.js';
import { escapeHtml } from './security.js';
import { GOOGLE_LOGIN_PENDING_STATE_KEY, createPendingGoogleLoginState, parsePendingGoogleLoginState, shouldUseGoogleRedirectLogin } from './auth-login-helpers.js';
import { getAllowedTabsForMode, getDefaultTabForMode, getAppModeFromPath, normalizeTabForMode } from './app-mode.js';
// blockchain-manager???숈쟻 import (濡쒕뱶 ?ㅽ뙣?대룄 ?몄쬆???곹뼢 ?놁쓬)

const BLOCKCHAIN_MANAGER_MODULE_PATH = './blockchain-manager.js?v=157';

const PENDING_REFERRAL_CODE_KEY = 'pendingReferralCode';
const PENDING_SIGNUP_ONBOARDING_KEY = 'habitschoolPendingSignupOnboarding';
const PUSH_TOKEN_SUBCOLLECTION = 'pushTokens';
const PUSH_DEVICE_ID_STORAGE_KEY = 'habitschoolPushDeviceId';
let _messagingPromise = null;
let _foregroundPushListenerBound = false;
let _pushTokenLinked = false;
let _pushTokenValue = '';
let _ensureReferralCodeCallable = null;
let _googleLoginRecoveryBound = false;

function getEnsureReferralCodeCallable() {
    if (!_ensureReferralCodeCallable) {
        _ensureReferralCodeCallable = httpsCallable(functions, 'ensureReferralCode');
    }
    return _ensureReferralCodeCallable;
}

function rememberPendingSignupOnboarding(user) {
    try {
        if (!user?.uid) return;
        sessionStorage.setItem(PENDING_SIGNUP_ONBOARDING_KEY, JSON.stringify({
            uid: user.uid,
            createdAt: Date.now()
        }));
    } catch (_) {}
}

function clearPendingSignupOnboarding() {
    try {
        sessionStorage.removeItem(PENDING_SIGNUP_ONBOARDING_KEY);
    } catch (_) {}
}

function persistPendingGoogleLoginState(mode = 'popup') {
    try {
        sessionStorage.setItem(
            GOOGLE_LOGIN_PENDING_STATE_KEY,
            JSON.stringify(createPendingGoogleLoginState(mode))
        );
    } catch (_) {}
}

function readPendingGoogleLoginState() {
    try {
        return parsePendingGoogleLoginState(sessionStorage.getItem(GOOGLE_LOGIN_PENDING_STATE_KEY));
    } catch (_) {
        return null;
    }
}

function clearPendingGoogleLoginState() {
    try {
        sessionStorage.removeItem(GOOGLE_LOGIN_PENDING_STATE_KEY);
    } catch (_) {}
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
        console.warn('[FCM] 현재 기기 토큰 상태 확인 실패:', error.message);
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
    const needsServerRefresh = !initialSnap.exists()
        || resolvedData.coins == null
        || !normalizeInviteRefCode(resolvedData.referralCode);

    if (needsServerRefresh) {
        try {
            const serverSnap = await getDocFromServer(userRef);
            if (serverSnap.exists()) {
                resolvedSnap = serverSnap;
                resolvedData = serverSnap.data() || {};
            }
        } catch (error) {
            console.warn('사용자 최신 정보 서버 조회 실패:', error.message);
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

    const pointBalanceEl = document.getElementById('point-balance');
    if (pointBalanceEl && userData.coins != null) {
        pointBalanceEl.innerText = userData.coins;
    }

    const referralCode = normalizeInviteRefCode(userData.referralCode);
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
    if (!url.searchParams.has('ref')) return;
    url.searchParams.delete('ref');
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

// ?섏씠吏 濡쒕뱶 ???ref= ?뚮씪誘명꽣 ???(珥덈? 留곹겕)
const _refCode = getInviteRefFromUrl();
if (_refCode) {
    persistPendingInviteRef(_refCode);
}

const CHATBOT_CONNECT_PENDING_KEY = 'pendingChatbotConnectToken';
const _chatbotConnectTokenFromUrl = String(new URLSearchParams(window.location.search).get('chatbotConnectToken') || '').trim();
if (_chatbotConnectTokenFromUrl) {
    localStorage.setItem(CHATBOT_CONNECT_PENDING_KEY, _chatbotConnectTokenFromUrl);
}

// WebView(?몄빋 釉뚮씪?곗?) 媛먯?
function isWebView() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // 二쇱슂 ?몄빋 釉뚮씪?곗? ?⑦꽩
    const webviewPatterns = [
        /KAKAOTALK/i,
        /NAVER\(/i,           // ?ㅼ씠踰???(NAVER( ?⑦꽩)
        /NAVER/i,             // ?ㅼ씠踰?愿???꾨컲
        /NaverMatome/i,
        /FBAN|FBAV/i,         // Facebook
        /FB_IAB/i,            // Facebook In-App Browser
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,          // ?ㅼ쓬/移댁뭅??怨꾩뿴
        /everytimeApp/i,
        /BAND\//i,            // ?ㅼ씠踰?諛대뱶
        /Whale\//i,           // ?ㅼ씠踰??⑥씪 ????WebView
        /\bwv\b/i,            // Android WebView ?뚮옒洹?
        /;\s*wv\)/i,          // Android WebView (?뺥솗???⑦꽩)
        /WebView/i,
        /GSA\//i,             // Google Search App
        /\[FB/i,              // Facebook bracket ?⑦꽩
    ];

    // Safari媛 ?꾨땶??iOS??寃쎌슦 = WebView??媛?μ꽦 ?믪쓬
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    if (isIOS && !isSafari && !/Chrome|CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua)) return true;

    return webviewPatterns.some(pattern => pattern.test(ua));
}

// ?몃? 釉뚮씪?곗?濡??닿린 (Android intent, iOS Safari fallback)
function openInExternalBrowser() {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent || '';

    if (/android/i.test(ua)) {
        // Android: Chrome intent濡??닿린
        window.location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        // iOS: Safari濡??닿린 ?쒕룄
        window.location.href = currentUrl;
    } else {
        window.open(currentUrl, '_system');
    }
}

// 援ш? 濡쒓렇??
export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');

    if (!loginBtn) {
        console.error('로그인 버튼을 찾을 수 없습니다.');
        return;
    }

    // WebView 媛먯? ??寃쎄퀬 ?쒖떆
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

    bindPendingGoogleLoginRecovery();
    if (readPendingGoogleLoginState()) {
        loginBtn.disabled = true;
    }
    handleGoogleRedirectLoginResult(loginBtn).catch(() => {});

    loginBtn.addEventListener('click', () => {
        if (window._isPopupLogin) {
            return;
        }
        window._isPopupLogin = true;
        loginBtn.disabled = true;
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        const useRedirectLogin = shouldUseGoogleRedirectLogin(navigator.userAgent || navigator.vendor || '');
        persistPendingGoogleLoginState(useRedirectLogin ? 'redirect' : 'popup');

        if (useRedirectLogin) {
            signInWithRedirect(auth, provider).catch(error => {
                console.error('리디렉트 로그인 오류:', error.code, error.message, error);
                clearPendingGoogleLoginState();
                window._isPopupLogin = false;
                loginBtn.disabled = false;

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
            if (result?.additionalUserInfo?.isNewUser) {
                rememberPendingSignupOnboarding(result.user);
            } else {
                clearPendingSignupOnboarding();
            }
        }).catch(error => {
            console.error('로그인 오류:', error.code, error.message, error);

            if (error.message && (error.message.includes('disallowed_useragent') || error.message.includes('web-storage-unsupported'))) {
                clearPendingGoogleLoginState();
                showWebViewWarning();
                return;
            }

            if (error.code === 'auth/popup-closed-by-user') {
                clearPendingGoogleLoginState();
                window._isPopupLogin = false;
                loginBtn.disabled = false;
                return;
            }
            clearPendingGoogleLoginState();
            window._isPopupLogin = false;
            loginBtn.disabled = false;

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
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.disabled = false;

    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = 'none';

    const pointBadgeUi = document.getElementById('point-badge-ui');
    if (pointBadgeUi) pointBadgeUi.style.display = 'block';

    const dateUi = document.getElementById('date-ui');
    if (dateUi) dateUi.style.display = 'flex';

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
            bridgePopupLoginSuccess(result.user);
            if (result?.additionalUserInfo?.isNewUser) {
                rememberPendingSignupOnboarding(result.user);
            } else {
                clearPendingSignupOnboarding();
            }
        } else if (pendingState?.mode === 'redirect') {
            clearPendingSignupOnboarding();
        }
    } catch (error) {
        console.error('리디렉트 로그인 오류:', error.code, error.message, error);
        if (pendingState?.mode === 'redirect') {
            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
            }
            showToast(`오류: ${errorMsg} [${error.code || 'unknown'}]`);
        }
    } finally {
        if (!auth.currentUser) {
            window._isPopupLogin = false;
            if (loginBtn) loginBtn.disabled = false;
        }
        if (pendingState) {
            clearPendingGoogleLoginState();
        }
    }
}

// ?몄쬆 ?곹깭 蹂寃?由ъ뒪??
export function setupAuthListener(callbacks) {
    const { todayStr } = getDatesInfo();

    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (window._isPopupLogin) {
                window._isPopupLogin = false;
            }
            clearPendingGoogleLoginState();
            applySignedInShellUi(user);

            // 利됱떆 ??쒕낫???닿린 (renderDashboard媛 ?먯껜 ?곗씠??濡쒕뵫 ?섑뻾)
            const params = new URLSearchParams(window.location.search);
            const urlTab = params.get('tab');
            const appEntryFocus = params.get('focus');
            const hashTab = window.location.hash.replace('#', '');
            const appMode = getAppModeFromPath(window.location.pathname);
            const validTabs = getAllowedTabsForMode(appMode);
            const pendingChatbotToken = String(localStorage.getItem(CHATBOT_CONNECT_PENDING_KEY) || '').trim();
            const requestedTab = (urlTab && validTabs.includes(urlTab))
                ? urlTab
                : (hashTab && validTabs.includes(hashTab))
                    ? hashTab
                    : getDefaultTabForMode(appMode);
            const targetTab = normalizeTabForMode(requestedTab, appMode);
            if (window.openTab) {
                window.openTab(targetTab, false);
            }
            const initialDailyLoadPromise = window.loadDataForSelectedDate
                ? Promise.resolve(window.loadDataForSelectedDate(todayStr)).catch(() => {})
                : Promise.resolve();
            if (window.refreshPwaActionableBadgeFromServer) {
                setTimeout(() => {
                    window.refreshPwaActionableBadgeFromServer(user).catch(() => {});
                }, 180);
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

            // 媛ㅻ윭由?+ 吏媛??곗씠??諛깃렇?쇱슫??pre-fetch (???대┃ ?꾩뿉 誘몃━ 濡쒕뱶)
            setTimeout(() => {
                if (window.loadGalleryData) window.loadGalleryData();
                if (window.updateAssetDisplay) window.updateAssetDisplay();
            }, 800);

            // 諛깃렇?쇱슫?? ?ъ슜??臾몄꽌 濡쒕뱶 (?됰꽕??肄붿씤/?꾨줈???낅뜲?댄듃??
            const userRef = doc(db, "users", user.uid);
            getDoc(userRef).then(async userDoc => {
                const { snap: resolvedUserDoc, data: resolvedUserData } = await resolveLatestUserDocData(userRef, userDoc);
                const isNewUser = !resolvedUserDoc.exists();
                const updateData = {
                    email: user.email || '',
                    displayName: user.displayName || '사용자'
                };
                if (isNewUser) updateData.createdAt = serverTimestamp();
                await setDoc(userRef, updateData, { merge: true }).catch(() => {});
                const ud = {
                    ...resolvedUserData,
                    ...updateData
                };
                const ensuredReferralCode = await ensureSignedInUserReferralCode(ud);
                if (ensuredReferralCode) {
                    ud.referralCode = ensuredReferralCode;
                }

                await hydratePushTokenLinkState(user, ud);
                updateNotificationPermissionCard(user);
                if (Notification.permission === 'granted') {
                    setTimeout(() => {
                        syncCurrentPushState(user).catch(() => {});
                    }, 400);
                }

                await applySignedInUserUi(user, ud);

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

            // 5珥???遺媛 湲곕뒫 (??쒕낫???꾩쟾???쒖떆????
            setTimeout(() => {
                if (window.checkOnboarding) window.checkOnboarding();
                if (window.updateMetabolicScoreUI) window.updateMetabolicScoreUI();
                if (window.loadInbodyHistory) window.loadInbodyHistory();
                if (window.loadBloodTestHistory) window.loadBloodTestHistory();
                syncCurrentPushState(user).catch(() => {});
            }, 5000);

            const bootstrapBlockchainWallet = () => {
                if (!window._loadBlockchainModule) return;
                window._loadBlockchainModule().then(() => {
                    import(BLOCKCHAIN_MANAGER_MODULE_PATH).then(mod => {
                        const initWallet = mod.initializeWalletExternalFirst || mod.initializeUserWallet;
                        initWallet?.().catch(() => {});
                    }).catch(() => {});
                });
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
                    });
                }
            }, 10000);

            if (callbacks && callbacks.onLogin) callbacks.onLogin(user);
        } else {
            // 濡쒓렇?꾩썐 ??紐⑤뱺 由ъ냼???뺣━ (硫붾え由??꾩닔 諛⑹?)
            const loginBtn = document.getElementById('loginBtn');
            if (loginBtn) loginBtn.disabled = false;
            document.getElementById('login-modal').style.display = 'flex';
            document.getElementById('point-badge-ui').style.display = 'none';
            document.getElementById('date-ui').style.display = 'none';
            document.getElementById('user-greeting').innerHTML = '';
            window._userDisplayName = null;
            window._blockedUsers = [];

            // 媛ㅻ윭由?由ъ냼???뺣━
            if (window.cleanupGalleryResources) {
                window.cleanupGalleryResources();
            }

            // 濡쒓렇?꾩썐??寃쎌슦?먮쭔 媛ㅻ윭由???쑝濡??대룞 (珥덇린 cold start??濡쒓렇??紐⑤떖留??쒖떆)
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

            // 肄쒕갚 ?ㅽ뻾
            if (callbacks && callbacks.onLogout) {
                callbacks.onLogout();
            }
            updateNotificationPermissionCard(null);
        }
    });
}

// 濡쒓렇?꾩썐 ??濡쒓렇???붾㈃?쇰줈 蹂듦?
window.logoutAndReset = async function () {
    try {
        await signOut(auth);
    } catch (e) {
        console.warn('로그아웃 오류:', e.message);
        location.reload();
    }
};

// 怨꾩젙 ??젣 (Firestore ?곗씠??+ Storage ?뚯씪 + Auth 怨꾩젙)
window.deleteAccountAndData = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return;
    }

    if (!confirm('정말로 계정을 삭제하시겠습니까?\n\n모든 데이터(식단, 운동, 수면 기록, 사진, 건강 프로필 등)가 영구 삭제되며 복구할 수 없습니다.')) {
        return;
    }
    if (!confirm('마지막 확인입니다.\n\n삭제된 데이터는 절대 복구할 수 없습니다.\n정말 삭제하시겠습니까?')) {
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = '계정 삭제 중...';
    }

    try {
        const uid = user.uid;

        // 1. daily_logs ??젣 (userId 湲곕컲)
        const logsQuery = query(collection(db, 'daily_logs'), where('userId', '==', uid));
        const logsSnap = await getDocs(logsQuery);
        const batch1 = writeBatch(db);
        let count = 0;
        for (const docSnap of logsSnap.docs) {
            batch1.delete(docSnap.ref);
            count++;
            if (count >= 500) break; // Firestore batch limit
        }
        if (count > 0) await batch1.commit();

        // ?⑥? 臾몄꽌媛 ?덉쑝硫?異붽? ??젣
        if (logsSnap.docs.length > 500) {
            const batch2 = writeBatch(db);
            for (let i = 500; i < logsSnap.docs.length; i++) {
                batch2.delete(logsSnap.docs[i].ref);
            }
            await batch2.commit();
        }

        // 2. users/{uid}/inbodyHistory ?쒕툕而щ젆????젣
        const inbodySnap = await getDocs(collection(db, 'users', uid, 'inbodyHistory'));
        if (!inbodySnap.empty) {
            const batchInbody = writeBatch(db);
            inbodySnap.docs.forEach(d => batchInbody.delete(d.ref));
            await batchInbody.commit();
        }

        // 3. users/{uid}/bloodTests ?쒕툕而щ젆????젣
        const bloodSnap = await getDocs(collection(db, 'users', uid, 'bloodTests'));
        if (!bloodSnap.empty) {
            const batchBlood = writeBatch(db);
            bloodSnap.docs.forEach(d => batchBlood.delete(d.ref));
            await batchBlood.commit();
        }

        // 4. users/{uid}/pushTokens 서브컬렉션 삭제
        const pushTokenSnap = await getDocs(collection(db, 'users', uid, PUSH_TOKEN_SUBCOLLECTION));
        if (!pushTokenSnap.empty) {
            const batchPushTokens = writeBatch(db);
            pushTokenSnap.docs.forEach(d => batchPushTokens.delete(d.ref));
            await batchPushTokens.commit();
        }

        // 5. users/{uid} 메인 문서 삭제
        await deleteDoc(doc(db, 'users', uid));

        // 6. Storage ?뚯씪 ??젣 (Firebase Storage???대씪?댁뼵?몄뿉???대뜑 ??젣 遺덇? ??媛쒕퀎 ??젣 ?쒕룄)
        try {
            const { storage } = await import('./firebase-config.js');
            const { ref, listAll, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
            const userStorageRef = ref(storage, `uploads/${uid}`);
            const fileList = await listAll(userStorageRef);
            await Promise.all(fileList.items.map(item => deleteObject(item)));
        } catch (storageErr) {
            console.warn('Storage 파일 삭제 일부 실패 (계속 진행):', storageErr.message);
        }

        // 7. Firebase Auth 怨꾩젙 ??젣 (?ъ씤利??꾩슂?????덉쓬)
        try {
            await deleteUser(user);
        } catch (authErr) {
            if (authErr.code === 'auth/requires-recent-login') {
                showToast('보안을 위해 다시 로그인해주세요.');
                const provider = new GoogleAuthProvider();
                await reauthenticateWithPopup(user, provider);
                await deleteUser(user);
            } else {
                throw authErr;
            }
        }

        // 濡쒖뺄 ?곗씠???뺣━
        localStorage.clear();

        showToast('계정이 완전히 삭제되었습니다.');
        setTimeout(() => location.reload(), 1500);

    } catch (err) {
        console.error('계정 삭제 오류:', err);
        showToast('계정 삭제 중 오류가 발생했습니다: ' + err.message);
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
            status: 'iPhone과 iPad에서는 홈 화면에 추가한 뒤 알림을 켤 수 있어요.',
            helper: '먼저 해빛스쿨을 홈 화면에 추가한 뒤, 설치된 앱에서 이 버튼을 눌러 알림을 켜주세요.',
            buttonLabel: '홈 화면에 추가',
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

window.requestAppNotificationPermission = async function () {
    const user = auth.currentUser;
    const state = getPushPermissionUiState(user);
    if (!user) {
        showToast('먼저 로그인해 주세요.');
        return;
    }

    if (state.action === 'unsupported') {
        showToast('이 브라우저에서는 푸시 알림을 지원하지 않아요.');
        updateNotificationPermissionCard(user);
        return;
    }

    if (state.action === 'install') {
        window.handleInstallCtaAction?.();
        updateNotificationPermissionCard(user);
        return;
    }

    if (state.action === 'guide') {
        openNotificationPermissionGuide();
        updateNotificationPermissionCard(user);
        return;
    }

    const buttonEl = document.getElementById('notification-permission-btn');
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = '확인 중...';
    }

    try {
        if (state.action === 'disable') {
            const result = await disableFCMToken(user);
            if (result.status === 'disabled') {
                showToast('이 기기의 해빛스쿨 푸시 알림을 껐어요.');
            } else {
                showToast('알림 끄기 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
            }
            updateNotificationPermissionCard(user);
            return;
        }

        if (Notification.permission !== 'granted') {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                showToast(permission === 'denied' ? '알림 권한이 차단되었어요.' : '알림 권한 요청이 취소되었어요.');
                updateNotificationPermissionCard(user);
                return;
            }
        }

        const result = await registerFCMToken(user);
        if (result.status === 'granted') {
            showToast('이 기기의 푸시 알림이 연결되었어요.');
        } else if (result.status === 'token-missing') {
            showToast('알림 토큰을 아직 만들지 못했어요. 잠시 후 다시 시도해 주세요.');
        } else if (result.status === 'error') {
            showToast('알림 연결 중 오류가 있었어요. 잠시 후 다시 시도해 주세요.');
        }
    } catch (error) {
        console.warn('[FCM] 권한 요청 실패:', error.message);
        showToast('알림 권한 확인 중 문제가 생겼어요.');
    } finally {
        updateNotificationPermissionCard(user);
    }
};

window.addEventListener('pageshow', () => updateNotificationPermissionCard(auth.currentUser));
window.addEventListener('focus', () => updateNotificationPermissionCard(auth.currentUser));
window.addEventListener('install-cta-state-changed', () => updateNotificationPermissionCard(auth.currentUser));
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) updateNotificationPermissionCard(auth.currentUser);
});
