import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

// 2026-11-22 대표 제보: 날짜를 어제로 옮겨 기록을 저장하고 오늘로 돌아오면,
// 갤러리 「내 카드 공유」에 어제 자료가 나왔다. 오늘·어제 중 가장 최근에 고친
// 기록(갤러리 캐시는 updatedAt 내림차순)을 골랐기 때문이다.
// 내 카드는 날짜 선택기가 보여 주는 날을 따라야 한다.

function extractFunction(source, name) {
    const asyncSignature = `async function ${name}(`;
    const plainSignature = `function ${name}(`;
    let start = source.indexOf(asyncSignature);
    if (start === -1) start = source.indexOf(plainSignature);
    if (start === -1) throw new Error(`Function not found: ${name}`);
    const rest = source.slice(start + 10);
    const ends = [rest.indexOf('\nfunction '), rest.indexOf('\nasync function '), rest.indexOf('\n// ')]
        .filter(i => i !== -1);
    return source.slice(start, start + 10 + Math.min(...ends)).trim();
}

function loadShareHarness() {
    const source = readAppSource();
    const snippets = ['getCurrentShareLog', 'buildShareCardAsync'].map(name => extractFunction(source, name));
    const factory = new Function('env', `
        let cachedGalleryLogs = env.logs;
        let _shareCardBuildToken = 0;
        let _latestPreparedShareMedia = [], _latestPreparedShareSignature = '', _latestShareRenderKey = '';
        let _latestShareFrames = [], _latestShareFrameKeys = [], _latestShareFramesTemplate = '';
        let _shareMediaOrder = { date: '', keys: [] };
        let _shareCardToken = '', _shareSettingsDraft = {};
        let latestShareBlob = null, latestShareFile = null, latestShareText = '', latestShareCaption = '';
        let _latestSharePreviewDataUrl = '';
        const getSelectedRecordDateStr = () => env.selectedDate();
        const normalizeShareSettings = (s) => ({ ...(s || {}) });
        const getCurrentShareTemplate = () => 'basic';
        const renderShareCardState = (user, latest, settings, options = {}) => env.rendered.push({ date: latest?.date || null, preview: options.previewDataUrl || '' });
        const ensurePreparedShareMedia = (latest) => env.prepareMedia(latest);
        const applyShareMediaOrder = (media) => media;
        const buildShareRenderKey = (latest) => 'key:' + latest.date;
        const createShareCardToken = () => 'tok';
        const createSharePosterAsset = async (user, latest) => ({ blob: { date: latest.date }, frames: [], frameKeys: [] });
        const replaceSharePreviewUrl = (blob) => blob ? 'preview:' + blob.date : '';
        const buildShareCaption = () => '';
        const buildShareCopyText = () => '';
        const updateGalleryPrimaryAction = () => {};
        const scheduleShareMediaRetryIfIncomplete = () => {};
        const backfillMissingShareThumbnails = async (latest, media, id) => { env.backfilled.push(id); };
        const setShareSettingsExpanded = () => {};
        const document = { getElementById: () => null };
        const File = function (parts) { this.blob = parts[0]; };
        ${snippets.join('\n\n')}
        return {
            getCurrentShareLog,
            buildShareCardAsync,
            get blob() { return latestShareBlob; }
        };
    `);
    return factory;
}

const ME = 'me';
// updatedAt 내림차순: 어제 기록을 가장 나중에 저장했다.
const logs = [
    { id: 'me_2026-11-21', data: { userId: ME, date: '2026-11-21' } },
    { id: 'other_2026-11-22', data: { userId: 'other', date: '2026-11-22' } },
    { id: 'me_2026-11-22', data: { userId: ME, date: '2026-11-22' } }
];

describe('my share card follows the date picker', () => {
    it('picks the record of the selected date, not the most recently saved one', () => {
        let selected = '2026-11-22';
        const harness = loadShareHarness()({
            logs, selectedDate: () => selected, rendered: [], backfilled: [], prepareMedia: async () => []
        });

        expect(harness.getCurrentShareLog(ME)?.id).toBe('me_2026-11-22');
        selected = '2026-11-21';
        expect(harness.getCurrentShareLog(ME)?.id).toBe('me_2026-11-21');
        // 그날 기록이 없으면 다른 날로 메우지 않는다.
        selected = '2026-11-20';
        expect(harness.getCurrentShareLog(ME)).toBeNull();
    });

    it('builds today\'s card on today and yesterday\'s card on yesterday', async () => {
        let selected = '2026-11-22';
        const env = { logs, selectedDate: () => selected, rendered: [], backfilled: [], prepareMedia: async () => [] };
        const harness = loadShareHarness()(env);

        await harness.buildShareCardAsync(ME, { uid: ME });
        expect(harness.blob?.date).toBe('2026-11-22');
        expect(env.backfilled.at(-1)).toBe('me_2026-11-22');

        selected = '2026-11-21';
        await harness.buildShareCardAsync(ME, { uid: ME });
        expect(harness.blob?.date).toBe('2026-11-21');
        expect(env.backfilled.at(-1)).toBe('me_2026-11-21');
    });

    it('drops a slow build when the date changes mid-way', async () => {
        let selected = '2026-11-21';
        const pending = [];
        const env = {
            logs,
            selectedDate: () => selected,
            rendered: [],
            backfilled: [],
            prepareMedia: (latest) => new Promise(resolve => pending.push({ date: latest.date, resolve }))
        };
        const harness = loadShareHarness()(env);

        const slow = harness.buildShareCardAsync(ME, { uid: ME }); // 어제 카드 그리는 중
        selected = '2026-11-22';                                    // 오늘로 돌아옴
        const fast = harness.buildShareCardAsync(ME, { uid: ME });

        pending.find(p => p.date === '2026-11-22').resolve([]);
        await fast;
        pending.find(p => p.date === '2026-11-21').resolve([]);     // 늦게 온 어제 응답
        await slow;

        expect(harness.blob?.date).toBe('2026-11-22');
        expect(env.backfilled).toEqual(['me_2026-11-22']);
        expect(env.rendered.filter(r => r.preview).map(r => r.preview)).toEqual(['preview:2026-11-22']);
    });

    it('redraws the card when the date changes or the gallery opens from cache', () => {
        const source = readAppSource();
        const loadData = extractFunction(source, 'loadDataForSelectedDate');
        expect(loadData).toContain('scheduleShareCardRefresh();');

        // 캐시로 그리는 길에서도 카드를 다시 만든다(fresh fetch 블록 밖).
        const inner = extractFunction(source, '_loadGalleryDataInner');
        const afterFetchBlock = inner.split('if (abortIfSuperseded()) return;\n\n    // 공유 카드는')[1] || '';
        expect(afterFetchBlock).toContain('buildShareCardAsync(myId, user)');
    });
});
