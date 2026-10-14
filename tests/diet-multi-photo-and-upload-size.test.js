import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const app = readRepoFile('js/app-core.js');
const html = readRepoFile('index.html');

const sliceFn = (source, header) => {
    const start = source.indexOf(header);
    if (start < 0) return '';
    const bodyStart = source.indexOf(') {', start);
    let depth = 0;
    for (let i = bodyStart + 2; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) return source.slice(start, i + 1); }
    }
    return '';
};

// 2026-10-15 요청: "식단 사진 올리는 것 운동처럼 한번에 여러개 올리게 할 수 있나?"
describe('식단 사진을 한 번에 여러 장', () => {
    function runSpread(files, inputId = 'diet-img-lunch') {
        const input = { id: inputId, files, value: 'C:\\fakepath\\a.jpg' };
        const imported = vi.fn(() => Promise.resolve(files.length));
        const cleared = vi.fn();
        const body = sliceFn(app, 'function spreadMultipleDietFiles(input)');
        expect(body).not.toBe('');
        // eslint-disable-next-line no-new-func
        const spread = new Function(
            'importDietFilesIntoEmptySlots', 'clearSelectedMediaFile', 'isAcceptedDietImageFile', 'focusDietImportResult', 'showToast', 'isEnglishLocale',
            `${body}\nreturn spreadMultipleDietFiles;`
        )(imported, cleared, (f) => String(f.type).startsWith('image/'), () => {}, () => {}, () => false);
        return { handled: spread(input), input, imported, cleared };
    }
    const photo = (name) => ({ name, type: 'image/jpeg' });

    it('두 장 이상이면 빈 칸들에 나눠 넣고, 고른 칸은 비운다', () => {
        const files = [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')];
        const r = runSpread(files);
        expect(r.handled).toBe(true);
        expect(r.imported).toHaveBeenCalledWith(files, { source: 'picker' });
        expect(r.input.value).toBe('');
        expect(r.cleared).toHaveBeenCalled();
    });

    it('한 장이면 지금처럼 그 칸에 넣는다', () => {
        const r = runSpread([photo('a.jpg')]);
        expect(r.handled).toBe(false);
        expect(r.imported).not.toHaveBeenCalled();
    });

    it('식단 칸이 아니면 손대지 않는다 (운동·수면은 각자의 길)', () => {
        expect(runSpread([photo('a.jpg'), photo('b.jpg')], 'sleep-img').handled).toBe(false);
        expect(runSpread([photo('a.jpg'), photo('b.jpg')], 'file_c_1').handled).toBe(false);
    });

    it('사진이 아닌 파일은 빼고 센다', () => {
        const r = runSpread([photo('a.jpg'), { name: 'b.pdf', type: 'application/pdf' }]);
        expect(r.handled).toBe(false);
    });

    it('미리보기보다 먼저 나눈다', () => {
        const preview = app.slice(app.indexOf('window.previewStaticImage = function'));
        expect(preview.slice(0, 200)).toContain('if (spreadMultipleDietFiles(input)) return;');
    });

    it('칸을 직접 눌러도, 사진 선택 버튼으로 열어도 여러 장을 고른다 — 카메라는 한 장', () => {
        ['breakfast', 'lunch', 'dinner', 'snack'].forEach((meal) => {
            expect(html).toContain(`<input type="file" id="diet-img-${meal}" accept="image/*" multiple`);
        });
        const mode = sliceFn(app, 'function applyTemporaryPickerInputMode(input, source)');
        expect(mode).toContain("input.removeAttribute('multiple');");
        expect(mode).toContain("input.setAttribute('multiple', '');");
        // 원래 상태로 되돌린다
        expect(mode).toContain('if (previousMultiple) input.setAttribute(\'multiple\', \'\');');
    });

    it('안내는 "공유한" 이 아니라 "고른" 사진이라고 말한다', () => {
        expect(app).toContain("${result.source === 'picker' ? '고른' : '공유한'} 식단 사진");
    });
});

// 2026-10-14 측정(scripts/eval-diet-analysis.mjs): 640px → 1280px 로 올리면 음식을
// 찾는 비율이 약 80% → 89%. 식단·운동·수면 모두 AI 가 읽는 사진이다.
describe('AI 가 읽는 사진은 1280px 로 올린다', () => {
    it('식단·운동·수면 폴더는 1280px·0.82', () => {
        expect(app).toContain("const AI_ANALYZED_IMAGE_FOLDERS = new Set(['diet_images', 'exercise_images', 'sleep_images']);");
        expect(app).toContain('const AI_ANALYZED_IMAGE_SIZE = [1280, 1280, 0.82];');
        const upload = sliceFn(app, 'async function uploadFileAndGetUrl(file, folderName, userId, options = {})');
        expect(upload).toContain('AI_ANALYZED_IMAGE_FOLDERS.has(normalizedFolderName)');
        expect(upload).toContain('await compressImage(file, ...AI_ANALYZED_IMAGE_SIZE)');
    });

    it('다른 폴더(프로필 등)는 예전 크기 그대로', () => {
        const upload = sliceFn(app, 'async function uploadFileAndGetUrl(file, folderName, userId, options = {})');
        expect(upload).toContain(': await compressImage(file);');
    });

    it('저장소 한도(20MB) 안이다 — 1280px JPEG 는 1MB 를 넘지 않는다', () => {
        expect(readRepoFile('storage.rules')).toContain('request.resource.size < 20 * 1024 * 1024');
    });
});
