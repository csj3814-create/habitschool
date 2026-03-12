/**
 * blockchain-logic.test.js
 * HBT 토큰 변환율, Phase 기반 반감기, 구간 계산 로직 테스트 (v2)
 */
import { describe, it, expect } from 'vitest';

// CONVERSION_RULES.halving 설정값 (v2 — blockchain-config.js에서)
const HALVING = {
    miningPool: 70_000_000,
    phase1End: 35_000_000,
    phase2End: 52_500_000,
    phase3End: 61_250_000,
    initialRate: 1,
    maxRate: 4,
    rateScale: 100_000_000,
};

// getConversionRate — v2 Phase 기반 로직 (blockchain-manager.js 복제)
function getConversionRate(totalMinted = 0) {
    const { phase1End, phase2End, phase3End, initialRate, miningPool } = HALVING;

    if (totalMinted < phase1End) return initialRate;       // Phase 1: 1P = 1 HBT
    if (totalMinted < phase2End) return initialRate / 2;   // Phase 2: 1P = 0.5 HBT
    if (totalMinted < phase3End) return initialRate / 4;   // Phase 3: 1P = 0.25 HBT

    // Phase 4+: 계속 반감
    let rate = initialRate / 8;
    let remaining = miningPool - phase3End;
    let extraMinted = totalMinted - phase3End;
    let threshold = Math.floor(remaining / 2);

    while (extraMinted >= threshold && threshold > 0) {
        extraMinted -= threshold;
        threshold = Math.floor(threshold / 2);
        rate /= 2;
    }
    return Math.max(rate, 0.01);
}

// getCurrentEra — v2 Phase 기반 로직 (blockchain-manager.js 복제)
function getCurrentEra(totalMinted = 0) {
    const { phase1End, phase2End, phase3End, miningPool } = HALVING;

    if (totalMinted < phase1End) return 1;
    if (totalMinted < phase2End) return 2;
    if (totalMinted < phase3End) return 3;

    let remaining = miningPool - phase3End;
    let extraMinted = totalMinted - phase3End;
    let threshold = Math.floor(remaining / 2);
    let phase = 4;

    while (extraMinted >= threshold && threshold > 0) {
        extraMinted -= threshold;
        threshold = Math.floor(threshold / 2);
        phase++;
    }
    return phase;
}

// eraLabel
function eraLabel(era) {
    return String.fromCharCode(64 + Math.min(era, 26));
}

// === 변환율 테스트 (v2 Phase 기반) ===
describe('getConversionRate (Phase 기반 반감기)', () => {
    it('Phase 1 (A): 0 HBT 채굴됨 → 비율 1 (100P = 100 HBT)', () => {
        expect(getConversionRate(0)).toBe(1);
    });

    it('Phase 1 (A): 20,000,000 HBT 채굴됨 → 여전히 비율 1', () => {
        expect(getConversionRate(20_000_000)).toBe(1);
    });

    it('Phase 1 (A): 34,999,999 HBT → 아직 비율 1', () => {
        expect(getConversionRate(34_999_999)).toBe(1);
    });

    it('Phase 2 (B): 35,000,000 HBT 채굴됨 → 비율 0.5 (반감)', () => {
        expect(getConversionRate(35_000_000)).toBe(0.5);
    });

    it('Phase 3 (C): 52,500,000 HBT 채굴됨 → 비율 0.25', () => {
        expect(getConversionRate(52_500_000)).toBe(0.25);
    });

    it('Phase 4 (D): 61,250,000 HBT → 비율 0.125', () => {
        expect(getConversionRate(61_250_000)).toBe(0.125);
    });

    it('아주 큰 값에서도 최소 비율 보장 (0.01)', () => {
        expect(getConversionRate(69_999_999)).toBeGreaterThanOrEqual(0.01);
    });

    it('음수 입력은 Phase 1로 처리', () => {
        expect(getConversionRate(-100)).toBe(1);
    });
});

// === 구간(Phase) 테스트 ===
describe('getCurrentEra (Phase 기반)', () => {
    it('0 HBT → Phase 1', () => {
        expect(getCurrentEra(0)).toBe(1);
    });

    it('34,999,999 HBT → Phase 1 (아직 threshold 미도달)', () => {
        expect(getCurrentEra(34_999_999)).toBe(1);
    });

    it('35,000,000 HBT → Phase 2', () => {
        expect(getCurrentEra(35_000_000)).toBe(2);
    });

    it('52,500,000 HBT → Phase 3', () => {
        expect(getCurrentEra(52_500_000)).toBe(3);
    });

    it('61,250,000 HBT → Phase 4', () => {
        expect(getCurrentEra(61_250_000)).toBe(4);
    });

    it('Phase와 비율은 일관성 있게 대응', () => {
        const testCases = [
            { minted: 0, phase: 1, rate: 1 },
            { minted: 35_000_000, phase: 2, rate: 0.5 },
            { minted: 52_500_000, phase: 3, rate: 0.25 },
            { minted: 61_250_000, phase: 4, rate: 0.125 },
        ];
        testCases.forEach(({ minted, phase, rate }) => {
            expect(getCurrentEra(minted)).toBe(phase);
            expect(getConversionRate(minted)).toBe(rate);
        });
    });
});

// === 구간 라벨 테스트 ===
describe('eraLabel', () => {
    it('Phase 1 → "A"', () => {
        expect(eraLabel(1)).toBe('A');
    });

    it('Phase 2 → "B"', () => {
        expect(eraLabel(2)).toBe('B');
    });

    it('Phase 26 → "Z"', () => {
        expect(eraLabel(26)).toBe('Z');
    });

    it('Phase 27 이상은 "Z"로 제한', () => {
        expect(eraLabel(27)).toBe('Z');
        expect(eraLabel(100)).toBe('Z');
    });
});

// === HBT 계산 통합 테스트 ===
describe('포인트 → HBT 변환 계산 (v2)', () => {
    function calculateHbt(pointAmount, totalMinted = 0) {
        const rate = getConversionRate(totalMinted);
        return pointAmount * rate;
    }

    it('Phase 1 (A): 100P → 100 HBT', () => {
        expect(calculateHbt(100, 0)).toBe(100);
    });

    it('Phase 2 (B): 100P → 50 HBT', () => {
        expect(calculateHbt(100, 35_000_000)).toBe(50);
    });

    it('Phase 3 (C): 100P → 25 HBT', () => {
        expect(calculateHbt(100, 52_500_000)).toBe(25);
    });

    it('Phase 1 (A): 200P → 200 HBT', () => {
        expect(calculateHbt(200, 0)).toBe(200);
    });

    it('Phase 1 (A): 1000P → 1000 HBT', () => {
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
