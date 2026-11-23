// 포인트가 쌓인 회원에게 "HBT 로 바꿔 예치 챌린지에 걸어 보세요" 를 한 줄로 알린다(2026-11-23 대표).
//
// 왜: 포인트는 기프티콘으로 바뀌어야 비용이 되는데, HBT 는 시세가 없는 앱 안 챌린지용이라
// HBT 로 넘어간 포인트는 기프티콘 몫에서 빠진다(D-2). 전환 기능은 자산 탭 깊숙이 있어
// 지금까지 쓴 회원이 11명뿐이었다.
//
// **플레이 앱(/app)·안드로이드 앱에서는 절대 보이지 않는다.** 개인 개발자 계정으로는 플레이에
// 암호화폐 지갑을 넣을 수 없어 그 경로는 HBT·지갑·전환을 모두 감춘다(js/app-mode.js). 이 안내도
// 같은 규칙을 따르고, 플레이 앱에서 "웹에서 바꾸세요" 처럼 바깥으로 보내는 말도 하지 않는다.

export const HBT_CONVERT_NUDGE_MIN_POINTS = 1000;
export const HBT_CONVERT_NUDGE_SNOOZE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getHbtConvertNudgeStorageKey(uid = '') {
    return `hbtConvertNudgeDismissedAt_${uid}`;
}

/**
 * 안내를 띄울지. 화면·저장소를 읽지 않는 순수 함수다 — 판단만 시험할 수 있게.
 */
export function shouldShowHbtConvertNudge({
    coins,
    isPlay = false,
    isNativeApp = false,
    isSimple = false,
    isPartnerCover = false,
    dismissedAtMs = null,
    nowMs = Date.now()
} = {}) {
    if (isPlay || isNativeApp || isSimple || isPartnerCover) return false;
    const points = Number(coins);
    if (!Number.isFinite(points) || points < HBT_CONVERT_NUDGE_MIN_POINTS) return false;
    const dismissed = Number(dismissedAtMs);
    if (Number.isFinite(dismissed) && dismissed > 0 && nowMs - dismissed < HBT_CONVERT_NUDGE_SNOOZE_DAYS * DAY_MS) {
        return false;
    }
    return true;
}

export function readHbtConvertNudgeDismissedAt(uid = '') {
    if (!uid) return null;
    try {
        const raw = localStorage.getItem(getHbtConvertNudgeStorageKey(uid));
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : null;
    } catch (_) {
        return null;
    }
}

export function writeHbtConvertNudgeDismissedAt(uid = '', nowMs = Date.now()) {
    if (!uid) return;
    try { localStorage.setItem(getHbtConvertNudgeStorageKey(uid), String(nowMs)); } catch (_) { }
}
