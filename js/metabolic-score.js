/**
 * metabolic-score.js
 * 대사건강 점수 계산 모듈
 * 인슐린 저항성 개선이 핵심 목표
 */

/**
 * 대사건강 점수 계산 (100점 만점)
 * - 근지방비 (25점): 골격근량 ÷ 체지방량
 * - 내장지방 (25점): 내장지방 레벨
 * - 인슐린 저항성 (25점): TyG index surrogate (공복혈당 + 체중 기반)
 * - 생활습관 (25점): 최근 7일 식단질+운동+마음
 * 
 * @param {object} profile - 사용자 프로필 (smm, fat, visceral, hba1c 등)
 * @param {object[]} recentLogs - 최근 7일 daily_logs
 * @param {object} latestMetrics - 최신 건강 지표 (weight, glucose, bp 등)
 * @returns {object} { total, breakdown, grade, insights }
 */
export function calculateMetabolicScore(profile = {}, recentLogs = [], latestMetrics = {}) {
    const breakdown = {
        muscleFat: calcMuscleFatScore(profile),
        visceralFat: calcVisceralFatScore(profile),
        insulinResistance: calcInsulinResistanceScore(latestMetrics, profile),
        lifestyle: calcLifestyleScore(recentLogs)
    };

    // 데이터가 있는 항목만으로 점수 계산 (100점 스케일)
    const categories = [breakdown.muscleFat, breakdown.visceralFat, breakdown.insulinResistance, breakdown.lifestyle];
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

/**
 * 근지방비 점수 (25점 만점)
 * 남성 근지방비 정상: 1.5~2.0+, 여성: 1.2~1.5+
 * 데이터 없으면 기본 12.5점 (중간)
 */
function calcMuscleFatScore(profile) {
    const smm = parseFloat(profile.smm);
    const fat = parseFloat(profile.fat);
    if (!smm || !fat || fat <= 0) {
        return { score: 0, detail: '데이터 없음', ratio: null, missing: true, missingLabel: '📋 인바디 데이터 필요' };
    }
    const ratio = smm / fat;
    // 2.0 이상 → 25점, 1.0 미만 → 5점
    let score = Math.min(25, Math.max(5, ((ratio - 0.5) / 1.5) * 20 + 5));
    score = Math.round(score * 10) / 10;

    let detail = '';
    if (ratio >= 2.0) detail = '우수 — 근육량이 체지방 대비 충분합니다';
    else if (ratio >= 1.5) detail = '양호 — 근지방비가 건강한 수준입니다';
    else if (ratio >= 1.0) detail = '보통 — 근지방비 개선이 도움됩니다';
    else detail = '개선 필요 — 근육 증가와 체지방 감소가 필요합니다';

    return { score, detail, ratio: Math.round(ratio * 100) / 100 };
}

/**
 * 내장지방 점수 (25점 만점)
 * 정상: 1~9, 높음: 10~14, 매우 높음: 15+
 */
function calcVisceralFatScore(profile) {
    const visceral = parseFloat(profile.visceral);
    if (!visceral) {
        return { score: 0, detail: '데이터 없음', level: null, missing: true, missingLabel: '📋 인바디 데이터 필요' };
    }
    // 1~5 → 25점, 15+ → 5점
    let score = Math.min(25, Math.max(5, ((15 - visceral) / 10) * 20 + 5));
    score = Math.round(score * 10) / 10;

    let detail = '';
    if (visceral <= 5) detail = '우수 — 내장지방이 매우 낮습니다';
    else if (visceral <= 9) detail = '양호 — 정상 범위입니다';
    else if (visceral <= 14) detail = '주의 — 대사질환 위험이 높아집니다';
    else detail = '위험 — 적극적인 내장지방 감소가 필요합니다';

    return { score, detail, level: visceral };
}

/**
 * 인슐린 저항성 점수 (25점 만점)
 * TyG Index surrogate: ln(TG × FPG / 2) — 중성지방과 공복혈당
 * 중성지방 없으면 공복혈당 + 체중으로 대략 추정
 */
function calcInsulinResistanceScore(metrics, profile) {
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
function calcLifestyleScore(recentLogs) {
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
function getGrade(total) {
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

    // 근지방비 인사이트
    if (breakdown.muscleFat.ratio !== null) {
        if (breakdown.muscleFat.ratio < 1.0) {
            insights.push('💪 근지방비가 낮습니다. 유산소+근력 병행과 자연식품 위주 식단이 근지방비 개선에 효과적입니다.');
        } else if (breakdown.muscleFat.ratio >= 2.0) {
            insights.push('✅ 근지방비가 우수합니다! 현재 운동과 식단 습관을 유지하세요.');
        }
    }

    // 내장지방 인사이트
    if (breakdown.visceralFat.level !== null && breakdown.visceralFat.level >= 10) {
        insights.push('⚠️ 내장지방이 높습니다. 빠르게 걷기 등 유산소 운동이 내장지방 감소에 가장 효과적입니다.');
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
        { label: '근지방비', data: breakdown.muscleFat, max: 25, icon: '💪' },
        { label: '내장지방', data: breakdown.visceralFat, max: 25, icon: '🎯' },
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

// 전역 노출
window.calculateMetabolicScore = calculateMetabolicScore;
window.renderMetabolicScoreCard = renderMetabolicScoreCard;
