import { WEEKLY_ACTIVITY_TARGET_MINUTES } from './le8-score.js';

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
//
// 2026-09-15: 예전에는 이 파일이 import 없는 순수 모듈이라 150 을 옮겨 적고
// 테스트로 둘을 묶어 뒀다. 지금은 위에서 le8-score 를 직접 불러온다 —
// 옮겨 적은 값이 없으면 어긋날 일도 없다.
//
// 값을 치르기는 한다. le8-score.js 는 39KB(gzip 13KB)이고 관제탑은 이걸
// 불러오지 않고 있었다. 관제탑은 사람 한둘이 쓰는 화면이라 그만큼은 사본이
// 어긋날 위험과 바꿀 만하다고 봤다. 회원 화면에서였다면 다르게 정했을 것이다.
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

/**
 * 경보 기준.
 *
 * 혈압은 한쪽만 걸렸을 때 기준을 따로 둔다. 140/90 을 양쪽에 그대로 적용하면
 * 132/90 이나 128/90 처럼 이완기 하나만 아슬아슬하게 닿은 값이 매주 대기열
 * 맨 위를 차지했다. 한 번 잰 값으로 연락할 일은 아니다.
 *
 * 그래서 한쪽만 걸린 경우는 (1) 기준을 145 / 95 로 올리고 (2) 30일에 두 번
 * 이상 나왔을 때만 경보로 본다. 양쪽이 함께 걸린 것은 예전 기준 그대로,
 * 한 번만 나와도 올린다 — 그건 아슬아슬한 값이 아니다.
 */
const PRESCRIPTION_ALERT_THRESHOLDS = {
    glucose: 126,
    bpSystolic: 140, bpDiastolic: 90,
    bpSystolicAlone: 145, bpDiastolicAlone: 95,
};
// 한쪽만 걸린 혈압은 이만큼 반복돼야 경보로 본다.
const PRESCRIPTION_ALERT_MIN_REPEATS_ALONE = 2;

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

/**
 * 지표마다 맞는 동사가 있다. 걸음수는 '늘리고' 혈당은 '내리고' 체지방은 '줄인다'.
 * 전부 '올라섰습니다' 로 쓰면 틀에서 뽑은 글이라는 게 한 줄 만에 읽힌다.
 *
 * 좋아진 쪽은 **회원이 주어**다 — 스스로 해낸 일이니 '걸음수를 … 늘려오셨습니다'.
 * 나빠진 쪽은 **지표가 주어**다 — 탓하는 문장이 되면 안 되니 '체중이 … 늘었습니다'.
 * 주어가 바뀌므로 조사도 을/를 과 이/가 로 갈린다.
 */
const METRIC_VERBS = {
    steps: { improved: "늘려오셨습니다", worsened: "줄었습니다" },
    sleepHours: { improved: "늘리셨습니다", worsened: "줄었습니다" },
    muscle: { improved: "늘리셨습니다", worsened: "줄었습니다" },
    dietGrade: { improved: "올리셨습니다", worsened: "내려갔습니다" },
    glucose: { improved: "내리셨습니다", worsened: "올랐습니다" },
    hba1c: { improved: "내리셨습니다", worsened: "올랐습니다" },
    nonHdl: { improved: "내리셨습니다", worsened: "올랐습니다" },
    bpSystolic: { improved: "내리셨습니다", worsened: "올랐습니다" },
    bpDiastolic: { improved: "내리셨습니다", worsened: "올랐습니다" },
    bodyFat: { improved: "줄이셨습니다", worsened: "늘었습니다" },
    visceral: { improved: "줄이셨습니다", worsened: "늘었습니다" },
};

function metricVerb(metric, direction) {
    const table = METRIC_VERBS[metric?.key];
    if (table) return table[direction];
    // 체중·BMI 는 좋고 나쁨을 말할 수 없는 지표다(health-trends.js 의 better: null).
    // 여기서 '나빠졌습니다' 를 쓰면 저체중 회원의 증량까지 나무라는 문장이 된다.
    // 판단은 빼고 움직인 방향만 적는다.
    return toNumber(metric?.summary?.delta) > 0 ? "늘었습니다" : "줄었습니다";
}

/**
 * 2026-09-12 는 기계가 쓰는 형식이다. 회원이 읽는 문장에는 '9월 12일' 로 넣는다.
 * 관제탑이 보는 evidence 는 ISO 그대로 둔다 — 보내기 전에 대조할 값이라서다.
 */
function toKoreanDate(dateStr) {
    const match = String(dateStr || "").match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (!match) return String(dateStr || "");
    return `${Number(match[1])}월 ${Number(match[2])}일`;
}

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
 * "이 정도면 잘하고 있다" 는 선.
 *
 * 2026-09-15 지적: "2만보는 엄청 많이 걷는 건데 그걸 좀 줄었다고 잔소리를 해야
 * 겠냐? 잘 하고 있는데 조금 떨어졌다고 잔소리 하진 말자."
 *
 * 그때까지 '나빠진 지표' 는 **상대 변화만** 봤다. 23,816보 → 21,851보 는 줄어든
 * 것이 맞지만 21,851보는 목표의 세 배가 넘는다. 줄었다는 사실만으로 연락하면
 * 잘하고 있는 사람에게 잔소리가 간다.
 *
 * 그래서 최근 값이 아래 선 안쪽이면 초안을 만들지 않는다. 숫자는 새로 정한 것이
 * 아니라 앱이 이미 쓰는 기준이다(js/le8-score.js):
 *   - 수면 7~9시간 = 100점
 *   - 식단 등급 B = 80점
 *   - 공복혈당 100 미만이 정상(그 이상은 전당뇨)
 *   - 혈압 120/80 미만 = 100점
 *   - 당화혈색소 5.7 미만 만점, non-HDL 130 미만 = 100점
 *
 * 체지방·골격근량·내장지방은 LE8 에 기준이 없다. 잘하고 있는지 말할 수 없으므로
 * 지금처럼 알린다 — 모르면서 괜찮다고 하는 것이 더 나쁘다.
 */
// 걸음수는 활동 점수와 같은 자로 잰다. 일상 이동분 4,000보를 빼고 분당 100보로
// 환산해 주 150분(=하루 150/7분)을 채우는 걸음수.
const PRESCRIPTION_STEP_BASELINE = 4000;
const PRESCRIPTION_STEPS_PER_MINUTE = 100;
const PRESCRIPTION_GOOD_ENOUGH = {
    steps: { atLeast: PRESCRIPTION_STEP_BASELINE
        + (WEEKLY_ACTIVITY_TARGET_MINUTES / 7) * PRESCRIPTION_STEPS_PER_MINUTE },
    sleepHours: { atLeast: 7 },
    dietGrade: { atLeast: 80 },
    glucose: { atMost: 100 },
    hba1c: { atMost: 5.7 },
    nonHdl: { atMost: 130 },
    bpSystolic: { atMost: 120 },
    bpDiastolic: { atMost: 80 },
};

/** 최근 값이 기준 안쪽인가. 기준이 없는 지표는 판단하지 않는다(false). */
function isStillGoodEnough(metric) {
    const line = PRESCRIPTION_GOOD_ENOUGH[metric?.key];
    const recent = toNumber(metric?.summary?.recent);
    if (!line || recent === null) return false;
    if (line.atLeast !== undefined) return recent >= line.atLeast;
    return recent <= line.atMost;
}

/**
 * 초안 점수 — 얼마나 먼저 보여줄지. 0~100.
 *
 * 지금까지는 종류 순서(경보→나빠짐→좋아짐→꾸준함→빈자리→복귀)가 곧 순위였다.
 * 그래서 걸음수가 100보 늘어난 사람과 3,000보 늘어난 사람이 같은 자리를 받았다.
 * "가장 의미있는 것부터" 를 하려면 변화의 크기가 순위에 들어가야 한다.
 *
 * 종류마다 **바닥 점수**를 주어 큰 순서는 지키고, 그 위에 **크기 점수**를 얹어
 * 같은 종류 안에서 갈리게 한다. 바닥끼리 겹치지 않게 띄워 두었으므로 종류를
 * 건너뛰는 역전은 일어나지 않는다 — 걸음수가 아무리 늘어도 혈당 경보를 밀어내지
 * 못한다.
 *
 * 하한선 아래는 아예 만들지 않는다. 보낼 말이 없으면 보내지 않는 게 맞다.
 * 다만 사소한 변화를 거르는 일은 여기가 아니라 서버가 먼저 한다 —
 * health-trends.js 의 FLAT_RATIO(2%) 미만은 improved/worsened 가 아니라 flat 이라
 * 초안 자체가 만들어지지 않는다. 이 하한선은 그 뒤에 남는 것들을 위한 것이다.
 */
const PRESCRIPTION_SCORE_FLOOR = 30;

/**
 * 4주 사이 상대 변화율을 0~20점으로. 20% 넘게 움직였으면 만점.
 *
 * 절대값이 아니라 비율로 재는 이유: 걸음수 2,000보와 수면 0.5시간은 절대값으로
 * 견줄 수 없다. 자기 자신 대비 얼마나 움직였는지가 지표를 가로질러 비교된다.
 */
function changeMagnitudeScore(summary) {
    const recent = toNumber(summary?.recent);
    const previous = toNumber(summary?.previous);
    if (recent === null || previous === null || previous === 0) return 0;
    const ratio = Math.abs((recent - previous) / previous) * 100;
    return Math.min(20, Math.round(ratio));
}

/**
 * 회원의 기록에서 처방 초안을 만든다.
 *
 * 종류: 건강 경보 → 나빠진 지표 → 좋아진 지표 → 꾸준함 → 비어 있는 자리.
 * 급한 것이 위로 오되, 나쁜 말만 늘어놓지 않도록 좋아진 것도 함께 올린다.
 * 순서는 점수가 정한다(PRESCRIPTION_SCORE_FLOOR 위 주석 참조).
 *
 * 복귀 권유는 여기에 없다. 앱을 안 여는 분께 앱 카드로 보내봐야 닿지 않는다 —
 * 그 일은 재참여 메일이 한다.
 */
export function buildAdminPrescriptionDrafts({
    logs = [],
    trendMetrics = [],
    streak = 0,
    todayStr = "",
} = {}) {
    const drafts = [];

    const last7 = recentLogs(logs, 7, todayStr);
    const last30 = recentLogs(logs, 30, todayStr);

    // ── 1. 건강 경보 — 잰 값이 기준을 넘었을 때만
    const alerts = [];
    for (const log of last30) {
        const metrics = isRecord(log?.metrics) ? log.metrics : {};
        const glucose = toNumber(metrics.glucose);
        const systolic = toNumber(metrics.bpSystolic);
        const diastolic = toNumber(metrics.bpDiastolic);
        if (glucose !== null && glucose >= PRESCRIPTION_ALERT_THRESHOLDS.glucose) {
            alerts.push({
                kind: "공복혈당", value: `${glucose} mg/dL`, date: log.date,
                limit: `${PRESCRIPTION_ALERT_THRESHOLDS.glucose} mg/dL`,
                atLimit: glucose === PRESCRIPTION_ALERT_THRESHOLDS.glucose,
                // 기준에서 얼마나 멀리 있는지(%). 126 과 141 은 같은 '초과' 가 아니다.
                overBy: ((glucose - PRESCRIPTION_ALERT_THRESHOLDS.glucose) / PRESCRIPTION_ALERT_THRESHOLDS.glucose) * 100,
            });
        }
        // 혈압은 숫자가 둘이다. 하나만 걸렸는데 "기준 140/90 을 넘었다" 고 쓰면
        // 132/90 이 둘 다 넘은 것처럼 읽힌다 — 132 는 140 을 넘지 않았다.
        // 걸린 쪽을 지목하고 전체 수치는 괄호로 함께 보여준다.
        const bothHigh = systolic !== null && diastolic !== null
            && systolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpSystolic
            && diastolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolic;
        // 한쪽만 걸린 경우는 더 높은 기준을 넘어야 한다.
        const systolicAlone = !bothHigh && systolic !== null
            && systolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpSystolicAlone;
        const diastolicAlone = !bothHigh && !systolicAlone && diastolic !== null
            && diastolic >= PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolicAlone;

        if (bothHigh || systolicAlone || diastolicAlone) {
            const reading = `${systolic ?? "-"}/${diastolic ?? "-"} mmHg`;
            const bp = bothHigh
                ? {
                    kind: "혈압", value: reading, limit: "140/90 mmHg", alone: false,
                    atLimit: systolic === PRESCRIPTION_ALERT_THRESHOLDS.bpSystolic
                        && diastolic === PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolic,
                    overBy: Math.max(
                        ((systolic - PRESCRIPTION_ALERT_THRESHOLDS.bpSystolic) / PRESCRIPTION_ALERT_THRESHOLDS.bpSystolic) * 100,
                        ((diastolic - PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolic) / PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolic) * 100
                    ),
                }
                : systolicAlone
                    ? {
                        kind: "수축기혈압", value: `${systolic} mmHg`, alone: true,
                        limit: `${PRESCRIPTION_ALERT_THRESHOLDS.bpSystolicAlone} mmHg`,
                        atLimit: systolic === PRESCRIPTION_ALERT_THRESHOLDS.bpSystolicAlone,
                        overBy: ((systolic - PRESCRIPTION_ALERT_THRESHOLDS.bpSystolicAlone) / PRESCRIPTION_ALERT_THRESHOLDS.bpSystolicAlone) * 100,
                    }
                    : {
                        kind: "이완기혈압", value: `${diastolic} mmHg`, alone: true,
                        limit: `${PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolicAlone} mmHg`,
                        atLimit: diastolic === PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolicAlone,
                        overBy: ((diastolic - PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolicAlone) / PRESCRIPTION_ALERT_THRESHOLDS.bpDiastolicAlone) * 100,
                    };
            alerts.push({ ...bp, date: log.date, reading });
        }
    }

    // 종류별로 센다. 지금까지는 전체 건수를 썼는데, 혈당 1회 + 혈압 2회인 분께
    // 혈당 메시지가 "최근 30일에 3번입니다" 라고 나갔다 — 혈당은 한 번이었다.
    const alertCountByKind = {};
    for (const alert of alerts) {
        alertCountByKind[alert.kind] = (alertCountByKind[alert.kind] || 0) + 1;
    }
    // 한쪽만 걸린 혈압은 반복돼야 경보로 본다. 한 번 잰 값으로 연락할 일은 아니다.
    const eligibleAlerts = alerts.filter((alert) =>
        !alert.alone || alertCountByKind[alert.kind] >= PRESCRIPTION_ALERT_MIN_REPEATS_ALONE);
    if (eligibleAlerts.length) {
        const first = eligibleAlerts[0];
        const repeats = alertCountByKind[first.kind];
        drafts.push({
            key: `alert-${first.kind}`,
            tone: "warn",
            label: `⚠️ ${first.kind} 확인`,
            evidence: `${first.date} ${first.kind} ${first.value}`
                + (first.reading && first.reading !== first.value ? ` (혈압 ${first.reading})` : "")
                + ` · 기준 ${first.limit} 이상 · 최근 30일 ${repeats}회`,
            // 잰 값이 기준을 넘었다. 반복될수록, 기준에서 멀수록 올린다.
            score: Math.min(100, 75 + Math.min(15, (repeats - 1) * 5) + Math.min(10, Math.round(first.overBy / 2))),
            // 사람이 읽고 보낸다. 자동 발송 후보에 넣지 않는다.
            requiresHuman: true,
            summary: `${first.kind} ${first.value}`,
            message: `${toKoreanDate(first.date)} ${withJosa(first.kind, "이가")} ${first.value} 나왔습니다`
                + (first.reading && first.reading !== first.value ? `(혈압 ${first.reading}).` : ".")
                // 닿은 것과 넘은 것은 다른 말이다. 아슬아슬한 값을 "넘었습니다" 라고
                // 쓰면 보내는 쪽도 받는 쪽도 실제보다 나쁘게 읽는다.
                + ` 기준 ${first.limit}${first.atLimit ? "에 딱 닿는 값이고" : "보다 높고"}, 최근 30일에 ${repeats}번입니다.\n`
                + `다음엔 같은 시간대에 재서 올려 주세요. 두세 번 값이 모여야 제대로 보입니다.`,
        });
    }

    // ── 2. 나빠진 지표 — 서버가 방향을 정해 준 것만
    const worsened = (Array.isArray(trendMetrics) ? trendMetrics : [])
        .filter((metric) => metric?.summary?.direction === "worsened");
    for (const metric of worsened.slice(0, 2)) {
        const recent = formatMetricValue(metric.summary.recent, metric);
        const previous = formatMetricValue(metric.summary.previous, metric);
        if (!recent || !previous) continue;
        // 기준 안쪽이면 줄었어도 연락할 일이 아니다. 2만보 걷는 분께
        // "걸음수가 줄었습니다" 는 잔소리다.
        if (isStillGoodEnough(metric)) continue;
        drafts.push({
            key: `worsened-${metric.key}`,
            tone: "warn",
            label: `📉 ${metric.label} 되돌리기`,
            evidence: `${metric.label} 직전 4주 ${previous} → 최근 4주 ${recent}`,
            score: 55 + changeMagnitudeScore(metric.summary),
            summary: `${metric.label} ${previous} → ${recent}`,
            message: `4주 사이 ${withJosa(metric.label, "이가")} ${previous}에서 ${withJosa(recent, "으로")} ${metricVerb(metric, "worsened")}.\n`
                + `2주만 여기에 신경 써 주세요. 4주가 다시 쌓이면 제가 보고 말씀드리겠습니다.`,
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
        const rank = percentile !== null ? ` 전체 회원 중 상위 ${100 - Math.round(percentile)}%입니다.` : "";
        drafts.push({
            key: `improved-${metric.key}`,
            tone: "good",
            label: `📈 ${metric.label} 칭찬`,
            evidence: `${metric.label} 직전 4주 ${previous} → 최근 4주 ${recent}${percentile !== null ? ` · 상위 ${100 - Math.round(percentile)}%` : ""}`,
            // 나빠진 것보다는 덜 급하지만, 크게 좋아진 것은 작게 나빠진 것보다 할 말이 많다.
            score: 35 + changeMagnitudeScore(metric.summary)
                + (percentile !== null && percentile >= 75 ? 5 : 0),
            summary: `${metric.label} ${previous} → ${recent}`,
            message: `4주 사이 ${withJosa(metric.label, "을를")} ${previous}에서 ${recent}까지 잘 ${metricVerb(metric, "improved")}.${rank}\n`
                + `지금 하시는 방식이 맞습니다. 그대로 이어가세요.`,
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
            // 100일과 7일은 같은 말을 들을 일이 아니다. 마일스톤 자릿수로 가른다.
            score: 25 + Math.min(20, Math.round(Math.log10(Math.max(milestone, 1)) * 10)),
            summary: `${streakDays}일 연속 기록`,
            message: `${streakDays}일 연속으로 기록하고 계십니다. `
                + `${milestone >= 100
                    ? "세 자리까지 오신 분은 손에 꼽습니다."
                    : "2주를 넘기면 빠뜨린 날이 오히려 신경 쓰이기 시작합니다."}\n`
                + `혹시 끊기더라도 그날부터 다시 세면 됩니다. 지금까지 쌓은 기록은 그대로 남습니다.`,
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
            // 이미 성실한 회원일수록 비어 있는 한 칸이 점수를 더 많이 깎는다.
                score: 40 + strong.days * 2,
                summary: `${target.label} 기록이 비어 있습니다`,
                message: `지난 7일 중 ${withJosa(strong.label, "은는")} ${strong.days}일 남기셨는데 ${withJosa(target.label, "이가")} 한 번도 없습니다.\n`
                    + `${target.how}. 건강 점수가 실제보다 낮게 잡히니 오늘 하루만 채워 보시겠어요?`,
            });
        }
    }

    // ── 복귀 권유는 여기서 만들지 않는다 ─────────────────────────
    //
    // 2026-09-15 지적: "마지막 기록 복귀 권유는 메일로 해야지 앱에다 잔소리로
    // 보내봐야 볼 수가 없지."
    //
    // 맞는 말이다. 이 초안은 코치 메시지 카드로 나가는데, 그 카드는 앱을 열어야
    // 보인다. 열흘째 안 들어온 분께 앱 안에서 "열흘째 기록이 없습니다" 라고
    // 적어 두는 것은 닿지 않는 자리에 써 붙이는 것과 같다.
    //
    // 그 일은 이미 메일이 한다 — sendReEngagementEmailsScheduled 가 3일·7일
    // 미활동 메일을 보내고, 관제탑 회원 상세에 발송 이력이 함께 보인다.

    // 점수순. 같은 점수면 만들어진 차례(종류 순서)를 지킨다 — sort 는 안정 정렬이다.
    // 하한선 아래는 버린다. 할 말이 없는데 억지로 한 줄 보내는 것이 가장 나쁘다.
    return drafts
        .map((draft) => ({ ...draft, score: Math.max(0, Math.min(100, Math.round(draft.score ?? 0))) }))
        .filter((draft) => draft.score >= PRESCRIPTION_SCORE_FLOOR)
        .sort((a, b) => b.score - a.score);
}

export const ADMIN_PRESCRIPTION_ALERT_THRESHOLDS = PRESCRIPTION_ALERT_THRESHOLDS;
export const ADMIN_PRESCRIPTION_ALERT_MIN_REPEATS_ALONE = PRESCRIPTION_ALERT_MIN_REPEATS_ALONE;
export const ADMIN_PRESCRIPTION_GOOD_ENOUGH = PRESCRIPTION_GOOD_ENOUGH;
export const ADMIN_PRESCRIPTION_SCORE_FLOOR = PRESCRIPTION_SCORE_FLOOR;
