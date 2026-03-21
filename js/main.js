/**
 * main.js
 * 애플리케이션 진입점 - 모듈 초기화 및 최소한의 전역 노출
 * 대부분의 함수는 app.js에서 직접 import하여 사용
 */

// 인증 모듈 (initializeApp에서 직접 호출)
import { initAuth, setupAuthListener } from './auth.js';

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
window._blockchainLoaded = false;
// 변환 비율: 온체인 currentRate (RATE_SCALE=1e8 기준). 기본값 1e8 = 1:1 (Era A)
window._currentConversionRate = 1e8;
window._currentConversionPhase = 1;

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
    return loadEthers().then(() => import('./blockchain-manager.js')).then(mod => {
        window.convertPointsToHBT = mod.convertPointsToHBT;
        window.startChallenge30D = mod.startChallenge30D;
        window.fetchOnchainBalance = mod.fetchOnchainBalance;
        window.fetchTokenStats = mod.fetchTokenStats;
        window.getWalletAddress = mod.getWalletAddress;
        window.settleExpiredChallenges = mod.settleExpiredChallenges;
        window.forfeitChallenge = mod.forfeitChallenge;
        window.claimChallengeReward = mod.claimChallengeReward;
        window._blockchainLoaded = true;
        // 실제 변환 비율을 온체인에서 가져와 미리보기에 반영
        window.fetchTokenStats().then(stats => {
            if (stats && typeof stats.currentRate === 'number' && stats.currentRate > 0) {
                window._currentConversionRate = stats.currentRate;
                window._currentConversionPhase = stats.currentPhase || 1;
                window.updateConvertPreview();
            }
        }).catch(() => {});
    }).catch(e => {
        console.warn('⚠️ 블록체인 모듈 로드 실패:', e.message);
        if (typeof showToast === 'function') showToast('⚠️ 지갑 기능을 로드할 수 없습니다. 네트워크를 확인해주세요.');
    });
};

// ========== 챌린지 신청 토글 ==========
window.toggleChallengeSelection = function() {
    const wrap = document.getElementById('challenge-tier-wrap');
    const arrow = document.getElementById('challenge-toggle-arrow');
    const text = document.getElementById('challenge-toggle-text');
    if (!wrap) return;
    const isHidden = wrap.style.display === 'none';
    wrap.style.display = isHidden ? '' : 'none';
    if (arrow) arrow.classList.toggle('open', isHidden);
    if (text) text.textContent = isHidden ? '📋 접기' : '📋 새 챌린지 시작하기';
    // 패널 열 때 누적값 리셋 — 이전 스테이킹 시도의 잔여 % 제거
    if (isHidden) window._stakePctAccum = { weekly: 0, master: 0 };
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
    const tokenAddr = '0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29';
    window.open(`https://testnet.bscscan.com/token/${tokenAddr}?a=${addr}`, '_blank');
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
    // 결과 미리보기 업데이트
    const preview = document.getElementById('convert-result-preview');
    if (preview) {
        const hbt = Math.floor(amount * (window._currentConversionRate || 1e8) / 1e8);
        preview.textContent = hbt + ' HBT';
    }
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
    const hbt = Math.floor(amount * (window._currentConversionRate || 1e8) / 1e8);
    preview.textContent = amount > 0 ? `${hbt} HBT` : '0 HBT';

    if (submitBtn) {
        submitBtn.disabled = amount < 100 || amount % 100 !== 0;
    }
};

// 변환 실행 → 확인 모달 열기
window.executeConversion = function() {
    const input = document.getElementById('convert-point-input');
    const amount = parseInt(input?.value) || 0;
    if (amount < 100 || amount % 100 !== 0) {
        alert('100P 단위로 입력해주세요.');
        return;
    }
    // 모달에 정보 채우기 — 실제 온체인 비율 사용
    const RATE_SCALE = 1e8;
    const rate = window._currentConversionRate || RATE_SCALE;
    const hbt = Math.floor(amount * rate / RATE_SCALE);
    const phaseLabels = { 1: 'A구간', 2: 'B구간', 3: 'C구간', 4: 'D구간' };
    const phaseLabel = phaseLabels[window._currentConversionPhase || 1] || 'A구간';
    const rateLabel = `${(rate / RATE_SCALE).toFixed(rate < RATE_SCALE ? 4 : 0)}:1 (${phaseLabel})`;
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

// 챌린지 예치 슬라이더
window.updateStakeSlider = function(tier) {
    const slider = document.getElementById('stake-slider-' + tier);
    const valueEl = document.getElementById('stake-value-' + tier);
    const rewardEl = document.getElementById('stake-reward-' + tier);
    const hiddenInput = document.getElementById('stake-' + tier);
    if (!slider || !valueEl) return;

    // 슬라이더 값 = HBT 직접 입력
    const amount = parseInt(slider.value) || 0;

    // 보유 HBT 확인 — 초과 시 보유량으로 제한
    const hbtText = document.getElementById('asset-hbt-display')?.textContent || '0';
    const balance = parseFloat(hbtText) || 0;
    const capped = Math.min(amount, Math.floor(balance));
    if (capped < amount) {
        slider.value = capped;
    }
    const rounded = Math.max(capped, parseInt(slider.min) || 0);

    valueEl.textContent = rounded + ' HBT';
    if (hiddenInput) hiddenInput.value = rounded;

    // 예상 수익 계산
    if (rewardEl) {
        if (rounded > 0) {
            const bonus = tier === 'weekly' ? 0.5 : 1.0;
            const expectedBonus = Math.round(rounded * bonus);
            rewardEl.textContent = `100% 달성 시 +${expectedBonus} HBT 보너스`;
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
    const floor = Math.floor(balance);

    // weekly: min 50, max 5000 → 사용자 잔액으로 제한
    const weeklyMax = Math.max(50, Math.min(5000, floor));
    const weeklySlider = document.getElementById('stake-slider-weekly');
    if (weeklySlider) {
        weeklySlider.max = weeklyMax;
        if (parseInt(weeklySlider.value) > weeklyMax) {
            weeklySlider.value = weeklyMax;
            window.updateStakeSlider('weekly');
        }
    }
    const maxLabelW = document.getElementById('stake-max-label-weekly');
    if (maxLabelW) maxLabelW.textContent = weeklyMax.toLocaleString();

    // master: min 100, max 10000 → 사용자 잔액으로 제한
    const masterMax = Math.max(100, Math.min(10000, floor));
    const masterSlider = document.getElementById('stake-slider-master');
    if (masterSlider) {
        masterSlider.max = masterMax;
        if (parseInt(masterSlider.value) > masterMax) {
            masterSlider.value = masterMax;
            window.updateStakeSlider('master');
        }
    }
    const maxLabelM = document.getElementById('stake-max-label-master');
    if (maxLabelM) maxLabelM.textContent = masterMax.toLocaleString();
};

// cleanupGalleryResources는 app.js에서 window에 설정됨
console.log('✅ 모든 모듈이 로드되었습니다.');