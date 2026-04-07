// ?몄쬆 愿由?紐⑤뱢
import { auth, db, functions, FCM_PUBLIC_VAPID_KEY, APP_ORIGIN, IS_LOCAL_ENV } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js";
import { showToast } from './ui-helpers.js';
import { getDatesInfo } from './ui-helpers.js';
import { escapeHtml } from './security.js';
// blockchain-manager???숈쟻 import (濡쒕뱶 ?ㅽ뙣?대룄 ?몄쬆???곹뼢 ?놁쓬)

const PENDING_REFERRAL_CODE_KEY = 'pendingReferralCode';
let _messagingPromise = null;
let _foregroundPushListenerBound = false;

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
    if (code === 'functions/not-found') return '?좏슚??珥덈? 留곹겕瑜?李얠? 紐삵뻽?댁슂.';
    if (code === 'functions/invalid-argument') return '??留곹겕?닿굅???ъ슜?????녿뒗 珥덈? 留곹겕?덉슂.';
    if (code === 'functions/already-exists') return '?대? ??珥덈? 留곹겕瑜??ъ슜?덉뼱??';
    if (code === 'functions/failed-precondition') return '?대? 泥섎━??移쒓뎄 ?곌껐?댁뿉??';
    if (code === 'functions/permission-denied') return '??珥덈? 留곹겕瑜?泥섎━??沅뚰븳???놁뼱??';
    return '珥덈? 留곹겕 泥섎━ 以?臾몄젣媛 ?앷꼈?댁슂. ?좎떆 ???ㅼ떆 ?쒕룄?댁＜?몄슂.';
}

async function maybePromptExistingMemberInviteFriendship(code) {
    const fn = httpsCallable(functions, 'acceptInviteLinkFriendship');

    try {
        const preview = await fn({ referralCode: code, previewOnly: true });
        const previewData = preview.data || {};
        const inviterName = previewData.inviterName || '移쒓뎄';

        if (previewData.status === 'self') {
            showToast('??珥덈? 留곹겕?덉슂. 移쒓뎄?먭쾶 蹂대궡蹂댁꽭??');
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return false;
        }

        if (previewData.status === 'already_active') {
            showToast('?대? 移쒓뎄濡??곌껐?섏뼱 ?덉뼱??');
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return true;
        }

        const confirmMessage = previewData.status === 'pending_to_active'
            ? `${inviterName}?섍낵 諛붾줈 移쒓뎄濡??곌껐?좉퉴??\n湲곗〈 ?붿껌???덉쑝硫?諛붾줈 ?곌껐濡?諛붾앸땲??`
            : `${inviterName}?섍낵 移쒓뎄濡??곌껐?좉퉴??\n珥덈? 留곹겕濡?諛붾줈 移쒓뎄 ?곌껐???꾨즺?⑸땲??`;

        const confirmed = window.confirm(confirmMessage);
        if (!confirmed) {
            clearPendingInviteRef();
            clearInviteRefFromUrl();
            return false;
        }

        const result = await fn({ referralCode: code });
        const resultData = result.data || {};
        showToast(resultData.status === 'already_active'
            ? '?대? 移쒓뎄濡??곌껐?섏뼱 ?덉뼱??'
            : `${inviterName}?섍낵 移쒓뎄 ?곌껐???꾨즺?먯뼱??`);

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
        showToast('??珥덈? 留곹겕?덉슂. 移쒓뎄?먭쾶 蹂대궡蹂댁꽭??');
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
                ? `珥덈? 蹂대꼫??${bonus}P? 移쒓뎄 ?곌껐???꾨즺?먯뼱??`
                : '珥덈? 留곹겕媛 ?곸슜?섍퀬 移쒓뎄 ?곌껐???꾨즺?먯뼱??');
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
        console.error('濡쒓렇??踰꾪듉??李얠쓣 ???놁뒿?덈떎.');
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
                        showToast('??留곹겕媛 蹂듭궗?섏뿀?듬땲?? 釉뚮씪?곗???遺숈뿬?ｊ린 ?댁＜?몄슂!');
                    }).catch(() => {
                        // clipboard API ?ㅽ뙣 ???대갚
                        const textArea = document.createElement('textarea');
                        textArea.value = window.location.href;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showToast('??留곹겕媛 蹂듭궗?섏뿀?듬땲?? 釉뚮씪?곗???遺숈뿬?ｊ린 ?댁＜?몄슂!');
                    });
                });
            }
        }
        return;
    }

    loginBtn.addEventListener('click', () => {
        window._isPopupLogin = true;
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        signInWithPopup(auth, provider).then(() => {
            window.location.reload();
        }).catch(error => {
            console.error('濡쒓렇???ㅻ쪟:', error.code, error.message, error);

            if (error.message && (error.message.includes('disallowed_useragent') || error.message.includes('web-storage-unsupported'))) {
                showWebViewWarning();
                return;
            }

            if (error.code === 'auth/popup-closed-by-user') {
                return;
            }
            window._isPopupLogin = false;

            let errorMsg = '濡쒓렇?몄뿉 ?ㅽ뙣?덉뒿?덈떎.';
            if (error.code === 'auth/popup-blocked') {
                errorMsg = '?앹뾽??李⑤떒?섏뿀?듬땲?? 釉뚮씪?곗? ?ㅼ젙?먯꽌 ?앹뾽???덉슜?댁＜?몄슂.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = '?ㅽ듃?뚰겕 ?ㅻ쪟媛 諛쒖깮?덉뒿?덈떎. ?명꽣???곌껐???뺤씤?댁＜?몄슂.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '???꾨찓?몄? ?뱀씤?섏? ?딆븯?듬땲?? 愿由ъ옄?먭쾶 臾몄쓽?섏꽭??';
            }
            showToast(`?좑툘 ${errorMsg} [${error.code || 'unknown'}]`);
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
                    showToast('??留곹겕媛 蹂듭궗?섏뿀?듬땲??');
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = window.location.href;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('??留곹겕媛 蹂듭궗?섏뿀?듬땲??');
                });
            });
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
                window.location.reload();
                return;
            }

            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('point-badge-ui').style.display = 'block';
            document.getElementById('date-ui').style.display = 'flex';
            window._wasLoggedIn = true;

            window._userDisplayName = user.displayName || '사용자';
            document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(window._userDisplayName)}`;

            // 利됱떆 ??쒕낫???닿린 (renderDashboard媛 ?먯껜 ?곗씠??濡쒕뵫 ?섑뻾)
            const params = new URLSearchParams(window.location.search);
            const urlTab = params.get('tab');
            const hashTab = window.location.hash.replace('#', '');
            const validTabs = ['dashboard', 'profile', 'gallery', 'assets'];
            const pendingChatbotToken = String(localStorage.getItem(CHATBOT_CONNECT_PENDING_KEY) || '').trim();
            const targetTab = pendingChatbotToken
                ? 'profile'
                : (urlTab && validTabs.includes(urlTab))
                    ? urlTab
                    : (hashTab && validTabs.includes(hashTab))
                        ? hashTab
                        : 'dashboard';
            if (window.openTab) {
                window.openTab(targetTab, false);
            }
            if (pendingChatbotToken && window.maybeHandleChatbotConnect) {
                setTimeout(() => {
                    window.maybeHandleChatbotConnect().catch(() => {});
                }, 120);
            }

            // ?앸떒/?대룞/留덉쓬 ???곗씠??濡쒕뱶 (諛깃렇?쇱슫?? ??쒕낫???뚮뜑 李⑤떒?섏? ?딆쓬)
            if (window.loadDataForSelectedDate) {
                window.loadDataForSelectedDate(todayStr);
            }

            // 媛ㅻ윭由?+ 吏媛??곗씠??諛깃렇?쇱슫??pre-fetch (???대┃ ?꾩뿉 誘몃━ 濡쒕뱶)
            setTimeout(() => {
                if (window.loadGalleryData) window.loadGalleryData();
                if (window.updateAssetDisplay) window.updateAssetDisplay();
            }, 800);

            // 諛깃렇?쇱슫?? ?ъ슜??臾몄꽌 濡쒕뱶 (?됰꽕??肄붿씤/?꾨줈???낅뜲?댄듃??
            const userRef = doc(db, "users", user.uid);
            getDoc(userRef).then(async userDoc => {
                // email + displayName ???(愿由ъ옄 ?붾㈃ ?쒖떆??, ?좉퇋 媛????createdAt 異붽?
                const updateData = {
                    email: user.email || '',
                    displayName: user.displayName || '사용자'
                };
                if (!userDoc.exists()) updateData.createdAt = serverTimestamp();
                await setDoc(userRef, updateData, { merge: true }).catch(() => {});
                const ud = userDoc.exists()
                    ? (userDoc.data() || {})
                    : { ...updateData };

                if (ud.customDisplayName) {
                    window._userDisplayName = ud.customDisplayName;
                    document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(ud.customDisplayName)}`;
                }
                const nicknameInput = document.getElementById('profile-nickname');
                if (nicknameInput) nicknameInput.value = window._userDisplayName;

                window._blockedUsers = ud.blockedUsers || [];

                if (ud.coins) document.getElementById('point-balance').innerText = ud.coins;

                // ?꾨줈????珥덈? 移대뱶 利됱떆 梨꾩슦湲?(updateAssetDisplay ?몄텧 ?꾩뿉???숈옉)
                if (ud.referralCode) {
                    const referralUrl = `${APP_ORIGIN}?ref=${ud.referralCode}`;
                    const pBox = document.getElementById('profile-invite-link-box');
                    const pLink = document.getElementById('profile-invite-link');
                    const pCode = document.getElementById('profile-invite-code');
                    if (pBox) pBox.style.display = 'block';
                    if (pLink) pLink.value = referralUrl;
                    if (pCode) pCode.textContent = ud.referralCode;
                }

                await maybeHandleInviteLinkAfterAuth(user, ud, {
                    isNewUser: !userDoc.exists()
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
                        if (dateEl) dateEl.textContent = `留덉?留?痢≪젙: ${prof.updatedAt.slice(0, 10)}`;
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

            // 10珥???釉붾줉泥댁씤 (媛????? ?곗꽑?쒖쐞)
            setTimeout(() => {
                if (window._loadBlockchainModule) {
                    window._loadBlockchainModule().then(() => {
                        import('./blockchain-manager.js').then(mod => {
                            const initWallet = mod.initializeWalletExternalFirst || mod.initializeUserWallet;
                            initWallet?.().catch(() => {});
                            mod.settleExpiredChallenges().then(() => {
                                getDoc(userRef).then(snap => {
                                    const ac = snap.data()?.activeChallenges || {};
                                    const claimable = Object.keys(ac).filter(t => ac[t]?.status === 'claimable');
                                    if (claimable.length > 0) {
                                        showToast('?럦 ?꾨즺??梨뚮┛吏媛 ?덉뒿?덈떎! ??吏媛묒뿉??蹂댁긽???섎졊?섏꽭??');
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
        console.warn('濡쒓렇?꾩썐 ?ㅻ쪟:', e.message);
        location.reload();
    }
};

// 怨꾩젙 ??젣 (Firestore ?곗씠??+ Storage ?뚯씪 + Auth 怨꾩젙)
window.deleteAccountAndData = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('?좑툘 濡쒓렇?몄씠 ?꾩슂?⑸땲??');
        return;
    }

    // 2?④퀎 ?뺤씤
    if (!confirm('?뺣쭚濡?怨꾩젙????젣?섏떆寃좎뒿?덇퉴?\n\n紐⑤뱺 ?곗씠???앸떒, ?대룞, ?섎㈃ 湲곕줉, ?ъ쭊, 嫄닿컯 ?꾨줈????媛 ?곴뎄 ??젣?섎ŉ 蹂듦뎄?????놁뒿?덈떎.')) {
        return;
    }
    if (!confirm('?좑툘 留덉?留??뺤씤?낅땲??\n\n??젣???곗씠?곕뒗 ?덈? 蹂듦뎄?????놁뒿?덈떎.\n?뺣쭚 ??젣?섏떆寃좎뒿?덇퉴?')) {
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = '?뿊截???젣 以?..';
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

        // 4. users/{uid} 硫붿씤 臾몄꽌 ??젣
        await deleteDoc(doc(db, 'users', uid));

        // 5. Storage ?뚯씪 ??젣 (Firebase Storage???대씪?댁뼵?몄뿉???대뜑 ??젣 遺덇? ??媛쒕퀎 ??젣 ?쒕룄)
        try {
            const { storage } = await import('./firebase-config.js');
            const { ref, listAll, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
            const userStorageRef = ref(storage, `uploads/${uid}`);
            const fileList = await listAll(userStorageRef);
            await Promise.all(fileList.items.map(item => deleteObject(item)));
        } catch (storageErr) {
            console.warn('Storage ?뚯씪 ??젣 ?쇰? ?ㅽ뙣 (怨꾩냽 吏꾪뻾):', storageErr.message);
        }

        // 6. Firebase Auth 怨꾩젙 ??젣 (?ъ씤利??꾩슂?????덉쓬)
        try {
            await deleteUser(user);
        } catch (authErr) {
            if (authErr.code === 'auth/requires-recent-login') {
                showToast('?뵎 蹂댁븞???꾪빐 ?ㅼ떆 濡쒓렇?명빐二쇱꽭??');
                const provider = new GoogleAuthProvider();
                await reauthenticateWithPopup(user, provider);
                await deleteUser(user);
            } else {
                throw authErr;
            }
        }

        // 濡쒖뺄 ?곗씠???뺣━
        localStorage.clear();

        showToast('??怨꾩젙???꾩쟾????젣?섏뿀?듬땲??');
        setTimeout(() => location.reload(), 1500);

    } catch (err) {
        console.error('怨꾩젙 ??젣 ?ㅻ쪟:', err);
        showToast('??怨꾩젙 ??젣 以??ㅻ쪟媛 諛쒖깮?덉뒿?덈떎: ' + err.message);
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = '?뿊截?怨꾩젙 ??젣';
        }
    }
};


function isIOSPushDevice() {
    const ua = navigator.userAgent || navigator.vendor || '';
    return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isStandalonePushMode() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isPushSupportedInBrowser() {
    return !IS_LOCAL_ENV && ('Notification' in window) && ('serviceWorker' in navigator);
}

function getPushBlockedInstructions() {
    if (isIOSPushDevice()) {
        return [
            '?뚮┝??李⑤떒?섏뼱 ?덉뼱??',
            '',
            '1. iPhone ?ㅼ젙?먯꽌 Safari ?먮뒗 ???붾㈃ ?깆쓽 ?뚮┝ ?ㅼ젙???댁뼱二쇱꽭??',
            '2. ?대튆?ㅼ엥 ?뚮┝???덉슜?쇰줈 諛붽퓭二쇱꽭??',
            '3. ?ㅼ떆 ?깆쑝濡??뚯븘? ?뚮┝ ?ㅼ떆 ?곌껐???뚮윭二쇱꽭??'
        ].join('\n');
    }

    return [
        '?뚮┝??李⑤떒?섏뼱 ?덉뼱??',
        '',
        '1. 釉뚮씪?곗? 二쇱냼李??쇱そ???ъ씠???ㅼ젙???댁뼱二쇱꽭??',
        '2. ?뚮┝ 沅뚰븳???덉슜?쇰줈 諛붽퓭二쇱꽭??',
        '3. ?ㅼ떆 ?뚯븘? ?뚮┝ ?ㅼ떆 ?곌껐???뚮윭二쇱꽭??'
    ].join('\n');
}

function getPushPermissionUiState(user = auth.currentUser) {
    if (!user) {
        return {
            status: '로그인 후 알림 상태를 확인할 수 있어요.',
            helper: '친구 요청, 챌린지 초대, 리마인더를 푸시 알림으로 받을 수 있어요.',
            buttonLabel: '로그인 필요',
            buttonMode: 'muted',
            disabled: true
        };
    }

    if (!isPushSupportedInBrowser()) {
        return {
            status: '현재 브라우저에서는 푸시 알림을 지원하지 않아요.',
            helper: 'Chrome, Edge, Safari 같은 지원 브라우저에서 알림을 켤 수 있어요.',
            buttonLabel: '알림 미지원',
            buttonMode: 'muted',
            disabled: true
        };
    }

    if (isIOSPushDevice() && !isStandalonePushMode()) {
        return {
            status: 'iPhone과 iPad에서는 홈 화면에 추가한 뒤 알림을 켤 수 있어요.',
            helper: '먼저 해빛스쿨을 홈 화면에 추가한 뒤, 설치된 앱에서 이 버튼을 눌러 알림을 켜주세요.',
            buttonLabel: '설치 안내',
            buttonMode: 'secondary',
            disabled: false
        };
    }

    if (Notification.permission === 'granted') {
        return {
            status: '이 기기에서 푸시 알림이 켜져 있어요.',
            helper: '친구 요청, 챌린지 초대, 리마인더를 즉시 푸시 알림으로 받을 수 있어요.',
            buttonLabel: '알림 다시 연결',
            buttonMode: 'secondary',
            disabled: false
        };
    }

    if (Notification.permission === 'denied') {
        return {
            status: '브라우저에서 알림이 차단되어 있어요.',
            helper: '설정에서 알림을 허용으로 바꾼 뒤 다시 연결하면 푸시 알림을 받을 수 있어요.',
            buttonLabel: '설정 방법 보기',
            buttonMode: 'secondary',
            disabled: false
        };
    }

    return {
        status: '버튼을 눌러 푸시 알림을 켜면 친구와 챌린지 소식을 바로 받을 수 있어요.',
        helper: '특히 iPhone은 설치된 홈 화면 앱에서 직접 눌러야 알림 권한을 요청할 수 있어요.',
        buttonLabel: '알림 켜기',
        buttonMode: 'primary',
        disabled: false
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
    buttonEl.classList.toggle('is-secondary', state.buttonMode === 'secondary');
    buttonEl.classList.toggle('is-muted', state.buttonMode === 'muted');
}

async function ensureFirebaseMessaging() {
    if (_messagingPromise) return _messagingPromise;

    _messagingPromise = import('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js')
        .then(({ getMessaging, getToken, onMessage }) => {
            const messaging = getMessaging();

            if (!_foregroundPushListenerBound) {
                onMessage(messaging, (payload) => {
                    const { title, body } = payload.data || {};
                    if (title || body) showToast(`${title || '해빛스쿨'} - ${body || ''}`);
                });
                _foregroundPushListenerBound = true;
            }

            return { messaging, getToken };
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

        await setDoc(doc(db, 'users', user.uid), {
            fcmToken: token
        }, { merge: true });

        return { status: 'granted', token };
    } catch (e) {
        console.warn('[FCM] 토큰 등록 실패:', e.message);
        return { status: 'error', message: e.message };
    }
}

async function syncCurrentPushState(user = auth.currentUser) {
    if (!user) {
        updateNotificationPermissionCard(null);
        return { status: 'signed-out' };
    }

    const result = await registerFCMToken(user);
    updateNotificationPermissionCard(user);
    return result;
}

window.requestAppNotificationPermission = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('먼저 로그인해 주세요.');
        return;
    }

    if (!isPushSupportedInBrowser()) {
        showToast('이 브라우저에서는 푸시 알림을 지원하지 않아요.');
        updateNotificationPermissionCard(user);
        return;
    }

    if (isIOSPushDevice() && !isStandalonePushMode()) {
        showToast('iPhone에서는 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요.');
        window.handleInstallCtaAction?.();
        updateNotificationPermissionCard(user);
        return;
    }

    if (Notification.permission === 'denied') {
        window.alert(getPushBlockedInstructions());
        updateNotificationPermissionCard(user);
        return;
    }

    const buttonEl = document.getElementById('notification-permission-btn');
    if (buttonEl) {
        buttonEl.disabled = true;
        buttonEl.textContent = '확인 중...';
    }

    try {
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
