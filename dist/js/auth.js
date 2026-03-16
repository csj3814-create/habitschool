// 인증 관리 모듈
import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut, deleteUser, reauthenticateWithPopup } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { showToast } from './ui-helpers.js';
import { getDatesInfo } from './ui-helpers.js';
import { escapeHtml } from './security.js';
// blockchain-manager는 동적 import (로드 실패해도 인증에 영향 없음)

// WebView(인앱 브라우저) 감지
function isWebView() {
    const ua = navigator.userAgent || navigator.vendor || '';
    // 주요 인앱 브라우저 패턴
    const webviewPatterns = [
        /KAKAOTALK/i,
        /NAVER\(/i,           // 네이버 앱 (NAVER( 패턴)
        /NAVER/i,             // 네이버 관련 전반
        /NaverMatome/i,
        /FBAN|FBAV/i,         // Facebook
        /FB_IAB/i,            // Facebook In-App Browser
        /Instagram/i,
        /Line\//i,
        /Twitter/i,
        /Snapchat/i,
        /DaumApps/i,          // 다음/카카오 계열
        /everytimeApp/i,
        /BAND\//i,            // 네이버 밴드
        /Whale\//i,           // 네이버 웨일 앱 내 WebView
        /\bwv\b/i,            // Android WebView 플래그
        /;\s*wv\)/i,          // Android WebView (정확한 패턴)
        /WebView/i,
        /GSA\//i,             // Google Search App
        /\[FB/i,              // Facebook bracket 패턴
    ];

    // Safari가 아닌데 iOS인 경우 = WebView일 가능성 높음
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
    if (isIOS && !isSafari && !/Chrome|CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua)) return true;

    return webviewPatterns.some(pattern => pattern.test(ua));
}

// 외부 브라우저로 열기 (Android intent, iOS Safari fallback)
function openInExternalBrowser() {
    const currentUrl = window.location.href;
    const ua = navigator.userAgent || '';

    if (/android/i.test(ua)) {
        // Android: Chrome intent로 열기
        window.location.href = 'intent://' + currentUrl.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;end;';
    } else if (/iphone|ipad|ipod/i.test(ua)) {
        // iOS: Safari로 열기 시도
        window.location.href = currentUrl;
    } else {
        window.open(currentUrl, '_system');
    }
}

// 구글 로그인
export function initAuth() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');

    if (!loginBtn) {
        console.error('로그인 버튼을 찾을 수 없습니다.');
        return;
    }

    // WebView 감지 시 경고 표시
    if (isWebView()) {
        loginBtn.style.display = 'none';
        if (webviewWarning) {
            webviewWarning.style.display = 'block';
            const openBrowserBtn = document.getElementById('openExternalBrowser');
            if (openBrowserBtn) {
                openBrowserBtn.addEventListener('click', openInExternalBrowser);
            }
            const copyLinkBtn = document.getElementById('copyLinkBtn');
            if (copyLinkBtn) {
                copyLinkBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(window.location.href).then(() => {
                        showToast('✅ 링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    }).catch(() => {
                        // clipboard API 실패 시 폴백
                        const textArea = document.createElement('textarea');
                        textArea.value = window.location.href;
                        document.body.appendChild(textArea);
                        textArea.select();
                        document.execCommand('copy');
                        document.body.removeChild(textArea);
                        showToast('✅ 링크가 복사되었습니다. 브라우저에 붙여넣기 해주세요!');
                    });
                });
            }
        }
        return;
    }

    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        signInWithPopup(auth, provider).catch(error => {
            console.error('로그인 오류:', error.code, error.message, error);

            if (error.message && (error.message.includes('disallowed_useragent') || error.message.includes('web-storage-unsupported'))) {
                showWebViewWarning();
                return;
            }

            // 모바일에서 팝업이 자동으로 닫히는 경우 — 에러 토스트를 띄우지 않음
            // onAuthStateChanged가 결국 로그인을 잡아주므로 사용자 혼란만 줄임
            if (error.code === 'auth/popup-closed-by-user') {
                console.log('팝업이 닫힘 (모바일에서 흔함) — onAuthStateChanged 대기');
                return;
            }

            let errorMsg = '로그인에 실패했습니다.';
            if (error.code === 'auth/popup-blocked') {
                errorMsg = '팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.';
            } else if (error.code === 'auth/network-request-failed') {
                errorMsg = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
            } else if (error.code === 'auth/unauthorized-domain') {
                errorMsg = '이 도메인은 승인되지 않았습니다. 관리자에게 문의하세요.';
            }
            showToast(`⚠️ ${errorMsg} [${error.code || 'unknown'}]`);
        });
    });
}

// WebView 경고 UI 표시 (폴백용)
function showWebViewWarning() {
    const loginBtn = document.getElementById('loginBtn');
    const webviewWarning = document.getElementById('webview-warning');
    if (loginBtn) loginBtn.style.display = 'none';
    if (webviewWarning) {
        webviewWarning.style.display = 'block';
        const openBrowserBtn = document.getElementById('openExternalBrowser');
        if (openBrowserBtn) {
            openBrowserBtn.addEventListener('click', openInExternalBrowser);
        }
        const copyLinkBtn = document.getElementById('copyLinkBtn');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    showToast('✅ 링크가 복사되었습니다!');
                }).catch(() => {
                    const ta = document.createElement('textarea');
                    ta.value = window.location.href;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                    showToast('✅ 링크가 복사되었습니다!');
                });
            });
        }
    }
}

// 인증 상태 변경 리스너
export function setupAuthListener(callbacks) {
    const { todayStr } = getDatesInfo();

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('point-badge-ui').style.display = 'block';
            document.getElementById('date-ui').style.display = 'flex';
            window._wasLoggedIn = true;

            // 구글 닉네임으로 즉시 표시
            const tempName = user.displayName || '사용자';
            window._userDisplayName = tempName;
            document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(tempName)}`;

            // 사용자 문서 + 오늘 데이터를 병렬로 시작
            const userRef = doc(db, "users", user.uid);
            const userDocPromise = getDoc(userRef);
            if (window.loadDataForSelectedDate) {
                window.loadDataForSelectedDate(todayStr).catch(() => {});
            }

            const userDoc = await userDocPromise;

            // 커스텀 닉네임 덮어쓰기
            const customName = userDoc.exists() ? userDoc.data().customDisplayName : null;
            if (customName) {
                window._userDisplayName = customName;
                document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(customName)}`;
            }
            const nicknameInput = document.getElementById('profile-nickname');
            if (nicknameInput) nicknameInput.value = window._userDisplayName;

            window._blockedUsers = userDoc.exists() ? (userDoc.data().blockedUsers || []) : [];

            if (userDoc.exists()) {
                const ud = userDoc.data();
                if (ud.coins) document.getElementById('point-balance').innerText = ud.coins;

                if (ud.adminFeedback && ud.feedbackDate) {
                    const fbDate = new Date(ud.feedbackDate);
                    const now = new Date(todayStr);
                    const diffDays = (now - fbDate) / (1000 * 60 * 60 * 24);
                    const isHidden = localStorage.getItem('hide_fb_' + user.uid);
                    if (diffDays <= 3 && !isHidden) {
                        document.getElementById('admin-feedback-box').style.display = 'block';
                        document.getElementById('admin-feedback-text').innerText = ud.adminFeedback;
                    }
                }

                if (ud.healthProfile) {
                    const prof = ud.healthProfile;
                    const profSmm = document.getElementById('prof-smm');
                    const profFat = document.getElementById('prof-fat');
                    const profVisceral = document.getElementById('prof-visceral');
                    const profBmr = document.getElementById('prof-bmr');
                    const profMedOther = document.getElementById('prof-med-other');
                    if (profSmm) profSmm.value = prof.smm || '';
                    if (profFat) profFat.value = prof.fat || '';
                    if (profVisceral) profVisceral.value = prof.visceral || '';
                    if (profBmr) profBmr.value = prof.bmr || '';
                    if (profMedOther) profMedOther.value = prof.medOther || '';
                    if (prof.meds) {
                        document.querySelectorAll('input[name="med-chk"]').forEach(chk => {
                            if (prof.meds.includes(chk.value)) chk.checked = true;
                        });
                    }
                    if (prof.updatedAt) {
                        const lastDate = prof.updatedAt.slice(0, 10);
                        const el = document.getElementById('prof-last-date');
                        if (el) el.textContent = `마지막 측정: ${lastDate}`;
                    }
                }
            }

            // 탭 열기 (사용자 문서 로드 후 — 대시보드에서 renderDashboard 호출됨)
            const urlTab = new URLSearchParams(window.location.search).get('tab');
            const validTabs = ['dashboard', 'profile', 'gallery', 'assets'];
            const targetTab = (urlTab && validTabs.includes(urlTab)) ? urlTab : 'dashboard';
            if (window.openTab) {
                window.openTab(targetTab, false);
            }

            // 백그라운드 작업
            import('./blockchain-manager.js').then(mod => {
                mod.initializeUserWallet().catch(err => {
                    console.error('⚠️ 지갑 초기화 오류 (계속 진행):', err);
                });
                mod.settleExpiredChallenges().then(() => {
                    getDoc(userRef).then(snap => {
                        const ac = snap.data()?.activeChallenges || {};
                        const claimable = Object.keys(ac).filter(t => ac[t]?.status === 'claimable');
                        if (claimable.length > 0) {
                            showToast('🎉 완료된 챌린지가 있습니다! 내 지갑에서 보상을 수령하세요.');
                        }
                    }).catch(() => {});
                }).catch(() => {});
            }).catch(err => {
                console.warn('⚠️ 블록체인 모듈 로드 실패 (계속 진행):', err.message);
            });

            if (window.checkOnboarding) window.checkOnboarding();
            if (window.updateMetabolicScoreUI) window.updateMetabolicScoreUI();
            if (window.loadInbodyHistory) window.loadInbodyHistory();

            // 혈액검사 이력 로드
            if (window.loadBloodTestHistory) {
                window.loadBloodTestHistory();
            }

            // 콜백 실행
            if (callbacks && callbacks.onLogin) {
                callbacks.onLogin(user);
            }
        } else {
            // 로그아웃 시 모든 리소스 정리 (메모리 누수 방지)
            document.getElementById('login-modal').style.display = 'flex';
            document.getElementById('point-badge-ui').style.display = 'none';
            document.getElementById('date-ui').style.display = 'none';
            document.getElementById('user-greeting').innerHTML = '';
            window._userDisplayName = null;
            window._blockedUsers = [];

            // 갤러리 리소스 정리
            if (window.cleanupGalleryResources) {
                window.cleanupGalleryResources();
            }

            // 로그아웃인 경우에만 갤러리 탭으로 이동 (초기 cold start는 로그인 모달만 표시)
            if (window._wasLoggedIn && window.openTab) {
                window.openTab('gallery', false);
            }
            window._wasLoggedIn = false;

            // 콜백 실행
            if (callbacks && callbacks.onLogout) {
                callbacks.onLogout();
            }
        }
    });
}

// 로그아웃 후 로그인 화면으로 복귀
window.logoutAndReset = async function () {
    try {
        await signOut(auth);
    } catch (e) {
        console.warn('로그아웃 오류:', e.message);
        location.reload();
    }
};

// 계정 삭제 (Firestore 데이터 + Storage 파일 + Auth 계정)
window.deleteAccountAndData = async function () {
    const user = auth.currentUser;
    if (!user) {
        showToast('⚠️ 로그인이 필요합니다.');
        return;
    }

    // 2단계 확인
    if (!confirm('정말로 계정을 삭제하시겠습니까?\n\n모든 데이터(식단, 운동, 수면 기록, 사진, 건강 프로필 등)가 영구 삭제되며 복구할 수 없습니다.')) {
        return;
    }
    if (!confirm('⚠️ 마지막 확인입니다.\n\n삭제된 데이터는 절대 복구할 수 없습니다.\n정말 삭제하시겠습니까?')) {
        return;
    }

    const deleteBtn = document.getElementById('delete-account-btn');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = '🗑️ 삭제 중...';
    }

    try {
        const uid = user.uid;

        // 1. daily_logs 삭제 (userId 기반)
        const logsQuery = query(collection(db, 'daily_logs'), where('userId', '==', uid));
        const logsSnap = await getDocs(logsQuery);
        const batch1 = writeBatch(db);
        let count = 0;
        for (const docSnap of logsSnap.docs) {
            batch1.delete(docSnap.ref);
            count++;
            if (count >= 500) break; // Firestore batch limit
        }
        if (count > 0) await batch1.commit();

        // 남은 문서가 있으면 추가 삭제
        if (logsSnap.docs.length > 500) {
            const batch2 = writeBatch(db);
            for (let i = 500; i < logsSnap.docs.length; i++) {
                batch2.delete(logsSnap.docs[i].ref);
            }
            await batch2.commit();
        }

        // 2. users/{uid}/inbodyHistory 서브컬렉션 삭제
        const inbodySnap = await getDocs(collection(db, 'users', uid, 'inbodyHistory'));
        if (!inbodySnap.empty) {
            const batchInbody = writeBatch(db);
            inbodySnap.docs.forEach(d => batchInbody.delete(d.ref));
            await batchInbody.commit();
        }

        // 3. users/{uid}/bloodTests 서브컬렉션 삭제
        const bloodSnap = await getDocs(collection(db, 'users', uid, 'bloodTests'));
        if (!bloodSnap.empty) {
            const batchBlood = writeBatch(db);
            bloodSnap.docs.forEach(d => batchBlood.delete(d.ref));
            await batchBlood.commit();
        }

        // 4. users/{uid} 메인 문서 삭제
        await deleteDoc(doc(db, 'users', uid));

        // 5. Storage 파일 삭제 (Firebase Storage는 클라이언트에서 폴더 삭제 불가 → 개별 삭제 시도)
        try {
            const { storage } = await import('./firebase-config.js');
            const { ref, listAll, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
            const userStorageRef = ref(storage, `uploads/${uid}`);
            const fileList = await listAll(userStorageRef);
            await Promise.all(fileList.items.map(item => deleteObject(item)));
        } catch (storageErr) {
            console.warn('Storage 파일 삭제 일부 실패 (계속 진행):', storageErr.message);
        }

        // 6. Firebase Auth 계정 삭제 (재인증 필요할 수 있음)
        try {
            await deleteUser(user);
        } catch (authErr) {
            if (authErr.code === 'auth/requires-recent-login') {
                showToast('🔑 보안을 위해 다시 로그인해주세요.');
                const provider = new GoogleAuthProvider();
                await reauthenticateWithPopup(user, provider);
                await deleteUser(user);
            } else {
                throw authErr;
            }
        }

        // 로컬 데이터 정리
        localStorage.clear();

        showToast('✅ 계정이 완전히 삭제되었습니다.');
        setTimeout(() => location.reload(), 1500);

    } catch (err) {
        console.error('계정 삭제 오류:', err);
        showToast('❌ 계정 삭제 중 오류가 발생했습니다: ' + err.message);
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = '🗑️ 계정 삭제';
        }
    }
};
