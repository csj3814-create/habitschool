// 챌린지 정산·자격 계산 (순수 함수 단일 출처)
//
// 이 계산들은 챌린지 결산/보상의 핵심이며 반복 버그 다발 구역이다(원금 vs 보너스,
// 일일 로그로 완료일 재계산, 티어별 스테이크 격리, 같은 날 재시작 등). 이전에는
// runtime.js 안에 인라인으로만 있어 behavioral 테스트가 닿지 못했다. 여기로 추출해
// tests/challenge-utils.test.js로 검증한다. 모두 I/O 없는 순수 함수다.

const CHALLENGE_BASE_BONUS_BPS = {
    mini: 0,
    weekly: 5000,
    master: 20000
};
const CHALLENGE_DAILY_MIN_POINTS = 65;
const LEGACY_CHALLENGE_REQUIRED_CATEGORIES = ["diet", "exercise", "mind"];

function getCurrentKstDateString(date = new Date()) {
    const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
    return kst.toISOString().slice(0, 10);
}

function addDaysToKstDateString(dateStr, diffDays) {
    const base = new Date(`${dateStr}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + diffDays);
    return base.toISOString().slice(0, 10);
}

function isValidDateString(dateStr = "") {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || "").trim());
}

function getLegacyChallengeBonusBps(tier = "") {
    return CHALLENGE_BASE_BONUS_BPS[tier] || 0;
}

function buildLegacyChallengeQualificationPolicy(tier = "mini") {
    return {
        type: "all_categories",
        ruleVersion: 1,
        tier,
        requiredCategories: [...LEGACY_CHALLENGE_REQUIRED_CATEGORIES]
    };
}

function buildDefaultChallengeQualificationPolicy(tier = "mini") {
    if (tier === "weekly" || tier === "master") {
        return {
            type: "daily_min_points",
            ruleVersion: 2,
            tier,
            dailyMinPoints: CHALLENGE_DAILY_MIN_POINTS,
            pointsScaleMax: 80
        };
    }
    return buildLegacyChallengeQualificationPolicy(tier);
}

function normalizeChallengeQualificationPolicy(policy, tier = "mini") {
    if (policy?.type === "daily_min_points" && Number(policy.dailyMinPoints) > 0) {
        return {
            type: "daily_min_points",
            ruleVersion: Number(policy.ruleVersion) || 2,
            tier: policy.tier || tier,
            dailyMinPoints: Number(policy.dailyMinPoints),
            pointsScaleMax: Number(policy.pointsScaleMax) || 80
        };
    }
    if (policy?.type === "all_categories") {
        return {
            type: "all_categories",
            ruleVersion: Number(policy.ruleVersion) || 1,
            tier: policy.tier || tier,
            requiredCategories: Array.isArray(policy.requiredCategories) && policy.requiredCategories.length
                ? [...policy.requiredCategories]
                : [...LEGACY_CHALLENGE_REQUIRED_CATEGORIES]
        };
    }
    return buildLegacyChallengeQualificationPolicy(tier);
}

function getAwardedPointsTotal(awarded = {}) {
    const hasExplicitPoints =
        Object.prototype.hasOwnProperty.call(awarded, "dietPoints") ||
        Object.prototype.hasOwnProperty.call(awarded, "exercisePoints") ||
        Object.prototype.hasOwnProperty.call(awarded, "mindPoints");

    const explicitTotal =
        (Number(awarded.dietPoints) || 0) +
        (Number(awarded.exercisePoints) || 0) +
        (Number(awarded.mindPoints) || 0);

    if (hasExplicitPoints || explicitTotal > 0) {
        return explicitTotal;
    }

    let fallbackTotal = 0;
    if (awarded.diet) fallbackTotal += 10;
    if (awarded.exercise) fallbackTotal += 15;
    if (awarded.mind) fallbackTotal += 5;
    return fallbackTotal;
}

function doesAwardedPointsMeetChallengeRule(awarded = {}, policyOrTier = "mini") {
    const policy = typeof policyOrTier === "string"
        ? buildDefaultChallengeQualificationPolicy(policyOrTier)
        : normalizeChallengeQualificationPolicy(policyOrTier, policyOrTier?.tier || "mini");

    if (policy.type === "daily_min_points") {
        return getAwardedPointsTotal(awarded) >= Number(policy.dailyMinPoints || 0);
    }

    return !!(awarded.diet && awarded.exercise && awarded.mind);
}

function formatChallengeQualificationLabel(policyOrTier = "mini") {
    const policy = typeof policyOrTier === "string"
        ? buildDefaultChallengeQualificationPolicy(policyOrTier)
        : normalizeChallengeQualificationPolicy(policyOrTier, policyOrTier?.tier || "mini");

    if (policy.type === "daily_min_points") {
        return `하루 ${Number(policy.dailyMinPoints || CHALLENGE_DAILY_MIN_POINTS)}P 이상이면 1일 인정`;
    }

    return "식단·운동·마음을 모두 기록하면 1일 인정";
}

function getChallengeCompletedDays(challenge = {}) {
    const completedDates = Array.isArray(challenge?.completedDates)
        ? [...new Set(challenge.completedDates.filter(Boolean))]
        : [];
    return Math.max(Number(challenge?.completedDays) || 0, completedDates.length);
}

function normalizeChallengeCompletion(challenge = {}) {
    const completedDates = Array.isArray(challenge?.completedDates)
        ? [...new Set(challenge.completedDates.filter(Boolean))]
        : [];
    return {
        ...challenge,
        completedDates,
        completedDays: Math.max(Number(challenge?.completedDays) || 0, completedDates.length)
    };
}

function isChallengePastEnd(challenge = {}, todayStr = getCurrentKstDateString()) {
    const endDate = String(challenge?.endDate || "").trim();
    return !!endDate && !!todayStr && todayStr > endDate;
}

function canSettleChallengeAsClaimable(challenge = {}, completedDays = 0, totalDays = 1, todayStr = getCurrentKstDateString()) {
    const safeTotalDays = Math.max(1, Number(totalDays) || 1);
    const safeCompletedDays = Number(completedDays) || 0;
    const successRate = safeCompletedDays / safeTotalDays;
    return safeCompletedDays >= safeTotalDays || (isChallengePastEnd(challenge, todayStr) && successRate >= 0.8);
}

function getChallengeDateRange(challenge = {}) {
    const startDate = String(challenge?.startDate || "").trim();
    const totalDays = Math.max(0, Number(challenge?.totalDays || 0));
    if (isValidDateString(startDate) && totalDays > 0) {
        return Array.from({ length: totalDays }, (_, index) => addDaysToKstDateString(startDate, index));
    }

    const endDate = String(challenge?.endDate || "").trim();
    if (isValidDateString(startDate) && isValidDateString(endDate) && endDate >= startDate) {
        const range = [];
        let cursor = startDate;
        while (cursor && cursor <= endDate && range.length < 370) {
            range.push(cursor);
            cursor = addDaysToKstDateString(cursor, 1);
        }
        return range;
    }

    return Array.isArray(challenge?.completedDates)
        ? [...new Set(challenge.completedDates.filter(isValidDateString))].sort()
        : [];
}

function reconcileChallengeCompletionWithDailyLogs(challenge = {}, dailyLogsByDate = {}, tier = "mini") {
    const range = getChallengeDateRange(challenge);
    const rangeSet = new Set(range);
    const hasRange = rangeSet.size > 0;
    const completedSet = new Set(
        (Array.isArray(challenge?.completedDates) ? challenge.completedDates : [])
            .filter(isValidDateString)
            .filter((date) => !hasRange || rangeSet.has(date))
    );
    const policy = challenge?.qualificationPolicy
        ? normalizeChallengeQualificationPolicy(challenge.qualificationPolicy, tier)
        : normalizeChallengeQualificationPolicy(null, tier);

    range.forEach((date) => {
        const log = dailyLogsByDate[date] || null;
        if (log && doesAwardedPointsMeetChallengeRule(log.awardedPoints || {}, policy)) {
            completedSet.add(date);
        }
    });

    const completedDates = hasRange
        ? range.filter((date) => completedSet.has(date))
        : [...completedSet].sort();
    const maxDays = Math.max(0, Number(challenge?.totalDays || range.length || 0));
    const reconciledDays = Math.max(Number(challenge?.completedDays) || 0, completedDates.length);

    return {
        ...challenge,
        completedDates,
        completedDays: maxDays > 0 ? Math.min(maxDays, reconciledDays) : reconciledDays,
        qualificationPolicy: policy
    };
}

module.exports = {
    CHALLENGE_BASE_BONUS_BPS,
    CHALLENGE_DAILY_MIN_POINTS,
    LEGACY_CHALLENGE_REQUIRED_CATEGORIES,
    getCurrentKstDateString,
    addDaysToKstDateString,
    isValidDateString,
    getLegacyChallengeBonusBps,
    buildLegacyChallengeQualificationPolicy,
    buildDefaultChallengeQualificationPolicy,
    normalizeChallengeQualificationPolicy,
    getAwardedPointsTotal,
    doesAwardedPointsMeetChallengeRule,
    formatChallengeQualificationLabel,
    getChallengeCompletedDays,
    normalizeChallengeCompletion,
    isChallengePastEnd,
    canSettleChallengeAsClaimable,
    getChallengeDateRange,
    reconcileChallengeCompletionWithDailyLogs,
};
