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

// SW 업데이트 시 자동 새로고침
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SW_UPDATED') {
            console.log('[SW] 새 버전 감지 → 자동 새로고침');
            window.location.reload();
        }
    });
}

// ========== 블록체인 모듈은 비동기 로드 (실패해도 인증에 영향 없음) ==========
// 기본 fallback 먼저 설정
window.convertPointsToHBT = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.startChallenge30D = () => { alert('블록체인 모듈 로딩 중입니다. 잠시 후 다시 시도해주세요.'); };
window.fetchOnchainBalance = async () => null;
window.fetchTokenStats = async () => null;

// 비동기로 블록체인 모듈 로드 (then 패턴 — top-level await 미사용)
import('./blockchain-manager.js').then(blockchainModule => {
    window.convertPointsToHBT = blockchainModule.convertPointsToHBT;
    window.startChallenge30D = blockchainModule.startChallenge30D;
    window.fetchOnchainBalance = blockchainModule.fetchOnchainBalance;
    window.fetchTokenStats = blockchainModule.fetchTokenStats;
    window.getWalletAddress = blockchainModule.getWalletAddress;
    window.settleExpiredChallenges = blockchainModule.settleExpiredChallenges;
    window.forfeitChallenge = blockchainModule.forfeitChallenge;
    window.claimChallengeReward = blockchainModule.claimChallengeReward;
    console.log('✅ 블록체인 모듈 로드 완료');
}).catch(e => {
    console.warn('⚠️ 블록체인 모듈 로드 실패 (인증은 정상 작동):', e.message);
});

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
        const ta = document.createElement('textarea');
        ta.value = addr;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    });
};

// 블록 탐색기에서 HBT 토큰 페이지 열기 (지갑 필터 적용)
window.openWalletExplorer = function() {
    const addr = window.getWalletAddress?.();
    if (!addr) {
        alert('지갑 주소가 아직 생성되지 않았습니다.');
        return;
    }
    const tokenAddr = '0xb144a143be3bC44fb13F3FAE28c9447Cee541d1B';
    window.open(`https://sepolia.basescan.org/token/${tokenAddr}?a=${addr}`, '_blank');
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
        preview.textContent = amount + ' HBT';
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
    const hbt = amount; // Era A: 1:1
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
    // 모달에 정보 채우기
    const hbt = amount; // Era A: 1:1
    document.getElementById('modal-convert-points').textContent = amount + 'P';
    document.getElementById('modal-convert-hbt').textContent = hbt + ' HBT';
    document.getElementById('modal-convert-rate').textContent = '1:1 (A구간)';
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

// cleanupGalleryResources는 app.js에서 window에 설정됨
console.log('✅ 모든 모듈이 로드되었습니다.');