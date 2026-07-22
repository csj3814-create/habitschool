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
        return name.includes(normalizedTerm) || email.includes(normalizedTerm);
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
    addAnalysisField(fields, "강도", analysis.intensity);
    addAnalysisField(fields, "운동 종류", analysis.exerciseType);
    addAnalysisField(fields, "시간 분석", analysis.timeAnalysis);
    if (analysis.recommendedDailyProgress !== null && analysis.recommendedDailyProgress !== undefined) {
        addAnalysisField(fields, "권장량 달성률", analysis.recommendedDailyProgress, "%");
    }
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
            hasCurrentExerciseAnalysis = addAdminAnalysis(items, {
                kind: "exercise",
                label: `${label} ${index + 1}`,
                analysis: item?.aiAnalysis || item?.analysis,
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
