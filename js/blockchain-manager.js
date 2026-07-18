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
} from './blockchain-config.js?v=242';

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

import { auth, db, functions, FIREBASE_REGION, APP_ENV, noteFirestoreConnectivityFailure, isFirestoreConnectivityIssue } from './firebase-config.js?v=242';
import { doc, updateDoc, setDoc, getDoc, getDocFromServer, getDocsFromServer, runTransaction, collection, addDoc, serverTimestamp, increment, deleteField, query, where, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js?v=242';
import { getKstDateString } from './ui-helpers.js?v=242';
import { checkRateLimit } from './security.js?v=242';

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
    const qualificationLabel = data.qualificationLabel || describeChallengeQualification(data.qualificationPolicy || tier);
    const recoveryPrefix = recovered || data?.recovered ? '♻️ 이전 예치 복구 완료!\n' : '';
    const deferredLine = data?.deferredStart && data?.startDate
        ? `\n📅 오늘은 대기일이에요. ${data.startDate}부터 1일차로 시작해요.`
        : '';
    const todayCreditLine = !data?.deferredStart && data.initialCompletedDays > 0
        ? '\n📌 오늘 인증분 1일 반영!'
        : '';
    if (data.hbtStaked > 0) {
        showToast(`${recoveryPrefix}✅ ${data.duration || duration}일 챌린지 시작!\n${qualificationLabel}\n${data.hbtStaked} HBT 온체인 예치 완료.${todayCreditLine}${deferredLine}\n현재 적용 보너스: ${data.bonusRateLabel || '0%'} / 80%+ 시 예치금 반환`);
        return;
    }
    showToast(`${recoveryPrefix}✅ ${data.duration || duration}일 챌린지 시작!\n${qualificationLabel}${todayCreditLine}${deferredLine}\n${duration}일 동안 매일 인증하면 ${challengeDef.rewardPoints}P 보상!`);
}

async function verifyPaidChallengeStartEligibility(challengeId, hbtAmount) {
    await ensureFunctions();
    if (!startChallengeFunction) {
        showToast('챌린지 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
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
        const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
        showToast(message || '현재 다른 HBT 예치 챌린지가 진행 중이에요.');
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
        showToast('⚠️ 이전 온체인 예치 복구가 아직 남아 있어 새 예치를 막았어요. 먼저 같은 챌린지로 복구를 완료해 주세요.');
        return { handled: true, success: false };
    }

    await ensureFunctions();
    if (!startChallengeFunction) {
        showToast('⚠️ 이전 온체인 예치 복구를 위해 서버 연결이 필요합니다. 잠시 뒤 다시 시도해 주세요.');
        return { handled: true, success: false };
    }

    try {
        showToast('♻️ 이전 온체인 예치를 복구 중...');
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
        showToast('⚠️ 이전 예치 복구가 아직 완료되지 않았습니다. 새 예치는 막아두었어요. 잠시 뒤 다시 시도해 주세요.');
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
                showToast('⏳ 앱 지갑을 준비 중이에요. 잠시만 기다려 주세요.');
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
    showToast('❌ 앱 지갑을 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
    return null;
}

function updateLegacyWalletExportState(userData = {}) {
    legacyWalletEncryptedKey = userData?.encryptedKey || null;
    legacyWalletIv = userData?.walletIv || null;
    legacyWalletExportAvailable = !!(userData?.walletVersion === 2 && legacyWalletEncryptedKey && legacyWalletIv);
}

function resetLegacyWalletExportSession() {
    legacyWalletPrivateKeyCache = null;
    legacyWalletRevealed = false;

    const secretEl = document.getElementById('legacy-wallet-private-key');
    const revealBtn = document.getElementById('legacy-wallet-reveal-btn');
    const copyBtn = document.getElementById('legacy-wallet-copy-btn');

    if (secretEl) {
        secretEl.value = '';
        secretEl.placeholder = '아직 표시되지 않았습니다.';
    }
    if (revealBtn) {
        revealBtn.disabled = false;
        revealBtn.textContent = '1회 보기';
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
            return '앱 지갑';
        default:
            return '외부 지갑';
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
            showToast('🔐 지갑 보안이 업그레이드되었습니다!');
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
        showToast('✅ 보안 지갑이 생성되었습니다!');
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
        showToast('⏳ 변환 처리 중입니다. 잠시 후 다시 시도해주세요.');
        return false;
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('❌ 로그인이 필요합니다.');
        return false;
    }

    // 인자로 받은 값 우선, 없으면 input에서 읽기
    if (typeof pointAmount !== 'number' || isNaN(pointAmount)) {
        const pointInput = document.getElementById('conversion-points');
        pointAmount = parseInt(pointInput?.value || 0);
    }

    if (pointAmount < CONVERSION_RULES.minConversion) {
        showToast(`❌ 최소 ${CONVERSION_RULES.minConversion}P 이상 필요합니다.`);
        return false;
    }

    if (pointAmount % 100 !== 0) {
        showToast('❌ 100P 단위로만 변환 가능합니다.');
        return false;
    }

    const walletAddress = await initializeWalletExternalFirst();
    if (!walletAddress) {
        showToast('❌ HBT 지갑을 준비하지 못했습니다. 네트워크를 확인한 뒤 다시 시도해주세요.');
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

        showToast(`✅ ${pointsUsed}P → ${hbtReceived} HBT 변환 완료!`);

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
            showToast('❌ 블록체인 모듈을 로드하지 못했습니다. 페이지를 새로고침해주세요.');
            return false;
        }

        showToast('⏳ HBT 변환 중입니다...');

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

        showToast('❌ HBT 변환 결과를 확인하지 못했습니다. 잠시 후 자산 탭에서 다시 확인해주세요.');
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
            showToast('⏳ 이전 변환이 아직 처리 중입니다. 잠시 후 다시 확인해주세요.');
        } else if (msg.includes('포인트가 부족')) {
            showToast('❌ 포인트가 부족합니다.');
        } else if (msg.includes('일일 변환 한도')) {
            showToast('❌ 일일 변환 한도를 초과했습니다.\n매일 오전 9시 reset 후 다시 시도해주세요.');
        } else if (msg.includes('지갑이 생성되지')) {
            showToast('❌ 지갑이 아직 생성되지 않았습니다. 페이지를 새로고침해주세요.');
        } else {
            showToast('❌ HBT 변환에 실패했습니다. 잠시 후 다시 시도해주세요.');
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
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        // 하위 호환: 기존 ID를 새 ID로 매핑
        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const challengeDef = CHALLENGES[resolvedId];
        if (!challengeDef) {
            showToast('❌ 알 수 없는 챌린지입니다.');
            return false;
        }
        const duration = challengeDef.duration || 30;
        const minStake = challengeDef.hbtStake || 0;
        const maxStake = challengeDef.maxStake || 10000;
        const tier = challengeDef.tier || 'master';

        startLockKey = getChallengeStartLockKey(tier, resolvedId);
        if (challengeStartInFlight.has(startLockKey)) {
            showToast('⏳ 챌린지를 준비 중이에요. 잠시만 기다려 주세요.');
            return false;
        }
        challengeStartInFlight.add(startLockKey);

        // 티어별 인라인 입력에서 예치량 읽기
        let hbtAmount = 0;
        if (minStake > 0) {
            const stakeInput = document.getElementById('stake-' + tier);
            hbtAmount = parseFloat(stakeInput?.value || 0);
            if (!Number.isFinite(hbtAmount) || hbtAmount < minStake) {
                showToast(`❌ 최소 ${minStake} HBT 이상 예치해야 합니다.`);
                return false;
            }
            if (Math.round(hbtAmount * 100) !== hbtAmount * 100) {
                showToast('❌ HBT는 소수점 2자리까지만 입력 가능합니다.');
                return false;
            }
            if (hbtAmount > maxStake) {
                showToast(`❌ 최대 ${maxStake} HBT까지만 예치 가능합니다.`);
                return false;
            }
        }

        showToast(`⏳ ${duration}일 챌린지 시작 중...`);

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
                showToast(`❌ 온체인 HBT 잔액이 부족합니다.\n보유: ${displayBalance} HBT, 필요: ${hbtAmount} HBT\n먼저 포인트를 HBT로 변환해주세요.`);
                return false;
            }

            const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
            const MIN_GAS = ethers.utils.parseEther("0.001");
            if (ethBalance.lt(MIN_GAS)) {
                showToast(`⏳ 가스(${ACTIVE_GAS_TOKEN}) 부족 — 자동 충전 중...`);
                try {
                    await ensureFunctions();
                    await prefundWalletFunction();
                    await new Promise(r => setTimeout(r, 4000));
                } catch (fundErr) {
                    console.warn('가스 충전 실패:', fundErr.message);
                    showToast(`❌ 가스(${ACTIVE_GAS_TOKEN}) 자동 충전에 실패했습니다. 잠시 후 다시 시도해주세요.`);
                    return false;
                }
            }

            showToast('⏳ HBT 예치 권한 확인 중...');
            try {
                const allowance = await erc20Contract.allowance(connectedWallet.address, ACTIVE_STAKING_ADDRESS);
                if (allowance.lt(rawAmount)) {
                    showToast('⏳ HBT 예치 권한 승인 중...');
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
                showToast(`❌ HBT 예치 승인에 실패했습니다. 가스(${ACTIVE_GAS_TOKEN})가 부족할 수 있습니다.`);
                return false;
            }
        }

        // Cloud Function 호출 (서버에서 Firestore 챌린지 기록)
        await ensureFunctions();
        if (!startChallengeFunction && hbtAmount > 0) {
            showToast('⚠️ 예치 권한은 승인됐지만 서버 연결이 되지 않았습니다.\n같은 챌린지를 다시 누르면 추가 승인 없이 복구를 시도합니다.');
            return false;
        }
        if (!startChallengeFunction) {
            showToast('❌ 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
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
        const msg = error.message || '알 수 없는 오류';
        showToast(`❌ 오류: ${msg}`);
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

/**
 * 만료된 챌린지 확인 (지갑 탭/로그인 시 호출)
 * 성공 챌린지 → status:'claimable'로 변경 (사용자가 직접 수령)
 * 실패 챌린지 → 즉시 정산 (예치금 소멸)
 */
export async function settleExpiredChallenges() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        await ensureFunctions();
        const refreshProgressFn = httpsCallable(functions, 'refreshChallengeProgress');
        const refreshResult = await refreshProgressFn({});
        const activeChallenges = refreshResult.data?.activeChallenges || {};
        const expiredTiers = Object.entries(activeChallenges)
            .filter(([, challenge]) => challenge?.status === 'expired')
            .map(([tier]) => tier);
        for (const tier of expiredTiers) {
            const settleFn = httpsCallable(functions, 'settleChallengeFailure');
            await settleFn({ tier });
        }
        if (expiredTiers.length > 0) {
            await refreshAssetDisplayAfterChallengeMutation('challenge-expiry');
        }
        return refreshResult.data || null;
    } catch (error) {
        const connectivityIssue = noteFirestoreConnectivityFailure(error, 'settleExpiredChallenges');
        if (connectivityIssue) {
            console.info('[challenge-settlement] deferred while Firestore reconnects:', error.message);
        } else {
            console.warn('⚠️ 만료 챌린지 처리 오류:', error.message);
        }
    }
}

/**
 * 챌린지 보상 수령 (Cloud Function 경유)
 * @param {string} tier - 'mini' | 'weekly' | 'master'
 */
export async function claimChallengeReward(tier) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        showToast('⏳ 보상 수령 중...');

        // Cloud Function lazy init
        if (!claimChallengeFunction) {
            claimChallengeFunction = httpsCallable(functions, 'claimChallengeReward');
        }

        const result = await claimChallengeFunction({ tier });
        const data = result.data;

        let resultParts = [];
        if (data.rewardHbt > 0) resultParts.push(`+${data.rewardHbt} HBT`);
        if (data.rewardPoints > 0) resultParts.push(`+${data.rewardPoints}P`);
        const policySuffix = data.bonusRateLabel ? ` (보너스 ${data.bonusRateLabel})` : '';
        showToast(`🎉 보상 수령 완료! ${resultParts.join(' ')}${policySuffix}`);

        window.applyOptimisticChallengeSettlement?.(data);
        await refreshAssetDisplayAfterChallengeMutation('challenge-claim');
        // 챌린지 카드 UI 갱신 (카드가 그대로 남아 재시도 방지)
        if (window.loadDashboard) window.loadDashboard();
        return true;
    } catch (error) {
        console.error('❌ 보상 수령 오류:', error);
        // Firebase 콜러블 에러 코드는 'functions/failed-precondition'처럼 접두사가 붙어
        // 올 수 있으므로 벗겨서 비교한다(그래야 서버 안내 메시지 노출 분기가 걸린다).
        const code = String(error?.code || '').replace(/^functions\//, '');
        const serverMsg = String(error?.message || '').trim();
        // 서버가 사용자용 구체 안내를 주는 코드(일일 한도 초과, 조건 미충족 등)는
        // 하드코딩 문구로 덮지 말고 서버 메시지를 그대로 사용자에게 보여준다.
        const msg = (serverMsg && (code === 'failed-precondition' || code === 'resource-exhausted'))
            ? `❌ ${serverMsg}`
            : code === 'internal'
            ? '❌ 온체인 정산에 실패했습니다. 잠시 후 다시 시도해주세요.'
            : code === 'unauthenticated'
            ? '❌ 로그인이 필요합니다.'
            : `❌ 보상 수령에 실패했습니다. (${code || serverMsg || '알 수 없는 오류'})`;
        showToast(msg);
        return false;
    }
}

/**
 * 챌린지 포기
 * @param {string} tier - 'mini' | 'weekly' | 'master'
 */
export async function forfeitChallenge(tier) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const activeChallenges = userData.activeChallenges || {};
        const challenge = activeChallenges[tier];

        if (!challenge || challenge.status !== 'ongoing') {
            showToast('❌ 진행 중인 챌린지가 없습니다.');
            return false;
        }

        const staked = challenge.hbtStaked || 0;
        const stakedOnChain = challenge.stakedOnChain || false;
        const msg = staked > 0
            ? `⚠️ 포기하면 예치한 ${staked} HBT의 50%가 소각됩니다.\n정말 포기하시겠습니까?`
            : '정말 이 챌린지를 포기하시겠습니까?';

        if (!confirm(msg)) return false;

        await ensureFunctions();
        const forfeitFn = httpsCallable(functions, 'settleChallengeFailure');
        const forfeitResult = await forfeitFn({ tier, forceForfeit: true });
        const burned = Number(forfeitResult.data?.burned || 0);
        const returned = Number(forfeitResult.data?.returned || 0);
        showToast(staked > 0
            ? `🏳️ 챌린지 포기.\n${returned} HBT 반환, ${burned} HBT 소각`
            : '🏳️ 챌린지를 포기했습니다.');
        await refreshAssetDisplayAfterChallengeMutation('challenge-forfeit');
        return true;
    } catch (error) {
        console.error('❌ 챌린지 포기 오류:', error);
        showToast('❌ 오류가 발생했습니다.');
        return false;
    }
}

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
        showToast('⏳ 쿠폰 교환을 처리 중입니다. 잠시 후 다시 시도해 주세요.');
        return { success: false };
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('❌ 로그인이 필요합니다.');
        return { success: false };
    }

    const normalizedSku = String(sku || '').trim();
    const rewardCost = Number(hbtCost || 0);
    const quotedCost = Number(quotedHbtCost || rewardCost || 0);
    if (!normalizedSku) {
        showToast('❌ 교환할 상품 정보를 찾지 못했어요.');
        return { success: false };
    }
    if (!(rewardCost >= 2000)) {
        showToast('❌ 2,000 HBT 이상 상품부터 교환할 수 있어요.');
        return { success: false };
    }

    await ensureFunctions();
    if (!redeemRewardCouponFunction) {
        showToast('❌ 쿠폰 교환 모듈을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
        return { success: false };
    }

    const retryPendingRedemption = async (pending) => {
        if (!pending?.burnTxHash || pending.sku !== normalizedSku || Number(pending.hbtCost || 0) !== rewardCost) {
            return null;
        }
        showToast('🎟️ 이전 소각 기록으로 쿠폰 발급을 다시 확인하고 있어요...');
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
        showToast('❌ 지갑이 아직 준비되지 않았어요. 새로고침 후 다시 시도해 주세요.');
        return { success: false };
    }

    const erc20Contract = getErc20Contract(connectedWallet.signer);
    const rawAmount = ethers.utils.parseUnits(String(rewardCost), HBT_TOKEN.decimals);
    const onchainBalance = await erc20Contract.balanceOf(connectedWallet.address);
    if (onchainBalance.lt(rawAmount)) {
        const displayBalance = parseFloat(ethers.utils.formatUnits(onchainBalance, HBT_TOKEN.decimals));
        showToast(`❌ 온체인 HBT가 부족합니다.\n보유 ${displayBalance} HBT / 필요 ${rewardCost} HBT`);
        return { success: false };
    }

    const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
    const minGas = ethers.utils.parseEther('0.001');
    if (ethBalance.lt(minGas) && prefundWalletFunction) {
        showToast(`⚡ 가스(${ACTIVE_GAS_TOKEN})가 부족해 자동 충전을 시도할게요...`);
        try {
            await prefundWalletFunction();
            await new Promise((resolve) => setTimeout(resolve, 4000));
        } catch (error) {
            console.warn('reward redemption prefund failed:', error?.message || error);
        }
    }

    try {
        showToast(`🔥 ${rewardCost} HBT 소각 중...`);
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

        showToast('🎟️ 쿠폰 발급 요청 중...');
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

        showToast('✅ HBT 소각과 쿠폰 발급 요청이 완료됐어요.');
        return data;
    } catch (error) {
        console.error('reward coupon onchain redemption failed:', error?.code, error?.message, error);
        showToast(error?.message || '❌ 쿠폰 교환 중 문제가 생겼어요.');
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
            return '앱 지갑';
        default:
            return '외부 지갑';
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

    let status = '앱 지갑 사용 중';
    let sub = `로그인만 하면 ${chainLabel}에서 HBT 변환과 챌린지를 바로 진행할 수 있어요.`;
    let policyNote = `기본 사용 방식은 앱 지갑입니다. ${chainLabel}에서 HBT 변환과 예치를 바로 진행할 수 있어요.`;
    const exportNote = `외부 지갑으로 옮길 때만 개인키를 1회 확인하면 돼요. 내보낸 뒤에는 ${chainLabel}에서 같은 주소를 직접 관리할 수 있어요.`;

    if (externalWalletAddress && externalWalletProvider) {
        status = `${getWalletProviderLabelSafe(externalWalletProviderType)} 연결됨`;
        sub = `고급 모드로 ${chainLabel} 외부 지갑에서 직접 보관 중이에요.`;
        policyNote = `현재 연결된 외부 지갑 주소로 ${chainLabel} HBT와 챌린지를 직접 관리하고 있어요.`;
    } else if (externalWalletAddress) {
        status = '외부 지갑 주소 저장됨';
        sub = `${getWalletProviderLabelSafe(externalWalletProviderType)}을 다시 연결하면 ${chainLabel}에서 같은 주소로 이어서 사용할 수 있어요.`;
        policyNote = `저장된 외부 지갑 주소는 ${chainLabel} 기준으로 유지돼요. 다시 연결하면 같은 주소를 이어서 사용할 수 있어요.`;
    } else if (userWallet) {
        status = '앱 지갑 사용 중';
        sub = `로그인만 하면 ${chainLabel}에서 HBT 변환과 챌린지를 바로 진행할 수 있어요.`;
    } else if (userWalletAddress) {
        status = '앱 지갑 주소 준비됨';
        sub = `앱 지갑으로 ${chainLabel} HBT 변환과 챌린지를 이어서 사용할 수 있어요.`;
    }

    if (walletDisplay) {
        if (effectiveAddress) {
            walletDisplay.textContent = `${effectiveAddress.substring(0, 8)}...${effectiveAddress.substring(effectiveAddress.length - 6)}`;
            walletDisplay.style.color = '#333';
        } else {
            walletDisplay.textContent = '지갑 미연결';
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
        tokenLinkEl.textContent = '🔗 내 HBT 보기';
    }
    if (stakingLinkEl) {
        stakingLinkEl.href = `${ACTIVE_BSC_NETWORK.explorer}/token/${ACTIVE_HBT_ADDRESS}?a=${ACTIVE_STAKING_ADDRESS}`;
        stakingLinkEl.textContent = '🏦 챌린지 예치 HBT';
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
        throw new Error('로그인 후 다시 시도해 주세요.');
    }

    if (!legacyWalletExportAvailable) {
        const userSnap = await getDocFromServer(doc(db, "users", currentUser.uid));
        const userData = userSnap.data() || {};
        updateLegacyWalletExportState(userData);
    }

    if (!legacyWalletExportAvailable || !legacyWalletEncryptedKey || !legacyWalletIv) {
        throw new Error('내보낼 기존 앱 지갑이 없습니다.');
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
        showToast(error.message || '지갑 내보내기를 열 수 없어요.');
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
            revealBtn.textContent = '표시 완료';
        }
        if (copyBtn) {
            copyBtn.disabled = !legacyWalletPrivateKeyCache;
        }
    } catch (error) {
        console.error('기존 앱 지갑 개인키 표시 실패:', error);
        showToast(error.message || '개인키를 표시할 수 없어요.');
    }
}

export async function copyLegacyWalletPrivateKey() {
    try {
        if (!legacyWalletPrivateKeyCache) {
            showToast('먼저 1회 보기를 눌러 주세요.');
            return false;
        }
        await navigator.clipboard.writeText(legacyWalletPrivateKeyCache);
        showToast('개인키를 복사했어요. 안전한 곳에서만 붙여넣어 주세요.');
        return true;
    } catch (error) {
        console.error('기존 앱 지갑 개인키 복사 실패:', error);
        showToast('복사에 실패했어요. 다시 시도해 주세요.');
        return false;
    }
}

export async function startChallenge30DWithConnectedWallet(challengeId) {
    let startLockKey = null;
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
        const challengeDef = CHALLENGES[resolvedId];
        if (!challengeDef) {
            showToast('❌ 알 수 없는 챌린지입니다.');
            return false;
        }

        const duration = challengeDef.duration || 30;
        const minStake = challengeDef.hbtStake || 0;
        const maxStake = challengeDef.maxStake || 10000;
        const tier = challengeDef.tier || 'master';

        startLockKey = getChallengeStartLockKey(tier, resolvedId);
        if (challengeStartInFlight.has(startLockKey)) {
            showToast('⏳ 챌린지를 준비 중이에요. 잠시만 기다려 주세요.');
            return false;
        }
        challengeStartInFlight.add(startLockKey);

        let hbtAmount = 0;
        if (minStake > 0) {
            const stakeInput = document.getElementById('stake-' + tier);
            hbtAmount = parseFloat(stakeInput?.value || 0);
            if (!Number.isFinite(hbtAmount) || hbtAmount < minStake) {
                showToast(`❌ 최소 ${minStake} HBT 이상 예치해야 합니다.`);
                return false;
            }
            if (Math.round(hbtAmount * 100) !== hbtAmount * 100) {
                showToast('❌ HBT는 소수점 2자리까지만 입력 가능합니다.');
                return false;
            }
            if (hbtAmount > maxStake) {
                showToast(`❌ 최대 ${maxStake} HBT까지만 예치 가능합니다.`);
                return false;
            }
        }

        showToast(`⏳ ${duration}일 챌린지 시작 중...`);

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
                showToast(`❌ 온체인 HBT 잔액이 부족해요. 보유 ${displayBalance} HBT / 필요 ${hbtAmount} HBT`);
                return false;
            }

            const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
            const minGas = ethers.utils.parseEther("0.001");
            if (ethBalance.lt(minGas)) {
                showToast('⛽ 가스 부족 → 자동 충전 중...');
                await ensureFunctions();
                if (!prefundWalletFunction) {
                    showToast('❌ 가스 충전 함수를 불러오지 못했어요.');
                    return false;
                }
                try {
                    await prefundWalletFunction();
                    await new Promise(resolve => setTimeout(resolve, 4000));
                } catch (error) {
                    console.warn('가스 충전 실패:', error.message);
                    showToast(`❌ 가스(${ACTIVE_GAS_TOKEN}) 자동 충전에 실패했어요. 잠시 뒤 다시 시도해 주세요.`);
                    return false;
                }
            }

            showToast('🔐 HBT 예치 권한 확인 중...');
            try {
                const allowance = await erc20Contract.allowance(connectedWallet.address, ACTIVE_STAKING_ADDRESS);
                if (allowance.lt(rawAmount)) {
                    showToast('⏳ HBT 예치 권한 승인 중...');
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
                showToast(`❌ HBT 예치 승인에 실패했어요. 가스(${ACTIVE_GAS_TOKEN})와 지갑 연결을 확인해 주세요.`);
                return false;
            }
        }

        await ensureFunctions();
        if (!startChallengeFunction && hbtAmount > 0) {
            showToast('⚠️ 예치 권한은 승인됐지만 서버 연결이 되지 않았습니다.\n같은 챌린지를 다시 누르면 추가 승인 없이 복구를 시도합니다.');
            return false;
        }
        if (!startChallengeFunction) {
            showToast('❌ 서버 연결에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
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
        const msg = error.message || '알 수 없는 오류';
        showToast(`❌ 오류: ${msg}`);
        return false;
    } finally {
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
    showToast('외부 지갑 연결을 해제했어요.');
}

console.log('✅ 블록체인 매니저 로드됨. (내장형 지갑, HBT, Staking)');
