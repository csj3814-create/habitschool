/**
 * main.js
 * 애플리케이션 진입점 - 모듈 초기화 및 최소한의 전역 노출
 * 대부분의 함수는 app.js에서 직접 import하여 사용
 */

// 인증 모듈 (initializeApp에서 직접 호출)
import { initAuth, setupAuthListener } from './auth.js?v=158';
import { APP_ENV } from './firebase-config.js';
import { getActiveBscNetwork, getActiveHbtTokenAddress } from './blockchain-config.js';

const BLOCKCHAIN_MANAGER_MODULE_PATH = './blockchain-manager.js?v=158';
const CONVERSION_RATE_CACHE_KEY = `hs_conversion_rate_${APP_ENV}`;

function readCachedConversionStats() {
    try {
        const raw = localStorage.getItem(CONVERSION_RATE_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const rate = Number(parsed?.rate);
        const phase = Number(parsed?.phase) || 1;
        if (!(rate > 0)) return null;
        return { rate, phase };
    } catch (_) {
        return null;
    }
}

function cacheConversionStats(stats = {}) {
    const rate = Number(stats?.currentRate);
    if (!(rate > 0)) return;
    const phase = Number(stats?.currentPhase) || 1;
    try {
        localStorage.setItem(CONVERSION_RATE_CACHE_KEY, JSON.stringify({
            rate,
            phase,
            cachedAt: Date.now()
        }));
    } catch (_) {}
}

function formatPer100Hbt(rateScaled = 0) {
    const rate = Number(rateScaled);
    if (!(rate > 0)) return '0';
    const per100 = (rate / 1e8) * 100;
    return per100.toLocaleString('ko-KR', { maximumFractionDigits: 4 });
}

const cachedConversionStats = readCachedConversionStats();

// ========== 인증 초기화를 최우선으로 실행 ==========
function initializeApp() {
    console.log('🚀 애플리케이션 초기화 시작...');
    
    // 인증 초기화 (직접 호출)
    initAuth();
    console.log('✅ 인증 초기화 완료');
    
    // 인증 상태 리스너 설정 (직접 호출)
    setupAuthListener({
        onLogin: (user) => {
            console.log('👤 로그인:', user.displayName);
        },
        onLogout: () => {
            console.log('👋 로그아웃');
        }
    });
    console.log('✅ 인증 리스너 설정 완료');
    
    console.log('✅ 애플리케이션 초기화 완료');
}

// DOM 로드되면 즉시 인증 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ========== 블록체인 모듈 — 지갑 탭 열 때만 로드 (초기 로딩 차단 방지) ==========
window.convertPointsToHBT = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.startChallenge30D = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.fetchOnchainBalance = async () => null;
window.fetchTokenStats = async () => null;
window.disconnectWallet = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해 주세요.'); };
window.openLegacyWalletExportModal = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해 주세요.'); };
window.closeLegacyWalletExportModal = () => {};
window.revealLegacyWalletPrivateKey = async () => null;
window.copyLegacyWalletPrivateKey = async () => null;
window.initializeUserWallet = async () => null;
window._blockchainLoaded = false;
// 변환 비율: 온체인 currentRate (RATE_SCALE=1e8 기준). 최근 조회값이 있으면 먼저 복원합니다.
window._currentConversionRate = cachedConversionStats?.rate || null;
window._currentConversionPhase = cachedConversionStats?.phase || 1;
window._currentChallengeBonusPolicy = null;

window._loadBlockchainModule = function() {
    if (window._blockchainLoaded) return Promise.resolve();
    const loadEthers = () => {
        if (typeof ethers !== 'undefined') return Promise.resolve();
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js';
            // SRI — ethers@5.7.2 (jsdelivr, sha512)
            s.integrity = 'sha512-FDcVY+g7vc5CXANbrTSg1K5qLyriCsGDYCE02Li1tXEYdNQPvLPHNE+rT2Mjei8N7fZbe0WLhw27j2SrGRpdMg==';
            s.crossOrigin = 'anonymous';
            s.onload = resolve; s.onerror = reject;
            document.head.appendChild(s);
        });
    };
    return loadEthers().then(() => import(BLOCKCHAIN_MANAGER_MODULE_PATH)).then(mod => {
        window.convertPointsToHBT = mod.convertPointsToHBT;
        window.startChallenge30D = mod.startChallenge30DWithConnectedWallet || mod.startChallenge30D;
        window.disconnectWallet = mod.disconnectExternalWallet;
        window.openLegacyWalletExportModal = mod.openLegacyWalletExportModal;
        window.closeLegacyWalletExportModal = mod.closeLegacyWalletExportModal;
        window.revealLegacyWalletPrivateKey = mod.revealLegacyWalletPrivateKey;
        window.copyLegacyWalletPrivateKey = mod.copyLegacyWalletPrivateKey;
        window.initializeUserWallet = mod.initializeWalletExternalFirst || mod.initializeUserWallet;
        window.fetchOnchainBalance = mod.fetchOnchainBalance;
        window.fetchTokenStats = mod.fetchTokenStats;
        window.getWalletAddress = mod.getWalletAddressForUI || mod.getWalletAddress;
        window.settleExpiredChallenges = mod.settleExpiredChallenges;
        window.forfeitChallenge = mod.forfeitChallenge;
        window.claimChallengeReward = mod.claimChallengeReward;
        window._blockchainLoaded = true;
        // 실제 변환 비율을 온체인에서 가져와 미리보기에 반영
        window.fetchTokenStats().then(stats => {
            if (stats && typeof stats.currentRate === 'number' && stats.currentRate > 0) {
                window._currentConversionRate = stats.currentRate;
                window._currentConversionPhase = stats.currentPhase || 1;
                cacheConversionStats(stats);
                window.updateConvertPreview();
            }
            if (stats?.challengeBonusPolicy) {
                window._currentChallengeBonusPolicy = stats.challengeBonusPolicy;
                if (window.updateStakeSlider) {
                    window.updateStakeSlider('weekly');
                    window.updateStakeSlider('master');
                }
            }
        }).catch(() => {});
    }).catch(e => {
        console.warn('⚠️ 블록체인 모듈 로드 실패:', e.message);
        if (typeof showToast === 'function') showToast('⚠️ 지갑 기능을 로드할 수 없습니다. 네트워크를 확인해주세요.');
    });
};

// ========== 챌린지 신청 토글 ==========
window.toggleChallengeSelection = async function() {
    const wrap = document.getElementById('challenge-tier-wrap');
    const arrow = document.getElementById('challenge-toggle-arrow');
    const text = document.getElementById('challenge-toggle-text');
    if (!wrap) return;
    const isHidden = wrap.style.display === 'none';
    wrap.style.display = isHidden ? '' : 'none';
    if (arrow) arrow.classList.toggle('open', isHidden);
    if (text) text.textContent = isHidden ? '📋 접기' : '📋 새 챌린지 시작하기';
    if (isHidden) {
        // 패널 열 때 누적값 리셋 — 이전 스테이킹 시도의 잔여 % 제거
        window._stakePctAccum = { weekly: 0, master: 0 };
        if (window.refreshChallengeSliderBounds) {
            await window.refreshChallengeSliderBounds();
        }
    }
};

// ========== 지갑 탭 유틸리티 함수 ==========

// 지갑 주소 클립보드 복사
window.copyWalletAddress = function() {
    const addr = window.getWalletAddress?.();
    if (!addr) {
        alert('지갑 주소가 아직 생성되지 않았습니다.');
        return;
    }
    navigator.clipboard.writeText(addr).then(() => {
        const btn = document.querySelector('.wallet-addr-btn[onclick*="copyWallet"]');
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = orig; }, 1500);
        }
    }).catch(() => {
        // document.execCommand('copy')는 deprecated — 대신 사용자에게 직접 복사 안내
        if (typeof showToast === 'function') {
            showToast('❌ 클립보드 복사에 실패했습니다. 주소를 직접 복사해주세요:\n' + addr);
        } else {
            alert('주소를 직접 복사해주세요:\n' + addr);
        }
    });
};

// 블록 탐색기에서 HBT 토큰 페이지 열기 (지갑 필터 적용)
window.openWalletExplorer = function() {
    const addr = window.getWalletAddress?.();
    if (!addr) {
        alert('지갑 주소가 아직 생성되지 않았습니다.');
        return;
    }
    const tokenAddr = getActiveHbtTokenAddress(APP_ENV);
    const network = getActiveBscNetwork(APP_ENV);
    if (!tokenAddr || tokenAddr === '0x0000000000000000000000000000000000000000') {
        alert('현재 활성 체인의 HBT 주소가 아직 설정되지 않았습니다.');
        return;
    }
    window.open(`${network.explorer}/token/${tokenAddr}?a=${addr}`, '_blank');
};

// 변환 금액 프리셋 설정
window.setConvertAmount = function(amount) {
    const input = document.getElementById('convert-point-input');
    if (input) {
        input.value = amount;
    }
    // 프리셋 버튼 활성화 표시
    document.querySelectorAll('.wallet-preset-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const activeBtn = [...document.querySelectorAll('.wallet-preset-btn')].find(b => b.textContent.trim() === amount + 'P');
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    window.updateConvertPreview?.();
    // 버튼 활성화
    const submitBtn = document.getElementById('convert-submit-btn');
    if (submitBtn) {
        submitBtn.disabled = false;
    }
};

// 변환 미리보기 업데이트
window.updateConvertPreview = function() {
    const input = document.getElementById('convert-point-input');
    const preview = document.getElementById('convert-result-preview');
    const submitBtn = document.getElementById('convert-submit-btn');
    if (!input || !preview) return;

    const amount = parseInt(input.value) || 0;
    const rate = Number(window._currentConversionRate);
    if (amount > 0 && rate > 0) {
        const hbt = Math.floor(amount * rate / 1e8);
        preview.textContent = `${hbt} HBT`;
    } else if (amount > 0) {
        preview.textContent = '비율 확인 중...';
    } else {
        preview.textContent = '0 HBT';
    }

    if (submitBtn) {
        submitBtn.disabled = amount < 100 || amount % 100 !== 0;
    }
};

// 변환 실행 → 확인 모달 열기
window.executeConversion = async function() {
    const input = document.getElementById('convert-point-input');
    const amount = parseInt(input?.value) || 0;
    if (amount < 100 || amount % 100 !== 0) {
        alert('100P 단위로 입력해주세요.');
        return;
    }
    // 모달에 정보 채우기 — 실제 온체인 비율 사용
    const RATE_SCALE = 1e8;
    let rate = Number(window._currentConversionRate);
    let phase = window._currentConversionPhase || 1;
    if (!(rate > 0) && typeof window.fetchTokenStats === 'function') {
        try {
            const stats = await window.fetchTokenStats();
            if (stats && typeof stats.currentRate === 'number' && stats.currentRate > 0) {
                rate = stats.currentRate;
                phase = stats.currentPhase || 1;
                window._currentConversionRate = rate;
                window._currentConversionPhase = phase;
                cacheConversionStats(stats);
                window.updateConvertPreview?.();
            }
        } catch (_) {}
    }
    if (!(rate > 0)) {
        alert('현재 전환 비율을 아직 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    const hbt = Math.floor(amount * rate / RATE_SCALE);
    const phaseLabels = { 1: 'A구간', 2: 'B구간', 3: 'C구간', 4: 'D구간' };
    const phaseLabel = phaseLabels[phase] || 'A구간';
    const rateLabel = `100P = ${formatPer100Hbt(rate)} HBT · ${phaseLabel}`;
    document.getElementById('modal-convert-points').textContent = amount + 'P';
    document.getElementById('modal-convert-hbt').textContent = hbt + ' HBT';
    document.getElementById('modal-convert-rate').textContent = rateLabel;
    document.getElementById('convert-confirm-modal').style.display = 'flex';
};

// 모달 닫기
window.closeConvertModal = function() {
    document.getElementById('convert-confirm-modal').style.display = 'none';
};

// 변환 확정
window.confirmConversion = function() {
    const input = document.getElementById('convert-point-input');
    const amount = parseInt(input?.value) || 0;
    document.getElementById('convert-confirm-modal').style.display = 'none';

    // 버튼 스피너
    const submitBtn = document.getElementById('convert-submit-btn');
    if (submitBtn) {
        submitBtn.classList.add('loading');
        submitBtn.textContent = '변환 중...';
    }

    if (window.convertPointsToHBT) {
        Promise.resolve(window.convertPointsToHBT(amount)).finally(() => {
            if (submitBtn) {
                submitBtn.classList.remove('loading');
                submitBtn.textContent = '💸 변환하기';
                submitBtn.disabled = true;
            }
            // 입력 초기화
            if (input) input.value = '';
            const preview = document.getElementById('convert-result-preview');
            if (preview) preview.textContent = '0 HBT';
            document.querySelectorAll('.wallet-preset-btn').forEach(btn => btn.classList.remove('active'));
        });
    }
};

// 스켈레톤 로딩 해제
window.hideWalletSkeleton = function() {
    const skeleton = document.getElementById('wallet-skeleton');
    if (skeleton) skeleton.classList.add('hidden');
};

function formatChallengeBonusHbt(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return '0';
    return numeric.toFixed(numeric >= 100 ? 0 : 2).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function getLiveChallengeTierPolicy(tier) {
    return window._currentChallengeBonusPolicy?.tiers?.[tier] || null;
}

// 챌린지 예치 슬라이더
window.updateStakeSlider = function(tier) {
    const slider = document.getElementById('stake-slider-' + tier);
    const valueEl = document.getElementById('stake-value-' + tier);
    const rewardEl = document.getElementById('stake-reward-' + tier);
    const hiddenInput = document.getElementById('stake-' + tier);
    if (!slider || !valueEl) return;

    // 슬라이더 max는 updateChallengeSliderBounds가 잔액 기준으로 설정
    // 실제 잔액 검증은 startChallenge30D에서 수행 — 여기서는 단순 표시만
    const rounded = parseInt(slider.value) || parseInt(slider.min) || 0;
    valueEl.textContent = rounded + ' HBT';
    if (hiddenInput) hiddenInput.value = rounded;

    if (rewardEl) {
        if (rounded > 0) {
            const tierPolicy = getLiveChallengeTierPolicy(tier);
            if (tierPolicy && Number.isFinite(Number(tierPolicy.bonusBps))) {
                const bonusAmount = rounded * (Number(tierPolicy.bonusBps) / 10000);
                rewardEl.textContent = `100% 달성 시 +${formatChallengeBonusHbt(bonusAmount)} HBT 보너스 (${tierPolicy.bonusPercentLabel})`;
            } else {
                rewardEl.textContent = '현재 정책 기준 보너스 계산 중';
            }
        } else {
            rewardEl.textContent = '';
        }
    }
};

// 챌린지 HBT 예치 % 버튼
window._stakePctAccum = { weekly: 0, master: 0 };
// 특정 tier의 스테이킹 UI를 0으로 리셋
window._resetStakeTier = function(tier) {
    window._stakePctAccum[tier] = 0;
    const slider = document.getElementById('stake-slider-' + tier);
    const valueEl = document.getElementById('stake-value-' + tier);
    const hiddenInput = document.getElementById('stake-' + tier);
    const displayEl = document.getElementById('stake-display-' + tier);
    const rewardEl = document.getElementById('stake-reward-' + tier);
    if (slider) slider.value = slider.min || 0;
    if (valueEl) valueEl.textContent = (slider?.min || 0) + ' HBT';
    if (hiddenInput) hiddenInput.value = 0;
    if (displayEl) displayEl.textContent = 0;
    if (rewardEl) rewardEl.textContent = '';
};
window.addStakePct = function(tier, pct) {
    const hbtText = document.getElementById('asset-hbt-display')?.textContent || '0';
    const balance = parseFloat(hbtText) || 0;
    if (balance <= 0) { alert('❌ 보유 HBT가 없습니다.'); return; }

    if (pct >= 50) {
        window._stakePctAccum[tier] = pct;
    } else {
        window._stakePctAccum[tier] = Math.min(window._stakePctAccum[tier] + pct, 100);
    }
    const amount = Math.round(balance * window._stakePctAccum[tier]) / 100;
    const rounded = Math.round(amount * 100) / 100;
    document.getElementById('stake-' + tier).value = rounded;
    document.getElementById('stake-display-' + tier).textContent = rounded;
};

// 챌린지 슬라이더 최대값을 사용자 HBT 잔액에 맞게 업데이트
window.updateChallengeSliderBounds = function(balance) {
    const hasKnownBalance = Number.isFinite(balance) && balance >= 0;
    const numericBalance = hasKnownBalance ? Math.floor(balance) : null;
    const applySliderBounds = (tier, minStake, capStake) => {
        const slider = document.getElementById('stake-slider-' + tier);
        const maxLabel = document.getElementById('stake-max-label-' + tier);
        const valueEl = document.getElementById('stake-value-' + tier);
        const hiddenInput = document.getElementById('stake-' + tier);
        if (!slider) return;

        const balanceCap = hasKnownBalance ? Math.min(capStake, Math.max(0, numericBalance)) : capStake;
        const effectiveMax = hasKnownBalance ? Math.max(minStake, balanceCap) : capStake;
        slider.max = effectiveMax;
        slider.dataset.balanceCap = String(balanceCap);
        slider.disabled = hasKnownBalance && balanceCap < minStake;

        const nextValue = Math.min(Math.max(parseInt(slider.value) || minStake, minStake), effectiveMax);
        slider.value = nextValue;
        if (hiddenInput) hiddenInput.value = nextValue;
        if (valueEl) valueEl.textContent = `${nextValue} HBT`;
        if (maxLabel) maxLabel.textContent = (hasKnownBalance ? balanceCap : capStake).toLocaleString();

        if (window.updateStakeSlider) window.updateStakeSlider(tier);
    };

    applySliderBounds('weekly', 50, 5000);
    applySliderBounds('master', 100, 10000);
};

window.refreshChallengeSliderBounds = async function() {
    let balance = 0;

    try {
        if (window.fetchOnchainBalance) {
            const data = await window.fetchOnchainBalance();
            const fetched = parseFloat(data?.balanceFormatted);
            if (Number.isFinite(fetched) && fetched > 0) {
                balance = fetched;
            }
        }
    } catch (error) {
        console.warn('챌린지 슬라이더 잔액 재조회 실패:', error?.message || error);
    }

    if (!(balance > 0)) {
        const hbtText = document.getElementById('asset-hbt-display')?.textContent || '0';
        balance = parseFloat(String(hbtText).replace(/[^0-9.]/g, '')) || 0;
    }

    if (window.updateChallengeSliderBounds) {
        window.updateChallengeSliderBounds(balance);
    }
};

// cleanupGalleryResources는 app.js에서 window에 설정됨
console.log('✅ 모든 모듈이 로드되었습니다.');
