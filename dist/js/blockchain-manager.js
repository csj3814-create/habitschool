/**
 * blockchain-manager.js
 * Base 체인 블록체인 & 내장형 지갑 통합 모듈
 * HaBit (HBT) 토큰 거래, 스테이킹, 챌린지 관리
 * 
 * 내장형 지갑 전략: Firebase UID 기반 지갑 자동 생성
 * - 사용자가 로그인만 하면 자동으로 지갑 생성
 * - 별도 앱 설치나 복잡한 설정 불필요
 * - ethers.js를 사용하여 Base 체인 호환 지갑 생성
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

import { auth, db, app } from './firebase-config.js';
import { doc, updateDoc, setDoc, getDoc, collection, addDoc, serverTimestamp, increment, runTransaction } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showToast } from './ui-helpers.js';
import { getKstDateString } from './ui-helpers.js';
import { checkRateLimit } from './security.js';

// Cloud Function 참조 (lazy 초기화 — import 실패해도 모듈 로드에 영향 없음)
let mintHBTFunction = null;
let getOnchainBalanceFunction = null;
let getTokenStatsFunction = null;
let claimChallengeFunction = null;
let startChallengeFunction = null;
let _functionsInitialized = false;

async function ensureFunctions() {
    if (_functionsInitialized) return;
    try {
        const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
        const functions = getFunctions(app, 'asia-northeast3');
        
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            connectFunctionsEmulator(functions, 'localhost', 5001);
            console.log('🛠️ Functions 에뮬레이터 연결');
        }
        
        mintHBTFunction = httpsCallable(functions, 'mintHBT');
        getOnchainBalanceFunction = httpsCallable(functions, 'getOnchainBalance');
        getTokenStatsFunction = httpsCallable(functions, 'getTokenStats');
        startChallengeFunction = httpsCallable(functions, 'startChallenge');
        _functionsInitialized = true;
        console.log('✅ Cloud Functions 초기화 완료');
    } catch (e) {
        console.error('⚠️ Cloud Functions 초기화 실패:', e.message);
    }
}

let userWallet = null; // ethers.Wallet 인스턴스
let userWalletAddress = null; // 0x... 주소

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
                return userWalletAddress;
            } catch (e) {
                console.error('⚠️ v2 지갑 복호화 실패:', e);
                // 주소만이라도 표시
                userWalletAddress = userData.walletAddress;
                updateWalletUI(userWalletAddress);
                return userWalletAddress;
            }
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

            await updateDoc(userRef, {
                walletAddress: userWalletAddress,
                walletCreatedAt: serverTimestamp(),
                encryptedKey: encrypted,
                walletIv: iv,
                walletVersion: 2,
                oldWalletAddress: userData.walletAddress // 기존 주소 백업
            });

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

        await setDoc(userRef, {
            walletAddress: userWalletAddress,
            walletCreatedAt: serverTimestamp(),
            encryptedKey: encrypted,
            walletIv: iv,
            walletVersion: 2
        }, { merge: true });

        console.log('✅ v2 지갑 생성 완료:', userWalletAddress.substring(0, 10) + '...');
        updateWalletUI(userWalletAddress);
        showToast('✅ 보안 지갑이 생성되었습니다!');
        return userWalletAddress;

    } catch (error) {
        console.error('❌ 지갑 초기화 오류:', error);
        showToast('⚠️ 지갑 생성 중 오류 발생. 다시 시도해주세요.');
        return null;
    }
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

        if (window.updateAssetDisplay) await window.updateAssetDisplay();
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
 * - 7일: 소량 HBT 예치, 포인트 보상
 * - 30일: HBT 예치, 80%+ 원금 환급, 100% +20% 보너스
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
            // 소수점 2자리까지만 허용
            if (Math.round(hbtAmount * 100) !== hbtAmount * 100) {
                showToast('❌ HBT는 소수점 2자리까지만 입력 가능합니다.');
                return false;
            }
            // 최대 예치량 제한
            if (hbtAmount > maxStake) {
                showToast(`❌ 최대 ${maxStake} HBT까지만 예치 가능합니다.`);
                return false;
            }
        }

        showToast(`⏳ ${duration}일 챌린지 시작 중...`);

        // Cloud Function 호출 (서버에서 HBT 차감 + 챌린지 생성)
        await ensureFunctions();
        if (!startChallengeFunction) {
            showToast('❌ 서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }

        const result = await startChallengeFunction({ challengeId: resolvedId, hbtAmount });
        const data = result.data;

        if (data.hbtStaked > 0) {
            showToast(`✅ ${data.duration}일 챌린지 시작!\n${data.hbtStaked} HBT 예치 완료.${data.initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n100% 달성 시 예치금 + 보너스, 80%+ 시 예치금 반환`);
        } else {
            showToast(`✅ ${data.duration}일 챌린지 시작!${data.initialCompletedDays > 0 ? '\n📌 오늘 인증분 1일 반영!' : ''}\n${duration}일 동안 매일 인증하면 ${challengeDef.rewardPoints}P 보상!`);
        }

        window.updateAssetDisplay && window.updateAssetDisplay();
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

                // 챌린지 종료일 확인
                if (today > challenge.endDate) {
                    const successRate = challenge.completedDays / totalDays;

                    if (successRate >= 0.8) {
                        challenge.status = 'claimable';
                        updateData[`activeChallenges.${tier}`] = challenge;
                        toastMessages.push(`🎉 ${totalDays}일 챌린지 완료! 내 지갑에서 보상을 수령하세요.`);
                    } else {
                        const staked = challenge.hbtStaked || 0;
                        const refund = Math.floor(staked * 0.5);
                        updateData[`activeChallenges.${tier}`] = null;
                        if (refund > 0) {
                            updateData.hbtBalance = increment(refund);
                        }
                        toastMessages.push(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).${staked > 0 ? `\n${refund} HBT 반환, ${staked - refund} HBT 소각` : ''}`);
                        settlementLogs.push({
                            userId: currentUser.uid,
                            type: 'challenge_settlement',
                            challengeId: challenge.challengeId,
                            amount: refund,
                            staked: staked,
                            burned: staked - refund,
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

        window.updateAssetDisplay && window.updateAssetDisplay();

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
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const today = getKstDateString();

        const activeChallenges = userData.activeChallenges || {};
        const tiers = Object.keys(activeChallenges).filter(t => 
            activeChallenges[t]?.status === 'ongoing'
        );
        if (tiers.length === 0) return;

        const expiredTiers = tiers.filter(t => today > activeChallenges[t].endDate);
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
                // 실패 → 50% 반환, 50% 소각
                const staked = challenge.hbtStaked || 0;
                const refund = Math.floor(staked * 0.5);
                updateData[`activeChallenges.${tier}`] = null;
                if (refund > 0) {
                    updateData.hbtBalance = increment(refund);
                }
                showToast(`😢 ${totalDays}일 챌린지 미달성 (${Math.round(successRate*100)}%).${staked > 0 ? `\n${refund} HBT 반환, ${staked - refund} HBT 소각` : ''}`);

                try {
                    await addDoc(collection(db, "blockchain_transactions"), {
                        userId: currentUser.uid,
                        type: 'challenge_settlement',
                        challengeId: challenge.challengeId,
                        amount: refund,
                        staked: staked,
                        burned: staked - refund,
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
            const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
            const functions = getFunctions(app, 'asia-northeast3');
            claimChallengeFunction = httpsCallable(functions, 'claimChallengeReward');
        }

        const result = await claimChallengeFunction({ tier });
        const data = result.data;

        let resultParts = [];
        if (data.rewardHbt > 0) resultParts.push(`+${data.rewardHbt} HBT`);
        if (data.rewardPoints > 0) resultParts.push(`+${data.rewardPoints}P`);
        showToast(`🎉 보상 수령 완료! ${resultParts.join(' ')}`);

        if (window.updateAssetDisplay) window.updateAssetDisplay();
        return true;
    } catch (error) {
        console.error('❌ 보상 수령 오류:', error);
        showToast('❌ 보상 수령에 실패했습니다. 다시 시도해주세요.');
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
        const msg = staked > 0
            ? `⚠️ 포기하면 예치한 ${staked} HBT가 소멸됩니다.\n정말 포기하시겠습니까?`
            : '정말 이 챌린지를 포기하시겠습니까?';

        if (!confirm(msg)) return false;

        const updateData = {};
        updateData[`activeChallenges.${tier}`] = null;

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
        if (window.updateAssetDisplay) window.updateAssetDisplay();
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

/**
 * 지갑 연결 해제
 */
export function disconnectWallet() {
    userWallet = null;
    userWalletAddress = null;
    console.log('✅ 지갑이 연결 해제되었습니다.');
}

console.log('✅ 블록체인 매니저 로드됨. (내장형 지갑, HBT, Staking)');
