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

import { auth, functions } from './firebase-config.js?v=336';
import { CHALLENGES, CHALLENGE_ID_MAP, formatChallengeQualificationLabel } from './blockchain-config.js?v=336';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js';
import { showToast, hideToast } from './ui-helpers.js?v=336';

let claimChallengeFunction = null;
const _claimInFlight = new Set();

// Firebase 콜러블의 기본 대기 시간은 70초다. 그런데 서버의 claimChallengeReward 는
// timeoutSeconds: 300 으로 선언돼 있다. 온체인 발행이 70초를 넘기면 클라이언트만 먼저
// 포기하고 서버는 끝까지 가서 보상을 지급한다. 실제로 30,000 HBT 를 받은 사람에게
// "보상 수령에 실패했습니다" 라고 말한 적이 있다. 서버와 같은 상한을 쓴다.
const CLAIM_CALL_TIMEOUT_MS = 300_000;

// 발행이 끝난 직후에는 잔액·거래 기록이 아직 안 보일 수 있다. 한 번만 새로 읽고 마는
// 대신 몇 번 더 확인해, 사용자가 앱을 나갔다 들어오지 않아도 반영되게 한다.
const CLAIM_REFRESH_DELAYS_MS = [0, 15_000, 45_000];

function refreshAfterClaim() {
    if (!window.updateAssetDisplay) return Promise.resolve();
    const runAt = (delayMs) => new Promise((resolve) => {
        setTimeout(() => {
            if (!auth.currentUser || !window.updateAssetDisplay) return resolve();
            Promise.resolve(window.updateAssetDisplay(true)).catch((error) => {
                console.warn('[challenge] asset refresh skipped after claim:', error?.message || error);
            }).then(resolve, resolve);
        }, delayMs);
    });
    // 첫 번째만 기다리고 나머지는 뒤에서 돌게 둔다.
    const [first, ...rest] = CLAIM_REFRESH_DELAYS_MS;
    rest.forEach((delayMs) => { runAt(delayMs); });
    return runAt(first);
}

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
            // 1분 반을 넘기면 "보통 30초~1분"은 도움이 안 되고 불안만 준다. 오래 걸릴
            // 수는 있어도 나가도 안전하다는 것이 그 시점에 필요한 정보다.
            const body = elapsed <= 90
                ? `⏳ 블록체인에서 보상을 발행하고 있어요… (${elapsed}초 / 보통 30초~1분)\n창을 닫지 말고 잠시만 기다려 주세요.`
                : `⏳ 블록체인이 붐벼 조금 더 걸리고 있어요… (${elapsed}초)\n발행은 계속 진행되니 창을 닫아도 보상은 들어옵니다.`;
            showToast(body, { durationMs: 0 });
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
            claimChallengeFunction = httpsCallable(functions, 'claimChallengeReward', {
                timeout: CLAIM_CALL_TIMEOUT_MS
            });
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
        await refreshAfterClaim();
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

        // deadline-exceeded 는 서버가 실패했다는 뜻이 아니다. 클라이언트가 기다리기를
        // 그만뒀다는 뜻이고, 서버는 계속 돌아 대개 성공한다. 실제로 이 경우에 보상은
        // 지급됐는데 화면만 "실패했습니다" 라고 말한 적이 있다. 돈이 오가는 동작에서
        // 하면 안 되는 거짓말이라, 여기서는 단정하지 않고 확인 결과로 대신한다.
        if (code === 'deadline-exceeded') {
            hideToast();
            showToast('⏳ 보상 발행이 아직 진행 중이에요. 완료되면 자산에 반영됩니다.', { durationMs: 7000 });
            await refreshAfterClaim();
            if (window.loadDashboard) window.loadDashboard();
            return false;
        }
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

// ── 무료 챌린지 시작 ───────────────────────────────────────────────────────────
//
// 보상 수령과 같은 이유로 여기에 있다. 무료 티어(3일 미니)의 시작은 Cloud Function
// 하나를 부르는 게 전부다 — 예치가 0이라 blockchain-manager 의 온체인 분기를 아예
// 타지 않는다. 그런데 window.startChallenge30D 는 main.js 에서 '블록체인 모듈 로딩
// 중입니다' 를 띄우는 자리표시자로 시작하고, 라이트 모드는 그 모듈을 영영 안 싣는다.
// 그래서 라이트에서 3일 미니 챌린지를 누르면 오지 않을 '잠시 후'를 기다리라는 말만
// 나왔다. 유료 티어는 라이트에서 CSS로 감춰져 있어(styles-base.css 의 .play-mode)
// 여기로 오는 것은 무료뿐이다.

let startChallengeFunction = null;
const _startInFlight = new Set();

export function resolveChallengeDefinition(challengeId) {
    const resolvedId = CHALLENGE_ID_MAP[challengeId] || challengeId;
    return { resolvedId, def: CHALLENGES[resolvedId] || null };
}

export function isFreeChallenge(challengeId) {
    const { def } = resolveChallengeDefinition(challengeId);
    return !!def && Number(def.hbtStake || 0) === 0;
}

export async function startFreeChallenge(challengeId) {
    const { resolvedId, def } = resolveChallengeDefinition(challengeId);
    if (!def) {
        showToast('❌ 알 수 없는 챌린지입니다.');
        return false;
    }
    if (Number(def.hbtStake || 0) > 0) {
        // 예치가 필요한 티어를 여기로 보내면 예치 없이 시작되는 것처럼 보인다.
        // 조용히 실패하지 말고 부른 쪽이 알아채게 한다.
        console.error('[challenge] 유료 티어는 무료 시작 경로로 처리할 수 없습니다:', resolvedId);
        showToast('❌ 이 챌린지는 이 화면에서 시작할 수 없어요.');
        return false;
    }

    const tier = def.tier || 'mini';
    if (_startInFlight.has(tier)) {
        showToast('⏳ 챌린지를 준비 중이에요. 잠시만 기다려 주세요.');
        return false;
    }
    _startInFlight.add(tier);

    try {
        if (!auth.currentUser) {
            showToast('❌ 로그인이 필요합니다.');
            return false;
        }

        showToast(`⏳ ${def.duration || 3}일 챌린지 시작 중...`, { durationMs: 0 });

        if (!startChallengeFunction) {
            startChallengeFunction = httpsCallable(functions, 'startChallenge');
        }
        const result = await startChallengeFunction({
            challengeId: resolvedId,
            hbtAmount: 0,
            stakeFlowVersion: 2
        });
        const data = result.data || {};

        const duration = data.duration || def.duration || 3;
        const qualification = data.qualificationLabel
            || formatChallengeQualificationLabel(data.qualificationPolicy || tier);
        const todayCredit = !data.deferredStart && data.initialCompletedDays > 0
            ? '\n📌 오늘 인증분 1일 반영!'
            : '';
        const deferred = data.deferredStart && data.startDate
            ? `\n📅 오늘은 대기일이에요. ${data.startDate}부터 1일차로 시작해요.`
            : '';
        hideToast();
        showToast(`✅ ${duration}일 챌린지 시작!\n${qualification}${todayCredit}${deferred}\n${duration}일 동안 매일 인증하면 ${def.rewardPoints}P 보상!`);

        window.applyOptimisticChallengeStart?.({
            ...data,
            challengeId: resolvedId,
            tier,
            hbtStaked: 0
        });
        // 자산 화면은 라이트 모드에 없다. 있을 때만 갱신한다.
        if (window.updateAssetDisplay) {
            await Promise.resolve(window.updateAssetDisplay(true)).catch(() => {});
        }
        if (window.loadDashboard) window.loadDashboard();
        return true;
    } catch (error) {
        console.error('❌ 챌린지 시작 오류:', error);
        const code = String(error?.code || '').replace(/^functions\//, '');
        const serverMsg = String(error?.message || '').trim();
        hideToast();
        // 서버가 사용자용 구체 안내를 주는 코드는 하드코딩 문구로 덮지 않는다.
        showToast((serverMsg && (code === 'failed-precondition' || code === 'resource-exhausted'))
            ? `❌ ${serverMsg}`
            : code === 'unauthenticated'
            ? '❌ 로그인이 필요합니다.'
            : `❌ 챌린지 시작에 실패했습니다. (${code || serverMsg || '알 수 없는 오류'})`);
        return false;
    } finally {
        _startInFlight.delete(tier);
    }
}
