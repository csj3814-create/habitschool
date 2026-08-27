import { describe, expect, it } from 'vitest';
import { readAppSource } from './source-helpers.js';

const SOURCE = readAppSource();

// 파일 선택 직후의 사전 업로드는 토스트를 누른다(suppressFailureToast). 이유까지
// 누르면 화면에는 "지연"만 남고 제보는 "안 올라가요"로만 돌아온다.
describe('a suppressed upload failure still says why', () => {
    it('writes the error code into the inline progress channel', () => {
        const at = SOURCE.indexOf('if (attempt === maxRetries)');
        expect(at).toBeGreaterThan(-1);
        const block = SOURCE.slice(at, at + 900);
        expect(block).toContain('suppressFailureToast');
        expect(block).toMatch(/error\?\.code \|\| error\?\.message/);
        expect(block).toMatch(/업로드 실패 \(\$\{reason\}\)/);
    });

    it('does not overwrite that reason with the generic retry line', () => {
        const at = SOURCE.indexOf("'저장할 때 순서대로 다시 시도할게요'");
        expect(at).toBeGreaterThan(-1);
        const block = SOURCE.slice(Math.max(0, at - 500), at + 200);
        expect(block).toContain("startsWith('업로드 실패 (')");
    });

    it('keeps the loud path for callers that did not suppress the toast', () => {
        const at = SOURCE.indexOf('if (attempt === maxRetries)');
        const block = SOURCE.slice(at, at + 900);
        expect(block).toContain('⚠️ 업로드 실패:');
    });
});
