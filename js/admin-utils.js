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
    formatAdminDateTime,
    getReEngagementMethodLabel,
    normalizeAdminEmailLog,
};
