import { describe, expect, it } from 'vitest';
import {
    buildAdminPrescriptionDrafts,
    ADMIN_PRESCRIPTION_GOOD_ENOUGH as GOOD_ENOUGH,
} from '../js/admin-utils.js';
import { WEEKLY_ACTIVITY_TARGET_MINUTES } from '../js/le8-score.js';

const TODAY = '2026-09-15';
// 하루치 완전 기록 — '빈 자리' 초안이 끼어들어 시험을 흐리지 않게 한다.
const FULL_DAY = { date: TODAY, diet: { breakfastUrl: 'x' }, steps: { count: 9000 }, sleepAndMind: { sleepHours: 7 } };

const worsenedDraft = (key, label, unit, decimals, previous, recent) => buildAdminPrescriptionDrafts({
    name: '루미나', logs: [FULL_DAY], todayStr: TODAY,
    trendMetrics: [{
        key, label, unit, decimals,
        summary: { recent, previous, delta: recent - previous, direction: 'worsened' },
    }],
}).find((d) => d.key.includes('worsened'));

// 2026-09-15 지적: "2만보는 엄청 많이 걷는 건데 그걸 좀 줄었다고 잔소리를 해야
// 겠냐? 식단, 운동 모두 기준보다 못할때 잔소리를 하는 거지 잘 하고 있는데
// 조금 떨어졌다고 잔소리 하진 말자." / "식단 90점도 마찬가지."
//
// '나빠진 지표' 는 상대 변화만 봤다. 23,816보 → 21,851보 는 줄어든 것이 맞지만
// 21,851보는 목표의 세 배가 넘는다.
describe('nobody is nagged for slipping while still doing well', () => {
    it('leaves the big walkers alone', () => {
        // 관제탑 화면에 실제로 있던 두 줄.
        expect(worsenedDraft('steps', '걸음수', '보', 0, 23816, 21851)).toBeUndefined();
        expect(worsenedDraft('steps', '걸음수', '보', 0, 16152, 14832)).toBeUndefined();
    });

    it('leaves a 90-point diet alone', () => {
        expect(worsenedDraft('dietGrade', '식단 등급', '점', 0, 95, 90)).toBeUndefined();
    });

    it('still speaks up when the recent value is under the line', () => {
        // 이것이 요청의 나머지 절반이다 — 기준보다 못하면 말해야 한다.
        expect(worsenedDraft('dietGrade', '식단 등급', '점', 0, 85, 77)).toBeTruthy();
        expect(worsenedDraft('dietGrade', '식단 등급', '점', 0, 83, 76)).toBeTruthy();
        expect(worsenedDraft('steps', '걸음수', '보', 0, 7000, 5200)).toBeTruthy();
        expect(worsenedDraft('sleepHours', '수면', '시간', 1, 6.9, 5.8)).toBeTruthy();
        expect(worsenedDraft('glucose', '공복혈당', 'mg/dL', 0, 101, 115)).toBeTruthy();
    });

    it('measures walking with the same ruler the activity score uses', () => {
        // 일상 이동분 4,000보를 빼고 분당 100보로 환산해 주 150분을 채우는 걸음수.
        expect(GOOD_ENOUGH.steps.atLeast)
            .toBeCloseTo(4000 + (WEEKLY_ACTIVITY_TARGET_MINUTES / 7) * 100, 5);
        // 그 선 바로 위아래에서 갈린다.
        expect(worsenedDraft('steps', '걸음수', '보', 0, 9000, 6200)).toBeUndefined();
        expect(worsenedDraft('steps', '걸음수', '보', 0, 9000, 6100)).toBeTruthy();
    });

    it('takes every line from what the app already calls good', () => {
        // js/le8-score.js 의 구간이다. 새로 정한 숫자가 아니다.
        expect(GOOD_ENOUGH.sleepHours.atLeast).toBe(7);      // 7~9시간 = 100점
        expect(GOOD_ENOUGH.dietGrade.atLeast).toBe(80);      // B = 80점
        expect(GOOD_ENOUGH.glucose.atMost).toBe(100);        // 100 이상은 전당뇨
        expect(GOOD_ENOUGH.bpSystolic.atMost).toBe(120);     // 120 미만 = 100점
        expect(GOOD_ENOUGH.bpDiastolic.atMost).toBe(80);     // 80 미만 = 100점
        expect(GOOD_ENOUGH.hba1c.atMost).toBe(5.7);          // 5.7 미만 만점
        expect(GOOD_ENOUGH.nonHdl.atMost).toBe(130);         // 130 미만 = 100점
    });

    it('says nothing about a metric it has no standard for', () => {
        // 체지방·골격근량·내장지방은 LE8 에 기준이 없다. 잘하고 있는지 말할 수
        // 없으므로 지금처럼 알린다 — 모르면서 괜찮다고 하는 것이 더 나쁘다.
        for (const key of ['bodyFat', 'muscle', 'visceral']) {
            expect(GOOD_ENOUGH[key], key).toBeUndefined();
        }
        expect(worsenedDraft('bodyFat', '체지방', 'kg', 1, 22.0, 25.0)).toBeTruthy();
    });

    it('does not touch praise — only the scolding half', () => {
        const praise = buildAdminPrescriptionDrafts({
            name: '루미나', logs: [FULL_DAY], todayStr: TODAY,
            trendMetrics: [{
                key: 'steps', label: '걸음수', unit: '보', decimals: 0,
                summary: { recent: 23816, previous: 21851, delta: 1965, direction: 'improved' },
            }],
        }).find((d) => d.key.includes('improved'));
        expect(praise).toBeTruthy();
    });
});
