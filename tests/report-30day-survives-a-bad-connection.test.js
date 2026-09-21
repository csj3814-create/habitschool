import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-21 제보: "30일 분석 오류나고 있었어."
//
// 계산은 멀쩡했다 — 진짜 기록 30건을 떼어 와 끝까지 돌려 확인했다. 터진 것은 읽기다.
//
//   getDocs            연결이 끊기면 **오류 없이 빈 결과**를 준다
//   getDocsFromServer  연결이 끊기면 **던진다**
//
// 그래서 캐시가 빈 첫 조회 → 서버 조회 → 그 자리에서 catch → "오류가 발생했습니다"
// 한 줄. 무엇이 잘못됐는지도, 다시 해 볼 방법도 화면에 없었다.

const APP = readRepoFile('js/app-core.js');

function createHarness({ serverBehaviour, cacheRows = [] }) {
    // 결과지 본문은 위쪽 도우미들(summarizeReportActivity 등)을 부른다.
    // 그것까지 함께 떼어 와야 이 시험이 진짜 코드를 도는 셈이 된다.
    const start = APP.indexOf('function summarizeReportActivity(logs = []) {');
    const end = APP.indexOf('const REPORT_PRINT_SHEET_ID', start);
    expect(start).toBeGreaterThan(-1);
    expect(APP.indexOf('async function readReportLogsFromServer(readLogs) {')).toBeGreaterThan(start);
    const block = APP.slice(start, end);

    const nodes = new Map();
    const node = (id) => {
        if (!nodes.has(id)) {
            nodes.set(id, {
                id, style: {}, innerHTML: '', textContent: '',
                getContext: () => ctx, getBoundingClientRect: () => ({ width: 640, height: 320 }),
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute() {}, getAttribute: () => null,
                querySelector: () => null, querySelectorAll: () => [],
                appendChild() {}, remove() {},
                width: 640, height: 320, clientWidth: 640, clientHeight: 320,
            });
        }
        return nodes.get(id);
    };
    const ctx = new Proxy({}, {
        get: (_t, p) => {
            if (p === 'canvas') return node('canvas');
            if (p === 'measureText') return () => ({ width: 10 });
            if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
            return () => {};
        },
        set: () => true,
    });

    const reconnects = [];
    const serverCalls = [];
    const getDocsFromServer = vi.fn(async () => {
        serverCalls.push(Date.now());
        const rows = serverBehaviour(serverCalls.length);
        if (rows instanceof Error) throw rows;
        return { forEach: (fn) => rows.forEach((r) => fn({ data: () => r })), size: rows.length };
    });

    const api = Function(
        'auth', 'showToast', 'document', 'getUserDisplayName', 'query', 'collection', 'db',
        'where', 'orderBy', 'limit', 'getDocs', 'getDocsFromServer', 'escapeHtml', 'console',
        'setTimeout', 'isFirestoreInternalStateError', 'isFirestoreConnectivityIssue',
        'forceFirestoreReconnect', 'drawReportLineChart', 'drawReportBarChart', 'drawReportHealthChart',
        'window', 'resolveDailyActivityMinutes',
        'WEEKLY_ACTIVITY_TARGET_MINUTES', 'WEEKLY_ACTIVITY_STRETCH_MINUTES',
        `${block}
         return { report: window.generate30DayReport, readFromServer: readReportLogsFromServer };`
    )(
        { currentUser: { uid: 'u1' } },
        () => {},
        {
            getElementById: node,
            createElement: () => node('tmp'),
            querySelector: () => null,
            querySelectorAll: () => [],
            body: { appendChild() {}, classList: { add() {}, remove() {} } },
            documentElement: { classList: { add() {}, remove() {} } },
        },
        () => '회원',
        (...a) => ({ __q: a }), () => ({}), {}, () => ({}), () => ({}), () => ({}),
        async () => ({ forEach: (fn) => cacheRows.forEach((r) => fn({ data: () => r })), size: cacheRows.length }),
        getDocsFromServer,
        (v) => String(v ?? ''),
        { error: () => {}, warn: () => {} },
        (fn) => fn(),
        (e) => /INTERNAL ASSERTION FAILED|Unexpected state/i.test(String(e?.message || e)),
        (e) => String(e?.code || '') === 'unavailable',
        async (reason) => { reconnects.push(reason); return true; },
        () => {}, () => {}, () => {},
        {},
        // 이 시험이 보는 것은 연결이지 운동 분이 아니다.
        () => ({ minutes: 0 }), 150, 300
    );

    return { api, nodes, node, reconnects, getDocsFromServer };
}

const LOGS = [
    { date: '2026-09-20', userId: 'u1', awarded: {} },
    { date: '2026-09-21', userId: 'u1', awarded: {} },
];
const unavailable = () => Object.assign(new Error('client is offline'), { code: 'unavailable' });
const internal = () => new Error('INTERNAL ASSERTION FAILED: Unexpected state');

describe('the 30-day report survives a connection that answers short', () => {
    it('rebuilds the connection and reads again instead of giving up', async () => {
        const h = createHarness({ serverBehaviour: (n) => (n === 1 ? unavailable() : LOGS) });
        await h.api.report();
        expect(h.getDocsFromServer).toHaveBeenCalledTimes(2);
        expect(h.reconnects).toEqual(['report-30day-retry']);
        expect(h.node('report-body').innerHTML).not.toContain('불러오지 못했어요');
        expect(h.node('report-period').textContent).toContain('2026.09.20');
    });

    it('retries an internal state error the same way', async () => {
        const h = createHarness({ serverBehaviour: (n) => (n === 1 ? internal() : LOGS) });
        await h.api.report();
        expect(h.getDocsFromServer).toHaveBeenCalledTimes(2);
        expect(h.reconnects).toEqual(['report-30day-retry']);
    });

    it('offers a way to try again when the second read fails too', async () => {
        const h = createHarness({ serverBehaviour: () => unavailable() });
        await h.api.report();
        const shown = h.node('report-body').innerHTML;
        // 예전에는 이 한 줄이 전부였다. 다시 해 볼 방법이 없었다.
        expect(shown).not.toContain('결과지 생성 중 오류가 발생했습니다.');
        expect(shown).toContain('연결이 불안정해');
        expect(shown).toContain('onclick="generate30DayReport()"');
        // 기간이 남아 있으면 반쯤 만들어진 결과지처럼 보인다.
        expect(h.node('report-period').textContent).toBe('');
    });

    it('does not blame the connection for something else', async () => {
        // permission-denied 는 기다린다고 풀리지 않는다. 다른 말을 해야 한다.
        const denied = Object.assign(new Error('Missing permissions'), { code: 'permission-denied' });
        const h = createHarness({ serverBehaviour: () => denied });
        await h.api.report();
        const shown = h.node('report-body').innerHTML;
        expect(shown).toContain('결과지를 만들지 못했어요');
        expect(shown).toContain('permission-denied');
        // 다시 세울 문제가 아니므로 연결을 건드리지 않는다.
        expect(h.reconnects).toEqual([]);
        expect(h.getDocsFromServer).toHaveBeenCalledTimes(1);
    });

    it('never asks the server when the cache already answered in full', async () => {
        const h = createHarness({ serverBehaviour: () => LOGS, cacheRows: LOGS });
        await h.api.report();
        expect(h.getDocsFromServer).not.toHaveBeenCalled();
    });

    it('still says plainly when there is simply not enough recorded', async () => {
        // 기록이 없는 것과 못 불러온 것은 다른 일이다.
        const h = createHarness({ serverBehaviour: () => [{ date: '2026-09-21', userId: 'u1', awarded: {} }] });
        await h.api.report();
        expect(h.node('report-body').innerHTML).toContain('최소 2일 이상의 기록');
    });
});
