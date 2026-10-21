/**
 * metabolic-score.js
 * 대사건강 점수 모듈
 * 인슐린 저항성 개선이 핵심 목표
 */

// 화면 문구는 사전(js/i18n-ko.js·i18n-en.js 의 ms.*)에 있다(해외 3단계 E2 2부).
import { t } from './i18n.js?v=529';

/**
 * 대사건강 점수 계산 (100점 만점)
 * - 체지방 (25점): 체지방률(성별 기준) + 허리둘레÷키
 * - 근육 (25점): 골격근 비율 = 골격근량 ÷ 체중 (성별 기준)
 * - 인슐린 저항성 (25점): TyG index surrogate (공복혈당 + 중성지방)
 * - 생활습관 (25점): 최근 7일 식단질+운동+마음
 *
 * 2026-09-24 바꾼 것. 예전에는 "근지방비(골격근량÷체지방량)" 와 "내장지방 레벨" 이었다.
 * 내장지방 레벨은 회사마다 매기는 자가 달라서 — 같은 날 인바디·재다는 5~6,
 * Fitdays 는 3 — 기계를 바꾸기만 해도 점수가 한 칸(25점) 가까이 흔들렸다.
 * 체성분 기기들이 **같은 단위로 공통으로** 내는 값으로 바꿨다: 체지방률(%)과
 * 골격근량(kg)·체중(kg). 기계마다 조금씩 다르긴 해도 자 자체가 다르지는 않다.
 * 허리둘레는 줄자라 기계를 타지 않고, 대사증후군 기준에도 들어가는 값이라 함께 본다.
 * 근지방비는 체지방이 두 칸에 겹쳐 들어가서, 근육 칸은 근육만 보도록 나눴다.
 * 내장지방 레벨은 기록으로만 남고 점수에는 쓰지 않는다.
 *
 * @param {object} profile - healthProfile (sex, heightCm, weight, bodyFatPct, fat, smm, waistCm, hba1c …)
 * @param {object[]} recentLogs - 최근 7일 daily_logs
 * @param {object} latestMetrics - 최신 건강 지표 (weight, glucose, triglyceride …)
 * @returns {object} { total, breakdown, grade, insights }
 */
export function calculateMetabolicScore(profile = {}, recentLogs = [], latestMetrics = {}, bloodTest = null) {
    const insulin = resolveInsulinInputs(profile, recentLogs, latestMetrics, bloodTest);
    const breakdown = {
        bodyFat: calcBodyFatScore(profile, latestMetrics),
        muscle: calcMuscleScore(profile, latestMetrics),
        insulinResistance: calcInsulinResistanceScore(insulin.metrics, insulin.profile),
        lifestyle: calcLifestyleScore(recentLogs)
    };

    // 데이터가 있는 항목만으로 점수 계산 (100점 스케일)
    const categories = [breakdown.bodyFat, breakdown.muscle, breakdown.insulinResistance, breakdown.lifestyle];
    const available = categories.filter(c => !c.missing);
    let total;
    if (available.length === 0) {
        total = 0;
    } else {
        const rawSum = available.reduce((sum, c) => sum + c.score, 0);
        const maxPossible = available.length * 25;
        total = Math.round((rawSum / maxPossible) * 100);
    }
    const allMissing = available.length === 0;

    const grade = allMissing ? null : getGrade(total);
    const insights = generateInsights(breakdown, profile, recentLogs, latestMetrics);

    return { total, breakdown, grade, insights, allMissing, availableCount: available.length };
}

// ── 기준표 ─────────────────────────────────────────────────────────────
//
// 체지방률: American Council on Exercise 분류. "피트니스" 상단까지를 만점,
// "비만" 문턱을 12점에 둔다. 한국에서 흔히 쓰는 비만 기준(남 25%·여 30~32%)과 맞는다.
export const BODY_FAT_BANDS = Object.freeze({
    male: Object.freeze({ lean: 17, obese: 25 }),
    female: Object.freeze({ lean: 24, obese: 32 })
});

// 허리둘레 ÷ 키: 0.5 를 넘으면 복부비만·대사 위험 (성별과 무관하게 쓰는 경계).
export const WAIST_TO_HEIGHT = Object.freeze({ ideal: 0.45, risk: 0.5, high: 0.6 });

// 한국 복부비만 기준(대한비만학회): 남 90cm, 여 85cm 이상.
export const WAIST_CUTOFF_CM = Object.freeze({ male: 90, female: 85 });

// 골격근 비율(골격근량÷체중×100): Janssen 2002(J Am Geriatr Soc)의 근감소 분류.
// normal 이상이 정상, classII 이하가 2단계 근감소. 연구의 골격근량 추정식과
// 체성분 기기의 값이 똑같지는 않아서, 근육이 적은 쪽을 짚는 데 쓰고 많은 쪽을
// 더 칭찬하지는 않는다 — 정상이면 만점.
export const MUSCLE_RATIO_BANDS = Object.freeze({
    male: Object.freeze({ normal: 37.0, classII: 31.4 }),
    female: Object.freeze({ normal: 27.6, classII: 22.0 })
});

function num(value) {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeSex(value) {
    const sex = String(value || '').trim().toLowerCase();
    return sex === 'male' || sex === 'female' ? sex : null;
}

function round1(value) {
    return Math.round(value * 10) / 10;
}

/** 체중: 체성분과 함께 잰 값이 있으면 그것, 없으면 최근 일일 기록. */
function resolveWeight(profile, latestMetrics) {
    return num(profile.weight) ?? num(latestMetrics?.weight);
}

/** 체지방률: 기기가 준 % 가 있으면 그것, 없으면 체지방량(kg) ÷ 체중. */
function resolveBodyFatPct(profile, latestMetrics) {
    const direct = num(profile.bodyFatPct);
    if (direct !== null && direct <= 75) return direct;
    const fat = num(profile.fat);
    const weight = resolveWeight(profile, latestMetrics);
    if (fat !== null && weight !== null && fat < weight) {
        return round1((fat / weight) * 100);
    }
    return null;
}

function scoreBodyFatPct(pct, sex) {
    const band = BODY_FAT_BANDS[sex];
    if (pct <= band.lean) return 25;
    if (pct <= band.obese) return 25 - ((pct - band.lean) / (band.obese - band.lean)) * 13;
    return Math.max(5, 12 - ((pct - band.obese) / 5) * 7);
}

function scoreWaistToHeight(ratio) {
    const { ideal, risk, high } = WAIST_TO_HEIGHT;
    if (ratio <= ideal) return 25;
    if (ratio <= risk) return 25 - ((ratio - ideal) / (risk - ideal)) * 8;
    return Math.max(5, 17 - ((ratio - risk) / (high - risk)) * 12);
}

/**
 * 체지방 점수 (25점 만점)
 * 체지방률(성별 필요)과 허리둘레÷키(키 필요) 중 있는 것으로 매기고, 둘 다 있으면 평균.
 */
export function calcBodyFatScore(profile = {}, latestMetrics = {}) {
    const sex = normalizeSex(profile.sex);
    const pct = resolveBodyFatPct(profile, latestMetrics);
    const waist = num(profile.waistCm);
    const height = num(profile.heightCm);
    const whtr = waist !== null && height !== null ? Math.round((waist / height) * 100) / 100 : null;

    const parts = [];
    if (pct !== null && sex) parts.push(scoreBodyFatPct(pct, sex));
    if (whtr !== null) parts.push(scoreWaistToHeight(whtr));

    if (parts.length === 0) {
        const missingLabel = pct !== null && !sex
            ? t('ms.missing.sex')
            : t('ms.missing.bodyFat');
        return { score: 0, detail: t('ms.noData'), bodyFatPct: pct, whtr, missing: true, missingLabel };
    }

    const score = round1(parts.reduce((a, b) => a + b, 0) / parts.length);
    const overPct = pct !== null && sex && pct >= BODY_FAT_BANDS[sex].obese;
    const overWaist = (whtr !== null && whtr >= WAIST_TO_HEIGHT.risk)
        || (waist !== null && sex && waist >= WAIST_CUTOFF_CM[sex]);

    let detail;
    if (overPct && overWaist) detail = t('ms.bodyFat.both');
    else if (overWaist) detail = t('ms.bodyFat.waist');
    else if (overPct) detail = t('ms.bodyFat.pct');
    else if (score >= 22) detail = t('ms.bodyFat.great');
    else detail = t('ms.bodyFat.ok');

    return { score, detail, bodyFatPct: pct, whtr, waistCm: waist, overPct, overWaist };
}

/**
 * 근육 점수 (25점 만점)
 * 골격근 비율 = 골격근량 ÷ 체중 × 100. 성별 기준이 달라 성별이 필요하다.
 */
export function calcMuscleScore(profile = {}, latestMetrics = {}) {
    const sex = normalizeSex(profile.sex);
    const smm = num(profile.smm);
    const weight = resolveWeight(profile, latestMetrics);
    if (smm === null || weight === null || smm >= weight) {
        return { score: 0, detail: t('ms.noData'), ratio: null, missing: true, missingLabel: t('ms.missing.muscle') };
    }
    const ratio = round1((smm / weight) * 100);
    if (!sex) {
        return { score: 0, detail: t('ms.noData'), ratio, missing: true, missingLabel: t('ms.missing.sex') };
    }

    const band = MUSCLE_RATIO_BANDS[sex];
    let score;
    if (ratio >= band.normal) score = 25;
    else if (ratio > band.classII) score = 12 + ((ratio - band.classII) / (band.normal - band.classII)) * 13;
    else score = Math.max(5, 12 - ((band.classII - ratio) / 6) * 7);
    score = round1(score);

    let detail;
    if (ratio >= band.normal) detail = t('ms.muscle.good');
    else if (ratio > band.classII) detail = t('ms.muscle.fair');
    else detail = t('ms.muscle.low');

    return { score, detail, ratio, low: ratio < band.normal };
}

/** 최근 7일 기록에서 가장 나중에 적은 값 (recentLogs 는 날짜 오름차순). */
function latestFromLogs(recentLogs, field) {
    if (!Array.isArray(recentLogs)) return null;
    for (let i = recentLogs.length - 1; i >= 0; i--) {
        const v = num((recentLogs[i] && recentLogs[i].metrics || {})[field]);
        if (v !== null) return v;
    }
    return null;
}

/** 혈액검사 항목은 { value, unit, status, reference } 형태로 저장된다. */
function labValue(bloodTest, key) {
    if (!bloodTest) return null;
    const entry = bloodTest[key];
    if (entry === null || entry === undefined) return null;
    return num(typeof entry === 'object' ? entry.value : entry);
}

/**
 * 인슐린 칸에 쓸 공복혈당·중성지방·당화혈색소를 고른다.
 *
 * 2026-10-07: 예전에는 가장 최근 하루의 기록 하나와 프로필의 당화혈색소만 봤다. 그래서
 * 어제 공복혈당을 적고 오늘은 안 적었거나, 혈액검사 결과지로만 넣은 회원은 인슐린 칸이
 * "건강 지표 기록 필요" 로 비었다 — 같은 화면의 건강습관 점수(LE8)는 혈당을 100점으로
 * 매기고 있는데도. 건강습관 점수와 같은 순서로 읽는다: 최근 7일 기록 → 혈액검사.
 *
 * TyG 는 같은 때 잰 공복혈당과 중성지방을 짝지어야 뜻이 있다. 중성지방이 혈액검사에서
 * 왔으면 공복혈당도 그 혈액검사 것을 먼저 쓴다.
 */
function resolveInsulinInputs(profile = {}, recentLogs = [], latestMetrics = {}, bloodTest = null) {
    const metrics = latestMetrics || {};
    const logGlucose = latestFromLogs(recentLogs, 'glucose') ?? num(metrics.glucose);
    const logTg = latestFromLogs(recentLogs, 'triglyceride') ?? num(metrics.triglyceride);
    const labGlucose = labValue(bloodTest, 'glucose');
    const labTg = labValue(bloodTest, 'triglyceride');

    let glucose = logGlucose ?? labGlucose;
    let triglyceride = logTg;
    if (triglyceride === null && labTg !== null) {
        triglyceride = labTg;
        glucose = labGlucose ?? logGlucose;
    }

    return {
        metrics: {
            glucose,
            triglyceride,
            weight: latestFromLogs(recentLogs, 'weight') ?? num(metrics.weight)
        },
        profile: { ...profile, hba1c: num(profile && profile.hba1c) ?? labValue(bloodTest, 'hba1c') }
    };
}

/**
 * 인슐린 저항성 점수 (25점 만점)
 * TyG Index surrogate: ln(TG × FPG / 2) — 중성지방과 공복혈당
 * 중성지방 없으면 공복혈당 + 체중으로 대략 추정
 */
export function calcInsulinResistanceScore(metrics, profile) {
    const glucose = parseFloat(metrics.glucose);
    const tg = parseFloat(metrics.triglyceride);
    const weight = parseFloat(metrics.weight);
    const hba1c = parseFloat(profile.hba1c);

    // TyG index 계산 가능한 경우
    if (glucose && tg && glucose > 0 && tg > 0) {
        // TyG = ln(TG[mg/dL] × FPG[mg/dL] / 2)
        const tyg = Math.log(tg * glucose / 2);
        // 정상: <8.5, 경계: 8.5~9.0, 높음: >9.0
        let score = Math.min(25, Math.max(5, ((9.5 - tyg) / 1.5) * 20 + 5));
        score = Math.round(score * 10) / 10;

        let detail = '';
        if (tyg < 8.5) detail = t('ms.tyg.good');
        else if (tyg < 9.0) detail = t('ms.tyg.border');
        else detail = t('ms.tyg.high');

        return { score, detail, tyg: Math.round(tyg * 100) / 100, method: 'TyG' };
    }

    // 공복혈당만 있는 경우
    if (glucose) {
        // 정상 <100, 전당뇨 100~125, 당뇨 126+
        let score;
        if (glucose < 90) score = 25;
        else if (glucose < 100) score = 22;
        else if (glucose < 110) score = 17;
        else if (glucose < 126) score = 12;
        else score = 7;

        let detail = '';
        if (glucose < 100) detail = t('ms.fpg.good');
        else if (glucose < 126) detail = t('ms.fpg.border');
        else detail = t('ms.fpg.high');

        return { score, detail, glucose, method: 'FPG' };
    }

    // HbA1c만 있는 경우
    if (hba1c) {
        let score;
        if (hba1c < 5.7) score = 25;
        else if (hba1c < 6.0) score = 20;
        else if (hba1c < 6.5) score = 14;
        else score = 7;

        let detail = '';
        if (hba1c < 5.7) detail = t('ms.hba1c.good');
        else if (hba1c < 6.5) detail = t('ms.hba1c.border');
        else detail = t('ms.hba1c.high');

        return { score, detail, hba1c, method: 'HbA1c' };
    }

    return { score: 0, detail: t('ms.noData'), method: 'none', missing: true, missingLabel: t('ms.missing.insulin') };
}

/**
 * 생활습관 점수 (25점 만점)
 * 최근 7일 데이터 기반: 식단질 + 운동 + 마음
 */
export function calcLifestyleScore(recentLogs) {
    if (!recentLogs || recentLogs.length === 0) {
        return { score: 0, detail: t('ms.noRecords'), diet: 0, exercise: 0, mind: 0, missing: true, missingLabel: t('ms.missing.lifestyle') };
    }

    const total = Math.min(recentLogs.length, 7);

    // 식단 점수 (10점): 식단 기록 일수 / 7 × 10 (AI분석 등급 반영)
    let dietDays = 0;
    let dietGradeSum = 0;
    let dietGradeCount = 0;
    recentLogs.forEach(log => {
        const diet = log.diet || {};
        if (diet.breakfastUrl || diet.lunchUrl || diet.dinnerUrl) dietDays++;
        if (log.dietAnalysis) {
            const analyses = Object.values(log.dietAnalysis).filter(a => a && a.grade);
            analyses.forEach(a => {
                const gradeVal = { 'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1 }[a.grade] || 3;
                dietGradeSum += gradeVal;
                dietGradeCount++;
            });
        }
    });
    const dietFreq = (dietDays / total) * 5; // 빈도 5점 만점
    const dietQuality = dietGradeCount > 0 ? (dietGradeSum / dietGradeCount / 5) * 5 : 2.5; // 질 5점 만점
    const dietScore = Math.min(10, dietFreq + dietQuality);

    // 운동 점수 (8점): 유산소+근력 일수 / 7 × 8
    let exerciseDays = 0;
    let hasCardio = false, hasStrength = false;
    recentLogs.forEach(log => {
        const ex = log.exercise || {};
        const cardioCount = (ex.cardioList || []).length;
        const strengthCount = (ex.strengthList || []).length;
        if (cardioCount > 0 || strengthCount > 0) exerciseDays++;
        if (cardioCount > 0) hasCardio = true;
        if (strengthCount > 0) hasStrength = true;
    });
    let exerciseScore = (exerciseDays / total) * 6;
    // 유산소+근력 밸런스 보너스
    if (hasCardio && hasStrength) exerciseScore += 2;
    else if (hasCardio || hasStrength) exerciseScore += 1;
    exerciseScore = Math.min(8, exerciseScore);

    // 마음 점수 (7점): 수면+명상+감사일기
    let mindDays = 0;
    recentLogs.forEach(log => {
        const mind = log.sleepAndMind || {};
        if (mind.sleepImageUrl || mind.meditationDone || mind.gratitude) mindDays++;
    });
    const mindScore = Math.min(7, (mindDays / total) * 7);

    const score = Math.round((dietScore + exerciseScore + mindScore) * 10) / 10;

    let detail = '';
    if (score >= 20) detail = t('ms.lifestyle.great');
    else if (score >= 15) detail = t('ms.lifestyle.good');
    else if (score >= 10) detail = t('ms.lifestyle.fair');
    else detail = t('ms.lifestyle.low');

    return {
        score,
        detail,
        diet: Math.round(dietScore * 10) / 10,
        exercise: Math.round(exerciseScore * 10) / 10,
        mind: Math.round(mindScore * 10) / 10
    };
}

/**
 * 등급 판정
 */
export function getGrade(total) {
    if (total >= 85) return 'A';
    if (total >= 70) return 'B';
    if (total >= 55) return 'C';
    if (total >= 40) return 'D';
    return 'F';
}

/**
 * 상관관계 인사이트 생성
 */
function generateInsights(breakdown, profile, recentLogs, latestMetrics) {
    const insights = [];

    // 체지방 인사이트 — 허리둘레가 먼저다. 뱃살은 대사질환과 가장 가까운 신호다.
    const bf = breakdown.bodyFat;
    if (!bf.missing && bf.overWaist) {
        insights.push(t('ms.insight.waist'));
    } else if (!bf.missing && bf.overPct) {
        insights.push(t('ms.insight.bodyFat'));
    }

    // 근육 인사이트
    const ms = breakdown.muscle;
    if (!ms.missing && ms.low) {
        insights.push(t('ms.insight.muscleLow'));
    } else if (!ms.missing && !bf.missing && !bf.overPct && !bf.overWaist) {
        insights.push(t('ms.insight.balance'));
    }

    // 인슐린 저항성 인사이트
    if (breakdown.insulinResistance.method === 'FPG' && breakdown.insulinResistance.glucose >= 100) {
        insights.push(t('ms.insight.fpg'));
    }
    if (breakdown.insulinResistance.method === 'TyG' && breakdown.insulinResistance.tyg >= 8.5) {
        insights.push(t('ms.insight.tyg'));
    }

    // 생활습관 인사이트
    const ls = breakdown.lifestyle;
    if (ls.exercise < 4 && ls.score > 0) {
        insights.push(t('ms.insight.exercise'));
    }
    if (ls.mind < 3 && ls.score > 0) {
        insights.push(t('ms.insight.mind'));
    }

    // 상관관계 분석 (데이터가 충분할 때)
    if (recentLogs.length >= 3) {
        // 운동한 날 vs 안 한 날의 다음날 혈당 비교
        const glAfterEx = [], glAfterNoEx = [];
        for (let i = 0; i < recentLogs.length - 1; i++) {
            const nextGl = parseFloat(recentLogs[i + 1]?.metrics?.glucose);
            if (!nextGl) continue;
            const ex = recentLogs[i].exercise || {};
            const hadExercise = (ex.cardioList || []).length > 0 || (ex.strengthList || []).length > 0;
            if (hadExercise) glAfterEx.push(nextGl);
            else glAfterNoEx.push(nextGl);
        }
        if (glAfterEx.length >= 2 && glAfterNoEx.length >= 2) {
            const avgEx = glAfterEx.reduce((a, b) => a + b, 0) / glAfterEx.length;
            const avgNoEx = glAfterNoEx.reduce((a, b) => a + b, 0) / glAfterNoEx.length;
            if (avgNoEx > avgEx && avgNoEx - avgEx > 3) {
                const diff = Math.round(((avgNoEx - avgEx) / avgNoEx) * 100);
                insights.push(t('ms.insight.exerciseGlucose', { diff }));
            }
        }
    }

    return insights.slice(0, 3); // 최대 3개
}

// 사용법 6편 ⓘ (js/guide-help.js). 테스트처럼 window 가 없으면 아무것도 넣지 않는다.
function guideHelp(guideId) {
    return typeof window !== 'undefined' && typeof window.guideHelpButtonHtml === 'function'
        ? window.guideHelpButtonHtml(guideId)
        : '';
}

/**
 * 대사건강 점수 카드 HTML 렌더링
 */
export function renderMetabolicScoreCard(container, scoreData) {
    if (!container || !scoreData) return;

    const { total, breakdown, grade, insights, allMissing, availableCount } = scoreData;
    const gradeColors = { 'A': '#2E7D32', 'B': '#558B2F', 'C': '#F9A825', 'D': '#EF6C00', 'F': '#C62828' };
    const color = allMissing ? '#BDBDBD' : (gradeColors[grade] || '#888');

    // 원형 프로그레스 계산
    const circumference = 2 * Math.PI * 45;
    const offset = allMissing ? circumference : circumference - (total / 100) * circumference;

    const areaRaw = [
        { label: t('ms.area.bodyFat'), data: breakdown.bodyFat, max: 25, icon: '🔥' },
        { label: t('ms.area.muscle'), data: breakdown.muscle, max: 25, icon: '💪' },
        { label: t('ms.area.insulin'), data: breakdown.insulinResistance, max: 25, icon: '🧬' },
        { label: t('ms.area.lifestyle'), data: breakdown.lifestyle, max: 25, icon: '🌿' }
    ];

    const areasHtml = areaRaw.map(a => {
        if (a.data.missing) {
            return `<div class="ms-area-item ms-area-missing">
                <span class="ms-area-icon">${a.icon}</span>
                <span class="ms-area-label">${a.label}</span>
                <span class="ms-area-need">${a.data.missingLabel}</span>
            </div>`;
        }
        const pct = Math.round((a.data.score / a.max) * 100);
        return `<div class="ms-area-item">
            <span class="ms-area-icon">${a.icon}</span>
            <span class="ms-area-label">${a.label}</span>
            <div class="ms-area-bar-bg"><div class="ms-area-bar-fill" style="width:${pct}%;"></div></div>
            <span class="ms-area-val">${Math.round(a.data.score)}/${a.max}</span>
        </div>`;
    }).join('');

    const insightsHtml = insights.map(i => `<div class="ms-insight-item">${i}</div>`).join('');

    // 총점 영역: 데이터 없으면 안내 메시지
    const circleContent = allMissing
        ? `<div class="ms-circle-text">
               <div class="ms-circle-num" style="color:#BDBDBD;">—</div>
               <div class="ms-circle-label">${t('ms.circleEmpty')}</div>
           </div>`
        : `<div class="ms-circle-text">
               <div class="ms-circle-num" style="color:${color};">${total}</div>
               <div class="ms-circle-label">/ 100</div>
           </div>`;

    const partialNote = (!allMissing && availableCount < 4)
        ? `<div class="ms-partial-note">${t('ms.partialNote', { n: 4 - availableCount })}</div>`
        : '';

    container.innerHTML = `
        <div class="metabolic-score-card">
            <h3>${t('ms.title')} ${guideHelp('guide-06')}</h3>
            <div class="ms-score-row">
                <div class="ms-circle-wrap">
                    <svg class="ms-circle" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" fill="none" stroke="#E0E0E0" stroke-width="6"/>
                        <circle cx="50" cy="50" r="45" fill="none" stroke="${color}" stroke-width="6"
                            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                            stroke-linecap="round" transform="rotate(-90 50 50)"/>
                    </svg>
                    ${circleContent}
                </div>
                <div class="ms-areas">${areasHtml}</div>
            </div>
            ${partialNote}
            ${insightsHtml ? `<div class="ms-insights">${insightsHtml}</div>` : ''}
        </div>
    `;
    container.style.display = 'block';
}

// 전역 노출 (브라우저에서만 — 테스트가 이 모듈을 그대로 불러올 수 있게)
if (typeof window !== 'undefined') {
    window.calculateMetabolicScore = calculateMetabolicScore;
    window.renderMetabolicScoreCard = renderMetabolicScoreCard;
}
