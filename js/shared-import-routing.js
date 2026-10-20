/**
 * 다른 앱에서 공유한 사진을 "어디에 넣을지" 정하는 규칙. 화면은 app-core.js 가 그린다.
 *
 * 2026-10-20 대표: "AI 분석으로 어디(식단 어느 칸·운동·수면)에 들어가야 하는지 정확히
 * 알았으면 알아서 넣어 주면 좋겠어." 자동 넣기는 4월부터 있었지만 거의 걸리지 않았다.
 * 시트를 연 뒤 1.8초 안에 AI 답이 와야 했는데, 사진을 줄여 올리고 모델이 답하는 데
 * 그보다 오래 걸린다. 1.8초는 "회원이 고르려는 순간 화면이 휙 바뀌어 누르려던 손가락이
 * 엉뚱한 곳을 누르는 일" 을 막으려던 것이다. 그래서 시간 대신 그 일을 직접 본다 —
 * 회원이 시트를 만졌으면 자동으로 넣지 않는다.
 *
 * 자동으로 넣어도 칸을 채울 뿐이다. 기록은 회원이 저장을 눌러야 들어간다.
 * 그래도 이미 있는 기록을 바꿔 끼우지는 않는다(넣을 자리가 비어 있을 때만).
 * 설계: tasks/2026-10-20_공유_로그인화면_자동분류_설계.md
 */

export const SHARED_IMPORT_TARGETS = Object.freeze(['diet', 'exercise', 'sleep', 'body']);

// 수면·걸음 캡처는 둘 다 건강앱 화면이라 헷갈리기 쉬워 수면을 더 높게 둔다.
// 체성분은 칸만 채우고 동의·저장을 회원이 하므로 낮다(2026-09-23 부터의 값).
export const SHARED_IMPORT_AUTO_ROUTE_CONFIDENCE = Object.freeze({
    diet: 0.85,
    exercise: 0.85,
    sleep: 0.9,
    body: 0.5
});

// 이보다 늦게 온 답으로는 자동으로 넣지 않는다. 그동안 회원은 시트에서 고를 수 있다.
// 분류 함수의 모델 마감선이 14초다(functions/runtime.js AI_MODEL_FAST_TIMEOUT_MS).
export const SHARED_IMPORT_CLASSIFY_DEADLINE_MS = 15000;

/** 서버가 준 분류를 화면이 쓰는 모양으로. 모르는 것은 unknown. */
export function normalizeSharedImportClassification(raw = null) {
    if (!raw || typeof raw !== 'object') return null;
    const rawCategory = String(raw.category || '').trim();
    const category = SHARED_IMPORT_TARGETS.includes(rawCategory) ? rawCategory : 'unknown';
    const confidence = Math.max(0, Math.min(1, Number(raw.confidence || 0) || 0));
    return {
        category,
        confidence,
        reason: String(raw.reason || '').trim(),
        exerciseMode: String(raw.exerciseMode || '').trim() === 'step_screenshot' ? 'step_screenshot' : 'cardio_image'
    };
}

/**
 * AI 분류만 보고 바로 넣어도 되는가.
 *
 * targetAvailable: 넣을 자리가 비어 있는가(식단은 그 시간의 칸, 수면은 오늘 수면 사진).
 * 운동은 늘 새 칸이라 true. 모르면 false 로 넘겨 시트에서 고르게 한다.
 * @returns {{ auto: boolean, reason: string }}
 */
export function decideSharedImportAutoRoute({
    classification = null,
    fileCount = 0,
    manuallyPicked = false,
    userEngaged = false,
    elapsedMs = 0,
    targetAvailable = false
} = {}) {
    const category = classification?.category;
    if (!category || !SHARED_IMPORT_TARGETS.includes(category)) return { auto: false, reason: 'unknown' };
    if (manuallyPicked) return { auto: false, reason: 'picked' };
    if (userEngaged) return { auto: false, reason: 'engaged' };
    // 지금 분류는 첫 장만 본다. 나머지가 다른 종류일 수 있다.
    if (fileCount !== 1) return { auto: false, reason: 'multiple' };
    if (!(Number(elapsedMs) <= SHARED_IMPORT_CLASSIFY_DEADLINE_MS)) return { auto: false, reason: 'late' };
    if (!(Number(classification.confidence) >= SHARED_IMPORT_AUTO_ROUTE_CONFIDENCE[category])) return { auto: false, reason: 'low' };
    if (!targetAvailable) return { auto: false, reason: 'occupied' };
    return { auto: true, reason: 'confident' };
}
