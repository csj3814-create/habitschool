import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-11-08 대표: "알림은 한번만 띄워줘. 컴마다 다 다시뜨고 있어. 식사시간 알림,
// 친구연결 알림도 마찬가지." 대표 계정에 기기 넷(PC 셋·폰 하나)이 걸려 있었고
// 푸시가 네 곳에 다 떴다.

const require = createRequire(import.meta.url);
const { pickLatestPushDevicePerUser } = require('../functions/notification-utils.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const APP = readRepoFile('js/app-core.js');

describe('a push goes to one device per member', () => {
    it('keeps only the device the member opened most recently', () => {
        const picked = pickLatestPushDevicePerUser([
            { uid: 'u1', token: 'pc-old', updatedAtMs: 100 },
            { uid: 'u1', token: 'pc-today', updatedAtMs: 300 },
            { uid: 'u1', token: 'phone', updatedAtMs: 200 },
            { uid: 'u2', token: 'only', updatedAtMs: 0 },
        ]);
        expect(picked.map((d) => d.token).sort()).toEqual(['only', 'pc-today']);
    });

    it('puts a device with no time last, and skips empty tokens', () => {
        const picked = pickLatestPushDevicePerUser([
            { uid: 'u1', token: 'no-time' },
            { uid: 'u1', token: 'dated', updatedAtMs: 5 },
            { uid: 'u1', token: '', updatedAtMs: 999 },
        ]);
        expect(picked.map((d) => d.token)).toEqual(['dated']);
    });

    it('is what every member-targeted and broadcast send goes through', () => {
        const forUsers = RUNTIME.split('async function collectPushTargetsForUsers(')[1].split('\nasync function ')[0];
        expect(forUsers).toContain('.select("token", "enabled", "updatedAt")');
        expect(forUsers).toContain('addLatestPushDevices(targetMap, devices, userLocaleById)');
        // 기기 문서가 있는 회원에게는 옛 users.fcmToken 을 더하지 않는다.
        expect(forUsers).toContain('uniqueUserIds.filter((uid) => !devicedUids.has(uid))');

        const all = RUNTIME.split('async function collectAllPushTargets(')[1].split('\nfunction ')[0];
        expect(all).toContain('.select("token", "updatedAt")');
        expect(all).toContain('collectLegacyPushTargets(targetMap, null, devicedUids)');
    });

    it('does not fall back to every member when no legacy member is left', () => {
        // 빈 목록을 "전체" 로 읽으면 한 사람에게 갈 알림이 모두에게 간다.
        const legacy = RUNTIME.split('async function collectLegacyPushTargets(')[1].split('\n}\n')[0];
        expect(legacy).toContain('if (userIds.length === 0) return;');
        expect(legacy).toContain('if (skipUids.has(snap.id)) return;');
    });
});

describe('the monthly MVP sheet shows once', () => {
    it('skips a reward whose notification was already seen, and marks it when shown', () => {
        const fn = APP.split('async function celebrateMvpRewards(')[1].split('\n}\n')[0];
        expect(fn).toContain('!reward.seen');
        expect(fn).toContain("onCelebrated: () => markChallengeNotificationClientSeen(reward.id, uid, 'celebrated')");
        expect(APP).toContain('seen: isChallengeNotificationServerSeen(data)');
    });
});
