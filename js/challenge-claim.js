/**
 * 챌린지 보상 수령.
 *
 * 예전에는 blockchain-manager 안에만 있었다. 그런데 이 동작은 Cloud Function 하나를
 * 부르는 게 전부다 — ethers도, 지갑 서명도, 온체인 호출도 쓰지 않는다.
 * 그 결과 라이트(플레이) 모드에서는 블록체인 모듈을 아예 안 불러오므로
 * window.claimChallengeReward 가 undefined 로 남았고, 완주한 무료 3일 챌린지의
 * '탭하여 보상 수령'을 눌러도 아무 일도 일어나지 않았다.
 *
 * 그래서 모듈을 따로 뺐다. 라이트 모드에서도 그대로 쓸 수 있고,
 * blockchain-manager 는 이 함수를 그대로 부른다(구현이 두 벌이 되지 않게).
 */

import { auth, functions } from './firebase-config.js?v=303';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast, hideToast } from './ui-helpers.js?v=303';

let claimChallengeFunction = null;
const _claimInFlight = new Set();

// 온체인 정산이 걸린 유료 티어는 오래 걸리지만, 무료 미니 챌린지는 포인트만 주므로
// 금방 끝난다. 같은 문구로 '블록체인에서 발행 중'이라고 하면 라이트 모드에서는 거짓말이 된다.
function isOnchainTier(tier) {
    return tier !== 'mini';
}

export async function claimChallengeReward(tier) {
    // 온체인 정산은 30초~1분 걸려 사용자가 카드를 여러 번 누르기 쉽다. 중복 실행 차단
    // (서버에도 원자적 잠금이 있지만 UI에서도 막아 토스트 겹침·혼란을 없앤다).
    if (_claimInFlight.has(tier)) return false;
    _claimInFlight.add(tier);

    const onchain = isOnchainTier(tier);
    let elapsed = 0;
    let progressTimer = null;
    if (onchain) {
        progressTimer = setInterval(() => {
            elapsed += 1;
            showToast(`⏳ 블록체인에서 보상을 발행하고 있어요… (${elapsed}초 / 보통 30초~1분)\n창을 닫지 말고 잠시만 기다려 주세요.`, { durationMs: 0 });
        }, 1000);
    }
    const stopProgress = () => { if (progressTimer) clearInterval(progressTimer); };

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            stopProgress();
            hideToast();
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        showToast(onchain
            ? '⏳ 보상을 발행하고 있어요… 보통 30초~1분 걸려요.'
            : '⏳ 보상을 받는 중이에요…', { durationMs: 0 });

        // Cloud Function lazy init
        if (!claimChallengeFunction) {
            claimChallengeFunction = httpsCallable(functions, 'claimChallengeReward');
        }

        const result = await claimChallengeFunction({ tier });
        const data = result.data;
        stopProgress();

        const resultParts = [];
        if (data.rewardHbt > 0) resultParts.push(`+${data.rewardHbt} HBT`);
        if (data.rewardPoints > 0) resultParts.push(`+${data.rewardPoints}P`);
        const policySuffix = data.bonusRateLabel ? ` (보너스 ${data.bonusRateLabel})` : '';
        showToast(`🎉 보상 수령 완료! ${resultParts.join(' ')}${policySuffix}`);

        window.applyOptimisticChallengeSettlement?.(data);
        // 자산 화면은 라이트 모드에 없다. 있을 때만 갱신한다.
        if (window.updateAssetDisplay) {
            await window.updateAssetDisplay(true).catch(error => {
                console.warn('[challenge] asset refresh skipped after claim:', error?.message || error);
            });
        }
        // 챌린지 카드 UI 갱신 (카드가 그대로 남아 재시도 방지)
        if (window.loadDashboard) window.loadDashboard();
        return true;
    } catch (error) {
        stopProgress();
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
            ? '❌ 정산에 실패했습니다. 잠시 후 다시 시도해주세요.'
            : code === 'unauthenticated'
            ? '❌ 로그인이 필요합니다.'
            : `❌ 보상 수령에 실패했습니다. (${code || serverMsg || '알 수 없는 오류'})`;
        showToast(msg);
        return false;
    } finally {
        stopProgress();
        _claimInFlight.delete(tier);
    }
}
