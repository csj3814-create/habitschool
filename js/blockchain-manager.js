/**
 * blockchain-manager.js
 * BSC (BNB Smart Chain) 블록체인 & 내장형 지갑 통합 모듈
 * HaBit (HBT) 토큰 거래, 스테이킹, 챌린지 관리
 * 
 * 내장형 지갑 전략: Firebase UID 기반 지갑 자동 생성
 * - 사용자가 로그인만 하면 자동으로 지갑 생성
 * - 별도 앱 설치나 복잡한 설정 불필요
 * - ethers.js를 사용하여 BSC 호환 지갑 생성
 * 
 * 온체인 연동: Cloud Functions를 통한 실제 스마트 컨트랙트 호출
 */

import { 
    HBT_TOKEN, 
    CONVERSION_RULES,
    CHALLENGES,
    formatChallengeQualificationLabel,
    getDefaultChallengeQualificationPolicy,
    normalizeChallengeQualificationPolicy,
    getActiveBscNetwork,
    getActiveGasTokenLabel,
    getActiveHbtTokenAddress,
    getActiveStakingAddress,
    getActiveChainKey
} from './blockchain-config.js?v=565';

// 구버전 챌린지 ID → 신규 통합 ID 매핑 (인라인 정의 — SW 캐시 미스매치 방지)
const CHALLENGE_ID_MAP = {
    'challenge-diet-3d': 'challenge-3d',
    'challenge-exercise-3d': 'challenge-3d',
    'challenge-mind-3d': 'challenge-3d',
    'challenge-all-3d': 'challenge-3d',
    'challenge-diet-7d': 'challenge-7d',
    'challenge-exercise-7d': 'challenge-7d',
    'challenge-mind-7d': 'challenge-7d',
    'challenge-all-7d': 'challenge-7d',
    'challenge-diet-30d': 'challenge-30d',
    'challenge-exercise-30d': 'challenge-30d',
    'challenge-mind-30d': 'challenge-30d',
    'challenge-all-30d': 'challenge-30d'
};

import { auth, db, functions, FIREBASE_REGION, APP_ENV, noteFirestoreConnectivityFailure, isFirestoreConnectivityIssue } from './firebase-config.js?v=565';
import { doc, updateDoc, setDoc, getDoc, getDocFromServer, getDocsFromServer, runTransaction, collection, addDoc, serverTimestamp, increment, deleteField, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { showToast, hideToast } from './ui-helpers.js?v=565';
// 화면 문구는 사전(js/i18n-ko.js·i18n-en.js 의 hbt.*, challenge.start.*)에 있다(해외 3단계 E3-2).
import { getLocale, serverErrorText, t } from './i18n.js?v=565';
import { getKstDateString } from './ui-helpers.js?v=565';
import { checkRateLimit } from './security.js?v=565';

// Cloud Function 참조 (lazy 초기화 — import 실패해도 모듈 로드에 영향 없음)
let mintHBTFunction = null;
let getOnchainBalanceFunction = null;
let getTokenStatsFunction = null;
let getHbtTransferHistoryFunction = null;
let claimChallengeFunction = null;
let startChallengeFunction = null;
let prefundWalletFunction = null;
let ensureReferralCodeFunction = null;
let redeemRewardCouponFunction = null;
let _functionsInitialized = false;

async function ensureFunctions() {
    if (_functionsInitialized) return;
    try {
        mintHBTFunction = httpsCallable(functions, 'mintHBT');
        getOnchainBalanceFunction = httpsCallable(functions, 'getOnchainBalance');
        getTokenStatsFunction = httpsCallable(functions, 'getTokenStats');
        getHbtTransferHistoryFunction = httpsCallable(functions, 'getHbtTransferHistory');
        startChallengeFunction = httpsCallable(functions, 'startChallenge');
        prefundWalletFunction = httpsCallable(functions, 'prefundWallet');
        ensureReferralCodeFunction = httpsCallable(functions, 'ensureReferralCode');
        redeemRewardCouponFunction = httpsCallable(functions, 'redeemRewardCoupon');
        _functionsInitialized = true;
        console.log(`✅ Cloud Functions 초기화 완료 (${FIREBASE_REGION})`);
    } catch (e) {
        console.error('⚠️ Cloud Functions 초기화 실패:', e.message);
    }
}

let userWallet = null; // ethers.Wallet 인스턴스
let userWalletAddress = null; // 0x... 주소
let externalWalletAddress = null;
let externalWalletProviderType = null;
let externalWalletChainId = null;
let externalWalletProvider = null;
let externalWalletWeb3Provider = null;
let legacyWalletEncryptedKey = null;
let legacyWalletIv = null;
let legacyWalletExportAvailable = false;
let legacyWalletPrivateKeyCache = null;
let legacyWalletRevealed = false;
let externalFirstWalletInitPromise = null;

const ACTIVE_CHAIN_KEY = getActiveChainKey(APP_ENV);
const ACTIVE_BSC_NETWORK = getActiveBscNetwork(APP_ENV);
const ACTIVE_GAS_TOKEN = getActiveGasTokenLabel(APP_ENV);
const ACTIVE_HBT_ADDRESS = getActiveHbtTokenAddress(APP_ENV);
const ACTIVE_STAKING_ADDRESS = getActiveStakingAddress(APP_ENV);
const ACTIVE_CHAIN_ID = ACTIVE_BSC_NETWORK.chainId;
const ACTIVE_CHAIN_HEX = `0x${ACTIVE_CHAIN_ID.toString(16)}`;
const ACTIVE_CHAIN_PARAMS = {
    chainId: ACTIVE_CHAIN_HEX,
    chainName: ACTIVE_BSC_NETWORK.label,
    nativeCurrency: {
        name: ACTIVE_GAS_TOKEN,
        symbol: ACTIVE_GAS_TOKEN,
        decimals: 18
    },
    rpcUrls: [ACTIVE_BSC_NETWORK.rpcUrl],
    blockExplorerUrls: [ACTIVE_BSC_NETWORK.explorer]
};

const PENDING_CHALLENGE_START_KEY_PREFIX = 'habitschool:pending-challenge-start';
const PENDING_REWARD_REDEMPTION_KEY_PREFIX = 'habitschool:pending-reward-redemption';
const challengeStartInFlight = new Set();

function getPendingChallengeStartStorageKey(uid) {
    return `${PENDING_CHALLENGE_START_KEY_PREFIX}:${ACTIVE_CHAIN_KEY}:${uid}`;
}

function getPendingRewardRedemptionStorageKey(uid) {
    return `${PENDING_REWARD_REDEMPTION_KEY_PREFIX}:${ACTIVE_CHAIN_KEY}:${uid}`;
}

function getChallengeStartLockKey(tier, challengeId) {
    return `${ACTIVE_CHAIN_KEY}:${tier || 'unknown'}:${challengeId || 'unknown'}`;
}

function readPendingChallengeStart(uid) {
    if (!uid) return null;
    try {
        const raw = localStorage.getItem(getPendingChallengeStartStorageKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.warn('⚠️ pending challenge start 읽기 실패:', error?.message || error);
        return null;
    }
}

function writePendingChallengeStart(uid, payload) {
    if (!uid || (!payload?.stakeTxHash && !payload?.stakeApprovalTxHash)) return;
    try {
        localStorage.setItem(
            getPendingChallengeStartStorageKey(uid),
            JSON.stringify({
                ...payload,
                chainKey: ACTIVE_CHAIN_KEY,
                savedAt: new Date().toISOString()
            })
        );
    } catch (error) {
        console.warn('⚠️ pending challenge start 저장 실패:', error?.message || error);
    }
}

function getPendingChallengeStakeFlowVersion(pending = {}) {
    const explicitVersion = Number(pending.stakeFlowVersion);
    if (Number.isFinite(explicitVersion) && explicitVersion >= 2) {
        return explicitVersion;
    }
    if (pending.stakeApprovalTxHash && !pending.stakeTxHash) {
        return 2;
    }
    return Number.isFinite(explicitVersion) && explicitVersion > 0 ? explicitVersion : 1;
}

function clearPendingChallengeStart(uid) {
    if (!uid) return;
    try {
        localStorage.removeItem(getPendingChallengeStartStorageKey(uid));
    } catch (error) {
        console.warn('⚠️ pending challenge start 삭제 실패:', error?.message || error);
    }
}

function readPendingRewardRedemption(uid) {
    if (!uid) return null;
    try {
        const raw = localStorage.getItem(getPendingRewardRedemptionStorageKey(uid));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
        console.warn('⚠️ pending reward redemption 읽기 실패:', error?.message || error);
        return null;
    }
}

function writePendingRewardRedemption(uid, payload) {
    if (!uid || !payload?.burnTxHash) return;
    try {
        localStorage.setItem(
            getPendingRewardRedemptionStorageKey(uid),
            JSON.stringify({
                ...payload,
                chainKey: ACTIVE_CHAIN_KEY,
                savedAt: new Date().toISOString()
            })
        );
    } catch (error) {
        console.warn('⚠️ pending reward redemption 저장 실패:', error?.message || error);
    }
}

function clearPendingRewardRedemption(uid) {
    if (!uid) return;
    try {
        localStorage.removeItem(getPendingRewardRedemptionStorageKey(uid));
    } catch (error) {
        console.warn('⚠️ pending reward redemption 삭제 실패:', error?.message || error);
    }
}

function showChallengeStartSuccessToast(data, challengeDef, duration, tier, recovered = false) {
    // 서버가 주는 인정 기준 문구는 한국어다. 다른 언어는 같은 기준을 화면 사전으로 만든다(js/challenge-claim.js 와 같다).
    const qualificationLabel = (getLocale() === 'ko' && data.qualificationLabel) || describeChallengeQualification(data.qualificationPolicy || tier);
    const recoveryPrefix = recovered || data?.recovered ? t('hbt.start.recovered') : '';
    const deferredLine = data?.deferredStart && data?.startDate
        ? t('challenge.start.deferred', { date: data.startDate })
        : '';
    const todayCreditLine = !data?.deferredStart && data.initialCompletedDays > 0
        ? t('challenge.start.todayCounted')
        : '';
    if (data.hbtStaked > 0) {
        showToast(recoveryPrefix + t('hbt.start.staked', {
            n: data.duration || duration, qualification: qualificationLabel, hbt: data.hbtStaked,
            todayCredit: todayCreditLine, deferred: deferredLine, bonus: data.bonusRateLabel || '0%',
        }));
        return;
    }
    showToast(recoveryPrefix + t('hbt.start.free', {
        n: data.duration || duration, qualification: qualificationLabel,
        todayCredit: todayCreditLine, deferred: deferredLine, days: duration, points: challengeDef.rewardPoints,
    }));
}

async function verifyPaidChallengeStartEligibility(challengeId, hbtAmount) {
    await ensureFunctions();
    if (!startChallengeFunction) {
        showToast(t('hbt.start.serverDown'));
        return false;
    }

    try {
        const result = await startChallengeFunction({
            challengeId,
            hbtAmount,
            stakeFlowVersion: 2,
            preflightOnly: true
        });
        return result.data?.eligible === true;
    } catch (error) {
        console.warn('챌린지 시작 사전 확인 실패:', error);
        const message = serverErrorText(error, '').replace(/^FirebaseError:\s*/i, '').trim();
        showToast(message || t('hbt.start.otherActive'));
        return false;
    }
}

async function refreshAssetDisplayAfterChallengeMutation(reason = 'challenge-mutation') {
    if (!window.updateAssetDisplay) return;

    try {
        await window.updateAssetDisplay(true);
    } catch (error) {
        console.warn(`[challenge] asset refresh skipped after ${reason}:`, error?.message || error);
    }

    setTimeout(() => {
        if (!auth.currentUser || !window.updateAssetDisplay) return;
        window.updateAssetDisplay(true).catch(error => {
            console.warn(`[challenge] delayed asset refresh skipped after ${reason}:`, error?.message || error);
        });
    }, 1200);
}

async function recoverPendingChallengeStartIfNeeded(currentUser, resolvedId, challengeDef, tier, hbtAmount) {
    const pending = readPendingChallengeStart(currentUser?.uid);
    if (!pending) {
        return { handled: false, success: false };
    }

    const sameChallenge = pending.challengeId === resolvedId;
    const sameTier = pending.tier === tier;
    const sameAmount = Number(pending.hbtAmount || 0) === Number(hbtAmount || 0);

    if (!sameChallenge || !sameTier || !sameAmount) {
        showToast(t('hbt.recover.blocked'));
        return { handled: true, success: false };
    }

    await ensureFunctions();
    if (!startChallengeFunction) {
        showToast(t('hbt.recover.needServer'));
        return { handled: true, success: false };
    }

    try {
        showToast(t('hbt.recover.running'));
        const result = await startChallengeFunction({
            challengeId: resolvedId,
            hbtAmount: pending.hbtAmount,
            stakeTxHash: pending.stakeTxHash,
            stakeApprovalTxHash: pending.stakeApprovalTxHash || null,
            stakeWalletAddress: pending.walletAddress || null,
            stakeFlowVersion: getPendingChallengeStakeFlowVersion(pending)
        });
        clearPendingChallengeStart(currentUser.uid);
        showChallengeStartSuccessToast(result.data, challengeDef, challengeDef.duration || 30, tier, true);
        window.applyOptimisticChallengeStart?.({
            ...result.data,
            challengeId: resolvedId,
            tier,
            hbtStaked: pending.hbtAmount
        });
        await refreshAssetDisplayAfterChallengeMutation('challenge-start-recovery');
        return { handled: true, success: true };
    } catch (error) {
        console.error('❌ pending challenge 복구 실패:', error);
        showToast(t('hbt.recover.notDone'));
        return { handled: true, success: false };
    }
}

function getChallengeQualificationPolicy(challenge = null, tier = 'mini') {
    if (challenge?.qualificationPolicy) {
        return normalizeChallengeQualificationPolicy(challenge.qualificationPolicy, tier);
    }
    if (challenge) {
        return normalizeChallengeQualificationPolicy(null, tier);
    }
    return getDefaultChallengeQualificationPolicy(tier);
}

function describeChallengeQualification(policyOrTier = 'mini') {
    return formatChallengeQualificationLabel(policyOrTier);
}

// HBT 토큰 컨트랙트 ABI (stakeForChallenge용 최소 ABI)
const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
    'function burn(uint256 amount) external'
];

const LEGACY_HBT_STAKE_ABI = [
    'function stakeForChallenge(uint256 amount) external',
    'function challengeStakes(address) view returns (uint256)'
];

const STAKING_ABI = [
    'function stakeForChallenge(uint256 amount) external',
    'function challengeStakes(address) view returns (uint256)',
    'function getStakingStats() view returns (uint256,uint256,uint256,uint256)'
];

function isConfiguredContractAddress(address) {
    return !!address && address !== '0x0000000000000000000000000000000000000000';
}

function getErc20Contract(signerOrProvider) {
    return new ethers.Contract(ACTIVE_HBT_ADDRESS, ERC20_ABI, signerOrProvider);
}

function getLegacyStakeContract(signerOrProvider) {
    return new ethers.Contract(ACTIVE_HBT_ADDRESS, LEGACY_HBT_STAKE_ABI, signerOrProvider);
}

function getStakingContract(signerOrProvider) {
    if (!isConfiguredContractAddress(ACTIVE_STAKING_ADDRESS)) return null;
    return new ethers.Contract(ACTIVE_STAKING_ADDRESS, STAKING_ABI, signerOrProvider);
}

async function canUseDedicatedStakingContract(signerOrProvider) {
    if (!isConfiguredContractAddress(ACTIVE_STAKING_ADDRESS)) return false;
    try {
        const contract = getStakingContract(signerOrProvider);
        if (!contract) return false;
        await contract.getStakingStats();
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * 사용자 지갑을 현재 활성 BSC 네트워크 프로바이더에 연결
 * @returns {ethers.Wallet} 연결된 지갑 (서명+전송 가능)
 */
async function getConnectedWallet() {
    if (externalWalletProvider) {
        await ensureInjectedNetwork(externalWalletProvider);
        externalWalletWeb3Provider = new ethers.providers.Web3Provider(externalWalletProvider, 'any');
        const signer = externalWalletWeb3Provider.getSigner();
        const address = ethers.utils.getAddress(await signer.getAddress());
        externalWalletAddress = address;
        return {
            signer,
            provider: externalWalletWeb3Provider,
            address,
            type: 'external'
        };
    }

    if (!userWallet && auth.currentUser) {
        await initializeUserWallet().catch((error) => {
            console.warn('앱 지갑 준비 실패:', error?.message || error);
            return null;
        });
    }

    if (!userWallet) return null;
    const provider = new ethers.providers.JsonRpcProvider(
        ACTIVE_BSC_NETWORK.rpcUrl,
        ACTIVE_BSC_NETWORK.chainId
    );
    const signer = userWallet.connect(provider);
    return {
        signer,
        provider,
        address: signer.address,
        type: 'internal'
    };
}

function getEffectiveWalletAddress() {
    return externalWalletAddress || userWalletAddress || null;
}

function waitForChallengeWalletRetry(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureChallengeSigningWalletReady({ context = 'challenge-start' } = {}) {
    const retryDelays = [0, 700, 1500, 3000];
    let announced = false;
    let lastError = null;

    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
        if (retryDelays[attempt] > 0) {
            await waitForChallengeWalletRetry(retryDelays[attempt]);
        }

        try {
            const connectedWallet = await getConnectedWallet();
            if (connectedWallet) return connectedWallet;

            if (!announced) {
                showToast(t('hbt.wallet.preparing'));
                announced = true;
            }

            await initializeWalletExternalFirst({ forceServer: true }).catch((error) => {
                lastError = error;
                console.warn(`[${context}] wallet state refresh failed:`, error?.message || error);
                return null;
            });
            const refreshedWallet = await getConnectedWallet();
            if (refreshedWallet) return refreshedWallet;
        } catch (error) {
            lastError = error;
            console.warn(`[${context}] wallet preparation attempt failed:`, error?.message || error);
        }
    }

    console.warn(`[${context}] signing wallet was not ready after retries:`, lastError?.message || lastError || 'unknown');
    showToast(t('hbt.wallet.loadFailed'));
    return null;
}

function updateLegacyWalletExportState(userData = {}) {
    legacyWalletEncryptedKey = userData?.encryptedKey || null;
    legacyWalletIv = userData?.walletIv || null;
    legacyWalletExportAvailable = !!(userData?.walletVersion === 2 && legacyWalletEncryptedKey && legacyWalletIv);
}

/**
 * 개인키 QR을 그린다.
 * 66자를 손으로 옮겨 적으면 한 글자만 틀려도 다른 지갑이 되고, 틀렸다는 것도
 * 가져오기를 해 봐야 안다. 카메라로 읽으면 그 단계가 없어진다.
 *
 * 화면에 떠 있는 동안만 존재해야 하므로 DOM에만 그리고 어디에도 저장하지 않는다.
 * 모달이 닫히면 resetLegacyWalletExportSession이 지운다.
 */
function renderLegacyWalletPrivateKeyQr(privateKeyHex) {
    const box = document.getElementById('legacy-wallet-qr-box');
    const holder = document.getElementById('legacy-wallet-qr');
    if (!box || !holder) return;

    holder.innerHTML = '';
    const key = String(privateKeyHex || '').trim();
    if (!key) {
        box.hidden = true;
        return;
    }

    if (typeof window.QRCode !== 'function') {
        // QR을 못 그려도 개인키 텍스트는 이미 떠 있다. 내보내기를 막지는 않는다.
        box.hidden = true;
        console.warn('QRCode 라이브러리가 없어 개인키 QR을 건너뜁니다.');
        return;
    }

    try {
        new window.QRCode(holder, {
            text: key,
            width: 180,
            height: 180,
            colorDark: '#1A1A1A',
            colorLight: '#FFFFFF',
            // 66자는 넉넉히 들어가고, M이면 화면에서 읽기 좋은 밀도가 나온다.
            correctLevel: window.QRCode.CorrectLevel.M
        });
        box.hidden = false;
    } catch (error) {
        holder.innerHTML = '';
        box.hidden = true;
        console.warn('개인키 QR 생성 실패:', error?.message || error);
    }
}

function resetLegacyWalletExportSession() {
    legacyWalletPrivateKeyCache = null;
    legacyWalletRevealed = false;
    renderLegacyWalletPrivateKeyQr('');

    const secretEl = document.getElementById('legacy-wallet-private-key');
    const revealBtn = document.getElementById('legacy-wallet-reveal-btn');
    const copyBtn = document.getElementById('legacy-wallet-copy-btn');

    if (secretEl) {
        secretEl.value = '';
        secretEl.placeholder = t('hbt.export.notShown');
    }
    if (revealBtn) {
        revealBtn.disabled = false;
        revealBtn.textContent = t('hbt.export.revealOnce');
    }
    if (copyBtn) {
        copyBtn.disabled = true;
    }
}

function syncLegacyWalletExportUi() {
    const row = document.getElementById('legacy-wallet-export-row');
    const note = document.getElementById('wallet-export-note');
    if (row) row.style.display = legacyWalletExportAvailable ? 'flex' : 'none';
    if (note) note.style.display = legacyWalletExportAvailable ? 'block' : 'none';
}

function getWalletProviderLabel(type) {
    switch (type) {
        case 'metamask':
            return 'MetaMask';
        case 'trustwallet':
            return 'Trust Wallet';
        case 'walletconnect':
            return 'WalletConnect';
        case 'internal':
            return t('hbt.wallet.appLabel');
        default:
            return t('hbt.wallet.externalLabel');
    }
}

function getInjectedProviders() {
    const providers = [];
    if (Array.isArray(window.ethereum?.providers) && window.ethereum.providers.length > 0) {
        providers.push(...window.ethereum.providers);
    } else if (window.ethereum) {
        providers.push(window.ethereum);
    }
    if (window.trustwallet && !providers.includes(window.trustwallet)) {
        providers.push(window.trustwallet);
    }
    return providers.filter(Boolean);
}

function isMetaMaskInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /MetaMaskMobile/i.test(ua) || (!!window.ethereum && !!window.ethereum.isMetaMask);
}

function isTrustWalletInAppBrowser() {
    const ua = navigator.userAgent || '';
    return /TrustWallet/i.test(ua) || (!!window.ethereum && !!(window.ethereum.isTrust || window.ethereum.isTrustWallet));
}

function isMobileWalletBrowser() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function getInjectedProviderType(provider) {
    if (!provider) return null;
    if (provider.isMetaMask) return 'metamask';
    if (provider.isTrust || provider.isTrustWallet) return 'trustwallet';
    return 'injected';
}

function findInjectedProvider(preferredType = null, options = {}) {
    const allowLooseMatch = !!options.allowLooseMatch;
    const providers = getInjectedProviders();
    if (!providers.length) return null;

    if (preferredType === 'metamask') {
        return providers.find(provider => provider.isMetaMask)
            || (allowLooseMatch && isMetaMaskInAppBrowser() ? providers[0] : null);
    }
    if (preferredType === 'trustwallet') {
        return providers.find(provider => provider.isTrust || provider.isTrustWallet)
            || (allowLooseMatch && isTrustWalletInAppBrowser() ? providers[0] : null);
    }
    return providers[0] || null;
}

async function waitForInjectedProvider(preferredType = null, timeoutMs = 2200) {
    const immediateProvider = findInjectedProvider(preferredType, { allowLooseMatch: true });
    if (immediateProvider?.request) return immediateProvider;

    return new Promise(resolve => {
        let settled = false;
        let intervalId = null;
        let timeoutId = null;

        const cleanup = () => {
            if (intervalId) clearInterval(intervalId);
            if (timeoutId) clearTimeout(timeoutId);
            window.removeEventListener('ethereum#initialized', attemptResolve);
        };

        const finish = provider => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(provider || null);
        };

        const attemptResolve = () => {
            const provider = findInjectedProvider(preferredType, { allowLooseMatch: true });
            if (provider?.request) {
                finish(provider);
            }
        };

        intervalId = setInterval(attemptResolve, 120);
        timeoutId = setTimeout(() => finish(null), timeoutMs);
        window.addEventListener('ethereum#initialized', attemptResolve);
        setTimeout(attemptResolve, 60);
    });
}

async function waitForPreferredWalletProvider(preferredType = null, timeoutMs = 2200) {
    return waitForInjectedProvider(preferredType, timeoutMs);
}

async function ensureInjectedNetwork(provider) {
    if (!provider?.request) return null;
    try {
        const chainHex = await provider.request({ method: 'eth_chainId' });
        if (parseInt(chainHex, 16) === ACTIVE_CHAIN_ID) {
            return ACTIVE_CHAIN_ID;
        }
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: ACTIVE_CHAIN_HEX }]
        });
        return ACTIVE_CHAIN_ID;
    } catch (error) {
        if (error?.code === 4902) {
            await provider.request({
                method: 'wallet_addEthereumChain',
                params: [ACTIVE_CHAIN_PARAMS]
            });
            return ACTIVE_CHAIN_ID;
        }
        throw error;
    }
}

async function ensureUserReferralCode(userRef, userData) {
    const existingCode = String(userData?.referralCode || '').trim().toUpperCase();
    if (/^[A-Z0-9]{6}$/.test(existingCode)) return existingCode;
    await ensureFunctions();
    if (!ensureReferralCodeFunction) {
        throw new Error('ensureReferralCode callable is unavailable');
    }
    const result = await ensureReferralCodeFunction({});
    const referralCode = String(result?.data?.referralCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(referralCode)) {
        throw new Error('ensureReferralCode returned an invalid referral code');
    }
    return referralCode;
}

function setExternalWalletRuntimeState({ provider, address, providerType, chainId }) {
    externalWalletProvider = provider || null;
    externalWalletWeb3Provider = provider?.request
        ? new ethers.providers.Web3Provider(provider, 'any')
        : null;
    externalWalletAddress = address ? ethers.utils.getAddress(address) : null;
    externalWalletProviderType = providerType || getInjectedProviderType(provider) || null;
    externalWalletChainId = Number(chainId) || null;
}

function normalizeWalletChainId(chainId, fallback = ACTIVE_CHAIN_ID) {
    if (typeof chainId === 'number' && Number.isFinite(chainId)) {
        return chainId;
    }
    if (typeof chainId === 'string' && chainId.trim()) {
        const trimmed = chainId.trim();
        const parsed = trimmed.startsWith('0x')
            ? parseInt(trimmed, 16)
            : Number(trimmed);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return fallback;
}

async function persistExternalWalletConnection(address, providerType, chainId = ACTIVE_CHAIN_ID) {
    const currentUser = auth.currentUser;
    if (!currentUser || !address) return;

    const normalizedAddress = ethers.utils.getAddress(address);
    const normalizedChainId = normalizeWalletChainId(chainId, ACTIVE_CHAIN_ID);
    const userRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userRef).catch(() => null);
    const userData = userSnap?.data?.() || {};

    await ensureUserReferralCode(userRef, userData).catch(() => {});

    if (
        userData.externalWalletAddress === normalizedAddress
        && userData.walletConnectionMode === 'external'
        && userData.walletProviderType === providerType
        && normalizeWalletChainId(userData.walletChainId, ACTIVE_CHAIN_ID) === normalizedChainId
    ) {
        return;
    }

    await setDoc(userRef, {
        externalWalletAddress: normalizedAddress,
        walletConnectionMode: 'external',
        walletProviderType: providerType,
        walletChainId: normalizedChainId,
        walletConnectedAt: serverTimestamp()
    }, { merge: true });
}

async function applyExternalWalletConnectionState({
    provider,
    address,
    providerType,
    chainId,
    persist = false,
    refreshAssets = true
} = {}) {
    if (!provider?.request || !address) return null;

    const normalizedAddress = ethers.utils.getAddress(address);
    const normalizedChainId = normalizeWalletChainId(chainId, ACTIVE_CHAIN_ID);

    setExternalWalletRuntimeState({
        provider,
        address: normalizedAddress,
        providerType,
        chainId: normalizedChainId
    });

    if (persist) {
        await persistExternalWalletConnection(normalizedAddress, providerType, normalizedChainId).catch((error) => {
            console.warn(`${getWalletProviderLabelSafe(providerType)} connection sync failed:`, error?.message || error);
        });
    }

    refreshWalletUi(normalizedAddress);
    if (refreshAssets && window.updateAssetDisplay) {
        await window.updateAssetDisplay(true);
    }

    return normalizedAddress;
}

async function waitForPermittedWalletAccount(provider, expectedAddress = null, timeoutMs = 4200) {
    if (!provider?.request) return null;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const accounts = await provider.request({ method: 'eth_accounts' });
            if (Array.isArray(accounts) && accounts.length > 0) {
                const matchedAddress = expectedAddress
                    ? accounts.find((account) => account?.toLowerCase() === expectedAddress.toLowerCase())
                    : accounts[0];
                if (matchedAddress) {
                    return ethers.utils.getAddress(matchedAddress);
                }
            }
        } catch (error) {
            console.warn('Wallet account polling failed:', error?.message || error);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
    }

    return null;
}

async function reconnectStoredExternalWallet({ preferredType = null, expectedAddress = null } = {}) {
    const provider = await waitForPreferredWalletProvider(preferredType, 1600);
    if (!provider?.request) return null;
    try {
        const matchedAddress = await waitForPermittedWalletAccount(provider, expectedAddress, 4200);
        if (!matchedAddress) return null;

        const chainHex = await provider.request({ method: 'eth_chainId' }).catch(() => null);
        await applyExternalWalletConnectionState({
            provider,
            address: matchedAddress,
            providerType: preferredType || getInjectedProviderType(provider),
            chainId: normalizeWalletChainId(chainHex, ACTIVE_CHAIN_ID),
            persist: true
        });
        return externalWalletAddress;
    } catch (error) {
        console.warn('외부 지갑 재연결 실패:', error.message);
        return null;
    }
}

// ========== 보안 지갑 관리 (v2) ==========
// 개선 사항:
// - 랜덤 지갑 생성 (UID 파생 X → 탈취 불가)
// - AES-GCM으로 개인키 암호화 후 Firestore 저장
// - PBKDF2 키 파생 (100,000 iterations)

/**
 * 사용자 인증 정보로부터 암호화 키 파생 (PBKDF2)
 * UID만으로는 키를 알 수 없음 (email 필요)
 */
async function deriveEncryptionKey(uid, email) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(uid),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    // 이메일을 salt로 사용 (사용자별 고유)
    const salt = encoder.encode(email + '_hbt_wallet_v2');
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * 개인키 암호화 (AES-GCM)
 */
async function encryptPrivateKey(privateKeyHex, uid, email) {
    const key = await deriveEncryptionKey(uid, email);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(privateKeyHex)
    );
    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * 개인키 복호화 (AES-GCM)
 */
async function decryptPrivateKey(encryptedData, iv, uid, email) {
    const key = await deriveEncryptionKey(uid, email);
    const ivArray = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const encryptedArray = new Uint8Array(atob(encryptedData).split('').map(c => c.charCodeAt(0)));
    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivArray },
        key,
        encryptedArray
    );
    return new TextDecoder().decode(decrypted);
}

function resolveWalletPersistenceDecision(userData = {}) {
    const externalAddress = String(userData?.externalWalletAddress || '').trim();
    const appAddress = String(userData?.walletAddress || '').trim();
    const hasEncryptedAppWallet = userData?.walletVersion === 2
        && !!userData?.encryptedKey
        && !!userData?.walletIv;

    if (externalAddress) {
        return { action: 'restore', source: 'external' };
    }
    if (appAddress || hasEncryptedAppWallet) {
        return { action: 'restore', source: 'app' };
    }
    return { action: 'create', source: 'none' };
}

/**
 * 사용자 지갑 초기화 (로그인 시 자동 호출)
 * v2: 랜덤 지갑 + 암호화 저장
 * @returns {string} 지갑 주소
 */
export async function initializeUserWallet(options = {}) {
    try {
        const {
            forceServer = false,
            requireFreshSnapshotForCreate = false
        } = options || {};
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 생성 불가.');
            return null;
        }

        const userRef = doc(db, "users", currentUser.uid);
        let userSnap;
        if (forceServer) {
            try {
                userSnap = await getDocFromServer(userRef);
            } catch (error) {
                if (requireFreshSnapshotForCreate) throw error;
                userSnap = await getDoc(userRef);
            }
        } else {
            userSnap = await getDoc(userRef);
        }
        const userData = userSnap.data();

        // Case 1: v2 암호화 지갑이 있는 경우 → 복호화하여 복원
        if (userData?.walletVersion === 2 && userData?.encryptedKey && userData?.walletIv) {
            try {
                const privateKeyHex = await decryptPrivateKey(
                    userData.encryptedKey,
                    userData.walletIv,
                    currentUser.uid,
                    currentUser.email
                );
                const wallet = new ethers.Wallet(privateKeyHex);
                userWallet = wallet;
                userWalletAddress = wallet.address;
                console.log('✅ v2 지갑 복원:', userWalletAddress.substring(0, 10) + '...');
                updateWalletUI(userWalletAddress);
            } catch (e) {
                console.error('⚠️ v2 지갑 복호화 실패:', e);
                // 주소만이라도 표시
                userWalletAddress = userData.walletAddress;
                updateWalletUI(userWalletAddress);
                return userWalletAddress;
            }
            // 기존 사용자에게 초대 코드가 없으면 생성 (복호화 try/catch 밖에서 처리)
            if (!userData.referralCode) {
                try {
                    const referralCode = await ensureUserReferralCode(userRef, userData);
                    await Promise.resolve();
                    console.log('✅ 초대 코드 생성 (Case 1):', referralCode);
                } catch (e) {
                    console.warn('⚠️ 초대 코드 저장 실패 (권한 미배포):', e.message);
                }
            }
            return userWalletAddress;
        }

        // Case 2: v1 구형 지갑이 있는 경우 → v2로 마이그레이션
        if (userData?.walletAddress && !userData?.walletVersion) {
            console.log('🔄 v1 → v2 지갑 마이그레이션 중...');
            // 새 랜덤 지갑 생성 (v1 주소는 보안 결함으로 폐기)
            const newWallet = ethers.Wallet.createRandom();
            const { encrypted, iv } = await encryptPrivateKey(
                newWallet.privateKey, currentUser.uid, currentUser.email
            );
            
            userWallet = newWallet;
            userWalletAddress = newWallet.address;

            const migrateData = {
                walletAddress: userWalletAddress,
                walletCreatedAt: serverTimestamp(),
                encryptedKey: encrypted,
                walletIv: iv,
                walletVersion: 2,
                oldWalletAddress: userData.walletAddress // 기존 주소 백업
            };
            if (!userData.referralCode) {
                console.log('✅ 초대 코드 보장 요청 (Case 2)');
            }
            await updateDoc(userRef, migrateData);
            await ensureUserReferralCode(userRef, userData).catch((e) => {
                console.warn('⚠️ 초대 코드 보장 실패 (Case 2):', e?.message || e);
            });

            console.log('✅ v2 지갑 마이그레이션 완료:', userWalletAddress.substring(0, 10) + '...');
            updateWalletUI(userWalletAddress);
            showToast(t('hbt.wallet.upgraded'));
            return userWalletAddress;
        }

        // Case 3: 지갑 없음 → 새 v2 지갑 생성
        if (requireFreshSnapshotForCreate && userSnap.metadata?.fromCache) {
            console.info('[wallet] creation deferred until a fresh server snapshot is available');
            return null;
        }
        console.log('🆕 새 보안 지갑 생성 중...');
        const candidateWallet = ethers.Wallet.createRandom();
        const { encrypted, iv } = await encryptPrivateKey(
            candidateWallet.privateKey, currentUser.uid, currentUser.email
        );

        const candidateWalletData = {
            walletAddress: candidateWallet.address,
            walletCreatedAt: serverTimestamp(),
            encryptedKey: encrypted,
            walletIv: iv,
            walletVersion: 2
        };
        const persistenceResult = await runTransaction(db, async (transaction) => {
            const latestSnap = await transaction.get(userRef);
            const latestUserData = latestSnap.data() || {};
            const decision = resolveWalletPersistenceDecision(latestUserData);

            if (decision.action === 'restore') {
                return {
                    created: false,
                    source: decision.source,
                    userData: latestUserData
                };
            }

            transaction.set(userRef, candidateWalletData, { merge: true });
            return {
                created: true,
                source: 'candidate',
                userData: {
                    ...latestUserData,
                    ...candidateWalletData
                }
            };
        });

        if (!persistenceResult.created) {
            console.info(`[wallet] concurrent initialization kept the existing ${persistenceResult.source} wallet`);
            resetExternalFirstWalletRuntimeState();
            const winnerAddress = await restoreExternalFirstWalletState(
                currentUser,
                persistenceResult.userData
            );
            refreshWalletUi(winnerAddress);
            return winnerAddress;
        }

        resetExternalFirstWalletRuntimeState();
        userWallet = candidateWallet;
        userWalletAddress = candidateWallet.address;

        // 6자리 초대 코드 생성 (영숫자 대문자), users/{uid}.referralCode에 저장
        // processReferralSignup Cloud Function에서 users 컬렉션 쿼리로 역방향 조회
        let referralCode = '';

        referralCode = await ensureUserReferralCode(userRef, userData).catch((e) => {
            console.warn('⚠️ 초대 코드 보장 실패 (Case 3):', e?.message || e);
            return '';
        });

        console.log('✅ v2 지갑 생성 완료:', userWalletAddress.substring(0, 10) + '...', '초대코드:', referralCode);
        updateWalletUI(userWalletAddress);
        showToast(t('hbt.wallet.created'));
        return userWalletAddress;

    } catch (error) {
        console.error('❌ 지갑 초기화 오류:', error);
        return null;
    }
}

/**
 * 6자리 영숫자 대문자 초대 코드 생성
 */
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 혼동 문자(0,O,1,I) 제외
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/**
 * 지갑 UI 업데이트
 */
function updateWalletUI(address) {
    const walletDisplay = document.getElementById('wallet-address-display');
    if (walletDisplay && address) {
        walletDisplay.textContent = address.substring(0, 8) + '...' + address.substring(address.length - 6);
        walletDisplay.style.color = '#333';
    }
}

// ========== Phase 기반 반감기 계산 (v2) ==========

/**
 * 누적 채굴량 기반 현재 전환 비율 계산 (v2 Phase 구조)
 * Phase 1 (A): totalMinted < 35M → 기본 비율 (주간 난이도 조절)
 * Phase 2 (B): totalMinted < 52.5M → 주간 목표 ÷2
 * Phase 3 (C): totalMinted < 61.25M → 주간 목표 ÷4
 * Phase 4+ (D~): 이후 무한 반감
 * 
 * ⚠️ v2에서 실제 비율은 온체인 currentRate로 결정됩니다.
 *    이 함수는 온체인 조회 실패 시 fallback 용도입니다.
 * @param {number} totalMinted - 전체 누적 채굴 발행량
 * @returns {number} 현재 전환 비율 (1P당 HBT, 근사값)
 */
export function getConversionRate(totalMinted = 0) {
    const { phase1End, phase2End, phase3End, initialRate } = CONVERSION_RULES.halving;
    
    if (totalMinted < phase1End) return initialRate;       // Phase 1: 1P = 1 HBT
    if (totalMinted < phase2End) return initialRate / 2;   // Phase 2: 1P = 0.5 HBT
    if (totalMinted < phase3End) return initialRate / 4;   // Phase 3: 1P = 0.25 HBT
    
    // Phase 4+: 계속 반감
    let rate = initialRate / 8;
    let remaining = CONVERSION_RULES.halving.miningPool - phase3End;
    let extraMinted = totalMinted - phase3End;
    let threshold = Math.floor(remaining / 2);

    while (extraMinted >= threshold && threshold > 0) {
        extraMinted -= threshold;
        threshold = Math.floor(threshold / 2);
        rate /= 2;
    }
    return Math.max(rate, 0.01);
}

/**
 * 반감기를 적용한 HBT 변환량 계산
 * @param {number} pointAmount - 변환할 포인트
 * @param {number} totalMinted - 현재까지 전체 채굴된 HBT (글로벌)
 * @returns {number} 받을 HBT 수량
 */
function calculateHbtWithHalving(pointAmount, totalMinted = 0) {
    const rate = getConversionRate(totalMinted);
    const hbtAmount = pointAmount * rate;
    return Math.min(hbtAmount, CONVERSION_RULES.maxConversionPerDay);
}

/**
 * 현재 Phase 번호 반환 (1→A, 2→B, 3→C, 4→D ...)
 * @param {number} totalMinted
 * @returns {number} Phase 번호 (1부터)
 */
export function getCurrentEra(totalMinted = 0) {
    const { phase1End, phase2End, phase3End, miningPool } = CONVERSION_RULES.halving;

    if (totalMinted < phase1End) return 1;
    if (totalMinted < phase2End) return 2;
    if (totalMinted < phase3End) return 3;

    // Phase 4+
    let remaining = miningPool - phase3End;
    let extraMinted = totalMinted - phase3End;
    let threshold = Math.floor(remaining / 2);
    let phase = 4;

    while (extraMinted >= threshold && threshold > 0) {
        extraMinted -= threshold;
        threshold = Math.floor(threshold / 2);
        phase++;
    }
    return phase;
}

function buildMintAttemptId(uid = '') {
    const normalizedUid = String(uid || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'guest';
    const timePart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 8);
    return `mint_${normalizedUid}_${timePart}_${randomPart}`;
}

function normalizeCallableErrorCode(code) {
    return String(code || '').replace(/^functions\//, '').trim().toLowerCase();
}

function isRecoverableMintCallableError(error) {
    const code = normalizeCallableErrorCode(error?.code);
    return ['internal', 'unknown', 'unavailable', 'deadline-exceeded', 'cancelled'].includes(code);
}

async function confirmRecentConversionAttempt(uid, {
    attemptId = '',
    txHash = '',
    pointAmount = 0,
    maxAttempts = 4,
    delayMs = 1200
} = {}) {
    if (!uid || !attemptId) return null;

    const normalizedTxHash = String(txHash || '').trim().toLowerCase();
    const expectedPoints = Number(pointAmount || 0);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        try {
            const snapshot = await getDocsFromServer(query(
                collection(db, 'blockchain_transactions'),
                where('userId', '==', uid),
                orderBy('timestamp', 'desc'),
                limit(10)
            ));
            const match = snapshot.docs
                .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
                .find((record) => {
                    if (record.type !== 'conversion' || record.status !== 'success') return false;
                    const attemptMatches = record.attemptId === attemptId;
                    const txMatches = normalizedTxHash && String(record.txHash || '').trim().toLowerCase() === normalizedTxHash;
                    const pointsMatch = expectedPoints > 0 ? Number(record.pointsUsed || 0) === expectedPoints : true;
                    return pointsMatch && (attemptMatches || txMatches);
                });
            if (match) return match;
        } catch (error) {
            console.warn('[mintHBT] recent conversion confirmation query failed:', error?.message || error);
        }

        if (attempt < maxAttempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    return null;
}

/**
 * 포인트를 HBT 토큰으로 변환 (Cloud Function 경유 온체인 민팅)
 * A구간 기준: 100P → 100 HBT (주간 난이도 조절에 따라 변동)
 * @param {number} [pointAmount] - 변환할 포인트 (미입력 시 기존 input에서 읽음)
 */
export async function convertPointsToHBT(pointAmount) {
    if (!checkRateLimit('convertPointsToHBT', 5000)) {
        showToast(t('hbt.convert.busy'));
        return false;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast(t('hbt.loginRequired'));
        return false;
    }

    // 인자로 받은 값 우선, 없으면 input에서 읽기
    if (typeof pointAmount !== 'number' || isNaN(pointAmount)) {
        const pointInput = document.getElementById('conversion-points');
        pointAmount = parseInt(pointInput?.value || 0);
    }

    if (pointAmount < CONVERSION_RULES.minConversion) {
        showToast(t('hbt.convert.min', { n: CONVERSION_RULES.minConversion }));
        return false;
    }

    if (pointAmount % 100 !== 0) {
        showToast(t('hbt.convert.step'));
        return false;
    }

    const walletAddress = await initializeWalletExternalFirst();
    if (!walletAddress) {
        showToast(t('hbt.convert.noWallet'));
        return false;
    }

    // Cloud Function 경유 온체인 민팅
    const attemptId = buildMintAttemptId(currentUser.uid);
    const scheduleAssetRefresh = () => {
        if (!window.updateAssetDisplay) return;
        setTimeout(() => {
            window.updateAssetDisplay?.(true).catch(() => { });
        }, 1500);
        setTimeout(() => {
            window.updateAssetDisplay?.(true).catch(() => { });
        }, 5000);
    };
    const applyConfirmedConversion = async (record, source = 'callable') => {
        const pointsUsed = Number(record?.pointsUsed || pointAmount || 0);
        const hbtReceived = Number(record?.hbtReceived || 0);

        if (window.applyOptimisticConversionResult) {
            window.applyOptimisticConversionResult({
                pointsUsed,
                hbtReceived
            });
        }

        showToast(t('hbt.convert.done', { points: pointsUsed, hbt: hbtReceived }));

        const explorerUrl = record?.explorerUrl
            || (record?.txHash ? `${ACTIVE_BSC_NETWORK.explorer}/tx/${record.txHash}` : '');
        if (explorerUrl) {
            console.log(`🔍 TX (${source}): ${explorerUrl}`);
        }

        if (window.updateAssetDisplay) {
            await window.updateAssetDisplay(true);
            scheduleAssetRefresh();
        }
    };

    try {
        await ensureFunctions();
        if (!mintHBTFunction) {
            console.error('❌ mintHBT Cloud Function 초기화 실패');
            showToast(t('hbt.moduleLoadFailed'));
            return false;
        }

        showToast(t('hbt.convert.running'));

        const result = await mintHBTFunction({ pointAmount, attemptId });
        const data = result.data;
        if (data?.success) {
            await applyConfirmedConversion(data, 'callable');
            return true;
        }

        const confirmedRecord = await confirmRecentConversionAttempt(currentUser.uid, {
            attemptId: data?.attemptId || attemptId,
            txHash: data?.txHash || '',
            pointAmount
        });
        if (confirmedRecord) {
            console.warn('[mintHBT] callable response was incomplete, but Firestore confirmed success:', {
                attemptId: confirmedRecord.attemptId || attemptId,
                txHash: confirmedRecord.txHash || '',
                pointAmount
            });
            await applyConfirmedConversion(confirmedRecord, 'server-confirmed');
            return true;
        }

        showToast(t('hbt.convert.unconfirmed'));
        return false;
    } catch (onchainError) {
        const confirmedRecord = isRecoverableMintCallableError(onchainError)
            ? await confirmRecentConversionAttempt(currentUser.uid, {
                attemptId: onchainError?.details?.attemptId || attemptId,
                pointAmount
            })
            : null;

        if (confirmedRecord) {
            console.warn('[mintHBT] recovered success after callable error', {
                attemptId: confirmedRecord.attemptId || attemptId,
                txHash: confirmedRecord.txHash || '',
                callableCode: onchainError?.code || null,
                callableDetails: onchainError?.details || null
            });
            await applyConfirmedConversion(confirmedRecord, 'server-confirmed');
            return true;
        }

        console.error('❌ 온체인 민팅 실패:', onchainError.code, onchainError.message, onchainError?.details || null);
        const msg = onchainError.message || '';
        const code = normalizeCallableErrorCode(onchainError?.code);
        if (code === 'already-exists' || msg.includes('이전 변환이 처리 중')) {
            showToast(t('hbt.convert.previousPending'));
        } else if (msg.includes('포인트가 부족')) {
            showToast(t('hbt.convert.notEnough'));
        } else if (msg.includes('일일 변환 한도')) {
            showToast(t('hbt.convert.dailyLimit'));
        } else if (msg.includes('지갑이 생성되지')) {
            showToast(t('hbt.convert.walletMissing'));
        } else {
            showToast(t('hbt.convert.failed'));
        }
        return false;
    }
}

// 구간 번호 → 알파벳 라벨
function eraLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26));
}

/**
 * 범용 챌린지 시작 (3일 / 7일 / 30일)
 * 동시 진행 지원: mini/weekly/master 티어별 1개
 * - 3일: HBT 예치 없음, 포인트만 보상
 * - 7일/30일: 온체인 stakeForChallenge → CF로 Firestore 기록
 */
export async function startChallenge30D(challengeId) {
    let startLockKey = null;
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast(t('hbt.loginRequired'));
            return false;
        }

        // 하위 호환: 기존 ID를 새 ID로 매핑
        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const challengeDef = CHALLENGES[resolvedId];
        if (!challengeDef) {
            showToast(t('challenge.start.unknown'));
            return false;
        }
        const duration = challengeDef.duration || 30;
        const minStake = challengeDef.hbtStake || 0;
        const maxStake = challengeDef.maxStake || 10000;
        const tier = challengeDef.tier || 'master';

        startLockKey = getChallengeStartLockKey(tier, resolvedId);
        if (challengeStartInFlight.has(startLockKey)) {
            showToast(t('challenge.start.preparing'));
            return false;
        }
        challengeStartInFlight.add(startLockKey);

        // 티어별 인라인 입력에서 예치량 읽기
        let hbtAmount = 0;
        if (minStake > 0) {
            const stakeInput = document.getElementById('stake-' + tier);
            hbtAmount = parseFloat(stakeInput?.value || 0);
            if (!Number.isFinite(hbtAmount) || hbtAmount < minStake) {
                showToast(t('hbt.stake.min', { n: minStake }));
                return false;
            }
            if (Math.round(hbtAmount * 100) !== hbtAmount * 100) {
                showToast(t('hbt.stake.decimals'));
                return false;
            }
            if (hbtAmount > maxStake) {
                showToast(t('hbt.stake.max', { n: maxStake }));
                return false;
            }
        }

        showToast(t('challenge.start.starting', { n: duration }));

        // 사용자는 예치 권한만 승인하고, 서버가 티어별 온체인 슬롯에 예치한다.
        let stakeApprovalTxHash = null;
        let stakeWalletAddress = null;
        if (hbtAmount > 0) {
            const pendingRecovery = await recoverPendingChallengeStartIfNeeded(currentUser, resolvedId, challengeDef, tier, hbtAmount);
            if (pendingRecovery.handled) {
                return pendingRecovery.success;
            }
            if (!await verifyPaidChallengeStartEligibility(resolvedId, hbtAmount)) {
                return false;
            }

            const connectedWallet = await ensureChallengeSigningWalletReady({ context: 'challenge-start-legacy' });
            if (!connectedWallet) return false;

            const erc20Contract = getErc20Contract(connectedWallet.signer);

            // raw amount: HBT * 10^decimals
            const rawAmount = ethers.utils.parseUnits(String(hbtAmount), HBT_TOKEN.decimals);

            // 온체인 잔액 확인
            const onchainBalance = await erc20Contract.balanceOf(connectedWallet.address);
            if (onchainBalance.lt(rawAmount)) {
                const displayBalance = parseFloat(ethers.utils.formatUnits(onchainBalance, HBT_TOKEN.decimals));
                showToast(t('hbt.stake.lowBalance', { have: displayBalance, need: hbtAmount }));
                return false;
            }

            const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
            const MIN_GAS = ethers.utils.parseEther("0.001");
            if (ethBalance.lt(MIN_GAS)) {
                showToast(t('hbt.gas.refilling', { token: ACTIVE_GAS_TOKEN }));
                try {
                    await ensureFunctions();
                    await prefundWalletFunction();
                    await new Promise(r => setTimeout(r, 4000));
                } catch (fundErr) {
                    console.warn('가스 충전 실패:', fundErr.message);
                    showToast(t('hbt.gas.refillFailed', { token: ACTIVE_GAS_TOKEN }));
                    return false;
                }
            }

            showToast(t('hbt.stake.checkingApproval'));
            try {
                const allowance = await erc20Contract.allowance(connectedWallet.address, ACTIVE_STAKING_ADDRESS);
                if (allowance.lt(rawAmount)) {
                    showToast(t('hbt.stake.approving'));
                    const approveTx = await erc20Contract.approve(ACTIVE_STAKING_ADDRESS, rawAmount);
                    const approvalReceipt = await approveTx.wait();
                    stakeApprovalTxHash = approvalReceipt.transactionHash;
                }
                stakeWalletAddress = connectedWallet.address;
                writePendingChallengeStart(currentUser.uid, {
                    challengeId: resolvedId,
                    tier,
                    hbtAmount,
                    stakeApprovalTxHash,
                    walletAddress: stakeWalletAddress,
                    stakeFlowVersion: 2
                });
                console.log('✅ HBT 예치 권한 확인 완료:', stakeApprovalTxHash || 'existing allowance');
            } catch (txError) {
                console.error('❌ HBT 예치 승인 실패:', txError);
                showToast(t('hbt.stake.approveFailed', { token: ACTIVE_GAS_TOKEN }));
                return false;
            }
        }

        // Cloud Function 호출 (서버에서 Firestore 챌린지 기록)
        await ensureFunctions();
        if (!startChallengeFunction && hbtAmount > 0) {
            showToast(t('hbt.stake.approvedNoServer'));
            return false;
        }
        if (!startChallengeFunction) {
            showToast(t('hbt.serverFailed'));
            return false;
        }

        const result = await startChallengeFunction({
            challengeId: resolvedId,
            hbtAmount,
            stakeApprovalTxHash,
            stakeWalletAddress,
            stakeFlowVersion: 2
        });
        const data = result.data;
        clearPendingChallengeStart(currentUser.uid);

        showChallengeStartSuccessToast(data, challengeDef, duration, tier);
        window.applyOptimisticChallengeStart?.({
            ...data,
            challengeId: resolvedId,
            tier,
            hbtStaked: hbtAmount
        });

        await refreshAssetDisplayAfterChallengeMutation('challenge-start');
        return true;

    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        const msg = serverErrorText(error, t('hbt.unknownError'));
        showToast(t('hbt.error', { msg }));
        return false;
    } finally {
        if (startLockKey) challengeStartInFlight.delete(startLockKey);
    }
}

/**
 * 일일 인증 시 챌린지 진행도 업데이트
 * 모든 활성 챌린지(티어별)를 동시에 업데이트
 * 챌린지 종료 시 보상 규칙:
 * - 3일 챌린지: 100% 달성 → 포인트 보상
 * - 7일 챌린지: 80%+ → 원금 환급 + 포인트, 100% → +보너스
 * - 30일 챌린지: 80%+ → 원금 환급, 100% → +20% HBT 보너스
 */
export async function updateChallengeProgress(options = {}) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // 챌린지 진행 상태는 서버가 daily_logs를 다시 읽어 계산한다. 클라이언트가
        // activeChallenges를 직접 쓰는 구 경로는 보안 규칙에서 차단된다.
        await ensureFunctions();
        const refreshProgressFn = httpsCallable(functions, 'refreshChallengeProgress');
        const result = await refreshProgressFn({});
        await refreshAssetDisplayAfterChallengeMutation('challenge-progress');
        return result.data || null;
    } catch (error) {
        console.error('⚠️ 챌린지 진행도 업데이트 오류:', error);
    }
}

// 만료 정산은 Cloud Function 을 부르는 것뿐이라 challenge-claim.js 에 있다 — 블록체인
// 모듈을 안 싣는 플레이 앱도 같은 동작을 써야 한다(2026-10-30). 여기서는 이름만 이어 준다.
export { settleExpiredChallenges, forfeitChallenge } from './challenge-claim.js?v=565';

/**
 * 챌린지 보상 수령 (Cloud Function 경유)
 * @param {string} tier - 'mini' | 'weekly' | 'master'
 */
const _challengeClaimInFlight = new Set();

// 보상 수령은 Cloud Function 하나를 부르는 게 전부라 온체인 코드가 필요 없다.
// 구현은 challenge-claim.js 에 있다 — 그래야 블록체인 모듈을 안 싣는 라이트 모드에서도
// 같은 동작을 쓸 수 있다. 여기서는 이름만 이어 준다.
export { claimChallengeReward } from './challenge-claim.js?v=565';

/**
 * 현재 지갑 주소 반환
 */
export function getWalletAddress() {
    return userWalletAddress;
}

/**
 * 온체인 HBT 잔액 조회 (Cloud Function 경유)
 * @returns {object} { balance, balanceFormatted, walletAddress }
 */
export async function redeemRewardCouponOnchain({
    sku = '',
    hbtCost = 0,
    recipientPhone = '',
    quoteVersion = '',
    quoteSource = '',
    quotedHbtCost = 0,
    deliveryMode = 'app_vault',
    fallbackPolicy = 'manual_resend'
} = {}) {
    if (!checkRateLimit('redeemRewardCouponOnchain', 5000)) {
        showToast(t('hbt.redeem.busy'));
        return { success: false };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast(t('hbt.loginRequired'));
        return { success: false };
    }

    const normalizedSku = String(sku || '').trim();
    const rewardCost = Number(hbtCost || 0);
    const quotedCost = Number(quotedHbtCost || rewardCost || 0);
    if (!normalizedSku) {
        showToast(t('hbt.redeem.noItem'));
        return { success: false };
    }
    if (!(rewardCost >= 2000)) {
        showToast(t('hbt.redeem.min'));
        return { success: false };
    }

    await ensureFunctions();
    if (!redeemRewardCouponFunction) {
        showToast(t('hbt.redeem.moduleFailed'));
        return { success: false };
    }

    const retryPendingRedemption = async (pending) => {
        if (!pending?.burnTxHash || pending.sku !== normalizedSku || Number(pending.hbtCost || 0) !== rewardCost) {
            return null;
        }
        showToast(t('hbt.redeem.recheck'));
        const result = await redeemRewardCouponFunction({
            sku: normalizedSku,
            recipientPhone,
            burnTxHash: pending.burnTxHash,
            quoteVersion: pending.quoteVersion || quoteVersion,
            quoteSource: pending.quoteSource || quoteSource,
            quotedHbtCost: Number(pending.quotedHbtCost || quotedCost || rewardCost)
        });
        const data = result?.data || {};
        if (data?.success !== false) {
            clearPendingRewardRedemption(currentUser.uid);
            await Promise.allSettled([
                window.updateAssetDisplay?.(true),
                window.loadRewardMarketSnapshot?.(true)
            ]);
        }
        return data;
    };

    const pendingRedemption = readPendingRewardRedemption(currentUser.uid);
    if (pendingRedemption) {
        try {
            const retryResult = await retryPendingRedemption(pendingRedemption);
            if (retryResult) return retryResult;
        } catch (retryError) {
            console.warn('pending reward redemption retry failed:', retryError?.message || retryError);
        }
    }

    const connectedWallet = await getConnectedWallet();
    if (!connectedWallet) {
        showToast(t('hbt.redeem.walletNotReady'));
        return { success: false };
    }

    const erc20Contract = getErc20Contract(connectedWallet.signer);
    const rawAmount = ethers.utils.parseUnits(String(rewardCost), HBT_TOKEN.decimals);
    const onchainBalance = await erc20Contract.balanceOf(connectedWallet.address);
    if (onchainBalance.lt(rawAmount)) {
        const displayBalance = parseFloat(ethers.utils.formatUnits(onchainBalance, HBT_TOKEN.decimals));
        showToast(t('hbt.redeem.lowBalance', { have: displayBalance, need: rewardCost }));
        return { success: false };
    }

    const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
    const minGas = ethers.utils.parseEther('0.001');
    if (ethBalance.lt(minGas) && prefundWalletFunction) {
        showToast(t('hbt.redeem.gasRefill', { token: ACTIVE_GAS_TOKEN }));
        try {
            await prefundWalletFunction();
            await new Promise((resolve) => setTimeout(resolve, 4000));
        } catch (error) {
            console.warn('reward redemption prefund failed:', error?.message || error);
        }
    }

    try {
        showToast(t('hbt.redeem.burning', { n: rewardCost }));
        const burnTx = await erc20Contract.burn(rawAmount);
        const burnReceipt = await burnTx.wait();
        const burnTxHash = burnReceipt?.transactionHash || burnReceipt?.hash || '';

        writePendingRewardRedemption(currentUser.uid, {
            sku: normalizedSku,
            hbtCost: rewardCost,
            burnTxHash,
            quoteVersion,
            quoteSource,
            quotedHbtCost: quotedCost,
            deliveryMode,
            fallbackPolicy
        });

        showToast(t('hbt.redeem.requesting'));
        const result = await redeemRewardCouponFunction({
            sku: normalizedSku,
            recipientPhone,
            burnTxHash,
            quoteVersion,
            quoteSource,
            quotedHbtCost: quotedCost
        });
        const data = result?.data || {};

        clearPendingRewardRedemption(currentUser.uid);
        await Promise.allSettled([
            window.updateAssetDisplay?.(true),
            window.loadRewardMarketSnapshot?.(true)
        ]);

        showToast(t('hbt.redeem.done'));
        return data;
    } catch (error) {
        console.error('reward coupon onchain redemption failed:', error?.code, error?.message, error);
        showToast(serverErrorText(error, t('hbt.redeem.failed')));
        return { success: false, message: error?.message || 'reward_coupon_onchain_failed' };
    }
}

export async function fetchOnchainBalance() {
    await ensureFunctions();
    const currentUser = auth.currentUser;
    if (!currentUser || !getOnchainBalanceFunction) return null;

    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const result = await getOnchainBalanceFunction();
            return result.data;
        } catch (error) {
            lastError = error;
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, attempt * 400));
            }
        }
    }

    console.error('⚠️ 온체인 잔액 조회 오류:', lastError);
    return null;
}

/**
 * 토큰 전체 통계 조회 (Cloud Function 경유)
 * @returns {object} { totalSupply, totalMined, totalBurned, currentRate, currentPhase, weeklyTarget, remainingInPool, totalStaked, totalSlashed }
 */
export async function fetchTokenStats() {
    try {
        await ensureFunctions();
        if (!getTokenStatsFunction) return null;

        const result = await getTokenStatsFunction();
        return result.data;
    } catch (error) {
        console.error('⚠️ 토큰 통계 조회 오류:', error);
        return null;
    }
}

export async function fetchHbtTransferHistory(limit = 50) {
    try {
        await ensureFunctions();
        const currentUser = auth.currentUser;
        if (!currentUser || !getHbtTransferHistoryFunction) return [];

        const result = await getHbtTransferHistoryFunction({ limit });
        return Array.isArray(result.data?.transfers) ? result.data.transfers : [];
    } catch (error) {
        console.error('⚠️ 최근 HBT 온체인 거래 이력 조회 오류:', error);
        return [];
    }
}

function getWalletProviderLabelSafe(type) {
    switch (type) {
        case 'metamask':
            return 'MetaMask';
        case 'trustwallet':
            return 'Trust Wallet';
        case 'walletconnect':
            return 'WalletConnect';
        case 'internal':
            return t('hbt.wallet.appLabel');
        default:
            return t('hbt.wallet.externalLabel');
    }
}

function refreshWalletUi(address = null) {
    const effectiveAddress = address || getEffectiveWalletAddress();
    const walletDisplay = document.getElementById('wallet-address-display');
    const statusEl = document.getElementById('wallet-connection-status');
    const subEl = document.getElementById('wallet-connection-sub');
    const networkBadgeEl = document.getElementById('wallet-network-badge');
    const policyNoteEl = document.getElementById('wallet-policy-note');
    const exportNoteEl = document.getElementById('wallet-export-note');
    const tokenLinkEl = document.getElementById('wallet-token-link');
    const stakingLinkEl = document.getElementById('wallet-staking-link');
    const copyBtn = document.querySelector('.wallet-addr-btn[onclick*="copyWallet"]');
    const explorerBtn = document.querySelector('.wallet-addr-btn[onclick*="openWalletExplorer"]');
    const disconnectBtn = document.getElementById('wallet-disconnect-btn');
    const disconnectRow = document.getElementById('wallet-disconnect-row');
    const chainLabel = ACTIVE_BSC_NETWORK.label;

    let status = t('hbt.wallet.statusApp');
    let sub = t('hbt.wallet.subApp', { chain: chainLabel });
    let policyNote = t('hbt.wallet.policyApp', { chain: chainLabel });
    const exportNote = t('hbt.wallet.exportNote', { chain: chainLabel });

    if (externalWalletAddress && externalWalletProvider) {
        status = t('hbt.wallet.connected', { provider: getWalletProviderLabelSafe(externalWalletProviderType) });
        sub = t('hbt.wallet.subExternal', { chain: chainLabel });
        policyNote = t('hbt.wallet.policyExternal', { chain: chainLabel });
    } else if (externalWalletAddress) {
        status = t('hbt.wallet.statusSaved');
        sub = t('hbt.wallet.subSaved', { provider: getWalletProviderLabelSafe(externalWalletProviderType), chain: chainLabel });
        policyNote = t('hbt.wallet.policySaved', { chain: chainLabel });
    } else if (userWallet) {
        status = t('hbt.wallet.statusApp');
        sub = t('hbt.wallet.subApp', { chain: chainLabel });
    } else if (userWalletAddress) {
        status = t('hbt.wallet.statusReady');
        sub = t('hbt.wallet.subReady', { chain: chainLabel });
    }

    if (walletDisplay) {
        if (effectiveAddress) {
            walletDisplay.textContent = `${effectiveAddress.substring(0, 8)}...${effectiveAddress.substring(effectiveAddress.length - 6)}`;
            walletDisplay.style.color = '#333';
        } else {
            walletDisplay.textContent = t('hbt.wallet.notConnected');
            walletDisplay.style.color = '';
        }
    }

    if (statusEl) statusEl.textContent = status;
    if (subEl) subEl.textContent = sub;
    if (networkBadgeEl) networkBadgeEl.innerHTML = `<span class="dot"></span> ${chainLabel}`;
    if (policyNoteEl) policyNoteEl.textContent = policyNote;
    if (exportNoteEl) exportNoteEl.textContent = exportNote;
    if (tokenLinkEl) {
        tokenLinkEl.href = effectiveAddress
            ? `${ACTIVE_BSC_NETWORK.explorer}/token/${ACTIVE_HBT_ADDRESS}?a=${effectiveAddress}`
            : `${ACTIVE_BSC_NETWORK.explorer}/token/${ACTIVE_HBT_ADDRESS}`;
        tokenLinkEl.textContent = t('hbt.wallet.tokenLink');
    }
    if (stakingLinkEl) {
        stakingLinkEl.href = `${ACTIVE_BSC_NETWORK.explorer}/token/${ACTIVE_HBT_ADDRESS}?a=${ACTIVE_STAKING_ADDRESS}`;
        stakingLinkEl.textContent = t('hbt.wallet.stakingLink');
    }

    const hasAddress = !!effectiveAddress;
    [copyBtn, explorerBtn].forEach(button => {
        if (!button) return;
        button.disabled = !hasAddress;
    });

    if (disconnectBtn) disconnectBtn.disabled = !externalWalletAddress;
    if (disconnectRow) disconnectRow.style.display = externalWalletAddress ? 'flex' : 'none';
    syncLegacyWalletExportUi();
}

function resetExternalFirstWalletRuntimeState() {
    externalWalletAddress = null;
    externalWalletProviderType = null;
    externalWalletChainId = null;
    externalWalletProvider = null;
    externalWalletWeb3Provider = null;
    userWallet = null;
    userWalletAddress = null;
}

async function restoreExternalFirstWalletState(currentUser, userData = {}) {
    updateLegacyWalletExportState(userData);

    if (userData.externalWalletAddress) {
        externalWalletAddress = userData.externalWalletAddress;
        externalWalletProviderType = userData.walletProviderType || null;
        externalWalletChainId = userData.walletChainId || null;
        await reconnectStoredExternalWallet({
            preferredType: externalWalletProviderType,
            expectedAddress: externalWalletAddress
        });
    }

    const hasActiveExternalWallet = !!externalWalletAddress && !!externalWalletProvider;
    if (!hasActiveExternalWallet && userData?.walletVersion === 2 && userData?.encryptedKey && userData?.walletIv) {
        try {
            const privateKeyHex = await decryptPrivateKey(
                userData.encryptedKey,
                userData.walletIv,
                currentUser.uid,
                currentUser.email
            );
            const wallet = new ethers.Wallet(privateKeyHex);
            userWallet = wallet;
            userWalletAddress = wallet.address;
            console.log('✅ 앱 지갑 복원:', userWalletAddress.substring(0, 10) + '...');
        } catch (error) {
            console.error('⚠️ 앱 지갑 복호화 실패:', error);
            userWalletAddress = userData.walletAddress || null;
        }
    } else if (!hasActiveExternalWallet && userData?.walletAddress) {
        userWalletAddress = userData.walletAddress;
    }

    return getEffectiveWalletAddress();
}

async function initializeWalletExternalFirstOnce(options = {}) {
    try {
        const { forceServer = false } = options || {};
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 초기화 중단.');
            return null;
        }

        resetExternalFirstWalletRuntimeState();

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = forceServer
            ? await getDocFromServer(userRef).catch(() => getDoc(userRef))
            : await getDoc(userRef);
        const userData = userSnap.data() || {};

        await ensureUserReferralCode(userRef, userData).catch(() => {});

        const restoredAddress = await restoreExternalFirstWalletState(currentUser, userData);
        if (restoredAddress) {
            refreshWalletUi(restoredAddress);
            return restoredAddress;
        }

        // A cached empty snapshot must never authorize creating a replacement wallet.
        // Re-read from the server so an external or existing app wallet always wins.
        const freshUserSnap = await getDocFromServer(userRef);
        const freshUserData = freshUserSnap.data() || {};
        const freshRestoredAddress = await restoreExternalFirstWalletState(currentUser, freshUserData);
        if (freshRestoredAddress) {
            refreshWalletUi(freshRestoredAddress);
            return freshRestoredAddress;
        }

        const provisionedAddress = await initializeUserWallet({
            forceServer: true,
            requireFreshSnapshotForCreate: true
        });
        refreshWalletUi(provisionedAddress);
        return provisionedAddress;
    } catch (error) {
        const connectivityIssue = noteFirestoreConnectivityFailure(error, 'initializeWalletState')
            || isFirestoreConnectivityIssue(error);
        if (connectivityIssue) {
            console.info('[wallet] initialization deferred while Firestore reconnects:', error.message);
            return getEffectiveWalletAddress() || window.__assetCachedWalletAddress || null;
        } else {
            console.error('❌ 외부 지갑 우선 초기화 오류:', error);
        }
        refreshWalletUi(null);
        return null;
    }
}

export async function initializeWalletExternalFirst(options = {}) {
    if (externalFirstWalletInitPromise) {
        return externalFirstWalletInitPromise;
    }

    const initPromise = initializeWalletExternalFirstOnce(options);
    externalFirstWalletInitPromise = initPromise;
    try {
        return await initPromise;
    } finally {
        if (externalFirstWalletInitPromise === initPromise) {
            externalFirstWalletInitPromise = null;
        }
    }
}

async function ensureLegacyWalletExportReady() {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error(t('hbt.export.signInAgain'));
    }

    if (!legacyWalletExportAvailable) {
        const userSnap = await getDocFromServer(doc(db, "users", currentUser.uid));
        const userData = userSnap.data() || {};
        updateLegacyWalletExportState(userData);
    }

    if (!legacyWalletExportAvailable || !legacyWalletEncryptedKey || !legacyWalletIv) {
        throw new Error(t('hbt.export.noWallet'));
    }

    return currentUser;
}

export async function openLegacyWalletExportModal() {
    try {
        await ensureLegacyWalletExportReady();
        resetLegacyWalletExportSession();
        const modal = document.getElementById('legacy-wallet-export-modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    } catch (error) {
        showToast(error.message || t('hbt.export.openFailed'));
    }
}

export function closeLegacyWalletExportModal() {
    const modal = document.getElementById('legacy-wallet-export-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    resetLegacyWalletExportSession();
}

export async function revealLegacyWalletPrivateKey() {
    try {
        const currentUser = await ensureLegacyWalletExportReady();
        const secretEl = document.getElementById('legacy-wallet-private-key');
        const revealBtn = document.getElementById('legacy-wallet-reveal-btn');
        const copyBtn = document.getElementById('legacy-wallet-copy-btn');

        if (!legacyWalletRevealed) {
            const privateKeyHex = await decryptPrivateKey(
                legacyWalletEncryptedKey,
                legacyWalletIv,
                currentUser.uid,
                currentUser.email
            );
            legacyWalletPrivateKeyCache = privateKeyHex;
            legacyWalletRevealed = true;
        }

        if (secretEl) {
            secretEl.value = legacyWalletPrivateKeyCache || '';
        }
        if (revealBtn) {
            revealBtn.disabled = true;
            revealBtn.textContent = t('hbt.export.shown');
        }
        if (copyBtn) {
            copyBtn.disabled = !legacyWalletPrivateKeyCache;
        }
        renderLegacyWalletPrivateKeyQr(legacyWalletPrivateKeyCache);
    } catch (error) {
        console.error('기존 앱 지갑 개인키 표시 실패:', error);
        showToast(error.message || t('hbt.export.showFailed'));
    }
}

export async function copyLegacyWalletPrivateKey() {
    try {
        if (!legacyWalletPrivateKeyCache) {
            showToast(t('hbt.export.revealFirst'));
            return false;
        }
        await navigator.clipboard.writeText(legacyWalletPrivateKeyCache);
        showToast(t('hbt.export.copied'));
        return true;
    } catch (error) {
        console.error('기존 앱 지갑 개인키 복사 실패:', error);
        showToast(t('hbt.export.copyFailed'));
        return false;
    }
}

// 온체인 챌린지 시작은 승인·전송·확정까지 수십 초가 걸린다. 기본 토스트는 3.5초
// 뒤 사라져서 그 사이 화면에 아무 표시도 남지 않았고, 사용자는 실패한 줄 알고 다시
// 눌렀다. 진행 중 안내는 사라지지 않게 띄우고, 끝날 때 우리가 직접 걷는다.
let _challengeProgressText = '';

function showChallengeProgress(message) {
    _challengeProgressText = message;
    showToast(message, { durationMs: 0 });
}

// 흐름이 끝났는데 화면에 아직 '진행 중' 안내가 떠 있으면(= 종료 메시지를 못 띄운
// 경로로 빠져나왔으면) 그것만 걷어낸다. 실패 안내가 떠 있으면 건드리지 않는다.
function clearChallengeProgressIfStale() {
    if (!_challengeProgressText) return;
    const toast = document.getElementById('toast');
    if (toast && toast.innerText === _challengeProgressText) hideToast();
    _challengeProgressText = '';
}

// 진행 중에는 챌린지 시작 버튼을 눌리지 않게 한다. 잠금 메시지를 보여 주는 것보다
// 애초에 못 누르게 하는 편이 헷갈리지 않는다.
function setChallengeButtonsBusy(busy) {
    document.querySelectorAll('[onclick^="startChallenge30D("]').forEach((el) => {
        el.style.pointerEvents = busy ? 'none' : '';
        el.style.opacity = busy ? '0.55' : '';
    });
}

export async function startChallenge30DWithConnectedWallet(challengeId) {
    let startLockKey = null;
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast(t('hbt.loginRequired'));
            return false;
        }

        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const challengeDef = CHALLENGES[resolvedId];
        if (!challengeDef) {
            showToast(t('challenge.start.unknown'));
            return false;
        }

        const duration = challengeDef.duration || 30;
        const minStake = challengeDef.hbtStake || 0;
        const maxStake = challengeDef.maxStake || 10000;
        const tier = challengeDef.tier || 'master';

        startLockKey = getChallengeStartLockKey(tier, resolvedId);
        if (challengeStartInFlight.has(startLockKey)) {
            showToast(t('challenge.start.preparing'));
            return false;
        }
        challengeStartInFlight.add(startLockKey);

        let hbtAmount = 0;
        if (minStake > 0) {
            const stakeInput = document.getElementById('stake-' + tier);
            hbtAmount = parseFloat(stakeInput?.value || 0);
            if (!Number.isFinite(hbtAmount) || hbtAmount < minStake) {
                showToast(t('hbt.stake.min', { n: minStake }));
                return false;
            }
            if (Math.round(hbtAmount * 100) !== hbtAmount * 100) {
                showToast(t('hbt.stake.decimals'));
                return false;
            }
            if (hbtAmount > maxStake) {
                showToast(t('hbt.stake.max', { n: maxStake }));
                return false;
            }
        }

        showChallengeProgress(t('challenge.start.starting', { n: duration }));
        setChallengeButtonsBusy(true);

        let stakeApprovalTxHash = null;
        let stakeWalletAddress = null;
        if (hbtAmount > 0) {
            const pendingRecovery = await recoverPendingChallengeStartIfNeeded(currentUser, resolvedId, challengeDef, tier, hbtAmount);
            if (pendingRecovery.handled) {
                return pendingRecovery.success;
            }
            if (!await verifyPaidChallengeStartEligibility(resolvedId, hbtAmount)) {
                return false;
            }

            const connectedWallet = await ensureChallengeSigningWalletReady({ context: 'challenge-start' });
            if (!connectedWallet) return false;

            const erc20Contract = getErc20Contract(connectedWallet.signer);

            const rawAmount = ethers.utils.parseUnits(String(hbtAmount), HBT_TOKEN.decimals);
            const onchainBalance = await erc20Contract.balanceOf(connectedWallet.address);
            if (onchainBalance.lt(rawAmount)) {
                const displayBalance = parseFloat(ethers.utils.formatUnits(onchainBalance, HBT_TOKEN.decimals));
                showToast(t('hbt.stake.lowBalanceShort', { have: displayBalance, need: hbtAmount }));
                return false;
            }

            const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
            const minGas = ethers.utils.parseEther("0.001");
            if (ethBalance.lt(minGas)) {
                showChallengeProgress(t('hbt.gas.refillingShort'));
                await ensureFunctions();
                if (!prefundWalletFunction) {
                    showToast(t('hbt.gas.loadFailed'));
                    return false;
                }
                try {
                    await prefundWalletFunction();
                    await new Promise(resolve => setTimeout(resolve, 4000));
                } catch (error) {
                    console.warn('가스 충전 실패:', error.message);
                    showToast(t('hbt.gas.refillFailedSoft', { token: ACTIVE_GAS_TOKEN }));
                    return false;
                }
            }

            showChallengeProgress(t('hbt.stake.checkingApprovalLock'));
            try {
                const allowance = await erc20Contract.allowance(connectedWallet.address, ACTIVE_STAKING_ADDRESS);
                if (allowance.lt(rawAmount)) {
                    showChallengeProgress(t('hbt.stake.approveInWallet'));
                    const approveTx = await erc20Contract.approve(ACTIVE_STAKING_ADDRESS, rawAmount);
                    const approvalReceipt = await approveTx.wait();
                    stakeApprovalTxHash = approvalReceipt.transactionHash;
                }
                stakeWalletAddress = connectedWallet.address;
                writePendingChallengeStart(currentUser.uid, {
                    challengeId: resolvedId,
                    tier,
                    hbtAmount,
                    stakeApprovalTxHash,
                    walletAddress: stakeWalletAddress,
                    stakeFlowVersion: 2
                });
            } catch (error) {
                console.error('❌ HBT 예치 승인 실패:', error);
                showToast(t('hbt.stake.approveFailedSoft', { token: ACTIVE_GAS_TOKEN }));
                return false;
            }
        }

        await ensureFunctions();
        if (!startChallengeFunction && hbtAmount > 0) {
            showToast(t('hbt.stake.approvedNoServer'));
            return false;
        }
        if (!startChallengeFunction) {
            showToast(t('hbt.serverFailedSoft'));
            return false;
        }

        const result = await startChallengeFunction({
            challengeId: resolvedId,
            hbtAmount,
            stakeApprovalTxHash,
            stakeWalletAddress,
            stakeFlowVersion: 2
        });
        const data = result.data;
        clearPendingChallengeStart(currentUser.uid);

        showChallengeStartSuccessToast(data, challengeDef, duration, tier);
        window.applyOptimisticChallengeStart?.({
            ...data,
            challengeId: resolvedId,
            tier,
            hbtStaked: hbtAmount
        });

        await refreshAssetDisplayAfterChallengeMutation('connected-wallet-challenge-start');
        return true;
    } catch (error) {
        console.error('❌ 외부 지갑 챌린지 시작 오류:', error);
        const msg = serverErrorText(error, t('hbt.unknownError'));
        showToast(t('hbt.error', { msg }));
        return false;
    } finally {
        setChallengeButtonsBusy(false);
        clearChallengeProgressIfStale();
        if (startLockKey) challengeStartInFlight.delete(startLockKey);
    }
}

export function getWalletAddressForUI() {
    return getEffectiveWalletAddress() || window.__assetCachedWalletAddress || null;
}

export async function disconnectExternalWallet() {
    externalWalletAddress = null;
    externalWalletProviderType = null;
    externalWalletChainId = null;
    externalWalletProvider = null;
    externalWalletWeb3Provider = null;

    const currentUser = auth.currentUser;
    if (currentUser) {
        try {
            await setDoc(doc(db, "users", currentUser.uid), {
                externalWalletAddress: deleteField(),
                walletConnectionMode: deleteField(),
                walletProviderType: deleteField(),
                walletChainId: deleteField(),
                walletConnectedAt: deleteField()
            }, { merge: true });
        } catch (error) {
            console.warn('외부 지갑 연결 정보 삭제 실패:', error.message);
        }
    }

    refreshWalletUi(getEffectiveWalletAddress());
    if (window.updateAssetDisplay) window.updateAssetDisplay(true);
    showToast(t('hbt.wallet.disconnected'));
}

console.log('✅ 블록체인 매니저 로드됨. (내장형 지갑, HBT, Staking)');
