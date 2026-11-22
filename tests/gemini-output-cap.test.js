import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FUNCTIONS_DIR = resolve(ROOT_DIR, 'functions');

// 2026-11-22: 11/20~21 Gemini 비용이 평소의 5배로 뛰었다. 거의 전부 출력 텍스트 토큰이었다.
// 출력 상한이 없는 호출은 모델이 같은 글을 되풀이하면 기본 한도(약 6만5천 토큰)까지 청구된다.
// 그래서 서버의 모든 getGenerativeModel 호출은 maxOutputTokens 를 가져야 한다.
describe('Gemini 호출 출력 상한', () => {
    const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith('.js'));
    const calls = [];
    for (const file of files) {
        const src = readFileSync(resolve(FUNCTIONS_DIR, file), 'utf8');
        const re = /getGenerativeModel\(\{[\s\S]*?\n\s*\}\);/g;
        let m;
        while ((m = re.exec(src))) calls.push({ file, block: m[0] });
    }

    it('Gemini 호출을 찾는다', () => {
        expect(calls.length).toBeGreaterThanOrEqual(9);
    });

    it('모든 호출에 maxOutputTokens 가 있다', () => {
        const missing = calls.filter((c) => !/maxOutputTokens\s*:/.test(c.block)).map((c) => c.file);
        expect(missing).toEqual([]);
    });
});
