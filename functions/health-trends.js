"use strict";

/**
 * 건강 지표 추이 — 순수 계산.
 *
 * 관제탑의 두 화면(회원 한 명의 추이, 꾸준히 기록하는 분들 전체의 추이)이 같은 계산을
 * 쓴다. 두 곳에 각각 두면 기준이 조용히 갈라진다 — mvp-score.js 머리말이 적어 둔 그
 * 실패다. 그래서 계산은 여기 한 곳에 있고, Firestore 는 모른다.
 *
 * 이 파일이 답하려는 질문은 하나다: **좋아지고 있는가, 나빠지고 있는가.**
 * 값 하나로는 답할 수 없어서 전부 주 단위 시계열로 만들고, 방향을 붙인다.
 */

/** 식단 등급 배점. js/le8-score.js 의 DIET_GRADE_POINTS 와 같은 값이어야 한다. */
const DIET_GRADE_POINTS = Object.freeze({ A: 100, B: 80, C: 50, D: 25, F: 0 });

/** 주간 시계열 길이(주). 3개월. */
const TREND_WEEKS = 13;

/** 변화를 읽을 때 쓰는 창(주). 최근 4주 vs 직전 4주. */
const COMPARE_WINDOW_WEEKS = 4;

/** 한 창에 이만큼은 값이 있어야 평균을 말한다. 한 주짜리 평균은 그 주의 기분이다. */
const MIN_WEEKS_PER_WINDOW = 2;

/** 이보다 작은 변화는 방향이라고 부르지 않는다(직전 평균 대비 비율). */
const FLAT_RATIO = 0.02;

/** 꾸준 활동 기준 — 최근 30일 중 며칠 이상 기록했는가. */
const COHORT_MIN_ACTIVE_DAYS = 15;
const COHORT_ACTIVE_WINDOW_DAYS = 30;

/**
 * 지표 정의. 화면의 행 순서이자 계산의 목록이다.
 *
 * better:
 *   'down' 내려가면 좋아진 것   'up' 올라가면 좋아진 것
 *   null   방향을 말할 수 없는 것 — 체중이 그렇다. 저체중인 사람의 감량은 개선이 아니다.
 *          이런 지표는 화살표 대신 BMI 구간 이동으로 읽는다.
 */
const METRIC_SPECS = Object.freeze([
    { key: "weight", label: "체중", unit: "kg", better: null, scope: "both", decimals: 1 },
    { key: "bmi", label: "BMI", unit: "", better: null, scope: "both", decimals: 1 },
    // alertAbove — 관제탑 목록의 '건강 경보' 필터가 쓰던 기준을 여기로 모은다.
    // 기준이 두 곳에 있으면 목록은 빨간데 상세는 멀쩡한 일이 생긴다.
    { key: "glucose", label: "공복혈당", unit: "mg/dL", better: "down", scope: "both", decimals: 0, alertAbove: 126 },
    { key: "bpSystolic", label: "수축기혈압", unit: "mmHg", better: "down", scope: "both", decimals: 0, alertAbove: 140 },
    { key: "bpDiastolic", label: "이완기혈압", unit: "mmHg", better: "down", scope: "both", decimals: 0, alertAbove: 90 },
    { key: "dietGrade", label: "식단 등급", unit: "점", better: "up", scope: "both", decimals: 0 },
    { key: "steps", label: "걸음수", unit: "보", better: "up", scope: "both", decimals: 0 },
    { key: "sleepHours", label: "수면", unit: "시간", better: "up", scope: "both", decimals: 1 },
    // 아래는 개인 화면 전용 — 회원마다 하위 컬렉션을 읽어야 해서 코호트에서는 쓰지 않는다.
    { key: "bodyFat", label: "체지방", unit: "kg", better: "down", scope: "member", decimals: 1 },
    { key: "muscle", label: "골격근량", unit: "kg", better: "up", scope: "member", decimals: 1 },
    { key: "visceral", label: "내장지방", unit: "레벨", better: "down", scope: "member", decimals: 0 },
    { key: "hba1c", label: "당화혈색소", unit: "%", better: "down", scope: "member", decimals: 1 },
    { key: "nonHdl", label: "non-HDL", unit: "mg/dL", better: "down", scope: "member", decimals: 0 },
]);

function num(value) {
    const parsed = typeof value === "number" ? value : parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

/** 'YYYY-MM-DD' → 그 주 월요일의 'YYYY-MM-DD'. ui-helpers 의 getDatesInfo 와 같은 기준. */
function weekKeyOf(dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) return null;
    const noon = new Date(`${dateStr}T12:00:00Z`);
    if (Number.isNaN(noon.getTime())) return null;
    const dayOfWeek = noon.getUTCDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(noon.getTime() + diffToMon * 86400000);
    return monday.toISOString().slice(0, 10);
}

/** 오늘이 속한 주까지 거슬러 올라가며 주차 키를 만든다(오래된 것부터). */
function recentWeekKeys(todayStr, weeks = TREND_WEEKS) {
    const thisWeek = weekKeyOf(todayStr);
    if (!thisWeek) return [];
    const base = new Date(`${thisWeek}T12:00:00Z`).getTime();
    const keys = [];
    for (let i = weeks - 1; i >= 0; i -= 1) {
        keys.push(new Date(base - i * 7 * 86400000).toISOString().slice(0, 10));
    }
    return keys;
}

/** 하루 기록에서 지표 값을 꺼낸다. 없는 값은 null — 0 이 아니다. */
function extractDailyValues(log, { heightCm = null } = {}) {
    const metrics = (log && log.metrics) || {};
    const weight = num(metrics.weight);
    const height = num(heightCm);
    const values = {
        weight,
        bmi: (weight !== null && height !== null && height > 0)
            ? weight / Math.pow(height / 100, 2)
            : null,
        glucose: num(metrics.glucose),
        bpSystolic: num(metrics.bpSystolic),
        bpDiastolic: num(metrics.bpDiastolic),
        steps: num(log && log.steps && log.steps.count),
        sleepHours: num(log && log.sleepAndMind && log.sleepAndMind.sleepHours),
        dietGrade: null,
    };

    // 식단은 한 끼마다 등급이 매겨진다. 그 날의 값은 끼니 평균이다.
    const analysis = (log && log.dietAnalysis) || {};
    const points = Object.values(analysis)
        .map((entry) => DIET_GRADE_POINTS[entry && entry.grade])
        .filter((point) => Number.isFinite(point));
    if (points.length > 0) {
        values.dietGrade = points.reduce((sum, point) => sum + point, 0) / points.length;
    }

    return values;
}

/**
 * 날짜별 값 목록 → 주차 키에 맞춘 주간 평균.
 * 기록이 없는 주는 null 로 남긴다. 0 으로 채우면 그 주에 급격히 나빠진 것처럼 보인다.
 */
function aggregateWeekly(samples, weekKeys) {
    const buckets = new Map(weekKeys.map((key) => [key, []]));
    for (const sample of samples || []) {
        const key = weekKeyOf(sample && sample.date);
        if (!key || !buckets.has(key)) continue;
        const value = num(sample.value);
        if (value === null) continue;
        buckets.get(key).push(value);
    }
    return weekKeys.map((key) => {
        const values = buckets.get(key) || [];
        if (values.length === 0) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    });
}

function meanOfWindow(series, start, end) {
    const values = series.slice(Math.max(0, start), end).filter((value) => value !== null);
    if (values.length < MIN_WEEKS_PER_WINDOW) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** BMI 구간. js/le8-score.js 의 아시아-태평양 기준과 같은 값. */
function bmiBandOf(bmi) {
    const value = num(bmi);
    if (value === null) return null;
    if (value < 18.5) return "저체중";
    if (value < 23) return "정상";
    if (value < 25) return "과체중";
    return "비만";
}

/**
 * 시계열 하나를 "좋아졌다 / 나빠졌다" 로 요약한다.
 *
 * 표본이 모자라면 unknown 이다. 없는 것을 개선이라고 부르면 그 표는 아무 말도 안 하는
 * 것보다 나쁘다 — 읽는 사람이 믿어 버리기 때문이다.
 */
function summarizeChange(series, spec) {
    const length = series.length;
    const recent = meanOfWindow(series, length - COMPARE_WINDOW_WEEKS, length);
    const previous = meanOfWindow(series, length - COMPARE_WINDOW_WEEKS * 2, length - COMPARE_WINDOW_WEEKS);
    const oldest = series.find((value) => value !== null);
    const summary = {
        metric: spec.key,
        recent,
        previous,
        oldest: oldest === undefined ? null : oldest,
        delta: (recent !== null && previous !== null) ? recent - previous : null,
        direction: "unknown",
    };

    if (summary.delta === null) return summary;

    // 방향을 말할 수 없는 지표(체중·BMI)는 구간 이동으로 읽는다.
    if (!spec.better) {
        if (spec.key === "bmi") {
            summary.bandFrom = bmiBandOf(previous);
            summary.bandTo = bmiBandOf(recent);
        }
        summary.direction = "neutral";
        return summary;
    }

    const scale = Math.abs(previous) || 1;
    if (Math.abs(summary.delta) / scale < FLAT_RATIO) {
        summary.direction = "flat";
    } else if (spec.better === "down") {
        summary.direction = summary.delta < 0 ? "improved" : "worsened";
    } else {
        summary.direction = summary.delta > 0 ? "improved" : "worsened";
    }
    return summary;
}


/** 가장 최근 측정 한 건. 이 값이 언제 잰 것인지 화면이 말할 수 있게 한다. */
function latestSample(samples) {
    let best = null;
    for (const sample of samples || []) {
        const value = num(sample && sample.value);
        if (value === null) continue;
        const date = String(sample.date || "");
        if (!best || date > best.date) best = { date, value };
    }
    return best;
}

/**
 * 코호트 안에서 이 값이 어디쯤인지(0~100, 클수록 좋은 쪽).
 *
 * 방향이 정해진 지표만 뜻이 있다. 체중은 높아도 낮아도 '좋은 쪽' 이 없으므로 null.
 */
function percentileOf(values, value, better) {
    const target = num(value);
    if (target === null || !better) return null;
    const pool = (values || []).map(num).filter((item) => item !== null);
    if (pool.length < 5) return null;   // 몇 명으로 백분위를 말하면 숫자만 그럴듯해진다
    const betterCount = pool.filter((item) => (better === "down" ? item > target : item < target)).length;
    return Math.round((betterCount / pool.length) * 100);
}

/** 하위 컬렉션(체성분·혈액검사) 문서를 지표별 {date, value} 목록으로 편다. */
function samplesFromInbody(inbodyHistory) {
    const rows = Array.isArray(inbodyHistory) ? inbodyHistory : [];
    return {
        bodyFat: rows.map((row) => ({ date: row.date, value: num(row.fat) })),
        muscle: rows.map((row) => ({ date: row.date, value: num(row.smm) })),
        visceral: rows.map((row) => ({ date: row.date, value: num(row.visceral) })),
    };
}

function labValue(metrics, key) {
    const entry = metrics && metrics[key];
    if (entry === null || entry === undefined) return null;
    return typeof entry === "object" ? num(entry.value) : num(entry);
}

function samplesFromBloodTests(bloodTests) {
    const rows = Array.isArray(bloodTests) ? bloodTests : [];
    const hba1c = [];
    const nonHdl = [];
    for (const row of rows) {
        const metrics = row.metrics || {};
        const a1c = labValue(metrics, "hba1c");
        if (a1c !== null) hba1c.push({ date: row.date, value: a1c });

        const total = labValue(metrics, "totalCholesterol");
        const hdl = labValue(metrics, "hdl");
        const ldl = labValue(metrics, "ldl");
        // non-HDL = 총콜레스테롤 − HDL. 총콜레스테롤이 없으면 LDL 로 근사한다
        // (js/le8-score.js 의 calcLipidScore 와 같은 규칙).
        const value = (total !== null && hdl !== null) ? total - hdl : (ldl !== null ? ldl + 30 : null);
        if (value !== null) nonHdl.push({ date: row.date, value });
    }
    return { hba1c, nonHdl };
}

/** 회원 한 명의 지표 추이. */
function buildMemberTrends({ logs = [], profile = {}, bloodTests = [], inbodyHistory = [], todayStr }) {
    const weekKeys = recentWeekKeys(todayStr);
    const heightCm = num(profile.heightCm);

    const daily = logs.map((log) => ({ date: log.date, values: extractDailyValues(log, { heightCm }) }));
    const inbody = samplesFromInbody(inbodyHistory);
    const blood = samplesFromBloodTests(bloodTests);

    const metrics = METRIC_SPECS.map((spec) => {
        let samples;
        if (inbody[spec.key]) samples = inbody[spec.key];
        else if (blood[spec.key]) samples = blood[spec.key];
        else samples = daily.map((day) => ({ date: day.date, value: day.values[spec.key] }));

        const weekly = aggregateWeekly(samples, weekKeys);
        return {
            ...spec,
            weekly,
            summary: summarizeChange(weekly, spec),
            // 언제 잰 값인지. 프로필의 숫자 옆에 붙으면 오래된 값이 스스로 오래됐다고 말한다.
            latest: latestSample(samples),
            // 몇 주나 기록했는지. "–" 가 고장인지 미기록인지를 이 숫자가 가른다.
            weeksWithData: weekly.filter((value) => value !== null).length,
            totalWeeks: weekKeys.length,
        };
    });

    return { weekKeys, metrics, heightCm };
}

/** 최근 N일 안에 기록이 며칠 있는지. */
function countActiveDays(logs, todayStr, windowDays = COHORT_ACTIVE_WINDOW_DAYS) {
    const today = new Date(`${todayStr}T12:00:00Z`).getTime();
    const cutoff = today - (windowDays - 1) * 86400000;
    const dates = new Set();
    for (const log of logs || []) {
        const stamp = new Date(`${log.date}T12:00:00Z`).getTime();
        if (Number.isFinite(stamp) && stamp >= cutoff && stamp <= today) dates.add(log.date);
    }
    return dates.size;
}

/**
 * 꾸준히 기록하는 분들 전체의 지표 추이.
 *
 * 코호트 주간 값은 "회원별 주간 평균의 평균" 이다. 그 주의 기록 전부를 한 줄로 평균내면
 * 많이 기록한 한 사람이 그 주를 대표하게 된다.
 */
function buildCohortTrends({ logsByUid = {}, profiles = {}, todayStr, minActiveDays = COHORT_MIN_ACTIVE_DAYS }) {
    const weekKeys = recentWeekKeys(todayStr);
    const specs = METRIC_SPECS.filter((spec) => spec.scope === "both");

    const members = [];
    for (const [uid, logs] of Object.entries(logsByUid)) {
        const activeDays = countActiveDays(logs, todayStr, COHORT_ACTIVE_WINDOW_DAYS);
        if (activeDays < minActiveDays) continue;
        const heightCm = num((profiles[uid] || {}).heightCm);
        const daily = logs.map((log) => ({ date: log.date, values: extractDailyValues(log, { heightCm }) }));
        members.push({ uid, activeDays, daily });
    }

    const metrics = specs.map((spec) => {
        const perMember = members.map((member) => aggregateWeekly(
            member.daily.map((day) => ({ date: day.date, value: day.values[spec.key] })),
            weekKeys
        ));

        const weekly = weekKeys.map((_, index) => {
            const values = perMember.map((series) => series[index]).filter((value) => value !== null);
            if (values.length === 0) return null;
            return values.reduce((sum, value) => sum + value, 0) / values.length;
        });

        const counts = { improved: 0, worsened: 0, flat: 0, neutral: 0, unknown: 0 };
        for (const series of perMember) {
            const direction = summarizeChange(series, spec).direction;
            counts[direction] = (counts[direction] || 0) + 1;
        }

        // 회원별 '최근 4주 평균' 분포. 개인 화면이 이 안에서 자기 위치를 찾는다.
        const recentValues = perMember
            .map((series) => summarizeChange(series, spec).recent)
            .filter((value) => value !== null);

        return {
            ...spec,
            weekly,
            summary: summarizeChange(weekly, spec),
            counts,
            recentValues,
            weeksWithData: weekly.filter((value) => value !== null).length,
            totalWeeks: weekKeys.length,
        };
    });

    return {
        weekKeys,
        metrics,
        memberCount: members.length,
        minActiveDays,
        activeWindowDays: COHORT_ACTIVE_WINDOW_DAYS,
    };
}

module.exports = {
    DIET_GRADE_POINTS,
    TREND_WEEKS,
    COMPARE_WINDOW_WEEKS,
    MIN_WEEKS_PER_WINDOW,
    FLAT_RATIO,
    COHORT_MIN_ACTIVE_DAYS,
    COHORT_ACTIVE_WINDOW_DAYS,
    METRIC_SPECS,
    weekKeyOf,
    recentWeekKeys,
    extractDailyValues,
    aggregateWeekly,
    summarizeChange,
    bmiBandOf,
    countActiveDays,
    latestSample,
    percentileOf,
    buildMemberTrends,
    buildCohortTrends,
};
