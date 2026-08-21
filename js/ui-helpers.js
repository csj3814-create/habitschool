// UI 헬퍼 함수들
import { MISSIONS, getWeekId } from './firebase-config.js?v=328';
import { translateText } from './i18n.js?v=328';

// 한국 표준시(KST) 날짜 및 정보 관련 헬퍼
export function getKstDateString() {
    // toLocaleDateString('en-CA')는 YYYY-MM-DD 형식 반환
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

export function getKstDateObj() {
    // KST 날짜의 정오(UTC)를 기준으로 Date 객체 생성 (날짜 경계 문제 방지)
    return new Date(getKstDateString() + 'T12:00:00Z');
}

// 날짜 정보 가져오기 (한국 시간 기준)
export function getDatesInfo() {
    const todayStr = getKstDateString();
    const todayNoon = new Date(todayStr + 'T12:00:00Z');
    const yesNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesNoon.toISOString().split('T')[0];
    const dayOfWeek = todayNoon.getUTCDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const mondayNoon = new Date(todayNoon.getTime() + diffToMon * 24 * 60 * 60 * 1000);
    let weekStrs = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(mondayNoon.getTime() + i * 24 * 60 * 60 * 1000);
        weekStrs.push(d.toISOString().split('T')[0]);
    }
    return { todayStr, yesterdayStr, weekStrs };
}

// 토스트 메시지 표시
let _toastDismissTimer = null;
// durationMs를 0(또는 음수)으로 주면 자동으로 사라지지 않는 '지속 토스트'가 된다.
// 온체인 보상 수령처럼 오래 걸리는 작업 중 안내를 계속 보여줄 때 사용하고,
// 완료 시 다시 showToast(결과)를 호출하면 자연스럽게 교체된다.
export function showToast(message, { durationMs = 3500 } = {}) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.innerText = translateText(message);
    toast.className = "show";
    if (_toastDismissTimer) { clearTimeout(_toastDismissTimer); _toastDismissTimer = null; }
    if (durationMs > 0) {
        _toastDismissTimer = setTimeout(() => {
            toast.className = toast.className.replace("show", "");
            _toastDismissTimer = null;
        }, durationMs);
    }
}

export function hideToast() {
    if (_toastDismissTimer) { clearTimeout(_toastDismissTimer); _toastDismissTimer = null; }
    const toast = document.getElementById("toast");
    if (toast) toast.className = toast.className.replace("show", "");
}

// 라이트박스 열기
export function openLightbox(url) {
    document.getElementById('lightbox-img').src = url;
    document.getElementById('lightbox-modal').style.display = 'flex';
}
