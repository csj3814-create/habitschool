import { describe, expect, it, vi } from 'vitest';
import { readAppSource } from './source-helpers.js';
import { summarizeWeeklyActivity, WEEKLY_ACTIVITY_TARGET_MINUTES } from '../js/le8-score.js';

// 2026-09-17 제보: "이번주 운동기록이 사라짐. 새로고침 하면 다시 나타남."
//
// 같은 시각 콘솔에 갤러리 조회 시간 초과와 "Failed to get document because the
// client is offline" 이 함께 찍혀 있었다. 기록이 사라진 것이 아니라 못 읽은
// 것이다. 그런데 화면은 "0 / 150분 · 0% · 하루 38분씩이면 채워요" 라고 단정했다.
//
// 이 프로젝트는 영구 캐시를 켜지 않는다(js/firebase-config.js initializeFirestore).
// 그래서 연결이 끊긴 채 질의하면 비어 있는 메모리 캐시가 **오류 없이** 빈 결과로
// 돌아온다. getDoc 은 오프라인이면 던지지만 getDocs 는 던지지 않는다 — 빈 결과도
// 질의의 답으로는 말이 되기 때문이다. 그 차이가 이 버그다.
//
// 갤러리는 이미 같은 함정을 알고 막아 두었다(gallery_firestore_cache_empty_offline).
// 주간 운동 카드에는 그 방어가 없었다.

const SOURCE = readAppSource();

function sliceSource(startMarker, endMarker) {
    const start = SOURCE.indexOf(startMarker);
    const end = SOURCE.indexOf(endMarker, start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return SOURCE.slice(start, end);
}

const WEEK = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];
const TODAY = '2026-09-17';

function createHarness() {
    const body = sliceSource(
        'const WEEKLY_ACTIVITY_DAY_LABELS',
        'window.refreshWeeklyActivityCard = refreshWeeklyActivityCard;'
    );
    const container = { innerHTML: '', style: {} };
    const document = { getElementById: (id) => (id === 'weekly-activity-card' ? container : null) };
    const auth = { currentUser: { uid: 'user-1' } };
    const state = { snapshot: null, error: null, calls: 0 };

    const getDocs = vi.fn(async () => {
        state.calls += 1;
        if (state.error) throw state.error;
        const docs = state.snapshot.docs;
        return {
            metadata: { fromCache: state.snapshot.fromCache },
            forEach: (cb) => docs.forEach((d) => cb({ data: () => d })),
        };
    });

    const run = Function(
        'document', 'auth', 'getDocs', 'query', 'collection', 'where', 'db',
        'summarizeWeeklyActivity', 'WEEKLY_ACTIVITY_TARGET_MINUTES', 'escapeHtml',
        'getDatesInfo', 'onRefreshFailure', 'setTimeout',
        `${body}
        return refreshWeeklyActivityCard;`
    )(
        document, auth, getDocs, () => ({}), () => ({}), () => ({}), {},
        summarizeWeeklyActivity, WEEKLY_ACTIVITY_TARGET_MINUTES, (s) => String(s),
        () => ({ todayStr: TODAY, weekStrs: WEEK }), () => () => {}, (fn) => { fn(); return 1; }
    );

    return { run, container, state };
}

const withSteps = (date, count) => ({ date, steps: { count }, exercise: null });

describe('a week we could not read is not reported as zero', () => {
    it('does not draw 0 minutes from an empty cache-only answer', async () => {
        const { run, container, state } = createHarness();
        state.snapshot = { fromCache: true, docs: [] };
        await run();
        // 목표(150분)는 모를 때도 함께 적는다. 거짓이 되는 것은 왼쪽 숫자다.
        expect(container.innerHTML).toContain('<strong>—</strong>');
        expect(container.innerHTML).not.toMatch(/<strong>\d+<\/strong>/);
        expect(container.innerHTML).not.toContain('0%');
        expect(container.innerHTML).not.toMatch(/하루 \d+분씩이면/);
    });

    it('says so, and offers a way to try again', async () => {
        const { run, container, state } = createHarness();
        state.snapshot = { fromCache: true, docs: [] };
        await run();
        expect(container.innerHTML).toContain('불러오지 못했어요');
        expect(container.innerHTML).toContain('기록이 사라진 것은 아닙니다');
        expect(container.innerHTML).toContain('다시 시도');
        expect(container.innerHTML).toContain('refreshWeeklyActivityCard({ force: true })');
    });

    it('draws the real number when the server answered', async () => {
        const { run, container, state } = createHarness();
        state.snapshot = { fromCache: false, docs: [withSteps('2026-09-15', 17524), withSteps('2026-09-16', 9000)] };
        await run();
        expect(container.innerHTML).toContain('이번 주 운동');
        expect(container.innerHTML).toMatch(/<strong>\d+<\/strong>/);
        expect(container.innerHTML).not.toContain('불러오지 못했어요');
    });

    it('keeps a number it already heard from the server', async () => {
        // 서버에서 듣고 그린 화면을 나중의 캐시 응답이 "모름" 으로 덮으면,
        // 참인 값을 잃는다. 그건 0분으로 덮는 것만큼이나 틀린 일이다.
        const { run, container, state } = createHarness();
        state.snapshot = { fromCache: false, docs: [withSteps('2026-09-15', 17524)] };
        await run();
        const drawn = container.innerHTML;
        state.snapshot = { fromCache: true, docs: [] };
        await run({ force: true });
        expect(container.innerHTML).toBe(drawn);
    });

    it('does not leave a zero on screen when the read throws', async () => {
        const { run, container, state } = createHarness();
        state.error = new Error('Failed to get document because the client is offline');
        await run();
        expect(container.innerHTML).toContain('불러오지 못했어요');
    });

    it('asks again by itself once, instead of waiting for a tab switch', async () => {
        // 연결이 돌아왔는데 사람이 탭을 다시 열지 않으면 영영 "모름" 으로 남는다.
        const { run, state } = createHarness();
        state.snapshot = { fromCache: true, docs: [] };
        await run();
        // 하니스의 setTimeout 은 즉시 실행한다. 한 번 더 읽고, 거기서 멈춰야 한다.
        expect(state.calls).toBe(2);
    });
});

// 읽는 쪽이 '서버에서 들었는지' 를 알 수 있어야 이 판단이 가능하다.
describe('the loader reports where the answer came from', () => {
    it('hands back the cache flag with the logs', () => {
        const loader = sliceSource('async function loadWeeklyActivityLogs', 'function renderWeeklyActivityUnknown');
        expect(loader).toContain('snapshot.metadata?.fromCache');
        expect(loader).toContain('return { logs, fromCache:');
    });
});
