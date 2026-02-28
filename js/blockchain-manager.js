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

/**
 * Firebase UID로부터 deterministic 지갑 생성
 * @param {string} uid - Firebase 사용자 UID
 * @returns {Object} { address, wallet }
 */
async function generateWalletFromUID(uid) {
    try {
        // UID를 해시하여 32바이트 개인키 생성 (deterministic)
        // 주의: 프로덕션에서는 더 강력한 암호화 필요 (KMS 사용 권장)
        const encoder = new TextEncoder();
        const data = encoder.encode(uid + '_habitschool_secret_2024'); // salt 추가
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const privateKeyHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // ethers.js로 지갑 생성
        const wallet = new ethers.Wallet(privateKeyHex);
        
        console.log('✅ 지갑 생성됨:', wallet.address.substring(0, 10) + '...');
        
        return {
            address: wallet.address,
            wallet: wallet
        };
    } catch (error) {
        console.error('❌ 지갑 생성 오류:', error);
        throw error;
    }
}

/**
 * 사용자 지갑 초기화 (로그인 시 자동 호출)
 * @returns {string} 지갑 주소
 */
export async function initializeUserWallet() {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            console.warn('⚠️ 로그인되지 않음. 지갑 생성 불가.');
            return null;
        }

        // 1. Firebase에서 기존 지갑 주소 확인
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();

        if (userData && userData.walletAddress) {
            // 기존 지갑 주소가 있으면 재사용
            console.log('✅ 기존 지갑 복원:', userData.walletAddress.substring(0, 10) + '...');
            
            // 지갑 객체 재생성
            const result = await generateWalletFromUID(currentUser.uid);
            userWallet = result.wallet;
            userWalletAddress = result.address;
            
            // UI 업데이트
            updateWalletUI(userWalletAddress);
            
            return userWalletAddress;
        }

        // 2. 새 지갑 생성
        console.log('🆕 새 지갑 생성 중...');
        const result = await generateWalletFromUID(currentUser.uid);
        userWallet = result.wallet;
        userWalletAddress = result.address;

        // 3. Firebase에 지갑 주소 저장
        await updateDoc(userRef, {
            walletAddress: userWalletAddress,
            walletCreatedAt: serverTimestamp()
        });

        console.log('✅ 지갑 주소 저장됨:', userWalletAddress.substring(0, 10) + '...');
        
        // UI 업데이트
        updateWalletUI(userWalletAddress);
        showToast('✅ 내 지갑이 생성되었습니다!');

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

        if (pointAmount % 1000 !== 0) {
            showToast('❌ 1000P 단위로만 변환 가능합니다.');
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
        
        // 4. Firebase 업데이트 (현재는 시뮬레이션, 향후 실제 스마트 컨트랙트 연동)
        await updateDoc(userRef, {
            coins: increment(-pointAmount), // 포인트 차감
            hbtBalance: increment(hbtAmount), // HBT 추가
            totalHbtEarned: increment(hbtAmount)
        });

        // 5. 변환 기록 저장
        await addDoc(collection(db, "blockchain_transactions"), {
            userId: currentUser.uid,
            type: 'conversion',
            pointsUsed: pointAmount,
            hbtReceived: hbtAmount,
            timestamp: serverTimestamp(),
            status: 'success',
            walletAddress: userWalletAddress,
            txHash: 'simulated_' + Date.now() // 임시 (향후 실제 트랜잭션 해시로 대체)
        });

        showToast(`✅ ${pointAmount}P를 ${hbtAmount} HBT로 변환했습니다!`);
        
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
 * HBT를 스테이킹 컨트랙트에 예치
 */
export async function startChallenge30D(challengeId, hbtAmount = 1) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast('❌ 로그인이 필요합니다.');
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
            hbtStaked: hbtAmount,
            status: 'ongoing',
            rewardHbt: hbtAmount * 1.05, // 5% 이자
            rewardPoints: 50
        };

        // 5. Firebase 업데이트
        await updateDoc(userRef, {
            activeChallenge: challengeData,
            hbtBalance: increment(-hbtAmount) // HBT 차감
        });

        // 6. 거래 기록 저장
        await addDoc(collection(db, "blockchain_transactions"), {
            userId: currentUser.uid,
            type: 'staking',
            challengeId: challengeId,
            amount: hbtAmount,
            timestamp: serverTimestamp(),
            status: 'success',
            walletAddress: userWalletAddress
        });

        showToast(`✅ 챌린지 시작!\n${hbtAmount} HBT를 예치했습니다.\n30일 동안 화이팅!`);
        
        // UI 업데이트
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

        // 오늘 로그 확인
        const today = getKstDateString();
        const dailyLogsRef = collection(db, "users", currentUser.uid, "daily_logs");
        
        // 간단히 completedDays를 증가 (실제로는 daily_logs에서 확인)
        // 실제 구현에서는 daily_logs를 쿼리해서 챌린지 타입과 일치하는지 확인
        
        const matchesChallenge = true; // 향후 로직 추가
        
        if (matchesChallenge) {
            challenge.completedDays += 1;

            // 30일 완료 확인
            if (challenge.completedDays >= 30) {
                challenge.status = 'completed';
                
                // 보상 지급
                await updateDoc(userRef, {
                    activeChallenge: null,
                    hbtBalance: increment(challenge.rewardHbt),
                    coins: increment(challenge.rewardPoints),
                    completedChallenges: firebase.firestore.FieldValue.arrayUnion(challenge)
                });

                showToast(`🎉 챌린지 완료!\n${challenge.rewardHbt} HBT + ${challenge.rewardPoints}P 받았습니다!`);
            } else {
                // 진행 중 업데이트
                await updateDoc(userRef, {
                    activeChallenge: challenge
                });

                const remainDays = 30 - challenge.completedDays;
                showToast(`✅ 챌린지 진행: ${challenge.completedDays}/30일 (${remainDays}일 남음)`);
            }
        }

    } catch (error) {
        console.error('⚠️ 챌린지 진행도 업데이트 오류:', error);
        // 에러가 발생해도 앱 작동을 방해하지 않음
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
