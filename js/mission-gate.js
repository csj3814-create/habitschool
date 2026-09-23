/**
 * 주간 미션을 누구에게 펼쳐 보일지 정한다.
 *
 * 2026-09-23 운영 집계: 최근 14일 기록한 회원 22명 중 이번 주·지난주에 미션을
 * 정한 사람은 5명이었다. 쓰는 사람은 잘 쓴다 — 정산된 102주의 달성률 중앙값이
 * 88% 다. 그 사이 마일스톤·주간 요약·교환까지 남은 거리 같은 것이 생겨서, 신규
 * 회원 첫 화면에서 미션은 "매일 기록하면 12일 뒤 커피" 와 자리를 다투고 있었다.
 *
 * 그래서 없애지 않고 **순서를 미룬다.** 기록이 7일 쌓이기 전에는 한 줄로 접어
 * 두고, 한 번이라도 미션을 써 본 회원에게는 언제나 그대로 보인다 — 가장 열심인
 * 회원에게서 뺏지 않는다.
 *
 * 의존성이 없는 순수 모듈이다. 판단만 하고 화면은 app-core.js 가 그린다.
 */

export const WEEKLY_MISSION_OPEN_DAYS = 7;

/** 미션을 한 번이라도 써 본 흔적이 있는가. 하나라도 있으면 접지 않는다. */
export function hasUsedWeeklyMissions(userData = {}) {
    const ud = userData && typeof userData === 'object' ? userData : {};
    if (Array.isArray(ud.weeklyMissionData?.missions) && ud.weeklyMissionData.missions.length > 0) return true;
    if (Array.isArray(ud.missionHistory) && ud.missionHistory.length > 0) return true;
    if (Array.isArray(ud.selectedMissions) && ud.selectedMissions.length > 0) return true;
    if (Array.isArray(ud.missionBadges) && ud.missionBadges.length > 0) return true;
    if (Number(ud.missionLevel) > 1) return true;
    return false;
}

/**
 * recordedDayCount 는 대시보드가 최근 30개 기록으로 센 기록일 수다.
 * 7일을 판단하기에는 충분하다.
 */
export function decideWeeklyMissionGate(userData = {}, recordedDayCount = 0) {
    const recordedDays = Math.max(0, Math.floor(Number(recordedDayCount) || 0));
    const usedBefore = hasUsedWeeklyMissions(userData);
    const open = usedBefore || recordedDays >= WEEKLY_MISSION_OPEN_DAYS;
    return {
        open,
        usedBefore,
        recordedDays,
        remainingDays: open ? 0 : WEEKLY_MISSION_OPEN_DAYS - recordedDays
    };
}

/** 접혀 있을 때 한 줄. 얼마나 남았는지 말한다. */
export function describeWeeklyMissionGate(gate = {}) {
    if (!gate || gate.open) return '';
    return `기록 ${gate.recordedDays}/${WEEKLY_MISSION_OPEN_DAYS}일 · 7일이 되면 나만의 주간 목표를 세울 수 있어요`;
}
