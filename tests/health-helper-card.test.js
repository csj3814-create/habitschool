import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { HEALTH_HELPER_DISMISS_DAYS, resolveHealthHelperCard } from '../js/health-helper-card.js';

// 2026-11-02 설계(tasks/2026-11-02_건강데이터_도우미앱_설계.md). 대표: "헬스커넥트 연동도 HBT 만큼이나 꽤 큰
// 기능이어서 포기하기 아까운데", "플레이 앱도 엄연히 본 앱인데 PWA 사용자에서는 도우미 역할을 하는 것이지,
// 아예 도우미 앱이라고 부르는 것은 맞지 않는듯 해." 플레이 앱은 열 때마다 Health Connect 값을 그날 기록에
// 자동 저장한다(js/health-connect-autosave.js). 안드로이드 웹 회원에게 걸음수·수면 자리에서만 그 쓰임을 알린다.

const HTML = readRepoFile('index.html');
const CORE = readRepoFile('js/app-core.js');
const NOW = Date.parse('2026-11-02T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const base = {
    platform: 'android', inPlayApp: false, isToday: true, stepSource: '', syncedAt: 0,
    now: NOW, appInstalled: null, dismissedAt: 0,
};

function fnBody(signature) {
    const start = CORE.indexOf(signature);
    expect(start, signature).toBeGreaterThan(-1);
    return CORE.slice(start, CORE.indexOf('\n}\n', start));
}

describe('누구에게 어떤 카드를', () => {
    it('안드로이드 웹 회원에게만 — 아이폰·컴퓨터·플레이 앱 안·지난 날짜는 없다', () => {
        expect(resolveHealthHelperCard(base)).toBe('get');
        expect(resolveHealthHelperCard({ ...base, platform: 'ios' })).toBe(null);
        expect(resolveHealthHelperCard({ ...base, platform: 'desktop' })).toBe(null);
        expect(resolveHealthHelperCard({ ...base, inPlayApp: true })).toBe(null);
        expect(resolveHealthHelperCard({ ...base, isToday: false })).toBe(null);
    });

    it('안드로이드 앱이 깔려 있으면 열기, 없거나 모르면 받기', () => {
        expect(resolveHealthHelperCard({ ...base, appInstalled: true })).toBe('open');
        expect(resolveHealthHelperCard({ ...base, appInstalled: false })).toBe('get');
        expect(resolveHealthHelperCard({ ...base, appInstalled: null })).toBe('get');
    });

    it('오늘 걸음수가 방금 Health Connect 에서 왔으면 그리지 않는다 — 이미 쓰는 사람이다', () => {
        expect(resolveHealthHelperCard({ ...base, stepSource: 'health_connect', syncedAt: NOW - 5 * 60 * 1000 })).toBe(null);
    });

    it('Health Connect 걸음수가 30분 넘게 묵었으면 새로 받으라고 한다 (옛 "앱에서 최신 걸음수 가져오기")', () => {
        expect(resolveHealthHelperCard({ ...base, stepSource: 'health_connect', syncedAt: NOW - 3 * 60 * 60 * 1000 })).toBe('refresh');
    });

    it('닫으면 30일 동안 받기·열기 카드는 안 뜬다 — 새로 받기는 계속 보인다', () => {
        expect(HEALTH_HELPER_DISMISS_DAYS).toBe(30);
        expect(resolveHealthHelperCard({ ...base, dismissedAt: NOW - 3 * DAY })).toBe(null);
        expect(resolveHealthHelperCard({ ...base, appInstalled: true, dismissedAt: NOW - 3 * DAY })).toBe(null);
        expect(resolveHealthHelperCard({ ...base, dismissedAt: NOW - 31 * DAY })).toBe('get');
        expect(resolveHealthHelperCard({
            ...base, dismissedAt: NOW - DAY, stepSource: 'health_connect', syncedAt: NOW - 3 * 60 * 60 * 1000,
        })).toBe('refresh');
    });
});

describe('운동 탭·마음 탭의 자리', () => {
    it('걸음수 띠 아래와 수면 칸 아래에 같은 카드 자리가 있다', () => {
        const stepAt = HTML.indexOf('id="step-import-banner"');
        const exerciseCard = HTML.indexOf('id="health-helper-exercise"');
        expect(exerciseCard).toBeGreaterThan(stepAt);
        const sleepBtn = HTML.indexOf('id="sleep-hc-btn"');
        const sleepCard = HTML.indexOf('id="health-helper-sleep"');
        expect(sleepCard).toBeGreaterThan(sleepBtn);
        expect(HTML).toMatch(/id="health-helper-exercise" class="health-helper-card" hidden/);
        expect(HTML).toMatch(/id="health-helper-sleep" class="health-helper-card" hidden/);
    });

    it('걸음수 띠를 그릴 때마다 함께 다시 그린다', () => {
        expect(fnBody('function renderStepImportBanner()')).toContain('renderHealthHelperCards();');
    });
});

describe('카드 문구와 단추', () => {
    const render = fnBody('function renderHealthHelperCard(');

    it('"도우미 앱" 이라고 부르지 않는다 — 안드로이드 앱이 하는 일로 말한다', () => {
        expect(CORE).not.toContain('도우미 앱');
        expect(render).toContain('걸음수·수면을 자동으로 받고 싶다면');
        expect(render).toContain('해빛스쿨 안드로이드 앱');
        expect(render).toContain('기록이랑 포인트, HBT는 지금처럼 이 앱에서 하시면 돼요.');
        expect(render).toContain('Google Play에서 받기');
        expect(render).toContain('안드로이드 앱 열기');
    });

    it('받기는 스토어, 열기·새로 받기는 안드로이드 앱의 Health Connect 읽기 길', () => {
        expect(fnBody('window.openHealthHelperStore = function')).toContain('PLAY_STORE_URL');
        expect(fnBody('window.openHealthHelperApp = function')).toContain('buildAndroidStepSyncIntentUrl(');
    });

    it('누른 날은 settings 안에만 쓴다 (규칙 변경 없음), 기다리지 않고 바로 넘어간다', () => {
        const tap = fnBody('function recordHealthHelperTap(');
        expect(tap).toContain('settings: {');
        expect(tap).toContain('healthHelperTapDate');
        expect(tap).toContain('healthHelperTapCount: increment(1)');
        expect(tap).not.toContain('await ');
    });
});

describe('옛 단추를 카드로 합쳤다', () => {
    it('걸음수 띠의 "앱에서 최신 걸음수 가져오기" 단추가 없다', () => {
        expect(CORE).not.toContain('앱에서 최신 걸음수 가져오기');
        expect(CORE).not.toContain('function shouldOfferStepRefreshFromWebApp(');
        expect(CORE).not.toContain('openStepSyncInAndroidApp');
    });
});
