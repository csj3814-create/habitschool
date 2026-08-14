import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';

const AUTH = readRepoFile('js/auth.js');
const INDEX = readRepoFile('index.html');
const CSS = readRepoFile('styles-features.css');
const I18N = readRepoFile('js/i18n.js');

// 재동의 창이 폰에서 스크롤됐다. 동의를 받는 화면에서 스크롤이 생기면 아래쪽 항목과
// 버튼을 못 보고 지나칠 수 있어, 읽고 눌렀다고 보기 어려워진다.
describe('the re-consent notice fits without scrolling', () => {
    const bullets = INDEX
        .split('<ul class="reconsent-changes">')[1]
        .split('</ul>')[0]
        .split('</li>')
        .filter((chunk) => chunk.includes('<li'));

    it('still lists all four changes', () => {
        expect(bullets).toHaveLength(4);
    });

    it('keeps each one to a single short line', () => {
        // 태그를 걷어낸 실제 글자 수로 잰다. 길어지면 다시 스크롤이 생긴다.
        for (const bullet of bullets) {
            const text = bullet.replace(/<[^>]+>/g, '').trim();
            expect(text.length, `too long: ${text}`).toBeLessThanOrEqual(45);
        }
    });

    it('does the same in English', () => {
        const enBullets = [1, 2, 3, 4].map((i) => {
            const line = I18N.split(`'reconsent.change${i}': '`)[1].split("',")[0];
            return line.replace(/<[^>]+>/g, '').trim();
        });
        for (const text of enBullets) {
            expect(text.length, `too long: ${text}`).toBeLessThanOrEqual(90);
        }
    });

    it('can still scroll inside itself if a future line pushes it over', () => {
        // 안전망은 남긴다 — 넘칠 때 버튼에 닿지 못하는 것이 최악이다.
        const rule = CSS.split('.reconsent-content {')[1].split('}')[0];
        expect(rule).toContain('max-height: calc(100vh - 48px);');
        expect(rule).toContain('overflow-y: auto;');
    });
});

// 건강정보를 쓰지 않기로 한 사람에게 그 안내가 프로필의 큰 자리를 계속 차지했다.
describe('the health-data gate is folded away until it is wanted', () => {
    it('is a details element, so it starts closed', () => {
        expect(AUTH).toContain("const gate = document.createElement('details');");
        // open 을 붙이지 않으므로 접힌 채로 시작한다.
        const fn = AUTH.split('function buildSensitiveGateElement(label) {')[1].split('\n}')[0];
        expect(fn).not.toContain('open');
        expect(fn).toContain('<summary class="sensitive-gate-summary">');
    });

    it('says which feature it is about, right in the collapsed line', () => {
        // 접힌 줄만 보고도 무엇에 대한 안내인지 알아야 펼칠지 정할 수 있다.
        const fn = AUTH.split('function buildSensitiveGateElement(label) {')[1].split('\n}')[0];
        expect(fn).toContain('${escapeHtml(label)} 기능은 건강정보 동의가 필요해요');
    });

    it('keeps the explanation and the button behind the fold', () => {
        const fn = AUTH.split('function buildSensitiveGateElement(label) {')[1].split('\n}')[0];
        const bodyStart = fn.indexOf('<div class="sensitive-gate-body">');
        expect(bodyStart).toBeGreaterThan(-1);
        expect(fn.indexOf('sensitive-gate-desc')).toBeGreaterThan(bodyStart);
        expect(fn.indexOf('grantSensitiveConsent()')).toBeGreaterThan(bodyStart);
    });

    it('draws its own marker rather than trusting the default triangle', () => {
        expect(CSS).toContain('.sensitive-gate-summary::-webkit-details-marker { display: none; }');
        expect(CSS).toContain('.sensitive-gate[open] .sensitive-gate-summary::after {');
        expect(CSS).toContain('transform: rotate(180deg);');
    });

    it('puts the arrow at the right edge, so the line reads as expandable', () => {
        // 가운데 정렬이면 눌러서 펼치는 줄이 아니라 그냥 안내문으로 읽힌다.
        const rule = CSS.split('.sensitive-gate-summary {')[1].split('}')[0];
        expect(rule).toContain('justify-content: space-between;');
        expect(rule).toContain('text-align: left;');
    });

    it('leaves a gap before the next card', () => {
        const rule = CSS.split('.sensitive-gate {')[1].split('}')[0];
        expect(rule).toContain('margin-bottom: 18px;');
    });

    it('has no stray characters in its colours', () => {
        // 한 번 #b99a<데바나가리 6>d 를 넣은 적이 있다. 브라우저는 조용히 무시하고
        // 색만 사라지므로 눈으로는 놓치기 쉽다. 선택자(#id)가 아니라 선언 값에 쓰인
        // # 토큰만 본다.
        const declarations = CSS.match(/:[^;{}]*;/g) || [];
        const bad = [];
        for (const decl of declarations) {
            for (const token of decl.match(/#[^\s;,)]+/g) || []) {
                if (!/^#[0-9a-fA-F]{3,8}$/.test(token)) bad.push(token);
            }
        }
        expect(declarations.length).toBeGreaterThan(0);
        expect(bad).toEqual([]);
    });
});
