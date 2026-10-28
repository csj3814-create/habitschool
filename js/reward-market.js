import { auth, db, functions, MILESTONES } from './firebase-config.js?v=549';
import { doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { showToast, onRefreshFailure, getKstDateString } from './ui-helpers.js?v=549';
import { describeRewardGap } from './reward-pace.js?v=549';
// 화면 문구는 사전(js/i18n-ko.js·i18n-en.js 의 market.*)에 있다(해외 3단계 E3-1).
import { localizedServerText, serverErrorText, t } from './i18n.js?v=549';
import { resolveStoredStreak } from './activity-days.js?v=549';

const REWARD_MARKET_CACHE_TTL = 30_000;
const REWARD_MARKET_SNAPSHOT_TIMEOUT_MS = 7000;
const REWARD_MARKET_RETRY_DELAY_MS = 2000;
const REWARD_MARKET_MAX_RETRY_ATTEMPTS = 3;
const REWARD_REDEMPTION_TIMEOUT_MS = 180_000;
// 실측(2026-08-06 스테이징): preflight 755ms + 공급사 주문 348ms + 이미지 미러 432ms.
// 대부분 3초 안에 끝나므로 남은 시간을 예고하지 않는다. 예고할 만큼 안다고 믿을 근거가 없다.
// 드물게 늘어질 때만 경과 시간을 알려 주고, 그 전에는 버튼 잠금만으로 충분하다.
const REWARD_REDEMPTION_PROGRESS_DELAY_MS = 5_000;
const REWARD_REDEMPTION_TICK_MS = 10_000;
const DEFAULT_MIN_REDEEM_POINTS = 500;
const DEFAULT_SETTLEMENT_ASSET = 'points';
const PENDING_REWARD_MARKET_REQUEST_KEY_PREFIX = 'habitschool:reward-market-point-redemption';

let getRewardMarketSnapshotFn = null;
let redeemRewardCouponFn = null;
let reconcileRewardCouponFn = null;
let resendRewardCouponFn = null;
let dismissRewardCouponFn = null;
let markRewardCouponUsedFn = null;
let deleteRewardCouponFn = null;
let rewardMarketFunctionsReady = false;
let rewardMarketRetryTimer = null;
let rewardMarketRetryUid = '';
let rewardMarketRetryAttempts = 0;
let rewardMarketLastSuccessAt = 0;
// 최신 스냅샷 로드를 식별하는 증가 토큰. 늦게 끝난 옛 로드가 최신 상태를 덮어쓰는 것만 막는다.
let rewardMarketLoadSequence = 0;

function clearRewardMarketRetry(uid = '') {
    if (uid && rewardMarketRetryUid && rewardMarketRetryUid !== uid) return;
    if (rewardMarketRetryTimer) {
        clearTimeout(rewardMarketRetryTimer);
        rewardMarketRetryTimer = null;
    }
    rewardMarketRetryUid = uid || '';
    rewardMarketRetryAttempts = 0;
}

function scheduleRewardMarketRetry(uid, reason = 'snapshot-incomplete') {
    if (!uid || auth.currentUser?.uid !== uid) return false;
    if (rewardMarketRetryUid && rewardMarketRetryUid !== uid) {
        clearRewardMarketRetry();
    }
    rewardMarketRetryUid = uid;
    if (rewardMarketRetryAttempts >= REWARD_MARKET_MAX_RETRY_ATTEMPTS) return false;
    if (rewardMarketRetryTimer) return true;

    rewardMarketRetryTimer = setTimeout(() => {
        rewardMarketRetryTimer = null;
        if (auth.currentUser?.uid !== uid) return;
        rewardMarketRetryAttempts += 1;
        loadRewardMarketSnapshot(true).catch(onRefreshFailure('보상 마켓'));
    }, REWARD_MARKET_RETRY_DELAY_MS);
    return true;
}

async function withRewardMarketTimeout(task, timeoutMs, errorMessage = 'reward_market_timeout') {
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

const rewardMarketState = {
    uid: '',
    ts: 0,
    milestoneContext: null,
    isLoading: false,
    catalog: [],
    redemptions: [],
    reserve: null,
    pricing: null,
    settings: {
        mode: 'mock',
        settlementAsset: DEFAULT_SETTLEMENT_ASSET,
        settlementLabel: t('market.points'),
        minRedeemPoints: DEFAULT_MIN_REDEEM_POINTS,
        minRedeemHbt: DEFAULT_MIN_REDEEM_POINTS,
        requiresBurnTx: false,
        pricingMode: 'phase1_fixed_internal',
        quotedAt: '',
        nextRefreshAt: '',
        dailyBandPct: 10,
        weeklyBandPct: 25,
        deliveryMode: 'app_vault',
        fallbackPolicy: 'manual_resend',
        issuanceEnabled: true,
        issuanceBlockedReason: '',
        limits: null,
        minBizmoneyKrw: 0,
        lastBizmoneyBalanceKrw: 0,
        providerReady: true,
        providerReadyMessage: '',
        missingProviderConfig: [],
        requiresRecipientPhone: false,
        savedRecipientPhone: '',
        maskedRecipientPhone: '',
        manualResendAvailable: true,
    },
    error: '',
    expandedCouponVisualId: '',
    expandedArchivedCouponIds: new Set(),
    failedCouponVisualUrls: new Set(),
    reconcilingCouponIds: new Set(),
    reconcileAttemptedCouponIds: new Set(),
    redeemingSku: '',
    redeemingName: '',
    redeemingStartedAt: 0,
    redeemingTimer: null,
    phoneEditorOpen: true,
};

function escapeHtml(value = '') {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 상품·브랜드 이름은 기프티쇼의 한국어 그대로 온다. 다른 언어 이름은 사전에 상품 코드별로 둔다
// (market.catalog.<sku>.brandName / .displayName). 한국어 사전에는 없으니 한국어 화면은 원래 이름 그대로다.
function getRewardItemText(item = {}, field = 'displayName') {
    const original = String(item?.[field] || '').trim();
    const sku = String(item?.sku || '').trim();
    if (!sku) return original;
    const key = `market.catalog.${sku}.${field}`;
    const localized = t(key);
    return localized === key ? original : localized;
}

function formatNumber(value = 0) {
    return Number(value || 0).toLocaleString('ko-KR');
}

function formatKrw(value = 0) {
    return t('market.krw', { n: formatNumber(value) });
}

function formatDateLabel(value = '', withTime = false) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return withTime
        ? date.toLocaleString('ko-KR')
        : date.toLocaleDateString('ko-KR');
}

function getKstDaySerial(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date)
            .filter((entry) => entry.type !== 'literal')
            .map((entry) => [entry.type, Number(entry.value)])
    );
    return Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000;
}

function formatCouponExpiryLabel(value = '') {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return formatDateLabel(value);
    const expiresDay = getKstDaySerial(date);
    const today = getKstDaySerial(new Date());
    const daysLeft = expiresDay === null || today === null
        ? null
        : Math.max(0, expiresDay - today);
    const suffix = daysLeft === null ? '' : t('market.daysLeft', { n: daysLeft });
    return `${formatDateLabel(value)}${suffix}`;
}

function formatPhaseLabel(value = '') {
    return value === 'phase2_hybrid_band' ? t('market.phase.hybrid') : t('market.phase.internal');
}

function formatRewardMarketStockLabel(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return t('market.stock.available');
    const match = raw.match(/^(\d+)\s*일\s*발급$/);
    if (match) {
        return t('market.validDays', { n: match[1] });
    }
    return raw;
}

function getDisplayedPointsBalance() {
    const raw = String(document.getElementById('asset-points-display')?.textContent || '').trim();
    if (!raw) return 0;
    const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
}

function getRewardCostValue(item = {}, settings = rewardMarketState.settings || {}) {
    const settlementAsset = String(item.settlementAsset || settings.settlementAsset || DEFAULT_SETTLEMENT_ASSET).trim().toLowerCase();
    if (settlementAsset === 'hbt') {
        return Number(item.hbtCost || 0) || 0;
    }
    return Number(item.pointCost ?? item.hbtCost ?? 0) || 0;
}

function getRewardCostUnitLabel(item = {}, settings = rewardMarketState.settings || {}) {
    const settlementAsset = String(item.settlementAsset || settings.settlementAsset || DEFAULT_SETTLEMENT_ASSET).trim().toLowerCase();
    return settlementAsset === 'hbt' ? 'HBT' : 'P';
}

const REWARD_MILESTONE_TTL_MS = 5 * 60 * 1000;

/**
 * "매일 다 채우면 며칠"을 셈하려면 마일스톤 상태와 연속 기록이 필요하다.
 * 둘 다 회원 문서에 있다. 못 읽으면 보너스 없이 80P/일로만 센다 — 그래도
 * 틀린 날짜는 아니고 조금 긴 날짜일 뿐이다.
 */
async function refreshRewardMilestoneContext(uid = '') {
    const userId = String(uid || '').trim();
    if (!userId) return;

    const cached = rewardMarketState.milestoneContext;
    if (cached && cached.uid === userId && Date.now() - cached.ts < REWARD_MILESTONE_TTL_MS) return;

    try {
        const snap = await getDoc(doc(db, 'users', userId));
        const data = snap.exists() ? snap.data() : {};
        rewardMarketState.milestoneContext = {
            uid: userId,
            state: data.milestones && typeof data.milestones === 'object' ? data.milestones : {},
            // currentStreak 은 마지막 기록일 기준 값이다. 그만둔 회원에게 옛 연속을
            // 믿고 보너스를 약속하면 예고한 날짜가 빗나간다. 오늘 기준으로 환산한다.
            streak: resolveStoredStreak(data, getKstDateString()),
            ts: Date.now()
        };
    } catch (error) {
        console.warn('[reward-market] 마일스톤 상태 조회 스킵:', error?.message || error);
        rewardMarketState.milestoneContext = { uid: userId, state: {}, streak: 0, ts: Date.now() };
    }
}

function getRewardProjectionContext() {
    const context = rewardMarketState.milestoneContext;
    const matches = context && context.uid === (auth.currentUser?.uid || '');
    return {
        definitions: MILESTONES,
        state: matches ? context.state : {},
        streak: matches ? context.streak : 0
    };
}

/**
 * 자산 탭 보상 카드가 마켓과 같은 값을 보도록 넘겨 준다. 다른 회원의 카탈로그
 * (할인 여부가 회원마다 다르다)는 넘기지 않는다. 아직 못 받았으면 catalog 가 비고,
 * 카드는 정가로 그렸다가 마켓이 그려질 때 다시 맞춘다.
 */
export function getRewardGoalInputs() {
    const uid = auth.currentUser?.uid || '';
    const owned = !!uid && rewardMarketState.uid === uid;
    return {
        catalog: owned ? rewardMarketState.catalog : [],
        settings: owned ? rewardMarketState.settings : {},
        context: getRewardProjectionContext()
    };
}

function getPendingRewardRequestStorageKey(uid = '') {
    return `${PENDING_REWARD_MARKET_REQUEST_KEY_PREFIX}:${uid}`;
}

function readPendingRewardRequest(uid = '') {
    if (!uid) return null;
    try {
        const raw = localStorage.getItem(getPendingRewardRequestStorageKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.warn('pending reward request read failed:', error?.message || error);
        return null;
    }
}

function writePendingRewardRequest(uid = '', payload = {}) {
    if (!uid || !payload?.requestId) return;
    try {
        localStorage.setItem(
            getPendingRewardRequestStorageKey(uid),
            JSON.stringify({
                ...payload,
                savedAt: new Date().toISOString(),
            })
        );
    } catch (error) {
        console.warn('pending reward request save failed:', error?.message || error);
    }
}

function clearPendingRewardRequest(uid = '') {
    if (!uid) return;
    try {
        localStorage.removeItem(getPendingRewardRequestStorageKey(uid));
    } catch (error) {
        console.warn('pending reward request clear failed:', error?.message || error);
    }
}

function buildRewardClientRequestId() {
    if (globalThis.crypto?.randomUUID instanceof Function) {
        return globalThis.crypto.randomUUID();
    }
    return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRecipientPhone(rawPhone = '') {
    const digits = String(rawPhone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('82') && digits.length >= 11) {
        return `0${digits.slice(2)}`;
    }
    return digits;
}

function isValidRecipientPhone(rawPhone = '') {
    return /^0\d{9,10}$/.test(normalizeRecipientPhone(rawPhone));
}

function maskRecipientPhone(rawPhone = '') {
    const normalized = normalizeRecipientPhone(rawPhone);
    if (!normalized) return '';
    if (normalized.length <= 7) return normalized;
    return `${normalized.slice(0, 3)}-${'*'.repeat(Math.max(normalized.length - 7, 3))}-${normalized.slice(-4)}`;
}

function getRewardPhoneInputEl() {
    return document.getElementById('reward-market-phone-input');
}

function getRewardPhoneCopyEl() {
    return document.getElementById('reward-market-phone-copy');
}

function getRewardPhoneSummaryEl() {
    return document.getElementById('reward-market-phone-summary');
}

function getRewardPhoneSummaryValueEl() {
    return document.getElementById('reward-market-phone-summary-value');
}

function getRewardPhoneStatusEl() {
    return document.getElementById('reward-market-phone-status');
}

function getRewardPhoneSaveButtonEl() {
    return document.getElementById('reward-market-phone-save');
}

function getDraftRecipientPhone() {
    return normalizeRecipientPhone(getRewardPhoneInputEl()?.value || '');
}

function resolveRecipientPhoneForRedemption() {
    const draftPhone = getDraftRecipientPhone();
    if (isValidRecipientPhone(draftPhone)) return draftPhone;

    const savedPhone = normalizeRecipientPhone(rewardMarketState.settings.savedRecipientPhone || '');
    return isValidRecipientPhone(savedPhone) ? savedPhone : '';
}

function normalizeRewardMarketSettings(settings = {}) {
    const limits = settings.limits || {};
    const savedRecipientPhone = normalizeRecipientPhone(settings.savedRecipientPhone || '');
    const settlementAsset = String(settings.settlementAsset || DEFAULT_SETTLEMENT_ASSET).trim().toLowerCase() === 'hbt'
        ? 'hbt'
        : DEFAULT_SETTLEMENT_ASSET;

    return {
        mode: String(settings.mode || 'mock').trim().toLowerCase() === 'live' ? 'live' : 'mock',
        settlementAsset,
        settlementLabel: String(settings.settlementLabel || (settlementAsset === 'hbt' ? 'HBT' : t('market.points'))).trim(),
        minRedeemPoints: Math.max(
            Number(settings.minRedeemPoints || settings.minRedeemHbt || DEFAULT_MIN_REDEEM_POINTS) || DEFAULT_MIN_REDEEM_POINTS,
            DEFAULT_MIN_REDEEM_POINTS
        ),
        minRedeemHbt: Math.max(
            Number(settings.minRedeemHbt || settings.minRedeemPoints || DEFAULT_MIN_REDEEM_POINTS) || DEFAULT_MIN_REDEEM_POINTS,
            DEFAULT_MIN_REDEEM_POINTS
        ),
        requiresBurnTx: settings.requiresBurnTx === true,
        pricingMode: String(settings.pricingMode || 'phase1_fixed_internal').trim(),
        quotedAt: String(settings.quotedAt || '').trim(),
        nextRefreshAt: String(settings.nextRefreshAt || '').trim(),
        dailyBandPct: Number(settings.dailyBandPct || 0) || 0,
        weeklyBandPct: Number(settings.weeklyBandPct || 0) || 0,
        deliveryMode: String(settings.deliveryMode || 'app_vault').trim() || 'app_vault',
        fallbackPolicy: String(settings.fallbackPolicy || 'manual_resend').trim() || 'manual_resend',
        issuanceEnabled: settings.issuanceEnabled !== false,
        issuanceBlockedReason: String(settings.issuanceBlockedReason || '').trim(),
        limits: {
            daily: limits.daily || null,
            weekly: limits.weekly || null,
            monthly: limits.monthly || null,
        },
        minBizmoneyKrw: Number(settings.minBizmoneyKrw || 0) || 0,
        lastBizmoneyBalanceKrw: Number(settings.lastBizmoneyBalanceKrw || 0) || 0,
        providerReady: settings.providerReady !== false,
        providerReadyMessage: String(settings.providerReadyMessage || '').trim(),
        missingProviderConfig: Array.isArray(settings.missingProviderConfig) ? settings.missingProviderConfig : [],
        requiresRecipientPhone: settings.requiresRecipientPhone === true,
        savedRecipientPhone,
        maskedRecipientPhone: String(settings.maskedRecipientPhone || '').trim() || maskRecipientPhone(savedRecipientPhone),
        manualResendAvailable: settings.manualResendAvailable !== false,
    };
}

async function ensureRewardMarketFunctions() {
    if (rewardMarketFunctionsReady) return;
    getRewardMarketSnapshotFn = httpsCallable(functions, 'getRewardMarketSnapshot');
    // 발급은 공급사 왕복이 걸려 있어 기본 70초 안에 못 끝날 수 있다. 서버 함수는 180초까지
    // 일하는데 클라이언트가 먼저 deadline-exceeded로 포기하면, 실제로는 발급되고 있는 교환을
    // 실패로 보여 주게 되고 사용자가 같은 교환을 반복해서 누른다. 서버와 같은 창을 준다.
    redeemRewardCouponFn = httpsCallable(functions, 'redeemRewardCoupon', {
        timeout: REWARD_REDEMPTION_TIMEOUT_MS,
    });
    reconcileRewardCouponFn = httpsCallable(functions, 'reconcileRewardCoupon');
    resendRewardCouponFn = httpsCallable(functions, 'resendRewardCoupon');
    dismissRewardCouponFn = httpsCallable(functions, 'dismissRewardCoupon');
    markRewardCouponUsedFn = httpsCallable(functions, 'markRewardCouponUsed');
    deleteRewardCouponFn = httpsCallable(functions, 'deleteRewardCoupon');
    rewardMarketFunctionsReady = true;
}

function renderRewardMarketStatus(message = '', tone = 'muted') {
    const statusEl = document.getElementById('reward-market-status');
    if (!statusEl) return;
    if (!message) {
        statusEl.textContent = '';
        statusEl.className = 'reward-market-status is-empty';
        return;
    }
    statusEl.textContent = message;
    statusEl.className = `reward-market-status tone-${tone}`;
}

function buildLimitChip(label, bucket) {
    return '';
}

function renderRewardMarketMeta() {
    const metaEl = document.getElementById('reward-market-meta');
    if (!metaEl) return;
    metaEl.innerHTML = '';
}

function renderRewardRecipientPhonePanel() {
    const settings = rewardMarketState.settings || {};
    const copyEl = getRewardPhoneCopyEl();
    const statusEl = getRewardPhoneStatusEl();
    const inputEl = getRewardPhoneInputEl();
    const saveButtonEl = getRewardPhoneSaveButtonEl();

    if (!copyEl || !statusEl || !inputEl || !saveButtonEl) return;

    const draftPhone = getDraftRecipientPhone();
    const savedPhone = normalizeRecipientPhone(settings.savedRecipientPhone || '');
    const resolvedPhone = resolveRecipientPhoneForRedemption();
    const hasFocus = document.activeElement === inputEl;

    if (!hasFocus || !draftPhone) {
        inputEl.value = draftPhone || savedPhone || '';
    }

    copyEl.textContent = settings.mode === 'live'
        ? t('market.phone.liveHelper')
        : t('market.phone.mockHelper');

    saveButtonEl.disabled = !isValidRecipientPhone(draftPhone) || draftPhone === savedPhone;

    if (draftPhone && !isValidRecipientPhone(draftPhone)) {
        statusEl.textContent = t('market.phone.format');
        statusEl.className = 'reward-market-phone-status warning';
        return;
    }

    if (resolvedPhone) {
        const useDraftPhone = draftPhone && draftPhone !== savedPhone;
        const maskedPhone = useDraftPhone
            ? maskRecipientPhone(draftPhone)
            : (settings.maskedRecipientPhone || maskRecipientPhone(resolvedPhone));
        statusEl.textContent = t('market.phone.status', {
            source: useDraftPhone ? t('market.phone.sourceEntered') : t('market.phone.sourceSaved'),
            phone: maskedPhone
        });
        statusEl.className = 'reward-market-phone-status ok';
        return;
    }

    statusEl.textContent = settings.mode === 'live'
        ? t('market.phone.needLive')
        : t('market.phone.needMock');
    statusEl.className = 'reward-market-phone-status muted';
}

function buildRewardMarketAction(item = {}) {
    const settings = rewardMarketState.settings || {};
    const pointBalance = getDisplayedPointsBalance();
    const requiredCost = getRewardCostValue(item, settings);
    const canAfford = pointBalance >= requiredCost;
    const isLive = settings.mode === 'live';

    let label = isLive ? t('market.btn.pointTrade') : t('market.btn.testTrade');
    let disabled = false;
    let helper = '';

    if (item.available === false) {
        label = t('market.btn.checkingStock');
        disabled = true;
    } else if (!settings.issuanceEnabled) {
        label = t('market.btn.tradePreparing');
        disabled = true;
    } else if (!item.redeemable) {
        label = t('market.btn.unavailable');
        disabled = true;
        helper = localizedServerText(item.blockedReason, item.blockedReasonI18n, '');
    } else if (!canAfford) {
        label = t('market.btn.notEnough');
        disabled = true;
    } else if (isLive && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        label = t('market.btn.needPhone');
        disabled = true;
        helper = t('market.phone.saveBeforeLive');
    }

    if (isRewardRedemptionInFlight(item.sku)) {
        label = t('market.btn.issuing');
        disabled = true;
        helper = t('market.issuingHelper');
    }

    const encodedSku = encodeURIComponent(String(item.sku || ''));
    return (
        '<div class="reward-market-action-wrap">' +
            '<button type="button" class="reward-market-action" onclick="requestRewardMarketRedemption(\'' + encodedSku + '\')"' + (disabled ? ' disabled' : '') + '>' +
                escapeHtml(label) +
            '</button>' +
            (helper ? '<div class="reward-market-helper">' + escapeHtml(helper) + '</div>' : '') +
        '</div>'
    );
}


function renderRewardMarketCatalog() {
    return renderRewardMarketCatalogView();
}


function buildCompactLimitChip(settings = {}) {
    return '';
}

function renderRewardMarketMetaView() {
    const metaEl = document.getElementById('reward-market-meta');
    if (!metaEl) return;
    metaEl.innerHTML = '';
}

function renderRewardRecipientPhonePanelView() {
    const settings = rewardMarketState.settings || {};
    const summaryEl = getRewardPhoneSummaryEl();
    const summaryValueEl = getRewardPhoneSummaryValueEl();
    const statusEl = getRewardPhoneStatusEl();
    const inputEl = getRewardPhoneInputEl();
    const saveButtonEl = getRewardPhoneSaveButtonEl();
    const formEl = inputEl?.closest('.reward-market-phone-form') || null;

    if (!summaryEl || !summaryValueEl || !statusEl || !inputEl || !saveButtonEl || !formEl) return;

    const draftPhone = getDraftRecipientPhone();
    const savedPhone = normalizeRecipientPhone(settings.savedRecipientPhone || '');
    const resolvedPhone = resolveRecipientPhoneForRedemption();
    const hasFocus = document.activeElement === inputEl;
    const hasSavedPhone = isValidRecipientPhone(savedPhone);
    const shouldShowEditor = rewardMarketState.phoneEditorOpen || !hasSavedPhone;

    summaryEl.hidden = shouldShowEditor;
    formEl.hidden = !shouldShowEditor;

    if ((!hasFocus || !draftPhone) && shouldShowEditor) {
        inputEl.value = draftPhone || savedPhone || '';
    }

    if (!shouldShowEditor && hasSavedPhone) {
        // 제목 아래 안내 줄("실발급 전에 쓸 번호예요")은 2026-10-16 대표 요청으로 지웠다.
        summaryValueEl.textContent = t('market.phone.savedSummary', { phone: settings.maskedRecipientPhone || maskRecipientPhone(savedPhone) });
        statusEl.textContent = '';
        statusEl.className = 'reward-market-phone-status muted';
        return;
    }

    saveButtonEl.disabled = !isValidRecipientPhone(draftPhone) || draftPhone === savedPhone;

    if (draftPhone && !isValidRecipientPhone(draftPhone)) {
        statusEl.textContent = t('market.phone.format');
        statusEl.className = 'reward-market-phone-status warning';
        return;
    }

    if (resolvedPhone) {
        const useDraftPhone = draftPhone && draftPhone !== savedPhone;
        const maskedPhone = useDraftPhone
            ? maskRecipientPhone(draftPhone)
            : (settings.maskedRecipientPhone || maskRecipientPhone(resolvedPhone));
        statusEl.textContent = t('market.phone.status', {
            source: useDraftPhone ? t('market.phone.sourceEntered') : t('market.phone.sourceSavedShort'),
            phone: maskedPhone,
        });
        statusEl.className = 'reward-market-phone-status ok';
        return;
    }

    statusEl.textContent = settings.mode === 'live'
        ? t('market.phone.saveBeforeLiveShort')
        : '';
    statusEl.className = 'reward-market-phone-status muted';
}

function buildRewardMarketActionView(item = {}) {
    const settings = rewardMarketState.settings || {};
    const pointBalance = getDisplayedPointsBalance();
    const requiredCost = getRewardCostValue(item, settings);
    const costUnit = getRewardCostUnitLabel(item, settings);
    const canAfford = pointBalance >= requiredCost;
    const isLive = settings.mode === 'live';

    let label = isLive ? t('market.btn.tradeFor', { cost: formatNumber(requiredCost), unit: costUnit }) : t('market.btn.testIssue');
    let disabled = false;
    let helper = '';

    if (item.available === false) {
        label = t('market.btn.preparing');
        disabled = true;
    } else if (!settings.issuanceEnabled) {
        label = t('market.btn.tradePreparing');
        disabled = true;
    } else if (!item.redeemable) {
        label = t('market.btn.unavailable');
        disabled = true;
        helper = localizedServerText(item.blockedReason, item.blockedReasonI18n, '');
    } else if (!canAfford) {
        label = t('market.btn.needs', { cost: formatNumber(requiredCost), unit: costUnit });
        disabled = true;
        // 잠긴 버튼만 보여주면 2주 남은 것과 두 달 남은 것이 똑같아 보인다.
        helper = describeRewardGap(requiredCost - pointBalance, getRewardProjectionContext(), costUnit)?.text || '';
    } else if (isLive && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        label = t('market.btn.needPhone');
        disabled = true;
        helper = t('market.phone.saveBeforeLiveShort');
    }

    if (isRewardRedemptionInFlight(item.sku)) {
        label = t('market.btn.issuing');
        disabled = true;
        helper = t('market.issuingHelper');
    }

    const encodedSku = encodeURIComponent(String(item.sku || ''));
    return (
        '<div class="reward-market-action-wrap">' +
            '<button type="button" class="reward-market-action" onclick="requestRewardMarketRedemption(\'' + encodedSku + '\')"' + (disabled ? ' disabled' : '') + '>' +
                escapeHtml(label) +
            '</button>' +
            (helper ? '<div class="reward-market-helper">' + escapeHtml(helper) + '</div>' : '') +
        '</div>'
    );
}

function getRewardProductImageUrl(item = {}) {
    return String(
        item.productImageUrl
        || item.imageUrl
        || item.goodsImageUrl
        || item.thumbnailUrl
        || ''
    ).trim();
}

function getRewardBrandLogoUrl(item = {}) {
    return String(
        item.brandLogoUrl
        || item.logoUrl
        || item.brandImageUrl
        || ''
    ).trim();
}

function buildRewardBrandIdentity(item = {}, brandClassName = 'reward-market-brand') {
    const logoUrl = getRewardBrandLogoUrl(item);
    const brandLabel = escapeHtml(getRewardItemText(item, 'brandName') || t('market.rewardItem'));
    const logoMarkup = logoUrl
        ? '<span class="reward-brand-mark"><img src="' + escapeHtml(logoUrl) + '" alt="' + escapeHtml(t('market.brandLogoAlt', { brand: getRewardItemText(item, 'brandName') || t('market.rewardItem') })) + '" loading="lazy"></span>'
        : '';

    return (
        '<span class="reward-brand-wrap">' +
            logoMarkup +
            '<span class="' + brandClassName + '">' + brandLabel + '</span>' +
        '</span>'
    );
}

function buildRewardProductHero(item = {}) {
    const imageUrl = getRewardProductImageUrl(item);
    if (!imageUrl) return '';

    return (
        '<div class="reward-market-hero">' +
            '<img class="reward-market-hero-image" src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(getRewardItemText(item) || getRewardItemText(item, 'brandName') || 'reward product') + '" loading="lazy">' +
        '</div>'
    );
}

function buildMockBarcodeDataUrl(value = '', options = {}) {
    const normalized = String(value || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
    if (!normalized) return '';
    const isTest = options?.isTest === true;

    const bitStream = ['101011'];
    for (const character of normalized) {
        const bits = character.charCodeAt(0).toString(2).padStart(8, '0');
        bitStream.push(bits, '0');
    }
    bitStream.push('110101');

    const unit = 2;
    const barTop = isTest ? 38 : 12;
    const barHeight = 84;
    const labelHeight = isTest ? 26 : 0;
    const textY = barTop + barHeight + 22;
    const totalHeight = textY + 16;
    const width = Math.max(bitStream.join('').length * unit, 180);
    let x = 0;
    const bars = [];
    for (const bit of bitStream.join('')) {
        if (bit === '1') {
            bars.push(`<rect x="${x}" y="${barTop}" width="${unit}" height="${barHeight}" rx="0.8" fill="#111111" />`);
        }
        x += unit;
    }
    const testBadge = isTest ? `
        <rect x="12" y="10" width="64" height="${labelHeight}" rx="13" fill="#ff8a00" />
        <text x="44" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#ffffff">${t('market.testBadge')}</text>
    ` : '';
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" role="img" aria-label="barcode">
            <rect width="${width}" height="${totalHeight}" fill="#ffffff" />
            ${testBadge}
            ${bars.join('')}
            <text x="${width / 2}" y="${textY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#111111">${normalized}</text>
        </svg>
    `;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function getRewardCouponVisualSource(item = {}) {
    // 공급사 원본은 http:// 로 올 수 있어 HTTPS 앱에서 막힌다. 발급·복구 시 Storage로 옮겨 둔
    // HTTPS 사본이 있으면 그걸 먼저 쓰고, 없을 때만 공급사 주소를 그대로 시도한다.
    const mirroredImageUrl = String(item.couponImageStorageUrl || '').trim();
    const providerImageUrl = String(item.couponImgUrl || item.barcodeUrl || '').trim();
    const isMixedContentUrl = /^http:\/\//i.test(providerImageUrl)
        && globalThis.location?.protocol === 'https:';
    const couponImageUrl = !rewardMarketState.failedCouponVisualUrls.has(mirroredImageUrl)
        ? mirroredImageUrl
        : '';
    const usableCouponImageUrl = couponImageUrl
        || (providerImageUrl
            && !isMixedContentUrl
            && !rewardMarketState.failedCouponVisualUrls.has(providerImageUrl)
            ? providerImageUrl
            : '');

    if (usableCouponImageUrl) {
        return {
            url: usableCouponImageUrl,
            className: 'reward-coupon-visual',
            expandable: true,
            kind: 'coupon',
        };
    }

    const pinCode = String(item.pinCode || '').trim();
    if (pinCode) {
        const isTest = String(item.mode || '').trim().toLowerCase() !== 'live';
        return {
            url: buildMockBarcodeDataUrl(pinCode, { isTest }),
            className: 'reward-coupon-visual is-barcode',
            expandable: true,
            kind: 'barcode',
        };
    }

    const productImageUrl = getRewardProductImageUrl(item);
    if (productImageUrl) {
        return {
            url: productImageUrl,
            className: 'reward-coupon-visual is-product',
            expandable: false,
            kind: 'product',
        };
    }

    return null;
}

function ensureRewardCouponLightbox() {
    let lightboxEl = document.getElementById('reward-coupon-lightbox');
    if (lightboxEl) return lightboxEl;

    lightboxEl = document.createElement('button');
    lightboxEl.type = 'button';
    lightboxEl.id = 'reward-coupon-lightbox';
    lightboxEl.className = 'reward-coupon-lightbox';
    lightboxEl.setAttribute('aria-hidden', 'true');
    lightboxEl.innerHTML = `
        <span class="reward-coupon-lightbox-frame">
            <img class="reward-coupon-lightbox-image" src="" alt="">
            <span class="reward-coupon-lightbox-hint">${t('market.lightboxHint')}</span>
        </span>
    `;
    lightboxEl.addEventListener('click', () => {
        closeRewardCouponLightbox();
    });
    document.body.appendChild(lightboxEl);
    return lightboxEl;
}

function showRewardCouponLightbox(item = {}) {
    const visual = getRewardCouponVisualSource(item);
    if (!visual?.url) return;
    const lightboxEl = ensureRewardCouponLightbox();
    const imageEl = lightboxEl.querySelector('.reward-coupon-lightbox-image');
    const frameEl = lightboxEl.querySelector('.reward-coupon-lightbox-frame');
    if (!imageEl) return;
    imageEl.src = visual.url;
    imageEl.alt = getRewardItemText(item) || getRewardItemText(item, 'brandName') || 'coupon barcode';
    imageEl.classList.toggle('is-barcode', visual.kind === 'barcode');
    imageEl.classList.toggle('is-rotated-barcode', visual.kind === 'barcode');
    frameEl?.classList.toggle('is-barcode', visual.kind === 'barcode');
    lightboxEl.classList.toggle('is-barcode-open', visual.kind === 'barcode');
    rewardMarketState.expandedCouponVisualId = String(item.id || '');
    lightboxEl.classList.add('is-open');
    lightboxEl.setAttribute('aria-hidden', 'false');
}

function closeRewardCouponLightbox() {
    const lightboxEl = document.getElementById('reward-coupon-lightbox');
    if (!lightboxEl) return;
    rewardMarketState.expandedCouponVisualId = '';
    lightboxEl.classList.remove('is-open');
    lightboxEl.classList.remove('is-barcode-open');
    lightboxEl.querySelector('.reward-coupon-lightbox-image')?.classList.remove('is-rotated-barcode');
    lightboxEl.setAttribute('aria-hidden', 'true');
}

function renderRewardMarketCatalogView() {
    const gridEl = document.getElementById('reward-market-grid');
    if (!gridEl) return;

    if (rewardMarketState.catalog.length === 0) {
        gridEl.innerHTML = (
            '<div class="reward-market-empty">' +
                '<div class="reward-market-empty-title">' + t('market.empty.title') + '</div>' +
                '<div class="reward-market-empty-copy">' + t('market.empty.copy') + '</div>' +
            '</div>'
        );
        return;
    }

    gridEl.innerHTML = rewardMarketState.catalog.map((item) => {
        const costValue = getRewardCostValue(item);
        const costUnit = getRewardCostUnitLabel(item);
        const faceValueLabel = formatKrw(item.faceValueKrw || 0);
        const priceA11yLabel = t('market.a11y.price', { cost: formatNumber(costValue), unit: costUnit, face: faceValueLabel })
            + (item.firstRedemptionDiscount === true ? t('market.a11y.firstDiscount') : '');

        return (
            '<article class="reward-market-item">' +
                buildRewardProductHero(item) +
                '<div class="reward-market-item-topline">' +
                    buildRewardBrandIdentity(item) +
                    '<span class="reward-market-stock">' + escapeHtml(formatRewardMarketStockLabel(item.stockLabel)) + '</span>' +
                '</div>' +
                '<div class="reward-market-title">' + escapeHtml(getRewardItemText(item) || item.sku || t('market.itemPreparing')) + '</div>' +
                '<div class="reward-market-values" aria-label="' + escapeHtml(priceA11yLabel) + '">' +
                    '<span class="reward-market-price-chip"><strong>' + formatNumber(costValue) + escapeHtml(costUnit) + '</strong></span>' +
                    '<span class="reward-market-price-separator">·</span>' +
                    '<span class="reward-market-price-chip"><strong>' + escapeHtml(faceValueLabel) + '</strong></span>' +
                '</div>' +
                buildFirstRedemptionBadge(item) +
                buildRewardMarketActionView(item) +
            '</article>'
        );
    }).join('');
}

/**
 * 왜 싼지 말해 준다.
 *
 * 값만 1,400P 로 내려가 있으면 회원은 그게 원래 가격인 줄 안다. 그러면 "첫 잔은
 * 싸게 드린다"는 뜻이 전해지지 않고, 두 번째 교환에서 2,000P 를 보고 값이 오른
 * 줄 안다. 할인이라는 사실과 원래 가격을 같이 보여야 한다.
 */
function buildFirstRedemptionBadge(item = {}) {
    if (item.firstRedemptionDiscount !== true) return '';
    const original = Number(item.originalPointCost || 0);
    if (!(original > 0)) return '';
    const unit = getRewardCostUnitLabel(item);
    return '<div class="reward-market-first-discount">'
        + t('market.firstDiscountPrefix') + '<s>' + formatNumber(original) + escapeHtml(unit) + '</s>'
        + '</div>';
}

function getRewardMarketReadyStatusText(settings = {}) {
    return settings.mode === 'live'
        ? t('market.status.readyLive')
        : t('market.status.readyTest');
}

function buildCouponStatusLabel(status = '') {
    switch (String(status || '').trim()) {
        case 'issued':
            return t('market.status.issued');
        case 'pending_issue':
            return t('market.status.pending');
        case 'failed_manual_review':
            return t('market.status.manual');
        case 'cancelled':
            return t('market.status.cancelled');
        default:
            return status || t('market.status.checking');
    }
}

function hasRewardCouponPayload(item = {}) {
    return Boolean(
        String(item.pinCode || '').trim()
        || String(item.couponImageStorageUrl || '').trim()
        || String(item.couponImgUrl || '').trim()
        || String(item.barcodeUrl || '').trim()
    );
}

function hasRewardCouponProviderSmsEvidence(item = {}) {
    const sendCode = String(item.providerSendStatusCode || '').trim().toUpperCase();
    const sendMessage = String(item.providerSendStatusMessage || '').trim().toLowerCase();
    const pinCode = String(item.providerPinStatusCode || '').trim().toUpperCase();
    const pinMessage = String(item.providerPinStatusMessage || '').trim().toLowerCase();
    const sendConfirmed = sendCode === '1000' || sendMessage.includes('발송완료') || sendMessage.includes('delivered');
    const pinConfirmed = pinCode === '01' || pinMessage.includes('발행') || pinMessage.includes('issued');
    return sendConfirmed && pinConfirmed;
}

function buildCouponVisual(item = {}) {
    const visual = getRewardCouponVisualSource(item);
    if (!visual?.url) {
        return `
            <div class="reward-coupon-code is-muted">
                바코드 정보가 아직 없으면 PIN으로 먼저 확인해 주세요.
            </div>
        `;
    }

    const productNotice = visual.kind === 'product'
        ? '<div class="reward-coupon-code is-muted">' + t('market.coupon.imageOnly') + '</div>'
        : '';
    const visualMarkup = `
        <div class="${visual.className}">
            <img class="reward-coupon-image" src="${escapeHtml(visual.url)}" data-coupon-visual-url="${escapeHtml(visual.url)}" alt="${escapeHtml(getRewardItemText(item) || 'coupon')}" loading="lazy">
        </div>${productNotice}
    `;

    if (!visual.expandable || !item.id) {
        return visualMarkup;
    }

    return `
        <button type="button" class="reward-coupon-visual-button" onclick="toggleRewardCouponVisual('${encodeURIComponent(String(item.id || ''))}')">
            ${visualMarkup}
        </button>
    `;
}

function ensureRewardCouponImageFallbackHandling(listEl) {
    if (!listEl || listEl.dataset.couponImageFallbackReady === 'true') return;
    listEl.dataset.couponImageFallbackReady = 'true';
    listEl.addEventListener('error', (event) => {
        const imageEl = event.target;
        if (!(imageEl instanceof HTMLImageElement) || !imageEl.classList.contains('reward-coupon-image')) return;
        const failedUrl = String(imageEl.dataset.couponVisualUrl || imageEl.currentSrc || imageEl.src || '').trim();
        if (!failedUrl || rewardMarketState.failedCouponVisualUrls.has(failedUrl)) return;
        rewardMarketState.failedCouponVisualUrls.add(failedUrl);
        renderRewardCouponVault();
    }, true);
}

function buildCouponProductThumb(item = {}) {
    const productImageUrl = getRewardProductImageUrl(item);
    if (!productImageUrl) return '';
    return `
        <div class="reward-coupon-product-thumb">
            <img class="reward-coupon-product-thumb-image" src="${escapeHtml(productImageUrl)}" alt="${escapeHtml(getRewardItemText(item) || getRewardItemText(item, 'brandName') || 'coupon product')}" loading="lazy">
        </div>
    `;
}

function buildCouponMedia(item = {}) {
    const visual = getRewardCouponVisualSource(item);
    // 공급사 쿠폰 이미지에는 상품 사진과 상품명이 이미 들어 있다. 그 위에 상품 썸네일을
    // 또 얹으면 같은 커피 사진이 두 번 나온다. 상품 썸네일은 PIN 바코드만 있어서 무슨
    // 상품인지 알 수 없을 때만 필요하다.
    if (visual?.kind === 'product' || visual?.kind === 'coupon') {
        return buildCouponVisual(item);
    }
    const productThumb = buildCouponProductThumb(item);
    const visualMarkup = buildCouponVisual(item);
    if (productThumb && visualMarkup) {
        return `<div class="reward-coupon-media">${productThumb}${visualMarkup}</div>`;
    }
    return productThumb || visualMarkup;
}

function buildCouponCodeBlock(item = {}) {
    const pinCode = String(item.pinCode || '').trim();
    if (pinCode) return `<div class="reward-coupon-code">PIN ${escapeHtml(pinCode)}</div>`;

    // 공급사 쿠폰 이미지가 화면에 떠 있으면 바코드는 이미 보이는 상태다. 그 위에 다시
    // "문자함에서 확인해 주세요"를 얹으면 눈앞의 쿠폰을 못 쓰는 것처럼 읽힌다.
    if (getRewardCouponVisualSource(item)?.kind === 'coupon') return '';

    if (hasRewardCouponProviderSmsEvidence(item)) {
        return '<div class="reward-coupon-code is-muted">' + t('market.coupon.smsSent') + '</div>';
    }
    if (item.mmsResendRequestedAt && !item.deliveredViaMmsAt) {
        return '<div class="reward-coupon-code is-muted">' + t('market.coupon.resendRequested') + '</div>';
    }
    if (String(item.mode || '').trim().toLowerCase() === 'live' && String(item.status || '').trim() === 'issued') {
        return '<div class="reward-coupon-code is-muted">' + t('market.coupon.noPayload') + '</div>';
    }
    return '';
}

function buildArchivedCouponSummary(item = {}, { isExpanded = false } = {}) {
    const redemptionId = String(item.id || '');
    const pinCode = String(item.pinCode || '').trim();
    const title = getRewardItemText(item) || item.sku || t('market.couponPreparing');
    const meta = formatNumber(getRewardCostValue(item)) + getRewardCostUnitLabel(item) + ' · ' + formatKrw(item.faceValueKrw || 0);
    const encodedRedemptionId = escapeHtml(encodeURIComponent(redemptionId));
    const pinMarkup = pinCode
        ? '<span class="reward-coupon-archive-pin">PIN ' + escapeHtml(pinCode) + '</span>'
        : '';
    const stateClass = isExpanded ? ' is-expanded' : ' is-collapsed';

    return (
        '<button type="button" class="reward-coupon-archive-summary' + stateClass + '" ' +
            'aria-expanded="' + (isExpanded ? 'true' : 'false') + '" ' +
            'aria-label="' + escapeHtml(t('market.coupon.detail', { title, action: isExpanded ? t('market.coupon.collapse') : t('market.coupon.expand') })) + '" ' +
            'onclick="toggleRewardCouponArchiveDetail(\'' + encodedRedemptionId + '\')">' +
            '<span class="reward-coupon-archive-sensitive">' +
                '<span class="reward-coupon-archive-title">' + escapeHtml(title) + '</span>' +
                '<span class="reward-coupon-archive-meta">' + escapeHtml(meta) + '</span>' +
                pinMarkup +
            '</span>' +
        '</button>'
    );
}

function getRewardCouponExpiryMs(item = {}) {
    const date = new Date(item.expiresAt);
    return item.expiresAt && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function isRewardCouponExpired(item = {}) {
    const expiresAtMs = getRewardCouponExpiryMs(item);
    return expiresAtMs > 0 && expiresAtMs <= Date.now();
}

// 문자로 실제 발급이 끝난 건은 상태가 pending_issue로 남아 있어도 사용자 손에 있는
// 쿠폰이다. 상태만 보고 막으면 사용 완료·삭제 버튼이 통째로 사라진다.
function isRewardCouponInUserHands(item = {}) {
    const status = String(item.status || '').trim();
    if (status === 'issued') return true;
    if (['cancelled', 'refunded', 'failed_manual_review'].includes(status)) return false;
    return hasRewardCouponProviderSmsEvidence(item) || hasRewardCouponPayload(item);
}

function canMarkRewardCouponUsedItem(item = {}) {
    if (String(item.status || '').trim() === 'used_completed') return false;
    return isRewardCouponInUserHands(item) && !isRewardCouponExpired(item);
}

function canResendRewardCouponItem(item = {}) {
    const status = String(item.status || '').trim();
    return rewardMarketState.settings.manualResendAvailable !== false
        && String(item.mode || '').trim().toLowerCase() === 'live'
        && Boolean(String(item.providerTrId || '').trim())
        && !isRewardCouponExpired(item)
        && !['used_completed', 'cancelled', 'refunded'].includes(status);
}

// 살아 있는 쿠폰은 t('market.coupon.used') 처리 뒤에만 삭제 버튼이 나온다(실수 삭제 방지, 서버와 동일 기준).
function canDeleteRewardCouponItem(item = {}) {
    const status = String(item.status || '').trim();
    if (['used_completed', 'failed_manual_review', 'cancelled'].includes(status)) return true;
    return isRewardCouponExpired(item);
}

function canFoldRewardCouponItem(item = {}) {
    if (!item?.id) return false;
    const status = String(item.status || '').trim();
    return status === 'used_completed' || isRewardCouponExpired(item);
}

function isRewardCouponArchivedExpanded(item = {}) {
    const redemptionId = String(item.id || '');
    return redemptionId ? rewardMarketState.expandedArchivedCouponIds.has(redemptionId) : false;
}

function pruneExpandedArchivedCouponIds() {
    const visibleIds = new Set(
        rewardMarketState.redemptions.map((item) => String(item.id || '')).filter(Boolean)
    );
    rewardMarketState.expandedArchivedCouponIds.forEach((redemptionId) => {
        if (!visibleIds.has(redemptionId)) {
            rewardMarketState.expandedArchivedCouponIds.delete(redemptionId);
        }
    });
}

function canDismissRewardCouponItem(item = {}) {
    const status = String(item.status || '').trim();
    const mode = String(item.mode || '').trim().toLowerCase();
    if (status === 'issued' && mode !== 'live') return true;
    if (['failed_manual_review', 'cancelled'].includes(status)) return true;
    return status === 'pending_issue' && mode !== 'live';
}

function getRewardCouponDismissLabel(item = {}) {
    const status = String(item.status || '').trim();
    const mode = String(item.mode || '').trim().toLowerCase();
    if (status === 'issued' && mode !== 'live') return t('market.coupon.used');
    return t('market.coupon.remove');
}

function getRewardCouponPrimaryStatusLabel(item = {}) {
    if (rewardMarketState.reconcilingCouponIds.has(String(item.id || ''))) return t('market.coupon.reconciling');
    if (isRewardCouponExpired(item)) return t('market.coupon.expired');
    if (String(item.status || '').trim() === 'used_completed') return t('market.coupon.used');
    if (hasRewardCouponProviderSmsEvidence(item) && !hasRewardCouponPayload(item)) return t('market.coupon.smsCheckInbox');
    if (item.deliveredViaMmsAt && !hasRewardCouponPayload(item)) return t('market.coupon.viaMms');
    if (item.mmsResendRequestedAt && !item.deliveredViaMmsAt && !hasRewardCouponPayload(item)) return t('market.coupon.mmsResendRequested');
    if (String(item.mode || '').trim().toLowerCase() === 'live'
        && String(item.status || '').trim() === 'issued'
        && !hasRewardCouponPayload(item)) return t('market.coupon.needsCheck');
    return buildCouponStatusLabel(item.status);
}

async function reconcilePendingRewardCoupons() {
    const uid = auth.currentUser?.uid || '';
    if (!uid || !reconcileRewardCouponFn) return;
    const candidates = rewardMarketState.redemptions.filter((item) => {
        const id = String(item.id || '');
        return id
            && String(item.status || '').trim() === 'pending_issue'
            && String(item.mode || '').trim().toLowerCase() === 'live'
            && Boolean(String(item.providerTrId || '').trim())
            && !rewardMarketState.reconcileAttemptedCouponIds.has(id);
    });

    for (const item of candidates) {
        if (auth.currentUser?.uid !== uid) return;
        const redemptionId = String(item.id || '');
        rewardMarketState.reconcileAttemptedCouponIds.add(redemptionId);
        rewardMarketState.reconcilingCouponIds.add(redemptionId);
        renderRewardCouponVault();
        try {
            const result = await withRewardMarketTimeout(
                reconcileRewardCouponFn({ redemptionId }),
                22_000,
                'reward_coupon_reconcile_timeout'
            );
            const recovered = result?.data || null;
            if (recovered?.id && auth.currentUser?.uid === uid) {
                rewardMarketState.redemptions = rewardMarketState.redemptions.map((entry) => (
                    String(entry.id || '') === redemptionId ? recovered : entry
                ));
                rewardMarketState.ts = Date.now();
            }
        } catch (error) {
            console.info('reward coupon reconcile deferred:', error?.message || error);
        } finally {
            rewardMarketState.reconcilingCouponIds.delete(redemptionId);
            renderRewardCouponVault();
        }
    }
}

function renderRewardCouponVault() {
    const listEl = document.getElementById('reward-coupon-list');
    if (!listEl) return;

    ensureRewardCouponLightbox();
    ensureRewardCouponImageFallbackHandling(listEl);

    if (rewardMarketState.redemptions.length === 0) {
        listEl.innerHTML = (
            '<div class="reward-coupon-empty">' +
                '<div class="reward-coupon-empty-title">' + t('market.coupons.emptyTitle') + '</div>' +
                '<div class="reward-coupon-empty-copy">' + t('market.coupons.emptyCopy') + '</div>' +
            '</div>'
        );
        return;
    }

    listEl.innerHTML = rewardMarketState.redemptions.map((item) => {
        const statusLabel = getRewardCouponPrimaryStatusLabel(item);
        const expiresLabel = formatCouponExpiryLabel(item.expiresAt);
        const expiresTitle = t('market.coupon.expires');
        const shouldFoldCoupon = canFoldRewardCouponItem(item);
        const isArchivedExpanded = shouldFoldCoupon && isRewardCouponArchivedExpanded(item);
        const isArchivedCollapsed = shouldFoldCoupon && !isArchivedExpanded;
        const articleClass = 'reward-coupon-item'
            + (shouldFoldCoupon ? ' is-archived' : '')
            + (isArchivedCollapsed ? ' is-archived-collapsed' : '')
            + (isArchivedExpanded ? ' is-archived-expanded' : '');
        const detailMarkup = shouldFoldCoupon
            ? (
                buildArchivedCouponSummary(item, { isExpanded: isArchivedExpanded }) +
                (isArchivedExpanded ? buildCouponMedia(item) : '')
            )
            : (
                '<div class="reward-coupon-title">' + escapeHtml(getRewardItemText(item) || item.sku || t('market.couponPreparing')) + '</div>' +
                '<div class="reward-coupon-meta">' + formatNumber(getRewardCostValue(item)) + escapeHtml(getRewardCostUnitLabel(item)) + ' · ' + formatKrw(item.faceValueKrw || 0) + '</div>' +
                buildCouponMedia(item) +
                buildCouponCodeBlock(item)
            );
        const explorerLink = item.settlementAsset === 'hbt' && item.burnExplorerUrl
            ? '<a class="reward-coupon-link" href="' + escapeHtml(item.burnExplorerUrl) + '" target="_blank" rel="noopener">BscScan</a>'
            : '';
        const markUsedButton = canMarkRewardCouponUsedItem(item)
            ? '<button type="button" class="reward-coupon-remove" onclick="markRewardCouponUsedItem(\'' + encodeURIComponent(String(item.id || '')) + '\')">' + t('market.coupon.markUsedBtn') + '</button>'
            : '';
        const resendButton = canResendRewardCouponItem(item)
            ? '<button type="button" class="reward-coupon-remove is-resend" onclick="resendRewardCouponItem(\'' + encodeURIComponent(String(item.id || '')) + '\')">' + t('market.coupon.resendBtn') + '</button>'
            : '';
        const deleteButton = canDeleteRewardCouponItem(item)
            ? '<button type="button" class="reward-coupon-remove is-delete" onclick="deleteRewardCouponItem(\'' + encodeURIComponent(String(item.id || '')) + '\')">' + t('market.coupon.deleteBtn') + '</button>'
            : '';
        return (
            '<article class="' + articleClass + '">' +
                '<div class="reward-coupon-topline">' +
                    buildRewardBrandIdentity(item, 'reward-coupon-brand') +
                    '<div class="reward-coupon-top-actions">' +
                        '<span class="reward-coupon-status">' + escapeHtml(statusLabel) + '</span>' +
                        resendButton +
                        markUsedButton +
                        deleteButton +
                    '</div>' +
                '</div>' +
                detailMarkup +
                (item.manualReviewReason ? '<div class="reward-coupon-warning">' + escapeHtml(item.manualReviewReason) + '</div>' : '') +
                '<div class="reward-coupon-footer">' +
                    '<span>' + escapeHtml(expiresTitle) + ' ' + escapeHtml(expiresLabel) + '</span>' +
                    '<span>' + escapeHtml(t('market.coupon.issuedOn', { date: formatDateLabel(item.issuedAt || item.createdAt, true) })) + '</span>' +
                    explorerLink +
                '</div>' +
            '</article>'
        );
    }).join('');
}


function renderRewardMarketSnapshot() {
    renderRewardMarketMetaView();
    renderRewardRecipientPhonePanelView();
    renderRewardMarketCatalogView();
    renderRewardCouponVault();
    // 카탈로그·마일스톤이 바뀌면 위 보상 카드도 같은 값으로 다시 센다.
    if (typeof window.refreshAssetRewardGoal === 'function') window.refreshAssetRewardGoal();

    if (rewardMarketState.isLoading) {
        renderRewardMarketStatus(t('market.loading'), 'muted');
        return;
    }

    if (rewardMarketState.error) {
        renderRewardMarketStatus(rewardMarketState.error, 'warning');
        return;
    }

    const settings = rewardMarketState.settings || {};
    if (!settings.issuanceEnabled) {
        renderRewardMarketStatus('', 'muted');
        return;
    }

    if (settings.mode === 'live' && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        renderRewardMarketStatus(t('market.phone.saveBeforeLiveShort'), 'warning');
        return;
    }

    renderRewardMarketStatus(getRewardMarketReadyStatusText(settings), 'ok');
}


async function loadEarningPaceThenRedraw(uid, isCurrentLoad = () => true) {
    const before = rewardMarketState.milestoneContext;
    await refreshRewardMilestoneContext(uid);
    if (rewardMarketState.milestoneContext === before) return;
    if (isCurrentLoad()) renderRewardMarketSnapshot();
}

export async function loadRewardMarketSnapshot(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;
    // 이 로드가 아직 최신인지만 본다. 예전처럼 auth.currentUser / state.uid 를 조건에 넣으면
    // 토큰 갱신 등으로 잠시 어긋날 때 finally가 통째로 건너뛰어 isLoading이 영구히 true로
    // 남고 화면이 '불러오는 중'에서 멈춘다.
    const myLoadToken = ++rewardMarketLoadSequence;
    const isCurrentUserLoad = () => myLoadToken === rewardMarketLoadSequence;

    const gridEl = document.getElementById('reward-market-grid');
    if (!gridEl) return null;

    const now = Date.now();
    if (
        !forceRefresh
        && rewardMarketState.uid === user.uid
        && (now - rewardMarketState.ts) < REWARD_MARKET_CACHE_TTL
        && (rewardMarketState.catalog.length > 0 || rewardMarketState.redemptions.length > 0 || rewardMarketState.error)
    ) {
        renderRewardMarketSnapshot();
        void reconcilePendingRewardCoupons();
        void loadEarningPaceThenRedraw(user.uid, isCurrentUserLoad);
        return rewardMarketState;
    }

    rewardMarketState.uid = user.uid;
    // 적립 속도는 스냅샷을 막지 않는다. 늦게 오면 그때 다시 그리면 되고,
    // 못 구하면 남은 포인트만 말한다.
    void loadEarningPaceThenRedraw(user.uid, isCurrentUserLoad);
    rewardMarketState.isLoading = true;
    rewardMarketState.error = '';
    renderRewardMarketSnapshot();
    const loadStartedAt = Date.now();
    scheduleRewardMarketRetry(user.uid, 'snapshot-pending');

    try {
        await ensureRewardMarketFunctions();
        const result = await withRewardMarketTimeout(
            getRewardMarketSnapshotFn({}),
            REWARD_MARKET_SNAPSHOT_TIMEOUT_MS,
            'reward_market_snapshot_timeout'
        );
        const data = result?.data || {};
        if (!isCurrentUserLoad()) return null;

        rewardMarketState.catalog = Array.isArray(data.catalog) ? data.catalog : [];
        rewardMarketState.redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
        pruneExpandedArchivedCouponIds();
        rewardMarketState.reserve = data.reserve || null;
        rewardMarketState.pricing = data.pricing || null;
        rewardMarketState.settings = normalizeRewardMarketSettings(data.settings || {});
        rewardMarketState.phoneEditorOpen = !isValidRecipientPhone(rewardMarketState.settings.savedRecipientPhone || '');
        rewardMarketState.error = '';
        rewardMarketState.ts = Date.now();
        rewardMarketLastSuccessAt = rewardMarketState.ts;
        clearRewardMarketRetry(user.uid);
    } catch (error) {
        if (!isCurrentUserLoad()) return null;
        console.warn('reward market snapshot failed:', error?.message || error);
        if (rewardMarketLastSuccessAt < loadStartedAt) {
            rewardMarketState.error = t('market.loadFailed');
            scheduleRewardMarketRetry(user.uid, 'snapshot-failed');
        }
    } finally {
        if (isCurrentUserLoad()) {
            // 성공/실패와 무관하게 이 로드는 끝났다. 조건부로 두면 어느 분기에서든
            // 빠져나갈 때 '불러오는 중'이 영구히 남는다.
            rewardMarketState.isLoading = false;
            renderRewardMarketSnapshot();
            void reconcilePendingRewardCoupons();
        }
    }

    return rewardMarketState;
}

async function persistRewardRecipientPhone(phone, { silent = false } = {}) {
    const user = auth.currentUser;
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!user) {
        throw new Error(t('market.loginRequired'));
    }
    if (!isValidRecipientPhone(normalizedPhone)) {
        throw new Error(t('market.phone.format'));
    }

    await setDoc(doc(db, 'users', user.uid), {
        rewardRecipientPhone: normalizedPhone,
    }, { merge: true });

    rewardMarketState.settings.savedRecipientPhone = normalizedPhone;
    rewardMarketState.settings.maskedRecipientPhone = maskRecipientPhone(normalizedPhone);
    rewardMarketState.phoneEditorOpen = false;

    const inputEl = getRewardPhoneInputEl();
    if (inputEl) {
        inputEl.value = normalizedPhone;
    }

    renderRewardMarketSnapshot();
    if (!silent) {
        showToast(t('market.phone.savedToast'));
    }
    return normalizedPhone;
}

async function ensureRecipientPhoneForLiveRedemption() {
    const settings = rewardMarketState.settings || {};
    if (settings.mode !== 'live' || settings.requiresRecipientPhone !== true) {
        return '';
    }

    const resolvedPhone = resolveRecipientPhoneForRedemption();
    if (!resolvedPhone) {
        getRewardPhoneInputEl()?.focus();
        throw new Error(t('market.phone.requiredLive'));
    }

    if (resolvedPhone !== normalizeRecipientPhone(settings.savedRecipientPhone || '')) {
        await persistRewardRecipientPhone(resolvedPhone, { silent: true });
    }

    return resolvedPhone;
}

function shouldClearPendingRewardRequest(error = null) {
    const code = String(error?.code || '').trim();
    return [
        'functions/invalid-argument',
        'functions/failed-precondition',
        'functions/not-found',
        'functions/permission-denied',
        'functions/unauthenticated',
        'functions/out-of-range',
    ].includes(code);
}

// 발급은 보통 3초 안에 끝난다. 그동안은 버튼 잠금만으로 충분하고, 남은 시간을 예고하면
// 짧은 대기를 긴 대기처럼 보이게 만든다. 드물게 늘어질 때만 경과 시간을 알려 준다.
function isRewardRedemptionInFlight(sku = '') {
    if (!rewardMarketState.redeemingSku) return false;
    if (!sku) return true;
    return rewardMarketState.redeemingSku === String(sku || '');
}

function renderRewardRedemptionProgress() {
    const startedAt = rewardMarketState.redeemingStartedAt;
    if (!startedAt) return;
    const elapsedSec = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    const name = rewardMarketState.redeemingName || t('market.coupon');
    showToast(t('market.issuingProgress', { name, sec: elapsedSec }));
}

function startRewardRedemptionProgress(sku = '', displayName = '') {
    stopRewardRedemptionProgress();
    rewardMarketState.redeemingSku = String(sku || '');
    rewardMarketState.redeemingName = String(displayName || '');
    rewardMarketState.redeemingStartedAt = Date.now();
    renderRewardMarketSnapshot();
    // 첫 몇 초는 아무 말도 하지 않는다. 대부분 그 안에 끝난다.
    rewardMarketState.redeemingTimer = setTimeout(() => {
        renderRewardRedemptionProgress();
        rewardMarketState.redeemingTimer = setInterval(
            renderRewardRedemptionProgress,
            REWARD_REDEMPTION_TICK_MS
        );
    }, REWARD_REDEMPTION_PROGRESS_DELAY_MS);
}

function stopRewardRedemptionProgress() {
    // 첫 타이머는 setTimeout, 이후는 setInterval이라 둘 다 해제한다.
    if (rewardMarketState.redeemingTimer) {
        clearTimeout(rewardMarketState.redeemingTimer);
        clearInterval(rewardMarketState.redeemingTimer);
    }
    rewardMarketState.redeemingTimer = null;
    rewardMarketState.redeemingSku = '';
    rewardMarketState.redeemingName = '';
    rewardMarketState.redeemingStartedAt = 0;
    renderRewardMarketSnapshot();
}

function applyRedeemedPointBalance(result = {}) {
    const balance = Number(result?.pointBalance);
    if (!Number.isFinite(balance) || balance < 0) return;
    // 잔액의 표시 원본은 #asset-points-display다. getDisplayedPointsBalance()도 여기서
    // 읽으므로, 이 한 곳만 갱신하면 헤더 배지와 교환 가능 판정이 함께 맞춰진다.
    window.applyKnownCoinBalanceToUi?.(balance);
    renderRewardMarketSnapshot();
}

// deadline-exceeded는 서버가 실패했다는 뜻이 아니라 클라이언트가 먼저 기다리기를 그만뒀다는
// 뜻이다. 그대로 보여 주면 사용자가 실패로 읽고 다시 누른다.
function buildRewardRedemptionErrorLabel(error = null) {
    const code = String(error?.code || '').trim();
    if (code === 'functions/deadline-exceeded' || code === 'deadline-exceeded') {
        return t('market.issueSlow');
    }
    return serverErrorText(error, t('market.tradeError'));
}

// 서버는 새로 발급하지 않고 기존 건을 돌려주기도 한다. 같은 상품의 미해결 건이 있으면
// 이중 차감을 막으려고 발급을 건너뛰는데, 이때도 "보관함에 도착했어요"라고 말하면
// 사용자는 포인트도 그대로고 쿠폰도 없는 화면 앞에서 무엇이 잘못됐는지 알 수 없다.
function buildRewardRedemptionResultLabel(result = {}) {
    if (result?.unresolved === true) {
        return t('market.result.duplicatePending');
    }
    if (result?.recovered === true) {
        return t('market.result.recovered');
    }
    if (result?.existing === true) {
        return t('market.result.alreadyDone');
    }
    if (result?.status === 'failed_manual_review') {
        return t('market.result.manual');
    }
    return t('market.result.arrived');
}

function resolveRewardRequestId(user, item = {}) {
    const pending = readPendingRewardRequest(user?.uid || '');
    const requiredCost = getRewardCostValue(item);
    const pendingSavedAt = pending?.savedAt ? new Date(pending.savedAt).getTime() : 0;
    const isFresh = pendingSavedAt && (Date.now() - pendingSavedAt) < (15 * 60 * 1000);
    if (
        pending
        && pending.sku === String(item.sku || '')
        && Number(pending.pointCost || 0) === requiredCost
        && isFresh
    ) {
        return pending.requestId;
    }
    return buildRewardClientRequestId();
}

async function redeemRewardCouponMock(item = {}, clientRequestId = '') {
    await ensureRewardMarketFunctions();
    const result = await redeemRewardCouponFn({
        sku: item.sku,
        recipientPhone: resolveRecipientPhoneForRedemption(),
        quoteVersion: item.quoteVersion,
        quoteSource: item.quoteSource,
        quotedPointCost: getRewardCostValue(item),
        clientRequestId,
    });
    return result?.data || {};
}

async function redeemRewardCouponLive(item = {}, clientRequestId = '') {
    await ensureRewardMarketFunctions();
    const latestState = await loadRewardMarketSnapshot(true);
    const latestItem = latestState?.catalog?.find((entry) => String(entry.sku || '') === String(item.sku || ''));
    if (!latestItem) {
        throw new Error(t('market.reloadItem'));
    }
    if (!latestState.settings.issuanceEnabled) {
        throw new Error(t('market.tradesPreparing'));
    }
    if (!latestItem.redeemable) {
        throw new Error(localizedServerText(latestItem.blockedReason, latestItem.blockedReasonI18n, t('market.cannotTrade')));
    }

    const recipientPhone = await ensureRecipientPhoneForLiveRedemption();
    const result = await redeemRewardCouponFn({
        sku: latestItem.sku,
        recipientPhone,
        quoteVersion: latestItem.quoteVersion,
        quoteSource: latestItem.quoteSource,
        quotedPointCost: getRewardCostValue(latestItem, latestState.settings),
        clientRequestId,
    });
    return result?.data || {};
}

window.refreshRewardMarketSnapshot = function () {
    return loadRewardMarketSnapshot(true);
};

window.handleRewardRecipientPhoneInput = function () {
    renderRewardMarketSnapshot();
};

window.editRewardRecipientPhone = function () {
    rewardMarketState.phoneEditorOpen = true;
    renderRewardMarketSnapshot();
    getRewardPhoneInputEl()?.focus();
};

window.saveRewardRecipientPhone = async function () {
    try {
        await persistRewardRecipientPhone(getDraftRecipientPhone());
        return true;
    } catch (error) {
        showToast(serverErrorText(error, t('market.phone.saveFailed')));
        return false;
    }
};

window.toggleRewardCouponVisual = function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) return false;

    const isOpen = rewardMarketState.expandedCouponVisualId === redemptionId
        && document.getElementById('reward-coupon-lightbox')?.classList.contains('is-open');
    if (isOpen) {
        closeRewardCouponLightbox();
        return true;
    }

    const item = rewardMarketState.redemptions.find((entry) => String(entry.id || '') === redemptionId);
    if (!item) return false;

    showRewardCouponLightbox(item);
    return true;
};

window.toggleRewardCouponArchiveDetail = function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) return false;

    if (rewardMarketState.expandedArchivedCouponIds.has(redemptionId)) {
        rewardMarketState.expandedArchivedCouponIds.delete(redemptionId);
        if (rewardMarketState.expandedCouponVisualId === redemptionId) {
            closeRewardCouponLightbox();
        }
    } else {
        rewardMarketState.expandedArchivedCouponIds.add(redemptionId);
    }
    renderRewardCouponVault();
    return true;
};

window.resendRewardCouponItem = async function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) {
        showToast(t('market.resend.pick'));
        return false;
    }
    const item = rewardMarketState.redemptions.find(
        (entry) => String(entry.id || '') === redemptionId
    );
    if (!item || !canResendRewardCouponItem(item)) {
        showToast(t('market.resend.notAllowed'));
        return false;
    }
    const maskedPhone = rewardMarketState.settings.maskedRecipientPhone || t('market.phone.savedFallback');
    if (!window.confirm(t('market.resendConfirm', { phone: maskedPhone }))) return false;

    try {
        await ensureRewardMarketFunctions();
        const result = await resendRewardCouponFn({ redemptionId });
        await loadRewardMarketSnapshot(true);
        const target = result?.data?.maskedRecipientPhone || maskedPhone;
        showToast(t('market.resendRequested', { target }));
        return true;
    } catch (error) {
        console.error('resend reward coupon failed:', error);
        showToast(serverErrorText(error, t('market.resend.failed')));
        return false;
    }
};

window.markRewardCouponUsedItem = async function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) {
        showToast(t('market.markUsed.pick'));
        return false;
    }

    try {
        await ensureRewardMarketFunctions();
        await markRewardCouponUsedFn({
            redemptionId,
        });
        const item = rewardMarketState.redemptions.find(
            (entry) => String(entry.id || '') === redemptionId
        );
        if (item) {
            item.status = 'used_completed';
            item.usedCompletedAt = new Date().toISOString();
        }
        rewardMarketState.expandedArchivedCouponIds.delete(redemptionId);
        renderRewardMarketSnapshot();
        showToast(t('market.markUsed.done'));
        return true;
    } catch (error) {
        console.error('mark reward coupon used failed:', error);
        showToast(serverErrorText(error, t('market.markUsed.failed')));
        return false;
    }
};

window.deleteRewardCouponItem = async function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) {
        showToast(t('market.delete.pick'));
        return false;
    }

    const confirmed = window.confirm(t('market.delete.confirm'));
    if (!confirmed) return false;

    try {
        await ensureRewardMarketFunctions();
        await deleteRewardCouponFn({
            redemptionId,
        });
        rewardMarketState.redemptions = rewardMarketState.redemptions.filter(
            (entry) => String(entry.id || '') !== redemptionId
        );
        rewardMarketState.expandedArchivedCouponIds.delete(redemptionId);
        if (rewardMarketState.expandedCouponVisualId === redemptionId) {
            closeRewardCouponLightbox();
        }
        renderRewardMarketSnapshot();
        showToast(t('market.delete.done'));
        return true;
    } catch (error) {
        console.error('delete reward coupon failed:', error);
        showToast(serverErrorText(error, t('market.delete.failed')));
        return false;
    }
};

window.dismissRewardCouponItem = async function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) {
        showToast(t('market.remove.pick'));
        return false;
    }

    try {
        await ensureRewardMarketFunctions();
        await dismissRewardCouponFn({
            redemptionId,
        });
        rewardMarketState.redemptions = rewardMarketState.redemptions.filter(
            (entry) => String(entry.id || '') !== redemptionId
        );
        rewardMarketState.expandedArchivedCouponIds.delete(redemptionId);
        if (rewardMarketState.expandedCouponVisualId === redemptionId) {
            closeRewardCouponLightbox();
        }
        renderRewardMarketSnapshot();
        showToast(t('market.remove.done'));
        return true;
    } catch (error) {
        console.error('dismiss reward coupon failed:', error);
        showToast(serverErrorText(error, t('market.remove.failed')));
        return false;
    }
};

window.requestRewardMarketRedemption = async function (encodedSku = '') {
    const user = auth.currentUser;
    if (!user) {
        showToast(t('market.loginRequired'));
        return false;
    }

    if (isRewardRedemptionInFlight()) {
        renderRewardRedemptionProgress();
        return false;
    }

    const sku = decodeURIComponent(String(encodedSku || ''));
    const item = rewardMarketState.catalog.find((entry) => String(entry.sku || '') === sku);
    if (!item) {
        showToast(t('market.itemNotFound'));
        return false;
    }

    if (!item.redeemable) {
        showToast(localizedServerText(item.blockedReason, item.blockedReasonI18n, t('market.cannotTrade')));
        return false;
    }

    const requiredCost = getRewardCostValue(item);
    const pointBalance = getDisplayedPointsBalance();
    if (pointBalance < requiredCost) {
        showToast(t('market.notEnoughPoints', { n: formatNumber(pointBalance) }));
        return false;
    }

    const clientRequestId = resolveRewardRequestId(user, item);
    writePendingRewardRequest(user.uid, {
        requestId: clientRequestId,
        sku,
        pointCost: requiredCost,
    });

    startRewardRedemptionProgress(sku, getRewardItemText(item));
    try {
        const result = rewardMarketState.settings.mode === 'live'
            ? await redeemRewardCouponLive(item, clientRequestId)
            : await redeemRewardCouponMock(item, clientRequestId);
        if (result?.success === false) {
            throw new Error(result.message || 'reward_redemption_failed');
        }

        clearPendingRewardRequest(user.uid);
        stopRewardRedemptionProgress();
        // 서버가 알려준 차감 후 잔액을 먼저 반영한다. 자산 전체 재조회를 기다리면 교환이
        // 끝난 화면에 예전 포인트가 그대로 남아, 차감된 줄 모르고 또 교환하게 된다.
        applyRedeemedPointBalance(result);
        showToast(getRewardItemText(item) + ' ' + buildRewardRedemptionResultLabel(result));
        await Promise.allSettled([
            loadRewardMarketSnapshot(true),
            window.updateAssetDisplay?.(true),
        ]);
        return true;
    } catch (error) {
        console.error('reward market redemption failed:', error);
        stopRewardRedemptionProgress();
        if (shouldClearPendingRewardRequest(error)) {
            clearPendingRewardRequest(user.uid);
        }
        showToast(buildRewardRedemptionErrorLabel(error));
        return false;
    }
};


window.loadRewardMarketSnapshot = loadRewardMarketSnapshot;
