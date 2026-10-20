import { describe, expect, it, vi } from 'vitest';
import vm from 'node:vm';
import { readAppSource, readRepoFile } from './source-helpers.js';

// 2026-10-20: 그날 운영 제보 4건 모두 콘솔 기록이 비어 있었다. 체중·혈당이 화면에서
// 사라졌던 건은 서버에 값이 있었는데, 앱이 어느 길로 옛 화면을 그렸는지 알 수 없었다.
//  1. error·warn 만 담고 앱의 갈림길 안내(console.info "[daily-log] ...")는 버렸다.
//  2. 메모리에만 담아, 다른 앱에 다녀오며 페이지가 다시 열리면 사라졌다.
//  3. 옛 기록으로 그리는 갈림길이 경고를 남기지 않았다.

const MODULE = readRepoFile('js/bug-report.js');
const APP = readAppSource();
const FALLBACK = readRepoFile('functions/bug-report-fallback.js');

// 브라우저 모듈이라(gstatic import) 바로 불러올 수 없다. 수집 부분만 떼어 돌린다.
function loadCollector({ saved = null, navType = 'reload' } = {}) {
    const start = MODULE.indexOf('const CONSOLE_BUFFER_LIMIT');
    const end = MODULE.indexOf('function readDisplayMode() {');
    const code = MODULE.slice(start, end).replace(/export function/g, 'function');
    const store = new Map(saved ? [['habitschool-console-buffer-v1', JSON.stringify(saved)]] : []);
    const timers = [];
    const listeners = {};
    const real = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() };
    const fakeConsole = { ...real };
    const context = {
        console: fakeConsole,
        window: {
            location: { pathname: '/', search: '?tab=diet&sharedUploads=abc' },
            addEventListener: (type, fn) => { listeners[type] = fn; }
        },
        sessionStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => store.set(k, v)
        },
        performance: { getEntriesByType: () => [{ type: navType }] },
        URLSearchParams,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        Date, JSON, Array, String, Error
    };
    vm.runInNewContext(`${code}\nthis.api = { installBugReportCollectors, getRecentConsoleEntries, isTaggedConsoleMessage };`, context);
    const flush = () => { while (timers.length) timers.shift()(); };
    return { api: context.api, console: fakeConsole, real, store, flush };
}

describe('제보에 실리는 콘솔 기록', () => {
    it('오류·경고는 지금처럼 담고 원래 콘솔에도 그대로 보낸다', () => {
        const { api, console, real } = loadCollector();
        api.installBugReportCollectors();
        console.warn('[x] 경고', { a: 1 });
        console.error(new Error('boom'));
        const texts = api.getRecentConsoleEntries().map((e) => e.text);
        expect(texts).toContain('[x] 경고 {"a":1}');
        expect(texts).toContain('Error: boom');
        expect(real.warn).toHaveBeenCalled();
        expect(real.error).toHaveBeenCalled();
    });

    it('앱의 갈림길 안내([이름표])는 info·log 도 담는다', () => {
        const { api, console, real } = loadCollector();
        api.installBugReportCollectors();
        console.info('[daily-log] keeping current UI while Firestore reconnects');
        console.info('[shared-import] 분류', '{"auto":false}');
        console.log('[auth] something');
        expect(api.getRecentConsoleEntries().map((e) => e.level)).toEqual(expect.arrayContaining(['info', 'log']));
        expect(real.info).toHaveBeenCalledTimes(2);
    });

    it('이름표 없는 info·log 는 담지 않는다 — 라이브러리의 수다로 칸이 차지 않게', () => {
        const { api, console } = loadCollector();
        api.installBugReportCollectors();
        console.info('Firestore connected');
        console.log({ big: 'object' });
        console.log('[ 공백으로 시작');
        expect(api.getRecentConsoleEntries().filter((e) => e.level === 'info' || e.level === 'log')).toHaveLength(0);
    });

    it('페이지가 다시 열려도 같은 탭이면 직전 기록이 이어진다', () => {
        const first = loadCollector({ navType: 'navigate' });
        first.api.installBugReportCollectors();
        first.console.warn('[daily-log] 서버 확인 없이 휴대폰에 남은 기록으로 그렸다: {}');
        first.flush();
        const saved = JSON.parse(first.store.get('habitschool-console-buffer-v1'));

        const second = loadCollector({ saved, navType: 'reload' });
        second.api.installBugReportCollectors();
        const entries = second.api.getRecentConsoleEntries();
        expect(entries.some((e) => e.text.startsWith('[daily-log] 서버 확인 없이'))).toBe(true);
        // 다시 열린 경계가 보인다. 주소의 값(공유 id 등)은 남기지 않고 이름만.
        const page = entries.filter((e) => e.level === 'page').pop();
        expect(page.text).toContain('페이지 열림 (reload)');
        expect(page.text).toContain('tab,sharedUploads');
        expect(page.text).not.toContain('abc');
    });

    it('개수를 묶어 둔다 — 서버 대체 저장(50건) 안에서', () => {
        const { api, console } = loadCollector();
        api.installBugReportCollectors();
        for (let i = 0; i < 100; i += 1) console.warn(`w${i}`);
        const limit = Number(MODULE.match(/CONSOLE_BUFFER_LIMIT\s*=\s*(\d+)/)[1]);
        expect(api.getRecentConsoleEntries()).toHaveLength(limit);
        expect(limit).toBeLessThanOrEqual(Number(FALLBACK.match(/MAX_CONSOLE_ENTRIES\s*=\s*(\d+)/)[1]));
        expect(api.getRecentConsoleEntries().at(-1).text).toBe('w99');
    });
});

describe('옛 기록으로 그리는 갈림길은 경고를 남긴다', () => {
    const loader = APP.split('async function loadDataForSelectedDate(dateStr) {')[1].split('\n}\n')[0];

    it('서버가 확인하지 않은 화면이면 warn', () => {
        const at = loader.indexOf("console.warn('[daily-log] 서버 확인 없이 휴대폰에 남은 기록으로 그렸다:'");
        expect(at).toBeGreaterThan(-1);
        expect(loader.slice(at - 600, at)).toContain('if (!confirmedByServer) {');
    });

    it('값은 남기지 않고 칸 이름만', () => {
        const at = loader.indexOf("console.warn('[daily-log] 서버 확인 없이");
        expect(loader.slice(at, at + 700)).toContain('metrics: Object.keys(drawn.metrics || {})');
    });
});
