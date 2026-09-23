import { describe, expect, it } from 'vitest';
import {
    DAILY_MAX_POINTS,
    describeRewardGap,
    projectFastestRedemption
} from '../js/reward-pace.js';
import { readRepoFile } from './source-helpers.js';

// 실제 정의로 센다. 시험이 보상 값을 따로 적어 두면 표가 바뀔 때 시험만 옛날 값을 믿는다.
const configSource = readRepoFile('js/firebase-config.js');
const MILESTONES = (() => {
    const body = configSource.split('export const MILESTONES = ')[1].split('\n};')[0] + '\n}';
    return Function(`return (${body});`)();
})();

const fresh = { definitions: MILESTONES, state: {}, streak: 0 };

function allAchieved(claimed) {
    const state = {};
    Object.values(MILESTONES).forEach((cat) => cat.levels.forEach((level) => {
        state[level.id] = { achieved: true, bonusClaimed: claimed };
    }));
    return state;
}

describe('하루 최대치는 서버 상한과 같다', () => {
    it('식단 30 + 운동 30 + 마음 20', () => {
        const points = readRepoFile('functions/points-utils.js');
        const caps = [...points.matchAll(/(dietPoints|exercisePoints|mindPoints):\s*(\d+)/g)]
            .slice(0, 3)
            .reduce((sum, m) => sum + Number(m[2]), 0);
        expect(DAILY_MAX_POINTS).toBe(caps);
    });
});

describe('매일 다 채우면 며칠', () => {
    it('모자란 것이 없으면 아무 말도 하지 않는다', () => {
        expect(projectFastestRedemption(0, fresh)).toBeNull();
        expect(describeRewardGap(-10, fresh)).toBeNull();
    });

    it('신규 회원은 그 사이 마일스톤 보너스를 받아 더 빨리 닿는다', () => {
        // 가입 200P 만 있는 회원이 첫 쿠폰(1,400P)까지. 80P × 15 = 1,200 으로는
        // 모자라지만 1·3·7·14일차 보너스가 들어와 더 일찍 닿는다.
        const result = projectFastestRedemption(1200, fresh);
        expect(result.upcomingBonus).toBeGreaterThan(0);
        expect(result.days).toBeLessThan(Math.ceil(1200 / DAILY_MAX_POINTS));
        // 그날 쌓인 것이 실제로 모자란 양을 넘는다.
        expect(result.days * DAILY_MAX_POINTS + result.upcomingBonus).toBeGreaterThanOrEqual(1200);
    });

    it('하루 모자라게 잡지 않는다', () => {
        const result = projectFastestRedemption(1200, fresh);
        const dayBefore = projectFastestRedemption(1200, fresh);
        // 같은 입력은 같은 답 — 그리고 전날까지의 합은 모자라야 한다.
        expect(result).toEqual(dayBefore);
        expect((result.days - 1) * DAILY_MAX_POINTS).toBeLessThan(1200);
    });

    it('이미 달성하고 안 받은 보너스는 지금 바로 뺀다', () => {
        const claimable = projectFastestRedemption(300, {
            definitions: MILESTONES,
            state: { streak1: { achieved: true, bonusClaimed: false } },
            streak: 1
        });
        const reward = MILESTONES.streak.levels.find((l) => l.id === 'streak1').reward;
        expect(claimable.claimableNow).toBe(reward);
    });

    it('받을 보너스만으로 충분하면 0일', () => {
        const result = projectFastestRedemption(50, {
            definitions: MILESTONES,
            state: allAchieved(false),
            streak: 60
        });
        expect(result.days).toBe(0);
        expect(describeRewardGap(50, { definitions: MILESTONES, state: allAchieved(false), streak: 60 }).text)
            .toContain('바로 교환돼요');
    });

    it('다 받은 회원은 80P/일로만 센다', () => {
        const result = projectFastestRedemption(800, {
            definitions: MILESTONES,
            state: allAchieved(true),
            streak: 60
        });
        expect(result.days).toBe(10);
        expect(result.claimableNow).toBe(0);
        expect(result.upcomingBonus).toBe(0);
    });

    it('이미 넘은 목표의 보너스를 다시 세지 않는다', () => {
        // 식단 7일을 달성한 회원에게 식단 1·3·7일 보너스를 또 약속하면 안 된다.
        const state = {
            diet1: { achieved: true, bonusClaimed: true },
            diet3: { achieved: true, bonusClaimed: true },
            diet7: { achieved: true, bonusClaimed: true }
        };
        const withHistory = projectFastestRedemption(2000, { definitions: MILESTONES, state, streak: 0 });
        const newcomer = projectFastestRedemption(2000, fresh);
        expect(withHistory.upcomingBonus).toBeLessThan(newcomer.upcomingBonus);
    });

    it('정의를 못 받으면 80P/일로만 센다', () => {
        expect(projectFastestRedemption(800, {}).days).toBe(10);
    });
});

describe('문구', () => {
    it('며칠이면 되는지와 보너스를 같이 말한다', () => {
        const result = describeRewardGap(1140, fresh);
        expect(result.text).toMatch(/^1,140P 남았어요 · 매일 다 채우면 \d+일이면 돼요 \(보너스 \+[\d,]+P 포함\)$/);
    });

    it('보너스가 없으면 보너스를 말하지 않는다', () => {
        const text = describeRewardGap(800, { definitions: MILESTONES, state: allAchieved(true), streak: 60 }).text;
        expect(text).toBe('800P 남았어요 · 매일 다 채우면 10일이면 돼요');
    });

    it('단위를 따른다', () => {
        expect(describeRewardGap(800, {}, 'HBT').text).toBe('800HBT 남았어요 · 매일 다 채우면 10일이면 돼요');
    });
});
