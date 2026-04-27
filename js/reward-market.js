import { auth, db, functions } from './firebase-config.js?v=168';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=168';

const REWARD_MARKET_CACHE_TTL = 30_000;
const REWARD_MARKET_SNAPSHOT_TIMEOUT_MS = 7000;
const DEFAULT_MIN_REDEEM_POINTS = 500;
const DEFAULT_SETTLEMENT_ASSET = 'points';
const PENDING_REWARD_MARKET_REQUEST_KEY_PREFIX = 'habitschool:reward-market-point-redemption';

let getRewardMarketSnapshotFn = null;
let redeemRewardCouponFn = null;
let dismissRewardCouponFn = null;
let rewardMarketFunctionsReady = false;

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
    isLoading: false,
    catalog: [],
    redemptions: [],
    reserve: null,
    pricing: null,
    settings: {
        mode: 'mock',
        settlementAsset: DEFAULT_SETTLEMENT_ASSET,
        settlementLabel: '포인트',
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

function formatNumber(value = 0) {
    return Number(value || 0).toLocaleString('ko-KR');
}

function formatKrw(value = 0) {
    return `${formatNumber(value)}원`;
}

function formatDateLabel(value = '', withTime = false) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return withTime
        ? date.toLocaleString('ko-KR')
        : date.toLocaleDateString('ko-KR');
}

function formatPhaseLabel(value = '') {
    return value === 'phase2_hybrid_band' ? '시세 완충형' : '내부 기준가';
}

function formatRewardMarketStockLabel(value = '') {
    const raw = String(value || '').trim();
    if (!raw) return '교환 가능';
    const match = raw.match(/^(\d+)\s*일\s*발급$/);
    if (match) {
        return `유효기간 ${match[1]}일`;
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
        settlementLabel: String(settings.settlementLabel || (settlementAsset === 'hbt' ? 'HBT' : '포인트')).trim(),
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
    redeemRewardCouponFn = httpsCallable(functions, 'redeemRewardCoupon');
    dismissRewardCouponFn = httpsCallable(functions, 'dismissRewardCoupon');
    rewardMarketFunctionsReady = true;
}

function renderRewardMarketStatus(message = '', tone = 'muted') {
    const statusEl = document.getElementById('reward-market-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `reward-market-status tone-${tone}`;
}

function buildLimitChip(label, bucket) {
    if (!bucket) return '';
    const remainingPoints = Number(bucket.remainingPoints ?? bucket.remainingHbt ?? 0) || 0;
    return `<div class="reward-market-chip">${escapeHtml(label)} ${formatNumber(remainingPoints)}P 남음</div>`;
}

function renderRewardMarketMeta() {
    const metaEl = document.getElementById('reward-market-meta');
    if (!metaEl) return;

    const settings = rewardMarketState.settings || {};
    const modeLabel = settings.mode === 'live' ? '실발급' : '테스트 발급';
    const isPointMarket = settings.settlementAsset !== 'hbt';
    const pricingLabel = isPointMarket ? '포인트 정액가' : formatPhaseLabel(settings.pricingMode);
    const quotedLabel = isPointMarket
        ? '내부 교환 기준 1P = 1원'
        : (settings.quotedAt ? `기준 시각 ${formatDateLabel(settings.quotedAt, true)}` : '기준 시각 준비 중');
    const nextRefreshLabel = isPointMarket
        ? 'HBT 시스템은 자산 탭에서 별도로 운영 중'
        : (settings.nextRefreshAt ? `다음 갱신 ${formatDateLabel(settings.nextRefreshAt, true)}` : '다음 갱신 준비 중');
    const supportLabel = settings.deliveryMode === 'app_vault'
        ? '앱 보관함 노출'
        : settings.deliveryMode || '앱 보관함';

    metaEl.innerHTML = `
        <div class="reward-market-chip accent">${escapeHtml(modeLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(pricingLabel)}</div>
        <div class="reward-market-chip">최소 ${formatNumber(settings.minRedeemPoints || DEFAULT_MIN_REDEEM_POINTS)}P</div>
        ${isPointMarket ? '' : `<div class="reward-market-chip">일일 변동폭 ±${formatNumber(settings.dailyBandPct || 0)}%</div>`}
        <div class="reward-market-chip">보관 방식 ${escapeHtml(supportLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(settings.providerReady ? '연동 준비됨' : '운영 설정 필요')}</div>
        <div class="reward-market-chip">${escapeHtml(settings.manualResendAvailable ? '장애 시 관제탑 재확인' : '자동 재전송 없음')}</div>
        <div class="reward-market-chip">${escapeHtml(quotedLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(nextRefreshLabel)}</div>
        ${buildLimitChip('오늘', settings.limits?.daily)}
        ${buildLimitChip('이번 주', settings.limits?.weekly)}
        ${buildLimitChip('이번 달', settings.limits?.monthly)}
    `;
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
        ? '실발급에서는 기프티쇼 규격상 수령 연락처가 필요합니다. 문자는 기본 발송하지 않고 앱 보관함에 쿠폰을 보여줍니다.'
        : '지금 연락처를 저장해 두면 실발급 전환 후에도 같은 번호로 바로 이어갈 수 있어요.';

    saveButtonEl.disabled = !isValidRecipientPhone(draftPhone) || draftPhone === savedPhone;

    if (draftPhone && !isValidRecipientPhone(draftPhone)) {
        statusEl.textContent = '전화번호를 01012345678 형식으로 입력해 주세요.';
        statusEl.className = 'reward-market-phone-status warning';
        return;
    }

    if (resolvedPhone) {
        const useDraftPhone = draftPhone && draftPhone !== savedPhone;
        const maskedPhone = useDraftPhone
            ? maskRecipientPhone(draftPhone)
            : (settings.maskedRecipientPhone || maskRecipientPhone(resolvedPhone));
        const sourceLabel = useDraftPhone ? '입력한' : '저장된';
        statusEl.textContent = `${sourceLabel} 연락처 ${maskedPhone}`;
        statusEl.className = 'reward-market-phone-status ok';
        return;
    }

    statusEl.textContent = settings.mode === 'live'
        ? '실발급 전에 수령 연락처를 먼저 입력해 주세요.'
        : '테스트 단계에서도 미리 저장해 두면 실발급 전환이 더 수월해져요.';
    statusEl.className = 'reward-market-phone-status muted';
}

function buildRewardMarketAction(item = {}) {
    const settings = rewardMarketState.settings || {};
    const pointBalance = getDisplayedPointsBalance();
    const requiredCost = getRewardCostValue(item, settings);
    const canAfford = pointBalance >= requiredCost;
    const isLive = settings.mode === 'live';

    let label = isLive ? '포인트 교환' : '테스트 교환';
    let disabled = false;
    let helper = '';

    if (item.available === false) {
        label = '재고 확인 중';
        disabled = true;
    } else if (!settings.issuanceEnabled) {
        label = '발급 일시중지';
        disabled = true;
        helper = settings.issuanceBlockedReason || '';
    } else if (!item.redeemable) {
        label = '교환 불가';
        disabled = true;
        helper = item.blockedReason || '';
    } else if (!canAfford) {
        label = '포인트 부족';
        disabled = true;
    } else if (isLive && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        label = '연락처 필요';
        disabled = true;
        helper = '실발급 전에 수령 연락처를 저장해 주세요.';
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
    const candidates = [
        ['오늘', settings.limits?.daily],
        ['이번 주', settings.limits?.weekly],
        ['이번 달', settings.limits?.monthly],
    ];
    const selected = candidates.find(([, bucket]) => bucket);
    if (!selected) return '';
    const [label, bucket] = selected;
    const remainingPoints = Number(bucket.remainingPoints ?? bucket.remainingHbt ?? 0) || 0;
    return `<div class="reward-market-chip">${escapeHtml(label)} 남은 교환 ${formatNumber(remainingPoints)}P</div>`;
}

function renderRewardMarketMetaView() {
    const metaEl = document.getElementById('reward-market-meta');
    if (!metaEl) return;

    const settings = rewardMarketState.settings || {};
    const chips = [
        buildCompactLimitChip(settings),
    ];

    if (!settings.providerReady) {
        chips.push('<div class="reward-market-chip warning">\uC6B4\uC601 \uC124\uC815 \uD544\uC694</div>');
    }

    metaEl.innerHTML = chips.filter(Boolean).join('');
}

function renderRewardRecipientPhonePanelView() {
    const settings = rewardMarketState.settings || {};
    const copyEl = getRewardPhoneCopyEl();
    const summaryEl = getRewardPhoneSummaryEl();
    const summaryValueEl = getRewardPhoneSummaryValueEl();
    const statusEl = getRewardPhoneStatusEl();
    const inputEl = getRewardPhoneInputEl();
    const saveButtonEl = getRewardPhoneSaveButtonEl();
    const formEl = inputEl?.closest('.reward-market-phone-form') || null;

    if (!copyEl || !summaryEl || !summaryValueEl || !statusEl || !inputEl || !saveButtonEl || !formEl) return;

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

    copyEl.textContent = settings.mode === 'live'
        ? '\uC2E4\uBC1C\uAE09 \uC804\uC5D0 \uC4F8 \uBC88\uD638\uC608\uC694.'
        : '\uC2E4\uBC1C\uAE09 \uC804\uD658 \uB54C \uBC14\uB85C \uC4F8 \uBC88\uD638\uC608\uC694.';

    if (!shouldShowEditor && hasSavedPhone) {
        copyEl.textContent = '실발급 전에 쓸 번호예요.';
        summaryValueEl.textContent = `저장한 연락처 ${settings.maskedRecipientPhone || maskRecipientPhone(savedPhone)}`;
        statusEl.textContent = '';
        statusEl.className = 'reward-market-phone-status muted';
        return;
    }

    saveButtonEl.disabled = !isValidRecipientPhone(draftPhone) || draftPhone === savedPhone;

    if (draftPhone && !isValidRecipientPhone(draftPhone)) {
        statusEl.textContent = '\uC804\uD654\uBC88\uD638\uB97C 01012345678 \uD615\uC2DD\uC73C\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.';
        statusEl.className = 'reward-market-phone-status warning';
        return;
    }

    if (resolvedPhone) {
        const useDraftPhone = draftPhone && draftPhone !== savedPhone;
        const maskedPhone = useDraftPhone
            ? maskRecipientPhone(draftPhone)
            : (settings.maskedRecipientPhone || maskRecipientPhone(resolvedPhone));
        const sourceLabel = useDraftPhone ? '\uC785\uB825\uD55C' : '\uC800\uC7A5\uD55C';
        statusEl.textContent = `${sourceLabel} \uC5F0\uB77D\uCC98 ${maskedPhone}`;
        statusEl.className = 'reward-market-phone-status ok';
        return;
    }

    statusEl.textContent = settings.mode === 'live'
        ? '\uC2E4\uBC1C\uAE09 \uC804\uC5D0 \uC5F0\uB77D\uCC98\uB97C \uC800\uC7A5\uD574 \uC8FC\uC138\uC694.'
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

    let label = isLive ? `${formatNumber(requiredCost)}${costUnit}로 교환` : '테스트 발급';
    let disabled = false;
    let helper = '';

    if (item.available === false) {
        label = '준비 중';
        disabled = true;
    } else if (!settings.issuanceEnabled) {
        label = '발급 일시중지';
        disabled = true;
        helper = settings.issuanceBlockedReason || '';
    } else if (!item.redeemable) {
        label = '교환 불가';
        disabled = true;
        helper = item.blockedReason || '';
    } else if (!canAfford) {
        label = `${formatNumber(requiredCost)}${costUnit} 필요`;
        disabled = true;
    } else if (isLive && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        label = '연락처 필요';
        disabled = true;
        helper = '실발급 전에 연락처를 저장해 주세요.';
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
    const brandLabel = escapeHtml(item.brandName || '리워드 상품');
    const logoMarkup = logoUrl
        ? '<span class="reward-brand-mark"><img src="' + escapeHtml(logoUrl) + '" alt="' + brandLabel + ' 로고" loading="lazy"></span>'
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
            '<img class="reward-market-hero-image" src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(item.displayName || item.brandName || 'reward product') + '" loading="lazy">' +
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
        <text x="44" y="28" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#ffffff">테스트</text>
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
    const couponImageUrl = String(item.couponImgUrl || item.barcodeUrl || '').trim();
    if (couponImageUrl) {
        return {
            url: couponImageUrl,
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
            <span class="reward-coupon-lightbox-hint">한 번 더 누르면 닫혀요.</span>
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
    imageEl.alt = item.displayName || item.brandName || 'coupon barcode';
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
                '<div class="reward-market-empty-title">상품 목록을 준비하고 있습니다.</div>' +
                '<div class="reward-market-empty-copy">기프티쇼 연동이나 테스트 카탈로그를 확인한 뒤 다시 보여드릴게요.</div>' +
            '</div>'
        );
        return;
    }

    gridEl.innerHTML = rewardMarketState.catalog.map((item) => {
        const costValue = getRewardCostValue(item);
        const costUnit = getRewardCostUnitLabel(item);

        return (
            '<article class="reward-market-item">' +
                buildRewardProductHero(item) +
                '<div class="reward-market-item-topline">' +
                    buildRewardBrandIdentity(item) +
                    '<span class="reward-market-stock">' + escapeHtml(formatRewardMarketStockLabel(item.stockLabel)) + '</span>' +
                '</div>' +
                '<div class="reward-market-title">' + escapeHtml(item.displayName || item.sku || '상품 정보 준비 중') + '</div>' +
                '<div class="reward-market-values">' +
                    '<span class="reward-market-price-chip">교환 포인트 <strong>' + formatNumber(costValue) + escapeHtml(costUnit) + '</strong></span>' +
                    '<span class="reward-market-price-separator">·</span>' +
                    '<span class="reward-market-price-chip">쿠폰 금액 <strong>' + formatKrw(item.faceValueKrw || 0) + '</strong></span>' +
                '</div>' +
                buildRewardMarketActionView(item) +
            '</article>'
        );
    }).join('');
}

function getRewardMarketReadyStatusText(settings = {}) {
    return settings.mode === 'live'
        ? '\uBC14\uB85C \uAD50\uD658\uD560 \uC218 \uC788\uC5B4\uC694.'
        : '\uD14C\uC2A4\uD2B8 \uBC1C\uAE09 \uAC00\uB2A5';
}

function buildCouponStatusLabel(status = '') {
    switch (String(status || '').trim()) {
        case 'issued':
            return '발급 완료';
        case 'pending_issue':
            return '발급 대기';
        case 'failed_manual_review':
            return '수동 확인 필요';
        case 'cancelled':
            return '취소됨';
        default:
            return status || '상태 확인 중';
    }
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

    const visualMarkup = `
        <div class="${visual.className}">
            <img class="reward-coupon-image" src="${escapeHtml(visual.url)}" alt="${escapeHtml(item.displayName || 'coupon')}" loading="lazy">
        </div>
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

function buildCouponProductThumb(item = {}) {
    const productImageUrl = getRewardProductImageUrl(item);
    if (!productImageUrl) return '';
    return `
        <div class="reward-coupon-product-thumb">
            <img class="reward-coupon-product-thumb-image" src="${escapeHtml(productImageUrl)}" alt="${escapeHtml(item.displayName || item.brandName || 'coupon product')}" loading="lazy">
        </div>
    `;
}

function buildCouponMedia(item = {}) {
    const visual = getRewardCouponVisualSource(item);
    if (visual?.kind === 'product') {
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
    if (!pinCode) return '';
    return `<div class="reward-coupon-code">PIN ${escapeHtml(pinCode)}</div>`;
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
    if (status === 'issued' && mode !== 'live') return '사용 완료';
    return '지우기';
}

function renderRewardCouponVault() {
    const listEl = document.getElementById('reward-coupon-list');
    if (!listEl) return;

    ensureRewardCouponLightbox();

    if (rewardMarketState.redemptions.length === 0) {
        listEl.innerHTML = (
            '<div class="reward-coupon-empty">' +
                '<div class="reward-coupon-empty-title">아직 받은 쿠폰이 없습니다.</div>' +
                '<div class="reward-coupon-empty-copy">상품을 교환하면 이곳에서 바코드와 PIN, 유효기간을 확인할 수 있어요.</div>' +
            '</div>'
        );
        return;
    }

    listEl.innerHTML = rewardMarketState.redemptions.map((item) => {
        const statusLabel = buildCouponStatusLabel(item.status);
        const expiresLabel = formatDateLabel(item.expiresAt);
        const explorerLink = item.settlementAsset === 'hbt' && item.burnExplorerUrl
            ? '<a class="reward-coupon-link" href="' + escapeHtml(item.burnExplorerUrl) + '" target="_blank" rel="noopener">BscScan</a>'
            : '';
        const dismissButton = canDismissRewardCouponItem(item)
            ? '<button type="button" class="reward-coupon-remove" onclick="dismissRewardCouponItem(\'' + encodeURIComponent(String(item.id || '')) + '\')">' + escapeHtml(getRewardCouponDismissLabel(item)) + '</button>'
            : '';
        return (
            '<article class="reward-coupon-item">' +
                '<div class="reward-coupon-topline">' +
                    buildRewardBrandIdentity(item, 'reward-coupon-brand') +
                    '<div class="reward-coupon-top-actions">' +
                        '<span class="reward-coupon-status">' + escapeHtml(statusLabel) + '</span>' +
                        dismissButton +
                    '</div>' +
                '</div>' +
                '<div class="reward-coupon-title">' + escapeHtml(item.displayName || item.sku || '쿠폰 정보 준비 중') + '</div>' +
                '<div class="reward-coupon-meta">' + formatNumber(getRewardCostValue(item)) + escapeHtml(getRewardCostUnitLabel(item)) + ' · ' + formatKrw(item.faceValueKrw || 0) + '</div>' +
                buildCouponMedia(item) +
                buildCouponCodeBlock(item) +
                (item.manualReviewReason ? '<div class="reward-coupon-warning">' + escapeHtml(item.manualReviewReason) + '</div>' : '') +
                '<div class="reward-coupon-footer">' +
                    '<span>유효기간 ' + escapeHtml(expiresLabel === '-' ? expiresLabel : `${expiresLabel}까지`) + '</span>' +
                    '<span>발급 ' + escapeHtml(formatDateLabel(item.issuedAt || item.createdAt, true)) + '</span>' +
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

    if (rewardMarketState.isLoading) {
        renderRewardMarketStatus('해빛 마켓을 불러오는 중입니다.', 'muted');
        return;
    }

    if (rewardMarketState.error) {
        renderRewardMarketStatus(rewardMarketState.error, 'warning');
        return;
    }

    const settings = rewardMarketState.settings || {};
    if (!settings.issuanceEnabled && settings.issuanceBlockedReason) {
        renderRewardMarketStatus(settings.issuanceBlockedReason, 'warning');
        return;
    }

    if (settings.mode === 'live' && settings.requiresRecipientPhone && !resolveRecipientPhoneForRedemption()) {
        renderRewardMarketStatus('실발급 전에 연락처를 저장해 주세요.', 'warning');
        return;
    }

    renderRewardMarketStatus(getRewardMarketReadyStatusText(settings), 'ok');
}


export async function loadRewardMarketSnapshot(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;

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
        return rewardMarketState;
    }

    rewardMarketState.uid = user.uid;
    rewardMarketState.isLoading = true;
    rewardMarketState.error = '';
    renderRewardMarketSnapshot();

    try {
        await ensureRewardMarketFunctions();
        const result = await withRewardMarketTimeout(
            getRewardMarketSnapshotFn({}),
            REWARD_MARKET_SNAPSHOT_TIMEOUT_MS,
            'reward_market_snapshot_timeout'
        );
        const data = result?.data || {};

        rewardMarketState.catalog = Array.isArray(data.catalog) ? data.catalog : [];
        rewardMarketState.redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
        rewardMarketState.reserve = data.reserve || null;
        rewardMarketState.pricing = data.pricing || null;
        rewardMarketState.settings = normalizeRewardMarketSettings(data.settings || {});
        rewardMarketState.phoneEditorOpen = !isValidRecipientPhone(rewardMarketState.settings.savedRecipientPhone || '');
        rewardMarketState.error = '';
        rewardMarketState.ts = Date.now();
    } catch (error) {
        console.warn('reward market snapshot failed:', error?.message || error);
        rewardMarketState.error = '보상 마켓 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
    } finally {
        rewardMarketState.isLoading = false;
        renderRewardMarketSnapshot();
    }

    return rewardMarketState;
}

async function persistRewardRecipientPhone(phone, { silent = false } = {}) {
    const user = auth.currentUser;
    const normalizedPhone = normalizeRecipientPhone(phone);
    if (!user) {
        throw new Error('로그인이 필요합니다.');
    }
    if (!isValidRecipientPhone(normalizedPhone)) {
        throw new Error('전화번호를 01012345678 형식으로 입력해 주세요.');
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
        showToast('쿠폰 수령 연락처를 저장했어요.');
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
        throw new Error('실발급에서는 쿠폰 수령 연락처가 필요해요.');
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
        throw new Error('선택한 상품을 다시 불러와 주세요.');
    }
    if (!latestState.settings.issuanceEnabled) {
        throw new Error(latestState.settings.issuanceBlockedReason || '현재는 발급이 일시 중지된 상태예요.');
    }
    if (!latestItem.redeemable) {
        throw new Error(latestItem.blockedReason || '지금은 이 상품을 교환할 수 없어요.');
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
        showToast(error?.message || '수령 연락처를 저장하지 못했어요.');
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

window.dismissRewardCouponItem = async function (encodedRedemptionId = '') {
    const redemptionId = decodeURIComponent(String(encodedRedemptionId || ''));
    if (!redemptionId) {
        showToast('지울 쿠폰을 다시 선택해 주세요.');
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
        if (rewardMarketState.expandedCouponVisualId === redemptionId) {
            closeRewardCouponLightbox();
        }
        renderRewardMarketSnapshot();
        showToast('목록에서 지웠어요.');
        return true;
    } catch (error) {
        console.error('dismiss reward coupon failed:', error);
        showToast(error?.message || '쿠폰 목록을 정리하지 못했어요.');
        return false;
    }
};

window.requestRewardMarketRedemption = async function (encodedSku = '') {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return false;
    }

    const sku = decodeURIComponent(String(encodedSku || ''));
    const item = rewardMarketState.catalog.find((entry) => String(entry.sku || '') === sku);
    if (!item) {
        showToast('선택한 상품 정보를 찾지 못했어요.');
        return false;
    }

    if (!item.redeemable) {
        showToast(item.blockedReason || '지금은 이 상품을 교환할 수 없어요.');
        return false;
    }

    const requiredCost = getRewardCostValue(item);
    const pointBalance = getDisplayedPointsBalance();
    if (pointBalance < requiredCost) {
        showToast('포인트가 부족해요. 현재 ' + formatNumber(pointBalance) + 'P예요.');
        return false;
    }

    const clientRequestId = resolveRewardRequestId(user, item);
    writePendingRewardRequest(user.uid, {
        requestId: clientRequestId,
        sku,
        pointCost: requiredCost,
    });

    try {
        showToast(item.displayName + ' 교환을 준비하고 있어요.');
        const result = rewardMarketState.settings.mode === 'live'
            ? await redeemRewardCouponLive(item, clientRequestId)
            : await redeemRewardCouponMock(item, clientRequestId);
        if (result?.success === false) {
            throw new Error(result.message || 'reward_redemption_failed');
        }

        clearPendingRewardRequest(user.uid);
        const statusLabel = result?.status === 'failed_manual_review'
            ? '수동 확인 대상으로 접수됐어요.'
            : '쿠폰이 보관함에 도착했어요.';
        showToast(item.displayName + ' ' + statusLabel);
        await Promise.allSettled([
            loadRewardMarketSnapshot(true),
            window.updateAssetDisplay?.(true),
        ]);
        return true;
    } catch (error) {
        console.error('reward market redemption failed:', error);
        if (shouldClearPendingRewardRequest(error)) {
            clearPendingRewardRequest(user.uid);
        }
        showToast(error?.message || '쿠폰 교환 중 오류가 발생했어요.');
        return false;
    }
};


window.loadRewardMarketSnapshot = loadRewardMarketSnapshot;

