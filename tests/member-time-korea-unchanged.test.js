import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import * as client from '../js/member-time.js';
import { readRepoFile } from './source-helpers.js';

// 2026-10-16: 해외 회원을 위해 "오늘이 며칠·몇 시인가" 를 회원 시간대로 정하게 바꾼다
// (tasks/2026-10-16_회원별_시간대_설계.md).
//
// 약속은 하나다 — **시간대가 저장되지 않은 회원(지금 한국 회원 전원)은 아무것도 달라지지
// 않는다.** 이 파일은 그 약속을 숫자로 묶는다. 아래 `before` 는 바꾸기 전 코드를 그대로
// 옮긴 것이다. 새 함수는 수천 개의 시각에서 이 값과 하나도 달라서는 안 된다.

const require = createRequire(import.meta.url);
const server = require('../functions/member-time.js');

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const before = {
    // functions/challenge-utils.js getCurrentKstDateString, runtime getTodayKST,
    // points-utils getKstDateStringFromTimestamp, health-connect-activity toKstDateString
    serverDate: (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(0, 10),
    // js/ui-helpers.js getKstDateString, runtime todayKST, getKstDateTimePartsFromTimestamp
    clientDate: (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
    // functions/notification-utils.js getKstHour
    hour: (ms) => new Date(ms + KST_OFFSET_MS).getUTCHours(),
    // sendDietProgramWindowReminders, js/diet-program.js getKstClock
    minutes: (ms) => {
        const shifted = new Date(ms + KST_OFFSET_MS);
        return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
    },
    // js/health-connect-activity.js formatKstClock
    clock: (ms) => new Date(ms + KST_OFFSET_MS).toISOString().slice(11, 16),
};

/** 한국 자정 앞뒤 1초·정각(2024~2030 매일) + 2025~2027 사이 97분 간격. */
function sampleInstants() {
    const instants = [];
    const firstKstMidnight = Date.UTC(2024, 0, 1) - KST_OFFSET_MS;
    const lastKstMidnight = Date.UTC(2031, 0, 1) - KST_OFFSET_MS;
    for (let midnight = firstKstMidnight; midnight <= lastKstMidnight; midnight += DAY_MS) {
        instants.push(midnight - 1000, midnight, midnight + 1000);
    }
    for (let at = Date.UTC(2025, 0, 1); at < Date.UTC(2028, 0, 1); at += 97 * 60 * 1000) {
        instants.push(at);
    }
    return instants;
}

const INSTANTS = sampleInstants();
const NO_TIME_ZONE_MEMBERS = [
    ['시간대 필드가 없는 회원', {}],
    ['회원 문서가 없음', undefined],
    ['null', null],
    ['빈 문자열', { timeZone: '' }],
    ['공백', { timeZone: '   ' }],
    ['없는 이름', { timeZone: 'Mars/Olympus' }],
    ['오프셋 표기는 받지 않는다', { timeZone: '+05:30' }],
    ['문자열이 아님', { timeZone: 9 }],
    ['명시적 서울', { timeZone: 'Asia/Seoul' }],
];

const implementations = [
    ['functions/member-time.js', server],
    ['js/member-time.js', client],
];

describe('시간대가 없으면 Asia/Seoul', () => {
    for (const [label, mt] of implementations) {
        it(`${label}: 기본값은 Asia/Seoul`, () => {
            expect(mt.DEFAULT_TIME_ZONE).toBe('Asia/Seoul');
        });

        for (const [caseLabel, userData] of NO_TIME_ZONE_MEMBERS) {
            it(`${label}: ${caseLabel} → Asia/Seoul`, () => {
                expect(mt.getMemberTimeZone(userData)).toBe('Asia/Seoul');
            });
        }
    }
});

describe('한국 시간 계산은 바꾸기 전과 한 시각도 다르지 않다', () => {
    for (const [label, mt] of implementations) {
        it(`${label}: 날짜 (${INSTANTS.length}개 시각)`, () => {
            const mismatches = INSTANTS.filter((ms) => {
                const expected = before.serverDate(ms);
                return expected !== before.clientDate(ms)
                    || mt.getDateStringInZone(ms, 'Asia/Seoul') !== expected
                    || mt.getMemberToday({}, ms) !== expected;
            });
            expect(mismatches).toEqual([]);
        }, 60_000);

        it(`${label}: 시·분·시계 표시`, () => {
            const mismatches = INSTANTS.filter((ms) => (
                mt.getHourInZone(ms, 'Asia/Seoul') !== before.hour(ms)
                || mt.getMemberHour({}, ms) !== before.hour(ms)
                || mt.getMinutesOfDayInZone(ms, 'Asia/Seoul') !== before.minutes(ms)
                || mt.getMemberMinutesOfDay({}, ms) !== before.minutes(ms)
                || mt.formatClockInZone(ms, 'Asia/Seoul') !== before.clock(ms)
            ));
            expect(mismatches).toEqual([]);
        }, 60_000);

        it(`${label}: 어제는 오늘의 하루 전 달력 날짜`, () => {
            const mismatches = INSTANTS.filter((ms) => (
                mt.getMemberYesterday({}, ms) !== before.serverDate(ms - DAY_MS)
            ));
            expect(mismatches).toEqual([]);
        }, 60_000);

        it(`${label}: Date·숫자·문자열·Firestore Timestamp 를 같은 시각으로 읽는다`, () => {
            const ms = Date.UTC(2026, 9, 15, 15, 0, 0); // 2026-10-16 00:00 KST
            const timestampLike = { toMillis: () => ms };
            expect(mt.getDateStringInZone(new Date(ms), 'Asia/Seoul')).toBe('2026-10-16');
            expect(mt.getDateStringInZone(ms, 'Asia/Seoul')).toBe('2026-10-16');
            expect(mt.getDateStringInZone(new Date(ms).toISOString(), 'Asia/Seoul')).toBe('2026-10-16');
            expect(mt.getDateStringInZone(timestampLike, 'Asia/Seoul')).toBe('2026-10-16');
            expect(mt.getDateStringInZone(ms - 1, 'Asia/Seoul')).toBe('2026-10-15');
        });

        it(`${label}: 읽을 수 없는 시각은 null — 날짜를 지어내지 않는다`, () => {
            expect(mt.getDateStringInZone('not-a-date', 'Asia/Seoul')).toBeNull();
            expect(mt.getDateStringInZone(Number.NaN, 'Asia/Seoul')).toBeNull();
        });
    }
});

describe('화면과 서버는 같은 계산을 쓴다', () => {
    // 서버 배포에는 functions/ 만 올라가므로 한 파일을 함께 쓸 수 없다. 대신 두 파일의
    // 계산 부분이 글자 하나까지 같아야 한다. 갈라지면 화면이 보여 준 날짜·점수를 서버가
    // 다르게 정산한다.
    const SHARED_START = '// ---- 공통 계산 시작 ----';
    const SHARED_END = '// ---- 공통 계산 끝 ----';
    const sharedPart = (source) => {
        const start = source.indexOf(SHARED_START);
        const end = source.indexOf(SHARED_END);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        return source.slice(start, end);
    };

    it('두 파일의 공통 계산 부분이 같다', () => {
        expect(sharedPart(readRepoFile('js/member-time.js')))
            .toBe(sharedPart(readRepoFile('functions/member-time.js')));
    });

    it('여러 시간대에서 같은 답을 낸다', () => {
        const zones = ['Asia/Seoul', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Kolkata', 'Europe/London', 'UTC'];
        const mismatches = [];
        for (const zone of zones) {
            for (let index = 0; index < INSTANTS.length; index += 7) {
                const ms = INSTANTS[index];
                const left = [client.getDateStringInZone(ms, zone), client.getHourInZone(ms, zone), client.getMinutesOfDayInZone(ms, zone)];
                const right = [server.getDateStringInZone(ms, zone), server.getHourInZone(ms, zone), server.getMinutesOfDayInZone(ms, zone)];
                if (left.join('|') !== right.join('|')) mismatches.push({ zone, ms, left, right });
            }
        }
        expect(mismatches).toEqual([]);
    }, 60_000);
});
