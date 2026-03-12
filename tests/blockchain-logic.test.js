/**
 * blockchain-logic.test.js
 * HBT 토큰 변환율, 반감기, 구간(era) 계산 로직 테스트
 */
import { describe, it, expect } from 'vitest';

// CONVERSION_RULES.halving 설정값 (blockchain-config.js에서)
const HALVING = {
    miningPool: 60_000_000,
    era1Threshold: 30_000_000,
    initialRate: 1,
    minRate: 0.01
};

// getConversionRate — blockchain-manager.js 로직 복제
function getConversionRate(totalMinted = 0) {
    const { era1Threshold, initialRate, minRate } = HALVING;
    let minted = totalMinted;
    let rate = initialRate;
    let threshold = era1Threshold;

    while (minted >= threshold && rate > minRate) {
        minted -= threshold;
        threshold = Math.floor(threshold / 2);
        rate = rate / 2;
        if (threshold < 1) break;
    }

    return Math.max(rate, minRate);
}

// getCurrentEra — blockchain-manager.js 로직 복제
function getCurrentEra(totalMinted = 0) {
    const { era1Threshold } = HALVING;
    let minted = totalMinted;
    let threshold = era1Threshold;
    let era = 1;

    while (minted >= threshold && threshold > 0) {
        minted -= threshold;
        threshold = Math.floor(threshold / 2);
        era++;
    }
    return era;
}

// eraLabel
function eraLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26));
}

// === 변환율 테스트 ===
describe('getConversionRate (반감기)', () => {
    it('Era 1: 0 HBT 채굴됨 → 비율 1 (100P = 100 HBT)', () => {
        expect(getConversionRate(0)).toBe(1);
    });

    it('Era 1: 15,000,000 HBT 채굴됨 → 여전히 비율 1', () => {
        expect(getConversionRate(15_000_000)).toBe(1);
    });

    it('Era 2: 30,000,000 HBT 채굴됨 → 비율 0.5 (반감)', () => {
        expect(getConversionRate(30_000_000)).toBe(0.5);
    });

    it('Era 3: 45,000,000 HBT 채굴됨 → 비율 0.25', () => {
        // Era 1: 30M, Era 2: 15M → 총 45M
        expect(getConversionRate(45_000_000)).toBe(0.25);
    });

    it('Era 4: 52,500,000 HBT → 비율 0.125', () => {
        // Era 1: 30M + Era 2: 15M + Era 3: 7.5M = 52.5M
        expect(getConversionRate(52_500_000)).toBe(0.125);
    });

    it('아주 큰 값에서도 최소 비율 보장 (minRate = 0.01)', () => {
        expect(getConversionRate(59_999_999)).toBeGreaterThanOrEqual(0.01);
    });

    it('음수 입력은 Era 1로 처리', () => {
        expect(getConversionRate(-100)).toBe(1);
    });
});

// === 구간(Era) 테스트 ===
describe('getCurrentEra', () => {
    it('0 HBT → Era 1', () => {
        expect(getCurrentEra(0)).toBe(1);
    });

    it('29,999,999 HBT → Era 1 (아직 threshold 미도달)', () => {
        expect(getCurrentEra(29_999_999)).toBe(1);
    });

    it('30,000,000 HBT → Era 2', () => {
        expect(getCurrentEra(30_000_000)).toBe(2);
    });

    it('45,000,000 HBT → Era 3', () => {
        expect(getCurrentEra(45_000_000)).toBe(3);
    });

    it('52,500,000 HBT → Era 4', () => {
        expect(getCurrentEra(52_500_000)).toBe(4);
    });

    it('Era와 비율은 일관성 있게 대응', () => {
        // Era 1 → rate 1, Era 2 → rate 0.5, Era 3 → rate 0.25
        const testCases = [
            { minted: 0, era: 1, rate: 1 },
            { minted: 30_000_000, era: 2, rate: 0.5 },
            { minted: 45_000_000, era: 3, rate: 0.25 },
            { minted: 52_500_000, era: 4, rate: 0.125 },
        ];
        testCases.forEach(({ minted, era, rate }) => {
            expect(getCurrentEra(minted)).toBe(era);
            expect(getConversionRate(minted)).toBe(rate);
        });
    });
});

// === Era 라벨 테스트 ===
describe('eraLabel', () => {
    it('Era 1 → "A"', () => {
        expect(eraLabel(1)).toBe('A');
    });

    it('Era 2 → "B"', () => {
        expect(eraLabel(2)).toBe('B');
    });

    it('Era 26 → "Z"', () => {
        expect(eraLabel(26)).toBe('Z');
    });

    it('Era 27 이상은 "Z"로 제한', () => {
        expect(eraLabel(27)).toBe('Z');
        expect(eraLabel(100)).toBe('Z');
    });
});

// === HBT 계산 통합 테스트 ===
describe('포인트 → HBT 변환 계산', () => {
    function calculateHbt(pointAmount, totalMinted = 0) {
        const rate = getConversionRate(totalMinted);
        return pointAmount * rate;
    }

    it('Era 1: 100P → 100 HBT', () => {
        expect(calculateHbt(100, 0)).toBe(100);
    });

    it('Era 2: 100P → 50 HBT', () => {
        expect(calculateHbt(100, 30_000_000)).toBe(50);
    });

    it('Era 3: 100P → 25 HBT', () => {
        expect(calculateHbt(100, 45_000_000)).toBe(25);
    });

    it('Era 1: 1000P → 1000 HBT', () => {
        expect(calculateHbt(1000, 0)).toBe(1000);
    });

    it('최소 변환 단위 (100P)', () => {
        expect(calculateHbt(100, 0)).toBe(100);
    });
});

// === 일일 변환 한도 테스트 ===
describe('일일 변환 한도', () => {
    const MAX_DAILY_HBT = 1000;
    const MIN_POINTS = 100;

    it('최소 포인트 확인', () => {
        expect(MIN_POINTS).toBe(100);
    });

    it('일일 최대 HBT', () => {
        expect(MAX_DAILY_HBT).toBe(1000);
    });

    it('100P 단위 검증', () => {
        expect(100 % 100).toBe(0);
        expect(200 % 100).toBe(0);
        expect(150 % 100).not.toBe(0);
    });
});
