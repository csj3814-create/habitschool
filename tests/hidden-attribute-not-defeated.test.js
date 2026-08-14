import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function readCss(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

function allCss() {
    return fs.readdirSync(root)
        .filter(f => f.endsWith('.css'))
        .map(f => ({ file: f, source: readCss(f) }));
}

describe('hidden 속성이 display 선언에 무력화되지 않는다', () => {
    // [hidden]{display:none} 은 브라우저 기본 스타일이라, 클래스에 걸린
    // display 선언이 언제나 이긴다. 그러면 el.hidden = true 가 조용히
    // 아무 일도 하지 않는다 — 근력 영상 썸네일이 검은 상자로 보이던 원인.
    it('전역 [hidden] 규칙이 살아 있다', () => {
        const base = readCss('styles-base.css');
        expect(base).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
    });

    it('[hidden] 을 겨냥해 요소를 보이게 만드는 규칙이 없다', () => {
        // 전역 규칙을 !important 로 걸어 둔 이상, 이런 규칙은 조용히 무시된다.
        // 누가 나중에 추가하면 동작하지 않으니 미리 막는다.
        const offenders = [];
        for (const { file, source } of allCss()) {
            const ruleRe = /([^{}]*\[hidden\][^{}]*)\{([^{}]*)\}/g;
            let match;
            while ((match = ruleRe.exec(source))) {
                const selector = match[1].trim();
                const display = /(?:^|[;\s])display\s*:\s*([^;!]+)/.exec(match[2]);
                if (!display) continue;
                if (display[1].trim() === 'none') continue;
                offenders.push(`${file}: ${selector} { display: ${display[1].trim()} }`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it('근력 미리보기 영상이 썸네일을 덮지 않도록 감춰진다', () => {
        // 이 두 요소는 position:absolute; inset:0 으로 겹쳐 있고 영상이 DOM 뒤라
        // 위에 그려진다. 영상이 확실히 사라져야 썸네일이 보인다.
        const features = readCss('styles-features.css');
        expect(features).toMatch(/\.preview-strength-video\s*\{[^}]*position:\s*absolute/);
        expect(features).toMatch(/\.preview-strength-img\s*\{[^}]*position:\s*absolute/);
    });
});

describe('근력 썸네일 로드 실패가 화면에 드러난다', () => {
    it('미리보기 이미지에 onerror 대체가 걸려 있다', () => {
        const source = fs.readFileSync(path.join(root, 'js', 'app-core.js'), 'utf8');
        const fnStart = source.indexOf('function showStrengthPreviewImage');
        expect(fnStart).toBeGreaterThan(-1);
        const body = source.slice(fnStart, fnStart + 1600);
        expect(body).toContain('previewImg.onerror');
        expect(body).toContain('getVideoPlaceholderDataUrl()');
    });
});
