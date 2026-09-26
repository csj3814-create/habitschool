// UI 헬퍼 함수들
import { MISSIONS, getWeekId } from './firebase-config.js?v=454';
import { translateText, isEnglishLocale } from './i18n.js?v=454';

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
// 한글 범위: 가-힣, 자모
const HANGUL_RE = /[가-힣ㄱ-ㆎ]/;

export function showToast(message, { durationMs = 3500 } = {}) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    const translated = translateText(message);
    // 개발 안전망: 영어 모드에서 번역 후에도 한글이 남아 있으면 경고한다.
    if (isEnglishLocale() && HANGUL_RE.test(translated)) {
        console.warn('[i18n] Untranslated Korean in English toast:', translated);
    }
    toast.innerText = translated;
    toast.className = "show";
    if (_toastDismissTimer) { clearTimeout(_toastDismissTimer); _toastDismissTimer = null; }
    if (durationMs > 0) {
        _toastDismissTimer = setTimeout(() => {
            toast.className = toast.className.replace("show", "");
            _toastDismissTimer = null;
        }, durationMs);
    }
}

/**
 * 화면 갱신이 실패했을 때 쓰는 catch 핸들러.
 *
 * 2026-09-16 제보 "챌린지 완료 직후에는 정산 확인중 뜨고 앱을 나갔다 들어와야
 * 정산 가능하게 바뀌네" 의 원인이 이 자리였다. 서버 쓰기는 성공했는데 뒤이은
 * 화면 갱신이 조용히 실패해, 회원에게는 "안 된 것" 으로 보였다.
 *
 * 갱신 실패로 흐름을 멈출 이유는 없다 — 다음에 다시 그리면 된다. 다만 **조용히
 * 넘기면 안 된다.** 버그 제보에 콘솔이 함께 실려 오는데(js/bug-report.js 가
 * warn·error 를 수집한다), 아무것도 없으면 "서버는 됐는데 화면이 안 바뀐다" 는
 * 제보를 열어도 볼 것이 없다.
 *
 *     renderSocialChallenges(user).catch(onRefreshFailure('소셜 챌린지'));
 */
/**
 * 끝나지 않는 일에 시한을 건다.
 *
 * Firestore 쓰기는 **서버가 받았을 때** 약속이 풀린다. 연결이 끊긴 동안에는
 * 로컬에만 적어 두고 약속을 붙들고 있는다 — 거부가 아니라 침묵이라 catch 로는
 * 잡히지 않는다. 그 사이 화면은 버튼을 잠근 채 기다린다.
 */
export async function withAsyncTimeout(task, timeoutMs, errorMessage = '작업 시간이 초과되었어요.') {
    let timeoutId = null;
    try {
        return await Promise.race([
            Promise.resolve(task),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export function onRefreshFailure(what = '화면') {
    return (error) => {
        console.warn(`[화면 갱신] ${what} 실패:`, error?.message || error);
    };
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
