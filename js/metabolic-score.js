/**
 * metabolic-score.js
 * 대사건강 점수 모듈
 * 인슐린 저항성 개선이 핵심 목표
 */

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
export function calculateMetabolicScore(profile = {}, recentLogs = [], latestMetrics = {}) {
    const breakdown = {
        bodyFat: calcBodyFatScore(profile, latestMetrics),
        muscle: calcMuscleScore(profile, latestMetrics),
        insulinResistance: calcInsulinResistanceScore(latestMetrics, profile),
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
            ? '⚧ 성별 입력 필요'
            : '🔥 체지방률 또는 허리둘레 필요';
        return { score: 0, detail: '데이터 없음', bodyFatPct: pct, whtr, missing: true, missingLabel };
    }

    const score = round1(parts.reduce((a, b) => a + b, 0) / parts.length);
    const overPct = pct !== null && sex && pct >= BODY_FAT_BANDS[sex].obese;
    const overWaist = (whtr !== null && whtr >= WAIST_TO_HEIGHT.risk)
        || (waist !== null && sex && waist >= WAIST_CUTOFF_CM[sex]);

    let detail;
    if (overPct && overWaist) detail = '주의 — 체지방률과 허리둘레가 모두 기준을 넘었습니다';
    else if (overWaist) detail = '주의 — 허리둘레가 복부비만 기준을 넘었습니다';
    else if (overPct) detail = '주의 — 체지방률이 비만 기준을 넘었습니다';
    else if (score >= 22) detail = '우수 — 체지방이 건강한 범위입니다';
    else detail = '양호 — 정상 범위입니다';

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
        return { score: 0, detail: '데이터 없음', ratio: null, missing: true, missingLabel: '💪 골격근량·체중 필요' };
    }
    const ratio = round1((smm / weight) * 100);
    if (!sex) {
        return { score: 0, detail: '데이터 없음', ratio, missing: true, missingLabel: '⚧ 성별 입력 필요' };
    }

    const band = MUSCLE_RATIO_BANDS[sex];
    let score;
    if (ratio >= band.normal) score = 25;
    else if (ratio > band.classII) score = 12 + ((ratio - band.classII) / (band.normal - band.classII)) * 13;
    else score = Math.max(5, 12 - ((band.classII - ratio) / 6) * 7);
    score = round1(score);

    let detail;
    if (ratio >= band.normal) detail = '양호 — 체중에 비해 근육이 충분합니다';
    else if (ratio > band.classII) detail = '보통 — 근육을 조금 더 늘리면 좋습니다';
    else detail = '주의 — 체중에 비해 근육이 적습니다';

    return { score, detail, ratio, low: ratio < band.normal };
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
        if (tyg < 8.5) detail = '양호 — 인슐린 저항성이 낮습니다';
        else if (tyg < 9.0) detail = '경계 — 인슐린 저항성이 다소 높습니다';
        else detail = '주의 — 인슐린 저항성 개선이 필요합니다';

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
        if (glucose < 100) detail = '양호 — 공복혈당이 정상 범위입니다';
        else if (glucose < 126) detail = '경계 — 전당뇨 범위로 관리가 필요합니다';
        else detail = '주의 — 당뇨 범위입니다. 의사와 상담하세요';

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
        if (hba1c < 5.7) detail = '양호 — 당화혈색소가 정상입니다';
        else if (hba1c < 6.5) detail = '경계 — 전당뇨 범위입니다';
        else detail = '주의 — 당뇨 범위입니다';

        return { score, detail, hba1c, method: 'HbA1c' };
    }

    return { score: 0, detail: '데이터 없음', method: 'none', missing: true, missingLabel: '🩸 건강 지표 기록 필요' };
}

/**
 * 생활습관 점수 (25점 만점)
 * 최근 7일 데이터 기반: 식단질 + 운동 + 마음
 */
export function calcLifestyleScore(recentLogs) {
    if (!recentLogs || recentLogs.length === 0) {
        return { score: 0, detail: '기록 없음', diet: 0, exercise: 0, mind: 0, missing: true, missingLabel: '📝 생활 기록 필요' };
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
    if (score >= 20) detail = '우수 — 생활습관이 매우 좋습니다';
    else if (score >= 15) detail = '양호 — 꾸준히 잘 하고 있습니다';
    else if (score >= 10) detail = '보통 — 조금 더 꾸준히 기록해보세요';
    else detail = '개선 필요 — 꾸준한 기록이 변화의 시작입니다';

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
        insights.push('📏 허리둘레가 복부비만 기준(남 90cm·여 85cm, 또는 키의 절반)을 넘었습니다. 빠르게 걷기 같은 유산소 운동과 초가공식품 줄이기가 뱃살을 줄이는 데 가장 효과적입니다.');
    } else if (!bf.missing && bf.overPct) {
        insights.push('🔥 체지방률이 비만 기준(남 25%·여 32%)을 넘었습니다. 유산소와 근력 운동을 함께 하고 자연식품 위주로 먹어 보세요.');
    }

    // 근육 인사이트
    const ms = breakdown.muscle;
    if (!ms.missing && ms.low) {
        insights.push('💪 체중에 비해 근육이 적은 편입니다. 주 2회 이상 근력 운동과 끼니마다 단백질이 근육을 지키는 데 도움됩니다.');
    } else if (!ms.missing && !bf.missing && !bf.overPct && !bf.overWaist) {
        insights.push('✅ 근육과 체지방 균형이 좋습니다! 지금의 운동과 식단 습관을 유지하세요.');
    }

    // 인슐린 저항성 인사이트
    if (breakdown.insulinResistance.method === 'FPG' && latestMetrics.glucose >= 100) {
        insights.push('🩸 공복혈당이 경계 수준입니다. 초가공식품을 줄이고 섬유질 풍부 식품을 늘려보세요.');
    }
    if (breakdown.insulinResistance.method === 'TyG' && breakdown.insulinResistance.tyg >= 8.5) {
        insights.push('🧬 인슐린 저항성 지표가 높습니다. 자연식품 비율을 높이고 규칙적 운동이 도움됩니다.');
    }

    // 생활습관 인사이트
    const ls = breakdown.lifestyle;
    if (ls.exercise < 4 && ls.score > 0) {
        insights.push('🏃 이번 주 운동 빈도가 낮습니다. 하루 30분 빠르게 걷기부터 시작해보세요.');
    }
    if (ls.mind < 3 && ls.score > 0) {
        insights.push('🧘 수면과 명상 기록이 부족합니다. 질 좋은 수면은 인슐린 저항성 개선에 핵심입니다.');
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
                insights.push(`📊 운동한 다음날은 공복혈당이 평균 ${diff}% 낮았습니다. 운동의 효과가 보입니다!`);
            }
        }
    }

    return insights.slice(0, 3); // 최대 3개
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
        { label: '체지방', data: breakdown.bodyFat, max: 25, icon: '🔥' },
        { label: '근육', data: breakdown.muscle, max: 25, icon: '💪' },
        { label: '인슐린', data: breakdown.insulinResistance, max: 25, icon: '🧬' },
        { label: '생활습관', data: breakdown.lifestyle, max: 25, icon: '🌿' }
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
               <div class="ms-circle-label">데이터 입력 후<br>점수 확인</div>
           </div>`
        : `<div class="ms-circle-text">
               <div class="ms-circle-num" style="color:${color};">${total}</div>
               <div class="ms-circle-label">/ 100</div>
           </div>`;

    const partialNote = (!allMissing && availableCount < 4)
        ? `<div class="ms-partial-note">📌 ${4 - availableCount}개 항목의 데이터를 추가하면 더 정확한 점수를 확인할 수 있어요</div>`
        : '';

    container.innerHTML = `
        <div class="metabolic-score-card">
            <h3>🧬 대사건강 점수</h3>
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
