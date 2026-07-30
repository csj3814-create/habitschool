// 식사 시간대(창) 계산 — 순수 함수 단일 출처
//
// 클라이언트(js/diet-program.js)와 서버가 같은 규칙으로 창을 해석해야 안내 문구와
// 실제 알림 시각이 어긋나지 않는다. 알림 스케줄은 배포 없이 검증할 수 없으므로
// 판정 로직만 여기로 추출해 tests/diet-window-utils.test.js로 behavioral 검증한다.
// I/O 없는 순수 함수만 둔다.

const INTERMITTENT_FASTING_METHOD_ID = "intermittent_fasting";

// 앱이 창 설정 기능 이전부터 '항상' 이 값만 저장해 왔다. 따라서 이 값은 사용자의
// 선택이 아니라 '미설정'을 뜻하는 센티넬로 취급해야 한다. 그러지 않으면 기존
// 비단식 사용자의 알림이 11:30 → 12:00으로 밀린다(회귀).
const LEGACY_WINDOW_PRESET = "16_8_1200_2000";

// 기본 창은 기존 고정 cron 시각과 결과가 같도록 정한 값이다.
// 간헐적 단식 12:00·19:30 / 그 외 11:30·17:30.
const FASTING_DEFAULT_WINDOW = Object.freeze({ startMinutes: 12 * 60, endMinutes: 20 * 60 });
const GENERAL_DEFAULT_WINDOW = Object.freeze({ startMinutes: (11 * 60) + 30, endMinutes: 18 * 60 });

const MIN_WINDOW_MINUTES = 4 * 60;
const CLOSING_LEAD_MINUTES = 30;
const REMINDER_BUCKET_MINUTES = 30;

function parseHhmmSegment(segment = "") {
    const digits = String(segment || "").trim();
    if (!/^\d{3,4}$/.test(digits)) return null;
    const padded = digits.padStart(4, "0");
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2));
    if (hour > 23 || minute > 59) return null;
    return (hour * 60) + minute;
}

// 형식은 `win_HHMM_HHMM`(사용자 설정)과 레거시 `{단식h}_{식사h}_HHMM_HHMM`을 모두 받는다.
// 마지막 두 세그먼트만 신뢰한다. 잘못된 값에서도 throw하지 않고 null을 준다.
function parseEatingWindowPreset(preset = "") {
    const parts = String(preset || "").trim().split("_");
    if (parts.length < 2) return null;
    const startMinutes = parseHhmmSegment(parts[parts.length - 2]);
    const endMinutes = parseHhmmSegment(parts[parts.length - 1]);
    if (startMinutes === null || endMinutes === null) return null;
    if (endMinutes - startMinutes < MIN_WINDOW_MINUTES) return null;
    return { startMinutes, endMinutes };
}

function getDefaultEatingWindow(methodId = "") {
    return methodId === INTERMITTENT_FASTING_METHOD_ID
        ? FASTING_DEFAULT_WINDOW
        : GENERAL_DEFAULT_WINDOW;
}

function resolveDietEatingWindow(preference = {}) {
    const fallback = getDefaultEatingWindow(preference?.methodId);
    const raw = typeof preference?.fastingPreset === "string" ? preference.fastingPreset.trim() : "";
    const parsed = raw && raw !== LEGACY_WINDOW_PRESET ? parseEatingWindowPreset(raw) : null;
    const window = parsed || fallback;
    return {
        startMinutes: window.startMinutes,
        warningMinutes: Math.max(window.startMinutes, window.endMinutes - CLOSING_LEAD_MINUTES),
        endMinutes: window.endMinutes
    };
}

function formatDietWindowLabel(totalMinutes = 0) {
    const safe = Math.max(0, Math.min(24 * 60, Math.round(Number(totalMinutes) || 0)));
    return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

// 스케줄은 30분마다 돈다. 지연 실행(:01, :31)에도 맞도록 버킷으로 내림한다.
function toReminderBucketMinutes(totalMinutes = 0) {
    const safe = Math.max(0, Math.round(Number(totalMinutes) || 0));
    return Math.floor(safe / REMINDER_BUCKET_MINUTES) * REMINDER_BUCKET_MINUTES;
}

// 지금 이 사용자에게 보낼 알림 종류. 없으면 빈 문자열.
function resolveDietReminderKindAt(preference = {}, nowMinutes = 0) {
    const window = resolveDietEatingWindow(preference);
    const bucket = toReminderBucketMinutes(nowMinutes);
    if (bucket === toReminderBucketMinutes(window.startMinutes)) return "start";
    if (bucket === toReminderBucketMinutes(window.warningMinutes)) return "close";
    return "";
}

module.exports = {
    INTERMITTENT_FASTING_METHOD_ID,
    LEGACY_WINDOW_PRESET,
    MIN_WINDOW_MINUTES,
    REMINDER_BUCKET_MINUTES,
    parseEatingWindowPreset,
    getDefaultEatingWindow,
    resolveDietEatingWindow,
    formatDietWindowLabel,
    toReminderBucketMinutes,
    resolveDietReminderKindAt,
};
