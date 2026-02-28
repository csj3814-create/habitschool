/**
 * blockchain-manager.js
 * 클레이튼 블록체인 & 내장형 지갑 통합 모듈
 * HBT 토큰 거래, 스테이킹, 챌린지 관리
 * 
 * 내장형 지갑 전략: Firebase UID 기반 지갑 자동 생성
 * - 사용자가 로그인만 하면 자동으로 지갑 생성
 * - 별도 앱 설치나 복잡한 설정 불필요
 * - ethers.js를 사용하여 Klaytn 호환 지갑 생성
 */

import { 
    KLAYTN_CONFIG, 
    HBT_TOKEN, 
    STAKING_CONTRACT, 
    CONVERSION_RULES 
} from './blockchain-config.js';

import { auth, db } from './firebase-config.js';
import { doc, updateDoc, getDoc, collection, addDoc, serverTimestamp, increment } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { showToast } from './ui-helpers.js';
import { getKstDateString } from './ui-helpers.js';

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

        await updateDoc(userRef, {
            walletAddress: userWalletAddress,
            walletCreatedAt: serverTimestamp(),
            encryptedKey: encrypted,
            walletIv: iv,
            walletVersion: 2
        });

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
        walletDisplay.textContent = address.substring(0, 6) + '...' + address.substring(address.length - 4);
        walletDisplay.style.color = '#2E7D32';
    }
}

/**
 * 포인트를 HBT 토큰으로 변환
 * 1000P → 1 HBT
 */
export async function convertPointsToHBT() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        // 입력값 가져오기
        const pointInput = document.getElementById('conversion-points');
        const pointAmount = parseInt(pointInput?.value || 0);

        if (pointAmount < CONVERSION_RULES.minConversion) {
            showToast(`❌ 최소 ${CONVERSION_RULES.minConversion}P 이상 필요합니다.`);
            return false;
        }

        if (pointAmount % 100 !== 0) {
            showToast('❌ 100P 단위로만 변환 가능합니다.');
            return false;
        }

        // 1. 포인트 잔액 확인
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        if ((userData.coins || 0) < pointAmount) {
            showToast(`❌ 포인트가 부족합니다.\n필요: ${pointAmount}P, 보유: ${userData.coins || 0}P`);
            return false;
        }

        // 2. 지갑 확인
        if (!userWalletAddress) {
            showToast('⚠️ 지갑을 찾을 수 없습니다. 다시 로그인해주세요.');
            return false;
        }

        showToast('⏳ HBT 변환 중입니다... (약 2-5초)');

        // 3. HBT 계산
        const hbtAmount = pointAmount / CONVERSION_RULES.pointsPerConversion;
        
        // 4. Firebase 업데이트 (포인트 차감 + HBT 추가)
        await updateDoc(userRef, {
            coins: increment(-pointAmount),
            hbtBalance: increment(hbtAmount),
            totalHbtEarned: increment(hbtAmount)
        });

        showToast(`✅ ${pointAmount}P를 ${hbtAmount} HBT로 변환했습니다!`);

        // 5. 변환 기록 저장 (실패해도 변환 자체는 이미 완료)
        try {
            await addDoc(collection(db, "blockchain_transactions"), {
                userId: currentUser.uid,
                type: 'conversion',
                pointsUsed: pointAmount,
                hbtReceived: hbtAmount,
                timestamp: serverTimestamp(),
                status: 'success',
                walletAddress: userWalletAddress,
                txHash: 'simulated_' + Date.now()
            });
        } catch (logErr) {
            console.warn('⚠️ 변환 기록 저장 실패 (변환은 완료됨):', logErr.message);
        }
        
        // UI 업데이트
        if (pointInput) pointInput.value = '';
        const hbtInput = document.getElementById('conversion-hbt');
        if (hbtInput) hbtInput.value = '';

        // 자산 표시 업데이트
        window.updateAssetDisplay && window.updateAssetDisplay();

        return true;

    } catch (error) {
        console.error('❌ 변환 오류:', error);
        showToast(`❌ 변환 실패: ${error.message}`);
        return false;
    }
}

/**
 * 30일 챌린지 시작
 * 원하는 만큼 HBT를 예치 (유연한 스테이킹)
 * 보상: 80%+ 성공 → 원금 환급, 100% 성공 → 원금 + 20% 보너스
 * 80% 미만 → 예치금 소멸
 */
export async function startChallenge30D(challengeId) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        // 예치 금액 입력값 가져오기
        const stakeInput = document.getElementById('challenge-stake-amount');
        const hbtAmount = parseFloat(stakeInput?.value || 0);

        if (!hbtAmount || hbtAmount < 1) {
            showToast('❌ 최소 1 HBT 이상 예치해야 합니다.');
            return false;
        }

        // 1. HBT 보유량 확인
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        if ((userData.hbtBalance || 0) < hbtAmount) {
            showToast(`❌ HBT가 부족합니다.\n필요: ${hbtAmount} HBT, 보유: ${userData.hbtBalance || 0} HBT`);
            return false;
        }

        // 2. 이미 진행 중인 챌린지 확인
        if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
            showToast('⚠️ 이미 진행 중인 챌린지가 있습니다.');
            return false;
        }

        // 3. 지갑 확인
        if (!userWalletAddress) {
            showToast('⚠️ 지갑을 찾을 수 없습니다. 다시 로그인해주세요.');
            return false;
        }

        showToast('⏳ 챌린지 시작 중...');

        // 4. 챌린지 데이터 생성
        const startDate = getKstDateString();
        const endDateObj = new Date(startDate);
        endDateObj.setDate(endDateObj.getDate() + 30);
        const endDate = endDateObj.toISOString().split('T')[0];

        const challengeData = {
            challengeId: challengeId,
            startDate: startDate,
            endDate: endDate,
            completedDays: 0,
            completedDates: [], // 인증 완료 날짜 배열 (중복 방지)
            totalDays: 30,
            hbtStaked: hbtAmount,
            status: 'ongoing'
        };

        // 5. Firebase 업데이트
        await updateDoc(userRef, {
            activeChallenge: challengeData,
            hbtBalance: increment(-hbtAmount)
        });

        showToast(`✅ 챌린지 시작!\n${hbtAmount} HBT 예치 완료.\n80%+ 달성 시 원금 환급, 100% 달성 시 +20% 보너스!`);

        // 6. 거래 기록 저장 (실패해도 챌린지 시작은 이미 완료)
        try {
            await addDoc(collection(db, "blockchain_transactions"), {
                userId: currentUser.uid,
                type: 'staking',
                challengeId: challengeId,
                amount: hbtAmount,
                timestamp: serverTimestamp(),
                status: 'success',
                walletAddress: userWalletAddress
            });
        } catch (logErr) {
            console.warn('⚠️ 거래 기록 저장 실패 (챌린지 시작은 완료됨):', logErr.message);
        }
        
        window.updateAssetDisplay && window.updateAssetDisplay();
        return true;

    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        showToast(`❌ 오류: ${error.message}`);
        return false;
    }
}

/**
 * 일일 인증 시 챌린지 진행도 업데이트
 * 30일 종료 시 보상 규칙:
 * - 성공률 80% 이상 (24일+): 원금 환급
 * - 성공률 100% (30일): 원금 + 20% 보너스
 * - 성공률 80% 미만: 예치금 소멸
 */
export async function updateChallengeProgress() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        const challenge = userData.activeChallenge;
        if (!challenge || challenge.status !== 'ongoing') return;

        // 오늘 날짜 확인
        const today = getKstDateString();

        // ===== 중복 카운트 방지: 같은 날 여러 번 저장해도 1회만 인정 =====
        const completedDates = challenge.completedDates || [];
        if (completedDates.includes(today)) {
            console.log('ℹ️ 오늘 이미 챌린지 인증 완료');
            return; // 같은 날 중복 카운트 방지
        }

        // 챌린지 종료일 확인
        if (today > challenge.endDate) {
            // 챌린지 기간 종료 → 정산
            const successRate = challenge.completedDays / (challenge.totalDays || 30);
            const staked = challenge.hbtStaked || 0;
            let rewardHbt = 0;
            let rewardPoints = 0;
            let resultMsg = '';

            if (successRate >= 1.0) {
                // 100% 성공: 원금 + 20% 보너스
                rewardHbt = staked * 1.2;
                rewardPoints = 100;
                resultMsg = `🎉 챌린지 완벽 달성! ${rewardHbt} HBT + ${rewardPoints}P 획득!`;
            } else if (successRate >= 0.8) {
                // 80% 이상: 원금 환급
                rewardHbt = staked;
                rewardPoints = 50;
                resultMsg = `✅ 챌린지 성공! ${Math.round(successRate*100)}% 달성. 원금 ${rewardHbt} HBT 환급 + ${rewardPoints}P!`;
            } else {
                // 80% 미만: 예치금 소멸
                rewardHbt = 0;
                rewardPoints = 0;
                resultMsg = `😢 챌린지 미달성 (${Math.round(successRate*100)}%). 예치금 ${staked} HBT가 소멸되었습니다.`;
            }

            const updateData = {
                activeChallenge: null
            };
            if (rewardHbt > 0) updateData.hbtBalance = increment(rewardHbt);
            if (rewardPoints > 0) updateData.coins = increment(rewardPoints);

            await updateDoc(userRef, updateData);

            // 기록 저장 (실패해도 정산은 이미 완료)
            try {
                await addDoc(collection(db, "blockchain_transactions"), {
                    userId: currentUser.uid,
                    type: 'challenge_settlement',
                    challengeId: challenge.challengeId,
                    amount: rewardHbt,
                    staked: staked,
                    successRate: successRate,
                    completedDays: challenge.completedDays,
                    timestamp: serverTimestamp(),
                    status: successRate >= 0.8 ? 'success' : 'failed'
                });
            } catch (logErr) {
                console.warn('⚠️ 정산 기록 저장 실패:', logErr.message);
            }

            showToast(resultMsg);
            window.updateAssetDisplay && window.updateAssetDisplay();
            return;
        }

        // 진행 중 - 오늘 날짜 기록 + completedDays 증가
        completedDates.push(today);
        challenge.completedDays = completedDates.length; // 배열 길이 = 실제 인증일수
        challenge.completedDates = completedDates;

        await updateDoc(userRef, {
            activeChallenge: challenge
        });

        const remain = (challenge.totalDays || 30) - challenge.completedDays;
        showToast(`✅ 챌린지 ${challenge.completedDays}/${challenge.totalDays || 30}일 (${remain}일 남음)`);

    } catch (error) {
        console.error('⚠️ 챌린지 진행도 업데이트 오류:', error);
    }
}

/**
 * 현재 지갑 주소 반환
 */
export function getWalletAddress() {
    return userWalletAddress;
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
