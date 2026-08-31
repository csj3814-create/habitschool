import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRepoFile } from './source-helpers.js';

// 관제탑 스크립트는 문자열 검사만 받고 있었다. 템플릿 리터럴 안에서 한 줄이
// 끊기면 그 파일 전체가 파싱되지 않아 관리자 화면이 통째로 죽는데, 문자열
// 검사는 그것을 통과시킨다. 실제로 한 번 그렇게 배포됐다.
describe('admin console script actually parses', () => {
    const HTML = readRepoFile('admin.html');

    it('has a module script to check', () => {
        expect(HTML).toContain('<script type="module">');
    });

    it('parses as an ES module', () => {
        const match = HTML.match(/<script type="module">([\s\S]*?)<\/script>/);
        expect(match, 'module script not found').toBeTruthy();
        const dir = mkdtempSync(join(tmpdir(), 'admin-parse-'));
        const file = join(dir, 'admin-check.mjs');
        writeFileSync(file, match[1], 'utf8');
        // node --check 는 실행하지 않고 구문만 본다.
        expect(() => execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }))
            .not.toThrow();
    });

    it('leaves no string literal broken across a line', () => {
        // `join('` 뒤에 줄이 끝나면 그 자리에서 문자열이 끊긴 것이다.
        expect(HTML).not.toMatch(/\('\r?\n/);
    });
});
