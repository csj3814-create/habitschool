import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const { CLINICS } = require('../scripts/generate-clinic-pages.js');

// 2026-11-20 대표: 카톡으로 보낼 때 병원에서 보낸 것처럼. 카톡은 HTML 의 og: 태그만 읽는다.
describe('병원 안내 페이지와 시작 링크의 카톡 미리보기', () => {
    it('만든 파일이 clinic.html 과 맞다(고쳤으면 node scripts/generate-clinic-pages.js)', () => {
        const result = spawnSync(process.execPath, ['scripts/generate-clinic-pages.js', '--check'], { encoding: 'utf8' });
        expect(result.status, result.stderr).toBe(0);
    });

    for (const clinic of CLINICS) {
        it(`${clinic.name}: 안내 페이지와 시작 링크가 병원 이름·그림으로 뜬다`, () => {
            const guide = readRepoFile(`clinic/${clinic.id}.html`);
            const start = readRepoFile(`clinic/${clinic.id}/app.html`);
            for (const html of [guide, start]) {
                expect(html).toContain(`<meta property="og:site_name" content="${clinic.name}">`);
                expect(html).toMatch(new RegExp(`<meta property="og:title" content="${clinic.name} 건강수첩`));
                expect(html).toContain(`https://habitschool.web.app/assets/clinics/${clinic.id}-og.png`);
            }
            expect(existsSync(new URL(`../assets/clinics/${clinic.id}-og.png`, import.meta.url))).toBe(true);
            // 사람이 열면 같은 사이트의 병원 가입 화면으로
            expect(start).toContain(`location.replace("/app?clinic=${clinic.id}")`);
        });
    }

    it('없는 병원의 시작 링크도 clinic.html 이 앱으로 보낸다', () => {
        const fallback = readRepoFile('clinic.html');
        expect(fallback).toContain('location.replace(`/app?clinic=${startMatch[1]}`)');
    });
});
