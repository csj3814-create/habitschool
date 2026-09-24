import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    HEALTH_CONNECT_ACTIVITY_MIN_NATIVE_VERSION,
    HEALTH_EXERCISE_TYPES,
    buildSleepSyncRecord,
    describeHealthExercise,
    describeHealthSleep,
    parseHealthConnectActivity,
    pickNightSleep,
    supportsHealthConnectActivity
} from '../js/health-connect-activity.js';
import { resolveDailyActivityMinutes } from '../js/le8-score.js';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 한국 시각으로 만든다. kst(24, 6, 40) = 2026-09-24 06:40 KST.
const kst = (day, hour, minute = 0) => Date.UTC(2026, 8, day, hour - 9, minute);
const TODAY = '2026-09-24';

const night = (extra = {}) => ({
    start: kst(23, 23, 10),
    end: kst(24, 6, 40),
    asleep: 420,
    awake: 30,
    deep: 65,
    rem: 90,
    light: 265,
    staged: true,
    origin: 'com.sec.android.app.shealth',
    ...extra
});

const payload = (extra = {}) => JSON.stringify({
    v: 1,
    syncedAt: kst(24, 8, 0),
    sleepOk: true,
    exerciseOk: true,
    sleep: [night()],
    exercise: [],
    ...extra
});

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(kst(24, 9, 0));
});

afterEach(() => {
    vi.useRealTimers();
});

describe('밤잠은 깬 날짜에 붙는다', () => {
    it('어젯밤 23:10 에 자서 오늘 06:40 에 깬 잠은 오늘 기록이다', () => {
        const picked = pickNightSleep([night()], TODAY);
        expect(picked.wakeDate).toBe(TODAY);
        expect(picked.asleepMinutes).toBe(420);
        expect(picked.inBedMinutes).toBe(450);
        expect(picked.sleepHours).toBe(7);
        expect(picked.providerLabel).toBe('Samsung Health');
    });

    it('어제 깬 잠은 오늘 기록이 아니다', () => {
        const yesterday = night({ start: kst(22, 23, 0), end: kst(23, 6, 30) });
        expect(pickNightSleep([yesterday], TODAY)).toBeNull();
    });

    it('중간에 깼다 다시 잔 조각은 한 밤으로 합친다', () => {
        const first = night({ start: kst(23, 23, 0), end: kst(24, 3, 0), asleep: 230, deep: 0, rem: 0, light: 0, awake: 10 });
        const second = night({ start: kst(24, 3, 40), end: kst(24, 7, 0), asleep: 190, deep: 0, rem: 0, light: 0, awake: 10 });
        const picked = pickNightSleep([second, first], TODAY);
        expect(picked.startEpochMillis).toBe(kst(23, 23, 0));
        expect(picked.endEpochMillis).toBe(kst(24, 7, 0));
        expect(picked.asleepMinutes).toBe(420);
    });

    it('떨어진 낮잠은 밤잠에 더하지 않는다', () => {
        const nap = night({ start: kst(24, 13, 0), end: kst(24, 13, 40), asleep: 35 });
        vi.setSystemTime(kst(24, 15, 0));
        const picked = pickNightSleep([night(), nap], TODAY);
        expect(picked.asleepMinutes).toBe(420);
    });

    it('낮잠만 있으면 밤잠이 없다고 본다', () => {
        const nap = night({ start: kst(24, 13, 0), end: kst(24, 13, 40), asleep: 35 });
        vi.setSystemTime(kst(24, 15, 0));
        expect(pickNightSleep([nap], TODAY)).toBeNull();
    });

    it('단계가 없는 기록도 받는다', () => {
        const plain = night({ asleep: 450, awake: 0, deep: 0, rem: 0, light: 0, staged: false });
        const picked = pickNightSleep([plain], TODAY);
        expect(picked.sleepHours).toBe(7.5);
        expect(picked.hasStages).toBe(false);
    });

    it('말이 안 되는 잠은 버린다 — 주소는 누구든 만들 수 있다', () => {
        expect(pickNightSleep([night({ asleep: 9999 })], TODAY)).toBeNull();
        expect(pickNightSleep([night({ start: kst(24, 7, 0) })], TODAY)).toBeNull();
        expect(pickNightSleep([night({ start: kst(22, 0, 0) })], TODAY)).toBeNull(); // 30시간
    });
});

describe('주소의 hcActivity 읽기', () => {
    it('깨졌거나 모양이 다르면 null', () => {
        expect(parseHealthConnectActivity('', { todayStr: TODAY })).toBeNull();
        expect(parseHealthConnectActivity('{not json', { todayStr: TODAY })).toBeNull();
        expect(parseHealthConnectActivity(JSON.stringify({ v: 2 }), { todayStr: TODAY })).toBeNull();
    });

    it('권한이 있었는지 알려 준다', () => {
        const parsed = parseHealthConnectActivity(payload({ sleepOk: false, sleep: [] }), { todayStr: TODAY });
        expect(parsed.sleepPermitted).toBe(false);
        expect(parsed.exercisePermitted).toBe(true);
        expect(parsed.sleep).toBeNull();
    });

    it('운동은 오늘 시작한 것만, 시간 순으로', () => {
        const parsed = parseHealthConnectActivity(payload({
            exercise: [
                { type: 'strength_training', start: kst(24, 7, 30), end: kst(24, 8, 10), kcal: 180, origin: 'com.sec.android.app.shealth' },
                { type: 'running', start: kst(24, 6, 50), end: kst(24, 7, 22), kcal: 245, dist: 4120, origin: 'com.sec.android.app.shealth' },
                { type: 'walking', start: kst(23, 20, 0), end: kst(23, 20, 40) }
            ]
        }), { todayStr: TODAY });
        expect(parsed.exercises.map((e) => e.type)).toEqual(['running', 'strength_training']);
        const [run, lift] = parsed.exercises;
        expect(run.minutes).toBe(32);
        expect(run.distanceKm).toBe(4.1);
        expect(run.stepCounted).toBe(true);
        expect(lift.stepCounted).toBe(false);
        expect(lift.distanceKm).toBeNull();
    });

    it('모르는 종류는 "운동" 으로, 같은 세션은 한 번만', () => {
        const same = { type: 'quidditch', start: kst(24, 7, 0), end: kst(24, 7, 30) };
        const parsed = parseHealthConnectActivity(payload({ exercise: [same, same] }), { todayStr: TODAY });
        expect(parsed.exercises).toHaveLength(1);
        expect(parsed.exercises[0].type).toBe('other');
        expect(parsed.exercises[0].label).toBe('운동');
        // 모르는 종류는 걸음수와 겹치지 않는다고 본다 — 기계식 운동이 대부분이다.
        expect(parsed.exercises[0].stepCounted).toBe(false);
    });

    it('말이 안 되는 운동은 버린다', () => {
        const parsed = parseHealthConnectActivity(payload({
            exercise: [
                { type: 'running', start: kst(24, 1, 0), end: kst(24, 23, 0) }, // 22시간
                { type: 'running', start: kst(24, 7, 0), end: kst(24, 7, 0) },
                { type: 'running', start: kst(24, 7, 0), end: kst(24, 7, 30), kcal: 99999 }
            ]
        }), { todayStr: TODAY });
        expect(parsed.exercises).toHaveLength(1);
        expect(parsed.exercises[0].kcal).toBeNull();
    });
});

describe('보여 주는 문장', () => {
    it('수면: 출처 · 시각 · 잔 시간 · 단계', () => {
        const picked = pickNightSleep([night()], TODAY);
        expect(describeHealthSleep(picked))
            .toBe('Samsung Health · 23:10~06:40 · 7시간 잠 (깊은 잠 1시간 5분 · 렘 1시간 30분 · 깸 30분)');
        // 저장한 원본으로도 같은 문장이 나와야 다시 열었을 때 같은 말을 한다.
        expect(describeHealthSleep(buildSleepSyncRecord(picked))).toBe(describeHealthSleep(picked));
    });

    it('운동: 종류 · 시작 · 시간 · 칼로리 · 거리', () => {
        const [run] = parseHealthConnectActivity(payload({
            exercise: [{ type: 'running', start: kst(24, 6, 50), end: kst(24, 7, 22), kcal: 245, dist: 4120 }]
        }), { todayStr: TODAY }).exercises;
        expect(describeHealthExercise(run)).toBe('🏃 달리기 · 06:50 · 32분 · 245kcal · 4.1km');
    });
});

describe('건강습관 점수 — 운동 세션을 두 번 세지 않는다', () => {
    const session = (minutes, stepCounted) => ({ minutes, stepCounted });

    it('근력 세션은 걸음수에 더한다', () => {
        const log = { steps: { count: 4000 }, exercise: { healthSessions: [session(40, false)] } };
        const result = resolveDailyActivityMinutes(log);
        expect(result.minutes).toBe(40);
        expect(result.usedHealthApp).toBe(true);
    });

    it('달리기 세션은 걸음수와 큰 쪽만', () => {
        // 12000보 = (12000-4000)/100 = 80분. 30분 달리기는 그 안에 들어 있다.
        const log = { steps: { count: 12000 }, exercise: { healthSessions: [session(30, true)] } };
        expect(resolveDailyActivityMinutes(log).minutes).toBe(80);
    });

    it('같은 운동을 사진으로도 올렸으면 큰 쪽만', () => {
        const log = {
            exercise: {
                strengthList: [{ durationMinutes: 45, aiAnalysis: { exerciseType: '웨이트' } }],
                healthSessions: [session(40, false)]
            }
        };
        expect(resolveDailyActivityMinutes(log).minutes).toBe(45);
    });
});

describe('셸과 웹이 같은 말을 한다', () => {
    const CODEC = readRepoFile('android/app/src/main/java/com/habitschool/app/health/HealthConnectActivity.kt');
    const MANAGER = readRepoFile('android/app/src/main/java/com/habitschool/app/health/HealthConnectManager.kt');
    const PERMISSION = readRepoFile('android/app/src/main/java/com/habitschool/app/HealthConnectPermissionActivity.kt');
    const LAUNCHER = readRepoFile('android/app/src/main/java/com/habitschool/app/HabitschoolLauncherActivity.kt');
    const ROUTES = readRepoFile('android/app/src/main/java/com/habitschool/app/AppRoutes.kt');
    const MANIFEST = readRepoFile('android/app/src/main/AndroidManifest.xml');
    const GRADLE = readRepoFile('android/app/build.gradle.kts');
    const WEB = readRepoFile('js/health-connect-activity.js');
    const APP = readAppSource();

    it('JSON 키가 양쪽에 있다', () => {
        for (const key of ['v', 'syncedAt', 'sleepOk', 'exerciseOk', 'sleep', 'exercise',
            'start', 'end', 'asleep', 'awake', 'deep', 'rem', 'light', 'staged', 'origin',
            'type', 'kcal', 'dist']) {
            expect(CODEC, key).toContain(`put("${key}"`);
        }
        for (const key of ['syncedAt', 'sleepOk', 'exerciseOk', 'asleep', 'awake', 'deep', 'rem',
            'light', 'staged', 'origin', 'kcal', 'dist']) {
            expect(WEB, key).toMatch(new RegExp(`\\.${key}\\b`));
        }
    });

    it('셸이 보내는 운동 종류를 웹이 전부 안다', () => {
        const keys = [...CODEC.matchAll(/EXERCISE_TYPE_[A-Z_]+ to "([a-z_]+)"/g)].map((m) => m[1]);
        expect(keys.length).toBeGreaterThan(30);
        for (const key of keys) expect(HEALTH_EXERCISE_TYPES, key).toHaveProperty(key);
    });

    it('수면·운동은 걸음수와 같은 주소에 실려 가고, 웹은 읽은 뒤 지운다', () => {
        expect(ROUTES).toContain('"hcActivity" to activityJson');
        expect(PERMISSION).toContain('activityJson = activityJson');
        expect(LAUNCHER).toContain('activityJson = activityJson');
        expect(APP).toContain("const HEALTH_CONNECT_ACTIVITY_PARAM_KEYS = ['hcActivity'];");
        expect(APP).toContain('handleHealthActivityDeepLink(params, { initialTab });');
    });

    it('선언된 권한만 묻고, 거절한 사람에게 매번 묻지 않는다', () => {
        expect(MANAGER).toContain('fun declaredActivityPermissions()');
        expect(PERMISSION).toContain('healthConnectManager.declaredActivityPermissions()');
        expect(PERMISSION).toContain('KEY_ACTIVITY_PERMISSIONS_ASKED');
        // 앱을 열 때의 자동 읽기는 권한 창을 띄우지 않는다.
        expect(LAUNCHER).not.toContain('requestPermissions');
    });

    it('권한 선언과 웹 문턱이 함께 움직인다', () => {
        const versionCode = Number(GRADLE.match(/versionCode = (\d+)/)[1]);
        const declared = ['READ_SLEEP', 'READ_EXERCISE', 'READ_ACTIVE_CALORIES_BURNED', 'READ_DISTANCE']
            .filter((p) => new RegExp(`<uses-permission\\s+android:name="android\\.permission\\.health\\.${p}"`).test(MANIFEST));
        // 넷은 한 번에 들어간다. 하나만 들어가면 권한 창이 반쯤 빈다.
        expect([0, 4]).toContain(declared.length);
        if (declared.length) {
            expect(versionCode).toBeGreaterThanOrEqual(HEALTH_CONNECT_ACTIVITY_MIN_NATIVE_VERSION);
        } else {
            expect(versionCode).toBeLessThan(HEALTH_CONNECT_ACTIVITY_MIN_NATIVE_VERSION);
        }
        expect(supportsHealthConnectActivity(String(versionCode))).toBe(declared.length > 0);
    });

    it('규칙이 수면 원본을 받는다', () => {
        const rules = readRepoFile('firestore.rules');
        expect(rules).toContain("'sleepSync',");
        expect(APP).toContain('...buildSleepSyncPatch(currentSleepHours, oldData.sleepAndMind),');
        expect(APP).toContain('healthSessions: getPersistableHealthSessions()');
    });

    it('쓸 것이 없으면 sleepSync 키를 싣지 않는다 — 규칙보다 먼저 배포돼도 저장이 막히지 않게', () => {
        const body = APP.split('function buildSleepSyncPatch(')[1].split('\n}\n')[0];
        const buildSleepSyncPatch = new Function('getPersistableSleepSync', `return function buildSleepSyncPatch(${body}\n}`)(
            (hours) => (hours === 7 ? { sleepHours: 7 } : null)
        );
        expect(buildSleepSyncPatch(6.5, { sleepHours: 6.5 })).toEqual({});
        expect(buildSleepSyncPatch(6.5, null)).toEqual({});
        expect(buildSleepSyncPatch(7, null)).toEqual({ sleepSync: { sleepHours: 7 } });
        // 예전에 가져온 밤이 있었는데 회원이 고쳤으면 지운다.
        expect(buildSleepSyncPatch(6.5, { sleepSync: { sleepHours: 7 } })).toEqual({ sleepSync: null });
        // 저장 두 곳 모두 조각을 펼쳐 넣는다. 키를 직접 쓰는 자리가 남으면 안 된다.
        expect(APP).not.toMatch(/sleepSync: getPersistableSleepSync/);
    });

    it('날짜를 옮기면 수면 시간 칸을 비운다', () => {
        const clear = APP.split('function clearInputs(')[1].split('\n}\n')[0];
        expect(clear).toContain("document.getElementById('sleep-hours')");
    });
});
