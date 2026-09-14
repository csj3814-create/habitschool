import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(ROOT_DIR, p), 'utf8');

// 2026-09-14 제보: 캡처를 올리는 동안에도 AI 분석 버튼이 눌렸고, 누르면
// "사진을 먼저 저장한 후 분석해주세요" 토스트만 나왔다. 눌리는데 아무 일도 안
// 일어나는 버튼은 고장난 버튼으로 읽힌다.
describe('the AI button waits for the upload it depends on', () => {
    const app = read('js/app-core.js');

    it('covers every slot that uploads a photo to analyse', () => {
        const table = app.split('const AI_ANALYSIS_INPUT_TO_BUTTON = {')[1].split('};')[0];
        for (const [input, button] of [
            ['diet-img-breakfast', 'ai-btn-breakfast'],
            ['diet-img-lunch', 'ai-btn-lunch'],
            ['diet-img-dinner', 'ai-btn-dinner'],
            ['diet-img-snack', 'ai-btn-snack'],
            ['sleep-img', 'ai-btn-sleep']
        ]) {
            expect(table).toContain(`'${input}': '${button}'`);
        }
    });

    it('keeps the pairing in one table, read both ways', () => {
        // 수면은 입력칸이 sleep-img 라 `diet-img-sleep` 로 지어내면 조용히 빗나간다.
        expect(app).toContain('function findAiAnalysisInputIdForSlot(');
        expect(app).toContain('syncAiAnalysisButtonForInput(findAiAnalysisInputIdForSlot(meal));');
        expect(app).not.toContain('syncAiAnalysisButtonForInput(`diet-img-${meal}`)');
    });

    it('decides from the upload record, not from the preview', () => {
        const fn = app.split('function syncAiAnalysisButtonForInput(')[1].split('\n}\n')[0];
        expect(fn).toContain('const entry = _pendingUploads.get(inputId);');
        expect(fn).toContain('const isUploading = !!entry && !entry.done;');
        expect(fn).toContain('btn.disabled = isUploading;');
        expect(fn).toContain('사진 올리는 중');
    });

    it('leaves an already analysed button alone', () => {
        const fn = app.split('function syncAiAnalysisButtonForInput(')[1].split('\n}\n')[0];
        // 분석이 끝난 버튼은 '분석 보기/접기' 토글이라 업로드와 무관하다.
        expect(fn).toContain("if (btn.getAttribute('data-analyzed') === 'true')");
        expect(fn).toContain('btn.disabled = false;');
    });

    it('re-syncs wherever upload state changes', () => {
        // setInlineUploadProgress 는 시작·완료·실패가 모두 지나는 길목이다.
        const fn = app.split('function setInlineUploadProgress(')[1].split('\n}\n')[0];
        expect(fn).toContain('syncAiAnalysisButtonForInput(inputId);');
        // 진행 막대가 없는 입력칸에서도 버튼은 맞춰져야 한다.
        const beforeGuard = fn.split('const els = getInlineUploadProgressEls(inputId);')[0];
        expect(beforeGuard).toContain('syncAiAnalysisButtonForInput(inputId);');
    });

    it('a disabled button looks disabled', () => {
        expect(read('styles-features.css')).toContain('.diet-ai-btn:disabled');
    });
});
