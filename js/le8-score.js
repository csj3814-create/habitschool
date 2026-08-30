/**
 * le8-score.js
 * 건강습관 점수 — AHA Life's Essential 8 (LE8) 방식
 *
 * 대사질환과 암 예방 습관을 하나의 100점 척도로 본다.
 * LE8은 8개 항목을 각각 0~100점으로 매기고 단순 평균한다.
 *
 *   생활습관 4개 (자기보고·AI 추론): 식단 · 신체활동 · 니코틴 · 수면
 *   대사지표 4개 (계측·검사):        BMI · 혈중지질 · 혈당 · 혈압
 *
 * 객관성 수준이 다른 두 묶음을 한 숫자에 섞어 보여주지 않기 위해 UI에서도 나눠 표시한다.
 *
 * 정직성 제약 — 이 점수는 "LE8 방식"이지 AHA가 검증한 점수가 아니다.
 * 식단은 DASH/MEPA 설문 대신 사진 AI 등급을, 신체활동은 계측된 분 대신 걸음수·기록
 * 추정치를 쓴다. 두 항목은 대체지표이며 UI에 그렇게 표시한다.
 */

// ── LE8 배점표 (AHA 2022) ────────────────────────────────────────────────

/** 식단: AI 등급 5단계가 LE8 식단 5분위와 그대로 대응한다. */
const DIET_GRADE_POINTS = { A: 100, B: 80, C: 50, D: 25, F: 0 };

/**
 * 끼니별 가중치. 간식을 정식 한 끼와 똑같이 세면, 잘 차린 세 끼에 과자 한 장을
 * 정직하게 기록한 사람이 손해를 본다. 기록할수록 불리한 점수는 습관 앱에 해롭다.
 */
const SLOT_WEIGHTS = { breakfast: 1, lunch: 1, dinner: 1, snack: 0.5 };

/** 니코틴 노출 */
const NICOTINE_POINTS = {
    never: 100,
    quit_5y_plus: 75,
    quit_1_5y: 50,
    quit_under_1y: 25,
    current: 0
};

const NICOTINE_LABELS = {
    never: '비흡연',
    quit_5y_plus: '금연 5년 이상',
    quit_1_5y: '금연 1~5년',
    quit_under_1y: '금연 1년 미만',
    current: '흡연 중'
};

/** 복용 시 감점되는 약물 (LE8은 약으로 조절된 수치를 만점으로 보지 않는다) */
const MED_PENALTY = 20;

// ── 공통 유틸 ────────────────────────────────────────────────────────────

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
}

/** 혈액검사 항목은 { value, unit, status, reference } 형태로 저장된다. */
function labValue(bloodTest, key) {
    if (!bloodTest) return null;
    const entry = bloodTest[key];
    if (entry === null || entry === undefined) return null;
    if (typeof entry === 'object') return num(entry.value);
    return num(entry);
}

function hasMed(profile, name) {
    const meds = profile && profile.meds;
    return Array.isArray(meds) && meds.includes(name);
}

/** 약물 감점은 0점 아래로 내려가지 않는다. */
function applyMedPenalty(score, penalized) {
    return penalized ? Math.max(0, score - MED_PENALTY) : score;
}

/**
 * 빈 항목은 라벨만으로 끝내지 않고 '어느 탭 어느 칸'인지까지 들고 다닌다.
 * 무엇이 없는지 알려주면서 어디에 넣는지 안 알려주면 사용자가 앱을 뒤져야 한다.
 */
function missing(label, tab, focusId) {
    return { score: 0, detail: '데이터 없음', missing: true, missingLabel: label, tab, focusId };
}

/** 최근 로그에서 가장 마지막으로 기록된 지표 값을 찾는다 (뒤에서부터). */
function latestFromLogs(recentLogs, field) {
    if (!Array.isArray(recentLogs)) return null;
    for (let i = recentLogs.length - 1; i >= 0; i--) {
        const v = num((recentLogs[i] && recentLogs[i].metrics || {})[field]);
        if (v !== null) return v;
    }
    return null;
}

// ── 생활습관 4개 ─────────────────────────────────────────────────────────

/**
 * 식단 (0~100)
 * LE8 식단 항목은 "질"을 본다. 기록 빈도는 앱의 포인트·연속기록이 따로 다루므로
 * 여기서는 등급 평균만 쓴다. 표본이 너무 적으면 점수를 만들지 않는다.
 */
function calcDietScore(recentLogs) {
    let weightedSum = 0;
    let weightTotal = 0;
    let mealCount = 0;
    let dietDays = 0;

    (recentLogs || []).forEach(log => {
        const analysis = log && log.dietAnalysis;
        if (!analysis) return;
        let dayHadGrade = false;
        Object.entries(analysis).forEach(([slot, a]) => {
            if (!a || DIET_GRADE_POINTS[a.grade] === undefined) return;
            const weight = SLOT_WEIGHTS[slot] !== undefined ? SLOT_WEIGHTS[slot] : 1;
            weightedSum += DIET_GRADE_POINTS[a.grade] * weight;
            weightTotal += weight;
            mealCount++;
            dayHadGrade = true;
        });
        if (dayHadGrade) dietDays++;
    });

    if (mealCount < 3 || weightTotal === 0) {
        return missing('🥗 식단 사진 3끼 이상 필요', 'diet', 'txt-breakfast');
    }

    const score = Math.round(weightedSum / weightTotal);

    let detail;
    if (score >= 80) detail = '우수 — 자연식품 위주 식사가 잘 유지되고 있습니다';
    else if (score >= 50) detail = '보통 — 초가공식품을 조금 더 줄여보세요';
    else detail = '개선 필요 — 초가공식품 비중이 높습니다';

    return {
        score,
        detail: `${detail} (최근 ${dietDays}일 ${mealCount}끼 분석)`,
        proxy: true,
        mealCount
    };
}

/**
 * 신체활동 (0~100)
 * LE8은 주당 중강도 운동 분(minute)을 요구하지만 앱은 분을 받지 않는다.
 * 걸음수와 운동 기록에서 추정한다 — 어디까지나 추정치.
 *
 * 하루 분 = max(건강앱 활동분 또는 걸음수 추정분, 운동 기록 추정분)
 * 걸음수와 운동 사진이 같은 산책을 가리킬 수 있어 합치지 않고 큰 쪽만 쓴다.
 */
function calcActivityScore(recentLogs) {
    if (!Array.isArray(recentLogs) || recentLogs.length === 0) {
        return missing('🏃 운동·걸음수 기록 필요', 'exercise', 'step-card');
    }

    let weeklyMinutes = 0;
    let usedHealthApp = false;
    let hasSignal = false;

    recentLogs.forEach(log => {
        const steps = (log && log.steps) || {};
        const exercise = (log && log.exercise) || {};

        // 건강앱이 활동 분을 직접 주면 그대로 믿는다.
        let stepMinutes = num(steps.active_minutes);
        if (stepMinutes !== null) {
            usedHealthApp = true;
            hasSignal = true;
        } else {
            const count = num(steps.count);
            if (count !== null) hasSignal = true;
            // 일상 이동분(약 4000보)을 뺀 나머지를 의도적 활동으로 본다. 분당 100보.
            stepMinutes = count !== null ? Math.min(120, Math.max(0, (count - 4000) / 100)) : 0;
        }

        const mediaUnits = ((exercise.cardioList || []).length) + ((exercise.strengthList || []).length);
        if (mediaUnits > 0) hasSignal = true;
        const mediaMinutes = Math.min(90, mediaUnits * 30);

        weeklyMinutes += Math.max(stepMinutes, mediaMinutes);
    });

    // 걸음수도 운동 기록도 전혀 없으면 "안 움직였다"가 아니라 "모른다"이다.
    // 0점을 주면 걸음수를 연동하지 않은 사용자의 총점이 부당하게 깎인다.
    if (!hasSignal) {
        return missing('🏃 운동·걸음수 기록 필요', 'exercise', 'step-card');
    }

    weeklyMinutes = Math.round(weeklyMinutes);

    let score;
    if (weeklyMinutes >= 150) score = 100;
    else if (weeklyMinutes >= 120) score = 90;
    else if (weeklyMinutes >= 90) score = 80;
    else if (weeklyMinutes >= 60) score = 60;
    else if (weeklyMinutes >= 30) score = 40;
    else if (weeklyMinutes >= 1) score = 20;
    else score = 0;

    const source = usedHealthApp ? '건강앱 활동시간' : '걸음수·운동기록 추정';
    let detail;
    if (score >= 100) detail = '우수 — 주 150분 권장량을 채웠습니다';
    else if (score >= 60) detail = '보통 — 주 150분까지 조금 더 늘려보세요';
    else detail = '개선 필요 — 하루 30분 빠르게 걷기부터 시작해보세요';

    return {
        score,
        detail: `${detail} (주 ${weeklyMinutes}분, ${source})`,
        proxy: true,
        weeklyMinutes
    };
}

/** 니코틴 노출 (0~100) — 간접흡연 노출 시 20점 감점 */
function calcNicotineScore(profile) {
    const status = profile && profile.smokingStatus;
    if (!status || NICOTINE_POINTS[status] === undefined) {
        return missing('🚭 흡연 상태 입력 필요', 'profile', 'smoking-status-group');
    }

    const base = NICOTINE_POINTS[status];
    const secondhand = !!(profile && profile.secondhandSmoke);
    const score = Math.max(0, base - (secondhand ? 20 : 0));

    let detail = NICOTINE_LABELS[status];
    if (secondhand) detail += ' · 간접흡연 노출';
    if (status === 'never' && !secondhand) detail += ' — 최선의 상태입니다';
    else if (status === 'current') detail += ' — 금연이 가장 큰 개선 효과를 냅니다';

    return { score, detail, status };
}

/**
 * 수면 (0~100)
 * 수면 스크린샷 AI 분석에서 시간을 읽는다. 한 밤의 잡음이 점수를 정하지 않도록
 * 최소 2박이 있어야 계산한다.
 */
function calcSleepScore(recentLogs) {
    const hours = [];
    let usedManual = false;

    (recentLogs || []).forEach(log => {
        const sam = (log && log.sleepAndMind) || null;
        if (!sam) return;

        // 직접 입력한 수면 시간이 먼저다. AI 분석은 '🤖 AI 분석' 버튼을 눌러야만
        // 생기는 선택 동작이라, 그것에만 기대면 사진을 올려도 점수가 안 나온다.
        let h = num(sam.sleepHours);
        if (h !== null) {
            usedManual = true;
        } else {
            const details = sam.sleepAnalysis && sam.sleepAnalysis.details;
            if (details) {
                h = num(details.sleepHours) !== null
                    ? num(details.sleepHours)
                    : parseSleepDuration(details.sleepDuration);
            }
        }
        if (h !== null && h > 0 && h < 24) hours.push(h);
    });

    if (hours.length < 2) {
        return missing('🌙 수면 시간 2일 이상 필요', 'sleep', 'sleep-hours');
    }

    const avg = hours.reduce((a, b) => a + b, 0) / hours.length;

    let score;
    if (avg >= 7 && avg < 9) score = 100;
    else if (avg >= 9 && avg < 10) score = 90;
    else if (avg >= 6 && avg < 7) score = 70;
    else if ((avg >= 5 && avg < 6) || avg >= 10) score = 40;
    else if (avg >= 4 && avg < 5) score = 20;
    else score = 0;

    let detail;
    if (score === 100) detail = '우수 — 권장 수면시간(7~9시간)을 지키고 있습니다';
    else if (avg < 7) detail = '부족 — 수면 부족은 인슐린 저항성을 악화시킵니다';
    else detail = '과다 — 수면시간이 다소 깁니다';

    return {
        score,
        detail: `${detail} (평균 ${avg.toFixed(1)}시간, ${hours.length}일)`,
        proxy: !usedManual,
        avgHours: Math.round(avg * 10) / 10
    };
}

/** "7시간 30분", "7h 30m", "7.5" 같은 문자열에서 시간을 뽑는다. */
export function parseSleepDuration(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;

    const text = String(raw).trim();
    if (!text) return null;

    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:시간|h|H|hr)/);
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:분|m|M|min)/);

    if (hourMatch) {
        const h = parseFloat(hourMatch[1]);
        const m = minMatch ? parseFloat(minMatch[1]) : 0;
        return h + m / 60;
    }
    if (minMatch) return parseFloat(minMatch[1]) / 60;

    // "7:30" 형태
    const clock = text.match(/^(\d{1,2}):(\d{2})$/);
    if (clock) return parseInt(clock[1], 10) + parseInt(clock[2], 10) / 60;

    const bare = parseFloat(text);
    return Number.isFinite(bare) ? bare : null;
}

// ── 대사지표 4개 ─────────────────────────────────────────────────────────

/**
 * BMI (0~100)
 * 점수는 AHA 배점표로 계산한다 — 아시아 기준으로 바꾸면 국제 비교가 깨진다.
 * 다만 한국인에게는 아시아-태평양 기준이 더 맞으므로 설명 문구에 함께 적는다.
 */
function calcBmiScore(profile, recentLogs, latestMetrics) {
    const height = num(profile && profile.heightCm);
    const weight = latestFromLogs(recentLogs, 'weight') ?? num(latestMetrics && latestMetrics.weight);

    if (height === null) return missing('📏 키 입력 필요', 'profile', 'prof-height');
    if (weight === null) return missing('⚖️ 체중 기록 필요', 'diet', 'weight');

    const bmi = weight / Math.pow(height / 100, 2);

    let score;
    if (bmi < 25) score = 100;
    else if (bmi < 30) score = 70;
    else if (bmi < 35) score = 30;
    else if (bmi < 40) score = 15;
    else score = 0;

    // 아시아-태평양 기준 해석 (WHO 서태평양)
    let asian;
    if (bmi < 18.5) asian = '저체중';
    else if (bmi < 23) asian = '정상';
    else if (bmi < 25) asian = '과체중';
    else asian = '비만';

    return {
        score,
        detail: `BMI ${bmi.toFixed(1)} — 아시아 기준 ${asian}`,
        bmi: Math.round(bmi * 10) / 10
    };
}

/**
 * 혈중지질 (0~100) — non-HDL 콜레스테롤
 * non-HDL = 총콜레스테롤 − HDL. 총콜레스테롤이 없으면 LDL + 30으로 근사한다.
 */
function calcLipidScore(profile, bloodTest) {
    // 혈액검사 결과지가 있으면 그쪽이 먼저. 없으면 직접 입력한 값을 쓴다 —
    // 콜레스테롤은 가정용 기기로 잴 수 없어 검사지 업로드만 길로 두면 영영 빈칸이다.
    const total = labValue(bloodTest, 'totalCholesterol') ?? num(profile && profile.totalCholesterol);
    const hdl = labValue(bloodTest, 'hdl') ?? num(profile && profile.hdl);
    const ldl = labValue(bloodTest, 'ldl') ?? num(profile && profile.ldl);

    let nonHdl = null;
    let approximated = false;
    if (total !== null && hdl !== null) {
        nonHdl = total - hdl;
    } else if (ldl !== null) {
        nonHdl = ldl + 30;
        approximated = true;
    }

    if (nonHdl === null) return missing('🩸 콜레스테롤 수치 필요', 'profile', 'prof-total-chol');

    let score;
    if (nonHdl < 130) score = 100;
    else if (nonHdl < 160) score = 60;
    else if (nonHdl < 190) score = 40;
    else if (nonHdl < 220) score = 20;
    else score = 0;

    const onStatin = hasMed(profile, '고지혈증약');
    score = applyMedPenalty(score, onStatin);

    let detail = `non-HDL ${Math.round(nonHdl)} mg/dL`;
    if (approximated) detail += ' (LDL 기반 추정)';
    if (onStatin) detail += ' · 고지혈증약 복용 중';

    return { score, detail, nonHdl: Math.round(nonHdl), approximated };
}

/**
 * 혈당 (0~100) — HbA1c 우선, 없으면 공복혈당
 * 당뇨 여부에 따라 배점표가 달라진다. 당뇨약 복용은 당뇨로 본다.
 */
function calcGlucoseScore(profile, recentLogs, latestMetrics, bloodTest) {
    const hba1c = num(profile && profile.hba1c) ?? labValue(bloodTest, 'hba1c');
    const fpg = latestFromLogs(recentLogs, 'glucose')
        ?? num(latestMetrics && latestMetrics.glucose)
        ?? labValue(bloodTest, 'glucose');

    if (hba1c === null && fpg === null) return missing('🩸 혈당 기록 필요', 'diet', 'glucose');

    const onDiabetesMed = hasMed(profile, '당뇨약');
    const diabetic = onDiabetesMed
        || (hba1c !== null && hba1c >= 6.5)
        || (hba1c === null && fpg !== null && fpg >= 126);

    let score;
    let detail;

    if (!diabetic) {
        // 비당뇨: HbA1c 5.7 미만 만점, 전당뇨 구간 60점
        const prediabetic = hba1c !== null ? hba1c >= 5.7 : fpg >= 100;
        score = prediabetic ? 60 : 100;
        detail = prediabetic ? '전당뇨 범위 — 관리가 필요합니다' : '정상 범위입니다';
    } else {
        // 당뇨: HbA1c 수준에 따라 40 → 0
        const a1c = hba1c !== null ? hba1c : 7.5; // 약만 알고 수치가 없으면 중간값 가정
        if (a1c < 7.0) score = 40;
        else if (a1c < 8.0) score = 30;
        else if (a1c < 9.0) score = 20;
        else if (a1c < 10.0) score = 10;
        else score = 0;
        detail = '당뇨 범위 — 의료진과 상의하세요';
        if (onDiabetesMed) detail += ' · 당뇨약 복용 중';
    }

    const measure = hba1c !== null ? `HbA1c ${hba1c}%` : `공복혈당 ${Math.round(fpg)} mg/dL`;
    return { score, detail: `${measure} — ${detail}`, hba1c, fpg, diabetic };
}

/** 혈압 (0~100) — 고혈압약 복용 시 20점 감점 */
function calcBpScore(profile, recentLogs, latestMetrics) {
    const sbp = latestFromLogs(recentLogs, 'bpSystolic') ?? num(latestMetrics && latestMetrics.bpSystolic);
    const dbp = latestFromLogs(recentLogs, 'bpDiastolic') ?? num(latestMetrics && latestMetrics.bpDiastolic);

    if (sbp === null || dbp === null) return missing('🩺 혈압 기록 필요', 'diet', 'bp-systolic');

    // 나쁜 구간부터 따진다 — 수축기와 이완기 중 나쁜 쪽이 등급을 정한다.
    let score;
    if (sbp >= 160 || dbp >= 100) score = 0;
    else if (sbp >= 140 || dbp >= 90) score = 25;
    else if (sbp >= 130 || dbp >= 80) score = 50;
    else if (sbp >= 120) score = 75;
    else score = 100;

    const onBpMed = hasMed(profile, '고혈압약');
    score = applyMedPenalty(score, onBpMed);

    let detail = `${Math.round(sbp)}/${Math.round(dbp)} mmHg`;
    if (score >= 100) detail += ' — 정상입니다';
    else if (sbp >= 140 || dbp >= 90) detail += ' — 고혈압 범위입니다';
    else detail += ' — 주의 범위입니다';
    if (onBpMed) detail += ' · 고혈압약 복용 중';

    return { score, detail, systolic: sbp, diastolic: dbp };
}

// ── 총점 ─────────────────────────────────────────────────────────────────

/** 총점을 보여주기 위한 최소 데이터 요건 */
const MIN_BEHAVIORS = 2;
const MIN_FACTORS = 2;

/**
 * 건강습관 점수 (LE8 방식, 100점)
 *
 * @param {object} profile      users/{uid}.healthProfile
 * @param {object[]} recentLogs 최근 7일 daily_logs (날짜 오름차순)
 * @param {object} latestMetrics 최신 지표 폴백
 * @param {object} bloodTest    최신 혈액검사 문서
 */
export function calculateLE8Score(profile = {}, recentLogs = [], latestMetrics = {}, bloodTest = null) {
    const behaviors = {
        diet: calcDietScore(recentLogs),
        activity: calcActivityScore(recentLogs),
        nicotine: calcNicotineScore(profile),
        sleep: calcSleepScore(recentLogs)
    };

    const factors = {
        bmi: calcBmiScore(profile, recentLogs, latestMetrics),
        lipids: calcLipidScore(profile, bloodTest),
        glucose: calcGlucoseScore(profile, recentLogs, latestMetrics, bloodTest),
        bp: calcBpScore(profile, recentLogs, latestMetrics)
    };

    const availBehaviors = Object.values(behaviors).filter(c => !c.missing);
    const availFactors = Object.values(factors).filter(c => !c.missing);

    // 혈압 하나만 재고 100점을 받는 오해를 막는다.
    const sufficient = availBehaviors.length >= MIN_BEHAVIORS && availFactors.length >= MIN_FACTORS;

    const available = availBehaviors.concat(availFactors);
    const total = sufficient
        ? Math.round(available.reduce((sum, c) => sum + c.score, 0) / available.length)
        : null;

    const behaviorScore = availBehaviors.length
        ? Math.round(availBehaviors.reduce((s, c) => s + c.score, 0) / availBehaviors.length)
        : null;
    const factorScore = availFactors.length
        ? Math.round(availFactors.reduce((s, c) => s + c.score, 0) / availFactors.length)
        : null;

    return {
        total,
        level: total === null ? null : getLevel(total),
        behaviors,
        factors,
        behaviorScore,
        factorScore,
        sufficient,
        availableCount: available.length,
        neededBehaviors: Math.max(0, MIN_BEHAVIORS - availBehaviors.length),
        neededFactors: Math.max(0, MIN_FACTORS - availFactors.length),
        insights: generateInsights(behaviors, factors)
    };
}

/** LE8 표준 구간 */
export function getLevel(total) {
    if (total >= 80) return { key: 'high', label: '우수', color: '#2E7D32' };
    if (total >= 50) return { key: 'moderate', label: '보통', color: '#F9A825' };
    return { key: 'low', label: '낮음', color: '#C62828' };
}

/**
 * 구간이 무슨 뜻인지. 숫자만 보여주면 90점이 좋은 건지 나쁜 건지 알 수 없다.
 * 개인의 발병 확률이 아니라 '습관이 어느 구간에 있는지'만 말한다.
 */
const LEVEL_MEANING = {
    high: '국제 기준(LE8)에서 상위 구간입니다. 대규모 코호트 연구에서 이 구간을 유지한 사람들은 대사질환과 암을 포함한 만성질환 없이 지낸 기간이 뚜렷하게 길었습니다. 지금의 습관을 유지하는 것이 최선의 예방입니다.',
    moderate: '중간 구간입니다. 대부분의 사람이 여기에 있고, 개선 여지가 가장 큰 구간이기도 합니다. 아래에서 가장 낮은 항목 하나만 올려도 총점이 눈에 띄게 움직입니다.',
    low: '개선이 필요한 구간입니다. 한꺼번에 다 바꾸려 하기보다 아래 항목 중 가장 낮은 것 하나를 골라 시작하는 편이 오래 갑니다.'
};

/** 가장 개선 여지가 큰 항목부터 최대 3개를 짚는다. */
function generateInsights(behaviors, factors) {
    const labels = {
        diet: '식단', activity: '신체활동', nicotine: '금연', sleep: '수면',
        bmi: '체중(BMI)', lipids: '혈중지질', glucose: '혈당', bp: '혈압'
    };
    const tips = {
        diet: '초가공식품을 자연식품으로 바꾸는 것이 가장 빠른 개선입니다.',
        activity: '주 150분(하루 20분 남짓) 빠르게 걷기가 목표입니다.',
        nicotine: '금연은 단일 항목 중 대사질환·암 위험을 가장 크게 낮춥니다.',
        sleep: '7~9시간 수면은 인슐린 저항성 개선의 핵심입니다.',
        bmi: '체중 5~10% 감량만으로도 대사지표가 뚜렷하게 좋아집니다.',
        lipids: '포화지방을 줄이고 식이섬유를 늘리면 non-HDL이 내려갑니다.',
        glucose: '식후 걷기와 초가공식품 줄이기가 혈당에 직접 작용합니다.',
        bp: '나트륨 줄이기와 규칙적 유산소 운동이 혈압을 낮춥니다.'
    };

    // 구간 의의는 LEVEL_MEANING 이 카드 위쪽에서 이미 말한다. 여기서 또 하면
    // 같은 문장이 한 화면에 두 번 나온다. 여기는 '무엇을 올릴지'만 다룬다.
    const insights = [];

    const all = Object.entries({ ...behaviors, ...factors })
        .filter(([, c]) => !c.missing && c.score < 100)
        .sort((a, b) => a[1].score - b[1].score);

    all.slice(0, 3).forEach(([key, c]) => {
        insights.push(`${labels[key]} ${c.score}점 — ${tips[key]}`);
    });

    return insights.slice(0, 3);
}

// ── 렌더링 ───────────────────────────────────────────────────────────────
// 기존 대사건강 점수 카드(ms-*)의 스타일을 그대로 재사용한다.

function renderRows(group, labelMap) {
    return Object.entries(group).map(([key, data]) => {
        const label = labelMap[key];
        if (data.missing) {
            // 목적지를 아는 항목은 눌러서 바로 그 칸으로 갈 수 있게 한다.
            const clickable = data.tab && data.focusId;
            const attrs = clickable
                ? ` class="ms-area-item ms-area-missing le8-area-actionable" role="button" tabindex="0"`
                  + ` aria-label="${escapeAttr(label)} — ${escapeAttr(data.missingLabel)}. 입력하러 가기"`
                  + ` onclick="window.focusLE8Field &amp;&amp; window.focusLE8Field('${data.tab}','${data.focusId}')"`
                  + ` onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.focusLE8Field&amp;&amp;window.focusLE8Field('${data.tab}','${data.focusId}')}"`
                : ` class="ms-area-item ms-area-missing"`;
            return `<div${attrs}>
                <span class="ms-area-icon">${labelMap[key + '_icon'] || '•'}</span>
                <span class="ms-area-label">${label}</span>
                <span class="ms-area-need">${data.missingLabel}${clickable ? ' <span class="le8-go">›</span>' : ''}</span>
            </div>`;
        }
        const proxy = data.proxy ? '<span style="color:#aaa;" aria-hidden="true">*</span>' : '';
        return `<div class="ms-area-item" title="${escapeAttr(data.detail)}">
            <span class="ms-area-icon">${labelMap[key + '_icon'] || '•'}</span>
            <span class="ms-area-label">${label}${proxy}</span>
            <div class="ms-area-bar-bg"><div class="ms-area-bar-fill" style="width:${data.score}%;"></div></div>
            <span class="ms-area-val">${data.score}</span>
        </div>`;
    }).join('');
}

function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

const BEHAVIOR_LABELS = {
    diet: '식단', diet_icon: '🥗',
    activity: '신체활동', activity_icon: '🏃',
    nicotine: '금연', nicotine_icon: '🚭',
    sleep: '수면', sleep_icon: '🌙'
};

const FACTOR_LABELS = {
    bmi: '체중(BMI)', bmi_icon: '⚖️',
    lipids: '혈중지질', lipids_icon: '🧈',
    glucose: '혈당', glucose_icon: '🩸',
    bp: '혈압', bp_icon: '🩺'
};

export function renderLE8ScoreCard(container, scoreData) {
    if (!container || !scoreData) return;

    const { total, level, behaviors, factors, behaviorScore, factorScore,
            sufficient, insights, neededBehaviors, neededFactors } = scoreData;

    const color = sufficient ? level.color : '#BDBDBD';
    const circumference = 2 * Math.PI * 45;
    const offset = sufficient ? circumference - (total / 100) * circumference : circumference;

    const circleContent = sufficient
        ? `<div class="ms-circle-text">
               <div class="ms-circle-num" style="color:${color};">${total}</div>
               <div class="ms-circle-label">/ 100<br>${level.label}</div>
           </div>`
        : `<div class="ms-circle-text">
               <div class="ms-circle-num" style="color:#BDBDBD;">—</div>
               <div class="ms-circle-label">데이터 입력 후<br>점수 확인</div>
           </div>`;

    const need = [];
    if (neededBehaviors > 0) need.push(`생활습관 ${neededBehaviors}개`);
    if (neededFactors > 0) need.push(`대사지표 ${neededFactors}개`);
    const partialNote = !sufficient
        ? `<div class="ms-partial-note">📌 ${need.join(', ')}를 더 기록하면 점수를 계산할 수 있어요</div>`
        : '';

    const groupHeader = (title, sub, score) =>
        `<div class="le8-group-head">
            <span>${title}</span>
            <span class="le8-group-sub">${sub}</span>
            ${score !== null ? `<span class="le8-group-score">${score}</span>` : ''}
        </div>`;

    const insightsHtml = (insights || []).map(i => `<div class="ms-insight-item">${i}</div>`).join('');

    // 구간 눈금자 — 0~50~80~100 중 내가 어디인지 한눈에 보이게 한다.
    const meaningHtml = sufficient
        ? `<div class="le8-meaning">
               <div class="le8-scale">
                   <div class="le8-scale-bar">
                       <span class="le8-scale-seg le8-seg-low"></span>
                       <span class="le8-scale-seg le8-seg-mid"></span>
                       <span class="le8-scale-seg le8-seg-high"></span>
                       <span class="le8-scale-marker" style="left:${Math.min(100, Math.max(0, total))}%;"></span>
                   </div>
                   <div class="le8-scale-labels">
                       <span>낮음 0~49</span><span>보통 50~79</span><span>우수 80~100</span>
                   </div>
               </div>
               <p class="le8-meaning-text"><strong style="color:${color};">${level.label}</strong> — ${LEVEL_MEANING[level.key]}</p>
           </div>`
        : '';

    container.innerHTML = `
        <div class="metabolic-score-card">
            <h3>🌿 나의 건강습관 점수
                <span style="font-size:11px; font-weight:400; color:#999;">AHA Life's Essential 8 방식</span>
            </h3>
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
                <div class="ms-areas" style="flex:1;">
                    ${groupHeader('생활습관', '기록·AI 분석', sufficient ? behaviorScore : null)}
                    ${renderRows(behaviors, BEHAVIOR_LABELS)}
                    ${groupHeader('대사지표', '측정·검사값', sufficient ? factorScore : null)}
                    ${renderRows(factors, FACTOR_LABELS)}
                </div>
            </div>
            ${partialNote}
            ${meaningHtml}
            ${insightsHtml ? `<div class="ms-insights">${insightsHtml}</div>` : ''}
            <div class="le8-footnote">
                <strong>*</strong> 식단·신체활동·수면은 사진과 기록에서 <strong>추정</strong>한 값이라
                검사 수치와 성격이 다릅니다.<br>
                대사질환·암 예방 습관과 관련해 국제적으로 쓰이는 지표(AHA Life's Essential 8)의
                계산 방식을 따랐습니다. 개인의 질병 위험을 진단하거나 예측하는 값이 아닙니다.
            </div>
        </div>
    `;
    container.style.display = 'block';
}

/**
 * 빈 항목에서 해당 입력칸으로 데려가 붉게 표시한다.
 * 탭 전환이 DOM을 다시 그리므로 한 프레임 기다린 뒤 대상을 찾는다.
 */
function focusLE8Field(tab, focusId) {
    if (tab && typeof window.openTab === 'function') {
        try { window.openTab(tab); } catch (_) { /* 탭 전환 실패해도 강조는 시도한다 */ }
    }

    setTimeout(() => {
        const el = document.getElementById(focusId);
        if (!el) return;

        // 입력칸이면 그 칸을, 아니면 그 칸이 속한 카드를 통째로 표시한다.
        const isField = typeof el.matches === 'function' && el.matches('input, select, textarea');
        const marked = isField ? el : (el.closest('.card') || el);

        marked.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // 같은 항목을 두 번 눌렀을 때도 애니메이션이 다시 돌게 한다.
        marked.classList.remove('le8-needs-input');
        void marked.offsetWidth;
        marked.classList.add('le8-needs-input');

        if (isField) {
            try { el.focus({ preventScroll: true }); } catch (_) { el.focus(); }
        }

        window.setTimeout(() => marked.classList.remove('le8-needs-input'), 4000);
    }, 250);
}

// 전역 노출
if (typeof window !== 'undefined') {
    window.calculateLE8Score = calculateLE8Score;
    window.renderLE8ScoreCard = renderLE8ScoreCard;
    window.focusLE8Field = focusLE8Field;
}
