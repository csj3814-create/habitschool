import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 제보: "첫 미션, 나만의 미션 배지가 원래 본서버 내 계정에 있었는데
// 자물쇠가 되어 버렸네?"
//
// 남아 있던 여섯 개가 하필 주간 마감이 매주 다시 계산하는 목록과 정확히 같았다.
//
//   남은 것   weekComplete mStreak3 mStreak5 mStreak10 hardMode allCategories
//   사라진 것 firstMission customMaster   ← 마감이 다시 계산하지 않는 둘
//
// 둘 다 실제로 받은 배지였다. 미션을 저장한 주가 12주 있었고(firstMission),
// 2026-W13 에 커스텀 미션 "물 2l 마시기" 를 100% 달성했다(customMaster).
//
// 원인은 배열을 읽어서 합치고 통째로 쓴 것이다. 읽기가 짧게 답하면 그만큼 지워지고,
// 다시 계산되지 않는 배지는 영영 돌아오지 않는다.

const APP = readRepoFile('js/app-core.js');

// 주간 마감이 매주 다시 계산하는 배지. 나머지는 한 번 잃으면 스스로 돌아오지 않는다.
const RECOMPUTED = ['weekComplete', 'mStreak3', 'mStreak5', 'mStreak10', 'hardMode', 'allCategories'];
const NEVER_RECOMPUTED = ['firstMission', 'customMaster'];

function sliceFn(name, endMark) {
    const start = APP.indexOf(name);
    expect(start, `${name} 를 찾지 못했다`).toBeGreaterThan(-1);
    const end = APP.indexOf(endMark, start);
    expect(end).toBeGreaterThan(start);
    return APP.slice(start, end);
}

describe('a badge that was earned cannot be taken away', () => {
    const archive = sliceFn('    // 새 배지 추가.', 'await setDoc(doc(db, "users", uid), updateData, { merge: true });');
    const save = sliceFn('async function saveWeeklyMissions()', 'window.saveWeeklyMissions = saveWeeklyMissions;');

    it('adds to the badge list instead of rewriting it', () => {
        // 이 한 줄이 제보의 원인이었다.
        expect(archive).not.toContain('const allBadges = [...new Set([...existingBadges, ...newBadges])];');
        expect(archive).not.toContain('updateData.missionBadges = allBadges;');
        expect(archive).toContain('updateData.missionBadges = arrayUnion(...newBadges);');
    });

    it('stops reading the list just to protect it', () => {
        // 지키려고 읽던 것이 지우는 원인이었다. 읽기가 사라지면 기다림도 사라진다.
        expect(save).toContain("missionBadges: arrayUnion('firstMission')");
        expect(save).not.toContain('mission_badge_read_timeout');
        expect(save).not.toContain("[...existingBadges, 'firstMission']");
    });

    it('runs the real write and keeps a badge the read never mentioned', () => {
        // 읽기가 빈손으로 답한 상황 — 예전 코드가 배지를 지우던 바로 그 조건이다.
        const applied = applyArchiveBadgeWrite({ existingData: {}, newBadges: RECOMPUTED });
        for (const badge of NEVER_RECOMPUTED) {
            expect(applied.merged, `${badge} 가 사라졌다`).toContain(badge);
        }
        expect(applied.merged).toEqual(expect.arrayContaining(RECOMPUTED));
    });

    it('still records a badge that is genuinely new', () => {
        const applied = applyArchiveBadgeWrite({
            existingData: { missionBadges: ['firstMission'] },
            newBadges: ['weekComplete'],
        });
        expect(applied.merged).toEqual(expect.arrayContaining(['firstMission', 'weekComplete']));
        expect(applied.justEarned).toEqual(['weekComplete']);
    });

    it('does not celebrate a badge the member already had', () => {
        const applied = applyArchiveBadgeWrite({
            existingData: { missionBadges: ['weekComplete'] },
            newBadges: ['weekComplete'],
        });
        expect(applied.justEarned).toEqual([]);
    });

    it('writes nothing to the badge list on a week that earned none', () => {
        const applied = applyArchiveBadgeWrite({ existingData: {}, newBadges: [] });
        expect(applied.wrote).toBe(false);
    });
});

/**
 * 소스에서 배지 쓰기 대목만 떼어 와 실제로 돌린다. arrayUnion 은 서버가 하는 일이라
 * 여기서는 그 약속(있던 것에 더하기)을 그대로 흉내 낸다 — 옛 계정에 이미 있던
 * 배지를 더하기의 출발점으로 둔다.
 */
function applyArchiveBadgeWrite({ existingData, newBadges }) {
    const body = APP
        .split('    const existingBadges = existingData.missionBadges || [];')[1]
        .split('await setDoc(doc(db, "users", uid), updateData, { merge: true });')[0];

    const updateData = {};
    const run = Function('existingData', 'newBadges', 'updateData', 'arrayUnion', `
        const existingBadges = existingData.missionBadges || [];
        ${body}
        return justEarnedBadges;
    `);
    const justEarned = run(
        existingData,
        newBadges,
        updateData,
        (...ids) => ({ __union: ids })
    );

    // 서버에는 제보 당시의 여덟 개가 있었다고 본다. arrayUnion 이면 그대로 남아야 한다.
    const onServer = [...RECOMPUTED, ...NEVER_RECOMPUTED];
    const wrote = 'missionBadges' in updateData;
    const merged = wrote
        ? [...new Set([...onServer, ...updateData.missionBadges.__union])]
        : onServer;
    return { justEarned, merged, wrote };
}
