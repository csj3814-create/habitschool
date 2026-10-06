import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMvpRewardNotifications } from '../scripts/backfill-mvp-reward-notifications.mjs';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');
const RUNTIME = read('functions/runtime.js');
const APP = read('js/app-core.js');

// 2026-10-02 제보: "이번달 커뮤니티 현황 통해 받는 포인트는 축하 박스도 안뜨고
// 포인트 리스트에도 안 떠." 지급 함수가 코인만 올리고 아무것도 남기지 않았다.
describe('a monthly MVP reward leaves a trace the winner can see', () => {
    it('writes a notification for each winner in the same batch as the coins', () => {
        const fn = RUNTIME.split('async function distributeMvpRewardForMonth(')[1].split('\nexports.')[0];
        const coins = fn.indexOf('coins: FieldValue.increment(reward.points)');
        const note = fn.indexOf("type: 'mvp_reward'");
        expect(coins).toBeGreaterThan(-1);
        expect(note).toBeGreaterThan(coins);
        expect(fn).toContain('batch.set(db.doc(`notifications/${mvpRewardNotificationId(targetMonth, winner.userId)}`)');
        expect(fn.indexOf('await batch.commit();')).toBeGreaterThan(note);
    });

    it('uses one fixed id per month and member, so it never doubles', () => {
        expect(RUNTIME).toContain('return `mvp_${month}_${userId}`;');
        const [note] = buildMvpRewardNotifications('2026-09', {
            distributedAt: '2026-10-02T00:05:09.216Z',
            winners: [{ rank: 1, userId: 'u1', reward: 5000 }]
        });
        expect(note.id).toBe('mvp_2026-09_u1');
        expect(note.fields).toMatchObject({ postOwnerId: 'u1', type: 'mvp_reward', month: '2026-09', rank: 1, bonusPoints: 5000 });
        expect(note.fields.createdAt).toBe('2026-10-02T00:05:09.216Z');
    });

    it('skips a winner with nothing paid', () => {
        expect(buildMvpRewardNotifications('2026-09', { winners: [{ userId: 'u1', reward: 0 }, null] })).toEqual([]);
    });

    it('shows it in the point history and celebrates it once', () => {
        expect(APP).toContain("where('type', '==', 'mvp_reward'),");
        expect(APP).toContain('const _p_mvpRewardHistory = fetchMvpRewardNotifications(user.uid)');
        expect(APP).toContain('label: describeMvpRewardLabel(reward),');
        expect(APP).toContain('id: `mvp_reward_${reward.month}`,');
        expect(APP).toContain('celebrateMvpRewards(user.uid);');
    });
});
