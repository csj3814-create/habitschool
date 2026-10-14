import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { hasHealthConnectSleepCredit } from '../js/health-connect-activity.js';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const { calculateServerAwardedPoints, isHealthConnectSleepEvidence } = require('../functions/points-utils.js');

// 2026-10-14 요청: "헬스 커넥트에서 가져온 수면도 점수로 인정해 줘."
// 수면 캡처와 같은 칸(mind_sleep 10P)이다. 둘 다 있어도 10P 한 번.
const DATE = '2026-10-14';
// 23:00 KST 에 누워 06:30 KST 에 깸 — 7시간 잠
const sync = {
    source: 'health_connect',
    providerLabel: 'Samsung Health',
    wakeDate: DATE,
    startEpochMillis: Date.parse('2026-10-13T14:00:00Z'),
    endEpochMillis: Date.parse('2026-10-13T21:30:00Z'),
    asleepMinutes: 420,
    inBedMinutes: 450,
    awakeMinutes: 30,
    deepMinutes: 80,
    remMinutes: 90,
    lightMinutes: 250,
    hasStages: true,
    sleepHours: 7,
    syncedAtEpochMillis: Date.parse('2026-10-13T22:00:00Z')
};
const mind = (extra = {}) => ({ sleepHours: 7, sleepSync: { ...sync }, ...extra });
const log = (sleepAndMind) => ({ userId: 'u1', date: DATE, sleepAndMind });

async function serverMind(sleepAndMind, { mediaValid = true } = {}) {
    const result = await calculateServerAwardedPoints(log(sleepAndMind), {
        isValidMedia: async () => mediaValid
    });
    return {
        points: result.awardedPoints.mindPoints,
        units: result.ledgerUnits.filter((u) => u.category === 'mind')
    };
}

describe('Health Connect 밤잠은 수면 10P', () => {
    it('그날 깬 밤잠이고 칸의 시간이 그대로면 10P', async () => {
        const r = await serverMind(mind());
        expect(r.points).toBe(10);
        expect(r.units).toEqual([expect.objectContaining({ key: 'mind_sleep', points: 10, evidenceType: 'health_connect_sleep' })]);
    });

    it('수면 캡처와 함께 있어도 10P 한 번 — 사진이 그 칸을 가져간다', async () => {
        const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/sleep_images%2Fu1%2Fa.jpg?alt=media';
        const r = await serverMind(mind({ sleepImageUrl: url }));
        expect(r.units.filter((u) => u.key === 'mind_sleep')).toHaveLength(1);
        expect(r.points).toBe(10);
    });

    it('회원이 시간을 고쳤으면 기기 기록이 아니다', async () => {
        expect((await serverMind(mind({ sleepHours: 8 }))).points).toBe(0);
    });

    it('다른 날 깬 밤잠은 오늘 점수가 아니다', async () => {
        expect((await serverMind(mind({ sleepSync: { ...sync, wakeDate: '2026-10-13' } }))).points).toBe(0);
        // 깬 시각이 실제로 그날이어야 한다(wakeDate 만 바꿔 적은 것은 안 된다)
        const shifted = { ...sync, endEpochMillis: Date.parse('2026-10-12T21:30:00Z'), startEpochMillis: Date.parse('2026-10-12T14:00:00Z') };
        expect((await serverMind(mind({ sleepSync: shifted }))).points).toBe(0);
    });

    it('두 시간도 안 누운 것과 이상한 값은 세지 않는다', async () => {
        expect((await serverMind(mind({ sleepSync: { ...sync, inBedMinutes: 90 } }))).points).toBe(0);
        expect((await serverMind(mind({ sleepSync: { ...sync, asleepMinutes: 500 } }))).points).toBe(0);
        expect((await serverMind(mind({ sleepSync: { ...sync, source: 'manual' } }))).points).toBe(0);
        expect((await serverMind({ sleepHours: 7 })).points).toBe(0);
    });

    it('감사·명상과 합쳐 20P 상한', async () => {
        expect((await serverMind(mind({ meditationDone: true }))).points).toBe(20);
    });
});

describe('앱이 미리 보여 주는 점수도 같은 기준이다', () => {
    const cases = [
        mind(),
        mind({ sleepHours: 8 }),
        mind({ sleepSync: { ...sync, wakeDate: '2026-10-13' } }),
        mind({ sleepSync: { ...sync, inBedMinutes: 90 } }),
        mind({ sleepSync: { ...sync, source: 'manual' } }),
        { sleepHours: 7 }
    ];

    it.each(cases.map((c, i) => [i, c]))('경우 %i 에서 서버와 같다', (_, sleepAndMind) => {
        expect(hasHealthConnectSleepCredit(sleepAndMind, DATE)).toBe(isHealthConnectSleepEvidence(sleepAndMind, DATE));
    });

    it('미리 계산이 HC 밤잠을 수면 칸으로 센다', () => {
        const app = readRepoFile('js/app-core.js');
        expect(app).toContain('hasMediaUrl(sleepAndMind.sleepImageUrl) || hasHealthConnectSleepCredit(sleepAndMind, logData?.date)');
        // 새 문서는 oldData 에 date 가 없다 — 날짜를 넘겨야 오늘 밤잠인지 본다
        expect(app).toContain('const datedLog = logData?.date || !dateStr ? logData : { ...logData, date: dateStr };');
    });
});
