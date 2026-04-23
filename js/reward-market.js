import { auth, functions } from './firebase-config.js?v=167';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=167';

const REWARD_MARKET_CACHE_TTL = 30_000;
const DEFAULT_MIN_REDEEM_HBT = 2000;

let getRewardMarketSnapshotFn = null;
let redeemRewardCouponFn = null;
let _rewardMarketFunctionsReady = false;

const _rewardMarketState = {
    uid: '',
    ts: 0,
    isLoading: false,
    catalog: [],
    redemptions: [],
    reserve: null,
    pricing: null,
    settings: {
        mode: 'mock',
        minRedeemHbt: DEFAULT_MIN_REDEEM_HBT,
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
        lastBizmoneyBalanceKrw: 0
    },
    error: ''
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

function getDisplayedHbtBalance() {
    const raw = String(document.getElementById('asset-hbt-display')?.textContent || '').trim();
    if (!raw) return 0;
    const numeric = Number(raw.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeRewardMarketSettings(settings = {}) {
    const limits = settings.limits || {};
    return {
        mode: String(settings.mode || 'mock').trim().toLowerCase() === 'live' ? 'live' : 'mock',
        minRedeemHbt: Math.max(Number(settings.minRedeemHbt || DEFAULT_MIN_REDEEM_HBT) || DEFAULT_MIN_REDEEM_HBT, DEFAULT_MIN_REDEEM_HBT),
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
            monthly: limits.monthly || null
        },
        minBizmoneyKrw: Number(settings.minBizmoneyKrw || 0) || 0,
        lastBizmoneyBalanceKrw: Number(settings.lastBizmoneyBalanceKrw || 0) || 0
    };
}

async function ensureRewardMarketFunctions() {
    if (_rewardMarketFunctionsReady) return;
    getRewardMarketSnapshotFn = httpsCallable(functions, 'getRewardMarketSnapshot');
    redeemRewardCouponFn = httpsCallable(functions, 'redeemRewardCoupon');
    _rewardMarketFunctionsReady = true;
}

function renderRewardMarketStatus(message = '', tone = 'muted') {
    const statusEl = document.getElementById('reward-market-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = `reward-market-status tone-${tone}`;
}

function buildLimitChip(label, bucket) {
    if (!bucket) return '';
    return `<div class="reward-market-chip">${escapeHtml(label)} ${formatNumber(bucket.remainingHbt || 0)} HBT 남음</div>`;
}

function renderRewardMarketMeta() {
    const metaEl = document.getElementById('reward-market-meta');
    if (!metaEl) return;

    const settings = _rewardMarketState.settings || {};
    const modeLabel = settings.mode === 'live' ? '실발급' : '테스트 발급';
    const pricingLabel = formatPhaseLabel(settings.pricingMode);
    const quotedLabel = settings.quotedAt ? `기준시각 ${formatDateLabel(settings.quotedAt, true)}` : '기준시각 준비 중';
    const nextRefreshLabel = settings.nextRefreshAt ? `다음 갱신 ${formatDateLabel(settings.nextRefreshAt, true)}` : '다음 갱신 준비 중';
    const supportLabel = settings.deliveryMode === 'app_vault'
        ? '앱 보관함 노출'
        : settings.deliveryMode || '앱 보관함';

    metaEl.innerHTML = `
        <div class="reward-market-chip accent">${escapeHtml(modeLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(pricingLabel)}</div>
        <div class="reward-market-chip">최소 ${formatNumber(settings.minRedeemHbt || DEFAULT_MIN_REDEEM_HBT)} HBT</div>
        <div class="reward-market-chip">일변동 ±${formatNumber(settings.dailyBandPct || 0)}%</div>
        <div class="reward-market-chip">보관 방식 ${escapeHtml(supportLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(quotedLabel)}</div>
        <div class="reward-market-chip">${escapeHtml(nextRefreshLabel)}</div>
        ${buildLimitChip('오늘', settings.limits?.daily)}
        ${buildLimitChip('이번 주', settings.limits?.weekly)}
        ${buildLimitChip('이번 달', settings.limits?.monthly)}
    `;
}

function buildRewardMarketAction(item = {}) {
    const settings = _rewardMarketState.settings || {};
    const hbtBalance = getDisplayedHbtBalance();
    const canAfford = hbtBalance >= Number(item.hbtCost || 0);
    const isLive = settings.mode === 'live';

    let label = isLive ? '소각 후 교환' : '쿠폰 발급';
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
        label = '현재 교환 불가';
        disabled = true;
        helper = item.blockedReason || '';
    } else if (!canAfford) {
        label = 'HBT 부족';
        disabled = true;
    } else if (isLive && settings.requiresBurnTx && typeof window.redeemRewardCouponOnchain !== 'function') {
        label = '지갑 연결 필요';
        disabled = true;
    }

    const encodedSku = encodeURIComponent(String(item.sku || ''));
    return `
        <div class="reward-market-action-wrap">
            <button
                type="button"
                class="reward-market-action"
                onclick="requestRewardMarketRedemption('${encodedSku}')"
                ${disabled ? 'disabled' : ''}>
                ${escapeHtml(label)}
            </button>
            ${helper ? `<div class="reward-market-helper">${escapeHtml(helper)}</div>` : ''}
        </div>
    `;
}

function renderRewardMarketCatalog() {
    const gridEl = document.getElementById('reward-market-grid');
    if (!gridEl) return;

    if (_rewardMarketState.catalog.length === 0) {
        gridEl.innerHTML = `
            <div class="reward-market-empty">
                <div class="reward-market-empty-title">등록된 보상 상품이 아직 없어요.</div>
                <div class="reward-market-empty-copy">기프티쇼 상품 연동이나 테스트 카탈로그를 확인한 뒤 다시 보여드릴게요.</div>
            </div>
        `;
        return;
    }

    gridEl.innerHTML = _rewardMarketState.catalog.map((item) => `
        <article class="reward-market-item">
            <div class="reward-market-item-topline">
                <span class="reward-market-brand">${escapeHtml(item.brandName || '해빛 마켓')}</span>
                <span class="reward-market-stock">${escapeHtml(item.stockLabel || '재고 확인')}</span>
            </div>
            <div class="reward-market-title">${escapeHtml(item.displayName || item.sku || '보상 상품')}</div>
            <div class="reward-market-values">
                <div class="reward-market-hbt">${formatNumber(item.hbtCost || 0)} HBT</div>
                <div class="reward-market-krw">${formatKrw(item.faceValueKrw || 0)}</div>
            </div>
            <div class="reward-market-guide">${escapeHtml(item.healthGuide || '건강한 선택으로 보상을 연결해 보세요.')}</div>
            <div class="reward-market-quote-meta">
                ${escapeHtml(formatPhaseLabel(item.pricingMode || _rewardMarketState.settings.pricingMode))} ·
                ${escapeHtml(item.quoteVersion || 'quote pending')}
            </div>
            ${buildRewardMarketAction(item)}
        </article>
    `).join('');
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
            제공사 이미지가 아직 도착하지 않았어요.
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

    if (_rewardMarketState.redemptions.length === 0) {
        listEl.innerHTML = `
            <div class="reward-coupon-empty">
                <div class="reward-coupon-empty-title">아직 발급된 쿠폰이 없어요.</div>
                <div class="reward-coupon-empty-copy">해빛 마켓에서 첫 보상을 교환하면 이곳에 바코드와 PIN이 보관돼요.</div>
            </div>
        `;
        return;
    }

    listEl.innerHTML = _rewardMarketState.redemptions.map((item) => {
        const statusLabel = buildCouponStatusLabel(item.status);
        const explorerLink = item.burnExplorerUrl
            ? `<a class="reward-coupon-link" href="${escapeHtml(item.burnExplorerUrl)}" target="_blank" rel="noopener">BscScan</a>`
            : '';
        const quoteLabel = item.quoteVersion
            ? `${escapeHtml(formatPhaseLabel(item.pricingMode || ''))} · ${escapeHtml(item.quoteVersion)}`
            : escapeHtml(formatPhaseLabel(item.pricingMode || ''));

        return `
            <article class="reward-coupon-item">
                <div class="reward-coupon-topline">
                    <span class="reward-coupon-brand">${escapeHtml(item.brandName || '해빛 마켓')}</span>
                    <span class="reward-coupon-status">${escapeHtml(statusLabel)}</span>
                </div>
                <div class="reward-coupon-title">${escapeHtml(item.displayName || item.sku || '쿠폰')}</div>
                <div class="reward-coupon-meta">${formatNumber(item.hbtCost || 0)} HBT · ${formatKrw(item.faceValueKrw || 0)}</div>
                <div class="reward-coupon-quote">${quoteLabel}</div>
                ${buildCouponVisual(item)}
                ${buildCouponCodeBlock(item)}
                ${item.healthGuide ? `<div class="reward-coupon-guide">${escapeHtml(item.healthGuide)}</div>` : ''}
                ${item.manualReviewReason ? `<div class="reward-coupon-warning">${escapeHtml(item.manualReviewReason)}</div>` : ''}
                <div class="reward-coupon-footer">
                    <span>유효기간 ${escapeHtml(formatDateLabel(item.expiresAt))}</span>
                    <span>발급 ${escapeHtml(formatDateLabel(item.issuedAt || item.createdAt, true))}</span>
                    ${explorerLink}
                </div>
            </article>
        `;
    }).join('');
}

function renderRewardMarketSnapshot() {
    renderRewardMarketMeta();
    renderRewardMarketCatalog();
    renderRewardCouponVault();

    if (_rewardMarketState.isLoading) {
        renderRewardMarketStatus('해빛 마켓과 쿠폰 보관함을 불러오는 중입니다.', 'muted');
        return;
    }

    if (_rewardMarketState.error) {
        renderRewardMarketStatus(_rewardMarketState.error, 'warning');
        return;
    }

    const settings = _rewardMarketState.settings;
    if (!settings.issuanceEnabled && settings.issuanceBlockedReason) {
        renderRewardMarketStatus(settings.issuanceBlockedReason, 'warning');
        return;
    }

    const statusText = settings.mode === 'live'
        ? '실발급 모드예요. HBT 소각 뒤 쿠폰 이미지와 PIN이 앱 보관함에 저장돼요.'
        : '테스트 발급 모드예요. 실 API를 연결하면 같은 흐름으로 전환돼요.';
    renderRewardMarketStatus(statusText, 'ok');
}

export async function loadRewardMarketSnapshot(forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return null;

    const gridEl = document.getElementById('reward-market-grid');
    if (!gridEl) return null;

    const now = Date.now();
    if (
        !forceRefresh &&
        _rewardMarketState.uid === user.uid &&
        (now - _rewardMarketState.ts) < REWARD_MARKET_CACHE_TTL &&
        (_rewardMarketState.catalog.length > 0 || _rewardMarketState.redemptions.length > 0 || _rewardMarketState.error)
    ) {
        renderRewardMarketSnapshot();
        return _rewardMarketState;
    }

    _rewardMarketState.uid = user.uid;
    _rewardMarketState.isLoading = true;
    _rewardMarketState.error = '';
    renderRewardMarketSnapshot();

    try {
        await ensureRewardMarketFunctions();
        const result = await getRewardMarketSnapshotFn({});
        const data = result?.data || {};

        _rewardMarketState.catalog = Array.isArray(data.catalog) ? data.catalog : [];
        _rewardMarketState.redemptions = Array.isArray(data.redemptions) ? data.redemptions : [];
        _rewardMarketState.reserve = data.reserve || null;
        _rewardMarketState.pricing = data.pricing || null;
        _rewardMarketState.settings = normalizeRewardMarketSettings(data.settings || {});
        _rewardMarketState.error = '';
        _rewardMarketState.ts = Date.now();
    } catch (error) {
        console.warn('reward market snapshot failed:', error?.message || error);
        _rewardMarketState.error = '보상 마켓 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    } finally {
        _rewardMarketState.isLoading = false;
        renderRewardMarketSnapshot();
    }

    return _rewardMarketState;
}

async function redeemRewardCouponMock(item = {}) {
    await ensureRewardMarketFunctions();
    const result = await redeemRewardCouponFn({
        sku: item.sku,
        quoteVersion: item.quoteVersion,
        quoteSource: item.quoteSource,
        quotedHbtCost: Number(item.hbtCost || 0)
    });
    return result?.data || {};
}

async function redeemRewardCouponLive(item = {}) {
    if (typeof window._loadBlockchainModule === 'function') {
        await window._loadBlockchainModule();
    }
    if (typeof window.redeemRewardCouponOnchain !== 'function') {
        throw new Error('onchain_reward_redemption_unavailable');
    }
    return window.redeemRewardCouponOnchain({
        sku: item.sku,
        hbtCost: Number(item.hbtCost || 0),
        quoteVersion: item.quoteVersion,
        quoteSource: item.quoteSource,
        quotedHbtCost: Number(item.hbtCost || 0),
        deliveryMode: item.deliveryMode || _rewardMarketState.settings.deliveryMode,
        fallbackPolicy: item.fallbackPolicy || _rewardMarketState.settings.fallbackPolicy
    });
}

window.refreshRewardMarketSnapshot = function () {
    return loadRewardMarketSnapshot(true);
};

window.requestRewardMarketRedemption = async function (encodedSku = '') {
    const user = auth.currentUser;
    if (!user) {
        showToast('로그인이 필요합니다.');
        return false;
    }

    const sku = decodeURIComponent(String(encodedSku || ''));
    const item = _rewardMarketState.catalog.find((entry) => String(entry.sku || '') === sku);
    if (!item) {
        showToast('교환할 상품을 찾지 못했어요.');
        return false;
    }

    if (!item.redeemable) {
        showToast(item.blockedReason || '현재는 이 상품을 교환할 수 없어요.');
        return false;
    }

    const hbtBalance = getDisplayedHbtBalance();
    if (hbtBalance < Number(item.hbtCost || 0)) {
        showToast(`HBT가 부족해요. 현재 ${formatNumber(hbtBalance)} HBT예요.`);
        return false;
    }

    try {
        showToast(`${item.displayName} 교환을 진행하고 있어요.`);
        const result = _rewardMarketState.settings.mode === 'live'
            ? await redeemRewardCouponLive(item)
            : await redeemRewardCouponMock(item);
        if (result?.success === false) {
            throw new Error(result.message || 'reward_redemption_failed');
        }

        const statusLabel = result?.status === 'failed_manual_review'
            ? '수동 확인으로 전환됐어요.'
            : '쿠폰이 보관함에 저장됐어요.';
        showToast(`${item.displayName} ${statusLabel}`);
        await Promise.allSettled([
            loadRewardMarketSnapshot(true),
            window.updateAssetDisplay?.(true)
        ]);
        return true;
    } catch (error) {
        console.error('reward market redemption failed:', error);
        if (error?.message === 'onchain_reward_redemption_unavailable') {
            showToast('온체인 소각 모듈이 아직 준비되지 않았어요. 잠시 뒤 다시 시도해 주세요.');
        } else {
            showToast(error?.message || '쿠폰 교환 중 문제가 생겼어요.');
        }
        return false;
    }
};

window.loadRewardMarketSnapshot = loadRewardMarketSnapshot;
