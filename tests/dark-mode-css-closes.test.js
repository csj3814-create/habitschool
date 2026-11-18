// 다크 모드 스타일 파일이 끝까지 제대로 닫혀 있는지 (2026-11-18 대표 캡처: 넓은 화면 다크 모드에서 카드가 흰색)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const postcss = require('postcss');
const read = (p) => readFileSync(resolve(p), 'utf8');

describe('stylesheets close every block', () => {
    for (const file of ['styles-base.css', 'styles-features.css', 'styles-reward-market.css', 'styles-dashboard.css', 'styles-dark-mode.css', 'styles-reports.css', 'styles-en.css', 'styles-guest-demo.css']) {
        it(`${file} parses without an unclosed block`, () => {
            expect(() => postcss.parse(read(file), { from: file })).not.toThrow();
        });
    }

    it('keeps the dark-mode cards outside the narrow-screen @media', () => {
        const root = postcss.parse(read('styles-dark-mode.css'));
        let consentInsideMedia = false;
        root.walkRules((rule) => {
            if (rule.selector.includes('body.dark-mode .consent-box') && rule.parent?.type === 'atrule') consentInsideMedia = true;
        });
        expect(consentInsideMedia).toBe(false);
    });

    it('paints the clinic header white-on-clinic-colour in dark mode too', () => {
        const css = read('styles-dark-mode.css');
        expect(css).toContain('html.clinic-branded body.dark-mode .date-label,');
        expect(css).toContain('html.clinic-branded body.dark-mode .header { background-color: var(--clinic-brand);');
    });
});
