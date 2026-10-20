// 빌드할 때 영어 HTML 에 영어 글자를 미리 넣는다(scripts/generate-en-entry.js, 해외 3단계 E0, 2026-10-21).
// 한국어 index.html 은 그대로이고(tests/korean-app-unchanged-i18n.test.js), en/index.html 만 영어로 온다.

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { readRepoFile } from './source-helpers.js';

const require = createRequire(import.meta.url);
const { loadEnglishMessages, translateI18nAttributes } = require('../scripts/generate-en-entry.js');

const EN = loadEnglishMessages();
const INDEX = readRepoFile('index.html');
const EN_INDEX = readRepoFile('en/index.html');

function keysUsed(html, attr) {
    return [...html.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, 'g'))].map((match) => match[1]);
}

describe('빌드 때 영어 글자 넣기', () => {
    it('index.html 이 쓰는 번역 키는 모두 영어 사전에 있다', () => {
        const used = ['data-i18n', 'data-i18n-html', 'data-i18n-placeholder', 'data-i18n-aria-label']
            .flatMap((attr) => keysUsed(INDEX, attr));
        expect(used.length).toBeGreaterThan(100);
        expect([...new Set(used)].filter((key) => !EN[key])).toEqual([]);
    });

    it('영어 HTML 의 번역 칸에는 영어가 이미 들어 있다', () => {
        expect(EN_INDEX).toContain(`data-i18n="login.point1">${EN['login.point1']}</li>`);
        expect(EN_INDEX).toContain(`data-i18n-html="login.tagline" style="color: #666; margin-bottom: 40px; line-height: 1.6; font-size: 15px;">${EN['login.tagline']}</p>`);
        expect(EN_INDEX).toMatch(/data-i18n-placeholder="mind\.gratitudePlaceholder"[^>]*placeholder="[^"가-힣]+"|placeholder="[^"가-힣]+"[^>]*data-i18n-placeholder="mind\.gratitudePlaceholder"/);
    });

    it('글자는 바꾸되 요소 모양은 그대로 둔다', () => {
        const html = [
            '<div data-i18n="a">한국어<span>안쪽</span></div>',
            '<p data-i18n-html="b">옛 <strong>문장</strong></p>',
            '<div data-i18n="c"><div>겹친</div> 같은 태그</div><div>뒤</div>',
            '<input type="text" data-i18n-placeholder="d" placeholder="예: 사과">',
            '<button data-i18n-aria-label="e" aria-label="닫기">×</button>',
            '<script>const x = \'<p data-i18n="a">손대지 않음</p>\';</script>',
            '<!-- <p data-i18n="a">주석도 그대로</p> -->',
        ].join('\n');
        const out = translateI18nAttributes(html, {
            a: 'Fish & <chips>', b: 'New <strong>line</strong>', c: 'Nested {n}', d: 'e.g. "apple"', e: 'Close',
        });
        expect(out.split('\n')).toEqual([
            '<div data-i18n="a">Fish &amp; &lt;chips&gt;</div>',
            '<p data-i18n-html="b">New <strong>line</strong></p>',
            '<div data-i18n="c">Nested </div><div>뒤</div>',
            '<input type="text" data-i18n-placeholder="d" placeholder="e.g. &quot;apple&quot;">',
            '<button data-i18n-aria-label="e" aria-label="Close">×</button>',
            '<script>const x = \'<p data-i18n="a">손대지 않음</p>\';</script>',
            '<!-- <p data-i18n="a">주석도 그대로</p> -->',
        ]);
    });

    it('사전에 없는 키를 쓰면 빌드가 멈춘다 (키 이름이 화면에 나가지 않게)', () => {
        expect(() => translateI18nAttributes('<p data-i18n="no.such.key">글</p>', {})).toThrow(/no\.such\.key/);
    });
});
