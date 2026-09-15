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
