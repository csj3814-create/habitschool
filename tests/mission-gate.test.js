import { describe, expect, it } from 'vitest';
import {
    WEEKLY_MISSION_OPEN_DAYS,
    decideWeeklyMissionGate,
    describeWeeklyMissionGate,
    hasUsedWeeklyMissions
} from '../js/mission-gate.js';

describe('주간 미션 접기', () => {
    it('기록 7일 전의 신규 회원에게는 접는다', () => {
        const gate = decideWeeklyMissionGate({}, 3);
        expect(gate.open).toBe(false);
        expect(gate.remainingDays).toBe(4);
    });

    it('기록 7일이 되면 연다', () => {
        expect(decideWeeklyMissionGate({}, WEEKLY_MISSION_OPEN_DAYS).open).toBe(true);
        expect(decideWeeklyMissionGate({}, 30).open).toBe(true);
    });

    it('미션을 써 본 회원은 기록일과 상관없이 연다', () => {
        // 가장 열심인 회원에게서 뺏지 않는다. 오래 쉬었다 돌아와 최근 기록이
        // 적어도 마찬가지다.
        const cases = [
            { weeklyMissionData: { missions: [{ type: 'diet' }] } },
            { missionHistory: [{ weekId: '2026-W30' }] },
            { selectedMissions: ['m1_diet'] },
            { missionBadges: ['firstMission'] },
            { missionLevel: 2 }
        ];
        cases.forEach((ud) => {
            expect(hasUsedWeeklyMissions(ud)).toBe(true);
            expect(decideWeeklyMissionGate(ud, 0).open).toBe(true);
        });
    });

    it('빈 흔적은 써 본 것으로 치지 않는다', () => {
        expect(hasUsedWeeklyMissions({
            weeklyMissionData: { missions: [] },
            missionHistory: [],
            selectedMissions: [],
            missionBadges: [],
            missionLevel: 1
        })).toBe(false);
        expect(hasUsedWeeklyMissions(null)).toBe(false);
    });

    it('이상한 기록일 수는 0 으로 본다', () => {
        expect(decideWeeklyMissionGate({}, NaN).recordedDays).toBe(0);
        expect(decideWeeklyMissionGate({}, -3).recordedDays).toBe(0);
    });

    it('접혀 있을 때 얼마나 남았는지 말한다', () => {
        expect(describeWeeklyMissionGate(decideWeeklyMissionGate({}, 3)))
            .toBe('기록 3/7일 · 7일이 되면 나만의 주간 목표를 세울 수 있어요');
        expect(describeWeeklyMissionGate(decideWeeklyMissionGate({}, 9))).toBe('');
    });
});
