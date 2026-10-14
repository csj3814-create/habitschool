import { describe, expect, it } from 'vitest';
import { matchesFood, scorePhoto, VARIANTS } from '../scripts/eval-diet-analysis.mjs';

// 식단 분석 정확도 측정 스크립트의 채점이 맞아야 그 숫자로 결정을 내릴 수 있다.
describe('음식 이름 맞추기', () => {
    it('이름 하나가 다른 쪽을 품으면 같은 음식이다', () => {
        expect(matchesFood('배추김치', [['김치']][0])).toBe(true);
        expect(matchesFood('오징어채 무침', ['오징어채'])).toBe(true);
        expect(matchesFood('김치', ['배추김치', '김치'])).toBe(true);
    });

    it('다른 음식은 다르다 — 오징어채를 짠지로 읽으면 틀린 것', () => {
        expect(matchesFood('짠지', ['오징어채', '오징어채무침'])).toBe(false);
        expect(matchesFood('', ['김치'])).toBe(false);
    });
});

describe('사진 하나 채점', () => {
    const truth = [['쌀밥', '흰쌀밥', '밥'], ['오징어채', '오징어채무침'], ['배추김치', '김치']];

    it('빠뜨린 것과 잘못 말한 것을 따로 센다', () => {
        const s = scorePhoto(['흰쌀밥', '짠지', '배추김치', '된장국'], truth);
        expect(s.found).toBe(2);
        expect(s.missed).toEqual(['오징어채']);
        expect(s.correct).toBe(2);
        expect(s.wrong).toEqual(['짠지', '된장국']);
    });

    it('다 맞히면 빠뜨림도 틀림도 없다', () => {
        const s = scorePhoto(['밥', '오징어채무침', '김치'], truth);
        expect(s.missed).toEqual([]);
        expect(s.wrong).toEqual([]);
    });
});

describe('비교 조건', () => {
    it('지금 앱의 조건이 기준으로 들어 있다', () => {
        expect(VARIANTS[0]).toMatchObject({ size: 640, quality: 0.6, thinking: 0, media: null });
    });

    it('운영 모델 규칙(2.5-flash) 안에서만 바꾼다 — 조건은 크기·mediaResolution·생각 시간뿐', () => {
        VARIANTS.forEach((v) => expect(Object.keys(v).sort()).toEqual(['id', 'label', 'media', 'quality', 'size', 'thinking']));
    });
});
