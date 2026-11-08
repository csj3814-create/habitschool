import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import {
    FEATURE_BADGES,
    LOCKABLE_FEATURES,
    decideFeatureAccess,
    hasChallengeTrace,
    hasHealthProfileData,
    hasMeasuredScoreData,
    lockedFeatureList,
    resolveFeatureUnlockConfig
} from '../js/feature-unlock.js';
import { countActiveDays } from '../js/activity-days.js';

const require = createRequire(new URL('../functions/index.js', import.meta.url));
const server = require('./feature-badges.js')._test;

// 2026-11-07 대표 합의: tasks/2026-11-07_단계별_기능_잠금_설계.md
const NEW = { enabled: true, legacy: false };
const LEGACY = { enabled: true, legacy: true };
const LAUNCH = '2026-11-08T00:00:00+09:00';

describe('단계', () => {
    it('3일 무료 · 7일 100P · 14일 200P', () => {
        expect(FEATURE_BADGES.map(({ id, days, cost }) => ({ id, days, cost }))).toEqual([
            { id: 'first', days: 3, cost: 0 },
            { id: 'habit', days: 7, cost: 100 },
            { id: 'haebit', days: 14, cost: 200 }
        ]);
    });

    it('첫 배지는 무료다 — 건강 점수를 포인트로 파는 모양을 피한다(대표 결정)', () => {
        const first = FEATURE_BADGES.find((badge) => badge.features.includes('healthScore'));
        expect(first.cost).toBe(0);
    });

    it('서버와 앱의 단계가 같다', () => {
        const strip = (list) => list.map(({ id, days, cost, features }) => ({ id, days, cost, features: [...features] }));
        expect(strip(server.FEATURE_BADGES)).toEqual(strip(FEATURE_BADGES));
    });

    it('서버와 앱이 기록일을 같은 기준으로 센다', () => {
        const logs = [
            { date: '2026-11-01', awardedPoints: { diet: true } },
            { date: '2026-11-02', awardedPoints: { dietPoints: 10 } },
            { date: '2026-11-03', awardedPoints: {} },
            { date: '2026-11-04', awardedPoints: { mindPoints: 0, exercise: true } },
            { date: 'bad', awardedPoints: { diet: true } }
        ];
        expect(server.countRecordedDays(logs)).toBe(countActiveDays(logs));
        expect(server.countRecordedDays(logs)).toBe(3);
    });
});

describe('새 회원', () => {
    it('기록 2일이면 다 잠겨 있고, 다음은 첫걸음 배지(하루 남음)', () => {
        const access = decideFeatureAccess({ config: NEW, recordedDays: 2 });
        expect(access.active).toBe(true);
        expect(Object.values(access.open).every((open) => !open)).toBe(true);
        expect(access.next).toMatchObject({ id: 'first', remainingDays: 1, eligible: false });
    });

    it('기록 3일이면 첫걸음 배지를 받을 수 있지만, 받기 전에는 잠겨 있다', () => {
        const access = decideFeatureAccess({ config: NEW, recordedDays: 3 });
        expect(access.next).toMatchObject({ id: 'first', eligible: true });
        expect(access.open.healthScore).toBe(false);
    });

    it('받은 배지의 기능만 열린다', () => {
        const access = decideFeatureAccess({ config: NEW, recordedDays: 8, userData: { featureBadges: { first: { cost: 0 } } } });
        expect(access.open).toMatchObject({ healthScore: true, habitGroup: true, weeklyMission: false, challenge: false, report30: false });
        expect(access.next).toMatchObject({ id: 'habit', eligible: true });
    });

    it('한번 받은 배지는 기록이 줄어도 그대로다', () => {
        const access = decideFeatureAccess({ config: NEW, recordedDays: 0, userData: { featureBadges: { first: {}, habit: {}, haebit: {} } } });
        expect(access.active).toBe(false);
        expect(lockedFeatureList(access)).toBe('');
    });

    it('앞 배지를 건너뛰고 받아도 그 배지의 기능은 열린다', () => {
        const access = decideFeatureAccess({ config: NEW, recordedDays: 14, userData: { featureBadges: { haebit: {} } } });
        expect(access.open.report30).toBe(true);
        expect(access.open.healthScore).toBe(false);
    });
});

describe('건강 정보를 늦게 보여 주지 않는다', () => {
    it('건강 수치를 넣었으면 기록 0일이어도 점수가 열린다', () => {
        expect(decideFeatureAccess({ config: NEW, recordedDays: 0, hasHealthData: true }).open.healthScore).toBe(true);
        const fromProfile = decideFeatureAccess({ config: NEW, recordedDays: 0, userData: { healthProfile: { hba1c: '6.1' } } });
        expect(fromProfile.open.healthScore).toBe(true);
    });

    it('성별·복용약만 있으면 잰 값이 아니다', () => {
        expect(hasHealthProfileData({ healthProfile: { sex: 'male', meds: [], updatedAt: '2026-11-01' } })).toBe(false);
        expect(hasHealthProfileData({ healthProfile: { sex: 'male', meds: ['bp'] } })).toBe(false);
        expect(hasHealthProfileData({ healthProfile: { heightCm: 170 } })).toBe(true);
        expect(hasHealthProfileData({ healthProfile: { smokingStatus: 'never' } })).toBe(true);
        expect(hasHealthProfileData({ healthProfile: { weight: '' } })).toBe(false);
    });

    it('기록만으로 나오는 점수 항목은 건강 수치로 세지 않는다', () => {
        const recordsOnly = {
            behaviors: { diet: { missing: false }, activity: { missing: false }, sleep: { missing: false }, nicotine: { missing: true } },
            factors: { bmi: { missing: true }, lipids: { missing: true }, glucose: { missing: true }, bp: { missing: true } }
        };
        const metabolic = { breakdown: { lifestyle: { missing: false }, bodyFat: { missing: true }, muscle: { missing: true }, insulinResistance: { missing: true } } };
        expect(hasMeasuredScoreData(recordsOnly, metabolic)).toBe(false);
        expect(hasMeasuredScoreData({ ...recordsOnly, factors: { ...recordsOnly.factors, bp: { missing: false } } }, metabolic)).toBe(true);
        expect(hasMeasuredScoreData(recordsOnly, { breakdown: { ...metabolic.breakdown, insulinResistance: { missing: false } } })).toBe(true);
    });
});

describe('기존 회원의 기능을 잠그지 않는다', () => {
    it('출시 전 가입 + 기록 1일 이상이면 전부 열린다', () => {
        const access = decideFeatureAccess({ config: LEGACY, recordedDays: 1 });
        expect(access.active).toBe(false);
        expect(access.next).toBe(null);
    });

    it('출시 전 가입이라도 기록이 없으면 새 회원처럼 본다', () => {
        expect(decideFeatureAccess({ config: LEGACY, recordedDays: 0 }).active).toBe(true);
    });

    it('써 본 흔적이 있는 기능은 열려 있다', () => {
        const access = decideFeatureAccess({
            config: NEW,
            recordedDays: 1,
            userData: { missionHistory: [{ weekId: 'w' }], activeChallenges: { mini: { status: 'ongoing' } } }
        });
        expect(access.open.weeklyMission).toBe(true);
        expect(access.open.challenge).toBe(true);
        expect(access.open.report30).toBe(false);
        // 습관 배지의 기능이 모두 열려 있으면 받을 필요가 없다.
        expect(access.badges.find((badge) => badge.id === 'habit')).toMatchObject({ unlocked: true, eligible: false });
    });

    it('끝난 챌린지 칸만 남은 건 흔적이 아니다', () => {
        expect(hasChallengeTrace({ activeChallenges: { mini: null } })).toBe(false);
        expect(hasChallengeTrace({ activeChallenge: { tier: 'mini' } })).toBe(true);
    });
});

describe('모르면 연다', () => {
    it('설정을 못 읽었거나 꺼져 있거나 기록을 못 읽었으면 잠그지 않는다', () => {
        for (const input of [
            { config: null, recordedDays: 0 },
            { config: { enabled: false, legacy: false }, recordedDays: 0 },
            { config: NEW, recordedDays: null }
        ]) {
            const access = decideFeatureAccess(input);
            expect(access.active).toBe(false);
            expect(LOCKABLE_FEATURES.every((feature) => access.open[feature])).toBe(true);
        }
    });

    it('스위치: 문서가 없거나 날짜가 없으면 꺼진 것이다', () => {
        expect(resolveFeatureUnlockConfig(null, Date.now())).toBe(null);
        expect(resolveFeatureUnlockConfig({ enabled: true }, Date.now())).toEqual({ enabled: false, legacy: true });
        expect(resolveFeatureUnlockConfig({ enabled: false, launchedAt: LAUNCH }, Date.now())).toEqual({ enabled: false, legacy: true });
    });

    it('출시보다 먼저 만든 계정은 출시 전 회원, 만든 때를 모르면 출시 전 회원', () => {
        const launched = Date.parse(LAUNCH);
        expect(resolveFeatureUnlockConfig({ enabled: true, launchedAt: LAUNCH }, launched - 1)).toEqual({ enabled: true, legacy: true });
        expect(resolveFeatureUnlockConfig({ enabled: true, launchedAt: LAUNCH }, launched + 1)).toEqual({ enabled: true, legacy: false });
        expect(resolveFeatureUnlockConfig({ enabled: true, launchedAt: LAUNCH }, NaN)).toEqual({ enabled: true, legacy: true });
    });

    it('서버도 날짜 없는 켜짐은 꺼진 것으로 본다', () => {
        expect(server.normalizeFeatureUnlockSettings({ enabled: true }).enabled).toBe(false);
        expect(server.normalizeFeatureUnlockSettings({ enabled: true, launchedAt: LAUNCH }).enabled).toBe(true);
        expect(server.normalizeFeatureUnlockSettings(null).enabled).toBe(false);
    });
});

describe('서버가 배지를 줄 때', () => {
    const base = { enabled: true, owned: {}, recordedDays: 14, coins: 1000 };

    it('조건이 맞으면 준다', () => {
        expect(server.decideBadgeClaim({ ...base, badgeId: 'first' })).toMatchObject({ ok: true });
        expect(server.decideBadgeClaim({ ...base, badgeId: 'haebit' }).badge.cost).toBe(200);
    });

    it('기록일·포인트가 모자라거나 이미 받았거나 꺼져 있으면 주지 않는다', () => {
        expect(server.decideBadgeClaim({ ...base, badgeId: 'habit', recordedDays: 6 }).reason).toBe('not_enough_days');
        expect(server.decideBadgeClaim({ ...base, badgeId: 'habit', coins: 99 }).reason).toBe('not_enough_points');
        expect(server.decideBadgeClaim({ ...base, badgeId: 'habit', owned: { habit: {} } }).reason).toBe('already_owned');
        expect(server.decideBadgeClaim({ ...base, badgeId: 'habit', enabled: false }).reason).toBe('disabled');
        expect(server.decideBadgeClaim({ ...base, badgeId: 'gold' }).reason).toBe('unknown_badge');
    });

    it('무료 배지는 포인트가 0이어도 받는다', () => {
        expect(server.decideBadgeClaim({ ...base, badgeId: 'first', coins: 0, recordedDays: 3 }).ok).toBe(true);
    });

    it('차감 기록은 배지마다 하나의 고정 번호다(두 번 빠지지 않는다)', () => {
        expect(server.featureBadgeLedgerId('habit', 'u1')).toBe('feature_badge_habit_u1');
    });
});
