// 대표 로고 = 안드로이드 앱 아이콘과 같은 그림, 한글 "해빛스쿨" 글자 없음 (2026-10-21 대표, 세계용 앱).
// 그림은 scripts/generate-web-icons.js 가 만든다.

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';
import { ROOT_DIR } from './korean-text-inventory.mjs';

const require = createRequire(import.meta.url);
const { buildSvg } = require('../scripts/generate-web-icons.js');

const OLD_LOGO = /icons\/(icon-192\.svg|icon-192\.png|icon-512\.svg|icon-512\.png|apple-touch-icon\.svg)/;
const PAGES = [
    'index.html', 'en/index.html', 'admin.html', 'changelog.html', 'community-history.html', 'stories.html', 'tokenomics.html',
    'manifest.json', 'manifest-en.json', 'sw.js', 'js/app-core.js', 'js/auth.js', 'functions/runtime.js',
    'scripts/generate-en-entry.js',
];

function pngSize(file) {
    const buf = readFileSync(join(ROOT_DIR, file));
    expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

describe('대표 로고', () => {
    it('새 로고 그림에는 글자가 없다', () => {
        const svg = readRepoFile('icons/app-icon.svg');
        expect(svg).not.toMatch(/<text\b/);
        expect(svg.replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/[가-힣]/);
        expect(svg).toContain('#FFD54F');
        expect(svg).toContain('#FF9800');
    });

    it('앱 안·매니페스트·알림·메일이 옛 글자 로고를 쓰지 않는다', () => {
        for (const page of PAGES) {
            expect(readRepoFile(page), page).not.toMatch(OLD_LOGO);
        }
    });

    it('옛 파일은 지우지 않는다 (밖에서 들고 있는 주소가 깨지지 않게)', () => {
        for (const file of ['icons/icon-192.svg', 'icons/icon-192.png', 'icons/icon-512.svg', 'icons/icon-512.png', 'icons/apple-touch-icon.svg']) {
            expect(existsSync(join(ROOT_DIR, file)), file).toBe(true);
        }
    });

    it('크기마다 그림이 있다', () => {
        expect(pngSize('icons/app-icon-192.png')).toEqual([192, 192]);
        expect(pngSize('icons/app-icon-512.png')).toEqual([512, 512]);
        expect(pngSize('icons/app-icon-maskable-192.png')).toEqual([192, 192]);
        expect(pngSize('icons/app-icon-maskable-512.png')).toEqual([512, 512]);
        expect(pngSize('icons/app-icon-apple-180.png')).toEqual([180, 180]);
    });

    it('maskable 아이콘의 해는 안전 영역(가운데 지름 80%) 안에 든다', () => {
        const manifest = JSON.parse(readRepoFile('manifest.json'));
        const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.src);
        expect(maskable).toEqual(['icons/app-icon-maskable-192.png', 'icons/app-icon-maskable-512.png']);
        // 광선 끝 지름 460 × 배율 ≤ 512 × 0.8
        const svg = buildSvg({ radius: 0, sunScale: (512 * 70 / 108) / 460 });
        const scale = Number(svg.match(/scale\(([\d.]+)\)/)[1]);
        expect(460 * scale).toBeLessThanOrEqual(512 * 0.8);
    });

    it('메일·알림 아이콘은 PNG 다 (메일 앱과 안드로이드 알림은 SVG 를 못 그린다)', () => {
        expect(readRepoFile('functions/runtime.js')).toContain('const APP_ICON_URL = `${APP_BASE_URL}/icons/app-icon-192.png`;');
    });
});
