/**
 * main.js
 * 애플리케이션 진입점 - 모듈 초기화 및 최소한의 전역 노출
 * 대부분의 함수는 app.js에서 직접 import하여 사용
 */

// 인증 모듈 (initializeApp에서 직접 호출)
import { initAuth, setupAuthListener } from './auth.js';

// 블록체인 모듈 (HTML onclick에서 사용)
import { convertPointsToHBT, startChallenge30D } from './blockchain-manager.js';

// ========== 최소한의 전역 노출 (window 객체) ==========
// app.js가 각 모듈에서 직접 import하므로, HTML onclick 또는 auth.js에서
// window.* 경유로 접근하는 항목만 남김

// HTML onclick에서 참조하는 함수 (app.js에서 설정하지 않는 것들만)
window.convertPointsToHBT = convertPointsToHBT; // HTML onclick="convertPointsToHBT()"
window.startChallenge30D = startChallenge30D;    // HTML onclick="startChallenge30D(...)"

// cleanupGalleryResources는 app.js에서 window에 설정됨

// 모듈 로드 완료 표시
console.log('✅ 모든 모듈이 로드되었습니다.');

// DOM이 로드되면 초기화 함수 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

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

