import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import * as clientTime from '../js/member-time.js';
import { formatKstClock, toKstDateString } from '../js/health-connect-activity.js';
import { getDietProgramKstClock } from '../js/diet-program.js';
import { readRepoFile } from './source-helpers.js';

// 회원별 시간대(2026-10-16)에서 해외 회원이 실제로 얻는 것.
// (tasks/2026-10-16_회원별_시간대_설계.md)

const require = createRequire(import.meta.url);
const memberTime = require('../functions/member-time.js');
const points = require('../functions/points-utils.js');
const notifications = require('../functions/notification-utils.js');
const dietWindow = require('../functions/diet-window-utils.js');
const challenges = require('../functions/challenge-utils.js');

const DAY_MS = 24 * 60 * 60 * 1000;
const LA = { timeZone: 'America/Los_Angeles' };
const AUCKLAND = { timeZone: 'Pacific/Auckland' };
const KOLKATA = { timeZone: 'Asia/Kolkata' };

// 2026-10-16 15:30 UTC = 한국 10-17 00:30 / 미국 서부 10-16 08:30
const KST_JUST_AFTER_MIDNIGHT = Date.UTC(2026, 9, 16, 15, 30);
// 2026-10-16 11:30 UTC = 한국 10-16 20:30 / 뉴질랜드 10-17 00:30 (서머타임 +13)
const AUCKLAND_JUST_AFTER_MIDNIGHT = Date.UTC(2026, 9, 16, 11, 30);

describe('회원의 오늘·시각', () => {
    it('미국 서부 회원의 아침은 아직 같은 날이다', () => {
        expect(memberTime.getMemberToday({}, KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-17');
        expect(memberTime.getMemberToday(LA, KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-16');
        expect(memberTime.getMemberHour(LA, KST_JUST_AFTER_MIDNIGHT)).toBe(8);
    });

    it('뉴질랜드 회원은 한국보다 먼저 다음 날이 된다', () => {
        expect(memberTime.getMemberToday({}, AUCKLAND_JUST_AFTER_MIDNIGHT)).toBe('2026-10-16');
        expect(memberTime.getMemberToday(AUCKLAND, AUCKLAND_JUST_AFTER_MIDNIGHT)).toBe('2026-10-17');
    });

    it('30분 시차(인도)도 분까지 맞다', () => {
        const at = Date.UTC(2026, 9, 16, 18, 45); // 인도 10-17 00:15
        expect(memberTime.getMemberToday(KOLKATA, at)).toBe('2026-10-17');
        expect(memberTime.getMemberHour(KOLKATA, at)).toBe(0);
        expect(memberTime.getMemberMinutesOfDay(KOLKATA, at)).toBe(15);
    });

    it('서머타임이 끝나는 날(미국 2026-11-01)도 시각이 맞다', () => {
        expect(memberTime.getMemberHour(LA, Date.UTC(2026, 10, 1, 8, 30))).toBe(1); // 01:30 PDT
        expect(memberTime.getMemberHour(LA, Date.UTC(2026, 10, 1, 9, 30))).toBe(1); // 01:30 PST
        expect(memberTime.getMemberHour(LA, Date.UTC(2026, 10, 1, 10, 30))).toBe(2);
    });

    it('시간대 이름은 표준 표기로 맞추고, 오프셋·이상한 값은 받지 않는다', () => {
        expect(memberTime.normalizeTimeZone('asia/seoul')).toBe('Asia/Seoul');
        expect(memberTime.normalizeTimeZone('America/Los_Angeles')).toBe('America/Los_Angeles');
        expect(memberTime.isSupportedTimeZone('America/Los_Angeles')).toBe(true);
        expect(memberTime.isSupportedTimeZone('UTC')).toBe(true);
        ['+05:30', '-0800', 'Mars/Olympus', '', '   ', null, 42, 'Asia/Seoul; drop'].forEach((value) => {
            expect(memberTime.isSupportedTimeZone(value)).toBe(false);
        });
    });
});

describe('포인트 — 해외 회원의 오늘 기록이 인정된다', () => {
    it('뉴질랜드 회원의 현지 오늘(한국으로는 내일)', () => {
        expect(points.isRewardEligibleLogDate('2026-10-17', { now: AUCKLAND_JUST_AFTER_MIDNIGHT })).toBe(false);
        expect(points.isRewardEligibleLogDate('2026-10-17', { now: AUCKLAND_JUST_AFTER_MIDNIGHT, timeZone: AUCKLAND.timeZone })).toBe(true);
        expect(points.isRewardEligibleLogDate('2026-10-18', { now: AUCKLAND_JUST_AFTER_MIDNIGHT, timeZone: AUCKLAND.timeZone })).toBe(false);
    });

    it('미국 서부 회원의 현지 어제(한국으로는 그저께)', () => {
        expect(points.isRewardEligibleLogDate('2026-10-15', { now: KST_JUST_AFTER_MIDNIGHT })).toBe(false);
        expect(points.isRewardEligibleLogDate('2026-10-15', { now: KST_JUST_AFTER_MIDNIGHT, timeZone: LA.timeZone })).toBe(true);
        expect(points.isRewardEligibleLogDate('2026-10-14', { now: KST_JUST_AFTER_MIDNIGHT, timeZone: LA.timeZone })).toBe(false);
    });

    it('뉴질랜드 회원이 현지 오늘 올린 사진은 오늘 기록의 증거다', () => {
        const created = new Date(AUCKLAND_JUST_AFTER_MIDNIGHT).toISOString();
        expect(points.isEvidenceCreatedWithinRewardWindow(created, '2026-10-17', 1)).toBe(false);
        expect(points.isEvidenceCreatedWithinRewardWindow(created, '2026-10-17', 1, AUCKLAND.timeZone)).toBe(true);
    });

    it('헬스커넥트 밤잠은 회원 날짜로 깬 날을 본다', () => {
        const end = Date.UTC(2026, 9, 16, 14, 0); // 미국 서부 10-16 07:00 / 한국 10-16 23:00
        const sleepAndMind = {
            sleepHours: 7,
            sleepSync: {
                source: 'health_connect', wakeDate: '2026-10-16',
                startEpochMillis: end - 7.5 * 60 * 60 * 1000, endEpochMillis: end,
                inBedMinutes: 450, asleepMinutes: 420, sleepHours: 7,
            },
        };
        expect(points.isHealthConnectSleepEvidence(sleepAndMind, '2026-10-16', LA.timeZone)).toBe(true);
        const later = Date.UTC(2026, 9, 16, 16, 0); // 미국 10-16 09:00 / 한국 10-17 01:00
        const lateSleep = { ...sleepAndMind, sleepSync: { ...sleepAndMind.sleepSync, endEpochMillis: later, startEpochMillis: later - 7.5 * 60 * 60 * 1000 } };
        expect(points.isHealthConnectSleepEvidence(lateSleep, '2026-10-16')).toBe(false);
        expect(points.isHealthConnectSleepEvidence(lateSleep, '2026-10-16', LA.timeZone)).toBe(true);
    });
});

describe('알림 — 회원 시각으로 보낸다', () => {
    const reminderUser = (extra = {}) => ({
        uid: 'la',
        data: { ...LA, settings: { reminderPreference: { enabled: true, category: 'diet', hourKst: 20 } }, ...extra },
    });

    it('습관 알림: 미국 서부 회원은 현지 저녁 8시에', () => {
        const laEvening = Date.UTC(2026, 9, 16, 3, 0); // 10-15 20:00 PDT
        const kstEvening = Date.UTC(2026, 9, 16, 11, 0); // 한국 20:00 = 04:00 PDT
        const atLaEvening = notifications.selectHabitReminderRecipients([reminderUser()], { now: laEvening, loggedDatesByUid: new Map() });
        expect(atLaEvening).toEqual([expect.objectContaining({ uid: 'la', today: '2026-10-15' })]);
        expect(notifications.selectHabitReminderRecipients([reminderUser()], { now: kstEvening, loggedDatesByUid: new Map() })).toEqual([]);
    });

    it('습관 알림: 현지 오늘 이미 기록했으면 보내지 않는다', () => {
        const laEvening = Date.UTC(2026, 9, 16, 3, 0);
        const loggedDatesByUid = new Map([['la', new Set(['2026-10-15'])]]);
        expect(notifications.selectHabitReminderRecipients([reminderUser()], { now: laEvening, loggedDatesByUid })).toEqual([]);
    });

    it('시간대를 바꾼 뒤 24시간은 같은 날 알림이 두 번 가지 않게 쉰다', () => {
        const laEvening = Date.UTC(2026, 9, 16, 3, 0);
        const changedAt = laEvening - 5 * 60 * 60 * 1000;
        expect(notifications.selectHabitReminderRecipients(
            [reminderUser({ timeZoneChangedAt: changedAt })],
            { now: laEvening, loggedDatesByUid: new Map() },
        )).toEqual([]);
        expect(notifications.selectHabitReminderRecipients(
            [reminderUser({ timeZoneChangedAt: laEvening - 2 * DAY_MS })],
            { now: laEvening, loggedDatesByUid: new Map() },
        )).toHaveLength(1);
    });

    it('연속 알림: 미국 서부 회원은 현지 밤 10시(05:00 UTC)에, 현지 어제·오늘로', () => {
        const laNight = Date.UTC(2026, 9, 16, 5, 0); // 10-15 22:00 PDT
        const loggedDatesByUid = new Map([['la', new Set(['2026-10-14'])], ['kr', new Set(['2026-10-15'])]]);
        const membersByUid = new Map([['la', LA]]);
        expect(notifications.selectStreakAlertRecipients({ now: laNight, loggedDatesByUid, membersByUid }))
            .toEqual([{ uid: 'la', today: '2026-10-15' }]);
        const kstNight = Date.UTC(2026, 9, 16, 13, 0);
        expect(notifications.selectStreakAlertRecipients({ now: kstNight, loggedDatesByUid, membersByUid }).map(({ uid }) => uid))
            .not.toContain('la');
    });

    it('기록을 읽을 날짜는 한국 날짜 기준 그저께~내일 네 개면 지구 전체를 덮는다', () => {
        const now = Date.UTC(2026, 9, 16, 11, 59);
        const dates = notifications.getPossibleMemberDates(now);
        expect(dates).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17']);
        ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Etc/GMT+12', 'Asia/Seoul'].forEach((timeZone) => {
            expect(dates).toContain(memberTime.getMemberToday({ timeZone }, now));
            expect(dates).toContain(memberTime.getMemberYesterday({ timeZone }, now));
        });
    });

    it('식단 창 알림: 인도 회원은 현지 12:00 에 창이 열린다', () => {
        const preference = { methodId: 'intermittent_fasting' }; // 12:00~20:00
        expect(dietWindow.resolveDietReminderKindForMember(preference, KOLKATA, Date.UTC(2026, 9, 16, 6, 30))).toBe('start');
        expect(dietWindow.resolveDietReminderKindForMember(preference, KOLKATA, Date.UTC(2026, 9, 16, 3, 0))).toBe('');
    });
});

describe('친구 챌린지 — 참가자 모두의 하루로', () => {
    it('시작일은 참가자 중 가장 늦은 오늘 — 누구도 이미 시작된 하루를 공짜로 받지 않는다', () => {
        expect(challenges.resolveSharedChallengeStartDate([{}, LA], KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-17');
        expect(challenges.resolveSharedChallengeStartDate([LA], KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-16');
    });

    it('정산은 모든 참가자의 종료일이 지났을 때', () => {
        // 한국 10-17 00:30, 미국 서부 10-16 08:30 — 미국 회원의 10-16 은 아직 남았다
        expect(challenges.isSharedChallengeOverForAll('2026-10-16', [{}], KST_JUST_AFTER_MIDNIGHT)).toBe(true);
        expect(challenges.isSharedChallengeOverForAll('2026-10-16', [{}, LA], KST_JUST_AFTER_MIDNIGHT)).toBe(false);
        expect(challenges.isSharedChallengeOverForAll('2026-10-16', [{}, LA], KST_JUST_AFTER_MIDNIGHT + DAY_MS)).toBe(true);
    });
});

describe('시간대 바꾸기 — 30일에 한 번', () => {
    const now = Date.UTC(2026, 9, 16, 3, 0);

    it('처음 바꾸는 회원은 바꿀 수 있다', () => {
        expect(memberTime.validateTimeZoneChange({}, 'America/Los_Angeles', now))
            .toEqual({ ok: true, timeZone: 'America/Los_Angeles', previousTimeZone: 'Asia/Seoul' });
    });

    it('30일 안에는 다시 바꿀 수 없고, 언제부터 되는지 알려 준다', () => {
        const changedAt = now - 10 * DAY_MS;
        const result = memberTime.validateTimeZoneChange({ ...LA, timeZoneChangedAt: changedAt }, 'Asia/Seoul', now);
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('cooldown');
        expect(result.nextAllowedAt).toBe(changedAt + 30 * DAY_MS);
    });

    it('30일이 지나면 다시 바꿀 수 있다 (Firestore Timestamp·ISO 문자열 모두)', () => {
        const changedAt = now - 30 * DAY_MS;
        expect(memberTime.validateTimeZoneChange({ ...LA, timeZoneChangedAt: { toMillis: () => changedAt } }, 'Asia/Seoul', now).ok).toBe(true);
        expect(memberTime.validateTimeZoneChange({ ...LA, timeZoneChangedAt: new Date(changedAt).toISOString() }, 'Asia/Seoul', now).ok).toBe(true);
    });

    it('같은 시간대·이상한 이름은 거절한다 (제한 기간을 쓰지 않는다)', () => {
        expect(memberTime.validateTimeZoneChange({}, 'Asia/Seoul', now)).toMatchObject({ ok: false, reason: 'same' });
        expect(memberTime.validateTimeZoneChange({}, '+09:00', now)).toMatchObject({ ok: false, reason: 'invalid' });
    });
});

describe('화면 — 회원 시간대를 정하면 앱의 날짜가 따라간다', () => {
    afterEach(() => clientTime.setActiveMemberTimeZone(undefined));

    it('헬스커넥트 날짜·시계와 식단 시계가 회원 시간대를 쓴다', () => {
        clientTime.setActiveMemberTimeZone('America/Los_Angeles');
        expect(clientTime.getActiveMemberTimeZone()).toBe('America/Los_Angeles');
        expect(clientTime.getActiveMemberToday(KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-16');
        expect(toKstDateString(KST_JUST_AFTER_MIDNIGHT)).toBe('2026-10-16');
        expect(formatKstClock(KST_JUST_AFTER_MIDNIGHT)).toBe('08:30');
        expect(getDietProgramKstClock(KST_JUST_AFTER_MIDNIGHT)).toEqual({ dateStr: '2026-10-16', hour: 8, minute: 30, totalMinutes: 510 });
    });

    it('이상한 값을 받으면 한국으로 돌아간다', () => {
        clientTime.setActiveMemberTimeZone('Mars/Olympus');
        expect(clientTime.getActiveMemberTimeZone()).toBe('Asia/Seoul');
    });

    it('배지는 기기 시간대가 회원 시간대와 다를 때만', () => {
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'America/Los_Angeles', memberTimeZone: 'America/Los_Angeles' })).toBe(false);
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: 'America/Los_Angeles', memberTimeZone: 'Asia/Seoul' })).toBe(true);
        // 기기 시간대를 모르면 아무것도 띄우지 않는다 (지금과 같다)
        expect(clientTime.shouldShowTimeZoneBadge({ deviceTimeZone: '', memberTimeZone: 'Asia/Seoul' })).toBe(false);
    });
});

describe('서버만 시간대를 쓴다', () => {
    const RULES = readRepoFile('firestore.rules');
    const RUNTIME = readRepoFile('functions/runtime.js');
    const INDEX = readRepoFile('functions/index.js');

    it('회원이 timeZone 을 직접 쓰지 못한다 — 규칙 화이트리스트에 없다', () => {
        // 넣지 않은 필드는 거부된다. 30일 제한을 지키려면 그래야 한다.
        expect(RULES).not.toMatch(/'timeZone'/);
        expect(RULES).not.toMatch(/'timeZoneChangedAt'/);
    });

    it('setMemberTimeZone 함수가 검사 함수를 거쳐 저장한다', () => {
        expect(RUNTIME).toContain('exports.setMemberTimeZone = onCall(');
        const body = RUNTIME.slice(RUNTIME.indexOf('exports.setMemberTimeZone = onCall('));
        expect(body.slice(0, 3000)).toContain('validateTimeZoneChange(');
        expect(body.slice(0, 3000)).toContain('runTransaction');
        // functions/index.js 는 runtime 의 모든 export 를 그대로 내보낸다
        expect(INDEX).toContain('...runtime,');
    });

    it('포인트 지급은 회원 시간대로 판단한다', () => {
        const start = RUNTIME.indexOf('exports.awardPoints = onDocumentWritten(');
        const body = RUNTIME.slice(start, RUNTIME.indexOf('exports.syncGalleryPostProjection'));
        expect(body).toContain('isRewardEligibleLogDate(');
        expect(body).not.toContain('getCurrentKstDateString()');
    });

    it('연속 알림은 매시간 돌며 회원 밤 10시를 찾는다', () => {
        const start = RUNTIME.indexOf('exports.sendStreakAlert = onSchedule(');
        const head = RUNTIME.slice(start, start + 600);
        expect(head).toContain('schedule: "0 * * * *"');
        expect(RUNTIME.slice(start, start + 4000)).toContain('selectStreakAlertRecipients(');
    });
});
