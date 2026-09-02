import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readRepoFile } from './source-helpers.js';

const HOSTING = (() => {
    const config = JSON.parse(readRepoFile('firebase.json'));
    return Array.isArray(config.hosting) ? config.hosting[0] : config.hosting;
})();

const cacheControlFor = (source) => HOSTING.headers
    .filter(entry => entry.source === source)
    .flatMap(entry => entry.headers)
    .find(header => header.key === 'Cache-Control')?.value;

// cleanUrls 가 켜져 있어 admin.html 은 /admin 으로 서빙된다. 헤더 규칙은 요청 경로에
// 맞추므로 '**/*.html' 은 /admin 에 걸리지 않고, Hosting 기본값 max-age=3600 이 붙었다.
// 배포한 수정이 브라우저에 한 시간 동안 도착하지 않는다는 뜻이다 — 실제로 운영에서
// 방금 올린 관제탑 대신 한 시간 전 파일이 돌고 있었다.
describe('확장자 없는 경로도 캐시하지 않는다', () => {
    it('cleanUrls 가 켜져 있다', () => {
        // 이게 꺼지면 아래 규칙들은 필요 없어진다. 함께 봐야 한다.
        expect(HOSTING.cleanUrls).toBe(true);
    });

    it('.html 로 끝나는 경로에는 이미 규칙이 있다', () => {
        expect(cacheControlFor('**/*.html')).toBe('no-cache, no-store, must-revalidate');
    });

    it('그 규칙이 못 잡는 확장자 없는 경로를 따로 적어 뒀다', () => {
        expect(cacheControlFor('/@(admin|changelog|community-history|privacy|terms|tokenomics)'))
            .toBe('no-cache, no-store, must-revalidate');
        expect(cacheControlFor('/en/@(privacy|terms)'))
            .toBe('no-cache, no-store, must-revalidate');
    });

    it('루트 html 파일이 늘면 규칙에도 들어가야 한다', () => {
        // 새 페이지를 추가하고 여기를 잊으면 그 페이지만 조용히 한 시간 낡는다.
        const covered = new Set([
            'index',           // '/' 규칙이 따로 있다
            'admin', 'changelog', 'community-history', 'privacy', 'terms', 'tokenomics',
            // 소유권 확인용 파일. 검색엔진이 한 번 읽고 마는 것이라 캐시가 문제되지 않는다.
            'googlef3171fd1f953cdf0', 'naver967bac8b528b114d58c0898a29c2c46e'
        ]);
        for (const name of rootHtmlPages()) {
            expect(covered.has(name), `${name}.html 이 캐시 규칙에 없다`).toBe(true);
        }
    });
});

function rootHtmlPages() {
    const root = fileURLToPath(new URL('..', import.meta.url));
    return readdirSync(root)
        .filter(file => file.endsWith('.html'))
        .map(file => file.replace(/\.html$/, ''));
}
