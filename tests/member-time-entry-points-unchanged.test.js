import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as clientTime from '../js/member-time.js';
import {
    formatKstClock,
    hasHealthConnectSleepCredit,
    toKstDateString,
} from '../js/health-connect-activity.js';
import { getDietProgramKstClock } from '../js/diet-program.js';

// 회원별 시간대(2026-10-16)의 두 번째 약속 — 계산 함수만이 아니라 그 계산을 쓰는
// **입구**도 시간대 없는 회원에게는 바꾸기 전과 같은 답을 낸다.
//
// 포인트를 주는가, 사진·수면 증거를 인정하는가, 오늘 누구에게 알림이 가는가, 친구
// 챌린지가 언제 시작·정산되는가. 아래 `before` 는 바꾸기 전 코드를 그대로 옮겼다.
// (tasks/2026-10-16_회원별_시간대_설계.md 3-6)

const require = createRequire(import.meta.url);
const points = require('../functions/points-utils.js');
const notifications = require('../functions/notification-utils.js');
const dietWindow = require('../functions/diet-window-utils.js');
const challenges = require('../functions/challenge-utils.js');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---- 바꾸기 전 코드 (2026-10-16 origin/main 43ebcfe4) ----
const before = {
    kstDate(ms) {
        return new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10);
    },
    addDays(dateStr, diffDays) {
        const base = new Date(`${dateStr}T12:00:00Z`);
        base.setUTCDate(base.getUTCDate() + diffDays);
        return base.toISOString().slice(0, 10);
    },
    kstHour(ms) {
        return new Date(ms + KST_OFFSET_MS).getUTCHours();
    },
    // functions/runtime.js awardPoints
    isRewardEligibleDate(logDate, nowMs) {
        const todayStr = before.kstDate(nowMs);
        const yesterdayStr = before.addDays(todayStr, -1);
        return !!logDate && logDate >= yesterdayStr && logDate <= todayStr;
    },
    // functions/points-utils.js isEvidenceCreatedWithinRewardWindow
    isEvidenceCreatedWithinRewardWindow(timeCreated, logDate, maximumDelayDays = 1) {
        const normalizedLogDate = typeof logDate === 'string' ? logDate.trim() : '';
        const date = new Date(timeCreated);
        const createdDate = Number.isNaN(date.getTime()) ? null : before.kstDate(date.getTime());
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedLogDate)
            || !/^\d{4}-\d{2}-\d{2}$/.test(String(createdDate || ''))
            || !Number.isInteger(maximumDelayDays)
            || maximumDelayDays < 0
            || maximumDelayDays > 7) {
            return false;
        }
        const sourceTime = Date.parse(`${normalizedLogDate}T00:00:00.000Z`);
        const createdTime = Date.parse(`${createdDate}T00:00:00.000Z`);
        const delayDays = Math.round((createdTime - sourceTime) / 86400000);
        return delayDays >= 0 && delayDays <= maximumDelayDays;
    },
    // functions/points-utils.js isHealthConnectSleepEvidence (js/health-connect-activity.js 와 같은 기준)
    isHealthConnectSleepEvidence(sleepAndMind = {}, logDate = '') {
        const sync = sleepAndMind && typeof sleepAndMind.sleepSync === 'object' ? sleepAndMind.sleepSync : null;
        if (!sync || sync.source !== 'health_connect') return false;
        const date = typeof logDate === 'string' ? logDate.trim() : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || sync.wakeDate !== date) return false;
        const end = Number(sync.endEpochMillis);
        const start = Number(sync.startEpochMillis);
        if (!Number.isFinite(end) || !Number.isFinite(start) || end <= start) return false;
        if (before.kstDate(end) !== date) return false;
        const inBed = Number(sync.inBedMinutes);
        const asleep = Number(sync.asleepMinutes);
        if (!(inBed >= 120) || !(asleep > 0) || asleep > inBed) return false;
        const hours = Number(sync.sleepHours);
        if (!(hours > 0) || hours > 24) return false;
        return Number(sleepAndMind.sleepHours) === hours;
    },
    // functions/runtime.js sendDailyReminder (getPersonalizedReminderUsers + 오늘 기록한 사람 빼기)
    habitReminderUids(users, loggedDatesByUid, nowMs) {
        const todayKST = before.kstDate(nowMs);
        const currentHourKst = before.kstHour(nowMs);
        return users
            .map(({ uid, data }) => ({ uid, preference: notifications.normalizeReminderPreference(data || {}) }))
            .filter(({ preference }) => preference.enabled && preference.hourKst === currentHourKst)
            .filter(({ uid }) => !(loggedDatesByUid.get(uid)?.has(todayKST)))
            .map(({ uid }) => uid);
    },
    // functions/runtime.js sendStreakAlert — "0 13 * * *" UTC 에 한 번 돌았다.
    streakAlertUids(loggedDatesByUid, nowMs) {
        if (new Date(nowMs).getUTCHours() !== 13) return [];
        const todayKST = before.kstDate(nowMs);
        const yesterdayKST = before.addDays(todayKST, -1);
        return [...loggedDatesByUid.keys()]
            .filter((uid) => loggedDatesByUid.get(uid).has(yesterdayKST))
            .filter((uid) => !loggedDatesByUid.get(uid).has(todayKST));
    },
    // functions/runtime.js sendDietProgramWindowReminders
    dietReminderKind(preference, nowMs) {
        const nowKst = new Date(nowMs + KST_OFFSET_MS);
        const nowMinutes = (nowKst.getUTCHours() * 60) + nowKst.getUTCMinutes();
        return dietWindow.resolveDietReminderKindAt(preference, dietWindow.toReminderBucketMinutes(nowMinutes));
    },
    // functions/runtime.js respondSocialChallenge / settleDueSocialChallenges
    socialStartDate(nowMs) {
        return new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    },
    socialDue(endDate, nowMs) {
        return endDate < new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
    },
    // js/diet-program.js getKstClock
    dietClock(nowMs) {
        const kstDate = new Date(nowMs + KST_OFFSET_MS);
        return {
            dateStr: kstDate.toISOString().slice(0, 10),
            hour: kstDate.getUTCHours(),
            minute: kstDate.getUTCMinutes(),
            totalMinutes: (kstDate.getUTCHours() * 60) + kstDate.getUTCMinutes(),
        };
    },
};
// ---- 여기까지 ----

/** 결정적인 난수 — 실패가 매번 같은 자리에서 재현되게. */
function makeRandom(seed = 20261016) {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

/** 한국 자정 앞뒤 1초를 포함해, 2026-10-14 ~ 2026-10-20 매 15분 + 연말·윤년 경계. */
function sampleInstants() {
    const instants = [];
    for (let at = Date.UTC(2026, 9, 13, 15); at < Date.UTC(2026, 9, 20, 15); at += 15 * 60 * 1000) {
        instants.push(at, at + 59 * 1000);
    }
    [Date.UTC(2026, 11, 31, 15), Date.UTC(2028, 1, 28, 15), Date.UTC(2028, 1, 29, 15)].forEach((midnight) => {
        for (let offset = -2 * HOUR_MS; offset <= 2 * HOUR_MS; offset += 30 * 60 * 1000) {
            instants.push(midnight + offset - 1000, midnight + offset);
        }
    });
    return instants;
}

const INSTANTS = sampleInstants();
const HOURLY_RUNS = INSTANTS.filter((ms) => new Date(ms).getUTCMinutes() === 0 && new Date(ms).getUTCSeconds() < 60);

function datesAround(ms) {
    const today = before.kstDate(ms);
    return [-3, -2, -1, 0, 1, 2].map((offset) => before.addDays(today, offset));
}

/** 시간대 필드가 없는 회원 60명과, 그들의 최근 기록 날짜. */
function buildMembers(random, nowMs) {
    const dates = datesAround(nowMs);
    const users = [];
    const loggedDatesByUid = new Map();
    for (let index = 0; index < 60; index += 1) {
        const uid = `member-${index}`;
        const reminder = random() < 0.7
            ? {
                enabled: random() < 0.8,
                category: ['diet', 'exercise', 'sleep', 'unknown'][Math.floor(random() * 4)],
                hourKst: random() < 0.9 ? Math.floor(random() * 24) : 'bad',
            }
            : undefined;
        users.push({ uid, data: reminder ? { settings: { reminderPreference: reminder } } : {} });
        const logged = new Set(dates.filter(() => random() < 0.45));
        if (logged.size > 0) loggedDatesByUid.set(uid, logged);
    }
    return { users, loggedDatesByUid };
}

const sorted = (values) => [...values].sort();

describe('포인트 — 시간대 없는 회원은 바꾸기 전과 같다', () => {
    it('지급 기간: 기록 날짜가 한국 어제~오늘일 때만', () => {
        const mismatches = [];
        INSTANTS.forEach((nowMs) => {
            [...datesAround(nowMs), '', '2026-1-1', undefined].forEach((logDate) => {
                const expected = before.isRewardEligibleDate(logDate, nowMs);
                const actual = points.isRewardEligibleLogDate(logDate, { now: nowMs });
                const actualForEmptyMember = points.isRewardEligibleLogDate(logDate, {
                    now: nowMs,
                    timeZone: undefined,
                });
                if (actual !== expected || actualForEmptyMember !== expected) mismatches.push({ nowMs, logDate, expected, actual });
            });
        });
        expect(mismatches).toEqual([]);
    });

    it('사진·영상 업로드 시각 검사', () => {
        const mismatches = [];
        INSTANTS.forEach((createdMs) => {
            const createdValues = [new Date(createdMs).toISOString(), createdMs, new Date(createdMs)];
            datesAround(createdMs).forEach((logDate) => {
                [0, 1, 2].forEach((maxDays) => {
                    createdValues.forEach((created) => {
                        const expected = before.isEvidenceCreatedWithinRewardWindow(created, logDate, maxDays);
                        const actual = points.isEvidenceCreatedWithinRewardWindow(created, logDate, maxDays);
                        if (actual !== expected) mismatches.push({ created, logDate, maxDays, expected, actual });
                    });
                });
            });
        });
        expect(mismatches).toEqual([]);
        expect(points.isEvidenceCreatedWithinRewardWindow('nope', '2026-10-16', 1)).toBe(false);
    });

    it('헬스커넥트 밤잠 인정 — 서버와 화면 모두', () => {
        const mismatches = [];
        INSTANTS.forEach((endMs) => {
            datesAround(endMs).slice(1, 4).forEach((logDate) => {
                const sleepAndMind = {
                    sleepHours: 7.5,
                    sleepSync: {
                        source: 'health_connect',
                        wakeDate: logDate,
                        startEpochMillis: endMs - 8 * HOUR_MS,
                        endEpochMillis: endMs,
                        inBedMinutes: 480,
                        asleepMinutes: 450,
                        sleepHours: 7.5,
                    },
                };
                const expected = before.isHealthConnectSleepEvidence(sleepAndMind, logDate);
                const server = points.isHealthConnectSleepEvidence(sleepAndMind, logDate);
                const screen = hasHealthConnectSleepCredit(sleepAndMind, logDate);
                if (server !== expected || screen !== expected) mismatches.push({ endMs, logDate, expected, server, screen });
            });
        });
        expect(mismatches).toEqual([]);
    });
});

describe('알림 — 시간대 없는 회원은 같은 시각에 같은 사람이 받는다', () => {
    it('습관 알림: 고른 시각(한국)이고 오늘(한국) 기록하지 않은 사람', () => {
        const random = makeRandom();
        const mismatches = [];
        HOURLY_RUNS.forEach((nowMs) => {
            const { users, loggedDatesByUid } = buildMembers(random, nowMs);
            const expected = before.habitReminderUids(users, loggedDatesByUid, nowMs);
            const recipients = notifications.selectHabitReminderRecipients(users, { now: nowMs, loggedDatesByUid });
            const actual = recipients.map(({ uid }) => uid);
            if (sorted(actual).join() !== sorted(expected).join()) mismatches.push({ nowMs, expected, actual });
            // 중복 방지 장부의 날짜도 그대로 한국 날짜
            if (recipients.some(({ today }) => today !== before.kstDate(nowMs))) mismatches.push({ nowMs, ledger: true });
        });
        expect(mismatches).toEqual([]);
    });

    it('연속 알림: 13:00 UTC(한국 밤 10시)에만, 어제 기록했고 오늘 안 한 사람', () => {
        const random = makeRandom(7);
        const mismatches = [];
        let firedRuns = 0;
        HOURLY_RUNS.forEach((nowMs) => {
            const { loggedDatesByUid } = buildMembers(random, nowMs);
            const expected = before.streakAlertUids(loggedDatesByUid, nowMs);
            const recipients = notifications.selectStreakAlertRecipients({
                now: nowMs,
                loggedDatesByUid,
                membersByUid: new Map(),
            });
            const actual = recipients.map(({ uid }) => uid);
            if (expected.length > 0) firedRuns += 1;
            if (sorted(actual).join() !== sorted(expected).join()) mismatches.push({ nowMs, expected, actual });
            if (recipients.some(({ today }) => today !== before.kstDate(nowMs))) mismatches.push({ nowMs, ledger: true });
        });
        expect(mismatches).toEqual([]);
        expect(firedRuns).toBeGreaterThan(0); // 테스트가 빈 집합끼리만 비교하지 않았다
    });

    it('식단 창 알림: 한국 시각으로 창 열림·마감', () => {
        const preferences = [
            {},
            { methodId: 'intermittent_fasting' },
            { methodId: 'intermittent_fasting', fastingPreset: '16_8_1200_2000' },
            { methodId: 'intermittent_fasting', fastingPreset: 'win_0800_1600' },
            { methodId: 'intermittent_fasting', fastingPreset: 'win_1330_2130' },
            { methodId: 'low_carb' },
            { methodId: 'mediterranean', fastingPreset: 'win_0700_1900' },
            { methodId: 'mediterranean', fastingPreset: 'broken' },
        ];
        const mismatches = [];
        INSTANTS.forEach((nowMs) => {
            preferences.forEach((preference) => {
                const expected = before.dietReminderKind(preference, nowMs);
                const actual = dietWindow.resolveDietReminderKindForMember(preference, {}, nowMs);
                if (actual !== expected) mismatches.push({ nowMs, preference, expected, actual });
            });
        });
        expect(mismatches).toEqual([]);
    });
});

describe('친구 챌린지 — 참가자가 모두 시간대 없는 회원이면 그대로', () => {
    it('시작일은 한국 오늘', () => {
        const mismatches = INSTANTS.filter((nowMs) => (
            challenges.resolveSharedChallengeStartDate([{}, { timeZone: '' }, undefined], nowMs) !== before.socialStartDate(nowMs)
        ));
        expect(mismatches).toEqual([]);
    });

    it('정산은 종료일이 한국 오늘보다 앞설 때', () => {
        const mismatches = [];
        INSTANTS.forEach((nowMs) => {
            datesAround(nowMs).forEach((endDate) => {
                const expected = before.socialDue(endDate, nowMs);
                const actual = challenges.isSharedChallengeOverForAll(endDate, [{}, {}], nowMs);
                if (actual !== expected) mismatches.push({ nowMs, endDate, expected, actual });
            });
        });
        expect(mismatches).toEqual([]);
    });
});

describe('화면 — 시간대를 정하지 않은 상태는 한국 시간', () => {
    it('기본 상태의 회원 시간대는 Asia/Seoul', () => {
        expect(clientTime.getActiveMemberTimeZone()).toBe('Asia/Seoul');
    });

    it('헬스커넥트 날짜·시계, 식단 방법 시계', () => {
        const mismatches = INSTANTS.filter((ms) => (
            toKstDateString(ms) !== before.kstDate(ms)
            || formatKstClock(ms) !== new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16)
            || JSON.stringify(getDietProgramKstClock(ms)) !== JSON.stringify(before.dietClock(ms))
        ));
        expect(mismatches).toEqual([]);
    });

    it('앱의 오늘은 한국 오늘', () => {
        const mismatches = INSTANTS.filter((ms) => clientTime.getActiveMemberToday(ms) !== before.kstDate(ms));
        expect(mismatches).toEqual([]);
    });

    it('기기가 한국이면 날짜 기준 배지를 띄우지 않는다', () => {
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'Asia/Seoul', memberTimeZone: 'Asia/Seoul' })).toBe(false);
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'Asia/Seoul', memberTimeZone: undefined })).toBe(false);
        // 바꾸기 전에도 시계로 비교했다(isDeviceOutsideKoreaTime) — 일본은 시계가 같아 띄우지 않았다
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'Asia/Tokyo', memberTimeZone: undefined })).toBe(false);
        // 지금처럼 해외 기기에서는 띄운다
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'America/Toronto', memberTimeZone: undefined })).toBe(true);
    });
});

describe('바꾸기 전 기준값이 정말 바꾸기 전 코드인가', () => {
    // 기준값을 옮겨 적다 틀리면 위 테스트는 의미가 없다. 몇 개는 손으로 확인한 값으로 묶는다.
    it('한국 자정 경계', () => {
        const kstMidnight = Date.UTC(2026, 9, 15, 15, 0, 0); // 2026-10-16 00:00 KST
        expect(before.kstDate(kstMidnight - 1)).toBe('2026-10-15');
        expect(before.kstDate(kstMidnight)).toBe('2026-10-16');
        expect(before.kstHour(kstMidnight)).toBe(0);
        expect(before.isRewardEligibleDate('2026-10-15', kstMidnight)).toBe(true);
        expect(before.isRewardEligibleDate('2026-10-14', kstMidnight)).toBe(false);
        expect(before.isRewardEligibleDate('2026-10-17', kstMidnight)).toBe(false);
    });

    it('연속 알림 기준은 13시 UTC 에만 사람을 고른다', () => {
        const logged = new Map([['a', new Set(['2026-10-15'])]]);
        expect(before.streakAlertUids(logged, Date.UTC(2026, 9, 16, 13))).toEqual(['a']);
        expect(before.streakAlertUids(logged, Date.UTC(2026, 9, 16, 12))).toEqual([]);
    });
});
