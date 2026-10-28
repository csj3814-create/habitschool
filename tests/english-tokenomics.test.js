import { describe, expect, it } from 'vitest';
import { readRawRepoFile } from './source-helpers.js';

// 2026-10-22 대표: "토크노믹스 페이지도 번역해서 연결해 줘. 영어로 한번 번역해 놓으면
// 다른 언어는 구글 번역을 이용하는 식으로 하자."
const HANGUL = /[가-힣]/;
const KO = readRawRepoFile('tokenomics.html');
const EN = readRawRepoFile('en/tokenomics.html');
const I18N = readRawRepoFile('js/i18n.js');
const hosting = JSON.parse(readRawRepoFile('firebase.json')).hosting[0];

const visibleText = (html) => html
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ');

describe('영어 토크노믹스 페이지', () => {
    it('영어 판에는 보이는 한글이 없고, 브라우저 번역을 막지 않는다', () => {
        expect(EN).toContain('<html lang="en">');
        expect(visibleText(EN).split(/\s+/).filter((w) => HANGUL.test(w))).toEqual([]);
        expect(EN).not.toMatch(/translate="no"|notranslate/);
    });

    it('한국어 판과 같은 칸을 같은 순서로 담는다', () => {
        const titles = (html) => [...html.matchAll(/<span class="icon">([^<]+)<\/span>/g)].map((m) => m[1]);
        expect(titles(EN)).toEqual(titles(KO));
        expect(titles(EN).length).toBe(11);
        // 숫자·주소가 옮기다 틀어지면 안 된다.
        const numbers = (html) => [...visibleText(html).matchAll(/\d[\d,.]*/g)].map((m) => m[0]).filter((n) => n.replace(/\D/g, '').length >= 3);
        for (const n of ['100,000,000', '30,000,000', '35,000,000', '17,500,000', '8,750,000', '140,000', '12,000', '5,000', '10,000', '70,000,000']) {
            expect(numbers(EN), n).toContain(n);
        }
        for (const address of ['0xCa499c14afE8B80E86D9e382AFf76f9f9c4e2E29', '0xaad072f6be392D30a4E094Ce1E33C36929EfE6b8']) {
            expect(EN).toContain(address);
            expect(KO).toContain(address);
        }
    });

    it('돌아가기는 영어 앱 자산 탭으로', () => {
        expect(EN.match(/href="\/en#assets"/g)).toHaveLength(2);
        expect(EN).not.toContain('href="./#assets"');
    });

    it('두 판이 서로를 가리킨다', () => {
        for (const html of [KO, EN]) {
            expect(html).toContain('<link rel="alternate" hreflang="ko" href="https://habitschool.web.app/tokenomics.html">');
            expect(html).toContain('<link rel="alternate" hreflang="en" href="https://habitschool.web.app/en/tokenomics">');
        }
    });

    it('/en/tokenomics 주소로 열린다', () => {
        const redirects = hosting.redirects.map((item) => [item.source, item.destination, item.type]);
        const rewrites = hosting.rewrites.map((item) => [item.source, item.destination]);
        expect(redirects).toContainEqual(['/en/tokenomics.html', '/en/tokenomics', 301]);
        expect(redirects).toContainEqual(['/en/tokenomics/', '/en/tokenomics', 301]);
        expect(rewrites).toContainEqual(['/en/tokenomics', '/en/tokenomics.html']);
        expect(hosting.headers.map((item) => item.source)).toContain('/en/@(privacy|terms|tokenomics)');
        expect(readRawRepoFile('sitemap.xml')).toContain('<loc>https://habitschool.web.app/en/tokenomics</loc>');
    });

    it('영어 앱의 토크노믹스 단추가 영어 판을 연다 (한국어 앱은 그대로)', () => {
        // 2026-10-28(E6-4): 선택자 표 대신 data-i18n-href 키. 영어 첫 화면에 빌드 때 들어간다.
        expect(readRawRepoFile('en/index.html')).toContain('<a data-i18n="assets.wallet.tokenomics" data-i18n-href="links.tokenomics" href="/en/tokenomics"');
        expect(I18N).toContain("['data-i18n-href', 'href']");
        expect(readRawRepoFile('index.html')).toContain('<a data-i18n="assets.wallet.tokenomics" data-i18n-href="links.tokenomics" href="tokenomics.html"');
    });
});
