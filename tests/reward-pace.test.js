import { describe, expect, it } from 'vitest';
import {
    computeDailyEarningPace,
    describeRewardGap,
    shiftDateString,
    REWARD_PACE_WINDOW_DAYS
} from '../js/reward-pace.js';

const log = (date, diet = 0, exercise = 0, mind = 0) => ({
    date,
    awardedPoints: { dietPoints: diet, exercisePoints: exercise, mindPoints: mind }
});

describe('shiftDateString', () => {
    it('월을 넘어가도 달력대로 옮긴다', () => {
        expect(shiftDateString('2026-03-01', -1)).toBe('2026-02-28');
        expect(shiftDateString('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('날짜 모양이 아니면 빈 문자열을 준다', () => {
        expect(shiftDateString('', -6)).toBe('');
        expect(shiftDateString('2026-9-1', -6)).toBe('');
    });
});

describe('computeDailyEarningPace', () => {
    it('기록이 없는 날도 분모에 넣는다', () => {
        // 이틀만 기록했고 각각 70P. 주 2회 쓰는 회원에게 매일 쓰는 속도를 보여주면
        // 예고한 날짜가 반드시 빗나간다.
        const pace = computeDailyEarningPace(
            [log('2026-09-23', 30, 30, 10), log('2026-09-21', 30, 30, 10)],
            '2026-09-23'
        );
        expect(pace).toBeCloseTo(140 / REWARD_PACE_WINDOW_DAYS, 6);
    });

    it('7일 창 밖의 기록은 세지 않는다', () => {
        const pace = computeDailyEarningPace(
            [log('2026-09-23', 10), log('2026-09-16', 80)],
            '2026-09-23'
        );
        expect(pace).toBeCloseTo(10 / REWARD_PACE_WINDOW_DAYS, 6);
    });

    it('미래 날짜는 세지 않는다', () => {
        const pace = computeDailyEarningPace([log('2026-09-30', 80)], '2026-09-23');
        expect(pace).toBe(0);
    });

    it('오늘 날짜를 모르면 0을 준다', () => {
        expect(computeDailyEarningPace([log('2026-09-23', 80)], '')).toBe(0);
    });

    it('awardedPoints 가 없는 기록은 건너뛴다', () => {
        expect(computeDailyEarningPace([{ date: '2026-09-23' }], '2026-09-23')).toBe(0);
    });
});

describe('describeRewardGap', () => {
    it('모자란 것이 없으면 아무 말도 하지 않는다', () => {
        expect(describeRewardGap(0, 40)).toBeNull();
        expect(describeRewardGap(-100, 40)).toBeNull();
    });

    it('남은 양과 예상 일수를 같이 말한다', () => {
        const result = describeRewardGap(1240, 100);
        expect(result.days).toBe(13);
        expect(result.text).toBe('1,240P 남았어요 · 요즘 속도면 약 13일');
    });

    it('속도를 모르면 날짜를 말하지 않는다', () => {
        // 모르면서 "약 N일" 로 적으면 그 날짜가 지나가는 순간 거짓말이 된다.
        const result = describeRewardGap(1240, 0);
        expect(result.days).toBeNull();
        expect(result.text).toBe('1,240P 더 모으면 교환할 수 있어요');
        expect(describeRewardGap(1240, NaN).days).toBeNull();
    });

    it('두 달 넘게 남았으면 날짜 대신 길을 알려준다', () => {
        const result = describeRewardGap(2000, 10);
        expect(result.days).toBe(200);
        expect(result.text).toBe('2,000P 남았어요 · 하루 한 번만 더 기록해도 훨씬 빨라져요');
    });

    it('단위를 그대로 따른다', () => {
        expect(describeRewardGap(500, 100, 'HBT').text).toBe('500HBT 남았어요 · 요즘 속도면 약 5일');
    });
});
