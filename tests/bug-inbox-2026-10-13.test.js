import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const CORE = readRepoFile('js/app-core.js');

function sliceFunction(source, header) {
    const start = source.indexOf(header);
    expect(start, header).toBeGreaterThan(-1);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end + 2);
}

// 2026-10-11 제보: "갤러리에서 식단 공유 했더니 에러났어." 사진은 칸에 들어갔는데
// 끝에서 없는 이름을 읽어 멈췄고, 공유 시트는 "가져오지 못했어요" 를 띄웠다.
describe('importing shared diet photos reports how many were placed', () => {
    function run(files) {
        const elements = {};
        const el = (id) => (elements[id] ||= { id, style: { display: 'none' }, src: '', files: null, dispatchEvent() {} });
        el('selected-date').value = '2026-10-11';
        const fn = new Function(
            'document', 'window', 'DataTransfer', 'Event', 'location', 'alert', 'confirm', 'showToast',
            'isEnglishLocale', 'syncSelectedRecordDateToToday', 'buildDietAutoUploadEntries', 'renderDietShareImportBanner', 'MAX_IMG_SIZE',
            `let _lastDietAutoImportResult = null;
            ${sliceFunction(CORE, 'async function importDietFilesIntoEmptySlots(files) {')}
            return importDietFilesIntoEmptySlots;`
        )(
            { getElementById: el },
            { previewStaticImage() {} },
            class { constructor() { const list = []; this.items = { add: (f) => list.push(f) }; this.files = list; } },
            class { constructor(type) { this.type = type; } },
            { host: 'habitschool.web.app' },
            () => {}, () => true, () => {},
            () => false, () => ({}),
            async (list) => ({ entries: list.map((file, i) => ({ file, time: `0${i}:00` })), skippedExifCount: 0, fallbackMismatchEntries: [] }),
            () => {},
            20 * 1024 * 1024
        );
        return fn(files);
    }

    it('returns the number of photos it put into empty meal slots', async () => {
        await expect(run([{ size: 1000, name: 'lunch.jpg' }])).resolves.toBe(1);
    });

    it('does not read a name that was never declared', () => {
        const body = sliceFunction(CORE, 'async function importDietFilesIntoEmptySlots(files) {');
        expect(body).toContain('skippedCount: skippedExifCount,');
        expect(body).not.toMatch(/^\s*skippedCount,\s*$/m);
    });
});

// 2026-10-12 제보: "아침에 일어나면 날짜가 어제 자로 되어있음." 어제 화살표로 날짜를
// 오가다 오늘로 돌아온 것을 '이 날에 머물겠다' 로 기억해서, 자정을 넘긴 아침에도
// 날짜가 넘어가지 않았다.
describe('picking today does not pin the record date', () => {
    function load(todayRef) {
        return new Function(
            'getKstDateString', 'Date',
            `let _recordDateManualSelection = { dateStr: '', at: 0 };
            let _recordDateAutoAdvance = { fromDateStr: '', toDateStr: '', at: 0 };
            ${sliceFunction(CORE, "function rememberRecordDateManualSelection(dateStr = '') {")}
            ${sliceFunction(CORE, 'function shouldAutoAdvanceSelectedRecordDate({')}
            return { pick: rememberRecordDateManualSelection, should: shouldAutoAdvanceSelectedRecordDate };`
        )(() => todayRef.value, { now: () => 1_000 });
    }

    it('moves to the new day in the morning after going back to today with the arrows', () => {
        const today = { value: '2026-10-11' };
        const api = load(today);
        api.pick('2026-10-10');
        api.pick('2026-10-11');
        today.value = '2026-10-12';
        expect(api.should({
            currentDate: '2026-10-11', previousTodayStr: '2026-10-11', todayStr: '2026-10-12', onlyIfStaleToday: true
        })).toBe(true);
    });

    it('still stays on a past day the member chose on purpose', () => {
        const today = { value: '2026-10-12' };
        const api = load(today);
        api.pick('2026-10-11');
        expect(api.should({
            currentDate: '2026-10-11', previousTodayStr: '2026-10-11', todayStr: '2026-10-12', onlyIfStaleToday: true
        })).toBe(false);
    });
});
