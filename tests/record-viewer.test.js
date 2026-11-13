import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { storageFileKind, pickFilesForDate, bloodTestSourceUrls } from '../js/record-viewer.js';
import { buildBloodTestTrend, renderBloodTestTrendHtml } from '../js/blood-test-trend.js';

// 2026-11-13 제보: 체성분 추이에서 날짜("11-/13")와 출처("사/진")가 줄이 넘어간다.
// "사진 누르면 저장된 사진 보여주면 좋을듯. 날짜 누르면 공유되었던 체성분 자료 보여주면 좋겠고.
//  혈액검사 결과지도 날짜 누르면 다시 볼 수 있게 할 수 있을까?"

const APP = readRepoFile('js/app-core.js');
const CSS = readRepoFile('styles-features.css');
const STORAGE_RULES = readRepoFile('storage.rules');
const SW = readRepoFile('sw.js');

const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/x.firebasestorage.app/o/';

describe('the body composition trend keeps dates and sources on one line', () => {
    it('does not let the date or the source label wrap', () => {
        expect(CSS).toMatch(/\.trend-date-cell \{[^}]*white-space: nowrap;/);
        expect(CSS).toMatch(/\.trend-source-btn,\s*\.trend-source-label \{[^}]*white-space: nowrap;/);
        expect(APP).toContain('<td class="trend-date-cell">${dateHtml}${labelHtml}</td>');
    });
});

describe('a past body composition record can be opened again', () => {
    it('opens the record from the date and the photo from the photo label', () => {
        expect(APP).toContain(`onclick="openBodyRecord('\${r.date}')"`);
        expect(APP).toContain(`onclick="openBodyRecord('\${r.date}', 'photo')"`);
        // 날짜 글자만 onclick 에 넣는다.
        expect(APP).toContain("const dateOk = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(r.date || ''));");
    });

    it('finds that day\'s photos by file name, newest first', () => {
        const names = ['2026-09-24_1790000000000.jpg', '2026-09-24_1790000999999.jpg', '2026-09-23_1789000000000.jpg', 'notes.txt'];
        expect(pickFilesForDate(names, '2026-09-24')).toEqual(['2026-09-24_1790000999999.jpg', '2026-09-24_1790000000000.jpg']);
        expect(pickFilesForDate(names, '2026-08-31')).toEqual([]);
        expect(pickFilesForDate(names, '')).toEqual([]);
        expect(pickFilesForDate(names, '2026-09')).toEqual([]);
    });

    it('lists only the member\'s own folder, which the storage rule lets them read', () => {
        expect(APP).toContain('listAll(ref(storage, `body_composition/${uid}`))');
        expect(STORAGE_RULES).toMatch(/match \/body_composition\/\{userId\}\/\{allFiles=\*\*\} \{\s*allow read: if request\.auth != null && request\.auth\.uid == userId;/);
    });

    it('says so when there is no photo or it cannot be loaded, and logs the failure', () => {
        expect(APP).toContain('이 날 올린 사진이 없어요.');
        expect(APP).toContain('사진을 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.');
        expect(APP).toContain("console.warn('[body-record] 사진을 불러오지 못했다:'");
    });

    it('escapes what it prints', () => {
        const fn = APP.split('window.openBodyRecord = async function (date, focus = \'values\') {')[1].split('\n};')[0];
        expect(fn).toContain('escapeHtml(String(record[key]))');
        expect(fn).toContain('escapeHtml(sourceText)');
        expect(fn).toContain('escapeHtml(url)');
    });
});

describe('a past blood test sheet can be opened again', () => {
    it('reads the addresses a test kept, old single-file records included', () => {
        expect(bloodTestSourceUrls({ imageUrls: [`${STORAGE}a.jpg`, `${STORAGE}b.jpg`], imageUrl: `${STORAGE}a.jpg` }))
            .toEqual([`${STORAGE}a.jpg`, `${STORAGE}b.jpg`]);
        expect(bloodTestSourceUrls({ imageUrl: `${STORAGE}old.pdf` })).toEqual([`${STORAGE}old.pdf`]);
        expect(bloodTestSourceUrls({})).toEqual([]);
        // 우리 저장소 주소가 아니면 열지 않는다.
        expect(bloodTestSourceUrls({ imageUrl: 'https://example.com/x.jpg' })).toEqual([]);
    });

    it('tells a photo from a PDF from a spreadsheet by the stored file name', () => {
        expect(storageFileKind(`${STORAGE}blood_tests%2Fuid%2F2026-11-13_1.jpg?alt=media&token=t`)).toBe('image');
        expect(storageFileKind(`${STORAGE}blood_tests%2Fuid%2F2026-11-13_1.pdf?alt=media&token=t`)).toBe('pdf');
        expect(storageFileKind(`${STORAGE}blood_tests%2Fuid%2F2026-11-13_1.csv?alt=media&token=t`)).toBe('sheet');
        expect(storageFileKind('not a url')).toBe('image');
    });

    it('makes the test date in the trend table open the sheet', () => {
        const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
        const trend = buildBloodTestTrend([
            { id: '2026-11-13', testDate: '2026-10-19', metrics: { glucose: { value: 96 } } },
            { id: 'bad"id', testDate: '2025-10-01', metrics: { glucose: { value: 99 } } }
        ]);
        expect(trend.ids).toEqual(['2026-11-13', 'bad"id']);
        const html = renderBloodTestTrendHtml(trend, { escapeHtml });
        expect(html).toContain(`onclick="openBloodTestSource('2026-11-13')">26.10.19</button>`);
        // 이상한 id 는 단추로 만들지 않는다.
        expect(html).not.toContain('bad"id');
        expect(html).toContain('>25.10.01</th>');
    });

    it('offers the sheet from each test\'s notes too, and opens PDFs in a new tab', () => {
        expect(APP).toContain('📄 올린 결과지 다시 보기');
        const fn = APP.split('window.openBloodTestSource = function (id) {')[1].split('\n};')[0];
        expect(fn).toContain('target="_blank" rel="noopener"');
        expect(fn).toContain('이 검사는 올린 파일이 남아 있지 않아요.');
    });

    it('is kept for offline use', () => {
        expect(SW).toMatch(/'\.\/js\/record-viewer\.js\?v=\d+',/);
    });
});
