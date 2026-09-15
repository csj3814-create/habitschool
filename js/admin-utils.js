function toMillis(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") {
        return (value.seconds * 1000) + Math.floor((value.nanoseconds || 0) / 1e6);
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
}

export function filterAdminRowsByName(rows = [], searchTerm = "") {
    const normalizedTerm = String(searchTerm || "").trim().toLocaleLowerCase("ko-KR");
    if (!normalizedTerm) return [...rows];

    return rows.filter((row) =>
        String(row?.name || "").toLocaleLowerCase("ko-KR").includes(normalizedTerm)
    );
}

export const filterAdminAssetRows = filterAdminRowsByName;

export function filterAdminMemberRows(rows = [], searchTerm = "") {
    const normalizedTerm = String(searchTerm || "").trim().toLocaleLowerCase("ko-KR");
    if (!normalizedTerm) return [...rows];

    return rows.filter((row) => {
        const name = String(row?.name || "").toLocaleLowerCase("ko-KR");
        const email = String(row?.email || "").toLocaleLowerCase("ko-KR");
        // uid 로도 찾는다. 오류 제보에는 이름이 아니라 uid 가 실려 오는데, 그걸로
        // 회원을 찾을 수 없어 제보와 회원을 손으로 이어야 했다.
        const uid = String(row?.uid || "").toLocaleLowerCase("ko-KR");
        return name.includes(normalizedTerm) || email.includes(normalizedTerm) || uid.includes(normalizedTerm);
    });
}

function normalizeMediaUrl(value) {
    return typeof value === "string" ? value.trim() : "";
}

function addAdminMedia(items, seenUrls, { kind = "image", label, url, thumbUrl = "" }) {
    const normalizedUrl = normalizeMediaUrl(url);
    if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
    seenUrls.add(normalizedUrl);
    items.push({
        kind: kind === "video" ? "video" : "image",
        label: String(label || "기록 미디어"),
        url: normalizedUrl,
        thumbUrl: normalizeMediaUrl(thumbUrl),
    });
}

export function collectAdminDailyLogMedia(log = {}) {
    const items = [];
    const seenUrls = new Set();
    const diet = isRecord(log?.diet) ? log.diet : {};
    const exercise = isRecord(log?.exercise) ? log.exercise : {};
    const sleepAndMind = isRecord(log?.sleepAndMind) ? log.sleepAndMind : {};
    const steps = isRecord(log?.steps) ? log.steps : {};
    const mealLabels = {
        breakfast: "아침 식단",
        lunch: "점심 식단",
        dinner: "저녁 식단",
        snack: "간식",
    };

    Object.entries(mealLabels).forEach(([meal, label]) => {
        addAdminMedia(items, seenUrls, {
            kind: "image",
            label,
            url: diet[`${meal}Url`],
            thumbUrl: diet[`${meal}ThumbUrl`],
        });
    });

    const cardioList = Array.isArray(exercise.cardioList) ? exercise.cardioList : [];
    cardioList.forEach((item, index) => addAdminMedia(items, seenUrls, {
        kind: "image",
        label: `유산소 ${index + 1}`,
        url: item?.imageUrl,
        thumbUrl: item?.imageThumbUrl,
    }));
    addAdminMedia(items, seenUrls, {
        kind: "image",
        label: "유산소",
        url: exercise.cardioImageUrl,
        thumbUrl: exercise.cardioImageThumbUrl,
    });

    const strengthList = Array.isArray(exercise.strengthList) ? exercise.strengthList : [];
    strengthList.forEach((item, index) => addAdminMedia(items, seenUrls, {
        kind: "video",
        label: `근력 운동 ${index + 1}`,
        url: item?.videoUrl,
        thumbUrl: item?.videoThumbUrl,
    }));
    addAdminMedia(items, seenUrls, {
        kind: "video",
        label: "근력 운동",
        url: exercise.strengthVideoUrl,
        thumbUrl: exercise.strengthVideoThumbUrl,
    });

    addAdminMedia(items, seenUrls, {
        kind: "image",
        label: "걸음수 캡처",
        url: steps.screenshotUrl,
        thumbUrl: steps.screenshotThumbUrl,
    });
    addAdminMedia(items, seenUrls, {
        kind: "image",
        label: "수면·마음 기록",
        url: sleepAndMind.sleepImageUrl,
        thumbUrl: sleepAndMind.sleepImageThumbUrl,
    });

    return items.slice(0, 24);
}

function boundedAnalysisText(value, maxLength = 1200) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    return String(value).trim().slice(0, maxLength);
}

function addAnalysisField(fields, label, value, suffix = "") {
    const normalized = boundedAnalysisText(value);
    if (!normalized) return;
    fields.push({ label, value: `${normalized}${suffix}` });
}

function buildDietAnalysisFields(analysis) {
    if (!isRecord(analysis)) return [];
    const fields = [];
    addAnalysisField(fields, "등급", analysis.grade, "등급");
    addAnalysisField(fields, "요약", analysis.summary);
    if (analysis.naturalRatio !== null && analysis.naturalRatio !== undefined) {
        addAnalysisField(fields, "자연식품 비율", analysis.naturalRatio, "%");
    }
    const foods = Array.isArray(analysis.foods)
        ? analysis.foods
            .slice(0, 20)
            .map((food) => boundedAnalysisText(food?.name, 80))
            .filter(Boolean)
        : [];
    if (foods.length) addAnalysisField(fields, "인식한 음식", foods.join(", "));
    const scores = isRecord(analysis.scores) ? analysis.scores : {};
    const scoreLabels = {
        vitamins: "비타민",
        minerals: "무기질",
        fiber: "식이섬유",
        antioxidants: "항산화",
    };
    const scoreText = Object.entries(scoreLabels)
        .map(([key, label]) => boundedAnalysisText(scores[key]) ? `${label} ${boundedAnalysisText(scores[key])}` : "")
        .filter(Boolean)
        .join(" · ");
    if (scoreText) addAnalysisField(fields, "미량영양소", scoreText);
    addAnalysisField(fields, "대사 영향", analysis.insulinComment);
    addAnalysisField(fields, "제안", analysis.suggestion);
    return fields;
}

function buildExerciseAnalysisFields(analysis) {
    if (!isRecord(analysis)) return [];
    const fields = [];
    // 운동이 아니라고 판정된 것도 관제탑에서는 보여준다 — 왜 점수에 안 잡히는지
    // 물어오는 제보가 여기서 풀린다.
    if (analysis.isExercise === false) {
        addAnalysisField(fields, "판정", "운동으로 보이지 않음");
    }
    addAnalysisField(fields, "적은 운동 시간", analysis.enteredDurationMinutes, "분");
    addAnalysisField(fields, "강도", analysis.intensity);
    addAnalysisField(fields, "운동 종류", analysis.exerciseType);
    addAnalysisField(fields, "반복 횟수", analysis.repCount, "회");
    addAnalysisField(fields, "시간 분석", analysis.timeAnalysis);
    // 2026-09-14 에 '하루 30분' 자를 없애고 '주 150분 대비 적립 분'으로 바꿨다.
    // 관제탑만 옛 필드를 읽고 있어 새 기록에서는 아무것도 안 보였다.
    addAnalysisField(fields, "적립 분(강도 환산)", analysis.weightedMinutes, "분");
    addAnalysisField(fields, "피드백", analysis.feedback);
    addAnalysisField(fields, "자세 팁", analysis.formTip);
    return fields;
}

function buildSleepAnalysisFields(analysis) {
    if (!isRecord(analysis)) return [];
    const fields = [];
    addAnalysisField(fields, "등급", analysis.grade, "등급");
    addAnalysisField(fields, "요약", analysis.summary);
    const details = isRecord(analysis.details) ? analysis.details : {};
    addAnalysisField(fields, "수면 시간", details.sleepDuration);
    addAnalysisField(fields, "수면 질", details.sleepQuality);
    addAnalysisField(fields, "감정 톤", details.emotionTone);
    addAnalysisField(fields, "스트레스", details.stressLevel);
    addAnalysisField(fields, "피드백", analysis.feedback);
    addAnalysisField(fields, "팁", analysis.tip);
    return fields;
}

function addAdminAnalysis(items, { kind, label, analysis, buildFields }) {
    const fields = buildFields(analysis);
    if (!fields.length) return false;
    items.push({ kind, label, fields });
    return true;
}

export function collectAdminDailyLogAnalyses(log = {}) {
    const items = [];
    const diet = isRecord(log?.diet) ? log.diet : {};
    const dietAnalysis = isRecord(log?.dietAnalysis) ? log.dietAnalysis : {};
    const exercise = isRecord(log?.exercise) ? log.exercise : {};
    const sleepAndMind = isRecord(log?.sleepAndMind) ? log.sleepAndMind : {};
    const steps = isRecord(log?.steps) ? log.steps : {};
    const mealLabels = {
        breakfast: "아침 식단",
        lunch: "점심 식단",
        dinner: "저녁 식단",
        snack: "간식",
    };

    let hasCurrentDietAnalysis = false;
    Object.entries(mealLabels).forEach(([meal, label]) => {
        hasCurrentDietAnalysis = addAdminAnalysis(items, {
            kind: "diet",
            label,
            analysis: dietAnalysis[meal],
            buildFields: buildDietAnalysisFields,
        }) || hasCurrentDietAnalysis;
    });
    if (!hasCurrentDietAnalysis) {
        addAdminAnalysis(items, {
            kind: "diet",
            label: "식단",
            analysis: diet.analysis,
            buildFields: buildDietAnalysisFields,
        });
    }

    let hasCurrentExerciseAnalysis = false;
    [
        ["유산소", Array.isArray(exercise.cardioList) ? exercise.cardioList : []],
        ["근력 운동", Array.isArray(exercise.strengthList) ? exercise.strengthList : []],
    ].forEach(([label, list]) => {
        list.forEach((item, index) => {
            // 사용자가 적은 운동 시간은 분석이 아니라 기록 자체에 붙어 있다.
            // 주간 활동분의 실제 입력이 이 값이라, 분석이 없어도 보여야 한다.
            const enteredMinutes = Number(item?.durationMinutes);
            const analysis = item?.aiAnalysis || item?.analysis;
            const merged = Number.isFinite(enteredMinutes) && enteredMinutes > 0
                ? { ...(isRecord(analysis) ? analysis : {}), enteredDurationMinutes: Math.round(enteredMinutes) }
                : analysis;
            hasCurrentExerciseAnalysis = addAdminAnalysis(items, {
                kind: "exercise",
                label: `${label} ${index + 1}`,
                analysis: merged,
                buildFields: buildExerciseAnalysisFields,
            }) || hasCurrentExerciseAnalysis;
        });
    });
    if (!hasCurrentExerciseAnalysis) {
        addAdminAnalysis(items, {
            kind: "exercise",
            label: "운동",
            analysis: exercise.aiAnalysis || exercise.analysis,
            buildFields: buildExerciseAnalysisFields,
        });
    }

    addAdminAnalysis(items, {
        kind: "sleep",
        label: "수면·마음",
        analysis: sleepAndMind.sleepAnalysis || sleepAndMind.analysis,
        buildFields: buildSleepAnalysisFields,
    });

    if (normalizeMediaUrl(steps.screenshotUrl)) {
        const stepFields = [];
        addAnalysisField(stepFields, "걸음수", steps.count, "보");
        addAnalysisField(stepFields, "거리", steps.distance_km, "km");
        addAnalysisField(stepFields, "칼로리", steps.calories, "kcal");
        addAnalysisField(stepFields, "활동 시간", steps.active_minutes, "분");
        if (stepFields.length) items.push({
            kind: "steps",
            label: "걸음수 캡처 인식",
            fields: stepFields,
        });
    }

    return items.slice(0, 24);
}

export function getAdminPaginationState(totalRows, pageSize, requestedPageIndex = 0) {
    const safeTotalRows = Math.max(0, Number(totalRows) || 0);
    const safePageSize = Math.max(1, Number(pageSize) || 1);
    const totalPages = Math.max(1, Math.ceil(safeTotalRows / safePageSize));
    const numericPageIndex = Number(requestedPageIndex);
    const requested = Number.isFinite(numericPageIndex) ? Math.trunc(numericPageIndex) : 0;
    const pageIndex = Math.min(Math.max(0, requested), totalPages - 1);

    return {
        totalRows: safeTotalRows,
        totalPages,
        pageIndex,
        start: pageIndex * safePageSize,
        pageSize: safePageSize,
    };
}

function normalizeEmailEntry(rawEntry, fallbackDays = null, fallbackEmail = "") {
    if (!isRecord(rawEntry) || Object.keys(rawEntry).length === 0) return null;

    const resolvedDays = Number(rawEntry.days ?? fallbackDays);
    if (![3, 7].includes(resolvedDays)) return null;

    const sentAt = rawEntry.sentAt || rawEntry.lastSentAt || null;
    if (!sentAt && !rawEntry.subject && !rawEntry.html && !rawEntry.summary) return null;

    return {
        days: resolvedDays,
        sentAt,
        recipientEmail: String(rawEntry.recipientEmail || rawEntry.email || fallbackEmail || "").trim(),
        method: String(rawEntry.method || rawEntry.deliveryMethod || "gmail_nodemailer").trim() || "gmail_nodemailer",
        subject: String(rawEntry.subject || "").trim(),
        html: String(rawEntry.html || "").trim(),
        summary: String(rawEntry.summary || "").trim(),
        legacy: rawEntry.legacy === true,
    };
}

function buildLegacyEntry(rawLog = {}, days = null, fallbackEmail = "") {
    const resolvedDays = Number(days ?? rawLog.lastSentDays);
    const loggedDays = Number(rawLog.lastSentDays);
    if (![3, 7].includes(resolvedDays) || !rawLog.lastSentAt) return null;
    if ([3, 7].includes(loggedDays) && loggedDays !== resolvedDays) return null;

    return {
        days: resolvedDays,
        sentAt: rawLog.lastSentAt,
        recipientEmail: String(rawLog.lastSentRecipient || fallbackEmail || "").trim(),
        method: String(rawLog.lastSentMethod || "gmail_nodemailer").trim() || "gmail_nodemailer",
        subject: String(rawLog.lastSentSubject || `${resolvedDays}일 미활동 이메일`).trim(),
        html: String(rawLog.lastSentHtml || "").trim(),
        summary: String(
            rawLog.lastSentSummary ||
            "이전 로그에는 본문이 저장되지 않았습니다. 이번 배포 이후 발송분부터 상세 본문이 기록됩니다."
        ).trim(),
        legacy: true,
    };
}

function sortEmailEntries(entries = []) {
    return [...entries].sort((a, b) => {
        const diff = toMillis(b?.sentAt) - toMillis(a?.sentAt);
        if (diff !== 0) return diff;
        return Number(b?.days || 0) - Number(a?.days || 0);
    });
}

function pickLatestEntry(entries = [], days, rawLog = {}, fallbackEmail = "") {
    const normalizedEntries = sortEmailEntries(
        entries
            .map((entry) => normalizeEmailEntry(entry, days, fallbackEmail))
            .filter(Boolean)
    );
    return normalizedEntries[0] || buildLegacyEntry(rawLog, days, fallbackEmail);
}

export function getReEngagementMethodLabel(method = "") {
    const normalized = String(method || "").trim().toLowerCase();
    if (normalized === "gmail_nodemailer") return "Gmail SMTP (Nodemailer)";
    if (normalized === "gmail") return "Gmail";
    return normalized || "-";
}

export function formatAdminDateTime(value) {
    const time = toMillis(value);
    if (!time) return "-";
    return new Date(time).toLocaleString("ko-KR", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

export function normalizeAdminEmailLog(rawLog = {}, { email = "" } = {}) {
    const fallbackEmail = String(email || "").trim();
    const historySource = Array.isArray(rawLog.reEngagementHistory)
        ? rawLog.reEngagementHistory
        : Array.isArray(rawLog.history)
            ? rawLog.history
            : [];
    const history = historySource
            .map((entry) => normalizeEmailEntry(entry, null, fallbackEmail))
            .filter(Boolean);
    const byDaysMap = isRecord(rawLog.reEngagementByDays)
        ? rawLog.reEngagementByDays
        : isRecord(rawLog.byDays)
            ? rawLog.byDays
            : {};

    const day3 = pickLatestEntry(
        [byDaysMap.day3, ...history.filter((entry) => Number(entry.days) === 3)],
        3,
        rawLog,
        fallbackEmail
    );
    const day7 = pickLatestEntry(
        [byDaysMap.day7, ...history.filter((entry) => Number(entry.days) === 7)],
        7,
        rawLog,
        fallbackEmail
    );

    const mergedHistory = sortEmailEntries([
        ...history,
        ...[day3, day7].filter((entry) => entry && !history.some((historyEntry) =>
            Number(historyEntry.days) === Number(entry.days) &&
            toMillis(historyEntry.sentAt) === toMillis(entry.sentAt) &&
            String(historyEntry.subject || "") === String(entry.subject || "")
        )),
    ]).slice(0, 10);

    const lastSentEntry = mergedHistory[0] || null;

    return {
        sentCount: Number(rawLog.sentCount) || mergedHistory.length,
        lastSentAt: rawLog.lastSentAt || lastSentEntry?.sentAt || null,
        lastSentDays: Number(rawLog.lastSentDays) || lastSentEntry?.days || null,
        byDays: {
            day3,
            day7,
        },
        history: mergedHistory,
    };
}

export default {
    collectAdminDailyLogAnalyses,
    collectAdminDailyLogMedia,
    filterAdminAssetRows,
    filterAdminMemberRows,
    filterAdminRowsByName,
    formatAdminDateTime,
    getAdminPaginationState,
    getReEngagementMethodLabel,
    normalizeAdminEmailLog,
};

// ── 하루 등급 (식단 · 운동 · 수면) ──────────────────────────────
//
// 관제탑에서 회원을 열면 30일치 카드가 쭉 나오는데, 잘하고 있는지 알려면 카드마다
// 'AI 분석 결과' 아코디언을 하나씩 펼쳐야 했다. 하루에 넷씩, 30일이면 백 번이다.
// 카드 머리에 A~F 한 글자씩 붙여 훑어서 읽히게 한다.
//
// 자를 새로 만들지 않는다. 식단·수면은 AI 가 이미 A~F 를 준다. 운동만 등급이
// 없어서, 건강습관 점수(LE8)가 쓰는 주 150분 문턱을 하루치로 나눠 쓴다 —
// 같은 자를 다른 창으로 보는 것이지 새 기준이 아니다.

const GRADE_LETTERS = ["A", "B", "C", "D", "F"];
const GRADE_POINTS = { A: 5, B: 4, C: 3, D: 2, F: 1 };

// js/le8-score.js 의 신체활동 문턱(주 150/120/90/60/30분)을 7로 나눈 값.
// 그 파일은 브라우저 ESM 이고 여기는 관제탑이 쓰는 순수 모듈이라 값을 옮겨 적는다.
// 어긋나면 화면 두 곳이 다른 말을 하므로 테스트가 둘을 묶어 둔다.
const WEEKLY_ACTIVITY_TARGET_MINUTES = 150;
const DAILY_ACTIVITY_GRADE_THRESHOLDS = [
    ["A", 150 / 7],
    ["B", 120 / 7],
    ["C", 90 / 7],
    ["D", 30 / 7],
];

function normalizeGradeLetter(value) {
    const letter = String(value || "").trim().toUpperCase();
    return GRADE_LETTERS.includes(letter) ? letter : null;
}

function averageGrade(letters) {
    const points = letters.map((l) => GRADE_POINTS[l]).filter(Boolean);
    if (!points.length) return null;
    const mean = points.reduce((sum, p) => sum + p, 0) / points.length;
    // 반올림하면 B 와 C 사이가 B 로 올라간다. 내림이 회원에게 더 정직하다.
    const rounded = Math.max(1, Math.min(5, Math.floor(mean + 0.5)));
    return GRADE_LETTERS[5 - rounded];
}

/** 그날 식단 등급. 여러 끼니면 평균을 한 글자로 접는다. */
export function resolveDietDayGrade(log = {}) {
    const analysis = isRecord(log?.dietAnalysis) ? log.dietAnalysis : {};
    const letters = ["breakfast", "lunch", "dinner", "snack"]
        .map((meal) => normalizeGradeLetter(analysis?.[meal]?.grade))
        .filter(Boolean);
    if (!letters.length) return null;
    return { grade: averageGrade(letters), detail: `${letters.length}끼 · ${letters.join(" ")}` };
}

/** 그날 수면 등급. AI 가 준 값을 그대로 쓴다. */
export function resolveSleepDayGrade(log = {}) {
    const sleep = isRecord(log?.sleepAndMind) ? log.sleepAndMind : {};
    const grade = normalizeGradeLetter(sleep?.sleepAnalysis?.grade);
    if (!grade) return null;
    const hours = Number(sleep?.sleepHours);
    return {
        grade,
        detail: Number.isFinite(hours) && hours > 0 ? `${hours}시간` : "수면 분석",
    };
}

/**
 * 그날 운동 등급.
 *
 * 활동분을 7배 해 '이 페이스를 일주일 유지하면' 으로 환산하고, 건강습관 점수가
 * 쓰는 주 150분 문턱에 맞춘다. 하루 21분이 곧 주 150분이다.
 *
 * 활동분 계산은 js/le8-score.js 의 resolveDailyActivityMinutes 와 같아야 한다.
 * 관제탑은 그 모듈을 싣지 않으므로 최소한만 옮겨 적는다.
 */
export function resolveExerciseDayGrade(log = {}, { dailyMinutes = null } = {}) {
    const minutes = Number.isFinite(dailyMinutes) ? dailyMinutes : estimateDailyActivityMinutes(log);
    if (minutes === null) return null;

    const rounded = Math.round(minutes);
    const found = DAILY_ACTIVITY_GRADE_THRESHOLDS.find(([, floor]) => minutes >= floor);
    return {
        grade: found ? found[0] : "F",
        detail: `${rounded}분 · 주 ${Math.round(minutes * 7)}분 페이스`,
    };
}

const EXERCISE_INTENSITY_MINUTE_WEIGHTS = { "저강도": 0.5, "중강도": 1, "고강도": 2, "초고강도": 3 };
const STEP_OVERLAPPING_EXERCISE_KEYWORDS = [
    "걷기", "걷", "산책", "달리기", "달리", "조깅", "러닝", "등산", "트레킹",
    "마라톤", "러닝머신", "트레드밀", "워킹", "하이킹", "계단",
];
const MAX_MEDIA_MINUTES_PER_DAY = 120;
const DEFAULT_MEDIA_MINUTES_PER_UNIT = 30;

function itemMinutes(item) {
    const entered = Number(item?.durationMinutes);
    if (Number.isFinite(entered) && entered > 0) {
        const weight = EXERCISE_INTENSITY_MINUTE_WEIGHTS[item?.aiAnalysis?.intensity] || 1;
        return Math.min(MAX_MEDIA_MINUTES_PER_DAY, entered * weight);
    }
    const weighted = Number(item?.aiAnalysis?.weightedMinutes);
    if (Number.isFinite(weighted) && weighted > 0) return Math.min(MAX_MEDIA_MINUTES_PER_DAY, weighted);
    return DEFAULT_MEDIA_MINUTES_PER_UNIT;
}

function isStepOverlapping(item) {
    const type = String(item?.aiAnalysis?.exerciseType || "").trim();
    if (!type) return true;
    return STEP_OVERLAPPING_EXERCISE_KEYWORDS.some((keyword) => type.includes(keyword));
}

/** 기록이 하나도 없으면 null — '안 했다'가 아니라 '모른다'이다. */
function estimateDailyActivityMinutes(log = {}) {
    const steps = isRecord(log?.steps) ? log.steps : {};
    const exercise = isRecord(log?.exercise) ? log.exercise : {};
    const cardio = Array.isArray(exercise.cardioList) ? exercise.cardioList : [];
    const strength = Array.isArray(exercise.strengthList) ? exercise.strengthList : [];

    const active = Number(steps.active_minutes);
    const count = Number(steps.count);
    const hasSteps = Number.isFinite(active) || Number.isFinite(count);
    if (!hasSteps && !cardio.length && !strength.length) return null;

    let stepMinutes = 0;
    if (Number.isFinite(active)) stepMinutes = active;
    else if (Number.isFinite(count)) stepMinutes = Math.min(120, Math.max(0, (count - 4000) / 100));

    let overlapping = 0;
    let separate = 0;
    cardio.forEach((item) => {
        const minutes = itemMinutes(item);
        if (isStepOverlapping(item)) overlapping += minutes; else separate += minutes;
    });
    strength.forEach((item) => {
        const minutes = itemMinutes(item);
        const knownType = String(item?.aiAnalysis?.exerciseType || "").trim();
        if (knownType && isStepOverlapping(item)) overlapping += minutes; else separate += minutes;
    });

    overlapping = Math.min(MAX_MEDIA_MINUTES_PER_DAY, overlapping);
    separate = Math.min(MAX_MEDIA_MINUTES_PER_DAY, separate);
    return Math.max(stepMinutes, overlapping) + separate;
}

/** 카드 머리에 붙일 세 등급. 기록이 없는 항목은 자리를 비운다. */
export function resolveDailyGrades(log = {}) {
    return {
        diet: resolveDietDayGrade(log),
        exercise: resolveExerciseDayGrade(log),
        sleep: resolveSleepDayGrade(log),
    };
}

export const ADMIN_DAILY_GRADE_TARGET_MINUTES = WEEKLY_ACTIVITY_TARGET_MINUTES;

// ── 다이렉트 처방 초안 ──────────────────────────────────────────
//
// 버튼 넷이 누구에게나 같은 말을 했다. 혈당을 한 번도 안 잰 회원에게도
// "혈당 조절에 한 걸음 더 가까워지고 있어요" 가 갔다. 받는 사람은 이게 나를 보고
// 쓴 말이 아니라는 것을 안다.
//
// 그래서 회원의 실제 숫자에서 문장을 만든다. 규칙은 하나다 —
// **근거가 되는 숫자가 없으면 그 초안은 아예 만들지 않는다.** 빈 자리를 일반론으로
// 채우면 예전 버튼으로 돌아간다.
//
// 초안마다 evidence 를 함께 준다. 보내기 전에 관리자가 눈으로 확인할 자리다.
//
// 메시지는 두 겹이다. summary 는 대시보드 카드의 머리 한 줄(40자 안팎)이고,
// message 는 그 아래 두 줄로 접히는 본문이다. 회원 화면은 좁고, 카드가 길면
// 대시보드를 통째로 밀어낸다. 할 말을 다 쓰는 것보다 읽히는 것이 먼저다.

const PRESCRIPTION_ALERT_THRESHOLDS = { glucose: 126, bpSystolic: 140, bpDiastolic: 90 };

// 조사를 붙인다. 이게 틀리면 "걸음수이 85점에서 95점로 올랐습니다" 가 되고,
// 받는 사람은 한 줄 만에 사람이 쓴 글이 아니라는 것을 안다. 정성 들인 메시지가
// 목적인 기능에서는 이 한 글자가 문장 전체를 무너뜨린다.
//
// 규칙: 받침이 없으면 가/는/로, 있으면 이/은/으로. 단 ㄹ 받침은 '로' 를 쓴다.
// 숫자와 단위는 읽는 소리로 판단한다 — kg 는 '킬로그램', 3 은 '삼' 이라 받침이 있다.
const JOSA_TAIL_HAS_BATCHIM = {
    "kg": true, "mg": true, "mg/dL": false, "mmHg": false, "%": false, "kcal": false,
    "0": false, "1": true, "2": false, "3": true, "4": false,
    "5": false, "6": true, "7": true, "8": true, "9": false,
};

function lastSoundHasBatchim(text) {
    const value = String(text ?? "").trim();
    if (!value) return null;

    // 단위가 붙어 있으면 그 단위의 소리로 판단한다.
    for (const unit of ["mg/dL", "mmHg", "kcal", "kg", "mg", "%"]) {
        if (value.endsWith(unit)) return JOSA_TAIL_HAS_BATCHIM[unit];
    }

    const last = value[value.length - 1];
    const code = last.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
        const jongseong = (code - 0xAC00) % 28;
        if (jongseong === 0) return false;
        // ㄹ 받침은 '로' 를 쓴다. '레벨로', '1일로'.
        if (jongseong === 8) return "rieul";
        return true;
    }
    if (last >= "0" && last <= "9") return JOSA_TAIL_HAS_BATCHIM[last];
    return null;
}

/** 조사를 붙인 문자열. 판단할 수 없으면 받침 있는 쪽으로 붙인다. */
export function withJosa(text, kind) {
    const value = String(text ?? "");
    const batchim = lastSoundHasBatchim(value);
    const pairs = {
        이가: ["가", "이", "이"],
        은는: ["는", "은", "은"],
        으로: ["로", "으로", "로"],
        을를: ["를", "을", "을"],
    };
    const [none, has, rieul] = pairs[kind] || pairs.이가;
    if (batchim === "rieul") return value + rieul;
    if (batchim === false) return value + none;
    return value + has;
}
const PRESCRIPTION_STREAK_MILESTONES = [365, 300, 200, 150, 100, 50, 30, 14, 7];

function toNumber(value) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatMetricValue(value, metric = {}) {
    const number = toNumber(value);
    if (number === null) return null;
    const decimals = Number.isFinite(metric.decimals) ? metric.decimals : 1;
    const text = decimals === 0 ? Math.round(number).toLocaleString() : number.toFixed(decimals);
    return metric.unit ? `${text}${metric.unit}` : text;
}

function findMetric(metrics, key) {
    return (Array.isArray(metrics) ? metrics : []).find((metric) => metric && metric.key === key) || null;
}

/** 최근 N일 로그. 날짜 내림차순으로 잘라 준다. */
function recentLogs(logs, days, todayStr) {
    const list = (Array.isArray(logs) ? logs : []).filter((log) => /^\d{4}-\d{2}-\d{2}$/.test(String(log?.date || "")));
    const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!todayStr || !days) return sorted;
    const floor = new Date(`${todayStr}T12:00:00Z`).getTime() - (days - 1) * 86400000;
    return sorted.filter((log) => new Date(`${log.date}T12:00:00Z`).getTime() >= floor);
}

function countDaysWith(logs, pick) {
    return logs.reduce((count, log) => (pick(log) ? count + 1 : count), 0);
}

function hasDietRecord(log) {
    const diet = isRecord(log?.diet) ? log.diet : {};
    return ["breakfast", "lunch", "dinner", "snack"].some((slot) => diet[`${slot}Url`]);
}

function hasExerciseRecord(log) {
    const exercise = isRecord(log?.exercise) ? log.exercise : {};
    const steps = toNumber(isRecord(log?.steps) ? log.steps.count : null);
    return (Array.isArray(exercise.cardioList) && exercise.cardioList.length > 0)
        || (Array.isArray(exercise.strengthList) && exercise.strengthList.length > 0)
        || (steps !== null && steps > 0);
}

function hasSleepRecord(log) {
    const sleep = isRecord(log?.sleepAndMind) ? log.sleepAndMind : {};
    return !!sleep.sleepImageUrl || toNumber(sleep.sleepHours) !== null || !!sleep.sleepAnalysis;
}

/**
 * 회원의 기록에서 처방 초안을 만든다.
 *
 * 우선순위: 건강 경보 → 나빠진 지표 → 좋아진 지표 → 꾸준함 → 비어 있는 자리.
 * 급한 것이 위로 오되, 나쁜 말만 늘어놓지 않도록 좋아진 것도 함께 올린다.
 */
export function buildAdminPrescriptionDrafts({
    name = "",
    logs = [],
    trendMetrics = [],
    streak = 0,
    todayStr = "",
} = {}) {
    const drafts = [];
    const 님 = name ? `${name}님` : "회원님";

    const last7 = recentLogs(logs, 7, todayStr);
    const last30 = recentLogs(logs, 30, todayStr);
    const latest = last30[0] || null;

    // ── 1. 건강 경보 — 잰 값이 기준을 넘었을 때만
    const alerts = [];
    for (const log of last30) {
        const metrics = isRecord(log?.metrics) ? log.metrics : {};
        const glucose = toNumber(metrics.glucose);
        const systolic = toNumber(metrics.bpSystolic);
        const diastolic = toNumber(metrics.bpDiastolic);
        if (glucose !== null && glucose >= PRESCRIPTION_ALERT_THRESHOLDS.glucose) {
            alerts.push({ kind: "공복혈당", value: `${glucose} mg/dL`, date: log.date, limit: `${PRESCRIPTION_ALERT_THRESHOLDS.glucose} mg/dL` });
        }
        if ((systolic !== null && systolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpSystolic)
            || (diastolic !== null && diastolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolic)) {
            alerts.push({ kind: "혈압", value: `${systolic ?? "-"}/${diastolic ?? "-"} mmHg`, date: log.date, limit: "140/90 mmHg" });
        }
    }
    if (alerts.length) {
        const first = alerts[0];
        drafts.push({
            key: `alert-${first.kind}`,
            tone: "warn",
            label: `⚠️ ${first.kind} 확인`,
            evidence: `${first.date} ${first.kind} ${first.value} (기준 ${first.limit} 이상) · 최근 30일 ${alerts.length}회`,
            summary: `${first.kind} ${first.value}, 한 번 확인해 주세요`,
            message: `${first.date} ${withJosa(first.kind, "이가")} ${withJosa(first.value, "으로")} 기준(${first.limit})을 넘었습니다. 최근 30일 중 ${alerts.length}번이에요.\n`
                + `한 번의 수치로 단정할 일은 아니지만, 다음에 재실 때 같은 시간대로 재서 기록해 주시면 제가 함께 보겠습니다.`,
        });
    }

    // ── 2. 나빠진 지표 — 서버가 방향을 정해 준 것만
    const worsened = (Array.isArray(trendMetrics) ? trendMetrics : [])
        .filter((metric) => metric?.summary?.direction === "worsened");
    for (const metric of worsened.slice(0, 2)) {
        const recent = formatMetricValue(metric.summary.recent, metric);
        const previous = formatMetricValue(metric.summary.previous, metric);
        if (!recent || !previous) continue;
        drafts.push({
            key: `worsened-${metric.key}`,
            tone: "warn",
            label: `📉 ${metric.label} 되돌리기`,
            evidence: `${metric.label} 직전 4주 ${previous} → 최근 4주 ${recent}`,
            summary: `${metric.label} ${previous} → ${recent}`,
            message: `4주씩 끊어 보니 ${withJosa(metric.label, "이가")} ${previous}에서 ${withJosa(recent, "으로")} 움직였습니다.\n`
                + `짧은 흔들림일 수 있어요. 다음 2주만 여기에 집중해 보시면, 4주가 쌓일 때 제가 다시 확인해 알려 드리겠습니다.`,
        });
    }

    // ── 3. 좋아진 지표 — 칭찬도 숫자로 한다
    const improved = (Array.isArray(trendMetrics) ? trendMetrics : [])
        .filter((metric) => metric?.summary?.direction === "improved");
    for (const metric of improved.slice(0, 2)) {
        const recent = formatMetricValue(metric.summary.recent, metric);
        const previous = formatMetricValue(metric.summary.previous, metric);
        if (!recent || !previous) continue;
        const percentile = toNumber(metric.percentile);
        const rank = percentile !== null ? ` 지금 전체 회원 중 상위 ${100 - Math.round(percentile)}%입니다.` : "";
        drafts.push({
            key: `improved-${metric.key}`,
            tone: "good",
            label: `📈 ${metric.label} 칭찬`,
            evidence: `${metric.label} 직전 4주 ${previous} → 최근 4주 ${recent}${percentile !== null ? ` · 상위 ${100 - Math.round(percentile)}%` : ""}`,
            summary: `${metric.label} ${previous} → ${recent}, 잘 올라왔어요`,
            message: `${withJosa(metric.label, "이가")} 4주 사이 ${previous}에서 ${withJosa(recent, "으로")} 올라섰습니다.${rank}\n`
                + `우연이 아니라 ${님}이 4주 동안 쌓아 만든 결과예요. 지금 방식 그대로 이어가시면 됩니다.`,
        });
    }

    // ── 4. 꾸준함 — 스트릭이 실제로 쌓였을 때만
    const streakDays = toNumber(streak) || 0;
    if (streakDays >= 7) {
        const milestone = PRESCRIPTION_STREAK_MILESTONES.find((days) => streakDays >= days);
        drafts.push({
            key: "streak",
            tone: "good",
            label: `🔥 ${streakDays}일 연속 축하`,
            evidence: `연속 기록 ${streakDays}일`,
            summary: `${streakDays}일 연속 기록 중이에요`,
            message: `${streakDays}일 연속으로 기록하고 계십니다. `
                + `${milestone >= 100
                    ? "세 자리를 넘긴 분은 많지 않아요. 이쯤이면 습관이 아니라 생활입니다."
                    : "한 주를 넘기면 그때부터가 진짜입니다. 지금이 그 구간이에요."}\n`
                + `빠뜨린 날이 생겨도 괜찮습니다. 끊긴 날보다 다시 시작한 날이 더 중요해요.`,
        });
    }

    // ── 5. 비어 있는 자리 — 최근 7일에 기록이 하나도 없는 영역
    if (last7.length) {
        const areas = [
            { key: "diet", label: "식단", days: countDaysWith(last7, hasDietRecord), how: "사진 한 장이면 됩니다. AI가 알아서 읽습니다" },
            { key: "exercise", label: "운동", days: countDaysWith(last7, hasExerciseRecord), how: "걸음수만 적으셔도 기록이 됩니다" },
            { key: "sleep", label: "수면", days: countDaysWith(last7, hasSleepRecord), how: "수면 앱 화면을 캡처해 올리시면 됩니다" },
        ];
        const filled = areas.filter((area) => area.days > 0);
        const empty = areas.filter((area) => area.days === 0);
        if (empty.length && filled.length) {
            const target = empty[0];
            const strong = filled.sort((a, b) => b.days - a.days)[0];
            drafts.push({
                key: `gap-${target.key}`,
                tone: "cheer",
                label: `🧩 ${target.label} 채우기 권유`,
                evidence: `최근 7일 · ${strong.label} ${strong.days}일 / ${target.label} 0일`,
                summary: `${target.label} 기록만 비어 있어요`,
                message: `지난 7일 동안 ${withJosa(strong.label, "은는")} ${strong.days}일이나 남기셨어요. 쉽지 않은 일입니다.\n`
                    + `다만 ${withJosa(target.label, "이가")} 한 번도 없어서 건강 점수가 실제보다 낮게 잡히고 있어요. ${target.how}.`,
            });
        }
    }

    // ── 6. 기록이 끊겼다 — 마지막 기록이 며칠 전인지로만 말한다
    if (todayStr && latest?.date) {
        const gapDays = Math.round(
            (new Date(`${todayStr}T12:00:00Z`).getTime() - new Date(`${latest.date}T12:00:00Z`).getTime()) / 86400000
        );
        if (gapDays >= 3) {
            drafts.push({
                key: "comeback",
                tone: "cheer",
                label: `👋 ${gapDays}일째 복귀 권유`,
                evidence: `마지막 기록 ${latest.date} · ${gapDays}일 전`,
                summary: `${gapDays}일 쉬셨네요, 오늘 하나만`,
                message: `마지막 기록이 ${latest.date}이니 ${gapDays}일이 지났습니다. 채근하려는 게 아니라 쌓아 두신 기록이 아까워서요.\n`
                    + `오늘 사진 한 장이나 걸음수 하나면 다시 이어집니다. 처음부터 할 필요 없어요.`,
            });
        }
    }

    return drafts;
}

export const ADMIN_PRESCRIPTION_ALERT_THRESHOLDS = PRESCRIPTION_ALERT_THRESHOLDS;
