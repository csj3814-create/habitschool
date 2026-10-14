import { describe, expect, it } from 'vitest';
import {
    buildHealthConnectAutoSavePatch,
    describeHealthConnectAutoSave,
    isUserEnteredSleep,
    isUserEnteredSteps
} from '../js/health-connect-autosave.js';
import { readRepoFile } from './source-helpers.js';

// 2026-10-14 요청: "앱으로 처음 접속할 때 헬스 커넥트에서 정보 최대한 가져와서 한번에
// 적용해 줘. 사용자가 직접 넣은 정보는 빼고." — 앱을 열 때마다 걸음수·수면·운동을
// 저장 버튼 없이 그날 기록에 쓴다.
const TODAY = '2026-10-14';
const stepImport = { stepCount: 8123, stepProviderLabel: 'Samsung Health', nativeSource: 'android-launch-sync', syncedAtEpochMillis: Date.parse('2026-10-14T01:00:00Z') };
const night = {
    wakeDate: TODAY,
    startEpochMillis: Date.parse('2026-10-13T14:00:00Z'),
    endEpochMillis: Date.parse('2026-10-13T21:30:00Z'),
    asleepMinutes: 420,
    inBedMinutes: 450,
    awakeMinutes: 30,
    deepMinutes: 80,
    remMinutes: 90,
    lightMinutes: 250,
    hasStages: true,
    providerLabel: 'Samsung Health',
    sleepHours: 7
};
const walk = { type: 'walking', label: '걷기', startEpochMillis: Date.parse('2026-10-14T00:00:00Z'), endEpochMillis: Date.parse('2026-10-14T00:40:00Z'), minutes: 40, kcal: 150, distanceKm: 3.1, stepCounted: true, providerLabel: 'Samsung Health' };
const activity = { syncedAtEpochMillis: Date.parse('2026-10-14T01:00:00Z'), sleep: night, exercisePermitted: true, exercises: [walk] };

const build = (savedLog = {}, extra = {}) => buildHealthConnectAutoSavePatch({ savedLog, stepImport, activity, todayStr: TODAY, ...extra });

describe('비어 있는 오늘 기록에는 가져온 것을 모두 쓴다', () => {
    it('걸음수·수면·운동', () => {
        const r = build({});
        expect(r.patch.steps).toMatchObject({ count: 8123, source: 'health_connect', providerLabel: 'Samsung Health' });
        expect(r.patch.sleepAndMind.sleepHours).toBe(7);
        expect(r.patch.sleepAndMind.sleepSync).toMatchObject({ source: 'health_connect', wakeDate: TODAY, sleepHours: 7 });
        expect(r.patch.exercise.healthSessions).toHaveLength(1);
        expect(r.applied).toEqual({ steps: 8123, sleepHours: 7, exercises: 1 });
        expect(describeHealthConnectAutoSave(r.applied)).toBe('📲 Health Connect 걸음 8,123보 · 수면 7시간 · 운동 1건을 오늘 기록에 반영했어요.');
    });

    it('수면 점수 칸이 바로 인정되는 모양으로 쓴다 — 시간과 원본이 같다', () => {
        const { sleepAndMind } = build({}).patch;
        expect(sleepAndMind.sleepSync.sleepHours).toBe(sleepAndMind.sleepHours);
    });
});

describe('직접 넣은 값은 건드리지 않는다', () => {
    it('직접 적은 걸음수·캡처로 읽은 걸음수', () => {
        expect(isUserEnteredSteps({ count: 5000, source: 'manual' })).toBe(true);
        expect(isUserEnteredSteps({ count: 5000, source: 'screenshot' })).toBe(true);
        expect(isUserEnteredSteps({ count: 5000, source: 'health_connect' })).toBe(false);
        expect(isUserEnteredSteps({ count: 0, source: 'manual' })).toBe(false);
        expect(build({ steps: { count: 5000, source: 'manual' } }).patch.steps).toBeUndefined();
    });

    it('직접 적었거나 캡처 분석으로 채운 수면 시간', () => {
        expect(isUserEnteredSleep({ sleepHours: 6 })).toBe(true);
        expect(isUserEnteredSleep({ sleepHours: 6, sleepSync: { sleepHours: 7 } })).toBe(true);
        expect(isUserEnteredSleep({ sleepHours: 7, sleepSync: { sleepHours: 7 } })).toBe(false);
        expect(build({ sleepAndMind: { sleepHours: 6 } }).patch.sleepAndMind).toBeUndefined();
    });

    it('회원이 올린 운동 사진·영상 목록은 싣지 않는다 — Health Connect 칸만', () => {
        const r = build({ exercise: { cardioList: [{ imageUrl: 'x' }] } });
        expect(Object.keys(r.patch.exercise)).toEqual(['healthSessions']);
    });
});

describe('바뀐 것만 쓴다', () => {
    it('이미 같은 값이면 아무것도 쓰지 않는다', () => {
        const first = build({}).patch;
        const saved = {
            date: TODAY,
            steps: first.steps,
            sleepAndMind: first.sleepAndMind,
            exercise: first.exercise
        };
        expect(build(saved)).toBeNull();
    });

    it('걸음수가 늘었으면 새 값으로', () => {
        const saved = { steps: { count: 4000, source: 'health_connect' } };
        expect(build(saved).patch.steps.count).toBe(8123);
    });

    it('다른 날 기록이나 날짜를 모르면 쓰지 않는다', () => {
        expect(build({ date: '2026-10-13' })).toBeNull();
        expect(build({}, { todayStr: '' })).toBeNull();
    });

    it('운동 권한이 없으면 운동 칸을 비우지 않는다', () => {
        const r = build({ exercise: { healthSessions: [walk] } }, { activity: { ...activity, exercisePermitted: false, exercises: [] } });
        expect(r.patch.exercise).toBeUndefined();
    });
});

describe('앱을 열 때 실제로 저장한다', () => {
    const app = readRepoFile('js/app-core.js');
    const fn = app.slice(app.indexOf('async function autoSaveHealthConnectLaunchImport('), app.indexOf('window.handleAppEntryDeepLink = async function'));

    it('걸음수 주소로 들어오면 자동 저장을 부른다', () => {
        const branch = app.slice(app.indexOf("if (params.focus === 'health-connect-steps') {"));
        expect(branch.slice(0, 700)).toContain('autoSaveHealthConnectLaunchImport({ ...params })');
    });

    it('화면이 아니라 서버 기록을 보고, 못 보면 쓰지 않는다', () => {
        const read = app.slice(app.indexOf('async function readTodayLogForHealthAutoSave('));
        expect(read.slice(0, 600)).toContain('getDocFromServer(doc(db, \'daily_logs\', docId))');
        expect(fn).toContain('if (!savedLog) return null;');
    });

    it('문서 생성 규칙에 맞게 userId·date 를 함께 보낸다', () => {
        expect(fn).toContain('const patchBody = { userId: user.uid, date: todayStr, ...result.patch };');
        expect(fn).toContain('{ merge: true }');
    });

    it('실패를 조용히 삼키지 않는다 (CLAUDE.md 2026-08-15)', () => {
        expect(fn).toContain("console.warn('[health-autosave] 저장 실패");
    });

    it('저장 뒤 서버 정산을 기다려 점수를 맞춘다', () => {
        expect(fn).toContain('reconcileSettlementAfterBackgroundSave(user.uid, docId, todayStr)');
    });

    it('"저장 버튼을 누르면" 이라고 더는 말하지 않는다', () => {
        expect(app).not.toContain('저장 버튼을 누르면 기록에 반영됩니다');
    });

    it('서비스워커가 새 모듈을 미리 받는다', () => {
        expect(readRepoFile('sw.js')).toMatch(/'\.\/js\/health-connect-autosave\.js\?v=\d+'/);
    });
});
