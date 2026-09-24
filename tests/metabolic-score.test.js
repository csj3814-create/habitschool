/**
 * metabolic-score.test.js
 * 대사건강 점수 — 실제 모듈(js/metabolic-score.js)을 불러와 시험한다.
 *
 * 예전 이 파일은 계산 함수를 **복제해 두고** 그 복제본을 시험했다. 그래서 실제
 * 모듈이 바뀌어도(데이터가 없을 때 12.5점 → '빈칸' 처리) 시험은 계속 통과했다.
 * 복제본은 두 번째 사본일 뿐이다.
 */
import { describe, expect, it } from 'vitest';
import {
    BODY_FAT_BANDS,
    MUSCLE_RATIO_BANDS,
    WAIST_CUTOFF_CM,
    calcBodyFatScore,
    calcInsulinResistanceScore,
    calcLifestyleScore,
    calcMuscleScore,
    calculateMetabolicScore,
    getGrade
} from '../js/metabolic-score.js';

describe('체지방 칸 — 체지방률(성별 기준) + 허리둘레÷키', () => {
    it('기준표는 남녀가 다르다', () => {
        expect(BODY_FAT_BANDS.male.obese).toBe(25);
        expect(BODY_FAT_BANDS.female.obese).toBe(32);
        expect(WAIST_CUTOFF_CM).toEqual({ male: 90, female: 85 });
    });

    it('체지방률이 낮으면 만점', () => {
        const r = calcBodyFatScore({ sex: 'male', bodyFatPct: 12.7 });
        expect(r.score).toBe(25);
        expect(r.overPct).toBe(false);
    });

    it('같은 체지방률이라도 성별에 따라 판정이 다르다', () => {
        const male = calcBodyFatScore({ sex: 'male', bodyFatPct: 28 });
        const female = calcBodyFatScore({ sex: 'female', bodyFatPct: 28 });
        expect(male.overPct).toBe(true);
        expect(female.overPct).toBe(false);
        expect(female.score).toBeGreaterThan(male.score);
    });

    it('성별을 모르면 체지방률만으로는 판정하지 않는다', () => {
        const r = calcBodyFatScore({ bodyFatPct: 22 });
        expect(r.missing).toBe(true);
        expect(r.missingLabel).toContain('성별');
    });

    it('허리둘레÷키는 성별 없이도 매긴다', () => {
        const r = calcBodyFatScore({ waistCm: 80, heightCm: 175 });
        expect(r.missing).toBeUndefined();
        expect(r.whtr).toBe(0.46);
    });

    it('허리가 키의 절반을 넘으면 복부비만으로 본다', () => {
        const r = calcBodyFatScore({ waistCm: 90, heightCm: 170 });
        expect(r.overWaist).toBe(true);
        expect(r.detail).toContain('허리둘레');
    });

    it('한국 복부비만 기준(남 90·여 85cm)도 본다', () => {
        // 키가 커서 비율로는 괜찮아도 기준 둘레를 넘으면 짚는다.
        const r = calcBodyFatScore({ sex: 'female', waistCm: 86, heightCm: 180 });
        expect(r.whtr).toBeLessThan(0.5);
        expect(r.overWaist).toBe(true);
    });

    it('둘 다 있으면 평균', () => {
        const pctOnly = calcBodyFatScore({ sex: 'male', bodyFatPct: 12 }).score;
        const waistOnly = calcBodyFatScore({ waistCm: 95, heightCm: 170 }).score;
        const both = calcBodyFatScore({ sex: 'male', bodyFatPct: 12, waistCm: 95, heightCm: 170 }).score;
        expect(both).toBeCloseTo((pctOnly + waistOnly) / 2, 1);
    });

    it('체지방률이 없으면 체지방량 ÷ 체중으로 구한다', () => {
        const r = calcBodyFatScore({ sex: 'male', fat: 15 }, { weight: 75 });
        expect(r.bodyFatPct).toBe(20);
    });

    it('내장지방 레벨은 점수에 쓰지 않는다', () => {
        // 회사마다 자가 달라서 같은 날 인바디 5~6, Fitdays 3 이 나온다.
        const a = calculateMetabolicScore({ sex: 'male', bodyFatPct: 18, visceral: 3 });
        const b = calculateMetabolicScore({ sex: 'male', bodyFatPct: 18, visceral: 12 });
        expect(a.total).toBe(b.total);
    });

    it('점수는 5~25 범위', () => {
        for (const pct of [3, 15, 20, 25, 30, 45, 70]) {
            const s = calcBodyFatScore({ sex: 'male', bodyFatPct: pct }).score;
            expect(s).toBeGreaterThanOrEqual(5);
            expect(s).toBeLessThanOrEqual(25);
        }
    });
});

describe('근육 칸 — 골격근량 ÷ 체중', () => {
    it('기준은 Janssen 2002 의 남녀 기준', () => {
        expect(MUSCLE_RATIO_BANDS.male.normal).toBe(37.0);
        expect(MUSCLE_RATIO_BANDS.female.normal).toBe(27.6);
    });

    it('정상 이상이면 만점 — 많은 쪽을 더 칭찬하지는 않는다', () => {
        const r = calcMuscleScore({ sex: 'male', smm: 37.3, weight: 75.03 });
        expect(r.ratio).toBe(49.7);
        expect(r.score).toBe(25);
        expect(r.low).toBe(false);
    });

    it('근육이 적으면 점수가 내려간다', () => {
        const r = calcMuscleScore({ sex: 'female', smm: 17, weight: 65 });
        expect(r.low).toBe(true);
        expect(r.score).toBeLessThan(25);
    });

    it('체중이 프로필에 없으면 최근 일일 기록의 체중을 쓴다', () => {
        const r = calcMuscleScore({ sex: 'male', smm: 35.8 }, { weight: 74 });
        expect(r.ratio).toBe(48.4);
    });

    it('성별이 없으면 판정하지 않는다', () => {
        const r = calcMuscleScore({ smm: 35, weight: 75 });
        expect(r.missing).toBe(true);
        expect(r.missingLabel).toContain('성별');
    });

    it('골격근량이나 체중이 없으면 빈칸', () => {
        expect(calcMuscleScore({ sex: 'male', smm: 35 }).missing).toBe(true);
        expect(calcMuscleScore({ sex: 'male', weight: 75 }).missing).toBe(true);
    });
});

describe('인슐린 저항성 칸', () => {
    it('TyG: 혈당 90 + 중성지방 100 → 양호', () => {
        const r = calcInsulinResistanceScore({ glucose: 90, triglyceride: 100 }, {});
        expect(r.method).toBe('TyG');
        expect(r.detail).toContain('양호');
    });

    it('공복혈당만: 85 → 25점, 130 → 7점', () => {
        expect(calcInsulinResistanceScore({ glucose: 85 }, {}).score).toBe(25);
        expect(calcInsulinResistanceScore({ glucose: 130 }, {}).score).toBe(7);
    });

    it('HbA1c 만: 5.5 → 25점', () => {
        expect(calcInsulinResistanceScore({}, { hba1c: 5.5 }).score).toBe(25);
    });

    it('데이터 없으면 빈칸', () => {
        expect(calcInsulinResistanceScore({}, {}).missing).toBe(true);
    });
});

describe('생활습관 칸', () => {
    it('기록 없으면 빈칸', () => {
        expect(calcLifestyleScore([]).missing).toBe(true);
    });

    it('완벽한 7일 기록 → 높은 점수', () => {
        const logs = Array.from({ length: 7 }, () => ({
            diet: { breakfastUrl: 'u', lunchUrl: 'u', dinnerUrl: 'u' },
            dietAnalysis: { breakfast: { grade: 'A' } },
            exercise: { cardioList: ['run'], strengthList: ['pushup'] },
            sleepAndMind: { sleepImageUrl: 'u' }
        }));
        expect(calcLifestyleScore(logs).score).toBeGreaterThanOrEqual(20);
    });
});

describe('등급', () => {
    it('85 A · 70 B · 55 C · 40 D · 그 아래 F', () => {
        expect(getGrade(85)).toBe('A');
        expect(getGrade(70)).toBe('B');
        expect(getGrade(55)).toBe('C');
        expect(getGrade(40)).toBe('D');
        expect(getGrade(39)).toBe('F');
    });
});

describe('전체 점수', () => {
    it('있는 칸만으로 100점 환산한다', () => {
        const r = calculateMetabolicScore({ sex: 'male', bodyFatPct: 12, smm: 37, weight: 75 });
        expect(r.availableCount).toBe(2);
        expect(r.total).toBe(100);
    });

    it('아무것도 없으면 점수를 매기지 않는다', () => {
        const r = calculateMetabolicScore({}, [], {});
        expect(r.allMissing).toBe(true);
        expect(r.grade).toBeNull();
    });

    it('카드의 칸 이름이 새 구성과 같다', () => {
        const r = calculateMetabolicScore({ sex: 'male', bodyFatPct: 12, smm: 37, weight: 75 });
        expect(Object.keys(r.breakdown)).toEqual(['bodyFat', 'muscle', 'insulinResistance', 'lifestyle']);
    });

    it('허리가 기준을 넘으면 그 조언이 먼저 나온다', () => {
        const r = calculateMetabolicScore({ sex: 'male', bodyFatPct: 28, waistCm: 95, heightCm: 170 });
        expect(r.insights[0]).toContain('허리둘레');
    });
});

describe('체성분 변화 추이는 점수와 같은 값을 보여 준다', async () => {
    // 2026-09-24: 내장지방 레벨을 점수에서 뺐는데 추이 표에는 남아 있었다.
    // 기기를 바꾼 날 "내장지방 -3" 처럼 나아진 것으로 보였다.
    const { readFileSync } = await import('node:fs');
    const APP = readFileSync(new URL('../js/app-core.js', import.meta.url), 'utf8');
    const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const fn = APP.split('window.loadInbodyHistory = async function () {')[1].split('\n};\n')[0];

    it('체중·골격근량·체지방률·허리둘레 네 가지', () => {
        for (const label of ["label: '체중'", "label: '골격근량'", "label: '체지방률'", "label: '허리둘레'"]) {
            expect(fn).toContain(label);
        }
    });

    it('내장지방은 표에도 변화에도 없다', () => {
        expect(fn).not.toContain('.visceral');
        expect(fn).not.toContain('🎯');
        expect(fn).not.toContain('<th style="padding:6px 4px;">내장지방</th>');
    });

    it('안내 상자는 넣는 방법을 먼저 말한다', () => {
        expect(INDEX).toContain('📲 체성분은 어떻게 넣나요?');
        expect(INDEX).not.toContain('수치는 어디서 보나요');
    });
});
