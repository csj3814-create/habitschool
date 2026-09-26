import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-09-26 요청: "혈액검사 결과지 분석에 PDF와 엑셀 등 파일 형식도 받을 수 있게 하자"
// 병원·검진기관은 결과지를 PDF나 엑셀로 주는 일이 많다. 사진만 받으면 화면을 찍어
// 다시 올려야 하고, 그 과정에서 글자가 흐려진다.

const APP = readRepoFile('js/app-core.js');
const RUNTIME = readRepoFile('functions/runtime.js');
const STORAGE_RULES = readRepoFile('storage.rules');
const INDEX = readRepoFile('index.html');

function loadKindFn() {
    const start = APP.indexOf('function getBloodTestFileKind(file) {');
    const end = APP.indexOf('\n}\n', start) + 2;
    expect(start).toBeGreaterThan(-1);
    const isValidFileType = (file) => /^image\//.test(file.type || '')
        || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes((file.name || '').split('.').pop().toLowerCase());
    return Function('isValidFileType', `${APP.slice(start, end)}; return getBloodTestFileKind;`)(isValidFileType);
}

describe('blood test result files', () => {
    const kind = loadKindFn();

    it('takes a hospital PDF as it is', () => {
        expect(kind({ name: '결과지.pdf', type: 'application/pdf' })).toBe('pdf');
        // 일부 안드로이드 파일 앱은 type 을 비워 보낸다.
        expect(kind({ name: 'result.PDF', type: '' })).toBe('pdf');
    });

    it('takes Excel and CSV sheets', () => {
        expect(kind({ name: 'lab.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe('sheet');
        expect(kind({ name: 'lab.xls', type: 'application/vnd.ms-excel' })).toBe('sheet');
        expect(kind({ name: 'lab.csv', type: 'text/csv' })).toBe('sheet');
        expect(kind({ name: 'lab.xlsx', type: '' })).toBe('sheet');
    });

    it('still takes photos', () => {
        expect(kind({ name: 'photo.jpg', type: 'image/jpeg' })).toBe('image');
        expect(kind({ name: 'IMG_0001.HEIC', type: '' })).toBe('image');
    });

    it('turns away anything else', () => {
        expect(kind({ name: 'notes.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(null);
        expect(kind({ name: 'movie.mp4', type: 'video/mp4' })).toBe(null);
    });

    it('uploads each kind with a content type the storage rule accepts', () => {
        expect(APP).toContain("uploadMeta = { contentType: 'application/pdf' }");
        expect(APP).toContain("uploadMeta = { contentType: 'text/csv' }");
        expect(STORAGE_RULES).toMatch(/match \/blood_tests\/[\s\S]*?request\.resource\.contentType == 'application\/pdf'/);
        expect(STORAGE_RULES).toMatch(/match \/blood_tests\/[\s\S]*?request\.resource\.contentType == 'text\/csv'/);
    });

    it('loads the spreadsheet reader only when a sheet is picked, pinned with SRI', () => {
        expect(APP).toContain("'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'");
        expect(APP).toMatch(/xlsx\.full\.min\.js',\s*'sha512-/);
    });

    it('hands the PDF to the model as a file and the CSV as text', () => {
        const fn = RUNTIME.slice(RUNTIME.indexOf('const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());'));
        expect(fn).toContain('contentType === "text/csv"');
        expect(fn).toContain('contentType === "application/pdf" || contentType.startsWith("image/")');
        expect(fn).toContain('throw new HttpsError("invalid-argument"');
    });

    it('offers a file button next to the photo buttons', () => {
        expect(INDEX).toContain('onclick="openBloodTestFilePicker()"');
    });
});
