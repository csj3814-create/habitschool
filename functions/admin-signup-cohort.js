"use strict";

/**
 * 관제탑 가입 통계 — 기간별 가입 계정 수와 출처 단서 (설계: tasks/2026-10-29_admin_signup_cohort_stats.md 1안).
 *
 * 새 계측 없이 지금 있는 자료만 쓴다.
 * - 가입 시각은 Auth creationTime. users.createdAt 은 회원이 고칠 수 있고 9/21 버그 피해자는
 *   클라이언트가 채웠다 — 대조 칸에만 쓴다.
 * - 탈퇴하면 Auth 계정이 사라지므로 늘 "조회 시점에 남아 있는 계정"만 센다.
 * - 합계만 돌려준다. uid·이메일·이름처럼 회원 하나를 가리키는 값은 내보내지 않는다.
 */

const KST_OFFSET_MS = 9 * 3600 * 1000;
const DAY_MS = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;
// settings.signupSource 는 v458(2026-09-27)부터 모은다. 그 전 가입자에게는 원래 없다.
const SOURCE_COLLECTION_START = "2026-09-27";
const STALE_FIRST_VISIT_DAYS = 7;
const CREATED_AT_MISMATCH_MINUTES = 10;

function kstDateOf(millis) {
    return new Date(millis + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function kstMidnightMillis(dateStr) {
    return Date.parse(`${dateStr}T00:00:00Z`) - KST_OFFSET_MS;
}

/** 'YYYY-MM-DD' 두 개(포함 구간, KST)를 검사한다. 문제가 있으면 이유 문장, 없으면 "". */
function validateRange(startDate, endDate) {
    if (!DATE_RE.test(String(startDate || "")) || !DATE_RE.test(String(endDate || ""))) {
        return "기간은 YYYY-MM-DD 형식으로 보내 주세요.";
    }
    const start = kstMidnightMillis(startDate);
    const end = kstMidnightMillis(endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end) || kstDateOf(start) !== startDate || kstDateOf(end) !== endDate) {
        return "기간은 YYYY-MM-DD 형식으로 보내 주세요.";
    }
    if (end < start) return "시작일이 종료일보다 늦습니다.";
    if ((end - start) / DAY_MS + 1 > MAX_RANGE_DAYS) return "기간은 366일 이내로 골라 주세요.";
    return "";
}

/** 첫 방문 기록 하나를 사람이 읽을 경로 이름 하나로 줄인다 ("1순위 버킷"). */
function classifySignupSource(source, referredBy) {
    const s = source || {};
    if (s.src) return s.src;
    if (s.app) return s.app;
    const host = String(s.referrer || "");
    if (/youtube|youtu\.be/.test(host)) return "youtube";
    if (/naver/.test(host)) return "naver";
    if (/google/.test(host)) return "google";
    if (/brunch|daum|kakao/.test(host)) return host.includes("brunch") ? "brunch" : "kakao";
    if (/tiktok/.test(host)) return "tiktok";
    if (/instagram/.test(host)) return "instagram";
    if (/facebook|fb\.com/.test(host)) return "facebook";
    if (/threads/.test(host)) return "threads";
    if (host) return host;
    if (s.ref || referredBy) return "invite";
    if (!source) return "(기록 없음)";
    return "직접·앱";
}

function bump(counter, key) {
    counter[key] = (counter[key] || 0) + 1;
}

/** {키: 개수} 를 많은 순 [{key, count}] 로. */
function sortedCounts(counter) {
    return Object.entries(counter)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([key, count]) => ({ key, count }));
}

/**
 * 순수 함수 — 테스트 대상.
 *
 * @param authUsers  [{ uid, createdMs, pendingDeletion }] — Auth 전체 (기간 필터는 여기서 한다)
 * @param userDocs   Map uid → { createdAtMs, referredBy, signupSource } (없으면 users 문서 없음)
 * @param adminUids  Set — admins 컬렉션
 * @param excludedUids Set — stats_exclusions 컬렉션 (테스트 계정)
 */
function buildSignupCohortSummary({
    authUsers = [],
    userDocs = new Map(),
    adminUids = new Set(),
    excludedUids = new Set(),
    startDate,
    endDate,
    observedAtMs = Date.now(),
} = {}) {
    const startMs = kstMidnightMillis(startDate);
    const endMsExclusive = kstMidnightMillis(endDate) + DAY_MS;

    const denominator = { authCreated: 0, admins: 0, testExcluded: 0, held: 0, included: 0 };
    const byDay = {};
    const timing = { noUserDoc: 0, createdAtMissing: 0, createdAtMismatch: 0 };
    const tags = {};
    const apps = {};
    const referrers = {};
    const primary = {};
    const invite = { both: 0, refOnly: 0, referredOnly: 0, neither: 0 };
    const missing = { beforeCollection: 0, afterCollection: 0, late: 0, staleFirstVisit: 0 };
    let sourceBase = 0;
    let inviteMark = 0;

    for (const user of authUsers) {
        const createdMs = Number(user.createdMs);
        if (!Number.isFinite(createdMs) || createdMs < startMs || createdMs >= endMsExclusive) continue;
        denominator.authCreated += 1;
        // 한 사람은 한 칸으로만 빠진다. 관리자 → 테스트 → 보관 중 순서.
        if (adminUids.has(user.uid)) { denominator.admins += 1; continue; }
        if (excludedUids.has(user.uid)) { denominator.testExcluded += 1; continue; }
        // 30일 보관을 고른 계정: Auth 에는 남아 있지만 users 문서는 보관함에 가 있다.
        // 따로 세지 않으면 "users 문서 없음" 으로 잘못 들어간다.
        if (user.pendingDeletion) { denominator.held += 1; continue; }
        denominator.included += 1;
        const signupDay = kstDateOf(createdMs);
        bump(byDay, signupDay);

        const doc = userDocs.get(user.uid);
        if (!doc) { timing.noUserDoc += 1; continue; }
        if (!Number.isFinite(doc.createdAtMs)) timing.createdAtMissing += 1;
        else if (Math.abs(doc.createdAtMs - createdMs) > CREATED_AT_MISMATCH_MINUTES * 60000) timing.createdAtMismatch += 1;

        sourceBase += 1;
        const source = doc.signupSource && typeof doc.signupSource === "object" ? doc.signupSource : null;
        const referred = !!doc.referredBy;
        bump(primary, classifySignupSource(source, referred));

        const hasRef = !!source?.ref;
        if (hasRef) inviteMark += 1;
        if (hasRef && referred) invite.both += 1;
        else if (hasRef) invite.refOnly += 1;
        else if (referred) invite.referredOnly += 1;
        else invite.neither += 1;

        if (!source) {
            if (signupDay < SOURCE_COLLECTION_START) missing.beforeCollection += 1;
            else missing.afterCollection += 1;
            continue;
        }
        if (source.src) bump(tags, String(source.src));
        if (source.app) bump(apps, String(source.app));
        if (source.referrer) bump(referrers, String(source.referrer));
        if (source.late) {
            missing.late += 1;
        } else {
            const firstVisitMs = Date.parse(String(source.at || ""));
            if (Number.isFinite(firstVisitMs) && createdMs - firstVisitMs >= STALE_FIRST_VISIT_DAYS * DAY_MS) {
                missing.staleFirstVisit += 1;
            }
        }
    }

    // 고른 기간의 날짜를 빠짐없이 — 가입이 없던 날도 0으로 보여야 운영 기간과 맞춰 읽힌다.
    const days = [];
    for (let t = startMs; t < endMsExclusive; t += DAY_MS) {
        const date = kstDateOf(t);
        days.push({ date, count: byDay[date] || 0 });
    }

    return {
        meta: {
            startDate,
            endDate,
            timeZone: "Asia/Seoul",
            observedAt: new Date(observedAtMs).toISOString(),
            scope: "조회 시점에 남아 있는 계정만 (탈퇴자 제외)",
            sourceCollectionStart: SOURCE_COLLECTION_START,
            staleFirstVisitDays: STALE_FIRST_VISIT_DAYS,
            createdAtMismatchMinutes: CREATED_AT_MISMATCH_MINUTES,
            testExclusionListSize: excludedUids.size,
        },
        denominator,
        days,
        timing,
        sourceBase,
        primary: sortedCounts(primary),
        evidence: {
            tags: sortedCounts(tags),
            apps: sortedCounts(apps),
            referrers: sortedCounts(referrers),
            inviteMark,
        },
        invite,
        missing,
    };
}

module.exports = {
    SOURCE_COLLECTION_START,
    validateRange,
    kstDateOf,
    kstMidnightMillis,
    classifySignupSource,
    buildSignupCohortSummary,
};
