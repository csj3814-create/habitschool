import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { englishForErrorMessage } = require('../functions/error-messages.js');
const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtime = readFileSync(resolve(ROOT_DIR, 'functions/runtime.js'), 'utf8');

// 2026-11-08 대표: "두개면 한달에 2000p씩 더 줘야하니 부담스러워." / "14일 채우고 탈퇴하고 다른 소모임 가입도 문제고."
// 한 번에 한 모임, 보상을 받은 4주가 끝나기 전에는 어느 모임도 새로 시작하지 않는다.
describe('one habit group at a time, one reward per four weeks', () => {
    const join = runtime.split('exports.joinHabitGroup = onCall(')[1].split('exports.finishHabitGroup')[0];

    it('allows one group at a time on the server', () => {
        expect(runtime).toContain('const MAX_HABIT_GROUP_MEMBERSHIPS = 1;');
        expect(join).toContain('activeMemberships.length >= MAX_HABIT_GROUP_MEMBERSHIPS');
    });

    it('makes a member who was paid wait until that round would have ended, in any group', () => {
        expect(join).toContain('.collection("exercise_group_reward_progress")');
        expect(join).toContain('if (!alreadyActive) {');
        expect(join).toContain('findPaidHabitGroupWindowEnd(myProgressSnap.docs.map');
        const helper = runtime.split('function findPaidHabitGroupWindowEnd(')[1].split('\nfunction ')[0];
        expect(helper).toContain('=== "paid"');
        expect(helper).toContain('windowEndDate >= todayStr');
    });

    it('speaks English for the new refusals', () => {
        expect(englishForErrorMessage('보상을 받은 4주가 2026-12-05에 끝나요. 다음 소모임은 그다음 날부터 시작할 수 있어요.'))
            .toBe('The 4 weeks you were rewarded for end on 2026-12-05. You can start your next group the day after.');
        expect(englishForErrorMessage('운동 소모임은 최대 1개까지 동시에 참여할 수 있습니다.')).toBe('You can be in up to 1 exercise group at a time.');
        expect(englishForErrorMessage('아직 기간이 남아 있어요. 기간이 끝나거나 14번을 채우면 마무리할 수 있어요.'))
            .toContain('after 14 check-ins');
    });
});
