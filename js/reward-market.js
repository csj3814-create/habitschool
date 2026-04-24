import { auth, db, functions } from './firebase-config.js?v=167';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=167';

const REWARD_MARKET_CACHE_TTL = 30_000;
const DEFAULT_MIN_REDEEM_POINTS = 2000;
const DEFAULT_SETTLEMENT_ASSET = 'points';
const PENDING_REWARD_MARKET_REQUEST_KEY_PREFIX = 'habitschool:reward-market-point-redemption';

let getRewardMarketSnapshotFn = null;
let redeemRewardCouponFn = null;
let rewardMarketFunctionsReady = false;

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
    const gridEl = document.getElementById('reward-market-grid');
    if (!gridEl) return;

    if (rewardMarketState.catalog.length === 0) {
        gridEl.innerHTML = (
            '<div class="reward-market-empty">' +
                '<div class="reward-market-empty-title">상품 목록을 준비하고 있습니다.</div>' +
                '<div class="reward-market-empty-copy">기프티쇼 연동 또는 테스트 카탈로그를 확인한 뒤 이곳에 표시됩니다.</div>' +
            '</div>'
        );
        return;
    }

    gridEl.innerHTML = rewardMarketState.catalog.map((item) => {
        const costValue = getRewardCostValue(item);
        const costUnit = getRewardCostUnitLabel(item);
        const phaseLabel = item.settlementAsset === 'hbt'
            ? formatPhaseLabel(item.pricingMode || rewardMarketState.settings.pricingMode)
            : '포인트 정액가';
        return (
            '<article class="reward-market-item">' +
                '<div class="reward-market-item-topline">' +
                    '<span class="reward-market-brand">' + escapeHtml(item.brandName || '리워드 상품') + '</span>' +
                    '<span class="reward-market-stock">' + escapeHtml(item.stockLabel || '교환 가능') + '</span>' +
                '</div>' +
                '<div class="reward-market-title">' + escapeHtml(item.displayName || item.sku || '상품명 준비 중') + '</div>' +
                '<div class="reward-market-values">' +
                    '<div class="reward-market-hbt">' + formatNumber(costValue) + escapeHtml(costUnit) + '</div>' +
                    '<div class="reward-market-krw">' + formatKrw(item.faceValueKrw || 0) + '</div>' +
                '</div>' +
                '<div class="reward-market-guide">' + escapeHtml(item.healthGuide || '건강한 선택으로 이어질 수 있는 리워드를 준비했어요.') + '</div>' +
                '<div class="reward-market-quote-meta">' +
                    escapeHtml(phaseLabel) + ' · ' + escapeHtml(item.quoteVersion || 'quote pending') +
                '</div>' +
                buildRewardMarketAction(item) +
            '</article>'
        );
    }).join('');
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
    const couponImgUrl = String(item.couponImgUrl || item.barcodeUrl || '').trim();
    if (couponImgUrl) {
        return `
            <div class="reward-coupon-visual">
                <img class="reward-coupon-image" src="${escapeHtml(couponImgUrl)}" alt="${escapeHtml(item.displayName || 'coupon')}" loading="lazy">
            </div>
        `;
    }

    return `
        <div class="reward-coupon-code is-muted">
            공급사 이미지가 아직 없으면 PIN과 텍스트 정보로 먼저 보여드려요.
        </div>
    `;
}

function buildCouponCodeBlock(item = {}) {
    const pinCode = String(item.pinCode || '').trim();
    if (!pinCode) return '';
    return `<div class="reward-coupon-code">PIN ${escapeHtml(pinCode)}</div>`;
}

function renderRewardCouponVault() {
    const listEl = document.getElementById('reward-coupon-list');
    if (!listEl) return;

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
        const explorerLink = item.settlementAsset === 'hbt' && item.burnExplorerUrl
            ? '<a class="reward-coupon-link" href="' + escapeHtml(item.burnExplorerUrl) + '" target="_blank" rel="noopener">BscScan</a>'
            : '';
        const quoteLabel = item.settlementAsset === 'hbt'
            ? (item.quoteVersion
                ? escapeHtml(formatPhaseLabel(item.pricingMode || '')) + ' · ' + escapeHtml(item.quoteVersion)
                : escapeHtml(formatPhaseLabel(item.pricingMode || '')))
            : '포인트 정액가 · 앱 보관함 지급';
        return (
            '<article class="reward-coupon-item">' +
                '<div class="reward-coupon-topline">' +
                    '<span class="reward-coupon-brand">' + escapeHtml(item.brandName || '리워드 상품') + '</span>' +
                    '<span class="reward-coupon-status">' + escapeHtml(statusLabel) + '</span>' +
                '</div>' +
                '<div class="reward-coupon-title">' + escapeHtml(item.displayName || item.sku || '쿠폰 정보 준비 중') + '</div>' +
                '<div class="reward-coupon-meta">' + formatNumber(getRewardCostValue(item)) + escapeHtml(getRewardCostUnitLabel(item)) + ' · ' + formatKrw(item.faceValueKrw || 0) + '</div>' +
                '<div class="reward-coupon-quote">' + quoteLabel + '</div>' +
                buildCouponVisual(item) +
                buildCouponCodeBlock(item) +
                (item.healthGuide ? '<div class="reward-coupon-guide">' + escapeHtml(item.healthGuide) + '</div>' : '') +
                (item.manualReviewReason ? '<div class="reward-coupon-warning">' + escapeHtml(item.manualReviewReason) + '</div>' : '') +
                '<div class="reward-coupon-footer">' +
                    '<span>유효기간 ' + escapeHtml(formatDateLabel(item.expiresAt)) + '</span>' +
                    '<span>발급 ' + escapeHtml(formatDateLabel(item.issuedAt || item.createdAt, true)) + '</span>' +
                    explorerLink +
                '</div>' +
            '</article>'
        );
    }).join('');
}


function renderRewardMarketSnapshot() {
    renderRewardMarketMeta();
    renderRewardRecipientPhonePanel();
    renderRewardMarketCatalog();
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
        renderRewardMarketStatus('실발급 전에 수령 연락처를 먼저 저장해 주세요.', 'warning');
        return;
    }

    const statusText = settings.mode === 'live'
        ? '포인트 교환이 가능합니다. 쿠폰은 앱 보관함에서 바코드와 PIN으로 확인할 수 있어요.'
        : '테스트 교환이 가능합니다. 운영 전환 전까지 동일한 흐름으로 점검해 보세요.';
    renderRewardMarketStatus(statusText, 'ok');
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
        const result = await getRewardMarketSnapshotFn({});
        const data = result?.data || {};

        rewardMarketState.catalog = Array.isArray(data.catalog) ? data.catalog : [];
        rewardMarketState.redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
        rewardMarketState.reserve = data.reserve || null;
        rewardMarketState.pricing = data.pricing || null;
        rewardMarketState.settings = normalizeRewardMarketSettings(data.settings || {});
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

    const inputEl = getRewardPhoneInputEl();
    if (inputEl) {
        inputEl.value = normalizedPhone;
    }

    renderRewardRecipientPhonePanel();
    renderRewardMarketCatalog();
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
    renderRewardRecipientPhonePanel();
    renderRewardMarketCatalog();
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
