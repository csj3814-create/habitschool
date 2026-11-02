import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { nextMealReminderHour, resolveReturnPath } from '../js/first-record-return.js';

// 2026-11-02 설계(tasks/2026-11-02_가입_안내_끝_첫기록_설계.md 8절). 최근 60일 가입자 중
// 첫 기록은 30%, 그중 15/18 이 가입 당일이었다. 안내를 끝내고(200P) 기록이 없는 사람이 43%.
// 웹만 쓴 사람은 8%, 플레이 앱은 63%. 대표: "오늘 먹은 식단 사진 올려달라고 하는 게 제일 나을듯.
// 밥은 하루 세번 먹으니까 자주 돌아오지."

const HTML = readRepoFile('index.html');
const CORE = readRepoFile('js/app-core.js');

function fnBody(source, signature) {
    const start = source.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return source.slice(start, source.indexOf('\n}\n', start));
}

// 2026-11-02 대표: "바탕화면에 앱 설치하기 권유해서 PWA앱 설치되게 만드는 게 좋지 않아? 구글 플레이스토어는
// HBT가 없으니까 바탕화면 앱 설치하기를 더 우선 권유해야겠지." 웹 앱 설치는 같은 브라우저·같은 로그인이라
// 스토어를 거치지 않는다(안드로이드 웹 가입자 9명이 플레이 앱 권유를 눌렀고 앱을 연 사람은 0명).
describe('돌아올 길 고르기', () => {
    it('플레이 앱 안에서는 알림, 웹에서는 어느 기기든 웹 앱 설치가 먼저', () => {
        expect(resolveReturnPath({ inPlayApp: true, platform: 'android' })).toBe('notify');
        expect(resolveReturnPath({ platform: 'android', playStoreListed: true })).toBe('install');
        expect(resolveReturnPath({ platform: 'ios' })).toBe('install');
        expect(resolveReturnPath({ platform: 'desktop' })).toBe('install');
    });

    it('이미 설치한 웹 앱으로 열었으면 권할 것이 없다', () => {
        expect(resolveReturnPath({ platform: 'ios', standalone: true })).toBe(null);
        expect(resolveReturnPath({ platform: 'android', standalone: true })).toBe(null);
        expect(resolveReturnPath({ platform: 'desktop', standalone: true })).toBe(null);
    });

    it('알림 시각은 다음 끼니(12시 또는 18시)', () => {
        expect(nextMealReminderHour(7)).toBe(12);
        expect(nextMealReminderHour(10)).toBe(12);
        expect(nextMealReminderHour(11)).toBe(18);
        expect(nextMealReminderHour(16)).toBe(18);
        expect(nextMealReminderHour(17)).toBe(12);
        expect(nextMealReminderHour(23)).toBe(12);
    });
});

describe('가입 안내 창 — 오늘 먹은 사진 하나', () => {
    const modal = HTML.slice(HTML.indexOf('id="onboarding-modal"'), HTML.indexOf('id="first-record-result-modal"'));

    it('습관 고르기 대신 사진 올리기가 첫 단추다', () => {
        expect(modal).not.toContain('data-onboarding-habit=');
        expect(modal).toContain('onclick="startOnboardingDietPhoto()"');
        expect(modal).toContain('오늘 먹은 사진 올리기');
        expect(modal).toContain('가입 선물 200P');
    });

    it('아직 안 먹었으면 다음 끼니에 돌아올 길을 그 자리에서 권한다', () => {
        expect(modal).toContain('onclick="showOnboardingLater()"');
        expect(modal).toContain('id="ob-step-2"');
        expect(modal).toContain('id="onboarding-return-actions"');
        expect(modal).toContain('onclick="finishOnboardingLater()"');
    });

    it('사진 고르기 창은 누른 손길 안에서 연다 — 기다린 뒤 열면 브라우저가 막는다', () => {
        const fn = fnBody(CORE, 'function startOnboardingDietPhoto()');
        expect(fn).not.toContain('await ');
        expect(fn).not.toMatch(/^async /);
        const clickAt = fn.indexOf('.click()');
        const saveAt = fn.indexOf('completeOnboarding({ openRecord: false })');
        expect(clickAt).toBeGreaterThan(-1);
        expect(saveAt).toBeGreaterThan(clickAt);
        expect(fn).toContain("openTab('diet')");
    });

    it('첫 습관은 식단으로 저장하고, 나중에 하겠다면 지금처럼 식단 기록 화면으로 간다', () => {
        const complete = fnBody(CORE, 'async function completeOnboarding(');
        expect(complete).toContain('openRecord = true');
        expect(complete).toMatch(/if \(openRecord\) \{\s*openWeeklyMissionRecord\(selectedHabit, \{ trackStart: true \}\);/);
        expect(fnBody(CORE, 'function prepareGuestOnboarding()')).toContain(": 'diet';");
        expect(fnBody(CORE, 'function finishOnboardingLater()')).toContain('completeOnboarding()');
    });
});

describe('첫 기록 결과 창 — 내일 돌아올 길', () => {
    it('결과 창에 돌아올 길 칸이 있고, 창을 띄울 때 채운다', () => {
        const sheet = HTML.slice(HTML.indexOf('id="first-record-result-modal"'), HTML.indexOf('id="first-record-result-modal"') + 2500);
        expect(sheet).toContain('id="first-record-return"');
        expect(fnBody(CORE, 'async function maybeShowFirstRecordResult(')).toContain("renderFirstRecordReturn(document.getElementById('first-record-return'), 'result')");
    });

    it('알림을 허락한 뒤에만 식단 알림을 켠다 (7월부터 서버에 남아 있던 습관 알림)', () => {
        const fn = fnBody(CORE, 'async function enableFirstRecordReminder(');
        const askAt = fn.indexOf('ensureAppNotificationPermission');
        const grantedAt = fn.indexOf("result?.status !== 'granted'");
        const writeAt = fn.indexOf('reminderPreference');
        expect(askAt).toBeGreaterThan(-1);
        expect(grantedAt).toBeGreaterThan(askAt);
        expect(writeAt).toBeGreaterThan(grantedAt);
        expect(fn).toContain("category: 'diet'");
        expect(fn).toContain('hourKst');
    });

    it('웹에서는 웹 앱 설치만 권한다 — 플레이 앱은 HBT 가 빠진 판이다', () => {
        const fn = fnBody(CORE, 'function renderFirstRecordReturn(');
        expect(fn).toContain('installPWA()');
        expect(fn).toContain('enableFirstRecordReminder(');
        expect(fn).toContain('바탕화면에 앱 설치하기');
        expect(fn).toContain('홈 화면에 앱 설치하기');
        expect(fn).not.toContain('first-record-return-alt');
        expect(fn).not.toContain('openAndroidApp()');
        expect(fn).not.toContain('휴대폰으로 이어서 하기');
    });
});

describe('앱으로 넘어간 뒤를 잰다', () => {
    it('앱을 처음 연 날을 한 번만 남긴다', () => {
        const fn = fnBody(CORE, 'async function recordNativeAppOpen(');
        expect(fn).toContain('firstAppOpenDate');
        expect(fn).toContain('settings?.firstAppOpenDate');
    });
});
