import { describe, expect, it, vi } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const app = readRepoFile('js/app-core.js');

function loadHelper(syncReanalyzeControl) {
    const start = app.indexOf('function hideEmptyPreviewControls(preview)');
    const end = app.indexOf('window.previewStaticImage = function', start);
    expect(start).toBeGreaterThan(-1);
    // eslint-disable-next-line no-new-func
    return new Function('syncReanalyzeControl', `${app.slice(start, end)}\nreturn hideEmptyPreviewControls;`)(syncReanalyzeControl);
}

function slot(display, { box = true } = {}) {
    const rotBtn = { style: { display: 'block' } };
    const aiBtn = { style: { display: 'block' } };
    const diet = {
        querySelector: (selector) => (selector === '.diet-ai-btn:not(.ai-reanalyze-btn)' ? aiBtn : null)
    };
    const preview = {
        style: { display },
        parentElement: { querySelector: (selector) => (selector === '.static-rotate-btn' ? rotBtn : null) },
        closest: (selector) => (selector === '.diet-box' && box ? diet : null)
    };
    return { preview, rotBtn, aiBtn };
}

// 2026-11-07 제보: 사진이 없는 칸에 회전 버튼이 떠 있었다.
describe('사진이 없는 칸의 버튼', () => {
    it('사진이 숨으면 회전·AI 분석·다시 분석을 함께 숨긴다', () => {
        const sync = vi.fn();
        const { preview, rotBtn, aiBtn } = slot('none');
        loadHelper(sync)(preview);
        expect(rotBtn.style.display).toBe('none');
        expect(aiBtn.style.display).toBe('none');
        expect(sync).toHaveBeenCalledWith(aiBtn, false);
    });

    it('사진이 보이는 칸은 건드리지 않는다', () => {
        const sync = vi.fn();
        const { preview, rotBtn, aiBtn } = slot('block');
        loadHelper(sync)(preview);
        expect(rotBtn.style.display).toBe('block');
        expect(aiBtn.style.display).toBe('block');
        expect(sync).not.toHaveBeenCalled();
    });

    it('식단 칸이 아니면(운동) 회전 버튼만 숨긴다', () => {
        const sync = vi.fn();
        const { preview, rotBtn, aiBtn } = slot('none', { box: false });
        loadHelper(sync)(preview);
        expect(rotBtn.style.display).toBe('none');
        expect(aiBtn.style.display).toBe('block');
        expect(sync).not.toHaveBeenCalled();
    });

    it('날짜가 달라 거절될 때와 다른 길로 사진이 숨을 때 모두 불린다', () => {
        const rejected = app.slice(app.indexOf('const resetRejectedUpload = () => {'), app.indexOf('const render = () => {'));
        expect(rejected).toContain('hideEmptyPreviewControls(preview)');
        const observer = app.slice(app.indexOf('const observer = new MutationObserver'), app.indexOf('// 오늘의 식단 총평 업데이트'));
        expect(observer).toContain('hideEmptyPreviewControls(el)');
    });
});
