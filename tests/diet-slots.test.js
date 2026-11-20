import { describe, expect, it } from 'vitest';
import { createRequire } from 'module';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DIET_SLOTS, DIET_URL_KEYS } from '../js/diet-slots.js';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const server = require('../functions/diet-slots.js');

// 2026-11-20 회원 의견 "식단 최대 4개로는 모자라다" → 6칸.
// 예전에는 같은 네 칸이 35곳에 따로 적혀 있었다. 한 곳만 빠뜨려도 그 칸 사진이
// 저장·표시·포인트 확인에서 조용히 빠진다. 그래서 목록은 한 곳에만 둔다.

const OLD_LIST = /\[\s*['"]breakfast['"]\s*,\s*['"]lunch['"]\s*,\s*['"]dinner['"]\s*,\s*['"]snack['"]\s*\]/;
const OLD_URL_LIST = /['"]snackUrl['"]\s*\]/;

function sourceFiles(dir) {
    return readdirSync(join(process.cwd(), dir))
        .filter((name) => name.endsWith('.js'))
        .map((name) => `${dir}/${name}`);
}

describe('식단 칸은 여섯이고, 한 곳에만 적혀 있다', () => {
    it('앱과 서버의 칸 목록이 같다', () => {
        expect(DIET_SLOTS).toEqual(['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6']);
        expect([...server.DIET_SLOTS]).toEqual([...DIET_SLOTS]);
        expect([...server.DIET_URL_KEYS]).toEqual([...DIET_URL_KEYS]);
    });

    it('네 칸짜리 목록을 직접 적은 곳이 남아 있지 않다', () => {
        const offenders = [...sourceFiles('js'), ...sourceFiles('functions')]
            .filter((file) => {
                const src = readRepoFile(file);
                return OLD_LIST.test(src) || OLD_URL_LIST.test(src);
            });
        expect(offenders).toEqual([]);
    });

    it('갤러리 번역은 앱·서버 모두 여섯 칸을 본다', () => {
        expect(readRepoFile('js/gallery-translation.js')).toContain("const DIET_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'];");
        // 두 파일은 export 표기만 달라야 해서(tests/gallery-translation) 목록을 그대로 적는다.
        expect(readRepoFile('functions/gallery-translation.js')).toContain("const DIET_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'meal5', 'meal6'];");
    });

    it('화면에 칸마다 사진 상자·분석 단추·결과 자리가 있다', () => {
        const html = readRepoFile('index.html');
        for (const slot of DIET_SLOTS) {
            expect(html, slot).toContain(`id="diet-box-${slot}"`);
            expect(html, slot).toContain(`id="diet-img-${slot}"`);
            expect(html, slot).toContain(`id="preview-${slot}"`);
            expect(html, slot).toContain(`onclick="analyzeMealPhoto('${slot}')"`);
            expect(html, slot).toContain(`id="diet-analysis-${slot}"`);
        }
        expect(html).toContain('⑤ 다섯 번째 식사');
        expect(html).toContain('⑥ 여섯 번째 식사');
    });

    it('칸 이름표와 분석 단추 짝이 칸마다 있다', () => {
        const app = readRepoFile('js/app-core.js');
        for (const slot of ['meal5', 'meal6']) {
            expect(app).toContain(`'diet-img-${slot}': 'ai-btn-${slot}'`);
        }
        expect(app).toContain("meal5: '다섯 번째 식사'");
        expect(app).toContain("meal6: 'Meal 6'");
    });

    it('포인트는 그대로다 — 한 장 10P, 하루 30P', () => {
        const app = readRepoFile('js/app-core.js');
        expect(app).toContain('const newDietPts = Math.min(dietPhotoCount * 10, 30);');
        const { DAILY_POINT_CAPS } = require('../functions/points-utils.js');
        expect(DAILY_POINT_CAPS.dietPoints).toBe(30);
    });
});
