import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

// 2026-10-07 사용자 지적: 식단·운동·마음 가이드의 "도전" · "준비 2개" 는 버튼도 아니고
// 아무 기능도 없는데 한 줄을 차지했다. 뺐다.
describe('the record guides carry no idle badge', () => {
    it('has no badge in the markup, the code or the English table', () => {
        for (const file of ['index.html', 'en/index.html', 'js/app-core.js', 'js/i18n.js']) {
            const src = readRepoFile(file);
            for (const id of ['diet-guide-badge', 'exercise-guide-badge', 'mind-guide-badge']) {
                expect(src, `${file} ${id}`).not.toContain(id);
            }
        }
        expect(readRepoFile('index.html')).not.toContain('record-flow-badge');
    });
});
