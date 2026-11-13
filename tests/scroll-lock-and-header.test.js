import { describe, expect, it } from 'vitest';
import { readRepoFile } from './source-helpers.js';
import { isCoveringLayer, LAYER_SELECTOR } from '../js/scroll-lock.js';

// 2026-11-13 제보:
//  - "레이어 창이 떴을 때엔 스크롤 안 되게 하는 게 맞겠어. 다른 레이어로 띄우는 화면에서도 다 마찬가지야."
//  - "PDF 열기 … 버튼 모양이 안 맞고"
//  - "프로필 탭 버튼화 하면서 날짜가 가려지게 되었어. 다크모드 버튼을 설정으로 옮기는 방법은 어떨까?"

const INDEX = readRepoFile('index.html');
const APP = readRepoFile('js/app-core.js');
const BASE_CSS = readRepoFile('styles-base.css');
const FEATURE_CSS = readRepoFile('styles-features.css');
const MAIN = readRepoFile('js/main.js');
const SW = readRepoFile('sw.js');
const LOCK = readRepoFile('js/scroll-lock.js');

const layer = (overrides = {}) => ({
    display: 'flex', visibility: 'visible', opacity: '1', pointerEvents: 'auto', position: 'fixed',
    width: 375, height: 812, viewportWidth: 375, viewportHeight: 812, ...overrides
});

describe('the page behind a layer does not scroll', () => {
    it('counts a visible, full-screen, fixed layer', () => {
        expect(isCoveringLayer(layer())).toBe(true);
    });

    it('ignores what is hidden, see-through, untouchable or small', () => {
        expect(isCoveringLayer(layer({ display: 'none' }))).toBe(false);
        expect(isCoveringLayer(layer({ visibility: 'hidden' }))).toBe(false);
        expect(isCoveringLayer(layer({ opacity: '0' }))).toBe(false);
        expect(isCoveringLayer(layer({ pointerEvents: 'none' }))).toBe(false);
        expect(isCoveringLayer(layer({ position: 'absolute' }))).toBe(false);
        // 오른쪽 아래 제보 단추나 말풍선 같은 작은 것.
        expect(isCoveringLayer(layer({ width: 60, height: 60 }))).toBe(false);
        // 아래에서 올라오는 반쪽 시트는 뒤 화면을 만질 수 있다.
        expect(isCoveringLayer(layer({ height: 400 }))).toBe(false);
    });

    it('watches every kind of layer the app opens, not a hand-kept list of ids', () => {
        for (const selector of ['.modal-overlay', '.wallet-modal-overlay', '.record-viewer', '#lightbox-modal', '[role="dialog"]']) {
            expect(LAYER_SELECTOR).toContain(selector);
        }
        expect(LOCK).toContain("attributeFilter: ['style', 'class', 'hidden', 'open']");
        expect(LOCK).toContain("document.documentElement.classList.toggle('layer-open', anyLayerOpen());");
    });

    it('locks both html and body while a layer is open', () => {
        expect(BASE_CSS).toMatch(/html\.layer-open,\s*html\.layer-open body \{\s*overflow: hidden !important;/);
    });

    it('is loaded at start and kept for offline use', () => {
        expect(MAIN).toMatch(/import '\.\/scroll-lock\.js\?v=\d+';/);
        expect(SW).toMatch(/'\.\/js\/scroll-lock\.js\?v=\d+',/);
    });
});

describe('the open-file button fits inside the viewer', () => {
    it('counts its padding inside its width', () => {
        const rule = FEATURE_CSS.match(/\.record-viewer-file \{[^}]*\}/)?.[0] || '';
        expect(rule).toContain('box-sizing: border-box;');
        expect(rule).toContain('width: 100%;');
    });
});

describe('the header leaves room for the whole date', () => {
    const header = INDEX.split('<div class="header-top">')[1].split('<nav class="tab-menu"')[0];

    it('no longer carries the dark mode button', () => {
        expect(header).not.toContain('dark-mode-toggle');
        expect(header).toContain('id="selected-date"');
    });

    it('keeps dark mode in settings, with a label that says what a tap does', () => {
        const settings = INDEX.split('id="profile-group-settings"')[1].split('<div id="assets" class="content-section"')[0];
        expect(settings).toContain('id="dark-mode-toggle"');
        expect(settings).toContain('onclick="toggleDarkMode()"');
        expect(INDEX.match(/id="dark-mode-toggle"/g)).toHaveLength(1);
        expect(APP).toContain('if (btn) btn.textContent = darkModeButtonLabel(isDark);');
        expect(APP).toContain('if (btn) btn.textContent = darkModeButtonLabel(true);');
        expect(APP).toContain("'☀️ 밝은 화면으로'");
    });
});
