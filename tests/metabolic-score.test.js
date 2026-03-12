/**
 * metabolic-score.test.js
 * 대사면역 점수 계산 로직 테스트
 */
import { describe, it, expect } from 'vitest';

// === 개별 카테고리 점수 함수 (metabolic-score.js 로직 복제) ===

// 근지방비 점수 (25점 만점)
function calcMuscleFatScore(profile) {
    const smm = parseFloat(profile.smm);
    const fat = parseFloat(profile.fat);
    if (!smm || !fat || fat <= 0) {
        return { score: 12.5, detail: '데이터 없음', ratio: null };
    }
    const ratio = smm / fat;
    let score = Math.min(25, Math.max(5, ((ratio - 0.5) / 1.5) * 20 + 5));
    score = Math.round(score * 10) / 10;
    let detail = '';
    if (ratio >= 2.0) detail = '우수 — 근육량이 체지방 대비 충분합니다';
    else if (ratio >= 1.5) detail = '양호 — 근지방비가 건강한 수준입니다';
    else if (ratio >= 1.0) detail = '보통 — 근지방비 개선이 도움됩니다';
    else detail = '개선 필요 — 근육 증가와 체지방 감소가 필요합니다';
    return { score, detail, ratio: Math.round(ratio * 100) / 100 };
}

// 내장지방 점수 (25점 만점)
function calcVisceralFatScore(profile) {
    const visceral = parseFloat(profile.visceral);
    if (!visceral) {
        return { score: 12.5, detail: '데이터 없음', level: null };
    }
    let score = Math.min(25, Math.max(5, ((15 - visceral) / 10) * 20 + 5));
    score = Math.round(score * 10) / 10;
    let detail = '';
    if (visceral <= 5) detail = '우수 — 내장지방이 매우 낮습니다';
    else if (visceral <= 9) detail = '양호 — 정상 범위입니다';
    else if (visceral <= 14) detail = '주의 — 대사질환 위험이 높아집니다';
    else detail = '위험 — 적극적인 내장지방 감소가 필요합니다';
    return { score, detail, level: visceral };
}

// 인슐린 저항성 점수 (25점 만점)
function calcInsulinResistanceScore(metrics, profile) {
    const glucose = parseFloat(metrics.glucose);
    const tg = parseFloat(metrics.triglyceride);
    const hba1c = parseFloat(profile.hba1c);

    if (glucose && tg && glucose > 0 && tg > 0) {
        const tyg = Math.log(tg * glucose / 2);
        let score = Math.min(25, Math.max(5, ((9.5 - tyg) / 1.5) * 20 + 5));
        score = Math.round(score * 10) / 10;
        return { score, tyg: Math.round(tyg * 100) / 100, method: 'TyG' };
    }

    if (glucose) {
        let score;
        if (glucose < 90) score = 25;
        else if (glucose < 100) score = 22;
        else if (glucose < 110) score = 17;
        else if (glucose < 126) score = 12;
        else score = 7;
        return { score, glucose, method: 'FPG' };
    }

    if (hba1c) {
        let score;
        if (hba1c < 5.7) score = 25;
        else if (hba1c < 6.0) score = 20;
        else if (hba1c < 6.5) score = 14;
        else score = 7;
        return { score, hba1c, method: 'HbA1c' };
    }

    return { score: 12.5, method: 'none' };
}

// 생활습관 점수 (25점 만점)
function calcLifestyleScore(recentLogs) {
    if (!recentLogs || recentLogs.length === 0) {
        return { score: 0, diet: 0, exercise: 0, mind: 0 };
    }
    const total = Math.min(recentLogs.length, 7);

    let dietDays = 0, dietGradeSum = 0, dietGradeCount = 0;
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
    const dietFreq = (dietDays / total) * 5;
    const dietQuality = dietGradeCount > 0 ? (dietGradeSum / dietGradeCount / 5) * 5 : 2.5;
    const dietScore = Math.min(10, dietFreq + dietQuality);

    let exerciseDays = 0, hasCardio = false, hasStrength = false;
    recentLogs.forEach(log => {
        const ex = log.exercise || {};
        const cardioCount = (ex.cardioList || []).length;
        const strengthCount = (ex.strengthList || []).length;
        if (cardioCount > 0 || strengthCount > 0) exerciseDays++;
        if (cardioCount > 0) hasCardio = true;
        if (strengthCount > 0) hasStrength = true;
    });
    let exerciseScore = (exerciseDays / total) * 6;
    if (hasCardio && hasStrength) exerciseScore += 2;
    else if (hasCardio || hasStrength) exerciseScore += 1;
    exerciseScore = Math.min(8, exerciseScore);

    let mindDays = 0;
    recentLogs.forEach(log => {
        const mind = log.sleepAndMind || {};
        if (mind.sleepImageUrl || mind.meditationDone || mind.gratitude) mindDays++;
    });
    const mindScore = Math.min(7, (mindDays / total) * 7);

    const score = Math.round((dietScore + exerciseScore + mindScore) * 10) / 10;
    return {
        score,
        diet: Math.round(dietScore * 10) / 10,
        exercise: Math.round(exerciseScore * 10) / 10,
        mind: Math.round(mindScore * 10) / 10
    };
}

// 등급 판정
function getGrade(total) {
    if (total >= 85) return 'A';
    if (total >= 70) return 'B';
    if (total >= 55) return 'C';
    if (total >= 40) return 'D';
    return 'F';
}

// === 테스트 ===

describe('calcMuscleFatScore (근지방비)', () => {
    it('데이터 없으면 12.5점 (중간값)', () => {
        const result = calcMuscleFatScore({});
        expect(result.score).toBe(12.5);
        expect(result.ratio).toBeNull();
    });

    it('근지방비 2.0 이상 → 우수 (20점 이상)', () => {
        const result = calcMuscleFatScore({ smm: 40, fat: 15 }); // ratio 2.67
        expect(result.score).toBeGreaterThanOrEqual(20);
        expect(result.detail).toContain('우수');
    });

    it('근지방비 1.5~2.0 → 양호', () => {
        const result = calcMuscleFatScore({ smm: 30, fat: 18 }); // ratio 1.67
        expect(result.detail).toContain('양호');
    });

    it('근지방비 1.0~1.5 → 보통', () => {
        const result = calcMuscleFatScore({ smm: 25, fat: 22 }); // ratio 1.14
        expect(result.detail).toContain('보통');
    });

    it('근지방비 1.0 미만 → 개선 필요', () => {
        const result = calcMuscleFatScore({ smm: 20, fat: 30 }); // ratio 0.67
        expect(result.detail).toContain('개선 필요');
    });

    it('점수는 5~25 범위', () => {
        const extreme1 = calcMuscleFatScore({ smm: 50, fat: 5 });  // ratio 10
        const extreme2 = calcMuscleFatScore({ smm: 5, fat: 50 });  // ratio 0.1
        expect(extreme1.score).toBeLessThanOrEqual(25);
        expect(extreme2.score).toBeGreaterThanOrEqual(5);
    });
});

describe('calcVisceralFatScore (내장지방)', () => {
    it('데이터 없으면 12.5점', () => {
        expect(calcVisceralFatScore({}).score).toBe(12.5);
    });

    it('내장지방 3 → 우수', () => {
        const result = calcVisceralFatScore({ visceral: 3 });
        expect(result.detail).toContain('우수');
        expect(result.score).toBeGreaterThan(20);
    });

    it('내장지방 7 → 양호', () => {
        const result = calcVisceralFatScore({ visceral: 7 });
        expect(result.detail).toContain('양호');
    });

    it('내장지방 12 → 주의', () => {
        const result = calcVisceralFatScore({ visceral: 12 });
        expect(result.detail).toContain('주의');
    });

    it('내장지방 16 → 위험', () => {
        const result = calcVisceralFatScore({ visceral: 16 });
        expect(result.detail).toContain('위험');
    });
});

describe('calcInsulinResistanceScore (인슐린 저항성)', () => {
    it('TyG 방식: 혈당 90 + 중성지방 100 → 양호', () => {
        const result = calcInsulinResistanceScore({ glucose: 90, triglyceride: 100 }, {});
        expect(result.method).toBe('TyG');
        expect(result.score).toBeGreaterThan(15);
    });

    it('FPG 방식: 혈당 85 → 25점', () => {
        const result = calcInsulinResistanceScore({ glucose: 85 }, {});
        expect(result.method).toBe('FPG');
        expect(result.score).toBe(25);
    });

    it('FPG 방식: 혈당 105 → 17점', () => {
        const result = calcInsulinResistanceScore({ glucose: 105 }, {});
        expect(result.score).toBe(17);
    });

    it('FPG 방식: 혈당 130 → 7점 (당뇨 범위)', () => {
        const result = calcInsulinResistanceScore({ glucose: 130 }, {});
        expect(result.score).toBe(7);
    });

    it('HbA1c 방식: 5.5 → 25점', () => {
        const result = calcInsulinResistanceScore({}, { hba1c: 5.5 });
        expect(result.method).toBe('HbA1c');
        expect(result.score).toBe(25);
    });

    it('HbA1c 방식: 6.8 → 7점', () => {
        const result = calcInsulinResistanceScore({}, { hba1c: 6.8 });
        expect(result.score).toBe(7);
    });

    it('데이터 없으면 12.5점', () => {
        const result = calcInsulinResistanceScore({}, {});
        expect(result.score).toBe(12.5);
        expect(result.method).toBe('none');
    });
});

describe('calcLifestyleScore (생활습관)', () => {
    it('기록 없으면 0점', () => {
        expect(calcLifestyleScore([]).score).toBe(0);
        expect(calcLifestyleScore(null).score).toBe(0);
    });

    it('완벽한 7일 기록 → 높은 점수', () => {
        const logs = Array.from({ length: 7 }, () => ({
            diet: { breakfastUrl: 'url', lunchUrl: 'url', dinnerUrl: 'url' },
            dietAnalysis: { breakfast: { grade: 'A' }, lunch: { grade: 'B' } },
            exercise: { cardioList: ['run'], strengthList: ['pushup'] },
            sleepAndMind: { sleepImageUrl: 'url', gratitude: '감사합니다' }
        }));
        const result = calcLifestyleScore(logs);
        expect(result.score).toBeGreaterThan(20);
    });

    it('식단만 기록한 경우', () => {
        const logs = Array.from({ length: 7 }, () => ({
            diet: { breakfastUrl: 'url' },
            exercise: {},
            sleepAndMind: {}
        }));
        const result = calcLifestyleScore(logs);
        expect(result.diet).toBeGreaterThan(0);
        expect(result.exercise).toBe(0);
        expect(result.mind).toBe(0);
    });

    it('유산소+근력 둘 다 기록하면 보너스', () => {
        const logsCardioOnly = [{ exercise: { cardioList: ['run'] }, diet: {}, sleepAndMind: {} }];
        const logsBoth = [{ exercise: { cardioList: ['run'], strengthList: ['squat'] }, diet: {}, sleepAndMind: {} }];
        const cardioResult = calcLifestyleScore(logsCardioOnly);
        const bothResult = calcLifestyleScore(logsBoth);
        expect(bothResult.exercise).toBeGreaterThan(cardioResult.exercise);
    });
});

describe('getGrade (등급 판정)', () => {
    it('85점 이상 → A', () => {
        expect(getGrade(85)).toBe('A');
        expect(getGrade(100)).toBe('A');
    });

    it('70점 이상 → B', () => {
        expect(getGrade(70)).toBe('B');
        expect(getGrade(84)).toBe('B');
    });

    it('55점 이상 → C', () => {
        expect(getGrade(55)).toBe('C');
    });

    it('40점 이상 → D', () => {
        expect(getGrade(40)).toBe('D');
    });

    it('40점 미만 → F', () => {
        expect(getGrade(39)).toBe('F');
        expect(getGrade(0)).toBe('F');
    });
});

describe('전체 대사면역 점수 통합', () => {
    it('모든 카테고리 최고점이면 총점 100에 가까움', () => {
        const muscleFat = calcMuscleFatScore({ smm: 40, fat: 15 });
        const visceralFat = calcVisceralFatScore({ visceral: 3 });
        const insulin = calcInsulinResistanceScore({ glucose: 85 }, {});
        const lifestyle = calcLifestyleScore(Array.from({ length: 7 }, () => ({
            diet: { breakfastUrl: 'url', lunchUrl: 'url', dinnerUrl: 'url' },
            dietAnalysis: { breakfast: { grade: 'A' } },
            exercise: { cardioList: ['run'], strengthList: ['pushup'] },
            sleepAndMind: { sleepImageUrl: 'url' }
        })));

        const total = muscleFat.score + visceralFat.score + insulin.score + lifestyle.score;
        expect(total).toBeGreaterThan(80);
        expect(getGrade(total)).toBe('A');
    });

    it('모든 데이터 없으면 기본값 합산 (약 37.5)', () => {
        const muscleFat = calcMuscleFatScore({});      // 12.5
        const visceralFat = calcVisceralFatScore({});   // 12.5
        const insulin = calcInsulinResistanceScore({}, {}); // 12.5
        const lifestyle = calcLifestyleScore([]);       // 0

        const total = muscleFat.score + visceralFat.score + insulin.score + lifestyle.score;
        expect(total).toBe(37.5);
        expect(getGrade(total)).toBe('F');
    });
});
