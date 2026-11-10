import { describe, expect, it } from 'vitest';
import emailModule from '../functions/reengagement-email.js';
import { readRepoFile } from './source-helpers.js';

// 2026-09-30: 9/19~26 가입자 15명 중 기록을 남긴 분이 0명이었다. 재참여 메일은
// 마지막 기록일로 대상을 고르므로 이분들께 아무것도 가지 않았다.

const { buildFirstRecordEmailTemplate } = emailModule;
const RUNTIME = readRepoFile('functions/runtime.js');
const FN = RUNTIME.split('exports.sendFirstRecordNudge = onCall(')[1].split('\n);')[0];
const COLLECT = RUNTIME.split('async function collectFirstRecordNudgeTargets(')[1].split('\n}\n')[0];
const SCHEDULED = RUNTIME.split('exports.sendFirstRecordNudgeScheduled = onSchedule(')[1].split('\n);')[0];

describe('first record letter', () => {
    it('promises only the points people actually get', () => {
        const got = buildFirstRecordEmailTemplate({ name: '해빛', welcomeBonusGiven: true, appBaseUrl: 'https://h' });
        const pending = buildFirstRecordEmailTemplate({ name: '해빛', welcomeBonusGiven: false, appBaseUrl: 'https://h' });
        expect(got.html).toContain('보너스 35P');
        expect(got.html).toContain('가입 축하 200P는 이미 들어와 있습니다');
        expect(pending.html).toContain('습관을 하나 고르시면 가입 축하 200P도 드립니다');
        expect(got.subject).toBe('해빛님, 지금 눈앞의 먹을 것 한 장만 찍어 보세요');
        expect(got.html).toContain('답장');
    });

    // 2026-11-11: 받고 일주일 안에 기록한 분이 26명 중 1명이었다. 버튼이 앱 첫 화면을 열어
    // 거기서 식단 탭을 다시 찾아야 했다. 이제는 알림처럼 식단 탭 사진 올리기를 바로 연다.
    it('opens the diet photo upload directly', () => {
        const ko = buildFirstRecordEmailTemplate({ name: '해빛', appBaseUrl: 'https://h' });
        const en = buildFirstRecordEmailTemplate({ name: 'Sun', appBaseUrl: 'https://h/en', locale: 'en' });
        expect(ko.html).toContain('href="https://h/?tab=diet&focus=upload&utm_source=email&utm_medium=onboarding&utm_campaign=first_record"');
        expect(en.html).toContain('href="https://h/en?focus=upload&utm_source=email&utm_medium=onboarding&utm_campaign=first_record#diet"');
    });

    it('asks for one thing: a photo of the food in front of you', () => {
        const ko = buildFirstRecordEmailTemplate({ name: '해빛', appBaseUrl: 'https://h' });
        expect(ko.html).toContain('지금 눈앞에 있는 먹을 것을 찍어 올려 보세요');
        expect(ko.html.match(/<a /g)).toHaveLength(1);
        expect(ko.html).not.toContain('커피 쿠폰');
    });

    it('matches the first-day milestone rewards it quotes', () => {
        const config = readRepoFile('js/firebase-config.js');
        expect(config).toContain("{ id: 'streak1', emoji: '🌟', name: '시작', desc: '첫 기록 달성', target: 1, reward: 20 }");
        expect(config).toContain("{ id: 'diet1', emoji: '🥗', name: '식단 시작', desc: '첫 식단 기록', target: 1, reward: 15 }");
    });
});

describe('sendFirstRecordNudge', () => {
    it('is admin only, previews by default, and sends each person once', () => {
        expect(FN).toContain('await assertAdminRequest(request);');
        expect(FN).toContain('const preview = request.data?.preview !== false;');
        expect(FN).toContain('collectFirstRecordNudgeTargets()');
        expect(COLLECT).toContain('firstRecordNudge?.sentAt');
    });

    it('only picks recent signups with no record', () => {
        expect(COLLECT).toContain('.where("createdAt", ">=", new Date(oldestMs))');
        expect(COLLECT).toContain('if (!logSnap.empty) {');
        expect(RUNTIME).toContain('const FIRST_RECORD_NUDGE_MAX_DAYS = 30;');
    });

    // 2026-11-11: 이틀째 → 다음 날. 24시간이 아니라 날짜로 자른다 — 어제 가입한 분은 오늘 아침에.
    it('also goes out every morning the day after signup, capped per run', () => {
        expect(SCHEDULED).toContain('schedule: "30 10 * * *"');
        expect(SCHEDULED).toContain('signedUpBeforeMs: startOfTodayKstMs()');
        expect(SCHEDULED).toContain('targets.slice(0, FIRST_RECORD_NUDGE_MAX_PER_RUN)');
        expect(SCHEDULED).toContain('sendFirstRecordNudgeMails(batch, "scheduled")');
        expect(COLLECT).toContain('const newestMs = Number.isFinite(signedUpBeforeMs) ? signedUpBeforeMs : nowMs - minDays * 86400000;');
        expect(RUNTIME).toContain('return Date.parse(`${getCurrentKstDateString()}T00:00:00+09:00`);');
        expect(RUNTIME).not.toContain('FIRST_RECORD_NUDGE_AUTO_MIN_DAYS');
    });

    it('has a button in the console that confirms before sending', () => {
        const admin = readRepoFile('admin.html');
        expect(admin).toContain('onclick="sendFirstRecordNudge()"');
        const caller = admin.split('window.sendFirstRecordNudge = async function() {')[1].split('\n    };')[0];
        expect(caller.indexOf('if (!confirm(')).toBeLessThan(caller.indexOf('preview: false'));
    });
});
