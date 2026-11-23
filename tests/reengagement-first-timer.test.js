import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

const { buildReEngagementEmailTemplate } = emailModule;
const RUNTIME = readRepoFile('functions/runtime.js');
const SWEEP = RUNTIME.split('async function runScheduledReEngagementSweep() {')[1].split('\n}\n')[0];

function loadIsFirstRecordOnlyMember() {
    const body = RUNTIME.split('function isFirstRecordOnlyMember(')[1].split('\n}\n')[0];
    // eslint-disable-next-line no-new-func
    return new Function(`return function isFirstRecordOnlyMember(${body}\n};`)();
}

const base = { days: 3, name: '해빛', appBaseUrl: 'https://habitschool.kr', appIconUrl: 'icon.png' };

// 2026-11-23 설계 4-2: 하루 빠진 다음 날 메일(공백 2일)이 첫 기록 하나만 남긴 새 회원에게도
// 오래 기록한 회원과 같은 문구("어제 기록이 비어 있었어요", "스트릭이 이어져요")로 갔다.
describe('첫 기록만 남긴 새 회원께 가는 하루 빠진 다음 날 메일', () => {
    it('한국어 — 첫 기록을 알아봐 주고 두 번째는 한 장이면 된다고 말한다', () => {
        const mail = buildReEngagementEmailTemplate({ ...base, firstTimer: true });
        expect(mail.subject).toBe('[해빛스쿨] 해빛님, 첫 기록 다음 한 장 🌞');
        expect(mail.html).toContain('첫 기록을 남기셨어요. 두 번째는 더 쉬워요.');
        expect(mail.html).toContain('지금 눈앞에 있는 것 한 장이면 돼요.');
        expect(mail.html).toContain('href="https://habitschool.kr"');
        expect(mail.variant).toBe('first_timer');
        expect(mail.days).toBe(3);
    });

    it('기록이 비었다거나 스트릭이 이어진다는 말, 공포 표현이 없다', () => {
        const mail = buildReEngagementEmailTemplate({ ...base, firstTimer: true });
        expect(mail.html).not.toContain('비어 있');
        expect(mail.html).not.toContain('스트릭');
        expect(mail.html).not.toMatch(/위험|놓치|잃/);
    });

    it('영어', () => {
        const mail = buildReEngagementEmailTemplate({ ...base, name: 'Sun', locale: 'en', firstTimer: true });
        expect(mail.subject).toBe('[Habit School] Sun, one more photo after your first log 🌞');
        expect(mail.locale).toBe('en');
        expect(mail.html).toContain('The second one is easier.');
    });

    it('7일 메일과 다른 회원의 3일 메일은 그대로다', () => {
        const regular = buildReEngagementEmailTemplate({ ...base, gapDays: 2 });
        expect(regular.subject).toBe('[해빛스쿨] 해빛님, 오늘 건강 기록은 어떠세요? 🌞');
        expect(regular.variant).toBeUndefined();
        const sevenDay = buildReEngagementEmailTemplate({ ...base, days: 7, firstTimer: true });
        expect(sevenDay.subject).toBe('[해빛스쿨] 해빛님이 보고 싶어요 💙');
    });
});

describe('기록한 날이 하루뿐인 새 회원 가려내기', () => {
    const isFirstRecordOnlyMember = loadIsFirstRecordOnlyMember();
    const windowStartMs = Date.parse('2026-10-10T00:00:00Z');
    const joined = (iso) => ({ toMillis: () => Date.parse(iso) });

    it('창 안에 가입했고 기록한 날이 하루면 맞다', () => {
        expect(isFirstRecordOnlyMember({ logDates: new Set(['2026-11-21']), createdAt: joined('2026-11-20T00:00:00Z'), windowStartMs })).toBe(true);
    });

    it('기록한 날이 이틀 이상이면 아니다', () => {
        expect(isFirstRecordOnlyMember({ logDates: new Set(['2026-11-20', '2026-11-21']), createdAt: joined('2026-11-20T00:00:00Z'), windowStartMs })).toBe(false);
    });

    it('창이 열리기 전에 가입한 회원은 창 밖에 기록이 있을 수 있어 아니다', () => {
        expect(isFirstRecordOnlyMember({ logDates: new Set(['2026-11-21']), createdAt: joined('2026-08-01T00:00:00Z'), windowStartMs })).toBe(false);
    });

    it('가입 시각을 모르면 아니다', () => {
        expect(isFirstRecordOnlyMember({ logDates: new Set(['2026-11-21']), createdAt: undefined, windowStartMs })).toBe(false);
    });
});

describe('자동 발송이 기록일 수를 세어 편지를 고른다', () => {
    it('최근 기록을 읽을 때 회원별 기록한 날을 모은다', () => {
        expect(SWEEP).toContain('logDatesByUid.get(uid).add(date);');
    });

    it('템플릿에 firstTimer 를 넘기고, 보낸 기록에 어느 편지였는지 남긴다', () => {
        expect(SWEEP).toContain('firstTimer: isFirstRecordOnlyMember({');
        expect(SWEEP).toContain('logDates: logDatesByUid.get(uid),');
        expect(SWEEP).toContain('createdAt: userData.createdAt,');
        expect(SWEEP).toContain('variant: template.variant || "default",');
    });

    it('보내는 시점·대상·중복 방지 장부는 그대로다', () => {
        expect(SWEEP).toContain('alreadyNudgedForGap(byDays[`day${days}`], lastLogDate)');
        expect(SWEEP).toContain('const days = reEngagementTierForGap(gapDays);');
    });
});
