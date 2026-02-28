// UI 헬퍼 함수들
import { MISSIONS } from './firebase-config.js';

// 한국 표준시(KST) 날짜 및 정보 관련 헬퍼
export function getKstDateObj() {
    const now = new Date();
    // UTC→KST(+9시간)
    return new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 60 * 60 * 1000));
}

export function getKstDateString() {
    return getKstDateObj().toISOString().split('T')[0];
}

// 날짜 정보 가져오기 (한국 시간 기준)
export function getDatesInfo() {
    const kstDate = getKstDateObj();
    const todayStr = kstDate.toISOString().split('T')[0];
    const yesDate = new Date(kstDate.getTime() - (24 * 60 * 60 * 1000));
    const yesterdayStr = yesDate.toISOString().split('T')[0];
    const dayOfWeek = kstDate.getDay(); 
    const diffToMon = kstDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(kstDate.setDate(diffToMon));
    let weekStrs = [];
    let tempDate = new Date(monday);
    for(let i=0; i<7; i++) {
        weekStrs.push(new Date(tempDate).toISOString().split('T')[0]);
        tempDate.setDate(tempDate.getDate() + 1);
    }
    return { todayStr, yesterdayStr, weekStrs };
}

// 토스트 메시지 표시
export function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => { 
        toast.className = toast.className.replace("show", ""); 
    }, 3500);
}

// 라이트박스 열기
export function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-modal').style.display = 'flex';
}
