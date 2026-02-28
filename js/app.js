/**
 * app.js
 * 메인 애플리케이션 로직 모듈
 * index.html의 인라인 스크립트에서 추출
 */

// Firebase 모듈 임포트
import { 
    increment, collection, doc, getDoc, getDocs, setDoc, 
    query, where, orderBy, limit, serverTimestamp, 
    arrayRemove, arrayUnion 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';

// 프로젝트 모듈 임포트
import { auth, db, storage, MILESTONES, MISSIONS, MAX_IMG_SIZE, MAX_VID_SIZE } from './firebase-config.js';
import { getDatesInfo, showToast, getKstDateString } from './ui-helpers.js';
import { sanitize, compressImage, fetchImageAsBase64 } from './data-manager.js';
import { escapeHtml, isValidStorageUrl, sanitizeText, isValidFileType } from './security.js';
import { updateChallengeProgress } from './blockchain-manager.js';

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
        const badgeMap = { starter:'streak1', streak7:'streak7', diet7:'diet7', exercise7:'exercise7', mind7:'mind7', streak30:'streak30', points100:'points100', points300:'points300' };
        let migrated = false;
        for (const [old, nw] of Object.entries(badgeMap)) {
            if (badges[old]?.earned && !milestones[nw]?.achieved) {
                milestones[nw] = { achieved: true, date: badges[old].date || getKstDateString(), bonusClaimed: badges[old].bonusAwarded || false };
                migrated = true;
            }
        }

        if (newMilestones.length > 0 || migrated) {
            await setDoc(userRef, { milestones }, { merge: true });
            newMilestones.forEach(m => {
                showToast(`🎯 마일스톤 달성! ${m.emoji} ${m.name} — 보너스 +${m.reward}P를 받아가세요!`);
            });
        }
    } catch(error) {
        console.error('마일스톤 확인 오류:', error);
    }
}

// 마일스톤 UI 렌더링 (프로그레시브)
async function renderMilestones(userId) {
    try {
        const userRef = doc(db, "users", userId);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};
        const milestones = userData.milestones || {};

    const grid = document.getElementById('badges-grid');
    grid.innerHTML = '';

    for (const [category, catData] of Object.entries(MILESTONES)) {
        const levels = catData.levels;
        // 첫 번째 미달성 마일스톤 인덱스
        let currentIdx = levels.findIndex(l => !milestones[l.id]?.achieved);
        if (currentIdx === -1) currentIdx = levels.length;

        let cardHtml = `<div class="milestone-card">`;
        cardHtml += `<div class="milestone-card-label">${catData.label}</div>`;

        // 완료된 마일스톤 (작게 표시)
        const completed = levels.slice(0, currentIdx);
        if (completed.length > 0) {
            cardHtml += `<div class="milestone-completed-list">`;
            for (const lv of completed) {
                const claimed = milestones[lv.id]?.bonusClaimed;
                if (claimed) {
                    cardHtml += `<div class="milestone-completed-item done"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-check">✅</span></div>`;
                } else {
                    cardHtml += `<div class="milestone-completed-item claimable" onclick="claimMilestoneBonus('${lv.id}', ${lv.reward})"><span>${lv.emoji}</span><span class="ms-sm-name">${lv.name}</span><span class="ms-claim-btn">+${lv.reward}P 받기</span></div>`;
                }
            }
            cardHtml += `</div>`;
        }

        // 현재 목표 (크게 표시)
        if (currentIdx < levels.length) {
            const cur = levels[currentIdx];
            cardHtml += `<div class="milestone-current-target">`;
            cardHtml += `<div class="milestone-current-emoji">${cur.emoji}</div>`;
            cardHtml += `<div class="milestone-current-info">`;
            cardHtml += `<div class="milestone-current-name">🎯 ${cur.name}</div>`;
            cardHtml += `<div class="milestone-current-desc">${cur.desc}</div>`;
            cardHtml += `<div class="milestone-current-reward">달성 시 🎁 +${cur.reward}P</div>`;
            cardHtml += `</div></div>`;
        } else {
            cardHtml += `<div class="milestone-all-done">🎉 모든 레벨 완료!</div>`;
        }

        cardHtml += `</div>`;
        grid.innerHTML += cardHtml;
    }

    document.getElementById('milestone-section').style.display = 'block';
    } catch(error) {
        console.error('마일스톤 렌더링 오류:', error);
        const section = document.getElementById('milestone-section');
        if(section) section.style.display = 'none';
    }
}

// 마일스톤 보너스 클릭 시 수령
window.claimMilestoneBonus = async function(milestoneId, reward) {
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
        // increment()로 원자적 업데이트 (Race Condition 방지)
        await setDoc(userRef, { milestones, coins: increment(reward) }, { merge: true });

        showToast(`🎁 보너스 +${reward}P 지급 완료!`);
        const pointEl = document.getElementById('point-balance');
        const currentPts = parseInt(pointEl?.textContent) || 0;
        if (pointEl) pointEl.textContent = currentPts + reward;

        renderMilestones(currentUser.uid);
    } catch(error) {
        console.error('보너스 수령 오류:', error);
        showToast('⚠️ 보너스 지급 중 오류가 발생했습니다.');
    }
};

const { todayStr, yesterdayStr, weekStrs } = getDatesInfo();
const dateInput = document.getElementById('selected-date');
dateInput.max = todayStr;
// KST \uae30\uc900 5\uc77c \uc804\uae4c\uc9c0 \uc120\ud0dd \uac00\ub2a5
const minDate = new Date(todayStr);
minDate.setDate(minDate.getDate() - 5);
dateInput.min = minDate.toISOString().split('T')[0];
dateInput.value = todayStr;
dateInput.addEventListener('change', () => { loadDataForSelectedDate(dateInput.value); });

window.changeDateTo = function(dStr) {
    document.getElementById('selected-date').value = dStr;
    loadDataForSelectedDate(dStr);
    window.scrollTo(0,0);
};

// showToast, sanitize 등은 상단에서 직접 import

// 중복 코드 통합: 운동 블록 추가 통합 함수
function addExerciseBlock(type, data = null) {
    const isCardio = type === 'cardio';
    const listId = isCardio ? 'cardio-list' : 'strength-list';
    const list = document.getElementById(listId);
    const id = `${type}_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const div = document.createElement('div');
    div.className = `exercise-block ${type}-block`;
    div.id = id;
    
    let contentHtml = '';
    let dataUrl = '';
    
    if (isCardio) {
        const safeImgUrl = data && data.imageUrl && isValidStorageUrl(data.imageUrl) ? escapeHtml(data.imageUrl) : '';
        const imgHtml = `<div style="position:relative;">
            <img id="c_img_${id}" class="preview-img" ${safeImgUrl ? `src="${safeImgUrl}" style="display:block;"` : ''}>
            <button id="rm_c_${id}" class="static-remove-btn" style="${safeImgUrl ? 'display:block;' : 'display:none;'}" onclick="removeStaticImage(event, 'file_c_${id}', 'c_img_${id}', 'rm_c_${id}', 'txt_c_${id}')">X 삭제</button>
        </div>`;
        dataUrl = data && data.imageUrl ? data.imageUrl : '';
        
        contentHtml = `
            <button class="block-remove-btn" onclick="this.parentElement.remove()">X</button>
            <label class="upload-area">
                <input type="file" id="file_c_${id}" accept="image/*" class="exer-file" onchange="previewStaticImage(this, 'c_img_${id}', 'rm_c_${id}')">
                <span id="txt_c_${id}" style="color:#666; font-size:13px; ${data && data.imageUrl ? 'display:none;' : ''}">➕ 유산소 사진 올리기</span>
                ${imgHtml}
            </label>
            <div class="input-grid">
                <input type="number" class="c-time" placeholder="시간(분)" value="${data ? (data.time || '') : ''}">
                <input type="number" class="c-dist" placeholder="거리(km)" value="${data ? (data.dist || '') : ''}">
            </div>
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
                <span style="color:#666; font-size:13px; ${data && data.videoUrl ? 'display:none;' : ''}">➕ 근력 동영상 올리기</span>
                ${statusHtml}
            </label>
        `;
    }
    
    div.innerHTML = contentHtml;
    if(dataUrl) div.setAttribute('data-url', dataUrl);
    if(!isCardio && data && data.videoThumbUrl) {
        div.setAttribute('data-thumb-url', data.videoThumbUrl);
    }
    list.appendChild(div);

    // 근력 영상 썸네일: 플레이스홀더 표시 후 실제 프레임 추출 시도
    if(!isCardio && data && data.videoUrl && isValidStorageUrl(data.videoUrl)) {
        const thumbImg = document.getElementById(`s_img_${id}`);
        if(thumbImg) thumbImg.src = createVideoPlaceholderBase64();
        // Firebase Storage URL에서도 프레임 추출 시도 (CORS 지원)
        extractVideoThumbFromUrl(data.videoUrl)
            .then((thumbDataUrl) => {
                if (!thumbDataUrl) return;
                const ti = document.getElementById(`s_img_${id}`);
                if (ti) ti.src = thumbDataUrl;
            })
            .catch(() => {});
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

window.previewDynamicVid = function(input) {
    const file = input.files[0];
    if(!file) return;
    if(file.size > MAX_VID_SIZE) { alert("100MB 이하만 가능!"); input.value=""; return; }
    
    // 동영상 파일의 수정 날짜 확인 (촬영 당일만 허용)
    const fileDate = new Date(file.lastModified);
    const fileDateStr = fileDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    const selectedDateStr = document.getElementById('selected-date').value;
    
    if(fileDateStr !== selectedDateStr) {
        alert(`⚠️ 파일 날짜(${fileDateStr})가 선택한 인증 날짜(${selectedDateStr})와 다릅니다!\n해당 일자의 영상만 올릴 수 있습니다.`);
        input.value = "";
        return;
    }

    const previewWrap = input.parentElement.querySelector('.preview-strength');
    const previewImg = input.parentElement.querySelector('.preview-strength-img');
    // 업로드 텍스트 숨기기
    const uploadText = input.parentElement.querySelector('span');
    if(uploadText) uploadText.style.display = 'none';
    previewWrap.style.display = 'block';

    // 즉시 플레이스홈더 표시 (검은박스 방지)
    previewImg.src = createVideoPlaceholderBase64();

    // 로컬 파일에서 실제 프레임 썸네일 추출
    const objectUrl = URL.createObjectURL(file);
    extractVideoThumbFromFile(file)
        .then((thumbDataUrl) => {
            if (thumbDataUrl) previewImg.src = thumbDataUrl;
        })
        .catch(() => {})
        .finally(() => {
            setTimeout(() => URL.revokeObjectURL(objectUrl), 8000);
        });
};

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
                const px = ctx.getImageData(w/2, h/2, 1, 1).data;
                if (px[0] === 0 && px[1] === 0 && px[2] === 0) {
                    const retryTime = Math.min((video.duration || 1) > 2 ? 2 : 0.5, video.duration || 1);
                    video.currentTime = retryTime;
                    video.addEventListener('seeked', () => {
                        try {
                            ctx.drawImage(video, 0, 0, w, h);
                            clearTimeout(timer);
                            done(canvas.toDataURL('image/jpeg', 0.85));
                        } catch(_) { clearTimeout(timer); done(''); }
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

window.previewStaticImage = function(input, previewId, btnId, skipExif = false) {
    const preview = document.getElementById(previewId);
    const rmBtn = document.getElementById(btnId);
    // 텍스트 스팬 찾기: diet용 txt-xxx 또는 cardio용 txt_c_xxx
    let txtSpan = null;
    if(previewId.startsWith('preview-')) {
        txtSpan = document.getElementById('txt-' + previewId.split('-')[1]);
    } else if(previewId.startsWith('c_img_')) {
        txtSpan = document.getElementById('txt_c_' + previewId.substring(6));
    }
    
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if(file.size > MAX_IMG_SIZE) { alert("20MB 이하만 가능합니다."); input.value = ""; return; }
        
        const render = () => {
            const reader = new FileReader();
            reader.onload = e => { 
                preview.src = e.target.result; 
                preview.style.display = 'block'; 
                if(rmBtn) rmBtn.style.display = 'block';
                if(txtSpan) txtSpan.style.display = 'none';
            }
            reader.readAsDataURL(file);
        };

        if (!skipExif && typeof EXIF !== 'undefined') {
            EXIF.getData(file, function() {
                const exifDate = EXIF.getTag(this, "DateTimeOriginal");
                if(exifDate) {
                    const dateParts = exifDate.split(" ")[0].replace(/:/g, "-");
                    if(dateParts !== dateInput.value) {
                        alert(`⚠️ 촬영일(${dateParts})이 선택한 인증 날짜(${dateInput.value})와 다릅니다!\n해당 일자의 사진만 올릴 수 있습니다.`);
                        input.value = ""; preview.style.display = 'none'; 
                        if(rmBtn) rmBtn.style.display='none';
                        if(txtSpan) txtSpan.style.display='inline-block';
                        return;
                    }
                }
                render();
            });
        } else { render(); }
    }
};

window.removeStaticImage = function(e, inputId, previewId, btnId, txtId) {
    e.preventDefault(); e.stopPropagation();
    document.getElementById(inputId).value = "";
    document.getElementById(previewId).src = "";
    document.getElementById(previewId).style.display = "none";
    document.getElementById(btnId).style.display = "none";
    if(document.getElementById(txtId)) document.getElementById(txtId).style.display = "inline-block";
};

window.smartUpload = function(input) {
    const file = input.files[0];
    if(!file) return;
    if(file.size > MAX_IMG_SIZE) { alert("20MB 이하만 가능합니다."); input.value=""; return; }
    
    if (typeof EXIF !== 'undefined') {
        EXIF.getData(file, function() {
            const exifDate = EXIF.getTag(this, "DateTimeOriginal");
            if(exifDate) {
                const parts = exifDate.split(" ");
                const dStr = parts[0].replace(/:/g, "-");
                const hour = parseInt(parts[1].split(":")[0]);
                
                if(dStr !== dateInput.value) { alert(`⚠️ 촬영일(${dStr})이 현재 날짜와 다릅니다!`); input.value=""; return; }
                
                let category = 'snack';
                if(hour >= 5 && hour < 11) category = 'breakfast';
                else if(hour >= 11 && hour < 16) category = 'lunch';
                else if(hour >= 16 && hour < 22) category = 'dinner';
                
                const dt = new DataTransfer(); dt.items.add(file);
                const targetInput = document.getElementById(`diet-img-${category}`);
                targetInput.files = dt.files;
                window.previewStaticImage(targetInput, `preview-${category}`, `rm-${category}`, true);
                showToast(`✨ ${hour}시 촬영 확인! 자동 분류 완료.`);
            } else {
                alert("⚠️ 캡처본이거나 시간 정보가 없습니다. 수동 업로드해주세요.");
            }
            input.value = ""; 
        });
    }
};

function clearInputs() {
    ['weight','glucose','bp-systolic','bp-diastolic','gratitude-journal'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('meditation-check').checked = false;
    
    ['breakfast','lunch','dinner','snack','sleep'].forEach(k => { 
        const pv = document.getElementById(`preview-${k}`);
        const rm = document.getElementById(`rm-${k}`);
        const tx = document.getElementById(`txt-${k}`);
        if(pv) { pv.style.display = 'none'; pv.src = ''; }
        if(rm) rm.style.display = 'none';
        if(tx) tx.style.display = 'inline-block';
    });

    document.getElementById('cardio-list').innerHTML = '';
    document.getElementById('strength-list').innerHTML = '';

    document.getElementById('quest-diet').className = 'quest-check'; document.getElementById('quest-diet').innerText = '미달성';
    document.getElementById('quest-exercise').className = 'quest-check'; document.getElementById('quest-exercise').innerText = '미달성';
    document.getElementById('quest-mind').className = 'quest-check'; document.getElementById('quest-mind').innerText = '미달성';
    
    document.querySelectorAll('#diet input[type="file"], #exercise input[type="file"], #sleep input[type="file"]').forEach(input => input.value = '');
}

window.loadDataForSelectedDate = async function(dateStr) {
    const user = auth.currentUser;
    if(!user) return;
    
    try {
        clearInputs();
        
        const docId = `${user.uid}_${dateStr}`;
        const myLogDoc = await getDoc(doc(db, "daily_logs", docId));
    
    if (myLogDoc.exists()) {
        const data = myLogDoc.data();
        const awarded = data.awardedPoints || {};

        if(data.metrics) {
            document.getElementById('weight').value = data.metrics.weight || '';
            document.getElementById('glucose').value = data.metrics.glucose || '';
            document.getElementById('bp-systolic').value = data.metrics.bpSystolic || '';
            document.getElementById('bp-diastolic').value = data.metrics.bpDiastolic || '';
        }
        if(data.diet) {
            ['breakfast','lunch','dinner','snack'].forEach(k => {
                if(data.diet[`${k}Url`] && isValidStorageUrl(data.diet[`${k}Url`])) { 
                    document.getElementById(`preview-${k}`).src = data.diet[`${k}Url`]; 
                    document.getElementById(`preview-${k}`).style.display = 'block'; 
                    document.getElementById(`rm-${k}`).style.display = 'block';
                    document.getElementById(`txt-${k}`).style.display = 'none';
                }
            });
            if(awarded.diet) { 
                const dp = awarded.dietPoints || 10;
                document.getElementById('quest-diet').className = 'quest-check done'; 
                document.getElementById('quest-diet').innerText = `+${dp}P`; 
            }
        }
        if(data.exercise) {
            // 유산소: cardioList가 최우선 (legacy 필드 무시)
            if(data.exercise.cardioList && data.exercise.cardioList.length > 0) {
                data.exercise.cardioList.forEach(item => addCardioBlock(item));
            } else if(data.exercise.cardioImageUrl || data.exercise.cardioTime || data.exercise.cardioDist) {
                addCardioBlock({imageUrl: data.exercise.cardioImageUrl, time: data.exercise.cardioTime, dist: data.exercise.cardioDist});
            } else {
                addCardioBlock();
            }

            // 근력: strengthList가 최우선 (legacy 필드 무시)
            if(data.exercise.strengthList && data.exercise.strengthList.length > 0) {
                data.exercise.strengthList.forEach(item => addStrengthBlock(item));
            } else if(data.exercise.strengthVideoUrl) {
                addStrengthBlock({videoUrl: data.exercise.strengthVideoUrl});
            } else {
                addStrengthBlock();
            }
            if(awarded.exercise) { 
                const ep = awarded.exercisePoints || 15;
                document.getElementById('quest-exercise').className = 'quest-check done'; 
                document.getElementById('quest-exercise').innerText = `+${ep}P`; 
            }
        } else { addCardioBlock(); addStrengthBlock(); }

        if(data.sleepAndMind) {
            if(data.sleepAndMind.sleepImageUrl) { 
                document.getElementById('preview-sleep').src = data.sleepAndMind.sleepImageUrl; 
                document.getElementById('preview-sleep').style.display = 'block'; 
                document.getElementById('rm-sleep').style.display = 'block';
                document.getElementById('txt-sleep').style.display = 'none';
            }
            if(data.sleepAndMind.meditationDone) document.getElementById('meditation-check').checked = true;
            document.getElementById('gratitude-journal').value = data.sleepAndMind.gratitude || '';
            if(awarded.mind) { 
                const mp = awarded.mindPoints || 5;
                document.getElementById('quest-mind').className = 'quest-check done'; 
                document.getElementById('quest-mind').innerText = `+${mp}P`; 
            }
        }
    } else {
        addCardioBlock(); addStrengthBlock();
    }
    } catch(error) {
        console.error('데이터 로드 오류:', error);
        showToast('⚠️ 데이터를 불러오는 중 오류가 발생했습니다.');
        // 기본 블록은 추가
        addCardioBlock(); 
        addStrengthBlock();
    }
}

let galleryFilter = 'all';
window.setGalleryFilter = function(filter, btnElement) {
    galleryFilter = filter;
    document.querySelectorAll('.filter-chip').forEach(el => {
        el.classList.remove('active');
        el.setAttribute('aria-pressed', 'false');
    });
    btnElement.classList.add('active');
    btnElement.setAttribute('aria-pressed', 'true');
    // 필터 변경 시 무한 스크롤 초기화
    galleryDisplayCount = INITIAL_LOAD;
    renderFeedOnly();
};

window.openLightbox = function(url) {
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
};

window.openVideoLightbox = function(url) {
    const modal = document.getElementById('lightbox-modal');
    const img = document.getElementById('lightbox-img');
    const video = document.getElementById('lightbox-video');
    if (!video) return;

    img.style.display = 'none';
    video.style.display = 'block';
    video.src = url;
    video.currentTime = 0;
    modal.style.display = 'flex';
    video.play().catch(() => {});
};


// 자산 표시 업데이트 함수
window.updateAssetDisplay = async function() {
    const user = auth.currentUser;
    if (!user) return;
    
    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const userData = userSnap.data();
            
            // 포인트 표시 업데이트
            const pointsDisplay = document.getElementById('asset-points-display');
            if (pointsDisplay) {
                pointsDisplay.textContent = (userData.coins || 0) + 'P';
            }
            
            // HBT 표시 업데이트
            const hbtDisplay = document.getElementById('asset-hbt-display');
            if (hbtDisplay) {
                hbtDisplay.textContent = (userData.hbtBalance || 0) + ' HBT';
            }
            
            // 헤더의 포인트 배지도 업데이트
            const pointBadge = document.getElementById('point-balance');
            if (pointBadge) {
                pointBadge.textContent = (userData.coins || 0);
            }

            // ========== 활성 챌린지 UI (동시 진행 지원) ==========
            const challengeContainer = document.getElementById('active-challenge-container');
            const challengeInfo = document.getElementById('active-challenge-info');
            const challengeSelection = document.getElementById('challenge-selection');
            
            // activeChallenges 수집 (legacy 마이그레이션 포함)
            let activeChallenges = userData.activeChallenges || {};
            if (userData.activeChallenge && userData.activeChallenge.status === 'ongoing') {
                const legacyId = userData.activeChallenge.challengeId;
                const legacyTier = {
                    'challenge-diet-3d': 'mini', 'challenge-exercise-3d': 'mini', 'challenge-mind-3d': 'mini', 'challenge-all-3d': 'mini',
                    'challenge-diet-7d': 'weekly', 'challenge-exercise-7d': 'weekly', 'challenge-mind-7d': 'weekly', 'challenge-all-7d': 'weekly',
                    'challenge-diet-30d': 'master', 'challenge-exercise-30d': 'master', 'challenge-mind-30d': 'master', 'challenge-all-30d': 'master'
                }[legacyId] || 'master';
                if (!activeChallenges[legacyTier]) activeChallenges[legacyTier] = userData.activeChallenge;
            }

            const activeTiers = Object.keys(activeChallenges).filter(t => activeChallenges[t]?.status === 'ongoing');
            const challengeEmojis = {
                'challenge-diet-3d': '🥗 3일 식단', 'challenge-exercise-3d': '🏃 3일 운동', 'challenge-mind-3d': '🧘 3일 마음', 'challenge-all-3d': '🌟 3일 통합',
                'challenge-diet-7d': '🥗 7일 식단', 'challenge-exercise-7d': '🏃 7일 운동', 'challenge-mind-7d': '🧘 7일 마음', 'challenge-all-7d': '🌟 7일 통합',
                'challenge-diet-30d': '🥗 30일 식단', 'challenge-exercise-30d': '🏃 30일 운동', 'challenge-mind-30d': '🧘 30일 마음', 'challenge-all-30d': '🌟 30일 통합'
            };

            if (activeTiers.length > 0) {
                let challengeHtml = '';
                for (const tier of activeTiers) {
                    const ch = activeChallenges[tier];
                    const progressPct = Math.round((ch.completedDays / (ch.totalDays || 30)) * 100);
                    const remain = (ch.totalDays || 30) - ch.completedDays;
                    const challengeName = challengeEmojis[ch.challengeId] || '챌린지';
                    const totalDays = parseInt(ch.totalDays) || 30;
                    const tierLabel = { mini: '⚡미니', weekly: '🔥위클리', master: '🏆마스터' }[tier] || '';
                    const stakeDisplay = ch.hbtStaked > 0 
                        ? `<span style="font-size:11px;">💰 ${escapeHtml(String(ch.hbtStaked))} HBT</span>` 
                        : `<span style="font-size:11px;">🎯 무료</span>`;

                    challengeHtml += `
                        <details style="margin-bottom:8px;" ${activeTiers.length <= 2 ? 'open' : ''}>
                            <summary style="cursor:pointer; font-weight:bold; font-size:13px; padding:4px 0;">
                                ${tierLabel} ${escapeHtml(challengeName)} — ${parseInt(ch.completedDays) || 0}/${totalDays}일 ${stakeDisplay}
                            </summary>
                            <div style="padding:4px 0 4px 10px; font-size:12px; color:#333; line-height:1.6;">
                                <div>📅 ${escapeHtml(String(ch.startDate))} ~ ${escapeHtml(String(ch.endDate))}</div>
                                <div>✅ ${parseInt(ch.completedDays) || 0}/${totalDays}일 완료 (${parseInt(remain) || 0}일 남음)</div>
                                <div style="background:#fff; border-radius:4px; height:16px; margin-top:4px; overflow:hidden;">
                                    <div style="background: linear-gradient(90deg, #4CAF50, #8BC34A); height:100%; width:${progressPct}%; transition:width 0.5s; border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:10px; color:white; font-weight:bold;">${progressPct}%</div>
                                </div>
                            </div>
                        </details>
                    `;
                }
                if (challengeContainer) {
                    challengeContainer.style.display = 'block';
                    challengeInfo.innerHTML = challengeHtml;
                }
                // 같은 티어는 숨기고, 비어있는 티어는 선택 가능하게
                if (challengeSelection) {
                    challengeSelection.style.display = 'block';
                    // 진행 중인 티어의 버튼 비활성화
                    const allTierBtns = { 
                        mini: challengeSelection.querySelectorAll('[onclick*="-3d"]'),
                        weekly: challengeSelection.querySelectorAll('[onclick*="-7d"]'),
                        master: challengeSelection.querySelectorAll('[onclick*="-30d"]')
                    };
                    for (const [t, btns] of Object.entries(allTierBtns)) {
                        btns.forEach(btn => {
                            if (activeTiers.includes(t)) {
                                btn.disabled = true;
                                btn.style.opacity = '0.4';
                                btn.style.pointerEvents = 'none';
                            } else {
                                btn.disabled = false;
                                btn.style.opacity = '1';
                                btn.style.pointerEvents = 'auto';
                            }
                        });
                    }
                }
            } else {
                if (challengeContainer) challengeContainer.style.display = 'none';
                if (challengeSelection) challengeSelection.style.display = 'block';
            }

            // ========== 거래 기록 로드 ==========
            const txContainer = document.getElementById('transaction-history');
            if (txContainer) {
                try {
                    const txQuery = query(
                        collection(db, "blockchain_transactions"),
                        where("userId", "==", user.uid),
                        orderBy("timestamp", "desc"),
                        limit(20)
                    );
                    const txSnap = await getDocs(txQuery);
                    
                    if (txSnap.empty) {
                        txContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">거래 기록이 없습니다.</p>';
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
                            const icon = txIcons[tx.type] || '📋';
                            const label = txLabels[tx.type] || escapeHtml(String(tx.type));
                            const statusColor = tx.status === 'success' ? '#4CAF50' : tx.status === 'failed' ? '#F44336' : '#FF9800';
                            const statusText = tx.status === 'success' ? '✅' : tx.status === 'failed' ? '❌' : '⏳';
                            
                            let amountText = '';
                            if (tx.type === 'conversion') {
                                amountText = `${parseInt(tx.pointsUsed) || 0}P → ${parseFloat(tx.hbtReceived) || 0} HBT`;
                            } else if (tx.type === 'staking') {
                                amountText = `-${parseFloat(tx.amount) || 0} HBT`;
                            } else if (tx.type === 'challenge_settlement') {
                                amountText = parseFloat(tx.amount) > 0 ? `+${parseFloat(tx.amount)} HBT` : '소멸';
                            } else {
                                amountText = `${parseFloat(tx.amount) || 0} HBT`;
                            }
                            
                            txHtml += `
                                <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid #f0f0f0;">
                                    <div>
                                        <span style="margin-right:4px;">${icon}</span>
                                        <span style="font-weight:bold;">${label}</span>
                                        <span style="color:#999; margin-left:6px;">${txDate}</span>
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-weight:bold;">${amountText}</span>
                                        <span style="margin-left:4px;">${statusText}</span>
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
                        txContainer.innerHTML = '<p style="text-align:center; padding:20px; color:#999;">거래 기록을 불러오는 중입니다...</p>';
                    }
                }
            }
        }
    } catch (error) {
        console.error('자산 표시 업데이트 오류:', error);
    }
};

window.openTab = function(tabName, pushState = true) {
    const user = auth.currentUser;
    if (!user && tabName !== 'gallery') {
        document.getElementById('login-modal').style.display = 'flex'; return;
    }
    if(pushState) history.pushState({ tab: tabName }, '', '#' + tabName);

    const contents = document.getElementsByClassName("content-section");
    for (let i = 0; i < contents.length; i++) { contents[i].style.display = "none"; contents[i].classList.remove("active"); }
    const btns = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < btns.length; i++) { 
        btns[i].classList.remove("active"); 
        btns[i].removeAttribute("aria-current");
    }
    
    // 갤러리 탭은 ID로 직접 선택 (더 안정적)
    let targetBtn;
    if(tabName === 'gallery') {
        targetBtn = document.getElementById('btn-tab-gallery');
    } else {
        targetBtn = document.querySelector(`button[onclick*="openTab('${tabName}'"]`);
    }
    if(targetBtn) {
        targetBtn.classList.add("active");
        targetBtn.setAttribute("aria-current", "page");
    }
    document.getElementById(tabName).style.display = "block";
    
    const submitBar = document.getElementById('submit-bar');
    const saveBtn = document.getElementById('saveDataBtn');
    const chatBanner = document.getElementById('chat-banner');
    
    if(tabName === 'dashboard' || tabName === 'profile' || tabName === 'assets') {
        submitBar.style.display = 'none';
        
        // 자산 탭 열릴 때 자산 표시 업데이트
        if(tabName === 'assets' && user) {
            updateAssetDisplay();
        }
    } else if(tabName === 'gallery') {
        submitBar.style.display = 'block';
        saveBtn.innerText = '💬 해빛스쿨 공식 오픈단톡방 참여하기';
        saveBtn.style.backgroundColor = '#FEE500';
        saveBtn.style.color = '#3E2723';
        saveBtn.onclick = () => window.open('https://open.kakao.com/o/gv23urgi', '_blank');
    } else {
        submitBar.style.display = 'block';
        saveBtn.innerText = '현재 진행상황 저장 & 포인트 받기 🅿️';
        saveBtn.style.backgroundColor = 'var(--primary-color)';
        saveBtn.style.color = 'white';
        saveBtn.onclick = null; // 기본 이벤트 리스너로 복원
    }

    if(tabName === 'gallery') { 
        chatBanner.style.display = 'none'; 
        loadGalleryData(); 
    } else { 
        chatBanner.style.display = 'none';
        // 갤러리 탭을 벗어날 때 무한 스크롤 옵저버 해제 (메모리 절약)
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
            galleryIntersectionObserver = null;
        }
        
        // 입력 폼 탭(diet, exercise, sleep)으로 전환 시 기존 입력 초기화
        if (tabName === 'diet' || tabName === 'exercise' || tabName === 'sleep') {
            clearInputs();
            // 현재 선택된 날짜의 데이터 다시 로드
            loadDataForSelectedDate(document.getElementById('selected-date').value);
        }
        // 식단 탭에서 공복 지표 그래프 로드
        if (tabName === 'diet' && user) {
            loadFastingGraphData(user.uid);
        }
    }
    
    if(tabName === 'dashboard') renderDashboard();

    setTimeout(() => { document.getElementById(tabName).classList.add("active"); }, 10);
};

window.addEventListener('popstate', (e) => {
    if(e.state && e.state.tab) openTab(e.state.tab, false);
    else openTab('dashboard', false);
});

// 페이지 종료 시 리소스 정리 (메모리 누수 방지)
window.addEventListener('beforeunload', () => {
    cleanupGalleryResources();
});

// 중복 제거: 로그인 및 인증 로직은 auth.js 모듈에서 처리

window.hideFeedback = function() {
    document.getElementById('admin-feedback-box').style.display = 'none';
    const user = auth.currentUser;
    if(user) localStorage.setItem('hide_fb_' + user.uid, 'true');
};

// 중복 제거: 인증 상태 리스너는 auth.js의 setupAuthListener에서 처리

window.saveHealthProfile = async function() {
    const user = auth.currentUser;
    if(!user) return;
    const smm = document.getElementById('prof-smm').value;
    const fat = document.getElementById('prof-fat').value;
    const visceral = document.getElementById('prof-visceral').value;
    const hba1c = document.getElementById('prof-hba1c').value;
    let meds = [];
    document.querySelectorAll('input[name="med-chk"]:checked').forEach(chk => meds.push(chk.value));
    const medOther = document.getElementById('prof-med-other').value;

    try {
        await setDoc(doc(db, "users", user.uid), { healthProfile: { smm, fat, visceral, hba1c, meds, medOther } }, { merge: true });
        showToast("🧬 프로필이 저장되었습니다!");
    } catch(e) { 
        console.error('프로필 저장 오류:', e);
        showToast(`⚠️ 프로필 저장 실패: ${e.message || '알 수 없는 오류'}`);
    }
};

async function renderDashboard() {
    const user = auth.currentUser;
    if(!user) return;
    
    try {
        // 마일스톤 렌더링
        await renderMilestones(user.uid);
        
        const userRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userRef);
        let level = 1; let selectedMissions = [];
        if(userDoc.exists()) {
            const ud = userDoc.data();
            if(ud.missionLevel) level = ud.missionLevel;
            if(ud.selectedMissions) selectedMissions = ud.selectedMissions;
        }
        document.getElementById('user-level-badge').innerText = `Lv. ${level} (ℹ️전체보기)`;
        const missionArea = document.getElementById('mission-selection-area');
        missionArea.innerHTML = '';
        const currentMissions = MISSIONS[level] || MISSIONS[1];
        currentMissions.forEach(m => {
            const isChecked = selectedMissions.includes(m.id) ? 'checked' : '';
            missionArea.innerHTML += `<div class="mission-item"><input type="checkbox" id="chk_${m.id}" value="${m.id}" ${isChecked}><label for="chk_${m.id}">${m.text}</label></div>`;
        });

        const q = query(collection(db, "daily_logs"), where("userId", "==", user.uid));
        const snapshot = await getDocs(q);
        let logsMap = {}; let statDiet = 0, statExer = 0, statMind = 0;
        snapshot.forEach(d => {
            const data = d.data();
            if(weekStrs.includes(data.date)) {
                logsMap[data.date] = data;
                if(data.awardedPoints?.diet) statDiet++;
                if(data.awardedPoints?.exercise) statExer++;
                if(data.awardedPoints?.mind) statMind++;
        }
    });

    const graphArea = document.getElementById('week-graph');
    graphArea.innerHTML = '';
    const dayNames = ['월','화','수','목','금','토','일'];
    weekStrs.forEach((dateStr, idx) => {
        let circleClass = 'day-circle';
        if(logsMap[dateStr]) circleClass += ' done';
        let labelClass = 'day-label';
        if(dateStr === todayStr) { circleClass += ' today'; labelClass += ' today'; }
        // 날짜 누르면 해당 날짜로 이동
        graphArea.innerHTML += `<div class="day-wrap" onclick="changeDateTo('${dateStr}')"><div class="${circleClass}">${dayNames[idx]}</div><div class="${labelClass}">${dateStr.substring(5).replace('-','/')}</div></div>`;
    });

    const progContainer = document.getElementById('mission-progress-container');
    if(selectedMissions.length > 0) {
        progContainer.style.display = 'block'; progContainer.innerHTML = '';
        let allDone = true;
        currentMissions.forEach(m => {
            if(selectedMissions.includes(m.id)) {
                let currentVal = 0;
                if(m.type === 'diet') currentVal = statDiet;
                if(m.type === 'exercise') currentVal = statExer;
                if(m.type === 'mind') currentVal = statMind;
                const percent = Math.min((currentVal / m.target) * 100, 100);
                if(percent < 100) allDone = false;
                progContainer.innerHTML += `<div class="mp-row"><div class="mp-label"><span>${m.text}</span><span>${currentVal} / ${m.target}</span></div><div class="mp-track"><div class="mp-fill" style="width: ${percent}%;"></div></div></div>`;
            }
        });
        if(allDone && level < 5) progContainer.innerHTML += `<button class="submit-btn" style="margin-top:15px; background-color:#9C27B0; white-space:nowrap; font-size:13px; padding:12px 16px;" onclick="levelUp(${level+1})">🎉 Lv ${level+1} 승급하기</button>`;

        // 모든 미션 완료 시 저장 버튼 & 체크박스 비활성화
        const saveBtn = document.getElementById('btn-save-missions');
        if (allDone && selectedMissions.length > 0) {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.style.opacity = '0.5';
                saveBtn.style.cursor = 'not-allowed';
                saveBtn.innerText = '✅ 이번 주 미션 완료!';
            }
            document.querySelectorAll('#mission-selection-area input[type="checkbox"]').forEach(chk => {
                chk.disabled = true;
            });
        } else {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.style.opacity = '1';
                saveBtn.style.cursor = 'pointer';
                saveBtn.innerText = '이번 주 미션 저장';
            }
        }
    } else {
        progContainer.style.display = 'none';
    }
    } catch(error) {
        console.error('대시보드 렌더링 오류:', error);
        showToast('⚠️ 대시보드를 불러오는 중 오류가 발생했습니다.');
    }
}

window.saveWeeklyMissions = async function() {
    const user = auth.currentUser;
    if(!user) return;
    try {
        let selected = [];
        document.querySelectorAll('#mission-selection-area input[type="checkbox"]').forEach(chk => { if(chk.checked) selected.push(chk.value); });
        if(selected.length === 0) { alert("최소 1개 이상의 미션을 선택해주세요."); return; }
        await setDoc(doc(db, "users", user.uid), { selectedMissions: selected }, { merge: true });
        showToast("🎯 주간 미션이 설정되었습니다!"); 
        renderDashboard();
    } catch(error) {
        console.error('미션 저장 오류:', error);
        showToast('⚠️ 미션 저장에 실패했습니다.');
    }
};

window.levelUp = async function(newLevel) {
    const user = auth.currentUser;
    if(!user) return;
    try {
        await setDoc(doc(db, "users", user.uid), { missionLevel: newLevel, selectedMissions: [] }, { merge: true });
        alert(`축하합니다! 레벨 ${newLevel}(으)로 승급하셨습니다.`);
        document.getElementById('level-modal').style.display='none'; 
        renderDashboard();
    } catch(error) {
        console.error('레벨업 오류:', error);
        showToast('⚠️ 레벨업에 실패했습니다.');
    }
};

// compressImage, uploadFileAndGetUrl 등은 상단에서 직접 import

// ========== 30일 종합 결과지 ==========
window.generate30DayReport = async function() {
    const user = auth.currentUser;
    if (!user) { showToast('로그인이 필요합니다.'); return; }

    const modal = document.getElementById('report-modal');
    modal.style.display = 'flex';
    document.getElementById('report-user-name').textContent = user.displayName || '사용자';
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
        document.getElementById('report-period').textContent = `${startDate.replace(/-/g,'.')} ~ ${endDate.replace(/-/g,'.')} (${logs.length}일)`;

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
                ['breakfastUrl','lunchUrl','dinnerUrl','snackUrl'].forEach(k => { if(log.diet[k]) dietPhotos++; });
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
            return ap.diet || ap.exercise || ap.mind || (ap.dietPoints||0) + (ap.exercisePoints||0) + (ap.mindPoints||0) > 0;
        }).length / logs.length) * 100);

        // 날짜 레이블 (축약)
        const dateLabels = logs.map(l => l.date.substring(5).replace('-','/'));

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
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(dietDays/logs.length*100)}%; background:#4CAF50;"></div></div>
                </div>
                <div class="report-cat-card exercise">
                    <div class="report-cat-emoji">🏃</div>
                    <div class="report-cat-name">운동</div>
                    <div class="report-cat-stat">${exerDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🏋️ 유산소 ${cardioCount}회 · 근력 ${strengthCount}회 · ${totalExer}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(exerDays/logs.length*100)}%; background:#2196F3;"></div></div>
                </div>
                <div class="report-cat-card mind">
                    <div class="report-cat-emoji">🧘</div>
                    <div class="report-cat-name">마음</div>
                    <div class="report-cat-stat">${mindDays}일 / ${logs.length}일</div>
                    <div class="report-cat-detail">🧘 명상 ${meditationCount}회 · 감사일기 ${gratitudeCount}회 · ${totalMind}P</div>
                    <div class="report-cat-bar"><div class="report-cat-fill" style="width:${Math.round(mindDays/logs.length*100)}%; background:#9C27B0;"></div></div>
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
                const wFirst = weights[0].v, wLast = weights[weights.length-1].v;
                const wDiff = (wLast - wFirst).toFixed(1);
                const wSign = wDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">⚖️ 체중: ${wFirst}kg → ${wLast}kg <span class="report-metric-diff ${wDiff < 0 ? 'good' : wDiff > 0 ? 'warn' : ''}">(${wSign}${wDiff}kg)</span></div>`;
            }
            if (glucoses.length >= 2) {
                const gFirst = glucoses[0].v, gLast = glucoses[glucoses.length-1].v;
                const gDiff = Math.round(gLast - gFirst);
                const gSign = gDiff > 0 ? '+' : '';
                html += `<div class="report-metric-summary">🩸 혈당: ${gFirst} → ${gLast}mg/dL <span class="report-metric-diff ${gDiff < 0 ? 'good' : gDiff > 0 ? 'warn' : ''}">(${gSign}${gDiff})</span></div>`;
            }
            if (bpSys.length >= 2) {
                const sFirst = bpSys[0].v, sLast = bpSys[bpSys.length-1].v;
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
            const pts = (ap.dietPoints||0) + (ap.exercisePoints||0) + (ap.mindPoints||0) || ((ap.diet?10:0)+(ap.exercise?15:0)+(ap.mind?5:0));
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
            if (weights.length >= 2) healthLines.push({ data: weights.map(w => w.v), dates: weights.map(w => w.date.substring(5).replace('-','/')), color: '#FF6F00', label: '체중(kg)' });
            if (glucoses.length >= 2) healthLines.push({ data: glucoses.map(g => g.v), dates: glucoses.map(g => g.date.substring(5).replace('-','/')), color: '#E53935', label: '혈당' });
            if (bpSys.length >= 2) healthLines.push({ data: bpSys.map(s => s.v), dates: bpSys.map(s => s.date.substring(5).replace('-','/')), color: '#D32F2F', label: '수축기' });
            if (bpDia.length >= 2) healthLines.push({ data: bpDia.map(d => d.v), dates: bpDia.map(d => d.date.substring(5).replace('-','/')), color: '#1976D2', label: '이완기' });
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
    for (let i = 0; i < n; i++) { let sum = 0; datasets.forEach(ds => sum += (ds.data[i]||0)); maxY = Math.max(maxY, sum); }
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
            ctx.save(); ctx.translate(x + barW/2, h - 3); ctx.rotate(-0.5);
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
        const yEnd = pad.top + chartH - line.normalized[n-1] * chartH;
        ctx.fillStyle = line.color; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(line.data[0], xStart + 3, yStart - 5);
        ctx.textAlign = 'right';
        ctx.fillText(line.data[n-1], xEnd - 3, yEnd - 5);
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

window.switchFastingGraph = function(metric, btnEl) {
    currentFastingMetric = metric;
    document.querySelectorAll('#fasting-graph-card .filter-chip').forEach(el => el.classList.remove('active'));
    if(btnEl) btnEl.classList.add('active');
    drawFastingChart();
};

async function loadFastingGraphData(userId) {
    try {
        const q = query(collection(db, "daily_logs"), where("userId", "==", userId), orderBy("date", "desc"), limit(30));
        const snapshot = await getDocs(q);
        fastingGraphData = [];
        snapshot.forEach(d => {
            const data = d.data();
            if(data.metrics && (data.metrics.weight || data.metrics.glucose || data.metrics.bpSystolic)) {
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
        if(fastingGraphData.length >= 2 && card) {
            card.style.display = 'block';
            drawFastingChart();
        } else if(card) {
            card.style.display = 'none';
        }
    } catch(e) {
        console.warn('⚠️ 공복 지표 로드 스킵:', e.message);
    }
}

function drawFastingChart() {
    const canvas = document.getElementById('fasting-chart');
    if(!canvas || fastingGraphData.length < 2) return;
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
    if(currentFastingMetric === 'weight') {
        const pts = fastingGraphData.filter(d => d.weight !== null);
        if(pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.weight })), color: '#FF6F00', label: '체중(kg)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length-1].weight}kg` : '데이터 부족';
    } else if(currentFastingMetric === 'glucose') {
        const pts = fastingGraphData.filter(d => d.glucose !== null);
        if(pts.length >= 2) lines.push({ data: pts.map(d => ({ x: d.date, y: d.glucose })), color: '#E53935', label: '혈당(mg/dL)' });
        legend = pts.length >= 2 ? `최근: ${pts[pts.length-1].glucose}mg/dL` : '데이터 부족';
    } else if(currentFastingMetric === 'bp') {
        const spts = fastingGraphData.filter(d => d.bpSystolic !== null);
        const dpts = fastingGraphData.filter(d => d.bpDiastolic !== null);
        if(spts.length >= 2) lines.push({ data: spts.map(d => ({ x: d.date, y: d.bpSystolic })), color: '#D32F2F', label: '수축기' });
        if(dpts.length >= 2) lines.push({ data: dpts.map(d => ({ x: d.date, y: d.bpDiastolic })), color: '#1976D2', label: '이완기' });
        legend = spts.length >= 2 ? `최근: ${spts[spts.length-1].bpSystolic}/${dpts.length > 0 ? dpts[dpts.length-1].bpDiastolic : '?'}mmHg` : '데이터 부족';
    }

    document.getElementById('fasting-chart-legend').textContent = legend;

    if(lines.length === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('기록이 2개 이상 필요합니다', w/2, h/2);
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
    for(let i = 0; i <= 4; i++) {
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
            if(i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
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
    const labelIndices = totalPts <= 5 ? [...Array(totalPts).keys()] : [0, Math.floor(totalPts/2), totalPts-1];
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
    
    try {
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
            fileToUpload = await compressImage(file);
        }
        
        const MAX_SIZE_MB = 50;
        const fileSizeMB = fileToUpload.size / (1024 * 1024);
        if (fileSizeMB > MAX_SIZE_MB) {
            showToast(`⚠️ 파일이 너무 큽니다. (최대 ${MAX_SIZE_MB}MB, 현재 ${fileSizeMB.toFixed(2)}MB)`);
            return null;
        }
        
        const timestamp = Date.now();
        const storagePath = `${folderName}/${userId}/${timestamp}_${fileToUpload.name}`;
        const storageRef = ref(storage, storagePath);
        
        await uploadBytes(storageRef, fileToUpload);
        const url = await getDownloadURL(storageRef);
        return url;
    } catch(error) {
        console.error('파일 업로드 실패:', error.code, error.message);
        if (error.code === 'storage/unauthorized') {
            showToast('⚠️ 업로드 권한이 없습니다.');
        } else if (error.code === 'storage/quota-exceeded') {
            showToast('⚠️ 저장 공간이 부족합니다.');
        } else {
            showToast(`⚠️ 업로드 실패: ${error.message}`);
        }
        return null;
    }
}

document.getElementById('saveDataBtn').addEventListener('click', () => {
    const user = auth.currentUser;
    if (!user) return;
    
    const saveBtn = document.getElementById('saveDataBtn');
    saveBtn.innerText = "저장 중..."; saveBtn.disabled = true;
    showToast("백그라운드에서 저장 중입니다! 🚀");

    (async () => {
        try {
            const selectedDateStr = document.getElementById('selected-date').value;
            const docId = `${user.uid}_${selectedDateStr}`;
            const existingDoc = await getDoc(doc(db, "daily_logs", docId));
            let oldData = existingDoc.exists() ? existingDoc.data() : { awardedPoints: {} };

            const getUrl = async (id, folder, oldUrl) => {
                const el = document.getElementById(id);
                if(el && el.files[0] && el.parentElement.querySelector('.preview-img').style.display !== 'none') {
                    try {
                        return await uploadFileAndGetUrl(el.files[0], folder, user.uid);
                    } catch (err) {
                        console.error(`${id} 업로드 실패:`, err);
                        return null;
                    }
                }
                if(el && el.parentElement.querySelector('.preview-img').style.display === 'none') {
                    return null;
                }
                return oldUrl || null;
            };

            const bUrl = await getUrl('diet-img-breakfast', 'diet_images', oldData?.diet?.breakfastUrl);
            const lUrl = await getUrl('diet-img-lunch', 'diet_images', oldData?.diet?.lunchUrl);
            const dUrl = await getUrl('diet-img-dinner', 'diet_images', oldData?.diet?.dinnerUrl);
            const sUrl = await getUrl('diet-img-snack', 'diet_images', oldData?.diet?.snackUrl);
            
            // 식단 썸네일: 새로 업로드된 파일만 썸네일 생성
            const dietInputs = ['diet-img-breakfast', 'diet-img-lunch', 'diet-img-dinner', 'diet-img-snack'];
            const dietUrls = [bUrl, lUrl, dUrl, sUrl];
            const oldThumbUrls = [
                oldData?.diet?.breakfastThumbUrl, oldData?.diet?.lunchThumbUrl,
                oldData?.diet?.dinnerThumbUrl, oldData?.diet?.snackThumbUrl
            ];
            const thumbResults = await Promise.all(dietInputs.map(async (inputId, idx) => {
                const el = document.getElementById(inputId);
                if (el && el.files[0] && dietUrls[idx]) {
                    try {
                        const thumbBlob = await generateThumbnailBlob(el.files[0]);
                        if (thumbBlob) {
                            const thumbPath = `diet_images_thumbnails/${user.uid}/${Date.now()}_thumb_${idx}.jpg`;
                            const thumbRef = ref(storage, thumbPath);
                            await uploadBytes(thumbRef, thumbBlob);
                            return await getDownloadURL(thumbRef);
                        }
                    } catch (e) { console.warn('식단 썸네일 생성 실패:', e.message); }
                }
                return oldThumbUrls[idx] || null;
            }));
            const [bThumbUrl, lThumbUrl, dThumbUrl, sThumbUrl] = thumbResults;

            let cardioList = [];
            const cardioBlocks = document.querySelectorAll('.cardio-block');
            for (let block of cardioBlocks) {
                const fileInput = block.querySelector('.exer-file');
                const time = block.querySelector('.c-time').value;
                const dist = block.querySelector('.c-dist').value;
                let url = block.getAttribute('data-url') || null;
                let thumbUrl = null;
                if(fileInput.files[0]) {
                    try {
                        url = await uploadFileAndGetUrl(fileInput.files[0], 'exercise_images', user.uid);
                        // 운동 사진 썸네일 생성
                        if (url) {
                            try {
                                const tb = await generateThumbnailBlob(fileInput.files[0]);
                                if (tb) {
                                    const tp = `exercise_images_thumbnails/${user.uid}/${Date.now()}_thumb.jpg`;
                                    const tr = ref(storage, tp);
                                    await uploadBytes(tr, tb);
                                    thumbUrl = await getDownloadURL(tr);
                                }
                            } catch (e) { console.warn('운동 썸네일 생성 실패:', e.message); }
                        }
                    } catch (err) {
                        console.error('⚠️ 유산소 사진 업로드 실패:', err);
                        url = null;
                    }
                }
                if(url || time || dist) cardioList.push({ imageUrl: url, imageThumbUrl: thumbUrl, time, dist });
            }

            let strengthList = [];
            const strengthBlocks = document.querySelectorAll('.strength-block');
            for (let block of strengthBlocks) {
                const fileInput = block.querySelector('.exer-file');
                let url = block.getAttribute('data-url') || null;
                if(fileInput.files[0]) {
                    try {
                        url = await uploadFileAndGetUrl(fileInput.files[0], 'exercise_videos', user.uid);
                    } catch (err) {
                        console.error('⚠️ 근력 영상 업로드 실패:', err);
                        url = null;
                    }
                }
                // 영상에는 썸네일 폴더가 없으므로 null 저장 (클라이언트에서 프레임 추출)
                if(url) strengthList.push({ videoUrl: url, videoThumbUrl: null });
            }

            const sleepFile = document.getElementById('sleep-img');
            let sleepUrl = oldData?.sleepAndMind?.sleepImageUrl || null;
            let sleepThumbUrl = oldData?.sleepAndMind?.sleepImageThumbUrl || null;
            if(sleepFile.files[0] && document.getElementById('preview-sleep').style.display !== 'none') {
                try {
                    const sleepResult = await uploadImageWithThumb(sleepFile.files[0], 'sleep_images', user.uid);
                    sleepUrl = sleepResult.url;
                    sleepThumbUrl = sleepResult.thumbUrl;
                } catch (err) {
                    console.error('⚠️ 수면 사진 업로드 실패:', err);
                    sleepUrl = null;
                    sleepThumbUrl = null;
                }
            } else if(document.getElementById('preview-sleep').style.display === 'none') {
                sleepUrl = null;
                sleepThumbUrl = null;
            }

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
            if(cardioList.length >= 1) newExerPts += 10;
            if(cardioList.length >= 2) newExerPts += 5;
            if(strengthList.length >= 1) newExerPts += 10;
            if(strengthList.length >= 2) newExerPts += 5;
            newExerPts = Math.min(newExerPts, 30);

            // 마음: 수면분석 10P + 마음챙김/감사일기 10P (최대 20P)
            let newMindPts = 0;
            if(sleepUrl) newMindPts += 10;
            if(meditationDone || gratitudeText) newMindPts += 10;
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

            const saveData = sanitize({
                userId: user.uid, userName: user.displayName, date: selectedDateStr, timestamp: serverTimestamp(), awardedPoints: awarded,
                metrics: { weight: document.getElementById('weight').value, glucose: document.getElementById('glucose').value, bpSystolic: document.getElementById('bp-systolic').value, bpDiastolic: document.getElementById('bp-diastolic').value },
                diet: {
                    breakfastUrl: bUrl, lunchUrl: lUrl, dinnerUrl: dUrl, snackUrl: sUrl,
                    breakfastThumbUrl: bThumbUrl, lunchThumbUrl: lThumbUrl, dinnerThumbUrl: dThumbUrl, snackThumbUrl: sThumbUrl
                },
                exercise: { cardioList: cardioList, strengthList: strengthList },
                sleepAndMind: { sleepImageUrl: sleepUrl, sleepImageThumbUrl: sleepThumbUrl, meditationDone: meditationDone, gratitude: gratitudeText }
            });

            await setDoc(doc(db, "daily_logs", docId), saveData, { merge: true });

            if(pointsToGive > 0) {
                const userRef = doc(db, "users", user.uid);
                // increment()로 원자적 업데이트 (Race Condition 방지)
                await setDoc(userRef, { coins: increment(pointsToGive) }, { merge: true });
                const currentDisplayed = parseInt(document.getElementById('point-balance').innerText) || 0;
                document.getElementById('point-balance').innerText = currentDisplayed + pointsToGive;
                showToast(`🎉 저장 완료! 새롭게 ${pointsToGive}P 획득!`);
            } else { showToast(`🎉 데이터가 업데이트되었습니다.`); }
            
            // 데이터 저장 후 캐시 초기화 (갤러리 재로드를 위해)
            cachedGalleryLogs = []; 
            galleryDisplayCount = 0; // 무한 스크롤도 초기화
            
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
window.toggleReaction = async function(docId, reactionType, btnElement) {
    const user = auth.currentUser;
    if(!user) { document.getElementById('login-modal').style.display='flex'; return; }
    
    const span = btnElement.querySelector('span');
    let count = parseInt(span.innerText);
    const isActive = btnElement.classList.contains('active');
    
    if (isActive) { btnElement.classList.remove('active'); count = Math.max(0, count - 1); } 
    else { btnElement.classList.add('active'); count++; }
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
    } catch(error) {
        console.error('반응 저장 오류:', error);
        // UI 롤백 (실패 시 원복)
        if (isActive) { btnElement.classList.add('active'); count++; } 
        else { btnElement.classList.remove('active'); count = Math.max(0, count - 1); }
        span.innerText = count;
        showToast('⚠️ 반응 저장에 실패했습니다.');
    }
};

window.toggleFriend = async function(friendId) {
    const user = auth.currentUser;
    if(!user) { document.getElementById('login-modal').style.display='flex'; return; }
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);
    let friends = userSnap.exists() ? (userSnap.data().friends || []) : [];
    if(friends.includes(friendId)) { await setDoc(userRef, { friends: arrayRemove(friendId) }, {merge: true}); showToast("친구 삭제 완료"); } 
    else {
        if(friends.length >= 3) { showToast("친구는 3명까지만 가능합니다!"); return; }
        await setDoc(userRef, { friends: arrayUnion(friendId) }, {merge: true}); showToast("✨ 친구 등록 완료! 갤러리 상단에 뜹니다.");
    }
    // 친구 목록 변경 시 캐시 초기화 및 재로드
    cachedGalleryLogs = []; 
    galleryDisplayCount = 0;
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

// 이미지 URL로부터 저용량 썸네일 생성 (300px 폭, JPEG 60%)
async function generateThumbnailBlob(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const maxW = 300;
                const scale = Math.min(1, maxW / img.width);
                const w = Math.round(img.width * scale);
                const h = Math.round(img.height * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.6);
            };
            img.onerror = () => resolve(null);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
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

window.handleThumbFallback = function(imgEl) {
    const raw = imgEl.getAttribute('data-fallback-list') || '';
    const list = raw ? raw.split('||').filter(Boolean) : [];
    if (!list.length) {
        imgEl.onerror = null;
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
            htmlString += `<div class="share-media-thumb" data-media-type="image" data-media-src="${safeUrl}"><img src="${safeUrl}" alt="해빛 인증 사진 ${i+1}" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;"></div>`;
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
            try { await tasks[idx](); } catch (_) {}
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
            const renderedThumbImg = thumb.querySelector('img');
            const renderedThumbUrl = renderedThumbImg?.src || mediaSrc;
            b64 = await fetchImageAsBase64(renderedThumbUrl);
            if (!b64) b64 = createVideoPlaceholderBase64();
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

window.closeSharePlatformModal = function() {
    const modal = document.getElementById('share-platform-modal');
    if (modal) modal.style.display = 'none';
};

async function createSquareShareBlob() {
    const captureArea = document.getElementById('capture-area');
    const width = captureArea.offsetWidth;
    const height = captureArea.offsetHeight;

    const canvas = await html2canvas(captureArea, {
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

    return await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (!blob) {
                reject(new Error('Blob 생성 실패'));
                return;
            }
            resolve(blob);
        }, 'image/png');
    });
};

window.shareMyCard = async function() {
    const btn = document.querySelector('.btn-share-action');
    const originalText = btn.innerHTML;
    btn.innerText = '⏳ 1:1 이미지 생성 중...';
    btn.disabled = true;

    try {
        await prepareShareThumbsForCapture();
        const blob = await createSquareShareBlob();
        latestShareBlob = blob;
        latestShareFile = new File([blob], `haebit_cert_${Date.now()}.png`, { type: 'image/png' });
        latestShareText = '오늘의 해빛스쿨 건강 습관 인증입니다! 함께해요 💪\n\n👇 갤러리 구경가기 (가입 없이 가능)\n' + window.location.href;

        // Web Share API 우선 시도 (모바일에서 모든 앱으로 직접 공유)
        const shareData = { title: '해빛스쿨 인증', text: latestShareText, files: [latestShareFile] };
        if (navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                return; // 공유 성공 시 종료
            } catch (shareErr) {
                if (shareErr.name !== 'AbortError') {
                    console.warn('시스템 공유 취소/실패, 모달 표시:', shareErr);
                }
            }
        }
        // Web Share API 미지원 또는 실패 시 모달 표시
        openSharePlatformModal();
    } catch (err) {
        console.error('공유 카드 생성 오류:', err);
        showToast('⚠️ 카드 생성에 실패했습니다. 다시 시도해주세요.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
};

window.shareViaSystem = async function() {
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
            showToast('이 브라우저는 시스템 공유를 지원하지 않습니다. 아래 채널 버튼을 사용해주세요.');
        }
    } catch (_) {}
};

function downloadShareImage() {
    if (!latestShareBlob) return;
    const url = URL.createObjectURL(latestShareBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `haebit_cert_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function shareFileToAppsOrFallback(platform) {
    // Web Share API 재시도
    const shareData = {
        title: '해빛스쿨 인증',
        text: latestShareText,
        files: [latestShareFile]
    };
    if (navigator.canShare && navigator.canShare(shareData)) {
        try {
            await navigator.share(shareData);
            closeSharePlatformModal();
            return true;
        } catch (_) {}
    }

    // 이미지 자동 다운로드
    downloadShareImage();

    const pageUrl = encodeURIComponent(window.location.href);
    const shareText = encodeURIComponent('오늘의 해빛스쿨 건강 습관 인증입니다! 함께해요 💪');

    if (platform === 'instagram') {
        window.open('https://www.instagram.com/', '_blank');
        showToast('📥 이미지가 저장되었습니다!\n인스타그램 앱에서 이미지를 선택하여 게시해주세요.');
    } else if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${pageUrl}&quote=${shareText}`, '_blank');
        showToast('📥 이미지가 저장되었습니다!\n페이스북 창에서 이미지를 추가해주세요.');
    } else if (platform === 'x') {
        window.open(`https://twitter.com/intent/tweet?text=${shareText}&url=${pageUrl}`, '_blank');
        showToast('📥 이미지가 저장되었습니다!\nX(트위터) 창에서 이미지를 추가해주세요.');
    } else if (platform === 'kakao') {
        window.open(`https://story.kakao.com/share?url=${pageUrl}`, '_blank');
        showToast('📥 이미지가 저장되었습니다!\n카카오에서 이미지를 추가해주세요.');
    }

    closeSharePlatformModal();
    return false;
}

window.shareToPlatform = async function(platform) {
    if (!latestShareBlob || !latestShareFile) {
        showToast('먼저 공유 이미지를 생성해주세요.');
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
let galleryDisplayCount = 0; // 현재 표시할 아이템 수
const INITIAL_LOAD = 20; // 초기 로드 개수
const LOAD_MORE = 15; // 추가 로드 개수
const MAX_CACHE_SIZE = 100; // 캠시 최대 크기 (메모리 관리)
let galleryIntersectionObserver = null;
let isLoadingMore = false; // 중복 로딩 방지

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

// 추가 아이템 로드 함수
function loadMoreGalleryItems() {
    if (isLoadingMore) return;
    
    const sentinel = document.getElementById('gallery-sentinel');
    const container = document.getElementById('gallery-container');
    
    // 필터링된 전체 아이템 수 계산
    let totalFilteredItems = 0;
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    let sortedLogs = [...cachedGalleryLogs];
    sortedLogs.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId);
        const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });
    
    sortedLogs.forEach(item => {
        if (shouldShowItem(item.data)) totalFilteredItems++;
    });
    
    // 이미 모든 아이템을 표시했으면 종료
    if (galleryDisplayCount >= totalFilteredItems) {
        sentinel.style.display = 'none';
        return;
    }
    
    isLoadingMore = true;
    sentinel.style.display = 'block';
    
    // 다음 배치 로드
    setTimeout(() => {
        galleryDisplayCount += LOAD_MORE;
        renderFeedOnly();
        isLoadingMore = false;
    }, 300); // 부드러운 UX를 위한 약간의 지연
}

// 아이템이 표시되어야 하는지 판단하는 헬퍼 함수
function shouldShowItem(data) {
    // collectGalleryMedia 활용하여 중복 제거
    const media = collectGalleryMedia(data);
    const hasDiet = !!media.dietHtml;
    const hasExercise = !!media.exerciseHtml;
    const hasMind = !!(media.mindHtml || media.mindText);

    if (galleryFilter === 'all') {
        return hasDiet || hasExercise || hasMind;
    } else if (galleryFilter === 'diet') {
        return hasDiet;
    } else if (galleryFilter === 'exercise') {
        return hasExercise;
    } else if (galleryFilter === 'mind') {
        return hasMind;
    }
    return false;
}

// 메모리 누수 방지: 모든 리소스 정리
function cleanupGalleryResources() {
    // Intersection Observer 정리
    if (galleryIntersectionObserver) {
        galleryIntersectionObserver.disconnect();
        galleryIntersectionObserver = null;
    }
    
    // 고유한 상황에서만 캠시 정리 (로그아웃 등)
    isLoadingMore = false;
}
window.cleanupGalleryResources = cleanupGalleryResources;

async function loadGalleryData() {
    const user = auth.currentUser;
    const myId = user ? user.uid : "";

    if(cachedGalleryLogs.length === 0) {
        const container = document.getElementById('gallery-container');
        container.innerHTML = '<p style="text-align:center; font-size:13px;">데이터를 불러오는 중입니다...</p>';
        
        if(user) {
            const userSnap = await getDoc(doc(db, "users", myId));
            if(userSnap.exists()) cachedMyFriends = userSnap.data().friends || [];
        }
        
        // 메모리 관리: MAX_CACHE_SIZE까지만 가져오기
        const q = query(collection(db, "daily_logs"), orderBy("date", "desc"), limit(MAX_CACHE_SIZE));
        const snapshot = await getDocs(q);
        
        let logsArray = [];
        snapshot.forEach(d => { logsArray.push({id: d.id, data: d.data()}); });
        
        // 캠시 크기 제한 (메모리 누수 방지)
        cachedGalleryLogs = logsArray.slice(0, MAX_CACHE_SIZE);

        // 공유 카드는 처음 한 번만 그림 (속도 개선)
        let myRecentLogs = []; 
        cachedGalleryLogs.forEach(item => { if(item.data.userId === myId && (item.data.date === todayStr || item.data.date === yesterdayStr)) myRecentLogs.push(item.data); });
        
        if(user && myRecentLogs.length > 0) {
            document.getElementById('my-share-container').style.display = 'flex';
            const latest = myRecentLogs[0]; 
            document.getElementById('share-name').innerText = user.displayName;
            document.getElementById('share-date').innerText = latest.date.replace(/-/g, '. ');
            let points = (latest.awardedPoints?.dietPoints || 0) + (latest.awardedPoints?.exercisePoints || 0) + (latest.awardedPoints?.mindPoints || 0);
            if(points === 0 && latest.awardedPoints) { /* legacy fallback */ if(latest.awardedPoints.diet) points += 10; if(latest.awardedPoints.exercise) points += 15; if(latest.awardedPoints.mind) points += 5; }
            document.getElementById('share-point').innerText = points;

            // collectGalleryMedia 헬퍼 함수로 미디어 URL 수집
            let imgs = [];
            if(latest.diet) {
                ['breakfastUrl','lunchUrl','dinnerUrl','snackUrl'].forEach(k => { 
                    if(latest.diet[k]) imgs.push(latest.diet[k]); 
                });
            }
            if(latest.exercise) {
                if(latest.exercise.cardioList && latest.exercise.cardioList.length > 0) {
                    latest.exercise.cardioList.forEach(c => { if(c.imageUrl) imgs.push(c.imageUrl); });
                } else if(latest.exercise.cardioImageUrl) {
                    imgs.push(latest.exercise.cardioImageUrl);
                }
                if(latest.exercise.strengthList && latest.exercise.strengthList.length > 0) {
                    latest.exercise.strengthList.forEach(s => { if(s.videoUrl) imgs.push(s.videoUrl); });
                } else if(latest.exercise.strengthVideoUrl) {
                    imgs.push(latest.exercise.strengthVideoUrl);
                }
            }
            if(latest.sleepAndMind?.sleepImageUrl) imgs.push(latest.sleepAndMind.sleepImageUrl);
            
            // 중복 제거 및 null/undefined 필터링
            imgs = [...new Set(imgs)].filter(url => url && url.trim() !== '');
            
            const imgGrid = document.getElementById('share-imgs');
            imgGrid.innerHTML = '';
            imgGrid.classList.remove('single-item', 'two-items', 'three-items', 'four-items');
            
            // 모든 이미지를 한 번에 로드 후 한 번에 추가 (중복 방지)
            let htmlString = buildShareImageGrid(imgs, 4);
            imgGrid.innerHTML = htmlString;
            if (imgs.length === 1) imgGrid.classList.add('single-item');
            if (imgs.length === 2) imgGrid.classList.add('two-items');
            if (imgs.length === 3) imgGrid.classList.add('three-items');
            if (imgs.length >= 4) imgGrid.classList.add('four-items');
            
            if(imgs.length === 0) imgGrid.innerHTML = `<div style="font-size:12px; color:#888; padding:15px; background:rgba(255,255,255,0.8); border-radius:8px; grid-column: span 2;">텍스트 인증 완료!</div>`;
        } else {
            document.getElementById('my-share-container').style.display = 'none';
        }
    }
    
    // 무한 스크롤 초기화
    galleryDisplayCount = INITIAL_LOAD;

    // 갤러리 반응 요약 배너 (인스타그램 스타일)
    renderActivitySummary(myId);

    renderFeedOnly();
    setupInfiniteScroll();
}

// 인스타그램 스타일: 내 게시물에 달린 반응/댓글 요약 배너
function renderActivitySummary(myId) {
    const summaryEl = document.getElementById('gallery-activity-summary');
    if (!summaryEl || !myId) { if(summaryEl) summaryEl.style.display = 'none'; return; }

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

    let parts = [];
    if (totalHeart > 0) parts.push(`<span class="summary-item">❤️ ${totalHeart}</span>`);
    if (totalFire > 0) parts.push(`<span class="summary-item">🔥 ${totalFire}</span>`);
    if (totalClap > 0) parts.push(`<span class="summary-item">👏 ${totalClap}</span>`);
    if (totalComments > 0) parts.push(`<span class="summary-item">💬 ${totalComments}</span>`);

    summaryEl.innerHTML = `
        <div class="summary-content">
            <div class="summary-label">내 게시물 반응</div>
            <div class="summary-stats">${parts.join('')}</div>
        </div>
    `;
    summaryEl.style.display = 'flex';
}

// 댓글 추가
window.addComment = async function(docId) {
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
            userName: user.displayName || '익명',
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
window.deleteComment = async function(docId, commentIdx) {
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
window.toggleComments = function(docId) {
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
    return `${d.getMonth()+1}/${d.getDate()}`;
}

// 중복 코드 제거: 갤러리 미디어 수집 헬퍼 함수
function collectGalleryMedia(data) {
    const result = {
        dietHtml: '',
        exerciseHtml: '',
        mindHtml: '',
        mindText: ''
    };

    // 식단 미디어 (썸네일 우선, 클릭 시 원본)
    if(data.diet) {
        ['breakfast','lunch','dinner','snack'].forEach(k => {
            const originalUrl = data.diet[`${k}Url`];
            if(originalUrl) {
                const thumbUrl = data.diet[`${k}ThumbUrl`] || originalUrl;
                const safeOriginal = String(originalUrl).replace(/'/g, "\\'");
                const safeThumb = String(thumbUrl).replace(/'/g, "\\'");
                result.dietHtml += `<img src="${safeThumb}" onclick="openLightbox('${safeOriginal}')" alt="${k} 식사 사진" loading="lazy" decoding="async">`;
            }
        });
    }

    // 운동 미디어 (썸네일 우선, 클릭 시 원본)
    if(data.exercise) {
        let addedUrls = new Set();
        const addImg = (url, thumbUrl = null) => {
            if(url && !addedUrls.has(url)) {
                const displayUrl = thumbUrl || url;
                const safeOriginal = String(url).replace(/'/g, "\\'");
                const safeDisplay = String(displayUrl).replace(/'/g, "\\'");
                result.exerciseHtml += `<img src="${safeDisplay}" onclick="openLightbox('${safeOriginal}')" alt="운동 인증 사진" loading="lazy" decoding="async">`;
                addedUrls.add(url);
            }
        };
        const addVid = (url, videoThumbUrl = null) => {
            if(url && !addedUrls.has(url)) {
                const safeJsUrl = String(url).replace(/'/g, "\\'");
                const safeAttr = String(url).replace(/"/g, '&quot;');
                // 비디오 태그의 #t=0.5로 첫 프레임 표시 (CORS 불필요)
                result.exerciseHtml += `<div class="video-thumb-wrapper" onclick="openVideoLightbox('${safeJsUrl}')"><video src="${safeAttr}#t=0.5" muted playsinline preload="metadata" crossorigin="anonymous" style="width:100%;height:100%;object-fit:cover;pointer-events:none;"></video><div class="video-play-btn">&#9654;</div></div>`;
                addedUrls.add(url);
            }
        };
        
        addImg(data.exercise.cardioImageUrl, data.exercise.cardioImageThumbUrl || null);
        addVid(data.exercise.strengthVideoUrl, data.exercise.strengthVideoThumbUrl || null);
        if(data.exercise.cardioList) data.exercise.cardioList.forEach(c => addImg(c.imageUrl, c.imageThumbUrl || null));
        if(data.exercise.strengthList) data.exercise.strengthList.forEach(s => addVid(s.videoUrl, s.videoThumbUrl || null));
    }

    // 마음 미디어 (썸네일 우선)
    if(data.sleepAndMind?.sleepImageUrl) {
        const sleepOriginal = data.sleepAndMind.sleepImageUrl;
        const sleepThumb = data.sleepAndMind.sleepImageThumbUrl || sleepOriginal;
        const safeSleepOriginal = String(sleepOriginal).replace(/'/g, "\\'");
        const safeSleepThumb = String(sleepThumb).replace(/'/g, "\\'");
        result.mindHtml = `<img src="${safeSleepThumb}" onclick="openLightbox('${safeSleepOriginal}')" alt="수면 기록 캡처" loading="lazy" decoding="async">`;
    }

    // 마음 텍스트
    if(data.sleepAndMind?.gratitude) {
        result.mindText = `<div style="font-size:13px; color:#333; padding:10px 14px; font-style:italic; line-height:1.6;">💭 "${data.sleepAndMind.gratitude}"</div>`;
    }

    return result;
}

// [핵심] 리렌더링 분리로 속도 폭발 + 무한 스크롤 + DocumentFragment
async function renderFeedOnly() {
    const container = document.getElementById('gallery-container');
    container.innerHTML = '';
    const myId = auth.currentUser ? auth.currentUser.uid : "";
    const sentinel = document.getElementById('gallery-sentinel');

    let sortedLogs = [...cachedGalleryLogs];
    sortedLogs.sort((a, b) => {
        const aFr = cachedMyFriends.includes(a.data.userId); const bFr = cachedMyFriends.includes(b.data.userId);
        return (aFr === bFr) ? 0 : aFr ? -1 : 1;
    });

    let visibleCount = 0;
    let renderedCount = 0;
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < sortedLogs.length; i++) {
        const item = sortedLogs[i];
        const data = item.data;
        const isFriend = cachedMyFriends.includes(data.userId);
        
        // 헬퍼 함수 사용으로 중복 제거
        const media = collectGalleryMedia(data);
        const dietMediaHtml = media.dietHtml;
        const exerMediaHtml = media.exerciseHtml;
        const mindMediaHtml = media.mindHtml;
        const mindTextHtml = media.mindText;

        let contentHtml = ''; let shouldShow = false;

        if (galleryFilter === 'all') {
            const allMedia = dietMediaHtml + exerMediaHtml + mindMediaHtml;
            if(allMedia) contentHtml += `<div class="gallery-photos">${allMedia}</div>`;
            if(mindTextHtml) contentHtml += mindTextHtml;
            if(allMedia || mindTextHtml) shouldShow = true;
        } else if (galleryFilter === 'diet') {
            if(dietMediaHtml) { contentHtml += `<div class="gallery-photos">${dietMediaHtml}</div>`; shouldShow = true; }
        } else if (galleryFilter === 'exercise') {
            if(exerMediaHtml) { contentHtml += `<div class="gallery-photos">${exerMediaHtml}</div>`; shouldShow = true; }
        } else if (galleryFilter === 'mind') {
            if(mindMediaHtml) contentHtml += `<div class="gallery-photos">${mindMediaHtml}</div>`;
            if(mindTextHtml) contentHtml += mindTextHtml;
            if(mindMediaHtml || mindTextHtml) shouldShow = true;
        }

        if(!shouldShow) continue; 
        visibleCount++;
        
        // 무한 스크롤: 표시 개수 제한
        if (renderedCount >= galleryDisplayCount) {
            continue;
        }
        renderedCount++;

        const rx = data.reactions || { heart: [], fire: [], clap: [] };
        const cHeart = rx.heart ? rx.heart.length : 0;
        const cFire = rx.fire ? rx.fire.length : 0;
        const cClap = rx.clap ? rx.clap.length : 0;
        const aHeart = rx.heart?.includes(myId) ? 'active' : '';
        const aFire = rx.fire?.includes(myId) ? 'active' : '';
        const aClap = rx.clap?.includes(myId) ? 'active' : '';

        // 댓글 데이터
        const comments = data.comments || [];
        const commentCount = comments.length;

        // XSS 방지: 사용자 입력 이스케이프
        const safeName = escapeHtml(data.userName || '익명');
        const safeUserId = escapeHtml(data.userId || '');
        const safeDocId = escapeHtml(item.id || '');

        // 댓글 HTML (최대 2개만 초기 표시)
        let commentsHtml = '';
        const showComments = comments.slice(0, 2);
        showComments.forEach((c, idx) => {
            const cName = escapeHtml(c.userName || '익명');
            const cText = escapeHtml(c.text || '');
            const cTime = formatCommentTime(c.timestamp);
            const delBtn = c.userId === myId ? `<button class="comment-delete-btn" onclick="deleteComment('${safeDocId}', ${idx})" title="삭제">✕</button>` : '';
            commentsHtml += `<div class="comment-item"><span class="comment-author">${cName}</span><span class="comment-text">${cText}</span><span class="comment-time">${cTime}</span>${delBtn}</div>`;
        });
        if (comments.length > 2) {
            commentsHtml += `<button class="comment-toggle-btn" onclick="toggleComments('${safeDocId}')">댓글 ${comments.length}개 모두 보기</button>`;
        }

        // 아바타 이니셜 (첫 글자)
        const avatarInitial = (data.userName || '?').charAt(0);

        // 반응 총합 텍스트
        const totalReactions = cHeart + cFire + cClap;
        const reactionSummaryHtml = totalReactions > 0 ? `<div class="gallery-reaction-summary">좋아요 ${totalReactions}개</div>` : '';

        const card = document.createElement('div');
        card.className = 'gallery-card';
        card.innerHTML = `
            <div class="gallery-header">
                <div class="gallery-avatar">${avatarInitial}</div>
                <div class="gallery-header-info">
                    <span class="gallery-name">${isFriend ? '⭐ ' : ''}${safeName}</span>
                    <span class="gallery-date">${data.date.replace(/-/g, '. ')}</span>
                </div>
                ${data.userId !== myId ? `<button class="friend-btn ${isFriend ? 'is-friend' : ''}" onclick="toggleFriend('${safeUserId}')">${isFriend ? '✕' : '+ 친구'}</button>` : ''}
            </div>
            ${contentHtml}
            <div class="gallery-actions">
                <button class="action-btn ${aHeart}" onclick="toggleReaction('${safeDocId}', 'heart', this)">❤️${cHeart > 0 ? ` <span>${cHeart}</span>` : ''}</button>
                <button class="action-btn ${aFire}" onclick="toggleReaction('${safeDocId}', 'fire', this)">🔥${cFire > 0 ? ` <span>${cFire}</span>` : ''}</button>
                <button class="action-btn ${aClap}" onclick="toggleReaction('${safeDocId}', 'clap', this)">👏${cClap > 0 ? ` <span>${cClap}</span>` : ''}</button>
                <button class="action-btn comment-btn" onclick="document.getElementById('comment-input-${safeDocId}').focus()">💬${commentCount > 0 ? ` <span id="comment-count-${safeDocId}">${commentCount}</span>` : `<span id="comment-count-${safeDocId}"></span>`}</button>
            </div>
            ${reactionSummaryHtml}
            <div class="comment-section">
                <div class="comment-list" id="comment-list-${safeDocId}" data-expanded="false">
                    ${commentsHtml}
                </div>
                <div class="comment-input-wrap">
                    <input type="text" class="comment-input" id="comment-input-${safeDocId}" placeholder="댓글 달기..." maxlength="200" onkeydown="if(event.key==='Enter')addComment('${safeDocId}')">
                    <button class="comment-submit-btn" onclick="addComment('${safeDocId}')">게시</button>
                </div>
            </div>
        `;            fragment.appendChild(card);
    }

    // DocumentFragment로 한 번에 DOM 삽입 (리플로우 최소화)
    container.appendChild(fragment);

    // 무한 스크롤 센티널 표시 여부 결정
    if (renderedCount >= visibleCount || visibleCount === 0) {
        sentinel.style.display = 'none';
        if (galleryIntersectionObserver) {
            galleryIntersectionObserver.disconnect();
        }
    } else {
        sentinel.style.display = 'block';
        // 옵저버가 설정되지 않았으면 설정
        if (!galleryIntersectionObserver) {
            setupInfiniteScroll();
        }
    }

    if(visibleCount === 0) {
        container.innerHTML = '<p style="text-align:center; color:#888; padding:20px; background:#f9f9f9; border-radius:8px;">해당하는 기록이 없습니다.</p>';
    }
}

function initGalleryVideoThumbs() {
    const videos = document.querySelectorAll('.video-thumb-wrapper video');
    videos.forEach(video => {
        if (video.dataset.thumbReady === '1') return;
        video.dataset.thumbReady = '1';

        const setFrame = () => {
            try { video.currentTime = 0.1; } catch (_) {}
        };

        if (video.readyState >= 2) {
            setFrame();
        } else {
            video.addEventListener('loadeddata', setFrame, { once: true });
        }
    });
}

// 접근성: 키보드 네비게이션 지원
document.addEventListener('keydown', function(e) {
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
    pointBadge.addEventListener('keydown', function(e) {
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

    lightboxModal.addEventListener('click', function() {
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
    window.openLightbox = function(url) {
        originalOpenLightbox(url);
        setTimeout(() => lightboxModal.focus(), 100);
    };
}
