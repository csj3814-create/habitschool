/**
 * 식단 분석 2판(체크 5개)의 하루·4주 셈 (2026-11-20).
 *
 * 체크와 등급은 서버(functions/diet-checks.js)가 끼니마다 계산해 저장한다.
 * 여기는 그것을 **세기만** 한다. 화면이 따로 셈법을 가지면 하루 요약과
 * 4주 리포트가 같은 날을 다르게 센다.
 *
 * 통과한 날 = 그날 찍은 식사의 절반 이상이 그 체크를 통과한 날.
 * 「한 끼라도 통과」로 세면 세 끼 중 한 끼만 채소를 먹어도 통과한 날이 되어
 * 숫자가 부푼다. 한 끼만 찍은 날은 그 끼니로 정해진다. 간식·음료는 세지 않는다.
 */

import { DIET_SLOTS } from './diet-slots.js?v=619';

export const DIET_CHECK_KEYS = Object.freeze(['vegetables', 'protein', 'ultraprocessed', 'carbs', 'sodium']);
const MEAL_SLOTS = DIET_SLOTS;
/**
 * 2판 식사 등급 = 통과한 체크 수 (2026-11-23 대표: 5=S, 4=A, 3=B, 2=C, 1=D, 0=F).
 * functions/diet-checks.js 의 GRADE_BY_CHECK_COUNT 와 같아야 한다.
 */
export const DIET_GRADE_BY_CHECK_COUNT = Object.freeze({ 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'F' });
/** 등급 → 점수(평균용). 예전 1판 글자(A~F)도 같은 칸에 놓는다. */
const GRADE_POINTS = Object.freeze({ S: 5, A: 4, B: 3, C: 2, D: 1, F: 0 });

function gradeForPoints(avg) {
    return DIET_GRADE_BY_CHECK_COUNT[Math.max(0, Math.min(5, Math.round(avg)))];
}

/**
 * 화면에 보일 끼니 등급. 2판 식사는 저장된 글자 대신 체크 수로 다시 정한다 —
 * 2026-11-21~23 에 저장된 분석은 예전 표(5=A)로 글자가 적혀 있다.
 * 1판 분석은 저장된 글자 그대로. 등급이 없으면 null.
 */
export function dietMealGrade(analysis) {
    if (isCheckedMeal(analysis)) {
        const count = DIET_CHECK_KEYS.filter((key) => analysis.checks[key] === true).length;
        return DIET_GRADE_BY_CHECK_COUNT[count];
    }
    const letter = String(analysis?.grade || '').trim().toUpperCase();
    return Object.prototype.hasOwnProperty.call(GRADE_POINTS, letter) ? letter : null;
}

/** 여러 끼니 등급의 평균 한 글자. 등급이 하나도 없으면 null. */
export function averageDietGrade(analyses = []) {
    const points = (analyses || []).map(dietMealGrade).filter(Boolean).map((g) => GRADE_POINTS[g]);
    if (points.length === 0) return null;
    return gradeForPoints(points.reduce((sum, p) => sum + p, 0) / points.length);
}

/** 2판 식사(등급이 있는 끼니)인가 */
export function isCheckedMeal(analysis) {
    return !!analysis
        && Number(analysis.version) === 2
        && analysis.mealType === 'meal'
        && !!analysis.checks
        && typeof analysis.checks === 'object';
}

/** 하루치 분석 목록 → 체크마다 { passed, meals } */
export function countDayChecks(analyses = []) {
    const meals = (analyses || []).filter(isCheckedMeal);
    const result = { meals: meals.length, checks: {} };
    DIET_CHECK_KEYS.forEach((key) => {
        result.checks[key] = meals.filter((meal) => meal.checks[key] === true).length;
    });
    return result;
}

/** 그날 그 체크를 통과했나. 식사가 없는 날은 null(세지 않음). */
export function dayPassesCheck(dayCount, key) {
    if (!dayCount || dayCount.meals === 0) return null;
    return dayCount.checks[key] * 2 >= dayCount.meals;
}

function logAnalyses(log) {
    const raw = log && typeof log.dietAnalysis === 'object' && log.dietAnalysis ? log.dietAnalysis : {};
    return MEAL_SLOTS.map((slot) => raw[slot]).filter(Boolean);
}

function dayIndex(startDateStr, dateStr) {
    const start = Date.parse(`${startDateStr}T00:00:00Z`);
    const day = Date.parse(`${dateStr}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(day)) return -1;
    return Math.round((day - start) / 86400000);
}

/**
 * 4주 리포트의 식단 칸.
 * logs: 기간 안의 하루 기록들(date, dietAnalysis). startDateStr: 기간 첫날(YYYY-MM-DD).
 * 반환: 식사를 기록한 날 수, 체크마다 통과한 날과 주별(1~4주) 통과한 날, 평균 등급.
 */
export function summarizeDietChecks(logs = [], startDateStr = '', weeks = 4) {
    const checks = {};
    DIET_CHECK_KEYS.forEach((key) => {
        checks[key] = { passDays: 0, weeks: Array(weeks).fill(0) };
    });
    const weekDays = Array(weeks).fill(0);
    let days = 0;
    const gradedMeals = [];

    (logs || []).forEach((log) => {
        const analyses = logAnalyses(log);
        const count = countDayChecks(analyses);
        if (count.meals === 0) return;
        const index = dayIndex(startDateStr, String(log?.date || ''));
        const week = index >= 0 ? Math.floor(index / 7) : -1;
        const inRange = week >= 0 && week < weeks;
        days += 1;
        if (inRange) weekDays[week] += 1;
        DIET_CHECK_KEYS.forEach((key) => {
            if (!dayPassesCheck(count, key)) return;
            checks[key].passDays += 1;
            if (inRange) checks[key].weeks[week] += 1;
        });
        gradedMeals.push(...analyses.filter(isCheckedMeal));
    });

    const averageGrade = averageDietGrade(gradedMeals);

    return { days, weekDays, checks, averageGrade };
}

/**
 * 가장 많이 나아진 체크 하나. 기록한 날이 있는 첫 주와 마지막 주를 비교한다.
 * 2일 이상 늘지 않았으면 null — 하루 차이를 "늘었다" 고 하지 않는다.
 * 나트륨은 「통과」가 늘면 짠 날이 준 것이다.
 */
export function bestDietCheckImprovement(summary) {
    if (!summary) return null;
    const recorded = summary.weekDays.map((n, i) => (n > 0 ? i : -1)).filter((i) => i >= 0);
    if (recorded.length < 2) return null;
    const first = recorded[0];
    const last = recorded[recorded.length - 1];
    let best = null;
    DIET_CHECK_KEYS.forEach((key) => {
        const from = summary.checks[key].weeks[first];
        const to = summary.checks[key].weeks[last];
        const gain = to - from;
        if (gain >= 2 && (!best || gain > best.gain)) best = { key, fromWeek: first + 1, toWeek: last + 1, from, to, gain };
    });
    return best;
}
