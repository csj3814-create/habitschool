import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { buildReEngagementEmailTemplate, describeGap, describeWhy } from '../functions/reengagement-email.js';

// 2026-09-23: 지금까지 나간 복귀 메일의 결과를 셌다.
//
//   3일 메일  61통 → 18명 복귀 (30%)
//   7일 메일 140통 →  5명 복귀 ( 4%)
//
// 나흘 차이로 서른 중 아홉이 한 명으로 줄어든다. 늦게 말을 걸수록 안 돌아온다는
// 뜻이고, 그렇다면 더 일찍 걸어야 한다. 첫 안내를 사흘째에서 이틀째로 당긴다.
//
// 시점을 옮기려면 문구가 먼저 정직해져야 한다. "최근 3일간" 이 박혀 있으면
// 이틀째에 보내는 순간 메일이 거짓말을 한다.

const RUNTIME = readRepoFile('functions/runtime.js');

describe('the email says how long it has actually been', () => {
    it('names yesterday when exactly one day was missed', () => {
        expect(describeGap(2, false)).toBe('어제 기록이 비어 있었어요');
        expect(describeGap(2, true)).toBe('Yesterday went unrecorded');
    });

    it('counts the days once there are several', () => {
        expect(describeGap(5, false)).toBe('최근 5일간 기록이 없었어요');
        expect(describeGap(12, false)).toBe('최근 12일간 기록이 없었어요');
    });

    it('stays vague rather than wrong when the gap is unknown', () => {
        expect(describeGap(null, false)).toBe('최근 기록이 비어 있어요');
        expect(describeGap(undefined, false)).toBe('최근 기록이 비어 있어요');
        expect(describeGap('뭐지', false)).toBe('최근 기록이 비어 있어요');
    });

    it('puts the real gap into the mail that goes out', () => {
        const mail = buildReEngagementEmailTemplate({
            days: 3, gapDays: 2, name: '홍길동',
            appBaseUrl: 'https://habitschool.web.app', appIconUrl: 'https://x/i.png', locale: 'ko',
        });
        expect(mail.html).toContain('어제 기록이 비어 있었어요');
        // 이 문장이 남아 있으면 이틀째에 보내면서 사흘이라고 말하게 된다.
        expect(mail.html).not.toContain('최근 3일간');
        expect(mail.summary).toContain('어제 기록이 비어 있었어요');
    });

    it('still works for the older mail, and for callers that pass no gap', () => {
        const late = buildReEngagementEmailTemplate({
            days: 7, gapDays: 12, name: '홍길동',
            appBaseUrl: 'https://x', appIconUrl: 'https://x/i.png', locale: 'ko',
        });
        expect(late.subject).toContain('보고 싶어요');

        const noGap = buildReEngagementEmailTemplate({
            days: 3, name: '홍길동',
            appBaseUrl: 'https://x', appIconUrl: 'https://x/i.png', locale: 'ko',
        });
        expect(noGap.html).toContain('최근 3일간 기록이 없었어요');
    });

    it('refuses a tier it has no layout for', () => {
        expect(() => buildReEngagementEmailTemplate({ days: 5 })).toThrow();
    });

    // 2026-09-23: 위 시험은 한국어 3일 본문만 봤고, 그래서 나머지 네 군데에 박혀
    // 있던 날짜를 놓쳤다. 67일 쉬신 분께 "7일 이상 기록이 없으셔서" 가 나갈 뻔했다.
    // 이제 두 말 × 두 단계를 전부 본다.
    const EVERY_SHAPE = [
        { locale: 'ko', days: 3 }, { locale: 'ko', days: 7 },
        { locale: 'en', days: 3 }, { locale: 'en', days: 7 },
    ];

    it('never states a day count the gap does not support', () => {
        for (const shape of EVERY_SHAPE) {
            const mail = buildReEngagementEmailTemplate({
                ...shape, gapDays: 67, name: 'x',
                appBaseUrl: 'https://x', appIconUrl: 'https://x/i.png',
            });
            const text = `${mail.html} ${mail.summary}`;
            const where = `${shape.locale} / ${shape.days}일`;
            expect(text, `${where}: 3일이 박혀 있다`).not.toContain('최근 3일간');
            expect(text, `${where}: 7일이 박혀 있다`).not.toContain('7일 이상');
            expect(text, `${where}: 3 days 가 박혀 있다`).not.toContain('last 3 days');
            expect(text, `${where}: 7+ days 가 박혀 있다`).not.toContain('7+ days');
            expect(text, `${where}: 7 days or more 가 박혀 있다`).not.toContain('7 days or more');
            // 실제 공백은 들어 있어야 한다.
            expect(text, `${where}: 실제 공백이 없다`).toMatch(/67/);
        }
    });

    it('does not guess why somebody has been away for two months', () => {
        // 짧게 쉰 분께는 어울리는 짐작이, 오래 쉰 분께는 사정을 지어내는 말이 된다.
        expect(describeWhy(9, false)).toContain('바쁘게');
        expect(describeWhy(9, true)).toContain('busy');
        expect(describeWhy(14, false)).toBe('');
        expect(describeWhy(67, false)).toBe('');
        expect(describeWhy(67, true)).toBe('');

        const long = buildReEngagementEmailTemplate({
            days: 7, gapDays: 67, name: 'x',
            appBaseUrl: 'https://x', appIconUrl: 'https://x/i.png', locale: 'ko',
        });
        expect(long.html).not.toContain('바쁘게 보내고 계신');
        expect(long.html).toContain('최근 67일간 기록이 없었어요');
    });
});

describe('the first nudge comes on the second day', () => {
    function tierForGap(gapDays) {
        const start = RUNTIME.indexOf('const REENGAGEMENT_FIRST_NUDGE_GAP_DAYS');
        const end = RUNTIME.indexOf('async function runScheduledReEngagementSweep', start);
        expect(start).toBeGreaterThan(-1);
        return Function('REENGAGEMENT_MAX_GAP_DAYS', `${RUNTIME.slice(start, end)}
            return reEngagementTierForGap;`)(45)(gapDays);
    }

    it('says nothing the day after a record', () => {
        // 어제 기록한 사람은 멀어진 것이 아니다. 그 자리는 sendDailyReminder 가 맡는다.
        expect(tierForGap(0)).toBe(null);
        expect(tierForGap(1)).toBe(null);
    });

    it('speaks on the second day, where it used to wait until the third', () => {
        expect(tierForGap(2)).toBe(3);
        expect(tierForGap(3)).toBe(3);
        expect(tierForGap(6)).toBe(3);
    });

    it('moves to the longer mail after a week', () => {
        expect(tierForGap(7)).toBe(7);
        expect(tierForGap(45)).toBe(7);
    });

    it('lets go past the automatic window', () => {
        // 46일 넘게 조용한 사람은 캠페인의 몫이지 자동화의 몫이 아니다.
        expect(tierForGap(46)).toBe(null);
        expect(tierForGap(Infinity)).toBe(null);
    });

    it('keeps the stored tier names so nobody is nudged twice', () => {
        // reEngagementByDays.day3 / day7 로 저장돼 있다. 이름을 바꾸면 예전에
        // 안내받은 사람이 한 번 더 받는다.
        expect(RUNTIME).toContain('const REENGAGEMENT_TIER_EARLY = 3;');
        expect(RUNTIME).toContain('const REENGAGEMENT_TIER_LATE = 7;');
        expect(RUNTIME).toContain('byDays[`day${days}`]');
    });

    it('records which day it actually went out on', () => {
        // tier 숫자로는 시점을 알 수 없다. 다음에 효과를 재려면 이 값이 있어야 한다.
        const entry = RUNTIME.split('const historyEntry = {')[1].split('};')[0];
        expect(entry).toContain('gapDays,');
        expect(RUNTIME).toContain('candidates.push({ uid, userData, lastLogDate, days, gapDays });');
    });

    it('hands the real gap to the template', () => {
        const call = RUNTIME.split('const template = buildReEngagementEmailTemplate({')[1].split('});')[0];
        expect(call).toContain('gapDays,');
    });
});
