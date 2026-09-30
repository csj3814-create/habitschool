import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 2026-10-01: Firebase JS SDK 10.8.0 → 12.19.0. 한 페이지에 두 버전이 섞이면 서로 다른
// 앱 인스턴스가 생겨 로그인·데이터가 따로 논다. 모든 CDN 주소가 같은 버전이어야 한다.
const EXPECTED = '12.19.0';

describe('Firebase SDK version', () => {
    it(`loads every Firebase module from ${EXPECTED}, and nothing else`, () => {
        const files = execSync('git grep -l "gstatic.com/firebasejs/"', { encoding: 'utf8' })
            .trim().split('\n').filter((f) => f && !f.startsWith('tests/') && !f.endsWith('.md'));
        expect(files.length).toBeGreaterThan(5);
        const versions = new Set();
        for (const file of files) {
            for (const m of readFileSync(file, 'utf8').matchAll(/gstatic\.com\/firebasejs\/([0-9.]+)\//g)) versions.add(m[1]);
        }
        expect([...versions]).toEqual([EXPECTED]);
    });
});
