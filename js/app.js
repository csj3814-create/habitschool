/**
 * app.js
 * 메인 애플리케이션 로직 모듈
 * index.html의 인라인 스크립트에서 추출
 */

// Firebase 모듈 임포트
import {
    increment, collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, deleteDoc,
    query, where, orderBy, limit, serverTimestamp,
    arrayRemove, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// 프로젝트 모듈 임포트
import { auth, db, storage, MILESTONES, MISSIONS, MISSION_BADGES, MAX_IMG_SIZE, MAX_VID_SIZE, getWeekId } from './firebase-config.js';
import { getDatesInfo, showToast, getKstDateString } from './ui-helpers.js';
import { sanitize, compressImage, fetchImageAsBase64 } from './data-manager.js';
import { escapeHtml, isValidStorageUrl, sanitizeText, isValidFileType, checkRateLimit } from './security.js';
import { requestDietAnalysis, renderDietAnalysisResult, renderDietDaySummary, renderExerciseAnalysisResult, requestSleepMindAnalysis, renderSleepMindAnalysisResult, requestBloodTestAnalysis, renderBloodTestResult } from './diet-analysis.js';
import { calculateMetabolicScore, renderMetabolicScoreCard } from './metabolic-score.js';
// 전역 노출 함수 선언 (Hoisting 활용)
window.loadDataForSelectedDate = loadDataForSelectedDate;
window.renderDashboard = renderDashboard;
window.updateMetabolicScoreUI = updateMetabolicScoreUI;

// CDN 라이브러리 동적 로드 (초기 JS 파싱 차단 제거)
// integrity: SRI 해시(sha256-/sha384-/sha512- 접두사 포함), crossOrigin: 기본 'anonymous'
function _loadScript(url, integrity, crossOrigin) {
    if (document.querySelector(`script[src="${url}"]`)) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        if (integrity) { s.integrity = integrity; s.crossOrigin = crossOrigin || 'anonymous'; }
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
    });
}
async function _ensureExif() {
    if (typeof EXIF !== 'undefined') return;
    // exif-js v2.3.0 — 버전 고정 + SRI
    await _loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/exif-js/2.3.0/exif.min.js',
        'sha512-xsoiisGNT6Dw2Le1Cocn5305Uje1pOYeSzrpO3RD9K+JTpVH9KqSXksXqur8cobTEKJcFz0COYq4723mzo88/Q=='
    );
}
async function _ensureHtml2Canvas() {
    if (typeof html2canvas !== 'undefined') return;
    // html2canvas v1.4.1 — SRI
    await _loadScript(
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'sha512-BNaRQnYJYiPSqHHDb58B0yaPfCu+Wgds8Gp/gU33kqBtgNS4tSPHuGibyoeqMV/TJlSKda6FXzoEyYGjTe+vXA=='
    );
}
async function _ensureKakao() {
    if (window.Kakao && Kakao.isInitialized()) return;
    // Kakao SDK: 1st-party CDN, SRI 미지원 (CORS 헤더 없음)
    await _loadScript('https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js');
    if (window.Kakao && !Kakao.isInitialized()) Kakao.init('f179e091a7b2f4425918b0625aa0fabb');
}
window.checkOnboarding = checkOnboarding;
window.analyzeMealPhoto = analyzeMealPhoto;
window.completeOnboarding = completeOnboarding;
window.goOnboardingStep = goOnboardingStep;
window.openTab = openTab;
window.uploadBloodTestPhoto = uploadBloodTestPhoto;
window.loadBloodTestHistory = loadBloodTestHistory;
window.shareApp = shareApp;
window.changeDisplayName = changeDisplayName;

// ========== 닉네임 변경 ==========
function getUserDisplayName() {
    return window._userDisplayName || auth.currentUser?.displayName || '사용자';
}

async function changeDisplayName() {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const input = document.getElementById('profile-nickname');
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) { showToast('닉네임을 입력해주세요.'); return; }
    if (newName.length > 20) { showToast('닉네임은 20자까지 가능합니다.'); return; }
    if (newName === getUserDisplayName()) { showToast('현재 사용 중인 닉네임입니다.'); return; }

    try {
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { customDisplayName: sanitizeText(newName) }, { merge: true });
        window._userDisplayName = newName;

        // 좌측 상단 이름 업데이트
        document.getElementById('user-greeting').innerHTML = `<img src="icons/icon-192.svg" alt="" style="width:24px;height:24px;vertical-align:middle;margin-right:4px;">${escapeHtml(newName)}`;

        // 갤러리 공유 카드 이름 업데이트
        const shareNameEl = document.getElementById('share-name');
        if (shareNameEl) shareNameEl.innerText = newName;

        // 리포트 이름 업데이트
        const reportNameEl = document.getElementById('report-user-name');
        if (reportNameEl) reportNameEl.textContent = newName;

        showToast('✅ 닉네임이 변경되었습니다.');
    } catch (e) {
        console.error('닉네임 변경 오류:', e);
        showToast('⚠️ 닉네임 변경에 실패했습니다.');
    }
}

// -------------------------------------------------------------------------
// blockchain-manager는 동적으로 로드 (실패해도 앱 작동)
let updateChallengeProgress = async () => { };
let getConversionRate = () => 100;
let getCurrentEra = () => 1;
let fetchTokenStats = async () => null;
import('./blockchain-manager.js').then(mod => {
    updateChallengeProgress = mod.updateChallengeProgress;
    getConversionRate = mod.getConversionRate;
    getCurrentEra = mod.getCurrentEra;
    fetchTokenStats = mod.fetchTokenStats;
    console.log('✅ app.js: 블록체인 모듈 로드');
}).catch(e => console.warn('⚠️ app.js: 블록체인 모듈 로드 실패:', e.message));

// 프로그레시브 마일스톤 체크 (자동 감지, 보너스는 클릭 시 지급)
async function checkMilestones(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        let milestones = userData.milestones || {};
        let newMilestones = [];

        const coins = userData.coins || 0;

        // 일일 기록 조회
        const q = query(collection(db, "daily_logs"), where("userId", "==", userId), orderBy("date", "desc"), limit(61));
        let logs = [];
        try {
            const logsSnap = await getDocs(q);
            logsSnap.forEach(d => logs.push({ date: d.data().date, awarded: d.data().awardedPoints }));
        } catch (e) {
            console.warn('⚠️ 마일스톤 로그 조회 스킵:', e.message);
            logs = [];
        }

        // 통계 계산
        let streak = 0;
        for (let log of logs) {
            if (log.awarded?.diet || log.awarded?.exercise || log.awarded?.mind) streak++;
            else break;
        }
        let dietCount = 0, exerciseCount = 0, mindCount = 0;
        for (let log of logs) {
            if (log.awarded?.diet) dietCount++;
            if (log.awarded?.exercise) exerciseCount++;
            if (log.awarded?.mind) mindCount++;
        }

        const statMap = { streak, diet: dietCount, exercise: exerciseCount, mind: mindCount, points: coins };

        // 각 마일스톤 확인
        for (const [category, catData] of Object.entries(MILESTONES)) {
            const val = statMap[category] || 0;
            for (const level of catData.levels) {
                if (!milestones[level.id]?.achieved && val >= level.target) {
                    milestones[level.id] = { achieved: true, date: getKstDateString(), bonusClaimed: false };
                    newMilestones.push(level);
                }
            }
        }

        // 구 뱃지 → 마일스톤 마이그레이션
        const badges = userData.badges || {};
        const badgeMap = { starter: 'streak1', streak7: 'streak7', diet7: 'diet7', exercise7: 'exercise7', mind7: 'mind7', streak30: 'streak30', points100: 'points100', points300: 'points300' };
        let migrated = false;
        for (const [old, nw] of Object.entries(badgeMap)) {
            if (badges[old]?.earned && !milestones[nw]?.achieved) {
                milestones[nw] = { achieved: true, date: badges[old].date || getKstDateString(), bonusClaimed: badges[old].bonusAwarded || false };
                migrated = true;
            }
        }

        if (newMilestones.length > 0 || migrated) {
            await setDoc(userRef, { milestones, currentStreak: streak }, { merge: true });
            newMilestones.forEach(m => {
                showToast(`🎯 마일스톤 달성! ${m.emoji} ${m.name} — 보너스 +${m.reward}P를 받아가세요!`);
            });
        } else {
            await setDoc(userRef, { currentStreak: streak }, { merge: true });
        }
    } catch (error) {
        console.error('마일스톤 확인 오류:', error);
    }
}

// 마일스톤 UI 렌더링 (프로그레시브)
async function renderMilestones(userId, prefetchedData) {
    try {
        let userData;
        if (prefetchedData) {
            userData = prefetchedData;
        } else {
            const userRef = doc(db, "users", userId);
            const userSnap = await getDoc(userRef);
            userData = userSnap.exists() ? userSnap.data() : {};
        }
        const milestones = userData.milestones || {};

        const grid = document.getElementById('badges-grid');
        grid.innerHTML = '';
        let hasClaimed = false;

        for (const [category, catData] of Object.entries(MILESTONES)) {
            const levels = catData.levels;
            let currentIdx = levels.findIndex(l => !milestones[l.id]?.achieved);
            if (currentIdx === -1) currentIdx = levels.length;

            const completed = levels.slice(0, currentIdx);
            const claimable = completed.filter(lv => !milestones[lv.id]?.bonusClaimed);
            const claimed = completed.filter(lv => milestones[lv.id]?.bonusClaimed);

            let cardHtml = `<div class="milestone-card">`;
            cardHtml += `<div class="milestone-card-label">${catData.label}</div>`;

            // 현재 목표 (라벨 바로 아래 배치)
            if (currentIdx < levels.length) {
                const cur = levels[currentIdx];
                cardHtml += `<div class="milestone-current-target">`;
                cardHtml += `<div class="milestone-current-emoji">${cur.emoji}</div>`;
                cardHtml += `<div class="milestone-current-info">`;
                cardHtml += `<div class="milestone-current-name">🎯 ${cur.name}</div>`;
                cardHtml += `<div class="milestone-current-desc">${cur.desc}</div>`;
                cardHtml += `</div></div>`;
            } else {
                cardHtml += `<div class="milestone-all-done">🎉 모든 레벨 완료!</div>`;
            }

            // 클레임 가능한 마일스톤 (항상 표시)
            if (claimable.length > 0) {
                cardHtml += `<div class="ms-claimable-list">`;
                for (const lv of claimable) {
                    cardHtml += `<div class="milestone-completed-item claimable" onclick="claimMilestoneBonus('${lv.id}', ${lv.reward})"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-claim-btn">+${lv.reward}P 받기</span></div>`;
                }
                cardHtml += `</div>`;
            }

            // 이미 수령한 마일스톤 (글로벌 토글로 숨김)
            if (claimed.length > 0) {
                hasClaimed = true;
                cardHtml += `<div class="ms-claimed-row" style="display:none;">`;
                for (const lv of claimed) {
                    cardHtml += `<div class="milestone-completed-item done"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-check">✅</span></div>`;
                }
                cardHtml += `</div>`;
            }

            cardHtml += `</div>`;
            grid.innerHTML += cardHtml;
        }

        // 수령완료 마일스톤이 있으면 펼치기 버튼 표시
        const expandBtn = document.getElementById('ms-expand-btn');
        if (expandBtn) expandBtn.style.display = hasClaimed ? '' : 'none';
        document.getElementById('milestone-section').style.display = 'block';
    } catch (error) {
        console.error('마일스톤 렌더링 오류:', error);
        const section = document.getElementById('milestone-section');
        if (section) section.style.display = 'none';
    }
}

// 마일스톤 보너스 클릭 시 수령
window.claimMilestoneBonus = async function (milestoneId, reward) {
    try {
        const currentUser = auth.currentUser;
        if (!currentUser) { showToast('❌ 로그인이 필요합니다.'); return; }

        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        const milestones = userData.milestones || {};

        if (!milestones[milestoneId]?.achieved) { showToast('❌ 아직 달성하지 못한 마일스톤입니다.'); return; }
        if (milestones[milestoneId]?.bonusClaimed) { showToast('이미 보너스를 수령했습니다.'); return; }

        milestones[milestoneId].bonusClaimed = true;
        milestones[milestoneId].bonusAmount = reward;
        await setDoc(userRef, { milestones }, { merge: true });

        showToast(`🎁 보너스 +${reward}P 지급 완료!`);
        const pointEl = document.getElementById('point-balance');
        const currentPts = parseInt(pointEl?.textContent) || 0;
        if (pointEl) pointEl.textContent = currentPts + reward;

        renderMilestones(currentUser.uid);
    } catch (error) {
        console.error('보너스 수령 오류:', error);
        showToast('⚠️ 보너스 지급 중 오류가 발생했습니다.');
    }
};

try {
    const { todayStr, yesterdayStr, weekStrs } = getDatesInfo();
    const dateInput = document.getElementById('selected-date');
    if (dateInput) {
        dateInput.max = todayStr;
        // KST 기준 30일 전까지 선택 가능
        const minDate = new Date(todayStr);
        minDate.setDate(minDate.getDate() - 30);
        dateInput.min = minDate.toISOString().split('T')[0];
        dateInput.value = todayStr;
        dateInput.addEventListener('change', () => {
            if (window.loadDataForSelectedDate) window.loadDataForSelectedDate(dateInput.value);
        });
    }

    window.changeDateTo = function (dStr) {
        const di = document.getElementById('selected-date');
        if (di) di.value = dStr;
        if (window.loadDataForSelectedDate) window.loadDataForSelectedDate(dStr);
        window.scrollTo(0, 0);
    };
} catch (e) {
    console.error('app.js 초기화 오류:', e);
}

// showToast, sanitize 등은 상단에서 직접 import

// 중복 코드 통합: 운동 블록 추가 통합 함수
function addExerciseBlock(type, data = null) {
    const isCardio = type === 'cardio';
    const listId = isCardio ? 'cardio-list' : 'strength-list';
    const list = document.getElementById(listId);
    const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const div = document.createElement('div');
    div.className = `exercise-block ${type}-block`;
    div.id = id;

    let contentHtml = '';
    let dataUrl = '';

    // AI 분석 결과 저장용 data attribute
    const hasAnalysis = data && data.aiAnalysis;

    if (isCardio) {
        const safeImgUrl = data && data.imageUrl && isValidStorageUrl(data.imageUrl) ? escapeHtml(data.imageUrl) : '';
        const imgHtml = `<div style="position:relative;">
            <img id="c_img_${id}" class="preview-img" ${safeImgUrl ? `src="${safeImgUrl}" style="display:block;"` : ''}>
            <button class="static-rotate-btn" style="${safeImgUrl ? 'display:block;' : 'display:none;'}" onclick="rotateImage(event, 'c_img_${id}', 'file_c_${id}')">🔄</button>
            <button id="rm_c_${id}" class="static-remove-btn" style="${safeImgUrl ? 'display:block;' : 'display:none;'}" onclick="removeStaticImage(event, 'file_c_${id}', 'c_img_${id}', 'rm_c_${id}', 'txt_c_${id}')">X 삭제</button>
        </div>`;
        dataUrl = data && data.imageUrl ? data.imageUrl : '';

        contentHtml = `
            <button class="block-remove-btn" onclick="this.parentElement.remove()">X</button>
            <label class="upload-area">
                <input type="file" id="file_c_${id}" accept="image/*" class="exer-file" onchange="previewStaticImage(this, 'c_img_${id}', 'rm_c_${id}')">
                <span id="txt_c_${id}" style="color:#666; font-size:13px; ${data && data.imageUrl ? 'display:none;' : ''}">운동 이미지 올리기</span>
                ${imgHtml}
            </label>
        `;
    } else {
        // 동영상 URL은 이미지 태그에 표시 불가 → 항상 플레이스홀더 사용
        const statusHtml = `
            <div id="s_preview_${id}" class="preview-strength" style="${data && data.videoUrl ? 'display:block;' : 'display:none;'}">
                <img id="s_img_${id}" class="preview-strength-img" alt="근력 영상 썸네일">
                <span class="preview-strength-play">▶</span>
            </div>
        `;
        dataUrl = data && data.videoUrl ? data.videoUrl : '';

        contentHtml = `
            <button class="block-remove-btn" onclick="this.parentElement.remove()">X</button>
            <label class="upload-area">
                <input type="file" accept="video/*" class="exer-file" onchange="previewDynamicVid(this)">
                <span style="color:#666; font-size:13px; ${data && data.videoUrl ? 'display:none;' : ''}">운동 영상 올리기</span>
                ${statusHtml}
            </label>
        `;
    }

    div.innerHTML = contentHtml;
    if (dataUrl) div.setAttribute('data-url', dataUrl);
    if (isCardio && data && data.imageThumbUrl) {
        div.setAttribute('data-thumb-url', data.imageThumbUrl);
    }
    if (!isCardio && data && data.videoThumbUrl) {
        div.setAttribute('data-thumb-url', data.videoThumbUrl);
    }
    // AI 분석 결과 보존 (갤러리에서 표시용)
    if (hasAnalysis) {
        div.setAttribute('data-ai-analysis', JSON.stringify(data.aiAnalysis));
    }
    list.appendChild(div);

    // 근력 영상 썸네일: 플레이스홀더 표시 후 실제 프레임 추출 시도
    if (!isCardio && data && data.videoUrl && isValidStorageUrl(data.videoUrl)) {
        const thumbImg = document.getElementById(`s_img_${id}`);
        if (thumbImg) thumbImg.src = createVideoPlaceholderBase64();
        // Firebase Storage URL에서도 프레임 추출 시도 (CORS 지원)
        extractVideoThumbFromUrl(data.videoUrl)
            .then((thumbDataUrl) => {
                if (!thumbDataUrl) return;
                const ti = document.getElementById(`s_img_${id}`);
                if (ti) ti.src = thumbDataUrl;
            })
            .catch(() => { });
    }
}

// 호환성을 위한 wrapper 함수
function addCardioBlock(data = null) {
    addExerciseBlock('cardio', data);
}
function addStrengthBlock(data = null) {
    addExerciseBlock('strength', data);
}
window.addCardioBlock = addCardioBlock;
window.addStrengthBlock = addStrengthBlock;

// CTA에서 블록 생성 후 파일 선택 다이얼로그 열기
window.addCardioBlockWithFile = function() {
    addCardioBlock();
    const blocks = document.querySelectorAll('.cardio-block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
        const innerInput = lastBlock.querySelector('.exer-file');
        if (innerInput) innerInput.click();
    }
};

window.addStrengthBlockWithFile = function() {
    addStrengthBlock();
    const blocks = document.querySelectorAll('.strength-block');
    const lastBlock = blocks[blocks.length - 1];
    if (lastBlock) {
        const innerInput = lastBlock.querySelector('.exer-file');
        if (innerInput) innerInput.click();
    }
};

window.previewDynamicVid = function (input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_VID_SIZE) { alert("100MB 이하만 가능!"); input.value = ""; return; }

    // 동영상 파일의 수정 날짜 확인 (촬영 당일만 허용)
    const fileDate = new Date(file.lastModified);
    const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const selectedDateStr = document.getElementById('selected-date').value;

    if (fileDateStr !== selectedDateStr) {
        if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${selectedDateStr})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
            input.value = "";
            return;
        }
    }

    const previewWrap = input.parentElement.querySelector('.preview-strength');
    const previewImg = input.parentElement.querySelector('.preview-strength-img');
    // 업로드 텍스트 숨기기
    const uploadText = input.parentElement.querySelector('span');
    if (uploadText) uploadText.style.display = 'none';
    previewWrap.style.display = 'block';



    // 즉시 플레이스홈더 표시 (검은박스 방지)
    previewImg.src = createVideoPlaceholderBase64();

    // 로컬 파일에서 실제 프레임 썸네일 추출
    const objectUrl = URL.createObjectURL(file);
    extractVideoThumbFromFile(file)
        .then((thumbDataUrl) => {
            if (thumbDataUrl) previewImg.src = thumbDataUrl;
        })
        .catch(() => { })
        .finally(() => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
        });
};

// AI 분석용 이미지 압축 (base64 data URL → 최대 480px 리사이즈, 품질 0.5)
function compressImageForAI(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const MAX = 480;
            let w = img.width, h = img.height;
            if (w > MAX || h > MAX) {
                if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
                else { w = Math.round(w * MAX / h); h = MAX; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.5));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// 로컬 File 객체에서 동영상 프레임 추출 (가장 신뢰성 높음)
function extractVideoThumbFromFile(file) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);

        let resolved = false;
        const done = (val) => {
            if (resolved) return;
            resolved = true;
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.remove();
            URL.revokeObjectURL(objectUrl);
            resolve(val || '');
        };

        // 10초 타임아웃
        const timer = setTimeout(() => done(''), 10000);

        video.addEventListener('error', () => { clearTimeout(timer); done(''); }, { once: true });

        video.addEventListener('loadeddata', () => {
            try {
                const dur = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = dur > 1 ? 0.8 : 0.01;
            } catch (_) { clearTimeout(timer); done(''); }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 180;
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, w, h);

                // 검은 프레임 감지: 중앙 픽셀이 모두 0이면 재시도
                const px = ctx.getImageData(w / 2, h / 2, 1, 1).data;
                if (px[0] === 0 && px[1] === 0 && px[2] === 0) {
                    const retryTime = Math.min((video.duration || 1) > 2 ? 2 : 0.5, video.duration || 1);
                    video.currentTime = retryTime;
                    video.addEventListener('seeked', () => {
                        try {
                            ctx.drawImage(video, 0, 0, w, h);
                            clearTimeout(timer);
                            done(canvas.toDataURL('image/jpeg', 0.85));
                        } catch (_) { clearTimeout(timer); done(''); }
                    }, { once: true });
                    return;
                }

                clearTimeout(timer);
                done(canvas.toDataURL('image/jpeg', 0.85));
            } catch (_) { clearTimeout(timer); done(''); }
        }, { once: true });

        video.src = objectUrl;
        video.load();
    });
}

async function extractVideoThumbFromUrl(videoUrl) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        // Firebase Storage URL은 crossOrigin 필요
        if (videoUrl && !videoUrl.startsWith('blob:')) {
            video.crossOrigin = 'anonymous';
        }

        let resolved = false;
        const cleanup = () => {
            video.pause();
            video.removeAttribute('src');
            video.load();
        };
        const done = (val) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(val || '');
        };

        // 8초 타임아웃
        const timer = setTimeout(() => done(''), 8000);

        video.addEventListener('error', () => { clearTimeout(timer); done(''); }, { once: true });
        video.addEventListener('loadeddata', () => {
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = duration > 1 ? 0.8 : 0.01;
            } catch (_) {
                clearTimeout(timer); done('');
            }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, video.videoWidth || 320);
                canvas.height = Math.max(1, video.videoHeight || 180);
                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                clearTimeout(timer);
                done(dataUrl);
            } catch (_) {
                clearTimeout(timer); done('');
            }
        }, { once: true });

        video.src = videoUrl;
        video.load();
    });
}
// 갤러리에서 접근 가능하도록 전역 노출
window.extractVideoThumbFromUrl = extractVideoThumbFromUrl;

window.previewStaticImage = function (input, previewId, btnId, skipExif = false) {
    const preview = document.getElementById(previewId);
    const rmBtn = document.getElementById(btnId);
    // 인증 날짜 input 보장
    const dateInput = document.getElementById('selected-date');
    // 텍스트 스팬 찾기: diet용 txt-xxx 또는 cardio용 txt_c_xxx
    let txtSpan = null;
    if (previewId.startsWith('preview-')) {
        txtSpan = document.getElementById('txt-' + previewId.split('-')[1]);
    } else if (previewId.startsWith('c_img_')) {
        txtSpan = document.getElementById('txt_c_' + previewId.substring(6));
    }

    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > MAX_IMG_SIZE) { alert("20MB 이하만 가능합니다."); input.value = ""; return; }

        const render = () => {
            const reader = new FileReader();
            reader.onload = e => {
                preview.src = e.target.result;
                preview.style.display = 'block';
                if (rmBtn) rmBtn.style.display = 'block';
                if (txtSpan) txtSpan.style.display = 'none';

                // 회전 버튼 표시
                const rotBtn = preview.parentElement.querySelector('.static-rotate-btn');
                if (rotBtn) rotBtn.style.display = 'block';

                // 미리보기 클릭 시 라이트박스 열기
                preview.onclick = () => { if (preview.src) window.openLightbox(preview.src); };

                // 운동 블록 기존 분석 초기화
                const exerciseBlock = input.closest('.exercise-block');
                if (exerciseBlock) {
                    exerciseBlock.removeAttribute('data-ai-analysis');
                    exerciseBlock.removeAttribute('data-url');
                    // 이미지 업로드 성공 시 다른 빈 cardio 블록 제거
                    if (exerciseBlock.classList.contains('cardio-block')) {
                        document.querySelectorAll('#cardio-list .cardio-block').forEach(block => {
                            if (block === exerciseBlock) return;
                            const img = block.querySelector('.preview-img');
                            if (!img || img.style.display === 'none' || !img.src || img.src === '') {
                                block.remove();
                            }
                        });
                    }
                }

                // 식단 AI 분석 버튼 표시 + 기존 분석 초기화
                if (previewId.startsWith('preview-')) {
                    const meal = previewId.substring(8);
                    const aiBtn = document.getElementById(`ai-btn-${meal}`);
                    if (aiBtn) {
                        aiBtn.style.display = 'block';
                        aiBtn.textContent = '🤖 AI 분석';
                    }
                    // 기존 분석 결과 초기화
                    const resultContainer = document.getElementById(`diet-analysis-${meal}`);
                    if (resultContainer) {
                        resultContainer._analysisData = null;
                        resultContainer.innerHTML = '';
                        resultContainer.style.display = 'none';
                    }
                    // 수면 분석 초기화
                    if (meal === 'sleep') {
                        const sleepResult = document.getElementById('sleep-analysis-result');
                        if (sleepResult) { sleepResult.innerHTML = ''; sleepResult.style.display = 'none'; }
                        if (aiBtn) aiBtn.removeAttribute('data-analyzed');
                    }
                }
            }
            reader.readAsDataURL(file);

            // 빈 박스 보이기 로직
            const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];
            const mealPrefix = 'preview-';
            if (previewId.startsWith(mealPrefix)) {
                const currentMeal = previewId.substring(mealPrefix.length);
                const currentIndex = mealOrder.indexOf(currentMeal);
                if (currentIndex >= 0 && currentIndex < mealOrder.length - 1) {
                    const nextMeal = mealOrder[currentIndex + 1];
                    const nextBox = document.getElementById(`diet-box-${nextMeal}`);
                    if (nextBox) {
                        nextBox.style.display = 'block';
                    }
                }
            }
        };

        if (!skipExif) {
            _ensureExif().then(() => EXIF.getData(file, function () {
                const exifDate = EXIF.getTag(this, "DateTimeOriginal");
                if (exifDate) {
                    // EXIF 날짜가 있으면 EXIF로 검증
                    const dateParts = exifDate.split(" ")[0].replace(/:/g, "-");
                    if (dateParts !== dateInput.value) {
                        if (!confirm(`⚠️ 촬영일(${dateParts})이 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                            input.value = ""; preview.style.display = 'none';
                            if (rmBtn) rmBtn.style.display = 'none';
                            if (txtSpan) txtSpan.style.display = 'inline-block';
                            return;
                        }
                    }
                } else {
                    // EXIF 없으면 파일 수정일(lastModified)로 검증
                    const fileDate = new Date(file.lastModified);
                    const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
                    if (fileDateStr !== dateInput.value) {
                        if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                            input.value = ""; preview.style.display = 'none';
                            if (rmBtn) rmBtn.style.display = 'none';
                            if (txtSpan) txtSpan.style.display = 'inline-block';
                            return;
                        }
                    }
                }
                render();
            })).catch(() => render());
        } else if (!skipExif) {
            // EXIF 라이브러리 없을 때도 lastModified로 검증
            const fileDate = new Date(file.lastModified);
            const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
            if (fileDateStr !== dateInput.value) {
                if (!confirm(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${dateInput.value})와 다릅니다.\n그래도 업로드하시겠습니까?`)) {
                    input.value = ""; preview.style.display = 'none';
                    if (rmBtn) rmBtn.style.display = 'none';
                    if (txtSpan) txtSpan.style.display = 'inline-block';
                    return;
                }
            }
            render();
        } else { render(); }
    }
};

window.removeStaticImage = function (e, inputId, previewId, btnId, txtId) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById(inputId).value = "";
    document.getElementById(previewId).src = "";
    document.getElementById(previewId).style.display = "none";
    document.getElementById(previewId).setAttribute('data-user-removed', 'true');
    document.getElementById(btnId).style.display = "none";
    if (document.getElementById(txtId)) document.getElementById(txtId).style.display = "inline-block";

    // 회전 버튼 숨기기
    const previewEl = document.getElementById(previewId);
    const rotBtn = previewEl?.parentElement?.querySelector('.static-rotate-btn');
    if (rotBtn) rotBtn.style.display = 'none';

    // 식단 분석 결과 초기화 및 가리기
    const mealPrefix = 'preview-';
    if (previewId.startsWith(mealPrefix)) {
        const meal = previewId.substring(mealPrefix.length);
        const resultContainer = document.getElementById(`diet-analysis-${meal}`);
        const aiBtn = document.getElementById(`ai-btn-${meal}`);
        if (resultContainer) {
            resultContainer._analysisData = null;
            resultContainer.innerHTML = '';
            resultContainer.style.display = 'none';
        }
        if (aiBtn) {
            aiBtn.style.display = 'none';
            aiBtn.textContent = '🤖 AI 분석';
        }
        // 수면 분석 초기화
        if (meal === 'sleep') {
            const sleepResult = document.getElementById('sleep-analysis-result');
            if (sleepResult) { sleepResult.innerHTML = ''; sleepResult.style.display = 'none'; }
            if (aiBtn) aiBtn.removeAttribute('data-analyzed');
        }
    }

    // 운동 블록 AI 분석 초기화
    if (previewEl) {
        const exerciseBlock = previewEl.closest('.exercise-block');
        if (exerciseBlock) {
            exerciseBlock.removeAttribute('data-ai-analysis');
            exerciseBlock.removeAttribute('data-url');
        }
    }
};

// 90° 시계방향 회전
window.rotateImage = function (e, previewId, inputId) {
    e.preventDefault(); e.stopPropagation();
    const img = document.getElementById(previewId);
    if (!img || !img.src) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';
    tempImg.onload = () => {
        canvas.width = tempImg.height;
        canvas.height = tempImg.width;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        ctx.drawImage(tempImg, -tempImg.width / 2, -tempImg.height / 2);

        const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        img.src = rotatedDataUrl;

        // file input에 회전된 이미지를 Blob으로 교체
        canvas.toBlob((blob) => {
            if (!blob) return;
            const input = document.getElementById(inputId);
            if (!input) return;
            const file = new File([blob], 'rotated.jpg', { type: 'image/jpeg', lastModified: Date.now() });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
        }, 'image/jpeg', 0.92);
    };
    tempImg.src = img.src;
};

/* CTA 버튼: 다음 빈 식단 칸으로 이동 */
window.clickNextEmptyDietSlot = function () {
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
    for (const slot of slots) {
        const preview = document.getElementById(`preview-${slot}`);
        const isEmpty = !preview || preview.style.display === 'none' || !preview.src || preview.src === '' || preview.src === window.location.href;
        if (isEmpty) {
            const box = document.getElementById(`diet-box-${slot}`);
            if (box) box.style.display = 'block';
            document.getElementById(`diet-img-${slot}`).click();
            return;
        }
    }
    showToast('모든 식단 칸이 채워져 있습니다.');
};

window.smartUpload = async function (input) {
    const files = Array.from(input.files);
    if (!files || files.length === 0) return;

    for (let f of files) {
        if (f.size > MAX_IMG_SIZE) { 
            alert("20MB 이하만 가능합니다."); 
            input.value = ""; 
            return; 
        }
    }

    const dateInput = document.getElementById('selected-date');
    const validDate = dateInput.value;

    if (typeof EXIF === 'undefined') {
        alert("⚠️ 이미지 분석 모듈이 없습니다.");
        input.value = ""; return;
    }

    // 시간 추출 헬퍼 (비동기)
    const extractTime = (f) => _ensureExif().then(() => new Promise((resolve) => {
        try {
            EXIF.getData(f, function () {
                const exifDate = EXIF.getTag(this, "DateTimeOriginal") || EXIF.getTag(this, "DateTime");
                if (exifDate) {
                    const parts = String(exifDate).trim().split(" ");
                    if (parts.length >= 2) {
                        const dStr = parts[0].replace(/:/g, "-");
                        if (dStr !== validDate) {
                            resolve(null); // 날짜 불일치
                            return;
                        }
                        resolve(parts[1]); // "HH:MM:SS"
                        return;
                    }
                }
                resolve("99:99:99"); // 시간정보가 없으면 제일 뒤로
            });
        } catch {
            resolve("99:99:99"); // 오류 시 제일 뒤로
        }
    }));

    try {
        const fileData = [];
        for (let f of files) {
            let t = await extractTime(f);
            if (t === null) {
                alert(`⚠️ 촬영일이 선택한 날짜(${validDate})와 다른 사진이 제외되었습니다.`);
                continue;
            }
            fileData.push({ file: f, time: t });
        }

        // 시간순 오름차순 정렬
        fileData.sort((a, b) => a.time.localeCompare(b.time));

        const categories = ['breakfast', 'lunch', 'dinner', 'snack'];
        
        // 빈 슬롯 찾기
        const emptySlots = categories.filter(c => {
             const preview = document.getElementById(`preview-${c}`);
             return (!preview || preview.style.display === 'none' || !preview.src || preview.src.endsWith(location.host + '/') || preview.src.trim() === '');
        });

        let assigned = 0;
        for (let i = 0; i < fileData.length; i++) {
            if (i >= emptySlots.length) {
                alert("⚠️ 등록 가능한 식사 칸이 모자라 일부 사진만 업로드되었습니다.");
                break;
            }
            const cat = emptySlots[i];
            const targetInput = document.getElementById(`diet-img-${cat}`);
            
            try {
                const dt = new DataTransfer();
                dt.items.add(fileData[i].file);
                targetInput.files = dt.files;
                
                // 해당 컨테이너 상자 보이기
                const box = document.getElementById(`diet-box-${cat}`);
                if (box) box.style.display = 'block';

                window.previewStaticImage(targetInput, `preview-${cat}`, `rm-${cat}`, true);
                targetInput.dispatchEvent(new Event('change', { bubbles: true }));
                assigned++;
            } catch (err) {
                console.error(err);
            }
        }
        
        if (assigned > 0) {
            showToast(`✨ ${assigned}개의 사진이 시간순으로 자동 배치되었습니다.`);
        }
    } catch (err) {
        console.error(err);
        alert("⚠️ 자동 업로드 중 오류가 발생했습니다.");
    }
    input.value = "";
};

function clearInputs() {
    ['weight', 'glucose', 'bp-systolic', 'bp-diastolic', 'gratitude-journal'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('meditation-check').checked = false;

    ['breakfast', 'lunch', 'dinner', 'snack', 'sleep'].forEach(k => {
        const pv = document.getElementById(`preview-${k}`);
        const rm = document.getElementById(`rm-${k}`);
        const tx = document.getElementById(`txt-${k}`);
        const box = document.getElementById(`diet-box-${k}`);
        
        if (pv) { pv.style.display = 'none'; pv.src = ''; pv.removeAttribute('data-user-removed'); }
        if (rm) rm.style.display = 'none';
        if (tx) tx.style.display = 'inline-block';
        if (box && k !== 'breakfast' && k !== 'sleep') { 
             box.style.display = 'none'; 
        }
        
        const aiContainer = document.getElementById(`diet-analysis-${k}`);
        const aiBtn = document.getElementById(`ai-btn-${k}`);
        if(aiContainer) {
            aiContainer._analysisData = null;
            aiContainer.innerHTML = '';
            aiContainer.style.display = 'none';
        }
        if(aiBtn) {
            aiBtn.style.display = 'none';
            aiBtn.textContent = '🤖 AI 분석';
            aiBtn.removeAttribute('data-analyzed');
        }
    });

    const breakBox = document.getElementById(`diet-box-breakfast`);
    if (breakBox) breakBox.style.display = 'block';

    // 수면 분석 결과 초기화
    const sleepResultBox = document.getElementById('sleep-analysis-result');
    if (sleepResultBox) { sleepResultBox.innerHTML = ''; sleepResultBox.style.display = 'none'; }
    // 마음 분석 결과 초기화
    const mindResultBox = document.getElementById('mind-analysis-result');
    if (mindResultBox) { mindResultBox.innerHTML = ''; mindResultBox.style.display = 'none'; }

    document.getElementById('cardio-list').innerHTML = '';
    document.getElementById('strength-list').innerHTML = '';

    document.getElementById('quest-diet').className = 'quest-check'; document.getElementById('quest-diet').innerText = '미달성';
    document.getElementById('quest-exercise').className = 'quest-check'; document.getElementById('quest-exercise').innerText = '미달성';
    document.getElementById('quest-mind').className = 'quest-check'; document.getElementById('quest-mind').innerText = '미달성';

    document.querySelectorAll('#diet input[type="file"], #exercise input[type="file"], #sleep input[type="file"]').forEach(input => input.value = '');
}

// 데이터 로드 generation 카운터 (race condition 방지)
let _loadDataGeneration = 0;

// 데이터 로드
async function loadDataForSelectedDate(dateStr) {
    const { todayStr } = getDatesInfo(); // 로컬 확보
    const user = auth.currentUser;
    if (!user) return;

    const thisGeneration = ++_loadDataGeneration;

    try {
        const docId = `${user.uid}_${dateStr}`;
        const myLogDoc = await getDoc(doc(db, "daily_logs", docId));

        // race condition 방지: 날짜가 빠르게 변경된 경우 이전 요청 무시
        if (thisGeneration !== _loadDataGeneration) return;

        // 데이터 도착 후에 UI 초기화 (깜빡임 방지)
        clearInputs();

        if (myLogDoc.exists()) {
            const data = myLogDoc.data();
            const awarded = data.awardedPoints || {};

            if (data.metrics) {
                document.getElementById('weight').value = data.metrics.weight || '';
                document.getElementById('glucose').value = data.metrics.glucose || '';
                document.getElementById('bp-systolic').value = data.metrics.bpSystolic || '';
                document.getElementById('bp-diastolic').value = data.metrics.bpDiastolic || '';
            }
            if (data.diet) {
                ['breakfast', 'lunch', 'dinner', 'snack'].forEach(k => {
                    if (data.diet[`${k}Url`] && isValidStorageUrl(data.diet[`${k}Url`])) {
                        document.getElementById(`preview-${k}`).src = data.diet[`${k}Url`];
                        document.getElementById(`preview-${k}`).style.display = 'block';
                        document.getElementById(`rm-${k}`).style.display = 'block';
                        document.getElementById(`txt-${k}`).style.display = 'none';
                    }
                });
                if (awarded.diet) {
                    const dp = awarded.dietPoints || 10;
                    document.getElementById('quest-diet').className = 'quest-check done';
                    document.getElementById('quest-diet').innerText = `+${dp}P`;
                }
            }
            if (data.exercise) {
                // 유산소: cardioList가 최우선 (legacy 필드 무시)
                if (data.exercise.cardioList && data.exercise.cardioList.length > 0) {
                    data.exercise.cardioList.forEach(item => addExerciseBlock('cardio', item));
                } else if (data.exercise.cardioImageUrl || data.exercise.cardioTime || data.exercise.cardioDist) {
                    addExerciseBlock('cardio', { imageUrl: data.exercise.cardioImageUrl, time: data.exercise.cardioTime, dist: data.exercise.cardioDist });
                } else {
                    addExerciseBlock('cardio');
                }

                // 근력: strengthList가 최우선 (legacy 필드 무시)
                if (data.exercise.strengthList && data.exercise.strengthList.length > 0) {
                    data.exercise.strengthList.forEach(item => addExerciseBlock('strength', item));
                } else if (data.exercise.strengthVideoUrl) {
                    addExerciseBlock('strength', { videoUrl: data.exercise.strengthVideoUrl });
                } else {
                    addExerciseBlock('strength');
                }
                if (awarded.exercise) {
                    const ep = awarded.exercisePoints || 15;
                    document.getElementById('quest-exercise').className = 'quest-check done';
                    document.getElementById('quest-exercise').innerText = `+${ep}P`;
                }
            } else { addCardioBlock(); addStrengthBlock(); }

            if (data.sleepAndMind) {
                if (data.sleepAndMind.sleepImageUrl) {
                    document.getElementById('preview-sleep').src = data.sleepAndMind.sleepImageUrl;
                    document.getElementById('preview-sleep').style.display = 'block';
                    document.getElementById('rm-sleep').style.display = 'block';
                    document.getElementById('txt-sleep').style.display = 'none';
                    // 수면 AI 분석 버튼 표시
                    const sleepAiBtn = document.getElementById('ai-btn-sleep');
                    if (sleepAiBtn) sleepAiBtn.style.display = 'block';
                }
                // 수면 AI 분석 결과 복원
                if (data.sleepAndMind.sleepAnalysis) {
                    const sleepResultBox = document.getElementById('sleep-analysis-result');
                    const sleepAiBtn = document.getElementById('ai-btn-sleep');
                    if (sleepResultBox && typeof renderSleepMindAnalysisResult === 'function') {
                        renderSleepMindAnalysisResult(data.sleepAndMind.sleepAnalysis, sleepResultBox);
                        sleepResultBox.style.display = 'none';
                        if (sleepAiBtn) {
                            sleepAiBtn.setAttribute('data-analyzed', 'true');
                            sleepAiBtn.textContent = '🤖 분석 보기';
                        }
                    }
                }
                if (data.sleepAndMind.meditationDone) document.getElementById('meditation-check').checked = true;
                document.getElementById('gratitude-journal').value = data.sleepAndMind.gratitude || '';

                if (awarded.mind) {
                    const mp = awarded.mindPoints || 5;
                    document.getElementById('quest-mind').className = 'quest-check done';
                    document.getElementById('quest-mind').innerText = `+${mp}P`;
                }
            }

            // 중성지방 복원
            const tgEl = document.getElementById('triglyceride');
            if (tgEl && data.metrics?.triglyceride) {
                tgEl.value = data.metrics.triglyceride;
            }

            // AI 식단 분석 결과 복원
            if (window._restoreDietAnalysis) {
                window._restoreDietAnalysis(data);
            }

            // 대시보드는 openTab에서 호출하므로 여기서는 생략
        } else {
            addExerciseBlock('cardio'); addExerciseBlock('strength');
        }
    } catch (error) {
        // race condition으로 취소된 경우 에러 무시
        if (thisGeneration !== _loadDataGeneration) return;
        console.error('데이터 로드 오류:', error);
        showToast('⚠️ 데이터를 불러오는 중 오류가 발생했습니다.');
        // 기본 블록은 추가
        addExerciseBlock('cardio');
        addExerciseBlock('strength');
    }
}

let galleryFilter = 'all';
window.setGalleryFilter = function (filter, btnElement) {
    galleryFilter = filter;
    sortedFilteredDirty = true;  // 필터 변경 시 캐시 무효화
    document.querySelectorAll('.filter-chip').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-pressed', 'false');
    });
    btnElement.classList.add('active');
    btnElement.setAttribute('aria-pressed', 'true');
    renderFeedOnly();
};

// 갤러리 라이트박스 (스와이프 지원)
let lightboxImages = [];
let lightboxCurrentIndex = 0;
let lightboxTouchStartX = 0;

window.openLightbox = function (url) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.style.display = 'none';
    }
    img.src = url;
    img.style.display = 'block';
    modal.style.display = 'flex';

    // 같은 카드의 모든 이미지 수집 (스와이프용)
    lightboxImages = [];
    lightboxCurrentIndex = 0;
    const allWrappers = document.querySelectorAll('.gallery-card .gallery-media-wrapper');
    allWrappers.forEach(w => {
        const imgEl = w.querySelector('img');
        if (imgEl) {
            const fullUrl = imgEl._originalSrc || imgEl.getAttribute('onclick')?.match(/'([^']+)'\)$/)?.[1] || imgEl.src;
            lightboxImages.push(fullUrl);
            if (fullUrl === url || imgEl.src === url) {
                lightboxCurrentIndex = lightboxImages.length - 1;
            }
        }
    });
    updateLightboxCounter();
};

window.openVideoLightbox = function (url) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    if (!video) return;

    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
    video.currentTime = 0;
    modal.style.display = 'flex';
    video.play().catch(() => { });
    lightboxImages = [];
};

function navigateLightbox(direction) {
    if (lightboxImages.length <= 1) return;
    lightboxCurrentIndex = (lightboxCurrentIndex + direction + lightboxImages.length) % lightboxImages.length;
    const img = document.getElementById('lightbox-img');
    img.src = lightboxImages[lightboxCurrentIndex];
    updateLightboxCounter();
}

function updateLightboxCounter() {
    let counter = document.getElementById('lightbox-counter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'lightbox-counter';
        document.getElementById('lightbox-modal').appendChild(counter);
    }
    if (lightboxImages.length > 1) {
        counter.textContent = `${lightboxCurrentIndex + 1} / ${lightboxImages.length}`;
        counter.style.display = 'block';
    } else {
        counter.style.display = 'none';
    }
}

// 라이트박스 키보드 네비게이션
document.addEventListener('keydown', function (e) {
    const modal = document.getElementById('lightbox-modal');
    if (!modal || modal.style.display !== 'flex') return;
    if (e.key === 'Escape') modal.style.display = 'none';
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
});

// 라이트박스 스와이프 지원
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('lightbox-modal');
    if (!modal) return;

    modal.addEventListener('touchstart', function (e) {
        lightboxTouchStartX = e.changedTouches[0].screenX;
    }, { passive: true });

    modal.addEventListener('touchend', function (e) {
        const diff = e.changedTouches[0].screenX - lightboxTouchStartX;
        if (Math.abs(diff) > 50) {
            navigateLightbox(diff > 0 ? -1 : 1);
            e.preventDefault();
        }
    });

    // 라이트박스 화살표 버튼
    const prevBtn = document.getElementById('lightbox-prev');
    const nextBtn = document.getElementById('lightbox-next');
    if (prevBtn) prevBtn.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(-1); });
    if (nextBtn) nextBtn.addEventListener('click', function (e) { e.stopPropagation(); navigateLightbox(1); });
});

// 갤러리 비디오 인라인 재생 (썸네일 → video 태그 교체)
window.playGalleryVideo = function (wrapper) {
    let video = wrapper.querySelector('video');
    const originalSrc = wrapper.getAttribute('data-video-src');

    // 썸네일 img만 있는 경우 → video 태그로 교체
    if (!video && originalSrc) {
        const thumbImg = wrapper.querySelector('img');
        if (thumbImg) thumbImg.style.display = 'none';
        video = document.createElement('video');
        video.playsInline = true;
        wrapper.insertBefore(video, wrapper.querySelector('.video-play-btn'));
    }

    wrapper.classList.add('playing');
    video.muted = false;
    video.controls = true;
    if (originalSrc) {
        video.src = originalSrc;
    }
    video.currentTime = 0;
    video.play();
    wrapper.onclick = null;
};

// 갤러리 이미지 인라인 확대/축소 토글.
window.toggleGalleryFullImage = function (imgEl, fullUrl) {
    const wrapper = imgEl.closest('.gallery-media-wrapper');
    if (!wrapper) return;

    if (imgEl.classList.contains('gallery-img-expanded')) {
        // 축소: 원본 썸네일로 복귀
        imgEl.classList.remove('gallery-img-expanded');
        if (imgEl._originalSrc) imgEl.src = imgEl._originalSrc;

        // AI 오버레이도 함께 접기
        const overlay = wrapper.querySelector('.gallery-ai-overlay');
        const aiBtn = wrapper.querySelector('.gallery-ai-overlay-btn');
        if (overlay) overlay.style.display = 'none';
        if (aiBtn) aiBtn.textContent = '분석 확인';
    } else {
        // 확대: 원본 고화질 로드
        imgEl._originalSrc = imgEl.src;
        imgEl.src = fullUrl;
        imgEl.classList.add('gallery-img-expanded');
    }
};

// 갤러리 AI분석 오버레이 토글 (이미지 확대도 함께 처리)
window.toggleGalleryAiOverlay = function (btnEl) {
    const wrapper = btnEl.closest('.gallery-media-wrapper');
    if (!wrapper) return;

    const overlay = wrapper.querySelector('.gallery-ai-overlay');
    if (!overlay) return;

    const imgEl = wrapper.querySelector('img');

    if (overlay.style.display === 'none' || !overlay.style.display) {
        // 이미지 확대 (아직 확대 안 된 경우)
        if (imgEl && !imgEl.classList.contains('gallery-img-expanded')) {
            const fullUrl = imgEl.getAttribute('onclick')?.match(/'([^']+)'\s*\)/)?.[1];
            if (fullUrl) {
                imgEl._originalSrc = imgEl.src;
                imgEl.src = fullUrl;
                imgEl.classList.add('gallery-img-expanded');
            }
        }

        // AI 오버레이 보이기
        const aiDataB64 = wrapper.getAttribute('data-ai-analysis');
        if (aiDataB64 && overlay.innerHTML.trim() === '') {
            try {
                const aiData = decodeURIComponent(escape(atob(aiDataB64)));
                const analysis = JSON.parse(aiData);
                // 식단 분석인지 운동 분석인지 수면/마음 분석인지 판별
                if (analysis.foods || (analysis.grade && !analysis.type)) {
                    renderDietAnalysisResult(overlay, analysis);
                } else if (analysis.intensity || analysis.exerciseType) {
                    renderExerciseAnalysisResult(analysis, overlay);
                } else if (analysis.type === 'sleep' || analysis.type === 'mind') {
                    renderSleepMindAnalysisResult(analysis, overlay);
                } else if (analysis.grade || analysis.feedback) {
                    renderSleepMindAnalysisResult(analysis, overlay);
                } else {
                    overlay.innerHTML = '<div style="padding:10px;color:#666;">분석 데이터가 없습니다.</div>';
                }
            } catch(e) {
                console.error('Gallery AI overlay parse error:', e);
                overlay.innerHTML = '<div style="padding:10px;color:#666;">분석 데이터를 읽을 수 없습니다.</div>';
            }
        }
        overlay.style.display = 'block';
        btnEl.textContent = '분석 닫기';
    } else {
        // 이미지 축소
        if (imgEl && imgEl.classList.contains('gallery-img-expanded')) {
            imgEl.classList.remove('gallery-img-expanded');
            if (imgEl._originalSrc) imgEl.src = imgEl._originalSrc;
        }

        overlay.style.display = 'none';
        btnEl.textContent = '분석 확인';
    }
};


// 구간 번호 → 알파벳 라벨 변환 (1→A, 2→B, ...)
function eraToLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26)); // 1→A, 2→B, ...26→Z
}

// 반감기 스케줄 테이블 활성 구간 하이라이트 + 현재 비율 동적 표시
function updateHalvingScheduleUI(currentPhase, per100Hbt) {
    const schedule = document.getElementById('halving-schedule');
    if (!schedule) return;
    const rows = schedule.children;
    for (let i = 0; i < rows.length; i++) {
        const phaseIdx = i + 1;
        const label = eraToLabel(phaseIdx);
        const spans = rows[i].querySelectorAll('span');
        if (phaseIdx === currentPhase) {
            rows[i].className = 'wallet-halving-row active';
            if (spans[0]) spans[0].textContent = `${label} 👈`;
            // 현재 구간은 온체인 비율로 동적 표시
            if (spans[1] && per100Hbt !== undefined) {
                const display = per100Hbt % 1 === 0 ? per100Hbt : per100Hbt.toFixed(1);
                spans[1].textContent = `100P = ${display} HBT`;
            }
        } else {
            rows[i].className = phaseIdx < currentPhase ? 'wallet-halving-row' : 'wallet-halving-row future';
            if (spans[0]) spans[0].textContent = label;
        }
    }
    // 하단 안내 문구 업데이트
    const tipEl = schedule.parentElement?.parentElement?.querySelector('.wallet-halving-tip');
    if (tipEl) {
        tipEl.innerHTML = `⚡ 지금은 <strong>${eraToLabel(currentPhase)}구간</strong>! 전환 비율은 매주 자동 조절됩니다. 채굴이 적으면 비율이 올라가요!`;
    }
}

// 자산 표시 캐시 (30초 TTL)
let _assetCache = { uid: null, ts: 0 };
const ASSET_CACHE_TTL = 30_000;

// 자산 표시 업데이트 함수
window.updateAssetDisplay = async function (forceRefresh = false) {
    const user = auth.currentUser;
    if (!user) return;

    // 캐시 히트: 30초 이내 같은 유저 → 스킵 (스켈레톤만 해제)
    const now = Date.now();
    if (!forceRefresh && _assetCache.uid === user.uid && (now - _assetCache.ts) < ASSET_CACHE_TTL) {
        if (window.hideWalletSkeleton) window.hideWalletSkeleton();
        return;
    }

    try {
        const userRef = doc(db, "users", user.uid);

        // 모든 Firestore 쿼리를 동시에 실행 (순차 → 병렬, 5초→1초)
        const _todayStr = getKstDateString();
        const _todayLogId = `${user.uid}_${_todayStr}`;
        const _sevenDaysAgo = new Date();
        _sevenDaysAgo.setDate(_sevenDaysAgo.getDate() - 6);
        const _startDateStr = _sevenDaysAgo.toISOString().split('T')[0];

        const _p_user = getDoc(userRef);
        const _p_todayLog = getDoc(doc(db, 'daily_logs', _todayLogId)).catch(() => null);
        const _p_hbtTx = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'conversion'),
            where('status', '==', 'success'),
            where('date', '==', _todayStr)
        )).catch(() => null);
        // 챌린지 정산 HBT 오늘 집계 (challenge_settlement 타입)
        const _p_settleTx = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'challenge_settlement'),
            where('status', '==', 'success'),
            where('date', '==', _todayStr)
        )).catch(() => null);
        const _p_minichart = getDocs(query(
            collection(db, 'blockchain_transactions'),
            where('userId', '==', user.uid),
            where('type', '==', 'conversion'),
            where('status', '==', 'success'),
            where('date', '>=', _startDateStr)
        )).catch(() => null);
        const _p_txHistory = getDocs(query(
            collection(db, "blockchain_transactions"),
            where("userId", "==", user.uid),
            orderBy("timestamp", "desc"),
            limit(20)
        )).catch(() => null);

        const userSnap = await _p_user;

        if (userSnap.exists()) {
            const userData = userSnap.data();

            // 캐시 갱신
            _assetCache = { uid: user.uid, ts: Date.now() };

            // 포인트 표시 업데이트
            const pointsDisplay = document.getElementById('asset-points-display');
            if (pointsDisplay) {
                const ptsVal = parseInt(userData.coins || 0);
                pointsDisplay.innerHTML = `${ptsVal.toLocaleString()} <span class="wallet-asset-unit">P</span>`;
            }

            // HBT 표시 업데이트
            // HBT 표시: 온체인 잔액이 진실의 원천 (hbtBalance 사용 안 함)
            const hbtDisplay = document.getElementById('asset-hbt-display');
            if (hbtDisplay) {
                hbtDisplay.innerHTML = `<span style="color:#aaa">조회 중...</span>`;
            }

            // ========== 자산 변동 표시 (오늘 획득분 - daily_logs에서 계산) ==========
            const pointsDeltaEl = document.getElementById('asset-points-delta');
            if (pointsDeltaEl) {
                let todayPoints = 0;
                try {
                    const todayLogSnap = await _p_todayLog;
                    if (todayLogSnap && todayLogSnap.exists()) {
                        const ap = todayLogSnap.data().awardedPoints || {};
                        todayPoints = (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0);
                    }
                } catch (_) {}
                if (todayPoints > 0) {
                    pointsDeltaEl.innerHTML = `<span class="dot"></span>+${todayPoints}P 오늘`;
                    pointsDeltaEl.className = 'wallet-onchain-badge today-delta up';
                    pointsDeltaEl.style.display = 'inline-flex';
                } else {
                    pointsDeltaEl.innerHTML = `<span class="dot"></span>0P 오늘`;
                    pointsDeltaEl.className = 'wallet-onchain-badge today-delta neutral';
                    pointsDeltaEl.style.display = 'inline-flex';
                }
            }
            // 오늘 변환 HBT 합산 (델타 + 일일 한도 양쪽에서 사용)
            let todayHbt = 0;
            try {
                const hbtTxSnap = await _p_hbtTx;
                if (hbtTxSnap) hbtTxSnap.forEach(d => { todayHbt += d.data().hbtReceived || 0; });
                // 챌린지 정산 HBT도 오늘 합산
                const settleTxSnap = await _p_settleTx;
                if (settleTxSnap) settleTxSnap.forEach(d => { todayHbt += d.data().amount || 0; });
            } catch (_) {}
            const hbtDeltaEl = document.getElementById('asset-hbt-delta');
            if (hbtDeltaEl) {
                if (todayHbt > 0) {
                    hbtDeltaEl.innerHTML = `<span class="dot"></span>+${todayHbt} HBT 오늘`;
                    hbtDeltaEl.className = 'wallet-onchain-badge today-delta up';
                    hbtDeltaEl.style.display = 'inline-flex';
                } else {
                    hbtDeltaEl.style.display = 'none';
                }
            }

            // ========== 7일 미니차트 (blockchain_transactions에서 실시간 조회) ==========
            const minichartBars = document.getElementById('minichart-bars');
            if (minichartBars) {
                try {
                    const dayLabels = ['일','월','화','수','목','금','토'];
                    const nowDate = new Date();
                    const todayDow = nowDate.getDay();
                    const data = Array(7).fill(0);

                    // 7일 전 날짜 (병렬 쿼리에서 이미 조회됨)
                    const sevenDaysAgo = _sevenDaysAgo;

                    const txSnap = await _p_minichart;
                    if (txSnap) txSnap.forEach(d => {
                        const txDate = new Date(d.data().date + 'T12:00:00');
                        const diffDays = Math.round((txDate - sevenDaysAgo) / 86400000);
                        if (diffDays >= 0 && diffDays < 7) {
                            data[diffDays] += d.data().hbtReceived || 0;
                        }
                    });

                    const maxVal = Math.max(...data, 1);
                    let barsHtml = '';
                    for (let i = 0; i < 7; i++) {
                        const dayIdx = (todayDow - 6 + i + 7) % 7;
                        const heightPct = Math.round((data[i] / maxVal) * 100);
                        const isToday = i === 6;
                        const valLabel = data[i] > 0 ? `<span class="wallet-minichart-bar-value">${data[i]}</span>` : '';
                        barsHtml += `<div class="wallet-minichart-bar${isToday ? ' today' : ''}" style="height:${Math.max(heightPct, 4)}%;" title="${data[i]} HBT">${valLabel}<span class="wallet-minichart-bar-label">${dayLabels[dayIdx]}</span></div>`;
                    }
                    minichartBars.innerHTML = barsHtml;
                } catch (chartErr) {
                    console.warn('미니차트 로드 실패:', chartErr.message);
                }
            }

            // ========== 변환 비율 배지 & 일일 한도 ==========
            // 변환 비율은 fetchTokenStats()에서 전체 기준으로 업데이트
            const dailyLimitEl = document.getElementById('convert-daily-limit');
            if (dailyLimitEl) {
                const dailyMax = 5000;
                const remaining = Math.max(dailyMax - todayHbt, 0);
                dailyLimitEl.innerHTML = `오늘 변환 한도: <strong>${remaining.toLocaleString()} / ${dailyMax.toLocaleString()} HBT</strong>`;
            }

            // 스켈레톤 해제
            if (window.hideWalletSkeleton) window.hideWalletSkeleton();

            // 온체인 잔액으로 메인 HBT 표시 업데이트
            if (window.fetchOnchainBalance) {
                window.fetchOnchainBalance().then(onchainData => {
                    const hbtEl = document.getElementById('asset-hbt-display');
                    if (onchainData && onchainData.balanceFormatted) {
                        const val = parseFloat(onchainData.balanceFormatted);
                        const str = val % 1 === 0 ? val.toLocaleString() : val.toLocaleString(undefined, {maximumFractionDigits: 1});
                        if (hbtEl) hbtEl.innerHTML = `${str} <span class="wallet-asset-unit">HBT</span>`;
                        const onchainBadge = document.getElementById('asset-hbt-onchain');
                        if (onchainBadge) {
                            const onchainText = document.getElementById('asset-hbt-onchain-text');
                            if (onchainText) onchainText.textContent = `온체인 (Base Sepolia)`;
                            onchainBadge.style.display = 'inline-flex';
                        }
                    } else {
                        if (hbtEl) hbtEl.innerHTML = `0 <span class="wallet-asset-unit">HBT</span>`;
                    }
                }).catch(err => {
                    console.warn('온체인 잔액 조회 스킵:', err.message);
                    const hbtEl = document.getElementById('asset-hbt-display');
                    if (hbtEl) hbtEl.innerHTML = `0 <span class="wallet-asset-unit">HBT</span>`;
                });
            }

            // ========== 반감기 상태 UI 업데이트 (온체인 전체 채굴량 기준, v2) ==========
            fetchTokenStats().then(stats => {
                if (!stats) {
                    console.warn('토큰 통계 조회 실패, 개인 데이터로 펴백');
                    return;
                }
                const globalMinted = parseFloat(stats.totalMined) || 0;
                const phase = stats.currentPhase || 1;
                // v2: currentRate는 RATE_SCALE(10^8) 단위
                const RATE_SCALE = 1e8;
                const ratePerPoint = (stats.currentRate || RATE_SCALE) / RATE_SCALE;
                const per100 = Math.round(ratePerPoint * 100 * 100) / 100; // 100P 기준

                const halvingEraEl = document.getElementById('halving-era');
                if (halvingEraEl) halvingEraEl.textContent = eraToLabel(phase);

                const halvingRateEl = document.getElementById('halving-rate');
                if (halvingRateEl) {
                    halvingRateEl.textContent = `100P = ${per100} HBT`;
                }

                // 반감기 스케줄 테이블 활성 구간 + 동적 비율 표시
                updateHalvingScheduleUI(phase, per100);

                // 변환 비율 배지 업데이트 (전체 기준)
                const rateBadge = document.getElementById('convert-rate-badge');
                if (rateBadge) {
                    const display = per100 % 1 === 0 ? per100 : per100.toFixed(1);
                    rateBadge.textContent = `현재 ${eraToLabel(phase)}구간 · 100P = ${display} HBT`;
                }

                // v2 Phase 경계 기반 진행률 계산
                const phaseBounds = [0, 35_000_000, 52_500_000, 61_250_000, 70_000_000];
                const phaseStart = phaseBounds[Math.min(phase - 1, phaseBounds.length - 2)] || 0;
                const phaseEnd = phaseBounds[Math.min(phase, phaseBounds.length - 1)] || 70_000_000;
                const phasePool = phaseEnd - phaseStart;
                const mintedInPhase = Math.max(globalMinted - phaseStart, 0);
                const progressPct = phasePool > 0 ? Math.min((mintedInPhase / phasePool) * 100, 100) : 0;

                const halvingProgressText = document.getElementById('halving-progress-text');
                if (halvingProgressText) {
                    halvingProgressText.textContent = `${Math.round(mintedInPhase).toLocaleString()} / ${phasePool.toLocaleString()} HBT`;
                }

                const halvingProgressBar = document.getElementById('halving-progress-bar');
                if (halvingProgressBar) {
                    if (mintedInPhase > 0 && progressPct < 1) {
                        halvingProgressBar.style.width = '1%';
                    } else {
                        halvingProgressBar.style.width = progressPct.toFixed(1) + '%';
                    }
                }
            }).catch(err => console.warn('반감기 통계 로드 실패:', err.message));

            // 헤더의 포인트 배지도 업데이트
            const pointBadge = document.getElementById('point-balance');
            if (pointBadge) {
                pointBadge.textContent = (userData.coins || 0);
            }

            // ========== 활성 챌린지 UI (통합 전용, 미니→위클리→마스터 순) ==========
            const challengeContainer = document.getElementById('active-challenge-container');
            const challengeInfo = document.getElementById('active-challenge-info');
            const challengeSelection = document.getElementById('challenge-selection');

            // activeChallenges 수집 (legacy 마이그레이션 포함)
            let activeChallenges = userData.activeChallenges || {};
            if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
                const legacyId = userData.activeChallenge.challengeId;
                const legacyTier = {
                    'challenge-3d': 'mini', 'challenge-7d': 'weekly', 'challenge-30d': 'master',
                    'challenge-diet-3d': 'mini', 'challenge-exercise-3d': 'mini', 'challenge-mind-3d': 'mini', 'challenge-all-3d': 'mini',
                    'challenge-diet-7d': 'weekly', 'challenge-exercise-7d': 'weekly', 'challenge-mind-7d': 'weekly', 'challenge-all-7d': 'weekly',
                    'challenge-diet-30d': 'master', 'challenge-exercise-30d': 'master', 'challenge-mind-30d': 'master', 'challenge-all-30d': 'master'
                }[legacyId] || 'master';
                if (!activeChallenges[legacyTier]) activeChallenges[legacyTier] = userData.activeChallenge;
            }

            // 미니 → 위클리 → 마스터 순서로 정렬
            const tierOrder = ['mini', 'weekly', 'master'];
            const activeTiers = tierOrder.filter(t => {
                const s = activeChallenges[t]?.status;
                return s === 'ongoing' || s === 'claimable';
            });
            const tierLabels = { mini: '⚡ 3일 미니', weekly: '🔥 7일 위클리', master: '🏆 30일 마스터' };
            const tierColors = { mini: '#4CAF50', weekly: '#FF9800', master: '#E65100' };
            const tierRewardP = { mini: 30, weekly: 100, master: 500 };
            const tierBonusRate = { mini: 0, weekly: 0.5, master: 1.0 };

            if (activeTiers.length > 0) {
                let challengeHtml = '';
                const tierBgClass = { mini: 'tier-mini-bg', weekly: 'tier-weekly-bg', master: 'tier-master-bg' };
                for (const tier of activeTiers) {
                    const ch = activeChallenges[tier];
                    const totalDays = parseInt(ch.totalDays) || 30;
                    const completed = parseInt(ch.completedDays) || 0;
                    const progressPct = Math.round((completed / totalDays) * 100);
                    const remain = totalDays - completed;
                    const color = tierColors[tier];
                    const stakeText = ch.hbtStaked > 0 ? `💰 ${escapeHtml(String(ch.hbtStaked))} HBT` : '🎯 무료';
                    const isClaimable = ch.status === 'claimable';

                    // SVG ring chart
                    const radius = 40;
                    const circumference = 2 * Math.PI * radius;
                    const dashOffset = circumference - (circumference * Math.min(progressPct, 100) / 100);

                    if (isClaimable) {
                        // 수령 대기 카드
                        challengeHtml += `
                        <div class="challenge-ring-card ${tierBgClass[tier]} claimable" onclick="claimChallengeReward('${tier}')">
                            <svg class="challenge-ring-svg" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="8"/>
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
                                <text x="50" y="50" text-anchor="middle" font-size="18" dominant-baseline="central" fill="${color}">🎉</text>
                            </svg>
                            <div class="challenge-ring-info">
                                <div class="challenge-ring-name">${tierLabels[tier]} 성공!</div>
                                <div class="challenge-ring-date">${completed}/${totalDays}일 달성 (${progressPct}%)</div>
                                <div class="challenge-ring-stake">${stakeText}</div>
                                <div class="challenge-ring-claim">👆 탭하여 보상 수령</div>
                            </div>
                        </div>
                    `;
                    } else {
                        // 진행 중 카드
                        challengeHtml += `
                        <div class="challenge-ring-card ${tierBgClass[tier]}">
                            <button class="challenge-ring-forfeit" onclick="event.stopPropagation(); forfeitChallenge('${tier}')">포기</button>
                            <svg class="challenge-ring-svg" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="rgba(0,0,0,0.1)" stroke-width="8"/>
                                <circle cx="50" cy="50" r="${radius}" fill="none" stroke="${color}" stroke-width="8"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                                    stroke-linecap="round" transform="rotate(-90 50 50)"/>
                                <text x="50" y="46" text-anchor="middle" font-size="14" font-weight="bold" fill="${color}">${progressPct}%</text>
                                <text x="50" y="60" text-anchor="middle" font-size="7" fill="#666">${completed}/${totalDays}일</text>
                            </svg>
                            <div class="challenge-ring-info">
                                <div class="challenge-ring-name">${tierLabels[tier]}</div>
                                <div class="challenge-ring-date">${escapeHtml(String(ch.startDate))} ~ ${escapeHtml(String(ch.endDate))}</div>
                                <div class="challenge-ring-stake">${stakeText}</div>
                                <div class="challenge-ring-remain">남은 ${remain}일 · 완료 시 ${(() => {
                                    const pts = tierRewardP[tier];
                                    if (ch.hbtStaked > 0) {
                                        const totalHbt = ch.hbtStaked + Math.floor(ch.hbtStaked * tierBonusRate[tier]);
                                        return `${pts}P + ${totalHbt} HBT`;
                                    }
                                    return `${pts}P`;
                                })()}</div>
                            </div>
                        </div>
                    `;
                    }
                }
                if (challengeContainer) {
                    challengeContainer.style.display = 'block';
                    challengeInfo.innerHTML = challengeHtml;
                }
                // 진행 중인 티어 카드 비활성화
                for (const t of tierOrder) {
                    const card = document.getElementById('tier-card-' + t);
                    if (card) {
                        if (activeTiers.includes(t)) {
                            card.style.opacity = '0.4';
                            card.style.pointerEvents = 'none';
                        } else {
                            card.style.opacity = '1';
                            card.style.pointerEvents = 'auto';
                        }
                    }
                }
                // 챌린지 신청 섹션: 활성 챌린지 있으면 접힌 상태로 토글 표시
                if (challengeSelection) {
                    challengeSelection.style.display = '';
                    const toggleBtn = document.getElementById('challenge-toggle-btn');
                    const tierWrap = document.getElementById('challenge-tier-wrap');
                    if (toggleBtn) toggleBtn.style.display = 'flex';
                    if (tierWrap) tierWrap.style.display = 'none';
                    const arrow = document.getElementById('challenge-toggle-arrow');
                    if (arrow) arrow.classList.remove('open');
                    const text = document.getElementById('challenge-toggle-text');
                    if (text) text.textContent = '📋 새 챌린지 시작하기';
                }
            } else {
                if (challengeContainer) challengeContainer.style.display = 'none';
                for (const t of tierOrder) {
                    const card = document.getElementById('tier-card-' + t);
                    if (card) { card.style.opacity = '1'; card.style.pointerEvents = 'auto'; }
                }
                // 챌린지 없으면 신청 섹션 바로 노출
                if (challengeSelection) {
                    challengeSelection.style.display = '';
                    const toggleBtn = document.getElementById('challenge-toggle-btn');
                    const tierWrap = document.getElementById('challenge-tier-wrap');
                    if (toggleBtn) toggleBtn.style.display = 'none';
                    if (tierWrap) tierWrap.style.display = '';
                }
            }

            // ========== 거래 기록 로드 ==========
            const txContainer = document.getElementById('transaction-history');
            if (txContainer) {
                try {
                    const txSnap = await _p_txHistory;

                    if (!txSnap || txSnap.empty) {
                        txContainer.innerHTML = `
                            <div class="wallet-tx-empty-cta">
                                <div class="wallet-tx-empty-icon">💎</div>
                                <div class="wallet-tx-empty-text">아직 거래 기록이 없습니다</div>
                                <div class="wallet-tx-empty-sub">포인트를 HBT로 변환하면 여기에 기록됩니다</div>
                                <button class="wallet-tx-empty-btn" onclick="document.getElementById('convert-point-input')?.focus(); setConvertAmount(100);">첫 HBT 변환하기 →</button>
                            </div>`;
                    } else {
                        let txHtml = '';
                        txSnap.forEach(txDoc => {
                            const tx = txDoc.data();
                            const txDate = tx.timestamp?.toDate?.() ? tx.timestamp.toDate().toLocaleDateString('ko-KR') : '-';
                            const txIcons = {
                                'conversion': '🔄',
                                'staking': '🔐',
                                'challenge_settlement': '🏆',
                                'withdrawal': '📤'
                            };
                            const txLabels = {
                                'conversion': 'P→HBT 변환',
                                'staking': '챌린지 예치',
                                'challenge_settlement': '챌린지 정산',
                                'withdrawal': '출금'
                            };
                            const txIconClass = {
                                'conversion': 'convert',
                                'staking': 'stake',
                                'challenge_settlement': 'settle',
                                'withdrawal': 'withdraw'
                            };
                            const icon = txIcons[tx.type] || '📋';
                            const label = txLabels[tx.type] || escapeHtml(String(tx.type));
                            const iconClass = txIconClass[tx.type] || 'convert';
                            const statusText = tx.status === 'success' ? '✅ 완료' : tx.status === 'failed' ? '❌ 실패' : '⏳ 대기';

                            let amountText = '';
                            let amountClass = '';
                            if (tx.type === 'conversion') {
                                amountText = `+${parseFloat(tx.hbtReceived) || 0} HBT`;
                                amountClass = 'positive';
                            } else if (tx.type === 'staking') {
                                amountText = `-${parseFloat(tx.amount) || 0} HBT`;
                                amountClass = 'negative';
                            } else if (tx.type === 'challenge_settlement') {
                                const amt = parseFloat(tx.amount);
                                amountText = amt > 0 ? `+${amt} HBT` : '소멸';
                                amountClass = amt > 0 ? 'positive' : 'negative';
                            } else {
                                amountText = `${parseFloat(tx.amount) || 0} HBT`;
                            }

                            txHtml += `
                                <div class="wallet-tx-item">
                                    <div class="wallet-tx-left">
                                        <div class="wallet-tx-icon ${iconClass}">${icon}</div>
                                        <div>
                                            <div class="wallet-tx-label">${label}</div>
                                            <div class="wallet-tx-date">${txDate}</div>
                                        </div>
                                    </div>
                                    <div class="wallet-tx-right">
                                        <div class="wallet-tx-amount ${amountClass}">${amountText}</div>
                                        <div class="wallet-tx-status">${statusText}</div>
                                    </div>
                                </div>
                            `;
                        });
                        txContainer.innerHTML = txHtml;
                    }
                } catch (txErr) {
                    console.warn('⚠️ 거래 기록 로드 스킵:', txErr.message);
                    if (txErr.message?.includes('index')) {
                        console.info('💡 Firebase Console에서 복합 인덱스를 생성해주세요. 위 에러 메시지의 링크를 클릭하면 자동 생성됩니다.');
                    }
                    if (txContainer) {
                        txContainer.innerHTML = '<p class="wallet-tx-empty">거래 기록을 불러오는 중입니다...</p>';
                    }
                }
            }
        }
    } catch (error) {
        console.error('자산 표시 업데이트 오류:', error);
    }
};

// 탭 관리
function openTab(tabName, pushState = true) {
    const user = auth.currentUser;
    if (!user && tabName !== 'gallery') {
        document.getElementById('login-modal').style.display = 'flex'; return;
    }
    if (pushState) history.pushState({ tab: tabName }, '', '#' + tabName);

    const contents = document.getElementsByClassName("content-section");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    const btns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < btns.length; i++) {
        btns[i].classList.remove("active");
        btns[i].removeAttribute("aria-current");
    }

    // 갤러리 탭은 ID로 직접 선택 (더 안정적)
    let targetBtn;
    if (tabName === 'gallery') {
        targetBtn = document.getElementById('btn-tab-gallery');
    } else {
        targetBtn = document.querySelector(`button[onclick*="openTab('${tabName}'"]`);
    }
    if (targetBtn) {
        targetBtn.classList.add("active");
        targetBtn.setAttribute("aria-current", "page");
    }
    document.getElementById(tabName).style.display = "block";

    const submitBar = document.getElementById('submit-bar');
    const saveBtn = document.getElementById('saveDataBtn');
    const chatBanner = document.getElementById('chat-banner');

    if (tabName === 'dashboard' || tabName === 'profile' || tabName === 'assets') {
        submitBar.style.display = 'none';

        // 자산 탭 열릴 때: 블록체인 모듈 지연 로드 후 자산 표시
        if (tabName === 'assets' && user) {
            const load = window._loadBlockchainModule || (() => Promise.resolve());
            load().then(() => {
                if (window.settleExpiredChallenges) {
                    window.settleExpiredChallenges().catch(() => {});
                }
                updateAssetDisplay();
            });
        }
    } else if (tabName === 'gallery') {
        submitBar.style.display = 'block';
        if (!user) {
            saveBtn.innerText = '🌟 구글 로그인하고 함께 참여하기';
            saveBtn.style.background = 'linear-gradient(135deg, #FF8C00 0%, #FF6D00 100%)';
            saveBtn.style.color = 'white';
            saveBtn.style.boxShadow = '0 4px 14px rgba(255,109,0,0.3)';
            saveBtn.onclick = () => { document.getElementById('login-modal').style.display = 'flex'; };
        } else {
            saveBtn.innerText = '💬 해빛스쿨 단톡방 참여하기';
            saveBtn.style.background = '#FEE500';
            saveBtn.style.color = '#3E2723';
            saveBtn.style.boxShadow = '0 4px 14px rgba(254,229,0,0.4)';
            saveBtn.onclick = () => window.open('https://open.kakao.com/o/gv23urgi', '_blank');
        }
    } else {
        submitBar.style.display = 'block';
        saveBtn.innerText = '현재 진행상황 저장 & 포인트 받기 🅿️';
        saveBtn.style.background = 'linear-gradient(135deg, #FF8C00 0%, #FF6D00 100%)';
        saveBtn.style.color = 'white';
        saveBtn.style.boxShadow = '0 4px 14px rgba(255,109,0,0.3)';
        saveBtn.onclick = null; // 기본 이벤트 리스너로 복원
    }

    if (tabName === 'gallery') {
        chatBanner.style.display = 'none';
        loadGalleryData();
    } else {
        chatBanner.style.display = 'none';
        // 갤러리 탭을 벗어날 때 무한 스크롤 옵저버 해제 (메모리 절약)
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
            galleryIntersectionObserver = null;
        }

        // 입력 폼 탭 전환 시 데이터 재로드 불필요 (이미 로드된 상태)
        // 날짜 변경 시에만 loadDataForSelectedDate 호출됨
        // 식단 탭에서 공복 지표 그래프 로드
        if (tabName === 'diet' && user) {
            loadFastingGraphData(user.uid);
        }
    }

    if (tabName === 'dashboard') renderDashboard();

    setTimeout(() => { document.getElementById(tabName).classList.add("active"); }, 10);
};

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tab) openTab(e.state.tab, false);
    else openTab('dashboard', false);
});

// 페이지 종료 시 리소스 정리 (메모리 누수 방지)
window.addEventListener('beforeunload', () => {
    cleanupGalleryResources();
});

// 중복 제거: 로그인 및 인증 로직은 auth.js 모듈에서 처리

window.hideFeedback = function () {
    document.getElementById('admin-feedback-box').style.display = 'none';
    const user = auth.currentUser;
    if (user) localStorage.setItem('hide_fb_' + user.uid, 'true');
};

// 중복 제거: 인증 상태 리스너는 auth.js의 setupAuthListener에서 처리

window.saveHealthProfile = async function () {
    const user = auth.currentUser;
    if (!user) return;
    const smm = document.getElementById('prof-smm').value;
    const fat = document.getElementById('prof-fat').value;
    const visceral = document.getElementById('prof-visceral').value;
    const bmr = document.getElementById('prof-bmr').value;
    let meds = [];
    document.querySelectorAll('input[name="med-chk"]:checked').forEach(chk => meds.push(chk.value));
    const medOther = document.getElementById('prof-med-other').value;

    const now = new Date();
    const dateStr = getKstDateString();
    const profileData = { smm, fat, visceral, bmr, meds, medOther, updatedAt: now.toISOString() };

    try {
        // 현재 프로필 저장
        await setDoc(doc(db, "users", user.uid), { healthProfile: profileData }, { merge: true });

        // 인바디 히스토리 저장 (체성분 데이터가 하나라도 있을 때)
        if (smm || fat || visceral) {
            await setDoc(doc(db, "users", user.uid, "inbodyHistory", dateStr), {
                smm: smm ? parseFloat(smm) : null,
                fat: fat ? parseFloat(fat) : null,
                visceral: visceral ? parseFloat(visceral) : null,
                bmr: bmr ? parseFloat(bmr) : null,
                date: dateStr,
                timestamp: now.toISOString()
            });
        }

        showToast("🧬 프로필이 저장되었습니다!");

        // 마지막 측정일 표시
        updateInbodyLastDate(dateStr);

        // 인바디 히스토리 UI 갱신
        loadInbodyHistory();

        // 대사건강 점수 자동 업데이트
        updateMetabolicScoreUI();
    } catch (e) {
        console.error('프로필 저장 오류:', e);
        showToast(`⚠️ 프로필 저장 실패: ${e.message || '알 수 없는 오류'}`);
    }
};

// 인바디 마지막 측정일 표시
function updateInbodyLastDate(dateStr) {
    const el = document.getElementById('prof-last-date');
    if (el && dateStr) {
        el.textContent = `마지막 측정: ${dateStr}`;
    }
}

// 인바디 히스토리 로드 및 변화 추이 렌더링
window.loadInbodyHistory = async function () {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('inbody-history-container');
    if (!container) return;

    try {
        const q = query(
            collection(db, "users", user.uid, "inbodyHistory"),
            orderBy("date", "desc"),
            limit(10)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.style.display = 'none';
            return;
        }

        const records = [];
        snapshot.forEach(d => records.push(d.data()));
        records.reverse(); // 오래된 순으로 정렬

        // 마지막 측정일 표시
        const latest = records[records.length - 1];
        updateInbodyLastDate(latest.date);

        container.style.display = 'block';

        // 최근 2개 비교 (변화량 표시)
        let changeHtml = '';
        if (records.length >= 2) {
            const prev = records[records.length - 2];
            const curr = records[records.length - 1];
            const changes = [];

            if (curr.smm != null && prev.smm != null) {
                const diff = (curr.smm - prev.smm).toFixed(1);
                const sign = diff > 0 ? '+' : '';
                const color = diff > 0 ? '#2E7D32' : diff < 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">💪 근육 ${sign}${diff}kg</span>`);
            }
            if (curr.fat != null && prev.fat != null) {
                const diff = (curr.fat - prev.fat).toFixed(1);
                const sign = diff > 0 ? '+' : '';
                const color = diff < 0 ? '#2E7D32' : diff > 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">🔥 체지방 ${sign}${diff}kg</span>`);
            }
            if (curr.visceral != null && prev.visceral != null) {
                const diff = curr.visceral - prev.visceral;
                const sign = diff > 0 ? '+' : '';
                const color = diff < 0 ? '#2E7D32' : diff > 0 ? '#C62828' : '#888';
                changes.push(`<span style="color:${color}">🎯 내장지방 ${sign}${diff}</span>`);
            }

            if (changes.length > 0) {
                changeHtml = `
                    <div style="display:flex; gap:12px; flex-wrap:wrap; padding:10px 12px; background:var(--white); border-radius:8px; margin-bottom:10px; font-size:13px; font-weight:600;">
                        ${changes.join('')}
                    </div>
                    <div style="font-size:11px; color:#aaa; margin-bottom:6px;">📅 ${prev.date} → ${curr.date} 변화</div>
                `;
            }
        }

        // 히스토리 테이블
        const rows = records.map(r => {
            return `<tr>
                <td style="font-size:12px; color:#888;">${r.date?.slice(5) || '-'}</td>
                <td>${r.smm != null ? r.smm : '-'}</td>
                <td>${r.fat != null ? r.fat : '-'}</td>
                <td>${r.visceral != null ? r.visceral : '-'}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="border-top:1px solid #eee; padding-top:12px;">
                <div style="font-size:14px; font-weight:600; margin-bottom:8px;">📈 체성분 변화 추이</div>
                ${changeHtml}
                <div style="overflow-x:auto;">
                    <table style="width:100%; font-size:13px; border-collapse:collapse; text-align:center;">
                        <thead>
                            <tr style="border-bottom:2px solid #eee; color:#888; font-size:11px;">
                                <th style="padding:6px 4px;">날짜</th>
                                <th style="padding:6px 4px;">근육(kg)</th>
                                <th style="padding:6px 4px;">체지방(kg)</th>
                                <th style="padding:6px 4px;">내장지방</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    } catch (e) {
        console.warn('인바디 히스토리 로드 스킵:', e.message);
    }
};

// 혈액검사 결과지 사진 업로드 및 분석
async function uploadBloodTestPhoto(inputEl) {
    const file = inputEl.files?.[0];
    if (!file) return;

    const user = auth.currentUser;
    if (!user) { showToast('⚠️ 로그인이 필요합니다.'); return; }

    if (!isValidFileType(file, ['image/jpeg', 'image/png', 'image/webp', 'image/heic'])) {
        showToast('⚠️ 이미지 파일만 업로드할 수 있습니다.');
        return;
    }

    const resultContainer = document.getElementById('blood-test-result');
    if (resultContainer) {
        resultContainer.innerHTML = '<div class="loading-dots" style="padding:20px; text-align:center;"><span></span><span></span><span></span></div><div style="text-align:center; font-size:13px; color:#888;">AI가 혈액검사 결과를 분석하고 있습니다...</div>';
        resultContainer.style.display = 'block';
    }

    try {
        // 이미지 압축
        const compressed = await compressImage(file);

        // Firebase Storage에 업로드
        const dateStr = getKstDateString();
        const storageRef = ref(storage, `blood_tests/${user.uid}/${dateStr}_${Date.now()}.jpg`);
        await uploadBytes(storageRef, compressed);
        const imageUrl = await getDownloadURL(storageRef);

        // AI 분석 요청
        const analysis = await requestBloodTestAnalysis(imageUrl);
        if (analysis && resultContainer) {
            renderBloodTestResult(resultContainer, analysis);

            // 날짜 표시
            const dateEl = document.getElementById('blood-test-date');
            if (dateEl) dateEl.textContent = `분석일: ${dateStr}`;

            showToast('🩸 혈액검사 분석이 완료되었습니다!');

            // 대사건강 점수 자동 갱신 (혈당/중성지방 반영)
            updateMetabolicScoreUI();

            // 이력 갱신
            loadBloodTestHistory();
        } else if (resultContainer) {
            resultContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#C62828;">⚠️ 분석에 실패했습니다. 사진이 선명한지 확인해주세요.</div>';
        }
    } catch (e) {
        console.error('혈액검사 업로드 오류:', e);
        if (resultContainer) {
            resultContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#C62828;">⚠️ 업로드 중 오류가 발생했습니다.</div>';
        }
    } finally {
        inputEl.value = '';
    }
}

// 혈액검사 이력 로드
async function loadBloodTestHistory() {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('blood-test-history');
    if (!container) return;

    try {
        const q = query(
            collection(db, "users", user.uid, "bloodTests"),
            orderBy("analyzedAt", "desc"),
            limit(5)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            container.style.display = 'none';
            return;
        }

        const records = [];
        snapshot.forEach(d => records.push({ id: d.id, ...d.data() }));

        const rowsHtml = records.map(r => {
            const grade = r.overallGrade || '-';
            const gradeColors = { 'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828' };
            const color = gradeColors[grade] || '#888';
            const metrics = r.metrics || {};
            const gl = metrics.glucose?.value || '-';
            const tg = metrics.triglyceride?.value || '-';
            const hba1c = metrics.hba1c?.value || '-';
            return `<tr>
                <td style="font-size:12px; color:#888;">${r.id || '-'}</td>
                <td style="font-weight:700; color:${color};">${grade}</td>
                <td>${gl}</td>
                <td>${tg}</td>
                <td>${hba1c}</td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="border-top:1px solid #eee; padding-top:12px; margin-top:12px;">
                <div style="font-size:14px; font-weight:600; margin-bottom:8px;">📋 이전 검사 이력</div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; font-size:13px; border-collapse:collapse; text-align:center;">
                        <thead>
                            <tr style="border-bottom:2px solid #eee; color:#888; font-size:11px;">
                                <th style="padding:6px 4px;">날짜</th>
                                <th style="padding:6px 4px;">등급</th>
                                <th style="padding:6px 4px;">혈당</th>
                                <th style="padding:6px 4px;">중성지방</th>
                                <th style="padding:6px 4px;">HbA1c</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
        container.style.display = 'block';
    } catch (e) {
        console.warn('혈액검사 이력 로드 스킵:', e.message);
    }
}

// 대시보드 캐시
let _dashboardCache = { uid: null, data: null, ts: 0 };
const DASHBOARD_CACHE_TTL = 30_000;
const LS_DASHBOARD_KEY = 'dashboardData_v1';

function _saveDashboardToLS(uid, data) {
    try {
        localStorage.setItem(LS_DASHBOARD_KEY, JSON.stringify({ uid, ts: Date.now(), ...data }));
    } catch (_) {}
}

function _loadDashboardFromLS(uid) {
    try {
        const raw = localStorage.getItem(LS_DASHBOARD_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (d.uid !== uid) return null;
        return d;
    } catch (_) { return null; }
}

async function _fetchDashboardViaCloudFunction(uid, weekStart, weekEnd) {
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
    const functions = getFunctions(undefined, 'asia-northeast3');
    const fn = httpsCallable(functions, 'getDashboardData');
    const result = await fn({ weekStart, weekEnd });
    return result.data;
}

async function renderDashboard() {
    const user = auth.currentUser;
    if (!user) return;

    const { todayStr, weekStrs } = getDatesInfo();
    const currentWeekId = getWeekId(todayStr);

    // 1차: 메모리 캐시 (30초 TTL)
    const now = Date.now();
    if (_dashboardCache.uid === user.uid && (now - _dashboardCache.ts) < DASHBOARD_CACHE_TTL && _dashboardCache.data) {
        _renderDashboardWithData(_dashboardCache.data, todayStr, weekStrs, currentWeekId, user);
        return;
    }

    // 2차: localStorage 캐시 → 즉시 렌더 + 백그라운드 갱신
    const lsData = _loadDashboardFromLS(user.uid);
    if (lsData) {
        _renderDashboardWithData(lsData, todayStr, weekStrs, currentWeekId, user);
        _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId).catch(() => {});
        return;
    }

    // 3차: 캐시 없음 → 로딩 표시 + 서버 fetch
    const dashEl = document.getElementById('dashboard');
    if (dashEl && !dashEl.querySelector('.dashboard-loading-indicator')) {
        const loader = document.createElement('div');
        loader.className = 'dashboard-loading-indicator';
        loader.innerHTML = '<div style="text-align:center;padding:20px 0;color:#aaa;font-size:13px;">📊 기록을 불러오는 중...</div>';
        dashEl.prepend(loader);
    }
    await _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId);
}

async function _fetchFreshDashboard(user, todayStr, weekStrs, currentWeekId) {
    try {
        console.time('⏱️ 대시보드 데이터 로드');
        const weekStart = weekStrs[0];
        const weekEnd = weekStrs[6];

        const _directFirestore = async () => {
            const userRef = doc(db, "users", user.uid);
            const weekQuery = query(collection(db, "daily_logs"), where("userId", "==", user.uid), where("date", ">=", weekStart), where("date", "<=", weekEnd));
            const streakQuery = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(30));
            const [userDoc, snapshot, streakSnap] = await Promise.all([getDoc(userRef), getDocs(weekQuery), getDocs(streakQuery)]);
            const wl = []; snapshot.forEach(d => { const dd = d.data(); wl.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} }); });
            const sl = []; streakSnap.forEach(d => { const dd = d.data(); sl.push({ date: dd.date, awardedPoints: dd.awardedPoints || {} }); });
            return { ud: userDoc.exists() ? userDoc.data() : {}, weekLogs: wl, streakLogs: sl, communityStats: null };
        };

        let dashData;
        try {
            const cfPromise = _fetchDashboardViaCloudFunction(user.uid, weekStart, weekEnd)
                .then(cf => ({ ud: cf.user || {}, weekLogs: cf.weekLogs || [], streakLogs: cf.streakLogs || [], communityStats: cf.communityStats || null }));
            const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('CF 5s timeout')), 5000));
            dashData = await Promise.race([cfPromise, timeout]);
        } catch (cfErr) {
            console.warn('CF 실패/타임아웃, Firestore 직접 쿼리:', cfErr.message);
            dashData = await _directFirestore();
        }
        console.timeEnd('⏱️ 대시보드 데이터 로드');

        const loadingEl = document.querySelector('.dashboard-loading-indicator');
        if (loadingEl) loadingEl.remove();

        _dashboardCache = { uid: user.uid, data: dashData, ts: Date.now() };
        _saveDashboardToLS(user.uid, dashData);

        _renderDashboardWithData(dashData, todayStr, weekStrs, currentWeekId, user);
    } catch (error) {
        console.error('대시보드 데이터 로드 오류:', error);
        const loadingEl = document.querySelector('.dashboard-loading-indicator');
        if (loadingEl) loadingEl.remove();
    }
}

function _renderDashboardWithData(data, todayStr, weekStrs, currentWeekId, user) {
    try {
        const ud = data.ud || {};
        if (ud.coins != null) document.getElementById('point-balance').innerText = ud.coins;
        renderMilestones(user.uid, ud);

        let level = typeof ud.missionLevel === 'number' ? ud.missionLevel : 1;
        let weeklyMissionData = ud.weeklyMissionData || null;
        let missionHistory = Array.isArray(ud.missionHistory) ? ud.missionHistory : [];
        let missionStreak = typeof ud.missionStreak === 'number' ? ud.missionStreak : 0;
        let missionBadges = Array.isArray(ud.missionBadges) ? ud.missionBadges : [];

        if (!weeklyMissionData && ud.selectedMissions && ud.selectedMissions.length > 0) {
            const oldMissionMap = {
                'm1_diet': { text: '🥗 하루 한 끼 채소 채우기', target: 3, type: 'diet' },
                'm1_exer': { text: '🏃 주 3회 이상 운동', target: 3, type: 'exercise' },
                'm1_mind': { text: '🧘 주 2회 명상', target: 2, type: 'mind' },
                'm2_diet': { text: '🥗 채소 위주 식단', target: 5, type: 'diet' },
                'm2_exer': { text: '🏃 주 4회 운동', target: 4, type: 'exercise' },
                'm2_mind': { text: '🧘 주 3회 명상', target: 3, type: 'mind' },
                'm3_diet': { text: '🥗 주 5일 클린 식단', target: 5, type: 'diet' },
                'm3_exer': { text: '🏃 매일 운동 습관', target: 5, type: 'exercise' },
                'm3_mind': { text: '🧘 주 4회 마음 챙김', target: 4, type: 'mind' },
                'm4_diet': { text: '🥗 하루 3끼 채소 중심', target: 6, type: 'diet' },
                'm4_exer': { text: '🏃 매일 운동 (주 6회)', target: 6, type: 'exercise' },
                'm4_mind': { text: '🧘 주 5회 명상', target: 5, type: 'mind' },
                'm5_diet': { text: '🥗 클린 식단 달성', target: 7, type: 'diet' },
                'm5_exer': { text: '🏃 매일 운동 달성', target: 7, type: 'exercise' },
                'm5_med':  { text: '💊 약 감량 시도', target: 1, type: 'mind' }
            };
            weeklyMissionData = {
                weekId: currentWeekId,
                missions: ud.selectedMissions.map(id => {
                    const legacy = oldMissionMap[id];
                    return {
                        id,
                        text: legacy ? legacy.text : id,
                        target: legacy ? legacy.target : 3,
                        type: legacy ? legacy.type : (id.includes('diet') ? 'diet' : id.includes('exer') ? 'exercise' : 'mind'),
                        isCustom: false
                    };
                })
            };
        }

        // 주간 리셋 감지: 저장된 weekId가 현재 주와 다르면 아카이브 후 리셋
        const needsReset = weeklyMissionData && weeklyMissionData.weekId && weeklyMissionData.weekId !== currentWeekId;
        if (needsReset) {
            // 아카이브를 백그라운드로 실행 (대시보드 렌더링 차단 방지)
            const prevWeekStrs = weekStrs.map(dStr => {
                const d = new Date(dStr + 'T12:00:00Z');
                d.setUTCDate(d.getUTCDate() - 7);
                return d.toISOString().slice(0, 10);
            });
            archiveWeekAndReset(user.uid, weeklyMissionData, missionHistory, missionStreak, prevWeekStrs).catch(e =>
                console.warn('주간 아카이브 실패:', e.message)
            );
            weeklyMissionData = null;
            missionStreak = 0;
        }

        const isWeekActive = weeklyMissionData && weeklyMissionData.weekId === currentWeekId && weeklyMissionData.missions && weeklyMissionData.missions.length > 0;

        // 레벨 뱃지 업데이트
        document.getElementById('user-level-badge').innerText = `Lv. ${level} ${MISSIONS[level]?.name || ''} ℹ️`;

        let logsMap = {}; let statDiet = 0, statExer = 0, statMind = 0;
        const weekLogs = data.weekLogs || [];
        weekLogs.forEach(logItem => {
            logsMap[logItem.date] = logItem;
            if (logItem.awardedPoints?.diet) statDiet++;
            if (logItem.awardedPoints?.exercise) statExer++;
            if (logItem.awardedPoints?.mind) statMind++;
        });

        // ==========================================
        // 오늘의 인증 현황
        // ==========================================
        const todayLog = logsMap[todayStr];
        const todayAwarded = todayLog?.awardedPoints || {};
        document.getElementById('ts-diet-icon').textContent = todayAwarded.diet ? '✅' : '⬜';
        document.getElementById('ts-exercise-icon').textContent = todayAwarded.exercise ? '✅' : '⬜';
        document.getElementById('ts-mind-icon').textContent = todayAwarded.mind ? '✅' : '⬜';

        let streakCount = 0;
        const streakLogs = data.streakLogs || [];
        for (const log of streakLogs) {
            const awarded = log.awardedPoints || log.awarded || {};
            if (awarded.diet || awarded.exercise || awarded.mind) streakCount++;
            else break;
        }
        const streakBadge = document.getElementById('today-streak-badge');
        const cheerEl = document.getElementById('today-status-cheer');
        if (streakCount > 0) {
            streakBadge.textContent = `🔥 ${streakCount}일 연속`;
            streakBadge.style.display = '';
            // 응원 메시지
            let cheerMsg = '';
            if (streakCount >= 100) cheerMsg = '🏆 100일 돌파! 진정한 습관 마스터!';
            else if (streakCount >= 60) cheerMsg = '💎 60일 넘었어요! 습관이 체질이 되었네요!';
            else if (streakCount >= 30) cheerMsg = '🌟 한 달 연속! 정말 대단해요!';
            else if (streakCount >= 21) cheerMsg = '✨ 21일! 습관 형성의 마법 숫자 통과!';
            else if (streakCount >= 14) cheerMsg = '💪 2주 연속! 꾸준함이 빛나요!';
            else if (streakCount >= 7) cheerMsg = '🎉 일주일 연속! 습관이 만들어지고 있어요!';
            else if (streakCount >= 3) cheerMsg = `👏 ${streakCount}일째! 좋은 흐름, 계속 가봐요!`;
            else cheerMsg = '🌱 시작이 반! 연속 기록을 이어가요!';
            if (cheerEl) { cheerEl.textContent = cheerMsg; cheerEl.style.display = ''; }
        } else {
            streakBadge.style.display = 'none';
            if (cheerEl) { cheerEl.textContent = '🌱 첫 기록을 남기고 연속을 시작해보세요!'; cheerEl.style.display = ''; }
        }

        // 주간 그래프 (월~일)
        const graphArea = document.getElementById('week-graph');
        graphArea.innerHTML = '';
        const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
        weekStrs.forEach((dateStr, idx) => {
            let circleClass = 'day-circle';
            if (logsMap[dateStr]) circleClass += ' done';
            let labelClass = 'day-label';
            if (dateStr === todayStr) { circleClass += ' today'; labelClass += ' today'; }
            graphArea.innerHTML += `<div class="day-wrap" onclick="changeDateTo('${dateStr}')"><div class="${circleClass}">${dayNames[idx]}</div><div class="${labelClass}">${dateStr.substring(5).replace('-', '/')}</div></div>`;
        });

        // ==========================================
        // 미션 영역 렌더링
        // ==========================================
        const missionArea = document.getElementById('mission-selection-area');
        const progContainer = document.getElementById('mission-progress-container');
        missionArea.innerHTML = '';

        // (A) 지난주 리포트 카드
        const lastWeek = missionHistory.length > 0 ? missionHistory[missionHistory.length - 1] : null;
        if (lastWeek) {
            const rateClass = lastWeek.completionRate >= 80 ? 'rate-great' : lastWeek.completionRate >= 50 ? 'rate-good' : 'rate-low';
            const rateEmoji = lastWeek.completionRate >= 80 ? '🎉' : lastWeek.completionRate >= 50 ? '👍' : '💪';
            missionArea.innerHTML += `
                <div class="week-report-card">
                    <div class="week-report-header">
                        <span>📊 지난주 결과 (${lastWeek.weekId})</span>
                        <span class="week-report-rate ${rateClass}">${rateEmoji} ${lastWeek.completionRate}%</span>
                    </div>
                    <div class="week-report-stats">
                        <span>🥗 ${lastWeek.stats?.diet || 0}일</span>
                        <span>🏃 ${lastWeek.stats?.exercise || 0}일</span>
                        <span>🧘 ${lastWeek.stats?.mind || 0}일</span>
                    </div>
                </div>`;
        }

        // (B) 스트릭 표시
        if (missionStreak > 0) {
            missionArea.innerHTML += `
                <div class="mission-streak-badge">
                    🔥 <strong>${missionStreak}주 연속</strong> 달성 중!
                </div>`;
        }

        if (!isWeekActive) {
            // ========== 미션 설정 모드 ==========
            const levelData = MISSIONS[level] || MISSIONS[1];
            const categories = ['diet', 'exercise', 'mind'];
            const categoryLabels = { diet: '🥗 식단', exercise: '🏃 운동', mind: '🧘 마음' };
            const diffLabels = { easy: '쉬움', normal: '보통', hard: '도전' };

            missionArea.innerHTML += `<p style="font-size:13px; color:#666; margin-bottom:12px;">카테고리별 난이도를 선택하고, 나만의 미션을 추가할 수 있어요!</p>`;

            categories.forEach(cat => {
                const catData = levelData[cat];
                if (!catData) return;
                missionArea.innerHTML += `
                    <div class="mission-category-block">
                        <div class="mission-category-label">${categoryLabels[cat]}</div>
                        <div class="mission-difficulty-tabs" data-category="${cat}">
                            ${Object.keys(catData).map(diff => `
                                <button class="diff-tab ${diff === 'normal' ? 'active' : ''}" data-diff="${diff}" data-cat="${cat}" onclick="selectDifficulty('${cat}','${diff}')">
                                    ${diffLabels[diff]}
                                </button>
                            `).join('')}
                        </div>
                        <div class="mission-preview" id="preview-${cat}">
                            <input type="checkbox" id="chk_preset_${cat}" checked>
                            <label for="chk_preset_${cat}" id="label_preset_${cat}">${catData.normal.text} (${catData.normal.target}일)</label>
                        </div>
                    </div>`;
            });

            // 커스텀 미션 입력
            missionArea.innerHTML += `
                <div class="custom-mission-section">
                    <div class="custom-mission-header">✨ 나만의 미션 추가</div>
                    <div id="custom-missions-list"></div>
                    <div class="custom-mission-input-row">
                        <select id="custom-mission-type">
                            <option value="diet">🥗 식단</option>
                            <option value="exercise">🏃 운동</option>
                            <option value="mind">🧘 마음</option>
                        </select>
                        <input type="text" id="custom-mission-text" placeholder="예: 물 2L 마시기" maxlength="30">
                        <select id="custom-mission-target">
                            <option value="1">1일</option>
                            <option value="2">2일</option>
                            <option value="3" selected>3일</option>
                            <option value="4">4일</option>
                            <option value="5">5일</option>
                            <option value="6">6일</option>
                            <option value="7">7일</option>
                        </select>
                        <button class="add-custom-btn" onclick="addCustomMission()">+</button>
                    </div>
                </div>`;

            // 난이도 선택 초기화 스크립트 실행
            setTimeout(() => initDifficultySelectors(level), 0);

        } else {
            // ========== 진행 중 모드: 프로그레스 표시 ==========
            progContainer.style.display = 'block';
            progContainer.innerHTML = '';

            let totalMissions = weeklyMissionData.missions.length;
            let completedMissions = 0;

            weeklyMissionData.missions.forEach(m => {
                let currentVal = 0;
                if (m.type === 'diet') currentVal = statDiet;
                else if (m.type === 'exercise') currentVal = statExer;
                else if (m.type === 'mind') currentVal = statMind;

                const percent = Math.min((currentVal / m.target) * 100, 100);
                if (percent >= 100) completedMissions++;

                const fillColor = percent >= 100 ? 'var(--success-color, #4CAF50)' : percent >= 50 ? 'var(--secondary-color)' : 'var(--warning-color, #FF9800)';
                const statusIcon = percent >= 100 ? '✅' : percent >= 50 ? '🔄' : '⏳';
                const customTag = m.isCustom ? '<span class="custom-tag">커스텀</span>' : '';

                progContainer.innerHTML += `
                    <div class="mp-row">
                        <div class="mp-label">
                            <span>${statusIcon} ${m.text} ${customTag}</span>
                            <span class="mp-count">${currentVal} / ${m.target}</span>
                        </div>
                        <div class="mp-track">
                            <div class="mp-fill" style="width: ${percent}%; background-color: ${fillColor};"></div>
                        </div>
                    </div>`;
            });

            // 전체 달성률 (실제 진행도 기반)
            let totalProgress = 0;
            weeklyMissionData.missions.forEach(m => {
                let val = m.type === 'diet' ? statDiet : m.type === 'exercise' ? statExer : statMind;
                totalProgress += Math.min(val / m.target, 1);
            });
            const overallRate = totalMissions > 0 ? Math.round((totalProgress / totalMissions) * 100) : 0;
            const rateMsg = overallRate >= 100 ? '🎉 모든 미션 완료! 대단해요!' : overallRate >= 80 ? '🔥 거의 다 왔어요! 조금만 더!' : overallRate >= 50 ? '👍 절반 이상 달성! 이 페이스 유지!' : '💪 아직 시간 있어요, 화이팅!';

            // 남은 일수 계산
            const todayIdx = weekStrs.indexOf(todayStr);
            const remainingDays = todayIdx >= 0 ? 6 - todayIdx : 0;

            progContainer.innerHTML += `
                <div class="mission-overall-status">
                    <div class="overall-rate">${rateMsg}</div>
                    <div class="overall-stats">
                        <span>달성률 <strong>${overallRate}%</strong></span>
                        <span>남은 일수 <strong>${remainingDays}일</strong></span>
                    </div>
                </div>`;

            // 미달성 경고 (남은 일수 적고 달성률 낮을 때)
            if (remainingDays <= 2 && overallRate < 80) {
                progContainer.innerHTML += `<div class="mission-warning">⚠️ 이번 주 ${remainingDays}일 남았어요! 미션을 서둘러 달성해보세요!</div>`;
            }

            // 레벨업 버튼
            const allDone = completedMissions === totalMissions && totalMissions > 0;
            if (allDone && level < 5) {
                progContainer.innerHTML += `<button class="submit-btn" style="margin-top:15px; background-color:#9C27B0; white-space:nowrap; font-size:13px; padding:12px 16px;" onclick="levelUp(${level + 1})">🎉 Lv ${level + 1} 승급하기</button>`;
            }

            // 미션 재설정 버튼 (진행 중에도 변경 가능)
            progContainer.innerHTML += `<button class="submit-btn reset-mission-btn" onclick="resetWeeklyMissions()">🔄 이번 주 미션 재설정</button>`;

            // 저장 버튼 상태 업데이트
            const saveBtn = document.getElementById('btn-save-missions');
            if (allDone) {
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = '0.5';
                    saveBtn.style.cursor = 'not-allowed';
                    saveBtn.innerText = '✅ 이번 주 미션 완료!';
                }
            } else {
                if (saveBtn) {
                    saveBtn.disabled = true;
                    saveBtn.style.opacity = '0.5';
                    saveBtn.style.cursor = 'not-allowed';
                    saveBtn.innerText = '미션 진행 중...';
                }
            }
        }

        if (!isWeekActive) {
            const saveBtn = document.getElementById('btn-save-missions');
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
                saveBtn.innerText = '🎯 이번 주 미션 시작!';
            }
            progContainer.style.display = 'none';
        }

        renderMissionBadges(missionBadges);

        if (data.communityStats) {
            renderGroupChallengeFromData(data.communityStats);
        } else {
            setTimeout(() => renderGroupChallenge().catch(() => {}), 1000);
        }

    } catch (error) {
        console.error('대시보드 렌더링 오류:', error);
    }
}

// 데이터 저장 시 대시보드 캐시 무효화
window._invalidateDashboardCache = function() {
    _dashboardCache.ts = 0;
    try { localStorage.removeItem(LS_DASHBOARD_KEY); } catch (_) {}
};

// 난이도 선택기 초기화
function initDifficultySelectors(level) {
    const levelData = MISSIONS[level] || MISSIONS[1];
    ['diet', 'exercise', 'mind'].forEach(cat => {
        const preview = document.getElementById(`preview-${cat}`);
        const label = document.getElementById(`label_preset_${cat}`);
        if (preview && label && levelData[cat]) {
            const m = levelData[cat].normal;
            label.textContent = `${m.text} (${m.target}일)`;
        }
    });
}

// 마일스톤 수령완료 전체 펼치기/접기
window.toggleClaimedMilestones = function() {
    const rows = document.querySelectorAll('.ms-claimed-row');
    const btn = document.getElementById('ms-expand-btn');
    const isHidden = rows[0]?.style.display === 'none';
    rows.forEach(r => r.style.display = isHidden ? 'flex' : 'none');
    if (btn) btn.textContent = isHidden ? '접기 ▲' : '펼치기 ▼';
};

// 미션 배지 렌더링
function renderMissionBadges(earnedBadges) {
    const section = document.getElementById('mission-badges-section');
    const grid = document.getElementById('mission-badges-grid');
    if (!section || !grid) return;

    if (!earnedBadges || earnedBadges.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    grid.innerHTML = '';
    const allBadges = Object.values(MISSION_BADGES);
    allBadges.forEach(badge => {
        const earned = earnedBadges.includes(badge.id);
        grid.innerHTML += `
            <div class="mission-badge ${earned ? 'earned' : 'locked'}">
                <span class="badge-emoji">${earned ? badge.emoji : '🔒'}</span>
                <span class="badge-name">${badge.name}</span>
                <span class="badge-desc">${badge.desc}</span>
            </div>`;
    });
}

// 커뮤니티 월간 현황 렌더링 — 서버에서 미리 계산된 meta/communityStats 문서 1개만 읽음
function renderGroupChallengeFromData(s) {
    const section = document.getElementById('group-challenge-section');
    const content = document.getElementById('group-challenge-content');
    if (!section || !content) return;
    if (!s || !s.totalUsers) { section.style.display = 'none'; return; }

    const ranked = s.ranked || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rewardAmounts = ['5,000P', '2,000P', '500P'];

    section.style.display = 'block';
    content.innerHTML = `
        <div class="group-stats-grid">
            <div class="group-stat-item"><span class="group-stat-num">${s.totalUsers}명</span><span class="group-stat-label">참여 회원</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.newMemberCount || 0}명</span><span class="group-stat-label">🌟 신규</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalComments || 0}개</span><span class="group-stat-label">댓글</span></div>
            <div class="group-stat-item"><span class="group-stat-num">${s.totalReactions || 0}개</span><span class="group-stat-label">리액션</span></div>
        </div>
        ${s.bestStreak >= 2 ? `<div class="community-highlight">🔥 연속 기록: <strong>${s.bestStreakName}</strong> ${s.bestStreak}일!</div>` : ''}
        <div class="category-kings">
            ${s.dietKing?.count > 0 ? `<span class="cat-king">🥗 <strong>${s.dietKing.name}</strong> ${s.dietKing.count}일</span>` : ''}
            ${s.exerciseKing?.count > 0 ? `<span class="cat-king">🏃 <strong>${s.exerciseKing.name}</strong> ${s.exerciseKing.count}일</span>` : ''}
            ${s.mindKing?.count > 0 ? `<span class="cat-king">🌙 <strong>${s.mindKing.name}</strong> ${s.mindKing.count}일</span>` : ''}
        </div>
        <div class="mvp-ranking-title">🏆 이번 달 MVP TOP 3</div>
        <div class="mvp-ranking-list">
            ${ranked.map((u, i) => `
                <div class="mvp-ranking-item rank-${i + 1}">
                    <span class="mvp-medal">${medals[i]}</span>
                    <span class="mvp-name">${u.name}</span>
                    <span class="mvp-days">${u.days}일·💬${u.comments}·❤️${u.reactions}</span>
                    <span class="mvp-reward">${rewardAmounts[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="mvp-reward-info">💰 매월 자동 지급 · MVP 점수 = 기록×10 + 댓글×3 + 리액션×1</div>
    `;
}

async function renderGroupChallenge() {
    const section = document.getElementById('group-challenge-section');
    const content = document.getElementById('group-challenge-content');
    if (!section || !content) return;

    let s = null;
    try {
        const statsDoc = await getDoc(doc(db, "meta", "communityStats"));
        if (statsDoc.exists()) s = statsDoc.data();
    } catch (_) {}
    if (!s || !s.totalUsers) { section.style.display = 'none'; return; }
    if (!s.totalUsers || s.totalUsers === 0) { section.style.display = 'none'; return; }

    const ranked = s.ranked || [];
    const medals = ['🥇', '🥈', '🥉'];
    const rewardAmounts = ['5,000P', '2,000P', '500P'];

    section.style.display = 'block';
    content.innerHTML = `
        <div class="group-stats-grid">
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalUsers}명</span>
                <span class="group-stat-label">참여 회원</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.newMemberCount || 0}명</span>
                <span class="group-stat-label">🌟 신규</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalComments || 0}개</span>
                <span class="group-stat-label">댓글</span>
            </div>
            <div class="group-stat-item">
                <span class="group-stat-num">${s.totalReactions || 0}개</span>
                <span class="group-stat-label">리액션</span>
            </div>
        </div>
        ${s.bestStreak >= 2 ? `<div class="community-highlight">🔥 연속 기록: <strong>${s.bestStreakName}</strong> ${s.bestStreak}일!</div>` : ''}
        <div class="category-kings">
            ${s.dietKing?.count > 0 ? `<span class="cat-king">🥗 <strong>${s.dietKing.name}</strong> ${s.dietKing.count}일</span>` : ''}
            ${s.exerciseKing?.count > 0 ? `<span class="cat-king">🏃 <strong>${s.exerciseKing.name}</strong> ${s.exerciseKing.count}일</span>` : ''}
            ${s.mindKing?.count > 0 ? `<span class="cat-king">🌙 <strong>${s.mindKing.name}</strong> ${s.mindKing.count}일</span>` : ''}
        </div>
        <div class="mvp-ranking-title">🏆 이번 달 MVP TOP 3</div>
        <div class="mvp-ranking-list">
            ${ranked.map((u, i) => `
                <div class="mvp-ranking-item rank-${i + 1}">
                    <span class="mvp-medal">${medals[i]}</span>
                    <span class="mvp-name">${u.name}</span>
                    <span class="mvp-days">${u.days}일·💬${u.comments}·❤️${u.reactions}</span>
                    <span class="mvp-reward">${rewardAmounts[i]}</span>
                </div>
            `).join('')}
        </div>
        <div class="mvp-reward-info">💰 매월 자동 지급 · MVP 점수 = 기록×10 + 댓글×3 + 리액션×1</div>
    `;

    // 지난달 MVP 보상 자동 트리거 (매월 1~3일에만 시도)
    const dayOfMonth = today.getUTCDate();
    if (dayOfMonth <= 3 && auth.currentUser) {
        try {
            const prevDate = new Date(today);
            prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
            const prevMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
            const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-functions.js');
            const functions = getFunctions(undefined, 'asia-northeast3');
            const distributeFn = httpsCallable(functions, 'distributeMonthlyMvpReward');
            const result = await distributeFn({ targetMonth: prevMonth });
            const data = result.data;
            if (data && !data.alreadyDistributed && data.winners?.length > 0) {
                // 현재 사용자가 수상자인지 확인
                const myUid = auth.currentUser.uid;
                const myWin = data.winners.find(w => w.userId === myUid);
                if (myWin) {
                    showToast(`🎉 ${prevMonth} MVP ${myWin.rank}위 달성! ${myWin.reward.toLocaleString()}P가 지급되었습니다!`);
                }
            }
        } catch (e) {
            console.log('MVP reward check:', e.message);
        }
    }
}

// 난이도 선택
window.selectDifficulty = function(cat, diff) {
    const level = parseInt(document.getElementById('user-level-badge').innerText.match(/Lv\. (\d)/)?.[1] || '1');
    const levelData = MISSIONS[level] || MISSIONS[1];
    const m = levelData[cat]?.[diff];
    if (!m) return;

    // 탭 활성화
    document.querySelectorAll(`.mission-difficulty-tabs[data-category="${cat}"] .diff-tab`).forEach(btn => {
        btn.classList.toggle('active', btn.dataset.diff === diff);
    });

    // 미션 텍스트 업데이트
    const label = document.getElementById(`label_preset_${cat}`);
    if (label) label.textContent = `${m.text} (${m.target}일)`;
};

// 커스텀 미션 목록 (임시 저장)
let pendingCustomMissions = [];

window.addCustomMission = function() {
    const text = document.getElementById('custom-mission-text')?.value?.trim();
    const type = document.getElementById('custom-mission-type')?.value;
    const target = parseInt(document.getElementById('custom-mission-target')?.value || '3');

    if (!text) { showToast('미션 내용을 입력해주세요.'); return; }
    if (text.length > 30) { showToast('미션은 30자 이내로 입력해주세요.'); return; }
    if (pendingCustomMissions.length >= 5) { showToast('커스텀 미션은 최대 5개까지 추가할 수 있습니다.'); return; }

    const typeEmoji = { diet: '🥗', exercise: '🏃', mind: '🧘' };
    const mission = {
        id: 'custom_' + Date.now(),
        text: `${typeEmoji[type] || ''} ${text}`,
        target: target,
        type: type,
        isCustom: true
    };

    pendingCustomMissions.push(mission);
    renderPendingCustomMissions();
    document.getElementById('custom-mission-text').value = '';
};

window.removeCustomMission = function(id) {
    pendingCustomMissions = pendingCustomMissions.filter(m => m.id !== id);
    renderPendingCustomMissions();
};

function renderPendingCustomMissions() {
    const list = document.getElementById('custom-missions-list');
    if (!list) return;
    list.innerHTML = pendingCustomMissions.map(m => `
        <div class="custom-mission-item">
            <span>${m.text} (${m.target}일)</span>
            <button class="remove-custom-btn" onclick="removeCustomMission('${m.id}')">×</button>
        </div>
    `).join('');
}

// 주간 아카이브 및 리셋
async function archiveWeekAndReset(uid, weeklyData, history, currentStreak, weekStrs) {
    const q = query(
        collection(db, "daily_logs"),
        where("userId", "==", uid),
        where("date", ">=", weekStrs[0]),
        where("date", "<=", weekStrs[6])
    );
    const snapshot = await getDocs(q);
    let statDiet = 0, statExer = 0, statMind = 0;

    snapshot.forEach(d => {
        const data = d.data();
        if (data.awardedPoints?.diet) statDiet++;
        if (data.awardedPoints?.exercise) statExer++;
        if (data.awardedPoints?.mind) statMind++;
    });

    // 달성률 계산
    let totalTarget = 0, totalAchieved = 0;
    if (weeklyData.missions) {
        weeklyData.missions.forEach(m => {
            totalTarget += m.target;
            let val = m.type === 'diet' ? statDiet : m.type === 'exercise' ? statExer : statMind;
            totalAchieved += Math.min(val, m.target);
        });
    }
    const completionRate = totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0;

    // 스트릭 업데이트
    const newStreak = completionRate >= 80 ? currentStreak + 1 : 0;

    // 히스토리에 추가 (최대 12주 보관)
    const archiveEntry = {
        weekId: weeklyData.weekId,
        missions: weeklyData.missions,
        stats: { diet: statDiet, exercise: statExer, mind: statMind },
        completionRate: completionRate
    };
    const newHistory = [...history, archiveEntry].slice(-12);

    // 배지 체크
    let newBadges = [];
    if (completionRate >= 100) newBadges.push('weekComplete');
    if (newStreak >= 3) newBadges.push('mStreak3');
    if (newStreak >= 5) newBadges.push('mStreak5');
    if (newStreak >= 10) newBadges.push('mStreak10');
    const hasHard = weeklyData.missions?.some(m => m.difficulty === 'hard');
    if (hasHard && completionRate >= 100) newBadges.push('hardMode');
    const hasDiet = weeklyData.missions?.some(m => m.type === 'diet');
    const hasExer = weeklyData.missions?.some(m => m.type === 'exercise');
    const hasMind = weeklyData.missions?.some(m => m.type === 'mind');
    if (hasDiet && hasExer && hasMind && completionRate >= 100) newBadges.push('allCategories');
    const hasCustom = weeklyData.missions?.some(m => m.isCustom);
    if (hasCustom && completionRate >= 80) newBadges.push('customMaster');

    // Firestore 업데이트
    const updateData = {
        weeklyMissionData: null,
        missionHistory: newHistory,
        missionStreak: newStreak
    };

    // 새 배지 추가
    if (newBadges.length > 0) {
        const userRef = doc(db, "users", uid);
        const userDoc = await getDoc(userRef);
        const existingBadges = userDoc.exists() ? (userDoc.data().missionBadges || []) : [];
        const allBadges = [...new Set([...existingBadges, ...newBadges])];
        updateData.missionBadges = allBadges;
    }

    await setDoc(doc(db, "users", uid), updateData, { merge: true });
}

// 주간 미션 저장
async function saveWeeklyMissions() {
    const user = auth.currentUser;
    if (!user) return;
    try {
        const { todayStr } = getDatesInfo();
        const currentWeekId = getWeekId(todayStr);
        const level = parseInt(document.getElementById('user-level-badge').innerText.match(/Lv\. (\d)/)?.[1] || '1');
        const levelData = MISSIONS[level] || MISSIONS[1];

        let missions = [];

        // 프리셋 미션 수집
        ['diet', 'exercise', 'mind'].forEach(cat => {
            const checkbox = document.getElementById(`chk_preset_${cat}`);
            if (checkbox && checkbox.checked) {
                // 선택된 난이도 찾기
                const activeTab = document.querySelector(`.mission-difficulty-tabs[data-category="${cat}"] .diff-tab.active`);
                const diff = activeTab ? activeTab.dataset.diff : 'normal';
                const m = levelData[cat]?.[diff];
                if (m) {
                    missions.push({
                        id: m.id,
                        text: m.text,
                        target: m.target,
                        type: cat,
                        difficulty: diff,
                        isCustom: false
                    });
                }
            }
        });

        // 커스텀 미션 추가
        missions = missions.concat(pendingCustomMissions);

        if (missions.length === 0) {
            alert("최소 1개 이상의 미션을 선택해주세요.");
            return;
        }

        // 첫 미션 배지 체크
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        let existingBadges = [];
        if (userDoc.exists() && userDoc.data().missionBadges) {
            existingBadges = userDoc.data().missionBadges;
        }
        if (!existingBadges.includes('firstMission')) {
            existingBadges = [...existingBadges, 'firstMission'];
        }

        await setDoc(userRef, {
            weeklyMissionData: {
                weekId: currentWeekId,
                missions: missions
            },
            missionBadges: existingBadges
        }, { merge: true });

        pendingCustomMissions = [];
        showToast("🎯 이번 주 미션이 시작되었습니다! 화이팅!");
        renderDashboard();
    } catch (error) {
        console.error('미션 저장 오류:', error);
        showToast('⚠️ 미션 저장에 실패했습니다.');
    }
}

window.saveWeeklyMissions = saveWeeklyMissions;

// 미션 재설정
window.resetWeeklyMissions = async function() {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm('이번 주 미션을 재설정하시겠습니까?\n진행 중인 기록은 유지됩니다.')) return;
    try {
        await setDoc(doc(db, "users", user.uid), { weeklyMissionData: null, selectedMissions: [] }, { merge: true });
        pendingCustomMissions = [];
        showToast("🔄 미션이 초기화되었습니다. 다시 설정해주세요!");
        renderDashboard();
    } catch (error) {
        console.error('미션 리셋 오류:', error);
        showToast('⚠️ 미션 리셋에 실패했습니다.');
    }
};

/* 다크모드 토글 */
window.toggleDarkMode = function () {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    const btn = document.getElementById('dark-mode-toggle');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#17151A' : '#FFFFFF');
};

/* 페이지 로드 시 다크모드 복원 */
(function initDarkMode() {
    if (localStorage.getItem('darkMode') === 'on') {
        document.body.classList.add('dark-mode');
        const btn = document.getElementById('dark-mode-toggle');
        if (btn) btn.textContent = '☀️';
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', '#17151A');
    }
})();

window.levelUp = async function (newLevel) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await setDoc(doc(db, "users", user.uid), {
            missionLevel: newLevel,
            weeklyMissionData: null
        }, { merge: true });
        pendingCustomMissions = [];
        alert(`🎉 축하합니다! 레벨 ${newLevel} (${MISSIONS[newLevel]?.name || ''})으로 승급하셨습니다!`);
        document.getElementById('level-modal').style.display = 'none';
        renderDashboard();
    } catch (error) {
        console.error('레벨업 오류:', error);
        showToast('⚠️ 레벨업에 실패했습니다.');
    }
};

// compressImage, uploadFileAndGetUrl 등은 상단에서 직접 import

// ========== 30일 종합 결과지 ==========
window.generate30DayReport = async function () {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const modal = document.getElementById('report-modal');
    modal.style.display = 'flex';
    document.getElementById('report-user-name').textContent = getUserDisplayName();
    document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#999;">📊 30일간의 기록을 분석 중...</p>';

    try {
        const q = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(30));
        const snapshot = await getDocs(q);
        let logs = [];
        snapshot.forEach(d => logs.push(d.data()));
        logs.reverse(); // oldest first

        if (logs.length < 2) {
            document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#999;">최소 2일 이상의 기록이 있어야 결과지를 생성할 수 있습니다.</p>';
            document.getElementById('report-period').textContent = '';
            return;
        }

        const startDate = logs[0].date;
        const endDate = logs[logs.length - 1].date;
        document.getElementById('report-period').textContent = `${startDate.replace(/-/g, '.')} ~ ${endDate.replace(/-/g, '.')} (${logs.length}일)`;

        // ===== 통계 계산 =====
        let totalDiet = 0, totalExer = 0, totalMind = 0, totalPoints = 0;
        let dietPhotos = 0, cardioCount = 0, strengthCount = 0, meditationCount = 0, gratitudeCount = 0;
        let weights = [], glucoses = [], bpSys = [], bpDia = [];
        let dailyDietPts = [], dailyExerPts = [], dailyMindPts = [], dailyTotalPts = [];
        let dietDays = 0, exerDays = 0, mindDays = 0;
        let streak = 0, maxStreak = 0, currentStreak = 0;

        logs.forEach((log, idx) => {
            const ap = log.awardedPoints || {};
            const dp = ap.dietPoints || (ap.diet ? 10 : 0);
            const ep = ap.exercisePoints || (ap.exercise ? 15 : 0);
            const mp = ap.mindPoints || (ap.mind ? 5 : 0);
            const dayTotal = dp + ep + mp;

            totalDiet += dp; totalExer += ep; totalMind += mp; totalPoints += dayTotal;
            dailyDietPts.push(dp); dailyExerPts.push(ep); dailyMindPts.push(mp); dailyTotalPts.push(dayTotal);

            if (ap.diet || dp > 0) dietDays++;
            if (ap.exercise || ep > 0) exerDays++;
            if (ap.mind || mp > 0) mindDays++;

            // 식단 사진 수
            if (log.diet) {
                ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl'].forEach(k => { if (log.diet[k]) dietPhotos++; });
            }
            // 운동 횟수
            if (log.exercise) {
                cardioCount += (log.exercise.cardioList?.length || (log.exercise.cardioImageUrl ? 1 : 0));
                strengthCount += (log.exercise.strengthList?.length || (log.exercise.strengthVideoUrl ? 1 : 0));
            }
            // 마음
            if (log.sleepAndMind?.meditationDone) meditationCount++;
            if (log.sleepAndMind?.gratitude) gratitudeCount++;

            // 체중·혈당·혈압
            if (log.metrics) {
                if (log.metrics.weight) weights.push({ date: log.date, v: parseFloat(log.metrics.weight) });
                if (log.metrics.glucose) glucoses.push({ date: log.date, v: parseFloat(log.metrics.glucose) });
                if (log.metrics.bpSystolic) bpSys.push({ date: log.date, v: parseFloat(log.metrics.bpSystolic) });
                if (log.metrics.bpDiastolic) bpDia.push({ date: log.date, v: parseFloat(log.metrics.bpDiastolic) });
            }

            // 연속 기록
            if (dayTotal > 0) { currentStreak++; maxStreak = Math.max(maxStreak, currentStreak); }
            else currentStreak = 0;
        });

        const avgDailyPts = logs.length > 0 ? Math.round(totalPoints / logs.length) : 0;
        const participationRate = Math.round((logs.filter(l => {
            const ap = l.awardedPoints || {};
            return ap.diet || ap.exercise || ap.mind || (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0) > 0;
        }).length / logs.length) * 100);

        // 날짜 레이블 (축약)
        const dateLabels = logs.map(l => l.date.substring(5).replace('-', '/'));

        // ===== HTML 렌더 =====
        let html = '';

        // — 요약 카드 —
        html += `<div class="report-section">
            <div class="report-section-title">📋 종합 요약</div>
            <div class="report-summary-grid">
                <div class="report-stat-card"><div class="report-stat-value">${totalPoints}P</div><div class="report-stat-label">총 획득 포인트</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${avgDailyPts}P</div><div class="report-stat-label">일 평균</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${participationRate}%</div><div class="report-stat-label">참여율</div></div>
                <div class="report-stat-card"><div class="report-stat-value">${maxStreak}일</div><div class="report-stat-label">최대 연속</div></div>
            </div>
        </div>`;

        // — 카테고리별 기록 —
        html += `<div class="report-section">
            <div class="report-section-title">📊 카테고리별 분석</div>
            <div class="report-category-grid">
                <div class="report-cat-card diet">
                    <div class="report-cat-emoji">🥗</div>
                    <div class="report-cat-name">식단</div>
                    <div class="report-cat-stat">${dietDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">📷 사진 ${dietPhotos}장 · ${totalDiet}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(dietDays / logs.length * 100)}%; background:#4CAF50;"></div></div>
                </div>
                <div class="report-cat-card exercise">
                    <div class="report-cat-emoji">🏃</div>
                    <div class="report-cat-name">운동</div>
                    <div class="report-cat-stat">${exerDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🏋️ 유산소 ${cardioCount}회 · 근력 ${strengthCount}회 · ${totalExer}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(exerDays / logs.length * 100)}%; background:#2196F3;"></div></div>
                </div>
                <div class="report-cat-card mind">
                    <div class="report-cat-emoji">🧘</div>
                    <div class="report-cat-name">마음</div>
                    <div class="report-cat-stat">${mindDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🧘 명상 ${meditationCount}회 · 감사일기 ${gratitudeCount}회 · ${totalMind}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(mindDays / logs.length * 100)}%; background:#9C27B0;"></div></div>
                </div>
            </div>
        </div>`;

        // — 일별 포인트 그래프 —
        html += `<div class="report-section">
            <div class="report-section-title">📈 일별 포인트 추이</div>
            <canvas id="report-chart-points" class="report-canvas"></canvas>
        </div>`;

        // — 카테고리별 일별 그래프 —
        html += `<div class="report-section">
            <div class="report-section-title">📉 카테고리별 일별 추이</div>
            <canvas id="report-chart-categories" class="report-canvas"></canvas>
        </div>`;

        // — 건강 지표 그래프 (데이터 있을 때만) —
        if (weights.length >= 2 || glucoses.length >= 2 || bpSys.length >= 2) {
            html += `<div class="report-section">
                <div class="report-section-title">🏥 건강 지표 변화</div>`;
            if (weights.length >= 2) {
                const wFirst = weights[0].v, wLast = weights[weights.length - 1].v;
                const wDiff = (wLast - wFirst).toFixed(1);
                const wSign = wDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">⚖️ 체중: ${wFirst}kg → ${wLast}kg <span class="report-metric-diff ${wDiff < 0 ? 'good' : wDiff > 0 ? 'warn' : ''}">(${wSign}${wDiff}kg)</span></div>`;
            }
            if (glucoses.length >= 2) {
                const gFirst = glucoses[0].v, gLast = glucoses[glucoses.length - 1].v;
                const gDiff = Math.round(gLast - gFirst);
                const gSign = gDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">🩸 혈당: ${gFirst} → ${gLast}mg/dL <span class="report-metric-diff ${gDiff < 0 ? 'good' : gDiff > 0 ? 'warn' : ''}">(${gSign}${gDiff})</span></div>`;
            }
            if (bpSys.length >= 2) {
                const sFirst = bpSys[0].v, sLast = bpSys[bpSys.length - 1].v;
                const sDiff = Math.round(sLast - sFirst);
                const sSign = sDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">💓 혈압(수축): ${sFirst} → ${sLast}mmHg <span class="report-metric-diff ${sDiff < 0 ? 'good' : sDiff > 0 ? 'warn' : ''}">(${sSign}${sDiff})</span></div>`;
            }
            html += `<canvas id="report-chart-health" class="report-canvas"></canvas></div>`;
        }

        // — 일별 기록 캘린더 히트맵 —
        html += `<div class="report-section">
            <div class="report-section-title">🗓️ 일별 기록 히트맵</div>
            <div class="report-heatmap" id="report-heatmap"></div>
            <div class="report-heatmap-legend">
                <span class="hm-legend-item"><span class="hm-box" style="background:#eee;"></span>미기록</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FFE0B2;"></span>1~20P</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FFB74D;"></span>21~50P</span>
                <span class="hm-legend-item"><span class="hm-box" style="background:#FF8C00;"></span>51~80P</span>
            </div>
        </div>`;

        document.getElementById('report-body').innerHTML = html;

        // ===== 히트맵 렌더 =====
        const heatmapEl = document.getElementById('report-heatmap');
        logs.forEach((log, idx) => {
            const ap = log.awardedPoints || {};
            const pts = (ap.dietPoints || 0) + (ap.exercisePoints || 0) + (ap.mindPoints || 0) || ((ap.diet ? 10 : 0) + (ap.exercise ? 15 : 0) + (ap.mind ? 5 : 0));
            let color = '#eee';
            if (pts > 50) color = '#FF8C00';
            else if (pts > 20) color = '#FFB74D';
            else if (pts > 0) color = '#FFE0B2';
            const dayLabel = log.date.substring(8);
            heatmapEl.innerHTML += `<div class="hm-cell" style="background:${color};" title="${log.date}: ${pts}P">${dayLabel}</div>`;
        });

        // ===== 캔버스 그래프 렌더 =====
        // 일별 포인트 스택 바 차트
        drawReportBarChart('report-chart-points', dateLabels, [
            { data: dailyDietPts, color: '#4CAF50', label: '식단' },
            { data: dailyExerPts, color: '#2196F3', label: '운동' },
            { data: dailyMindPts, color: '#9C27B0', label: '마음' }
        ], '포인트(P)');

        // 카테고리별 라인 차트
        drawReportLineChart('report-chart-categories', dateLabels, [
            { data: dailyDietPts, color: '#4CAF50', label: '식단' },
            { data: dailyExerPts, color: '#2196F3', label: '운동' },
            { data: dailyMindPts, color: '#9C27B0', label: '마음' }
        ]);

        // 건강 지표 차트
        if (document.getElementById('report-chart-health')) {
            let healthLines = [];
            if (weights.length >= 2) healthLines.push({ data: weights.map(w => w.v), dates: weights.map(w => w.date.substring(5).replace('-', '/')), color: '#FF6F00', label: '체중(kg)' });
            if (glucoses.length >= 2) healthLines.push({ data: glucoses.map(g => g.v), dates: glucoses.map(g => g.date.substring(5).replace('-', '/')), color: '#E53935', label: '혈당' });
            if (bpSys.length >= 2) healthLines.push({ data: bpSys.map(s => s.v), dates: bpSys.map(s => s.date.substring(5).replace('-', '/')), color: '#D32F2F', label: '수축기' });
            if (bpDia.length >= 2) healthLines.push({ data: bpDia.map(d => d.v), dates: bpDia.map(d => d.date.substring(5).replace('-', '/')), color: '#1976D2', label: '이완기' });
            drawReportHealthChart('report-chart-health', healthLines);
        }

    } catch (e) {
        console.error('30일 결과지 오류:', e);
        document.getElementById('report-body').innerHTML = '<p style="text-align:center; padding:40px; color:#e74c3c;">⚠️ 결과지 생성 중 오류가 발생했습니다.</p>';
    }
};

// 스택 바 차트 그리기
function drawReportBarChart(canvasId, labels, datasets, yLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 35, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const n = labels.length;
    const barW = Math.max(4, Math.min(16, chartW / n - 2));

    // Y max
    let maxY = 0;
    for (let i = 0; i < n; i++) { let sum = 0; datasets.forEach(ds => sum += (ds.data[i] || 0)); maxY = Math.max(maxY, sum); }
    maxY = Math.ceil(maxY / 10) * 10 || 80;

    ctx.clearRect(0, 0, w, h);

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxY * i / 4), pad.left - 4, y + 3);
    }

    // 바
    for (let i = 0; i < n; i++) {
        const x = pad.left + (chartW / n) * i + (chartW / n - barW) / 2;
        let offsetY = 0;
        datasets.forEach(ds => {
            const val = ds.data[i] || 0;
            const barH = (val / maxY) * chartH;
            ctx.fillStyle = ds.color;
            ctx.fillRect(x, pad.top + chartH - offsetY - barH, barW, barH);
            offsetY += barH;
        });
        // X 레이블 (간격 조절)
        if (n <= 15 || i % Math.ceil(n / 10) === 0) {
            ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.save(); ctx.translate(x + barW / 2, h - 3); ctx.rotate(-0.5);
            ctx.fillText(labels[i], 0, 0); ctx.restore();
        }
    }

    // 범례
    let lx = pad.left;
    datasets.forEach(ds => {
        ctx.fillStyle = ds.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(ds.label, lx + 13, 13); lx += ctx.measureText(ds.label).width + 26;
    });
}

// 라인 차트 그리기
function drawReportLineChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 35, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const n = labels.length;

    let maxY = 0;
    datasets.forEach(ds => ds.data.forEach(v => { if (v > maxY) maxY = v; }));
    maxY = Math.ceil(maxY / 10) * 10 || 30;

    ctx.clearRect(0, 0, w, h);

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxY * i / 4), pad.left - 4, y + 3);
    }

    // 라인
    datasets.forEach(ds => {
        ctx.strokeStyle = ds.color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            const y = pad.top + chartH - ((ds.data[i] || 0) / maxY) * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // 점
        for (let i = 0; i < n; i++) {
            if (n <= 15 || i % Math.ceil(n / 8) === 0 || i === n - 1) {
                const x = pad.left + (chartW / (n - 1 || 1)) * i;
                const y = pad.top + chartH - ((ds.data[i] || 0) / maxY) * chartH;
                ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = ds.color; ctx.fill();
            }
        }
    });

    // X 레이블
    for (let i = 0; i < n; i++) {
        if (n <= 15 || i % Math.ceil(n / 10) === 0) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            ctx.fillStyle = '#666'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center';
            ctx.save(); ctx.translate(x, h - 3); ctx.rotate(-0.5);
            ctx.fillText(labels[i], 0, 0); ctx.restore();
        }
    }

    // 범례
    let lx = pad.left;
    datasets.forEach(ds => {
        ctx.fillStyle = ds.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(ds.label, lx + 13, 13); lx += ctx.measureText(ds.label).width + 26;
    });
}

// 건강 지표 멀티 라인 차트 (각 데이터셋은 독립 X축)
function drawReportHealthChart(canvasId, healthLines) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    const h = 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 25, right: 10, bottom: 30, left: 35 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // 각 라인 독립 스케일로 0~1 정규화
    healthLines.forEach(line => {
        const minV = Math.min(...line.data);
        const maxV = Math.max(...line.data);
        const range = maxV - minV || 1;
        line.normalized = line.data.map(v => (v - minV + range * 0.05) / (range * 1.1));
        line.minV = minV; line.maxV = maxV;
    });

    // 그리드
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + chartH - (chartH * i / 4);
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // 라인
    healthLines.forEach(line => {
        const n = line.data.length;
        ctx.strokeStyle = line.color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const x = pad.left + (chartW / (n - 1 || 1)) * i;
            const y = pad.top + chartH - line.normalized[i] * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // 시작·끝 값 표시
        const xStart = pad.left;
        const yStart = pad.top + chartH - line.normalized[0] * chartH;
        const xEnd = pad.left + chartW;
        const yEnd = pad.top + chartH - line.normalized[n - 1] * chartH;
        ctx.fillStyle = line.color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(line.data[0], xStart + 3, yStart - 5);
        ctx.textAlign = 'right';
        ctx.fillText(line.data[n - 1], xEnd - 3, yEnd - 5);
    });

    // 범례
    let lx = pad.left;
    healthLines.forEach(line => {
        ctx.fillStyle = line.color; ctx.fillRect(lx, 4, 10, 10);
        ctx.fillStyle = '#333'; ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(line.label, lx + 13, 13); lx += ctx.measureText(line.label).width + 26;
    });
}

// ========== 공복 지표 추이 그래프 ==========
let fastingGraphData = [];
let currentFastingMetric = 'weight';

window.switchFastingGraph = function (metric, btnEl) {
    currentFastingMetric = metric;
    document.querySelectorAll('#fasting-graph-card .filter-chip').forEach(el => el.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    drawFastingChart();
};

async function loadFastingGraphData(userId) {
    try {
        const q = query(collection(db, "daily_logs"), where("userId", "==", userId), orderBy("date", "desc"), limit(30));
        const snapshot = await getDocs(q);
        fastingGraphData = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.metrics && (data.metrics.weight || data.metrics.glucose || data.metrics.bpSystolic)) {
                fastingGraphData.push({
                    date: data.date,
                    weight: parseFloat(data.metrics.weight) || null,
                    glucose: parseFloat(data.metrics.glucose) || null,
                    bpSystolic: parseFloat(data.metrics.bpSystolic) || null,
                    bpDiastolic: parseFloat(data.metrics.bpDiastolic) || null
                });
            }
        });
        fastingGraphData.reverse(); // oldest first

        const card = document.getElementById('fasting-graph-card');
        if (fastingGraphData.length >= 2 && card) {
            card.style.display = 'block';
            drawFastingChart();
        } else if (card) {
            card.style.display = 'none';
        }
    } catch (e) {
        console.warn('⚠️ 공복 지표 로드 스킵:', e.message);
    }
}

function drawFastingChart() {
    const canvas = document.getElementById('fasting-chart');
    if (!canvas || fastingGraphData.length < 2) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 340;
    const h = 180;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    ctx.clearRect(0, 0, w, h);

    // 데이터 준비
    let lines = [];
    let legend = '';
    if (currentFastingMetric === 'weight') {
        const pts = fastingGraphData.filter(d => d.weight !== null);
        if (pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.weight })), color: '#FF6F00', label: '체중(kg)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length - 1].weight}kg` : '데이터 부족';
    } else if (currentFastingMetric === 'glucose') {
        const pts = fastingGraphData.filter(d => d.glucose !== null);
        if (pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.glucose })), color: '#E53935', label: '혈당(mg/dL)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length - 1].glucose}mg/dL` : '데이터 부족';
    } else if (currentFastingMetric === 'bp') {
        const spts = fastingGraphData.filter(d => d.bpSystolic !== null);
        const dpts = fastingGraphData.filter(d => d.bpDiastolic !== null);
        if (spts.length >= 2) lines.push({ data: spts.map(d => ({ x: d.date, y: d.bpSystolic })), color: '#D32F2F', label: '수축기' });
        if (dpts.length >= 2) lines.push({ data: dpts.map(d => ({ x: d.date, y: d.bpDiastolic })), color: '#1976D2', label: '이완기' });
        legend = spts.length >= 2 ? `최근: ${spts[spts.length - 1].bpSystolic}/${dpts.length > 0 ? dpts[dpts.length - 1].bpDiastolic : '?'}mmHg` : '데이터 부족';
    }

    document.getElementById('fasting-chart-legend').textContent = legend;

    if (lines.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('기록이 2개 이상 필요합니다', w / 2, h / 2);
        return;
    }

    // Y 범위 계산
    let allY = [];
    lines.forEach(l => l.data.forEach(p => allY.push(p.y)));
    let minY = Math.min(...allY);
    let maxY = Math.max(...allY);
    const yRange = maxY - minY || 1;
    minY -= yRange * 0.1;
    maxY += yRange * 0.1;

    // 배경 그리드
    ctx.strokeStyle = '#E0E0E0';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
        const y = pad.top + (chartH / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
        ctx.fillStyle = '#999'; ctx.font = '10px sans-serif'; ctx.textAlign = 'right';
        const val = maxY - ((maxY - minY) / 4) * i;
        ctx.fillText(val.toFixed(1), pad.left - 4, y + 3);
    }

    // 라인 그리기
    lines.forEach(line => {
        const pts = line.data;
        ctx.strokeStyle = line.color;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad.left + (i / (pts.length - 1)) * chartW;
            const y = pad.top + ((maxY - p.y) / (maxY - minY)) * chartH;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // 점 그리기
        pts.forEach((p, i) => {
            const x = pad.left + (i / (pts.length - 1)) * chartW;
            const y = pad.top + ((maxY - p.y) / (maxY - minY)) * chartH;
            ctx.fillStyle = line.color;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        });
    });

    // X축 날짜 라벨 (처음, 중간, 마지막)
    const totalPts = lines[0].data.length;
    const labelIndices = totalPts <= 5 ? [...Array(totalPts).keys()] : [0, Math.floor(totalPts / 2), totalPts - 1];
    ctx.fillStyle = '#666'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    labelIndices.forEach(i => {
        const x = pad.left + (i / (totalPts - 1)) * chartW;
        const dateStr = lines[0].data[i].x.substring(5).replace('-', '/');
        ctx.fillText(dateStr, x, h - 8);
    });
}

async function uploadFileAndGetUrl(file, folderName, userId) {
    if (!file) return null;

    if (!isValidFileType(file)) {
        showToast('⚠️ 지원하지 않는 파일 형식입니다. (이미지 또는 동영상만 가능)');
        return null;
    }

    let fileToUpload = file;
    if (file.type.startsWith('image/')) {
        fileToUpload = await compressImage(file);
    }

    // 이미지는 20MB, 동영상은 100MB 제한 (firebase-config 상수 사용)
    const isVideo = fileToUpload.type && fileToUpload.type.startsWith('video/');
    const maxBytes = isVideo ? MAX_VID_SIZE : MAX_IMG_SIZE;
    const maxLabel = isVideo ? '100' : '20';
    const fileSizeMB = fileToUpload.size / (1024 * 1024);
    if (fileToUpload.size > maxBytes) {
        showToast(`⚠️ 파일이 너무 큽니다. (최대 ${maxLabel}MB, 현재 ${fileSizeMB.toFixed(1)}MB)`);
        return null;
    }

    const timestamp = Date.now();
    const storagePath = `${folderName}/${userId}/${timestamp}_${fileToUpload.name}`;
    const storageRef = ref(storage, storagePath);
    const maxRetries = 2;
    const timeoutMs = 60000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📤 업로드 시작 (시도 ${attempt + 1}/${maxRetries + 1}):`, storagePath);
            const uploadPromise = uploadBytes(storageRef, fileToUpload);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('업로드 시간 초과. 네트워크를 확인해주세요.')), timeoutMs)
            );
            await Promise.race([uploadPromise, timeoutPromise]);

            const urlPromise = getDownloadURL(storageRef);
            const urlTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('URL 가져오기 시간 초과')), 10000)
            );
            const url = await Promise.race([urlPromise, urlTimeout]);
            console.log('✅ 업로드 완료:', storagePath);
            return url;
        } catch (error) {
            console.error(`파일 업로드 오류 (시도 ${attempt + 1}):`, error.code || '', error.message);
            if (error.code === 'storage/unauthorized') {
                showToast('⚠️ 업로드 권한이 없습니다.');
                return null;
            }
            if (error.code === 'storage/quota-exceeded') {
                showToast('⚠️ 저장 공간이 부족합니다.');
                return null;
            }
            if (attempt === maxRetries) {
                showToast(`⚠️ 업로드 실패: ${error.message}`);
                return null;
            }
            // 재시도 전 대기 (1초, 2초 exponential backoff)
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
    }
    return null;
}

document.getElementById('saveDataBtn').addEventListener('click', () => {
    const user = auth.currentUser;
    if (!user) return;

    // 갤러리 탭에서는 오픈단톡방 버튼으로 사용 → 저장 로직 실행 안함
    const gallerySection = document.getElementById('gallery');
    if (gallerySection && gallerySection.style.display === 'block') return;

    const saveBtn = document.getElementById('saveDataBtn');
    saveBtn.innerText = "저장 중..."; saveBtn.disabled = true;
    showToast("백그라운드에서 저장 중입니다! 🚀");

    (async () => {
        let uploadFailures = [];
        try {
            const selectedDateStr = document.getElementById('selected-date').value;
            const docId = `${user.uid}_${selectedDateStr}`;
            const existingDoc = await getDoc(doc(db, "daily_logs", docId));
            let oldData = existingDoc.exists() ? existingDoc.data() : { awardedPoints: {} };

            // === 원본+썸네일 병렬 업로드 헬퍼 ===
            const uploadWithThumbParallel = async (file, folder, userId) => {
                if (!file) return { url: null, thumbUrl: null };
                try {
                    // 원본 업로드와 썸네일 생성을 동시에 시작
                    const [url, thumbBlob] = await Promise.all([
                        uploadFileAndGetUrl(file, folder, userId),
                        generateThumbnailBlob(file).catch(() => null)
                    ]);
                    if (!url) return { url: null, thumbUrl: null };
                    // 원본 성공 후 썸네일 업로드
                    let thumbUrl = null;
                    if (thumbBlob) {
                        try {
                            const tp = `${folder}_thumbnails/${userId}/${Date.now()}_thumb.jpg`;
                            const tr = ref(storage, tp);
                            await uploadBytes(tr, thumbBlob);
                            thumbUrl = await getDownloadURL(tr);
                        } catch (e) { console.warn('썸네일 업로드 실패:', e.message); }
                    }
                    return { url, thumbUrl };
                } catch (e) {
                    console.error(`${folder} 업로드 실패:`, e);
                    return { url: null, thumbUrl: null };
                }
            };

            // === getUrl + 썸네일을 하나로 합친 헬퍼 ===
            const getUrlWithThumb = async (id, folder, oldUrl, oldThumbUrl) => {
                const el = document.getElementById(id);
                if (el && el.files[0] && el.parentElement.querySelector('.preview-img').style.display !== 'none') {
                    try {
                        const result = await uploadWithThumbParallel(el.files[0], folder, user.uid);
                        if (result.url) return result;
                        uploadFailures.push(id);
                        return { url: oldUrl || null, thumbUrl: oldThumbUrl || null };
                    } catch (err) {
                        console.error(`${id} 업로드 실패:`, err);
                        uploadFailures.push(id);
                        return { url: oldUrl || null, thumbUrl: oldThumbUrl || null };
                    }
                }
                if (el) {
                    const previewImg = el.parentElement.querySelector('.preview-img');
                    if (previewImg && previewImg.style.display === 'none' && previewImg.hasAttribute('data-user-removed')) {
                        return { url: null, thumbUrl: null };
                    }
                }
                return { url: oldUrl || null, thumbUrl: oldThumbUrl || null };
            };

            // === 모든 업로드를 병렬로 실행 ===
            console.log('📤 모든 이미지 병렬 업로드 시작');
            const uploadStart = Date.now();

            // 1) 식단 4장 병렬
            const dietPromise = Promise.all([
                getUrlWithThumb('diet-img-breakfast', 'diet_images', oldData?.diet?.breakfastUrl, oldData?.diet?.breakfastThumbUrl),
                getUrlWithThumb('diet-img-lunch', 'diet_images', oldData?.diet?.lunchUrl, oldData?.diet?.lunchThumbUrl),
                getUrlWithThumb('diet-img-dinner', 'diet_images', oldData?.diet?.dinnerUrl, oldData?.diet?.dinnerThumbUrl),
                getUrlWithThumb('diet-img-snack', 'diet_images', oldData?.diet?.snackUrl, oldData?.diet?.snackThumbUrl),
            ]);

            // 2) 운동 사진 병렬
            const cardioBlocks = document.querySelectorAll('.cardio-block');
            const cardioPromise = Promise.all([...cardioBlocks].map(async (block) => {
                const fileInput = block.querySelector('.exer-file');
                let url = block.getAttribute('data-url') || null;
                let thumbUrl = block.getAttribute('data-thumb-url') || null;
                let aiAnalysis = null;
                try { aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis')); } catch(_) {}
                if (fileInput.files[0]) {
                    try {
                        const result = await uploadWithThumbParallel(fileInput.files[0], 'exercise_images', user.uid);
                        url = result.url;
                        if (result.thumbUrl) thumbUrl = result.thumbUrl;
                    } catch (err) {
                        console.error('⚠️ 유산소 사진 업로드 실패:', err);
                        url = null;
                    }
                }
                return url ? { imageUrl: url, imageThumbUrl: thumbUrl, aiAnalysis } : null;
            }));

            // 3) 근력 영상 병렬
            const strengthBlocks = document.querySelectorAll('.strength-block');
            const strengthPromise = Promise.all([...strengthBlocks].map(async (block) => {
                const fileInput = block.querySelector('.exer-file');
                let url = block.getAttribute('data-url') || null;
                let thumbUrl = block.getAttribute('data-thumb-url') || null;
                let aiAnalysis = null;
                try { aiAnalysis = JSON.parse(block.getAttribute('data-ai-analysis')); } catch(_) {}
                if (fileInput.files[0]) {
                    try {
                        // 영상 원본 업로드와 영상 썸네일 생성을 동시에
                        const [uploadedUrl, vtb] = await Promise.all([
                            uploadFileAndGetUrl(fileInput.files[0], 'exercise_videos', user.uid),
                            generateVideoThumbnailBlob(fileInput.files[0]).catch(() => null)
                        ]);
                        url = uploadedUrl;
                        if (url && vtb) {
                            try {
                                const vtp = `exercise_videos_thumbnails/${user.uid}/${Date.now()}_thumb.jpg`;
                                const vtr = ref(storage, vtp);
                                await uploadBytes(vtr, vtb);
                                thumbUrl = await getDownloadURL(vtr);
                            } catch (e) { console.warn('근력 영상 썸네일 실패:', e.message); }
                        }
                    } catch (err) {
                        console.error('⚠️ 근력 영상 업로드 실패:', err);
                        url = null;
                    }
                }
                return url ? { videoUrl: url, videoThumbUrl: thumbUrl, aiAnalysis } : null;
            }));

            // 4) 수면 사진
            const sleepFile = document.getElementById('sleep-img');
            const sleepPromise = (async () => {
                let sUrl = oldData?.sleepAndMind?.sleepImageUrl || null;
                let sThumbUrl = oldData?.sleepAndMind?.sleepImageThumbUrl || null;
                if (sleepFile.files[0] && document.getElementById('preview-sleep').style.display !== 'none') {
                    try {
                        const result = await uploadWithThumbParallel(sleepFile.files[0], 'sleep_images', user.uid);
                        sUrl = result.url;
                        sThumbUrl = result.thumbUrl;
                    } catch (err) {
                        console.error('⚠️ 수면 사진 업로드 실패:', err);
                        sUrl = null; sThumbUrl = null;
                    }
                } else if (document.getElementById('preview-sleep').style.display === 'none' && document.getElementById('preview-sleep').hasAttribute('data-user-removed')) {
                    sUrl = null; sThumbUrl = null;
                }
                return { url: sUrl, thumbUrl: sThumbUrl };
            })();

            // 모든 업로드 완료 대기
            const [dietResults, cardioResults, strengthResults, sleepResult] = await Promise.all([
                dietPromise, cardioPromise, strengthPromise, sleepPromise
            ]);

            console.log(`✅ 전체 업로드 완료 (${((Date.now() - uploadStart) / 1000).toFixed(1)}초)`);

            const [bResult, lResult, dResult, sResult] = dietResults;
            const bUrl = bResult.url, lUrl = lResult.url, dUrl = dResult.url, sUrl = sResult.url;
            const bThumbUrl = bResult.thumbUrl, lThumbUrl = lResult.thumbUrl, dThumbUrl = dResult.thumbUrl, sThumbUrl = sResult.thumbUrl;

            const cardioList = cardioResults.filter(Boolean);
            const strengthList = strengthResults.filter(Boolean);

            let sleepUrl = sleepResult.url;
            let sleepThumbUrl = sleepResult.thumbUrl;

            const hasDiet = !!(bUrl || lUrl || dUrl || sUrl);
            const hasExer = cardioList.length > 0 || strengthList.length > 0;
            const meditationDone = document.getElementById('meditation-check').checked;
            // 감사일기 텍스트 정제 (XSS 방지)
            const gratitudeText = sanitizeText(document.getElementById('gratitude-journal').value, 500);
            const hasMind = !!(sleepUrl || meditationDone || gratitudeText);

            // === 신규 포인트 시스템 (최대 80P/일) ===
            let awarded = oldData.awardedPoints || {};
            const oldDietPts = awarded.dietPoints || 0;
            const oldExerPts = awarded.exercisePoints || 0;
            const oldMindPts = awarded.mindPoints || 0;

            // 식단: 사진당 10P, 최대 30P (3장까지 인정)
            const dietPhotoCount = [bUrl, lUrl, dUrl, sUrl].filter(u => !!u).length;
            const newDietPts = Math.min(dietPhotoCount * 10, 30);

            // 운동: 유산소 첫 10P + 추가 5P, 근력 첫 10P + 추가 5P (최대 30P)
            let newExerPts = 0;
            if (cardioList.length >= 1) newExerPts += 10;
            if (cardioList.length >= 2) newExerPts += 5;
            if (strengthList.length >= 1) newExerPts += 10;
            if (strengthList.length >= 2) newExerPts += 5;
            newExerPts = Math.min(newExerPts, 30);

            // 마음: 수면분석 10P + 마음챙김/감사일기 10P (최대 20P)
            let newMindPts = 0;
            if (sleepUrl) newMindPts += 10;
            if (meditationDone || gratitudeText) newMindPts += 10;
            newMindPts = Math.min(newMindPts, 20);

            const pointsToGive = Math.max(0, newDietPts - oldDietPts) +
                Math.max(0, newExerPts - oldExerPts) +
                Math.max(0, newMindPts - oldMindPts);

            awarded.dietPoints = newDietPts;
            awarded.exercisePoints = newExerPts;
            awarded.mindPoints = newMindPts;
            awarded.diet = newDietPts > 0;
            awarded.exercise = newExerPts > 0;
            awarded.mind = newMindPts > 0;

            // 기존 AI 분석 결과 보존
            const existingAnalysis = oldData.dietAnalysis || {};
            const existingSleepAnalysis = oldData.sleepAndMind?.sleepAnalysis || null;

            const saveData = sanitize({
                userId: user.uid, userName: getUserDisplayName(), date: selectedDateStr, timestamp: serverTimestamp(), awardedPoints: awarded,
                metrics: { weight: document.getElementById('weight').value, glucose: document.getElementById('glucose').value, bpSystolic: document.getElementById('bp-systolic').value, bpDiastolic: document.getElementById('bp-diastolic').value },
                diet: {
                    breakfastUrl: bUrl, lunchUrl: lUrl, dinnerUrl: dUrl, snackUrl: sUrl,
                    breakfastThumbUrl: bThumbUrl, lunchThumbUrl: lThumbUrl, dinnerThumbUrl: dThumbUrl, snackThumbUrl: sThumbUrl
                },
                dietAnalysis: existingAnalysis,
                exercise: { cardioList: cardioList, strengthList: strengthList },
                sleepAndMind: { sleepImageUrl: sleepUrl, sleepImageThumbUrl: sleepThumbUrl, sleepAnalysis: existingSleepAnalysis, meditationDone: meditationDone, gratitude: gratitudeText }
            });

            // Firestore 저장 (초기 연결 지연 대비 자동 재시도)
            for (let saveAttempt = 0; saveAttempt < 3; saveAttempt++) {
                try {
                    await setDoc(doc(db, "daily_logs", docId), saveData, { merge: true });
                    break;
                } catch (saveErr) {
                    if (saveErr.code === 'unavailable' && saveAttempt < 2) {
                        console.warn(`Firestore 저장 재시도 (${saveAttempt + 1}/3):`, saveErr.message);
                        await new Promise(r => setTimeout(r, 1500 * (saveAttempt + 1)));
                    } else {
                        throw saveErr;
                    }
                }
            }

            // coins 업데이트는 Cloud Function(awardPoints)이 서버에서 처리
            if (uploadFailures.length > 0) {
                showToast(`⚠️ 일부 사진 업로드에 실패했습니다. 나머지 데이터는 저장되었습니다. 사진을 다시 선택 후 저장해주세요.`);
            } else if (pointsToGive > 0) {
                const currentDisplayed = parseInt(document.getElementById('point-balance').innerText) || 0;
                document.getElementById('point-balance').innerText = currentDisplayed + pointsToGive;
                showToast(`🎉 저장 완료! 새롭게 ${pointsToGive}P 획득!`);
            } else { showToast(`🎉 데이터가 업데이트되었습니다.`); }

            // 데이터 저장 후 캐시 초기화 (갤러리 재로드를 위해)
            cachedGalleryLogs = [];
            galleryDisplayCount = 0;
            sortedFilteredDirty = true;
            // 대시보드/자산 캐시도 무효화
            _dashboardCache.ts = 0;
            _assetCache.ts = 0;

            // 마일스톤 확인 및 업데이트
            await checkMilestones(user.uid);
            await renderMilestones(user.uid);

            // 챌린지 진행도 업데이트
            await updateChallengeProgress();

            loadDataForSelectedDate(selectedDateStr);

        } catch (e) {
            console.error('데이터 저장 오류:', e);
            let errorMsg = '저장 중 오류가 발생했습니다.';
            if (e.code === 'permission-denied') {
                errorMsg = '저장 권한이 없습니다. 로그인을 확인해주세요.';
            } else if (e.code === 'unavailable') {
                errorMsg = '네트워크 연결을 확인해주세요.';
            } else if (e.message) {
                errorMsg = e.message;
            }
            showToast(`⚠️ ${errorMsg}`);
        }
        finally { saveBtn.innerText = "현재 진행상황 저장 & 포인트 받기 🅿️"; saveBtn.disabled = false; }
    })();
});

// [핵심] 갤러리 하트 누르면 즉각 반응 (새로고침 방지)
// reactions 필드만 업데이트하여 보안 규칙 충돌 방지
window.toggleReaction = async function (docId, reactionType, btnElement) {
    const user = auth.currentUser;
    if (!user) { document.getElementById('login-modal').style.display = 'flex'; return; }

    // span이 없으면 생성 (count 0일 때 span 없는 템플릿 대응)
    let span = btnElement.querySelector('span');
    if (!span) {
        span = document.createElement('span');
        span.innerText = '0';
        btnElement.appendChild(span);
    }
    let count = parseInt(span.innerText) || 0;
    // 'reacted' 또는 'active' 클래스 모두 호환
    const isActive = btnElement.classList.contains('reacted') || btnElement.classList.contains('active');

    if (isActive) { btnElement.classList.remove('reacted', 'active'); count = Math.max(0, count - 1); }
    else { btnElement.classList.add('reacted'); count++; }
    span.innerText = count;

    try {
        const logRef = doc(db, "daily_logs", docId);

        // arrayUnion/arrayRemove로 원자적 업데이트 (전체 문서 읽기 불필요)
        if (isActive) {
            await setDoc(logRef, {
                reactions: { [reactionType]: arrayRemove(user.uid) }
            }, { merge: true });
        } else {
            await setDoc(logRef, {
                reactions: { [reactionType]: arrayUnion(user.uid) }
            }, { merge: true });
        }
    } catch (error) {
        console.error('반응 저장 오류:', error);
        // UI 롤백 (실패 시 원복)
        if (isActive) { btnElement.classList.add('reacted'); count++; }
        else { btnElement.classList.remove('reacted'); count = Math.max(0, count - 1); }
        span.innerText = count;
        showToast('⚠️ 반응 저장에 실패했습니다.');
    }
};

window.toggleFriend = async function (friendId) {
    const user = auth.currentUser;
    if (!user) { document.getElementById('login-modal').style.display = 'flex'; return; }
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    let friends = userSnap.exists() ? (userSnap.data().friends || []) : [];
    if (friends.includes(friendId)) { await setDoc(userRef, { friends: arrayRemove(friendId) }, { merge: true }); showToast("친구 삭제 완료"); }
    else {
        if (friends.length >= 3) { showToast("친구는 3명까지만 가능합니다!"); return; }
        await setDoc(userRef, { friends: arrayUnion(friendId) }, { merge: true }); showToast("✨ 친구 등록 완료! 갤러리 상단에 뜹니다.");
    }
    // 친구 목록 변경 시 캐시 초기화 및 재로드
    cachedGalleryLogs = [];
    galleryDisplayCount = 0;
    sortedFilteredDirty = true;
    loadGalleryData();
};

let latestShareBlob = null;
let latestShareFile = null;
let latestShareText = '';
const thumbUrlCache = new Map();

// fetchImageAsBase64는 상단에서 직접 import

function isVideoUrl(url) {
    return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url || '');
}

function getStoragePathFromUrl(url) {
    try {
        const match = String(url || '').match(/\/o\/([^?]+)/);
        if (!match || !match[1]) return '';
        return decodeURIComponent(match[1]);
    } catch (_) {
        return '';
    }
}

function buildThumbPathFromOriginal(url, sourceFolder, thumbFolder) {
    const originalPath = getStoragePathFromUrl(url);
    if (!originalPath) return '';
    if (!originalPath.startsWith(`${sourceFolder}/`)) return '';
    return `${thumbFolder}/${originalPath.substring(sourceFolder.length + 1)}`;
}

function splitFileName(fileName) {
    const idx = fileName.lastIndexOf('.');
    if (idx <= 0) return { base: fileName, ext: '' };
    return { base: fileName.substring(0, idx), ext: fileName.substring(idx + 1).toLowerCase() };
}

function buildThumbPathCandidates(originalUrl, sourceFolder, thumbFolder) {
    const originalPath = getStoragePathFromUrl(originalUrl);
    if (!originalPath || !originalPath.startsWith(`${sourceFolder}/`)) return [];

    const fileName = originalPath.substring(sourceFolder.length + 1);
    const { base, ext } = splitFileName(fileName);
    const parts = base.split('_');
    const extCandidates = ['jpg', 'jpeg', 'png', 'webp', ext].filter(Boolean);
    const uniqueExt = [...new Set(extCandidates)];
    const paths = new Set();

    if (parts.length >= 2) {
        const prefix = `${parts[0]}_${parts[1]}`;
        const rest = parts.slice(2).join('_');

        if (sourceFolder === 'exercise_videos') {
            ['jpg', 'jpeg', 'png', 'webp'].forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb.${e}`));
            if (rest) ['jpg', 'jpeg', 'png', 'webp'].forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb_${rest}.${e}`));
        } else {
            if (rest) uniqueExt.forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb_${rest}.${e}`));
            uniqueExt.forEach(e => paths.add(`${thumbFolder}/${prefix}_thumb.${e}`));
        }
    }

    paths.add(`${thumbFolder}/${fileName}`);

    return [...paths];
}

async function resolveThumbUrl(originalUrl, sourceFolder, thumbFolder) {
    // 클라이언트 사이드 썸네일: 저장 시 _thumb 파일도 함께 업로드
    // 이미 썸네일이 있으면 그 URL을 반환, 없으면 원본 반환
    return originalUrl || null;
}

// 이미지 파일로부터 1:1 정사각형 썸네일 생성 (300x300, JPEG 60%)
async function generateThumbnailBlob(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const size = 300; // 출력 크기 300x300
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 중앙 기준 정사각형 crop
                const srcSize = Math.min(img.width, img.height);
                const sx = (img.width - srcSize) / 2;
                const sy = (img.height - srcSize) / 2;
                ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

// 동영상 파일로부터 1:1 정사각형 썸네일 생성 (300x300, JPEG 70%)
async function generateVideoThumbnailBlob(file) {
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        video.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;';
        document.body.appendChild(video);

        let resolved = false;
        const done = (blob) => {
            if (resolved) return;
            resolved = true;
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.remove();
            URL.revokeObjectURL(objectUrl);
            resolve(blob || null);
        };

        const timer = setTimeout(() => done(null), 12000);

        const captureFrame = () => {
            try {
                const w = video.videoWidth || 320;
                const h = video.videoHeight || 180;
                const size = 300;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // 중앙 기준 정사각형 crop
                const srcSize = Math.min(w, h);
                const sx = (w - srcSize) / 2;
                const sy = (h - srcSize) / 2;
                ctx.drawImage(video, sx, sy, srcSize, srcSize, 0, 0, size, size);

                // 검은 프레임 감지
                const px = ctx.getImageData(size / 2, size / 2, 1, 1).data;
                if (px[0] === 0 && px[1] === 0 && px[2] === 0 && video.currentTime < 3) {
                    video.currentTime = Math.min(video.duration || 2, 2);
                    video.addEventListener('seeked', () => {
                        try {
                            ctx.drawImage(video, sx, sy, srcSize, srcSize, 0, 0, size, size);
                            clearTimeout(timer);
                            canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.7);
                        } catch (_) { clearTimeout(timer); done(null); }
                    }, { once: true });
                    return;
                }
                clearTimeout(timer);
                canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.7);
            } catch (_) { clearTimeout(timer); done(null); }
        };

        video.addEventListener('error', () => { clearTimeout(timer); done(null); }, { once: true });
        video.addEventListener('loadeddata', () => {
            try {
                const dur = Number.isFinite(video.duration) ? video.duration : 0;
                video.currentTime = dur > 1 ? 0.8 : 0.01;
            } catch (_) { clearTimeout(timer); done(null); }
        }, { once: true });
        video.addEventListener('seeked', captureFrame, { once: true });

        video.src = objectUrl;
        video.load();
    });
}

// 이미지 파일 업로드 + 썸네일도 함께 업로드
async function uploadImageWithThumb(file, folderName, userId) {
    if (!file) return { url: null, thumbUrl: null };

    try {
        // 원본 업로드
        const url = await uploadFileAndGetUrl(file, folderName, userId);
        if (!url) return { url: null, thumbUrl: null };

        // 썸네일 생성 & 업로드
        let thumbUrl = null;
        try {
            const thumbBlob = await generateThumbnailBlob(file);
            if (thumbBlob) {
                const timestamp = Date.now();
                const thumbPath = `${folderName}_thumbnails/${userId}/${timestamp}_thumb.jpg`;
                const thumbRef = ref(storage, thumbPath);
                await uploadBytes(thumbRef, thumbBlob);
                thumbUrl = await getDownloadURL(thumbRef);
            }
        } catch (e) {
            console.warn('썸네일 생성/업로드 실패 (원본은 성공):', e.message);
        }

        return { url, thumbUrl };
    } catch (e) {
        console.error('이미지 업로드 실패:', e);
        return { url: null, thumbUrl: null };
    }
}

window.handleThumbFallback = function (imgEl) {
    const raw = imgEl.getAttribute('data-fallback-list') || '';
    const list = raw ? raw.split('||').filter(Boolean) : [];
    if (!list.length) {
        imgEl.onerror = null;
        imgEl.classList.add('img-error');
        return;
    }
    const next = list.shift();
    imgEl.setAttribute('data-fallback-list', list.join('||'));
    imgEl.src = next;
};

async function fetchVideoFrameAsBase64(url) {
    return new Promise((resolve) => {
        const video = document.createElement('video');
        let timer = null;

        const cleanup = () => {
            if (timer) clearTimeout(timer);
            video.removeAttribute('src');
            video.load();
        };

        const fail = () => {
            cleanup();
            resolve('');
        };

        video.crossOrigin = 'anonymous';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';

        video.addEventListener('error', fail, { once: true });
        video.addEventListener('loadedmetadata', () => {
            try {
                const duration = Number.isFinite(video.duration) ? video.duration : 0;
                const targetTime = duration > 0 ? Math.max(0.6, Math.min(2.2, duration * 0.35)) : 1.0;
                video.currentTime = targetTime;
            } catch (_) {
                fail();
            }
        }, { once: true });

        video.addEventListener('seeked', () => {
            try {
                const canvas = document.createElement('canvas');
                const width = Math.max(1, video.videoWidth || 320);
                const height = Math.max(1, video.videoHeight || 320);
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                cleanup();
                resolve(dataUrl);
            } catch (_) {
                fail();
            }
        }, { once: true });

        timer = setTimeout(fail, 5000);
        video.src = url;
        video.load();
    });
}

function createVideoPlaceholderBase64() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 320, 320);
    bg.addColorStop(0, '#D7ECFF');
    bg.addColorStop(1, '#A9D7FF');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 320);

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(160, 160, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FF8C00';
    ctx.beginPath();
    ctx.moveTo(150, 142);
    ctx.lineTo(150, 178);
    ctx.lineTo(178, 160);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1565C0';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('운동 영상', 160, 248);

    return canvas.toDataURL('image/png');
}

function toSafeAttr(value) {
    return String(value || '').replace(/"/g, '&quot;');
}

function buildShareImageGrid(urls, maxCount = 4) {
    let htmlString = '';
    for (let i = 0; i < Math.min(urls.length, maxCount); i++) {
        const mediaUrl = urls[i];
        const isVideo = isVideoUrl(mediaUrl);
        const safeUrl = toSafeAttr(mediaUrl);

        if (isVideo) {
            htmlString += `<div class="share-media-thumb" data-media-type="video" data-media-src="${safeUrl}"><video src="${safeUrl}#t=0.5" muted playsinline preload="metadata" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;pointer-events:none;border-radius:8px;"></video></div>`;
        } else {
            htmlString += `<div class="share-media-thumb" data-media-type="image" data-media-src="${safeUrl}"><img src="${safeUrl}" alt="해빛 인증 사진 ${i + 1}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;"></div>`;
        }
    }
    return htmlString;
}

async function hydrateThumbImages(scopeElement) {
    const nodes = Array.from(scopeElement.querySelectorAll('[data-thumb-source][data-thumb-target]'));
    const queue = [...nodes];
    const workers = Array.from({ length: 6 }, async () => {
        while (queue.length) {
            const node = queue.shift();
            const isImg = node.tagName === 'IMG';
            const img = isImg ? node : node.querySelector('img');
            if (!img) continue;

            const originalUrl = node.getAttribute('data-media-src') || img.getAttribute('data-media-src') || img.getAttribute('src') || '';
            const sourceFolder = node.getAttribute('data-thumb-source') || img.getAttribute('data-thumb-source') || '';
            const targetFolder = node.getAttribute('data-thumb-target') || img.getAttribute('data-thumb-target') || '';
            if (!originalUrl || !sourceFolder || !targetFolder) continue;

            const thumbUrl = await resolveThumbUrl(originalUrl, sourceFolder, targetFolder);
            if (thumbUrl && thumbUrl !== originalUrl) {
                img.src = thumbUrl;
            }
        }
    });
    await Promise.all(workers);
}

async function prewarmThumbCache(logItems) {
    const tasks = [];
    const seen = new Set();

    const addTask = (url, source, target) => {
        if (!url || !source || !target) return;
        const key = `${source}|${target}|${url}`;
        if (seen.has(key) || thumbUrlCache.has(key)) return;
        seen.add(key);
        tasks.push(() => resolveThumbUrl(url, source, target));
    };

    (logItems || []).forEach(item => {
        const data = item?.data || {};
        const diet = data.diet || {};
        ['breakfastUrl', 'lunchUrl', 'dinnerUrl', 'snackUrl'].forEach(k => {
            addTask(diet[k], 'diet_images', 'diet_images_thumbnails');
        });

        const exercise = data.exercise || {};
        addTask(exercise.cardioImageUrl, 'exercise_images', 'exercise_images_thumbnails');
        addTask(exercise.strengthVideoUrl, 'exercise_videos', 'exercise_videos_thumbnails');
        (exercise.cardioList || []).forEach(c => addTask(c?.imageUrl, 'exercise_images', 'exercise_images_thumbnails'));
        (exercise.strengthList || []).forEach(s => addTask(s?.videoUrl, 'exercise_videos', 'exercise_videos_thumbnails'));
    });

    const workers = Array.from({ length: 8 }, async (_, i) => {
        for (let idx = i; idx < tasks.length; idx += 8) {
            try { await tasks[idx](); } catch (_) { }
        }
    });

    await Promise.all(workers);
}

async function prepareShareThumbsForCapture() {
    const thumbs = Array.from(document.querySelectorAll('.share-media-thumb'));
    if (!thumbs.length) return;

    const jobs = thumbs.map(async (thumb, index) => {
        const mediaType = thumb.dataset.mediaType;
        const mediaSrc = thumb.dataset.mediaSrc;
        let b64 = '';

        if (mediaType === 'video') {
            // 1) 비디오 요소에서 프레임 캡처 시도
            const videoEl = thumb.querySelector('video');
            if (videoEl && videoEl.readyState >= 2) {
                try {
                    const c = document.createElement('canvas');
                    c.width = videoEl.videoWidth || 320;
                    c.height = videoEl.videoHeight || 320;
                    c.getContext('2d').drawImage(videoEl, 0, 0, c.width, c.height);
                    b64 = c.toDataURL('image/jpeg', 0.85);
                } catch (_) { }
            }
            // 2) 썸네일 이미지가 있으면 사용
            if (!b64 || b64 === 'data:,') {
                const renderedThumbImg = thumb.querySelector('img');
                if (renderedThumbImg?.src && !renderedThumbImg.src.startsWith('data:video')) {
                    b64 = await fetchImageAsBase64(renderedThumbImg.src);
                }
            }
            // 3) 최종 폴백: 플레이스홀더 생성
            if (!b64 || b64 === 'data:,' || /^data:video/i.test(b64)) {
                b64 = createVideoPlaceholderBase64();
            }
        } else {
            b64 = await fetchImageAsBase64(mediaSrc);
            if (!b64) b64 = mediaSrc;
        }

        // 1:1 정사각형 크롭 (화면 비율 증상 방지)
        const croppedB64 = await cropToSquareBase64(b64);
        thumb.innerHTML = `<img src="${croppedB64}" alt="해빛 인증 ${index + 1}" style="width:100%;height:100%;object-fit:cover;">`;
    });

    await Promise.all(jobs);
}

// 이미지를 1:1 정사각형으로 크롭하여 base64 반환
function cropToSquareBase64(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const size = Math.min(img.width, img.height);
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(src); // 실패 시 원본 반환
        img.src = src;
    });
}

function openSharePlatformModal() {
    const modal = document.getElementById('share-platform-modal');
    if (modal) modal.style.display = 'flex';
}

window.closeSharePlatformModal = function () {
    const modal = document.getElementById('share-platform-modal');
    if (modal) modal.style.display = 'none';
};

async function createSquareShareBlob() {
    await _ensureHtml2Canvas();
    const captureArea = document.getElementById('capture-area');
    const width = captureArea.offsetWidth;
    const height = captureArea.offsetHeight;

    const sourceCanvas = await html2canvas(captureArea, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
        allowTaint: false,
        logging: false,
        imageTimeout: 7000,
        removeContainer: true,
        foreignObjectRendering: false,
        width,
        height
    });

    // 1:1 정사각형으로 강제 변환 (인스타그램 최적화)
    const size = Math.max(sourceCanvas.width, sourceCanvas.height);
    const squareCanvas = document.createElement('canvas');
    squareCanvas.width = size;
    squareCanvas.height = size;
    const ctx = squareCanvas.getContext('2d');

    // 배경 그라데이션 (카드 배경과 어울리게)
    const grd = ctx.createLinearGradient(0, 0, size, size);
    grd.addColorStop(0, '#FFF8E1');
    grd.addColorStop(0.4, '#FFE0B2');
    grd.addColorStop(1, '#FFCC80');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);

    // 중앙 배치
    const offsetX = (size - sourceCanvas.width) / 2;
    const offsetY = (size - sourceCanvas.height) / 2;
    ctx.drawImage(sourceCanvas, offsetX, offsetY);

    return await new Promise((resolve, reject) => {
        squareCanvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Blob 생성 실패'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
};

window.shareMyCard = async function () {
    const btn = document.querySelector('.btn-share-action');
    const originalText = btn.innerHTML;
    btn.innerText = '⏳ 이미지 생성 중...';
    btn.disabled = true;

    try {
        await prepareShareThumbsForCapture();
        const blob = await createSquareShareBlob();
        latestShareBlob = blob;
        latestShareFile = new File([blob], `haebit_cert_${Date.now()}.png`, { type: 'image/png' });
        latestShareText = '오늘의 해빛스쿨 건강 습관 인증입니다! 함께해요 💪\n\n👇 갤러리 구경가기 (가입 없이 가능)\n' + window.location.href;

        // 공유 미리보기 썸네일 설정
        const previewThumb = document.getElementById('share-preview-thumb');
        if (previewThumb && latestShareBlob) {
            previewThumb.src = URL.createObjectURL(latestShareBlob);
        }

        // 모바일: Web Share API 우선 시도 (파일 공유 직접 지원)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const shareData = { title: '해빛스쿨 인증', text: latestShareText, files: [latestShareFile] };
        if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                showToast('✅ 공유 완료!');
                return;
            } catch (shareErr) {
                if (shareErr.name === 'AbortError') return;
                console.warn('시스템 공유 실패, 모달 표시:', shareErr);
            }
        }
        // PC 또는 모바일 Web Share 실패 시 모달 표시
        openSharePlatformModal();
    } catch (err) {
        console.error('공유 카드 생성 오류:', err);
        showToast('⚠️ 카드 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.shareViaSystem = async function () {
    if (!latestShareFile) {
        showToast('먼저 공유 이미지를 생성해주세요.');
        return;
    }

    const shareData = {
        title: '해빛스쿨 인증',
        text: latestShareText,
        files: [latestShareFile]
    };

    try {
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            closeSharePlatformModal();
        } else {
            // 파일 공유 미지원 시 텍스트만 공유 시도
            const textShareData = { title: '해빛스쿨 인증', text: latestShareText };
            if (navigator.share) {
                await navigator.share(textShareData);
                closeSharePlatformModal();
            } else {
                showToast('이 브라우저는 시스템 공유를 지원하지 않습니다.\n이미지 저장 또는 링크 복사를 이용해주세요.');
            }
        }
    } catch (_) { }
};

window.downloadShareImage = function () {
    if (!latestShareBlob) {
        showToast('먼저 자랑하기 버튼을 눌러주세요.');
        return;
    }
    const url = URL.createObjectURL(latestShareBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haebit_cert_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ 이미지가 다운로드 폴더에 저장되었습니다.');
};

window.copyShareLink = function () {
    const url = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
            showToast('✅ 링크가 복사되었습니다!');
        }).catch(() => {
            fallbackCopyToClipboard(url);
        });
    } else {
        fallbackCopyToClipboard(url);
    }
};

function fallbackCopyToClipboard(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('✅ 링크가 복사되었습니다!'); }
    catch (_) { showToast('⚠️ 복사에 실패했습니다. 직접 주소를 복사해주세요.'); }
    document.body.removeChild(ta);
}

async function shareFileToAppsOrFallback(platform) {
    // 모바일에서 Web Share API 재시도
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const shareData = {
        title: '해빛스쿨 인증',
        text: latestShareText,
        files: [latestShareFile]
    };
    if (isMobile && navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            closeSharePlatformModal();
            return true;
        } catch (_) { }
    }

    // PC에서는 이미지 자동 다운로드 + 플랫폼 열기
    downloadShareImage();

    const pageUrl = encodeURIComponent(window.location.href);
    const shareText = encodeURIComponent('오늘의 해빛스쿨 건강 습관 인증입니다! 함께해요 💪');

    if (platform === 'instagram') {
        window.open('https://www.instagram.com/', '_blank');
        showToast('📥 이미지가 저장되었습니다!\n인스타그램에서 이미지를 선택하여 게시해주세요.');
    } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${shareText}`, '_blank');
        showToast('📥 이미지가 저장되었습니다!\n페이스북 창에서 이미지를 추가해주세요.');
    } else if (platform === 'x') {
        window.open(`https://x.com/intent/tweet?text=${shareText}&url=${pageUrl}`, '_blank');
        showToast('📥 이미지가 저장되었습니다!\nX 창에서 이미지를 추가해주세요.');
    } else if (platform === 'kakao') {
        downloadShareImage();
        _ensureKakao().then(() => {
            Kakao.Share.sendDefault({
                objectType: 'feed',
                content: {
                    title: '오늘의 해빛 인증 🌞',
                    description: shareText,
                    imageUrl: 'https://habitschool.web.app/icons/og-image.png',
                    link: { mobileWebUrl: window.location.href, webUrl: window.location.href }
                },
                buttons: [{ title: '갤러리 구경가기', link: { mobileWebUrl: window.location.href, webUrl: window.location.href } }]
            });
        }).catch(() => {
            if (navigator.share) navigator.share({ title: '해빛스쿨 인증', text: shareText, url: window.location.href }).catch(() => {});
            else showToast('📥 이미지가 저장되었습니다!\n카카오톡에서 직접 공유해주세요.');
        });
    }

    closeSharePlatformModal();
    return false;
}

window.shareToPlatform = async function (platform) {
    if (!latestShareBlob || !latestShareFile) {
        showToast('먼저 자랑하기 버튼을 눌러 이미지를 생성해주세요.');
        return;
    }

    try {
        await shareFileToAppsOrFallback(platform);
    } catch (err) {
        console.error('공유 실패:', err);
        showToast('공유 중 오류가 발생했습니다. 다시 시도해주세요.');
    }
};

let cachedGalleryLogs = [];
let cachedMyFriends = [];

// 무한 스크롤 관련 변수
let galleryDisplayCount = 0;
const INITIAL_LOAD = 8;        // 초기 로드: 8개 (빠른 첫 화면)
const LOAD_MORE = 6;           // 추가 로드: 6개씩
const MAX_CACHE_SIZE = 30;     // 캐시 크기 (메모리 관리)
let galleryIntersectionObserver = null;
let isLoadingMore = false;
// 정렬+필터 캐시 (매번 재정렬 방지)
let sortedFilteredCache = [];
let sortedFilteredDirty = true;

// 갤러리 게시물 삭제 (본인 게시물만)
// 게시물 신고
window.reportPost = async function (docId, targetUserId) {
    const user = auth.currentUser;
    if (!user) return;
    const reason = prompt('신고 사유를 선택해주세요:\n1. 부적절한 콘텐츠\n2. 스팸/광고\n3. 혐오 발언\n4. 기타\n\n번호 또는 사유를 입력하세요:');
    if (!reason) return;
    const reasons = { '1': '부적절한 콘텐츠', '2': '스팸/광고', '3': '혐오 발언', '4': '기타' };
    const reasonText = reasons[reason] || reason;
    try {
        await setDoc(doc(db, 'reports', `${user.uid}_${docId}`), {
            reporterUid: user.uid,
            targetDocId: docId,
            targetUserId: targetUserId,
            reason: reasonText,
            type: 'post',
            createdAt: new Date().toISOString()
        });
        showToast('🚨 신고가 접수되었습니다. 검토 후 조치하겠습니다.');
    } catch (e) {
        console.error('신고 오류:', e);
        showToast('신고 접수에 실패했습니다.');
    }
};

// 사용자 차단
window.blockUser = async function (targetUserId, targetName) {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm(`${targetName}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물이 갤러리에 표시되지 않습니다.`)) return;
    try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const blockedUsers = userSnap.exists() ? (userSnap.data().blockedUsers || []) : [];
        if (!blockedUsers.includes(targetUserId)) {
            blockedUsers.push(targetUserId);
            await setDoc(userRef, { blockedUsers }, { merge: true });
        }
        window._blockedUsers = blockedUsers;
        sortedFilteredDirty = true;
        renderFeedOnly();
        showToast(`🚫 ${targetName}님을 차단했습니다.`);
    } catch (e) {
        console.error('차단 오류:', e);
        showToast('차단에 실패했습니다.');
    }
};

// 댓글 신고
window.reportComment = async function (docId, commentIdx) {
    const user = auth.currentUser;
    if (!user) return;
    try {
        await setDoc(doc(db, 'reports', `${user.uid}_${docId}_c${commentIdx}`), {
            reporterUid: user.uid,
            targetDocId: docId,
            commentIndex: commentIdx,
            type: 'comment',
            createdAt: new Date().toISOString()
        });
        showToast('🚨 댓글 신고가 접수되었습니다.');
    } catch (e) {
        console.error('댓글 신고 오류:', e);
        showToast('신고 접수에 실패했습니다.');
    }
};

window.deleteGalleryPost = async function (docId) {
    const user = auth.currentUser;
    if (!user) return;
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (!item || item.data.userId !== user.uid) {
        showToast('본인 게시물만 삭제할 수 있습니다.');
        return;
    }
    if (!confirm('이 게시물을 삭제하시겠습니까?\n삭제하면 복구할 수 없습니다.')) return;

    try {
        await deleteDoc(doc(db, "daily_logs", docId));
        cachedGalleryLogs = cachedGalleryLogs.filter(l => l.id !== docId);
        sortedFilteredDirty = true;
        renderFeedOnly();
        showToast('✅ 게시물이 삭제되었습니다.');
    } catch (e) {
        console.error('게시물 삭제 오류:', e);
        showToast('삭제에 실패했습니다. 다시 시도해주세요.');
    }
};

// 게시물 메뉴 토글
window.togglePostMenu = function (btn) {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    // 다른 열린 메뉴 모두 닫기
    document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
    menu.style.display = isOpen ? 'none' : 'block';
};

// 바깥 클릭 시 메뉴 닫기
document.addEventListener('click', function (e) {
    if (!e.target.closest('.post-menu-container')) {
        document.querySelectorAll('.post-menu-dropdown').forEach(m => m.style.display = 'none');
    }
});

// 무한 스크롤 옵저버 설정
function setupInfiniteScroll() {
    const sentinel = document.getElementById('gallery-sentinel');
    if (!sentinel) return;

    // 기존 옵저버가 있으면 해제
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
    }

    galleryIntersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoadingMore) {
                loadMoreGalleryItems();
            }
        });
    }, {
        rootMargin: '100px' // 하단 100px 전에 미리 로드
    });

    galleryIntersectionObserver.observe(sentinel);
}

// 빈 상태 HTML (필터별 맞춤 메시지)
function getEmptyStateHtml(filter) {
    const messages = {
        all: { emoji: '📷', title: '아직 기록이 없어요', desc: '식단, 운동, 마음 기록을 시작해보세요!<br>기록 탭에서 오늘의 건강 습관을 인증할 수 있어요.' },
        diet: { emoji: '🥗', title: '식단 기록이 없어요', desc: '오늘 먹은 식사를 사진으로 기록해보세요!<br>AI가 영양 분석도 해드려요.' },
        exercise: { emoji: '🏃', title: '운동 기록이 없어요', desc: '운동 사진이나 영상을 올려보세요!<br>함께 운동하면 더 즐거워요.' },
        mind: { emoji: '🧘', title: '마음 기록이 없어요', desc: '오늘의 감사일기나 수면 기록을 남겨보세요!<br>작은 기록이 큰 변화를 만들어요.' }
    };
    const m = messages[filter] || messages.all;
    return `<div class="gallery-empty-state">
        <div class="empty-emoji">${m.emoji}</div>
        <div class="empty-title">${m.title}</div>
        <div class="empty-desc">${m.desc}</div>
    </div>`;
}

// 주간 베스트 갤러리 (이번 주 가장 많은 반응을 받은 상위 3개)
function buildWeeklyBestSection() {
    const container = document.getElementById('weekly-best-container');
    if (!container) return;

    // 이번 주 기준 (월요일~일요일)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    const mondayStr = monday.toISOString().slice(0, 10);

    const weekLogs = cachedGalleryLogs.filter(item => item.data.date >= mondayStr);
    if (weekLogs.length === 0) {
        container.style.display = 'none';
        return;
    }

    // 반응 수 기준 정렬
    const scored = weekLogs.map(item => {
        const rx = item.data.reactions || {};
        const total = (rx.heart?.length || 0) + (rx.fire?.length || 0) + (rx.clap?.length || 0) + (item.data.comments?.length || 0);
        return { ...item, score: total };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);

    if (scored.length === 0) {
        container.style.display = 'none';
        return;
    }

    let html = '<div class="weekly-best-header">🏆 이번 주 인기 기록</div><div class="weekly-best-list">';
    scored.forEach((item, idx) => {
        const data = item.data;
        const medal = ['🥇', '🥈', '🥉'][idx];
        const name = escapeHtml(data.userName || '익명');
        const rx = data.reactions || {};
        const reactions = (rx.heart?.length || 0) + (rx.fire?.length || 0) + (rx.clap?.length || 0);

        // 첫 번째 이미지 썸네일
        let thumbUrl = '';
        if (data.diet) {
            for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
                const t = data.diet[`${meal}ThumbUrl`] || data.diet[`${meal}Url`];
                if (t) { thumbUrl = t; break; }
            }
        }
        if (!thumbUrl && data.exercise) {
            thumbUrl = data.exercise.cardioImageThumbUrl || data.exercise.cardioImageUrl || '';
            if (!thumbUrl && data.exercise.cardioList?.length) thumbUrl = data.exercise.cardioList[0].imageThumbUrl || data.exercise.cardioList[0].imageUrl || '';
        }
        if (!thumbUrl && data.sleepAndMind?.sleepImageThumbUrl) thumbUrl = data.sleepAndMind.sleepImageThumbUrl;

        const safeThumb = thumbUrl ? escapeHtml(thumbUrl) : '';
        const thumbHtml = safeThumb ? `<img src="${safeThumb}" alt="인기 기록" loading="lazy">` : `<div class="best-no-img">📝</div>`;

        html += `<div class="weekly-best-item">
            <span class="best-medal">${medal}</span>
            <div class="best-thumb">${thumbHtml}</div>
            <div class="best-info">
                <span class="best-name">${name}</span>
                <span class="best-stats">❤️ ${reactions} · 💬 ${data.comments?.length || 0}</span>
            </div>
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    container.style.display = 'block';
}

// 스켈레톤 HTML 생성 (즉시 표시용)
function createSkeletonHtml(count = 3) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `<div class="gallery-card skeleton-card">
            <div class="skeleton-header">
                <div class="skeleton-avatar"></div>
                <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                    <div class="skeleton-text w60"></div>
                    <div class="skeleton-text w40"></div>
                </div>
            </div>
            <div class="gallery-skeleton">
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
                <div class="skeleton-item"></div>
            </div>
        </div>`;
    }
    return html;
}

// 아이템에 미디어가 있는지 빠르게 판단 (HTML 생성 없이)
function hasMediaForFilter(data, filter) {
    if (filter === 'diet' || filter === 'all') {
        if (data.diet) {
            for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
                if (data.diet[`${meal}Url`]) { if (filter === 'diet') return true; else break; }
            }
            if (filter === 'all' && data.diet && ['breakfast', 'lunch', 'dinner', 'snack'].some(m => data.diet[`${m}Url`])) {
                // has diet
            }
        }
    }
    if (filter === 'exercise' || filter === 'all') {
        if (data.exercise) {
            if (data.exercise.cardioImageUrl || data.exercise.strengthVideoUrl ||
                data.exercise.cardioList?.length || data.exercise.strengthList?.length) {
                if (filter === 'exercise') return true;
            }
        }
    }
    if (filter === 'mind' || filter === 'all') {
        if (data.sleepAndMind?.sleepImageUrl || data.sleepAndMind?.gratitude) {
            if (filter === 'mind') return true;
        }
    }
    if (filter === 'all') {
        const hasDiet = data.diet && ['breakfast', 'lunch', 'dinner', 'snack'].some(m => data.diet[`${m}Url`]);
        const hasExercise = data.exercise && (data.exercise.cardioImageUrl || data.exercise.strengthVideoUrl || data.exercise.cardioList?.length || data.exercise.strengthList?.length);
        const hasMind = data.sleepAndMind?.sleepImageUrl || data.sleepAndMind?.gratitude;
        return !!(hasDiet || hasExercise || hasMind);
    }
    return false;
}

// 정렬+필터 캐시 갱신 (매번 재정렬/재필터 방지)
function refreshSortedFiltered() {
    if (!sortedFilteredDirty) return;
    const blockedUsers = window._blockedUsers || [];
    let sorted = [...cachedGalleryLogs].filter(item => !blockedUsers.includes(item.data.userId));
    sorted.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId);
        const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });
    sortedFilteredCache = sorted.filter(item => hasMediaForFilter(item.data, galleryFilter));
    sortedFilteredDirty = false;
}

// 추가 아이템 로드 함수 (추가분만 append - 전체 재렌더 X)
function loadMoreGalleryItems() {
    if (isLoadingMore) return;

    refreshSortedFiltered();
    const sentinel = document.getElementById('gallery-sentinel');

    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
        return;
    }

    isLoadingMore = true;

    // 추가분만 append (전체 재렌더 X)
    const container = document.getElementById('gallery-container');
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const start = galleryDisplayCount;
    const end = Math.min(start + LOAD_MORE, sortedFilteredCache.length);

    for (let i = start; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }

    galleryDisplayCount = end;
    isLoadingMore = false;

    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) galleryIntersectionObserver.disconnect();
    } else {
        sentinel.style.display = 'block';
    }
}

// 아이템이 표시되어야 하는지 판단 (HTML 생성 없이 빠르게)
function shouldShowItem(data) {
    return !!hasMediaForFilter(data, galleryFilter);
}

// 메모리 누수 방지: 모든 리소스 정리
function cleanupGalleryResources() {
    // Intersection Observer 정리
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
        galleryIntersectionObserver = null;
    }

    // 갤러리 캠시 초기화 (로그아웃 시 재로드 보장)
    cachedGalleryLogs = [];
    sortedFilteredCache = [];
    sortedFilteredDirty = true;
    galleryDisplayCount = 0;
    isLoadingMore = false;
}
window.cleanupGalleryResources = cleanupGalleryResources;

let _galleryLoading = false; // 중복 로드 방지

async function loadGalleryData(forceReload = false) {
    if (_galleryLoading) return;
    if (forceReload) cachedGalleryLogs = [];
    _galleryLoading = true;

    try {
        await _loadGalleryDataInner();
    } finally {
        _galleryLoading = false;
    }
}

// Firestore REST API로 갤러리 데이터 직접 조회 (비로그인 cold start 대응)
async function _fetchGalleryViaRest(cutoffStr, limitCount) {
    const projectId = 'habitschool-8497b';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const body = {
        structuredQuery: {
            from: [{ collectionId: 'daily_logs' }],
            where: {
                fieldFilter: {
                    field: { fieldPath: 'date' },
                    op: 'GREATER_THAN_OR_EQUAL',
                    value: { stringValue: cutoffStr }
                }
            },
            orderBy: [{ field: { fieldPath: 'date' }, direction: 'DESCENDING' }],
            limit: limitCount
        }
    };
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error(`REST API ${resp.status}`);
    const results = await resp.json();
    const logsArray = [];
    for (const item of results) {
        if (!item.document) continue;
        const docPath = item.document.name;
        const docId = docPath.split('/').pop();
        logsArray.push({ id: docId, data: _convertFirestoreFields(item.document.fields || {}) });
    }
    return logsArray;
}

// Firestore REST 응답 필드를 JS 객체로 변환
function _convertFirestoreFields(fields) {
    const result = {};
    for (const [key, val] of Object.entries(fields)) {
        result[key] = _convertFirestoreValue(val);
    }
    return result;
}

function _convertFirestoreValue(val) {
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return val.doubleValue;
    if ('booleanValue' in val) return val.booleanValue;
    if ('nullValue' in val) return null;
    if ('timestampValue' in val) return val.timestampValue;
    if ('mapValue' in val) return _convertFirestoreFields(val.mapValue.fields || {});
    if ('arrayValue' in val) return (val.arrayValue.values || []).map(v => _convertFirestoreValue(v));
    return null;
}

async function _loadGalleryDataInner() {
    const container = document.getElementById('gallery-container');
    const user = auth.currentUser;
    const myId = user ? user.uid : "";

    // 게스트 모드: 공유 카드/활동 요약 숨김, CTA 배너 표시
    const shareContainer = document.getElementById('my-share-container');
    const activitySummary = document.getElementById('gallery-activity-summary');
    if (!user) {
        if (shareContainer) shareContainer.style.display = 'none';
        if (activitySummary) activitySummary.style.display = 'none';
    }

    if (cachedGalleryLogs.length === 0) {
        // 즉시 스켈레톤 표시 (체감 로딩 0ms)
        container.innerHTML = createSkeletonHtml(4);

        if (user) {
            const userSnap = await getDoc(doc(db, "users", myId));
            if (userSnap.exists()) cachedMyFriends = userSnap.data().friends || [];
        }

        let retries = 0;

        // 비로그인: Firestore SDK가 cold start에서 서버 연결 실패 → REST API로 직접 조회
        if (!user) {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - 30);
            const cutoffStr = cutoffDate.toISOString().split('T')[0];
            while (retries < 3) {
                try {
                    const logsArray = await _fetchGalleryViaRest(cutoffStr, MAX_CACHE_SIZE);
                    cachedGalleryLogs = logsArray;
                    sortedFilteredDirty = true;
                    break;
                } catch (e) {
                    retries++;
                    console.warn(`REST 갤러리 로드 재시도 (${retries}/3):`, e.message);
                    if (retries < 3) {
                        await new Promise(r => setTimeout(r, 800 * retries));
                    } else {
                        container.innerHTML = '<div style="text-align:center; padding:40px 20px;"><p style="font-size:15px; color:#666; margin-bottom:16px;">갤러리를 불러오는 중 문제가 발생했습니다.<br>잠시 후 다시 시도해주세요.</p><button class="google-btn" style="margin:0 auto;" onclick="loadGalleryData(true)">🔄 다시 시도</button></div>';
                        return;
                    }
                }
            }
        } else {
        // 로그인: SDK 사용 (캐시 활용 가능)
        while (retries < 3) {
            try {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - 7);
                const cutoffStr = cutoffDate.toISOString().split('T')[0];
                const q = query(collection(db, "daily_logs"), where("date", ">=", cutoffStr), orderBy("date", "desc"), limit(MAX_CACHE_SIZE));
                const snapshot = await getDocs(q);

                let logsArray = [];
                snapshot.forEach(d => { logsArray.push({ id: d.id, data: d.data() }); });
                cachedGalleryLogs = logsArray.slice(0, MAX_CACHE_SIZE);
                sortedFilteredDirty = true;
                break;
            } catch (e) {
                retries++;
                console.warn(`갤러리 데이터 로드 재시도 (${retries}/3):`, e.message);
                if (retries < 3) {
                    await new Promise(r => setTimeout(r, 800 * retries));
                } else {
                    console.error('갤러리 데이터 로드 실패:', e);
                    container.innerHTML = '<div style="text-align:center; padding:40px 20px;"><p style="font-size:15px; color:#666; margin-bottom:16px;">갤러리를 불러오는 중 문제가 발생했습니다.<br>잠시 후 다시 시도해주세요.</p><button class="google-btn" style="margin:0 auto;" onclick="loadGalleryData()">🔄 다시 시도</button></div>';
                    return;
                }
            }
        }
        }

        // 공유 카드는 비동기로 뒤에서 로드 (갤러리 피드 먼저 표시)
        buildShareCardAsync(myId, user);
    }

    // 피드 즉시 렌더링
    galleryDisplayCount = 0;
    container.innerHTML = '';

    refreshSortedFiltered();
    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);

    for (let i = 0; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }

    galleryDisplayCount = end;

    const sentinel = document.getElementById('gallery-sentinel');
    if (galleryDisplayCount >= sortedFilteredCache.length) {
        sentinel.style.display = 'none';
    } else {
        sentinel.style.display = 'block';
    }

    if (sortedFilteredCache.length === 0) {
        container.innerHTML = getEmptyStateHtml(galleryFilter);
    }

    // 갤러리 반응 요약 배너
    renderActivitySummary(myId);
    buildWeeklyBestSection();
    setupInfiniteScroll();
}

// 공유 카드 비동기 로드 (갤러리 피드 렌더링 차단하지 않음)
async function buildShareCardAsync(myId, user) {
    try {
        const { todayStr, yesterdayStr } = getDatesInfo();
        let myRecentLogs = [];
        cachedGalleryLogs.forEach(item => {
            if (item.data.userId === myId && (item.data.date === todayStr || item.data.date === yesterdayStr))
                myRecentLogs.push(item.data);
        });

        if (user && myRecentLogs.length > 0) {
            document.getElementById('my-share-container').style.display = 'flex';
            const latest = myRecentLogs[0];
            document.getElementById('share-name').innerText = getUserDisplayName();
            document.getElementById('share-date').innerText = latest.date.replace(/-/g, '.');
            let points = (latest.awardedPoints?.dietPoints || 0) + (latest.awardedPoints?.exercisePoints || 0) + (latest.awardedPoints?.mindPoints || 0);
            if (points === 0 && latest.awardedPoints) { if (latest.awardedPoints.diet) points += 10; if (latest.awardedPoints.exercise) points += 15; if (latest.awardedPoints.mind) points += 5; }
            document.getElementById('share-point').innerText = points;

            // 공유 카드용 이미지 - 썸네일 우선
            let imgs = [];
            if (latest.diet) {
                ['breakfast', 'lunch', 'dinner', 'snack'].forEach(meal => {
                    const thumb = latest.diet[`${meal}ThumbUrl`];
                    const orig = latest.diet[`${meal}Url`];
                    if (thumb) imgs.push(thumb);
                    else if (orig) imgs.push(orig);
                });
            }
            if (latest.exercise) {
                if (latest.exercise.cardioList && latest.exercise.cardioList.length > 0) {
                    latest.exercise.cardioList.forEach(c => {
                        if (c.imageThumbUrl) imgs.push(c.imageThumbUrl);
                        else if (c.imageUrl) imgs.push(c.imageUrl);
                    });
                } else if (latest.exercise.cardioImageUrl) {
                    imgs.push(latest.exercise.cardioImageThumbUrl || latest.exercise.cardioImageUrl);
                }
                if (latest.exercise.strengthList && latest.exercise.strengthList.length > 0) {
                    latest.exercise.strengthList.forEach(s => {
                        if (s.videoThumbUrl) imgs.push(s.videoThumbUrl);
                        else if (s.videoUrl) imgs.push(s.videoUrl);
                    });
                } else if (latest.exercise.strengthVideoUrl) {
                    imgs.push(latest.exercise.strengthVideoThumbUrl || latest.exercise.strengthVideoUrl);
                }
            }
            if (latest.sleepAndMind?.sleepImageUrl) imgs.push(latest.sleepAndMind.sleepImageThumbUrl || latest.sleepAndMind.sleepImageUrl);

            imgs = [...new Set(imgs)].filter(url => url && url.trim() !== '');

            const imgGrid = document.getElementById('share-imgs');
            imgGrid.innerHTML = '';
            imgGrid.classList.remove('single-item', 'two-items', 'three-items', 'four-items');

            let htmlString = buildShareImageGrid(imgs, 4);
            imgGrid.innerHTML = htmlString;
            if (imgs.length === 1) imgGrid.classList.add('single-item');
            if (imgs.length === 2) imgGrid.classList.add('two-items');
            if (imgs.length === 3) imgGrid.classList.add('three-items');
            if (imgs.length >= 4) imgGrid.classList.add('four-items');

            if (imgs.length === 0) imgGrid.innerHTML = `<div style="font-size:12px; color:#888; padding:15px; background:rgba(255,255,255,0.8); border-radius:8px; grid-column: span 2;">텍스트 인증 완료!</div>`;
        } else {
            document.getElementById('my-share-container').style.display = 'none';
        }
    } catch (e) {
        console.warn('공유 카드 로드 실패:', e.message);
        document.getElementById('my-share-container').style.display = 'none';
    }
}

// 인스타그램 스타일: 내 게시물에 달린 반응/댓글 요약 배너 (새 알림 포함)
function renderActivitySummary(myId) {
    const summaryEl = document.getElementById('gallery-activity-summary');
    if (!summaryEl || !myId) { if (summaryEl) summaryEl.style.display = 'none'; return; }

    let totalHeart = 0, totalFire = 0, totalClap = 0, totalComments = 0;
    cachedGalleryLogs.forEach(item => {
        if (item.data.userId !== myId) return;
        const rx = item.data.reactions || {};
        // 자기 자신 반응 제외
        totalHeart += (rx.heart || []).filter(uid => uid !== myId).length;
        totalFire += (rx.fire || []).filter(uid => uid !== myId).length;
        totalClap += (rx.clap || []).filter(uid => uid !== myId).length;
        const comments = item.data.comments || [];
        totalComments += comments.filter(c => c.userId !== myId).length;
    });

    const total = totalHeart + totalFire + totalClap + totalComments;
    if (total === 0) {
        summaryEl.style.display = 'none';
        return;
    }

    // 새 알림 추적
    const storageKey = `gallery_last_seen_${myId}`;
    const lastSeen = parseInt(localStorage.getItem(storageKey) || '0');
    const newCount = Math.max(0, total - lastSeen);

    let parts = [];
    if (totalHeart > 0) parts.push(`<span class="summary-item">❤️ ${totalHeart}</span>`);
    if (totalFire > 0) parts.push(`<span class="summary-item">🔥 ${totalFire}</span>`);
    if (totalClap > 0) parts.push(`<span class="summary-item">👏 ${totalClap}</span>`);
    if (totalComments > 0) parts.push(`<span class="summary-item">💬 ${totalComments}</span>`);

    const newBadge = newCount > 0 ? `<span class="new-reaction-badge">+${newCount} 새 반응!</span>` : '';

    summaryEl.innerHTML = `
        <div class="summary-content">
            <div class="summary-stats">${newBadge}${parts.join('')}</div>
        </div>
    `;
    summaryEl.style.display = 'flex';
    summaryEl.onclick = function () {
        localStorage.setItem(storageKey, String(total));
        const badge = summaryEl.querySelector('.new-reaction-badge');
        if (badge) badge.remove();
    };
}

// 댓글 추가
window.addComment = async function (docId) {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }
    const input = document.getElementById(`comment-input-${docId}`);
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    if (text.length > 200) { showToast('댓글은 200자까지 가능합니다.'); return; }

    try {
        const logRef = doc(db, "daily_logs", docId);
        const newComment = {
            userId: user.uid,
            userName: getUserDisplayName(),
            text: sanitizeText(text),
            timestamp: Date.now()
        };
        await setDoc(logRef, { comments: arrayUnion(newComment) }, { merge: true });
        input.value = '';

        // 로컬 캐시 업데이트 & 댓글만 다시 렌더
        const item = cachedGalleryLogs.find(l => l.id === docId);
        if (item) {
            if (!item.data.comments) item.data.comments = [];
            item.data.comments.push(newComment);
            renderCommentList(docId, item.data.comments);
        }
        // 요약 배너 업데이트
        renderActivitySummary(user.uid);
    } catch (e) {
        console.error('댓글 추가 오류:', e);
        showToast('댓글 추가에 실패했습니다.');
    }
};

// 댓글 삭제 (본인만)
window.deleteComment = async function (docId, commentIdx) {
    const user = auth.currentUser;
    if (!user) return;
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (!item || !item.data.comments) return;
    const comment = item.data.comments[commentIdx];
    if (!comment || comment.userId !== user.uid) { showToast('본인 댓글만 삭제할 수 있습니다.'); return; }

    try {
        const logRef = doc(db, "daily_logs", docId);
        await setDoc(logRef, { comments: arrayRemove(comment) }, { merge: true });
        item.data.comments.splice(commentIdx, 1);
        renderCommentList(docId, item.data.comments);
        renderActivitySummary(user.uid);
    } catch (e) {
        console.error('댓글 삭제 오류:', e);
        showToast('댓글 삭제에 실패했습니다.');
    }
};

// 댓글 더보기 토글
window.toggleComments = function (docId) {
    const list = document.getElementById(`comment-list-${docId}`);
    if (!list) return;
    const isExpanded = list.dataset.expanded === 'true';
    list.dataset.expanded = isExpanded ? 'false' : 'true';
    const item = cachedGalleryLogs.find(l => l.id === docId);
    if (item) renderCommentList(docId, item.data.comments || []);
};

// 댓글 목록 렌더링
function renderCommentList(docId, comments) {
    const list = document.getElementById(`comment-list-${docId}`);
    if (!list) return;
    const myId = auth.currentUser ? auth.currentUser.uid : '';
    const isExpanded = list.dataset.expanded === 'true';
    const maxShow = isExpanded ? comments.length : 2;
    const visibleComments = comments.slice(0, maxShow);

    let html = '';
    visibleComments.forEach((c, idx) => {
        const safeName = escapeHtml(c.userName || '익명');
        const safeText = escapeHtml(c.text || '');
        const timeStr = formatCommentTime(c.timestamp);
        const deleteBtn = c.userId === myId ? `<button class="comment-delete-btn" onclick="deleteComment('${escapeHtml(docId)}', ${idx})" title="삭제">✕</button>` : '';
        html += `<div class="comment-item"><span class="comment-author">${safeName}</span><span class="comment-text">${safeText}</span><span class="comment-time">${timeStr}</span>${deleteBtn}</div>`;
    });

    if (comments.length > 2) {
        const toggleText = isExpanded ? '댓글 접기' : `댓글 ${comments.length}개 모두 보기`;
        html += `<button class="comment-toggle-btn" onclick="toggleComments('${escapeHtml(docId)}')">${toggleText}</button>`;
    }

    list.innerHTML = html;
    // 댓글 수 업데이트
    const countEl = document.getElementById(`comment-count-${docId}`);
    if (countEl) countEl.textContent = comments.length;
}

// 댓글 시간 포맷
function formatCommentTime(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '방금';
    if (mins < 60) return `${mins}분 전`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}일 전`;
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 중복 코드 제거: 갤러리 미디어 수집 헬퍼 함수 (썸네일 우선)
function collectGalleryMedia(data) {
    const result = {
        dietHtml: '',
        exerciseHtml: '',
        mindHtml: '',
        mindText: ''
    };

    // 식단 미디어 (썸네일 우선, 클릭 시 원본) - AI분석 오버레이 포함
    if (data.diet) {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(meal => {
            const origUrl = data.diet[`${meal}Url`];
            const thumbUrl = data.diet[`${meal}ThumbUrl`];
            if (origUrl && isValidStorageUrl(origUrl)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(origUrl);
                const full = escapeHtml(origUrl);
                const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
                const hasAi = data.dietAnalysis && data.dietAnalysis[meal];
                const aiAttr = hasAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(data.dietAnalysis[meal]))))}"` : '';
                result.dietHtml += `<div class="gallery-media-wrapper"${aiAttr}>
                    <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="${meal} 식단 사진" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                    ${hasAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                    <div class="gallery-ai-overlay" style="display:none;"></div>
                </div>`;
            }
        });
    }

    // 운동 미디어 (중복 제거, 썸네일 우선) - AI분석 오버레이 포함
    if (data.exercise) {
        let addedUrls = new Set();
        const addImg = (url, thumbUrl, aiAnalysis) => {
            if (url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
                const full = escapeHtml(url);
                const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
                const hasAi = aiAnalysis != null;
                const aiAttr = hasAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(aiAnalysis))))}"` : '';
                result.exerciseHtml += `<div class="gallery-media-wrapper"${aiAttr}>
                    <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="운동 인증 사진" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                    ${hasAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                    <div class="gallery-ai-overlay" style="display:none;"></div>
                </div>`;
                addedUrls.add(url);
            }
        };
        const addVid = (url, thumbUrl) => {
            if (url && !addedUrls.has(url) && isValidStorageUrl(url)) {
                const safeUrl = escapeHtml(url);
                if (thumbUrl && isValidStorageUrl(thumbUrl)) {
                    const safeThumb = escapeHtml(thumbUrl);
                    result.exerciseHtml += `<div class="gallery-media-wrapper video-thumb-wrapper" data-video-src="${safeUrl}" onclick="playGalleryVideo(this)">
                        <img src="${safeThumb}" alt="운동 영상 썸네일" loading="lazy" decoding="async" onerror="handleThumbFallback(this)">
                        <div class="video-play-btn">&#9654;</div>
                    </div>`;
                } else {
                    result.exerciseHtml += `<div class="gallery-media-wrapper video-thumb-wrapper" data-video-src="${safeUrl}" onclick="playGalleryVideo(this)">
                        <video src="${safeUrl}#t=0.1" preload="metadata" muted playsinline aria-label="운동 영상"></video>
                        <div class="video-play-btn">&#9654;</div>
                    </div>`;
                }
                addedUrls.add(url);
            }
        };

        addImg(data.exercise.cardioImageUrl, data.exercise.cardioImageThumbUrl, null);
        addVid(data.exercise.strengthVideoUrl, data.exercise.strengthVideoThumbUrl);
        if (data.exercise.cardioList) data.exercise.cardioList.forEach(c => addImg(c.imageUrl, c.imageThumbUrl, c.aiAnalysis));
        if (data.exercise.strengthList) data.exercise.strengthList.forEach(s => addVid(s.videoUrl, s.videoThumbUrl));
    }

    // 마음 미디어 (썸네일 우선) - 클릭 시 확대 + AI분석 오버레이
    if (data.sleepAndMind?.sleepImageUrl) {
        const url = data.sleepAndMind.sleepImageUrl;
        const thumbUrl = data.sleepAndMind.sleepImageThumbUrl;
        if (isValidStorageUrl(url)) {
            const src = (thumbUrl && isValidStorageUrl(thumbUrl)) ? escapeHtml(thumbUrl) : escapeHtml(url);
            const full = escapeHtml(url);
            const fallback = (src !== full) ? ` data-fallback-list="${full}"` : '';
            const hasSleepAi = data.sleepAndMind.sleepAnalysis != null;
            const sleepAiAttr = hasSleepAi ? ` data-ai-analysis="${btoa(unescape(encodeURIComponent(JSON.stringify(data.sleepAndMind.sleepAnalysis))))}"` : '';
            result.mindHtml = `<div class="gallery-media-wrapper"${sleepAiAttr}>
                <img src="${src}" onclick="toggleGalleryFullImage(this, '${full}')" alt="수면 기록 캡처" loading="lazy" decoding="async" onerror="handleThumbFallback(this)"${fallback}>
                ${hasSleepAi ? '<button class="gallery-ai-overlay-btn" onclick="event.stopPropagation(); toggleGalleryAiOverlay(this)">분석 확인</button>' : ''}
                <div class="gallery-ai-overlay" style="display:none;"></div>
            </div>`;
        }
    }

    // 마음 텍스트
    if (data.sleepAndMind?.gratitude) {
        const safeGratitude = escapeHtml(data.sleepAndMind.gratitude);
        result.mindText = `<div style="font-size:13px; color:#555; background:#f9f9f9; padding:10px; border-radius:8px; margin-bottom:12px; font-style:italic;">💭 "${safeGratitude}"</div>`;
    }

    return result;
}

// 갤러리 카드 DOM 생성 (추출된 단일 카드 빌더)
function buildGalleryCard(item, myId) {
    const data = item.data;
    const isFriend = cachedMyFriends.includes(data.userId);

    const media = collectGalleryMedia(data);
    let contentHtml = '';
    let shouldShow = false;

    if (galleryFilter === 'all') {
        const allMedia = media.dietHtml + media.exerciseHtml + media.mindHtml;
        if (allMedia) contentHtml += `<div class="gallery-photos">${allMedia}</div>`;
        if (media.mindText) contentHtml += media.mindText;
        if (allMedia || media.mindText) shouldShow = true;
    } else if (galleryFilter === 'diet') {
        if (media.dietHtml) { contentHtml += `<div class="gallery-photos">${media.dietHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'exercise') {
        if (media.exerciseHtml) { contentHtml += `<div class="gallery-photos">${media.exerciseHtml}</div>`; shouldShow = true; }
    } else if (galleryFilter === 'mind') {
        if (media.mindHtml) contentHtml += `<div class="gallery-photos">${media.mindHtml}</div>`;
        if (media.mindText) contentHtml += media.mindText;
        if (media.mindHtml || media.mindText) shouldShow = true;
    }

    if (!shouldShow) return null;

    const isGuest = !auth.currentUser;
    const rx = data.reactions || { heart: [], fire: [], clap: [] };
    const cHeart = rx.heart ? rx.heart.length : 0;
    const cFire = rx.fire ? rx.fire.length : 0;
    const cClap = rx.clap ? rx.clap.length : 0;
    const aHeart = rx.heart?.includes(myId) ? 'active' : '';
    const aFire = rx.fire?.includes(myId) ? 'active' : '';
    const aClap = rx.clap?.includes(myId) ? 'active' : '';

    const comments = data.comments || [];
    const commentCount = comments.length;
    const safeName = escapeHtml(data.userName || '익명');
    const safeUserId = escapeHtml(data.userId || '');
    const safeDocId = escapeHtml(item.id || '');

    let commentsHtml = '';
    const showComments = comments.slice(0, 2);
    showComments.forEach((c, idx) => {
        const cName = escapeHtml(c.userName || '익명');
        const cText = escapeHtml(c.text || '');
        const cTime = formatCommentTime(c.timestamp);
        const delBtn = (!isGuest && c.userId === myId) ? `<button class="comment-delete-btn" onclick="deleteComment('${safeDocId}', ${idx})" title="삭제">✕</button>` : '';
        const reportBtn = (!isGuest && c.userId !== myId) ? `<button class="comment-delete-btn" onclick="reportComment('${safeDocId}', ${idx})" title="신고" style="color:#E53935;">⚑</button>` : '';
        commentsHtml += `<div class="comment-item"><span class="comment-author">${cName}</span><span class="comment-text">${cText}</span><span class="comment-time">${cTime}</span>${delBtn}${reportBtn}</div>`;
    });
    if (comments.length > 2) {
        commentsHtml += `<button class="comment-toggle-btn" onclick="toggleComments('${safeDocId}')">댓글 ${comments.length}개 모두 보기</button>`;
    }

    const avatarInitial = (data.userName || '?').charAt(0);
    const totalReactions = cHeart + cFire + cClap;
    const reactionSummaryHtml = totalReactions > 0 ? `<div class="gallery-reaction-summary">좋아요 ${totalReactions}개</div>` : '';

    // 게스트 모드: 반응/댓글 입력 숨김, 친구 버튼 숨김
    const friendBtnHtml = isGuest ? '' : (data.userId !== myId ? `<button class="friend-btn ${isFriend ? 'is-friend' : ''}" onclick="toggleFriend('${safeUserId}')">${isFriend ? '✕' : '+ 친구'}</button>` : '');

    // 본인 게시물: ⋯ 메뉴 (삭제), 타인 게시물: ⋯ 메뉴 (신고)
    let postMenuHtml = '';
    if (!isGuest) {
        if (data.userId === myId) {
            postMenuHtml = `<div class="post-menu-container">
                <button class="post-menu-btn" onclick="togglePostMenu(this)" aria-label="게시물 메뉴">⋯</button>
                <div class="post-menu-dropdown" style="display:none;">
                    <button onclick="deleteGalleryPost('${safeDocId}')">🗑️ 삭제</button>
                </div>
            </div>`;
        } else {
            postMenuHtml = `<div class="post-menu-container">
                <button class="post-menu-btn" onclick="togglePostMenu(this)" aria-label="게시물 메뉴">⋯</button>
                <div class="post-menu-dropdown" style="display:none;">
                    <button onclick="reportPost('${safeDocId}', '${safeUserId}')">🚨 신고</button>
                    <button onclick="blockUser('${safeUserId}', '${safeName}')">🚫 차단</button>
                </div>
            </div>`;
        }
    }

    const actionsHtml = isGuest
        ? `<div class="gallery-actions guest-actions">
            <span class="action-btn">❤️${cHeart > 0 ? ` <span>${cHeart}</span>` : ''}</span>
            <span class="action-btn">🔥${cFire > 0 ? ` <span>${cFire}</span>` : ''}</span>
            <span class="action-btn">👏${cClap > 0 ? ` <span>${cClap}</span>` : ''}</span>
            <span class="action-btn">💬${commentCount > 0 ? ` <span>${commentCount}</span>` : ''}</span>
           </div>`
        : `<div class="gallery-actions">
            <button class="action-btn ${aHeart}" onclick="toggleReaction('${safeDocId}', 'heart', this)">❤️${cHeart > 0 ? ` <span>${cHeart}</span>` : ''}</button>
            <button class="action-btn ${aFire}" onclick="toggleReaction('${safeDocId}', 'fire', this)">🔥${cFire > 0 ? ` <span>${cFire}</span>` : ''}</button>
            <button class="action-btn ${aClap}" onclick="toggleReaction('${safeDocId}', 'clap', this)">👏${cClap > 0 ? ` <span>${cClap}</span>` : ''}</button>
            <button class="action-btn comment-btn" onclick="document.getElementById('comment-input-${safeDocId}').focus()">💬${commentCount > 0 ? ` <span id="comment-count-${safeDocId}">${commentCount}</span>` : `<span id="comment-count-${safeDocId}"></span>`}</button>
           </div>`;

    const commentSectionHtml = isGuest
        ? (commentsHtml ? `<div class="comment-section"><div class="comment-list" id="comment-list-${safeDocId}" data-expanded="false">${commentsHtml}</div></div>` : '')
        : `<div class="comment-section">
            <div class="comment-list" id="comment-list-${safeDocId}" data-expanded="false">
                ${commentsHtml}
            </div>
            <div class="comment-input-wrap">
                <input type="text" class="comment-input" id="comment-input-${safeDocId}" placeholder="댓글 달기..." maxlength="200" onkeydown="if(event.key==='Enter')addComment('${safeDocId}')">
                <button class="comment-submit-btn" onclick="addComment('${safeDocId}')">게시</button>
            </div>
           </div>`;

    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
        <div class="gallery-header">
            <div class="gallery-avatar">${avatarInitial}</div>
            <div class="gallery-header-info">
                <span class="gallery-name">${isFriend ? '⭐ ' : ''}${safeName}</span>
                <span class="gallery-date">${data.date.replace(/-/g, '. ')}</span>
            </div>
            ${friendBtnHtml}
            ${postMenuHtml}
        </div>
        ${contentHtml}
        ${actionsHtml}
        ${reactionSummaryHtml}
        ${commentSectionHtml}
    `;
    return card;
}

// 피드 렌더링 (필터 변경 시 전체 재빌드 - 캐시 활용)
function renderFeedOnly() {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const sentinel = document.getElementById('gallery-sentinel');

    refreshSortedFiltered();

    const end = Math.min(INITIAL_LOAD, sortedFilteredCache.length);

    for (let i = 0; i < end; i++) {
        const card = buildGalleryCard(sortedFilteredCache[i], myId);
        if (card) container.appendChild(card);
    }

    galleryDisplayCount = end;

    if (galleryDisplayCount >= sortedFilteredCache.length || sortedFilteredCache.length === 0) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
        }
    } else {
        sentinel.style.display = 'block';
        if (!galleryIntersectionObserver) {
            setupInfiniteScroll();
        }
    }

    if (sortedFilteredCache.length === 0) {
        container.innerHTML = getEmptyStateHtml(galleryFilter);
    }
}

function initGalleryVideoThumbs() {
    const videos = document.querySelectorAll('.video-thumb-wrapper video');
    videos.forEach(video => {
        if (video.dataset.thumbReady === '1') return;
        video.dataset.thumbReady = '1';

        const setFrame = () => {
            try { video.currentTime = 0.1; } catch (_) { }
        };

        if (video.readyState >= 2) {
            setFrame();
        } else {
            video.addEventListener('loadeddata', setFrame, { once: true });
        }
    });
}

// 접근성: 키보드 네비게이션 지원
document.addEventListener('keydown', function (e) {
    // Escape 키로 모달/라이트박스 닫기
    if (e.key === 'Escape' || e.key === 'Esc') {
        const lightbox = document.getElementById('lightbox-modal');
        const levelModal = document.getElementById('level-modal');
        const guideModal = document.getElementById('guide-modal');

        if (lightbox && lightbox.style.display === 'flex') {
            const video = document.getElementById('lightbox-video');
            if (video) {
                video.pause();
                video.removeAttribute('src');
                video.style.display = 'none';
            }
            const img = document.getElementById('lightbox-img');
            if (img) img.style.display = 'block';
            lightbox.style.display = 'none';
            e.preventDefault();
        } else if (levelModal && levelModal.style.display === 'flex') {
            levelModal.style.display = 'none';
            e.preventDefault();
        } else if (guideModal && guideModal.style.display === 'flex') {
            guideModal.style.display = 'none';
            e.preventDefault();
        }
    }

    // Tab 트랩 방지: 라이트박스 활성화 시에도 Tab 이동 가능하도록
    if (e.key === 'Tab') {
        const lightbox = document.getElementById('lightbox-modal');
        if (lightbox && lightbox.style.display === 'flex') {
            // 라이트박스가 열려있을 때는 포커스가 라이트박스 내부에만 있도록
            e.preventDefault();
            lightbox.focus();
        }
    }
});

// 접근성: point-badge에 Enter 키 지원
const pointBadge = document.getElementById('point-badge-ui');
if (pointBadge) {
    pointBadge.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
        }
    });
}

// 접근성: 라이트박스에 클릭 시 닫기 & 포커스 설정
const lightboxModal = document.getElementById('lightbox-modal');
if (lightboxModal) {
    lightboxModal.setAttribute('role', 'dialog');
    lightboxModal.setAttribute('aria-label', '미디어 확대 보기');
    lightboxModal.setAttribute('tabindex', '-1');

    lightboxModal.addEventListener('click', function () {
        const video = document.getElementById('lightbox-video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.style.display = 'none';
        }
        const img = document.getElementById('lightbox-img');
        if (img) img.style.display = 'block';
    });

    // 라이트박스 열릴 때 포커스 설정
    const originalOpenLightbox = window.openLightbox;
    window.openLightbox = function (url) {
        originalOpenLightbox(url);
        setTimeout(() => lightboxModal.focus(), 100);
    };
}

// ==========================
// AI 식단 분석 + 온보딩 + 대사건강 점수
// ==========================

// 식단 사진 AI 분석
async function analyzeMealPhoto(meal) {
    if (!checkRateLimit('analyzeMealPhoto', 3000)) {
        showToast('⏳ 잠시 후 다시 시도해주세요.');
        return;
    }
    const previewImg = document.getElementById(`preview-${meal}`);
    const resultContainer = document.getElementById(`diet-analysis-${meal}`);
    const btn = document.querySelector(`.diet-ai-btn[data-meal="${meal}"]`);

    if (!previewImg || previewImg.style.display === 'none') {
        showToast('⚠️ 먼저 사진을 올려주세요.');
        return;
    }

    // 이미 분석 결과가 있는 경우 토글
    if (resultContainer._analysisData || resultContainer.innerHTML.trim() !== '') {
        if (resultContainer.style.display === 'none') {
            resultContainer.style.display = 'block';
            btn.textContent = '🤖 분석 접기';
        } else {
            resultContainer.style.display = 'none';
            btn.textContent = '🤖 분석 보기';
        }
        return;
    }

    // 이미 저장된 URL 사용 또는 미리보기 src 사용
    const imageUrl = previewImg.src;
    if (!imageUrl || imageUrl.startsWith('data:')) {
        showToast('⚠️ 사진을 먼저 저장한 후 분석해주세요.');
        return;
    }

    // 로딩 상태
    if (btn) { btn.classList.add('loading'); btn.textContent = '🤖 AI 분석 중...'; }

    try {
        const analysis = await requestDietAnalysis(imageUrl);
        if (analysis) {
            renderDietAnalysisResult(resultContainer, analysis);
            resultContainer._analysisData = analysis;
            resultContainer.style.display = 'block';
            btn.textContent = '🤖 분석 접기';

            // Firestore에 분석 결과 저장
            const user = auth.currentUser;
            if (user) {
                const selectedDateStr = document.getElementById('selected-date').value;
                const docId = `${user.uid}_${selectedDateStr}`;
                await setDoc(doc(db, "daily_logs", docId), {
                    dietAnalysis: { [meal]: analysis }
                }, { merge: true });
            }
            showToast('✅ AI 식단 분석 완료!');
            updateDietDaySummary();
        }
    } catch (e) {
        console.error('식단 분석 오류:', e);
        showToast('⚠️ 식단 분석 중 오류가 발생했습니다.');
    } finally {
        if (btn && btn.textContent === '🤖 AI 분석 중...') {
            btn.classList.remove('loading'); 
            btn.textContent = '🤖 AI 분석'; 
        } else if (btn) {
            btn.classList.remove('loading');
        }
    }
};

// 사진 미리보기 표시 시 AI 분석 버튼도 표시
const originalPreviewStatic = window.previewStaticImage;
if (originalPreviewStatic) {
    // previewStaticImage가 호출된 후 AI 버튼 표시
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            if (m.type === 'attributes' && m.attributeName === 'style') {
                const el = m.target;
                if (el.classList.contains('preview-img') && el.style.display !== 'none' && el.src) {
                    const parent = el.closest('.diet-box');
                    if (parent) {
                        const aiBtn = parent.querySelector('.diet-ai-btn');
                        if (aiBtn) aiBtn.style.display = 'block';
                    }
                }
            }
        });
    });
    document.querySelectorAll('.preview-img').forEach(img => {
        observer.observe(img, { attributes: true, attributeFilter: ['style'] });
    });
}

// 오늘의 식단 총평 업데이트
function updateDietDaySummary() {
    const container = document.getElementById('diet-day-summary-container');
    if (!container) return;

    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    const analyses = [];
    meals.forEach(meal => {
        const resultEl = document.getElementById(`diet-analysis-${meal}`);
        if (resultEl && resultEl._analysisData) {
            analyses.push(resultEl._analysisData);
        }
    });
    renderDietDaySummary(container, analyses);
}

// 데이터 로드 시 기존 AI 분석 결과 복원
const originalLoadData = window.loadDataForSelectedDate;
window._restoreDietAnalysis = _restoreDietAnalysis;
function _restoreDietAnalysis(data) {
    if (!data) return;

    // 데이터 복원 시 사진 있는 박스는 보이기, 아니면 가리기
    const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
    let lastShownIndex = -1;

    meals.forEach((meal, index) => {
        const mealUrls = {
            breakfast: data.diet?.breakfastUrl,
            lunch: data.diet?.lunchUrl,
            dinner: data.diet?.dinnerUrl,
            snack: data.diet?.snackUrl
        };
        const hasPhoto = mealUrls[meal];
        const box = document.getElementById(`diet-box-${meal}`);

        if (hasPhoto) {
            if (box) box.style.display = 'block';
            lastShownIndex = index;
        } else {
            if (box) box.style.display = 'none';
        }
    });

    // 아무것도 없는 경우 첫 번째 박스는 보여주기
    // 혹은 마지막으로 사진이 있는 박스 다음 박스는 보여주기 (수동 입력을 위해)
    if (lastShownIndex === -1) {
        const firstBox = document.getElementById(`diet-box-${meals[0]}`);
        if (firstBox) firstBox.style.display = 'block';
    } else if (lastShownIndex < meals.length - 1) {
        const nextBox = document.getElementById(`diet-box-${meals[lastShownIndex + 1]}`);
        if (nextBox) nextBox.style.display = 'block';
    }

    if (!data.dietAnalysis) return;

    meals.forEach(meal => {
        const analysis = data.dietAnalysis[meal];
        const resultContainer = document.getElementById(`diet-analysis-${meal}`);
        const aiBtn = document.querySelector(`.diet-ai-btn[data-meal="${meal}"]`);

        if (analysis && resultContainer) {
            renderDietAnalysisResult(resultContainer, analysis);
            resultContainer._analysisData = analysis;
            resultContainer.style.display = 'none'; // 분석결과는 처음에 접기
            if (aiBtn) {
                aiBtn.textContent = '🤖 분석 보기';
            }
        } else if (resultContainer) {
            resultContainer._analysisData = null;
            resultContainer.innerHTML = '';
            resultContainer.style.display = 'none';
            if (aiBtn) {
                aiBtn.textContent = '🤖 AI 분석';
            }
        }

        const mealUrls = {
            breakfast: data.diet?.breakfastUrl,
            lunch: data.diet?.lunchUrl,
            dinner: data.diet?.dinnerUrl,
            snack: data.diet?.snackUrl
        };
        if (mealUrls[meal] && aiBtn) {
            aiBtn.style.display = 'block';
        }
    });

    updateDietDaySummary();
};

// 온보딩 스텝 이동
function goOnboardingStep(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`ob-step-${i}`);
        const dot = document.getElementById(`ob-dot-${i}`);
        if (el) el.style.display = i === step ? 'block' : 'none';
        if (dot) dot.classList.toggle('active', i === step);
    }
};

// 온보딩 완료
async function completeOnboarding() {
    const user = auth.currentUser;
    if (!user) return;

    // 모달 즉시 닫기 (저장 실패해도 진행)
    document.getElementById('onboarding-modal').style.display = 'none';
    showToast('🌞 환영합니다! 건강 습관 여정을 시작합니다!');

    try {
        await setDoc(doc(db, "users", user.uid), {
            onboardingComplete: true
        }, { merge: true });
    } catch (e) {
        console.warn('온보딩 저장 스킵:', e.message);
    }

    try { updateMetabolicScoreUI(); } catch (e) { /* skip */ }
};

// 대사건강 점수 UI 업데이트
async function updateMetabolicScoreUI() {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('metabolic-score-container');
    if (!container) return;

    try {
        // 사용자 프로필 로드
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};
        const profile = userData.healthProfile || {};

        // 최근 7일 로그 로드
        const q = query(collection(db, "daily_logs"), where("userId", "==", user.uid), orderBy("date", "desc"), limit(7));
        const snapshot = await getDocs(q);
        const recentLogs = [];
        snapshot.forEach(d => recentLogs.push(d.data()));
        recentLogs.reverse();

        // 최신 건강 지표
        const latestMetrics = recentLogs.length > 0 ? (recentLogs[recentLogs.length - 1].metrics || {}) : {};

        // 점수 계산
        const scoreData = calculateMetabolicScore(profile, recentLogs, latestMetrics);

        // UI 렌더링
        renderMetabolicScoreCard(container, scoreData);
    } catch (e) {
        console.warn('대사건강 점수 로드 스킵:', e.message);
    }
};

// 온보딩 체크 (auth.js에서 호출 가능하도록)
async function checkOnboarding() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        const userData = userSnap.exists() ? userSnap.data() : {};

        if (!userData.onboardingComplete) {
            document.getElementById('onboarding-modal').style.display = 'flex';
        }
    } catch (e) {
        console.warn('온보딩 체크 스킵:', e.message);
    }
};





// ========================================
// 수면 AI 분석
// ========================================
window.analyzeSleepData = async function() {
    const resultBox = document.getElementById('sleep-analysis-result');
    const aiBtn = document.getElementById('ai-btn-sleep');
    if (!resultBox) return;

    // 이미 분석 완료 → 토글
    if (aiBtn && aiBtn.getAttribute('data-analyzed') === 'true') {
        if (resultBox.style.display === 'none') {
            resultBox.style.display = 'block';
            aiBtn.textContent = '🤖 분석 접기';
        } else {
            resultBox.style.display = 'none';
            aiBtn.textContent = '🤖 분석 보기';
        }
        return;
    }

    // 저장된 수면 이미지 URL 또는 로컬 미리보기 확인
    const previewEl = document.getElementById('preview-sleep');
    let sleepUrl = previewEl?.getAttribute('data-url');
    if (!sleepUrl && previewEl?.src && previewEl.src.startsWith('data:')) {
        try { sleepUrl = await compressImageForAI(previewEl.src); } catch(e) { sleepUrl = previewEl.src; }
    }
    if (!sleepUrl && previewEl?.src && previewEl.src.startsWith('http')) {
        sleepUrl = previewEl.src;
    }
    if (!sleepUrl) {
        showToast('⚠️ 수면 캡처를 올려주세요.');
        return;
    }

    try {
        if (aiBtn) { aiBtn.classList.add('loading'); aiBtn.textContent = '🤖 AI 분석 중...'; }
        resultBox.style.display = 'block';
        resultBox.innerHTML = '<div style="text-align:center; padding:15px;"><div class="loading-spinner" style="display:inline-flex;"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div><p style="margin-top:8px; color:#888; font-size:12px;">수면 패턴 분석 중...</p></div>';

        const analysis = await requestSleepMindAnalysis(sleepUrl, null, 'sleep');
        if (analysis) {
            renderSleepMindAnalysisResult(analysis, resultBox);
            if (aiBtn) {
                aiBtn.textContent = '🤖 분석 접기';
                aiBtn.setAttribute('data-analyzed', 'true');
            }
            // Firestore에 수면 분석 결과 저장
            const user = auth.currentUser;
            if (user) {
                const selectedDateStr = document.getElementById('selected-date').value;
                const docId = `${user.uid}_${selectedDateStr}`;
                await setDoc(doc(db, "daily_logs", docId), {
                    sleepAndMind: { sleepAnalysis: analysis }
                }, { merge: true });
            }
        } else {
            resultBox.innerHTML = '<p style="color:#ef4444; padding:10px; font-size:13px;">분석 결과를 받지 못했습니다.</p>';
        }
    } catch (e) {
        console.error(e);
        resultBox.innerHTML = '<p style="color:#ef4444; padding:10px; font-size:13px;">분석 중 오류가 발생했습니다.</p>';
    } finally {
        if (aiBtn) aiBtn.classList.remove('loading');
    }
};

// ============================================================
// 앱 소개 공유 (친구 초대)
// ============================================================
function shareApp(platform) {
    const url = 'https://habitschool.web.app/';
    const title = '해빛스쿨 - 즐겁게 좋은 습관 만들기';
    const text = '매일 식단·운동·수면을 기록하고 HBT 토큰도 받는 건강 습관 앱! 🌞 함께 해봐요!';
    const encoded = encodeURIComponent;

    switch (platform) {
        case 'kakao':
            _ensureKakao().then(() => {
                Kakao.Share.sendDefault({
                    objectType: 'feed',
                    content: { title, description: text, imageUrl: 'https://habitschool.web.app/icons/og-image.png', link: { mobileWebUrl: url, webUrl: url } },
                    buttons: [{ title: '시작하기', link: { mobileWebUrl: url, webUrl: url } }]
                });
            }).catch(() => {
                if (navigator.share) navigator.share({ title, text, url }).catch(() => {});
                else navigator.clipboard.writeText(url).then(() => showToast('📋 링크가 복사되었습니다!'));
            });
            break;
        case 'twitter':
            window.open(`https://twitter.com/intent/tweet?text=${encoded(text)}&url=${encoded(url)}`, '_blank', 'noopener');
            break;
        case 'naver':
            window.open(`https://blog.naver.com/openapi/share?url=${encoded(url)}&title=${encoded(title)}`, '_blank', 'noopener');
            break;
        case 'copy':
            navigator.clipboard.writeText(url).then(() => {
                showToast('📋 링크가 복사되었습니다!');
            }).catch(() => {
                showToast('⚠️ 복사에 실패했습니다. 직접 복사해 주세요.');
            });
            break;
    }
}

