import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import {
    countDayChecks,
    dayPassesCheck,
    summarizeDietChecks,
    bestDietCheckImprovement
} from '../js/diet-checks.js';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const {
    normalizeDietModelResponse,
    pickPublicDietV2Fields,
    gradeForCheckCount,
    DIET_RESPONSE_SCHEMA
} = require('../functions/diet-checks.js');
const { normalizeDietAnalysis: normalizeGalleryDiet } = require('../functions/gallery-posts.js');

// 2026-11-20 대표: "비타민 무기질 섬유질 항산화물질 %로 나타나게 했는데 정확도가 확보된 걸까?"
// → 사진에서 보이는 것만 체크 5개로, 등급은 체크 개수로 서버가 계산한다.

function meal(overrides = {}) {
    return {
        mealType: 'meal',
        foods: [
            { name: '잡곡밥', category: 'natural', nutrients: '탄수화물' },
            { name: '된장찌개', category: 'processed' },
            { name: '고등어구이', category: 'natural' },
            { name: '시금치나물', category: 'natural' }
        ],
        vegetables: 'enough',
        protein: { level: 'enough', gramsMin: 20, gramsMax: 25 },
        carbs: { type: 'whole', amount: 'moderate', note: '잡곡밥' },
        sodium: { level: 'high', sources: '찌개 국물, 김치' },
        sweetness: 'low',
        colorCount: 4,
        fiberGrams: 8,
        naturalRatio: 75,
        insulinComment: '나물부터 드시면 혈당이 덜 올라요.',
        suggestion: '국물은 반만 드세요.',
        summary: '균형 잡힌 한식',
        ...overrides
    };
}

describe('서버: 체크 5개와 등급', () => {
    it('체크 개수로 등급을 정한다 (5=A … 1·0=F)', () => {
        expect([5, 4, 3, 2, 1, 0].map(gradeForCheckCount)).toEqual(['A', 'B', 'C', 'D', 'F', 'F']);
    });

    it('짠 찌개 정식은 체크 4개, B', () => {
        const out = normalizeDietModelResponse(meal());
        expect(out.version).toBe(2);
        expect(out.checks).toEqual({ vegetables: true, protein: true, ultraprocessed: true, carbs: true, sodium: false });
        expect(out.checkCount).toBe(4);
        expect(out.grade).toBe('B');
        expect(out.sodiumSources).toBe('찌개 국물, 김치');
        expect(out.proteinGramsMin).toBe(20);
        expect(out).not.toHaveProperty('scores');
    });

    it('모델이 적은 등급은 무시하고 다시 계산한다', () => {
        const out = normalizeDietModelResponse(meal({ grade: 'A', sodium: { level: 'normal' } }));
        expect(out.grade).toBe('A');
        const worse = normalizeDietModelResponse(meal({
            grade: 'A',
            vegetables: 'none',
            protein: { level: 'none' },
            foods: [{ name: '라면', category: 'ultraprocessed' }],
            carbs: { type: 'refined', amount: 'large' }
        }));
        expect(worse.checkCount).toBe(0);
        expect(worse.grade).toBe('F');
    });

    // 2026-11-22 대표 "너무 깐깐하다": 흰쌀밥 한 공기는 통과, 많을 때만 실패.
    it('탄수화물: 양만 본다 — 한 공기까지는 흰쌀이어도 통과, 많으면 실패', () => {
        const pass = (type, amount) => normalizeDietModelResponse(meal({ carbs: { type, amount } })).checks.carbs;
        expect(pass('none', 'large')).toBe(true);
        expect(pass('whole', 'moderate')).toBe(true);
        expect(pass('refined', 'small')).toBe(true);
        expect(pass('refined', 'moderate')).toBe(true);
        expect(pass('whole', 'large')).toBe(false);
        expect(pass('refined', 'large')).toBe(false);
    });

    it('간식·음료는 등급 없이 좋은/아쉬운 간식', () => {
        const apple = normalizeDietModelResponse({
            mealType: 'snack',
            foods: [{ name: '사과', category: 'natural' }],
            sweetness: 'moderate',
            insulinComment: 'x', suggestion: 'y', summary: 'z'
        });
        expect(apple.snackVerdict).toBe('good');
        expect(apple).not.toHaveProperty('grade');
        expect(apple).not.toHaveProperty('checks');

        const latte = normalizeDietModelResponse({ mealType: 'drink', foods: [{ name: '바닐라 라떼', category: 'processed' }], sweetness: 'high' });
        expect(latte.snackVerdict).toBe('meh');
        const chips = normalizeDietModelResponse({ mealType: 'snack', foods: [{ name: '감자칩', category: 'ultraprocessed' }], sweetness: 'low' });
        expect(chips.snackVerdict).toBe('meh');
    });

    it('식사에 꼭 필요한 판정이 빠지면 오류로 끝낸다 (다시 시도)', () => {
        expect(() => normalizeDietModelResponse(meal({ vegetables: '반 정도' }))).toThrow(/diet_json_invalid.*vegetables/);
        expect(() => normalizeDietModelResponse(meal({ sodium: {} }))).toThrow(/sodium/);
        expect(() => normalizeDietModelResponse({ foods: [] })).toThrow(/mealType/);
        expect(() => normalizeDietModelResponse(null)).toThrow();
    });

    it('Firestore 가 거부하는 undefined 를 남기지 않는다', () => {
        const outs = [
            normalizeDietModelResponse(meal({ protein: { level: 'none', gramsMin: null, gramsMax: null }, carbs: { type: 'none', amount: 'moderate' }, sodium: { level: 'low', sources: '없음' } })),
            normalizeDietModelResponse({ mealType: 'drink', foods: [] })
        ];
        for (const out of outs) {
            const walk = (value) => {
                expect(value).not.toBeUndefined();
                if (value && typeof value === 'object') Object.values(value).forEach(walk);
            };
            walk(out);
        }
        expect(outs[0]).not.toHaveProperty('proteinGramsMin');
        expect(outs[0]).not.toHaveProperty('carbsAmount');
        expect(outs[0]).not.toHaveProperty('sodiumSources');
    });

    it('숫자는 범위 안으로, 글은 길이 안으로', () => {
        const out = normalizeDietModelResponse(meal({ fiberGrams: 999, colorCount: -3, naturalRatio: 140.6, protein: { level: 'enough', gramsMin: 40, gramsMax: 30 }, summary: '가'.repeat(400) }));
        expect(out.fiberGrams).toBe(60);
        expect(out.colorCount).toBe(0);
        expect(out.naturalRatio).toBe(100);
        expect([out.proteinGramsMin, out.proteinGramsMax]).toEqual([30, 40]);
        expect(out.summary).toHaveLength(280);
    });

    // 2026-11-21 대표: 수육 + 김치 셋 + 봄동 들깨무침 넉넉히 → "채소 부족" 은 이상하다.
    it('채소는 비율이 아니라 양: enough 면 고기·김치가 많아도 통과, 예전 낱말 half 도 통과로 읽는다', () => {
        const table = meal({
            foods: [
                { name: '돼지고기 수육', category: 'natural' },
                { name: '깍두기', category: 'processed' },
                { name: '파김치', category: 'processed' },
                { name: '배추김치', category: 'processed' },
                { name: '봄동 들깨무침', category: 'natural' }
            ],
            vegetables: 'enough',
            carbs: { type: 'none' }
        });
        expect(normalizeDietModelResponse(table).checks.vegetables).toBe(true);
        expect(normalizeDietModelResponse(meal({ vegetables: 'half' })).vegetables).toBe('enough');
        expect(normalizeDietModelResponse(meal({ vegetables: 'some' })).checks.vegetables).toBe(false);
    });

    it('프롬프트: 채소는 양으로, 절임은 빼고, 제안은 나쁜 판정 하나만', () => {
        const runtime = readRepoFile('functions/runtime.js');
        const prompts = runtime.slice(runtime.indexOf('const DIET_ANALYSIS_PROMPT = `'), runtime.indexOf('const EXERCISE_ANALYSIS_PROMPT = `'));
        expect(prompts).toContain('채소 자체의 양');
        expect(prompts).toContain('한 주먹');
        expect(prompts).not.toContain('두 주먹');
        expect(prompts).toContain('밥·면이 없는 상에 밥을 더하라고 하지 않습니다');
        expect(prompts).toContain('never suggest adding rice or noodles to a table that has none');
        expect(prompts).not.toContain('half|some|none');
    });

    it('응답 틀이 판정 낱말을 enum 으로 묶는다', () => {
        expect(DIET_RESPONSE_SCHEMA.properties.vegetables.enum).toEqual(['enough', 'some', 'none']);
        expect(DIET_RESPONSE_SCHEMA.properties.sodium.properties.level.enum).toEqual(['low', 'normal', 'high']);
        expect(DIET_RESPONSE_SCHEMA.required).toContain('mealType');
    });
});

describe('서버: analyzeDiet 가 새 계산을 거친다', () => {
    const runtime = readRepoFile('functions/runtime.js');
    const fn = runtime.slice(runtime.indexOf('exports.analyzeDiet = onCall('), runtime.indexOf('// 5. AI 수면/마음 분석'));

    it('응답 틀을 쓰고, 모델의 JSON 을 그대로 돌려주지 않는다', () => {
        expect(fn).toContain('responseSchema: DIET_RESPONSE_SCHEMA');
        expect(fn).toContain('normalizeDietModelResponse(JSON.parse(jsonStr))');
        expect(fn).toContain('thinkingBudget: 0');
    });

    it('프롬프트에서 미량영양소 점수와 모델 등급을 뺐다', () => {
        const start = runtime.indexOf('const DIET_ANALYSIS_PROMPT = `');
        const prompts = runtime.slice(start, runtime.indexOf('const EXERCISE_ANALYSIS_PROMPT = `'));
        expect(prompts).not.toMatch(/"vitamins"|"antioxidants"|"grade"/);
        expect(prompts).toContain('등급은 앱이 계산합니다');
        expect(prompts).toContain('The app computes the grade');
    });
});

describe('갤러리: 2판 분석을 다시 계산해 싣는다', () => {
    it('간식(등급 없음)도 빠지지 않고, 조작한 등급은 다시 계산된다', () => {
        const stored = normalizeDietModelResponse(meal());
        const tampered = { ...stored, grade: 'A', checkCount: 5, checks: { vegetables: true, protein: true, ultraprocessed: true, carbs: true, sodium: true } };
        const snack = normalizeDietModelResponse({ mealType: 'snack', foods: [{ name: '사과', category: 'natural' }], sweetness: 'moderate' });
        const out = normalizeGalleryDiet({ lunch: tampered, snack }, { lunchUrl: 'u1', snackUrl: 'u2' });
        expect(out.lunch.grade).toBe('B');
        expect(out.lunch.checks.sodium).toBe(false);
        expect(out.snack.snackVerdict).toBe('good');
        expect(pickPublicDietV2Fields({ version: 1 })).toBe(null);
    });
});

describe('화면: 하루·4주 셈', () => {
    const checked = (checks, grade = 'B') => ({ version: 2, mealType: 'meal', checks, grade });
    const all = (value) => ({ vegetables: value, protein: value, ultraprocessed: value, carbs: value, sodium: value });

    it('그날 식사의 절반 이상이 통과하면 통과한 날', () => {
        const day = countDayChecks([
            checked({ ...all(true), vegetables: false }),
            checked(all(true)),
            checked({ ...all(true), vegetables: false }),
            { version: 2, mealType: 'snack', snackVerdict: 'good' }
        ]);
        expect(day.meals).toBe(3);
        expect(day.checks.vegetables).toBe(1);
        expect(dayPassesCheck(day, 'vegetables')).toBe(false);
        expect(dayPassesCheck(day, 'protein')).toBe(true);
        expect(dayPassesCheck(countDayChecks([checked(all(false)), checked(all(true))]), 'sodium')).toBe(true);
        expect(dayPassesCheck(countDayChecks([{ grade: 'A', scores: {} }]), 'sodium')).toBe(null);
    });

    it('4주를 주별로 나눠 세고, 예전 기록·간식은 세지 않는다', () => {
        const log = (date, ...analyses) => ({ date, dietAnalysis: Object.fromEntries(analyses.map((a, i) => [['breakfast', 'lunch', 'dinner', 'snack'][i], a])) });
        const s = summarizeDietChecks([
            log('2026-10-24', checked({ ...all(true), vegetables: false }, 'B')),
            log('2026-10-25', { grade: 'A', scores: { vitamins: 90 } }),
            log('2026-11-07', checked(all(true), 'A')),
            log('2026-11-15', checked(all(true), 'A')),
            log('2026-11-20', checked(all(true), 'A'), { version: 2, mealType: 'snack', snackVerdict: 'meh' })
        ], '2026-10-24');
        expect(s.days).toBe(4);
        expect(s.weekDays).toEqual([1, 0, 1, 2]);
        expect(s.checks.vegetables.passDays).toBe(3);
        expect(s.checks.vegetables.weeks).toEqual([0, 0, 1, 2]);
        expect(s.averageGrade).toBe('A');
        expect(bestDietCheckImprovement(s)).toEqual({ key: 'vegetables', fromWeek: 1, toWeek: 4, from: 0, to: 2, gain: 2 });
    });

    it('기록한 주가 하나뿐이면 「늘었다」고 하지 않는다', () => {
        const s = summarizeDietChecks([{ date: '2026-11-20', dietAnalysis: { lunch: checked(all(true)) } }], '2026-10-24');
        expect(bestDietCheckImprovement(s)).toBe(null);
        expect(summarizeDietChecks([], '2026-10-24').days).toBe(0);
    });
});
