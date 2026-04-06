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
    BASE_CONFIG, 
    HBT_TOKEN, 
    STAKING_CONTRACT, 
    CONVERSION_RULES,
    CHALLENGES
} from './blockchain-config.js';

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

import { auth, db, functions, FIREBASE_REGION } from './firebase-config.js';
import { doc, updateDoc, setDoc, getDoc, getDocFromServer, collection, addDoc, serverTimestamp, increment, deleteField, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast } from './ui-helpers.js';
import { getKstDateString } from './ui-helpers.js';
import { checkRateLimit } from './security.js';

// Cloud Function 참조 (lazy 초기화 — import 실패해도 모듈 로드에 영향 없음)
let mintHBTFunction = null;
let getOnchainBalanceFunction = null;
let getTokenStatsFunction = null;
let claimChallengeFunction = null;
let startChallengeFunction = null;
let prefundWalletFunction = null;
let _functionsInitialized = false;

async function ensureFunctions() {
    if (_functionsInitialized) return;
    try {
        mintHBTFunction = httpsCallable(functions, 'mintHBT');
        getOnchainBalanceFunction = httpsCallable(functions, 'getOnchainBalance');
        getTokenStatsFunction = httpsCallable(functions, 'getTokenStats');
        startChallengeFunction = httpsCallable(functions, 'startChallenge');
        prefundWalletFunction = httpsCallable(functions, 'prefundWallet');
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

const BSC_TESTNET_CHAIN_ID = BASE_CONFIG.testnet.chainId;
const BSC_TESTNET_CHAIN_HEX = `0x${BSC_TESTNET_CHAIN_ID.toString(16)}`;
const BSC_TESTNET_PARAMS = {
    chainId: BSC_TESTNET_CHAIN_HEX,
    chainName: 'BSC Testnet',
    nativeCurrency: {
        name: 'tBNB',
        symbol: 'tBNB',
        decimals: 18
    },
    rpcUrls: [BASE_CONFIG.testnet.rpcUrl],
    blockExplorerUrls: [BASE_CONFIG.testnet.explorer]
};

// HBT 토큰 컨트랙트 ABI (stakeForChallenge용 최소 ABI)
const HBT_STAKE_ABI = [
    'function stakeForChallenge(uint256 amount) external',
    'function challengeStakes(address) view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
];

/**
 * 사용자 지갑을 BSC 테스트넷 프로바이더에 연결
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

    if (!userWallet) return null;
    const provider = new ethers.providers.JsonRpcProvider(
        BASE_CONFIG.testnet.rpcUrl,
        BASE_CONFIG.testnet.chainId
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

function openWalletInstallLink(preferredType = 'metamask') {
    const currentUrl = window.location.href;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    let url = 'https://metamask.io/download/';

    if (preferredType === 'metamask' && isMetaMaskInAppBrowser()) {
        showToast('MetaMask 앱 브라우저에서 페이지를 새로고침한 뒤 다시 시도해 주세요.');
        return;
    }

    if (preferredType === 'trustwallet' && isTrustWalletInAppBrowser()) {
        showToast('Trust Wallet 앱 브라우저에서 페이지를 새로고침한 뒤 다시 시도해 주세요.');
        return;
    }

    if (preferredType === 'trustwallet') {
        url = isMobile
            ? `https://link.trustwallet.com/open_url?url=${encodeURIComponent(currentUrl)}`
            : 'https://trustwallet.com/browser-extension';
    } else if (preferredType === 'metamask') {
        url = isMobile
            ? `https://metamask.app.link/dapp/${encodeURIComponent(currentUrl)}`
            : 'https://metamask.io/download/';
    }

    window.open(url, '_blank', 'noopener');
}

async function ensureInjectedNetwork(provider) {
    if (!provider?.request) return null;
    try {
        const chainHex = await provider.request({ method: 'eth_chainId' });
        if (parseInt(chainHex, 16) === BSC_TESTNET_CHAIN_ID) {
            return BSC_TESTNET_CHAIN_ID;
        }
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BSC_TESTNET_CHAIN_HEX }]
        });
        return BSC_TESTNET_CHAIN_ID;
    } catch (error) {
        if (error?.code === 4902) {
            await provider.request({
                method: 'wallet_addEthereumChain',
                params: [BSC_TESTNET_PARAMS]
            });
            return BSC_TESTNET_CHAIN_ID;
        }
        throw error;
    }
}

async function ensureUserReferralCode(userRef, userData) {
    if (userData?.referralCode) return userData.referralCode;
    const referralCode = generateReferralCode();
    await setDoc(userRef, { referralCode }, { merge: true });
    return referralCode;
}

async function reconnectStoredExternalWallet({ preferredType = null, expectedAddress = null } = {}) {
    const provider = await waitForInjectedProvider(preferredType, 1600);
    if (!provider?.request) return null;
    try {
        const accounts = await provider.request({ method: 'eth_accounts' });
        if (!Array.isArray(accounts) || accounts.length === 0) return null;

        const matchedAddress = expectedAddress
            ? accounts.find(account => account?.toLowerCase() === expectedAddress.toLowerCase())
            : accounts[0];

        if (!matchedAddress) return null;

        externalWalletProvider = provider;
        externalWalletWeb3Provider = new ethers.providers.Web3Provider(provider, 'any');
        externalWalletAddress = ethers.utils.getAddress(matchedAddress);
        externalWalletProviderType = preferredType || getInjectedProviderType(provider);

        const chainHex = await provider.request({ method: 'eth_chainId' }).catch(() => null);
        externalWalletChainId = chainHex ? parseInt(chainHex, 16) : null;
        return externalWalletAddress;
    } catch (error) {
        console.warn('외부 지갑 재연결 실패:', error.message);
        return null;
    }
}

async function connectInjectedWallet(preferredType = 'metamask') {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        showToast('🔐 로그인 후 지갑을 연결해 주세요.');
        return null;
    }

    const provider = await waitForInjectedProvider(preferredType);
    if (!provider?.request) {
        const providerLabel = getWalletProviderLabelSafe(preferredType);
        if ((preferredType === 'metamask' && isMetaMaskInAppBrowser())
            || (preferredType === 'trustwallet' && isTrustWalletInAppBrowser())) {
            showToast(`${providerLabel} 앱 브라우저에서 페이지를 새로고침한 뒤 다시 시도해 주세요.`);
            return null;
        }
        showToast(`${providerLabel} 앱 또는 확장 프로그램을 먼저 열어 주세요.`);
        openWalletInstallLink(preferredType);
        return null;
    }

    try {
        const accounts = await provider.request({ method: 'eth_requestAccounts' });
        if (!Array.isArray(accounts) || accounts.length === 0) {
            showToast('지갑 주소를 찾지 못했어요.');
            return null;
        }

        await ensureInjectedNetwork(provider);

        externalWalletProvider = provider;
        externalWalletWeb3Provider = new ethers.providers.Web3Provider(provider, 'any');
        const signer = externalWalletWeb3Provider.getSigner();
        const address = ethers.utils.getAddress(await signer.getAddress());
        const network = await externalWalletWeb3Provider.getNetwork().catch(() => ({ chainId: BSC_TESTNET_CHAIN_ID }));

        externalWalletAddress = address;
        externalWalletProviderType = preferredType || getInjectedProviderType(provider);
        externalWalletChainId = network?.chainId || BSC_TESTNET_CHAIN_ID;

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef).catch(() => null);
        const userData = userSnap?.data?.() || {};
        await ensureUserReferralCode(userRef, userData);
        await setDoc(userRef, {
            externalWalletAddress: address,
            walletConnectionMode: 'external',
            walletProviderType: externalWalletProviderType,
            walletChainId: externalWalletChainId,
            walletConnectedAt: serverTimestamp()
        }, { merge: true });

        refreshWalletUi(address);
        if (window.updateAssetDisplay) await window.updateAssetDisplay(true);
        showToast(`${getWalletProviderLabelSafe(externalWalletProviderType)} 연결 완료`);
        return address;
        showToast(`${getWalletProviderLabel(externalWalletProviderType)} 연결 완료`);
        return address;
    } catch (error) {
        if (error?.code === 4001) {
            showToast('지갑 연결이 취소되었어요.');
            return null;
        }
        console.error('외부 지갑 연결 오류:', error);
        showToast(error?.message?.includes('chain')
            ? 'BSC 테스트넷으로 전환한 뒤 다시 시도해 주세요.'
            : '지갑 연결에 실패했어요. 다시 시도해 주세요.');
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

/**
 * 사용자 지갑 초기화 (로그인 시 자동 호출)
 * v2: 랜덤 지갑 + 암호화 저장
 * @returns {string} 지갑 주소
 */
export async function initializeUserWallet() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 생성 불가.');
            return null;
        }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
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
                    const referralCode = generateReferralCode();
                    await updateDoc(userRef, { referralCode });
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
                migrateData.referralCode = generateReferralCode();
                console.log('✅ 초대 코드 생성 (Case 2):', migrateData.referralCode);
            }
            await updateDoc(userRef, migrateData);

            console.log('✅ v2 지갑 마이그레이션 완료:', userWalletAddress.substring(0, 10) + '...');
            updateWalletUI(userWalletAddress);
            showToast('🔐 지갑 보안이 업그레이드되었습니다!');
            return userWalletAddress;
        }

        // Case 3: 지갑 없음 → 새 v2 지갑 생성
        console.log('🆕 새 보안 지갑 생성 중...');
        const newWallet = ethers.Wallet.createRandom();
        const { encrypted, iv } = await encryptPrivateKey(
            newWallet.privateKey, currentUser.uid, currentUser.email
        );

        userWallet = newWallet;
        userWalletAddress = newWallet.address;

        // 6자리 초대 코드 생성 (영숫자 대문자), users/{uid}.referralCode에 저장
        // processReferralSignup Cloud Function에서 users 컬렉션 쿼리로 역방향 조회
        const referralCode = generateReferralCode();

        await setDoc(userRef, {
            walletAddress: userWalletAddress,
            walletCreatedAt: serverTimestamp(),
            encryptedKey: encrypted,
            walletIv: iv,
            walletVersion: 2,
            referralCode: referralCode
        }, { merge: true });

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

    // Cloud Function 경유 온체인 민팅
    try {
        await ensureFunctions();
        if (!mintHBTFunction) {
            console.error('❌ mintHBT Cloud Function 초기화 실패');
            showToast('❌ 블록체인 모듈을 로드하지 못했습니다. 페이지를 새로고침해주세요.');
            return false;
        }

        showToast('⏳ HBT 변환 중입니다...');

        const result = await mintHBTFunction({ pointAmount });
        const data = result.data;

        if (data.success) {
            showToast(`✅ ${data.pointsUsed}P → ${data.hbtReceived} HBT 변환 완료!`);
            if (data.txHash) {
                console.log(`🔍 TX: ${data.explorerUrl}`);
            }
        }

        if (window.updateAssetDisplay) await window.updateAssetDisplay(true);
        return true;
    } catch (onchainError) {
        console.error('❌ 온체인 민팅 실패:', onchainError.code, onchainError.message);
        const msg = onchainError.message || '';
        if (msg.includes('포인트가 부족')) {
            showToast('❌ 포인트가 부족합니다.');
        } else if (msg.includes('일일 변환 한도')) {
            showToast('❌ 일일 변환 한도를 초과했습니다.');
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
 * 동시 진행 지원: 티어(mini/weekly/master)별 1개씩 동시 진행 가능
 * - 3일: HBT 예치 없음, 포인트만 보상
 * - 7일/30일: 온체인 stakeForChallenge → CF로 Firestore 기록
 */
export async function startChallenge30D(challengeId) {
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

        // 온체인 스테이킹 (HBT 예치가 있는 경우)
        let stakeTxHash = null;
        if (hbtAmount > 0) {
            const connectedWallet = getConnectedWallet();
            if (!connectedWallet) {
                showToast('❌ 지갑이 초기화되지 않았습니다. 페이지를 새로고침해주세요.');
                return false;
            }

            const hbtContract = new ethers.Contract(
                HBT_TOKEN.testnetAddress,
                HBT_STAKE_ABI,
                connectedWallet
            );

            // raw amount: HBT * 10^decimals
            const rawAmount = ethers.utils.parseUnits(String(hbtAmount), HBT_TOKEN.decimals);

            // 온체인 잔액 확인
            const onchainBalance = await hbtContract.balanceOf(connectedWallet.address);
            if (onchainBalance.lt(rawAmount)) {
                const displayBalance = parseFloat(ethers.utils.formatUnits(onchainBalance, HBT_TOKEN.decimals));
                showToast(`❌ 온체인 HBT 잔액이 부족합니다.\n보유: ${displayBalance} HBT, 필요: ${hbtAmount} HBT\n먼저 포인트를 HBT로 변환해주세요.`);
                return false;
            }

            // ETH 잔액 확인 → 부족 시 서버에서 가스 자동 충전
            const ethBalance = await connectedWallet.provider.getBalance(connectedWallet.address);
            const MIN_GAS = ethers.utils.parseEther("0.001");
            if (ethBalance.lt(MIN_GAS)) {
                showToast('⏳ 가스(ETH) 부족 — 자동 충전 중...');
                try {
                    await prefundWalletFunction();
                    await new Promise(r => setTimeout(r, 4000));
                } catch (fundErr) {
                    console.warn('가스 충전 실패:', fundErr.message);
                    showToast('❌ 가스(tBNB) 자동 충전에 실패했습니다. 잠시 후 다시 시도해주세요.');
                    return false;
                }
            }

            showToast('⏳ 온체인 예치 트랜잭션 전송 중...');
            try {
                const tx = await hbtContract.stakeForChallenge(rawAmount);
                showToast('⏳ 블록체인 확인 대기 중...');
                const receipt = await tx.wait();
                stakeTxHash = receipt.transactionHash;
                console.log('✅ 온체인 스테이킹 완료:', stakeTxHash);
            } catch (txError) {
                console.error('❌ 온체인 스테이킹 실패:', txError);
                showToast('❌ 온체인 예치에 실패했습니다. 가스(tBNB)가 부족할 수 있습니다.');
                return false;
            }
        }

        // Cloud Function 호출 (서버에서 Firestore 챌린지 기록)
        await ensureFunctions();
        if (!startChallengeFunction) {
            showToast('❌ 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }

        const result = await startChallengeFunction({ challengeId: resolvedId, hbtAmount, stakeTxHash });
        const data = result.data;

        if (data.hbtStaked > 0) {
            showToast(`✅ ${data.duration}일 챌린지 시작!\n${data.hbtStaked} HBT 온체인 예치 완료.${data.initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n100% 달성 시 예치금 + 보너스, 80%+ 시 예치금 반환`);
        } else {
            showToast(`✅ ${data.duration}일 챌린지 시작!${data.initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n${duration}일 동안 매일 인증하면 ${challengeDef.rewardPoints}P 보상!`);
        }

        window.updateAssetDisplay && window.updateAssetDisplay(true);
        return true;

    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        const msg = error.message || '알 수 없는 오류';
        showToast(`❌ 오류: ${msg}`);
        return false;
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
export async function updateChallengeProgress() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userRef = doc(db, "users", currentUser.uid);
        const today = getKstDateString();

        // 통합 챌린지 검증을 위해 트랜잭션 전에 daily_logs 읽기 (다른 컬렉션이므로 트랜잭션 밖)
        let dailyLogData = null;
        try {
            const logDocId = `${currentUser.uid}_${today}`;
            const logSnap = await getDoc(doc(db, "daily_logs", logDocId));
            if (logSnap.exists()) dailyLogData = logSnap.data();
        } catch (_) {}

        const toastMessages = [];
        const settlementLogs = [];

        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            const userData = userSnap.data();

            // activeChallenges 수집 (legacy 마이그레이션 포함)
            let activeChallenges = userData.activeChallenges || {};
            let hadLegacy = false;
            if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
                const legacyTier = CHALLENGES[userData.activeChallenge.challengeId]?.tier || 'master';
                if (!activeChallenges[legacyTier]) {
                    activeChallenges[legacyTier] = userData.activeChallenge;
                    hadLegacy = true;
                }
            }

            const tiers = Object.keys(activeChallenges).filter(t => activeChallenges[t]?.status === 'ongoing');
            if (tiers.length === 0) return;

            const updateData = {};
            if (hadLegacy) updateData.activeChallenge = null;

            for (const tier of tiers) {
                const challenge = activeChallenges[tier];
                const totalDays = challenge.totalDays || 30;
                const completedDates = challenge.completedDates || [];
                const resolvedChallengeId = CHALLENGE_ID_MAP[challenge.challengeId] || challenge.challengeId;
                const challengeDef = CHALLENGES[resolvedChallengeId] || {};

                // 챌린지 종료일 확인 (endDate 당일 포함 — today >= endDate)
                if (today >= challenge.endDate) {
                    const successRate = challenge.completedDays / totalDays;

                    if (successRate >= 0.8) {
                        challenge.status = 'claimable';
                        updateData[`activeChallenges.${tier}`] = challenge;
                        toastMessages.push(`🎉 ${totalDays}일 챌린지 완료! 내 지갑에서 보상을 수령하세요.`);
                    } else {
                        const staked = challenge.hbtStaked || 0;
                        const stakedOnChain = challenge.stakedOnChain || false;

                        if (stakedOnChain && staked > 0) {
                            // 온체인 정산은 settleExpiredChallenges에서 CF를 통해 처리
                            // 여기서는 상태만 'expired'로 마킹하여 settleExpiredChallenges가 처리하도록 함
                            challenge.status = 'expired';
                            updateData[`activeChallenges.${tier}`] = challenge;
                            toastMessages.push(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%). 소각 정산 처리 중...`);
                        } else {
                            updateData[`activeChallenges.${tier}`] = null;
                            toastMessages.push(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).`);
                        }
                        settlementLogs.push({
                            userId: currentUser.uid,
                            type: 'challenge_settlement',
                            challengeId: challenge.challengeId,
                            amount: 0,
                            staked: staked,
                            burned: stakedOnChain ? staked / 2 : 0,
                            successRate: successRate,
                            completedDays: challenge.completedDays,
                            timestamp: serverTimestamp(),
                            status: 'failed'
                        });
                    }
                    continue;
                }

                // 중복 카운트 방지
                if (completedDates.includes(today)) {
                    console.log(`ℹ️ ${tier} 챌린지: 오늘 이미 인증 완료`);
                    continue;
                }

                // 통합 챌린지: 식단+운동+마음 모두 완수했는지 확인
                if (dailyLogData) {
                    const ap = dailyLogData.awardedPoints || {};
                    if (!ap.diet || !ap.exercise || !ap.mind) {
                        console.log(`ℹ️ 챌린지: 아직 3개 카테고리 미완수 (diet:${!!ap.diet}, exercise:${!!ap.exercise}, mind:${!!ap.mind})`);
                        continue;
                    }
                } else {
                    console.log(`ℹ️ 챌린지: 오늘 기록 없음`);
                    continue;
                }

                // 진행 중 - 오늘 날짜 기록
                completedDates.push(today);
                challenge.completedDays = completedDates.length;
                challenge.completedDates = completedDates;
                updateData[`activeChallenges.${tier}`] = challenge;

                const remain = totalDays - challenge.completedDays;
                toastMessages.push(`✅ ${challengeDef.emoji || '🏆'} ${challenge.completedDays}/${totalDays}일 (${remain}일 남음)`);
            }

            if (Object.keys(updateData).length > 0) {
                transaction.update(userRef, updateData);
            }
        });

        // 트랜잭션 완료 후 토스트 표시 & 정산 로그 저장
        toastMessages.forEach(msg => showToast(msg));
        for (const log of settlementLogs) {
            try {
                await addDoc(collection(db, "blockchain_transactions"), log);
            } catch (logErr) {
                console.warn('⚠️ 실패 정산 기록 저장 실패:', logErr.message);
            }
        }

        window.updateAssetDisplay && window.updateAssetDisplay(true);

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

        const userRef = doc(db, "users", currentUser.uid);
        // 캐시 우선 읽기 금지: 캐시의 completedDays가 실제보다 적을 경우
        // successRate < 0.8로 오판하여 실패 정산이 트리거될 수 있음
        const userSnap = await getDocFromServer(userRef);
        const userData = userSnap.data();
        const today = getKstDateString();

        const activeChallenges = userData.activeChallenges || {};
        const tiers = Object.keys(activeChallenges).filter(t =>
            activeChallenges[t]?.status === 'ongoing' || activeChallenges[t]?.status === 'expired'
        );
        if (tiers.length === 0) return;

        // 'expired'는 이미 기한 만료 확정, 'ongoing'은 endDate로 판단
        const expiredTiers = tiers.filter(t => 
            activeChallenges[t].status === 'expired' || today >= activeChallenges[t].endDate
        );
        if (expiredTiers.length === 0) return;

        const updateData = {};
        for (const tier of expiredTiers) {
            const challenge = activeChallenges[tier];
            const totalDays = challenge.totalDays || 30;
            const successRate = (challenge.completedDays || 0) / totalDays;

            if (successRate >= 0.8) {
                // 성공 → claimable 상태로 전환 (사용자가 수령)
                updateData[`activeChallenges.${tier}.status`] = 'claimable';
            } else {
                // 실패 → 온체인 resolveChallenge(user, false) 호출 (50% 소각)
                const staked = challenge.hbtStaked || 0;

                if (staked > 0) {
                    // CF를 통해 온체인 소각 처리 (CF가 Firestore 삭제도 처리)
                    try {
                        await ensureFunctions();
                        const settleFn = httpsCallable(functions, 'settleChallengeFailure');
                        const settleResult = await settleFn({ tier });
                        const refund = settleResult.data?.returned || 0;
                        const burned = settleResult.data?.burned || 0;
                        showToast(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).\n${refund} HBT 반환, ${burned} HBT 소각 (온체인)`);
                    } catch (settleErr) {
                        console.error('⚠️ 온체인 실패 정산 오류:', settleErr);
                        // CF 실패 시 클라이언트에서 제거
                        updateData[`activeChallenges.${tier}`] = deleteField();
                        showToast(`😢 ${totalDays}일 챌린지 미달성. 소각 처리 중 오류가 발생했습니다.`);
                    }
                } else {
                    updateData[`activeChallenges.${tier}`] = deleteField();
                    showToast(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).`);
                }

                try {
                    await addDoc(collection(db, "blockchain_transactions"), {
                        userId: currentUser.uid,
                        type: 'challenge_settlement',
                        challengeId: challenge.challengeId,
                        staked: staked,
                        successRate: successRate,
                        completedDays: challenge.completedDays || 0,
                        timestamp: serverTimestamp(),
                        status: 'failed'
                    });
                } catch (logErr) {
                    console.warn('⚠️ 실패 정산 기록 저장 실패:', logErr.message);
                }
            }
        }

        if (Object.keys(updateData).length > 0) {
            await updateDoc(userRef, updateData);
        }
    } catch (error) {
        console.warn('⚠️ 만료 챌린지 처리 오류:', error.message);
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
        showToast(`🎉 보상 수령 완료! ${resultParts.join(' ')}`);

        if (window.updateAssetDisplay) window.updateAssetDisplay(true);
        // 챌린지 카드 UI 갱신 (카드가 그대로 남아 재시도 방지)
        if (window.loadDashboard) setTimeout(() => window.loadDashboard(), 500);
        return true;
    } catch (error) {
        console.error('❌ 보상 수령 오류:', error);
        const code = error?.code;
        const msg = code === 'failed-precondition'
            ? '❌ 이미 처리된 챌린지이거나 보상 조건이 맞지 않습니다.'
            : code === 'internal'
            ? '❌ 온체인 정산에 실패했습니다. 잠시 후 다시 시도해주세요.'
            : code === 'unauthenticated'
            ? '❌ 로그인이 필요합니다.'
            : `❌ 보상 수령에 실패했습니다. (${code || error?.message || '알 수 없는 오류'})`;
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

        // 온체인 스테이킹이 있는 경우 CF를 통해 소각 처리
        if (stakedOnChain && staked > 0) {
            try {
                showToast('⏳ 온체인 정산 중...');
                await ensureFunctions();
                const settleFn = httpsCallable(functions, 'settleChallengeFailure');
                const settleResult = await settleFn({ tier });
                const burned = settleResult.data?.burned || 0;
                const returned = settleResult.data?.returned || 0;
                showToast(`🏳️ 챌린지 포기.\n${returned} HBT 반환, ${burned} HBT 소각 (온체인)`);
            } catch (settleErr) {
                console.error('⚠️ 온체인 포기 정산 오류:', settleErr);
                showToast('❌ 온체인 정산에 실패했습니다. 다시 시도해주세요.');
                return false;
            }
        } else {
            const updateData = {};
            updateData[`activeChallenges.${tier}`] = deleteField();
            await updateDoc(userRef, updateData);

            // 정산 기록 저장
            try {
                await addDoc(collection(db, "blockchain_transactions"), {
                    userId: currentUser.uid,
                    type: 'challenge_settlement',
                    challengeId: challenge.challengeId,
                    amount: 0,
                    staked: staked,
                    successRate: (challenge.completedDays || 0) / (challenge.totalDays || 1),
                    completedDays: challenge.completedDays || 0,
                    timestamp: serverTimestamp(),
                    status: 'forfeit'
                });
            } catch (logErr) {
                console.warn('⚠️ 포기 기록 저장 실패:', logErr.message);
            }

            showToast('🏳️ 챌린지를 포기했습니다.');
        }
        if (window.updateAssetDisplay) window.updateAssetDisplay(true);
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
export async function fetchOnchainBalance() {
    try {
        await ensureFunctions();
        const currentUser = auth.currentUser;
        if (!currentUser || !getOnchainBalanceFunction) return null;

        const result = await getOnchainBalanceFunction();
        return result.data;
    } catch (error) {
        console.error('⚠️ 온체인 잔액 조회 오류:', error);
        return null;
    }
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
    const copyBtn = document.querySelector('.wallet-addr-btn[onclick*="copyWallet"]');
    const explorerBtn = document.querySelector('.wallet-addr-btn[onclick*="openWalletExplorer"]');
    const metaMaskBtn = document.getElementById('wallet-connect-metamask-btn');
    const trustBtn = document.getElementById('wallet-connect-trust-btn');
    const walletConnectBtn = document.getElementById('wallet-connect-walletconnect-btn');
    const disconnectBtn = document.getElementById('wallet-disconnect-btn');

    let status = '외부 지갑을 연결하세요';
    let sub = 'MetaMask 또는 Trust Wallet을 연결하면 HBT를 직접 보관할 수 있어요.';

    if (externalWalletAddress && externalWalletProvider) {
        status = `${getWalletProviderLabelSafe(externalWalletProviderType)} 연결됨`;
        sub = '지갑에서 직접 보관하고 챌린지를 시작할 수 있어요.';
    } else if (externalWalletAddress) {
        status = '외부 지갑 주소 연결됨';
        sub = `${getWalletProviderLabelSafe(externalWalletProviderType)}을 다시 연결하면 챌린지를 시작할 수 있어요.`;
    } else if (userWallet) {
        status = '앱 지갑 사용 중';
        sub = '기존 앱 지갑 주소입니다. 외부 지갑 연결로 전환할 수 있어요.';
    } else if (userWalletAddress) {
        status = '기존 지갑 주소만 있어요';
        sub = '외부 지갑을 연결하면 직접 보관과 챌린지가 가능해요.';
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

    const hasAddress = !!effectiveAddress;
    [copyBtn, explorerBtn].forEach(button => {
        if (!button) return;
        button.disabled = !hasAddress;
    });

    if (metaMaskBtn) metaMaskBtn.disabled = !!externalWalletAddress && externalWalletProviderType === 'metamask' && !!externalWalletProvider;
    if (trustBtn) trustBtn.disabled = !!externalWalletAddress && externalWalletProviderType === 'trustwallet' && !!externalWalletProvider;
    if (walletConnectBtn) walletConnectBtn.disabled = false;
    if (disconnectBtn) disconnectBtn.disabled = !externalWalletAddress;
    syncLegacyWalletExportUi();
}

export async function initializeWalletExternalFirst() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 초기화 중단.');
            return null;
        }

        externalWalletAddress = null;
        externalWalletProviderType = null;
        externalWalletChainId = null;
        externalWalletProvider = null;
        externalWalletWeb3Provider = null;
        userWallet = null;
        userWalletAddress = null;

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data() || {};
        updateLegacyWalletExportState(userData);

        await ensureUserReferralCode(userRef, userData).catch(() => {});

        if (userData.externalWalletAddress) {
            externalWalletAddress = userData.externalWalletAddress;
            externalWalletProviderType = userData.walletProviderType || null;
            externalWalletChainId = userData.walletChainId || null;
            await reconnectStoredExternalWallet({
                preferredType: externalWalletProviderType,
                expectedAddress: externalWalletAddress
            });
        }

        if (!externalWalletAddress && userData?.walletVersion === 2 && userData?.encryptedKey && userData?.walletIv) {
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
        } else if (!externalWalletAddress && userData?.walletAddress) {
            userWalletAddress = userData.walletAddress;
        }

        refreshWalletUi(getEffectiveWalletAddress());
        return getEffectiveWalletAddress();
    } catch (error) {
        console.error('❌ 외부 지갑 우선 초기화 오류:', error);
        refreshWalletUi(null);
        return null;
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

        let stakeTxHash = null;
        if (hbtAmount > 0) {
            const connectedWallet = await getConnectedWallet();
            if (!connectedWallet) {
                showToast(externalWalletAddress
                    ? '❌ 외부 지갑을 다시 연결한 뒤 챌린지를 시작해 주세요.'
                    : '❌ MetaMask 또는 Trust Wallet을 연결해 주세요.');
                return false;
            }

            const hbtContract = new ethers.Contract(
                HBT_TOKEN.testnetAddress,
                HBT_STAKE_ABI,
                connectedWallet.signer
            );

            const rawAmount = ethers.utils.parseUnits(String(hbtAmount), HBT_TOKEN.decimals);
            const onchainBalance = await hbtContract.balanceOf(connectedWallet.address);
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
                    showToast('❌ 가스(tBNB) 자동 충전에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
                    return false;
                }
            }

            showToast('🔐 온체인 예치 트랜잭션 전송 중...');
            try {
                const tx = await hbtContract.stakeForChallenge(rawAmount);
                showToast('⏳ 블록체인 확인 대기 중...');
                const receipt = await tx.wait();
                stakeTxHash = receipt.transactionHash;
            } catch (error) {
                console.error('❌ 온체인 예치 실패:', error);
                showToast('❌ 온체인 예치에 실패했어요. 가스(tBNB)와 지갑 연결을 확인해 주세요.');
                return false;
            }
        }

        await ensureFunctions();
        if (!startChallengeFunction) {
            showToast('❌ 서버 연결에 실패했어요. 잠시 뒤 다시 시도해 주세요.');
            return false;
        }

        const result = await startChallengeFunction({ challengeId: resolvedId, hbtAmount, stakeTxHash });
        const data = result.data;

        if (data.hbtStaked > 0) {
            showToast(`✅ ${data.duration}일 챌린지 시작! ${data.hbtStaked} HBT 예치 완료`);
        } else {
            showToast(`✅ ${data.duration}일 챌린지 시작! ${challengeDef.rewardPoints}P 보상 도전`);
        }

        if (window.updateAssetDisplay) window.updateAssetDisplay(true);
        return true;
    } catch (error) {
        console.error('❌ 외부 지갑 챌린지 시작 오류:', error);
        const msg = error.message || '알 수 없는 오류';
        showToast(`❌ 오류: ${msg}`);
        return false;
    }
}

export function getWalletAddressForUI() {
    return getEffectiveWalletAddress();
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

export async function connectMetaMaskWallet() {
    return connectInjectedWallet('metamask');
}

export async function connectTrustWallet() {
    return connectInjectedWallet('trustwallet');
}

export function openWalletConnectGuide() {
    showToast('WalletConnect는 본서버 적용 전에 projectId 설정 후 활성화할게요. 지금은 MetaMask 또는 Trust Wallet 연결을 사용해 주세요.');
}

/**
 * 지갑 연결 해제
 */
export function disconnectWallet() {
    userWallet = null;
    userWalletAddress = null;
    console.log('✅ 지갑이 연결 해제되었습니다.');
}

console.log('✅ 블록체인 매니저 로드됨. (내장형 지갑, HBT, Staking)');
