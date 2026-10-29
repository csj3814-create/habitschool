import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 증상: 지갑 내보내기 창에서 개인키 복사를 눌러도 "복사했어요" 가 보이지 않았다.
// 원인: 토스트가 z-index 1300, 창이 9999 라 안내가 창 뒤에 떴다(2026-10-29).
describe('toast shows above every overlay', () => {
    const sheets = readdirSync(ROOT_DIR).filter((name) => /^styles.*\.css$/.test(name));
    const css = sheets.map((name) => readFileSync(resolve(ROOT_DIR, name), 'utf8')).join('\n');

    it('sits higher than the highest z-index any stylesheet uses', () => {
        // 다크 모드의 `body.dark-mode #toast {` 가 아니라 본 규칙을 본다.
        const toastBlock = css.split(/^#toast \{/m)[1].split('}')[0];
        const toastZ = Number(toastBlock.match(/z-index:\s*(\d+)/)[1]);
        const others = [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1])).filter((z) => z !== toastZ);
        expect(toastZ).toBeGreaterThan(Math.max(...others));
    });
});
