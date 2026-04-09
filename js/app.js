/**
 * app.js
 * 메인 애플리케이션 로직 모듈
 * index.html의 인라인 스크립트에서 추출
 */

// Firebase 모듈 임포트
import {
    increment, collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, startAfter, serverTimestamp, deleteField,
    arrayRemove, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// 프로젝트 모듈 임포트
import { auth, db, storage, functions, APP_ORIGIN, APP_OG_IMAGE_URL, MILESTONES, MISSIONS, MISSION_BADGES, MAX_IMG_SIZE, MAX_VID_SIZE, getWeekId } from './firebase-config.js';
import { applyAppModeChrome, buildAppModeUrl, getAllowedTabsForMode, getDefaultTabForMode, isSimpleMode, normalizeTabForMode } from './app-mode.js';
import { reconcileMilestoneState } from './milestone-helpers.js';
import { getDatesInfo, showToast, getKstDateString } from './ui-helpers.js';
import { sanitize, compressImage } from './data-manager.js';
import { escapeHtml, isValidStorageUrl, isPersistedStorageUrl, sanitizeText, isValidFileType, checkRateLimit } from './security.js';
import { requestDietAnalysis, renderDietAnalysisResult, renderDietDaySummary, renderExerciseAnalysisResult, requestSleepMindAnalysis, renderSleepMindAnalysisResult, requestBloodTestAnalysis, renderBloodTestResult, requestStepScreenshotAnalysis } from './diet-analysis.js';
import { calculateMetabolicScore, renderMetabolicScoreCard } from './metabolic-score.js';
// 전역 노출 함수 선언 (Hoisting 활용)
window.loadDataForSelectedDate = loadDataForSelectedDate;
window.renderDashboard = renderDashboard;
window.updateMetabolicScoreUI = updateMetabolicScoreUI;
window.setManualSteps = setManualSteps;
window.handleStepScreenshot = handleStepScreenshot;
window.analyzeStepScreenshot = analyzeStepScreenshot;

// CDN 라이브러리 동적 로드 (초기 JS 파싱 차단 제거)
// integrity: SRI 해시(sha256-/sha384-/sha512- 접두사 포함), crossOrigin: 기본 'anonymous'
function _loadScript(url, integrity, crossOrigin) {
    if (document.querySelector(`script[src="${url}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        if (integrity) { s.integrity = integrity; s.crossOrigin = crossOrigin || 'anonymous'; }
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
}
async function _ensureExif() {
    if (typeof EXIF !== 'undefined') return;
    // exif-js v2.3.0 — 버전 고정 + SRI
    await _loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js',
        'sha512-xsoiisGNT6Dw2Le1Cocn5305Uje1pOYeSzrpO3RD9K+JTpVH9KqSXksXqur8cobTEKJcFz0COYq4723mzo88/Q=='
    );
}
async function _ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return;
    // html2canvas v1.4.1 — SRI
    await _loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA=='
    );
}
async function _ensureKakao() {
    if (window.Kakao && Kakao.isInitialized()) return;
    // Kakao SDK: 1st-party CDN, SRI 미지원 (CORS 헤더 없음)
    await _loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js');
    if (window.Kakao && !Kakao.isInitialized()) Kakao.init('f179e091a7b2f4425918b0625aa0fabb');
}
window.checkOnboarding = checkOnboarding;
window.analyzeMealPhoto = analyzeMealPhoto;
window.completeOnboarding = completeOnboarding;
window.goOnboardingStep = goOnboardingStep;
window.openTab = openTab;
window.switchToDefaultMode = switchToDefaultMode;
window.loadGalleryData = loadGalleryData;
window.goToGalleryRecordAction = goToGalleryRecordAction;
window.triggerGalleryShareAction = triggerGalleryShareAction;
window.handleMissionPrimaryAction = handleMissionPrimaryAction;
window.toggleCommunityRows = toggleCommunityRows;
window.focusGalleryFeed = focusGalleryFeed;
window.toggleGalleryHeroGuide = toggleGalleryHeroGuide;
window.toggleRecordFlowCard = toggleRecordFlowCard;
window.toggleDashboardHero = toggleDashboardHero;
window.toggleDashboardMoreTools = toggleDashboardMoreTools;
window.handleDashboardMoreToolsToggle = handleDashboardMoreToolsToggle;
window.uploadBloodTestPhoto = uploadBloodTestPhoto;
window.loadBloodTestHistory = loadBloodTestHistory;
window.shareApp = shareApp;
window.changeDisplayName = changeDisplayName;
window.toggleChatbotLinkFallback = toggleChatbotLinkFallback;
window.generateChatbotLinkCode = generateChatbotLinkCode;
window.copyChatbotLinkCode = copyChatbotLinkCode;
window.cancelChatbotConnect = cancelChatbotConnect;
window.closeChatbotConnectModal = closeChatbotConnectModal;
window.confirmChatbotConnect = confirmChatbotConnect;
window.maybeHandleChatbotConnect = maybeHandleChatbotConnect;
window.handleLoggedOutChatbotConnect = handleLoggedOutChatbotConnect;
window.retryPendingChatbotConnect = retryPendingChatbotConnect;
window.dismissPendingChatbotConnect = dismissPendingChatbotConnect;
window.requestFriend = requestFriend;
window.requestFriendByCode = requestFriendByCode;
window.submitProfileFriendCode = submitProfileFriendCode;
window.respondFriendRequest = respondFriendRequest;
window.respondPendingFriendRequest = respondPendingFriendRequest;
window.removeFriendship = removeFriendship;
window.openFriendRequestModal = openFriendRequestModal;
window.closeFriendRequestModal = closeFriendRequestModal;
window.loadMyFriendships = loadMyFriendships;

const SHARE_SETTING_KEYS = ['hideIdentity', 'hideDate', 'hideDiet', 'hideExercise', 'hidePoints', 'hideMind'];
const SHARE_TEMPLATE_STORAGE_KEY = 'habitschool_share_template';
const SHARE_TEMPLATE_OPTIONS = ['grid', 'overlap', 'spotlight'];
const PENDING_SIGNUP_ONBOARDING_KEY = 'habitschoolPendingSignupOnboarding';
const GALLERY_HERO_GUIDE_STORAGE_KEY = 'habitschool_gallery_hero_collapsed';
const DASHBOARD_HERO_COLLAPSE_KEY = 'habitschool_dashboard_hero_collapsed';
const DASHBOARD_MORE_TOOLS_COLLAPSE_KEY = 'habitschool_dashboard_more_tools_collapsed';
const RECORD_GUIDE_STORAGE_KEYS = {
    diet: 'habitschool_record_guide_diet_collapsed',
    exercise: 'habitschool_record_guide_exercise_collapsed',
    sleep: 'habitschool_record_guide_sleep_collapsed'
};
const SHARE_TARGET_CACHE_NAME = 'habitschool-share-target-v1';
const SHARE_TARGET_MANIFEST_URL = new URL('/__share_target__/diet/manifest.json', window.location.origin).href;
const DIET_CATEGORY_LABELS = {
    breakfast: '첫 식사',
    lunch: '두 번째 식사',
    dinner: '세 번째 식사',
    snack: '간식'
};
let _shareSettingsDraft = getDefaultShareSettings();
let _shareSettingsPersistTimer = null;
let _shareSettingsExpanded = false;
let _shareCardBuildToken = 0;
let _latestPreparedShareMedia = [];
let _latestPreparedShareSignature = '';
let _shareTemplate = 'grid';
let _latestShareRenderKey = '';
let _latestSharePreviewDataUrl = '';
let _guideCollapseStateUid = '';
let _guideIntroFirstDay = false;
let _dashboardHeroCollapsed = null;
let _dashboardMoreCollapsed = null;
let _galleryHeroCollapsed = null;
let _recordGuideCollapsed = {
    diet: null,
    exercise: null,
    sleep: null
};
let cachedMyFriends = [];
let cachedMyFriendships = new Map();
let _friendshipsLoadedForUid = '';
let _friendshipsLoadingPromise = null;
let _friendshipsLoadingStartedAt = 0;
let _pendingFriendRequestId = null;
let _pendingSharedDietImportPromise = null;
let _lastDietAutoImportResult = null;
const FRIENDSHIP_LOAD_TIMEOUT_MS = 2500;
const SOCIAL_CHALLENGE_LOAD_TIMEOUT_MS = 2500;
const CHATBOT_CONNECT_API_ORIGIN = 'https://habitchatbot.onrender.com';
const CHATBOT_CONNECT_PENDING_KEY = 'pendingChatbotConnectToken';
const CHATBOT_CONNECT_FAILURE_KEY = 'pendingChatbotConnectFailure';
const CHATBOT_CONNECT_RETRY_COOLDOWN_MS = 60 * 1000;
const prepareShareMediaAssetsFn = httpsCallable(functions, 'prepareShareMediaAssets');
let _chatbotLinkFallbackExpanded = false;
let _chatbotConnectToken = '';
let _chatbotConnectInfo = null;
let _chatbotConnectInfoPromise = null;
let _chatbotConnectModalToken = '';
let _chatbotConnectCompleting = false;
let _chatbotConnectLoginPromptShown = false;
let _chatbotLinkStatusCache = {};
let _floatingBarLayoutFrame = 0;

applyAppModeChrome();

function normalizeShareTemplate(raw) {
    return SHARE_TEMPLATE_OPTIONS.includes(raw) ? raw : 'grid';
}

function replaceSharePreviewUrl(blob = null) {
    if (_latestSharePreviewDataUrl && _latestSharePreviewDataUrl.startsWith('blob:')) {
        try {
            URL.revokeObjectURL(_latestSharePreviewDataUrl);
        } catch (_) { }
    }
    _latestSharePreviewDataUrl = blob ? URL.createObjectURL(blob) : '';
    return _latestSharePreviewDataUrl;
}

function loadShareTemplatePreference() {
    try {
        return normalizeShareTemplate(localStorage.getItem(SHARE_TEMPLATE_STORAGE_KEY));
    } catch (_) {
        return 'grid';
    }
}

function saveShareTemplatePreference(template) {
    const normalized = normalizeShareTemplate(template);
    try {
        localStorage.setItem(SHARE_TEMPLATE_STORAGE_KEY, normalized);
    } catch (_) { }
    _shareTemplate = normalized;
    return normalized;
}

function getCurrentShareTemplate() {
    const activeButton = document.querySelector('.share-template-btn.is-active[data-share-template]');
    if (activeButton?.dataset?.shareTemplate) {
        return normalizeShareTemplate(activeButton.dataset.shareTemplate);
    }
    return normalizeShareTemplate(_shareTemplate);
}

function applyShareTemplateToControls(template) {
    const normalized = normalizeShareTemplate(template);
    _shareTemplate = normalized;
    document.querySelectorAll('.share-template-btn[data-share-template]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.shareTemplate === normalized);
        button.setAttribute('aria-pressed', String(button.dataset.shareTemplate === normalized));
    });
    return normalized;
}

_shareTemplate = loadShareTemplatePreference();

function updateFloatingBarLayout() {
    _floatingBarLayoutFrame = 0;
    const appContainer = document.querySelector('.app-container');
    const rect = appContainer?.getBoundingClientRect();
    const targetLeft = rect ? `${Math.max(rect.left, 0)}px` : '0px';
    const targetWidth = rect ? `${Math.min(rect.width, window.innerWidth)}px` : '100%';

    const submitBar = document.getElementById('submit-bar');
    if (submitBar) {
        submitBar.style.left = targetLeft;
        submitBar.style.right = 'auto';
        submitBar.style.transform = 'none';
        submitBar.style.width = targetWidth;
    }

    const chatBanner = document.getElementById('chat-banner');
    if (chatBanner) {
        chatBanner.style.left = targetLeft;
        chatBanner.style.right = 'auto';
        chatBanner.style.transform = 'none';
        chatBanner.style.width = targetWidth;
    }
}

function scheduleFloatingBarLayoutUpdate() {
    if (_floatingBarLayoutFrame) cancelAnimationFrame(_floatingBarLayoutFrame);
    _floatingBarLayoutFrame = requestAnimationFrame(updateFloatingBarLayout);
}

window.scheduleFloatingBarLayoutUpdate = scheduleFloatingBarLayoutUpdate;

function getInstallCtaState() {
    if (typeof window.getInstallCtaState !== 'function') {
        return { visible: false };
    }

    try {
        return window.getInstallCtaState() || { visible: false };
    } catch (error) {
        console.warn('설치 CTA 상태 조회 실패:', error.message);
        return { visible: false };
    }
}

function readPendingSignupOnboardingState() {
    try {
        const raw = sessionStorage.getItem(PENDING_SIGNUP_ONBOARDING_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const uid = String(parsed.uid || '').trim();
        const createdAt = Number(parsed.createdAt || 0);
        if (!uid || !Number.isFinite(createdAt) || createdAt <= 0) return null;
        return { uid, createdAt };
    } catch (_) {
        return null;
    }
}

function clearPendingSignupOnboardingState() {
    try {
        sessionStorage.removeItem(PENDING_SIGNUP_ONBOARDING_KEY);
    } catch (_) { }
}

function hasPendingSignupOnboarding(user) {
    const pending = readPendingSignupOnboardingState();
    if (!user?.uid || !pending || pending.uid !== user.uid) return false;
    return (Date.now() - pending.createdAt) <= 30 * 60 * 1000;
}

function resetSubmitBarMode() {
    const submitBar = document.getElementById('submit-bar');
    const saveBtn = document.getElementById('saveDataBtn');
    if (!submitBar || !saveBtn) return;

    submitBar.classList.remove('install-mode');
    saveBtn.classList.remove('install-mode');
    saveBtn.style.background = '';
    saveBtn.style.color = '';
    saveBtn.style.boxShadow = '';
    saveBtn.onclick = null;
    saveBtn.dataset.mode = 'save';
}

function applyDashboardInstallCta() {
    const submitBar = document.getElementById('submit-bar');
    const saveBtn = document.getElementById('saveDataBtn');
    const helperEl = document.getElementById('submit-bar-helper');
    if (!submitBar || !saveBtn || !helperEl) return false;

    const installState = getInstallCtaState();
    if (!installState.visible) {
        resetSubmitBarMode();
        helperEl.style.display = 'none';
        saveBtn.dataset.mode = '';
        return false;
    }

    resetSubmitBarMode();
    submitBar.style.display = 'block';
    submitBar.classList.add('install-mode');
    helperEl.style.display = 'block';
    helperEl.textContent = installState.helperText || '홈 화면에 추가하면 더 빠르게 다시 열 수 있어요.';
    saveBtn.classList.add('install-mode');
    saveBtn.dataset.mode = 'install';
    saveBtn.disabled = false;
    saveBtn.innerText = installState.buttonLabel || '해빛스쿨 앱 설치';
    return true;
}

function refreshDashboardInstallCta() {
    if (getVisibleTabName() !== 'dashboard') return;
    const submitBar = document.getElementById('submit-bar');
    if (!submitBar) return;
    if (!applyDashboardInstallCta()) {
        submitBar.style.display = 'none';
    }
    scheduleFloatingBarLayoutUpdate();
}

window.refreshDashboardInstallCta = refreshDashboardInstallCta;
window.addEventListener('install-cta-state-changed', refreshDashboardInstallCta);

const _pwaActionableBadgeState = {
    friendRequests: 0,
    challengeInvites: 0
};

function supportsPwaActionableBadge() {
    return typeof navigator !== 'undefined'
        && (typeof navigator.setAppBadge === 'function' || typeof navigator.clearAppBadge === 'function');
}

async function syncPwaActionableBadge() {
    if (!supportsPwaActionableBadge()) return 0;
    const total = Math.max(0,
        Number(_pwaActionableBadgeState.friendRequests || 0)
        + Number(_pwaActionableBadgeState.challengeInvites || 0)
    );

    try {
        if (total > 0 && typeof navigator.setAppBadge === 'function') {
            await navigator.setAppBadge(total);
        } else if (total === 0 && typeof navigator.clearAppBadge === 'function') {
            await navigator.clearAppBadge();
        }
    } catch (_) {}

    return total;
}

function updatePwaActionableBadge(nextCounts = {}) {
    if (nextCounts && Object.prototype.hasOwnProperty.call(nextCounts, 'friendRequests')) {
        _pwaActionableBadgeState.friendRequests = Math.max(0, Number(nextCounts.friendRequests) || 0);
    }
    if (nextCounts && Object.prototype.hasOwnProperty.call(nextCounts, 'challengeInvites')) {
        _pwaActionableBadgeState.challengeInvites = Math.max(0, Number(nextCounts.challengeInvites) || 0);
    }
    return syncPwaActionableBadge();
}

function clearPwaActionableBadge() {
    _pwaActionableBadgeState.friendRequests = 0;
    _pwaActionableBadgeState.challengeInvites = 0;
    return syncPwaActionableBadge();
}

window.updatePwaActionableBadge = updatePwaActionableBadge;
window.clearPwaActionableBadge = clearPwaActionableBadge;
window.refreshPwaActionableBadgeFromServer = async function(user = auth.currentUser) {
    if (!user) {
        await clearPwaActionableBadge();
        return 0;
    }

    try {
        await loadMyFriendships();
    } catch (_) {}

    let challengeInvites = _pwaActionableBadgeState.challengeInvites;
    try {
        const inviteSnap = await getDocs(query(
            collection(db, 'social_challenges'),
            where('invitees', 'array-contains', user.uid),
            where('status', '==', 'pending'),
            limit(10)
        ));
        challengeInvites = inviteSnap.size;
    } catch (_) {}

    return updatePwaActionableBadge({
        friendRequests: getIncomingFriendRequests().length,
        challengeInvites
    });
};

function focusElementWithHighlight(target) {
    if (!target) return;
    target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
    target.classList.add('is-highlighted');
    window.setTimeout(() => target.classList.remove('is-highlighted'), 1500);
}

async function getPendingDietShareManifest() {
    if (!('caches' in window)) return null;
    try {
        const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
        const response = await cache.match(SHARE_TARGET_MANIFEST_URL);
        if (!response) return null;
        return await response.json();
    } catch (_) {
        return null;
    }
}

async function clearPendingDietShareTarget(manifest = null) {
    if (!('caches' in window)) return;
    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    const currentManifest = manifest || await getPendingDietShareManifest();
    const itemUrls = Array.isArray(currentManifest?.items)
        ? currentManifest.items.map(item => String(item?.url || '')).filter(Boolean)
        : [];
    await Promise.all([
        cache.delete(SHARE_TARGET_MANIFEST_URL),
        ...itemUrls.map((url) => cache.delete(url))
    ]);
}

async function readPendingDietShareFiles(manifest = null) {
    if (!('caches' in window)) return { manifest: null, files: [] };
    const currentManifest = manifest || await getPendingDietShareManifest();
    if (!currentManifest || !Array.isArray(currentManifest.items) || currentManifest.items.length === 0) {
        return { manifest: currentManifest, files: [] };
    }

    const cache = await caches.open(SHARE_TARGET_CACHE_NAME);
    const files = [];
    for (let index = 0; index < currentManifest.items.length; index += 1) {
        const item = currentManifest.items[index];
        const itemUrl = String(item?.url || '').trim();
        if (!itemUrl) continue;

        const response = await cache.match(itemUrl);
        if (!response) continue;
        const blob = await response.blob();
        const type = String(item?.type || blob.type || 'image/jpeg').trim() || 'image/jpeg';
        if (!type.startsWith('image/')) continue;

        const name = String(item?.name || `shared-diet-${index + 1}.jpg`).trim() || `shared-diet-${index + 1}.jpg`;
        const lastModified = Number(item?.lastModified || currentManifest.createdAt || Date.now()) || Date.now();
        files.push(new File([blob], name, { type, lastModified }));
    }

    return { manifest: currentManifest, files };
}

async function importPendingDietShareTarget() {
    if (_pendingSharedDietImportPromise) {
        return _pendingSharedDietImportPromise;
    }

    _pendingSharedDietImportPromise = (async () => {
        const { manifest, files } = await readPendingDietShareFiles();
        if (!manifest || files.length === 0) {
            if (manifest) {
                await clearPendingDietShareTarget(manifest);
            }
            return 0;
        }

        openTab('diet', false);
        const selectedDate = document.getElementById('selected-date')?.value;
        if (selectedDate && typeof loadDataForSelectedDate === 'function') {
            await loadDataForSelectedDate(selectedDate);
        }

        const importedCount = await importDietFilesIntoEmptySlots(files);
        await clearPendingDietShareTarget(manifest);
        return importedCount;
    })().finally(() => {
        _pendingSharedDietImportPromise = null;
    });

    return _pendingSharedDietImportPromise;
}

let _pendingNativeStepImport = null;
let _activeNativeStepImport = null;
const NATIVE_APP_SOURCE_SESSION_KEY = 'habitschoolNativeAppSource';

function rememberNativeAppSource(params = getAppEntryDeepLinkParams()) {
    const source = String(params?.native || '').trim();
    if (!source) return getRememberedNativeAppSource();
    try {
        sessionStorage.setItem(NATIVE_APP_SOURCE_SESSION_KEY, source);
    } catch (_) { }
    return source;
}

function getRememberedNativeAppSource() {
    try {
        const params = new URLSearchParams(window.location.search);
        const source = String(params.get('native') || '').trim();
        if (source) {
            sessionStorage.setItem(NATIVE_APP_SOURCE_SESSION_KEY, source);
            return source;
        }
    } catch (_) { }

    try {
        return String(sessionStorage.getItem(NATIVE_APP_SOURCE_SESSION_KEY) || '').trim();
    } catch (_) {
        return '';
    }
}

function getAppEntryDeepLinkParams() {
    const url = new URL(window.location.href);
    return {
        tab: String(url.searchParams.get('tab') || '').trim(),
        native: String(url.searchParams.get('native') || '').trim(),
        panel: String(url.searchParams.get('panel') || '').trim(),
        focus: String(url.searchParams.get('focus') || '').trim(),
        stepCount: String(url.searchParams.get('stepCount') || '').trim(),
        stepSource: String(url.searchParams.get('stepSource') || '').trim(),
        stepProvider: String(url.searchParams.get('stepProvider') || '').trim(),
        syncedAt: String(url.searchParams.get('syncedAt') || '').trim(),
        friendshipId: String(url.searchParams.get('friendshipId') || '').trim(),
        challengeId: String(url.searchParams.get('challengeId') || '').trim()
    };
}

function clearAppEntryDeepLinkParams(tabName = getVisibleTabName()) {
    const url = new URL(window.location.href);
    let changed = false;
    ['tab', 'native', 'panel', 'focus', 'stepCount', 'stepSource', 'stepProvider', 'syncedAt', 'friendshipId', 'challengeId'].forEach(key => {
        if (url.searchParams.has(key)) {
            url.searchParams.delete(key);
            changed = true;
        }
    });
    if (!changed) return;
    const nextTab = tabName || getVisibleTabName() || getDefaultTabForMode();
    url.hash = `#${nextTab}`;
    history.replaceState({ tab: nextTab }, '', `${url.pathname}${url.search}${url.hash}`);
}

async function handleProfileFriendsDeepLink({ friendshipId = '', panel = 'friends' } = {}) {
    await loadMyFriendships();
    const preferRequests = panel !== 'invite';
    const focusCard = () => {
        const target = preferRequests
            ? document.getElementById('profile-friend-requests-card')
            : document.getElementById('profile-friend-invite-card');
        if (target) {
            focusElementWithHighlight(target);
            return;
        }
        focusProfileFriendCard(preferRequests);
    };

    requestAnimationFrame(focusCard);
    window.setTimeout(focusCard, 180);

    if (friendshipId && preferRequests) {
        window.setTimeout(() => {
            openFriendRequestModal(friendshipId).catch(error => {
                console.warn('[handleAppEntryDeepLink] friend request modal failed:', error.message);
            });
        }, 260);
    }
}

async function handleChallengeDeepLink(challengeId = '') {
    const user = auth.currentUser;
    if (!user) return;

    await renderSocialChallenges(user).catch(error => {
        console.warn('[handleAppEntryDeepLink] challenge card render failed:', error.message);
    });

    const focusCard = () => {
        const card = document.getElementById('social-challenge-card');
        if (card) focusElementWithHighlight(card);
    };
    requestAnimationFrame(focusCard);
    window.setTimeout(focusCard, 180);

    if (challengeId) {
        window.setTimeout(() => {
            Promise.resolve(window.openChallengeInviteModal?.(challengeId)).catch(error => {
                console.warn('[handleAppEntryDeepLink] challenge invite modal failed:', error.message);
            });
        }, 260);
    }
}

function handleDietUploadDeepLink() {
    const target = document.querySelector('#diet .upload-cta-split')
        || document.querySelector('#diet .record-flow-card');
    focusElementWithHighlight(target);
}

function renderDietShareImportBanner() {
    const banner = document.getElementById('diet-share-import-banner');
    if (!banner) return;

    const result = _lastDietAutoImportResult;
    if (!result || !Number.isFinite(result.assignedCount) || result.assignedCount <= 0) {
        banner.style.display = 'none';
        banner.classList.remove('is-visible');
        banner.innerHTML = '';
        return;
    }

    const assignedLabels = (result.assignedCategories || [])
        .map((category) => DIET_CATEGORY_LABELS[category] || category)
        .filter(Boolean);
    const assignedCopy = assignedLabels.length > 0
        ? `${assignedLabels.join(', ')} 칸에 바로 배치했어요.`
        : '빈 식사 칸에 바로 배치했어요.';
    const skippedCopy = result.skippedCount > 0
        ? `선택한 날짜와 다른 사진 ${result.skippedCount}장은 제외됐어요.`
        : '';
    const overflowCopy = result.overflowCount > 0
        ? `빈 칸이 부족해 ${result.overflowCount}장은 아직 넣지 못했어요.`
        : '';
    const bodyParts = [assignedCopy, skippedCopy, overflowCopy].filter(Boolean);

    banner.innerHTML = `
        <div class="diet-share-import-banner-icon" aria-hidden="true">📥</div>
        <div class="diet-share-import-banner-copy">
            <div class="diet-share-import-banner-title">공유한 식단 사진 ${result.assignedCount}장을 불러왔어요</div>
            <div class="diet-share-import-banner-body">${bodyParts.join(' ')}</div>
        </div>
    `;
    banner.style.display = 'flex';
    banner.classList.add('is-visible');
}

function focusDietImportResult() {
    const assignedCategories = Array.isArray(_lastDietAutoImportResult?.assignedCategories)
        ? _lastDietAutoImportResult.assignedCategories
        : [];
    const firstCategory = assignedCategories[0];
    if (!firstCategory) {
        handleDietUploadDeepLink();
        return;
    }

    const target = document.getElementById(`diet-box-${firstCategory}`)
        || document.getElementById(`preview-${firstCategory}`)
        || document.querySelector('#diet .card');
    focusElementWithHighlight(target);
}

async function handleSharedDietUploadDeepLink() {
    const importedCount = await importPendingDietShareTarget().catch((error) => {
        console.warn('[handleSharedDietUploadDeepLink] shared diet import failed:', error?.message || error);
        return 0;
    });

    const focusSharedImport = () => {
        if ((_lastDietAutoImportResult?.assignedCount || 0) > 0) {
            focusDietImportResult();
            return;
        }
        handleDietUploadDeepLink();
    };

    requestAnimationFrame(focusSharedImport);
    window.setTimeout(focusSharedImport, 180);

    if (importedCount > 0) {
        showToast(`📥 공유한 식단 사진 ${importedCount}장을 불러왔어요.`);
    } else {
        showToast('공유한 사진은 자동 저장되지 않아요. 원하는 칸에 직접 올려 주세요.');
    }

    return importedCount;
}

function parseNativeStepImportPayload(params = getAppEntryDeepLinkParams()) {
    if (params.focus !== 'health-connect-steps') return null;

    const stepCount = Number.parseInt(params.stepCount, 10);
    if (!Number.isFinite(stepCount) || stepCount < 0) return null;

    const syncedAtEpochMillis = Number.parseInt(params.syncedAt, 10);
    return {
        stepCount,
        stepSource: 'health_connect',
        stepProviderLabel: params.stepProvider || 'Health Connect',
        nativeSource: params.native || 'android-shell',
        syncedAtEpochMillis: Number.isFinite(syncedAtEpochMillis) && syncedAtEpochMillis > 0 ? syncedAtEpochMillis : 0
    };
}

function formatNativeStepSyncTime(epochMillis = 0) {
    if (!Number.isFinite(epochMillis) || epochMillis <= 0) return '';
    try {
        return new Intl.DateTimeFormat('ko-KR', {
            hour: 'numeric',
            minute: '2-digit'
        }).format(new Date(epochMillis));
    } catch (_) {
        return '';
    }
}

function getNativeSurfaceLabel(nativeSource = '') {
    switch (String(nativeSource || '').trim()) {
        case 'android-widget':
            return '홈 위젯';
        case 'android-tile':
            return '퀵패널 타일';
        case 'android-web-sync':
            return '운동 탭 버튼';
        case 'widget':
        case 'android-widget-sync':
            return 'Android 위젯';
        case 'qs-tile':
            return '퀵패널';
        default:
            return 'Android 앱';
    }
}

function renderExerciseNativeSyncCta() {
    const button = document.getElementById('exercise-health-connect-btn');
    if (!button) return;

    const nativeSource = getRememberedNativeAppSource();
    if (!nativeSource) {
        button.style.display = 'none';
        return;
    }

    button.style.display = 'inline-flex';
    button.textContent = String(_stepData?.source || '').trim() === 'health_connect'
        ? 'Health Connect 다시 가져오기'
        : 'Health Connect에서 가져오기';
}

function startNativeHealthConnectSync() {
    const nativeSource = getRememberedNativeAppSource();
    if (!nativeSource) {
        showToast('Android 앱 셸에서만 Health Connect 동기화를 시작할 수 있어요.');
        return;
    }

    const syncUrl = new URL('habitschool://health-connect/sync');
    syncUrl.searchParams.set('source', 'android-web-sync');
    window.location.href = syncUrl.toString();
}

window.startNativeHealthConnectSync = startNativeHealthConnectSync;

function renderStepImportBanner() {
    const banner = document.getElementById('step-import-banner');
    if (!banner) return;

    if (String(_stepData?.source || '').trim() !== 'health_connect') {
        banner.style.display = 'none';
        banner.classList.remove('is-visible');
        banner.innerHTML = '';
        renderExerciseNativeSyncCta();
        return;
    }

    const stepCount = Number.parseInt(_stepData?.count, 10);
    if (!Number.isFinite(stepCount) || stepCount < 0) {
        banner.style.display = 'none';
        banner.classList.remove('is-visible');
        banner.innerHTML = '';
        renderExerciseNativeSyncCta();
        return;
    }

    const surfaceLabel = getNativeSurfaceLabel(_activeNativeStepImport?.nativeSource);
    const savedSyncedAt = Date.parse(_stepData?.updatedAt || '');
    const syncedAtEpochMillis = Number.isFinite(_activeNativeStepImport?.syncedAtEpochMillis)
        ? _activeNativeStepImport.syncedAtEpochMillis
        : (Number.isFinite(savedSyncedAt) ? savedSyncedAt : 0);
    const syncTimeLabel = formatNativeStepSyncTime(syncedAtEpochMillis);

    banner.innerHTML = `
        <div class="step-import-banner-icon" aria-hidden="true">📲</div>
        <div class="step-import-banner-copy">
            <div class="step-import-banner-title">${_activeNativeStepImport?.stepProviderLabel || 'Health Connect'} ${stepCount.toLocaleString()}보 반영됨</div>
            <div class="step-import-banner-body">${surfaceLabel}에서 동기화한 걸음수입니다${syncTimeLabel ? ` · ${syncTimeLabel} 기준` : ''}.</div>
        </div>
    `;
    banner.style.display = 'flex';
    banner.classList.add('is-visible');
    renderExerciseNativeSyncCta();
}

function applyPendingNativeStepImport() {
    if (!_pendingNativeStepImport) return false;

    const payload = _pendingNativeStepImport;
    _pendingNativeStepImport = null;
    _activeNativeStepImport = payload;

    const updatedAt = payload.syncedAtEpochMillis > 0
        ? new Date(payload.syncedAtEpochMillis).toISOString()
        : new Date().toISOString();

    _stepData = {
        count: payload.stepCount,
        source: payload.stepSource,
        screenshotUrl: null,
        screenshotThumbUrl: null,
        imageHash: null,
        distance_km: null,
        calories: null,
        active_minutes: null,
        updatedAt
    };

    const preview = document.getElementById('preview-step-screenshot');
    if (preview) {
        preview.src = '';
        preview.style.display = 'none';
    }

    const detailsDiv = document.getElementById('step-details');
    if (detailsDiv) detailsDiv.style.display = 'none';

    const aiBtn = document.getElementById('ai-btn-step');
    if (aiBtn) aiBtn.style.display = 'none';

    const resultBox = document.getElementById('step-analysis-result');
    if (resultBox) {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
    }

    const manualInput = document.getElementById('step-manual-input');
    if (manualInput) manualInput.value = String(payload.stepCount);

    updateStepRing(payload.stepCount);
    renderStepImportBanner();
    showToast(`👟 ${payload.stepProviderLabel || 'Health Connect'}에서 ${payload.stepCount.toLocaleString()}보를 가져왔어요. 저장 버튼을 누르면 기록에 반영됩니다.`);
    return true;
}

function handleNativeStepImportDeepLink(params = getAppEntryDeepLinkParams()) {
    const payload = parseNativeStepImportPayload(params);
    if (!payload) return false;

    _pendingNativeStepImport = payload;
    if (getVisibleTabName() !== 'exercise') {
        openTab('exercise', false);
    }

    const tryApply = () => {
        if (!applyPendingNativeStepImport()) return;
        const target = document.getElementById('step-card');
        requestAnimationFrame(() => focusElementWithHighlight(target));
        window.setTimeout(() => focusElementWithHighlight(target), 180);
    };

    requestAnimationFrame(tryApply);
    window.setTimeout(tryApply, 220);
    return true;
}

window.handleAppEntryDeepLink = async function({ initialTab = getVisibleTabName() } = {}) {
    const params = getAppEntryDeepLinkParams();
    rememberNativeAppSource(params);
    if (!params.panel && !params.focus && !params.friendshipId && !params.challengeId) return false;

    if (params.panel === 'friends' || params.panel === 'invite' || params.friendshipId) {
        await handleProfileFriendsDeepLink({
            friendshipId: params.friendshipId,
            panel: params.panel || 'friends'
        });
        clearAppEntryDeepLinkParams('profile');
        return true;
    }

    if (params.panel === 'challenge' || params.challengeId) {
        await handleChallengeDeepLink(params.challengeId);
        clearAppEntryDeepLinkParams('dashboard');
        return true;
    }

    if (params.focus === 'health-connect-steps' && (params.tab === 'exercise' || initialTab === 'exercise')) {
        handleNativeStepImportDeepLink(params);
        clearAppEntryDeepLinkParams('exercise');
        return true;
    }

    if (params.focus === 'shared-upload' && (params.tab === 'diet' || initialTab === 'diet')) {
        await handleSharedDietUploadDeepLink();
        clearAppEntryDeepLinkParams('diet');
        return true;
    }

    if (params.focus === 'upload' && (params.tab === 'diet' || initialTab === 'diet')) {
        requestAnimationFrame(handleDietUploadDeepLink);
        window.setTimeout(handleDietUploadDeepLink, 180);
        clearAppEntryDeepLinkParams('diet');
        return true;
    }

    return false;
};

function getDefaultShareSettings() {
    return {
        hideIdentity: false,
        hideDate: false,
        hideDiet: false,
        hideExercise: false,
        hidePoints: false,
        hideMind: false
    };
}

function normalizeShareSettings(raw) {
    const normalized = getDefaultShareSettings();
    if (!raw || typeof raw !== 'object') return normalized;

    SHARE_SETTING_KEYS.forEach(key => {
        normalized[key] = raw[key] === true;
    });

    // 레거시 호환: 기존 hideMindText 저장값을 hideMind로 승격
    if (!('hideMind' in raw) && raw.hideMindText === true) {
        normalized.hideMind = true;
    }
    return normalized;
}

function getCurrentShareSettings() {
    const controls = {
        hideIdentity: document.getElementById('share-hide-identity')?.checked,
        hideDate: document.getElementById('share-hide-date')?.checked,
        hideDiet: document.getElementById('share-hide-diet')?.checked,
        hideExercise: document.getElementById('share-hide-exercise')?.checked,
        hidePoints: document.getElementById('share-hide-points')?.checked,
        hideMind: document.getElementById('share-hide-mind')?.checked
    };
    const hasControls = Object.values(controls).some(value => typeof value === 'boolean');
    return hasControls ? normalizeShareSettings(controls) : normalizeShareSettings(_shareSettingsDraft);
}

function updateShareSettingsSummary(settings = getCurrentShareSettings()) {
    const summaryEl = document.getElementById('share-settings-summary');
    if (!summaryEl) return;

    const hiddenCount = Object.values(settings).filter(Boolean).length;
    summaryEl.textContent = hiddenCount > 0
        ? `${hiddenCount}개 숨김 · 공유 중`
        : '기본 공유 중 · 숨길 항목 선택';
}

function applyShareSettingsToControls(settings) {
    const normalized = normalizeShareSettings(settings);
    _shareSettingsDraft = normalized;

    const controlMap = {
        'share-hide-identity': 'hideIdentity',
        'share-hide-date': 'hideDate',
        'share-hide-diet': 'hideDiet',
        'share-hide-exercise': 'hideExercise',
        'share-hide-points': 'hidePoints',
        'share-hide-mind': 'hideMind'
    };

    Object.entries(controlMap).forEach(([id, key]) => {
        const control = document.getElementById(id);
        if (control) control.checked = normalized[key];
    });

    updateShareSettingsSummary(normalized);
    return normalized;
}

function getCurrentShareLog(userId) {
    const { todayStr, yesterdayStr } = getDatesInfo();
    return cachedGalleryLogs.find(item =>
        item?.data?.userId === userId && (item.data.date === todayStr || item.data.date === yesterdayStr)
    ) || null;
}

function collectShareCardMedia(latest, settings = getDefaultShareSettings()) {
    if (!latest) return [];

    const items = [];
    const addMedia = (previewUrl, originalUrl, category, type = null) => {
        const normalizedPreviewUrl = String(previewUrl || '').trim();
        const normalizedOriginalUrl = String(originalUrl || '').trim();
        const primaryUrl = normalizedPreviewUrl || normalizedOriginalUrl;
        if (!primaryUrl) return;
        const resolvedType = type || (isVideoUrl(normalizedOriginalUrl || primaryUrl) ? 'video' : 'image');
        const candidateUrls = [normalizedPreviewUrl, normalizedOriginalUrl].filter(Boolean);
        items.push({
            originalUrl: normalizedOriginalUrl || primaryUrl,
            previewUrl: normalizedPreviewUrl || normalizedOriginalUrl || primaryUrl,
            src: normalizedPreviewUrl || normalizedOriginalUrl || primaryUrl,
            type: resolvedType,
            category,
            candidateUrls
        });
    };

    if (latest.diet && !settings.hideDiet) {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(meal => {
            addMedia(latest.diet[`${meal}ThumbUrl`], latest.diet[`${meal}Url`], '식단');
        });
    }

    if (latest.exercise && !settings.hideExercise) {
        if (latest.exercise.cardioList?.length) {
            latest.exercise.cardioList.forEach(item => {
                addMedia(item.imageThumbUrl, item.imageUrl, '운동');
            });
        } else {
            addMedia(latest.exercise.cardioImageThumbUrl, latest.exercise.cardioImageUrl, '운동');
        }

        if (latest.exercise.strengthList?.length) {
            latest.exercise.strengthList.forEach(item => {
                const localThumb = findLocalExerciseVideoThumb(item.videoUrl);
                addMedia(localThumb || item.videoThumbUrl, item.videoUrl, '운동', (localThumb || item.videoThumbUrl) ? 'image' : 'video');
            });
        } else {
            const localThumb = findLocalExerciseVideoThumb(latest.exercise.strengthVideoUrl);
            addMedia(
                localThumb || latest.exercise.strengthVideoThumbUrl,
                latest.exercise.strengthVideoUrl,
                '운동',
                (localThumb || latest.exercise.strengthVideoThumbUrl) ? 'image' : 'video'
            );
        }
    }

    if (!settings.hideMind) {
        addMedia(latest.sleepAndMind?.sleepImageThumbUrl, latest.sleepAndMind?.sleepImageUrl, '마음');
    }

    const deduped = [];
    const seen = new Set();
    for (const item of items) {
        const key = `${item.category}|${item.originalUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(item);
    }
    return deduped;
}

function getShareCategoryTags(latest, settings = getDefaultShareSettings()) {
    if (!latest) return [];
    const tags = [];
    const hasDietMedia = !!collectShareCardMedia({ diet: latest.diet }, { ...getDefaultShareSettings(), hideDiet: false, hideExercise: true, hideMind: true }).length;
    const hasExerciseMedia = !!collectShareCardMedia({ exercise: latest.exercise }, { ...getDefaultShareSettings(), hideDiet: true, hideExercise: false, hideMind: true }).length;
    const hasMindMedia = !!collectShareCardMedia({ sleepAndMind: latest.sleepAndMind }, { ...getDefaultShareSettings(), hideDiet: true, hideExercise: true, hideMind: false }).length;

    if (!settings.hideDiet && (hasDietMedia || latest.diet)) tags.push('식단');
    if (!settings.hideExercise && (hasExerciseMedia || latest.exercise)) tags.push('운동');
    if (!settings.hideMind && (hasMindMedia || latest.sleepAndMind?.gratitudeJournal || latest.sleepAndMind?.meditationDone)) tags.push('마음');
    if ((latest.currentStreak || 0) > 0) tags.push(`${latest.currentStreak}일 연속`);
    return tags.slice(0, 4);
}

function getSharePoints(latest) {
    let points = (latest?.awardedPoints?.dietPoints || 0)
        + (latest?.awardedPoints?.exercisePoints || 0)
        + (latest?.awardedPoints?.mindPoints || 0);
    if (points === 0 && latest?.awardedPoints) {
        if (latest.awardedPoints.diet) points += 10;
        if (latest.awardedPoints.exercise) points += 15;
        if (latest.awardedPoints.mind) points += 5;
    }
    return points;
}

function buildShareSubtitle(latest, tags = []) {
    if (!latest) return '오늘 기록한 흐름을 한 장으로 정리했어요.';
    if (tags.length) {
        const categoryTags = tags.filter(tag => !tag.includes('연속'));
        if (categoryTags.length) {
            return `오늘 ${categoryTags.join('·')} 흐름을 담았어요.`;
        }
    }
    return '오늘 해빛 흐름을 담았어요.';
}

function buildShareTagRow(tags = []) {
    if (!tags.length) return '';
    return tags.map(tag => `<span class="share-tag">${escapeHtml(tag)}</span>`).join('');
}

function buildShareMediaSignature(mediaItems = [], maxCount = 4) {
    return mediaItems
        .slice(0, maxCount)
        .map(item => {
            const urls = [
                ...(Array.isArray(item.candidateUrls) ? item.candidateUrls : []),
                item.previewUrl,
                item.originalUrl,
                item.src
            ]
                .map(value => String(value || '').trim())
                .filter(Boolean)
                .join('|');
            return `${item.category || ''}|${item.type || ''}|${urls}`;
        })
        .join('||');
}

function buildSharePlaceholderMedia(mediaItems = [], maxCount = 4) {
    return mediaItems.slice(0, maxCount).map((item, index) => {
        const label = item.category || `기록 ${index + 1}`;
        const placeholder = item.type === 'video'
            ? createVideoPlaceholderBase64()
            : createImagePlaceholderBase64(label);
        return {
            ...item,
            src: placeholder,
            prepared: false
        };
    });
}

async function withAsyncTimeout(task, timeoutMs, errorMessage = '작업 시간이 초과되었어요.') {
    let timeoutId = null;
    try {
        return await Promise.race([
            Promise.resolve(task),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function requestPreparedShareMediaAssets(items = []) {
    if (!auth.currentUser || !Array.isArray(items) || !items.length) return [];

    try {
        const result = await withAsyncTimeout(
            prepareShareMediaAssetsFn({
                items: items.slice(0, 4).map(item => ({
                    category: item.category || '기록',
                    type: item.type || 'image',
                    candidateUrls: Array.isArray(item.candidateUrls)
                        ? item.candidateUrls.map(value => String(value || '').trim()).filter(Boolean).slice(0, 6)
                        : []
                }))
            }),
            12000,
            '공유 이미지를 준비하는 시간이 초과되었어요.'
        );
        return Array.isArray(result?.data?.items) ? result.data.items : [];
    } catch (error) {
        console.warn('공유 미디어 서버 준비 실패:', error);
        return [];
    }
}

async function prepareShareMediaItems(mediaItems = [], maxCount = 4) {
    const items = mediaItems.slice(0, maxCount).map((item, index) => ({
        ...item,
        placeholderSrc: item.type === 'video'
            ? createVideoPlaceholderBase64()
            : createImagePlaceholderBase64(item.category || `기록 ${index + 1}`)
    }));
    if (!items.length) return [];

    const directItems = items.map(item => {
        const candidates = [
            ...(Array.isArray(item.candidateUrls) ? item.candidateUrls : []),
            item.previewUrl,
            item.src,
            item.originalUrl
        ]
            .map(value => String(value || '').trim())
            .filter(Boolean);
        const directDataUrl = candidates.find(candidate => candidate.startsWith('data:'));
        return directDataUrl
            ? { ...item, src: directDataUrl, prepared: true }
            : null;
    });

    const remoteItems = await requestPreparedShareMediaAssets(items);

    return items.map((item, index) => {
        if (directItems[index]) return directItems[index];
        const preparedSrc = String(remoteItems[index]?.src || '').trim();
        if (preparedSrc.startsWith('data:')) {
            return {
                ...item,
                src: preparedSrc,
                prepared: true
            };
        }
        return {
            ...item,
            src: item.placeholderSrc,
            prepared: false
        };
    });
}

async function ensurePreparedShareMedia(latest, settings = getDefaultShareSettings(), forceRefresh = false) {
    const mediaItems = collectShareCardMedia(latest, settings);
    const signature = buildShareMediaSignature(mediaItems);

    if (!forceRefresh && signature && signature === _latestPreparedShareSignature && _latestPreparedShareMedia.length) {
        return _latestPreparedShareMedia;
    }

    const prepared = await prepareShareMediaItems(mediaItems);
    _latestPreparedShareMedia = prepared;
    _latestPreparedShareSignature = signature;
    return prepared;
}

function findLocalExerciseVideoThumb(videoUrl = '') {
    const normalizedVideoUrl = String(videoUrl || '').trim();
    const blocks = Array.from(document.querySelectorAll('.strength-block'));
    for (const block of blocks) {
        const previewImg = block.querySelector('.preview-strength-img');
        const localThumb = String(
            block.getAttribute('data-local-thumb')
            || previewImg?.getAttribute('data-local-thumb')
            || ''
        ).trim();
        const savedThumb = String(
            block.getAttribute('data-thumb-url')
            || previewImg?.getAttribute('data-saved-thumb-url')
            || ''
        ).trim();

        const blockUrl = String(block.getAttribute('data-url') || '').trim();
        if (!normalizedVideoUrl || (blockUrl && blockUrl === normalizedVideoUrl)) {
            if (localThumb.startsWith('data:image/')) return localThumb;
            if (isPersistedStorageUrl(savedThumb)) return savedThumb;
        }
    }
    return '';
}

function getShareTemplateLabel(template) {
    switch (normalizeShareTemplate(template)) {
        case 'overlap': return '겹침형';
        case 'spotlight': return '포커스형';
        default: return '정돈형';
    }
}

function buildShareRenderKey(latest, settings, template, preparedMedia = []) {
    return [
        latest?.date || '',
        latest?.userId || '',
        normalizeShareTemplate(template),
        JSON.stringify(normalizeShareSettings(settings)),
        buildShareMediaSignature(preparedMedia, 4),
        String(latest?.currentStreak || 0),
        String(getSharePoints(latest))
    ].join('::');
}

function roundRectPath(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
}

function fillRoundRectCanvas(ctx, x, y, width, height, radius, fillStyle) {
    ctx.save();
    ctx.fillStyle = fillStyle;
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.restore();
}

function strokeRoundRectCanvas(ctx, x, y, width, height, radius, strokeStyle, lineWidth = 1) {
    ctx.save();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;
    roundRectPath(ctx, x, y, width, height, radius);
    ctx.stroke();
    ctx.restore();
}

function wrapCanvasText(ctx, text, maxWidth, maxLines = 2) {
    const sourceText = String(text || '').trim();
    if (!sourceText) return [''];

    const tokens = sourceText.includes(' ')
        ? sourceText.split(/\s+/).filter(Boolean)
        : Array.from(sourceText);
    const joiner = sourceText.includes(' ') ? ' ' : '';
    const lines = [];
    let currentLine = tokens.shift() || '';

    while (tokens.length) {
        const nextToken = tokens.shift();
        const candidate = `${currentLine}${joiner}${nextToken}`.trim();
        if (ctx.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
            continue;
        }
        lines.push(currentLine);
        currentLine = nextToken;
        if (lines.length === maxLines - 1) break;
    }

    const remaining = [currentLine, ...tokens].join(joiner).trim();
    if (remaining) lines.push(remaining);
    if (lines.length > maxLines) {
        lines.length = maxLines;
    }
    if (lines.length === maxLines) {
        const lastIndex = lines.length - 1;
        while (ctx.measureText(`${lines[lastIndex]}…`).width > maxWidth && lines[lastIndex].length > 1) {
            lines[lastIndex] = lines[lastIndex].slice(0, -1);
        }
        if (ctx.measureText(lines[lastIndex]).width > maxWidth) {
            lines[lastIndex] = lines[lastIndex].slice(0, 1);
        }
        if (lines[lastIndex] !== remaining) {
            lines[lastIndex] = `${lines[lastIndex]}…`;
        }
    }
    return lines;
}

function drawCanvasTextLines(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2, color = '#2f261d') {
    const lines = wrapCanvasText(ctx, text, maxWidth, maxLines);
    ctx.save();
    ctx.fillStyle = color;
    lines.forEach((line, index) => {
        ctx.fillText(line, x, y + (index * lineHeight));
    });
    ctx.restore();
    return lines.length;
}

function drawCanvasChip(ctx, x, y, text, options = {}) {
    const {
        padX = 18,
        height = 46,
        radius = 23,
        background = 'rgba(255,255,255,0.94)',
        border = 'rgba(255,181,110,0.55)',
        color = '#9a5707',
        font = '800 22px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
    } = options;
    ctx.save();
    ctx.font = font;
    const width = Math.max(height, Math.ceil(ctx.measureText(text).width + (padX * 2)));
    fillRoundRectCanvas(ctx, x, y, width, height, radius, background);
    strokeRoundRectCanvas(ctx, x, y, width, height, radius, border, 2);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x + padX, y + (height / 2) + 1);
    ctx.restore();
    return width;
}

function getShareTemplateFrames(template, count, bounds) {
    const safeCount = Math.max(0, Math.min(count || 0, 4));
    const gap = 10;
    if (safeCount <= 0) return [];

    if (normalizeShareTemplate(template) === 'overlap') {
        const size = Math.min(bounds.w * 0.42, bounds.h * 0.46);
        const left = bounds.x + 34;
        const right = bounds.x + bounds.w - size - 34;
        const top = bounds.y + 28;
        const bottom = bounds.y + bounds.h - size - 18;
        const frames = [
            { x: left + 4, y: top + 6, w: size, h: size, rotate: -0.06 },
            { x: right - 4, y: top + 18, w: size, h: size, rotate: 0.06 },
            { x: left - 6, y: bottom - 10, w: size, h: size, rotate: -0.05 },
            { x: right + 6, y: bottom + 2, w: size, h: size, rotate: 0.05 }
        ];
        return frames.slice(0, safeCount);
    }

    if (normalizeShareTemplate(template) === 'spotlight') {
        if (safeCount === 1) {
            const size = Math.min(bounds.w, bounds.h);
            return [{ x: bounds.x + ((bounds.w - size) / 2), y: bounds.y + ((bounds.h - size) / 2), w: size, h: size, rotate: 0 }];
        }

        const big = Math.min(bounds.w * 0.76, bounds.h * 0.62);
        const small = Math.min((bounds.w - gap) / 2, bounds.h - big - gap);
        const bigX = bounds.x + ((bounds.w - big) / 2);
        const bottomY = bounds.y + big + gap;
        const frames = [
            { x: bigX, y: bounds.y, w: big, h: big, rotate: 0 },
            { x: bounds.x, y: bottomY, w: small, h: small, rotate: 0 },
            { x: bounds.x + bounds.w - small, y: bottomY, w: small, h: small, rotate: 0 },
            { x: bounds.x + ((bounds.w - small) / 2), y: bottomY, w: small, h: small, rotate: 0 }
        ];
        return frames.slice(0, safeCount);
    }

    if (safeCount === 1) {
        const size = Math.min(bounds.w, bounds.h);
        return [{ x: bounds.x + ((bounds.w - size) / 2), y: bounds.y + ((bounds.h - size) / 2), w: size, h: size, rotate: 0 }];
    }

    if (safeCount === 2) {
        const size = Math.min((bounds.w - gap) / 2, bounds.h);
        const top = bounds.y + ((bounds.h - size) / 2);
        return [
            { x: bounds.x, y: top, w: size, h: size, rotate: 0 },
            { x: bounds.x + size + gap, y: top, w: size, h: size, rotate: 0 }
        ];
    }

    const size = Math.min((bounds.w - gap) / 2, (bounds.h - gap) / 2);
    const row1 = bounds.y + ((bounds.h - ((size * 2) + gap)) / 2);
    const row2 = row1 + size + gap;
    return [
        { x: bounds.x, y: row1, w: size, h: size, rotate: 0 },
        { x: bounds.x + size + gap, y: row1, w: size, h: size, rotate: 0 },
        { x: bounds.x, y: row2, w: size, h: size, rotate: 0 },
        { x: bounds.x + size + gap, y: row2, w: size, h: size, rotate: 0 }
    ].slice(0, safeCount);
}

function drawPosterPlaceholderTile(ctx, frame, label) {
    fillRoundRectCanvas(ctx, frame.x, frame.y, frame.w, frame.h, 34, 'rgba(255,255,255,0.86)');
    strokeRoundRectCanvas(ctx, frame.x, frame.y, frame.w, frame.h, 34, 'rgba(255,181,110,0.38)', 2);
    ctx.save();
    ctx.fillStyle = '#ffb14d';
    const iconSize = Math.min(frame.w, frame.h) * 0.26;
    ctx.fillRect(frame.x + 34, frame.y + 34, iconSize * 0.9, 8);
    ctx.beginPath();
    ctx.arc(frame.x + (frame.w * 0.32), frame.y + (frame.h * 0.34), iconSize * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(frame.x + (frame.w * 0.18), frame.y + (frame.h * 0.72));
    ctx.lineTo(frame.x + (frame.w * 0.42), frame.y + (frame.h * 0.44));
    ctx.lineTo(frame.x + (frame.w * 0.56), frame.y + (frame.h * 0.6));
    ctx.lineTo(frame.x + (frame.w * 0.7), frame.y + (frame.h * 0.48));
    ctx.lineTo(frame.x + (frame.w * 0.82), frame.y + (frame.h * 0.72));
    ctx.closePath();
    ctx.fill();
    drawCanvasChip(ctx, frame.x + 18, frame.y + frame.h - 58, label, {
        padX: 16,
        height: 38,
        radius: 19,
        font: '800 18px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
    });
    ctx.restore();
}

async function loadCanvasImageSource(src) {
    return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
}

async function drawPosterMediaTiles(ctx, preparedMedia, template, bounds) {
    const media = Array.isArray(preparedMedia) ? preparedMedia.slice(0, 4) : [];
    const frames = getShareTemplateFrames(template, media.length, bounds);
    if (!frames.length) {
        fillRoundRectCanvas(ctx, bounds.x, bounds.y, bounds.w, bounds.h, 38, 'rgba(255,255,255,0.7)');
        strokeRoundRectCanvas(ctx, bounds.x, bounds.y, bounds.w, bounds.h, 38, 'rgba(255,181,110,0.32)', 2);
        ctx.save();
        ctx.fillStyle = '#7c6855';
        ctx.font = '700 32px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.fillText('오늘 기록을 저장하면 카드가 완성돼요.', bounds.x + 38, bounds.y + 74);
        ctx.font = '600 22px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
        ctx.fillText('식단 · 운동 · 마음 흐름을 한 장에 담아드릴게요.', bounds.x + 38, bounds.y + 116);
        ctx.restore();
        return;
    }

    for (let index = 0; index < frames.length; index++) {
        const item = media[index];
        const frame = frames[index];
        const radius = 34;
        ctx.save();
        if (frame.rotate) {
            ctx.translate(frame.x + (frame.w / 2), frame.y + (frame.h / 2));
            ctx.rotate(frame.rotate);
            frame.x = -(frame.w / 2);
            frame.y = -(frame.h / 2);
        }

        fillRoundRectCanvas(ctx, frame.x, frame.y, frame.w, frame.h, radius, 'rgba(255,255,255,0.96)');
        strokeRoundRectCanvas(ctx, frame.x, frame.y, frame.w, frame.h, radius, 'rgba(255,255,255,0.92)', 3);

        try {
            const img = await loadCanvasImageSource(item?.src || '');
            ctx.save();
            roundRectPath(ctx, frame.x + 6, frame.y + 6, frame.w - 12, frame.h - 12, radius - 8);
            ctx.clip();
            const sourceWidth = img.width || 1;
            const sourceHeight = img.height || 1;
            const scale = Math.max((frame.w - 12) / sourceWidth, (frame.h - 12) / sourceHeight);
            const drawWidth = sourceWidth * scale;
            const drawHeight = sourceHeight * scale;
            const drawX = frame.x + 6 + (((frame.w - 12) - drawWidth) / 2);
            const drawY = frame.y + 6 + (((frame.h - 12) - drawHeight) / 2);
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();
        } catch (_) {
            drawPosterPlaceholderTile(ctx, frame, item?.category || '기록');
        }

        drawCanvasChip(ctx, frame.x + 14, frame.y + frame.h - 48, item?.category || '기록', {
            padX: 12,
            height: 32,
            radius: 16,
            font: '800 14px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
        });
        ctx.restore();
    }
}

async function createSharePosterAsset(user, latest, settings, template, preparedMedia, size = 1080) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const background = ctx.createLinearGradient(0, 0, size, size);
    background.addColorStop(0, '#fff6ea');
    background.addColorStop(0.52, '#fffaf3');
    background.addColorStop(1, '#eef8f0');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ffd89e';
    ctx.beginPath();
    ctx.arc(size * 0.83, size * 0.17, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffeabf';
    ctx.beginPath();
    ctx.arc(size * 0.2, size * 0.88, size * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const cardX = 28;
    const cardY = 28;
    const cardSize = size - 56;
    fillRoundRectCanvas(ctx, cardX, cardY, cardSize, cardSize, 48, 'rgba(255, 252, 245, 0.9)');
    strokeRoundRectCanvas(ctx, cardX, cardY, cardSize, cardSize, 48, 'rgba(245, 191, 112, 0.55)', 3);

    const displayName = settings.hideIdentity ? '오늘의 해빛 루틴' : `${getUserDisplayName()}의 해빛 루틴`;
    const tags = getShareCategoryTags(latest, settings);
    const subtitle = buildShareSubtitle(latest, tags);

    let chipX = 58;
    chipX += drawCanvasChip(ctx, chipX, 50, 'HABIT SCHOOL', {
        padX: 12,
        height: 30,
        radius: 15,
        font: '900 13px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
        color: '#b76400'
    }) + 12;
    if (!settings.hideDate) {
        chipX += drawCanvasChip(ctx, chipX, 50, `📅 ${String(latest?.date || '').replace(/-/g, '.')}`, {
            padX: 12,
            height: 30,
            radius: 15,
            font: '800 13px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
        }) + 12;
    }
    if (!settings.hidePoints) {
        drawCanvasChip(ctx, size - 150, 50, `Ⓟ ${getSharePoints(latest)}P`, {
            padX: 12,
            height: 30,
            radius: 15,
            font: '900 13px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
        });
    }

    ctx.save();
    ctx.font = '900 38px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textBaseline = 'top';
    drawCanvasTextLines(ctx, displayName, 58, 98, 780, 44, 2, '#2f261d');
    ctx.font = '700 18px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    drawCanvasTextLines(ctx, subtitle, 58, 150, 760, 22, 2, '#725f4d');
    ctx.restore();

    let tagX = 58;
    tags.slice(0, 4).forEach((tag) => {
        const width = drawCanvasChip(ctx, tagX, 192, tag, {
            padX: 11,
            height: 28,
            radius: 14,
            font: '800 13px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
            background: 'rgba(255,255,255,0.9)'
        });
        tagX += width + 8;
    });

    await drawPosterMediaTiles(ctx, preparedMedia, template, { x: 52, y: 234, w: 976, h: 694 });

    drawCanvasChip(ctx, 58, 972, '해빛스쿨', {
        padX: 12,
        height: 30,
        radius: 15,
        font: '900 14px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
        background: 'rgba(255,255,255,0.88)'
    });

    ctx.save();
    ctx.fillStyle = '#8a6336';
    ctx.font = '900 22px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('좋은 습관, 같이 이어가요', 1006, 987);
    ctx.restore();

    const blob = await createCanvasBlob(canvas, 'image/png');
    return {
        blob
    };
}

function renderShareCardState(user, latest, overrideSettings = null, options = {}) {
    const shareContainer = document.getElementById('my-share-container');
    const shareButton = shareContainer?.querySelector('.btn-share-action');
    const previewImage = document.getElementById('share-render-preview');
    const emptyState = document.getElementById('share-render-empty');
    if (!shareContainer || !shareButton || !previewImage || !emptyState) return;

    const settings = applyShareSettingsToControls(overrideSettings || latest?.shareSettings || _shareSettingsDraft);
    applyShareTemplateToControls(options.template || _shareTemplate);
    shareContainer.style.display = 'flex';

    const setPreviewMode = (showPreview, previewSrc = '') => {
        previewImage.hidden = !showPreview;
        previewImage.style.display = showPreview ? 'block' : 'none';
        if (showPreview) {
            previewImage.src = previewSrc;
        } else {
            previewImage.removeAttribute('src');
        }

        emptyState.hidden = showPreview;
        emptyState.style.display = showPreview ? 'none' : 'flex';
    };

    if (latest && user && options.previewDataUrl) {
        previewImage.alt = '공유용 정사각형 이미지 미리보기';
        setPreviewMode(true, options.previewDataUrl);
        shareButton.innerText = '공유하기';
        shareButton.onclick = () => window.shareMyCard && window.shareMyCard();
        return;
    }

    setPreviewMode(false);

    if (latest && user) {
        const titleEl = emptyState.querySelector('.share-empty-title');
        const descEl = emptyState.querySelector('.share-empty-desc');
        if (titleEl) titleEl.textContent = '공유 카드 준비 중이에요.';
        if (descEl) descEl.textContent = '정사각형 썸네일을 템플릿에 맞게 정리하고 있어요.';
        shareButton.innerText = '공유 이미지 준비 중...';
        shareButton.onclick = () => window.shareMyCard && window.shareMyCard();
        return;
    }

    const titleEl = emptyState.querySelector('.share-empty-title');
    const descEl = emptyState.querySelector('.share-empty-desc');
    if (titleEl) titleEl.textContent = '오늘 기록을 저장하면 정사각형 공유 카드가 바로 준비돼요.';
    if (descEl) descEl.textContent = '식단, 운동, 마음 썸네일을 한 장 이미지로 정리해서 인스타와 카톡에 바로 보낼 수 있어요.';
    shareButton.innerText = '기록 저장 후 공유 준비';
    shareButton.onclick = goToGalleryRecordAction;
}

async function persistShareSettings() {
    const user = auth.currentUser;
    if (!user) return;

    const currentShareLog = getCurrentShareLog(user.uid);
    if (!currentShareLog) return;

    const nextSettings = getCurrentShareSettings();
    try {
        await setDoc(doc(db, 'daily_logs', currentShareLog.id), {
            shareSettings: nextSettings
        }, { merge: true });

        const cached = cachedGalleryLogs.find(item => item.id === currentShareLog.id);
        if (cached) cached.data.shareSettings = { ...nextSettings };
        sortedFilteredDirty = true;

        if (document.getElementById('gallery')?.classList.contains('active')) {
            renderFeedOnly();
            await buildShareCardAsync(user.uid, user, nextSettings);
        }
    } catch (error) {
        console.error('share settings save error:', error);
        showToast('공유 설정을 저장하지 못했어요.');
        await buildShareCardAsync(user.uid, user);
    }
}

function handleShareSettingsChange() {
    const settings = getCurrentShareSettings();
    _shareSettingsDraft = settings;
    updateShareSettingsSummary(settings);

    const user = auth.currentUser;
    const currentShareLog = user ? getCurrentShareLog(user.uid) : null;
    if (currentShareLog && user) {
        buildShareCardAsync(user.uid, user, settings).catch(() => { });
    } else {
        renderShareCardState(user, currentShareLog?.data || null, settings);
    }

    clearTimeout(_shareSettingsPersistTimer);
    if (!currentShareLog) return;
    _shareSettingsPersistTimer = setTimeout(() => {
        persistShareSettings().catch(() => { });
    }, 250);
}

function bindShareSettingListeners() {
    ['share-hide-identity', 'share-hide-date', 'share-hide-diet', 'share-hide-exercise', 'share-hide-points', 'share-hide-mind'].forEach(id => {
        const element = document.getElementById(id);
        if (!element || element.dataset.shareSettingBound === 'true') return;
        element.dataset.shareSettingBound = 'true';
        element.addEventListener('change', handleShareSettingsChange);
    });
    updateShareSettingsSummary(_shareSettingsDraft);
}

function handleShareTemplateChange(template) {
    const nextTemplate = saveShareTemplatePreference(template);
    applyShareTemplateToControls(nextTemplate);
    const user = auth.currentUser;
    if (!user) return;
    buildShareCardAsync(user.uid, user).catch(() => { });
}

function bindShareTemplateListeners() {
    applyShareTemplateToControls(_shareTemplate);
    document.querySelectorAll('.share-template-btn[data-share-template]').forEach(button => {
        if (button.dataset.shareTemplateBound === 'true') return;
        button.dataset.shareTemplateBound = 'true';
        button.addEventListener('click', () => handleShareTemplateChange(button.dataset.shareTemplate));
    });
}

function setShareSettingsExpanded(expanded) {
    _shareSettingsExpanded = !!expanded;
    const shell = document.getElementById('gallery-share-settings-shell');
    const toggle = document.getElementById('gallery-share-settings-toggle');
    if (shell) shell.hidden = !_shareSettingsExpanded;
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(_shareSettingsExpanded));
        toggle.textContent = _shareSettingsExpanded ? '공유 설정 닫기' : '공유 설정 열기';
    }
}

function loadGuideCollapsedPreference(key) {
    const storageKey = getGuidePreferenceStorageKey(key);
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw == null) return null;
        return raw === '1';
    } catch (_) {
        return null;
    }
}

function saveGuideCollapsedPreference(key, collapsed) {
    const storageKey = getGuidePreferenceStorageKey(key);
    try {
        localStorage.setItem(storageKey, collapsed ? '1' : '0');
    } catch (_) { }
}

function getGuidePreferenceStorageKey(baseKey) {
    const uid = auth.currentUser?.uid || 'guest';
    return `${baseKey}:${uid}`;
}

function isGuideIntroFirstDay(userData = null) {
    const user = auth.currentUser;
    const candidates = [
        userData?.createdAt,
        userData?.registeredAt,
        user?.metadata?.creationTime
    ];

    for (const candidate of candidates) {
        const parsed = toDateSafe(candidate);
        if (!parsed) continue;
        return (Date.now() - parsed.getTime()) < (24 * 60 * 60 * 1000);
    }

    return false;
}

function ensureGuideCollapseState(userData = null) {
    const uid = auth.currentUser?.uid || 'guest';
    if (_guideCollapseStateUid !== uid) {
        _guideCollapseStateUid = uid;
        _dashboardHeroCollapsed = null;
        _dashboardMoreCollapsed = null;
        _galleryHeroCollapsed = null;
        _recordGuideCollapsed = { diet: null, exercise: null, sleep: null };
    }

    _guideIntroFirstDay = isGuideIntroFirstDay(userData);
    const defaultCollapsed = !_guideIntroFirstDay;

    if (_galleryHeroCollapsed == null) {
        const stored = loadGuideCollapsedPreference(GALLERY_HERO_GUIDE_STORAGE_KEY);
        _galleryHeroCollapsed = stored == null ? defaultCollapsed : stored;
    }

    Object.keys(RECORD_GUIDE_STORAGE_KEYS).forEach((tabName) => {
        if (_recordGuideCollapsed[tabName] != null) return;
        const stored = loadGuideCollapsedPreference(RECORD_GUIDE_STORAGE_KEYS[tabName]);
        _recordGuideCollapsed[tabName] = stored == null ? defaultCollapsed : stored;
    });
}

function ensureDashboardPanelState() {
    if (_dashboardHeroCollapsed == null) {
        const stored = loadGuideCollapsedPreference(DASHBOARD_HERO_COLLAPSE_KEY);
        _dashboardHeroCollapsed = stored == null ? false : stored;
    }

    if (_dashboardMoreCollapsed == null) {
        const stored = loadGuideCollapsedPreference(DASHBOARD_MORE_TOOLS_COLLAPSE_KEY);
        _dashboardMoreCollapsed = stored == null ? false : stored;
    }
}

function setGalleryHeroCollapsed(collapsed, persist = true) {
    _galleryHeroCollapsed = !!collapsed;
    if (persist) saveGuideCollapsedPreference(GALLERY_HERO_GUIDE_STORAGE_KEY, _galleryHeroCollapsed);

    const hero = document.getElementById('gallery-hero');
    const body = document.getElementById('gallery-hero-guide-body');
    const toggle = document.getElementById('gallery-hero-toggle');

    if (hero) hero.classList.toggle('is-collapsed', _galleryHeroCollapsed);
    if (body) body.hidden = _galleryHeroCollapsed;
    if (toggle) {
        toggle.textContent = _galleryHeroCollapsed ? '가이드 펼치기' : '가이드 접기';
        toggle.setAttribute('aria-expanded', String(!_galleryHeroCollapsed));
    }
}

function setRecordFlowCardCollapsed(tabName, collapsed, persist = true) {
    if (!RECORD_GUIDE_STORAGE_KEYS[tabName]) return;

    const effectiveCollapsed = isSimpleMode() ? false : !!collapsed;
    _recordGuideCollapsed[tabName] = effectiveCollapsed;
    if (persist && !isSimpleMode()) saveGuideCollapsedPreference(RECORD_GUIDE_STORAGE_KEYS[tabName], _recordGuideCollapsed[tabName]);

    const card = document.querySelector(`.record-flow-card[data-record-guide="${tabName}"]`);
    const body = document.getElementById(`${tabName}-guide-body`);
    const toggle = document.getElementById(`${tabName}-guide-toggle`);

    if (card) card.classList.toggle('is-collapsed', effectiveCollapsed);
    if (body) body.hidden = effectiveCollapsed;
    if (toggle) {
        toggle.textContent = effectiveCollapsed ? '펼치기' : '접기';
        toggle.setAttribute('aria-expanded', String(!effectiveCollapsed));
    }
}

function syncGuidePanels(tabName = null) {
    ensureGuideCollapseState(_dashboardCache.uid === auth.currentUser?.uid ? _dashboardCache.data?.ud : null);
    setGalleryHeroCollapsed(_galleryHeroCollapsed, false);
    ['diet', 'exercise', 'sleep'].forEach(name => {
        if (!tabName || tabName === name || document.querySelector(`.record-flow-card[data-record-guide="${name}"]`)) {
            setRecordFlowCardCollapsed(name, _recordGuideCollapsed[name], false);
        }
    });
}

function setDashboardHeroCollapsed(collapsed, persist = true) {
    _dashboardHeroCollapsed = !!collapsed;
    if (persist) saveGuideCollapsedPreference(DASHBOARD_HERO_COLLAPSE_KEY, _dashboardHeroCollapsed);

    const panel = document.getElementById('dashboard-hero-panel');
    const body = document.getElementById('dashboard-hero-body-shell');
    const toggle = document.getElementById('dashboard-hero-toggle');

    if (panel) panel.classList.toggle('is-collapsed', _dashboardHeroCollapsed);
    if (body) body.hidden = _dashboardHeroCollapsed;
    if (toggle) {
        toggle.textContent = _dashboardHeroCollapsed ? '펼치기' : '접기';
        toggle.setAttribute('aria-expanded', String(!_dashboardHeroCollapsed));
    }
}

function setDashboardMoreCollapsed(collapsed, persist = true) {
    _dashboardMoreCollapsed = !!collapsed;
    if (persist) saveGuideCollapsedPreference(DASHBOARD_MORE_TOOLS_COLLAPSE_KEY, _dashboardMoreCollapsed);

    const shell = document.getElementById('dashboard-more-tools');
    const body = document.getElementById('dashboard-more-tools-body');
    if (shell) shell.classList.toggle('is-collapsed', _dashboardMoreCollapsed);
    if (body) body.hidden = _dashboardMoreCollapsed;
    updateDashboardMoreToolsSummary();
}

function updateDashboardMoreToolsSummary() {
    const toggle = document.getElementById('dashboard-more-tools-toggle');
    if (!toggle) return;
    toggle.textContent = _dashboardMoreCollapsed ? '전체 펼치기' : '전체 접기';
    toggle.setAttribute('aria-expanded', String(!_dashboardMoreCollapsed));
}

function handleDashboardMoreToolsToggle() {
    setDashboardMoreCollapsed(!_dashboardMoreCollapsed, true);
}

function syncDashboardPanels() {
    ensureDashboardPanelState();
    setDashboardHeroCollapsed(_dashboardHeroCollapsed, false);
    setDashboardMoreCollapsed(_dashboardMoreCollapsed, false);
}

function toggleDashboardHero(forceExpanded = null) {
    ensureDashboardPanelState();
    const nextCollapsed = typeof forceExpanded === 'boolean'
        ? !forceExpanded
        : !_dashboardHeroCollapsed;
    setDashboardHeroCollapsed(nextCollapsed, true);
}

function toggleDashboardMoreTools(forceExpanded = null) {
    ensureDashboardPanelState();
    const nextCollapsed = typeof forceExpanded === 'boolean'
        ? !forceExpanded
        : !_dashboardMoreCollapsed;
    setDashboardMoreCollapsed(nextCollapsed, true);
}

function updateTodayStatusCard(todayAwarded = {}, streakCount = 0) {
    const items = [
        { key: 'diet', buttonId: 'today-status-diet', labelId: 'today-status-diet-label', defaultLabel: '식단 전', doneLabel: '식단 완료', tab: 'diet' },
        { key: 'exercise', buttonId: 'today-status-exercise', labelId: 'today-status-exercise-label', defaultLabel: '운동 전', doneLabel: '운동 완료', tab: 'exercise' },
        { key: 'mind', buttonId: 'today-status-mind', labelId: 'today-status-mind-label', defaultLabel: '마음 전', doneLabel: '마음 완료', tab: 'sleep' }
    ];

    let completedCount = 0;
    items.forEach((item) => {
        const isDone = !!todayAwarded[item.key];
        const button = document.getElementById(item.buttonId);
        const label = document.getElementById(item.labelId);
        if (button) {
            button.classList.toggle('done', isDone);
            button.setAttribute('aria-label', isDone ? `${item.doneLabel}, 탭으로 이동` : `${item.defaultLabel}, 탭으로 이동`);
            button.dataset.targetTab = item.tab;
        }
        if (label) label.textContent = isDone ? item.doneLabel : item.defaultLabel;
        if (isDone) completedCount++;
    });

    const badge = document.getElementById('today-status-badge');
    if (badge) badge.textContent = `${completedCount}/3 완료`;

    const cheer = document.getElementById('today-status-cheer');
    if (cheer) {
        if (completedCount === 3) cheer.textContent = `오늘 루틴을 모두 채웠어요. 연속 기록 ${streakCount}일 흐름을 이어가고 있어요.`;
        else if (completedCount === 0) cheer.textContent = '오늘 인증 3칸 중 하나부터 채워보세요.';
        else cheer.textContent = `좋아요. 오늘 ${completedCount}/3 완료예요. 남은 칸도 이어서 채워보세요.`;
    }
}

function toggleGalleryHeroGuide(forceExpanded = null) {
    const nextCollapsed = typeof forceExpanded === 'boolean'
        ? !forceExpanded
        : !_galleryHeroCollapsed;
    setGalleryHeroCollapsed(nextCollapsed, true);
}

function toggleRecordFlowCard(tabName, forceExpanded = null) {
    if (isSimpleMode()) return;
    if (!RECORD_GUIDE_STORAGE_KEYS[tabName]) return;
    const nextCollapsed = typeof forceExpanded === 'boolean'
        ? !forceExpanded
        : !_recordGuideCollapsed[tabName];
    setRecordFlowCardCollapsed(tabName, nextCollapsed, true);
}

function buildFriendshipId(uidA, uidB) {
    return [uidA, uidB].sort().join('__');
}

function toDateSafe(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value?.toDate === 'function') return value.toDate();
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
}

function getFriendshipOtherUid(friendship, myUid) {
    const users = Array.isArray(friendship?.users) ? friendship.users : [];
    return users.find(uid => uid !== myUid) || null;
}

function isFriendshipExpired(friendship) {
    if (!friendship || friendship.status !== 'pending') return false;
    const expiresAt = toDateSafe(friendship.expiresAt);
    return !!expiresAt && expiresAt.getTime() < Date.now();
}

function getEffectiveFriendshipStatus(friendship) {
    if (!friendship) return 'none';
    if (friendship.status === 'pending' && isFriendshipExpired(friendship)) return 'expired';
    return friendship.status || 'none';
}

function getFriendshipName(friendship, myUid) {
    const otherUid = getFriendshipOtherUid(friendship, myUid);
    if (!otherUid) return '친구';
    return friendship?.userNames?.[otherUid]
        || (friendship.requesterUid === otherUid ? friendship.requesterName : null)
        || '친구';
}

function findFriendshipById(friendshipId) {
    for (const friendship of cachedMyFriendships.values()) {
        if (friendship?.id === friendshipId) return friendship;
    }
    return null;
}

function getActiveFriendIds() {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return [];
    return [...cachedMyFriendships.values()]
        .filter(friendship => getEffectiveFriendshipStatus(friendship) === 'active')
        .map(friendship => getFriendshipOtherUid(friendship, myUid))
        .filter(Boolean);
}

function getIncomingFriendRequests() {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return [];
    return [...cachedMyFriendships.values()]
        .filter(friendship => getEffectiveFriendshipStatus(friendship) === 'pending' && friendship.pendingForUid === myUid);
}

function getOutgoingFriendRequests() {
    const myUid = auth.currentUser?.uid;
    if (!myUid) return [];
    return [...cachedMyFriendships.values()]
        .filter(friendship => getEffectiveFriendshipStatus(friendship) === 'pending' && friendship.requesterUid === myUid);
}

function getFriendRelationship(targetUid) {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !targetUid || targetUid === myUid) {
        return { status: 'self', id: '', name: '' };
    }

    const friendship = cachedMyFriendships.get(targetUid);
    const status = getEffectiveFriendshipStatus(friendship);
    return {
        status,
        id: friendship?.id || buildFriendshipId(myUid, targetUid),
        name: friendship ? getFriendshipName(friendship, myUid) : ''
    };
}

function buildFallbackActiveFriendship(myUid, targetUid, targetName = '친구') {
    const now = new Date();
    const requesterName = getUserDisplayName();
    return {
        id: buildFriendshipId(myUid, targetUid),
        users: [myUid, targetUid].sort(),
        userNames: {
            [myUid]: requesterName,
            [targetUid]: targetName || '친구'
        },
        status: 'active',
        requesterUid: myUid,
        requesterName,
        pendingForUid: null,
        requestedAt: now,
        acceptedAt: now,
        respondedAt: now,
        updatedAt: now,
        source: 'user_cache'
    };
}

function setOptimisticActiveFriendship(targetUid, targetName = '친구') {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !targetUid || targetUid === myUid) return;

    cachedMyFriendships.set(targetUid, buildFallbackActiveFriendship(myUid, targetUid, targetName));
    cachedMyFriends = getActiveFriendIds();
    sortedFilteredDirty = true;
    renderProfileFriendRequests();
}

function setOptimisticPendingFriendship(targetUid, targetName = '친구') {
    const myUid = auth.currentUser?.uid;
    if (!myUid || !targetUid || targetUid === myUid) return;

    const requestedAt = new Date();
    const requesterName = getUserDisplayName();
    cachedMyFriendships.set(targetUid, {
        id: buildFriendshipId(myUid, targetUid),
        users: [myUid, targetUid].sort(),
        userNames: {
            [myUid]: requesterName,
            [targetUid]: targetName || '친구'
        },
        status: 'pending',
        requesterUid: myUid,
        requesterName,
        pendingForUid: targetUid,
        requestedAt,
        updatedAt: requestedAt
    });
    cachedMyFriends = getActiveFriendIds();
    sortedFilteredDirty = true;
    renderProfileFriendRequests();
}

function formatDateTimeForUi(value) {
    const date = toDateSafe(value);
    if (!date) return '-';
    return date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getChatbotConnectTokenFromUrl() {
    try {
        return String(new URLSearchParams(window.location.search).get('chatbotConnectToken') || '').trim();
    } catch (_) {
        return '';
    }
}

function getPendingChatbotConnectToken() {
    const urlToken = getChatbotConnectTokenFromUrl();
    if (urlToken) {
        _chatbotConnectToken = urlToken;
        try {
            localStorage.setItem(CHATBOT_CONNECT_PENDING_KEY, urlToken);
        } catch (_) { }
        return urlToken;
    }

    if (_chatbotConnectToken) return _chatbotConnectToken;

    try {
        const stored = String(localStorage.getItem(CHATBOT_CONNECT_PENDING_KEY) || '').trim();
        if (stored) {
            _chatbotConnectToken = stored;
            return stored;
        }
    } catch (_) { }

    return '';
}

function clearChatbotConnectTokenFromUrl() {
    _chatbotConnectToken = '';
    _chatbotConnectInfo = null;
    _chatbotConnectInfoPromise = null;
    _chatbotConnectModalToken = '';
    _chatbotConnectCompleting = false;
    _chatbotConnectLoginPromptShown = false;

    try {
        localStorage.removeItem(CHATBOT_CONNECT_PENDING_KEY);
        localStorage.removeItem(CHATBOT_CONNECT_FAILURE_KEY);
    } catch (_) { }

    const url = new URL(window.location.href);
    url.searchParams.delete('chatbotConnectToken');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function normalizeChatbotConnectErrorCode(rawCode) {
    return String(rawCode || '').trim().toLowerCase();
}

function readChatbotConnectFailure() {
    try {
        const raw = localStorage.getItem(CHATBOT_CONNECT_FAILURE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
            token: String(parsed.token || '').trim(),
            code: normalizeChatbotConnectErrorCode(parsed.code),
            failedAt: Number(parsed.failedAt || 0)
        };
    } catch (_) {
        return null;
    }
}

function rememberChatbotConnectFailure(token, code) {
    try {
        localStorage.setItem(CHATBOT_CONNECT_FAILURE_KEY, JSON.stringify({
            token: String(token || '').trim(),
            code: normalizeChatbotConnectErrorCode(code),
            failedAt: Date.now()
        }));
    } catch (_) { }
}

function clearChatbotConnectFailure() {
    try {
        localStorage.removeItem(CHATBOT_CONNECT_FAILURE_KEY);
    } catch (_) { }
}

function isTransientChatbotConnectError(rawCode) {
    const code = normalizeChatbotConnectErrorCode(rawCode);
    if (!code) return true;
    if (code === 'error' || code === 'connect_failed') return true;
    if (code.startsWith('http_5')) return true;
    return [
        'failed to fetch',
        'networkerror',
        'load failed',
        'fetch failed',
        'timeout'
    ].some(fragment => code.includes(fragment));
}

function buildPendingChatbotConnectNotice() {
    const token = getPendingChatbotConnectToken();
    const failure = readChatbotConnectFailure();
    if (!token || !failure || failure.token !== token || !isTransientChatbotConnectError(failure.code)) {
        return '';
    }

    return `
        <div class="chatbot-link-warning">
            <div class="chatbot-link-warning-copy">보류된 연결 정보를 아직 불러오지 못했어요. 다시 확인하거나 정리할 수 있어요.</div>
            <div class="chatbot-link-warning-actions">
                <button type="button" class="chatbot-link-warning-btn" onclick="retryPendingChatbotConnect()">다시 확인</button>
                <button type="button" class="chatbot-link-warning-btn is-secondary" onclick="dismissPendingChatbotConnect()">보류 정리</button>
            </div>
        </div>
    `;
}

function setChatbotLinkFallbackExpanded(force) {
    _chatbotLinkFallbackExpanded = typeof force === 'boolean'
        ? force
        : !_chatbotLinkFallbackExpanded;
    const panel = document.getElementById('chatbot-link-fallback-panel');
    const toggle = document.getElementById('chatbot-link-fallback-toggle');
    if (panel) panel.style.display = _chatbotLinkFallbackExpanded ? 'block' : 'none';
    if (toggle) toggle.textContent = _chatbotLinkFallbackExpanded ? '등록 코드 접기' : '등록 코드로 연결하기';
}

function toggleChatbotLinkFallback() {
    setChatbotLinkFallbackExpanded();
}

function getChatbotConnectErrorMessage(code) {
    switch (String(code || '').toLowerCase()) {
        case 'login_required':
        case 'missing_auth':
        case 'unauthenticated':
            return '로그인 후 해빛코치 연결을 완료해 주세요.';
        case 'expired':
        case 'token_expired':
        case 'invalid_token':
        case 'not_found':
        case 'missing_token':
            return '연결 링크가 만료되었어요. 카카오톡 1:1 채팅에서 !연결을 다시 입력해 주세요.';
        case 'already_completed':
        case 'already_used':
        case 'completed':
            return '이미 사용된 연결 링크예요. 카카오톡 1:1 채팅에서 !연결을 다시 입력해 주세요.';
        case 'unauthorized':
        case 'forbidden':
        case 'permission-denied':
            return '현재 로그인한 계정으로는 연결할 수 없어요. 로그인 계정을 다시 확인해 주세요.';
        case 'error':
        case 'connect_failed':
            return '해빛코치 서버와 잠시 연결이 불안정해요. 잠시 후 다시 시도해 주세요.';
        default:
            return '해빛코치 연결을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
}

function shouldClearChatbotConnectToken(code) {
    return [
        'expired',
        'token_expired',
        'invalid_token',
        'not_found',
        'missing_token',
        'already_completed',
        'already_used',
        'completed'
    ].includes(String(code || '').toLowerCase());
}

async function fetchChatbotConnectTokenInfo(token) {
    if (!token) throw Object.assign(new Error('missing_token'), { code: 'missing_token' });
    if (_chatbotConnectInfo && _chatbotConnectInfo.token === token) return _chatbotConnectInfo;
    if (_chatbotConnectInfoPromise) return _chatbotConnectInfoPromise;

    _chatbotConnectInfoPromise = (async () => {
        const response = await fetch(`${CHATBOT_CONNECT_API_ORIGIN}/api/chatbot-connect/${encodeURIComponent(token)}`, {
            method: 'GET',
            cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) {
            const error = new Error(data?.message || 'invalid_token');
            error.code = data?.code || `http_${response.status}`;
            throw error;
        }
        if (data.status && data.status !== 'pending') {
            const error = new Error(data.status);
            error.code = data.status === 'completed' ? 'already_completed' : data.status;
            throw error;
        }
        _chatbotConnectInfo = { ...data, token };
        return _chatbotConnectInfo;
    })();

    try {
        return await _chatbotConnectInfoPromise;
    } finally {
        _chatbotConnectInfoPromise = null;
    }
}

async function completeChatbotConnectToken(token) {
    const user = auth.currentUser;
    if (!user) throw Object.assign(new Error('login_required'), { code: 'login_required' });

    const idToken = await user.getIdToken();
    const response = await fetch(`${CHATBOT_CONNECT_API_ORIGIN}/api/chatbot-connect/complete`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ token })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) {
        const error = new Error(data?.message || 'connect_failed');
        error.code = data?.code || `http_${response.status}`;
        throw error;
    }
    return data;
}

function closeChatbotConnectModal() {
    const modal = document.getElementById('chatbot-connect-modal');
    const confirmBtn = document.getElementById('chatbot-connect-confirm-btn');
    if (modal) modal.style.display = 'none';
    if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '연결하기';
    }
    _chatbotConnectModalToken = '';
    document.body.style.overflow = '';
}

function cancelChatbotConnect() {
    clearChatbotConnectTokenFromUrl();
    closeChatbotConnectModal();
    renderChatbotLinkStatus(_chatbotLinkStatusCache);
}

function openChatbotConnectModal(info) {
    const modal = document.getElementById('chatbot-connect-modal');
    const titleEl = document.getElementById('chatbot-connect-modal-title');
    const copyEl = document.getElementById('chatbot-connect-modal-copy');
    const kakaoNameEl = document.getElementById('chatbot-connect-kakao-name');
    const appAccountEl = document.getElementById('chatbot-connect-app-account');
    const expiryEl = document.getElementById('chatbot-connect-expiry');
    if (!modal || !titleEl || !copyEl || !kakaoNameEl || !appAccountEl || !expiryEl) return;

    const currentUser = auth.currentUser;
    const appAccount = currentUser?.email || currentUser?.displayName || '현재 로그인 계정';
    const kakaoName = info?.displayName || '카카오 사용자';
    titleEl.textContent = `카카오 계정 "${kakaoName}"와 연결할까요?`;
    copyEl.textContent = '현재 로그인한 해빛스쿨 계정과 연결됩니다. 확인하면 카카오 1:1 채팅과 바로 이어집니다.';
    kakaoNameEl.textContent = kakaoName;
    appAccountEl.textContent = appAccount;
    expiryEl.textContent = formatDateTimeForUi(info?.expiresAt);
    _chatbotConnectModalToken = info?.token || '';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function confirmChatbotConnect() {
    const token = _chatbotConnectModalToken || getPendingChatbotConnectToken();
    if (!token || _chatbotConnectCompleting) return;

    const confirmBtn = document.getElementById('chatbot-connect-confirm-btn');
    _chatbotConnectCompleting = true;
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '연결 중...';
    }

    try {
        const result = await completeChatbotConnectToken(token);
        showToast(result?.alreadyCompleted
            ? '이미 연결된 카카오 계정이에요.'
            : `해빛코치 연결이 완료됐어요${result?.kakaoDisplayName ? ` · ${result.kakaoDisplayName}` : ''}`);
        clearChatbotConnectFailure();
        clearChatbotConnectTokenFromUrl();
        closeChatbotConnectModal();
        await loadChatbotLinkStatus();
    } catch (error) {
        console.error('chatbot connect complete error:', error);
        if (isTransientChatbotConnectError(error.code || error.message)) {
            rememberChatbotConnectFailure(token, error.code || error.message);
            renderChatbotLinkStatus(_chatbotLinkStatusCache);
        }
        showToast(getChatbotConnectErrorMessage(error.code || error.message));
        if (shouldClearChatbotConnectToken(error.code || error.message)) {
            clearChatbotConnectTokenFromUrl();
            closeChatbotConnectModal();
        }
    } finally {
        _chatbotConnectCompleting = false;
        if (confirmBtn && _chatbotConnectModalToken) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = '연결하기';
        }
    }
}

function handleLoggedOutChatbotConnect() {
    const token = getPendingChatbotConnectToken();
    if (!token || auth.currentUser || _chatbotConnectLoginPromptShown) return;
    _chatbotConnectLoginPromptShown = true;
    document.getElementById('login-modal').style.display = 'flex';
    showToast('로그인 후 해빛코치 연결을 바로 이어갈게요.');
}

async function maybeHandleChatbotConnect({ interactive = false, force = false } = {}) {
    const token = getPendingChatbotConnectToken();
    if (!token) return false;

    const lastFailure = readChatbotConnectFailure();
    if (!force
        && !interactive
        && lastFailure?.token === token
        && isTransientChatbotConnectError(lastFailure.code)
        && (Date.now() - lastFailure.failedAt) < CHATBOT_CONNECT_RETRY_COOLDOWN_MS) {
        renderChatbotLinkStatus(_chatbotLinkStatusCache);
        return false;
    }

    if (!auth.currentUser) {
        handleLoggedOutChatbotConnect();
        return false;
    }

    if (getVisibleTabName() !== 'profile') {
        openTab('profile', false);
        return true;
    }

    if (_chatbotConnectCompleting || _chatbotConnectModalToken === token) {
        return true;
    }

    try {
        const info = await fetchChatbotConnectTokenInfo(token);
        clearChatbotConnectFailure();
        openChatbotConnectModal(info);
        return true;
    } catch (error) {
        console.error('chatbot connect token error:', error);
        if (shouldClearChatbotConnectToken(error.code || error.message)) {
            clearChatbotConnectTokenFromUrl();
            closeChatbotConnectModal();
        } else if (isTransientChatbotConnectError(error.code || error.message)) {
            rememberChatbotConnectFailure(token, error.code || error.message);
            renderChatbotLinkStatus(_chatbotLinkStatusCache);
            if (interactive) {
                showToast(getChatbotConnectErrorMessage(error.code || error.message));
            }
        } else {
            showToast(getChatbotConnectErrorMessage(error.code || error.message));
        }
        return false;
    }
}

function retryPendingChatbotConnect() {
    maybeHandleChatbotConnect({ interactive: true, force: true }).catch(() => {});
}

function dismissPendingChatbotConnect() {
    clearChatbotConnectTokenFromUrl();
    closeChatbotConnectModal();
    renderChatbotLinkStatus(_chatbotLinkStatusCache);
    showToast('보류된 해빛코치 연결을 정리했어요.');
}

function renderChatbotLinkStatus(userData = {}) {
    const statusEl = document.getElementById('chatbot-link-status');
    const fallbackToggle = document.getElementById('chatbot-link-fallback-toggle');
    const codeBox = document.getElementById('chatbot-link-code-box');
    const codeEl = document.getElementById('chatbot-link-code');
    const expiryEl = document.getElementById('chatbot-link-expiry');
    const lastUsedEl = document.getElementById('chatbot-link-last-used');
    const copyBtn = document.querySelector('.chatbot-link-copy-btn');
    if (!statusEl || !codeBox || !codeEl || !expiryEl || !lastUsedEl) return;

    const code = String(userData.chatbotLinkCode || '').trim().toUpperCase();
    const expiresAt = toDateSafe(userData.chatbotLinkCodeExpiresAt);
    const lastUsedAt = toDateSafe(userData.chatbotLinkCodeLastUsedAt);
    const isActive = !!code && !!expiresAt && expiresAt.getTime() > Date.now();
    const pendingNoticeHtml = buildPendingChatbotConnectNotice();

    if (isActive) {
        statusEl.innerHTML = `<strong>!연결</strong>이 기본이에요. 어려울 때만 아래 등록 코드를 사용하세요.${pendingNoticeHtml}`;
        codeBox.style.display = 'block';
        codeEl.textContent = code;
        expiryEl.textContent = `만료 시간: ${formatDateTimeForUi(expiresAt)}`;
    } else {
        statusEl.innerHTML = `카카오톡 1:1 채팅에서 <strong>!연결</strong>만 입력하면 바로 연결돼요.${pendingNoticeHtml}`;
        codeBox.style.display = 'none';
        codeEl.textContent = '-';
        expiryEl.textContent = '만료 시간: -';
    }

    if (copyBtn) copyBtn.disabled = !isActive;
    if (fallbackToggle && !fallbackToggle.dataset.bound) {
        fallbackToggle.dataset.bound = '1';
        setChatbotLinkFallbackExpanded(false);
    }

    lastUsedEl.textContent = lastUsedAt
        ? `최근 연결 완료: ${formatDateTimeForUi(lastUsedAt)}`
        : '최근 연결 이력은 아직 없어요.';
}

async function loadChatbotLinkStatus() {
    const user = auth.currentUser;
    if (!user) {
        _chatbotLinkStatusCache = {};
        renderChatbotLinkStatus({});
        return null;
    }

    const snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) {
        _chatbotLinkStatusCache = {};
        renderChatbotLinkStatus({});
        return null;
    }

    const userData = snap.data() || {};
    _chatbotLinkStatusCache = userData;
    renderChatbotLinkStatus(userData);
    return userData;
}

function renderProfileFriendRequests() {
    const card = document.getElementById('profile-friend-requests-card');
    const list = document.getElementById('profile-friend-requests-list');
    if (!card || !list) return;

    const myUid = auth.currentUser?.uid;
    if (!myUid) {
        card.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    const incoming = getIncomingFriendRequests();
    const outgoing = getOutgoingFriendRequests();
    const activeFriendCount = getActiveFriendIds().length;
    card.style.display = 'block';

    const summaryHtml = `
        <div class="friend-request-summary">
            <span class="friend-request-chip">활성 친구 ${activeFriendCount}명</span>
            <span class="friend-request-chip">받은 요청 ${incoming.length}건</span>
            <span class="friend-request-chip">보낸 요청 ${outgoing.length}건</span>
        </div>
    `;

    if (incoming.length === 0 && outgoing.length === 0) {
        list.innerHTML = `${summaryHtml}<div class="friend-request-empty">아직 처리할 친구 요청이 없어요. 친구에게 초대 링크를 보내면 신규 가입도, 기존 회원 연결도 바로 이어져요.</div>`;
        return;
    }

    const incomingRows = incoming.map(friendship => {
        const name = escapeHtml(getFriendshipName(friendship, myUid));
        const requestedAt = formatDateTimeForUi(friendship.requestedAt);
        const friendshipId = escapeHtml(friendship.id || '');
        return `
            <div class="friend-request-row">
                <div class="friend-request-copy">
                    <div class="friend-request-name">${name}</div>
                    <div class="friend-request-meta">받은 요청 · ${requestedAt}</div>
                </div>
                <div class="friend-request-actions">
                    <button type="button" class="friend-request-btn" onclick="respondFriendRequest('${friendshipId}', false)">거절</button>
                    <button type="button" class="friend-request-btn accept" onclick="respondFriendRequest('${friendshipId}', true)">수락</button>
                </div>
            </div>
        `;
    }).join('');

    const outgoingRows = outgoing.map(friendship => {
        const name = escapeHtml(getFriendshipName(friendship, myUid));
        const requestedAt = formatDateTimeForUi(friendship.requestedAt);
        const friendshipId = escapeHtml(friendship.id || '');
        return `
            <div class="friend-request-row">
                <div class="friend-request-copy">
                    <div class="friend-request-name">${name}</div>
                    <div class="friend-request-meta">보낸 요청 · ${requestedAt} · 앱 수락 대기 중</div>
                </div>
                <div class="friend-request-actions">
                    <button type="button" class="friend-request-btn cancel" onclick="removeFriendship('${friendshipId}', true)">요청 취소</button>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = `${summaryHtml}${incomingRows}${outgoingRows}`;
}

async function loadMyFriendships(forceReload = false) {
    const user = auth.currentUser;
    if (!user) {
        cachedMyFriendships = new Map();
        cachedMyFriends = [];
        _friendshipsLoadedForUid = '';
        _friendshipsLoadingStartedAt = 0;
        sortedFilteredDirty = true;
        renderProfileFriendRequests();
        updatePwaActionableBadge({ friendRequests: 0 });
        return cachedMyFriendships;
    }

    if (!forceReload && _friendshipsLoadedForUid === user.uid && cachedMyFriendships.size > 0) {
        renderProfileFriendRequests();
        updatePwaActionableBadge({ friendRequests: getIncomingFriendRequests().length });
        return cachedMyFriendships;
    }

    if (_friendshipsLoadingPromise && !forceReload) {
        const isStaleLoad = _friendshipsLoadingStartedAt
            && (Date.now() - _friendshipsLoadingStartedAt) > (FRIENDSHIP_LOAD_TIMEOUT_MS * 2);
        if (isStaleLoad) {
            console.warn('[loadMyFriendships] stale friendship load discarded');
            _friendshipsLoadingPromise = null;
            _friendshipsLoadingStartedAt = 0;
        } else {
            await _friendshipsLoadingPromise;
            return cachedMyFriendships;
        }
    }

    _friendshipsLoadingStartedAt = Date.now();
    _friendshipsLoadingPromise = (async () => {
        const nextMap = new Map();
        try {
            const userSnap = await getDoc(doc(db, 'users', user.uid));
            const fallbackFriendIds = Array.isArray(userSnap.data()?.friends)
                ? [...new Set(userSnap.data().friends.map(value => String(value || '').trim()).filter(friendUid => friendUid && friendUid !== user.uid))]
                : [];
            fallbackFriendIds.forEach(friendUid => {
                nextMap.set(friendUid, buildFallbackActiveFriendship(user.uid, friendUid));
            });
            if (nextMap.size > 0) {
                cachedMyFriendships = new Map(nextMap);
                cachedMyFriends = getActiveFriendIds();
                _friendshipsLoadedForUid = user.uid;
                sortedFilteredDirty = true;
                renderProfileFriendRequests();
                updatePwaActionableBadge({ friendRequests: getIncomingFriendRequests().length });
            }
        } catch (error) {
            console.warn('[loadMyFriendships] user cache seed skipped:', error.message);
        }

        const friendshipQuery = query(
            collection(db, 'friendships'),
            where('users', 'array-contains', user.uid)
        );

        try {
            const snap = forceReload
                ? await getDocsFromServer(friendshipQuery).catch(() => getDocs(friendshipQuery))
                : await getDocs(friendshipQuery);
            snap.forEach(docSnap => {
                const friendship = { id: docSnap.id, ...docSnap.data() };
                const otherUid = getFriendshipOtherUid(friendship, user.uid);
                if (!otherUid) return;
                nextMap.set(otherUid, friendship);
            });
        } catch (error) {
            if (nextMap.size === 0) throw error;
            console.warn('[loadMyFriendships] live query failed, using user cache:', error.message);
        }

        cachedMyFriendships = nextMap;
        cachedMyFriends = getActiveFriendIds();
        _friendshipsLoadedForUid = user.uid;
        sortedFilteredDirty = true;
        renderProfileFriendRequests();
        updatePwaActionableBadge({ friendRequests: getIncomingFriendRequests().length });
    })();

    try {
        await _friendshipsLoadingPromise;
    } finally {
        _friendshipsLoadingPromise = null;
        _friendshipsLoadingStartedAt = 0;
    }

    return cachedMyFriendships;
}

async function waitForFriendshipsForUi({ forceReload = false, timeoutMs = FRIENDSHIP_LOAD_TIMEOUT_MS } = {}) {
    try {
        await Promise.race([
            loadMyFriendships(forceReload),
            new Promise((_, reject) => {
                window.setTimeout(() => reject(new Error('friendships_timeout')), timeoutMs);
            })
        ]);
        return { timedOut: false, activeFriendIds: getActiveFriendIds() };
    } catch (error) {
        if (error?.message === 'friendships_timeout') {
            console.warn('[friendships] timeout, using current cache');
            _friendshipsLoadingPromise = null;
            _friendshipsLoadingStartedAt = 0;
            return { timedOut: true, activeFriendIds: getActiveFriendIds() };
        }

        if (cachedMyFriendships.size > 0) {
            console.warn('[friendships] load failed, using cache:', error.message);
            return { timedOut: true, activeFriendIds: getActiveFriendIds() };
        }

        throw error;
    }
}

async function refreshFriendshipDependentUi(reloadGallery = false) {
    const user = auth.currentUser;
    if (!user) return;

    try {
        await loadMyFriendships(true);
    } catch (error) {
        console.warn('friendship refresh skipped:', error.message);
    }
    sortedFilteredDirty = true;

    if (getVisibleTabName() === 'dashboard') {
        renderDashboard();
    } else {
        const { todayStr } = getDatesInfo();
        renderFriendActivityCard(user, todayStr).catch(() => {});
        renderSocialChallenges(user).catch(() => {});
    }

    if (reloadGallery || getVisibleTabName() === 'gallery') {
        await loadGalleryData(true);
    }
}

async function requestFriend(targetUid) {
    const user = auth.currentUser;
    if (!user) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    try {
        await loadMyFriendships();
    } catch (error) {
        console.warn('friendship preload skipped:', error.message);
    }
    const relation = getFriendRelationship(targetUid);
    if (relation.status === 'active') {
        showToast('이미 연결된 친구예요.');
        return;
    }
    if (relation.status === 'pending') {
        if (findFriendshipById(relation.id)?.pendingForUid === user.uid) {
            openFriendRequestModal(relation.id);
        } else {
            showToast('이미 친구 요청을 보냈어요.');
        }
        return;
    }

    try {
        const fn = httpsCallable(functions, 'requestFriend');
        const result = await fn({ targetUid });
        const status = result.data?.status;
        if (status === 'incoming_pending') {
            showToast('상대가 먼저 요청을 보냈어요. 앱에서 바로 응답해보세요.');
            openFriendRequestModal(result.data?.friendshipId || relation.id);
        } else if (status === 'already_friends') {
            setOptimisticActiveFriendship(targetUid, result.data?.targetName);
            showToast('이미 친구로 연결되어 있어요.');
        } else if (status === 'pending_exists') {
            setOptimisticPendingFriendship(targetUid, result.data?.targetName);
            showToast('이미 친구 요청을 보냈어요.');
        } else {
            setOptimisticPendingFriendship(targetUid, result.data?.targetName);
            showToast('친구 요청을 보냈어요. 상대가 앱에서 수락하면 연결됩니다.');
        }
        await refreshFriendshipDependentUi(true);
    } catch (error) {
        console.error('friend request error:', error);
        showToast(`⚠️ ${error.message || '친구 요청에 실패했습니다.'}`);
    }
}

async function requestFriendByCode(friendCode) {
    const user = auth.currentUser;
    if (!user) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    try {
        const fn = httpsCallable(functions, 'requestFriend');
        const result = await fn({ friendCode });
        if (result.data?.status === 'incoming_pending') {
            openFriendRequestModal(result.data?.friendshipId || '');
        } else if (result.data?.status === 'already_friends') {
            if (result.data?.targetUid) {
                setOptimisticActiveFriendship(result.data.targetUid, result.data?.targetName);
            }
            showToast('이미 친구로 연결되어 있어요.');
        } else if (result.data?.status === 'pending_exists') {
            if (result.data?.targetUid) {
                setOptimisticPendingFriendship(result.data.targetUid, result.data?.targetName);
            }
            showToast('이미 친구 요청을 보냈어요.');
        } else {
            if (result.data?.targetUid) {
                setOptimisticPendingFriendship(result.data.targetUid, result.data?.targetName);
            }
            showToast('친구 요청을 보냈어요. 앱에서 수락을 기다려주세요.');
        }
        await refreshFriendshipDependentUi(true);
    } catch (error) {
        console.error('friend request by code error:', error);
        showToast(`⚠️ ${error.message || '친구 요청에 실패했습니다.'}`);
    }
}

async function submitProfileFriendCode() {
    const input = document.getElementById('profile-friend-code-input');
    const friendCode = String(input?.value || '').trim().toUpperCase();

    if (!friendCode) {
        showToast('친구 코드를 입력해 주세요.');
        input?.focus();
        return;
    }

    if (friendCode.length !== 6) {
        showToast('친구 코드는 6자리예요.');
        input?.focus();
        return;
    }

    await requestFriendByCode(friendCode);
    if (input) input.value = '';
}

function closeFriendRequestModal() {
    const modal = document.getElementById('friend-request-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    _pendingFriendRequestId = null;
}

async function openFriendRequestModal(friendshipId) {
    if (!friendshipId) return;

    await loadMyFriendships();
    let friendship = findFriendshipById(friendshipId);
    if (!friendship) {
        const snap = await getDoc(doc(db, 'friendships', friendshipId));
        if (!snap.exists()) {
            showToast('친구 요청을 찾을 수 없어요.');
            return;
        }
        friendship = { id: snap.id, ...snap.data() };
    }

    const myUid = auth.currentUser?.uid;
    if (!myUid || getEffectiveFriendshipStatus(friendship) !== 'pending' || friendship.pendingForUid !== myUid) {
        showToast('응답할 수 있는 친구 요청이 아니에요.');
        return;
    }

    const info = document.getElementById('friend-request-info');
    const modal = document.getElementById('friend-request-modal');
    if (!info || !modal) return;

    const friendName = escapeHtml(getFriendshipName(friendship, myUid));
    info.innerHTML = `<b>${friendName}</b>님이 친구 요청을 보냈어요.<br><span style="font-size:11px;color:#999;">수락하면 갤러리와 소셜 챌린지에서 바로 같이 움직일 수 있어요.</span>`;
    _pendingFriendRequestId = friendshipId;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

async function respondFriendRequest(friendshipId, accept) {
    const user = auth.currentUser;
    if (!user || !friendshipId) return;

    try {
        const fn = httpsCallable(functions, 'respondFriendRequest');
        const result = await fn({ friendshipId, accept });
        closeFriendRequestModal();
        if (accept || result.data?.result === 'accepted' || result.data?.result === 'already_active') {
            showToast('친구 연결이 완료됐어요!');
        } else {
            showToast('친구 요청을 거절했어요.');
        }
        await refreshFriendshipDependentUi(true);
    } catch (error) {
        console.error('friend response error:', error);
        showToast(`⚠️ ${error.message || '친구 요청 처리에 실패했습니다.'}`);
    }
}

async function respondPendingFriendRequest(accept) {
    if (!_pendingFriendRequestId) return;
    await respondFriendRequest(_pendingFriendRequestId, accept);
}

async function removeFriendship(friendshipId, isPendingCancel = false) {
    const user = auth.currentUser;
    if (!user || !friendshipId) return;

    const prompt = isPendingCancel
        ? '보낸 친구 요청을 취소할까요?'
        : '친구 연결을 해제할까요?';
    if (!window.confirm(prompt)) return;

    try {
        const fn = httpsCallable(functions, 'removeFriendship');
        await fn({ friendshipId });
        closeFriendRequestModal();
        showToast(isPendingCancel ? '친구 요청을 취소했어요.' : '친구 연결을 해제했어요.');
        await refreshFriendshipDependentUi(true);
    } catch (error) {
        console.error('remove friendship error:', error);
        showToast(`⚠️ ${error.message || '친구 연결 해제에 실패했습니다.'}`);
    }
}

async function generateChatbotLinkCode() {
    const user = auth.currentUser;
    if (!user) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    try {
        const fn = httpsCallable(functions, 'generateChatbotLinkCode');
        const result = await fn();
        setChatbotLinkFallbackExpanded(true);
        renderChatbotLinkStatus({
            chatbotLinkCode: result.data?.code,
            chatbotLinkCodeExpiresAt: result.data?.expiresAt
        });
        showToast(`카카오 등록 코드 ${result.data?.code || ''} 가 생성됐어요. 버튼 연결이 어려우면 카카오톡에서 !등록 코드 로 입력해 주세요.`);
    } catch (error) {
        console.error('generate chatbot link code error:', error);
        showToast(`⚠️ ${error.message || '카카오 등록 코드 생성에 실패했습니다.'}`);
    }
}

async function copyChatbotLinkCode() {
    const code = document.getElementById('chatbot-link-code')?.textContent?.trim();
    if (!code || code === '-') {
        showToast('먼저 보조 등록 코드를 만들어 주세요.');
        return;
    }

    try {
        await navigator.clipboard.writeText(code);
        showToast('카카오 등록 코드를 복사했어요.');
    } catch (_) {
        showToast('코드 복사에 실패했어요. 길게 눌러 직접 복사해 주세요.');
    }
}

// ========== 닉네임 변경 ==========
function getUserDisplayName() {
    return window._userDisplayName || auth.currentUser?.displayName || '사용자';
}

async function changeDisplayName() {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const input = document.getElementById('profile-nickname');
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) { showToast('닉네임을 입력해주세요.'); return; }
    if (newName.length > 20) { showToast('닉네임은 20자까지 가능합니다.'); return; }
    if (newName === getUserDisplayName()) { showToast('현재 사용 중인 닉네임입니다.'); return; }

    try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { customDisplayName: sanitizeText(newName) }, { merge: true });
        window._userDisplayName = newName;

        // 좌측 상단 이름 업데이트
        document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(newName)}`;

        // 갤러리 공유 카드 이름 업데이트
        renderShareCardState(user, getCurrentShareLog(user.uid)?.data || null, getCurrentShareSettings());

        // 리포트 이름 업데이트
        const reportNameEl = document.getElementById('report-user-name');
        if (reportNameEl) reportNameEl.textContent = newName;

        showToast('✅ 닉네임이 변경되었습니다.');
    } catch (e) {
        console.error('닉네임 변경 오류:', e);
        showToast('⚠️ 닉네임 변경에 실패했습니다.');
    }
}

// -------------------------------------------------------------------------
// blockchain-manager는 동적으로 로드 (실패해도 앱 작동)
let updateChallengeProgress = async () => { };
let getConversionRate = () => 100;
let getCurrentEra = () => 1;
let fetchTokenStats = async () => null;
import('./blockchain-manager.js').then(mod => {
    updateChallengeProgress = mod.updateChallengeProgress;
    getConversionRate = mod.getConversionRate;
    getCurrentEra = mod.getCurrentEra;
    fetchTokenStats = mod.fetchTokenStats;
    console.log('✅ app.js: 블록체인 모듈 로드');
}).catch(e => console.warn('⚠️ app.js: 블록체인 모듈 로드 실패:', e.message));

// 프로그레시브 마일스톤 체크 (자동 감지, 보너스는 클릭 시 지급)
async function checkMilestones(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        let milestones = userData.milestones || {};
        let newMilestones = [];

        // 일일 기록 조회
        const q = query(collection(db, "daily_logs"), where("userId", "==", userId), orderBy("date", "desc"), limit(61));
        let logs = [];
        try {
            const logsSnap = await getDocs(q);
            logsSnap.forEach(d => logs.push({ date: d.data().date, awarded: d.data().awardedPoints }));
        } catch (e) {
            console.warn('⚠️ 마일스톤 로그 조회 스킵:', e.message);
            logs = [];
        }

        // 통계 계산
        let streak = 0;
        for (let log of logs) {
            if (log.awarded?.diet || log.awarded?.exercise || log.awarded?.mind) streak++;
            else break;
        }
        let dietCount = 0, exerciseCount = 0, mindCount = 0;
        for (let log of logs) {
            if (log.awarded?.diet) dietCount++;
            if (log.awarded?.exercise) exerciseCount++;
            if (log.awarded?.mind) mindCount++;
        }

        const statMap = { streak, diet: dietCount, exercise: exerciseCount, mind: mindCount, points: coins };

        // 각 마일스톤 확인
        for (const [category, catData] of Object.entries(MILESTONES)) {
            const val = statMap[category] || 0;
            for (const level of catData.levels) {
                if (!milestones[level.id]?.achieved && val >= level.target) {
                    milestones[level.id] = { achieved: true, date: getKstDateString(), bonusClaimed: false };
                    newMilestones.push(level);
                }
            }
        }

        // 구 뱃지 → 마일스톤 마이그레이션
        const badges = userData.badges || {};
        const badgeMap = { starter: 'streak1', streak7: 'streak7', diet7: 'diet7', exercise7: 'exercise7', mind7: 'mind7', streak30: 'streak30', points100: 'points100', points300: 'points300' };
        let migrated = false;
        for (const [old, nw] of Object.entries(badgeMap)) {
            if (badges[old]?.earned && !milestones[nw]?.achieved) {
                milestones[nw] = { achieved: true, date: badges[old].date || getKstDateString(), bonusClaimed: badges[old].bonusAwarded || false };
                migrated = true;
            }
        }

        const reconciled = reconcileMilestoneState(milestones, MILESTONES, {
            statMap,
            today: getKstDateString()
        });
        milestones = reconciled.milestones;
        newMilestones = reconciled.freshMilestones;

        const saveFields = (newMilestones.length > 0 || migrated || reconciled.changed)
            ? { milestones, currentStreak: streak }
            : { currentStreak: streak };
        // failed-precondition(동시 쓰기 충돌) 시 1회 재시도
        try {
            await setDoc(userRef, saveFields, { merge: true });
        } catch (e2) {
            if (e2.code === 'failed-precondition') {
                await new Promise(r => setTimeout(r, 1000));
                await setDoc(userRef, saveFields, { merge: true });
            } else { throw e2; }
        }
        newMilestones.forEach(m => {
            showToast(`🎯 마일스톤 달성! ${m.emoji} ${m.name} — 보너스 +${m.reward}P를 받아가세요!`);
        });
    } catch (error) {
        console.warn('마일스톤 확인 스킵:', error.code || error.message);
    }
}

// 마일스톤 UI 렌더링 (프로그레시브)
async function renderMilestones(userId, prefetchedData) {
    try {
        let userData;
        if (prefetchedData) {
            userData = prefetchedData;
        } else {
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);
            userData = userSnap.exists() ? userSnap.data() : {};
        }
        const reconciled = reconcileMilestoneState(userData.milestones || {}, MILESTONES, {
            today: getKstDateString()
        });
        const milestones = reconciled.milestones;

        if (reconciled.changed) {
            setDoc(doc(db, "users", userId), { milestones }, { merge: true }).catch(error => {
                console.warn('마일스톤 정규화 저장 스킵:', error.code || error.message);
            });
        }

        const grid = document.getElementById('badges-grid');
        grid.innerHTML = '';
        let hasClaimed = false;

        for (const [category, catData] of Object.entries(MILESTONES)) {
            const levels = catData.levels;
            let currentIdx = levels.findIndex(l => !milestones[l.id]?.achieved);
            if (currentIdx === -1) currentIdx = levels.length;

            const completed = levels.slice(0, currentIdx);
            const claimable = completed.filter(lv => !milestones[lv.id]?.bonusClaimed);
            const claimed = completed.filter(lv => milestones[lv.id]?.bonusClaimed);

            let cardHtml = `<div class="milestone-card">`;
            cardHtml += `<div class="milestone-card-label">${catData.label}</div>`;

            // 현재 목표 (라벨 바로 아래 배치)
            if (currentIdx < levels.length) {
                const cur = levels[currentIdx];
                cardHtml += `<div class="milestone-current-target">`;
                cardHtml += `<div class="milestone-current-emoji">${cur.emoji}</div>`;
                cardHtml += `<div class="milestone-current-info">`;
                cardHtml += `<div class="milestone-current-name">🎯 ${cur.name}</div>`;
                cardHtml += `<div class="milestone-current-desc">${cur.desc}</div>`;
                cardHtml += `</div></div>`;
            } else {
                cardHtml += `<div class="milestone-all-done">🎉 모든 레벨 완료!</div>`;
            }

            // 클레임 가능한 마일스톤 (항상 표시)
            if (claimable.length > 0) {
                cardHtml += `<div class="ms-claimable-list">`;
                for (const lv of claimable) {
                    cardHtml += `<div class="milestone-completed-item claimable" onclick="claimMilestoneBonus('${lv.id}', ${lv.reward})"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-claim-btn">+${lv.reward}P 받기</span></div>`;
                }
                cardHtml += `</div>`;
            }

            // 이미 수령한 마일스톤 (글로벌 토글로 숨김)
            if (claimed.length > 0) {
                hasClaimed = true;
                cardHtml += `<div class="ms-claimed-row" style="display:none;">`;
                for (const lv of claimed) {
                    cardHtml += `<div class="milestone-completed-item done"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-check">✅</span></div>`;
                }
                cardHtml += `</div>`;
            }

            cardHtml += `</div>`;
            grid.innerHTML += cardHtml;
        }

        // 수령완료 마일스톤이 있으면 펼치기 버튼 표시
        const expandBtn = document.getElementById('ms-expand-btn');
        if (expandBtn) expandBtn.style.display = hasClaimed ? '' : 'none';
        document.getElementById('milestone-section').style.display = 'block';
    } catch (error) {
        console.error('마일스톤 렌더링 오류:', error);
        const section = document.getElementById('milestone-section');
        if (section) section.style.display = 'none';
    }
}

// 마일스톤 보너스 클릭 시 수령
window.claimMilestoneBonus = async function (milestoneId, reward) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) { showToast('❌ 로그인이 필요합니다.'); return; }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        const milestones = userData.milestones || {};

        if (!milestones[milestoneId]?.achieved) { showToast('❌ 아직 달성하지 못한 마일스톤입니다.'); return; }
        if (milestones[milestoneId]?.bonusClaimed) { showToast('이미 보너스를 수령했습니다.'); return; }

        milestones[milestoneId].bonusClaimed = true;
        milestones[milestoneId].bonusAmount = reward;
        await setDoc(userRef, { milestones }, { merge: true });

        showToast(`🎁 보너스 +${reward}P 지급 완료!`);
        const pointEl = document.getElementById('point-balance');
        const currentPts = parseInt(pointEl?.textContent) || 0;
        if (pointEl) pointEl.textContent = currentPts + reward;

        renderMilestones(currentUser.uid);
    } catch (error) {
        console.error('보너스 수령 오류:', error);
        showToast('⚠️ 보너스 지급 중 오류가 발생했습니다.');
    }
};

try {
    const { todayStr, yesterdayStr, weekStrs } = getDatesInfo();
    const dateInput = document.getElementById('selected-date');
    if (dateInput) {
        dateInput.max = todayStr;
        // KST 기준 30일 전까지 선택 가능
        const minDate = new Date(todayStr);
        minDate.setDate(minDate.getDate() - 30);
        dateInput.min = minDate.toISOString().split('T')[0];
        dateInput.value = todayStr;
        dateInput.addEventListener('change', () => {
            if (window.loadDataForSelectedDate) window.loadDataForSelectedDate(dateInput.value);
        });
    }

    window.changeDateTo = function (dStr) {
        const di = document.getElementById('selected-date');
        if (di) di.value = dStr;
        if (window.loadDataForSelectedDate) window.loadDataForSelectedDate(dStr);
        window.scrollTo(0, 0);
    };
} catch (e) {
    console.error('app.js 초기화 오류:', e);
}

// showToast, sanitize 등은 상단에서 직접 import

// 중복 코드 통합: 운동 블록 추가 통합 함수
function addExerciseBlock(type, data = null) {
    const isCardio = type === 'cardio';
    const listId = isCardio ? 'cardio-list' : 'strength-list';
    const list = document.getElementById(listId);
    const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const div = document.createElement('div');
    div.className = `exercise-block ${type}-block`;
    div.id = id;

    let contentHtml = '';
    let dataUrl = '';

    // AI 분석 결과 저장용 data attribute
    const hasAnalysis = data && data.aiAnalysis;

    if (isCardio) {
        const safeImgUrl = data && data.imageUrl && isValidStorageUrl(data.imageUrl) ? escapeHtml(data.imageUrl) : '';
        const imgHtml = `<div style="position:relative;">
            <img id="c_img_${id}" class="preview-img" ${safeImgUrl ? `src="${safeImgUrl}" style="display:block;"` : ''}>
            <button class="static-rotate-btn" style="${safeImgUrl ? 'display:block;' : 'display:none;'}" onclick="rotateImage(event, 'c_img_${id}', 'file_c_${id}')">🔄</button>
            <button id="rm_c_${id}" class="static-remove-btn" style="${safeImgUrl ? 'display:block;' : 'display:none;'}" onclick="removeStaticImage(event, 'file_c_${id}', 'c_img_${id}', 'rm_c_${id}', 'txt_c_${id}')">X 삭제</button>
        </div>`;
        dataUrl = data && data.imageUrl ? data.imageUrl : '';

        contentHtml = `
            <button class="block-remove-btn" onclick="removeExerciseBlock(this.parentElement)">X</button>
            <label class="upload-area">
                <input type="file" id="file_c_${id}" accept="image/*" class="exer-file" onchange="previewStaticImage(this, 'c_img_${id}', 'rm_c_${id}')">
                <span id="txt_c_${id}" style="color:#666; font-size:13px; ${data && data.imageUrl ? 'display:none;' : ''}">운동 이미지 올리기</span>
                ${imgHtml}
            </label>
        `;
    } else {
        // 동영상 URL은 이미지 태그에 표시 불가 → 항상 플레이스홀더 사용
        const statusHtml = `
            <div id="s_preview_${id}" class="preview-strength" style="${data && data.videoUrl ? 'display:block;' : 'display:none;'}">
                <img id="s_img_${id}" class="preview-strength-img" alt="근력 영상 썸네일">
                <span class="preview-strength-play">▶</span>
            </div>
        `;
        dataUrl = data && data.videoUrl ? data.videoUrl : '';

        contentHtml = `
            <button class="block-remove-btn" onclick="removeExerciseBlock(this.parentElement)">X</button>
            <label class="upload-area">
                <input type="file" id="file_s_${id}" accept="video/*" class="exer-file" onchange="previewDynamicVid(this)">
                <span style="color:#666; font-size:13px; ${data && data.videoUrl ? 'display:none;' : ''}">운동 영상 올리기</span>
                ${statusHtml}
            </label>
        `;
    }

    div.innerHTML = contentHtml;
    if (dataUrl) div.setAttribute('data-url', dataUrl);
    if (isCardio && data && data.imageThumbUrl) {
        div.setAttribute('data-thumb-url', data.imageThumbUrl);
    }
    if (!isCardio && data && data.videoThumbUrl) {
        div.setAttribute('data-thumb-url', data.videoThumbUrl);
    }
    // AI 분석 결과 보존 (갤러리에서 표시용)
    if (hasAnalysis) {
        div.setAttribute('data-ai-analysis', JSON.stringify(data.aiAnalysis));
    }
    list.appendChild(div);
    updateRecordFlowGuides('exercise');

    // 근력 영상 썸네일: 플레이스홀더 표시 후 실제 프레임 추출 시도
    if (!isCardio && data && data.videoUrl && isValidStorageUrl(data.videoUrl)) {
        const thumbImg = document.getElementById(`s_img_${id}`);
        if (thumbImg && data.videoThumbUrl && isValidStorageUrl(data.videoThumbUrl)) {
            thumbImg.src = data.videoThumbUrl;
        } else {
            if (thumbImg) thumbImg.src = createVideoPlaceholderBase64();
            // Firebase Storage URL에서도 프레임 추출 시도 (CORS 지원)
            extractVideoThumbFromUrl(data.videoUrl)
                .then((thumbDataUrl) => {
                    if (!thumbDataUrl) return;
                    const ti = document.getElementById(`s_img_${id}`);
                    if (ti) ti.src = thumbDataUrl;
                })
                .catch(() => { });
        }
    }
}

window.removeExerciseBlock = function(block) {
    if (!block) return;
    const input = block.querySelector('.exer-file');
    if (input?.id) _pendingUploads.delete(input.id);
    block.remove();
    updateRecordFlowGuides('exercise');
};

// 호환성을 위한 wrapper 함수
function addCardioBlock(data = null) {
    addExerciseBlock('cardio', data);
}
function addStrengthBlock(data = null) {
    addExerciseBlock('strength', data);
}
window.addCardioBlock = addCardioBlock;
window.addStrengthBlock = addStrengthBlock;

function findReusableExerciseBlock(type) {
    const selector = type === 'cardio' ? '.cardio-block' : '.strength-block';
    return Array.from(document.querySelectorAll(selector)).find((block) => {
        return isExerciseBlockEmpty(block);
    }) || null;
}

function isExerciseBlockEmpty(block) {
    if (!block) return false;
    const input = block.querySelector('.exer-file');
    const previewImg = block.querySelector('.preview-img, .preview-strength-img');
    const previewWrap = block.querySelector('.preview-strength');
    const hasFile = !!(input?.files && input.files.length > 0);
    const hasUrl = !!block.getAttribute('data-url');
    const hasThumb = !!block.getAttribute('data-thumb-url');
    const srcValue = previewImg?.getAttribute('src') || '';
    const hasPreview = !!srcValue && !srcValue.startsWith('data:image/gif;base64,R0lGODlhAQAB');
    const previewVisible = !!(previewWrap && previewWrap.style.display && previewWrap.style.display !== 'none');
    return !(hasFile || hasUrl || hasThumb || hasPreview || previewVisible);
}

// CTA에서 블록 생성 후 파일 선택 다이얼로그 열기
window.addCardioBlockWithFile = function() {
    const reusableBlock = findReusableExerciseBlock('cardio');
    if (reusableBlock) {
        const reusableInput = reusableBlock.querySelector('.exer-file');
        if (reusableInput) reusableInput.click();
        return;
    }
    addCardioBlock();
    const blocks = document.querySelectorAll('.cardio-block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
        const innerInput = lastBlock.querySelector('.exer-file');
        if (innerInput) innerInput.click();
    }
};

window.addStrengthBlockWithFile = function() {
    const reusableBlock = findReusableExerciseBlock('strength');
    if (reusableBlock) {
        const reusableInput = reusableBlock.querySelector('.exer-file');
        if (reusableInput) reusableInput.click();
        return;
    }
    addStrengthBlock();
    const blocks = document.querySelectorAll('.strength-block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
        const innerInput = lastBlock.querySelector('.exer-file');
        if (innerInput) innerInput.click();
    }
};

window.previewDynamicVid = function (input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_VID_SIZE) { alert("100MB 이하만 가능!"); input.value = ""; return; }

    // 동영상 파일의 수정 날짜 확인 (촬영 당일만 허용)
    const fileDate = new Date(file.lastModified);
    const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const selectedDateStr = document.getElementById('selected-date').value;

    if (fileDateStr !== selectedDateStr) {
        if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${selectedDateStr})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
            input.value = "";
            return;
        }
    }

    const previewWrap = input.parentElement.querySelector('.preview-strength');
    const previewImg = input.parentElement.querySelector('.preview-strength-img');
    // 업로드 텍스트 숨기기
    const uploadText = input.parentElement.querySelector('span');
    if (uploadText) uploadText.style.display = 'none';
    previewWrap.style.display = 'block';



    // 즉시 플레이스홈더 표시 (검은박스 방지)
    previewImg.src = createVideoPlaceholderBase64();

    if (auth?.currentUser && input.id) {
        _pendingUploads.delete(input.id);
        const localThumbSeed = String(
            input.closest('.strength-block')?.getAttribute('data-local-thumb')
            || ''
        ).trim();
        const pendingUpload = uploadVideoWithThumb(file, 'exercise_videos', auth.currentUser.uid, localThumbSeed);
        _pendingUploads.set(input.id, { promise: pendingUpload.promise, thumbPromise: pendingUpload.thumbPromise, done: false, result: null });
        pendingUpload.promise.then(r => {
            const entry = _pendingUploads.get(input.id);
            if (entry) { entry.done = true; entry.result = r; }
        }).catch(() => _pendingUploads.delete(input.id));
    }

    // 로컬 파일에서 실제 프레임 썸네일 추출
    const objectUrl = URL.createObjectURL(file);
    extractVideoThumbFromFile(file)
        .then((thumbDataUrl) => {
            if (thumbDataUrl) {
                previewImg.src = thumbDataUrl;
                previewImg.setAttribute('data-local-thumb', thumbDataUrl);
                const currentBlock = input.closest('.strength-block');
                if (currentBlock) currentBlock.setAttribute('data-local-thumb', thumbDataUrl);
                const pendingEntry = _pendingUploads.get(input.id);
                if (pendingEntry) pendingEntry.localThumbDataUrl = thumbDataUrl;
            }
        })
        .catch(() => { })
        .finally(() => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
        });

    const currentBlock = input.closest('.strength-block');
    const strengthList = document.getElementById('strength-list');
    if (currentBlock && strengthList) {
        const firstBlock = strengthList.querySelector('.strength-block');
        if (firstBlock && firstBlock !== currentBlock && isExerciseBlockEmpty(firstBlock)) {
            strengthList.insertBefore(currentBlock, firstBlock);
        }
    }

    updateRecordFlowGuides('exercise');
};

// AI 분석용 이미지 압축 (base64 data URL → 최대 480px 리사이즈, 품질 0.5)
function compressImageForAI(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 480;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
                if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                else { w = Math.round(w * MAX / h); h = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// 로컬 File 객체에서 동영상 프레임 추출 (가장 신뢰성 높음)
function extractVideoThumbFromFile(file) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);

        let resolved = false;
        const done = (val) => {
            if (resolved) return;
            resolved = true;
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.remove();
            URL.revokeObjectURL(objectUrl);
            resolve(val || '');
        };

        // 10초 타임아웃
        const timer = setTimeout(() => done(''), 10000);

        video.addEventListener('error', () => { clearTimeout(timer); done(''); }, { once: true });

        video.addEventListener('loadeddata', () => {
            try {
                const dur = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = dur > 1 ? 0.8 : 0.01;
            } catch (_) { clearTimeout(timer); done(''); }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 180;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, w, h);

                // 검은 프레임 감지: 중앙 픽셀이 모두 0이면 재시도
                const px = ctx.getImageData(w / 2, h / 2, 1, 1).data;
                if (px[0] === 0 && px[1] === 0 && px[2] === 0) {
                    const retryTime = Math.min((video.duration || 1) > 2 ? 2 : 0.5, video.duration || 1);
                    video.currentTime = retryTime;
                    video.addEventListener('seeked', () => {
                        try {
                            ctx.drawImage(video, 0, 0, w, h);
                            clearTimeout(timer);
                            done(canvas.toDataURL('image/jpeg', 0.85));
                        } catch (_) { clearTimeout(timer); done(''); }
                    }, { once: true });
                    return;
                }

                clearTimeout(timer);
                done(canvas.toDataURL('image/jpeg', 0.85));
            } catch (_) { clearTimeout(timer); done(''); }
        }, { once: true });

        video.src = objectUrl;
        video.load();
    });
}

async function extractVideoThumbFromUrl(videoUrl) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        // Firebase Storage URL은 crossOrigin 필요
        if (videoUrl && !videoUrl.startsWith('blob:')) {
            video.crossOrigin = 'anonymous';
        }

        let resolved = false;
        const cleanup = () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        };
        const done = (val) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(val || '');
        };

        // 8초 타임아웃
        const timer = setTimeout(() => done(''), 8000);

        video.addEventListener('error', () => { clearTimeout(timer); done(''); }, { once: true });
        video.addEventListener('loadeddata', () => {
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = duration > 1 ? 0.8 : 0.01;
            } catch (_) {
                clearTimeout(timer); done('');
            }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, video.videoWidth || 320);
                canvas.height = Math.max(1, video.videoHeight || 180);
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                clearTimeout(timer);
                done(dataUrl);
            } catch (_) {
                clearTimeout(timer); done('');
            }
        }, { once: true });

        video.src = videoUrl;
        video.load();
    });
}
// 갤러리에서 접근 가능하도록 전역 노출
window.extractVideoThumbFromUrl = extractVideoThumbFromUrl;

window.previewStaticImage = function (input, previewId, btnId, skipExif = false) {
    const preview = document.getElementById(previewId);
    const rmBtn = document.getElementById(btnId);
    // 인증 날짜 input 보장
    const dateInput = document.getElementById('selected-date');
    // 텍스트 스팬 찾기: diet용 txt-xxx 또는 cardio용 txt_c_xxx
    let txtSpan = null;
    if (previewId.startsWith('preview-')) {
        txtSpan = document.getElementById('txt-' + previewId.split('-')[1]);
    } else if (previewId.startsWith('c_img_')) {
        txtSpan = document.getElementById('txt_c_' + previewId.substring(6));
    }

    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > MAX_IMG_SIZE) { alert("20MB 이하만 가능합니다."); input.value = ""; return; }

        // 파일 선택 즉시 백그라운드 업로드 시작 (저장 버튼 클릭 시 이미 완료되어 있음)
        if (auth?.currentUser && input.id) {
            const folder = input.id.startsWith('diet-') ? 'diet_images'
                         : input.id === 'sleep-img' ? 'sleep_images'
                         : input.id.startsWith('file_c_') ? 'exercise_images' : null;
            if (folder) {
                _pendingUploads.delete(input.id);
                const p = uploadWithThumb(file, folder, auth.currentUser.uid);
                _pendingUploads.set(input.id, { promise: p, done: false, result: null });
                p.then(r => {
                    const entry = _pendingUploads.get(input.id);
                    if (entry) { entry.done = true; entry.result = r; }
                }).catch(() => _pendingUploads.delete(input.id));
            }
        }

        const render = () => {
            const reader = new FileReader();
            reader.onload = e => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                if (rmBtn) rmBtn.style.display = 'block';
                if (txtSpan) txtSpan.style.display = 'none';

                // 회전 버튼 표시
                const rotBtn = preview.parentElement.querySelector('.static-rotate-btn');
                if (rotBtn) rotBtn.style.display = 'block';

                // 미리보기 클릭 시 라이트박스 열기
                preview.onclick = () => { if (preview.src) window.openLightbox(preview.src); };

                // 운동 블록 기존 분석 초기화
                const exerciseBlock = input.closest('.exercise-block');
                if (exerciseBlock) {
                    exerciseBlock.removeAttribute('data-ai-analysis');
                    exerciseBlock.removeAttribute('data-url');
                    // 이미지 업로드 성공 시 다른 빈 cardio 블록 제거
                    if (exerciseBlock.classList.contains('cardio-block')) {
                        document.querySelectorAll('#cardio-list .cardio-block').forEach(block => {
                            if (block === exerciseBlock) return;
                            const img = block.querySelector('.preview-img');
                            if (!img || img.style.display === 'none' || !img.src || img.src === '') {
                                block.remove();
                            }
                        });
                    }
                }

                // 식단 AI 분석 버튼 표시 + 기존 분석 초기화
                if (previewId.startsWith('preview-')) {
                    const meal = previewId.substring(8);
                    const aiBtn = document.getElementById(`ai-btn-${meal}`);
                    if (aiBtn) {
                        aiBtn.style.display = 'block';
                        aiBtn.textContent = '🤖 AI 분석';
                    }
                    // 기존 분석 결과 초기화
                    const resultContainer = document.getElementById(`diet-analysis-${meal}`);
                    if (resultContainer) {
                        resultContainer._analysisData = null;
                        resultContainer.innerHTML = '';
                        resultContainer.style.display = 'none';
                    }
                    // 수면 분석 초기화
                    if (meal === 'sleep') {
                        const sleepResult = document.getElementById('sleep-analysis-result');
                        if (sleepResult) { sleepResult._analysisData = null; sleepResult.innerHTML = ''; sleepResult.style.display = 'none'; }
                        if (aiBtn) aiBtn.removeAttribute('data-analyzed');
                    }
                }

                updateRecordFlowGuides(getVisibleTabName());
            }
            reader.readAsDataURL(file);

            // 빈 박스 보이기 로직
            const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
            const mealPrefix = 'preview-';
            if (previewId.startsWith(mealPrefix)) {
                const currentMeal = previewId.substring(mealPrefix.length);
                const currentIndex = mealOrder.indexOf(currentMeal);
                if (currentIndex >= 0 && currentIndex < mealOrder.length - 1) {
                    const nextMeal = mealOrder[currentIndex + 1];
                    const nextBox = document.getElementById(`diet-box-${nextMeal}`);
                    if (nextBox) {
                        nextBox.style.display = 'block';
                    }
                }
            }
        };

        if (!skipExif) {
            _ensureExif().then(() => EXIF.getData(file, function () {
                const exifDate = EXIF.getTag(this, "DateTimeOriginal");
                if (exifDate) {
                    // EXIF 날짜가 있으면 EXIF로 검증
                    const dateParts = exifDate.split(" ")[0].replace(/:/g, "-");
                    if (dateParts !== dateInput.value) {
                        if (!confirm(`⚠️ 촬영일(${dateParts})이 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                            input.value = ""; preview.style.display = 'none';
                            if (rmBtn) rmBtn.style.display = 'none';
                            if (txtSpan) txtSpan.style.display = 'inline-block';
                            return;
                        }
                    }
                } else {
                    // EXIF 없으면 파일 수정일(lastModified)로 검증
                    const fileDate = new Date(file.lastModified);
                    const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                    if (fileDateStr !== dateInput.value) {
                        if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                            input.value = ""; preview.style.display = 'none';
                            if (rmBtn) rmBtn.style.display = 'none';
                            if (txtSpan) txtSpan.style.display = 'inline-block';
                            return;
                        }
                    }
                }
                render();
            })).catch(() => render());
        } else if (!skipExif) {
            // EXIF 라이브러리 없을 때도 lastModified로 검증
            const fileDate = new Date(file.lastModified);
            const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            if (fileDateStr !== dateInput.value) {
                if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                    input.value = ""; preview.style.display = 'none';
                    if (rmBtn) rmBtn.style.display = 'none';
                    if (txtSpan) txtSpan.style.display = 'inline-block';
                    return;
                }
            }
            render();
        } else { render(); }
    }
};

window.removeStaticImage = function (e, inputId, previewId, btnId, txtId) {
    e.preventDefault(); e.stopPropagation();
    _pendingUploads.delete(inputId); // 진행 중인 pre-upload 폐기
    document.getElementById(inputId).value = "";
    document.getElementById(previewId).src = "";
    document.getElementById(previewId).style.display = "none";
    document.getElementById(previewId).setAttribute('data-user-removed', 'true');
    document.getElementById(previewId).removeAttribute('data-saved-url');
    document.getElementById(previewId).removeAttribute('data-saved-thumb-url');
    document.getElementById(btnId).style.display = "none";
    if (document.getElementById(txtId)) document.getElementById(txtId).style.display = "inline-block";

    // 회전 버튼 숨기기
    const previewEl = document.getElementById(previewId);
    const rotBtn = previewEl?.parentElement?.querySelector('.static-rotate-btn');
    if (rotBtn) rotBtn.style.display = 'none';

    // 식단 분석 결과 초기화 및 가리기
    const mealPrefix = 'preview-';
    if (previewId.startsWith(mealPrefix)) {
        const meal = previewId.substring(mealPrefix.length);
        const resultContainer = document.getElementById(`diet-analysis-${meal}`);
        const aiBtn = document.getElementById(`ai-btn-${meal}`);
        if (resultContainer) {
            resultContainer._analysisData = null;
            resultContainer.innerHTML = '';
            resultContainer.style.display = 'none';
        }
        if (aiBtn) {
            aiBtn.style.display = 'none';
            aiBtn.textContent = '🤖 AI 분석';
        }
        // 수면 분석 초기화
        if (meal === 'sleep') {
            const sleepResult = document.getElementById('sleep-analysis-result');
            if (sleepResult) { sleepResult._analysisData = null; sleepResult.innerHTML = ''; sleepResult.style.display = 'none'; }
            if (aiBtn) aiBtn.removeAttribute('data-analyzed');
        }
    }

    // 운동 블록 AI 분석 초기화
    if (previewEl) {
        const exerciseBlock = previewEl.closest('.exercise-block');
        if (exerciseBlock) {
            exerciseBlock.removeAttribute('data-ai-analysis');
            exerciseBlock.removeAttribute('data-url');
        }
    }

    updateRecordFlowGuides(getVisibleTabName());
};

// 90° 시계방향 회전
window.rotateImage = function (e, previewId, inputId) {
    e.preventDefault(); e.stopPropagation();
    const img = document.getElementById(previewId);
    if (!img || !img.src) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';
    tempImg.onload = () => {
        canvas.width = tempImg.height;
        canvas.height = tempImg.width;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(tempImg, -tempImg.width / 2, -tempImg.height / 2);

        const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        img.src = rotatedDataUrl;

        // file input에 회전된 이미지를 Blob으로 교체
        canvas.toBlob((blob) => {
            if (!blob) return;
            const input = document.getElementById(inputId);
            if (!input) return;
            _pendingUploads.delete(inputId); // 회전 전 pre-upload 무효화
            const file = new File([blob], 'rotated.jpg', { type: 'image/jpeg', lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }, 'image/jpeg', 0.92);
    };
    tempImg.src = img.src;
};

function openDietSlotPicker(slot, source = 'library') {
    const input = document.getElementById(`diet-img-${slot}`);
    const box = document.getElementById(`diet-box-${slot}`);
    if (!input) return false;

    if (box) box.style.display = 'block';

    const normalizedSource = source === 'camera' ? 'camera' : 'library';
    const cleanup = () => {
        input.removeAttribute('capture');
        input.removeEventListener('change', cleanup, true);
        window.removeEventListener('focus', handleFocus, true);
    };
    const handleFocus = () => window.setTimeout(cleanup, 0);

    if (normalizedSource === 'camera') {
        input.setAttribute('capture', 'environment');
    } else {
        input.removeAttribute('capture');
    }

    input.addEventListener('change', cleanup, { once: true, capture: true });
    window.addEventListener('focus', handleFocus, { once: true, capture: true });
    input.click();
    return true;
}

/* CTA 버튼: 다음 빈 식단 칸으로 이동 */
window.clickNextEmptyDietSlot = function (source = 'library') {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    for (const slot of slots) {
        const preview = document.getElementById(`preview-${slot}`);
        const isEmpty = !preview || preview.style.display === 'none' || !preview.src || preview.src === '' || preview.src === window.location.href;
        if (isEmpty) {
            openDietSlotPicker(slot, source);
            return;
        }
    }
    showToast('모든 식단 칸이 채워져 있습니다.');
};

function getKstDateTimePartsFromTimestamp(timestamp = Date.now()) {
    const parsedTimestamp = Number(timestamp);
    const safeDate = Number.isFinite(parsedTimestamp) ? new Date(parsedTimestamp) : new Date();
    return {
        date: safeDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
        time: safeDate.toLocaleTimeString('en-GB', {
            timeZone: 'Asia/Seoul',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
    };
}

function getDietFileFallbackDateTime(file) {
    return getKstDateTimePartsFromTimestamp(file?.lastModified || Date.now());
}

function readDietFileExifDateTime(file) {
    return new Promise((resolve) => {
        if (typeof EXIF === 'undefined') {
            resolve(null);
            return;
        }
        try {
            EXIF.getData(file, function () {
                const exifDate = EXIF.getTag(this, 'DateTimeOriginal') || EXIF.getTag(this, 'DateTime');
                if (!exifDate) {
                    resolve(null);
                    return;
                }

                const parts = String(exifDate).trim().split(' ');
                const resolvedDate = parts[0] ? parts[0].replace(/:/g, '-') : '';
                if (!resolvedDate) {
                    resolve(null);
                    return;
                }

                resolve({
                    date: resolvedDate,
                    time: parts[1] || '99:99:99'
                });
            });
        } catch (_) {
            resolve(null);
        }
    });
}

async function buildDietAutoUploadEntries(files, validDate) {
    const exifReady = await _ensureExif().then(() => typeof EXIF !== 'undefined').catch(() => false);
    const entries = [];
    let skippedCount = 0;

    for (const file of files) {
        const captureInfo = (exifReady ? await readDietFileExifDateTime(file) : null) || getDietFileFallbackDateTime(file);
        if (captureInfo.date !== validDate) {
            skippedCount++;
            continue;
        }
        entries.push({
            file,
            time: captureInfo.time || '99:99:99'
        });
    }

    return { entries, skippedCount };
}

async function importDietFilesIntoEmptySlots(files) {
    _lastDietAutoImportResult = {
        assignedCount: 0,
        assignedCategories: [],
        skippedCount: 0,
        overflowCount: 0
    };
    renderDietShareImportBanner();

    if (!Array.isArray(files) || files.length === 0) return 0;

    for (const file of files) {
        if (file.size > MAX_IMG_SIZE) {
            alert("20MB 이하만 가능합니다.");
            return 0;
        }
    }

    const dateInput = document.getElementById('selected-date');
    const validDate = dateInput?.value;
    if (!validDate) {
        alert("⚠️ 인증 날짜를 먼저 선택해 주세요.");
        return 0;
    }

    const { entries, skippedCount } = await buildDietAutoUploadEntries(files, validDate);
    if (skippedCount > 0) {
        alert(`⚠️ 촬영일이 선택한 날짜(${validDate})와 다른 사진 ${skippedCount}장이 제외되었습니다.`);
    }
    if (entries.length === 0) {
        return 0;
    }

    entries.sort((a, b) => a.time.localeCompare(b.time));

    const categories = ['breakfast', 'lunch', 'dinner', 'snack'];
    const emptySlots = categories.filter(c => {
        const preview = document.getElementById(`preview-${c}`);
        return (!preview || preview.style.display === 'none' || !preview.src || preview.src.endsWith(location.host + '/') || preview.src.trim() === '');
    });

    if (emptySlots.length === 0) {
        alert("⚠️ 등록 가능한 식사 칸이 없어 사진을 저장하지 못했습니다.");
        return 0;
    }

    let assigned = 0;
    const assignedCategories = [];
    for (let i = 0; i < entries.length; i++) {
        if (i >= emptySlots.length) {
            alert("⚠️ 등록 가능한 식사 칸이 모자라 일부 사진만 업로드되었습니다.");
            break;
        }
        const cat = emptySlots[i];
        const targetInput = document.getElementById(`diet-img-${cat}`);
        if (!targetInput) continue;

        try {
            const dt = new DataTransfer();
            dt.items.add(entries[i].file);
            targetInput.files = dt.files;

            const box = document.getElementById(`diet-box-${cat}`);
            if (box) box.style.display = 'block';

            window.previewStaticImage(targetInput, `preview-${cat}`, `rm-${cat}`, true);
            targetInput.dispatchEvent(new Event('change', { bubbles: true }));
            assigned++;
            assignedCategories.push(cat);
        } catch (err) {
            console.error(err);
        }
    }

    _lastDietAutoImportResult = {
        assignedCount: assigned,
        assignedCategories,
        skippedCount,
        overflowCount: Math.max(0, entries.length - assigned)
    };
    renderDietShareImportBanner();

    if (assigned > 0) {
        showToast(`✨ ${assigned}개의 사진이 시간순으로 자동 배치되었습니다.`);
    }

    return assigned;
}

window.smartUpload = async function (input) {
    const files = Array.from(input?.files || []);
    if (!files.length) return 0;

    try {
        return await importDietFilesIntoEmptySlots(files);
    } catch (err) {
        console.error(err);
        alert("⚠️ 자동 업로드 중 오류가 발생했습니다.");
        return 0;
    } finally {
        if (input) input.value = "";
    }
};

function clearInputs() {
    ['weight', 'glucose', 'bp-systolic', 'bp-diastolic', 'gratitude-journal'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('meditation-check').checked = false;
    loadStepData(null);
    _lastDietAutoImportResult = null;
    renderDietShareImportBanner();

    ['breakfast', 'lunch', 'dinner', 'snack', 'sleep'].forEach(k => {
        const pv = document.getElementById(`preview-${k}`);
        const rm = document.getElementById(`rm-${k}`);
        const tx = document.getElementById(`txt-${k}`);
        const box = document.getElementById(`diet-box-${k}`);
        
        if (pv) { pv.style.display = 'none'; pv.src = ''; pv.removeAttribute('data-user-removed'); pv.removeAttribute('data-saved-url'); pv.removeAttribute('data-saved-thumb-url'); }
        if (rm) rm.style.display = 'none';
        if (tx) tx.style.display = 'inline-block';
        if (box && k !== 'breakfast' && k !== 'sleep') { 
             box.style.display = 'none'; 
        }
        
        const aiContainer = document.getElementById(`diet-analysis-${k}`);
        const aiBtn = document.getElementById(`ai-btn-${k}`);
        if(aiContainer) {
            aiContainer._analysisData = null;
            aiContainer.innerHTML = '';
            aiContainer.style.display = 'none';
        }
        if(aiBtn) {
            aiBtn.style.display = 'none';
            aiBtn.textContent = '🤖 AI 분석';
            aiBtn.removeAttribute('data-analyzed');
        }
    });

    const breakBox = document.getElementById(`diet-box-breakfast`);
    if (breakBox) breakBox.style.display = 'block';

    // 수면 분석 결과 초기화
    const sleepResultBox = document.getElementById('sleep-analysis-result');
    if (sleepResultBox) { sleepResultBox._analysisData = null; sleepResultBox.innerHTML = ''; sleepResultBox.style.display = 'none'; }
    // 마음 분석 결과 초기화
    const mindResultBox = document.getElementById('mind-analysis-result');
    if (mindResultBox) { mindResultBox.innerHTML = ''; mindResultBox.style.display = 'none'; }

    document.getElementById('cardio-list').innerHTML = '';
    document.getElementById('strength-list').innerHTML = '';

    document.getElementById('quest-diet').className = 'quest-check'; document.getElementById('quest-diet').innerText = '미달성';
    document.getElementById('quest-exercise').className = 'quest-check'; document.getElementById('quest-exercise').innerText = '미달성';
    document.getElementById('quest-mind').className = 'quest-check'; document.getElementById('quest-mind').innerText = '미달성';

    document.querySelectorAll('#diet input[type="file"], #exercise input[type="file"], #sleep input[type="file"]').forEach(input => input.value = '');
    applyShareSettingsToControls(getDefaultShareSettings());
    setShareSettingsExpanded(false);
    updateRecordFlowGuides(getVisibleTabName());
}

let _dailyLogCache = { docId: null, data: null, ts: 0 };

function cloneDailyLogData(data) {
    try {
        return JSON.parse(JSON.stringify(data || {}));
    } catch (_) {
        return { ...(data || {}) };
    }
}

function updateDailyLogCache(docId, data) {
    _dailyLogCache = {
        docId,
        data: cloneDailyLogData(data),
        ts: Date.now()
    };
}

function getCachedDailyLog(docId) {
    if (_dailyLogCache.docId !== docId || !_dailyLogCache.data) return null;
    return cloneDailyLogData(_dailyLogCache.data);
}

function collectCurrentDietAnalysisFromUi() {
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    const dietAnalysis = {};

    meals.forEach(meal => {
        const resultContainer = document.getElementById(`diet-analysis-${meal}`);
        const analysis = resultContainer?._analysisData;
        if (analysis && typeof analysis === 'object') {
            dietAnalysis[meal] = analysis;
        }
    });

    return dietAnalysis;
}

function getCurrentSleepAnalysisFromUi() {
    const resultBox = document.getElementById('sleep-analysis-result');
    const analysis = resultBox?._analysisData;
    return analysis && typeof analysis === 'object' ? analysis : null;
}

// 데이터 로드 generation 카운터 (race condition 방지)
let _loadDataGeneration = 0;

// 데이터 로드
async function loadDataForSelectedDate(dateStr) {
    const { todayStr } = getDatesInfo(); // 로컬 확보
    const user = auth.currentUser;
    if (!user) return;

    const thisGeneration = ++_loadDataGeneration;

    try {
        const docId = `${user.uid}_${dateStr}`;
        // 캐시 있으면 즉시, 없으면 최대 3초 대기 후 빈 결과로 진행
        const _empty = { exists: () => false, data: () => ({}) };
        const myLogDoc = await Promise.race([
            getDoc(doc(db, "daily_logs", docId)).catch(() => _empty),
            new Promise(resolve => setTimeout(() => resolve(_empty), 3000))
        ]);

        // race condition 방지: 날짜가 빠르게 변경된 경우 이전 요청 무시
        if (thisGeneration !== _loadDataGeneration) return;

        // 데이터 도착 후에 UI 초기화 (깜빡임 방지)
        clearInputs();

        if (myLogDoc.exists()) {
            const data = myLogDoc.data();
            updateDailyLogCache(docId, data);
            const awarded = data.awardedPoints || {};
            applyShareSettingsToControls(data.shareSettings);

            if (data.metrics) {
                document.getElementById('weight').value = data.metrics.weight || '';
                document.getElementById('glucose').value = data.metrics.glucose || '';
                document.getElementById('bp-systolic').value = data.metrics.bpSystolic || '';
                document.getElementById('bp-diastolic').value = data.metrics.bpDiastolic || '';
            }
            if (data.diet) {
                ['breakfast', 'lunch', 'dinner', 'snack'].forEach(k => {
                    if (data.diet[`${k}Url`] && isValidStorageUrl(data.diet[`${k}Url`])) {
                        const previewEl = document.getElementById(`preview-${k}`);
                        previewEl.src = data.diet[`${k}Url`];
                        previewEl.style.display = 'block';
                        // 저장 시 oldData 타임아웃 대비: URL을 DOM에 보존
                        previewEl.setAttribute('data-saved-url', data.diet[`${k}Url`]);
                        previewEl.setAttribute('data-saved-thumb-url', data.diet[`${k}ThumbUrl`] || '');
                        document.getElementById(`rm-${k}`).style.display = 'block';
                        document.getElementById(`txt-${k}`).style.display = 'none';
                    }
                });
                if (awarded.diet) {
                    const dp = awarded.dietPoints || 10;
                    document.getElementById('quest-diet').className = 'quest-check done';
                    document.getElementById('quest-diet').innerText = `+${dp}P`;
                }
            }
            if (data.exercise) {
                // 유산소: cardioList가 최우선 (legacy 필드 무시)
                if (data.exercise.cardioList && data.exercise.cardioList.length > 0) {
                    data.exercise.cardioList.forEach(item => addExerciseBlock('cardio', item));
                } else if (data.exercise.cardioImageUrl || data.exercise.cardioTime || data.exercise.cardioDist) {
                    addExerciseBlock('cardio', { imageUrl: data.exercise.cardioImageUrl, time: data.exercise.cardioTime, dist: data.exercise.cardioDist });
                } else {
                    addExerciseBlock('cardio');
                }

                // 근력: strengthList가 최우선 (legacy 필드 무시)
                if (data.exercise.strengthList && data.exercise.strengthList.length > 0) {
                    data.exercise.strengthList.forEach(item => addExerciseBlock('strength', item));
                } else if (data.exercise.strengthVideoUrl) {
                    addExerciseBlock('strength', { videoUrl: data.exercise.strengthVideoUrl });
                } else {
                    addExerciseBlock('strength');
                }
                if (awarded.exercise) {
                    const ep = awarded.exercisePoints || 15;
                    document.getElementById('quest-exercise').className = 'quest-check done';
                    document.getElementById('quest-exercise').innerText = `+${ep}P`;
                }
            } else { addCardioBlock(); addStrengthBlock(); }

            if (data.sleepAndMind) {
                if (data.sleepAndMind.sleepImageUrl) {
                    document.getElementById('preview-sleep').src = data.sleepAndMind.sleepImageUrl;
                    document.getElementById('preview-sleep').style.display = 'block';
                    document.getElementById('preview-sleep').setAttribute('data-saved-url', data.sleepAndMind.sleepImageUrl);
                    document.getElementById('preview-sleep').setAttribute('data-saved-thumb-url', data.sleepAndMind.sleepImageThumbUrl || '');
                    document.getElementById('rm-sleep').style.display = 'block';
                    document.getElementById('txt-sleep').style.display = 'none';
                    // 수면 AI 분석 버튼 표시
                    const sleepAiBtn = document.getElementById('ai-btn-sleep');
                    if (sleepAiBtn) sleepAiBtn.style.display = 'block';
                }
                // 수면 AI 분석 결과 복원
                if (data.sleepAndMind.sleepAnalysis) {
                    const sleepResultBox = document.getElementById('sleep-analysis-result');
                    const sleepAiBtn = document.getElementById('ai-btn-sleep');
                    if (sleepResultBox && typeof renderSleepMindAnalysisResult === 'function') {
                        renderSleepMindAnalysisResult(data.sleepAndMind.sleepAnalysis, sleepResultBox);
                        sleepResultBox._analysisData = data.sleepAndMind.sleepAnalysis;
                        sleepResultBox.style.display = 'none';
                        if (sleepAiBtn) {
                            sleepAiBtn.setAttribute('data-analyzed', 'true');
                            sleepAiBtn.textContent = '🤖 분석 보기';
                        }
                    }
                }
                if (data.sleepAndMind.meditationDone) document.getElementById('meditation-check').checked = true;
                document.getElementById('gratitude-journal').value = data.sleepAndMind.gratitude || '';

                if (awarded.mind) {
                    const mp = awarded.mindPoints || 5;
                    document.getElementById('quest-mind').className = 'quest-check done';
                    document.getElementById('quest-mind').innerText = `+${mp}P`;
                }
            }

            // 중성지방 복원
            const tgEl = document.getElementById('triglyceride');
            if (tgEl && data.metrics?.triglyceride) {
                tgEl.value = data.metrics.triglyceride;
            }

            // 걸음수 데이터 복원
            loadStepData(data);

            // AI 식단 분석 결과 복원
            if (window._restoreDietAnalysis) {
                window._restoreDietAnalysis(data);
            }

            // 대시보드는 openTab에서 호출하므로 여기서는 생략
        } else {
            updateDailyLogCache(docId, { awardedPoints: {} });
            addExerciseBlock('cardio'); addExerciseBlock('strength');
        }

        if (applyPendingNativeStepImport()) {
            const stepCard = document.getElementById('step-card');
            requestAnimationFrame(() => focusElementWithHighlight(stepCard));
            window.setTimeout(() => focusElementWithHighlight(stepCard), 180);
        }
    } catch (error) {
        // race condition으로 취소된 경우 에러 무시
        if (thisGeneration !== _loadDataGeneration) return;
        console.error('데이터 로드 오류:', error);
        showToast('⚠️ 데이터를 불러오는 중 오류가 발생했습니다.');
        // 기본 블록은 추가
        addExerciseBlock('cardio');
        addExerciseBlock('strength');
    } finally {
        renderStepImportBanner();
        updateRecordFlowGuides(getVisibleTabName());
    }
}

let galleryFilter = 'all';
let galleryUserFilter = null; // { userId, userName } | null
window.setGalleryFilter = function (filter, btnElement) {
    galleryFilter = filter;
    sortedFilteredDirty = true;  // 필터 변경 시 캐시 무효화
    document.querySelectorAll('.filter-chip').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-pressed', 'false');
    });
    btnElement.classList.add('active');
    btnElement.setAttribute('aria-pressed', 'true');
    renderFeedOnly();
};
window.setGalleryUserFilter = function (userId, userName) {
    galleryUserFilter = { userId, userName };
    sortedFilteredDirty = true;
    const bar = document.getElementById('gallery-user-filter-bar');
    const label = document.getElementById('gallery-user-filter-label');
    if (bar) bar.style.display = 'flex';
    if (label) label.textContent = userName;
    renderFeedOnly();
    // 갤러리 영역 상단으로 스크롤
    document.getElementById('gallery-user-filter-bar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
window.clearGalleryUserFilter = function () {
    galleryUserFilter = null;
    sortedFilteredDirty = true;
    const bar = document.getElementById('gallery-user-filter-bar');
    if (bar) bar.style.display = 'none';
    renderFeedOnly();
};

// 갤러리 라이트박스 (스와이프 지원)
let lightboxImages = [];
let lightboxCurrentIndex = 0;
let lightboxTouchStartX = 0;

window.openLightbox = function (url) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.style.display = 'none';
    }
    img.src = url;
    img.style.display = 'block';
    modal.style.display = 'flex';

    // 같은 카드의 모든 이미지 수집 (스와이프용)
    lightboxImages = [];
    lightboxCurrentIndex = 0;
    const allWrappers = document.querySelectorAll('.gallery-card .gallery-media-wrapper');
    allWrappers.forEach(w => {
        const imgEl = w.querySelector('img');
        if (imgEl) {
            const fullUrl = imgEl._originalSrc || imgEl.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1] || imgEl.src;
            lightboxImages.push(fullUrl);
            if (fullUrl === url || imgEl.src === url) {
                lightboxCurrentIndex = lightboxImages.length - 1;
            }
        }
    });
    updateLightboxCounter();
};

window.openVideoLightbox = function (url) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    if (!video) return;

    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
    video.currentTime = 0;
    modal.style.display = 'flex';
    video.play().catch(() => { });
    lightboxImages = [];
};

function navigateLightbox(direction) {
    if (lightboxImages.length <= 1) return;
    lightboxCurrentIndex = (lightboxCurrentIndex + direction + lightboxImages.length) % lightboxImages.length;
    const img = document.getElementById('lightbox-img');
    img.src = lightboxImages[lightboxCurrentIndex];
    updateLightboxCounter();
}

function updateLightboxCounter() {
    let counter = document.getElementById('lightbox-counter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'lightbox-counter';
        document.getElementById('lightbox-modal').appendChild(counter);
    }
    if (lightboxImages.length > 1) {
        counter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
        counter.style.display = 'block';
    } else {
        counter.style.display = 'none';
    }
}

// 라이트박스 키보드 네비게이션
document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('lightbox-modal');
    if (!modal || modal.style.display !== 'flex') return;
    if (e.key === 'Escape') modal.style.display = 'none';
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
});

// 라이트박스 스와이프 지원
document.addEventListener('DOMContentLoaded', function () {
    bindShareSettingListeners();
    bindShareTemplateListeners();
    scheduleFloatingBarLayoutUpdate();
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    modal.addEventListener('touchstart', function (e) {
        lightboxTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', function (e) {
        const diff = e.changedTouches[0].screenX - lightboxTouchStartX;
        if (Math.abs(diff) > 50) {
            navigateLightbox(diff > 0 ? -1 : 1);
            e.preventDefault();
        }
    });

    // 라이트박스 화살표 버튼
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(1); });
});

window.addEventListener('load', scheduleFloatingBarLayoutUpdate, { passive: true });
window.addEventListener('resize', scheduleFloatingBarLayoutUpdate, { passive: true });
window.addEventListener('scroll', scheduleFloatingBarLayoutUpdate, { passive: true });

// 갤러리 비디오 인라인 재생 (썸네일 → video 태그 교체)
window.playGalleryVideo = function (wrapper) {
    let video = wrapper.querySelector('video');
    const originalSrc = wrapper.getAttribute('data-video-src');

    // 썸네일 img만 있는 경우 → video 태그로 교체
    if (!video && originalSrc) {
        const thumbImg = wrapper.querySelector('img');
        if (thumbImg) thumbImg.style.display = 'none';
        video = document.createElement('video');
        video.playsInline = true;
        wrapper.insertBefore(video, wrapper.querySelector('.video-play-btn'));
    }

    wrapper.classList.add('playing');
    video.muted = false;
    video.controls = true;
    if (originalSrc) {
        video.src = originalSrc;
    }
    video.currentTime = 0;
    video.play();
    wrapper.onclick = null;
};

// 갤러리 이미지 인라인 확대/축소 토글.
window.toggleGalleryFullImage = function (imgEl, fullUrl) {
    const wrapper = imgEl.closest('.gallery-media-wrapper');
    if (!wrapper) return;

    if (imgEl.classList.contains('gallery-img-expanded')) {
        // 축소: 원본 썸네일로 복귀
        imgEl.classList.remove('gallery-img-expanded');
        if (imgEl._originalSrc) imgEl.src = imgEl._originalSrc;

        // AI 오버레이도 함께 접기
        const overlay = wrapper.querySelector('.gallery-ai-overlay');
        const aiBtn = wrapper.querySelector('.gallery-ai-overlay-btn');
        if (overlay) overlay.style.display = 'none';
        if (aiBtn) aiBtn.textContent = '분석 확인';
    } else {
        // 확대: 원본 고화질 로드
        imgEl._originalSrc = imgEl.src;
        imgEl.src = fullUrl;
        imgEl.classList.add('gallery-img-expanded');
    }
};

// 갤러리 AI분석 오버레이 토글 (이미지 확대도 함께 처리)
window.toggleGalleryAiOverlay = function (btnEl) {
    const wrapper = btnEl.closest('.gallery-media-wrapper');
    if (!wrapper) return;

    const overlay = wrapper.querySelector('.gallery-ai-overlay');
    if (!overlay) return;

    const imgEl = wrapper.querySelector('img');

    if (overlay.style.display === 'none' || !overlay.style.display) {
        // 이미지 확대 (아직 확대 안 된 경우)
        if (imgEl && !imgEl.classList.contains('gallery-img-expanded')) {
            const fullUrl = imgEl.getAttribute('onclick')?.match(/'([^']+)'\s*\)/)?.[1];
            if (fullUrl) {
                imgEl._originalSrc = imgEl.src;
                imgEl.src = fullUrl;
                imgEl.classList.add('gallery-img-expanded');
            }
        }

        // AI 오버레이 보이기
        const aiDataB64 = wrapper.getAttribute('data-ai-analysis');
        if (aiDataB64 && overlay.innerHTML.trim() === '') {
            try {
                const aiData = decodeURIComponent(escape(atob(aiDataB64)));
                const analysis = JSON.parse(aiData);
                // 식단 분석인지 운동 분석인지 수면/마음 분석인지 판별
                if (analysis.foods || (analysis.grade && !analysis.type)) {
                    renderDietAnalysisResult(overlay, analysis);
                } else if (analysis.intensity || analysis.exerciseType) {
                    renderExerciseAnalysisResult(analysis, overlay);
                } else if (analysis.type === 'sleep' || analysis.type === 'mind') {
                    renderSleepMindAnalysisResult(analysis, overlay);
                } else if (analysis.grade || analysis.feedback) {
                    renderSleepMindAnalysisResult(analysis, overlay);
                } else {
                    overlay.innerHTML = '<div style="padding:10px;color:#666;">분석 데이터가 없습니다.</div>';
                }
            } catch(e) {
                console.error('Gallery AI overlay parse error:', e);
                overlay.innerHTML = '<div style="padding:10px;color:#666;">분석 데이터를 읽을 수 없습니다.</div>';
            }
        }
        overlay.style.display = 'block';
        btnEl.textContent = '분석 닫기';
    } else {
        // 이미지 축소
        if (imgEl && imgEl.classList.contains('gallery-img-expanded')) {
            imgEl.classList.remove('gallery-img-expanded');
            if (imgEl._originalSrc) imgEl.src = imgEl._originalSrc;
        }

        overlay.style.display = 'none';
        btnEl.textContent = '분석 확인';
    }
};


// 구간 번호 → 알파벳 라벨 변환 (1→A, 2→B, ...)
function eraToLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26)); // 1→A, 2→B, ...26→Z
}

// 반감기 스케줄 테이블 활성 구간 하이라이트 + 현재 비율 동적 표시
function updateHalvingScheduleUI(currentPhase, per100Hbt) {
    const schedule = document.getElementById('halving-schedule');
    if (!schedule) return;
    const rows = schedule.children;
    for (let i = 0; i < rows.length; i++) {
        const phaseIdx = i + 1;
        const label = eraToLabel(phaseIdx);
        const spans = rows[i].querySelectorAll('span');
        if (phaseIdx === currentPhase) {
            rows[i].className = 'wallet-halving-row active';
            if (spans[0]) spans[0].textContent = `${label} 👈`;
            // 현재 구간은 온체인 비율로 동적 표시
            if (spans[1] && per100Hbt !== undefined) {
                const display = per100Hbt % 1 === 0 ? per100Hbt : per100Hbt.toFixed(1);
                spans[1].textContent = `100P = ${display} HBT`;
            }
        } else {
            rows[i].className = phaseIdx < currentPhase ? 'wallet-halving-row' : 'wallet-halving-row future';
            if (spans[0]) spans[0].textContent = label;
        }
    }
    // 하단 안내 문구 업데이트
    const tipEl = schedule.parentElement?.parentElement?.querySelector('.wallet-halving-tip');
    if (tipEl) {
        tipEl.innerHTML = `⚡ 지금은 <strong>${eraToLabel(currentPhase)}구간</strong>! 전환 비율은 매주 자동 조절됩니다. 채굴이 적으면 비율이 올라가요!`;
    }
}

// 자산 표시 캐시 (30초 TTL)
let _assetCache = { uid: null, ts: 0 };
const ASSET_CACHE_TTL = 30_000;

// 자산 표시 업데이트 함수
window.updateAssetDisplay = async function (forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return;

    // 캐시 히트: 30초 이내 같은 유저 → 스킵 (스켈레톤만 해제)
    const now = Date.now();
    if (!forceRefresh && _assetCache.uid === user.uid && (now - _assetCache.ts) < ASSET_CACHE_TTL) {
        if (window.hideWalletSkeleton) window.hideWalletSkeleton();
        return;
    }

    // localStorage 캐시: 즉시 표시 후 Firestore 백그라운드 갱신 (stale-while-revalidate)
    const _LS_WALLET_KEY = `hs_wallet_${user.uid}`;
    const _LS_WALLET_TTL = 24 * 60 * 60 * 1000; // 24시간
    try {
        const _cached = JSON.parse(localStorage.getItem(_LS_WALLET_KEY) || 'null');
        if (_cached && (now - _cached.ts) < _LS_WALLET_TTL) {
            const _pd = document.getElementById('asset-points-display');
            if (_pd) _pd.innerHTML = `${parseInt(_cached.coins || 0).toLocaleString()} <span class="wallet-asset-unit">P</span>`;
            if (window.hideWalletSkeleton) window.hideWalletSkeleton();
        }
    } catch (_) {}

    try {
        const userRef = doc(db, "users", user.uid);

        // 모든 Firestore 쿼리를 동시에 실행 (순차 → 병렬, 5초→1초)
        const _todayStr = getKstDateString();
        const _todayLogId = `${user.uid}_${_todayStr}`;
        const _sevenDaysAgo = new Date();
        _sevenDaysAgo.setDate(_sevenDaysAgo.getDate() - 6);
        const _startDateStr = _sevenDaysAgo.toISOString().split('T')[0];

        // getDoc 타임아웃 헬퍼: 캐시 있으면 즉시, 없으면 최대 3초 후 빈 snap 반환
        const _assetTimeout = ms => new Promise(resolve =>
            setTimeout(() => resolve({ exists: () => false, data: () => ({}) }), ms));
        const _p_user = Promise.race([getDoc(userRef), _assetTimeout(3000)]);
        const _p_todayLog = Promise.race([
            getDoc(doc(db, 'daily_logs', _todayLogId)),
            _assetTimeout(3000)
        ]).catch(() => null);
        const _p_hbtTx = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'conversion'),
            where('status', '==', 'success'),
            where('date', '==', _todayStr)
        )).catch(() => null);
        // 챌린지 정산 HBT 오늘 집계 (challenge_settlement 타입)
        const _p_settleTx = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'challenge_settlement'),
            where('status', '==', 'success'),
            where('date', '==', _todayStr)
        )).catch(() => null);
        const _p_minichart = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'conversion'),
            where('status', '==', 'success'),
            where('date', '>=', _startDateStr)
        )).catch(() => null);
        const _p_txHistory = getDocs(query(
            collection(db, "blockchain_transactions"),
            where("userId", "==", user.uid),
            orderBy("timestamp", "desc"),
            limit(20)
        )).catch(() => null);
        const _p_pointHistory = getDocs(query(
            collection(db, "daily_logs"),
            where("userId", "==", user.uid),
            limit(50)
        )).catch(() => null);
        // 오늘 전체 로그 (리액션 포인트 집계용)
        const _p_todayAllLogs = getDocs(query(
            collection(db, 'daily_logs'),
            where('date', '==', _todayStr),
            limit(200)
        )).catch(() => null);

        const userSnap = await _p_user;

        if (userSnap.exists()) {
            const userData = userSnap.data();

            // 캐시 갱신
            _assetCache = { uid: user.uid, ts: Date.now() };

            // localStorage에 저장 (다음 방문 시 즉시 표시용)
            try {
                localStorage.setItem(_LS_WALLET_KEY, JSON.stringify({
                    coins: userData.coins || 0,
                    ts: Date.now()
                }));
            } catch (_) {}

            // 초대 링크 표시 (지갑 탭 + 프로필 탭 동시 업데이트)
            if (userData.referralCode) {
                const referralUrl = `${APP_ORIGIN}?ref=${userData.referralCode}`;
                // 지갑 탭
                const referralSection = document.getElementById('referral-section');
                const referralLinkEl = document.getElementById('referral-link-display');
                if (referralSection) referralSection.style.display = 'block';
                if (referralLinkEl) referralLinkEl.value = referralUrl;
                const referralInviteCodeEl = document.getElementById('referral-invite-code');
                if (referralInviteCodeEl) referralInviteCodeEl.textContent = userData.referralCode;
                // 프로필 탭
                const profileLinkBox = document.getElementById('profile-invite-link-box');
                const profileLinkEl = document.getElementById('profile-invite-link');
                const profileCodeEl = document.getElementById('profile-invite-code');
                if (profileLinkBox) profileLinkBox.style.display = 'block';
                if (profileLinkEl) profileLinkEl.value = referralUrl;
                if (profileCodeEl) profileCodeEl.textContent = userData.referralCode;
            } else {
                const referralSection = document.getElementById('referral-section');
                if (referralSection) referralSection.style.display = 'none';
            }

            // 포인트 표시 업데이트
            const pointsDisplay = document.getElementById('asset-points-display');
            if (pointsDisplay) {
                const ptsVal = parseInt(userData.coins || 0);
                pointsDisplay.innerHTML = `${ptsVal.toLocaleString()} <span class="wallet-asset-unit">P</span>`;
            }

            // HBT 표시 업데이트
            // HBT 표시: 온체인 잔액이 진실의 원천 (hbtBalance 사용 안 함)
            const hbtDisplay = document.getElementById('asset-hbt-display');
            if (hbtDisplay) {
                hbtDisplay.innerHTML = `<span style="color:#aaa">조회 중...</span>`;
            }

            // user doc 로드 완료 → 기본 정보(포인트, HBT 플레이스홀더) 준비됨 → 스켈레톤 즉시 해제
            if (window.hideWalletSkeleton) window.hideWalletSkeleton();

            // ========== 자산 변동 표시 (오늘 획득분) ==========
            const pointsDeltaEl = document.getElementById('asset-points-delta');
            if (pointsDeltaEl) {
                let todayPoints = 0;
                try {
                    // 1) 기록 활동 포인트 (식단/운동/마음)
                    const todayLogSnap = await _p_todayLog;
                    if (todayLogSnap && todayLogSnap.exists()) {
                        const ap = todayLogSnap.data().awardedPoints || {};
                        todayPoints += (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0);
                        // 2) 내 오늘 게시물에 달린 리액션 수신 (+1P each)
                        todayPoints += getUniqueReactionCount(todayLogSnap.data());
                    }
                    // 3) 오늘 다른 사람 게시물에 내가 준 리액션 (+1P each)
                    const todayAllSnap = await _p_todayAllLogs;
                    if (todayAllSnap) {
                        todayAllSnap.forEach(d => {
                            if (d.data().userId === user.uid) return;
                            if (getUniqueReactionUserIdsForPost(d.data()).includes(user.uid)) {
                                todayPoints++;
                            }
                        });
                    }
                } catch (_) {}
                if (todayPoints > 0) {
                    pointsDeltaEl.innerHTML = `<span class="dot"></span>+${todayPoints}P 오늘`;
                    pointsDeltaEl.className = 'wallet-onchain-badge today-delta up';
                    pointsDeltaEl.style.display = 'inline-flex';
                } else {
                    pointsDeltaEl.innerHTML = `<span class="dot"></span>0P 오늘`;
                    pointsDeltaEl.className = 'wallet-onchain-badge today-delta neutral';
                    pointsDeltaEl.style.display = 'inline-flex';
                }
            }
            // 오늘 변환 HBT 합산 (델타 + 일일 한도 양쪽에서 사용)
            let todayHbt = 0;
            try {
                const hbtTxSnap = await _p_hbtTx;
                if (hbtTxSnap) hbtTxSnap.forEach(d => { todayHbt += d.data().hbtReceived || 0; });
                // 챌린지 정산 HBT도 오늘 합산
                const settleTxSnap = await _p_settleTx;
                if (settleTxSnap) settleTxSnap.forEach(d => { todayHbt += d.data().amount || 0; });
            } catch (_) {}
            const hbtDeltaEl = document.getElementById('asset-hbt-delta');
            if (hbtDeltaEl) {
                if (todayHbt > 0) {
                    hbtDeltaEl.innerHTML = `<span class="dot"></span>+${todayHbt} HBT 오늘`;
                    hbtDeltaEl.className = 'wallet-onchain-badge today-delta up';
                    hbtDeltaEl.style.display = 'inline-flex';
                } else {
                    hbtDeltaEl.style.display = 'none';
                }
            }

            // ========== 7일 미니차트 (blockchain_transactions에서 실시간 조회) ==========
            const minichartBars = document.getElementById('minichart-bars');
            if (minichartBars) {
                try {
                    const dayLabels = ['일','월','화','수','목','금','토'];
                    const nowDate = new Date();
                    const todayDow = nowDate.getDay();
                    const data = Array(7).fill(0);

                    // 7일 전 날짜 (병렬 쿼리에서 이미 조회됨)
                    const sevenDaysAgo = _sevenDaysAgo;

                    const txSnap = await _p_minichart;
                    if (txSnap) txSnap.forEach(d => {
                        const txDate = new Date(d.data().date + 'T12:00:00');
                        const diffDays = Math.round((txDate - sevenDaysAgo) / 86400000);
                        if (diffDays >= 0 && diffDays < 7) {
                            data[diffDays] += d.data().hbtReceived || 0;
                        }
                    });

                    const maxVal = Math.max(...data, 1);
                    let barsHtml = '';
                    for (let i = 0; i < 7; i++) {
                        const dayIdx = (todayDow - 6 + i + 7) % 7;
                        const heightPct = Math.round((data[i] / maxVal) * 100);
                        const isToday = i === 6;
                        const valLabel = data[i] > 0 ? `<span class="wallet-minichart-bar-value">${data[i]}</span>` : '';
                        barsHtml += `<div class="wallet-minichart-bar${isToday ? ' today' : ''}" style="height:${Math.max(heightPct, 4)}%;" title="${data[i]} HBT">${valLabel}<span class="wallet-minichart-bar-label">${dayLabels[dayIdx]}</span></div>`;
                    }
                    minichartBars.innerHTML = barsHtml;
                } catch (chartErr) {
                    console.warn('미니차트 로드 실패:', chartErr.message);
                }
            }

            // ========== 변환 비율 배지 & 일일 한도 ==========
            // 변환 비율은 fetchTokenStats()에서 전체 기준으로 업데이트
            const dailyLimitEl = document.getElementById('convert-daily-limit');
            if (dailyLimitEl) {
                const dailyMax = 12000;
                const remaining = Math.max(dailyMax - todayHbt, 0);
                dailyLimitEl.innerHTML = `오늘 변환 한도: <strong>${remaining.toLocaleString()} / ${dailyMax.toLocaleString()} HBT</strong>`;
            }

            // 스켈레톤 해제
            if (window.hideWalletSkeleton) window.hideWalletSkeleton();

            // 온체인 잔액으로 메인 HBT 표시 업데이트
            if (window.fetchOnchainBalance) {
                window.fetchOnchainBalance().then(onchainData => {
                    const hbtEl = document.getElementById('asset-hbt-display');
                    if (onchainData && onchainData.balanceFormatted) {
                        const val = parseFloat(onchainData.balanceFormatted);
                        const str = val % 1 === 0 ? val.toLocaleString() : val.toLocaleString(undefined, {maximumFractionDigits: 1});
                        if (hbtEl) hbtEl.innerHTML = `${str} <span class="wallet-asset-unit">HBT</span>`;
                        if (window.updateChallengeSliderBounds) window.updateChallengeSliderBounds(val);
                        const onchainBadge = document.getElementById('asset-hbt-onchain');
                        if (onchainBadge) {
                            const onchainText = document.getElementById('asset-hbt-onchain-text');
                            if (onchainText) onchainText.textContent = `온체인 (BSC Testnet)`;
                            onchainBadge.style.display = 'inline-flex';
                        }
                    }
                    // 데이터 없으면 "조회 중..." 유지 (강제 0 표시 안 함)
                }).catch(err => {
                    console.warn('온체인 잔액 조회 스킵:', err.message);
                    // 에러 시에도 "조회 중..." 유지
                });
            }

            // ========== 반감기 상태 UI 업데이트 (온체인 전체 채굴량 기준, v2) ==========
            fetchTokenStats().then(stats => {
                if (!stats) {
                    console.warn('토큰 통계 조회 실패, 개인 데이터로 펴백');
                    return;
                }
                const globalMinted = parseFloat(stats.totalMined) || 0;
                const phase = stats.currentPhase || 1;
                // v2: currentRate는 RATE_SCALE(10^8) 단위
                const RATE_SCALE = 1e8;
                const ratePerPoint = (stats.currentRate || RATE_SCALE) / RATE_SCALE;
                const per100 = Math.round(ratePerPoint * 100 * 100) / 100; // 100P 기준

                const halvingEraEl = document.getElementById('halving-era');
                if (halvingEraEl) halvingEraEl.textContent = eraToLabel(phase);

                const halvingRateEl = document.getElementById('halving-rate');
                if (halvingRateEl) {
                    halvingRateEl.textContent = `100P = ${per100} HBT`;
                }

                // 반감기 스케줄 테이블 활성 구간 + 동적 비율 표시
                updateHalvingScheduleUI(phase, per100);

                // 변환 비율 배지 업데이트 (전체 기준)
                const rateBadge = document.getElementById('convert-rate-badge');
                if (rateBadge) {
                    const display = per100 % 1 === 0 ? per100 : per100.toFixed(1);
                    rateBadge.textContent = `현재 ${eraToLabel(phase)}구간 · 100P = ${display} HBT`;
                }

                // v2 Phase 경계 기반 진행률 계산
                const phaseBounds = [0, 35_000_000, 52_500_000, 61_250_000, 70_000_000];
                const phaseStart = phaseBounds[Math.min(phase - 1, phaseBounds.length - 2)] || 0;
                const phaseEnd = phaseBounds[Math.min(phase, phaseBounds.length - 1)] || 70_000_000;
                const phasePool = phaseEnd - phaseStart;
                const mintedInPhase = Math.max(globalMinted - phaseStart, 0);
                const progressPct = phasePool > 0 ? Math.min((mintedInPhase / phasePool) * 100, 100) : 0;

                const halvingProgressText = document.getElementById('halving-progress-text');
                if (halvingProgressText) {
                    halvingProgressText.textContent = `${Math.round(mintedInPhase).toLocaleString()} / ${phasePool.toLocaleString()} HBT`;
                }

                const halvingProgressBar = document.getElementById('halving-progress-bar');
                if (halvingProgressBar) {
                    if (mintedInPhase > 0 && progressPct < 1) {
                        halvingProgressBar.style.width = '1%';
                    } else {
                        halvingProgressBar.style.width = progressPct.toFixed(1) + '%';
                    }
                }
            }).catch(err => console.warn('반감기 통계 로드 실패:', err.message));

            // 헤더의 포인트 배지도 업데이트
            const pointBadge = document.getElementById('point-balance');
            if (pointBadge) {
                pointBadge.textContent = (userData.coins || 0);
            }

            // ========== 활성 챌린지 UI (통합 전용, 미니→위클리→마스터 순) ==========
            const challengeContainer = document.getElementById('active-challenge-container');
            const challengeInfo = document.getElementById('active-challenge-info');
            const challengeSelection = document.getElementById('challenge-selection');

            // activeChallenges 수집 (legacy 마이그레이션 포함)
            let activeChallenges = userData.activeChallenges || {};
            if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
                const legacyId = userData.activeChallenge.challengeId;
                const legacyTier = {
                    'challenge-3d': 'mini', 'challenge-7d': 'weekly', 'challenge-30d': 'master',
                    'challenge-diet-3d': 'mini', 'challenge-exercise-3d': 'mini', 'challenge-mind-3d': 'mini', 'challenge-all-3d': 'mini',
                    'challenge-diet-7d': 'weekly', 'challenge-exercise-7d': 'weekly', 'challenge-mind-7d': 'weekly', 'challenge-all-7d': 'weekly',
                    'challenge-diet-30d': 'master', 'challenge-exercise-30d': 'master', 'challenge-mind-30d': 'master', 'challenge-all-30d': 'master'
                }[legacyId] || 'master';
                if (!activeChallenges[legacyTier]) activeChallenges[legacyTier] = userData.activeChallenge;
            }

            // 미니 → 위클리 → 마스터 순서로 정렬
            const tierOrder = ['mini', 'weekly', 'master'];
            const activeTiers = tierOrder.filter(t => {
                const s = activeChallenges[t]?.status;
                return s === 'ongoing' || s === 'claimable';
            });
            const tierLabels = { mini: '⚡ 3일 미니', weekly: '🔥 7일 위클리', master: '🏆 30일 마스터' };
            const tierColors = { mini: '#4CAF50', weekly: '#FF9800', master: '#E65100' };
            const tierRewardP = { mini: 30, weekly: 100, master: 500 };
            const tierBonusRate = { mini: 0, weekly: 0.5, master: 2.0 };

            if (activeTiers.length > 0) {
                let challengeHtml = '';
                const tierBgClass = { mini: 'tier-mini-bg', weekly: 'tier-weekly-bg', master: 'tier-master-bg' };
                for (const tier of activeTiers) {
                    const ch = activeChallenges[tier];
                    const totalDays = parseInt(ch.totalDays) || 30;
                    const completed = parseInt(ch.completedDays) || 0;
                    const progressPct = Math.round((completed / totalDays) * 100);
                    const remain = totalDays - completed;
                    const color = tierColors[tier];
                    const stakeText = ch.hbtStaked > 0 ? `💰 ${escapeHtml(String(ch.hbtStaked))} HBT` : '🎯 무료';
                    const isClaimable = ch.status === 'claimable';

                    // SVG ring chart
                    const radius = 40;
                    const circumference = 2 * Math.PI * radius;
                    const dashOffset = circumference - (circumference * Math.min(progressPct, 100) / 100);

                    if (isClaimable) {
                        // 수령 대기 카드
                        challengeHtml += `
                        <div class="challenge-ring-card ${tierBgClass[tier]} claimable" onclick="claimChallengeReward('${tier}')">
                            <svg class="challenge-ring-svg" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="8"/>
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
                                <text x="50" y="50" text-anchor="middle" font-size="18" dominant-baseline="central" fill="${color}">🎉</text>
                            </svg>
                            <div class="challenge-ring-info">
                                <div class="challenge-ring-name">${tierLabels[tier]} 성공!</div>
                                <div class="challenge-ring-date">${completed}/${totalDays}일 달성 (${progressPct}%)</div>
                                <div class="challenge-ring-stake">${stakeText}</div>
                                <div class="challenge-ring-claim">👆 탭하여 보상 수령</div>
                            </div>
                        </div>
                    `;
                    } else {
                        // 진행 중 카드
                        challengeHtml += `
                        <div class="challenge-ring-card ${tierBgClass[tier]}">
                            <button class="challenge-ring-forfeit" onclick="event.stopPropagation(); forfeitChallenge('${tier}')">포기</button>
                            <svg class="challenge-ring-svg" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="8"/>
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
                                <text x="50" y="46" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}">${progressPct}%</text>
                                <text x="50" y="60" text-anchor="middle" font-size="7" fill="#666">${completed}/${totalDays}일</text>
                            </svg>
                            <div class="challenge-ring-info">
                                <div class="challenge-ring-name">${tierLabels[tier]}</div>
                                <div class="challenge-ring-date">${escapeHtml(String(ch.startDate))} ~ ${escapeHtml(String(ch.endDate))}</div>
                                <div class="challenge-ring-stake">${stakeText}</div>
                                <div class="challenge-ring-remain">남은 ${remain}일 · 완료 시 ${(() => {
                                    const pts = tierRewardP[tier];
                                    if (ch.hbtStaked > 0) {
                                        const totalHbt = ch.hbtStaked + Math.floor(ch.hbtStaked * tierBonusRate[tier]);
                                        return `${pts}P + ${totalHbt} HBT`;
                                    }
                                    return `${pts}P`;
                                })()}</div>
                            </div>
                        </div>
                    `;
                    }
                }
                if (challengeContainer) {
                    challengeContainer.style.display = 'block';
                    challengeInfo.innerHTML = challengeHtml;
                }
                // 진행 중인 티어 카드 비활성화
                for (const t of tierOrder) {
                    const card = document.getElementById('tier-card-' + t);
                    if (card) {
                        if (activeTiers.includes(t)) {
                            card.style.opacity = '0.4';
                            card.style.pointerEvents = 'none';
                        } else {
                            card.style.opacity = '1';
                            card.style.pointerEvents = 'auto';
                        }
                    }
                }
                // 챌린지 신청 섹션: 활성 챌린지 있으면 접힌 상태로 토글 표시
                if (challengeSelection) {
                    challengeSelection.style.display = '';
                    const toggleBtn = document.getElementById('challenge-toggle-btn');
                    const tierWrap = document.getElementById('challenge-tier-wrap');
                    if (toggleBtn) toggleBtn.style.display = 'flex';
                    if (tierWrap) tierWrap.style.display = 'none';
                    const arrow = document.getElementById('challenge-toggle-arrow');
                    if (arrow) arrow.classList.remove('open');
                    const text = document.getElementById('challenge-toggle-text');
                    if (text) text.textContent = '📋 새 챌린지 시작하기';
                }
            } else {
                if (challengeContainer) challengeContainer.style.display = 'none';
                for (const t of tierOrder) {
                    const card = document.getElementById('tier-card-' + t);
                    if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
                }
                // 챌린지 없으면 신청 섹션 바로 노출
                if (challengeSelection) {
                    challengeSelection.style.display = '';
                    const toggleBtn = document.getElementById('challenge-toggle-btn');
                    const tierWrap = document.getElementById('challenge-tier-wrap');
                    if (toggleBtn) toggleBtn.style.display = 'none';
                    if (tierWrap) tierWrap.style.display = '';
                }
            }

            // ========== 거래 기록 로드 ==========
            const txContainer = document.getElementById('transaction-history');
            if (txContainer) {
                try {
                    const txSnap = await _p_txHistory;
                    const pointSnap = await _p_pointHistory;

                    const renderHistoryItem = ({ icon, iconClass, label, date, amountText, amountClass = '', statusText = '' }) => `
                        <div class="wallet-tx-item">
                            <div class="wallet-tx-left">
                                <div class="wallet-tx-icon ${iconClass}">${icon}</div>
                                <div>
                                    <div class="wallet-tx-label">${label}</div>
                                    <div class="wallet-tx-date">${date}</div>
                                </div>
                            </div>
                            <div class="wallet-tx-right">
                                <div class="wallet-tx-amount ${amountClass}">${amountText}</div>
                                <div class="wallet-tx-status">${statusText}</div>
                            </div>
                        </div>
                    `;

                    const sectionWrapStyle = 'margin-top: 14px; padding-top: 14px; border-top: 1px dashed rgba(240, 215, 182, 0.9);';
                    const sectionTitleStyle = 'margin: 0 0 8px; font-size: 12px; font-weight: 800; color: #8d5620; letter-spacing: 0.02em;';
                    const sectionEmptyStyle = 'padding: 10px 2px 2px; font-size: 12px; color: #9b7b58;';

                    const buildHbtHistoryHtml = () => {
                        if (!txSnap || txSnap.empty) {
                            return `<div style="${sectionEmptyStyle}">아직 HBT 거래 기록이 없습니다.</div>`;
                        }

                        let html = '';
                        txSnap.forEach(txDoc => {
                            const tx = txDoc.data();
                            const txDate = tx.timestamp?.toDate?.() ? tx.timestamp.toDate().toLocaleDateString('ko-KR') : '-';
                            const txIcons = {
                                'conversion': '🔄',
                                'staking': '🔐',
                                'challenge_settlement': '🏆',
                                'withdrawal': '📤'
                            };
                            const txLabels = {
                                'conversion': 'P→HBT 변환',
                                'staking': '챌린지 예치',
                                'challenge_settlement': '챌린지 정산',
                                'withdrawal': '출금'
                            };
                            const txIconClass = {
                                'conversion': 'convert',
                                'staking': 'stake',
                                'challenge_settlement': 'settle',
                                'withdrawal': 'withdraw'
                            };
                            const icon = txIcons[tx.type] || '📋';
                            const label = txLabels[tx.type] || escapeHtml(String(tx.type));
                            const iconClass = txIconClass[tx.type] || 'convert';
                            const statusText = tx.status === 'success' ? '✅ 완료' : tx.status === 'failed' ? '❌ 실패' : '⏳ 대기';

                            let amountText = '';
                            let amountClass = '';
                            if (tx.type === 'conversion') {
                                amountText = `+${parseFloat(tx.hbtReceived) || 0} HBT`;
                                amountClass = 'positive';
                            } else if (tx.type === 'staking') {
                                amountText = `-${parseFloat(tx.amount) || 0} HBT`;
                                amountClass = 'negative';
                            } else if (tx.type === 'challenge_settlement') {
                                const amt = parseFloat(tx.amount);
                                amountText = amt > 0 ? `+${amt} HBT` : '소멸';
                                amountClass = amt > 0 ? 'positive' : 'negative';
                            } else {
                                amountText = `${parseFloat(tx.amount) || 0} HBT`;
                            }

                            html += renderHistoryItem({
                                icon,
                                iconClass,
                                label,
                                date: txDate,
                                amountText,
                                amountClass,
                                statusText
                            });
                        });
                        return html;
                    };

                    const buildPointHistoryHtml = () => {
                        const pointItems = [];

                        if (pointSnap && !pointSnap.empty) {
                            pointSnap.forEach(pointDoc => {
                                const log = pointDoc.data();
                                const awarded = log.awardedPoints || {};
                                const earnedPoints =
                                    (awarded.dietPoints || 0) +
                                    (awarded.exercisePoints || 0) +
                                    (awarded.mindPoints || 0);
                                if (earnedPoints <= 0) return;

                                const completedTags = [];
                                if (awarded.dietPoints > 0) completedTags.push('식단');
                                if (awarded.exercisePoints > 0) completedTags.push('운동');
                                if (awarded.mindPoints > 0) completedTags.push('마음');

                                pointItems.push({
                                    sortKey: `${log.date || ''}T23:59:59`,
                                    icon: '🪙',
                                    iconClass: 'convert',
                                    label: completedTags.length > 0 ? `${completedTags.join('·')} 기록` : '일일 기록',
                                    date: log.date || '-',
                                    amountText: `+${earnedPoints}P`,
                                    amountClass: 'positive',
                                    statusText: '✅ 적립'
                                });
                            });
                        }

                        if (txSnap && !txSnap.empty) {
                            txSnap.forEach(txDoc => {
                                const tx = txDoc.data();
                                const txDateObj = tx.timestamp?.toDate?.();
                                const txDate = txDateObj ? txDateObj.toLocaleDateString('ko-KR') : (tx.date || '-');

                                if (tx.pointsUsed > 0) {
                                    pointItems.push({
                                        sortKey: txDateObj ? txDateObj.toISOString() : `${tx.date || ''}T12:00:00`,
                                        icon: '📉',
                                        iconClass: 'withdraw',
                                        label: 'HBT 변환 사용',
                                        date: txDate,
                                        amountText: `-${parseFloat(tx.pointsUsed) || 0}P`,
                                        amountClass: 'negative',
                                        statusText: tx.status === 'success' ? '✅ 차감' : '⏳ 처리 중'
                                    });
                                }

                                if (tx.rewardPoints > 0) {
                                    pointItems.push({
                                        sortKey: txDateObj ? txDateObj.toISOString() : `${tx.date || ''}T12:00:00`,
                                        icon: '🎁',
                                        iconClass: 'settle',
                                        label: '챌린지 보상',
                                        date: txDate,
                                        amountText: `+${parseFloat(tx.rewardPoints) || 0}P`,
                                        amountClass: 'positive',
                                        statusText: tx.status === 'success' ? '✅ 적립' : '⏳ 처리 중'
                                    });
                                }
                            });
                        }

                        pointItems.sort((a, b) => String(b.sortKey).localeCompare(String(a.sortKey)));

                        if (pointItems.length === 0) {
                            return `<div style="${sectionEmptyStyle}">아직 포인트 기록이 없습니다.</div>`;
                        }

                        return pointItems.slice(0, 20).map(item => renderHistoryItem(item)).join('');
                    };

                    if ((!txSnap || txSnap.empty) && (!pointSnap || pointSnap.empty)) {
                        txContainer.innerHTML = `
                            <div class="wallet-tx-empty-cta">
                                <div class="wallet-tx-empty-icon">💎</div>
                                <div class="wallet-tx-empty-text">아직 거래 기록이 없습니다</div>
                                <div class="wallet-tx-empty-sub">HBT 거래와 포인트 적립 내역이 여기에 함께 쌓여요</div>
                                <button class="wallet-tx-empty-btn" onclick="document.getElementById('convert-point-input')?.focus(); setConvertAmount(100);">첫 HBT 변환하기 →</button>
                            </div>`;
                    } else {
                        txContainer.innerHTML = `
                            <div>
                                <div style="${sectionTitleStyle}">HBT 거래 기록</div>
                                ${buildHbtHistoryHtml()}
                            </div>
                            <div style="${sectionWrapStyle}">
                                <div style="${sectionTitleStyle}">포인트 기록</div>
                                ${buildPointHistoryHtml()}
                            </div>
                        `;
                    }
                } catch (txErr) {
                    console.warn('⚠️ 거래 기록 로드 스킵:', txErr.message);
                    if (txErr.message?.includes('index')) {
                        console.info('💡 Firebase Console에서 복합 인덱스를 생성해주세요. 위 에러 메시지의 링크를 클릭하면 자동 생성됩니다.');
                    }
                    if (txContainer) {
                        txContainer.innerHTML = '<p class="wallet-tx-empty">거래 기록을 불러오는 중입니다...</p>';
                    }
                }
            }
        } else {
            // 사용자 문서가 없는 경우에도 스켈레톤 해제
            if (window.hideWalletSkeleton) window.hideWalletSkeleton();
        }
    } catch (error) {
        console.error('자산 표시 업데이트 오류:', error);
        if (window.hideWalletSkeleton) window.hideWalletSkeleton();
    }
};

// 탭 관리
function getVisibleTabName() {
    const tabNames = getAllowedTabsForMode();
    return tabNames.find(tabName => {
        const el = document.getElementById(tabName);
        return el && (el.style.display === 'block' || el.classList.contains('active'));
    }) || getDefaultTabForMode();
}

function _hasPreviewImage(previewId) {
    const preview = document.getElementById(previewId);
    if (!preview) return false;
    const rawSrc = preview.getAttribute('src') || preview.src || '';
    return preview.style.display !== 'none' && !!rawSrc && rawSrc !== window.location.href;
}

function _getExerciseGuideCounts() {
    const cardioBlocks = [...document.querySelectorAll('.cardio-block')];
    const strengthBlocks = [...document.querySelectorAll('.strength-block')];

    const cardioCount = cardioBlocks.filter(block => {
        const input = block.querySelector('.exer-file');
        const preview = block.querySelector('.preview-img');
        const hasFile = !!(input?.files && input.files.length > 0);
        const hasUrl = !!block.getAttribute('data-url');
        const hasPreview = !!(preview && preview.style.display !== 'none' && preview.src && preview.src !== window.location.href);
        return hasFile || hasUrl || hasPreview;
    }).length;

    const strengthCount = strengthBlocks.filter(block => {
        const input = block.querySelector('.exer-file');
        const preview = block.querySelector('.preview-strength');
        const hasFile = !!(input?.files && input.files.length > 0);
        const hasUrl = !!block.getAttribute('data-url');
        const hasPreview = !!(preview && preview.style.display !== 'none');
        return hasFile || hasUrl || hasPreview;
    }).length;

    return {
        cardioCount,
        strengthCount,
        stepReady: (_stepData?.count || 0) > 0
    };
}

function _getRecordGuideStates() {
    const dietPhotos = ['breakfast', 'lunch', 'dinner', 'snack'].filter(slot => _hasPreviewImage(`preview-${slot}`)).length;
    const fastingMetricsCount = ['weight', 'glucose', 'bp-systolic', 'bp-diastolic']
        .map(id => document.getElementById(id)?.value?.trim() || '')
        .filter(Boolean).length;

    let dietHelper = '식단 사진 1장부터 저장할 수 있어요.';
    let dietStatus = '첫 식사 사진을 올리면 오늘 식단 저장 준비가 됩니다.';
    if (dietPhotos > 0 && dietPhotos < 4) {
        dietStatus = `식단 사진 ${dietPhotos}장이 준비됐어요. 더 올리면 최대 30P까지 반영됩니다.`;
        dietHelper = fastingMetricsCount > 0
            ? `식단 ${dietPhotos}장 · 공복 지표를 함께 저장할 수 있어요.`
            : `식단 사진 ${dietPhotos}장을 지금 저장할 수 있어요.`;
    } else if (dietPhotos === 0 && fastingMetricsCount > 0) {
        dietStatus = '공복 지표가 입력됐어요. 식단 사진을 더하면 한 번에 같이 저장됩니다.';
        dietHelper = '공복 지표를 지금 저장할 수 있어요.';
    } else if (dietPhotos === 4) {
        dietStatus = '식단 칸이 모두 채워졌어요. 저장하면 오늘 식단 포인트가 반영됩니다.';
        dietHelper = '식단 준비 완료 · 저장하면 반영돼요.';
    }

    const { cardioCount, strengthCount, stepReady } = _getExerciseGuideCounts();
    const stepCount = Number(_stepData?.count || 0);
    const stepPointReady = stepCount >= 8000;
    const exerciseReadyCount = cardioCount + strengthCount + (stepReady ? 1 : 0);
    let exerciseStatus = '걸음수, 운동 이미지, 운동 영상 중 하나만 있어도 저장할 수 있어요.';
    let exerciseHelper = '걸음수는 8천보부터 반영돼요.';
    if (exerciseReadyCount > 0) {
        exerciseStatus = `걸음수 ${stepReady ? `${stepCount.toLocaleString()}보` : '미입력'}, 사진 ${cardioCount}개, 영상 ${strengthCount}개가 준비됐어요.`;
        exerciseHelper = stepPointReady
            ? `운동 준비 ${exerciseReadyCount}개 · 저장하면 반영돼요.`
            : `운동 준비 ${exerciseReadyCount}개 · 8천보부터 반영돼요.`;
    }

    const sleepReady = _hasPreviewImage('preview-sleep');
    const meditationReady = !!document.getElementById('meditation-check')?.checked;
    const gratitudeReady = !!document.getElementById('gratitude-journal')?.value?.trim();
    const mindReadyCount = [sleepReady, meditationReady, gratitudeReady].filter(Boolean).length;
    let mindStatus = '수면 캡처, 10분 명상, 감사 일기를 남겨보세요.';
    let mindHelper = '수면 캡처나 감사 일기면 충분해요.';
    if (mindReadyCount > 0) {
        const pieces = [
            sleepReady ? '수면 캡처' : null,
            meditationReady ? '명상 체크' : null,
            gratitudeReady ? '감사 일기' : null
        ].filter(Boolean);
        mindStatus = `${pieces.join(', ')}가 준비됐어요. 저장하면 오늘 마음 기록 포인트가 반영됩니다.`;
        mindHelper = `마음 기록 ${mindReadyCount}개 준비됨 · 지금 저장할 수 있어요.`;
    }

    return {
        diet: {
            badge: `사진 ${dietPhotos}/4`,
            status: dietStatus,
            helper: dietHelper
        },
        exercise: {
            badge: `준비 ${exerciseReadyCount}개`,
            status: exerciseStatus,
            helper: exerciseHelper
        },
        sleep: {
            badge: `준비 ${mindReadyCount}개`,
            status: mindStatus,
            helper: mindHelper
        }
    };
}

function updateContextualSaveBar(tabName = getVisibleTabName(), guideStates = null) {
    const saveBtn = document.getElementById('saveDataBtn');
    const helperEl = document.getElementById('submit-bar-helper');
    if (!saveBtn || !helperEl) return;

    if (tabName === 'dashboard') {
        const submitBar = document.getElementById('submit-bar');
        if (submitBar && !applyDashboardInstallCta()) {
            submitBar.style.display = 'none';
        }
        return;
    }

    if (tabName === 'gallery') {
        return;
    }

    resetSubmitBarMode();
    const states = guideStates || _getRecordGuideStates();

    if (tabName === 'diet') {
        helperEl.style.display = 'block';
        helperEl.textContent = states.diet.helper;
        if (!saveBtn.disabled) saveBtn.innerText = '식단 저장하고 포인트 받기 🅿️';
        return;
    }

    if (tabName === 'exercise') {
        helperEl.style.display = 'block';
        helperEl.textContent = states.exercise.helper;
        if (!saveBtn.disabled) saveBtn.innerText = '운동 저장하고 포인트 받기 🅿️';
        return;
    }

    if (tabName === 'sleep') {
        helperEl.style.display = 'block';
        helperEl.textContent = states.sleep.helper;
        if (!saveBtn.disabled) saveBtn.innerText = '마음 저장하고 포인트 받기 🅿️';
        return;
    }

    helperEl.style.display = 'none';
}

function bindRecordFlowGuideListeners() {
    const bindings = [
        ['weight', 'input', 'diet'],
        ['glucose', 'input', 'diet'],
        ['bp-systolic', 'input', 'diet'],
        ['bp-diastolic', 'input', 'diet'],
        ['gratitude-journal', 'input', 'sleep'],
        ['meditation-check', 'change', 'sleep']
    ];

    bindings.forEach(([id, eventName, tabName]) => {
        const element = document.getElementById(id);
        if (!element || element.dataset.recordGuideBound === 'true') return;
        element.dataset.recordGuideBound = 'true';
        element.addEventListener(eventName, () => updateRecordFlowGuides(tabName));
    });
}

function updateRecordFlowGuides(activeTab = getVisibleTabName()) {
    bindRecordFlowGuideListeners();
    renderExerciseNativeSyncCta();
    const guideStates = _getRecordGuideStates();

    const dietStatusEl = document.getElementById('diet-guide-status');
    const dietBadgeEl = document.getElementById('diet-guide-badge');
    const exerciseStatusEl = document.getElementById('exercise-guide-status');
    const exerciseBadgeEl = document.getElementById('exercise-guide-badge');
    const mindStatusEl = document.getElementById('mind-guide-status');
    const mindBadgeEl = document.getElementById('mind-guide-badge');

    if (dietStatusEl) dietStatusEl.textContent = guideStates.diet.status;
    if (dietBadgeEl) dietBadgeEl.textContent = guideStates.diet.badge;
    if (exerciseStatusEl) exerciseStatusEl.textContent = guideStates.exercise.status;
    if (exerciseBadgeEl) exerciseBadgeEl.textContent = guideStates.exercise.badge;
    if (mindStatusEl) mindStatusEl.textContent = guideStates.sleep.status;
    if (mindBadgeEl) mindBadgeEl.textContent = guideStates.sleep.badge;

    updateContextualSaveBar(activeTab, guideStates);
    syncGuidePanels(activeTab);
}

window.focusStepManualInput = function() {
    openTab('exercise');
    const input = document.getElementById('step-manual-input');
    if (input) {
        input.focus();
        input.select?.();
    }
};

window.focusGratitudeJournal = function() {
    openTab('sleep');
    const journal = document.getElementById('gratitude-journal');
    if (journal) journal.focus();
};

window.triggerSleepUpload = function() {
    openTab('sleep');
    document.getElementById('sleep-img')?.click();
};

window.toggleMeditationQuickMark = function() {
    openTab('sleep');
    const checkbox = document.getElementById('meditation-check');
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    updateRecordFlowGuides('sleep');
    showToast(checkbox.checked ? '🧘 명상 체크를 표시했어요.' : '🧘 명상 체크를 해제했어요.');
};

function openTab(tabName, pushState = true) {
    const resolvedTabName = normalizeTabForMode(tabName);
    const user = auth.currentUser;
    if (!user && resolvedTabName !== 'gallery') {
        document.getElementById('login-modal').style.display = 'flex'; return;
    }
    if (pushState) history.pushState({ tab: resolvedTabName }, '', '#' + resolvedTabName);

    const contents = document.getElementsByClassName("content-section");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    const btns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < btns.length; i++) {
        btns[i].classList.remove("active");
        btns[i].removeAttribute("aria-current");
    }

    // 갤러리 탭은 ID로 직접 선택 (더 안정적)
    let targetBtn;
    if (resolvedTabName === 'gallery') {
        targetBtn = document.getElementById('btn-tab-gallery');
    } else {
        targetBtn = document.querySelector(`button[onclick*="openTab('${resolvedTabName}'"]`);
    }
    if (targetBtn) {
        targetBtn.classList.add("active");
        targetBtn.setAttribute("aria-current", "page");
    }
    document.getElementById(resolvedTabName).style.display = "block";

    const submitBar = document.getElementById('submit-bar');
    const saveBtn = document.getElementById('saveDataBtn');
    const chatBanner = document.getElementById('chat-banner');
    const helperEl = document.getElementById('submit-bar-helper');

    if (resolvedTabName === 'dashboard') {
        if (!applyDashboardInstallCta()) {
            submitBar.style.display = 'none';
        }
    } else if (resolvedTabName === 'profile' || resolvedTabName === 'assets') {
        resetSubmitBarMode();
        submitBar.style.display = 'none';

        // 자산 탭 열릴 때: Firestore 데이터 즉시 표시 (블록체인 로드 대기 없이)
        if (resolvedTabName === 'assets' && user) {
            updateAssetDisplay();
            // 블록체인 모듈은 백그라운드 로드 → 완료 후 HBT 잔액만 갱신
            const load = window._loadBlockchainModule || (() => Promise.resolve());
            load().then(async () => {
                if (window.initializeUserWallet) {
                    await window.initializeUserWallet().catch(() => {});
                }
                if (window.settleExpiredChallenges) window.settleExpiredChallenges().catch(() => {});
                // updateAssetDisplay 시점에 blockchain 미로드였으면 HBT 잔액 보완
                if (window.fetchOnchainBalance && !document.getElementById('asset-hbt-display')?.textContent.includes('HBT')) {
                    window.fetchOnchainBalance().then(data => {
                        const el = document.getElementById('asset-hbt-display');
                        if (!el || !data?.balanceFormatted) return; // 데이터 없으면 "조회 중..." 유지
                        const val = parseFloat(data.balanceFormatted);
                        const str = val % 1 === 0 ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 1 });
                        el.innerHTML = `${str} <span class="wallet-asset-unit">HBT</span>`;
                        if (window.updateChallengeSliderBounds) window.updateChallengeSliderBounds(val);
                    }).catch(() => {});
                }
            });
        }

        if (resolvedTabName === 'profile' && user) {
            loadChatbotLinkStatus().catch(error => {
                console.warn('챗봇 연결 코드 상태 로드 실패:', error.message);
            });
            loadMyFriendships(true).catch(error => {
                console.warn('친구 요청 상태 로드 실패:', error.message);
            });
            maybeHandleChatbotConnect().catch(error => {
                console.warn('챗봇 연결 처리 실패:', error.message);
            });
        }
    } else if (resolvedTabName === 'gallery') {
        submitBar.style.display = 'block';
        updateGalleryPrimaryAction();
    } else {
        submitBar.style.display = 'block';
        resetSubmitBarMode();
        updateContextualSaveBar(resolvedTabName);
    }

    if (resolvedTabName === 'gallery') {
        chatBanner.style.display = 'none';
        loadGalleryData();
    } else {
        chatBanner.style.display = 'none';
        // 갤러리 탭을 벗어날 때 유저 필터 초기화
        if (galleryUserFilter) window.clearGalleryUserFilter();
        // 갤러리 탭을 벗어날 때 무한 스크롤 옵저버 해제 (메모리 절약)
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
            galleryIntersectionObserver = null;
        }

        // 입력 폼 탭 전환 시 데이터 재로드 불필요 (이미 로드된 상태)
        // 날짜 변경 시에만 loadDataForSelectedDate 호출됨
        // 식단 탭에서 공복 지표 그래프 로드
        if (resolvedTabName === 'diet' && user) {
            loadFastingGraphData(user.uid);
        }
    }

    if (resolvedTabName === 'dashboard') renderDashboard();

    updateRecordFlowGuides(resolvedTabName);
    syncGuidePanels(resolvedTabName);
    if (resolvedTabName === 'dashboard') syncDashboardPanels();
    scheduleFloatingBarLayoutUpdate();
    setTimeout(() => { document.getElementById(resolvedTabName).classList.add("active"); }, 10);
};

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) openTab(e.state.tab, false);
    else openTab(getDefaultTabForMode(), false);
});

function switchToDefaultMode() {
    window.location.assign(buildAppModeUrl('default', getVisibleTabName()));
}

// 페이지 종료 시 리소스 정리 (메모리 누수 방지)
window.addEventListener('beforeunload', () => {
    cleanupGalleryResources();
});

// 모바일 백그라운드 복귀 처리
(function setupVisibilityHandler() {
    const RELOAD_THRESHOLD_MS = 30 * 60 * 1000; // 30분 이상이면 전체 새로고침
    const GALLERY_REFRESH_MS  =  1 * 60 * 1000; //  1분 이상이면 갤러리만 재로드

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            localStorage.setItem('_lastHiddenAt', Date.now());
        } else {
            const last = parseInt(localStorage.getItem('_lastHiddenAt') || '0', 10);
            const elapsed = Date.now() - last;

            if (elapsed >= RELOAD_THRESHOLD_MS) {
                // 30분 이상 → 전체 새로고침 (Firebase 재연결 + 재로그인)
                location.reload();
            } else if (elapsed >= GALLERY_REFRESH_MS) {
                // 1분 이상 → 갤러리 탭이 열려 있으면 데이터 재로드
                const galleryEl = document.getElementById('gallery');
                if (galleryEl && galleryEl.style.display === 'block') {
                    loadGalleryData();
                }
            }
        }
    });
})();

// 중복 제거: 로그인 및 인증 로직은 auth.js 모듈에서 처리

window.hideFeedback = function () {
    document.getElementById('admin-feedback-box').style.display = 'none';
    const user = auth.currentUser;
    if (user) localStorage.setItem('hide_fb_' + user.uid, 'true');
};

// 중복 제거: 인증 상태 리스너는 auth.js의 setupAuthListener에서 처리

window.saveHealthProfile = async function () {
    const user = auth.currentUser;
    if (!user) return;
    const smm = document.getElementById('prof-smm').value;
    const fat = document.getElementById('prof-fat').value;
    const visceral = document.getElementById('prof-visceral').value;
    const bmr = document.getElementById('prof-bmr').value;
    let meds = [];
    document.querySelectorAll('input[name="med-chk"]:checked').forEach(chk => meds.push(chk.value));
    const medOther = document.getElementById('prof-med-other').value;

    const now = new Date();
    const dateStr = getKstDateString();
    const profileData = { smm, fat, visceral, bmr, meds, medOther, updatedAt: now.toISOString() };

    try {
        // 현재 프로필 저장
        await setDoc(doc(db, "users", user.uid), { healthProfile: profileData }, { merge: true });

        // 인바디 히스토리 저장 (체성분 데이터가 하나라도 있을 때)
        if (smm || fat || visceral) {
            await setDoc(doc(db, "users", user.uid, "inbodyHistory", dateStr), {
                smm: smm ? parseFloat(smm) : null,
                fat: fat ? parseFloat(fat) : null,
                visceral: visceral ? parseFloat(visceral) : null,
                bmr: bmr ? parseFloat(bmr) : null,
                date: dateStr,
                timestamp: now.toISOString()
            });
        }

        showToast("🧬 프로필이 저장되었습니다!");

        // 마지막 측정일 표시
        updateInbodyLastDate(dateStr);

        // 인바디 히스토리 UI 갱신
        loadInbodyHistory();

        // 대사건강 점수 자동 업데이트
        updateMetabolicScoreUI();
    } catch (e) {
        console.error('프로필 저장 오류:', e);
        showToast(`⚠️ 프로필 저장 실패: ${e.message || '알 수 없는 오류'}`);
    }
};

// 인바디 마지막 측정일 표시
function updateInbodyLastDate(dateStr) {
    const el = document.getElementById('prof-last-date');
    if (el && dateStr) {
        el.textContent = `마지막 측정: ${dateStr}`;
    }
}

// 인바디 히스토리 로드 및 변화 추이 렌더링
window.loadInbodyHistory = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('inbody-history-container');
    if (!container) return;

    try {
        const q = query(
            collection(db, "users", user.uid, "inbodyHistory"),
            orderBy("date", "desc"),
            limit(10)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.style.display = 'none';
            return;
        }

        const records = [];
        snapshot.forEach(d => records.push(d.data()));
        records.reverse(); // 오래된 순으로 정렬

        // 마지막 측정일 표시
        const latest = records[records.length - 1];
        updateInbodyLastDate(latest.date);

        container.style.display = 'block';

        // 최근 2개 비교 (변화량 표시)
        let changeHtml = '';
        if (records.length >= 2) {
            const prev = records[records.length - 2];
            const curr = records[records.length - 1];
            const changes = [];

            if (curr.smm != null && prev.smm != null) {
                const diff = (curr.smm - prev.smm).toFixed(1);
                const sign = diff > 0 ? '+' : '';
                const color = diff > 0 ? '#2E7D32' : diff < 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">💪 근육 ${sign}${diff}kg</span>`);
            }
            if (curr.fat != null && prev.fat != null) {
                const diff = (curr.fat - prev.fat).toFixed(1);
                const sign = diff > 0 ? '+' : '';
                const color = diff < 0 ? '#2E7D32' : diff > 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">🔥 체지방 ${sign}${diff}kg</span>`);
            }
            if (curr.visceral != null && prev.visceral != null) {
                const diff = curr.visceral - prev.visceral;
                const sign = diff > 0 ? '+' : '';
                const color = diff < 0 ? '#2E7D32' : diff > 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">🎯 내장지방 ${sign}${diff}</span>`);
            }

            if (changes.length > 0) {
                changeHtml = `
                    <div style="display:flex; gap:12px; flex-wrap:wrap; padding:10px 12px; background:var(--white); border-radius:8px; margin-bottom:10px; font-size:13px; font-weight:600;">
                        ${changes.join('')}
                    </div>
                    <div style="font-size:11px; color:#aaa; margin-bottom:6px;">📅 ${prev.date} → ${curr.date} 변화</div>
                `;
            }
        }

        // 히스토리 테이블
        const rows = records.map(r => {
            return `<tr>
                <td style="font-size:12px; color:#888;">${r.date?.slice(5) || '-'}</td>
                <td>${r.smm != null ? r.smm : '-'}</td>
                <td>${r.fat != null ? r.fat : '-'}</td>
                <td>${r.visceral != null ? r.visceral : '-'}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="border-top:1px solid #eee; padding-top:12px;">
                <div style="font-size:14px; font-weight:600; margin-bottom:8px;">📈 체성분 변화 추이</div>
                ${changeHtml}
                <div style="overflow-x:auto;">
                    <table style="width:100%; font-size:13px; border-collapse:collapse; text-align:center;">
                        <thead>
                            <tr style="border-bottom:2px solid #eee; color:#888; font-size:11px;">
                                <th style="padding:6px 4px;">날짜</th>
                                <th style="padding:6px 4px;">근육(kg)</th>
                                <th style="padding:6px 4px;">체지방(kg)</th>
                                <th style="padding:6px 4px;">내장지방</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.warn('인바디 히스토리 로드 스킵:', e.message);
    }
};

// 혈액검사 결과지 사진 업로드 및 분석
async function uploadBloodTestPhoto(inputEl) {
    const file = inputEl.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) { showToast('⚠️ 로그인이 필요합니다.'); return; }

    if (!isValidFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'image/heic'])) {
        showToast('⚠️ 이미지 파일만 업로드할 수 있습니다.');
        return;
    }

    const resultContainer = document.getElementById('blood-test-result');
    if (resultContainer) {
        resultContainer.innerHTML = '<div class="loading-dots" style="padding:20px; text-align:center;"><span></span><span></span><span></span></div><div style="text-align:center; font-size:13px; color:#888;">AI가 혈액검사 결과를 분석하고 있습니다...</div>';
        resultContainer.style.display = 'block';
    }

    try {
        // 이미지 압축
        const compressed = await compressImage(file);

        // Firebase Storage에 업로드
        const dateStr = getKstDateString();
        const storageRef = ref(storage, `blood_tests/${user.uid}/${dateStr}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, compressed);
        const imageUrl = await getDownloadURL(storageRef);

        // AI 분석 요청
        const analysis = await requestBloodTestAnalysis(imageUrl);
        if (analysis && resultContainer) {
            renderBloodTestResult(resultContainer, analysis);

            // 날짜 표시
            const dateEl = document.getElementById('blood-test-date');
            if (dateEl) dateEl.textContent = `분석일: ${dateStr}`;

            showToast('🩸 혈액검사 분석이 완료되었습니다!');

            // 대사건강 점수 자동 갱신 (혈당/중성지방 반영)
            updateMetabolicScoreUI();

            // 이력 갱신
            loadBloodTestHistory();
        } else if (resultContainer) {
            resultContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#C62828;">⚠️ 분석에 실패했습니다. 사진이 선명한지 확인해주세요.</div>';
        }
    } catch (e) {
        console.error('혈액검사 업로드 오류:', e);
        if (resultContainer) {
            resultContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#C62828;">⚠️ 업로드 중 오류가 발생했습니다.</div>';
        }
    } finally {
        inputEl.value = '';
    }
}

// 혈액검사 이력 로드
async function loadBloodTestHistory() {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('blood-test-history');
    if (!container) return;

    try {
        const q = query(
            collection(db, "users", user.uid, "bloodTests"),
            orderBy("analyzedAt", "desc"),
            limit(5)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.style.display = 'none';
            return;
        }

        const records = [];
        snapshot.forEach(d => records.push({ id: d.id, ...d.data() }));

        const rowsHtml = records.map(r => {
            const grade = r.overallGrade || '-';
            const gradeColors = { 'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828' };
            const color = gradeColors[grade] || '#888';
            const metrics = r.metrics || {};
            const gl = metrics.glucose?.value || '-';
            const tg = metrics.triglyceride?.value || '-';
            const hba1c = metrics.hba1c?.value || '-';
            return `<tr>
                <td style="font-size:12px; color:#888;">${r.id || '-'}</td>
                <td style="font-weight:700; color:${color};">${grade}</td>
                <td>${gl}</td>
                <td>${tg}</td>
                <td>${hba1c}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="border-top:1px solid #eee; padding-top:12px; margin-top:12px;">
                <div style="font-size:14px; font-weight:600; margin-bottom:8px;">📋 이전 검사 이력</div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; font-size:13px; border-collapse:collapse; text-align:center;">
                        <thead>
                            <tr style="border-bottom:2px solid #eee; color:#888; font-size:11px;">
                                <th style="padding:6px 4px;">날짜</th>
                                <th style="padding:6px 4px;">등급</th>
                                <th style="padding:6px 4px;">혈당</th>
                                <th style="padding:6px 4px;">중성지방</th>
                                <th style="padding:6px 4px;">HbA1c</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
        container.style.display = 'block';
    } catch (e) {
        console.warn('혈액검사 이력 로드 스킵:', e.message);
    }
}

// 대시보드 캐시
let _dashboardCache = { uid: null, data: null, ts: 0 };
const _archivedWeekIds = new Set(); // 이미 archive 요청된 weekId 추적 (중복 방지)
const DASHBOARD_CACHE_TTL = 30_000;
const LS_DASHBOARD_KEY = 'dashboardData_v1';

function _saveDashboardToLS(uid, data) {
    try {
        localStorage.setItem(LS_DASHBOARD_KEY, JSON.stringify({ uid, ts: Date.now(), ...data }));
    } catch (_) {}
}

function _loadDashboardFromLS(uid) {
    try {
        const raw = localStorage.getItem(LS_DASHBOARD_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (d.uid !== uid) return null;
        return d;
    } catch (_) { return null; }
}

function _patchDashboardUserData(uid, patcher) {
    const patchDashData = (dashData) => {
        if (!dashData) return null;
        const nextUd = { ...(dashData.ud || {}) };
        patcher(nextUd);
        return { ...dashData, ud: nextUd };
    };

    if (_dashboardCache.uid === uid && _dashboardCache.data) {
        const nextData = patchDashData(_dashboardCache.data);
        if (nextData) {
            _dashboardCache = { uid, data: nextData, ts: Date.now() };
        }
    }

    const lsData = _loadDashboardFromLS(uid);
    if (lsData) {
        const { uid: _storedUid, ts: _storedTs, ...storedDashData } = lsData;
        const nextStoredData = patchDashData(storedDashData);
        if (nextStoredData) {
            _saveDashboardToLS(uid, nextStoredData);
        }
    }
}

async function _fetchDashboardViaCloudFunction(uid, weekStart, weekEnd) {
    const fn = httpsCallable(functions, 'getDashboardData');
    const result = await fn({ weekStart, weekEnd });
    return result.data;
}

function goToGalleryRecordAction() {
    if (!auth.currentUser) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }
    openTab('diet');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

let _missionPrimaryActionState = { type: 'setup', tab: 'diet' };

function getNextRecordTab(todayAwarded = {}) {
    if (!todayAwarded.diet) return 'diet';
    if (!todayAwarded.exercise) return 'exercise';
    if (!todayAwarded.mind) return 'sleep';
    return 'gallery';
}

function updateGalleryPrimaryAction() {
    const saveBtn = document.getElementById('saveDataBtn');
    const helperEl = document.getElementById('submit-bar-helper');
    if (!saveBtn || !helperEl) return;
    if (getVisibleTabName() !== 'gallery') {
        updateContextualSaveBar(getVisibleTabName());
        return;
    }

    resetSubmitBarMode();
    const shareContainer = document.getElementById('my-share-container');
    const canShare = !!shareContainer && shareContainer.style.display !== 'none';

    helperEl.style.display = 'block';
    helperEl.textContent = canShare
        ? '기록 카드 준비 완료. 단톡방에 공유해요.'
        : '단톡방에서 오늘 기록 이어가기';
    saveBtn.dataset.mode = 'chat';
    saveBtn.disabled = false;
    saveBtn.innerText = '💬 해빛스쿨 단톡방 참여하기';
    saveBtn.style.background = '#FEE500';
    saveBtn.style.color = '#3C1E1E';
    saveBtn.style.boxShadow = '0 8px 18px rgba(254,229,0,0.28)';
}

function handleMissionPrimaryAction() {
    if (!auth.currentUser) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    const selectionArea = document.getElementById('mission-selection-area');
    const progressArea = document.getElementById('mission-progress-container');

    switch (_missionPrimaryActionState.type) {
        case 'record':
            openTab(_missionPrimaryActionState.tab || 'diet');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        case 'share':
            openTab('gallery');
            setTimeout(() => triggerGalleryShareAction(), 80);
            return;
        case 'review':
            openTab('dashboard');
            progressArea?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        case 'setup':
        default:
            openTab('dashboard');
            selectionArea?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
    }
}

async function triggerGalleryShareAction(forceExpanded = null) {
    if (!auth.currentUser) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    if (document.getElementById('gallery') && !document.getElementById('gallery')?.classList.contains('active')) {
        openTab('gallery');
    }

    await buildShareCardAsync(auth.currentUser.uid, auth.currentUser);

    const shareContainer = document.getElementById('my-share-container');
    const shareButton = shareContainer?.querySelector('.btn-share-action');
    const settingsShell = document.getElementById('gallery-share-settings-shell');
    const hasShareCard = !!shareContainer && shareContainer.style.display !== 'none';

    if (!hasShareCard) {
        showToast('오늘 또는 어제 기록을 저장하면 바로 공유할 수 있어요.');
        openTab('diet');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    const shouldExpand = typeof forceExpanded === 'boolean' ? forceExpanded : !_shareSettingsExpanded;
    setShareSettingsExpanded(shouldExpand);

    const target = shouldExpand ? settingsShell : shareContainer;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (shouldExpand) {
        const firstControl = document.getElementById('share-hide-identity');
        if (firstControl) setTimeout(() => firstControl.focus(), 220);
        return;
    }

    if (shareButton) {
        setTimeout(() => shareButton.focus(), 220);
    }
}

function focusGalleryFeed() {
    openTab('gallery');
    const feedHeading = document.getElementById('gallery-feed-title');
    if (feedHeading) {
        setTimeout(() => {
            feedHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }
}

function focusDashboardModule(moduleId) {
    if (getVisibleTabName() !== 'dashboard') {
        openTab('dashboard');
    }
    const target = document.getElementById(moduleId);
    if (!target) return;
    setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
}

const COMMUNITY_CHAT_URL = 'https://open.kakao.com/o/gv23urgi';
window.openCommunityChat = function() {
    window.open(COMMUNITY_CHAT_URL, '_blank', 'noopener');
};

const _communityFocusState = {
    friendCount: 0,
    activeFriends: 0,
    completeFriends: 0,
    pendingChallenges: 0,
    activeChallenges: 0,
    pendingChallengeId: '',
    monthlyUsers: 0,
    primaryAction: 'invite'
};

function focusProfileFriendCard(preferRequests = false) {
    const requestCard = document.getElementById('profile-friend-requests-card');
    const inviteCard = document.getElementById('profile-friend-invite-card');
    const hasRequests = getIncomingFriendRequests().length > 0 || getOutgoingFriendRequests().length > 0;
    const targetCard = preferRequests && hasRequests ? requestCard : (inviteCard || requestCard);
    targetCard?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
    targetCard?.classList.add('is-highlighted');
    window.setTimeout(() => targetCard?.classList.remove('is-highlighted'), 1400);
}

window.openFriendInviteFlow = function() {
    if (!auth.currentUser) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    window.location.hash = '#profile';
    openTab('profile');
    const focusInviteCard = () => focusProfileFriendCard(false);
    requestAnimationFrame(focusInviteCard);
    setTimeout(focusInviteCard, 160);
    setTimeout(focusInviteCard, 420);
};

window.openFriendRequestFlow = function() {
    if (!auth.currentUser) {
        document.getElementById('login-modal').style.display = 'flex';
        return;
    }

    window.location.hash = '#profile';
    openTab('profile');
    const focusRequestCard = () => focusProfileFriendCard(true);
    requestAnimationFrame(focusRequestCard);
    setTimeout(focusRequestCard, 160);
    setTimeout(focusRequestCard, 420);
};

window.handleCommunityPrimaryAction = function() {
    switch (_communityFocusState.primaryAction) {
        case 'respond':
            if (_communityFocusState.pendingChallengeId) {
                openChallengeInviteModal(_communityFocusState.pendingChallengeId);
            } else {
                showToast('응답할 챌린지를 다시 불러오고 있어요.');
            }
            return;
        case 'start':
            openCreateChallengeModal();
            return;
        case 'record':
            openTab(getNextRecordTab() || 'diet');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        case 'cheer':
            focusGalleryFeed();
            return;
        case 'invite':
        default:
            openFriendInviteFlow();
            return;
    }
};

function renderCommunityFocusPanel() {
    const titleEl = document.getElementById('community-focus-title');
    const bodyEl = document.getElementById('community-focus-body');
    const badgeEl = document.getElementById('community-focus-badge');
    const statsEl = document.getElementById('community-focus-stats');
    const actionsEl = document.getElementById('community-focus-actions');
    if (!titleEl || !bodyEl || !badgeEl || !actionsEl) return;

    const {
        friendCount,
        activeFriends,
        completeFriends,
        pendingChallenges,
        activeChallenges,
        monthlyUsers
    } = _communityFocusState;

    let primaryLabel = '친구 초대';
    let stats = [];

    if (pendingChallenges > 0) {
        _communityFocusState.primaryAction = 'respond';
        titleEl.textContent = '응답할 챌린지가 있어요.';
        bodyEl.textContent = '지금 답변만 하면 바로 이어집니다.';
        badgeEl.textContent = `초대 ${pendingChallenges}건`;
        primaryLabel = '챌린지 응답';
    } else if (friendCount === 0) {
        _communityFocusState.primaryAction = 'invite';
        titleEl.textContent = '친구 1명만 초대하면 돼요.';
        bodyEl.textContent = '프로필 초대 카드에서 코드만 보내면 됩니다.';
        badgeEl.textContent = '친구 0명';
        primaryLabel = '친구 초대';
    } else if (activeChallenges === 0) {
        _communityFocusState.primaryAction = 'start';
        titleEl.textContent = '친구 연결은 끝났어요.';
        bodyEl.textContent = '지금은 챌린지 하나만 시작하면 됩니다.';
        badgeEl.textContent = `친구 ${friendCount}명`;
        primaryLabel = '챌린지 시작';
    } else if (activeFriends === 0) {
        _communityFocusState.primaryAction = 'record';
        titleEl.textContent = '챌린지는 열려 있어요.';
        bodyEl.textContent = '오늘 기록 하나만 남기면 됩니다.';
        badgeEl.textContent = `진행 ${activeChallenges}개`;
        primaryLabel = '오늘 기록';
    } else {
        _communityFocusState.primaryAction = 'cheer';
        titleEl.textContent = '친구 흐름이 움직이고 있어요.';
        bodyEl.textContent = `${activeFriends}명이 오늘 기록했어요. 지금은 응원만 하면 됩니다.`;
        badgeEl.textContent = `활동 ${activeFriends}명`;
        primaryLabel = '응원하러 가기';
    }

    if (friendCount > 0) stats.push(`친구 ${friendCount}명`);
    if (activeChallenges > 0) stats.push(`진행 ${activeChallenges}개`);
    if (completeFriends > 0) stats.push(`오늘 완료 ${completeFriends}명`);

    if (statsEl) {
        statsEl.hidden = stats.length === 0;
        statsEl.innerHTML = stats.slice(0, 2).map(text => `<span class="community-focus-stat">${text}</span>`).join('');
    }

    actionsEl.innerHTML = `<button type="button" class="community-focus-action primary" onclick="handleCommunityPrimaryAction()">${primaryLabel}</button>`;
}

async function refreshCommunityFocusSummary(user, todayStr, communityStats = null) {
    if (!user) return;

    _communityFocusState.monthlyUsers = communityStats?.totalUsers || 0;
    _communityFocusState.pendingChallengeId = '';

    try {
        await loadMyFriendships();
        const activeFriendIds = getActiveFriendIds();
        _communityFocusState.friendCount = activeFriendIds.length;

        if (activeFriendIds.length === 0) {
            _communityFocusState.activeFriends = 0;
            _communityFocusState.completeFriends = 0;
            _communityFocusState.pendingChallenges = 0;
            _communityFocusState.activeChallenges = 0;
            renderCommunityFocusPanel();
            return;
        }

        const friendStatusRows = await Promise.all(activeFriendIds.map(async fid => {
            const logSnap = await getDoc(doc(db, 'daily_logs', `${fid}_${todayStr}`));
            if (!logSnap.exists()) return { active: false, complete: false };
            const awarded = logSnap.data()?.awardedPoints || {};
            const active = !!(awarded.diet || awarded.exercise || awarded.mind);
            const complete = !!(awarded.diet && awarded.exercise && awarded.mind);
            return { active, complete };
        }));

        _communityFocusState.activeFriends = friendStatusRows.filter(row => row.active).length;
        _communityFocusState.completeFriends = friendStatusRows.filter(row => row.complete).length;

        const [asParticipant, asInvitee] = await Promise.all([
            getDocs(query(
                collection(db, 'social_challenges'),
                where('participants', 'array-contains', user.uid),
                where('status', 'in', ['pending', 'active']),
                limit(5)
            )),
            getDocs(query(
                collection(db, 'social_challenges'),
                where('invitees', 'array-contains', user.uid),
                where('status', '==', 'pending'),
                limit(5)
            ))
        ]);

        const challengeMap = new Map();
        asParticipant.forEach(d => challengeMap.set(d.id, { id: d.id, ...d.data(), isInvite: false }));
        asInvitee.forEach(d => challengeMap.set(d.id, { id: d.id, ...d.data(), isInvite: true }));

        const challenges = [...challengeMap.values()];
        const pendingChallenge = challenges.find(ch => ch.isInvite);
        _communityFocusState.pendingChallenges = challenges.filter(ch => ch.isInvite).length;
        _communityFocusState.activeChallenges = challenges.filter(ch => !ch.isInvite && ch.status === 'active').length;
        _communityFocusState.pendingChallengeId = pendingChallenge?.id || '';
    } catch (e) {
        console.warn('[refreshCommunityFocusSummary] 오류:', e.message);
    }

    renderCommunityFocusPanel();
}

function renderMissionFocusState({
    todayAwarded = {},
    isWeekActive = false,
    overallRate = 0,
    totalMissions = 0,
    completedMissions = 0,
    levelUpLockedToday = false
}) {
    const stripEl = document.getElementById('mission-focus-strip');
    const kickerEl = document.getElementById('mission-focus-kicker');
    const titleEl = document.getElementById('mission-focus-title');
    const buttonEl = document.getElementById('mission-focus-btn');
    const tagsEl = document.getElementById('mission-focus-tags');
    if (!kickerEl || !titleEl || !buttonEl) return;

    const doneToday = ['diet', 'exercise', 'mind'].filter(type => !!todayAwarded[type]).length;
    const remainingToday = Math.max(0, 3 - doneToday);
    const nextTab = getNextRecordTab(todayAwarded);
    const nextLabel = nextTab === 'diet' ? '식단' : nextTab === 'exercise' ? '운동' : nextTab === 'sleep' ? '마음' : '공유';

    if (stripEl) stripEl.style.display = isWeekActive && totalMissions > 0 ? 'none' : 'flex';

    let tags = [`오늘 ${doneToday}/3 완료`];

    if (levelUpLockedToday) {
        kickerEl.textContent = '레벨업 완료';
        titleEl.textContent = '새 미션은 내일 다시 정할 수 있어요';
        buttonEl.textContent = '내일 다시 열기';
        _missionPrimaryActionState = { type: 'locked', tab: 'dashboard' };
        tags = ['오늘은 새 미션 대기'];
        buttonEl.style.display = 'none';
    } else if (!isWeekActive || totalMissions === 0) {
        kickerEl.textContent = '이번 주 미션';
        titleEl.textContent = '이번 주 미션 1~3개 고르기';
        buttonEl.textContent = '미션 정하기';
        _missionPrimaryActionState = { type: 'setup', tab: 'diet' };
        tags = ['미션 최대 3개'];
        buttonEl.style.display = '';
    } else if (remainingToday > 0) {
        kickerEl.textContent = '이번 주 미션';
        titleEl.textContent = `다음은 ${nextLabel}`;
        buttonEl.textContent = `${nextLabel} 기록`;
        _missionPrimaryActionState = { type: 'record', tab: nextTab };
        tags = [];
        buttonEl.style.display = '';
    } else {
        kickerEl.textContent = '이번 주 미션';
        titleEl.textContent = '오늘 기록 끝';
        buttonEl.textContent = '갤러리 보기';
        _missionPrimaryActionState = { type: 'share', tab: 'gallery' };
        tags = [];
        buttonEl.style.display = '';
    }

    if (tagsEl) {
        tagsEl.innerHTML = tags.map(tag => `<span class="mission-focus-tag">${tag}</span>`).join('');
        tagsEl.style.display = tags.length > 0 ? 'flex' : 'none';
    }
}

const DASHBOARD_ACTION_META = {
    diet: {
        buttonId: 'dashboard-action-diet',
        labelId: 'dashboard-action-diet-label',
        subId: 'dashboard-action-diet-sub',
        name: '식단',
        idleLabel: '식단 기록',
        idleSub: '사진 한 장으로 시작',
        focusLabel: '식단부터 기록해요',
        focusSub: '사진 한 장이면 충분해요',
        doneLabel: '식단 완료',
        doneSub: '오늘 식단 인증이 반영됐어요'
    },
    exercise: {
        buttonId: 'dashboard-action-exercise',
        labelId: 'dashboard-action-exercise-label',
        subId: 'dashboard-action-exercise-sub',
        name: '운동',
        idleLabel: '운동 기록',
        idleSub: '움직인 만큼 체크',
        focusLabel: '운동부터 기록해요',
        focusSub: '짧게라도 한 번 남겨보세요',
        doneLabel: '운동 완료',
        doneSub: '오늘 운동 인증이 반영됐어요'
    },
    mind: {
        buttonId: 'dashboard-action-mind',
        labelId: 'dashboard-action-mind-label',
        subId: 'dashboard-action-mind-sub',
        name: '마음',
        idleLabel: '마음 기록',
        idleSub: '수면·감사 한 번에',
        focusLabel: '마음 기록해요',
        focusSub: '수면이나 감사 일기면 충분해요',
        doneLabel: '마음 완료',
        doneSub: '오늘 마음 인증이 반영됐어요'
    }
};

function _renderDashboardHeroState({
    todayAwarded = {},
    streakCount = 0,
    activeDays = 0,
    isWeekActive = false,
    overallRate = 0,
    totalMissions = 0,
    completedMissions = 0,
    levelUpLockedToday = false
}) {
    const order = ['diet', 'exercise', 'mind'];
    const completedToday = order.filter(type => !!todayAwarded[type]).length;
    const remainingToday = Math.max(0, order.length - completedToday);
    const nextType = order.find(type => !todayAwarded[type]) || null;
    const focusMeta = nextType ? DASHBOARD_ACTION_META[nextType] : null;
    const weeklyDayRate = Math.round((activeDays / 7) * 100);

    const heroPill = document.getElementById('dashboard-hero-pill');
    const focusTitle = document.getElementById('dashboard-focus-title');
    const focusBody = document.getElementById('dashboard-focus-body');
    const streakEl = document.getElementById('dashboard-streak-count');
    const completedEl = document.getElementById('dashboard-completed-count');
    const weekRateEl = document.getElementById('dashboard-week-rate');
    const nextRewardEl = document.getElementById('dashboard-next-reward');
    const weekProgressTextEl = document.getElementById('dashboard-week-progress-text');
    const weekProgressFillEl = document.getElementById('dashboard-week-progress-fill');
    const weekSummaryEl = document.getElementById('dashboard-week-summary');

    if (heroPill) {
        if (remainingToday === 0) heroPill.textContent = '오늘 완료';
        else if (completedToday === 0) heroPill.textContent = '첫 기록 추천';
        else heroPill.textContent = `남은 행동 ${remainingToday}개`;
    }

    if (focusTitle) {
        if (remainingToday === 0) {
            focusTitle.textContent = '오늘 루틴 완료';
        } else if (levelUpLockedToday) {
            focusTitle.textContent = '오늘은 레벨업 완료';
        } else if (focusMeta) {
            focusTitle.textContent = focusMeta.focusLabel;
        } else {
            focusTitle.textContent = '오늘 한 가지 시작해보세요';
        }
    }

    if (focusBody) {
        if (remainingToday === 0) {
            focusBody.textContent = isWeekActive
                ? `오늘 완료 · 이번 주 ${overallRate}%`
                : '오늘 완료 · 기록 보기';
        } else if (levelUpLockedToday) {
            focusBody.textContent = '새 미션은 내일 고를 수 있어요.';
        } else if (focusMeta) {
            focusBody.textContent = `오늘 ${completedToday}/3 · 남은 ${remainingToday}개`;
        }
    }

    if (streakEl) streakEl.textContent = `${streakCount}일`;
    if (completedEl) completedEl.textContent = `${completedToday}/3`;
    if (weekRateEl) weekRateEl.textContent = `${activeDays}일`;
    if (nextRewardEl) nextRewardEl.textContent = remainingToday === 0 ? '오늘 완료' : '+10P';
    if (weekProgressTextEl) weekProgressTextEl.textContent = `${weeklyDayRate}%`;
    if (weekProgressFillEl) weekProgressFillEl.style.width = `${weeklyDayRate}%`;

    if (weekSummaryEl) {
        if (isWeekActive && totalMissions > 0) {
            weekSummaryEl.textContent = `${activeDays}일 기록 · 달성 ${overallRate}%`;
        } else if (activeDays > 0) {
            weekSummaryEl.textContent = `${activeDays}일째 기록 중`;
        } else {
            weekSummaryEl.textContent = '첫 기록을 남겨보세요.';
        }
    }

    renderMissionFocusState({
        todayAwarded,
        isWeekActive,
        overallRate,
        totalMissions,
        completedMissions,
        levelUpLockedToday
    });

    order.forEach(type => {
        const meta = DASHBOARD_ACTION_META[type];
        const button = document.getElementById(meta.buttonId);
        const label = document.getElementById(meta.labelId);
        const sub = document.getElementById(meta.subId);
        const done = !!todayAwarded[type];
        const isFocus = !done && type === nextType;

        if (!button || !label || !sub) return;

        button.classList.toggle('is-complete', done);
        button.classList.toggle('is-focus', isFocus);

        if (done) {
            label.textContent = meta.doneLabel;
            sub.textContent = meta.doneSub;
        } else if (isFocus) {
            label.textContent = meta.focusLabel;
            sub.textContent = meta.focusSub;
        } else {
            label.textContent = meta.idleLabel;
            sub.textContent = meta.idleSub;
        }
    });
}

async function renderDashboard() {
    const user = auth.currentUser;
    if (!user) return;

    const { todayStr, weekStrs } = getDatesInfo();
    const currentWeekId = getWeekId(todayStr);

    // 1차: 메모리 캐시 (30초 TTL)
    const now = Date.now();
    if (_dashboardCache.uid === user.uid && (now - _dashboardCache.ts) < DASHBOARD_CACHE_TTL && _dashboardCache.data) {
        _renderDashboardWithData(_dashboardCache.data, todayStr, weekStrs, currentWeekId, user);
        return;
    }

    // 2차: localStorage 캐시 → 즉시 렌더 + 백그라운드 갱신
    const lsData = _loadDashboardFromLS(user.uid);
    if (lsData) {
        _renderDashboardWithData(lsData, todayStr, weekStrs, currentWeekId, user);
        _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId).catch(() => {});
        return;
    }

    // 3차: 캐시 없음 → 로딩 표시 + 서버 fetch
    const dashEl = document.getElementById('dashboard');
    if (dashEl && !dashEl.querySelector('.dashboard-loading-indicator')) {
        const loader = document.createElement('div');
        loader.className = 'dashboard-loading-indicator';
        loader.innerHTML = '<div style="text-align:center;padding:20px 0;color:#aaa;font-size:13px;">📊 기록을 불러오는 중...</div>';
        dashEl.prepend(loader);
    }
    await _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId);
}

async function _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId) {
    try {
        console.time('⏱️ 대시보드 데이터 로드');
        const weekStart = weekStrs[0];
        const weekEnd = weekStrs[6];

        const _directFirestore = async () => {
            const userRef = doc(db, "users", user.uid);
            const weekQuery = query(collection(db, "daily_logs"), where("userId", "==", user.uid), where("date", ">=", weekStart), where("date", "<=", weekEnd));
            const streakQuery = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(30));
            const [userDoc, snapshot, streakSnap] = await Promise.all([getDoc(userRef), getDocs(weekQuery), getDocs(streakQuery)]);
            const wl = []; snapshot.forEach(d => { const dd = d.data(); wl.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} }); });
            const sl = []; streakSnap.forEach(d => { const dd = d.data(); sl.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} }); });
            return { ud: userDoc.exists() ? userDoc.data() : {}, weekLogs: wl, streakLogs: sl, communityStats: null };
        };

        let dashData;
        try {
            const cfPromise = _fetchDashboardViaCloudFunction(user.uid, weekStart, weekEnd)
                .then(cf => ({ ud: cf.user || {}, weekLogs: cf.weekLogs || [], streakLogs: cf.streakLogs || [], communityStats: cf.communityStats || null }));
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('CF 5s timeout')), 5000));
            dashData = await Promise.race([cfPromise, timeout]);
        } catch (cfErr) {
            console.warn('CF 실패/타임아웃, Firestore 직접 쿼리:', cfErr.message);
            dashData = await _directFirestore();
        }
        console.timeEnd('⏱️ 대시보드 데이터 로드');

        const loadingEl = document.querySelector('.dashboard-loading-indicator');
        if (loadingEl) loadingEl.remove();

        _dashboardCache = { uid: user.uid, data: dashData, ts: Date.now() };
        _saveDashboardToLS(user.uid, dashData);

        _renderDashboardWithData(dashData, todayStr, weekStrs, currentWeekId, user);
    } catch (error) {
        console.error('대시보드 데이터 로드 오류:', error);
        const loadingEl = document.querySelector('.dashboard-loading-indicator');
        if (loadingEl) loadingEl.remove();
    }
}

function _renderDashboardWithData(data, todayStr, weekStrs, currentWeekId, user) {
    try {
        const ud = data.ud || {};
        ensureGuideCollapseState(ud);
        if (ud.coins != null) document.getElementById('point-balance').innerText = ud.coins;
        renderMilestones(user.uid, ud);

        let level = typeof ud.missionLevel === 'number' ? ud.missionLevel : 1;
        let weeklyMissionData = ud.weeklyMissionData || null;
        let missionHistory = Array.isArray(ud.missionHistory) ? ud.missionHistory : [];
        let missionStreak = typeof ud.missionStreak === 'number' ? ud.missionStreak : 0;
        let missionBadges = Array.isArray(ud.missionBadges) ? ud.missionBadges : [];

        if (!weeklyMissionData && ud.selectedMissions && ud.selectedMissions.length > 0) {
            const oldMissionMap = {
                'm1_diet': { text: '🥗 하루 한 끼 채소 채우기', target: 3, type: 'diet' },
                'm1_exer': { text: '🏃 주 3회 이상 운동', target: 3, type: 'exercise' },
                'm1_mind': { text: '🧘 주 2회 명상', target: 2, type: 'mind' },
                'm2_diet': { text: '🥗 채소 위주 식단', target: 5, type: 'diet' },
                'm2_exer': { text: '🏃 주 4회 운동', target: 4, type: 'exercise' },
                'm2_mind': { text: '🧘 주 3회 명상', target: 3, type: 'mind' },
                'm3_diet': { text: '🥗 주 5일 클린 식단', target: 5, type: 'diet' },
                'm3_exer': { text: '🏃 매일 운동 습관', target: 5, type: 'exercise' },
                'm3_mind': { text: '🧘 주 4회 마음 챙김', target: 4, type: 'mind' },
                'm4_diet': { text: '🥗 하루 3끼 채소 중심', target: 6, type: 'diet' },
                'm4_exer': { text: '🏃 매일 운동 (주 6회)', target: 6, type: 'exercise' },
                'm4_mind': { text: '🧘 주 5회 명상', target: 5, type: 'mind' },
                'm5_diet': { text: '🥗 클린 식단 달성', target: 7, type: 'diet' },
                'm5_exer': { text: '🏃 매일 운동 달성', target: 7, type: 'exercise' },
                'm5_med':  { text: '💊 약 감량 시도', target: 1, type: 'mind' }
            };
            weeklyMissionData = {
                weekId: currentWeekId,
                missions: ud.selectedMissions.map(id => {
                    const legacy = oldMissionMap[id];
                    return {
                        id,
                        text: legacy ? legacy.text : id,
                        target: legacy ? legacy.target : 3,
                        type: legacy ? legacy.type : (id.includes('diet') ? 'diet' : id.includes('exer') ? 'exercise' : 'mind'),
                        isCustom: false
                    };
                })
            };
        }

        // 주간 리셋 감지: 저장된 weekId가 현재 주와 다르면 아카이브 후 리셋
        const needsReset = weeklyMissionData && weeklyMissionData.weekId && weeklyMissionData.weekId !== currentWeekId;
        if (needsReset) {
            const oldWeekId = weeklyMissionData.weekId;
            // 같은 주차에 대해 archive가 중복 실행되지 않도록 가드
            if (!_archivedWeekIds.has(oldWeekId)) {
                _archivedWeekIds.add(oldWeekId);
                // 아카이브를 백그라운드로 실행 (대시보드 렌더링 차단 방지)
                const prevWeekStrs = weekStrs.map(dStr => {
                    const d = new Date(dStr + 'T12:00:00Z');
                    d.setUTCDate(d.getUTCDate() - 7);
                    return d.toISOString().slice(0, 10);
                });
                archiveWeekAndReset(user.uid, weeklyMissionData, missionHistory, missionStreak, prevWeekStrs).catch(e => {
                    _archivedWeekIds.delete(oldWeekId); // 실패 시 재시도 허용
                    console.warn('주간 아카이브 실패:', e.message);
                });
            }
            weeklyMissionData = null;
            missionStreak = 0;
        }

        const isWeekActive = weeklyMissionData && weeklyMissionData.weekId === currentWeekId && weeklyMissionData.missions && weeklyMissionData.missions.length > 0;
        const levelUpLockedToday = !isWeekActive && ud.missionLevelUpDate === todayStr;

        // 레벨 뱃지 업데이트
        document.getElementById('user-level-badge').innerText = `Lv. ${level} ${MISSIONS[level]?.name || ''} ℹ️`;

        let logsMap = {}; let statDiet = 0, statExer = 0, statMind = 0;
        const weekLogs = data.weekLogs || [];
        weekLogs.forEach(logItem => {
            logsMap[logItem.date] = logItem;
            if (logItem.awardedPoints?.diet) statDiet++;
            if (logItem.awardedPoints?.exercise) statExer++;
            if (logItem.awardedPoints?.mind) statMind++;
        });
        const activeDays = weekStrs.filter(dateStr => {
            const awarded = logsMap[dateStr]?.awardedPoints || {};
            return !!(awarded.diet || awarded.exercise || awarded.mind);
        }).length;

        // ==========================================
        // 오늘의 인증 현황
        // ==========================================
        const todayLog = logsMap[todayStr];
        const todayAwarded = todayLog?.awardedPoints || {};

        let streakCount = 0;
        const streakLogs = data.streakLogs || [];
        for (const log of streakLogs) {
            const awarded = log.awardedPoints || log.awarded || {};
            if (awarded.diet || awarded.exercise || awarded.mind) streakCount++;
            else break;
        }
        updateTodayStatusCard(todayAwarded, streakCount);

        // 주간 그래프 (월~일)
        const graphArea = document.getElementById('week-graph');
        graphArea.innerHTML = '';
        const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
        weekStrs.forEach((dateStr, idx) => {
            let circleClass = 'day-circle';
            if (logsMap[dateStr]) circleClass += ' done';
            let labelClass = 'day-label';
            if (dateStr === todayStr) { circleClass += ' today'; labelClass += ' today'; }
            graphArea.innerHTML += `<div class="day-wrap" onclick="changeDateTo('${dateStr}')"><div class="${circleClass}">${dayNames[idx]}</div><div class="${labelClass}">${dateStr.substring(5).replace('-', '/')}</div></div>`;
        });

        // ==========================================
        // 미션 영역 렌더링
        // ==========================================
        const missionArea = document.getElementById('mission-selection-area');
        const progContainer = document.getElementById('mission-progress-container');
        missionArea.innerHTML = '';
        progContainer.style.display = 'none';
        progContainer.innerHTML = '';
        let totalMissions = weeklyMissionData?.missions?.length || 0;
        let completedMissions = 0;
        let overallRate = 0;

        if (!isWeekActive && levelUpLockedToday) {
            missionArea.innerHTML = `
                <div class="mission-levelup-lock">
                    <div class="mission-levelup-lock-title">레벨업 완료</div>
                    <div class="mission-levelup-lock-body">오늘은 승급만 반영됐어요. 새 주간 미션은 내일 다시 고를 수 있어요.</div>
                </div>`;
        } else if (!isWeekActive) {
            // ========== 미션 설정 모드 ==========
            const levelData = MISSIONS[level] || MISSIONS[1];
            const categories = ['diet', 'exercise', 'mind'];
            const categoryLabels = { diet: '🥗 식단', exercise: '🏃 운동', mind: '🧘 마음' };
            const diffLabels = { easy: '쉬움', normal: '보통', hard: '도전' };
            const customOpen = _customMissionComposerOpen || pendingCustomMissions.length > 0;

            categories.forEach(cat => {
                const catData = levelData[cat];
                if (!catData) return;
                missionArea.innerHTML += `
                    <div class="mission-category-block compact">
                        <div class="mission-category-top compact">
                            <label class="mission-category-check" for="chk_preset_${cat}">
                                <input type="checkbox" id="chk_preset_${cat}" checked>
                                <span class="mission-category-label">${categoryLabels[cat]}</span>
                            </label>
                            <div class="mission-difficulty-tabs compact" data-category="${cat}">
                                ${Object.keys(catData).map(diff => `
                                    <button class="diff-tab ${diff === 'normal' ? 'active' : ''}" data-diff="${diff}" data-cat="${cat}" onclick="selectDifficulty('${cat}','${diff}')">
                                        ${diffLabels[diff]}
                                    </button>
                                `).join('')}
                            </div>
                        </div>
                        <div class="mission-preview compact" id="preview-${cat}">
                            <span id="label_preset_${cat}">${catData.normal.text} · ${catData.normal.target}일</span>
                        </div>
                    </div>`;
            });

            missionArea.innerHTML += `
                <div class="custom-mission-shell">
                    <button type="button" class="mission-secondary-btn mission-inline-toggle" onclick="toggleCustomMissionComposer()">
                        ${customOpen ? '직접 추가 닫기' : '직접 추가'}
                    </button>
                    <div class="custom-mission-section" ${customOpen ? '' : 'hidden'}>
                        <div class="custom-mission-header">✨ 직접 추가</div>
                        <div id="custom-missions-list"></div>
                        <div class="custom-mission-input-row">
                            <select id="custom-mission-type">
                                <option value="diet">🥗 식단</option>
                                <option value="exercise">🏃 운동</option>
                                <option value="mind">🧘 마음</option>
                            </select>
                            <input type="text" id="custom-mission-text" placeholder="예: 물 2L 마시기" maxlength="30">
                            <select id="custom-mission-target">
                                <option value="1">1일</option>
                                <option value="2">2일</option>
                                <option value="3" selected>3일</option>
                                <option value="4">4일</option>
                                <option value="5">5일</option>
                                <option value="6">6일</option>
                                <option value="7">7일</option>
                            </select>
                            <button class="add-custom-btn" onclick="addCustomMission()">+</button>
                        </div>
                    </div>
                </div>`;

            // 난이도 선택 초기화 스크립트 실행
            setTimeout(() => initDifficultySelectors(level), 0);

        } else {
            // ========== 진행 중 모드: 프로그레스 표시 ==========
            progContainer.style.display = 'block';
            progContainer.innerHTML = '';

            totalMissions = weeklyMissionData.missions.length;
            let progressRowsHtml = '';

            weeklyMissionData.missions.forEach(m => {
                let currentVal = 0;
                if (m.type === 'diet') currentVal = statDiet;
                else if (m.type === 'exercise') currentVal = statExer;
                else if (m.type === 'mind') currentVal = statMind;

                const percent = Math.min((currentVal / m.target) * 100, 100);
                if (percent >= 100) completedMissions++;

                const fillColor = percent >= 100 ? 'var(--success-color, #4CAF50)' : percent >= 50 ? 'var(--secondary-color)' : 'var(--warning-color, #FF9800)';
                const statusIcon = percent >= 100 ? '✅' : percent >= 50 ? '🔄' : '⏳';
                const customTag = m.isCustom ? '<span class="custom-tag">커스텀</span>' : '';

                progressRowsHtml += `
                    <div class="mp-row">
                        <div class="mp-label">
                            <span>${statusIcon} ${m.text} ${customTag}</span>
                            <span class="mp-count">${currentVal} / ${m.target}</span>
                        </div>
                        <div class="mp-track">
                            <div class="mp-fill" style="width: ${percent}%; background-color: ${fillColor};"></div>
                        </div>
                    </div>`;
            });

            // 전체 달성률 (실제 진행도 기반)
            let totalProgress = 0;
            weeklyMissionData.missions.forEach(m => {
                let val = m.type === 'diet' ? statDiet : m.type === 'exercise' ? statExer : statMind;
                totalProgress += Math.min(val / m.target, 1);
            });
            overallRate = totalMissions > 0 ? Math.round((totalProgress / totalMissions) * 100) : 0;
            // 남은 일수 계산
            const todayIdx = weekStrs.indexOf(todayStr);
            const remainingDays = todayIdx >= 0 ? 6 - todayIdx : 0;
            const allDone = completedMissions === totalMissions && totalMissions > 0;
            const isAtRisk = remainingDays <= 2 && overallRate < 80;
            const levelUpHtml = allDone && level < 5
                ? `<button class="submit-btn mission-progress-primary-btn" onclick="levelUp(${level + 1})">🎉 Lv ${level + 1} 승급하기</button>`
                : '';

            progContainer.innerHTML = `
                <div class="mission-progress-shell">
                    <div class="mission-progress-topline">
                        <div class="mission-progress-pills">
                            <span class="mission-progress-pill">달성 ${overallRate}%</span>
                            <span class="mission-progress-pill">남은 ${remainingDays}일</span>
                            ${isAtRisk ? '<span class="mission-progress-pill is-warning">마감 임박</span>' : ''}
                        </div>
                    </div>
                    <div class="mission-progress-detail-list mission-progress-detail-list-plain">
                        ${progressRowsHtml}
                        ${isAtRisk ? `<div class="mission-warning">남은 ${remainingDays}일 · 미션 먼저 끝내기</div>` : ''}
                    </div>
                    <div class="mission-progress-actions">
                        ${levelUpHtml}
                        <button type="button" class="mission-secondary-btn" onclick="resetWeeklyMissions()">미션 다시 정하기</button>
                    </div>
                </div>`;

            // 저장 버튼 상태 업데이트
            const saveBtn = document.getElementById('btn-save-missions');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.display = 'none';
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
                saveBtn.innerText = allDone ? '✅ 이번 주 미션 완료!' : '미션 진행 중...';
            }
        }

        if (!isWeekActive) {
            const saveBtn = document.getElementById('btn-save-missions');
            if (saveBtn) {
                saveBtn.disabled = !!levelUpLockedToday;
                saveBtn.style.display = levelUpLockedToday ? 'none' : 'block';
                saveBtn.style.opacity = levelUpLockedToday ? '0.5' : '1';
                saveBtn.style.cursor = levelUpLockedToday ? 'not-allowed' : 'pointer';
                saveBtn.innerText = levelUpLockedToday ? '내일 다시 설정' : '🎯 이번 주 시작';
            }
            progContainer.style.display = 'none';
        }

        _renderDashboardHeroState({
            todayAwarded,
            streakCount,
            activeDays,
            isWeekActive,
            overallRate,
            totalMissions,
            completedMissions,
            levelUpLockedToday
        });
        syncDashboardPanels();

        renderMissionBadges(missionBadges);

        if (data.communityStats) {
            renderGroupChallengeFromData(data.communityStats);
        } else {
            setTimeout(() => renderGroupChallenge().catch(() => {}), 1000);
        }

        renderSocialChallenges(user).catch(() => {});

        _communityFocusState.friendCount = 0;
        _communityFocusState.activeFriends = 0;
        _communityFocusState.completeFriends = 0;
        _communityFocusState.pendingChallenges = 0;
        _communityFocusState.activeChallenges = 0;
        _communityFocusState.pendingChallengeId = '';
        _communityFocusState.monthlyUsers = data.communityStats?.totalUsers || 0;
        renderCommunityFocusPanel();

        refreshCommunityFocusSummary(user, todayStr, data.communityStats).catch(() => {});
        // 친구 스트릭 달성 알림
        checkFriendStreakNotifications(user.uid).catch(() => {});
        // 챌린지 관련 알림
        checkChallengeNotifications(user.uid).catch(() => {});

    } catch (error) {
        console.error('대시보드 렌더링 오류:', error);
    }
}

// 데이터 저장 시 대시보드 캐시 무효화
window._invalidateDashboardCache = function() {
    _dashboardCache.ts = 0;
    try { localStorage.removeItem(LS_DASHBOARD_KEY); } catch (_) {}
};

window._applyWeeklyMissionResetToDashboard = function(uid) {
    if (!uid) return;
    _patchDashboardUserData(uid, (ud) => {
        ud.weeklyMissionData = null;
        delete ud.selectedMissions;
    });
};

window._applyMissionLevelUpToDashboard = function(uid, newLevel, dateStr) {
    if (!uid) return;
    _patchDashboardUserData(uid, (ud) => {
        ud.missionLevel = newLevel;
        ud.weeklyMissionData = null;
        delete ud.selectedMissions;
        ud.missionLevelUpDate = dateStr;
    });
};

// 난이도 선택기 초기화
function initDifficultySelectors(level) {
    const levelData = MISSIONS[level] || MISSIONS[1];
    ['diet', 'exercise', 'mind'].forEach(cat => {
        const preview = document.getElementById(`preview-${cat}`);
        const label = document.getElementById(`label_preset_${cat}`);
        if (preview && label && levelData[cat]) {
            const m = levelData[cat].normal;
            label.textContent = `${m.text} · ${m.target}일`;
        }
        document.querySelectorAll(`.mission-difficulty-tabs[data-category="${cat}"] .diff-tab`).forEach(btn => {
            btn.classList.toggle('active', btn.dataset.diff === 'normal');
        });
    });
}

// 마일스톤 수령완료 전체 펼치기/접기
window.toggleClaimedMilestones = function() {
    const rows = document.querySelectorAll('.ms-claimed-row');
    const btn = document.getElementById('ms-expand-btn');
    const isHidden = rows[0]?.style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? 'flex' : 'none');
    if (btn) btn.textContent = isHidden ? '접기 ▲' : '펼치기 ▼';
};

// 미션 배지 렌더링
function renderMissionBadges(earnedBadges) {
    const section = document.getElementById('mission-badges-section');
    const grid = document.getElementById('mission-badges-grid');
    if (!section || !grid) return;

    if (!earnedBadges || earnedBadges.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    if ('open' in section) section.open = false;
    grid.innerHTML = '';
    const allBadges = Object.values(MISSION_BADGES);
    allBadges.forEach(badge => {
        const earned = earnedBadges.includes(badge.id);
        grid.innerHTML += `
            <div class="mission-badge ${earned ? 'earned' : 'locked'}">
                <span class="badge-emoji">${earned ? badge.emoji : '🔒'}</span>
                <span class="badge-name">${badge.name}</span>
                <span class="badge-desc">${badge.desc}</span>
            </div>`;
    });
}

// 커뮤니티 월간 현황 렌더링 — 서버에서 미리 계산된 meta/communityStats 문서 1개만 읽음
function renderGroupChallengeFromData(s) {
    const section = document.getElementById('group-challenge-section');
    const content = document.getElementById('group-challenge-content');
    if (!section || !content) return;
    if (!s || !s.totalUsers) { section.style.display = 'none'; return; }

    const ranked = s.ranked || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rewardAmounts = ['5,000P', '2,000P', '500P'];

    section.style.display = 'block';
    content.innerHTML = `
        <div class="group-stats-grid">
            <div class="group-stat-item"><span class="group-stat-num">${s.totalUsers}명</span><span class="group-stat-label">참여 회원</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.newMemberCount || 0}명</span><span class="group-stat-label">🌟 신규</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalComments || 0}개</span><span class="group-stat-label">댓글</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalReactions || 0}개</span><span class="group-stat-label">리액션</span></div>
        </div>
        ${s.bestStreak >= 2 ? `<div class="community-highlight">🔥 연속 기록: <strong>${s.bestStreakName}</strong> ${s.bestStreak}일!</div>` : ''}
        <div class="category-kings">
            ${s.dietKing?.count > 0 ? `<span class="cat-king">🥗 <strong>${s.dietKing.name}</strong> ${s.dietKing.count}일</span>` : ''}
            ${s.exerciseKing?.count > 0 ? `<span class="cat-king">🏃 <strong>${s.exerciseKing.name}</strong> ${s.exerciseKing.count}일</span>` : ''}
            ${s.mindKing?.count > 0 ? `<span class="cat-king">🌙 <strong>${s.mindKing.name}</strong> ${s.mindKing.count}일</span>` : ''}
        </div>
        <div class="mvp-ranking-title">🏆 이번 달 MVP TOP 3</div>
        <div class="mvp-ranking-list">
            ${ranked.map((u, i) => `
                <div class="mvp-ranking-item rank-${i + 1}">
                    <span class="mvp-medal">${medals[i]}</span>
                    <span class="mvp-name">${u.name}</span>
                    <span class="mvp-days">${u.days}일·💬${u.comments}·❤️${u.reactions}</span>
                    <span class="mvp-reward">${rewardAmounts[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="mvp-reward-info">💰 매월 자동 지급 · MVP 점수 = 기록×10 + 댓글×3 + 리액션×1</div>
        ${s.updatedAt?.toDate ? `<div class="community-updated-at">📊 이번 달 집계 · 매시간 업데이트 (${s.updatedAt.toDate().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })})</div>` : ''}
        <div class="community-history-btn-wrap">
            <a href="community-history.html" class="community-history-btn">지난 커뮤니티 현황 보기 →</a>
        </div>
    `;
}

async function renderFriendActivityCard(user, todayStr) {
    const card = document.getElementById('friend-activity-card');
    const list = document.getElementById('friend-activity-list');
    if (!card || !list) return;

    try {
        await loadMyFriendships();
        const friendIds = getActiveFriendIds();
        if (friendIds.length === 0) {
            card.style.display = 'none';
            return;
        }

        const results = await Promise.all(friendIds.map(async fid => {
            const [logSnap, userSnap] = await Promise.all([
                getDoc(doc(db, 'daily_logs', `${fid}_${todayStr}`)),
                getDoc(doc(db, 'users', fid))
            ]);
            const ud = userSnap.exists() ? userSnap.data() : {};
            const name = ud.customDisplayName || ud.displayName || fid.slice(0, 8);
            const streak = ud.currentStreak || 0;
            if (!logSnap.exists()) return { name, streak, diet: false, exercise: false, mind: false };
            const ap = logSnap.data().awardedPoints || {};
            return {
                name,
                streak,
                diet: (ap.dietPoints || 0) > 0,
                exercise: (ap.exercisePoints || 0) > 0,
                mind: (ap.mindPoints || 0) > 0
            };
        }));

        const activeResults = results.filter(r => r.diet || r.exercise || r.mind);
        const completeFriends = activeResults.filter(r => r.diet && r.exercise && r.mind).length;

        if (activeResults.length === 0) {
            list.innerHTML = buildCommunityEmptyState(
                '오늘 활동한 친구가 아직 없어요',
                '먼저 내 기록을 남기거나 갤러리에서 응원하기부터 시작해보세요.',
                ['<button type="button" class="community-empty-btn" onclick="focusGalleryFeed()">✨ 응원하기</button>']
            );
            card.style.display = 'block';
            return;
        }

        list.innerHTML = `
            <div class="friend-activity-summary">
                <span class="friend-activity-pill">🔥 오늘 활동 ${activeResults.length}명</span>
                <span class="friend-activity-pill">✅ 전체 완료 ${completeFriends}명</span>
            </div>
            ${activeResults.map(r => {
            const checks = [
                r.diet ? '<span style="color:#4CAF50;">🥗</span>' : '<span style="opacity:.3;">🥗</span>',
                r.exercise ? '<span style="color:#2196F3;">🏃</span>' : '<span style="opacity:.3;">🏃</span>',
                r.mind ? '<span style="color:#9C27B0;">🌙</span>' : '<span style="opacity:.3;">🌙</span>'
            ].join(' ');
            const streakBadge = r.streak >= 2 ? `<span style="font-size:11px;color:#F57C00;margin-left:6px;">🔥 ${r.streak}일</span>` : '';
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border,#f0f0f0);font-size:13px;">
                <span style="font-weight:600;">${escapeHtml(r.name)}${streakBadge}</span>
                <span>${checks}</span>
            </div>`;
        }).join('')}
        `;

        card.style.display = 'block';
    } catch (e) {
        console.warn('친구 활동 카드 오류:', e.message);
        card.style.display = 'none';
    }
}

// 친구 스트릭 달성 알림 (notifications 컬렉션에서 24시간 이내 미확인 알림 토스트)
async function checkFriendStreakNotifications(uid) {
    try {
        const storageKey = `friendStreakNotifSeen_${uid}`;
        const lastSeen = parseInt(localStorage.getItem(storageKey) || '0');
        const since = new Date(Math.max(lastSeen, Date.now() - 48 * 60 * 60 * 1000)); // 최대 48시간

        const snap = await getDocs(query(
            collection(db, 'notifications'),
            where('postOwnerId', '==', uid),
            where('type', '==', 'friend_streak'),
            orderBy('createdAt', 'desc'),
            limit(5)
        ));

        const newNotifs = [];
        snap.forEach(d => {
            const data = d.data();
            const ts = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
            if (ts > lastSeen) newNotifs.push(data);
        });

        if (newNotifs.length === 0) return;

        // 가장 최근 알림 하나만 토스트로 표시
        const n = newNotifs[0];
        showToast(`🔥 ${n.fromUserName}님이 ${n.streakDays}일 연속 달성했어요!`);
        localStorage.setItem(storageKey, String(Date.now()));
    } catch (e) {
        // 인덱스 없으면 조용히 무시 (비핵심 기능)
        console.warn('친구 스트릭 알림 조회 오류:', e.message);
    }
}

async function renderGroupChallenge() {
    const section = document.getElementById('group-challenge-section');
    const content = document.getElementById('group-challenge-content');
    if (!section || !content) return;

    let s = null;
    try {
        const statsDoc = await getDoc(doc(db, "meta", "communityStats"));
        if (statsDoc.exists()) s = statsDoc.data();
    } catch (_) {}
    if (!s || !s.totalUsers) { section.style.display = 'none'; return; }
    if (!s.totalUsers || s.totalUsers === 0) { section.style.display = 'none'; return; }

    const ranked = s.ranked || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rewardAmounts = ['5,000P', '2,000P', '500P'];

    section.style.display = 'block';
    content.innerHTML = `
        <div class="group-stats-grid">
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalUsers}명</span>
                <span class="group-stat-label">참여 회원</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.newMemberCount || 0}명</span>
                <span class="group-stat-label">🌟 신규</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalComments || 0}개</span>
                <span class="group-stat-label">댓글</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalReactions || 0}개</span>
                <span class="group-stat-label">리액션</span>
            </div>
        </div>
        ${s.bestStreak >= 2 ? `<div class="community-highlight">🔥 연속 기록: <strong>${s.bestStreakName}</strong> ${s.bestStreak}일!</div>` : ''}
        <div class="category-kings">
            ${s.dietKing?.count > 0 ? `<span class="cat-king">🥗 <strong>${s.dietKing.name}</strong> ${s.dietKing.count}일</span>` : ''}
            ${s.exerciseKing?.count > 0 ? `<span class="cat-king">🏃 <strong>${s.exerciseKing.name}</strong> ${s.exerciseKing.count}일</span>` : ''}
            ${s.mindKing?.count > 0 ? `<span class="cat-king">🌙 <strong>${s.mindKing.name}</strong> ${s.mindKing.count}일</span>` : ''}
        </div>
        <div class="mvp-ranking-title">🏆 이번 달 MVP TOP 3</div>
        <div class="mvp-ranking-list">
            ${ranked.map((u, i) => `
                <div class="mvp-ranking-item rank-${i + 1}">
                    <span class="mvp-medal">${medals[i]}</span>
                    <span class="mvp-name">${u.name}</span>
                    <span class="mvp-days">${u.days}일·💬${u.comments}·❤️${u.reactions}</span>
                    <span class="mvp-reward">${rewardAmounts[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="mvp-reward-info">💰 매월 자동 지급 · MVP 점수 = 기록×10 + 댓글×3 + 리액션×1</div>
        ${s.updatedAt?.toDate ? `<div class="community-updated-at">📊 이번 달 집계 · 매시간 업데이트 (${s.updatedAt.toDate().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })})</div>` : ''}
        <div class="community-history-btn-wrap">
            <a href="community-history.html" class="community-history-btn">지난 커뮤니티 현황 보기 →</a>
        </div>
    `;

    // 지난달 MVP 보상 자동 트리거 (매월 1~3일에만 시도)
    const dayOfMonth = today.getUTCDate();
    if (dayOfMonth <= 3 && auth.currentUser) {
        try {
            const prevDate = new Date(today);
            prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
            const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const distributeFn = httpsCallable(functions, 'distributeMonthlyMvpReward');
            const result = await distributeFn({ targetMonth: prevMonth });
            const data = result.data;
            if (data && !data.alreadyDistributed && data.winners?.length > 0) {
                // 현재 사용자가 수상자인지 확인
                const myUid = auth.currentUser.uid;
                const myWin = data.winners.find(w => w.userId === myUid);
                if (myWin) {
                    showToast(`🎉 ${prevMonth} MVP ${myWin.rank}위 달성! ${myWin.reward.toLocaleString()}P가 지급되었습니다!`);
                }
            }
        } catch (e) {
            console.log('MVP reward check:', e.message);
        }
    }
}

// 난이도 선택
window.selectDifficulty = function(cat, diff) {
    const level = parseInt(document.getElementById('user-level-badge').innerText.match(/Lv\. (\d)/)?.[1] || '1');
    const levelData = MISSIONS[level] || MISSIONS[1];
    const m = levelData[cat]?.[diff];
    if (!m) return;

    document.querySelectorAll(`.mission-difficulty-tabs[data-category="${cat}"] .diff-tab`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === diff);
    });

    // 미션 텍스트 업데이트
    const label = document.getElementById(`label_preset_${cat}`);
    if (label) label.textContent = `${m.text} · ${m.target}일`;
};

// 커스텀 미션 목록 (임시 저장)
let pendingCustomMissions = [];
let _customMissionComposerOpen = false;

window.toggleCustomMissionComposer = function() {
    _customMissionComposerOpen = !_customMissionComposerOpen;
    renderDashboard();
};

window.addCustomMission = function() {
    const text = document.getElementById('custom-mission-text')?.value?.trim();
    const type = document.getElementById('custom-mission-type')?.value;
    const target = parseInt(document.getElementById('custom-mission-target')?.value || '3');

    if (!text) { showToast('미션 내용을 입력해주세요.'); return; }
    if (text.length > 30) { showToast('미션은 30자 이내로 입력해주세요.'); return; }
    if (pendingCustomMissions.length >= 5) { showToast('커스텀 미션은 최대 5개까지 추가할 수 있습니다.'); return; }

    const typeEmoji = { diet: '🥗', exercise: '🏃', mind: '🧘' };
    const mission = {
        id: 'custom_' + Date.now(),
        text: `${typeEmoji[type] || ''} ${text}`,
        target: target,
        type: type,
        isCustom: true
    };

    pendingCustomMissions.push(mission);
    _customMissionComposerOpen = true;
    renderPendingCustomMissions();
    document.getElementById('custom-mission-text').value = '';
};

window.removeCustomMission = function(id) {
    pendingCustomMissions = pendingCustomMissions.filter(m => m.id !== id);
    if (pendingCustomMissions.length === 0) _customMissionComposerOpen = false;
    renderPendingCustomMissions();
};

function renderPendingCustomMissions() {
    const list = document.getElementById('custom-missions-list');
    if (!list) return;
    list.innerHTML = pendingCustomMissions.map(m => `
        <div class="custom-mission-item">
            <span>${m.text} (${m.target}일)</span>
            <button class="remove-custom-btn" onclick="removeCustomMission('${m.id}')">×</button>
        </div>
    `).join('');
}

// 주간 아카이브 및 리셋
async function archiveWeekAndReset(uid, weeklyData, history, currentStreak, weekStrs) {
    const q = query(
        collection(db, "daily_logs"),
        where("userId", "==", uid),
        where("date", ">=", weekStrs[0]),
        where("date", "<=", weekStrs[6])
    );
    const snapshot = await getDocs(q);
    let statDiet = 0, statExer = 0, statMind = 0;

    snapshot.forEach(d => {
        const data = d.data();
        if (data.awardedPoints?.diet) statDiet++;
        if (data.awardedPoints?.exercise) statExer++;
        if (data.awardedPoints?.mind) statMind++;
    });

    // 달성률 계산
    let totalTarget = 0, totalAchieved = 0;
    if (weeklyData.missions) {
        weeklyData.missions.forEach(m => {
            totalTarget += m.target;
            let val = m.type === 'diet' ? statDiet : m.type === 'exercise' ? statExer : statMind;
            totalAchieved += Math.min(val, m.target);
        });
    }
    const completionRate = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    // 스트릭 업데이트
    const newStreak = completionRate >= 80 ? currentStreak + 1 : 0;

    // 히스토리에 추가 (최대 12주 보관)
    const archiveEntry = {
        weekId: weeklyData.weekId,
        missions: weeklyData.missions,
        stats: { diet: statDiet, exercise: statExer, mind: statMind },
        completionRate: completionRate
    };
    const newHistory = [...history, archiveEntry].slice(-12);

    // 배지 체크
    let newBadges = [];
    if (completionRate >= 100) newBadges.push('weekComplete');
    if (newStreak >= 3) newBadges.push('mStreak3');
    if (newStreak >= 5) newBadges.push('mStreak5');
    if (newStreak >= 10) newBadges.push('mStreak10');
    const hasHard = weeklyData.missions?.some(m => m.difficulty === 'hard');
    if (hasHard && completionRate >= 100) newBadges.push('hardMode');
    const hasDiet = weeklyData.missions?.some(m => m.type === 'diet');
    const hasExer = weeklyData.missions?.some(m => m.type === 'exercise');
    const hasMind = weeklyData.missions?.some(m => m.type === 'mind');
    if (hasDiet && hasExer && hasMind && completionRate >= 100) newBadges.push('allCategories');
    const hasCustom = weeklyData.missions?.some(m => m.isCustom);
    if (hasCustom && completionRate >= 80) newBadges.push('customMaster');

    // Firestore 업데이트 — setDoc 직전에 최신 상태를 읽어 race condition 방지
    // (archiveWeekAndReset이 daily_logs 쿼리 중 saveWeeklyMissions가 먼저 완료되는 케이스)
    const userRef = doc(db, "users", uid);
    const userDoc = await getDoc(userRef);
    const existingData = userDoc.exists() ? userDoc.data() : {};

    // setDoc 직전 최신 주차 ID를 다시 확인 (race condition 방지)
    const freshDoc = await getDoc(userRef);
    const freshMissionWeekId = freshDoc.exists() ? freshDoc.data()?.weeklyMissionData?.weekId : null;
    // 이미 새 주차 미션이 저장된 경우 null로 덮어쓰지 않음
    const shouldNullMissions = freshMissionWeekId === weeklyData.weekId;

    const updateData = {
        ...(shouldNullMissions ? { weeklyMissionData: deleteField(), selectedMissions: deleteField() } : {}),
        missionHistory: newHistory,
        missionStreak: newStreak
    };

    // 새 배지 추가
    if (newBadges.length > 0) {
        const existingBadges = existingData.missionBadges || [];
        const allBadges = [...new Set([...existingBadges, ...newBadges])];
        updateData.missionBadges = allBadges;
    }

    await setDoc(doc(db, "users", uid), updateData, { merge: true });
}

// 주간 미션 저장
async function saveWeeklyMissions() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const { todayStr } = getDatesInfo();
        const currentWeekId = getWeekId(todayStr);
        const level = parseInt(document.getElementById('user-level-badge').innerText.match(/Lv\. (\d)/)?.[1] || '1');
        const levelData = MISSIONS[level] || MISSIONS[1];

        let missions = [];

        // 프리셋 미션 수집
        ['diet', 'exercise', 'mind'].forEach(cat => {
            const checkbox = document.getElementById(`chk_preset_${cat}`);
            if (checkbox && checkbox.checked) {
                // 선택된 난이도 찾기
                const activeTab = document.querySelector(`.mission-difficulty-tabs[data-category="${cat}"] .diff-tab.active`);
                const diff = activeTab ? activeTab.dataset.diff : 'normal';
                const m = levelData[cat]?.[diff];
                if (m) {
                    missions.push({
                        id: m.id,
                        text: m.text,
                        target: m.target,
                        type: cat,
                        difficulty: diff,
                        isCustom: false
                    });
                }
            }
        });

        // 커스텀 미션 추가
        missions = missions.concat(pendingCustomMissions);

        if (missions.length === 0) {
            alert("최소 1개 이상의 미션을 선택해주세요.");
            return;
        }

        // 첫 미션 배지 체크
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        let existingBadges = [];
        if (userDoc.exists() && userDoc.data().missionBadges) {
            existingBadges = userDoc.data().missionBadges;
        }
        if (!existingBadges.includes('firstMission')) {
            existingBadges = [...existingBadges, 'firstMission'];
        }

        await setDoc(userRef, {
            weeklyMissionData: {
                weekId: currentWeekId,
                missions: missions
            },
            missionBadges: existingBadges,
            missionLevelUpDate: deleteField()
        }, { merge: true });

        pendingCustomMissions = [];
        _customMissionComposerOpen = false;
        showToast("🎯 이번 주 미션이 시작되었습니다! 화이팅!");
        if (window._invalidateDashboardCache) window._invalidateDashboardCache();
        renderDashboard();
    } catch (error) {
        console.error('미션 저장 오류:', error);
        showToast('⚠️ 미션 저장에 실패했습니다.');
    }
}

window.saveWeeklyMissions = saveWeeklyMissions;

// 미션 재설정
window.resetWeeklyMissions = async function() {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm('이번 주 미션을 재설정하시겠습니까?\n진행 중인 기록은 유지됩니다.')) return;

    try {
        await setDoc(doc(db, "users", user.uid), {
            weeklyMissionData: deleteField(),
            selectedMissions: deleteField()
        }, { merge: true });
    } catch (error) {
        console.error('미션 리셋 오류:', error);
        showToast('⚠️ 미션 리셋에 실패했습니다.');
        return;
    }

    pendingCustomMissions = [];
    _customMissionComposerOpen = false;
    if (window._invalidateDashboardCache) window._invalidateDashboardCache();

    try {
        if (window._applyWeeklyMissionResetToDashboard) window._applyWeeklyMissionResetToDashboard(user.uid);
        await renderDashboard();
    } catch (uiError) {
        console.warn('미션 리셋 후 화면 갱신 오류:', uiError);
    }

    showToast("🔄 미션이 초기화되었습니다. 다시 설정해주세요!");
};

/* 다크모드 토글 */
window.toggleDarkMode = function () {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    const btn = document.getElementById('dark-mode-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#17151A' : '#FFFFFF');
};

/* 페이지 로드 시 다크모드 복원 */
(function initDarkMode() {
    if (localStorage.getItem('darkMode') === 'on') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('dark-mode-toggle');
        if (btn) btn.textContent = '☀️';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', '#17151A');
    }
})();

window.levelUp = async function (newLevel) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const { todayStr } = getDatesInfo();
        await setDoc(doc(db, "users", user.uid), {
            missionLevel: newLevel,
            weeklyMissionData: deleteField(),
            selectedMissions: deleteField(),
            missionLevelUpDate: todayStr
        }, { merge: true });
        pendingCustomMissions = [];
        _customMissionComposerOpen = false;
        if (window._applyMissionLevelUpToDashboard) window._applyMissionLevelUpToDashboard(user.uid, newLevel, todayStr);
        document.getElementById('level-modal').style.display = 'none';
        await renderDashboard();
        document.getElementById('mission-selection-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        showToast(`🎉 레벨 ${newLevel} (${MISSIONS[newLevel]?.name || ''}) 승급 완료! 내일 새 미션을 고를 수 있어요.`);
    } catch (error) {
        console.error('레벨업 오류:', error);
        showToast('⚠️ 레벨업에 실패했습니다.');
    }
};

// compressImage, uploadFileAndGetUrl 등은 상단에서 직접 import

// ========== 30일 종합 결과지 ==========
window.generate30DayReport = async function () {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const modal = document.getElementById('report-modal');
    modal.style.display = 'flex';
    document.getElementById('report-user-name').textContent = getUserDisplayName();
    document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#999;">📊 30일간의 기록을 분석 중...</p>';

    try {
        const q = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(30));
        const snapshot = await getDocs(q);
        let logs = [];
        snapshot.forEach(d => logs.push(d.data()));
        logs.reverse(); // oldest first

        if (logs.length < 2) {
            document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#999;">최소 2일 이상의 기록이 있어야 결과지를 생성할 수 있습니다.</p>';
            document.getElementById('report-period').textContent = '';
            return;
        }

        const startDate = logs[0].date;
        const endDate = logs[logs.length - 1].date;
        document.getElementById('report-period').textContent = `${startDate.replace(/-/g, '.')} ~ ${endDate.replace(/-/g, '.')} (${logs.length}일)`;

        // ===== 통계 계산 =====
        let totalDiet = 0, totalExer = 0, totalMind = 0, totalPoints = 0;
        let dietPhotos = 0, cardioCount = 0, strengthCount = 0, meditationCount = 0, gratitudeCount = 0;
        let weights = [], glucoses = [], bpSys = [], bpDia = [];
        let dailyDietPts = [], dailyExerPts = [], dailyMindPts = [], dailyTotalPts = [];
        let dietDays = 0, exerDays = 0, mindDays = 0;
        let streak = 0, maxStreak = 0, currentStreak = 0;

        logs.forEach((log, idx) => {
            const ap = log.awardedPoints || {};
            const dp = ap.dietPoints || (ap.diet ? 10 : 0);
            const ep = ap.exercisePoints || (ap.exercise ? 15 : 0);
            const mp = ap.mindPoints || (ap.mind ? 5 : 0);
            const dayTotal = dp + ep + mp;

            totalDiet += dp; totalExer += ep; totalMind += mp; totalPoints += dayTotal;
            dailyDietPts.push(dp); dailyExerPts.push(ep); dailyMindPts.push(mp); dailyTotalPts.push(dayTotal);

            if (ap.diet || dp > 0) dietDays++;
            if (ap.exercise || ep > 0) exerDays++;
            if (ap.mind || mp > 0) mindDays++;

            // 식단 사진 수
            if (log.diet) {
                ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl'].forEach(k => { if (log.diet[k]) dietPhotos++; });
            }
            // 운동 횟수
            if (log.exercise) {
                cardioCount += (log.exercise.cardioList?.length || (log.exercise.cardioImageUrl ? 1 : 0));
                strengthCount += (log.exercise.strengthList?.length || (log.exercise.strengthVideoUrl ? 1 : 0));
            }
            // 마음
            if (log.sleepAndMind?.meditationDone) meditationCount++;
            if (log.sleepAndMind?.gratitude) gratitudeCount++;

            // 체중·혈당·혈압
            if (log.metrics) {
                if (log.metrics.weight) weights.push({ date: log.date, v: parseFloat(log.metrics.weight) });
                if (log.metrics.glucose) glucoses.push({ date: log.date, v: parseFloat(log.metrics.glucose) });
                if (log.metrics.bpSystolic) bpSys.push({ date: log.date, v: parseFloat(log.metrics.bpSystolic) });
                if (log.metrics.bpDiastolic) bpDia.push({ date: log.date, v: parseFloat(log.metrics.bpDiastolic) });
            }

            // 연속 기록
            if (dayTotal > 0) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
            else currentStreak = 0;
        });

        const avgDailyPts = logs.length > 0 ? Math.round(totalPoints / logs.length) : 0;
        const participationRate = Math.round((logs.filter(l => {
            const ap = l.awardedPoints || {};
            return ap.diet || ap.exercise || ap.mind || (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0) > 0;
        }).length / logs.length) * 100);

        // 날짜 레이블 (축약)
        const dateLabels = logs.map(l => l.date.substring(5).replace('-', '/'));

        // ===== HTML 렌더 =====
        let html = '';

        // — 요약 카드 —
        html += `<div class="report-section">
            <div class="report-section-title">📋 종합 요약</div>
            <div class="report-summary-grid">
                <div class="report-stat-card"><div class="report-stat-value">${totalPoints}P</div><div class="report-stat-label">총 획득 포인트</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${avgDailyPts}P</div><div class="report-stat-label">일 평균</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${participationRate}%</div><div class="report-stat-label">참여율</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${maxStreak}일</div><div class="report-stat-label">최대 연속</div></div>
            </div>
        </div>`;

        // — 카테고리별 기록 —
        html += `<div class="report-section">
            <div class="report-section-title">📊 카테고리별 분석</div>
            <div class="report-category-grid">
                <div class="report-cat-card diet">
                    <div class="report-cat-emoji">🥗</div>
                    <div class="report-cat-name">식단</div>
                    <div class="report-cat-stat">${dietDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">📷 사진 ${dietPhotos}장 · ${totalDiet}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(dietDays / logs.length * 100)}%; background:#4CAF50;"></div></div>
                </div>
                <div class="report-cat-card exercise">
                    <div class="report-cat-emoji">🏃</div>
                    <div class="report-cat-name">운동</div>
                    <div class="report-cat-stat">${exerDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🏋️ 유산소 ${cardioCount}회 · 근력 ${strengthCount}회 · ${totalExer}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(exerDays / logs.length * 100)}%; background:#2196F3;"></div></div>
                </div>
                <div class="report-cat-card mind">
                    <div class="report-cat-emoji">🧘</div>
                    <div class="report-cat-name">마음</div>
                    <div class="report-cat-stat">${mindDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🧘 명상 ${meditationCount}회 · 감사 일기 ${gratitudeCount}회 · ${totalMind}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(mindDays / logs.length * 100)}%; background:#9C27B0;"></div></div>
                </div>
            </div>
        </div>`;

        // — 일별 포인트 그래프 —
        html += `<div class="report-section">
            <div class="report-section-title">📈 일별 포인트 추이</div>
            <canvas id="report-chart-points" class="report-canvas"></canvas>
        </div>`;

        // — 카테고리별 일별 그래프 —
        html += `<div class="report-section">
            <div class="report-section-title">📉 카테고리별 일별 추이</div>
            <canvas id="report-chart-categories" class="report-canvas"></canvas>
        </div>`;

        // — 건강 지표 그래프 (데이터 있을 때만) —
        if (weights.length >= 2 || glucoses.length >= 2 || bpSys.length >= 2) {
            html += `<div class="report-section">
                <div class="report-section-title">🏥 건강 지표 변화</div>`;
            if (weights.length >= 2) {
                const wFirst = weights[0].v, wLast = weights[weights.length - 1].v;
                const wDiff = (wLast - wFirst).toFixed(1);
                const wSign = wDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">⚖️ 체중: ${wFirst}kg → ${wLast}kg <span class="report-metric-diff ${wDiff < 0 ? 'good' : wDiff > 0 ? 'warn' : ''}">(${wSign}${wDiff}kg)</span></div>`;
            }
            if (glucoses.length >= 2) {
                const gFirst = glucoses[0].v, gLast = glucoses[glucoses.length - 1].v;
                const gDiff = Math.round(gLast - gFirst);
                const gSign = gDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">🩸 혈당: ${gFirst} → ${gLast}mg/dL <span class="report-metric-diff ${gDiff < 0 ? 'good' : gDiff > 0 ? 'warn' : ''}">(${gSign}${gDiff})</span></div>`;
            }
            if (bpSys.length >= 2) {
                const sFirst = bpSys[0].v, sLast = bpSys[bpSys.length - 1].v;
                const sDiff = Math.round(sLast - sFirst);
                const sSign = sDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">💓 혈압(수축): ${sFirst} → ${sLast}mmHg <span class="report-metric-diff ${sDiff < 0 ? 'good' : sDiff > 0 ? 'warn' : ''}">(${sSign}${sDiff})</span></div>`;
            }
            html += `<canvas id="report-chart-health" class="report-canvas"></canvas></div>`;
        }

        // — 일별 기록 캘린더 히트맵 —
        html += `<div class="report-section">
            <div class="report-section-title">🗓️ 일별 기록 히트맵</div>
            <div class="report-heatmap" id="report-heatmap"></div>
            <div class="report-heatmap-legend">
                <span class="hm-legend-item"><span class="hm-box" style="background:#eee;"></span>미기록</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FFE0B2;"></span>1~20P</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FFB74D;"></span>21~50P</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FF8C00;"></span>51~80P</span>
            </div>
        </div>`;

        document.getElementById('report-body').innerHTML = html;

        // ===== 히트맵 렌더 =====
        const heatmapEl = document.getElementById('report-heatmap');
        logs.forEach((log, idx) => {
            const ap = log.awardedPoints || {};
            const pts = (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0) || ((ap.diet ? 10 : 0) + (ap.exercise ? 15 : 0) + (ap.mind ? 5 : 0));
            let color = '#eee';
            if (pts > 50) color = '#FF8C00';
            else if (pts > 20) color = '#FFB74D';
            else if (pts > 0) color = '#FFE0B2';
            const dayLabel = log.date.substring(8);
            heatmapEl.innerHTML += `<div class="hm-cell" style="background:${color};" title="${log.date}: ${pts}P">${dayLabel}</div>`;
        });

        // ===== 캔버스 그래프 렌더 =====
        // 일별 포인트 스택 바 차트
        drawReportBarChart('report-chart-points', dateLabels, [
            { data: dailyDietPts, color: '#4CAF50', label: '식단' },
            { data: dailyExerPts, color: '#2196F3', label: '운동' },
            { data: dailyMindPts, color: '#9C27B0', label: '마음' }
        ], '포인트(P)');

        // 카테고리별 라인 차트
        drawReportLineChart('report-chart-categories', dateLabels, [
            { data: dailyDietPts, color: '#4CAF50', label: '식단' },
            { data: dailyExerPts, color: '#2196F3', label: '운동' },
            { data: dailyMindPts, color: '#9C27B0', label: '마음' }
        ]);

        // 건강 지표 차트
        if (document.getElementById('report-chart-health')) {
            let healthLines = [];
            if (weights.length >= 2) healthLines.push({ data: weights.map(w => w.v), dates: weights.map(w => w.date.substring(5).replace('-', '/')), color: '#FF6F00', label: '체중(kg)' });
            if (glucoses.length >= 2) healthLines.push({ data: glucoses.map(g => g.v), dates: glucoses.map(g => g.date.substring(5).replace('-', '/')), color: '#E53935', label: '혈당' });
            if (bpSys.length >= 2) healthLines.push({ data: bpSys.map(s => s.v), dates: bpSys.map(s => s.date.substring(5).replace('-', '/')), color: '#D32F2F', label: '수축기' });
            if (bpDia.length >= 2) healthLines.push({ data: bpDia.map(d => d.v), dates: bpDia.map(d => d.date.substring(5).replace('-', '/')), color: '#1976D2', label: '이완기' });
            drawReportHealthChart('report-chart-health', healthLines);
        }

    } catch (e) {
        console.error('30일 결과지 오류:', e);
        document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#e74c3c;">⚠️ 결과지 생성 중 오류가 발생했습니다.</p>';
    }
};

// 스택 바 차트 그리기
function drawReportBarChart(canvasId, labels, datasets, yLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 35, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const n = labels.length;
    const barW = Math.max(4, Math.min(16, chartW / n - 2));

    // Y max
    let maxY = 0;
    for (let i = 0; i < n; i++) { let sum = 0; datasets.forEach(ds => sum += (ds.data[i] || 0)); maxY = Math.max(maxY, sum); }
    maxY = Math.ceil(maxY / 10) * 10 || 80;

    ctx.clearRect(0, 0, w, h);

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxY * i / 4), pad.left - 4, y + 3);
    }

    // 바
    for (let i = 0; i < n; i++) {
        const x = pad.left + (chartW / n) * i + (chartW / n - barW) / 2;
        let offsetY = 0;
        datasets.forEach(ds => {
            const val = ds.data[i] || 0;
            const barH = (val / maxY) * chartH;
            ctx.fillStyle = ds.color;
            ctx.fillRect(x, pad.top + chartH - offsetY - barH, barW, barH);
            offsetY += barH;
        });
        // X 레이블 (간격 조절)
        if (n <= 15 || i % Math.ceil(n / 10) === 0) {
            ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.save(); ctx.translate(x + barW / 2, h - 3); ctx.rotate(-0.5);
            ctx.fillText(labels[i], 0, 0); ctx.restore();
        }
    }

    // 범례
    let lx = pad.left;
    datasets.forEach(ds => {
        ctx.fillStyle = ds.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(ds.label, lx + 13, 13); lx += ctx.measureText(ds.label).width + 26;
    });
}

// 라인 차트 그리기
function drawReportLineChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 35, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const n = labels.length;

    let maxY = 0;
    datasets.forEach(ds => ds.data.forEach(v => { if (v > maxY) maxY = v; }));
    maxY = Math.ceil(maxY / 10) * 10 || 30;

    ctx.clearRect(0, 0, w, h);

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxY * i / 4), pad.left - 4, y + 3);
    }

    // 라인
    datasets.forEach(ds => {
        ctx.strokeStyle = ds.color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            const y = pad.top + chartH - ((ds.data[i] || 0) / maxY) * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // 점
        for (let i = 0; i < n; i++) {
            if (n <= 15 || i % Math.ceil(n / 8) === 0 || i === n - 1) {
                const x = pad.left + (chartW / (n - 1 || 1)) * i;
                const y = pad.top + chartH - ((ds.data[i] || 0) / maxY) * chartH;
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = ds.color; ctx.fill();
            }
        }
    });

    // X 레이블
    for (let i = 0; i < n; i++) {
        if (n <= 15 || i % Math.ceil(n / 10) === 0) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.save(); ctx.translate(x, h - 3); ctx.rotate(-0.5);
            ctx.fillText(labels[i], 0, 0); ctx.restore();
        }
    }

    // 범례
    let lx = pad.left;
    datasets.forEach(ds => {
        ctx.fillStyle = ds.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(ds.label, lx + 13, 13); lx += ctx.measureText(ds.label).width + 26;
    });
}

// 건강 지표 멀티 라인 차트 (각 데이터셋은 독립 X축)
function drawReportHealthChart(canvasId, healthLines) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 30, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // 각 라인 독립 스케일로 0~1 정규화
    healthLines.forEach(line => {
        const minV = Math.min(...line.data);
        const maxV = Math.max(...line.data);
        const range = maxV - minV || 1;
        line.normalized = line.data.map(v => (v - minV + range * 0.05) / (range * 1.1));
        line.minV = minV; line.maxV = maxV;
    });

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // 라인
    healthLines.forEach(line => {
        const n = line.data.length;
        ctx.strokeStyle = line.color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            const y = pad.top + chartH - line.normalized[i] * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 시작·끝 값 표시
        const xStart = pad.left;
        const yStart = pad.top + chartH - line.normalized[0] * chartH;
        const xEnd = pad.left + chartW;
        const yEnd = pad.top + chartH - line.normalized[n - 1] * chartH;
        ctx.fillStyle = line.color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(line.data[0], xStart + 3, yStart - 5);
        ctx.textAlign = 'right';
        ctx.fillText(line.data[n - 1], xEnd - 3, yEnd - 5);
    });

    // 범례
    let lx = pad.left;
    healthLines.forEach(line => {
        ctx.fillStyle = line.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(line.label, lx + 13, 13); lx += ctx.measureText(line.label).width + 26;
    });
}

// ========== 공복 지표 추이 그래프 ==========
let fastingGraphData = [];
let currentFastingMetric = 'weight';

window.switchFastingGraph = function (metric, btnEl) {
    currentFastingMetric = metric;
    document.querySelectorAll('#fasting-graph-card .filter-chip').forEach(el => el.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    drawFastingChart();
};

async function loadFastingGraphData(userId) {
    try {
        const q = query(collection(db, "daily_logs"), where("userId", "==", userId), orderBy("date", "desc"), limit(30));
        const snapshot = await getDocs(q);
        fastingGraphData = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.metrics && (data.metrics.weight || data.metrics.glucose || data.metrics.bpSystolic)) {
                fastingGraphData.push({
                    date: data.date,
                    weight: parseFloat(data.metrics.weight) || null,
                    glucose: parseFloat(data.metrics.glucose) || null,
                    bpSystolic: parseFloat(data.metrics.bpSystolic) || null,
                    bpDiastolic: parseFloat(data.metrics.bpDiastolic) || null
                });
            }
        });
        fastingGraphData.reverse(); // oldest first

        const card = document.getElementById('fasting-graph-card');
        if (fastingGraphData.length >= 2 && card) {
            card.style.display = 'block';
            drawFastingChart();
        } else if (card) {
            card.style.display = 'none';
        }
    } catch (e) {
        console.warn('⚠️ 공복 지표 로드 스킵:', e.message);
    }
}

function drawFastingChart() {
    const canvas = document.getElementById('fasting-chart');
    if (!canvas || fastingGraphData.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 340;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // 데이터 준비
    let lines = [];
    let legend = '';
    if (currentFastingMetric === 'weight') {
        const pts = fastingGraphData.filter(d => d.weight !== null);
        if (pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.weight })), color: '#FF6F00', label: '체중(kg)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length - 1].weight}kg` : '데이터 부족';
    } else if (currentFastingMetric === 'glucose') {
        const pts = fastingGraphData.filter(d => d.glucose !== null);
        if (pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.glucose })), color: '#E53935', label: '혈당(mg/dL)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length - 1].glucose}mg/dL` : '데이터 부족';
    } else if (currentFastingMetric === 'bp') {
        const spts = fastingGraphData.filter(d => d.bpSystolic !== null);
        const dpts = fastingGraphData.filter(d => d.bpDiastolic !== null);
        if (spts.length >= 2) lines.push({ data: spts.map(d => ({ x: d.date, y: d.bpSystolic })), color: '#D32F2F', label: '수축기' });
        if (dpts.length >= 2) lines.push({ data: dpts.map(d => ({ x: d.date, y: d.bpDiastolic })), color: '#1976D2', label: '이완기' });
        legend = spts.length >= 2 ? `최근: ${spts[spts.length - 1].bpSystolic}/${dpts.length > 0 ? dpts[dpts.length - 1].bpDiastolic : '?'}mmHg` : '데이터 부족';
    }

    document.getElementById('fasting-chart-legend').textContent = legend;

    if (lines.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('기록이 2개 이상 필요합니다', w / 2, h / 2);
        return;
    }

    // Y 범위 계산
    let allY = [];
    lines.forEach(l => l.data.forEach(p => allY.push(p.y)));
    let minY = Math.min(...allY);
    let maxY = Math.max(...allY);
    const yRange = maxY - minY || 1;
    minY -= yRange * 0.1;
    maxY += yRange * 0.1;

    // 배경 그리드
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        const val = maxY - ((maxY - minY) / 4) * i;
        ctx.fillText(val.toFixed(1), pad.left - 4, y + 3);
    }

    // 라인 그리기
    lines.forEach(line => {
        const pts = line.data;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.left + (i / (pts.length - 1)) * chartW;
            const y = pad.top + ((maxY - p.y) / (maxY - minY)) * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 점 그리기
        pts.forEach((p, i) => {
            const x = pad.left + (i / (pts.length - 1)) * chartW;
            const y = pad.top + ((maxY - p.y) / (maxY - minY)) * chartH;
            ctx.fillStyle = line.color;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
    });

    // X축 날짜 라벨 (처음, 중간, 마지막)
    const totalPts = lines[0].data.length;
    const labelIndices = totalPts <= 5 ? [...Array(totalPts).keys()] : [0, Math.floor(totalPts / 2), totalPts - 1];
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    labelIndices.forEach(i => {
        const x = pad.left + (i / (totalPts - 1)) * chartW;
        const dateStr = lines[0].data[i].x.substring(5).replace('-', '/');
        ctx.fillText(dateStr, x, h - 8);
    });
}

async function uploadFileAndGetUrl(file, folderName, userId) {
    if (!file) return null;

    if (!isValidFileType(file)) {
        showToast('⚠️ 지원하지 않는 파일 형식입니다. (이미지 또는 동영상만 가능)');
        return null;
    }

    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
        fileToUpload = await compressImage(file);
    }

    // 이미지는 20MB, 동영상은 100MB 제한 (firebase-config 상수 사용)
    const isVideo = fileToUpload.type && fileToUpload.type.startsWith('video/');
    const maxBytes = isVideo ? MAX_VID_SIZE : MAX_IMG_SIZE;
    const maxLabel = isVideo ? '100' : '20';
    const fileSizeMB = fileToUpload.size / (1024 * 1024);
    if (fileToUpload.size > maxBytes) {
        showToast(`⚠️ 파일이 너무 큽니다. (최대 ${maxLabel}MB, 현재 ${fileSizeMB.toFixed(1)}MB)`);
        return null;
    }

    const timestamp = Date.now();
    const storagePath = `${folderName}/${userId}/${timestamp}_${fileToUpload.name}`;
    const storageRef = ref(storage, storagePath);
    const maxRetries = 2;
    const timeoutMs = 30000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📤 업로드 시작 (시도 ${attempt + 1}/${maxRetries + 1}):`, storagePath);
            const uploadTask = uploadBytesResumable(storageRef, fileToUpload);
            const uploadPromise = new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                        if (pct > 0 && pct < 100) {
                            const saveBtn = document.getElementById('saveDataBtn');
                            if (saveBtn) saveBtn.innerText = `저장 중... ${pct}%`;
                        }
                    },
                    reject,
                    resolve
                );
            });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => { uploadTask.cancel(); reject(new Error('업로드 시간 초과. 네트워크를 확인해주세요.')); }, timeoutMs)
            );
            await Promise.race([uploadPromise, timeoutPromise]);

            const urlPromise = getDownloadURL(storageRef);
            const urlTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('URL 가져오기 시간 초과')), 10000)
            );
            const url = await Promise.race([urlPromise, urlTimeout]);
            console.log('✅ 업로드 완료:', storagePath);
            return url;
        } catch (error) {
            console.error(`파일 업로드 오류 (시도 ${attempt + 1}):`, error.code || '', error.message);
            if (error.code === 'storage/unauthorized') {
                showToast('⚠️ 업로드 권한이 없습니다.');
                return null;
            }
            if (error.code === 'storage/quota-exceeded') {
                showToast('⚠️ 저장 공간이 부족합니다.');
                return null;
            }
            if (attempt === maxRetries) {
                showToast(`⚠️ 업로드 실패: ${error.message}`);
                return null;
            }
            // 재시도 전 대기 (1초, 2초 exponential backoff)
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    return null;
}

// === 파일 선택 즉시 업로드를 위한 상태 저장소 ===
const _pendingUploads = new Map(); // inputId → { promise, done, result }

// 원본 + 썸네일 업로드 (모듈 레벨 함수 — previewStaticImage에서도 호출 가능)
// 전략: 원본 URL 획득 즉시 resolve → 썸네일은 백그라운드에서 계속 업로드
// _pendingUploads 엔트리의 result.thumbUrl을 나중에 갱신함
function uploadWithThumb(file, folder, userId) {
    if (!file) return Promise.resolve({ url: null, thumbUrl: null });

    // 원본 업로드 Promise → 완료 즉시 resolve
    const originalPromise = uploadFileAndGetUrl(file, folder, userId)
        .then(url => url ? { url, thumbUrl: null } : { url: null, thumbUrl: null })
        .catch(() => ({ url: null, thumbUrl: null }));

    // 썸네일은 원본과 병렬로 생성 + 업로드하되, 결과를 기다리지 않음
    // 원본 성공 시 thumbUrl을 비동기로 갱신
    originalPromise.then(async ({ url }) => {
        if (!url) return;
        try {
            const thumbBlob = await generateThumbnailBlob(file).catch(() => null);
            if (!thumbBlob) return;
            const tp = `${folder}_thumbnails/${userId}/${Date.now()}_thumb.jpg`;
            const tr = ref(storage, tp);
            const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));
            await Promise.race([uploadBytes(tr, thumbBlob), tout(15000)]);
            const thumbUrl = await Promise.race([getDownloadURL(tr), tout(10000)]);
            // _pendingUploads의 result에 thumbUrl 반영 (이미 save 완료된 경우 무시됨)
            for (const [, entry] of _pendingUploads) {
                if (entry.result && entry.result.url === url) {
                    entry.result.thumbUrl = thumbUrl;
                }
            }
        } catch (e) { console.warn('썸네일 백그라운드 업로드 실패:', e.message); }
    });

    return originalPromise;
}

function uploadVideoWithThumb(file, folder, userId, localThumbDataUrl = '') {
    if (!file) return { promise: Promise.resolve({ url: null, thumbUrl: null }), thumbPromise: Promise.resolve(null) };

    const originalPromise = uploadFileAndGetUrl(file, folder, userId)
        .then(url => url ? { url, thumbUrl: null } : { url: null, thumbUrl: null })
        .catch(() => ({ url: null, thumbUrl: null }));

    const thumbPromise = (async () => {
        const { url } = await originalPromise;
        if (!url) return null;
        try {
            let thumbDataUrl = String(localThumbDataUrl || '').trim();
            if (!thumbDataUrl.startsWith('data:image/')) {
                thumbDataUrl = await extractVideoThumbFromFile(file).catch(() => '');
            }

            let thumbUrl = null;
            if (thumbDataUrl.startsWith('data:image/')) {
                thumbUrl = await uploadDataUrlThumbnail(thumbDataUrl, folder, userId);
            }

            if (!thumbUrl) {
                const thumbBlob = await generateVideoThumbnailBlob(file).catch(() => null);
                if (thumbBlob) {
                    const tp = `${folder}_thumbnails/${userId}/${Date.now()}_thumb.jpg`;
                    const tr = ref(storage, tp);
                    const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));
                    await Promise.race([uploadBytes(tr, thumbBlob), tout(15000)]);
                    thumbUrl = await Promise.race([getDownloadURL(tr), tout(10000)]);
                }
            }

            if (thumbUrl) {
                for (const [, entry] of _pendingUploads) {
                    if (entry.result && entry.result.url === url) {
                        entry.result.thumbUrl = thumbUrl;
                    }
                }
            }
            return thumbUrl || null;
        } catch (e) {
            console.warn('영상 썸네일 백그라운드 업로드 실패:', e.message);
            return null;
        }
    })();

    return { promise: originalPromise, thumbPromise };
}

async function uploadDataUrlThumbnail(dataUrl, folder, userId) {
    const normalized = String(dataUrl || '').trim();
    if (!normalized.startsWith('data:image/')) return null;
    try {
        const response = await fetch(normalized);
        const blob = await response.blob();
        if (!blob || !blob.size) return null;
        const tp = `${folder}_thumbnails/${userId}/${Date.now()}_local_thumb.jpg`;
        const tr = ref(storage, tp);
        const tout = ms => new Promise((_, r) => setTimeout(() => r(new Error('timeout')), ms));
        await Promise.race([uploadBytes(tr, blob, { contentType: 'image/jpeg' }), tout(15000)]);
        return await Promise.race([getDownloadURL(tr), tout(10000)]);
    } catch (e) {
        console.warn('로컬 썸네일 업로드 실패:', e.message);
        return null;
    }
}

async function resolvePendingUploadResult(inputId) {
    if (!inputId) return null;
    const entry = _pendingUploads.get(inputId);
    if (!entry) return null;

    try {
        if (!entry.done || !entry.result) {
            entry.result = await entry.promise;
            entry.done = true;
        }
        if (entry.result?.url && !entry.result.thumbUrl && entry.thumbPromise) {
            const pendingThumb = await Promise.race([
                entry.thumbPromise.catch(() => null),
                new Promise(resolve => setTimeout(() => resolve(null), 5000))
            ]);
            if (pendingThumb) entry.result.thumbUrl = pendingThumb;
        }
        return entry.result?.url ? entry.result : null;
    } catch (_) {
        return null;
    }
}

function persistSavedPreview(inputId, previewEl, url, thumbUrl) {
    const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    if (input?.id) _pendingUploads.delete(input.id);
    if (input) input.value = '';
    if (!previewEl) return;

    if (url) {
        previewEl.setAttribute('data-saved-url', url);
        if (thumbUrl) previewEl.setAttribute('data-saved-thumb-url', thumbUrl);
        else previewEl.removeAttribute('data-saved-thumb-url');
        previewEl.removeAttribute('data-user-removed');
    } else {
        previewEl.removeAttribute('data-saved-url');
        previewEl.removeAttribute('data-saved-thumb-url');
    }
}

function persistSavedExerciseBlock(block, url, thumbUrl) {
    if (!block) return;
    const input = block.querySelector('.exer-file');
    if (input?.id) _pendingUploads.delete(input.id);
    if (input) input.value = '';

    if (url) block.setAttribute('data-url', url);
    else block.removeAttribute('data-url');

    if (thumbUrl) block.setAttribute('data-thumb-url', thumbUrl);
    else block.removeAttribute('data-thumb-url');

    const previewImg = block.querySelector('.preview-strength-img');
    if (previewImg && thumbUrl && isPersistedStorageUrl(thumbUrl)) {
        previewImg.src = thumbUrl;
        previewImg.setAttribute('data-saved-thumb-url', thumbUrl);
    }
}

document.getElementById('saveDataBtn').addEventListener('click', () => {
    const saveBtn = document.getElementById('saveDataBtn');
    const mode = saveBtn?.dataset.mode || 'save';
    if (mode === 'install') {
        window.handleInstallCtaAction?.();
        return;
    }
    if (mode === 'chat') {
        openCommunityChat();
        return;
    }

    const user = auth.currentUser;
    if (!user) return;
    saveBtn.innerText = "저장 중..."; saveBtn.disabled = true;
    showToast("백그라운드에서 저장 중입니다! 🚀");

    (async () => {
        // Firestore 타임아웃 헬퍼 (서버 응답 대기 상한선)
        const withTimeout = (promise, ms, fallback) =>
            Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);

        let uploadFailures = [];
        try {
            const selectedDateStr = document.getElementById('selected-date').value;
            // 미래 날짜 저장 방지
            const { todayStr: saveToday } = getDatesInfo();
            if (selectedDateStr > saveToday) {
                showToast('⚠️ 미래 날짜에는 저장할 수 없습니다.');
                saveBtn.innerText = "저장"; saveBtn.disabled = false;
                return;
            }
            const docId = `${user.uid}_${selectedDateStr}`;
            // 현재 날짜 로그는 메모리 캐시를 우선 사용해 저장 전 문서 읽기를 최소화
            let oldData = getCachedDailyLog(docId) || { awardedPoints: {} };
            if (!oldData || Object.keys(oldData).length === 0 || !oldData.awardedPoints) {
                oldData = { awardedPoints: {} };
                try {
                    const snap = await withTimeout(getDoc(doc(db, "daily_logs", docId)), 2500, null);
                    if (snap?.exists()) oldData = snap.data();
                } catch (_) {}
            }
            oldData.awardedPoints = oldData.awardedPoints || {};

            // === getUrl + 썸네일을 하나로 합친 헬퍼 (pre-upload 결과 우선 사용) ===
            const getUrlWithThumb = async (id, folder, oldUrl, oldThumbUrl) => {
                const el = document.getElementById(id);
                const previewImg = el?.parentElement?.querySelector('.preview-img');
                const hasVisiblePreview = !!previewImg && previewImg.style.display !== 'none';

                const pendingResult = await resolvePendingUploadResult(id);
                if (hasVisiblePreview && pendingResult?.url) {
                    return pendingResult;
                }

                if (el && el.files[0] && hasVisiblePreview) {
                    // fallback: 지금 업로드
                    try {
                        const result = await uploadWithThumb(el.files[0], folder, user.uid);
                        if (result.url) return result;
                        uploadFailures.push(id);
                        return { url: oldUrl || null, thumbUrl: oldThumbUrl || null };
                    } catch (err) {
                        console.error(`${id} 업로드 실패:`, err);
                        uploadFailures.push(id);
                        return { url: oldUrl || null, thumbUrl: oldThumbUrl || null };
                    }
                }
                if (el) {
                    const previewImg = el.parentElement.querySelector('.preview-img');
                    // 사용자가 명시적으로 삭제한 경우만 null 반환
                    if (previewImg && previewImg.hasAttribute('data-user-removed')) {
                        return { url: null, thumbUrl: null };
                    }
                    // Firebase Storage URL인지 검증 (빈 img.src는 페이지 URL을 반환하므로 반드시 검증 필요)
                    const isStoredUrl = u => isPersistedStorageUrl(u);
                    // 기존 URL 보존: oldData → data-saved-url → previewImg.src 순서로 fallback
                    // (display:none 여부 무관 — clearInputs로 숨겨져도 data-saved-url 유지)
                    const savedUrl = (isStoredUrl(oldUrl) ? oldUrl : null)
                        || (isStoredUrl(previewImg?.getAttribute('data-saved-url')) ? previewImg.getAttribute('data-saved-url') : null)
                        || (isStoredUrl(previewImg?.src) ? previewImg.src : null);
                    const savedThumb = (isStoredUrl(oldThumbUrl) ? oldThumbUrl : null)
                        || (isStoredUrl(previewImg?.getAttribute('data-saved-thumb-url')) ? previewImg.getAttribute('data-saved-thumb-url') : null) || null;
                    return { url: savedUrl || null, thumbUrl: savedThumb };
                }
                return { url: (isPersistedStorageUrl(oldUrl) ? oldUrl : null), thumbUrl: (isPersistedStorageUrl(oldThumbUrl) ? oldThumbUrl : null) };
            };

            // === 모든 업로드를 병렬로 실행 ===
            console.log('📤 모든 이미지 병렬 업로드 시작');
            const uploadStart = Date.now();

            // 1) 식단 4장 병렬
            const dietPromise = Promise.all([
                getUrlWithThumb('diet-img-breakfast', 'diet_images', oldData?.diet?.breakfastUrl, oldData?.diet?.breakfastThumbUrl),
                getUrlWithThumb('diet-img-lunch', 'diet_images', oldData?.diet?.lunchUrl, oldData?.diet?.lunchThumbUrl),
                getUrlWithThumb('diet-img-dinner', 'diet_images', oldData?.diet?.dinnerUrl, oldData?.diet?.dinnerThumbUrl),
                getUrlWithThumb('diet-img-snack', 'diet_images', oldData?.diet?.snackUrl, oldData?.diet?.snackThumbUrl),
            ]);

            // 2) 운동 사진 병렬
            const cardioBlocks = document.querySelectorAll('.cardio-block');
            const cardioPromise = Promise.all([...cardioBlocks].map(async (block) => {
                const fileInput = block.querySelector('.exer-file');
                let url = block.getAttribute('data-url') || null;
                let thumbUrl = block.getAttribute('data-thumb-url') || null;
                let aiAnalysis = null;
                try { aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis')); } catch(_) {}
                const pending = await resolvePendingUploadResult(fileInput.id);
                if (pending?.url) {
                    url = pending.url;
                    if (pending.thumbUrl) thumbUrl = pending.thumbUrl;
                } else if (fileInput.files[0]) {
                    try {
                        const result = await uploadWithThumb(fileInput.files[0], 'exercise_images', user.uid);
                        url = result.url;
                        if (result.thumbUrl) thumbUrl = result.thumbUrl;
                    } catch (err) {
                        console.error('⚠️ 유산소 사진 업로드 실패:', err);
                        url = null;
                    }
                }
                return url ? { imageUrl: url, imageThumbUrl: thumbUrl, aiAnalysis } : null;
            }));

            // 3) 근력 영상 병렬
            const strengthBlocks = document.querySelectorAll('.strength-block');
            const strengthPromise = Promise.all([...strengthBlocks].map(async (block) => {
                const fileInput = block.querySelector('.exer-file');
                const previewImg = block.querySelector('.preview-strength-img');
                let url = block.getAttribute('data-url') || null;
                let thumbUrl = block.getAttribute('data-thumb-url') || null;
                let localThumb = String(
                    block.getAttribute('data-local-thumb')
                    || previewImg?.getAttribute('data-local-thumb')
                    || (previewImg?.src?.startsWith('data:image/') ? previewImg.src : '')
                    || ''
                ).trim();
                let aiAnalysis = null;
                try { aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis')); } catch(_) {}
                const pending = await resolvePendingUploadResult(fileInput.id);
                if (pending?.url) {
                    url = pending.url;
                    if (pending.thumbUrl) thumbUrl = pending.thumbUrl;
                } else if (fileInput.files[0]) {
                    try {
                        const result = await uploadVideoWithThumb(fileInput.files[0], 'exercise_videos', user.uid);
                        url = result.url;
                        if (result.thumbUrl) thumbUrl = result.thumbUrl;
                    } catch (err) {
                        console.error('⚠️ 근력 영상 업로드 실패:', err);
                        url = null;
                    }
                }
                if (url && !thumbUrl && !localThumb.startsWith('data:image/') && fileInput.files[0]) {
                    try {
                        localThumb = await extractVideoThumbFromFile(fileInput.files[0]);
                        if (localThumb.startsWith('data:image/')) {
                            if (previewImg) {
                                previewImg.src = localThumb;
                                previewImg.setAttribute('data-local-thumb', localThumb);
                            }
                            block.setAttribute('data-local-thumb', localThumb);
                        }
                    } catch (_) {}
                }
                if (url && !thumbUrl && localThumb.startsWith('data:image/')) {
                    thumbUrl = await uploadDataUrlThumbnail(localThumb, 'exercise_videos', user.uid);
                }
                return url ? { videoUrl: url, videoThumbUrl: thumbUrl, aiAnalysis } : null;
            }));

            // 4) 수면 사진
            const sleepFile = document.getElementById('sleep-img');
            const sleepPromise = (async () => {
                let sUrl = oldData?.sleepAndMind?.sleepImageUrl || null;
                let sThumbUrl = oldData?.sleepAndMind?.sleepImageThumbUrl || null;
                const sleepPending = await resolvePendingUploadResult('sleep-img');
                if (sleepPending?.url && document.getElementById('preview-sleep').style.display !== 'none') {
                    sUrl = sleepPending.url;
                    if (sleepPending.thumbUrl) sThumbUrl = sleepPending.thumbUrl;
                } else if (sleepFile.files[0] && document.getElementById('preview-sleep').style.display !== 'none') {
                    try {
                        const result = await uploadWithThumb(sleepFile.files[0], 'sleep_images', user.uid);
                        sUrl = result.url;
                        sThumbUrl = result.thumbUrl;
                    } catch (err) {
                        console.error('⚠️ 수면 사진 업로드 실패:', err);
                        sUrl = null; sThumbUrl = null;
                    }
                } else if (document.getElementById('preview-sleep').style.display === 'none' && document.getElementById('preview-sleep').hasAttribute('data-user-removed')) {
                    sUrl = null; sThumbUrl = null;
                }
                return { url: sUrl, thumbUrl: sThumbUrl };
            })();

            // 모든 업로드 완료 대기
            const [dietResults, cardioResults, strengthResults, sleepResult] = await Promise.all([
                dietPromise, cardioPromise, strengthPromise, sleepPromise
            ]);

            console.log(`✅ 전체 업로드 완료 (${((Date.now() - uploadStart) / 1000).toFixed(1)}초)`);

            const [bResult, lResult, dResult, sResult] = dietResults;
            const bUrl = bResult.url, lUrl = lResult.url, dUrl = dResult.url, sUrl = sResult.url;
            const bThumbUrl = bResult.thumbUrl, lThumbUrl = lResult.thumbUrl, dThumbUrl = dResult.thumbUrl, sThumbUrl = sResult.thumbUrl;


            const cardioList = cardioResults.filter(Boolean);
            const strengthList = strengthResults.filter(Boolean);

            let sleepUrl = sleepResult.url;
            let sleepThumbUrl = sleepResult.thumbUrl;

            const hasDiet = !!(bUrl || lUrl || dUrl || sUrl);
            const hasExer = cardioList.length > 0 || strengthList.length > 0 || (_stepData.count > 0);
            const meditationDone = document.getElementById('meditation-check').checked;
            // 감사일기 텍스트 정제 (XSS 방지)
            const gratitudeText = sanitizeText(document.getElementById('gratitude-journal').value, 500);
            const hasMind = !!(sleepUrl || meditationDone || gratitudeText);

            // === 신규 포인트 시스템 (최대 80P/일) ===
            let awarded = oldData.awardedPoints || {};
            const oldDietPts = awarded.dietPoints || 0;
            const oldExerPts = awarded.exercisePoints || 0;
            const oldMindPts = awarded.mindPoints || 0;

            // 식단: 사진당 10P, 최대 30P (3장까지 인정)
            const dietPhotoCount = [bUrl, lUrl, dUrl, sUrl].filter(u => !!u).length;
            const newDietPts = Math.min(dietPhotoCount * 10, 30);

            // 운동: 유산소·걸음수 첫 10P + 추가 5P, 근력 첫 10P + 추가 5P (최대 30P)
            let newExerPts = 0;
            const qualifiesForStepPoints = (_stepData.count || 0) >= 8000;
            const cardioCredits = cardioList.length + (qualifiesForStepPoints ? 1 : 0);
            if (cardioCredits >= 1) newExerPts += 10;
            if (cardioCredits >= 2) newExerPts += 5;
            if (strengthList.length >= 1) newExerPts += 10;
            if (strengthList.length >= 2) newExerPts += 5;
            newExerPts = Math.min(newExerPts, 30);

            // 마음: 수면분석 10P + 마음챙김/감사일기 10P (최대 20P)
            let newMindPts = 0;
            if (sleepUrl) newMindPts += 10;
            if (meditationDone || gratitudeText) newMindPts += 10;
            newMindPts = Math.min(newMindPts, 20);

            const pointsToGive = Math.max(0, newDietPts - oldDietPts) +
                Math.max(0, newExerPts - oldExerPts) +
                Math.max(0, newMindPts - oldMindPts);

            awarded.dietPoints = newDietPts;
            awarded.exercisePoints = newExerPts;
            awarded.mindPoints = newMindPts;
            awarded.diet = newDietPts > 0;
            awarded.exercise = newExerPts > 0;
            awarded.mind = newMindPts > 0;

            const currentDietAnalysis = collectCurrentDietAnalysisFromUi();
            const currentSleepAnalysis = getCurrentSleepAnalysisFromUi();
            const shareSettings = getCurrentShareSettings();

            const saveData = sanitize({
                userId: user.uid, userName: getUserDisplayName(), date: selectedDateStr, timestamp: serverTimestamp(), awardedPoints: awarded,
                metrics: { weight: document.getElementById('weight').value, glucose: document.getElementById('glucose').value, bpSystolic: document.getElementById('bp-systolic').value, bpDiastolic: document.getElementById('bp-diastolic').value },
                diet: {
                    breakfastUrl: bUrl, lunchUrl: lUrl, dinnerUrl: dUrl, snackUrl: sUrl,
                    breakfastThumbUrl: bThumbUrl, lunchThumbUrl: lThumbUrl, dinnerThumbUrl: dThumbUrl, snackThumbUrl: sThumbUrl
                },
                dietAnalysis: currentDietAnalysis,
                exercise: { cardioList: cardioList, strengthList: strengthList },
                steps: _stepData.count > 0 ? { count: _stepData.count, source: _stepData.source || 'manual', screenshotUrl: _stepData.screenshotUrl || null, screenshotThumbUrl: _stepData.screenshotThumbUrl || null, imageHash: _stepData.imageHash || null, distance_km: _stepData.distance_km || null, calories: _stepData.calories || null, active_minutes: _stepData.active_minutes || null, updatedAt: _stepData.updatedAt || new Date().toISOString() } : (oldData.steps || null),
                sleepAndMind: { sleepImageUrl: sleepUrl, sleepImageThumbUrl: sleepThumbUrl, sleepAnalysis: currentSleepAnalysis, meditationDone: meditationDone, gratitude: gratitudeText },
                shareSettings: shareSettings
            });

            // Firestore 저장: 서버 ACK 최대 5초 대기, unavailable 에러 시 1회 자동 재시도
            const doSetDoc = () => withTimeout(
                setDoc(doc(db, "daily_logs", docId), saveData, { merge: true }),
                5000,
                null
            );
            try {
                await doSetDoc();
            } catch (e) {
                if (e.code === 'unavailable' || e.code === 'failed-precondition') {
                    // 연결 안정화 대기 후 1회 재시도
                    await new Promise(r => setTimeout(r, 1500));
                    await doSetDoc();
                } else { throw e; }
            }

            // coins 업데이트는 Cloud Function(awardPoints)이 서버에서 처리
            if (uploadFailures.length > 0) {
                showToast(`⚠️ 일부 사진 업로드에 실패했습니다. 나머지 데이터는 저장되었습니다. 사진을 다시 선택 후 저장해주세요.`);
            } else if (pointsToGive > 0) {
                const currentDisplayed = parseInt(document.getElementById('point-balance').innerText) || 0;
                document.getElementById('point-balance').innerText = currentDisplayed + pointsToGive;
                showToast(`🎉 저장 완료! 새롭게 ${pointsToGive}P 획득!`);
            } else { showToast(`🎉 데이터가 업데이트되었습니다.`); }

            // 데이터 저장 후 캐시 초기화
            cachedGalleryLogs = [];
            galleryLastDoc = null; galleryHasMore = false;
            galleryDisplayCount = 0;
            sortedFilteredDirty = true;
            _dashboardCache.ts = 0;
            _assetCache.ts = 0;
            setTimeout(() => updateRecordFlowGuides(getVisibleTabName()), 0);

            // 저장 버튼 즉시 복원 (post-save ops 완료 기다리지 않음)
            saveBtn.innerText = "현재 진행상황 저장 & 포인트 받기 🅿️"; saveBtn.disabled = false;

            // 퀘스트 체크 UI 직접 갱신 (loadDataForSelectedDate 재호출 없음 — 사진 UI 보호)
            if (awarded.diet) { document.getElementById('quest-diet').className = 'quest-check done'; document.getElementById('quest-diet').innerText = `+${awarded.dietPoints || 0}P`; }
            if (awarded.exercise) { document.getElementById('quest-exercise').className = 'quest-check done'; document.getElementById('quest-exercise').innerText = `+${awarded.exercisePoints || 0}P`; }
            if (awarded.mind) { document.getElementById('quest-mind').className = 'quest-check done'; document.getElementById('quest-mind').innerText = `+${awarded.mindPoints || 0}P`; }

            // data-saved-url 갱신 (다음 저장 시 URL 보존용)
            [['breakfast', bUrl, bThumbUrl], ['lunch', lUrl, lThumbUrl], ['dinner', dUrl, dThumbUrl], ['snack', sUrl, sThumbUrl]].forEach(([k, url, thumb]) => {
                if (url) {
                    const pv = document.getElementById(`preview-${k}`);
                    if (pv) persistSavedPreview(`diet-img-${k}`, pv, url, thumb);
                }
            });
            persistSavedPreview('sleep-img', document.getElementById('preview-sleep'), sleepUrl, sleepThumbUrl);
            cardioBlocks.forEach((block, idx) => {
                const item = cardioResults[idx];
                if (item?.imageUrl) persistSavedExerciseBlock(block, item.imageUrl, item.imageThumbUrl);
            });
            strengthBlocks.forEach((block, idx) => {
                const item = strengthResults[idx];
                if (item?.videoUrl) persistSavedExerciseBlock(block, item.videoUrl, item.videoThumbUrl);
            });
            _latestPreparedShareMedia = [];
            _latestPreparedShareSignature = '';
            _latestShareRenderKey = '';
            updateDailyLogCache(docId, {
                ...oldData,
                ...saveData,
                timestamp: new Date().toISOString()
            });

            // post-save ops: 백그라운드에서 실행 (버튼 복원과 무관)
            loadGalleryData();
            (async () => {
                try {
                    await checkMilestones(user.uid);
                    await renderMilestones(user.uid);
                    await updateChallengeProgress();
                } catch (_) {}
            })();

        } catch (e) {
            console.error('데이터 저장 오류:', e);
            let errorMsg = '저장 중 오류가 발생했습니다. 다시 시도해주세요.';
            if (e.code === 'permission-denied') {
                errorMsg = '저장 권한이 없습니다. 로그인을 확인해주세요.';
            } else if (e.code === 'unavailable' || e.code === 'failed-precondition') {
                errorMsg = '네트워크 연결을 확인 후 다시 시도해주세요.';
            }
            showToast(`⚠️ ${errorMsg}`);
        }
        finally { saveBtn.innerText = "현재 진행상황 저장 & 포인트 받기 🅿️"; saveBtn.disabled = false; }
    })();
});

// [핵심] 갤러리 하트 누르면 즉각 반응 (새로고침 방지)
// reactions 필드만 업데이트하여 보안 규칙 충돌 방지
window.toggleReaction = async function (docId, reactionType, btnElement) {
    const user = auth.currentUser;
    if (!user) { document.getElementById('login-modal').style.display = 'flex'; return; }

    // span이 없으면 생성 (count 0일 때 span 없는 템플릿 대응)
    let span = btnElement.querySelector('span');
    if (!span) {
        span = document.createElement('span');
        span.innerText = '0';
        btnElement.appendChild(span);
    }
    let count = parseInt(span.innerText) || 0;
    // 'reacted' 또는 'active' 클래스 모두 호환
    const isActive = btnElement.classList.contains('reacted') || btnElement.classList.contains('active');

    if (isActive) { btnElement.classList.remove('reacted', 'active'); count = Math.max(0, count - 1); }
    else { btnElement.classList.add('reacted'); count++; }
    span.innerText = count;

    try {
        const logRef = doc(db, "daily_logs", docId);

        // arrayUnion/arrayRemove로 원자적 업데이트 (전체 문서 읽기 불필요)
        if (isActive) {
            await setDoc(logRef, {
                reactions: { [reactionType]: arrayRemove(user.uid) }
            }, { merge: true });
        } else {
            await setDoc(logRef, {
                reactions: { [reactionType]: arrayUnion(user.uid) }
            }, { merge: true });
        }

        // 캐시 동기화: Firestore 성공 후 cachedGalleryLogs도 업데이트
        const cached = cachedGalleryLogs.find(l => l.id === docId);
        if (cached) {
            const rx = cached.data.reactions || { heart: [], fire: [], clap: [] };
            const arr = rx[reactionType] ? [...rx[reactionType]] : [];
            if (isActive) {
                cached.data.reactions = { ...rx, [reactionType]: arr.filter(uid => uid !== user.uid) };
            } else {
                if (!arr.includes(user.uid)) arr.push(user.uid);
                cached.data.reactions = { ...rx, [reactionType]: arr };
            }
        }
    } catch (error) {
        console.error('반응 저장 오류:', error);
        // UI 롤백 (실패 시 원복)
        if (isActive) { btnElement.classList.add('reacted'); count++; }
        else { btnElement.classList.remove('reacted'); count = Math.max(0, count - 1); }
        span.innerText = count;
        showToast('⚠️ 반응 저장에 실패했습니다.');
    }
};

window.toggleFriend = async function (friendId) {
    try {
        await loadMyFriendships();
    } catch (error) {
        console.warn('friendship preload skipped:', error.message);
    }
    const relation = getFriendRelationship(friendId);
    if (relation.status === 'active') {
        await removeFriendship(relation.id);
    } else if (relation.status === 'pending') {
        const friendship = findFriendshipById(relation.id);
        if (friendship?.pendingForUid === auth.currentUser?.uid) {
            await openFriendRequestModal(relation.id);
        } else {
            showToast('이미 친구 요청을 보냈어요.');
        }
    } else {
        await requestFriend(friendId);
    }
};

let latestShareBlob = null;
let latestShareFile = null;
let latestShareText = '';
let latestShareCaption = '';
const thumbUrlCache = new Map();

function getShareTargetUrl() {
    return `${APP_ORIGIN}/#gallery`;
}

function buildShareCaption() {
    return '오늘의 해빛스쿨 건강 습관 인증입니다! 함께해요 💪';
}

function buildShareCopyText() {
    return `${buildShareCaption()}\n\n👇 갤러리 구경가기 (가입 없이 가능)\n${getShareTargetUrl()}`;
}

function isVideoUrl(url) {
    return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url || '');
}

function getStoragePathFromUrl(url) {
    try {
        const match = String(url || '').match(/\/o\/([^?]+)/);
        if (!match || !match[1]) return '';
        return decodeURIComponent(match[1]);
    } catch (_) {
        return '';
    }
}

function buildThumbPathFromOriginal(url, sourceFolder, thumbFolder) {
    const originalPath = getStoragePathFromUrl(url);
    if (!originalPath) return '';
    if (!originalPath.startsWith(`${sourceFolder}/`)) return '';
    return `${thumbFolder}/${originalPath.substring(sourceFolder.length + 1)}`;
}

function splitFileName(fileName) {
    const idx = fileName.lastIndexOf('.');
    if (idx <= 0) return { base: fileName, ext: '' };
    return { base: fileName.substring(0, idx), ext: fileName.substring(idx + 1).toLowerCase() };
}

function buildThumbPathCandidates(originalUrl, sourceFolder, thumbFolder) {
    const originalPath = getStoragePathFromUrl(originalUrl);
    if (!originalPath || !originalPath.startsWith(`${sourceFolder}/`)) return [];

    const fileName = originalPath.substring(sourceFolder.length + 1);
    const { base, ext } = splitFileName(fileName);
    const parts = base.split('_');
    const extCandidates = ['jpg', 'jpeg', 'png', 'webp', ext].filter(Boolean);
    const uniqueExt = [...new Set(extCandidates)];
    const paths = new Set();

    if (parts.length >= 2) {
        const prefix = `${parts[0]}_${parts[1]}`;
        const rest = parts.slice(2).join('_');

        if (sourceFolder === 'exercise_videos') {
            ['jpg', 'jpeg', 'png', 'webp'].forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb.${e}`));
            if (rest) ['jpg', 'jpeg', 'png', 'webp'].forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb_${rest}.${e}`));
        } else {
            if (rest) uniqueExt.forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb_${rest}.${e}`));
            uniqueExt.forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb.${e}`));
        }
    }

    paths.add(`${thumbFolder}/${fileName}`);

    return [...paths];
}

async function resolveThumbUrl(originalUrl, sourceFolder, thumbFolder) {
    // 클라이언트 사이드 썸네일: 저장 시 _thumb 파일도 함께 업로드
    // 이미 썸네일이 있으면 그 URL을 반환, 없으면 원본 반환
    return originalUrl || null;
}

// 이미지 파일로부터 1:1 정사각형 썸네일 생성 (300x300, JPEG 60%)
async function generateThumbnailBlob(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const size = 300; // 출력 크기 300x300
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 중앙 기준 정사각형 crop
                const srcSize = Math.min(img.width, img.height);
                const sx = (img.width - srcSize) / 2;
                const sy = (img.height - srcSize) / 2;
                ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

// 동영상 파일로부터 1:1 정사각형 썸네일 생성 (300x300, JPEG 70%)
async function generateVideoThumbnailBlob(file) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);

        let resolved = false;
        const done = (blob) => {
            if (resolved) return;
            resolved = true;
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.remove();
            URL.revokeObjectURL(objectUrl);
            resolve(blob || null);
        };

        const timer = setTimeout(() => done(null), 12000);

        const captureFrame = () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 180;
                const size = 300;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 중앙 기준 정사각형 crop
                const srcSize = Math.min(w, h);
                const sx = (w - srcSize) / 2;
                const sy = (h - srcSize) / 2;
                ctx.drawImage(video, sx, sy, srcSize, srcSize, 0, 0, size, size);

                // 검은 프레임 감지
                const px = ctx.getImageData(size / 2, size / 2, 1, 1).data;
                if (px[0] === 0 && px[1] === 0 && px[2] === 0 && video.currentTime < 3) {
                    video.currentTime = Math.min(video.duration || 2, 2);
                    video.addEventListener('seeked', () => {
                        try {
                            ctx.drawImage(video, sx, sy, srcSize, srcSize, 0, 0, size, size);
                            clearTimeout(timer);
                            canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.7);
                        } catch (_) { clearTimeout(timer); done(null); }
                    }, { once: true });
                    return;
                }
                clearTimeout(timer);
                canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.7);
            } catch (_) { clearTimeout(timer); done(null); }
        };

        video.addEventListener('error', () => { clearTimeout(timer); done(null); }, { once: true });
        video.addEventListener('loadeddata', () => {
            try {
                const dur = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = dur > 1 ? 0.8 : 0.01;
            } catch (_) { clearTimeout(timer); done(null); }
        }, { once: true });
        video.addEventListener('seeked', captureFrame, { once: true });

        video.src = objectUrl;
        video.load();
    });
}

// 이미지 파일 업로드 + 썸네일도 함께 업로드
async function uploadImageWithThumb(file, folderName, userId) {
    if (!file) return { url: null, thumbUrl: null };

    try {
        // 원본 업로드
        const url = await uploadFileAndGetUrl(file, folderName, userId);
        if (!url) return { url: null, thumbUrl: null };

        // 썸네일 생성 & 업로드
        let thumbUrl = null;
        try {
            const thumbBlob = await generateThumbnailBlob(file);
            if (thumbBlob) {
                const timestamp = Date.now();
                const thumbPath = `${folderName}_thumbnails/${userId}/${timestamp}_thumb.jpg`;
                const thumbRef = ref(storage, thumbPath);
                await uploadBytes(thumbRef, thumbBlob);
                thumbUrl = await getDownloadURL(thumbRef);
            }
        } catch (e) {
            console.warn('썸네일 생성/업로드 실패 (원본은 성공):', e.message);
        }

        return { url, thumbUrl };
    } catch (e) {
        console.error('이미지 업로드 실패:', e);
        return { url: null, thumbUrl: null };
    }
}

window.handleThumbFallback = function (imgEl) {
    const raw = imgEl.getAttribute('data-fallback-list') || '';
    const list = raw ? raw.split('||').filter(Boolean) : [];
    if (!list.length) {
        imgEl.onerror = null;
        imgEl.classList.add('img-error');
        return;
    }
    const next = list.shift();
    imgEl.setAttribute('data-fallback-list', list.join('||'));
    imgEl.src = next;
};

async function fetchVideoFrameAsBase64(url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        let timer = null;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            video.removeAttribute('src');
            video.load();
        };

        const fail = () => {
            cleanup();
            resolve('');
        };

        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';

        video.addEventListener('error', fail, { once: true });
        video.addEventListener('loadedmetadata', () => {
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                const targetTime = duration > 0 ? Math.max(0.6, Math.min(2.2, duration * 0.35)) : 1.0;
                video.currentTime = targetTime;
            } catch (_) {
                fail();
            }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const canvas = document.createElement('canvas');
                const width = Math.max(1, video.videoWidth || 320);
                const height = Math.max(1, video.videoHeight || 320);
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                cleanup();
                resolve(dataUrl);
            } catch (_) {
                fail();
            }
        }, { once: true });

        timer = setTimeout(fail, 5000);
        video.src = url;
        video.load();
    });
}

function createVideoPlaceholderBase64() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 320, 320);
    bg.addColorStop(0, '#D7ECFF');
    bg.addColorStop(1, '#A9D7FF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 320);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(160, 160, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(150, 142);
    ctx.lineTo(150, 178);
    ctx.lineTo(178, 160);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1565C0';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('운동 영상', 160, 248);

    return canvas.toDataURL('image/png');
}

function createImagePlaceholderBase64(label = '해빛 기록') {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 320, 320);
    bg.addColorStop(0, '#FFF4E0');
    bg.addColorStop(0.55, '#FFE0B8');
    bg.addColorStop(1, '#FFD19A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 320);

    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(54, 72, 212, 140);

    ctx.strokeStyle = '#F3A54E';
    ctx.lineWidth = 6;
    ctx.strokeRect(54, 72, 212, 140);

    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.arc(120, 132, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFB347';
    ctx.beginPath();
    ctx.moveTo(84, 188);
    ctx.lineTo(140, 132);
    ctx.lineTo(182, 174);
    ctx.lineTo(212, 142);
    ctx.lineTo(236, 188);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#9A4A00';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 160, 262);

    return canvas.toDataURL('image/png');
}

function createCanvasBlob(canvas, type = 'image/png', quality) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Blob 생성 실패'));
                return;
            }
            resolve(blob);
        }, type, quality);
    });
}

function toSafeAttr(value) {
    return String(value || '').replace(/"/g, '&quot;');
}

window.handleSharePreviewImageError = function (img) {
    if (!img) return;
    const nextSrc = img.dataset.nextSrc || '';
    const placeholderSrc = img.dataset.placeholderSrc || createImagePlaceholderBase64('해빛 기록');

    if (nextSrc && img.src !== nextSrc) {
        img.dataset.nextSrc = '';
        img.src = nextSrc;
        return;
    }

    img.onerror = null;
    img.src = placeholderSrc;
};

window.handleShareRenderPreviewError = function (img) {
    const emptyState = document.getElementById('share-render-empty');
    if (img) {
        img.hidden = true;
        img.style.display = 'none';
        img.removeAttribute('src');
    }
    if (emptyState) {
        emptyState.hidden = false;
        emptyState.style.display = 'flex';
    }
};

function buildShareImageGrid(mediaItems, maxCount = 4) {
    const items = Array.isArray(mediaItems) ? mediaItems.slice(0, maxCount) : [];
    if (!items.length) {
        return `
            <div class="share-empty-state">
                <strong>오늘 기록을 저장하면 카드가 완성돼요</strong>
                <span>사진이 없어도 기록 흐름은 바로 공유할 수 있어요.</span>
            </div>
        `;
    }

    const countClass = `share-media-count-${Math.min(items.length, 4)}`;
    const html = items.map((item, index) => {
        const mediaType = item.type || (isVideoUrl(item.originalUrl || item.src || '') ? 'video' : 'image');
        const mediaSrc = item.previewUrl || item.src || item.originalUrl || '';
        const fallbackSrc = mediaType === 'video'
            ? createVideoPlaceholderBase64()
            : createImagePlaceholderBase64(item.category || '해빛 기록');
        const safeSrc = toSafeAttr(mediaSrc || fallbackSrc);
        const safeFallback = toSafeAttr(fallbackSrc);
        const safeNextSrc = toSafeAttr(item.originalUrl && item.originalUrl !== mediaSrc ? item.originalUrl : '');
        const safeOriginal = toSafeAttr(item.originalUrl || mediaSrc);
        const safeCategory = escapeHtml(item.category || '기록');
        const imageMarkup = `<img src="${safeSrc}" alt="해빛 인증 사진 ${index + 1}" loading="eager" decoding="sync" crossorigin="anonymous" data-next-src="${safeNextSrc}" data-placeholder-src="${safeFallback}" onerror="window.handleSharePreviewImageError(this)">`;

        return `
            <div class="share-media-thumb" data-media-type="${mediaType}" data-media-src="${safeOriginal}">
                ${imageMarkup}
                <span class="share-media-chip">${safeCategory}</span>
                ${mediaType === 'video' ? '<span class="share-media-play-badge">▶</span>' : ''}
            </div>
        `;
    }).join('');

    return `<div class="share-media-layout ${countClass}">${html}</div>`;
}

async function waitForImagesInElement(root) {
    if (!root) return;
    const images = Array.from(root.querySelectorAll('img'));
    if (!images.length) return;

    await Promise.all(images.map(img => new Promise(resolve => {
        if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
        }
        const finish = () => resolve();
        img.addEventListener('load', finish, { once: true });
        img.addEventListener('error', finish, { once: true });
    })));

    await Promise.all(images.map(img => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve())));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

async function hydrateThumbImages(scopeElement) {
    const nodes = Array.from(scopeElement.querySelectorAll('[data-thumb-source][data-thumb-target]'));
    const queue = [...nodes];
    const workers = Array.from({ length: 6 }, async () => {
        while (queue.length) {
            const node = queue.shift();
            const isImg = node.tagName === 'IMG';
            const img = isImg ? node : node.querySelector('img');
            if (!img) continue;

            const originalUrl = node.getAttribute('data-media-src') || img.getAttribute('data-media-src') || img.getAttribute('src') || '';
            const sourceFolder = node.getAttribute('data-thumb-source') || img.getAttribute('data-thumb-source') || '';
            const targetFolder = node.getAttribute('data-thumb-target') || img.getAttribute('data-thumb-target') || '';
            if (!originalUrl || !sourceFolder || !targetFolder) continue;

            const thumbUrl = await resolveThumbUrl(originalUrl, sourceFolder, targetFolder);
            if (thumbUrl && thumbUrl !== originalUrl) {
                img.src = thumbUrl;
            }
        }
    });
    await Promise.all(workers);
}

async function prewarmThumbCache(logItems) {
    const tasks = [];
    const seen = new Set();

    const addTask = (url, source, target) => {
        if (!url || !source || !target) return;
        const key = `${source}|${target}|${url}`;
        if (seen.has(key) || thumbUrlCache.has(key)) return;
        seen.add(key);
        tasks.push(() => resolveThumbUrl(url, source, target));
    };

    (logItems || []).forEach(item => {
        const data = item?.data || {};
        const diet = data.diet || {};
        ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl'].forEach(k => {
            addTask(diet[k], 'diet_images', 'diet_images_thumbnails');
        });

        const exercise = data.exercise || {};
        addTask(exercise.cardioImageUrl, 'exercise_images', 'exercise_images_thumbnails');
        addTask(exercise.strengthVideoUrl, 'exercise_videos', 'exercise_videos_thumbnails');
        (exercise.cardioList || []).forEach(c => addTask(c?.imageUrl, 'exercise_images', 'exercise_images_thumbnails'));
        (exercise.strengthList || []).forEach(s => addTask(s?.videoUrl, 'exercise_videos', 'exercise_videos_thumbnails'));
    });

    const workers = Array.from({ length: 8 }, async (_, i) => {
        for (let idx = i; idx < tasks.length; idx += 8) {
            try { await tasks[idx](); } catch (_) { }
        }
    });

    await Promise.all(workers);
}

async function prepareShareThumbsForCapture() {
    const captureArea = document.getElementById('capture-area');
    if (!captureArea) return;

    const user = auth.currentUser;
    const latest = user ? getCurrentShareLog(user.uid)?.data || null : null;
    if (latest && user) {
        const settings = getCurrentShareSettings();
        const preparedMedia = await ensurePreparedShareMedia(latest, settings);
        renderShareCardState(user, latest, settings, { preparedMedia });
    }

    await waitForImagesInElement(captureArea);
}

// 이미지를 1:1 정사각형으로 크롭하여 base64 반환
function cropToSquareBase64(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(src); // 실패 시 원본 반환
        img.src = src;
    });
}

function openSharePlatformModal() {
    const modal = document.getElementById('share-platform-modal');
    if (modal) modal.style.display = 'flex';
}

window.closeSharePlatformModal = function () {
    const modal = document.getElementById('share-platform-modal');
    if (modal) modal.style.display = 'none';
};

async function createSquareShareBlob() {
    await _ensureHtml2Canvas();
    const captureArea = document.getElementById('capture-area');
    await waitForImagesInElement(captureArea);
    const width = captureArea.offsetWidth;
    const height = captureArea.offsetHeight;

    const sourceCanvas = await html2canvas(captureArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        allowTaint: false,
        logging: false,
        imageTimeout: 7000,
        removeContainer: true,
        foreignObjectRendering: false,
        width,
        height
    });

    // 1:1 정사각형 출력 유지
    const size = Math.max(sourceCanvas.width, sourceCanvas.height);
    const squareCanvas = document.createElement('canvas');
    squareCanvas.width = size;
    squareCanvas.height = size;
    const ctx = squareCanvas.getContext('2d');

    const grd = ctx.createLinearGradient(0, 0, size, size);
    grd.addColorStop(0, '#FFF8E1');
    grd.addColorStop(0.5, '#FFE5BF');
    grd.addColorStop(1, '#FFD59C');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);

    const offsetX = (size - sourceCanvas.width) / 2;
    const offsetY = (size - sourceCanvas.height) / 2;
    ctx.drawImage(sourceCanvas, offsetX, offsetY);

    return await new Promise((resolve, reject) => {
        squareCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Blob 생성 실패'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
};

window.shareMyCard = async function () {
    const btn = document.querySelector('.btn-share-action');
    const originalText = btn.innerHTML;
    btn.innerText = '⏳ 이미지 생성 중...';
    btn.disabled = true;
    const user = auth.currentUser;

    try {
        if (user) {
            await withAsyncTimeout(
                buildShareCardAsync(user.uid, user),
                14000,
                '공유 이미지를 준비하는 시간이 너무 오래 걸렸어요.'
            );
        }

        if (!latestShareBlob) {
            throw new Error('공유 이미지를 만들지 못했습니다.');
        }

        // 공유 미리보기 썸네일 설정
        const previewThumb = document.getElementById('share-preview-thumb');
        if (previewThumb && _latestSharePreviewDataUrl) {
            previewThumb.src = _latestSharePreviewDataUrl;
        }

        // 모바일: Web Share API 우선 시도 (파일 공유 직접 지원)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const shareData = { title: '해빛스쿨 인증', text: latestShareText, files: [latestShareFile] };
        if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                showToast('✅ 공유 완료!');
                return;
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return;
                console.warn('시스템 공유 실패, 모달 표시:', shareErr);
            }
        }
        // PC 또는 모바일 Web Share 실패 시 모달 표시
        openSharePlatformModal();
    } catch (err) {
        console.error('공유 카드 생성 오류:', err);
        showToast('⚠️ 카드 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.shareViaSystem = async function () {
    if (!latestShareFile) {
        showToast('먼저 공유 이미지를 생성해주세요.');
        return;
    }

    const shareData = {
        title: '해빛스쿨 인증',
        text: latestShareText,
        files: [latestShareFile]
    };

    try {
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            closeSharePlatformModal();
        } else {
            // 파일 공유 미지원 시 텍스트만 공유 시도
            const textShareData = { title: '해빛스쿨 인증', text: latestShareText };
            if (navigator.share) {
                await navigator.share(textShareData);
                closeSharePlatformModal();
            } else {
                showToast('이 브라우저는 시스템 공유를 지원하지 않습니다.\n이미지 저장 또는 링크 복사를 이용해주세요.');
            }
        }
    } catch (_) { }
};

window.downloadShareImage = function (silent = false) {
    if (!latestShareBlob) {
        showToast('먼저 자랑하기 버튼을 눌러주세요.');
        return;
    }
    const url = URL.createObjectURL(latestShareBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haebit_cert_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (!silent) {
        showToast('✅ 이미지가 다운로드 폴더에 저장되었습니다.');
    }
};

function fallbackCopyToClipboard(text, successMessage = '✅ 복사되었습니다!', showMessage = true) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (showMessage) showToast(successMessage); }
    catch (_) { showToast('⚠️ 복사에 실패했습니다. 직접 주소를 복사해주세요.'); }
    document.body.removeChild(ta);
}

async function copyTextToClipboard(text, successMessage = '✅ 복사되었습니다!', showMessage = true) {
    if (!text) return false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            if (showMessage) showToast(successMessage);
            return true;
        } catch (_) {
            fallbackCopyToClipboard(text, successMessage, showMessage);
            return true;
        }
    }
    fallbackCopyToClipboard(text, successMessage, showMessage);
    return true;
}

window.copyShareCaption = function () {
    const text = latestShareText || buildShareCopyText();
    copyTextToClipboard(text, '✅ 캡션이 복사되었습니다!');
};

window.copyShareLink = function () {
    copyTextToClipboard(getShareTargetUrl(), '✅ 링크가 복사되었습니다!');
};

async function shareFileToAppsOrFallback(platform) {
    // 모바일에서 Web Share API 재시도
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const shareData = {
        title: '해빛스쿨 인증',
        text: latestShareText,
        files: [latestShareFile]
    };
    if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            closeSharePlatformModal();
            return true;
        } catch (_) { }
    }

    // PC에서는 이미지 저장 + 캡션 복사 + 플랫폼 열기
    window.downloadShareImage(true);
    await copyTextToClipboard(latestShareText || buildShareCopyText(), '✅ 캡션이 복사되었습니다!', false);

    const shareUrl = getShareTargetUrl();
    const pageUrl = encodeURIComponent(shareUrl);
    const shareCaption = latestShareCaption || buildShareCaption();
    const encodedCaption = encodeURIComponent(shareCaption);
    const encodedTitle = encodeURIComponent('오늘의 해빛 인증');

    if (platform === 'instagram') {
        window.open('https://www.instagram.com/', '_blank', 'noopener');
        showToast('📥 이미지 저장 + 캡션 복사 완료!\n인스타그램에 이미지와 캡션을 붙여넣어 올려주세요.');
    } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${encodedCaption}`, '_blank', 'noopener');
        showToast('📥 이미지 저장 + 캡션 복사 완료!\n페이스북 창에서 이미지 추가만 하면 됩니다.');
    } else if (platform === 'x') {
        window.open(`https://x.com/intent/tweet?text=${encodedCaption}&url=${pageUrl}`, '_blank', 'noopener');
        showToast('📥 이미지 저장 + 캡션 복사 완료!\nX 창에서 이미지 업로드 후 바로 올릴 수 있어요.');
    } else if (platform === 'blog') {
        window.open(`https://blog.naver.com/openapi/share?url=${pageUrl}&title=${encodedTitle}`, '_blank', 'noopener');
        showToast('📥 이미지 저장 + 캡션 복사 완료!\n블로그 편집창에서 이미지와 문구를 붙여넣어 주세요.');
    } else if (platform === 'kakao') {
        _ensureKakao().then(() => {
            Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: '오늘의 해빛 인증 🌞',
                    description: shareCaption,
                    imageUrl: APP_OG_IMAGE_URL,
                    link: { mobileWebUrl: shareUrl, webUrl: shareUrl }
                },
                buttons: [{ title: '갤러리 구경가기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } }]
            });
            showToast('✅ 카카오톡 공유 창을 열었어요.\n이미지는 저장돼 있으니 필요하면 함께 첨부해 주세요.');
        }).catch(() => {
            if (navigator.share) navigator.share({ title: '해빛스쿨 인증', text: latestShareText, url: shareUrl }).catch(() => {});
            else showToast('📥 이미지 저장 + 캡션 복사 완료!\n카카오톡에 붙여넣어 공유해 주세요.');
        });
    }

    closeSharePlatformModal();
    return false;
}

window.shareToPlatform = async function (platform) {
    if (!latestShareBlob || !latestShareFile) {
        showToast('먼저 자랑하기 버튼을 눌러 이미지를 생성해주세요.');
        return;
    }

    try {
        await shareFileToAppsOrFallback(platform);
    } catch (err) {
        console.error('공유 실패:', err);
        showToast('공유 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
};

let cachedGalleryLogs = [];

// 무한 스크롤 관련 변수
let galleryDisplayCount = 0;
const INITIAL_LOAD = 8;        // 초기 로드: 8개 (빠른 첫 화면)
const LOAD_MORE = 6;           // 추가 로드: 6개씩
const FIRESTORE_PAGE_SIZE = 30; // Firestore 페이지당 건수 (빠른 초기 로딩)
const MAX_CACHE_SIZE = 300;    // 캐시 최대 크기 (메모리 관리)
let galleryIntersectionObserver = null;
let isLoadingMore = false;
// Firestore 커서 페이지네이션 상태
let galleryLastDoc = null;   // 마지막으로 가져온 Firestore 문서 (startAfter 커서)
let galleryHasMore = false;  // Firestore에 더 가져올 데이터가 있는지
// 정렬+필터 캐시 (매번 재정렬 방지)
let sortedFilteredCache = [];
let sortedFilteredDirty = true;

// 갤러리 게시물 삭제 (본인 게시물만)
// 게시물 신고
window.reportPost = async function (docId, targetUserId) {
    const user = auth.currentUser;
    if (!user) return;
    const reason = prompt('신고 사유를 선택해주세요:\n1. 부적절한 콘텐츠\n2. 스팸/광고\n3. 혐오 발언\n4. 기타\n\n번호 또는 사유를 입력하세요:');
    if (!reason) return;
    const reasons = { '1': '부적절한 콘텐츠', '2': '스팸/광고', '3': '혐오 발언', '4': '기타' };
    const reasonText = reasons[reason] || reason;
    try {
        await setDoc(doc(db, 'reports', `${user.uid}_${docId}`), {
            reporterUid: user.uid,
            targetDocId: docId,
            targetUserId: targetUserId,
            reason: reasonText,
            type: 'post',
            createdAt: new Date().toISOString()
        });
        showToast('🚨 신고가 접수되었습니다. 검토 후 조치하겠습니다.');
    } catch (e) {
        console.error('신고 오류:', e);
        showToast('신고 접수에 실패했습니다.');
    }
};

// 사용자 차단
window.blockUser = async function (targetUserId, targetName) {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm(`${targetName}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물이 갤러리에 표시되지 않습니다.`)) return;
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const blockedUsers = userSnap.exists() ? (userSnap.data().blockedUsers || []) : [];
        if (!blockedUsers.includes(targetUserId)) {
            blockedUsers.push(targetUserId);
            await setDoc(userRef, { blockedUsers }, { merge: true });
        }
        window._blockedUsers = blockedUsers;
        sortedFilteredDirty = true;
        renderFeedOnly();
        showToast(`🚫 ${targetName}님을 차단했습니다.`);
    } catch (e) {
        console.error('차단 오류:', e);
        showToast('차단에 실패했습니다.');
    }
};

// 댓글 신고
window.reportComment = async function (docId, commentIdx) {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm('이 댓글을 신고하시겠습니까?\n신고 후 검토 대기 상태가 됩니다.')) return;
    try {
        await setDoc(doc(db, 'reports', `${user.uid}_${docId}_c${commentIdx}`), {
            reporterUid: user.uid,
            targetDocId: docId,
            commentIndex: commentIdx,
            type: 'comment',
            createdAt: new Date().toISOString()
        });
        showToast('🚨 댓글 신고가 접수되었습니다.');
    } catch (e) {
        console.error('댓글 신고 오류:', e);
        showToast('신고 접수에 실패했습니다.');
    }
};

window.deleteGalleryPost = async function (docId) {
    const user = auth.currentUser;
    if (!user) return;
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (!item || item.data.userId !== user.uid) {
        showToast('본인 게시물만 삭제할 수 있습니다.');
        return;
    }
    if (!confirm('이 게시물을 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.')) return;

    try {
        await deleteDoc(doc(db, "daily_logs", docId));
        cachedGalleryLogs = cachedGalleryLogs.filter(l => l.id !== docId);
        sortedFilteredDirty = true;
        renderFeedOnly();
        showToast('✅ 게시물이 삭제되었습니다.');
    } catch (e) {
        console.error('게시물 삭제 오류:', e);
        showToast('삭제에 실패했습니다. 다시 시도해주세요.');
    }
};

// 게시물 메뉴 토글
window.togglePostMenu = function (btn) {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    // 다른 열린 메뉴 모두 닫기
    document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
    menu.style.display = isOpen ? 'none' : 'block';
};

// 바깥 클릭 시 메뉴 닫기
document.addEventListener('click', function (e) {
    if (!e.target.closest('.post-menu-container')) {
        document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
    }
});

// 무한 스크롤 옵저버 설정
function setupInfiniteScroll() {
    const sentinel = document.getElementById('gallery-sentinel');
    if (!sentinel) return;

    // 기존 옵저버가 있으면 해제
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
    }

    galleryIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingMore) {
                loadMoreGalleryItems();
            }
        });
    }, {
        rootMargin: '100px' // 하단 100px 전에 미리 로드
    });

    galleryIntersectionObserver.observe(sentinel);
}

// 빈 상태 HTML (필터별 맞춤 메시지)
function getEmptyStateHtml(filter) {
    const messages = {
        all: { emoji: '📷', title: '아직 기록이 없어요', desc: '식단, 운동, 마음 기록을 시작해보세요!<br>기록 탭에서 오늘의 건강 습관을 인증할 수 있어요.' },
        diet: { emoji: '🥗', title: '식단 기록이 없어요', desc: '오늘 먹은 식사를 사진으로 기록해보세요!<br>AI가 영양 분석도 해드려요.' },
        exercise: { emoji: '🏃', title: '운동 기록이 없어요', desc: '운동 이미지나 영상을 올려보세요!<br>함께 운동하면 더 즐거워요.' },
        mind: { emoji: '🧘', title: '마음 기록이 없어요', desc: '오늘의 감사 일기나 수면 기록을 남겨보세요!<br>작은 기록이 큰 변화를 만들어요.' }
    };
    const m = messages[filter] || messages.all;
    return `<div class="gallery-empty-state">
        <div class="empty-emoji">${m.emoji}</div>
        <div class="empty-title">${m.title}</div>
        <div class="empty-desc">${m.desc}</div>
        <div class="empty-actions">
            <button class="empty-action-btn" onclick="goToGalleryRecordAction()">기록 시작하기</button>
        </div>
    </div>`;
}

function getUniqueReactionUserIdsForPost(logData = {}) {
    const uniqueUserIds = new Set();
    const reactions = logData?.reactions || {};
    ['heart', 'fire', 'clap'].forEach((type) => {
        const userIds = Array.isArray(reactions[type]) ? reactions[type] : [];
        userIds.forEach((uid) => {
            if (uid) uniqueUserIds.add(uid);
        });
    });
    return [...uniqueUserIds];
}

function getUniqueReactionCount(logData = {}) {
    return getUniqueReactionUserIdsForPost(logData).length;
}

function getUniqueCommentCount(logData = {}) {
    const uniqueUserIds = new Set();
    const comments = Array.isArray(logData?.comments) ? logData.comments : [];
    comments.forEach((comment) => {
        if (comment?.userId) uniqueUserIds.add(comment.userId);
    });
    return uniqueUserIds.size;
}

// 주간 베스트 갤러리 (성실 기록 + 응원 + 댓글 종합 점수 기준, 유저 단위)
async function buildWeeklyBestSection() {
    const container = document.getElementById('weekly-best-container');
    if (!container) return;

    // 이번 주 기준 (월요일~일요일) — KST 기준 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const dayOfWeek = kstNow.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const kstMonday = new Date(kstNow);
    kstMonday.setUTCDate(kstNow.getUTCDate() + mondayOffset);
    const mondayStr = kstMonday.toISOString().slice(0, 10);

    // cachedGalleryLogs는 30개로 제한되므로, 이번 주 전체 데이터를 Firestore에서 직접 조회
    let weekLogs = [];
    try {
        const weekSnap = await getDocs(query(
            collection(db, 'daily_logs'),
            where('date', '>=', mondayStr),
            orderBy('date', 'desc')
        ));
        weekSnap.forEach(d => weekLogs.push({ id: d.id, data: d.data() }));
    } catch (e) {
        // 쿼리 실패 시 캐시 폴백
        weekLogs = cachedGalleryLogs.filter(item => item.data.date >= mondayStr);
    }
    if (weekLogs.length === 0) {
        container.style.display = 'none';
        return;
    }

    // 유저별 집계 (days * 10 + reactions * 2 + comments * 3)
    const userMap = {};
    weekLogs.forEach(item => {
        const uid = item.data.userId;
        if (!uid) return;
        if (!userMap[uid]) {
            userMap[uid] = {
                name: item.data.userName || '익명',
                days: new Set(),
                reactions: 0,
                comments: 0,
                streak: item.data.currentStreak || 0,
                bestItem: null,
                bestItemScore: -1
            };
        }
        const u = userMap[uid];
        u.days.add(item.data.date);
        const rxCount = getUniqueReactionCount(item.data);
        const commentCount = getUniqueCommentCount(item.data);
        u.reactions += rxCount;
        u.comments += commentCount;
        // 가장 인기 있는 포스트를 썸네일로
        const itemScore = rxCount + commentCount;
        if (itemScore > u.bestItemScore) { u.bestItem = item; u.bestItemScore = itemScore; }
        // 최신 streak 반영
        if ((item.data.currentStreak || 0) > u.streak) u.streak = item.data.currentStreak;
    });

    const ranked = Object.values(userMap)
        .map(u => ({ ...u, daysCount: u.days.size, score: u.days.size * 10 + u.reactions * 2 + u.comments * 3 }))
        .filter(u => u.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    if (ranked.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = `
        <div class="gallery-insight-head">
            <div class="gallery-insight-kicker">WEEKLY SPOTLIGHT</div>
            <div class="gallery-insight-title-row">
                <div class="weekly-best-header">🏅 이번 주 열심 학생</div>
                <span class="gallery-insight-note">최근 7일</span>
            </div>
            <p class="gallery-insight-desc">이번 주 가장 꾸준하게 기록한 학생을 한눈에 보고, 좋은 흐름을 참고해보세요.</p>
        </div>
        <div class="weekly-best-list">`;
    ranked.forEach((u, idx) => {
        const medal = ['🥇', '🥈', '🥉'][idx];
        const name = escapeHtml(u.name);
        const streakEmoji = u.streak >= 100 ? '👑' : u.streak >= 60 ? '💎' : u.streak >= 30 ? '⭐' : u.streak >= 7 ? '🔥' : '';
        const streakHtml = streakEmoji ? `<span class="streak-badge">${streakEmoji} ${u.streak}일</span>` : '';

        // 썸네일 (가장 인기 있는 포스트 기준)
        const data = u.bestItem?.data || {};
        let thumbUrl = '';
        if (data.diet) {
            for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
                const t = data.diet[`${meal}ThumbUrl`] || data.diet[`${meal}Url`];
                if (t) { thumbUrl = t; break; }
            }
        }
        if (!thumbUrl && data.exercise) {
            thumbUrl = data.exercise.cardioImageThumbUrl || data.exercise.cardioImageUrl || '';
            if (!thumbUrl && data.exercise.cardioList?.length) thumbUrl = data.exercise.cardioList[0].imageThumbUrl || data.exercise.cardioList[0].imageUrl || '';
        }
        if (!thumbUrl && data.sleepAndMind?.sleepImageThumbUrl) thumbUrl = data.sleepAndMind.sleepImageThumbUrl;

        const safeThumb = thumbUrl ? escapeHtml(thumbUrl) : '';
        const thumbHtml = safeThumb ? `<img src="${safeThumb}" alt="이번 주 기록" loading="lazy">` : `<div class="best-no-img">📝</div>`;

        html += `<div class="weekly-best-item">
            <span class="best-medal">${medal}</span>
            <div class="best-thumb">${thumbHtml}</div>
            <div class="best-info">
                <span class="best-name-row">
                    <span class="best-name">${name}</span>
                    ${streakHtml}
                </span>
                <span class="best-stats">📅 ${u.daysCount}일 · ❤️ ${u.reactions} · 💬 ${u.comments}</span>
            </div>
            <span class="best-score">${u.score}점</span>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
}

// 스켈레톤 HTML 생성 (즉시 표시용)
function createSkeletonHtml(count = 3) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="gallery-card skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-avatar"></div>
                <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                    <div class="skeleton-text w60"></div>
                    <div class="skeleton-text w40"></div>
                </div>
            </div>
            <div class="gallery-skeleton">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>
        </div>`;
    }
    return html;
}

// 아이템에 미디어가 있는지 빠르게 판단 (HTML 생성 없이)
function hasMediaForFilter(data, filter) {
    if (filter === 'diet' || filter === 'all') {
        if (data.diet) {
            for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
                if (data.diet[`${meal}Url`]) { if (filter === 'diet') return true; else break; }
            }
            if (filter === 'all' && data.diet && ['breakfast', 'lunch', 'dinner', 'snack'].some(m => data.diet[`${m}Url`])) {
                // has diet
            }
        }
    }
    if (filter === 'exercise' || filter === 'all') {
        if (data.exercise) {
            if (data.exercise.cardioImageUrl || data.exercise.strengthVideoUrl ||
                data.exercise.cardioList?.length || data.exercise.strengthList?.length) {
                if (filter === 'exercise') return true;
            }
        }
    }
    if (filter === 'mind' || filter === 'all') {
        if (data.sleepAndMind?.sleepImageUrl || data.sleepAndMind?.gratitude) {
            if (filter === 'mind') return true;
        }
    }
    if (filter === 'all') {
        const hasDiet = data.diet && ['breakfast', 'lunch', 'dinner', 'snack'].some(m => data.diet[`${m}Url`]);
        const hasExercise = data.exercise && (data.exercise.cardioImageUrl || data.exercise.strengthVideoUrl || data.exercise.cardioList?.length || data.exercise.strengthList?.length);
        const hasMind = data.sleepAndMind?.sleepImageUrl || data.sleepAndMind?.gratitude || data.sleepAndMind?.meditationDone;
        const hasSteps = data.steps?.count > 0;
        return !!(hasDiet || hasExercise || hasMind || hasSteps);
    }
    return false;
}

// 정렬+필터 캐시 갱신 (매번 재정렬/재필터 방지)
function refreshSortedFiltered() {
    if (!sortedFilteredDirty) return;
    const blockedUsers = window._blockedUsers || [];
    let sorted = [...cachedGalleryLogs].filter(item => !blockedUsers.includes(item.data.userId));
    // 유저 필터 적용
    if (galleryUserFilter) {
        sorted = sorted.filter(item => item.data.userId === galleryUserFilter.userId);
    }
    sorted.sort((a, b) => {
        const aDate = String(a?.data?.date || '');
        const bDate = String(b?.data?.date || '');
        const dateCompare = bDate.localeCompare(aDate);
        if (dateCompare !== 0) return dateCompare;

        const aFr = cachedMyFriends.includes(a.data.userId);
        const bFr = cachedMyFriends.includes(b.data.userId);
        if (aFr !== bFr) return aFr ? -1 : 1;

        return 0;
    });
    sortedFilteredCache = sorted.filter(item => hasMediaForFilter(item.data, galleryFilter));
    sortedFilteredDirty = false;
}

// Firestore에서 다음 페이지 가져오기 (커서 기반)
async function _loadMoreGalleryFromFirestore() {
    const user = auth.currentUser;
    if (!user || !galleryHasMore || !galleryLastDoc) return;
    if (cachedGalleryLogs.length >= MAX_CACHE_SIZE) { galleryHasMore = false; return; }
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30);
        const cutoffStr = cutoffDate.toISOString().split('T')[0];
        const q = query(collection(db, "daily_logs"),
            where("date", ">=", cutoffStr),
            orderBy("date", "desc"),
            startAfter(galleryLastDoc),
            limit(FIRESTORE_PAGE_SIZE));
        const snapshot = await getDocs(q);
        const newDocs = [];
        snapshot.forEach(d => { newDocs.push({ id: d.id, data: d.data() }); });
        if (newDocs.length > 0) {
            cachedGalleryLogs = [...cachedGalleryLogs, ...newDocs];
            galleryLastDoc = snapshot.docs[snapshot.docs.length - 1] || galleryLastDoc;
        }
        galleryHasMore = snapshot.size >= FIRESTORE_PAGE_SIZE && cachedGalleryLogs.length < MAX_CACHE_SIZE;
        sortedFilteredDirty = true;
    } catch (e) {
        console.error('[갤러리] 추가 로드 실패:', e);
    }
}

// observer 해제 헬퍼 (null 처리까지 함께)
function _disconnectGalleryObserver() {
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
        galleryIntersectionObserver = null;
    }
}

// observer 재연결 헬퍼 (항상 새 인스턴스로)
function _reconnectGalleryObserver() {
    _disconnectGalleryObserver();
    setupInfiniteScroll();
}

// 추가 아이템 로드 함수 (추가분만 append - 전체 재렌더 X)
async function loadMoreGalleryItems() {
    if (isLoadingMore) return;

    refreshSortedFiltered();
    const sentinel = document.getElementById('gallery-sentinel');

    if (galleryDisplayCount >= sortedFilteredCache.length) {
        // 렌더링할 캐시 소진 — Firestore에서 더 가져오기 시도
        if (galleryHasMore) {
            isLoadingMore = true;
            sentinel.style.display = 'block';
            await _loadMoreGalleryFromFirestore();
            refreshSortedFiltered();
            isLoadingMore = false;
            // 유저 필터 등으로 여전히 표시할 항목이 없어도 galleryHasMore이면 계속 시도
            if (galleryDisplayCount >= sortedFilteredCache.length) {
                if (galleryHasMore) {
                    loadMoreGalleryItems(); // 다음 페이지도 시도
                } else {
                    sentinel.style.display = 'none';
                    _disconnectGalleryObserver();
                }
            } else {
                loadMoreGalleryItems(); // 새 데이터로 이어서 렌더링
            }
        } else {
            sentinel.style.display = 'none';
            _disconnectGalleryObserver();
        }
        return;
    }

    isLoadingMore = true;

    // 추가분만 append (전체 재렌더 X)
    const container = document.getElementById('gallery-container');
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const start = galleryDisplayCount;
    const end = Math.min(start + LOAD_MORE, sortedFilteredCache.length);

    for (let i = start; i < end; i++) {
        appendGalleryFeedItem(container, sortedFilteredCache[i], i, myId);
    }

    galleryDisplayCount = end;
    isLoadingMore = false;

    if (galleryDisplayCount >= sortedFilteredCache.length && !galleryHasMore) {
        sentinel.style.display = 'none';
        _disconnectGalleryObserver();
    } else {
        sentinel.style.display = 'block';
    }
}

// 아이템이 표시되어야 하는지 판단 (HTML 생성 없이 빠르게)
function shouldShowItem(data) {
    return !!hasMediaForFilter(data, galleryFilter);
}

// 메모리 누수 방지: 모든 리소스 정리
function cleanupGalleryResources() {
    // Intersection Observer 정리
    _disconnectGalleryObserver();

    // 갤러리 캠시 초기화 (로그아웃 시 재로드 보장)
    cachedGalleryLogs = [];
    galleryLastDoc = null; galleryHasMore = false;
    sortedFilteredCache = [];
    sortedFilteredDirty = true;
    galleryDisplayCount = 0;
    isLoadingMore = false;
}
window.cleanupGalleryResources = cleanupGalleryResources;

let _galleryLoadingPromise = null; // 중복 로드 방지 + 완료 대기용

async function loadGalleryData(forceReload = false) {
    if (forceReload) { cachedGalleryLogs = []; galleryLastDoc = null; galleryHasMore = false; }

    if (_galleryLoadingPromise) {
        // 백그라운드 로드 완료 대기 후 캐시에서 즉시 렌더링
        await _galleryLoadingPromise;
        return _loadGalleryDataInner(); // 캐시 있으면 fetch 스킵, 렌더링만
    }

    _galleryLoadingPromise = _loadGalleryDataInner().finally(() => {
        _galleryLoadingPromise = null;
    });
    return _galleryLoadingPromise;
}

// Firestore REST API로 갤러리 데이터 직접 조회 (비로그인 cold start 대응)
async function _fetchGalleryViaRest(cutoffStr, limitCount) {
    const projectId = 'habitschool-8497b';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = {
        structuredQuery: {
            from: [{ collectionId: 'daily_logs' }],
            where: {
                fieldFilter: {
                    field: { fieldPath: 'date' },
                    op: 'GREATER_THAN_OR_EQUAL',
                    value: { stringValue: cutoffStr }
                }
            },
            orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
            limit: limitCount
        }
    };
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`REST API ${resp.status}`);
    const results = await resp.json();
    const logsArray = [];
    for (const item of results) {
        if (!item.document) continue;
        const docPath = item.document.name;
        const docId = docPath.split('/').pop();
        logsArray.push({ id: docId, data: _convertFirestoreFields(item.document.fields || {}) });
    }
    return logsArray;
}

// Firestore REST 응답 필드를 JS 객체로 변환
function _convertFirestoreFields(fields) {
    const result = {};
    for (const [key, val] of Object.entries(fields)) {
        result[key] = _convertFirestoreValue(val);
    }
    return result;
}

function _convertFirestoreValue(val) {
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('nullValue' in val) return null;
    if ('timestampValue' in val) return val.timestampValue;
    if ('mapValue' in val) return _convertFirestoreFields(val.mapValue.fields || {});
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(v => _convertFirestoreValue(v));
    return null;
}

async function _loadGalleryDataInner() {
    const container = document.getElementById('gallery-container');
    const user = auth.currentUser;
    const myId = user ? user.uid : "";

    try {
    // 게스트 모드: 공유 카드/활동 요약 숨김, CTA 배너 표시
    const shareContainer = document.getElementById('my-share-container');
    const activitySummary = document.getElementById('gallery-activity-summary');
    if (!user) {
        if (shareContainer) shareContainer.style.display = 'none';
        setShareSettingsExpanded(false);
        if (activitySummary) activitySummary.style.display = 'none';
    }

    if (cachedGalleryLogs.length === 0) {
        // 즉시 스켈레톤 표시 (체감 로딩 0ms)
        container.innerHTML = createSkeletonHtml(4);

        // 친구 관계 원장 fetch를 백그라운드에서 시작 (갤러리 fetch와 병렬)
        const friendsPromise = user
            ? loadMyFriendships()
                .catch(e => console.warn('친구 관계 조회 실패 (무시):', e.message))
            : Promise.resolve();

        let retries = 0;

        // 비로그인: Firestore SDK가 cold start에서 서버 연결 실패 → REST API로 직접 조회
        if (!user) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];
            while (retries < 3) {
                try {
                    const logsArray = await _fetchGalleryViaRest(cutoffStr, MAX_CACHE_SIZE);
                    cachedGalleryLogs = logsArray;
                    sortedFilteredDirty = true;
                    break;
                } catch (e) {
                    retries++;
                    console.warn(`REST 갤러리 로드 재시도 (${retries}/3):`, e.message);
                    if (retries < 3) {
                        await new Promise(r => setTimeout(r, 200 * retries));
                    } else {
                        container.innerHTML = '<div style="text-align:center; padding:40px 20px;"><p style="font-size:15px; color:#666; margin-bottom:16px;">갤러리를 불러오는 중 문제가 발생했습니다.<br>잠시 후 다시 시도해주세요.</p><button class="google-btn" style="margin:0 auto;" onclick="loadGalleryData(true)">🔄 다시 시도</button></div>';
                        return;
                    }
                }
            }
        } else {
        // 로그인: SDK 사용 (캐시 활용 가능)
        while (retries < 3) {
            try {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 30);
                const cutoffStr = cutoffDate.toISOString().split('T')[0];
                const q = query(collection(db, "daily_logs"), where("date", ">=", cutoffStr), orderBy("date", "desc"), limit(FIRESTORE_PAGE_SIZE));
                const snapshot = await getDocs(q);

                let logsArray = [];
                snapshot.forEach(d => { logsArray.push({ id: d.id, data: d.data() }); });
                cachedGalleryLogs = logsArray;
                galleryLastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
                galleryHasMore = snapshot.size >= FIRESTORE_PAGE_SIZE;
                sortedFilteredDirty = true;
                break;
            } catch (e) {
                retries++;
                console.warn(`갤러리 데이터 로드 재시도 (${retries}/3):`, e.message);
                if (retries < 3) {
                    await new Promise(r => setTimeout(r, 200 * retries));
                } else {
                    console.error('갤러리 데이터 로드 실패:', e);
                    container.innerHTML = '<div style="text-align:center; padding:40px 20px;"><p style="font-size:15px; color:#666; margin-bottom:16px;">갤러리를 불러오는 중 문제가 발생했습니다.<br>잠시 후 다시 시도해주세요.</p><button class="google-btn" style="margin:0 auto;" onclick="loadGalleryData()">🔄 다시 시도</button></div>';
                    return;
                }
            }
        }
        }

        // 친구 목록 완료 대기 (보통 이미 완료됨)
        await friendsPromise;

        // 공유 카드는 비동기로 뒤에서 로드 (갤러리 피드 먼저 표시)
        buildShareCardAsync(myId, user);
    }

    // 피드 즉시 렌더링
    galleryDisplayCount = 0;
    container.innerHTML = '';

    refreshSortedFiltered();
    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);

    for (let i = 0; i < end; i++) {
        appendGalleryFeedItem(container, sortedFilteredCache[i], i, myId);
    }

    galleryDisplayCount = end;

    const sentinel = document.getElementById('gallery-sentinel');
    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
    } else {
        sentinel.style.display = 'block';
    }

    if (sortedFilteredCache.length === 0) {
        container.innerHTML = getEmptyStateHtml(galleryFilter);
    }

    renderGalleryHeroStats(myId);
    // 갤러리 반응 요약 배너
    renderActivitySummary(myId);
    buildWeeklyBestSection().catch(() => {});
    setupInfiniteScroll();
    } catch (e) {
        console.error('갤러리 렌더링 중 오류:', e);
        if (container) {
            container.innerHTML = '<div style="text-align:center;padding:40px 20px;">' +
                '<p style="font-size:15px;color:#666;margin-bottom:16px;">갤러리를 불러오는 중 문제가 발생했습니다.<br>잠시 후 다시 시도해주세요.</p>' +
                '<button class="google-btn" style="margin:0 auto;" onclick="loadGalleryData(true)">🔄 다시 시도</button></div>';
        }
    }
}

// 공유 카드 비동기 로드 (갤러리 피드 렌더링 차단하지 않음)
async function buildShareCardAsync(myId, user, overrideSettings = null) {
    try {
        const latest = user ? getCurrentShareLog(myId)?.data || null : null;
        const settings = normalizeShareSettings(overrideSettings || latest?.shareSettings || _shareSettingsDraft);
        const template = getCurrentShareTemplate();

        if (!latest || !user) {
            _latestPreparedShareMedia = [];
            _latestPreparedShareSignature = '';
            _latestShareRenderKey = '';
            replaceSharePreviewUrl(null);
            latestShareBlob = null;
            latestShareFile = null;
            latestShareText = '';
            latestShareCaption = '';
            const previewThumb = document.getElementById('share-preview-thumb');
            if (previewThumb) previewThumb.src = '';
            renderShareCardState(user, latest, settings, { template });
            updateGalleryPrimaryAction();
            return;
        }

        const buildToken = ++_shareCardBuildToken;
        renderShareCardState(user, latest, settings, { template });
        const preparedMedia = await ensurePreparedShareMedia(latest, settings);
        const renderKey = buildShareRenderKey(latest, settings, template, preparedMedia);

        if (renderKey === _latestShareRenderKey && latestShareBlob && _latestSharePreviewDataUrl) {
            const previewThumb = document.getElementById('share-preview-thumb');
            if (previewThumb) previewThumb.src = _latestSharePreviewDataUrl;
            renderShareCardState(user, latest, settings, {
                previewDataUrl: _latestSharePreviewDataUrl,
                template
            });
            updateGalleryPrimaryAction();
            return;
        }

        const asset = await createSharePosterAsset(user, latest, settings, template, preparedMedia);
        if (buildToken !== _shareCardBuildToken) return;

        _latestShareRenderKey = renderKey;
        latestShareBlob = asset.blob;
        latestShareFile = new File([asset.blob], `haebit_cert_${Date.now()}.png`, { type: 'image/png' });
        latestShareCaption = buildShareCaption();
        latestShareText = buildShareCopyText();
        const previewUrl = replaceSharePreviewUrl(asset.blob);

        const previewThumb = document.getElementById('share-preview-thumb');
        if (previewThumb) previewThumb.src = previewUrl;

        renderShareCardState(user, latest, settings, {
            previewDataUrl: previewUrl,
            template
        });
        updateGalleryPrimaryAction();
    } catch (e) {
        console.warn('공유 카드 로드 실패:', e.message);
        document.getElementById('my-share-container').style.display = 'none';
        setShareSettingsExpanded(false);
        updateGalleryPrimaryAction();
    }
}

// 인스타그램 스타일: 내 게시물에 달린 반응/댓글 요약 배너 (새 알림 포함)
function renderActivitySummary(myId) {
    const summaryEl = document.getElementById('gallery-activity-summary');
    if (!summaryEl || !myId) { if (summaryEl) summaryEl.style.display = 'none'; return; }

    let totalHeart = 0, totalFire = 0, totalClap = 0, totalComments = 0;
    let totalPosts = 0;
    cachedGalleryLogs.forEach(item => {
        if (item.data.userId !== myId) return;
        totalPosts += 1;
        const rx = item.data.reactions || {};
        // 자기 자신 반응 제외
        totalHeart += (rx.heart || []).filter(uid => uid !== myId).length;
        totalFire += (rx.fire || []).filter(uid => uid !== myId).length;
        totalClap += (rx.clap || []).filter(uid => uid !== myId).length;
        const comments = item.data.comments || [];
        totalComments += comments.filter(c => c.userId !== myId).length;
    });

    const total = totalHeart + totalFire + totalClap + totalComments;
    if (total === 0) {
        summaryEl.style.display = 'none';
        return;
    }

    // 새 알림 추적
    const storageKey = `gallery_last_seen_${myId}`;
    const lastSeen = parseInt(localStorage.getItem(storageKey) || '0');
    const newCount = Math.max(0, total - lastSeen);

    let parts = [];
    if (totalHeart > 0) parts.push(`<span class="summary-item">❤️ ${totalHeart}</span>`);
    if (totalFire > 0) parts.push(`<span class="summary-item">🔥 ${totalFire}</span>`);
    if (totalClap > 0) parts.push(`<span class="summary-item">👏 ${totalClap}</span>`);
    if (totalComments > 0) parts.push(`<span class="summary-item">💬 ${totalComments}</span>`);

    const newBadge = newCount > 0 ? `<span class="new-reaction-badge">+${newCount} 새 반응!</span>` : '';

    summaryEl.innerHTML = `
        <div class="gallery-insight-head">
            <div class="gallery-insight-kicker">MY REACTIONS</div>
            <div class="gallery-insight-title-row">
                <div class="weekly-best-header">내 게시물 반응</div>
                ${newBadge}
            </div>
            <p class="gallery-insight-desc">최근 30일 동안 공유한 기록 ${totalPosts}건에 쌓인 반응이에요.</p>
        </div>
        <div class="summary-content">
            <div class="summary-label">받은 반응</div>
            <div class="summary-stats">${parts.join('')}</div>
        </div>
    `;
    summaryEl.style.display = 'flex';
    summaryEl.onclick = function () {
        localStorage.setItem(storageKey, String(total));
        const badge = summaryEl.querySelector('.new-reaction-badge');
        if (badge) badge.remove();
    };
}

// 댓글 추가
window.addComment = async function (docId) {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }
    const input = document.getElementById(`comment-input-${docId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 200) { showToast('댓글은 200자까지 가능합니다.'); return; }

    try {
        const logRef = doc(db, "daily_logs", docId);
        const newComment = {
            userId: user.uid,
            userName: getUserDisplayName(),
            text: sanitizeText(text),
            timestamp: Date.now()
        };
        await setDoc(logRef, { comments: arrayUnion(newComment) }, { merge: true });
        input.value = '';

        // 로컬 캐시 업데이트 & 댓글만 다시 렌더
        const item = cachedGalleryLogs.find(l => l.id === docId);
        if (item) {
            if (!item.data.comments) item.data.comments = [];
            item.data.comments.push(newComment);
            renderCommentList(docId, item.data.comments);
        }
        // 요약 배너 업데이트
        renderActivitySummary(user.uid);
    } catch (e) {
        console.error('댓글 추가 오류:', e);
        showToast('댓글 추가에 실패했습니다.');
    }
};

// 댓글 삭제 (본인만)
window.deleteComment = async function (docId, commentIdx) {
    const user = auth.currentUser;
    if (!user) return;
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (!item || !item.data.comments) return;
    const comment = item.data.comments[commentIdx];
    if (!comment || comment.userId !== user.uid) { showToast('본인 댓글만 삭제할 수 있습니다.'); return; }
    if (!confirm('이 댓글을 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.')) return;

    try {
        const logRef = doc(db, "daily_logs", docId);
        await setDoc(logRef, { comments: arrayRemove(comment) }, { merge: true });
        item.data.comments.splice(commentIdx, 1);
        renderCommentList(docId, item.data.comments);
        renderActivitySummary(user.uid);
    } catch (e) {
        console.error('댓글 삭제 오류:', e);
        showToast('댓글 삭제에 실패했습니다.');
    }
};

// 댓글 더보기 토글
window.toggleComments = function (docId) {
    const list = document.getElementById(`comment-list-${docId}`);
    if (!list) return;
    const isExpanded = list.dataset.expanded === 'true';
    list.dataset.expanded = isExpanded ? 'false' : 'true';
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (item) renderCommentList(docId, item.data.comments || []);
};

const COMMENT_COLLAPSED_LIMIT = 5;

function getVisibleCommentEntries(comments, isExpanded) {
    const safeComments = Array.isArray(comments) ? comments : [];
    if (isExpanded || safeComments.length <= COMMENT_COLLAPSED_LIMIT) {
        return safeComments.map((comment, index) => ({ comment, index }));
    }
    const startIndex = Math.max(0, safeComments.length - COMMENT_COLLAPSED_LIMIT);
    return safeComments.slice(startIndex).map((comment, offset) => ({ comment, index: startIndex + offset }));
}

// 댓글 목록 렌더링
function renderCommentList(docId, comments) {
    const list = document.getElementById(`comment-list-${docId}`);
    if (!list) return;
    const myId = auth.currentUser ? auth.currentUser.uid : '';
    const isExpanded = list.dataset.expanded === 'true';
    const visibleComments = getVisibleCommentEntries(comments, isExpanded);

    let html = '';
    visibleComments.forEach(({ comment: c, index: idx }) => {
        const safeName = escapeHtml(c.userName || '익명');
        const safeText = escapeHtml(c.text || '');
        const timeStr = formatCommentTime(c.timestamp);
        const deleteBtn = c.userId === myId ? `<button class="comment-delete-btn" onclick="deleteComment('${escapeHtml(docId)}', ${idx})" title="삭제">✕</button>` : '';
        const reportBtn = c.userId && c.userId !== myId ? `<button class="comment-delete-btn" onclick="reportComment('${escapeHtml(docId)}', ${idx})" title="신고" style="color:#E53935;">⚑</button>` : '';
        html += `<div class="comment-item"><span class="comment-author">${safeName}</span><span class="comment-text">${safeText}</span><span class="comment-time">${timeStr}</span>${deleteBtn}${reportBtn}</div>`;
    });

    if (comments.length > COMMENT_COLLAPSED_LIMIT) {
        const toggleText = isExpanded ? '댓글 접기' : '댓글 모두 보기';
        html += `<button class="comment-toggle-btn" onclick="toggleComments('${escapeHtml(docId)}')">${toggleText}</button>`;
    }

    list.innerHTML = html;
    // 댓글 수 업데이트
    const countEl = document.getElementById(`comment-count-${docId}`);
    if (countEl) countEl.textContent = comments.length;
}

// 댓글 시간 포맷
function formatCommentTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 중복 코드 제거: 갤러리 미디어 수집 헬퍼 함수 (썸네일 우선)
function collectGalleryMedia(data) {
    const result = {
        dietHtml: '',
        exerciseHtml: '',
        mindHtml: '',
        mindText: ''
    };
    const shareSettings = normalizeShareSettings(data.shareSettings);

    // 식단 미디어 (썸네일 우선, 클릭 시 원본) - AI분석 오버레이 포함
    if (data.diet && !shareSettings.hideDiet) {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(meal => {
            const origUrl = data.diet[`${meal}Url`];
            const thumbUrl = data.diet[`${meal}ThumbUrl`];
            if (origUrl && isValidStorageUrl(origUrl)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(origUrl);
                const full = escapeHtml(origUrl);
                const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
                const hasAi = data.dietAnalysis && data.dietAnalysis[meal];
                const aiAttr = hasAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(data.dietAnalysis[meal]))))}"` : '';
                result.dietHtml += `<div class="gallery-media-wrapper"${aiAttr}>
                    <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="${meal} 식단 사진" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                    ${hasAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                    <div class="gallery-ai-overlay" style="display:none;"></div>
                </div>`;
            }
        });
    }

    // 운동 미디어 (중복 제거, 썸네일 우선) - AI분석 오버레이 포함
    if (data.exercise && !shareSettings.hideExercise) {
        let addedUrls = new Set();
        const addImg = (url, thumbUrl, aiAnalysis) => {
            if (url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
                const full = escapeHtml(url);
                const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
                const hasAi = aiAnalysis != null;
                const aiAttr = hasAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(aiAnalysis))))}"` : '';
                result.exerciseHtml += `<div class="gallery-media-wrapper"${aiAttr}>
                    <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="운동 인증 사진" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                    ${hasAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                    <div class="gallery-ai-overlay" style="display:none;"></div>
                </div>`;
                addedUrls.add(url);
            }
        };
        const addVid = (url, thumbUrl) => {
            if (url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const safeUrl = escapeHtml(url);
                if (thumbUrl && isValidStorageUrl(thumbUrl)) {
                    const safeThumb = escapeHtml(thumbUrl);
                    result.exerciseHtml += `<div class="gallery-media-wrapper video-thumb-wrapper" data-video-src="${safeUrl}" onclick="playGalleryVideo(this)">
                        <img src="${safeThumb}" alt="운동 영상 썸네일" loading="lazy" decoding="async" onerror="handleThumbFallback(this)">
                        <div class="video-play-btn">&#9654;</div>
                    </div>`;
                } else {
                    result.exerciseHtml += `<div class="gallery-media-wrapper video-thumb-wrapper" data-video-src="${safeUrl}" onclick="playGalleryVideo(this)">
                        <video src="${safeUrl}#t=0.1" preload="metadata" muted playsinline aria-label="운동 영상"></video>
                        <div class="video-play-btn">&#9654;</div>
                    </div>`;
                }
                addedUrls.add(url);
            }
        };

        addImg(data.exercise.cardioImageUrl, data.exercise.cardioImageThumbUrl, null);
        addVid(data.exercise.strengthVideoUrl, data.exercise.strengthVideoThumbUrl);
        if (data.exercise.cardioList) data.exercise.cardioList.forEach(c => addImg(c.imageUrl, c.imageThumbUrl, c.aiAnalysis));
        if (data.exercise.strengthList) data.exercise.strengthList.forEach(s => addVid(s.videoUrl, s.videoThumbUrl));
    }

    // 마음 미디어 (썸네일 우선) - 클릭 시 확대 + AI분석 오버레이
    if (data.sleepAndMind?.sleepImageUrl && !shareSettings.hideMind) {
        const url = data.sleepAndMind.sleepImageUrl;
        const thumbUrl = data.sleepAndMind.sleepImageThumbUrl;
        if (isValidStorageUrl(url)) {
            const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
            const full = escapeHtml(url);
            const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
            const hasSleepAi = data.sleepAndMind.sleepAnalysis != null;
            const sleepAiAttr = hasSleepAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(data.sleepAndMind.sleepAnalysis))))}"` : '';
            result.mindHtml = `<div class="gallery-media-wrapper"${sleepAiAttr}>
                <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="수면 기록 캡처" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                ${hasSleepAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                <div class="gallery-ai-overlay" style="display:none;"></div>
            </div>`;
        }
    }

    // 마음 텍스트
    if (data.sleepAndMind?.gratitude && !shareSettings.hideMind) {
        const safeGratitude = escapeHtml(data.sleepAndMind.gratitude);
        result.mindText = `<div style="font-size:13px; color:#555; background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:12px; font-style:italic;">💭 "${safeGratitude}"</div>`;
    }

    return result;
}

function getGalleryItemPointTotal(data) {
    const awarded = data.awardedPoints || {};
    const explicitTotal = (awarded.dietPoints || 0) + (awarded.exercisePoints || 0) + (awarded.mindPoints || 0);
    if (explicitTotal > 0) return explicitTotal;

    let fallbackTotal = 0;
    if (awarded.diet) fallbackTotal += 10;
    if (awarded.exercise) fallbackTotal += 15;
    if (awarded.mind) fallbackTotal += 5;
    return fallbackTotal;
}

function getGalleryTypeLabels(data, media) {
    const labels = [];
    if (media.dietHtml) labels.push('식단');
    if (media.exerciseHtml || (data.steps?.count || 0) > 0) labels.push('운동');
    if (media.mindHtml || media.mindText) labels.push('마음');
    return labels;
}

function getGalleryDateLabel(dateStr) {
    if (!dateStr || !dateStr.includes('-')) return dateStr || '';
    const [, month, day] = dateStr.split('-');
    return `${month}.${day}`;
}

function getGalleryDateSectionLabel(dateStr) {
    if (!dateStr) return '이전 자료';
    const { todayStr } = getDatesInfo();
    if (dateStr === todayStr) return '오늘 자료';

    const yesterdayStr = addDaysFromKstDateString(todayStr, -1);
    if (dateStr === yesterdayStr) return '어제 자료';

    const todayMid = new Date(`${todayStr}T12:00:00Z`);
    const targetMid = new Date(`${dateStr}T12:00:00Z`);
    const diffDays = Math.round((todayMid - targetMid) / 86400000);

    if (diffDays >= 2 && diffDays <= 6) return `${diffDays}일 전 자료`;

    const [, month, day] = dateStr.split('-');
    return `${month}/${day} 자료`;
}

function buildGalleryDateDivider(dateStr) {
    const divider = document.createElement('div');
    divider.className = 'gallery-date-divider';
    divider.innerHTML = `
        <span class="gallery-date-divider-label">${escapeHtml(getGalleryDateSectionLabel(dateStr))}</span>
        <span class="gallery-date-divider-line" aria-hidden="true"></span>
    `;
    return divider;
}

function appendGalleryFeedItem(container, item, index, myId) {
    if (!container || !item) return;

    const currentDate = item?.data?.date || '';
    const previousDate = index > 0 ? (sortedFilteredCache[index - 1]?.data?.date || '') : '';

    if (currentDate && currentDate !== previousDate) {
        container.appendChild(buildGalleryDateDivider(currentDate));
    }

    const card = buildGalleryCard(item, myId);
    if (card) container.appendChild(card);
}

function updateGalleryFeedHeader() {
    const titleEl = document.getElementById('gallery-feed-title');
    const descEl = document.getElementById('gallery-feed-desc');
    const kickerEl = document.getElementById('gallery-feed-kicker');
    if (!titleEl || !descEl || !kickerEl) return;

    if (galleryUserFilter) {
        titleEl.textContent = `${galleryUserFilter.userName}님의 최근 인증`;
        descEl.textContent = `최근 30일 ${sortedFilteredCache.length}건`;
        kickerEl.textContent = 'PERSONAL FEED';
        return;
    }

    const variants = {
        all: ['RECENT FEED', '모두의 최근 인증', ''],
        diet: ['DIET FEED', '식단 인증만 모아보기', ''],
        exercise: ['ACTIVE FEED', '운동 인증만 모아보기', ''],
        mind: ['MINDFUL FEED', '마음 기록만 모아보기', '']
    };

    const [kicker, title, desc] = variants[galleryFilter] || variants.all;
    kickerEl.textContent = kicker;
    titleEl.textContent = title;
    descEl.textContent = desc;
}

function renderGalleryHeroStats(myId) {
    const totalPostsEl = document.getElementById('gallery-total-posts');
    const totalMembersEl = document.getElementById('gallery-total-members');
    const myStreakEl = document.getElementById('gallery-my-streak');
    if (!totalPostsEl || !totalMembersEl || !myStreakEl) return;

    const visibleItems = sortedFilteredCache || [];
    const uniqueUsers = new Set(visibleItems.map(item => item.data?.userId).filter(Boolean));
    const myBestStreak = (cachedGalleryLogs || [])
        .filter(item => item.data?.userId === myId)
        .reduce((max, item) => Math.max(max, item.data?.currentStreak || 0), 0);

    totalPostsEl.textContent = String(visibleItems.length);
    totalMembersEl.textContent = String(uniqueUsers.size);
    myStreakEl.textContent = `${myBestStreak}일`;

    updateGalleryFeedHeader();
}

// 갤러리 카드 DOM 생성 (추출된 단일 카드 빌더)
function buildGalleryCard(item, myId) {
    const data = item.data;
    const shareSettings = normalizeShareSettings(data.shareSettings);
    const relationship = !shareSettings.hideIdentity ? getFriendRelationship(data.userId) : { status: 'hidden', id: '', name: '' };
    const isFriend = relationship.status === 'active';

    const media = collectGalleryMedia(data);
    let contentHtml = '';
    let shouldShow = false;

    if (galleryFilter === 'all') {
        const allMedia = media.dietHtml + media.exerciseHtml + media.mindHtml;
        if (allMedia) contentHtml += `<div class="gallery-photos">${allMedia}</div>`;
        if (media.mindText) contentHtml += media.mindText;
        if (allMedia || media.mindText) shouldShow = true;
    } else if (galleryFilter === 'diet') {
        if (media.dietHtml) { contentHtml += `<div class="gallery-photos">${media.dietHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'exercise') {
        if (media.exerciseHtml) { contentHtml += `<div class="gallery-photos">${media.exerciseHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'mind') {
        if (media.mindHtml) contentHtml += `<div class="gallery-photos">${media.mindHtml}</div>`;
        if (media.mindText) contentHtml += media.mindText;
        if (media.mindHtml || media.mindText) shouldShow = true;
    }

    if (!shouldShow) return null;

    const isGuest = !auth.currentUser;
    const rx = data.reactions || { heart: [], fire: [], clap: [] };
    const cHeart = rx.heart ? rx.heart.length : 0;
    const cFire = rx.fire ? rx.fire.length : 0;
    const cClap = rx.clap ? rx.clap.length : 0;
    const aHeart = rx.heart?.includes(myId) ? 'active' : '';
    const aFire = rx.fire?.includes(myId) ? 'active' : '';
    const aClap = rx.clap?.includes(myId) ? 'active' : '';

    const comments = data.comments || [];
    const commentCount = comments.length;
    const rawUserName = data.userName || '익명';
    const displayUserName = shareSettings.hideIdentity ? '익명 학생' : rawUserName;
    const safeName = escapeHtml(displayUserName);
    const safeUserId = escapeHtml(data.userId || '');
    const safeDocId = escapeHtml(item.id || '');
    const safeFilterName = escapeHtml(rawUserName);

    let commentsHtml = '';
    const showComments = getVisibleCommentEntries(comments, false);
    showComments.forEach(({ comment: c, index: idx }) => {
        const cName = escapeHtml(c.userName || '익명');
        const cText = escapeHtml(c.text || '');
        const cTime = formatCommentTime(c.timestamp);
        const delBtn = (!isGuest && c.userId === myId) ? `<button class="comment-delete-btn" onclick="deleteComment('${safeDocId}', ${idx})" title="삭제">✕</button>` : '';
        const reportBtn = (!isGuest && c.userId !== myId) ? `<button class="comment-delete-btn" onclick="reportComment('${safeDocId}', ${idx})" title="신고" style="color:#E53935;">⚑</button>` : '';
        commentsHtml += `<div class="comment-item"><span class="comment-author">${cName}</span><span class="comment-text">${cText}</span><span class="comment-time">${cTime}</span>${delBtn}${reportBtn}</div>`;
    });
    if (comments.length > COMMENT_COLLAPSED_LIMIT) {
        commentsHtml += `<button class="comment-toggle-btn" onclick="toggleComments('${safeDocId}')">댓글 모두 보기</button>`;
    }

    const avatarInitial = shareSettings.hideIdentity ? '익' : (rawUserName || '?').charAt(0);
    const pointTotal = getGalleryItemPointTotal(data);
    const typeLabels = getGalleryTypeLabels(data, media);
    const heartCountHtml = cHeart > 0 ? `<span class="action-count">${cHeart}</span>` : '';
    const fireCountHtml = cFire > 0 ? `<span class="action-count">${cFire}</span>` : '';
    const clapCountHtml = cClap > 0 ? `<span class="action-count">${cClap}</span>` : '';
    const commentCountHtml = commentCount > 0 ? `<span class="action-count" id="comment-count-${safeDocId}">${commentCount}</span>` : `<span class="action-count is-empty" id="comment-count-${safeDocId}"></span>`;
    const showPointBadge = !shareSettings.hidePoints && pointTotal > 0;
    const metaHtml = (showPointBadge || typeLabels.length > 0)
        ? `<div class="gallery-post-meta">
            ${showPointBadge ? `<span class="gallery-point-badge">${pointTotal}P</span>` : ''}
            ${typeLabels.length > 0 ? `<div class="gallery-type-tags">${typeLabels.map(label => `<span class="gallery-type-chip">${label}</span>`).join('')}</div>` : ''}
           </div>`
        : '';

    const streak = data.currentStreak || 0;
    const streakEmoji = streak >= 100 ? '👑' : streak >= 60 ? '💎' : streak >= 30 ? '⭐' : streak >= 7 ? '🔥' : '';
    const streakHtml = (!shareSettings.hideDate && streakEmoji) ? `<span class="streak-badge" title="${streak}일 연속 인증">${streakEmoji} ${streak}일</span>` : '';
    const relationshipHtml = relationship.status === 'active'
        ? '<span class="gallery-relationship-chip">친구</span>'
        : relationship.status === 'pending'
            ? '<span class="gallery-relationship-chip">요청 중</span>'
            : '';
    const dateHtml = shareSettings.hideDate ? '' : `<span class="gallery-date">${getGalleryDateLabel(data.date)}</span>`;
    const statusRowHtml = (relationshipHtml || streakHtml || dateHtml)
        ? `<div class="gallery-status-row">${relationshipHtml}${streakHtml}${dateHtml}</div>`
        : '';

    const friendBtnHtml = (isGuest || shareSettings.hideIdentity)
        ? ''
        : (() => {
            if (data.userId === myId) return '';
            if (relationship.status === 'active') {
                return `<button class="friend-btn is-friend is-remove" onclick="toggleFriend('${safeUserId}')">친구 삭제</button>`;
            }
            if (relationship.status === 'pending') {
                const friendship = findFriendshipById(relationship.id);
                if (friendship?.pendingForUid === myId) {
                    return `<button class="friend-btn is-incoming" onclick="toggleFriend('${safeUserId}')">수락하기</button>`;
                }
                return `<button class="friend-btn is-pending" disabled>신청중</button>`;
            }
            return `<button class="friend-btn" onclick="toggleFriend('${safeUserId}')">+ 친구</button>`;
        })();

    let postMenuHtml = '';
    if (!isGuest) {
        if (data.userId === myId) {
            postMenuHtml = `<div class="post-menu-container">
                <button class="post-menu-btn" onclick="togglePostMenu(this)" aria-label="게시물 메뉴">⋯</button>
                <div class="post-menu-dropdown" style="display:none;">
                    <button onclick="deleteGalleryPost('${safeDocId}')">피드 삭제</button>
                </div>
            </div>`;
        } else {
            postMenuHtml = `<div class="post-menu-container">
                <button class="post-menu-btn" onclick="togglePostMenu(this)" aria-label="게시물 메뉴">⋯</button>
                <div class="post-menu-dropdown" style="display:none;">
                    <button onclick="reportPost('${safeDocId}', '${safeUserId}')">피드 신고</button>
                    <button onclick="blockUser('${safeUserId}', '${safeName}')">사용자 숨기기</button>
                </div>
            </div>`;
        }
    }

    const actionsHtml = isGuest
        ? `<div class="gallery-actions guest-actions">
            <span class="action-btn"><span class="action-icon">❤️</span><span class="action-label">좋아요</span>${heartCountHtml}</span>
            <span class="action-btn"><span class="action-icon">🔥</span><span class="action-label">격려</span>${fireCountHtml}</span>
            <span class="action-btn"><span class="action-icon">👏</span><span class="action-label">응원</span>${clapCountHtml}</span>
            <span class="action-btn"><span class="action-icon">💬</span><span class="action-label">댓글</span>${commentCountHtml}</span>
            </div>`
        : `<div class="gallery-actions">
            <button class="action-btn ${aHeart}" onclick="toggleReaction('${safeDocId}', 'heart', this)"><span class="action-icon">❤️</span><span class="action-label">좋아요</span>${heartCountHtml}</button>
            <button class="action-btn ${aFire}" onclick="toggleReaction('${safeDocId}', 'fire', this)"><span class="action-icon">🔥</span><span class="action-label">격려</span>${fireCountHtml}</button>
            <button class="action-btn ${aClap}" onclick="toggleReaction('${safeDocId}', 'clap', this)"><span class="action-icon">👏</span><span class="action-label">응원</span>${clapCountHtml}</button>
            <button class="action-btn comment-btn" onclick="document.getElementById('comment-input-${safeDocId}').focus()"><span class="action-icon">💬</span><span class="action-label">댓글</span>${commentCountHtml}</button>
            </div>`;

    const commentSectionHtml = isGuest
        ? (commentsHtml ? `<div class="comment-section"><div class="comment-list" id="comment-list-${safeDocId}" data-expanded="false">${commentsHtml}</div></div>` : '')
        : `<div class="comment-section">
            <div class="comment-list" id="comment-list-${safeDocId}" data-expanded="false">
                ${commentsHtml}
            </div>
            <div class="comment-input-wrap">
                <input type="text" class="comment-input" id="comment-input-${safeDocId}" placeholder="댓글 달기..." maxlength="200" onkeydown="if(event.key==='Enter')addComment('${safeDocId}')">
                <button class="comment-submit-btn" onclick="addComment('${safeDocId}')">게시</button>
            </div>
           </div>`;

    const headerActionAttr = shareSettings.hideIdentity
        ? ''
        : `onclick="setGalleryUserFilter('${safeUserId}','${safeFilterName}')" style="cursor:pointer;" title="게시물만 보기"`;

    const headerActionsHtml = (friendBtnHtml || postMenuHtml)
        ? `<div class="gallery-header-actions">${friendBtnHtml}${postMenuHtml}</div>`
        : '';

    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
        <div class="gallery-header">
            <div class="gallery-avatar" ${headerActionAttr}>${avatarInitial}</div>
            <div class="gallery-header-info" ${headerActionAttr}>
                <div class="gallery-name-row">
                    <span class="gallery-name">${safeName}</span>
                </div>
                ${statusRowHtml}
            </div>
            ${headerActionsHtml}
        </div>
        ${metaHtml}
        ${contentHtml}
        ${actionsHtml}
        ${commentSectionHtml}
    `;
    return card;
}

// 피드 렌더링 (필터 변경 시 전체 재빌드 - 캐시 활용)
function renderFeedOnly() {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const sentinel = document.getElementById('gallery-sentinel');

    refreshSortedFiltered();
    renderGalleryHeroStats(myId);

    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);

    for (let i = 0; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }

    galleryDisplayCount = end;

    const noMoreToShow = galleryDisplayCount >= sortedFilteredCache.length && !galleryHasMore;
    if (noMoreToShow || sortedFilteredCache.length === 0) {
        sentinel.style.display = 'none';
        _disconnectGalleryObserver();
    } else {
        sentinel.style.display = 'block';
        _reconnectGalleryObserver(); // 필터 변경/해제 후 항상 새 observer
    }

    if (sortedFilteredCache.length === 0) {
        container.innerHTML = getEmptyStateHtml(galleryFilter);
    }
}

function initGalleryVideoThumbs() {
    const videos = document.querySelectorAll('.video-thumb-wrapper video');
    videos.forEach(video => {
        if (video.dataset.thumbReady === '1') return;
        video.dataset.thumbReady = '1';

        const setFrame = () => {
            try { video.currentTime = 0.1; } catch (_) { }
        };

        if (video.readyState >= 2) {
            setFrame();
        } else {
            video.addEventListener('loadeddata', setFrame, { once: true });
        }
    });
}

// 접근성: 키보드 네비게이션 지원
document.addEventListener('keydown', function (e) {
    // Escape 키로 모달/라이트박스 닫기
    if (e.key === 'Escape' || e.key === 'Esc') {
        const lightbox = document.getElementById('lightbox-modal');
        const levelModal = document.getElementById('level-modal');
        const guideModal = document.getElementById('guide-modal');

        if (lightbox && lightbox.style.display === 'flex') {
            const video = document.getElementById('lightbox-video');
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.style.display = 'none';
            }
            const img = document.getElementById('lightbox-img');
            if (img) img.style.display = 'block';
            lightbox.style.display = 'none';
            e.preventDefault();
        } else if (levelModal && levelModal.style.display === 'flex') {
            levelModal.style.display = 'none';
            e.preventDefault();
        } else if (guideModal && guideModal.style.display === 'flex') {
            guideModal.style.display = 'none';
            e.preventDefault();
        }
    }

    // Tab 트랩 방지: 라이트박스 활성화 시에도 Tab 이동 가능하도록
    if (e.key === 'Tab') {
        const lightbox = document.getElementById('lightbox-modal');
        if (lightbox && lightbox.style.display === 'flex') {
            // 라이트박스가 열려있을 때는 포커스가 라이트박스 내부에만 있도록
            e.preventDefault();
            lightbox.focus();
        }
    }
});

// 접근성: point-badge에 Enter 키 지원
const pointBadge = document.getElementById('point-badge-ui');
if (pointBadge) {
    pointBadge.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
        }
    });
}

// 접근성: 라이트박스에 클릭 시 닫기 & 포커스 설정
const lightboxModal = document.getElementById('lightbox-modal');
if (lightboxModal) {
    lightboxModal.setAttribute('role', 'dialog');
    lightboxModal.setAttribute('aria-label', '미디어 확대 보기');
    lightboxModal.setAttribute('tabindex', '-1');

    lightboxModal.addEventListener('click', function () {
        const video = document.getElementById('lightbox-video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.style.display = 'none';
        }
        const img = document.getElementById('lightbox-img');
        if (img) img.style.display = 'block';
    });

    // 라이트박스 열릴 때 포커스 설정
    const originalOpenLightbox = window.openLightbox;
    window.openLightbox = function (url) {
        originalOpenLightbox(url);
        setTimeout(() => lightboxModal.focus(), 100);
    };
}

// ==========================
// AI 식단 분석 + 온보딩 + 대사건강 점수
// ==========================

// 식단 사진 AI 분석
async function analyzeMealPhoto(meal) {
    if (!checkRateLimit('analyzeMealPhoto', 3000)) {
        showToast('⏳ 잠시 후 다시 시도해주세요.');
        return;
    }
    const previewImg = document.getElementById(`preview-${meal}`);
    const resultContainer = document.getElementById(`diet-analysis-${meal}`);
    const btn = document.querySelector(`.diet-ai-btn[data-meal="${meal}"]`);

    if (!previewImg || previewImg.style.display === 'none') {
        showToast('⚠️ 먼저 사진을 올려주세요.');
        return;
    }

    // 이미 분석 결과가 있는 경우 토글
    if (resultContainer._analysisData || resultContainer.innerHTML.trim() !== '') {
        if (resultContainer.style.display === 'none') {
            resultContainer.style.display = 'block';
            btn.textContent = '🤖 분석 접기';
        } else {
            resultContainer.style.display = 'none';
            btn.textContent = '🤖 분석 보기';
        }
        return;
    }

    // Firebase Storage URL 확보: previewImg.src → _pendingUploads 완료 결과 → data-saved-url
    let imageUrl = previewImg.src;
    if (!imageUrl || imageUrl.startsWith('data:') || !isPersistedStorageUrl(imageUrl)) {
        // 새로 선택한 파일의 pre-upload 완료 여부 확인
        const inputId = `diet-img-${meal}`;
        const pending = _pendingUploads.get(inputId);
        if (pending) {
            if (!pending.done) {
                showToast('⏳ 사진 업로드 중입니다. 잠시 후 다시 시도해주세요.');
                return;
            }
            imageUrl = pending.result?.url || null;
        }
        // data-saved-url fallback
        if (!imageUrl || !isPersistedStorageUrl(imageUrl)) {
            imageUrl = previewImg.getAttribute('data-saved-url') || null;
        }
        if (!imageUrl || !isPersistedStorageUrl(imageUrl)) {
            showToast('⚠️ 사진을 먼저 저장한 후 분석해주세요.');
            return;
        }
    }

    // 로딩 상태
    if (btn) { btn.classList.add('loading'); btn.textContent = '🤖 AI 분석 중...'; }

    try {
        const analysis = await requestDietAnalysis(imageUrl);
        if (analysis) {
            renderDietAnalysisResult(resultContainer, analysis);
            resultContainer._analysisData = analysis;
            resultContainer.style.display = 'block';
            btn.textContent = '🤖 분석 접기';

            // Firestore에 분석 결과 저장
            const user = auth.currentUser;
            if (user) {
                const selectedDateStr = document.getElementById('selected-date').value;
                const docId = `${user.uid}_${selectedDateStr}`;
                await setDoc(doc(db, "daily_logs", docId), {
                    dietAnalysis: { [meal]: analysis }
                }, { merge: true });
                const cachedData = getCachedDailyLog(docId) || {};
                updateDailyLogCache(docId, {
                    ...cachedData,
                    dietAnalysis: {
                        ...(cachedData.dietAnalysis || {}),
                        [meal]: analysis
                    }
                });
            }
            showToast('✅ AI 식단 분석 완료!');
            updateDietDaySummary();
        }
    } catch (e) {
        console.error('식단 분석 오류:', e);
        showToast('⚠️ 식단 분석 중 오류가 발생했습니다.');
    } finally {
        if (btn && btn.textContent === '🤖 AI 분석 중...') {
            btn.classList.remove('loading'); 
            btn.textContent = '🤖 AI 분석'; 
        } else if (btn) {
            btn.classList.remove('loading');
        }
    }
};

// 사진 미리보기 표시 시 AI 분석 버튼도 표시
const originalPreviewStatic = window.previewStaticImage;
if (originalPreviewStatic) {
    // previewStaticImage가 호출된 후 AI 버튼 표시
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            if (m.type === 'attributes' && m.attributeName === 'style') {
                const el = m.target;
                if (el.classList.contains('preview-img') && el.style.display !== 'none' && el.src) {
                    const parent = el.closest('.diet-box');
                    if (parent) {
                        const aiBtn = parent.querySelector('.diet-ai-btn');
                        if (aiBtn) aiBtn.style.display = 'block';
                    }
                }
            }
        });
    });
    document.querySelectorAll('.preview-img').forEach(img => {
        observer.observe(img, { attributes: true, attributeFilter: ['style'] });
    });
}

// 오늘의 식단 총평 업데이트
function updateDietDaySummary() {
    const container = document.getElementById('diet-day-summary-container');
    if (!container) return;

    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    const analyses = [];
    meals.forEach(meal => {
        const resultEl = document.getElementById(`diet-analysis-${meal}`);
        if (resultEl && resultEl._analysisData) {
            analyses.push(resultEl._analysisData);
        }
    });
    renderDietDaySummary(container, analyses);
}

// 데이터 로드 시 기존 AI 분석 결과 복원
const originalLoadData = window.loadDataForSelectedDate;
window._restoreDietAnalysis = _restoreDietAnalysis;
function _restoreDietAnalysis(data) {
    if (!data) return;

    // 데이터 복원 시 사진 있는 박스는 보이기, 아니면 가리기
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    let lastShownIndex = -1;

    meals.forEach((meal, index) => {
        const mealUrls = {
            breakfast: data.diet?.breakfastUrl,
            lunch: data.diet?.lunchUrl,
            dinner: data.diet?.dinnerUrl,
            snack: data.diet?.snackUrl
        };
        const hasPhoto = mealUrls[meal];
        const box = document.getElementById(`diet-box-${meal}`);

        if (hasPhoto) {
            if (box) box.style.display = 'block';
            lastShownIndex = index;
        } else {
            if (box) box.style.display = 'none';
        }
    });

    // 아무것도 없는 경우 첫 번째 박스는 보여주기
    // 혹은 마지막으로 사진이 있는 박스 다음 박스는 보여주기 (수동 입력을 위해)
    if (lastShownIndex === -1) {
        const firstBox = document.getElementById(`diet-box-${meals[0]}`);
        if (firstBox) firstBox.style.display = 'block';
    } else if (lastShownIndex < meals.length - 1) {
        const nextBox = document.getElementById(`diet-box-${meals[lastShownIndex + 1]}`);
        if (nextBox) nextBox.style.display = 'block';
    }

    if (!data.dietAnalysis) return;

    meals.forEach(meal => {
        const analysis = data.dietAnalysis[meal];
        const resultContainer = document.getElementById(`diet-analysis-${meal}`);
        const aiBtn = document.querySelector(`.diet-ai-btn[data-meal="${meal}"]`);

        if (analysis && resultContainer) {
            renderDietAnalysisResult(resultContainer, analysis);
            resultContainer._analysisData = analysis;
            resultContainer.style.display = 'none'; // 분석결과는 처음에 접기
            if (aiBtn) {
                aiBtn.textContent = '🤖 분석 보기';
            }
        } else if (resultContainer) {
            resultContainer._analysisData = null;
            resultContainer.innerHTML = '';
            resultContainer.style.display = 'none';
            if (aiBtn) {
                aiBtn.textContent = '🤖 AI 분석';
            }
        }

        const mealUrls = {
            breakfast: data.diet?.breakfastUrl,
            lunch: data.diet?.lunchUrl,
            dinner: data.diet?.dinnerUrl,
            snack: data.diet?.snackUrl
        };
        if (mealUrls[meal] && aiBtn) {
            aiBtn.style.display = 'block';
        }
    });

    updateDietDaySummary();
};

// 온보딩 스텝 이동
function goOnboardingStep(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`ob-step-${i}`);
        const dot = document.getElementById(`ob-dot-${i}`);
        if (el) el.style.display = i === step ? 'block' : 'none';
        if (dot) dot.classList.toggle('active', i === step);
    }
};

// 온보딩 완료
async function completeOnboarding() {
    const user = auth.currentUser;
    if (!user) return;

    // 모달 즉시 닫기 (저장 실패해도 진행)
    document.getElementById('onboarding-modal').style.display = 'none';
    clearPendingSignupOnboardingState();
    showToast('🌞 환영합니다! 건강 습관 여정을 시작합니다!');

    try {
        await setDoc(doc(db, "users", user.uid), {
            onboardingComplete: true
        }, { merge: true });
    } catch (e) {
        console.warn('온보딩 저장 스킵:', e.message);
    }

    // 가입 축하 보너스 +200P
    try {
        const fn = httpsCallable(functions, 'awardWelcomeBonus');
        const res = await fn({});
        if (res.data?.success) showToast('🎁 가입 축하 포인트 200P가 지급되었습니다!');
    } catch (e) {
        console.warn('환영 보너스 지급 스킵:', e.message);
    }

    try { updateMetabolicScoreUI(); } catch (e) { /* skip */ }
};

// 대사건강 점수 UI 업데이트
async function updateMetabolicScoreUI() {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('metabolic-score-container');
    if (!container) return;

    try {
        // 사용자 프로필 로드
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const profile = userData.healthProfile || {};

        // 최근 7일 로그 로드
        const q = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(7));
        const snapshot = await getDocs(q);
        const recentLogs = [];
        snapshot.forEach(d => recentLogs.push(d.data()));
        recentLogs.reverse();

        // 최신 건강 지표
        const latestMetrics = recentLogs.length > 0 ? (recentLogs[recentLogs.length - 1].metrics || {}) : {};

        // 점수 계산
        const scoreData = calculateMetabolicScore(profile, recentLogs, latestMetrics);

        // UI 렌더링
        renderMetabolicScoreCard(container, scoreData);
    } catch (e) {
        console.warn('대사건강 점수 로드 스킵:', e.message);
    }
};

// 온보딩 체크 (auth.js에서 호출 가능하도록)
async function checkOnboarding() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const isPendingSignup = hasPendingSignupOnboarding(user);
        const modal = document.getElementById('onboarding-modal');

        if (userData.onboardingComplete || userData.welcomeBonusGiven) {
            clearPendingSignupOnboardingState();
            if (modal) modal.style.display = 'none';
            return;
        }

        if (!isPendingSignup) {
            if (modal) modal.style.display = 'none';
            await setDoc(doc(db, "users", user.uid), {
                onboardingComplete: true
            }, { merge: true }).catch(() => {});
            clearPendingSignupOnboardingState();
            return;
        }

        if (modal) {
            modal.style.display = 'flex';
        }
    } catch (e) {
        console.warn('온보딩 체크 스킵:', e.message);
    }
};





// ========================================
// 수면 AI 분석
// ========================================
window.analyzeSleepData = async function() {
    const resultBox = document.getElementById('sleep-analysis-result');
    const aiBtn = document.getElementById('ai-btn-sleep');
    if (!resultBox) return;

    // 이미 분석 완료 → 토글
    if (aiBtn && aiBtn.getAttribute('data-analyzed') === 'true') {
        if (resultBox.style.display === 'none') {
            resultBox.style.display = 'block';
            aiBtn.textContent = '🤖 분석 접기';
        } else {
            resultBox.style.display = 'none';
            aiBtn.textContent = '🤖 분석 보기';
        }
        return;
    }

    // 저장된 수면 이미지 URL 또는 로컬 미리보기 확인
    const previewEl = document.getElementById('preview-sleep');
    let sleepUrl = previewEl?.getAttribute('data-url');
    if (!sleepUrl && previewEl?.src && previewEl.src.startsWith('data:')) {
        try { sleepUrl = await compressImageForAI(previewEl.src); } catch(e) { sleepUrl = previewEl.src; }
    }
    if (!sleepUrl && previewEl?.src && previewEl.src.startsWith('http')) {
        sleepUrl = previewEl.src;
    }
    if (!sleepUrl) {
        showToast('⚠️ 수면 캡처를 올려주세요.');
        return;
    }

    try {
        if (aiBtn) { aiBtn.classList.add('loading'); aiBtn.textContent = '🤖 AI 분석 중...'; }
        resultBox.style.display = 'block';
        resultBox.innerHTML = '<div style="text-align:center; padding:15px;"><div class="loading-spinner" style="display:inline-flex;"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div><p style="margin-top:8px; color:#888; font-size:12px;">수면 패턴 분석 중...</p></div>';

        const analysis = await requestSleepMindAnalysis(sleepUrl, null, 'sleep');
        if (analysis) {
            renderSleepMindAnalysisResult(analysis, resultBox);
            resultBox._analysisData = analysis;
            if (aiBtn) {
                aiBtn.textContent = '🤖 분석 접기';
                aiBtn.setAttribute('data-analyzed', 'true');
            }
            // Firestore에 수면 분석 결과 저장
            const user = auth.currentUser;
            if (user) {
                const selectedDateStr = document.getElementById('selected-date').value;
                const docId = `${user.uid}_${selectedDateStr}`;
                await setDoc(doc(db, "daily_logs", docId), {
                    sleepAndMind: { sleepAnalysis: analysis }
                }, { merge: true });
                const cachedData = getCachedDailyLog(docId) || {};
                updateDailyLogCache(docId, {
                    ...cachedData,
                    sleepAndMind: {
                        ...(cachedData.sleepAndMind || {}),
                        sleepAnalysis: analysis
                    }
                });
            }
        } else {
            resultBox.innerHTML = '<p style="color:#ef4444; padding:10px; font-size:13px;">분석 결과를 받지 못했습니다.</p>';
        }
    } catch (e) {
        console.error(e);
        resultBox.innerHTML = '<p style="color:#ef4444; padding:10px; font-size:13px;">분석 중 오류가 발생했습니다.</p>';
    } finally {
        if (aiBtn) aiBtn.classList.remove('loading');
    }
};

// ============================================================
// ============================================================
// 친구 초대 링크 복사 / 공유
// ============================================================
window.copyReferralLink = function(inputId) {
    const id = inputId || 'referral-link-display';
    const input = document.getElementById(id);
    if (!input || !input.value) return;
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('📋 초대 링크가 복사되었습니다!');
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('📋 초대 링크가 복사되었습니다!');
    });
};

window.shareReferralLink = function(platform) {
    const url = document.getElementById('profile-invite-link')?.value
             || document.getElementById('referral-link-display')?.value
             || '';
    if (!url) { showToast('초대 링크를 불러오는 중입니다. 잠시 후 다시 시도해주세요.'); return; }
    const title = '해빛스쿨 - 즐겁게 좋은 습관 만들기';
    const text = '매일 식단·운동·수면을 기록하고 HBT 토큰도 받아요! 초대 링크를 열면 신규 가입 보너스와 친구 연결이 이어져요 🎁';
    if (platform === 'kakao') {
        if (navigator.share) {
            // 모바일: 네이티브 공유 시트 (카카오톡 선택 가능)
            navigator.share({ title, text, url }).catch(e => {
                if (e.name !== 'AbortError') {
                    navigator.clipboard.writeText(url)
                        .then(() => showToast('📋 초대 링크가 복사되었습니다!\n카카오톡에 붙여넣기 해주세요.'));
                }
            });
        } else {
            // 데스크탑: 링크 복사 후 안내
            navigator.clipboard.writeText(url)
                .then(() => showToast('📋 초대 링크가 복사되었습니다!\n카카오톡 채팅창에 붙여넣기 해주세요.'));
        }
    } else {
        navigator.clipboard.writeText(url).then(() => showToast('📋 초대 링크가 복사되었습니다!'));
    }
};

// ============================================================
// 앱 소개 공유 (친구 초대)
// ============================================================
function shareApp(platform) {
    const url = `${APP_ORIGIN}/`;
    const title = '해빛스쿨 - 즐겁게 좋은 습관 만들기';
    const text = '매일 식단·운동·수면을 기록하고 HBT 토큰도 받는 건강 습관 앱! 🌞 함께 해봐요!';
    const encoded = encodeURIComponent;

    switch (platform) {
        case 'kakao':
            _ensureKakao().then(() => {
                Kakao.Share.sendDefault({
                    objectType: 'feed',
                    content: { title, description: text, imageUrl: APP_OG_IMAGE_URL, link: { mobileWebUrl: url, webUrl: url } },
                    buttons: [{ title: '시작하기', link: { mobileWebUrl: url, webUrl: url } }]
                });
            }).catch(() => {
                if (navigator.share) navigator.share({ title, text, url }).catch(() => {});
                else navigator.clipboard.writeText(url).then(() => showToast('📋 링크가 복사되었습니다!'));
            });
            break;
        case 'twitter':
            window.open(`https://twitter.com/intent/tweet?text=${encoded(text)}&url=${encoded(url)}`, '_blank', 'noopener');
            break;
        case 'naver':
            window.open(`https://blog.naver.com/openapi/share?url=${encoded(url)}&title=${encoded(title)}`, '_blank', 'noopener');
            break;
        case 'copy':
            navigator.clipboard.writeText(url).then(() => {
                showToast('📋 링크가 복사되었습니다!');
            }).catch(() => {
                showToast('⚠️ 복사에 실패했습니다. 직접 복사해 주세요.');
            });
            break;
    }
}

// ==========================================
// 걸음수 (Step Counter) 기능
// ==========================================

let _stepData = { count: 0, source: null, screenshotUrl: null, screenshotThumbUrl: null, imageHash: null, distance_km: null, calories: null, active_minutes: null };
let _stepScreenshotFile = null;

function updateStepRing(count, goal = 8000) {
    const pct = Math.min(count / goal, 1);
    const circumference = 2 * Math.PI * 52; // r=52
    const offset = circumference * (1 - pct);

    const ring = document.getElementById('step-ring-progress');
    if (ring) ring.setAttribute('stroke-dashoffset', offset);

    const display = document.getElementById('step-count-display');
    if (display) display.textContent = count.toLocaleString();

    updateRecordFlowGuides(getVisibleTabName());
}

function setManualSteps() {
    const input = document.getElementById('step-manual-input');
    const val = parseInt(input.value);
    if (!val || val <= 0) { showToast('⚠️ 올바른 걸음수를 입력하세요.'); return; }
    if (val > 200000) { showToast('⚠️ 걸음수가 너무 큽니다.'); return; }

    _stepData.count = val;
    _stepData.source = 'manual';
    _stepData.imageHash = null;
    _stepData.screenshotUrl = null;
    _stepData.screenshotThumbUrl = null;
    _activeNativeStepImport = null;
    updateStepRing(val);
    renderStepImportBanner();
    showToast(`👟 ${val.toLocaleString()}보 입력 완료!`);
}

async function handleStepScreenshot(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('⚠️ 이미지 파일만 업로드 가능합니다.'); return; }

    const user = auth.currentUser;
    if (!user) { showToast('⚠️ 로그인이 필요합니다.'); return; }

    _stepScreenshotFile = file;
    const preview = document.getElementById('preview-step-screenshot');
    const resultBox = document.getElementById('step-analysis-result');
    const screenshotBtn = document.querySelector('.step-screenshot-btn');

    // 프리뷰 즉시 표시 + 로딩 상태
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = 'block';
    };
    reader.readAsDataURL(file);

    if (screenshotBtn) {
        screenshotBtn.textContent = '🔄 인식 중...';
        screenshotBtn.style.pointerEvents = 'none';
    }

    try {
        // 1. Firebase Storage 업로드 (스크린샷은 압축 불필요)
        const timestamp = Date.now();
        const storagePath = `step_screenshots/${user.uid}/${timestamp}.jpg`;

        const imgRef = ref(storage, storagePath);
        await uploadBytes(imgRef, file);
        const downloadUrl = await getDownloadURL(imgRef);

        // 2. AI 분석 호출 (gemini-2.0-flash — 초고속)
        const result = await requestStepScreenshotAnalysis(downloadUrl);
        if (!result) {
            showToast('⚠️ 인식에 실패했습니다. 다시 시도해주세요.');
            return;
        }

        const { analysis, imageHash } = result;

        // 3. 중복 해시 체크
        const { todayStr } = getDatesInfo();
        const docId = `${user.uid}_${todayStr}`;
        const existingDoc = await getDoc(doc(db, "daily_logs", docId));
        if (existingDoc.exists()) {
            const existingHash = existingDoc.data()?.steps?.imageHash;
            if (existingHash && existingHash === imageHash) {
                showToast('⚠️ 이미 등록된 캡처입니다. 다른 캡처를 올려주세요.');
                return;
            }
        }

        // 4. 걸음수 데이터 업데이트
        _stepData = {
            count: analysis.steps || 0,
            source: 'samsung_screenshot',
            screenshotUrl: downloadUrl,
            screenshotThumbUrl: null,
            imageHash: imageHash,
            distance_km: analysis.distance_km || null,
            calories: analysis.calories || null,
            active_minutes: analysis.active_minutes || null
        };
        _activeNativeStepImport = null;

        updateStepRing(_stepData.count);
        renderStepImportBanner();

        // 5. 상세 정보 표시
        const detailsDiv = document.getElementById('step-details');
        if (detailsDiv) {
            detailsDiv.style.display = 'flex';
            document.getElementById('step-distance').textContent = analysis.distance_km ? `${analysis.distance_km} km` : '-';
            document.getElementById('step-calories').textContent = analysis.calories ? `${analysis.calories} kcal` : '-';
            document.getElementById('step-active-time').textContent = analysis.active_minutes ? `${analysis.active_minutes}분` : '-';
        }

        resultBox.style.display = 'block';
        resultBox.innerHTML = `
            <div class="step-result-row"><span class="step-result-label">걸음수</span><span class="step-result-value">${(analysis.steps || 0).toLocaleString()}보</span></div>
            ${analysis.distance_km ? `<div class="step-result-row"><span class="step-result-label">거리</span><span class="step-result-value">${analysis.distance_km} km</span></div>` : ''}
            ${analysis.calories ? `<div class="step-result-row"><span class="step-result-label">칼로리</span><span class="step-result-value">${analysis.calories} kcal</span></div>` : ''}
            <div class="step-result-row"><span class="step-result-label">앱</span><span class="step-result-value">${analysis.source === 'samsung_health' ? '삼성헬스' : analysis.source === 'apple_health' ? 'Apple 건강' : '기타'}</span></div>
            <p style="font-size:12px; color:#4CAF50; margin-top:8px;">✅ ${analysis.summary || '걸음수가 인식되었습니다.'}</p>
        `;

        showToast(`👟 ${(analysis.steps || 0).toLocaleString()}보 인식 완료!`);

    } catch (e) {
        console.error('걸음수 스크린샷 분석 오류:', e);
        showToast('⚠️ 분석에 실패했습니다. 다시 시도해주세요.');
    } finally {
        if (screenshotBtn) {
            screenshotBtn.innerHTML = '📱 삼성헬스 캡처<input type="file" id="step-screenshot-img" accept="image/*" style="display:none" onchange="handleStepScreenshot(this)">';
            screenshotBtn.style.pointerEvents = '';
        }
    }
}

// Legacy — kept for backward compat if button exists
async function analyzeStepScreenshot() {
    const fileInput = document.getElementById('step-screenshot-img');
    if (fileInput?.files[0]) await handleStepScreenshot(fileInput);
}

// 걸음수 데이터 로드 (날짜 변경 시)
function loadStepData(logData) {
    if (logData?.steps) {
        _stepData = { ...logData.steps };
        if (String(_stepData.source || '').trim() === 'health_connect') {
            const savedSyncedAt = Date.parse(_stepData.updatedAt || '');
            _activeNativeStepImport = {
                stepCount: Number.parseInt(_stepData.count, 10) || 0,
                stepSource: 'health_connect',
                nativeSource: '',
                syncedAtEpochMillis: Number.isFinite(savedSyncedAt) ? savedSyncedAt : 0
            };
        } else {
            _activeNativeStepImport = null;
        }
        updateStepRing(_stepData.count || 0);

        if (_stepData.screenshotUrl) {
            const preview = document.getElementById('preview-step-screenshot');
            if (preview) { preview.src = _stepData.screenshotUrl; preview.style.display = 'block'; }
        }

        const detailsDiv = document.getElementById('step-details');
        if (detailsDiv && (_stepData.distance_km || _stepData.calories || _stepData.active_minutes)) {
            detailsDiv.style.display = 'flex';
            const distEl = document.getElementById('step-distance');
            const calEl = document.getElementById('step-calories');
            const timeEl = document.getElementById('step-active-time');
            if (distEl) distEl.textContent = _stepData.distance_km ? `${_stepData.distance_km} km` : '-';
            if (calEl) calEl.textContent = _stepData.calories ? `${_stepData.calories} kcal` : '-';
            if (timeEl) timeEl.textContent = _stepData.active_minutes ? `${_stepData.active_minutes}분` : '-';
        }

        // 수동 입력 필드에도 값 표시
        const manualInput = document.getElementById('step-manual-input');
        if (manualInput && _stepData.count > 0) manualInput.value = _stepData.count;
    } else {
        _activeNativeStepImport = null;
        _stepData = { count: 0, source: null, screenshotUrl: null, screenshotThumbUrl: null, imageHash: null, distance_km: null, calories: null, active_minutes: null };
        updateStepRing(0);
        const preview = document.getElementById('preview-step-screenshot');
        if (preview) { preview.src = ''; preview.style.display = 'none'; }
        const detailsDiv = document.getElementById('step-details');
        if (detailsDiv) detailsDiv.style.display = 'none';
        const aiBtn = document.getElementById('ai-btn-step');
        if (aiBtn) aiBtn.style.display = 'none';
        const resultBox = document.getElementById('step-analysis-result');
        if (resultBox) { resultBox.style.display = 'none'; resultBox.innerHTML = ''; }
        const manualInput = document.getElementById('step-manual-input');
        if (manualInput) manualInput.value = '';
    }
    renderStepImportBanner();
}

// ============================================================
function buildCommunityEmptyState(title, body, actions = []) {
    return `
        <div class="community-empty-state">
            <strong>${title}</strong>
            ${body ? `<span>${body}</span>` : ''}
            ${actions.length ? `<div class="community-empty-actions">${actions.join('')}</div>` : ''}
        </div>
    `;
}

function buildCommunityExpandableRows(sectionKey, rows, limit = 3) {
    const visibleLimit = Math.max(1, limit);
    const hiddenCount = Math.max(0, rows.length - visibleLimit);

    return `
        <div class="community-collapsible-list" id="${sectionKey}-list">
            ${rows.map((row, index) => `
                <div class="community-collapsible-row${index >= visibleLimit ? ' is-hidden' : ''}"${index >= visibleLimit ? ' hidden' : ''}>
                    ${row}
                </div>
            `).join('')}
        </div>
        ${hiddenCount > 0 ? `<button type="button" class="community-more-btn" id="${sectionKey}-toggle" data-expanded="false" data-hidden-count="${hiddenCount}" onclick="toggleCommunityRows('${sectionKey}')">+${hiddenCount}개 더 보기</button>` : ''}
    `;
}

function toggleCommunityRows(sectionKey) {
    const rows = document.querySelectorAll(`#${sectionKey}-list .community-collapsible-row.is-hidden`);
    const toggleBtn = document.getElementById(`${sectionKey}-toggle`);
    if (!rows.length || !toggleBtn) return;

    const expanded = toggleBtn.dataset.expanded === 'true';
    rows.forEach(row => {
        row.hidden = expanded;
    });

    toggleBtn.dataset.expanded = expanded ? 'false' : 'true';
    toggleBtn.textContent = expanded
        ? `+${toggleBtn.dataset.hiddenCount || rows.length}개 더 보기`
        : '접기';
}

function renderGroupChallengeFromDataLegacy(s) {
    const section = document.getElementById('group-challenge-section');
    const content = document.getElementById('group-challenge-content');
    if (!section || !content) return;
    if (!s || !s.totalUsers) { section.style.display = 'none'; return; }

    const ranked = s.ranked || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rewardAmounts = ['5,000P', '2,000P', '500P'];

    section.style.display = 'block';
    content.innerHTML = `
        <div class="community-month-summary">이번 달 <strong>${s.totalUsers}명</strong>이 같이 기록 중이에요.</div>
        <div class="group-stats-grid">
            <div class="group-stat-item"><span class="group-stat-num">${s.totalUsers}명</span><span class="group-stat-label">함께 기록한 친구</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.newMemberCount || 0}명</span><span class="group-stat-label">이번 달 합류</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalComments || 0}개</span><span class="group-stat-label">남긴 댓글</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalReactions || 0}개</span><span class="group-stat-label">보낸 응원</span></div>
        </div>
        ${s.bestStreak >= 2 ? `<div class="community-highlight">🔥 연속 기록: <strong>${s.bestStreakName}</strong> ${s.bestStreak}일</div>` : ''}
        <div class="community-detail-shell is-open">
            <div class="community-detail-body community-detail-body-always-open">
                <div class="community-detail-title">이번 달 상세 보기</div>
                <div class="category-kings">
                    ${s.dietKing?.count > 0 ? `<span class="cat-king">🍽 <strong>${s.dietKing.name}</strong> ${s.dietKing.count}일</span>` : ''}
                    ${s.exerciseKing?.count > 0 ? `<span class="cat-king">🏃 <strong>${s.exerciseKing.name}</strong> ${s.exerciseKing.count}일</span>` : ''}
                    ${s.mindKing?.count > 0 ? `<span class="cat-king">🌙 <strong>${s.mindKing.name}</strong> ${s.mindKing.count}일</span>` : ''}
                </div>
                ${ranked.length ? `
                    <div class="mvp-ranking-title">🏆 이번 달 꾸준한 친구들</div>
                    <div class="mvp-ranking-list">
                        ${ranked.map((u, i) => `
                            <div class="mvp-ranking-item rank-${i + 1}">
                                <span class="mvp-medal">${medals[i]}</span>
                                <span class="mvp-name">${u.name}</span>
                                <span class="mvp-days">${u.days}일 · 💬${u.comments} · ✨${u.reactions}</span>
                                <span class="mvp-reward">${rewardAmounts[i]}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mvp-reward-info">기록과 응원 흐름으로 매월 자동 집계돼요.</div>
                ` : ''}
                ${s.updatedAt?.toDate ? `<div class="community-updated-at">📊 이번 달 집계 · 매시간 업데이트 (${s.updatedAt.toDate().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })})</div>` : ''}
                <div class="community-history-btn-wrap">
                    <a href="community-history.html" class="community-history-btn">지난 커뮤니티 현황 보기 →</a>
                </div>
            </div>
        </div>
    `;
}

function setSocialChallengeHeadAction(mode = 'start') {
    const button = document.querySelector('.social-challenge-head-btn');
    if (!button) return;
    button.disabled = false;

    if (mode === 'requests') {
        button.textContent = '요청 확인';
        button.onclick = () => window.openFriendRequestFlow();
        return;
    }

    if (mode === 'invite') {
        button.textContent = '친구 연결';
        button.onclick = () => window.openFriendInviteFlow();
        return;
    }

    if (mode === 'retry') {
        button.textContent = '다시 불러오기';
        button.onclick = () => window.retrySocialChallengesCard();
        return;
    }

    if (mode === 'blocked') {
        button.textContent = '5일 필요';
        button.onclick = () => showToast('최근 30일 5일 이상 기록한 친구가 있어야 챌린지를 시작할 수 있어요.');
        return;
    }

    button.textContent = '챌린지 시작';
    button.onclick = () => window.openCreateChallengeModal();
}

function buildSocialChallengeFriendSummary(activeFriendIds = []) {
    const myUid = auth.currentUser?.uid;
    const incomingCount = getIncomingFriendRequests().length;
    const outgoingCount = getOutgoingFriendRequests().length;
    const previewNames = activeFriendIds
        .slice(0, 3)
        .map(friendId => escapeHtml(getFriendshipName(cachedMyFriendships.get(friendId), myUid)))
        .filter(Boolean);

    const pills = [
        `<span class="social-challenge-pill">👥 친구 ${activeFriendIds.length}명</span>`,
        incomingCount > 0 ? `<span class="social-challenge-pill">📩 받은 ${incomingCount}건</span>` : '',
        outgoingCount > 0 ? `<span class="social-challenge-pill">🕓 보낸 ${outgoingCount}건</span>` : ''
    ].filter(Boolean).join('');

    const namesLine = previewNames.length > 0
        ? `<div class="social-challenge-meta">연결 친구 · ${previewNames.join(', ')}${activeFriendIds.length > previewNames.length ? ` 외 ${activeFriendIds.length - previewNames.length}명` : ''}</div>`
        : '';

    return `
        <div class="social-challenge-summary">
            ${pills}
        </div>
        ${namesLine}
    `;
}

let _socialChallengeFriendReadinessCache = {
    uid: '',
    todayStr: '',
    loadedAt: 0,
    items: []
};

function addDaysFromKstDateString(dateStr, diffDays) {
    const base = new Date(`${dateStr}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + diffDays);
    return base.toISOString().split('T')[0];
}

function countCompletedHabitBuckets(awardedPoints = {}) {
    const dietDone = (awardedPoints.dietPoints || 0) > 0 || !!awardedPoints.diet;
    const exerciseDone = (awardedPoints.exercisePoints || 0) > 0 || !!awardedPoints.exercise;
    const mindDone = (awardedPoints.mindPoints || 0) > 0 || !!awardedPoints.mind;
    return [dietDone, exerciseDone, mindDone].filter(Boolean).length;
}

async function loadSocialChallengeFriendReadiness(user, { forceReload = false } = {}) {
    const { todayStr, weekStrs } = getDatesInfo();
    const activeFriendIds = getActiveFriendIds();

    if (!forceReload
        && _socialChallengeFriendReadinessCache.uid === user.uid
        && _socialChallengeFriendReadinessCache.todayStr === todayStr
        && Date.now() - _socialChallengeFriendReadinessCache.loadedAt < 60000) {
        return _socialChallengeFriendReadinessCache.items;
    }

    if (activeFriendIds.length === 0) {
        _socialChallengeFriendReadinessCache = {
            uid: user.uid,
            todayStr,
            loadedAt: Date.now(),
            items: []
        };
        return [];
    }

    const weekSet = new Set(weekStrs);
    const thirtyDaysAgo = addDaysFromKstDateString(todayStr, -30);

    const items = await Promise.all(activeFriendIds.map(async friendId => {
        const friendship = cachedMyFriendships.get(friendId);
        const name = getFriendshipName(friendship, user.uid) || '친구';
        const logsSnap = await getDocs(query(
            collection(db, 'daily_logs'),
            where('userId', '==', friendId),
            where('date', '>=', thirtyDaysAgo)
        ));

        let recentDays = 0;
        let weekDays = 0;
        let todayCompleted = 0;

        logsSnap.forEach(logDoc => {
            const data = logDoc.data() || {};
            const date = data.date || '';
            recentDays += 1;
            if (weekSet.has(date)) weekDays += 1;
            if (date === todayStr) {
                todayCompleted = countCompletedHabitBuckets(data.awardedPoints || {});
            }
        });

        const eligible = recentDays >= 5;
        const shortfall = Math.max(0, 5 - recentDays);

        return {
            uid: friendId,
            name,
            todayCompleted,
            weekDays,
            recentDays,
            eligible,
            shortfall
        };
    }));

    items.sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        if (a.weekDays !== b.weekDays) return b.weekDays - a.weekDays;
        if (a.todayCompleted !== b.todayCompleted) return b.todayCompleted - a.todayCompleted;
        return a.name.localeCompare(b.name, 'ko');
    });

    _socialChallengeFriendReadinessCache = {
        uid: user.uid,
        todayStr,
        loadedAt: Date.now(),
        items
    };

    return items;
}

function getSocialChallengeFriendContextPriority(status = '') {
    switch (status) {
    case 'incoming_pending':
        return 0;
    case 'outgoing_pending':
        return 1;
    case 'active':
        return 2;
    default:
        return 99;
    }
}

function getSocialChallengePeerIds(challenge, myUid) {
    const peerIds = new Set();
    const participants = Array.isArray(challenge?.participants) ? challenge.participants : [];
    const invitees = Array.isArray(challenge?.invitees) ? challenge.invitees : [];
    [...participants, ...invitees].forEach(uid => {
        if (uid && uid !== myUid) peerIds.add(uid);
    });
    return [...peerIds];
}

function buildSocialChallengeFriendContextMap(challenges = [], myUid = auth.currentUser?.uid) {
    const contextMap = new Map();
    if (!myUid) return contextMap;

    challenges.forEach(challenge => {
        let status = '';
        if (challenge?.isInvite) {
            status = 'incoming_pending';
        } else if (challenge?.status === 'pending' && challenge?.creatorId === myUid) {
            status = 'outgoing_pending';
        } else if (challenge?.status === 'active') {
            status = 'active';
        }
        if (!status) return;

        const context = {
            challengeId: challenge.id || '',
            status,
            type: challenge.type || 'group_goal',
            durationDays: Number(challenge.durationDays) || 3,
            creatorId: challenge.creatorId || '',
            creatorName: challenge.creatorName || '',
            stakePoints: Number(challenge.stakePoints) || 0
        };

        getSocialChallengePeerIds(challenge, myUid).forEach(friendUid => {
            const existing = contextMap.get(friendUid);
            if (!existing || getSocialChallengeFriendContextPriority(status) < getSocialChallengeFriendContextPriority(existing.status)) {
                contextMap.set(friendUid, context);
            }
        });
    });

    return contextMap;
}

function mergeOpenSocialChallenges(asParticipant = [], asInvitee = []) {
    const challengeMap = new Map();

    asInvitee.forEach(docSnap => {
        if (!docSnap?.id) return;
        challengeMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data(), isInvite: true });
    });

    asParticipant.forEach(docSnap => {
        if (!docSnap?.id || challengeMap.has(docSnap.id)) return;
        challengeMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data(), isInvite: false });
    });

    return [...challengeMap.values()];
}

function buildSocialChallengeCreateAvailability(challenges = [], myUid = auth.currentUser?.uid) {
    const busyFriendIds = new Set();
    const disabledTypes = {
        group_goal: false,
        competition: false
    };
    if (!myUid) return { busyFriendIds, disabledTypes };

    challenges.forEach(challenge => {
        if (!challenge || !['pending', 'active'].includes(challenge.status)) return;

        getSocialChallengePeerIds(challenge, myUid).forEach(friendUid => {
            busyFriendIds.add(friendUid);
        });

        if (challenge.creatorId === myUid) {
            const challengeType = challenge.type === 'competition' ? 'competition' : 'group_goal';
            disabledTypes[challengeType] = true;
        }
    });

    return { busyFriendIds, disabledTypes };
}

function buildSocialChallengeFriendReadinessSection(readinessItems = [], challengeContextMap = new Map(), options = {}) {
    if (!readinessItems.length) return '';
    const canStartAnyChallenge = options.canStartAnyChallenge !== false;

    const availableItems = readinessItems.filter(item => !challengeContextMap.has(item.uid));
    const readyCount = canStartAnyChallenge ? availableItems.filter(item => item.eligible).length : 0;
    const blockedCount = canStartAnyChallenge ? availableItems.filter(item => !item.eligible).length : 0;
    const rows = readinessItems.map(item => {
        const challengeContext = challengeContextMap.get(item.uid) || null;
        const rowClasses = ['social-challenge-item', 'social-challenge-readiness-row'];
        let actionHtml = '';

        if (challengeContext?.status === 'incoming_pending') {
            rowClasses.push('is-invite');
            actionHtml = `<button type="button" class="social-challenge-cta" onclick="openChallengeInviteModal('${challengeContext.challengeId}')">응답하기</button>`;
        } else if (challengeContext?.status === 'outgoing_pending') {
            rowClasses.push('is-pending');
            actionHtml = `<button type="button" class="social-challenge-cta is-pending" disabled>수락 대기중</button>`;
        } else if (challengeContext?.status === 'active') {
            rowClasses.push('is-active');
            actionHtml = `<button type="button" class="social-challenge-cta is-active" disabled>진행 중</button>`;
        } else if (item.eligible && canStartAnyChallenge) {
            rowClasses.push('is-ready');
            actionHtml = `<button type="button" class="social-challenge-cta" onclick="openCreateChallengeModalForFriend('${item.uid}')">챌린지 시작</button>`;
        } else if (item.eligible) {
            rowClasses.push('is-pending');
            actionHtml = `<button type="button" class="social-challenge-cta is-pending" disabled>생성 대기</button>`;
        } else {
            rowClasses.push('is-blocked');
            actionHtml = `<div class="social-challenge-readiness-pill is-blocked">${item.shortfall}일 부족</div>`;
        }

        return `
        <div class="${rowClasses.join(' ')}">
            <div class="social-challenge-main social-challenge-readiness-main">
                <div class="social-challenge-type">${escapeHtml(item.name)}</div>
                <div class="social-challenge-meta">오늘 ${item.todayCompleted}/3 · 이번 주 ${item.weekDays}일 · 최근 30일 ${item.recentDays}일</div>
            </div>
            ${actionHtml}
        </div>
    `;
    });

    return `
        <div class="social-challenge-summary" style="margin-top:10px;">
            <span class="social-challenge-pill">⚡ 바로 가능 ${readyCount}명</span>
            ${blockedCount > 0 ? `<span class="social-challenge-pill">🗓 5일 필요 ${blockedCount}명</span>` : ''}
        </div>
        <div style="margin:10px 0 8px;font-size:12px;font-weight:800;color:#7A4E12;">친구별 챌린지 상태</div>
        ${buildCommunityExpandableRows('social-challenge-friends', rows, 3)}
    `;
}

async function loadOpenSocialChallengesForUser(user, timeoutMs = SOCIAL_CHALLENGE_LOAD_TIMEOUT_MS) {
    return Promise.race([
        Promise.all([
            getDocs(query(
                collection(db, 'social_challenges'),
                where('participants', 'array-contains', user.uid),
                where('status', 'in', ['pending', 'active']),
                limit(5)
            )),
            getDocs(query(
                collection(db, 'social_challenges'),
                where('invitees', 'array-contains', user.uid),
                where('status', '==', 'pending'),
                limit(5)
            ))
        ]),
        new Promise((_, reject) => {
            window.setTimeout(() => reject(new Error('social_challenges_timeout')), timeoutMs);
        })
    ]);
}

window.retrySocialChallengesCard = function() {
    const user = auth.currentUser;
    if (!user) return;
    renderSocialChallenges(user).catch(() => {});
};

async function renderSocialChallenges(user) {
    const card = document.getElementById('social-challenge-card');
    const list = document.getElementById('social-challenge-list');
    if (!card || !list) return;

    try {
        card.style.display = 'block';
        setSocialChallengeHeadAction('start');
        list.innerHTML = buildCommunityEmptyState(
            '친구 챌린지를 준비하고 있어요',
            '친구 상태와 열린 챌린지를 불러오는 중입니다.'
        );

        const friendshipState = await waitForFriendshipsForUi({ timeoutMs: FRIENDSHIP_LOAD_TIMEOUT_MS });
        const activeFriendIds = friendshipState.activeFriendIds;
        const hasPendingRequests = getIncomingFriendRequests().length > 0 || getOutgoingFriendRequests().length > 0;
        const summaryHtml = buildSocialChallengeFriendSummary(activeFriendIds);
        _communityFocusState.friendCount = activeFriendIds.length;

        if (friendshipState.timedOut && cachedMyFriendships.size === 0) {
            setSocialChallengeHeadAction(hasPendingRequests ? 'requests' : 'invite');
            _communityFocusState.pendingChallenges = 0;
            _communityFocusState.activeChallenges = 0;
            updatePwaActionableBadge({ challengeInvites: 0 });
            renderCommunityFocusPanel();
            list.innerHTML = `
                ${summaryHtml}
                ${buildCommunityEmptyState(
                    hasPendingRequests ? '친구 요청을 먼저 확인해요' : '친구를 먼저 연결해요',
                    hasPendingRequests ? '프로필에서 요청을 확인해요.' : '프로필에서 친구를 추가해요.',
                    [`<button type="button" class="community-empty-btn" onclick="${hasPendingRequests ? 'openFriendRequestFlow()' : 'openFriendInviteFlow()'}">${hasPendingRequests ? '📩 요청 확인' : '👥 친구 연결'}</button>`]
                )}
            `;
            return;
        }

        if (activeFriendIds.length === 0) {
            setSocialChallengeHeadAction(hasPendingRequests ? 'requests' : 'invite');
            _communityFocusState.pendingChallenges = 0;
            _communityFocusState.activeChallenges = 0;
            updatePwaActionableBadge({ challengeInvites: 0 });
            renderCommunityFocusPanel();
            list.innerHTML = `
                ${summaryHtml}
                ${buildCommunityEmptyState(
                    hasPendingRequests ? '친구 요청부터 확인해 주세요' : '수락된 친구가 있어야 챌린지를 시작할 수 있어요',
                    hasPendingRequests
                        ? '프로필 탭에서 요청을 수락하면 바로 친구 챌린지를 시작할 수 있어요.'
                        : '친구에게 초대 링크를 보내면 신규 가입 보너스와 친구 연결이 한 번에 이어져요.',
                    [`<button type="button" class="community-empty-btn" onclick="${hasPendingRequests ? 'openFriendRequestFlow()' : 'openFriendInviteFlow()'}">${hasPendingRequests ? '📩 요청 확인' : '👥 친구 연결'}</button>`]
                )}
            `;
            return;
        }

        const [readinessItems, [asParticipant, asInvitee]] = await Promise.all([
            loadSocialChallengeFriendReadiness(user),
            loadOpenSocialChallengesForUser(user, SOCIAL_CHALLENGE_LOAD_TIMEOUT_MS)
        ]);

        const challenges = mergeOpenSocialChallenges(asParticipant, asInvitee);
        const { busyFriendIds, disabledTypes } = buildSocialChallengeCreateAvailability(challenges, user.uid);
        const hasAvailableType = !disabledTypes.group_goal || !disabledTypes.competition;
        const challengeContextMap = buildSocialChallengeFriendContextMap(challenges, user.uid);
        const readinessHtml = buildSocialChallengeFriendReadinessSection(readinessItems, challengeContextMap, {
            canStartAnyChallenge: hasAvailableType
        });
        const readyCount = hasAvailableType
            ? readinessItems.filter(item => item.eligible && !busyFriendIds.has(item.uid)).length
            : 0;

        const pendingChallenges = challenges.filter(ch => ch.isInvite).length;
        const activeChallenges = challenges.filter(ch => !ch.isInvite && ch.status === 'active').length;
        updatePwaActionableBadge({ challengeInvites: pendingChallenges });
        setSocialChallengeHeadAction(readyCount > 0 && hasAvailableType ? 'start' : 'blocked');
        _communityFocusState.pendingChallenges = pendingChallenges;
        _communityFocusState.activeChallenges = activeChallenges;
        renderCommunityFocusPanel();

        const orderedChallenges = challenges.slice().sort((a, b) => Number(b.isInvite) - Number(a.isInvite));
        const challengeRowsHtml = orderedChallenges.map(ch => {
            const typeLabel = ch.type === 'competition' ? '1:1 경쟁' : '함께 목표';
            const durationLabel = `${ch.durationDays}일`;
            if (ch.isInvite) {
                return `
                    <div class="social-challenge-item is-invite">
                        <div class="social-challenge-main">
                            <div class="social-challenge-type">${typeLabel} · ${durationLabel}</div>
                            <div class="social-challenge-meta">${escapeHtml(ch.creatorName || '친구')}님이 초대했어요${ch.type === 'competition' ? ` · 스테이크 ${ch.stakePoints}P` : ''}</div>
                            <div class="social-challenge-status is-pending">수락하면 오늘부터 바로 시작돼요</div>
                        </div>
                        <button type="button" class="social-challenge-cta" onclick="openChallengeInviteModal('${ch.id}')">응답하기</button>
                    </div>
                `;
            }

            const statusLabel = ch.status === 'active'
                ? `진행 중 · ${ch.startDate} ~ ${ch.endDate}`
                : '수락 대기 중';
            const isOutgoingPending = ch.status === 'pending' && ch.creatorId === user.uid;

            return `
                <div class="social-challenge-item ${ch.status === 'active' ? 'is-active' : ''}${isOutgoingPending ? ' is-pending' : ''}">
                    <div class="social-challenge-main">
                        <div class="social-challenge-type">${typeLabel} · ${durationLabel}</div>
                        <div class="social-challenge-status ${ch.status === 'active' ? 'is-active' : 'is-pending'}">${escapeHtml(statusLabel)}</div>
                        ${ch.type === 'competition' ? `<div class="social-challenge-meta">스테이크 ${ch.stakePoints}P</div>` : ''}
                    </div>
                    ${isOutgoingPending ? `<button type="button" class="social-challenge-inline-btn cancel" onclick="cancelPendingSocialChallenge('${ch.id}')">취소</button>` : ''}
                </div>
            `;
        });

        if (challenges.length === 0) {
            const emptyTitle = readyCount > 0 ? '바로 챌린지 가능한 친구가 있어요' : '아직 5일 기록이 필요한 친구가 있어요';
            const emptyBody = readyCount > 0 ? '' : '5일 이상 기록한 친구부터 시작할 수 있어요.';
            list.innerHTML = `
                ${summaryHtml}
                ${readinessHtml}
                <div class="community-empty-state">
                    <strong>${emptyTitle}</strong>
                    ${emptyBody ? `<span>${emptyBody}</span>` : ''}
                </div>
            `;
            return;
        }

        list.innerHTML = `
            ${summaryHtml}
            ${readinessHtml}
            <div class="social-challenge-summary">
                <span class="social-challenge-pill">🏆 진행 ${activeChallenges}개</span>
                <span class="social-challenge-pill">📩 응답 대기 ${pendingChallenges}개</span>
            </div>
            ${buildCommunityExpandableRows('social-challenges', challengeRowsHtml, 2)}
        `;
    } catch (e) {
        console.warn('[renderSocialChallenges] 오류:', e.message);
        const hasPendingRequests = getIncomingFriendRequests().length > 0 || getOutgoingFriendRequests().length > 0;
        const activeFriendIds = getActiveFriendIds();
        setSocialChallengeHeadAction(activeFriendIds.length > 0 ? 'start' : (hasPendingRequests ? 'requests' : 'invite'));
        list.innerHTML = buildCommunityEmptyState(
            activeFriendIds.length > 0
                ? '친구 상태를 다시 확인 중이에요'
                : (hasPendingRequests ? '친구 요청을 먼저 확인해요' : '친구를 먼저 연결해요'),
            activeFriendIds.length > 0
                ? '잠시 후 다시 확인해요.'
                : (hasPendingRequests ? '프로필에서 요청을 확인해요.' : '프로필에서 친구를 추가해요.'),
            activeFriendIds.length > 0
                ? []
                : [`<button type="button" class="community-empty-btn" onclick="${hasPendingRequests ? 'openFriendRequestFlow()' : 'openFriendInviteFlow()'}">${hasPendingRequests ? '📩 요청 확인' : '👥 친구 연결'}</button>`]
        );
        card.style.display = 'block';
    }
}

// QR 코드 초대 모달
// ============================================================
const CHAT_QR_URL = 'https://open.kakao.com/o/gv23urgi';

window.openQRModal = function() {
    const modal = document.getElementById('qr-invite-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const inviteUrl = document.getElementById('referral-link-display')?.value
                   || document.getElementById('profile-invite-link')?.value
                   || '';
    const code = document.getElementById('referral-invite-code')?.textContent
              || document.getElementById('profile-invite-code')?.textContent
              || '';

    if (code && code !== '-') {
        document.getElementById('qr-invite-label').textContent = `초대 코드: ${code}`;
    }

    if (!window.QRCode) {
        console.error('QRCode 라이브러리 미로드');
        return;
    }

    const qrOpts = { width: 200, height: 200, colorDark: '#1a1a1a', colorLight: '#ffffff',
                     correctLevel: window.QRCode.CorrectLevel.H };

    const inviteContainer = document.getElementById('qr-invite-container');
    inviteContainer.innerHTML = '';
    if (inviteUrl) new window.QRCode(inviteContainer, { ...qrOpts, text: inviteUrl });

    const chatContainer = document.getElementById('qr-chat-container');
    chatContainer.innerHTML = '';
    new window.QRCode(chatContainer, { ...qrOpts, text: CHAT_QR_URL });
};

window.closeQRModal = function() {
    const modal = document.getElementById('qr-invite-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

window.copyReferralFromModal = function() {
    const url = document.getElementById('referral-link-display')?.value
             || document.getElementById('profile-invite-link')?.value;
    if (!url) return;
    navigator.clipboard.writeText(url)
        .then(() => showToast('📋 초대 링크가 복사되었습니다!'))
        .catch(() => showToast('복사에 실패했습니다.'));
};

// ============================================================
// 소셜 챌린지
// ============================================================

let _challengeState = {
    type: 'group_goal',
    duration: 3,
    selectedFriends: [],   // { uid, name }[]
    friends: [],           // 내 친구 목록 { uid, name }[]
    pendingInviteId: null, // 응답 대기 중인 챌린지 ID
    disabledTypes: {
        group_goal: false,
        competition: false
    }
};

/** 챌린지 생성 모달 열기 */
window.openCreateChallengeModal = async function(options = {}) {
    const modal = document.getElementById('create-challenge-modal');
    if (!modal) return;

    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다'); return; }
    const preselectedFriendUid = typeof options?.preselectedFriendUid === 'string'
        ? options.preselectedFriendUid.trim()
        : '';

    try {
        const friendshipState = await waitForFriendshipsForUi({ forceReload: true, timeoutMs: FRIENDSHIP_LOAD_TIMEOUT_MS });
        const friendIds = getActiveFriendIds();
        const hasPendingRequests = getIncomingFriendRequests().length > 0 || getOutgoingFriendRequests().length > 0;
        const [readinessItems, [asParticipant, asInvitee]] = await Promise.all([
            loadSocialChallengeFriendReadiness(user, { forceReload: true }),
            loadOpenSocialChallengesForUser(user, SOCIAL_CHALLENGE_LOAD_TIMEOUT_MS)
        ]);
        const challenges = mergeOpenSocialChallenges(asParticipant, asInvitee);
        const { busyFriendIds, disabledTypes } = buildSocialChallengeCreateAvailability(challenges, user.uid);
        const availableTypes = ['group_goal', 'competition'].filter(type => !disabledTypes[type]);
        const availableFriends = readinessItems.filter(item => !busyFriendIds.has(item.uid));
        const eligibleFriends = availableFriends.filter(item => item.eligible);

        if (friendIds.length === 0) {
            if (hasPendingRequests) {
                showToast('친구 요청을 먼저 확인해 주세요.');
                openFriendRequestFlow();
            } else if (friendshipState.timedOut) {
                showToast('친구 연결 상태를 먼저 확인해 주세요.');
                openFriendInviteFlow();
            } else {
                showToast('먼저 친구를 연결해 주세요.');
                openFriendInviteFlow();
            }
            return;
        }

        if (availableTypes.length === 0) {
            showToast('이미 진행 중인 1:1 경쟁과 단체 목표가 있어 새 챌린지를 더 만들 수 없어요.');
            renderSocialChallenges(user).catch(() => {});
            return;
        }

        if (eligibleFriends.length === 0) {
            showToast('이미 진행 중인 챌린지를 제외하면 지금 바로 초대할 수 있는 친구가 없어요.');
            renderSocialChallenges(user).catch(() => {});
            return;
        }

        _challengeState.friends = availableFriends.map(item => ({
            uid: item.uid,
            name: item.name,
            eligible: item.eligible,
            shortfall: item.shortfall,
            todayCompleted: item.todayCompleted,
            weekDays: item.weekDays,
            recentDays: item.recentDays
        }));

        // 상태 초기화
        _challengeState.type = 'group_goal';
        _challengeState.duration = 3;
        _challengeState.stake = 50;
        _challengeState.selectedFriends = [];
        _challengeState.disabledTypes = disabledTypes;

        const defaultType = availableTypes.includes('group_goal') ? 'group_goal' : 'competition';
        selectChallengeType(defaultType);
        selectDuration(3);
        selectStake(50);
        if (preselectedFriendUid) {
            const preselectedFriend = _challengeState.friends.find(friend => friend.uid === preselectedFriendUid && friend.eligible !== false);
            if (preselectedFriend) {
                _challengeState.selectedFriends = [{ uid: preselectedFriend.uid, name: preselectedFriend.name }];
            }
        }
        renderChallengeFriendList();

        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (e) {
        console.error('[openCreateChallengeModal]', e);
        showToast('친구 상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        renderSocialChallenges(user).catch(() => {});
    }
};

window.openCreateChallengeModalForFriend = function(friendUid) {
    return window.openCreateChallengeModal({ preselectedFriendUid: String(friendUid || '').trim() });
};

window.closeCreateChallengeModal = function() {
    const modal = document.getElementById('create-challenge-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
};

function renderChallengeFriendList() {
    const container = document.getElementById('challenge-friend-list');
    if (!container) return;
    if (!_challengeState.friends.length) {
        container.innerHTML = '<div style="font-size:12px;color:#aaa;text-align:center;padding:8px;">선택할 수 있는 친구가 아직 없어요.</div>';
        return;
    }
    container.innerHTML = _challengeState.friends.map(f => {
        const isSelected = _challengeState.selectedFriends.some(s => s.uid === f.uid);
        const isEligible = f.eligible !== false;
        const statusLabel = isEligible
            ? `오늘 ${f.todayCompleted || 0}/3 · 이번 주 ${f.weekDays || 0}일`
            : `${f.shortfall || Math.max(0, 5 - (f.recentDays || 0))}일 더 기록 필요`;
        return `<div onclick="toggleChallengeFriend('${f.uid}', '${escapeHtml(f.name)}')"
            style="padding:8px 12px;border-radius:10px;border:2px solid ${isSelected ? '#7C4DFF' : isEligible ? '#e8e8e8' : '#F0E0D6'};
                   background:${isSelected ? '#f3f0ff' : isEligible ? 'transparent' : '#FAF6F3'};cursor:${isEligible ? 'pointer' : 'not-allowed'};
                   opacity:${isEligible ? '1' : '.72'};display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;">
            <div style="min-width:0;">
                <div style="font-weight:${isSelected ? '700' : '600'};color:${isSelected ? '#5e35b1' : '#333'};">${escapeHtml(f.name)}</div>
                <div style="margin-top:3px;font-size:11px;color:${isEligible ? '#7B7285' : '#C56A1D'};">${statusLabel}</div>
            </div>
            ${isSelected ? '<span style="color:#7C4DFF;font-size:14px;">✓</span>' : `<span style="font-size:11px;font-weight:700;color:${isEligible ? '#2E7D32' : '#C56A1D'};">${isEligible ? '가능' : '대기'}</span>`}
        </div>`;
    }).join('');
}

function setChallengeTypeButtonVisual(button, isSelected, isDisabled) {
    if (!button) return;
    button.disabled = isDisabled;
    button.style.borderColor = isSelected ? '#7C4DFF' : isDisabled ? '#E6D8F8' : '#e8e8e8';
    button.style.background = isSelected ? '#7C4DFF' : isDisabled ? '#F6F1FF' : 'transparent';
    button.style.color = isSelected ? '#fff' : isDisabled ? '#B39DDB' : '#666';
    button.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
    button.style.opacity = isDisabled ? '0.72' : '1';
}

window.toggleChallengeFriend = function(uid, name) {
    const isCompetition = _challengeState.type === 'competition';
    const friend = _challengeState.friends.find(item => item.uid === uid);
    if (friend && friend.eligible === false) {
        showToast(`최근 30일 ${friend.shortfall || 1}일 더 기록하면 챌린지에 참여할 수 있어요.`);
        return;
    }
    const idx = _challengeState.selectedFriends.findIndex(f => f.uid === uid);
    if (idx >= 0) {
        _challengeState.selectedFriends.splice(idx, 1);
    } else {
        if (isCompetition && _challengeState.selectedFriends.length >= 1) {
            showToast('1:1 경쟁은 상대 1명만 선택할 수 있어요');
            return;
        }
        if (!isCompetition && _challengeState.selectedFriends.length >= 2) {
            showToast('함께 목표는 최대 2명까지 선택할 수 있어요');
            return;
        }
        _challengeState.selectedFriends.push({ uid, name });
    }
    renderChallengeFriendList();
};

window.selectChallengeType = function(type) {
    if (_challengeState.disabledTypes?.[type]) return;
    _challengeState.type = type;
    _challengeState.selectedFriends = [];

    const btnGroup = document.getElementById('type-group');
    const btnComp = document.getElementById('type-competition');
    const desc = document.getElementById('type-desc');
    const stakeSection = document.getElementById('stake-section');
    const hint = document.getElementById('friend-select-hint');
    const groupDisabled = Boolean(_challengeState.disabledTypes?.group_goal);
    const competitionDisabled = Boolean(_challengeState.disabledTypes?.competition);

    setChallengeTypeButtonVisual(btnGroup, type === 'group_goal', groupDisabled);
    setChallengeTypeButtonVisual(btnComp, type === 'competition', competitionDisabled);

    const durHint = document.getElementById('duration-hint');
    if (type === 'group_goal') {
        if (desc) { desc.textContent = '전원 70% 이상 달성 시 습관 포인트 +20% 보너스'; desc.style.color = '#F57C00'; }
        if (stakeSection) stakeSection.style.display = 'none';
        if (hint) hint.textContent = '(최대 2명)';
        if (durHint) durHint.style.display = 'block';
    } else {
        if (desc) { desc.textContent = '이기면 상대 스테이크 획득 + 기간 포인트 30% 보너스'; desc.style.color = '#F57C00'; }
        if (stakeSection) stakeSection.style.display = 'block';
        if (hint) hint.textContent = '(1명만 선택)';
        if (durHint) durHint.style.display = 'none';
    }
    renderChallengeFriendList();
};

window.selectDuration = function(days) {
    _challengeState.duration = days;
    [3, 7, 14].forEach(d => {
        const btn = document.getElementById(`dur-${d}`);
        if (!btn) return;
        if (d === days) {
            btn.style.borderColor = '#7C4DFF';
            btn.style.background = '#7C4DFF';
            btn.style.color = '#fff';
            btn.style.fontWeight = '600';
        } else {
            btn.style.borderColor = '#e8e8e8';
            btn.style.background = 'transparent';
            btn.style.color = '#666';
            btn.style.fontWeight = '400';
        }
    });
    // 기간별 성공 기준 안내 (단체 목표: 70% 반올림)
    const hint = document.getElementById('duration-hint');
    if (hint) {
        const needed = Math.ceil(days * 0.7);
        hint.textContent = `${days}일 중 ${needed}일 이상 기록 시 성공`;
    }
};

window.selectStake = function(points) {
    _challengeState.stake = points;
    const stakeInput = document.getElementById('stake-input');
    if (stakeInput) stakeInput.value = points;
    [50, 100, 200].forEach(p => {
        const btn = document.getElementById(`stake-${p}`);
        if (!btn) return;
        if (p === points) {
            btn.style.borderColor = '#7C4DFF';
            btn.style.background = '#7C4DFF';
            btn.style.color = '#fff';
            btn.style.fontWeight = '600';
        } else {
            btn.style.borderColor = '#e8e8e8';
            btn.style.background = 'transparent';
            btn.style.color = '#666';
            btn.style.fontWeight = '400';
        }
    });
};

window.submitCreateChallenge = async function() {
    const user = auth.currentUser;
    if (!user) return;

    const { type, duration, selectedFriends } = _challengeState;
    if (_challengeState.disabledTypes?.[type]) {
        showToast(type === 'competition'
            ? '지금은 1:1 경쟁을 새로 만들 수 없어요.'
            : '지금은 단체 목표를 새로 만들 수 없어요.');
        return;
    }
    if (selectedFriends.length === 0) {
        showToast('친구를 한 명 이상 선택해주세요');
        return;
    }
    if (type === 'competition' && selectedFriends.length !== 1) {
        showToast('1:1 경쟁은 상대 1명을 선택해주세요');
        return;
    }

    let stakePoints = null;
    if (type === 'competition') {
        stakePoints = parseInt(document.getElementById('stake-input')?.value || '50', 10);
        if (isNaN(stakePoints) || stakePoints < 10 || stakePoints > 200 || stakePoints % 10 !== 0) {
            showToast('스테이크는 10~200P 범위에서 10P 단위로 입력해주세요');
            return;
        }
    }

    const btn = document.getElementById('create-challenge-btn');
    if (btn) { btn.disabled = true; btn.textContent = '생성 중...'; }

    try {
        const fn = httpsCallable(functions, 'createSocialChallenge');
        await fn({
            type,
            inviteeIds: selectedFriends.map(f => f.uid),
            durationDays: duration,
            stakePoints
        });

        closeCreateChallengeModal();
        showToast('🎉 챌린지 초대를 보냈어요!');
        renderSocialChallenges(user).catch(() => {});
    } catch (e) {
        console.error('[createChallenge]', e);
        showToast(`⚠️ ${e.message || '챌린지 생성에 실패했어요'}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '챌린지 시작하기 🚀'; }
    }
};

window.cancelPendingSocialChallenge = async function(challengeId) {
    const user = auth.currentUser;
    if (!user || !challengeId) return;
    if (!window.confirm('보낸 챌린지 초대를 취소할까요?')) return;

    try {
        const fn = httpsCallable(functions, 'cancelSocialChallenge');
        await fn({ challengeId });
        showToast('보낸 챌린지 초대를 취소했어요.');
        renderSocialChallenges(user).catch(() => {});
    } catch (e) {
        console.error('[cancelPendingSocialChallenge]', e);
        showToast(`⚠️ ${e.message || '챌린지 취소에 실패했어요.'}`);
    }
};

/** 챌린지 초대 모달 열기 */
window.openChallengeInviteModal = async function(challengeId) {
    const modal = document.getElementById('challenge-invite-modal');
    const info = document.getElementById('challenge-invite-info');
    if (!modal || !info) return;

    try {
        const snap = await getDoc(doc(db, 'social_challenges', challengeId));
        if (!snap.exists()) { showToast('챌린지를 찾을 수 없어요'); return; }
        const ch = snap.data();
        const typeLabel = ch.type === 'competition' ? '⚔️ 1:1 경쟁' : '👥 단체 목표';
        const stakeInfo = ch.type === 'competition' ? `\n스테이크: <b>${ch.stakePoints}P</b>` : '';
        info.innerHTML = `<b>${escapeHtml(ch.creatorName)}</b>님이 보낸 초대<br>
            유형: <b>${typeLabel}</b><br>
            기간: <b>${ch.durationDays}일</b>${stakeInfo}<br>
            <span style="font-size:11px;color:#aaa;margin-top:4px;display:block;">수락하면 오늘부터 챌린지가 시작돼요</span>`;
        _challengeState.pendingInviteId = challengeId;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    } catch (e) {
        showToast('챌린지 정보를 불러올 수 없어요');
    }
};

window.closeChallengeInviteModal = function() {
    const modal = document.getElementById('challenge-invite-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    _challengeState.pendingInviteId = null;
};

window.respondChallenge = async function(accept) {
    const challengeId = _challengeState.pendingInviteId;
    if (!challengeId) return;

    closeChallengeInviteModal();

    try {
        const fn = httpsCallable(functions, 'respondSocialChallenge');
        const result = await fn({ challengeId, accept });
        if (accept) {
            const msg = result.data?.status === 'active'
                ? '🎉 챌린지가 시작됐어요! 화이팅!'
                : '✅ 수락 완료! 나머지 친구의 수락을 기다리고 있어요';
            showToast(msg);
        } else {
            showToast('챌린지 초대를 거절했어요');
        }
        const user = auth.currentUser;
        if (user) renderSocialChallenges(user).catch(() => {});
    } catch (e) {
        console.error('[respondChallenge]', e);
        showToast(`⚠️ ${e.message || '처리에 실패했어요'}`);
    }
};

/** 챌린지 결산 알림 확인 (대시보드 로드 시 호출) */
async function checkChallengeNotifications(uid) {
    try {
        const storageKey = `challengeNotifSeen_${uid}`;
        const lastSeen = parseInt(localStorage.getItem(storageKey) || '0');

        const snap = await getDocs(query(
            collection(db, 'notifications'),
            where('postOwnerId', '==', uid),
            where('type', 'in', ['friend_request', 'friend_connected', 'friend_declined', 'challenge_invite', 'challenge_settled']),
            orderBy('createdAt', 'desc'),
            limit(5)
        ));

        let hasNew = false;
        let newestSeenTs = lastSeen;
        let openedFriendRequestModal = false;
        snap.forEach(d => {
            const data = d.data();
            const ts = data.createdAt?.seconds ? data.createdAt.seconds * 1000 : 0;
            if (ts <= lastSeen) return;
            hasNew = true;
            newestSeenTs = Math.max(newestSeenTs, ts);

            if (data.type === 'friend_request') {
                showToast(`👥 ${data.fromUserName || '친구'}님이 친구 요청을 보냈어요.`);
                if (!openedFriendRequestModal && data.friendshipId) {
                    openedFriendRequestModal = true;
                    setTimeout(() => {
                        openFriendRequestModal(data.friendshipId).catch(error => {
                            console.warn('[friend_request_modal]', error.message);
                        });
                    }, 150);
                }
            } else if (data.type === 'friend_connected') {
                showToast(`🤝 ${data.fromUserName || '친구'}님과 연결됐어요!`);
            } else if (data.type === 'friend_declined') {
                showToast(`🙂 ${data.fromUserName || '상대'}님이 이번 친구 요청은 보류했어요.`);
            } else if (data.type === 'challenge_invite') {
                showToast(`🏆 ${data.fromUserName}님이 챌린지에 초대했어요!\n대시보드에서 확인하세요`);
            } else if (data.type === 'challenge_settled') {
                const outcomeMsg = {
                    'success': '🎉 단체 목표 달성! 보너스 포인트가 지급됐어요',
                    'win':     '🏆 경쟁에서 승리! 스테이크와 보너스를 획득했어요',
                    'loss':    '💪 아쉽게 패배했지만 다음엔 꼭 이겨봐요',
                    'draw':    '🤝 동점! 스테이크가 반환됐어요',
                    'void':    '⚠️ 활동 기록 부족으로 챌린지가 무효 처리됐어요',
                    'missed':  '😢 목표 달성에 실패했어요. 다음엔 함께 해봐요'
                };
                showToast(outcomeMsg[data.outcome] || '📋 챌린지가 결산됐어요');
            }
        });

        if (hasNew) localStorage.setItem(storageKey, String(newestSeenTs || Date.now()));
    } catch (e) {
        console.warn('[checkChallengeNotifications]', e.message);
    }
}

